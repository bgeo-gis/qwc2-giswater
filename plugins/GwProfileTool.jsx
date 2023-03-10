/**
 * Copyright 2017-2021 Sourcepole AG
 * All rights reserved.
 *
 * This source code is licensed under the BSD-style license found in the
 * LICENSE file in the root directory of this source tree.
 */

import axios from 'axios';
import React from 'react';
import PropTypes from 'prop-types';
import { connect } from 'react-redux';
import ol from 'openlayers';
import isEmpty from 'lodash.isempty';
import { LayerRole, addMarker, removeMarker, removeLayer, addLayerFeatures, addLayer } from 'qwc2/actions/layers';
import { changeSelectionState } from 'qwc2/actions/selection';
import TaskBar from 'qwc2/components/TaskBar';
import IdentifyUtils from 'qwc2/utils/IdentifyUtils';
import LocaleUtils from 'qwc2/utils/LocaleUtils';
import VectorLayerUtils from 'qwc2/utils/VectorLayerUtils';
import { panTo } from 'qwc2/actions/map';

import {changeMeasurementState} from 'qwc2/actions/measurement';
import CoordinatesUtils from 'qwc2/utils/CoordinatesUtils';
import MeasureUtils from 'qwc2/utils/MeasureUtils';

import GwUtils from '../utils/GwUtils';


/**
 * Sets a style for text drawn on a layer
 * @returns Text style for OpenLayers
 */
const measureLabelStyleFactory = () => new ol.style.Text({
    font: '10pt sans-serif',
    text: "",
    fill: new ol.style.Fill({color: 'white'}),
    stroke: new ol.style.Stroke({color: [0, 0, 0, 0.75], width: 3}),
    rotation: 0,
    offsetY: 10
});


class GwProfileTool extends React.Component {
    static propTypes = {
        addMarker: PropTypes.func,
        changeSelectionState: PropTypes.func,
        click: PropTypes.object,
        currentIdentifyTool: PropTypes.string,
        currentTask: PropTypes.string,
        initialHeight: PropTypes.number,
        initialWidth: PropTypes.number,
        initialX: PropTypes.number,
        initialY: PropTypes.number,
        initiallyDocked: PropTypes.bool,
        layers: PropTypes.array,
        map: PropTypes.object,
        mapObj: PropTypes.object,
        removeLayer: PropTypes.func,
        removeMarker: PropTypes.func,
        selection: PropTypes.object,
        firstNodeId: PropTypes.object,
        secondNodeId: PropTypes.object,
        firstNodeCoordinates: PropTypes.object,
        secondNodeCoordinates: PropTypes.object,
        changeMeasurementState: PropTypes.func,
        measurement: PropTypes.object,
        options: PropTypes.object,
        projection: PropTypes.string
    }

    static defaultOpts = {
        geodesic: true
    }

    static defaultProps = {
        replaceImageUrls: true,
        initialWidth: 240,
        initialHeight: 320,
        initialX: 0,
        initialY: 0,
    }

    state = {
        mode: 'nodefromcoordinates',
        identifyResult: null,
        prevIdentifyResult: null,
        pendingRequests: false,
        firstNodeId: null,
        secondNodeId: null,
        firstNodeCoordinates: null,
        secondNodeCoordinates: null,
        prevPoint: null
    }
    
    constructor(props) {
        super(props);
        this.pickPositionCallbackTimeout = null;
    }

    /**
     * Each time the component is updated, it checks whether it should clean the layers, create marks or generate the profile.
     * @param {*} prevProps Previous state of Props
     * @param {*} prevState Previous state of States
     */
    componentDidUpdate(prevProps, prevState) {
        if (this.props.currentIdentifyTool !== prevProps.currentIdentifyTool && prevProps.currentIdentifyTool === "GwProfileTool") {
            // ProfileTool no longer used, clear layers and reset variables
            this.clearResults();
            this.reset();
        }
        if (this.props.currentTask === "GwProfileTool" || this.props.currentIdentifyTool === "GwProfileTool") {
            this.identifyPoint(prevProps);
            if (this.state.firstNodeId !== null && this.state.secondNodeId !== null && (prevState.secondNodeId === null || isNaN(prevState.secondNodeId)) && !isNaN(this.state.secondNodeId)){
                // When both nodes selected request node information and draw the graph
                this.makeRequestData();
            }
        }
    }

