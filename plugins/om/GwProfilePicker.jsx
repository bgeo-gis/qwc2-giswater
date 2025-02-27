/**
 * Copyright © 2025 by BGEO. All rights reserved.
 * The program is free software: you can redistribute it and/or modify it under the terms of the GNU
 * General Public License as published by the Free Software Foundation, either version 3 of the License,
 * or (at your option) any later version
 */
import axios from 'axios';
import React from 'react';
import PropTypes from 'prop-types';
import { connect } from 'react-redux';
import ol from 'openlayers';
import isEmpty from 'lodash.isempty';
import { LayerRole, addMarker, removeMarker, removeLayer, addLayerFeatures, addLayer } from 'qwc2/actions/layers';
import { processFinished, processStarted } from 'qwc2/actions/processNotifications';
import TaskBar from 'qwc2/components/TaskBar';
import IdentifyUtils from 'qwc2/utils/IdentifyUtils';
import LocaleUtils from 'qwc2/utils/LocaleUtils';
import VectorLayerUtils from 'qwc2/utils/VectorLayerUtils';
import { panTo } from 'qwc2/actions/map';
import ConfigUtils from 'qwc2/utils/ConfigUtils';


import {changeProfileState} from '../../actions/profile';
import CoordinatesUtils from 'qwc2/utils/CoordinatesUtils';
import MeasureUtils from 'qwc2/utils/MeasureUtils';

import GwUtils from '../../utils/GwUtils';

import FeatureStyles from 'qwc2/utils/FeatureStyles';

import { Feature } from 'ol';
import { LineString } from 'ol/geom';
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


class GwProfilePicker extends React.Component {
    static propTypes = {
        addLayerFeatures: PropTypes.func,
        addMarker: PropTypes.func,
        changeProfileState: PropTypes.func,
        click: PropTypes.object,
        currentIdentifyTool: PropTypes.string,
        currentTask: PropTypes.string,
        firstNodeCoordinates: PropTypes.object,
        firstNodeId: PropTypes.object,
        initPointStyle: PropTypes.object,
        initialHeight: PropTypes.number,
        initialWidth: PropTypes.number,
        initialX: PropTypes.number,
        initialY: PropTypes.number,
        initiallyDocked: PropTypes.bool,
        layers: PropTypes.array,
        map: PropTypes.object,
        mapObj: PropTypes.object,
        measurement: PropTypes.object,
        options: PropTypes.object,
        processFinished: PropTypes.func,
        processStarted: PropTypes.func,
        profile: PropTypes.object,
        projection: PropTypes.string,
        removeLayer: PropTypes.func,
        removeMarker: PropTypes.func,
        secondNodeCoordinates: PropTypes.object,
        secondNodeId: PropTypes.object,
        selection: PropTypes.object,
        standardLinesStyle: PropTypes.object,
        standardPointsStyle: PropTypes.object,
        theme: PropTypes.object
    };

    static defaultOpts = {
        geodesic: true
    };

    static defaultProps = {
        initialWidth: 240,
        initialHeight: 320,
        initialX: 0,
        initialY: 0,
        standardLinesStyle: {
            strokeColor: [235, 167, 48, 1],
            strokeWidth: 6,
            strokeDash: [1],
            fillColor: [255, 255, 255, 0.33],
            textFill: "blue",
            textStroke: "white",
            textFont: "20pt sans-serif"
        },
        standardPointsStyle: {
            strokeColor: [235, 167, 48, 1],
            strokeWidth: 2,
            strokeDash: [4],
            fillColor: [191, 156, 40, 0.33],
            textFill: "blue",
            textStroke: "white",
            textFont: "20pt sans-serif"
        },
        initPointStyle: {
            strokeColor: [0, 51, 255, 1],
            strokeWidth: 2,
            strokeDash: [4],
            fillColor: [0, 51, 255, 0.33],
            textFill: "blue",
            textStroke: "white",
            textFont: "20pt sans-serif"
        }
    };

