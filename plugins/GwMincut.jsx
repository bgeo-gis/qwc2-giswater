/**
 * Copyright BGEO. All rights reserved.
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
import { LayerRole, addMarker, removeMarker, removeLayer, addLayerFeatures, refreshLayer, changeLayerProperty } from 'qwc2/actions/layers';
import { changeSelectionState } from 'qwc2/actions/selection';
import ResizeableWindow from 'qwc2/components/ResizeableWindow';
import TaskBar from 'qwc2/components/TaskBar';
import Spinner from 'qwc2/components/Spinner';
import LocaleUtils from 'qwc2/utils/LocaleUtils';
import MapUtils from 'qwc2/utils/MapUtils';
import VectorLayerUtils from 'qwc2/utils/VectorLayerUtils';
import ConfigUtils from 'qwc2/utils/ConfigUtils';
import { panTo } from 'qwc2/actions/map';
import { setCurrentTask } from 'qwc2/actions/task';
import { processFinished, processStarted } from 'qwc2/actions/processNotifications';

import GwQtDesignerForm from '../components/GwQtDesignerForm';
import GwUtils from '../utils/GwUtils';

class GwMincut extends React.Component {
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
        refreshLayer: PropTypes.func,
        removeMarker: PropTypes.func,
        setCurrentTask: PropTypes.func,
        selection: PropTypes.object,
        mincutResult: PropTypes.object,
        dispatchButton: PropTypes.func,
        changeLayerProperty: PropTypes.func
    }
    static defaultProps = {
        initialWidth: 480,
        initialHeight: 550,
        initialX: 0,
        initialY: 0,
        initiallyDocked: true,
        mincutResult: null
    }
    state = {
        action: 'mincutNetwork',
        mincutState: 0,
        mincutId: null,
        mincutResult: null,
        prevMincutResult: null,
        pendingRequests: false,
        currentTab: {},
        feature_id: null,
        listJson: null,
        widgetValues: {},
        disabledWidgets: ['exec_start', 'exec_descript', 'exec_user', 'exec_from_plot', 'exec_depth', 'exec_appropiate', 'exec_end'],
        clickEnabled: true,
        activetabs: {},
        ogClickPoint: null
    }
    componentDidUpdate(prevProps, prevState) {
        if (this.props.currentIdentifyTool !== prevProps.currentIdentifyTool && prevProps.currentIdentifyTool === "GwMincut") {
            this.onToolClose();
        }
        if (this.state.clickEnabled && (this.props.currentTask === "GwMincut" || this.props.currentIdentifyTool === "GwMincut")) {
            this.identifyPoint(prevProps);
        }
    }
    // #region UTILS
    crsStrToInt = (crs) => {
        const parts = crs.split(':')
        return parseInt(parts.slice(-1))
    }
    highlightResult = (result) => {
        if (isEmpty(result)) {
            this.props.removeLayer("mincutselection")
        } else {
            const layer = {
                id: "mincutselection",
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
            this.props.addMarker('mincut', center, '', this.props.map.projection);
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
    setOMLayersVisibility = (visible = true) => {
        const rootLayer = this.props.layers.find(l => l.type === "wms");
        const { layer, path } = GwUtils.findLayer(rootLayer, 'Mincut');
        if (layer) {
            this.props.changeLayerProperty(rootLayer.uuid, "visibility", visible, path, 'both');
        }
    };
    getList = (tab, widget) => {
        try {
            var request_url = GwUtils.getServiceUrl("util");
            var widgets = this.state.mincutResult?.body?.data?.fields;
            var tableWidgets = [];
            if (widgets) {
                widgets.forEach(widget => {
                    console.log(widget);
                    if (widget.widgettype === "tableview") {
                        tableWidgets.push(widget);
                    }
                })
            }

            const params = {
                "theme": this.props.theme.title,
                "tableName": tableWidgets[0].linkedobject,
                "tabName": tab.name,  // tab.name, no? o widget.name?
                "widgetname": tableWidgets[0].widgetname,  // tabname_ prefix cal?
                //"formtype": this.props.formtype,
                "idName": "result_id",
                "id": this.state.mincutId
                // "filterFields": this.state.filters
                //"filterSign": action.params.tabName
            }
            console.log("TEST getList, params:", params);
            axios.get(request_url + "getlist", { params: params }).then((response) => {
                const result = response.data
                console.log("getlist done:", result);
                this.setState((state) => ({ listJson: { ...state.listJson, [tableWidgets[0].columnname]: result } }));
            }).catch((e) => {
                console.log(e);
                // this.setState({  });
            })
        } catch (error) {
            console.warn(error);
        }
    }
    manageLayers = (result) => {
        if (result?.tiled) {
            this.addMincutLayers(result);
        }
        else {
            this.setOMLayersVisibility(true);
        }
    }
    addMincutLayers = (result) => {

        if (!result?.body?.data?.arc) {
            return;
        }

        this.removeTempLayers();

        // Arc
        let arc = result.body.data.arc;
        let arc_style = {
            strokeColor: [232, 179, 93, 0.9],
            strokeWidth: 6,
            strokeDash: [1],
            fillColor: [232, 179, 93, 0.66],
            textFill: "blue",
            textStroke: "white",
            textFont: '20pt sans-serif'
        }
        const arc_features = GwUtils.getGeoJSONFeatures(arc, "default", arc_style)

        const line_features = [].concat(arc_features);
        if (!isEmpty(line_features)) {
            this.props.addLayerFeatures({
                id: "temp_lines.geojson",
                name: "temp_lines.geojson",
                title: "Temporal Lines",
                zoomToExtent: true
            }, line_features, true);
        }

        // Init
        let init_point = result.body.data.init;
        let init_point_style = {
            strokeColor: [45, 84, 255, 1],
            strokeWidth: 2,
            strokeDash: [4],
            fillColor: [45, 84, 255, 0.66],
            textFill: "blue",
            textStroke: "white",
            textFont: '20pt sans-serif'
        }
        const init_point_features = GwUtils.getGeoJSONFeatures(init_point, "default", init_point_style)
        // Node
        let node = result.body.data.node;
        let node_style = {
            strokeColor: [241, 209, 66, 1],
            strokeWidth: 2,
            circleRadius: 5,
            strokeDash: [4],
            fillColor: [241, 209, 66, 1],
            textFill: "blue",
            textStroke: "white",
            textFont: '20pt sans-serif'
        }
        const node_features = GwUtils.getGeoJSONFeatures(node, "default", node_style)
        // Connec
        let connec = result.body.data.connec;
        let connec_style = {
            strokeColor: [176, 123, 103, 1],
            strokeWidth: 2,
            strokeDash: [4],
            fillColor: [76, 123, 103, 0.66],
            textFill: "blue",
            textStroke: "white",
            textFont: '20pt sans-serif'
        }
        const connec_features = GwUtils.getGeoJSONFeatures(connec, "default", connec_style)
        // Valve proposed
        let valve_proposed = result.body.data.valveClose;
        let valve_proposed_style = {
            strokeColor: [237, 55, 58, 1],
            strokeWidth: 2,
            strokeDash: [4],
            fillColor: [237, 55, 58, 0.9],
            textFill: "blue",
            textStroke: "white",
            textFont: '20pt sans-serif'
        }
        const valve_proposed_features = GwUtils.getGeoJSONFeatures(valve_proposed, "default", valve_proposed_style)
        // Valve not proposed
        let valve_not_proposed = result.body.data.valveNot;
        let valve_not_proposed_style = {
            strokeColor: [51, 160, 44, 1],
            strokeWidth: 2,
            strokeDash: [4],
            fillColor: [51, 160, 44, 0.9],
            textFill: "blue",
            textStroke: "white",
            textFont: '20pt sans-serif'
        }
        const valve_not_proposed_features = GwUtils.getGeoJSONFeatures(valve_not_proposed, "default", valve_not_proposed_style)

        const point_features = [].concat(node_features, connec_features, init_point_features, valve_proposed_features, valve_not_proposed_features);
        if (!isEmpty(point_features)) {
            this.props.addLayerFeatures({
                id: "temp_points.geojson",
                name: "temp_points.geojson",
                title: "Temporal Points",
                zoomToExtent: true
            }, point_features, true);
        }
    }
    removeTempLayers = () => {
        this.props.removeLayer("temp_points.geojson");
        this.props.removeLayer("temp_lines.geojson");
        this.props.removeLayer("temp_polygons.geojson");
    }
    // #endregion
    // #region CLICK
    identifyPoint = (prevProps) => {
        const clickPoint = this.queryPoint(prevProps);
        if (clickPoint) {
            if (this.state.action === 'changeValveStatus'){
                this.changeValveStatus(clickPoint);
            }
            else {
                this.setMincut(clickPoint);
            }
        }
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
    // #endregion
    // #region DIALOG
    updateField = (widget, value, action) => {
        // Get filterSign
        var filterSign = "=";
        if (widget.property.widgetcontrols !== "null") {
            filterSign = JSON.parse(widget.property.widgetcontrols.replace("$gt", ">").replace("$lt", "<")).filterSign;
        }
        var columnname = widget.name;
        if (widget.property.widgetfunction !== "null") {
            columnname = JSON.parse(widget.property.widgetfunction)?.parameters?.columnfind;
        }
        columnname = columnname ?? widget.name;
        // Update filters
        this.setState((state) => ({ widgetValues: { ...state.widgetValues, [widget.name]: { columnname: columnname, value: value, filterSign: filterSign } } }));
    }
    dispatchButton = (action) => {
        if (this.props.dispatchButton) {
            return this.props.dispatchButton(action);
        }
        var queryableLayers;
        var request_url;
        let pendingRequests = false;
        let disabledWidgets = [];
        switch (action.functionName) {
            case "accept":
                // get widget values to update om_mincut and call gw_fct_setmincut(action=mincutAccept)
                this.acceptMincut();
                break;

            case "cancel":
                if (this.props.mincutResult === null) {
                    this.cancelMincut();
                }
                break;

            case "real_start":
                this.setMincut(this.state.ogClickPoint, false);
                // set state 1 'In Progress'
                this.acceptMincut(1, false)
                // enable tab_exec widgets
                // TODO: IMPROVE THIS!
                disabledWidgets = ["chk_use_planified", "mincut_type", "anl_cause", "received_date", "anl_descript", "forecast_start", "forecast_end", "assigned_to", "id", "mincut_state", "work_order"];
                this.setState({ disabledWidgets: disabledWidgets });
                break;

            case "real_end":
                // set state 2 'Finished'
                this.acceptMincut(2, false)
                // TODO: IMPROVE THIS!
                disabledWidgets = ["exec_start", "exec_descript", "exec_user", "exec_from_plot", "exec_depth", "exec_appropiate", "exec_end", "chk_use_planified", "mincut_type", "anl_cause", "received_date", "anl_descript", "forecast_start", "forecast_end", "assigned_to", "id", "mincut_state", "work_order"];
                this.setState({ disabledWidgets: disabledWidgets });
                // show tab log
                this.showTab('tab_log');
                break;

            case "auto_mincut":
                this.setState({ clickEnabled: true, action: 'mincutNetwork' });
                break;

            case "custom_mincut":
                // show the taskbar again
                // allow click on map
                this.setState({ clickEnabled: true, action: 'mincutValveUnaccess' }, () => {this.props.refreshLayer(layer => layer.role === LayerRole.THEME)});
                break;

            case "change_valve_status":
                // show the taskbar again
                // allow click on map
                this.setState({ clickEnabled: true, action: 'changeValveStatus' });
                break;

            case "refresh_mincut":
                this.setMincut(this.state.ogClickPoint, false, 'mincutNetwork');
                break;

            default:
                console.warn(`Action \`${action.functionName}\` cannot be handled.`)
                break;
        }
    }
    onTabChanged = (tab, widget) => {
        this.setState({ currentTab: { tab: tab, widget: widget }, activetabs: {} });

        if (tab.name === "tab_hydro") {
            this.getList(tab, widget);
        }
    }
    showTab = (tab) => {
        this.setState({ activetabs: {...this.state.activetabs, tabWidget: tab} });
    }
    onShow = (mode) => {
        const actionMap = {
            'Network': 'mincutNetwork',
            'Start': 'startMincut',
            'ValveUnaccess': 'mincutValveUnaccess',
            'Accept': 'mincutAccept',
        }
        let action = actionMap[mode] || 'invalidMode';
        this.setState({ action: action });
    }
    onToolClose = () => {
        this.props.removeMarker('mincut');
        this.props.removeLayer("mincutselection");
        this.setState({
            mincutResult: null,
            pendingRequests: false,
            widgetValues: {},
            mincutId: null,
            disabledWidgets: ['exec_start', 'exec_descript', 'exec_user', 'exec_from_plot', 'exec_depth', 'exec_appropiate', 'exec_end'],
            clickEnabled: true,
            ogClickPoint: null
        });
    }
    onDlgClose = () => {
        // Manage if mincut is not new (don't delete)
        if (this.props.mincutResult) {
            this.props.refreshLayer(layer => layer.role === LayerRole.THEME);
            this.onToolClose();
            if (this.props.dispatchButton) {
                this.props.dispatchButton({ "widgetfunction": { "functionName": "mincutClose" } });
            }
        } else {
            this.cancelMincut();
        }

    }
    // #endregion
    // #region MINCUT
    setMincut = (clickPoint, updateState = true, action = this.state.action) => {
        this.props.removeLayer("mincutselection");
        let pendingRequests = false;
        if (action === 'mincutValveUnaccess') updateState = false;

        const request_url = GwUtils.getServiceUrl("mincut");
        if (!isEmpty(request_url)) {
            const mincutId = this.state.mincutId;
            const epsg = this.crsStrToInt(this.props.map.projection);
            const zoomRatio = MapUtils.computeForZoom(this.props.map.scales, this.props.map.zoom);
            const params = {
                "theme": this.props.currentTheme.title,
                "epsg": epsg,
                "xcoord": clickPoint[0],
                "ycoord": clickPoint[1],
                "zoomRatio": zoomRatio,
                "action": action,
                "mincutId": mincutId
            };

            pendingRequests = true;
            axios.get(request_url + "setmincut", { params: params }).then(response => {
                const result = response.data;
                this.manageLayers(result);
                this.props.refreshLayer(layer => layer.role === LayerRole.THEME);
                let newState = { mincutResult: result, mincutId: result?.body?.data?.mincutId || mincutId, prevMincutResult: null, pendingRequests: false, clickEnabled: false };
                if (action === 'mincutNetwork') newState.ogClickPoint = clickPoint;
                if (updateState) this.setState(newState);
                if (action === 'mincutValveUnaccess') this.setState({ clickEnabled: false })
            }).catch((e) => {
                console.log(e);
                if (updateState) this.setState({ pendingRequests: false });
            });
        }
        this.props.addMarker('mincut', clickPoint, '', this.props.map.projection);
        if (updateState) this.setState({ mincutResult: {}, prevMincutResult: null, pendingRequests: pendingRequests });
    }
    changeValveStatus = (clickPoint) => {
        this.props.removeLayer("mincutselection");
        let pendingRequests = false;

        const request_url = GwUtils.getServiceUrl("mincut");
        if (!isEmpty(request_url)) {
            const mincutId = this.state.mincutId;
            const epsg = this.crsStrToInt(this.props.map.projection);
            const zoomRatio = MapUtils.computeForZoom(this.props.map.scales, this.props.map.zoom);
            const params = {
                "theme": this.props.currentTheme.title,
                "epsg": epsg,
                "xcoord": clickPoint[0],
                "ycoord": clickPoint[1],
                "zoomRatio": zoomRatio,
                "mincutId": mincutId
            };

            pendingRequests = true;
            axios.get(request_url + "changevalvestatus", { params: params }).then(response => {
                const result = response.data;
                this.manageLayers(result);
                this.props.refreshLayer(layer => layer.role === LayerRole.THEME);
                // this.setState({ action: 'mincutNetwork' });
            }).catch((e) => {
                console.log(e);
            });
        }
        this.props.addMarker('mincut', clickPoint, '', this.props.map.projection);
    }
    acceptMincut = (state = this.state.mincutState, closeDlg = true) => {
        console.log(this.state.widgetValues);
        const ignore_widgets = ['chk_use_planified', 'txt_infolog'];
        const fields = Object.entries(this.state.widgetValues).reduce((acc, [key, value]) => {
            let v = value.columnname === 'mincut_state' ? state : value.value;
            if (ignore_widgets.includes(value.columnname)) v = null;
            if (!(v === null || v === undefined)) {
                acc[value.columnname] = v;
            }
            return acc;
        }, {});
        const request_url = GwUtils.getServiceUrl("mincut");
        if (!isEmpty(request_url)) {
            const clickPoint = this.state.ogClickPoint;
            const epsg = this.crsStrToInt(this.props.map.projection);
            const zoomRatio = MapUtils.computeForZoom(this.props.map.scales, this.props.map.zoom);
            const params = {
                "theme": this.props.currentTheme.title,
                "epsg": epsg,
                "xcoord": clickPoint[0],
                "ycoord": clickPoint[1],
                "zoomRatio": zoomRatio,
                "action": this.props.action,
                "mincutId": this.state.mincutId,
                "usePsectors": this.state.widgetValues.chk_use_planified?.value,
                "fields": fields
            };

            this.props.processStarted("mincut_msg", "Aceptar mincut");
            axios.post(request_url + "accept", { ...params }).then((response) => {
                const result = response.data;
                let newState = {};
                const log = result.body?.data?.info?.values;
                if (log) {
                    const messages = log.sort((a, b) => a.id - b.id) // sort by id
                        .map(value => value.message)
                        .join("\n");
                    newState = { ...newState, widgetValues: { ...this.state.widgetValues, txt_infolog: { ...this.state.widgetValues.txt_infolog, value: messages } } };
                }
                // show message
                this.props.processFinished("mincut_msg", true, "Mincut guardado correctamente.");
                // refresh map
                this.props.refreshLayer(layer => layer.role === LayerRole.THEME);
                if (state !== this.state.mincutState) newState = { ...newState, mincutState: state };
                if (newState) this.setState(newState);
                if (closeDlg) {
                    this.onToolClose();
                    this.props.setCurrentTask(null);
                }
            }).catch((e) => {
                console.log(e);
                this.props.processFinished("mincut_msg", false, "No se ha podido guardar el mincut...");
            });
        }
    }
    cancelMincut = () => {
        const request_url = GwUtils.getServiceUrl("mincut");
        if (!isEmpty(request_url)) {
            const params = {
                "theme": this.props.currentTheme.title,
                "mincutId": this.state.mincutId
            };

            this.props.processStarted("mincut_msg", "Cancelar mincut");
            axios.get(request_url + "cancel", { params: params }).then((response) => {
                const result = response.data;
                // show message
                this.props.processFinished("mincut_msg", true, "Mincut cancelado correctamente.");
                // refresh map
                this.props.refreshLayer(layer => layer.role === LayerRole.THEME);
                this.removeTempLayers();
                this.onToolClose();
            }).catch((e) => {
                console.log(e);
                this.props.processFinished("mincut_msg", false, "No se ha podido cancelar el mincut...");
                this.removeTempLayers();
                this.onToolClose();
                this.props.setCurrentTask(null);
            });
        }
    }
    // #endregion
    render() {
        let resultWindow = null;
        const messageMap = {
            'mincutNetwork': LocaleUtils.tr("mincut.clickhelpNetwork"),
            'mincutValveUnaccess': LocaleUtils.tr("mincut.clickhelpValveUnaccess"),
            'changeValveStatus': LocaleUtils.tr("mincut.clickhelpChangeValveStatus"),
        }
        const taskBarMessage = messageMap[this.state.action] || LocaleUtils.tr("mincut.clickhelpNetwork");
        let taskBar = (
            <TaskBar key="GwMincutTaskBar" onShow={this.onShow} onHide={this.onToolClose} task="GwMincut">
                {() => ({
                    body: taskBarMessage
                })}
            </TaskBar>
        );
        const result = this.state.mincutResult || this.props.mincutResult;
        if (this.state.pendingRequests === true || result !== null) {
            let body = null;
            if (isEmpty(result)) {
                if (this.state.pendingRequests === true) {
                    body = (<div className="mincut-body" role="body"><Spinner /><span className="mincut-body-message">{LocaleUtils.tr("identify.querying")}</span></div>);
                } else {
                    body = (<div className="mincut-body" role="body"><span className="mincut-body-message">{LocaleUtils.tr("identify.noresults")}</span></div>);
                }
            } else {
                if (result.schema === null) {
                    body = null;
                    this.props.processStarted("mincut_msg", "GwMincut Error!");
                    this.props.processFinished("mincut_msg", false, "Couldn't find schema, please check service config.");
                }
                else if (result.status === "Failed") {
                    body = null;
                    this.props.processStarted("mincut_msg", "GwMincut Error!");
                    this.props.processFinished("mincut_msg", false, "DB error:" + (result.SQLERR || result.message || "Check logs"));
                }
                else {
                    body = (
                        <div className="mincut-body" role="body">
                            <GwQtDesignerForm form_xml={result.form_xml} readOnly={false}
                                autoResetTab={false} activetabs={this.state.activetabs}
                                dispatchButton={this.dispatchButton} updateField={this.updateField} onTabChanged={this.onTabChanged}
                                listJson={this.state.listJson} widgetValues={this.state.widgetValues} disabledWidgets={this.state.disabledWidgets}
                            />
                        </div>
                    )
                    // taskBar = null;
                }
            }
            resultWindow = (
                <ResizeableWindow icon="mincut" dockable="right"
                    initialHeight={this.props.initialHeight} initialWidth={this.props.initialWidth}
                    initialX={this.props.initialX} initialY={this.props.initialY} initiallyDocked={this.props.initiallyDocked}
                    key="GwMincutWindow"
                    onClose={this.onDlgClose} title="Giswater Mincut" scrollable={true}
                >
                    {body}
                </ResizeableWindow>
            );
        }
        return [resultWindow, (this.state.clickEnabled ? taskBar : null)];
    }
}

const selector = (state) => ({
    click: state.map.click || { modifiers: {} },
    currentTask: state.task.id,
    currentIdentifyTool: state.identify.tool,
    layers: state.layers.flat,
    map: state.map,
    theme: state.theme.current,
    selection: state.selection,
    currentTheme: state.theme.current
});

export default connect(selector, {
    addLayerFeatures: addLayerFeatures,
    addMarker: addMarker,
    changeSelectionState: changeSelectionState,
    panTo: panTo,
    removeMarker: removeMarker,
    removeLayer: removeLayer,
    refreshLayer: refreshLayer,
    processFinished: processFinished,
    processStarted: processStarted,
    setCurrentTask: setCurrentTask,
    changeLayerProperty: changeLayerProperty
})(GwMincut);