    /**
     * Passes all information needed to draw the graph to GwHeightProfile using measurement
     * @param {*} feature Result of makeRequestData()
     * @param {*} profiling Has to draw profile graphic
     */
    updateMeasurementResults = (feature, profiling = false) => {
        let coo = [];
        let length = [];
        let allNodeCoordinates = [];
        let allNodeLength = [];
        this.segmentMarkers = [];

        const queryableLayers = this.getQueryableLayers();
        const layer = queryableLayers[0];

        if (profiling){
            let data = feature['body']['data'];

            // Get all coordinates of each node
            for (let i = 0; i < data.node.length; i++) {
                for (let j = 0; j < data.point.features.length; j++) {
                    if (data.node[i].node_id === data.point.features[j].properties.node_id) {
                        coo.push(data.point.features[j].geometry.coordinates);
                        break;
                    }
                }
            }

            // Get the order that follow the coordinates in each arc, this allows to do curves with markers on the map
            for (let i = 0; i < data.arc.length; i++) {
                length.push(data.arc[i].length);
                for (let j = 0; j < data.line.features.length; j++){
                    if (data.arc[i].arc_id === data.line.features[j].properties.arc_id){
                        const geom_arc = data.line.features[j].geometry.coordinates;
                        if (coo[i][0] !== geom_arc[0][0] || coo[i][1] !== geom_arc[0][1]){
                            let reversed_Array = [];
                            for (let z = geom_arc.length - 1; z >= 0; z--){
                                reversed_Array.push(geom_arc[z]);
                            }
                            data.line.features[j].geometry.coordinates = reversed_Array;   
                        }
                        if (i === data.line.features.length - 1){
                            for (let y = 0; y < data.line.features[j].geometry.coordinates.length; y++){
                                allNodeCoordinates.push(data.line.features[j].geometry.coordinates[y]);
                            }
                        } else {
                            for (let y = 0; y < data.line.features[j].geometry.coordinates.length - 1; y++){
                                allNodeCoordinates.push(data.line.features[j].geometry.coordinates[y]);
                            }
                        }
                    }
                }
            }

            // Get the length of arc curves
            allNodeLength = this.calculateDistances(allNodeCoordinates);
            // Generates all points and assigns the style used for the length
            for (let i = 0; i < coo.length - 1; ++i){
                const point = new ol.Feature({
                    geometry: new ol.geom.Point(coo[i])
                });
                point.setStyle(new ol.style.Style({text: measureLabelStyleFactory()}));
                this.measureLayer.getSource().addFeature(point);
                this.segmentMarkers.push(point);
            }

            // Adds the length of each arc on the map
            for (let i = 0; i < this.segmentMarkers.length; ++i) {
                this.updateSegmentMarker(this.segmentMarkers[i], coo[i], coo[i + 1], length[i]);
            }
            this.props.measurement.geomType = 'LineString'

            // Sends all variables to be used by GwHeightProfile
            this.props.changeMeasurementState({
                geomType: this.props.measurement.geomType,
                profiling: profiling,
                coordinates: coo,
                length: length,
                allNodeCoordinates: allNodeCoordinates,
                allNodeLength: allNodeLength,
                feature: feature,
                // PROBANDO
                theme: layer.title,
                initNode: feature['body']['data']['node'][0]['node_id'],
                endNode: feature['body']['data']['node'][feature['body']['data']['node'].length - 1]['node_id'],
                epsg: this.crsStrToInt(this.props.mapObj.projection)
            });
        } else {
            this.props.measurement.geomType = ''
        }
        // Sends all variables to be used by GwHeightProfile
        if (feature === null){
            this.props.changeMeasurementState({
                geomType: this.props.measurement.geomType,
                profiling: profiling,
                coordinates: coo,
                length: length,
                allNodeCoordinates: allNodeCoordinates,
                allNodeLength: allNodeLength,
                feature: feature,
                // PROBANDO
                theme: layer.title,
                initNode: 0,
                endNode: 0,
                epsg: this.crsStrToInt(this.props.mapObj.projection)
            });
        } else {
            this.props.changeMeasurementState({
                geomType: this.props.measurement.geomType,
                profiling: profiling,
                coordinates: coo,
                length: length,
                allNodeCoordinates: allNodeCoordinates,
                allNodeLength: allNodeLength,
                feature: feature,
                // PROBANDO
                theme: layer.title,
                initNode: feature['body']['data']['node'][0]['node_id'],
                endNode: feature['body']['data']['node'][feature['body']['data']['node'].length - 1]['node_id'],
                epsg: this.crsStrToInt(this.props.mapObj.projection)
            });
        }
        
    }