    state = {
        mode: 'nodefromcoordinates',
        identifyResult: null,
        firstNodeId: null,
        secondNodeId: null,
        firstNodeCoordinates: null,
        secondNodeCoordinates: null,
        prevPoint: null,
        theme: null
    };

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
        if (this.props.currentIdentifyTool !== prevProps.currentIdentifyTool && prevProps.currentIdentifyTool === "GwProfilePicker") {
            // ProfileTool no longer used, clear layers and reset variables
            this.clearResults();
            this.reset();
        }
        if (this.props.currentTask === "GwProfilePicker" || this.props.currentIdentifyTool === "GwProfilePicker") {
            this.identifyPoint(prevProps);
            if (this.state.firstNodeId !== null && this.state.secondNodeId !== null && (prevState.secondNodeId === null || isNaN(prevState.secondNodeId)) && !isNaN(this.state.secondNodeId)) {
                // When both nodes selected request node information and draw the graph
                this.makeRequestData();
            }
        }
    }

    /**
     * Passes all information needed to draw the graph to GwProfileGraph using measurement
     * @param {*} feature Result of makeRequestData()
     * @param {*} profiling Has to draw profile graphic
     */
    updateMeasurementResults = (feature) => {
        const coo = [];
        const length = [];
        const allNodeCoordinates = [];
        let allNodeLength = [];
        this.segmentMarkers = [];

        const data = feature.body.data;

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
            for (let j = 0; j < data.line.features.length; j++) {
                if (data.arc[i].arc_id === data.line.features[j].properties.arc_id) {
                    const geomArc = data.line.features[j].geometry.coordinates;
                    if (coo[i][0] !== geomArc[0][0] || coo[i][1] !== geomArc[0][1]) {
                        const reversedArray = [];
                        for (let z = geomArc.length - 1; z >= 0; z--) {
                            reversedArray.push(geomArc[z]);
                        }
                        data.line.features[j].geometry.coordinates = reversedArray;
                    }
                    if (i === data.line.features.length - 1) {
                        for (let y = 0; y < data.line.features[j].geometry.coordinates.length; y++) {
                            allNodeCoordinates.push(data.line.features[j].geometry.coordinates[y]);
                        }
                    } else {
                        for (let y = 0; y < data.line.features[j].geometry.coordinates.length - 1; y++) {
                            allNodeCoordinates.push(data.line.features[j].geometry.coordinates[y]);
                        }
                    }
                }
            }
        }

        // Get the length of arc curves
        allNodeLength = this.calculateDistances(allNodeCoordinates);
        // Generates all points and assigns the style used for the length
        for (let i = 0; i < coo.length - 1; ++i) {
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

        this.props.changeProfileState({
            profiling: true,
            coordinates: coo,
            length: length,
            allNodeCoordinates: allNodeCoordinates,
            allNodeLength: allNodeLength,
            feature: feature,
            theme: this.props.theme.title,
            initNode: feature.body.data.node[0].node_id,
            endNode: feature.body.data.node[feature.body.data.node.length - 1].node_id,
            epsg: GwUtils.crsStrToInt(this.props.mapObj.projection)
        });
    };

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
    };

    /**
     * Reprojects given coordinates
     * @param {*} coordinates Coordinates of multiple nodes
     * @returns Reprojected coordinates of the nodes
     */
    reprojectedCoordinates = (coordinates) => {
        return coordinates.map((coordinate) => {
            return CoordinatesUtils.reproject(coordinate, this.props.projection, 'EPSG:4326');
        });
    };

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
    };

    /**
     * @returns Options for the Profile Tool
     */
    getOptions = () => {
        return {...GwProfilePicker.defaultOpts, ...this.props.options};
    };

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
    };

    /**
     * Add markers to layer and make API requests to get each node id
     * @param {*} prevProps Previous state of Props
     */
    identifyPoint = (prevProps) => {
        const clickPoint = this.queryPoint(prevProps);
        if (clickPoint) {
            if (this.state.firstNodeCoordinates === null || isNaN(this.state.firstNodeId)) {
                // Get the coordinates of the first node selected
                this.setState({ firstNodeCoordinates: clickPoint });
                this.props.addMarker('profile1', clickPoint, '', this.props.mapObj.projection);
                // Make a request to get the node id
                this.makeRequestNodeId(clickPoint, 1);
            } else if (this.state.secondNodeCoordinates === null || isNaN(this.state.secondNodeId)) {
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
    };

    enterTemporaryPickMode = (result) => {
        const lines = result.body.data.line;
        const pointFeatures = GwUtils.getGeoJSONFeatures("default", lines, this.props.standardLinesStyle);

        const olLineStrings = pointFeatures.map(featureGeoJSON => {
            const coordinates = featureGeoJSON.geometry.coordinates.map(coord => [coord[0], coord[1]]);
            const lineString = new LineString(coordinates);
            const feature = new Feature({
                geometry: lineString
            });
            return feature;
        });

        this.modifyInteraction = new ol.interaction.Modify({
            features: new ol.Collection(olLineStrings),
            condition: (event) => { return false; },
            insertVertexCondition: () => { return false; },
            deleteCondition: (event) => { return false; },
            style: (feature) => {
                if (this.props.profile.pickPositionCallback) {
                    clearTimeout(this.pickPositionCallbackTimeout);
                    this.props.profile.pickPositionCallback(feature.getGeometry().getCoordinates());
                }
                return FeatureStyles.sketchInteraction();
            }
        });
        this.props.map.on('pointermove', this.clearPickPosition);
        this.modifyInteraction.on('modifyend', () => {
            this.updateMeasurementResults(this.sketchFeature, false);
        });
        this.props.map.addInteraction(this.modifyInteraction);
    };
    leaveTemporaryPickMode = () => {
        if (this.modifyInteraction) {
            this.props.map.un('pointermove', this.clearPickPosition);
            this.props.map.removeInteraction(this.modifyInteraction);
            this.modifyInteraction = null;
        }
    };
    clearPickPosition = () => {
        if (this.props.profile.pickPositionCallback) {
            clearTimeout(this.pickPositionCallbackTimeout);
            this.pickPositionCallbackTimeout = setTimeout(() => {
                if (this.props.profile.pickPositionCallback) {
                    this.props.profile.pickPositionCallback(null);
                }
            }, 50);
        }
    };
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
    };

    /**
     * Gets layer o map object
     * @returns List of layers
     */
    getQueryableLayers = () => {
        if ((typeof this.props.layers === 'undefined' || this.props.layers === null) || (typeof this.props.mapObj === 'undefined' || this.props.mapObj === null)) {
            return [];
        }
        return IdentifyUtils.getQueryLayers(this.props.layers, this.props.mapObj);
    };


    /**
     * Save node ids in state
     * @param {*} clickPoint Point selected
     * @param {*} node Node order (1 or 2)
     */
    makeRequestNodeId = (clickPoint, node) => {
        const queryableLayers = this.getQueryableLayers();
        const requestUrl = GwUtils.getServiceUrl("profile");
        let result;
        if (!isEmpty(queryableLayers) && !isEmpty(requestUrl)) {
            // Get request paramas
            const layer = queryableLayers[0];
            const epsg = GwUtils.crsStrToInt(this.props.mapObj.projection);
            const defaultZoom = 1000;
            let zoom = this.props.mapObj.scales[this.props.mapObj.zoom];
            // Fix for undefined zoom values
            if (typeof zoom === "undefined") {
                zoom = defaultZoom;
            }
            const params = {
                theme: this.props.theme.title,
                epsg: epsg,
                coords: String(clickPoint),
                zoom: zoom,
                layers: layer.queryLayers.join(',')
            };
            // Send request
            axios.get(requestUrl + "nodefromcoordinates", { params: params }).then(response => {
                result = parseInt(response.data.body.feature.id[0], 10);
                console.log("Node Id -> ", result);

                if (node === 1) {
                    this.setState({ firstNodeId: result });
                    this.highlightResult(response.data);
                } else if (node === 2) {
                    this.setState({ secondNodeId: result});
                    this.highlightResult(response.data);
                }
                this.setState({ identifyResult: result });
            }).catch((e) => {
                console.log(e);
                this.setState({ identifyResult: null });
            });
        }
        // Set "Waiting for request..." message
        this.setState({ identifyResult: {} });
    };

    highlightResult = (result) => {
        if (isEmpty(result) || isEmpty(result.body.feature.geometry)) {
            // temporal
            this.props.removeLayer("profilehighlight");
        } else {
            const layer = {
                id: "profilehighlight",
                role: LayerRole.SELECTION
            };
            const crs = this.props.mapObj.projection;
            const geometry = VectorLayerUtils.wktToGeoJSON(result.body.feature.geometry.st_astext, crs, crs);
            const feature = {
                id: result.body.feature.id,
                geometry: geometry.geometry
            };
            if (this.state.prevPoint !== null) {
                this.props.addLayerFeatures(layer, [this.state.prevPoint, feature], false);
            } else {
                this.setState({ prevPoint: feature });
                this.props.addLayerFeatures(layer, [feature], false);
            }
        }
    };

    /**
     * Request for profile tool given 2 nodes
     */
    makeRequestData = () => {
        this.reset();
        const queryableLayers = this.getQueryableLayers();
        const requestUrl = GwUtils.getServiceUrl("profile");
        let result;
        if (!isEmpty(queryableLayers) && !isEmpty(requestUrl)) {
            // Get request paramas
            const epsg = GwUtils.crsStrToInt(this.props.mapObj.projection);
            const params = {
                theme: this.props.theme.title,
                epsg: epsg,
                initNode: this.state.firstNodeId,
                endNode: this.state.secondNodeId
            };
            // Send request
            this.props.processStarted("profile_calc_msg", "Calculating Profile...");
            // this.props.processStarted("profile_calc_msg", "Calculating Profile (1/2)...");
            axios.get(requestUrl + "profileinfo", { params: params }).then(response => {
                result = response.data;
                this.addProfileLayers(result);
                this.updateMeasurementResults(result);
                this.props.processFinished("profile_calc_msg", true, "Success!");
                // this.props.removeLayer("profilehighlight")
                // let arcs = result['body']['data']['arc']

                this.setState({ identifyResult: result });
                this.enterTemporaryPickMode(result);
            }).catch((e) => {
                console.error(e);
                this.props.processFinished("profile_calc_msg", false, `Error: ${e}`);
            });
        }
        // Set "Waiting for request..." message
        this.setState({ identifyResult: {} });
    };

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
        const line = result.body.data.line;
        const standardLinesStyle = this.props.standardLinesStyle;
        this.addGeoJSONLayer("flowtrace_" + this.state.mode + "_lines.geojson", line, 'default', standardLinesStyle);

        // Points layer
        const point = result.body.data.point;
        const standardPointsStyle = this.props.standardPointsStyle;
        this.addGeoJSONLayer("flowtrace_" + this.state.mode + "_points.geojson", point, 'default', standardPointsStyle);
    };

    /**
     * Add layer features given a GeoJSON object
     * @param {*} filename Name of the geojson layer and file to store it
     * @param {*} data All GeoJSON features to add to the layer
     * @param {*} styleName Name of the style
     * @param {*} styleOptions Style to drwa the features on the map
     */
    addGeoJSONLayer = (filename, data, styleName = undefined, styleOptions = undefined) => {
        if (!isEmpty(data.features)) {
            let defaultCrs = "EPSG:25831";
            let defaultStyleName = 'default';
            let defaultStyleOptions = {
                strokeColor: [255, 0, 0, 1],
                strokeWidth: 4,
                strokeDash: [4],
                fillColor: [255, 255, 255, 0.33],
                textFill: "blue",
                textStroke: "white",
                textFont: '20pt sans-serif'
            };
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
            const features = data.features.map((feature, index) => {
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
                    styleOptions: defaultStyleOptions,
                    key: index
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
    };

    /**
     * Change state of mode to trace
     * @param {*} mode Actual mode
     */
    onShow = (mode) => {
        this.setState({ mode: mode || 'trace' });
    };

    /**
     * Remove all create layers
     */
    clearResults = () => {
        this.leaveTemporaryPickMode();
        this.props.removeMarker('profile1');
        this.props.removeMarker('profile2');
        this.props.removeLayer('profilehighlight');
        this.props.removeLayer('flowtrace_trace_points.geojson');
        this.props.removeLayer('flowtrace_trace_lines.geojson');
        this.props.map.removeLayer(this.measureLayer);
        this.props.map.removeLayer(this.pointLayer);
        this.setState({ firstNodeId: null, secondNodeId: null, firstNodeCoordinates: null, secondNodeCoordinates: null, identifyResult: null, prevPoint: null });
        this.props.changeProfileState({ profiling: false });
    };

    render() {
        let bodyText = null;
        if (!this.state.firstNodeId || !this.state.secondNodeId) {
            bodyText = LocaleUtils.tr("infotool.clickhelpPoint");
        }
        if (isNaN(this.state.firstNodeId) || isNaN(this.state.secondNodeId)) {
            // TODO: Translations
            bodyText = "No se ha encontrado un nodo en esta posición...";
        }

        if (this.state.firstNodeId && this.state.secondNodeId) {
            // TODO: Translations
            bodyText = "Displaying the profile";
        }
        if (bodyText) {
            return (
                <TaskBar key="GwProfilePickerTaskBar" onHide={this.clearResults} onShow={this.onShow} task="GwProfilePicker">
                    {() => ({
                        body: bodyText
                    })}
                </TaskBar>
            );
        } else {
            return null;
        }
    }
}
export default connect((state) => {
    const enabled = state.task.id === "Identify" || (
        state.task.identifyEnabled &&
        ConfigUtils.getConfigProp("identifyTool", state.theme.current, "Identify") === "Identify"
    );
    return {
        click: state.map.click || { modifiers: {} },
        enabled: enabled,
        layers: state.layers.flat,
        mapObj: state.map,
        measurement: state.measurement,
        selection: state.selection,
        profile: state.profile,
        theme: state.theme.current
    };
}, {
    addLayerFeatures: addLayerFeatures,
    addLayer: addLayer,
    addMarker: addMarker,
    panTo: panTo,
    removeMarker: removeMarker,
    removeLayer: removeLayer,
    processFinished: processFinished,
    processStarted: processStarted,
    changeProfileState: changeProfileState
})(GwProfilePicker);

