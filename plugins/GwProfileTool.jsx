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
import { LayerRole, addMarker, removeMarker, removeLayer, addLayerFeatures } from 'qwc2/actions/layers';
import { changeSelectionState } from 'qwc2/actions/selection';
import TaskBar from 'qwc2/components/TaskBar';
import IdentifyUtils from 'qwc2/utils/IdentifyUtils';
import LocaleUtils from 'qwc2/utils/LocaleUtils';
import VectorLayerUtils from 'qwc2/utils/VectorLayerUtils';
import ConfigUtils from 'qwc2/utils/ConfigUtils';
import { panTo } from 'qwc2/actions/map';

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
        markers: PropTypes.array,
        map: PropTypes.object,
        removeLayer: PropTypes.func,
        removeMarker: PropTypes.func,
        selection: PropTypes.object
    }
    static defaultProps = {
        replaceImageUrls: true,
        initialWidth: 240,
        initialHeight: 320,
        initialX: 0,
        initialY: 0
    }
    state = {
        mode: 'trace',
        identifyResult: null,
        prevIdentifyResult: null,
        pendingRequests: false
    }
    constructor(props) {
        super(props);
    }
    componentDidUpdate(prevProps, prevState) {
        if (this.props.currentIdentifyTool !== prevProps.currentIdentifyTool && prevProps.currentIdentifyTool === "GwInfo") {
            this.clearResults();
        }
        if (this.props.currentTask === "GwProfileTool" || this.props.currentIdentifyTool === "GwProfileTool") {
            this.identifyPoint(prevProps);
        }
    }
    crsStrToInt = (crs) => {
        const parts = crs.split(':')
        return parseInt(parts.slice(-1))
    }
    dispatchButton = (action) => {
        switch (action.name) {
            case "featureLink":
                this.props.removeLayer("searchselection");
                let pendingRequests = false;
                const queryableLayers = IdentifyUtils.getQueryLayers(this.props.layers, this.props.map).filter(l => {
                    // TODO: If there are some wms external layers this would select more than one layer
                    return l.type === "wms"
                });

                const request_url = ConfigUtils.getConfigProp("gwInfoServiceUrl")
                if (!isEmpty(queryableLayers) && !isEmpty(request_url)) {
                    if (queryableLayers.length > 1) {
                        console.warn("There are multiple giswater queryable layers")
                    }

                    const layer = queryableLayers[0];

                    const params = {
                        "theme": layer.title,
                        "id": action.params.id,
                        "tableName": action.params.tableName
                    }
                    pendingRequests = true
                    axios.get(request_url + "fromid", { params: params }).then((response) => {
                        const result = response.data
                        this.setState({ identifyResult: result, pendingRequests: false });
                        this.highlightResult(result)
                        this.addMarkerToResult(result)
                        this.panToResult(result)
                    }).catch((e) => {
                        console.log(e);
                        this.setState({ pendingRequests: false });
                    });
                }
                this.setState({ identifyResult: {}, prevIdentifyResult: this.state.identifyResult, pendingRequests: pendingRequests });
                break;

            default:
                console.warn(`Action \`${action.name}\` cannot be handled.`)
                break;
        }
    }
    identifyPoint = (prevProps) => {
        const clickPoint = this.queryPoint(prevProps);
        if (clickPoint) {
            console.log("flowtrace clickPoint:", clickPoint);
            // TODO fix array add and have two pointer at the same time
            //this.props.markers.add
            console.log(this.props.markers);
            // Remove any search selection layer to avoid confusion
            //this.props.removeLayer("searchselection");
            let pendingRequests = 0;
            // Call fct upstream/downstream & get geojson response
            //this.makeRequest(clickPoint);

            this.props.addMarker('profile', clickPoint, '', this.props.map.projection);
        }
    }
    parseResult = (response, layer, format, clickPoint) => {
        const newResults = IdentifyUtils.parseResponse(response, layer, format, clickPoint, this.props.map.projection, this.props.featureInfoReturnsLayerName, this.props.layers);
        // Merge with previous
        const identifyResult = { ...this.state.identifyResult };
        Object.keys(newResults).map(layername => {
            const newFeatureIds = newResults[layername].map(feature => feature.id);
            identifyResult[layername] = [
                ...(identifyResult[layername] || []).filter(feature => !newFeatureIds.includes(feature.id)),
                ...newResults[layername]
            ];
        });
        this.setState({ identifyResult: identifyResult });
    }
    highlightResult = (result) => {
        if (isEmpty(result)) {
            this.props.removeLayer("identifyslection")
        } else {
            const layer = {
                id: "identifyslection",
                role: LayerRole.SELECTION
            };
            const crs = this.props.map.projection
            const geometry = VectorLayerUtils.wktToGeoJSON(result.feature.geometry, crs, crs)
            const feature = {
                id: result.feature.id,
                geometry: geometry.geometry
            }
            this.props.addLayerFeatures(layer, [feature], true)
        }
    }
    panToResult = (result) => {
        // TODO: Maybe we should zoom to the result as well
        if (!isEmpty(result)) {
            const center = this.getGeometryCenter(result.feature.geometry)
            this.props.panTo(center, this.props.map.projection)
        }
    }
    addMarkerToResult = (result) => {
        if (!isEmpty(result)) {
            const center = this.getGeometryCenter(result.feature.geometry)
            this.props.addMarker('profile', center, '', this.props.map.projection);
        }
    }
    getGeometryCenter = (geom) => {
        const geometry = new ol.format.WKT().readGeometry(geom);
        const type = geometry.getType();
        let center = null;
        switch (type) {
            case "Polygon":
                center = geometry.getInteriorPoint().getCoordinates();
                break;
            case "MultiPolygon":
                center = geometry.getInteriorPoints().getClosestPoint(ol.extent.getCenter(geometry.getExtent()));
                break;
            case "Point":
                center = geometry.getCoordinates();
                break;
            case "MultiPoint":
                center = geometry.getClosestPoint(ol.extent.getCenter(geometry.getExtent()));
                break;
            case "LineString":
                center = geometry.getCoordinateAt(0.5);
                break;
            case "MultiLineString":
                center = geometry.getClosestPoint(ol.extent.getCenter(geometry.getExtent()));
                break;
            case "Circle":
                center = geometry.getCenter();
                break;
            default:
                break;
        }
        return center;
    }
    queryPoint = (prevProps) => {
        if (this.props.click.button !== 0 || this.props.click === prevProps.click || (this.props.click.features || []).find(entry => entry.feature === 'startupposmarker')) {
            return null;
        }
        if (this.props.click.feature === 'searchmarker' && this.props.click.geometry && this.props.click.geomType === 'Point') {
            return null;
            // return this.props.click.geometry;
        }
        return this.props.click.coordinate;
    }
    getQueryableLayers = () => {
        if ((typeof this.props.layers === 'undefined' || this.props.layers === null) || (typeof this.props.map === 'undefined' || this.props.map === null)) {
            return [];
        }

        return IdentifyUtils.getQueryLayers(this.props.layers, this.props.map).filter(l => {
            return l.type === "wms"
        });
    }
    makeRequest(clickPoint) {
        let pendingRequests = false;

        const queryableLayers = this.getQueryableLayers();
        const request_url = ConfigUtils.getConfigProp("gwProfileToolServiceUrl")

        if (!isEmpty(queryableLayers) && !isEmpty(request_url)) {
            // Get request paramas
            const layer = queryableLayers[0];
            const epsg = this.crsStrToInt(this.props.map.projection)
            const zoom = this.props.map.scales[this.props.map.zoom]
            const params = {
                "theme": layer.title,
                "epsg": epsg,
                "coords": String(clickPoint),
                "zoom": zoom
            }
            // Send request
            pendingRequests = true;
            let mode = this.state.mode === "trace" ? "upstream" : "downstream";
            axios.get(request_url + mode, { params: params }).then(response => {
                const result = response.data
                console.log("flowtrace", mode, "result", result);
                this.addFlowtraceLayers(result);
                this.setState({ identifyResult: result, pendingRequests: false });
            }).catch((e) => {
                console.log(e);
                this.setState({ pendingRequests: false });
            });
        }
        // Set "Waiting for request..." message
        this.setState({ identifyResult: {}, pendingRequests: pendingRequests });
    }
    addFlowtraceLayers = (result) => {
        // Lines
        let line = result.body.data.line;
        let lines_style = {
            strokeColor: this.state.mode === "trace" ? [235, 167, 48, 1] : [235, 74, 117, 1],
            strokeWidth: 6,
            strokeDash: [1],
            fillColor: [255, 255, 255, 0.33],
            textFill: "blue",
            textStroke: "white",
            textFont: '20pt sans-serif'
        }
        this.addGeoJSONLayer("flowtrace_" + this.state.mode + "_lines.geojson", line, 'default', lines_style);

        // Points
        let point = result.body.data.point;
        let points_style = {
            strokeColor: this.state.mode === "trace" ? [235, 167, 48, 1] : [235, 74, 117, 1],
            strokeWidth: 2,
            strokeDash: [4],
            fillColor: [191, 156, 40, 0.33],
            textFill: "blue",
            textStroke: "white",
            textFont: '20pt sans-serif'
        }
        this.addGeoJSONLayer("flowtrace_" + this.state.mode + "_points.geojson", point, 'default', points_style);
    }
    addGeoJSONLayer = (filename, data, styleName = undefined, styleOptions = undefined) => {
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
            this.props.addLayerFeatures({
                id: filename,
                name: filename,
                title: filename.replace(/\.[^/.]+$/, "").replaceAll(/_+/g, " "),
                zoomToExtent: true
            }, features, true);
        } else {
            this.props.addLayerFeatures({
                id: filename,
                name: filename,
                title: filename.replace(/\.[^/.]+$/, "").replaceAll(/_+/g, " "),
                zoomToExtent: false
            }, [], true);
            // TODO: send message to map, but not alert(LocaleUtils.tr("importlayer.nofeatures"));
        }
    }
    searchFlowtraceLayer = () => {
        let flowtraceLayers = null;
        flowtraceLayers = this.props.layers.filter(l => /flowtrace_(points|lines|polygons)\.geojson/.test(l.name));
        return flowtraceLayers;
    }
    onShow = (mode) => {
        this.setState({ mode: mode || 'trace' });
    }
    onToolClose = () => {
        this.props.removeMarker('profile');
        this.props.removeLayer("identifyslection");
        this.props.changeSelectionState({ geomType: undefined });
        this.setState({ identifyResult: null, pendingRequests: false, mode: 'trace' });
    }
    clearResults = () => {
        this.props.removeMarker('profile');
        this.props.removeLayer("identifyslection");
        this.setState({ identifyResult: null, pendingRequests: false });
    }
    showPrevResult = () => {
        const result = this.state.prevIdentifyResult
        this.setState({ identifyResult: result, prevIdentifyResult: null })
        this.highlightResult(result)
        this.addMarkerToResult(result)
        this.panToResult(result)
    }
    render() {
        let resultWindow = null;
        return [resultWindow, (
            <TaskBar key="GwProfileToolTaskBar" onHide={this.onToolClose} onShow={this.onShow} task="GwProfileTool">
                {() => ({
                    body: LocaleUtils.tr("infotool.clickhelpPoint")
                })}
            </TaskBar>
        )];
    }
}

const selector = (state) => ({
    click: state.map.click || { modifiers: {} },
    currentTask: state.task.id,
    currentIdentifyTool: state.identify.tool,
    layers: state.layers.flat,
    map: state.map,
    selection: state.selection
});

export default connect(selector, {
    addLayerFeatures: addLayerFeatures,
    addMarker: addMarker,
    changeSelectionState: changeSelectionState,
    panTo: panTo,
    removeMarker: removeMarker,
    removeLayer: removeLayer,
    addLayerFeatures: addLayerFeatures
})(GwProfileTool);