    /**
     * Adds on the map the length of an arc
     * @param {*} marker Point where to set the length and styles
     * @param {*} p1 Coordinates for Node 1 of the arc
     * @param {*} p2 Coordinates for Node 2 of the arc
     * @param {*} length Distance between nodes
     */
    updateSegmentMarker = (marker, p1, p2, length) => {
        let angle = -Math.atan2(p2[1] - p1[1], p2[0] - p1[0]);
        if (Math.abs(angle) > 0.5 * Math.PI) {
            angle += Math.PI;
        }
        const text = MeasureUtils.formatMeasurement(length, false, this.props.measurement.lenUnit);
        marker.getStyle().getText().setText(text);
        marker.getStyle().getText().setRotation(angle);
        marker.setGeometry(new ol.geom.Point([0.5 * (p1[0] + p2[0]), 0.5 * (p1[1] + p2[1])]));
    }

    /**
     * Reprojects given coordinates
     * @param {*} coordinates Coordinates of multiple nodes
     * @returns Reprojected coordinates of the nodes
     */
    reprojectedCoordinates = (coordinates) => {
        return coordinates.map((coordinate) => {
            return CoordinatesUtils.reproject(coordinate, this.props.projection, 'EPSG:4326');
        });
    }

    /**
     * Generates an array of the length between two coordinates
     * @param {*} coordinates Array of coordinates
     * @returns Array of length
     */
    calculateDistances = (coordinates) => {
        const lengths = [];
        if (this.getOptions().geodesic) {
            const reprojectedCoordinates = this.reprojectedCoordinates(coordinates);
            for (let i = 0; i < reprojectedCoordinates.length - 1; ++i) {
                lengths.push(ol.sphere.getDistance(reprojectedCoordinates[i], reprojectedCoordinates[i + 1]));
            }
        } else {
            for (let i = 0; i < coordinates.length - 1; ++i) {
                const dx = coordinates[i + 1][0] - coordinates[i][0];
                const dy = coordinates[i + 1][1] - coordinates[i][1];
                lengths.push(Math.sqrt(dx * dx + dy * dy));
            }
        }
        return lengths;
    }

    /**
     * @returns Options for the Profile Tool
     */
    getOptions = () => {
        return {...GwProfileTool.defaultOpts, ...this.props.options};
    }

    /**
     * Removes added layers with features
     */
    reset = () => {
        this.props.removeLayer("flowtrace_trace_points.geojson");
        this.props.removeLayer("flowtrace_trace_lines.geojson");
        this.props.map.removeLayer(this.measureLayer);
        this.props.map.removeLayer(this.pointLayer);
        this.segmentMarkers = [];
        this.sketchFeature = null;
    }
    
    /**
     * Converts a map projection to int to be used as EPSG
     * @param {*} crs Map projection
     * @returns EPSG int
     */
    crsStrToInt = (crs) => {
        const parts = crs.split(':')
        return parseInt(parts.slice(-1))
    }

