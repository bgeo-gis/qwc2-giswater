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
import ResizeableWindow from 'qwc2/components/ResizeableWindow';
import TaskBar from 'qwc2/components/TaskBar';
import IdentifyUtils from 'qwc2/utils/IdentifyUtils';
import LocaleUtils from 'qwc2/utils/LocaleUtils';
import MapUtils from 'qwc2/utils/MapUtils';
import VectorLayerUtils from 'qwc2/utils/VectorLayerUtils';
import ConfigUtils from 'qwc2/utils/ConfigUtils';
import { panTo } from 'qwc2/actions/map';
import { processFinished, processStarted } from 'qwc2/actions/processNotifications';

import GwInfoQtDesignerForm from '../components/GwInfoQtDesignerForm';
import GwInfoDmaForm from '../components/GwInfoDmaForm';
import GwUtils from '../utils/GwUtils';

import Chartist from 'chartist';
import ChartistComponent from 'react-chartist';
import ChartistAxisTitle from 'chartist-plugin-axistitle';
import Icon from 'qwc2/components/Icon';
import Zoom from 'qwc2-giswater/libs/bower_components/chartist-plugin-zoom/dist/chartist-plugin-zoom';

import './style/GwInfoGraphs.css';

var resetZoom = null;

class GwVisit extends React.Component {
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
        theme: PropTypes.object,
        removeLayer: PropTypes.func,
        removeMarker: PropTypes.func,
        selection: PropTypes.object
    }
    static defaultProps = {
        replaceImageUrls: true,
        initialWidth: 480,
        initialHeight: 600,
        initialX: 0,
        initialY: 0,
        initiallyDocked: false
    }
    state = {
        visitResult: null,
        pendingRequests: false,
        widgetValues: {},
        mode: 'Visit',
        identifyResult: null,
        prevIdentifyResult: null,
        pendingRequests: false,
        theme: null,
        currentTab: {},
        feature_id: null,
        showGraph: false,
        graphJson: null,
        showVisit: false,
        visitJson: null,
        visitWidgetValues: {},
        listJson: null,
        filters: {}
    }
    componentDidUpdate(prevProps, prevState) {
        if (this.props.currentIdentifyTool !== prevProps.currentIdentifyTool && prevProps.currentIdentifyTool === "GwVisit") {
            this.clearResults();
        }
        if (this.props.currentTask === "GwVisit" || this.props.currentIdentifyTool === "GwVisit") {
            this.identifyPoint(prevProps);
        }
        // Check if list need to update (current tab or filters changed)
        if (!isEmpty(this.state.currentTab) && ((prevState.currentTab !== this.state.currentTab) || (prevState.filters !== this.state.filters))) {
            console.log('this.state.currentTab :>> ', this.state.currentTab);
            this.getList(this.state.currentTab.tab, this.state.currentTab.widget);
        }
    }
    crsStrToInt = (crs) => {
        const parts = crs.split(':')
        return parseInt(parts.slice(-1))
    }
    dispatchButton = (action, widget) => {
        var queryableLayers;
        let request_url;
        let pendingRequests = false;
        switch (action.functionName) {
            case 'upload_file':
                this.props.processStarted("upload_file", "File upload");
                const file = action.file;
                request_url = GwUtils.getServiceUrl('visit');
                let formData = new FormData();
                formData.append("file", file);
                formData.append("theme", this.props.theme.title);
                formData.append("visit_id", 1);
                axios.post(request_url + 'file', formData, {
                    headers: { 'Content-Type': 'multipart/form-data' }
                }).then((response) => {
                    const result = response.data;
                    // show message
                    this.props.processFinished("upload_file", result.status === "Accepted", result.message);
                    this.getList();
                }).catch((e) => {
                    console.warn(e);
                    this.props.processFinished("upload_file", false, "Internal server error!");
                });
                break;
            case 'set_visit':
            case 'set_previous_form_back':
                this.clearResults();
                break;
            default:
                console.warn(`Action \`${action.functionName}\` cannot be handled.`)
                break;
        }
    }
    updateField = (widget, value) => {
        console.log("updateField", widget, value);
        let widgetcontrols = null;
        if (widget.property.widgetcontrols !== "null") {
            widgetcontrols = JSON.parse(widget.property.widgetcontrols.replace("$gt", ">").replace("$lt", "<"));
        }
        let visible = true;
        // Get filterSign
        let filterSign = "=";
        if (widgetcontrols !== null) {
            filterSign = widgetcontrols.filterSign;
            // console.log('widgetcontrols :>> ', widgetcontrols);
            // console.log('this.state.widgetValues.class_id?.value :>> ', this.state.widgetValues.class_id?.value);
            // visible = widgetcontrols.setFilterClass === null || widgetcontrols.setFilterClass == this.state.widgetValues.class_id?.value;
        }
        let columnname = widget.name;
        if (widget.property.widgetfunction !== "null") {
            columnname = JSON.parse(widget.property.widgetfunction)?.parameters?.columnfind;
        }
        columnname = columnname ?? widget.name;
        // Update filters
        let newWidgetValues = {}
        if (widget.name === "class_id") {
            Object.keys(this.state.widgetValues).forEach((key) => {
                // if (key !== "class_id") {
                    let _visible = this.state.widgetValues[key].setFilterClass === null || this.state.widgetValues[key].setFilterClass == value;
                    newWidgetValues = {...newWidgetValues, [key]: {...this.state.widgetValues[key], visible: _visible}};
                // }
            });
            newWidgetValues = {...newWidgetValues, [widget.name]: {columnname: columnname, value: value, filterSign: filterSign, visible: visible, setFilterClass: widgetcontrols.setFilterClass}}
            console.log('newWidgetValues :>> ', newWidgetValues);
            this.setState({ widgetValues: newWidgetValues })
        }
        else {
            this.setState({ widgetValues: {...this.state.widgetValues, [widget.name]: {columnname: columnname, value: value, filterSign: filterSign, visible: visible, setFilterClass: widgetcontrols.setFilterClass}} });
        }
        console.log("visible :>> ", visible);
    }
    onTabChanged = (tab, widget) => {
        this.getList(tab, widget);
        this.setState({ currentTab: {tab: tab, widget: widget} });
    }
    getList = (tab, widget) => {
        try {
            var request_url = GwUtils.getServiceUrl("visit");
            // console.log('widget.widget :>> ', widget.widget);
            // var filtered = widget.widget.filter(child => {
            //     return child.name === tab.name;
            // }).filter(child => {
            //     return child.layout;
            // }).filter(child => {
            //     // TODO: IMPROVE THIS
            //     return child.layout.item[1].layout.item.some((child2) => child2.widget.class === "QTableView");
            // });
            // console.log('filtered :>> ', filtered);
            // // if (isEmpty(filtered) || isEmpty(request_url)) {
            // //     return null;
            // // }
            // var tableWidgets = [];
            // filtered.forEach(childTab => {
            //     childTab.layout.item[0].layout.item.forEach(child => {
            //         if (child.widget.class === "QTableView") {
            //             tableWidgets.push(child.widget);
            //         }
            //     })
            // })
            // const prop = tableWidgets[0]?.property || {};
            // const action = JSON.parse(prop.action);

            const params = {
                "theme": this.props.theme.title,
                "tableName": "om_visit_photo"
                // "tabName": tab.name,  // tab.name, no? o widget.name?
                // "widgetname": tableWidgets[0].name,  // tabname_ prefix cal?
                //"formtype": this.props.formtype,
                // "idName": this.state.identifyResult.feature.idName,
                // "id": this.state.identifyResult.feature.id,
                // "filterFields": this.state.filters
                //"filterSign": action.params.tabName
            }
            console.log("TEST getList, params:", params);
            axios.get(request_url + "getlist", { params: params }).then((response) => {
                const result = response.data
                console.log("getlist done:", result);
                this.setState({ listJson: result });
            }).catch((e) => {
                console.log(e);
                // this.setState({  });
            })
        } catch (error) {
            console.warn(error);
        }

    }
    identifyPoint = (prevProps) => {
        const clickPoint = this.queryPoint(prevProps);
        if (clickPoint) {
            // Remove any search selection layer to avoid confusion
            this.props.removeLayer("searchselection");
            let pendingRequests = false;
            const queryableLayers = IdentifyUtils.getQueryLayers(this.props.layers, this.props.map).filter(l => {
                // TODO: If there are some wms external layers this would select more than one layer
                return l.type === "wms";
            });

            const request_url = GwUtils.getServiceUrl("visit");
            if (!isEmpty(queryableLayers) && !isEmpty(request_url)) {
                if (queryableLayers.length > 1) {
                    console.warn("There are multiple giswater queryable layers");
                }
                const layer = queryableLayers[0];
                const visit_type = this.state.mode === 'Incidencia' ? 2 : 1;

                const epsg = this.crsStrToInt(this.props.map.projection)
                const zoomRatio = MapUtils.computeForZoom(this.props.map.scales, this.props.map.zoom)
                const params = {
                    "theme": this.props.theme.title,
                    "epsg": epsg,
                    "xcoord": clickPoint[0],
                    "ycoord": clickPoint[1],
                    "zoomRatio": zoomRatio,
                    "layers": layer.queryLayers.join(','),
                    "visit_id": 10,
                    "featureType": "node",
                    "id": 1001,
                    "visit_type": visit_type
                }

                pendingRequests = true
                axios.get(request_url + "get", { params: params }).then(response => {
                    const result = response.data;
                    this.setState({ visitResult: result, pendingRequests: false });
                    this.highlightResult(result);
                }).catch((e) => {
                    console.log(e);
                    this.setState({ pendingRequests: false });
                });
            }
            this.props.addMarker('visit', clickPoint, '', this.props.map.projection);
            this.setState({ visitResult: {}, pendingRequests: pendingRequests });
        }
    }

    highlightResult = (result) => {
        // console.log('result :>> ', result);
        if (isEmpty(result) || !result?.feature?.geometry) {
            this.props.removeLayer("visitselection")
        } else {
            const layer = {
                id: "visitselection",
                role: LayerRole.SELECTION
            };
            const crs = this.props.map.projection
            console.log("geometry -> ",result.feature.geometry);
            console.log("crs -> ",crs);
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
            this.props.addMarker('visit', center, '', this.props.map.projection);
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
    onShow = (mode) => {
        this.setState({mode: mode || 'Visit'});
    }
    onToolClose = () => {
        this.props.removeMarker('visit');
        this.props.removeLayer("visitselection");
        this.props.changeSelectionState({ geomType: undefined });
        this.setState({ visitResult: null, pendingRequests: false });
    }
    clearResults = () => {
        this.props.removeMarker('visit');
        this.props.removeLayer("visitselection");
        this.setState({ visitResult: null, pendingRequests: false });
    }
    render() {
        let resultWindow = null;
        if (this.state.pendingRequests === true || this.state.visitResult !== null) {
            let body = null;
            if (isEmpty(this.state.visitResult)) {
                if (this.state.pendingRequests === true) {
                    body = (<div className="identify-body" role="body"><span className="identify-body-message">{LocaleUtils.tr("identify.querying")}</span></div>);
                } else {
                    body = (<div className="identify-body" role="body"><span className="identify-body-message">{LocaleUtils.tr("identify.noresults")}</span></div>);
                }
            } else {
                const result = this.state.visitResult;
                if (result.schema === null) {
                    body = null;
                    this.props.processStarted("info_msg", "GwVisit Error!");
                    this.props.processFinished("info_msg", false, "Couldn't find schema, please check service config.");
                }
                else {
                    body = (
                        <div className="identify-body" role="body">
                            <GwInfoQtDesignerForm form_xml={result.form_xml} readOnly={false} getInitialValues={true}
                                theme={this.state.theme} initiallyDocked={this.props.initiallyDocked}
                                dispatchButton={this.dispatchButton} updateField={this.updateField} onTabChanged={this.onTabChanged}
                                widgetValues={this.state.widgetValues} listJson={this.state.listJson} replaceImageUrls={true}
                            />
                        </div>
                    )
                }
            }
            let title = this.state.visitResult.body?.data?.form?.headerText || "Visit";
            resultWindow = (
                <ResizeableWindow icon="info-sign"
                    initialHeight={this.state.mode === "Dma" ? 800 : this.props.initialHeight} initialWidth={this.props.initialWidth}
                    initialX={this.props.initialX} initialY={this.props.initialY} initiallyDocked={this.props.initiallyDocked} scrollable={this.state.mode === "Dma" ? true : false}
                    key="GwInfoWindow"
                    onClose={this.clearResults} title={title}
                >
                    {body}
                </ResizeableWindow>
            );
        }
        return [resultWindow, (
            <TaskBar key="GwVisitTaskBar" onHide={this.onToolClose} onShow={this.onShow} task="GwVisit">
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
    theme: state.theme.current,
    selection: state.selection
});

export default connect(selector, {
    addLayerFeatures: addLayerFeatures,
    addMarker: addMarker,
    changeSelectionState: changeSelectionState,
    panTo: panTo,
    removeMarker: removeMarker,
    removeLayer: removeLayer,
    processFinished: processFinished,
    processStarted: processStarted
})(GwVisit);