    /**
     * Add markers to layer and make API requests to get each node id
     * @param {*} prevProps Previous state of Props
     */
    identifyPoint = (prevProps) => {
        const clickPoint = this.queryPoint(prevProps);
        if (clickPoint) {
            if (this.state.firstNodeCoordinates === null || isNaN(this.state.firstNodeId)){
                // Get the coordinates of the first node selected
                this.setState({ firstNodeCoordinates: clickPoint });
                this.props.addMarker('profile1', clickPoint, '', this.props.mapObj.projection);
                // Make a request to get the node id
                this.makeRequestNodeId(clickPoint, 1);
            } else if (this.state.secondNodeCoordinates === null || isNaN(this.state.secondNodeId)){
                // Get the coordinates of the second node selected
                this.setState({ secondNodeCoordinates: clickPoint });
                this.props.addMarker('profile2', clickPoint, '', this.props.mapObj.projection);
                // Make a request to get the node id
                this.makeRequestNodeId(clickPoint, 2);
            } else {
                // If both nodes selected clear markers and layers
                this.clearResults();
            }
        }
    }

    /**
     * Gets coordinates where user clicked on map
     * @param {*} prevProps Previous state of Props
     * @returns Coordinates where click was made
     */
    queryPoint = (prevProps) => {
        if (this.props.click.button !== 0 || this.props.click === prevProps.click || (this.props.click.features || []).find(entry => entry.feature === 'startupposmarker')) {
            return null;
        }
        if (this.props.click.feature === 'searchmarker' && this.props.click.geometry && this.props.click.geomType === 'Point') {
            return null;
        }
        return this.props.click.coordinate;
    }

    /**
     * Gets layer o map object
     * @returns List of layers
     */
    getQueryableLayers = () => {
        if ((typeof this.props.layers === 'undefined' || this.props.layers === null) || (typeof this.props.mapObj === 'undefined' || this.props.mapObj === null)) {
            return [];
        }

        return IdentifyUtils.getQueryLayers(this.props.layers, this.props.mapObj).filter(l => {
            return l.type === "wms"
        });
    }


    /**
     * Save node ids in state
     * @param {*} clickPoint Point selected
     * @param {*} node Node order (1 or 2)
     */
    makeRequestNodeId = (clickPoint, node) => {
        let pendingRequests = false;
        const queryableLayers = this.getQueryableLayers();
        const requestUrl = GwUtils.getServiceUrl("profile");
        let result;
        if (!isEmpty(queryableLayers) && !isEmpty(requestUrl)) {
            // Get request paramas
            const layer = queryableLayers[0];
            const epsg = this.crsStrToInt(this.props.mapObj.projection)
            let zoom = this.props.mapObj.scales[this.props.mapObj.zoom]
            // Fix for undefined zoom values
            if (typeof zoom === "undefined"){
                zoom = 1000;
            }
            const params = {
                "theme": layer.title,
                "epsg": epsg,
                "coords": String(clickPoint),
                "zoom": zoom,
                "layers": layer.queryLayers.join(',')
            }
            // Send request
            pendingRequests = true;
            axios.get(requestUrl + "nodefromcoordinates", { params: params }).then(response => {
                result = parseInt(response.data.body.feature.id[0]);
                console.log("Node Id -> ", result)

                if (node === 1){
                    this.setState({ firstNodeId: result });
                    this.highlightResult(response.data);
                } else if (node === 2){
                    this.setState({ secondNodeId: result});
                    this.highlightResult(response.data);
                }
                this.setState({ identifyResult: result, pendingRequests: false });
            }).catch((e) => {
                console.log(e);
                this.setState({ identifyResult: null, pendingRequests: false });
            });
        }
        // Set "Waiting for request..." message
        this.setState({ identifyResult: {}, pendingRequests: pendingRequests });
    }

    highlightResult = (result) => {
        // console.log('result :>> ', result);
        if (isEmpty(result) || isEmpty(result.body.feature.geometry)) {
            //this.props.removeLayer("profilehighlight")
        } else {
            const layer = {
                id: "profilehighlight",
                role: LayerRole.SELECTION
            };
            const crs = this.props.mapObj.projection
            const geometry = VectorLayerUtils.wktToGeoJSON(result.body.feature.geometry.st_astext, crs, crs)
            const feature = {
                id: result.body.feature.id,
                geometry: geometry.geometry
            }
            if (this.state.prevPoint !== null){
                this.props.addLayerFeatures(layer, [this.state.prevPoint, feature], false);
            } else {
                this.setState({ prevPoint: feature });
                this.props.addLayerFeatures(layer, [feature], false);
            }
        }
    }

    /**
     * Request for profile tool given 2 nodes
     */
    makeRequestData = () => {
        this.reset();
        let pendingRequests = false;
        const queryableLayers = this.getQueryableLayers();
        const requestUrl = GwUtils.getServiceUrl("profile");
        let result;
        if (!isEmpty(queryableLayers) && !isEmpty(requestUrl)) {
            // Get request paramas
            const layer = queryableLayers[0];
            const epsg = this.crsStrToInt(this.props.mapObj.projection)
            const params = {
                "theme": layer.title,
                "epsg": epsg,
                "initNode": this.state.firstNodeId,
                "endNode": this.state.secondNodeId
            }
            // Send request
            pendingRequests = true;
            axios.get(requestUrl + "profileinfo", { params: params }).then(response => {
                result = response.data;
                this.addProfileLayers(result);
                this.updateMeasurementResults(result, true);
                //this.props.removeLayer("profilehighlight")
                console.log("result -> ", result);
                //let arcs = result['body']['data']['arc']
                this.setState({ identifyResult: result, pendingRequests: false });
            }).catch((e) => {
                console.log(e);
                this.setState({ pendingRequests: false });
            });
        }
        // Set "Waiting for request..." message
        this.setState({ identifyResult: {}, pendingRequests: pendingRequests });
    }

    /**
     * Adds all necessary layers to display the features on the map
     * @param {*} result JSON that contains the features (GeoJSON)
     */
    addProfileLayers = (result) => {
        // Layer where arc length is stored
        this.measureLayer = new ol.layer.Vector({
            source: new ol.source.Vector(),
            zIndex: 1000000
        });
        this.props.map.addLayer(this.measureLayer);

        // Lines layer
        let line = result.body.data.line;
        let linesStyle = {
            strokeColor: this.state.mode === "trace" ? [235, 167, 48, 1] : [235, 74, 117, 1],
            strokeWidth: 6,
            strokeDash: [1],
            fillColor: [255, 255, 255, 0.33],
            textFill: "blue",
            textStroke: "white",
            textFont: '20pt sans-serif'
        }
        this.addGeoJSONLayer("flowtrace_" + this.state.mode + "_lines.geojson", line, 'default', linesStyle);

        // Points layer
        let point = result.body.data.point;
        let pointsStyle = {
            strokeColor: this.state.mode === "trace" ? [235, 167, 48, 1] : [235, 74, 117, 1],
            strokeWidth: 2,
            strokeDash: [4],
            fillColor: [191, 156, 40, 0.33],
            textFill: "blue",
            textStroke: "white",
            textFont: '20pt sans-serif'
        }
        this.addGeoJSONLayer("flowtrace_" + this.state.mode + "_points.geojson", point, 'default', pointsStyle);
    }

    /**
     * Add layer features given a GeoJSON object
     * @param {*} filename Name of the geojson layer and file to store it
     * @param {*} data All GeoJSON features to add to the layer
     * @param {*} styleName Name of the style
     * @param {*} styleOptions Style to drwa the features on the map
     */
    addGeoJSONLayer =   (filename, data, styleName = undefined, styleOptions = undefined) => {  
        if (!isEmpty(data.features)) {
            let defaultCrs = "EPSG:25831";
            let defaultStyleName = 'default'
            let defaultStyleOptions = {
                strokeColor: [255, 0, 0, 1],
                strokeWidth: 4,
                strokeDash: [4],
                fillColor: [255, 255, 255, 0.33],
                textFill: "blue",
                textStroke: "white",
                textFont: '20pt sans-serif'
            }
            if (styleName) {
                defaultStyleName = styleName;
            }
            if (styleOptions) {
                defaultStyleOptions = styleOptions;
            }
            if (data.crs && data.crs.properties && data.crs.properties.name) {
                // Extract CRS from FeatureCollection crs
                defaultCrs = CoordinatesUtils.fromOgcUrnCrs(data.crs.properties.name);
            }
            // Create an array with all the features and the style of each feture
            const features = data.features.map(feature => {
                let crs = defaultCrs;
                if (feature.crs && feature.crs.properties && feature.crs.properties.name) {
                    crs = CoordinatesUtils.fromOgcUrnCrs(data.crs.properties.name);
                } else if (typeof feature.crs === "string") {
                    crs = feature.crs;
                }
                if (feature.geometry && feature.geometry.coordinates) {
                    feature.geometry.coordinates = feature.geometry.coordinates.map(VectorLayerUtils.convert3dto2d);
                }
                return {
                    ...feature,
                    crs: crs,
                    styleName: defaultStyleName,
                    styleOptions: defaultStyleOptions
                };
            });
            // Add layer to the map
            this.props.addLayerFeatures({
                id: filename,
                name: filename,
                title: filename.replace(/\.[^/.]+$/, "").replaceAll(/_+/g, " "),
                zoomToExtent: true
            }, features, true);
        } else {
            // Add layer to the map
            this.props.addLayerFeatures({
                id: filename,
                name: filename,
                title: filename.replace(/\.[^/.]+$/, "").replaceAll(/_+/g, " "),
                zoomToExtent: false
            }, [], true);
        }
    }

    /**
     * Change state of mode to trace
     * @param {*} mode Actual mode
     */
    onShow = (mode) => {
        this.setState({ mode: mode || 'trace' });
    }

    /**
     * When tool is no longer used, remove all layers
     */
    onToolClose = () => {
        this.props.removeMarker('profile1');
        this.props.removeMarker('profile2');
        console.log("Tool Close");
        this.props.removeLayer("profilehighlight");
        this.props.removeLayer("flowtrace_trace_points.geojson");
        this.props.removeLayer("flowtrace_trace_lines.geojson");
        this.updateMeasurementResults(null, false);
        this.props.map.removeLayer(this.measureLayer);
        this.props.map.removeLayer(this.pointLayer);
        this.props.changeSelectionState({ geomType: undefined });
        this.setState({ identifyResult: null, pendingRequests: false, mode: 'trace', prevPoint: null});
    }

    /**
     * Remove all create llayers
     */
    clearResults = () => {
        this.props.removeMarker('profile1');
        this.props.removeMarker('profile2');
        console.log("Clear Results");
        this.props.removeLayer('profilehighlight');
        this.props.removeLayer('flowtrace_trace_points.geojson');
        this.props.removeLayer('flowtrace_trace_lines.geojson');
        this.props.map.removeLayer(this.measureLayer);
        this.props.map.removeLayer(this.pointLayer);
        this.setState({ firstNodeId: null, secondNodeId: null, firstNodeCoordinates: null, secondNodeCoordinates: null, identifyResult: null, pendingRequests: false, prevPoint: null });
        this.updateMeasurementResults(null, false);
    }

    render() {
        let bodyText = null;
        if (!this.state.firstNodeId || !this.state.secondNodeId){
            bodyText = LocaleUtils.tr("infotool.clickhelpPoint");
        }
        if (isNaN(this.state.firstNodeId) || isNaN(this.state.secondNodeId)){
            // If user not clicked a node show warning
            bodyText = "No se ha encontrado un nodo en esta posición...";
        }

        if (bodyText){
            return (
                <TaskBar key="GwProfileToolTaskBar" onHide={this.onToolClose} onShow={this.onShow} task="GwProfileTool">
                    {() => ({
                        body: bodyText
                    })}
                </TaskBar>
            );
        }
    }
}


const selector = (state) => ({
    click: state.map.click || { modifiers: {} },
    currentTask: state.task.id,
    currentIdentifyTool: state.identify.tool,
    layers: state.layers.flat,
    mapObj: state.map,
    selection: state.selection,
    measurement: state.measurement
});

export default connect(selector, {
    addLayerFeatures: addLayerFeatures,
    addLayer: addLayer,
    addMarker: addMarker,
    changeSelectionState: changeSelectionState,
    panTo: panTo,
    removeMarker: removeMarker,
    removeLayer: removeLayer,
    changeMeasurementState: changeMeasurementState
})(GwProfileTool);
