/**
 * Copyright © 2024 by BGEO. All rights reserved.
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
import ResizeableWindow from 'qwc2/components/ResizeableWindow';
import TaskBar from 'qwc2/components/TaskBar';
import Spinner from 'qwc2/components/Spinner';
import LocaleUtils from 'qwc2/utils/LocaleUtils';
import MapUtils from 'qwc2/utils/MapUtils';
import VectorLayerUtils from 'qwc2/utils/VectorLayerUtils';
import { panTo } from 'qwc2/actions/map';
import { setCurrentTask } from 'qwc2/actions/task';
import { processFinished, processStarted } from 'qwc2/actions/processNotifications';

import GwQtDesignerForm from '../components/GwQtDesignerForm';
import GwUtils from '../utils/GwUtils';

import {setActiveMincut} from '../actions/mincut';


const MincutState = Object.freeze({
    Planified: 0,
    InProgress: 1,
    Finished: 2,
    Canceled: 3,
    OnPlaning: 4
});

class GwMincut extends React.Component {
    static propTypes = {
        action: PropTypes.string,
        addLayerFeatures: PropTypes.func,
        addMarker: PropTypes.func,
        changeLayerProperty: PropTypes.func,
        click: PropTypes.object,
        currentIdentifyTool: PropTypes.string,
        currentTask: PropTypes.string,
        currentTheme: PropTypes.object,
        onWidgetAction: PropTypes.func,
        dockable: PropTypes.oneOfType([PropTypes.bool, PropTypes.string]),
        initialHeight: PropTypes.number,
        initialWidth: PropTypes.number,
        initialX: PropTypes.number,
        initialY: PropTypes.number,
        initiallyDocked: PropTypes.bool,
        keepManagerOpen: PropTypes.bool,
        layers: PropTypes.array,
        map: PropTypes.object,
        mincutId: PropTypes.number,
        mincutResult: PropTypes.object,
        panTo: PropTypes.func,
        processFinished: PropTypes.func,
        processStarted: PropTypes.func,
        refreshLayer: PropTypes.func,
        removeLayer: PropTypes.func,
        removeMarker: PropTypes.func,
        selection: PropTypes.object,
        setActiveMincut: PropTypes.func,
        setCurrentTask: PropTypes.func,
        theme: PropTypes.object
    };
    static defaultProps = {
        dockable: 'right',
        initiallyDock: true,
        initialWidth: 480,
        initialHeight: 600,
        initialX: 0,
        initialY: 0,
        mincutResult: null,
    };

    state = {
        action: 'mincutNetwork',
        mincutState: 0,
        mincutId: null,
        pendingRequests: false,
        currentTab: {},
        feature_id: null,
        mincutValues: {},
        clickEnabled: true,
        activetabs: {},
        widgetsProperties: {}
    };

    ogClickPoint = null;
    formUi = null;

    componentDidUpdate(prevProps) {
        if (this.props.currentIdentifyTool !== prevProps.currentIdentifyTool && prevProps.currentIdentifyTool === "GwMincut") {
            this.onToolClose();
        }
        if (this.state.clickEnabled && (this.props.currentTask === "GwMincut" || this.props.currentIdentifyTool === "GwMincut")) {
            this.identifyPoint(prevProps);
        }
    }

    // #region UTILS
    highlightResult = (result) => {
        if (isEmpty(result)) {
            this.props.removeLayer("mincutselection");
        } else {
            const layer = {
                id: "mincutselection",
                role: LayerRole.SELECTION
            };
            const crs = this.props.map.projection;
            const geometry = VectorLayerUtils.wktToGeoJSON(result.feature.geometry, crs, crs);
            const feature = {
                id: result.feature.id,
                geometry: geometry.geometry
            };
            this.props.addLayerFeatures(layer, [feature], true);
        }
    };
    panToResult = (result) => {
        // TODO: Maybe we should zoom to the result as well
        if (!isEmpty(result)) {
            const center = GwUtils.getGeometryCenter(result.feature.geometry);
            this.props.panTo(center, this.props.map.projection);
        }
    };
    addMarkerToResult = (result) => {
        if (!isEmpty(result)) {
            const center = GwUtils.getGeometryCenter(result.feature.geometry);
            this.props.addMarker('mincut', center, '', this.props.map.projection);
        }
    };
    setOMLayersVisibility = (layerName, visible = true) => {
        const rootLayer = this.props.layers.find(l => l.type === "wms");
        const { layer, path } = GwUtils.findLayer(rootLayer, layerName);
        if (layer) {
            this.props.changeLayerProperty(rootLayer.uuid, "visibility", visible, path, 'both');
            return true;
        }
        return false;
    };
    getList = (tab) => {
        try {
            const requestUrl = GwUtils.getServiceUrl("util");
            let tableWidget = null;
            GwUtils.forEachWidgetInLayout(tab.layout, (widget) => {
                if (widget.class === "QTableView" || widget.class === 'QTableWidget') {
                    tableWidget = widget; // There should only be one
                }
            });

            if (isEmpty(tableWidget) || isEmpty(requestUrl)) {
                return;
            }

            const params = {
                theme: this.props.theme.title,
                tableName: tableWidget.property.linkedobject,
                tabName: tab.name,  // tab.name, no? o widget.name?
                // "widgetname": tableWidgets[0].widgetname,  // tabname_ prefix cal?
                // "formtype": this.props.formtype,
                idName: "result_id",
                id: this.state.mincutId
                // "filterFields": this.state.filters
                // "filterSign": action.params.tabName
            };
            axios.get(requestUrl + "getlist", { params: params }).then((response) => {
                const result = response.data;
                this.setState((state) => ({ widgetsProperties: { ...state.widgetsProperties, [tableWidget.name]: { 
                    value: GwUtils.getListToValue(result)
                } } }));
            }).catch((e) => {
                console.warn(e);
                // this.setState({  });
            });
        } catch (error) {
            console.error(error);
        }
    };
    manageLayers = (result) => {
        if (!this.setOMLayersVisibility(result?.body?.data?.mincutLayer, true)) {
            this.addMincutLayers(result);
        }
    };
    addMincutLayers = (result) => {
        if (!result?.body?.data?.mincutArc) {
            return;
        }
        this.removeTempLayers();

        // Arc
        const arc = result.body.data.mincutArc;
        const arcStyle = {
            strokeColor: [255, 206, 128, 1],
            strokeWidth: 6
        };
        const arcFeatures = GwUtils.getGeoJSONFeatures("default", arc, arcStyle);

        const lineFeatures = [].concat(arcFeatures);
        if (!isEmpty(lineFeatures)) {
            this.props.addLayerFeatures({
                id: "temp_lines.geojson",
                name: "temp_lines.geojson",
                title: "Temporal Lines",
                zoomToExtent: true
            }, lineFeatures, true);
        }

        // Init
        const initPoint = result.body.data.mincutInit;
        const initPointStyle = {
            strokeColor: [0, 24, 124, 1],
            strokeWidth: 1,
            circleRadius: 4,
            fillColor: [45, 84, 255, 1]
        };
        const initpointFeatures = GwUtils.getGeoJSONFeatures("default", initPoint, initPointStyle);
        // Node
        const node = result.body.data.mincutNode;
        const nodeStyle = {
            strokeColor: [160, 134, 17, 1],
            strokeWidth: 1,
            circleRadius: 3,
            fillColor: [241, 209, 66, 1]
        };
        const nodeFeatures = GwUtils.getGeoJSONFeatures("default", node, nodeStyle);
        // Connec
        const connec = result.body.data.mincutConnec;
        const connecStyle = {
            strokeColor: [102, 46, 25, 1],
            strokeWidth: 1,
            circleRadius: 3,
            fillColor: [176, 123, 103, 1]
        };
        const connecFeatures = GwUtils.getGeoJSONFeatures("default", connec, connecStyle);
        // Valve proposed
        const valveProposed = result.body.data.mincutProposedValve;
        const valveProposedStyle = {
            strokeColor: [134, 13, 13, 1],
            strokeWidth: 1,
            circleRadius: 6,
            fillColor: [237, 55, 58, 1]
        };
        const valveProposedFeatures = GwUtils.getGeoJSONFeatures("default", valveProposed, valveProposedStyle);
        // Valve not proposed
        const valveNotProposed = result.body.data.mincutNotProposedValve;
        const valveNotProposedStyle = {
            strokeColor: [6, 94, 0, 1],
            strokeWidth: 1,
            circleRadius: 6,
            fillColor: [51, 160, 44, 1]
        };
        const valveNotProposedFeatures = GwUtils.getGeoJSONFeatures("default", valveNotProposed, valveNotProposedStyle);

        const pointFeatures = [].concat(nodeFeatures, connecFeatures, initpointFeatures, valveProposedFeatures, valveNotProposedFeatures);
        if (!isEmpty(pointFeatures)) {
            this.props.addLayerFeatures({
                id: "temp_points.geojson",
                name: "temp_points.geojson",
                title: "Temporal Points",
                zoomToExtent: true
            }, pointFeatures, true);
        }
    };
    removeTempLayers = () => {
        this.props.removeLayer("temp_points.geojson");
        this.props.removeLayer("temp_lines.geojson");
        this.props.removeLayer("temp_polygons.geojson");
    };
    // #endregion
    // #region CLICK
    identifyPoint = (prevProps) => {
        const clickPoint = this.queryPoint(prevProps);
        if (clickPoint) {
            if (this.state.action === 'changeValveStatus') {
                this.changeValveStatus(clickPoint);
            } else {
                this.setMincut(clickPoint);
            }
        }
    };
    queryPoint = (prevProps) => {
        if (this.props.click.button !== 0 || this.props.click === prevProps.click || (this.props.click.features || []).find(entry => entry.feature === 'startupposmarker')) {
            return null;
        }
        if (this.props.click.feature === 'searchmarker' && this.props.click.geometry && this.props.click.geomType === 'Point') {
            return null;
            // return this.props.click.geometry;
        }
        return this.props.click.coordinate;
    };
    // #endregion
    // #region DIALOG
    loadFormUi = (formUi) => {
        this.formUi = formUi;
        this.setDisabledWidgets(MincutState.Planified);
    };

    onWidgetValueChange = (widget, value) => {
        // Get filterSign
        let filterSign = "=";
        if (widget.property.widgetcontrols !== "null") {
            filterSign = JSON.parse(widget.property.widgetcontrols.replace("$gt", ">").replace("$lt", "<")).filterSign;
        }
        let columnname = widget.name;
        if (widget.property.widgetfunction !== "null") {
            columnname = JSON.parse(widget.property.widgetfunction)?.parameters?.columnfind;
        }
        columnname = columnname ?? widget.name;
        // Update filters
        this.setState((state) => ({
            mincutValues: { ...state.mincutValues, [widget.name]: { columnname: columnname, value: value, filterSign: filterSign } },
            widgetsProperties: { ...state.widgetsProperties, [widget.name]: { value: value } }
        }));
    };
    onWidgetAction = (action) => {
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
            this.setMincut(this.ogClickPoint, false, "startMincut");
            this.acceptMincut(MincutState.InProgress, false);
            break;

        case "real_end":
            this.acceptMincut(MincutState.Finished, false);
            // show tab log
            this.showTab('tab_log');
            break;

        case "auto_mincut":
            this.setState({ clickEnabled: true, action: 'mincutNetwork' });
            break;

        case "custom_mincut":
            // show the taskbar again
            // allow click on map
            this.setState({ clickEnabled: true, action: 'mincutValveUnaccess' }, () => {this.props.refreshLayer(layer => layer.role === LayerRole.THEME);});
            break;

        case "change_valve_status":
            // show the taskbar again
            // allow click on map
            this.setState({ clickEnabled: true, action: 'changeValveStatus' });
            break;

        case "refresh_mincut":
            this.setMincut(this.ogClickPoint, false, 'mincutNetwork');
            break;

        default:
            console.warn(`Action \`${action.functionName}\` cannot be handled.`);
            break;
        }
    };
    onTabChanged = (tab, widget) => {
        this.setState({ currentTab: { tab: tab, widget: widget }, activetabs: {} });

        if (tab.name === "tab_hydro") {
            this.getList(tab, widget);
        }
    };
    showTab = (tab) => {
        this.setState((state) => ({ activetabs: {...state.activetabs, tabWidget: tab} }));
    };
    onShow = (mode) => {
        const actionMap = {
            Network: 'mincutNetwork',
            Start: 'startMincut',
            ValveUnaccess: 'mincutValveUnaccess',
            Accept: 'mincutAccept'
        };
        const action = actionMap[mode] || 'invalidMode';
        this.setState({ action: action });
    };
    setDisabledWidgets = (mincutState) => {
        let tabPlanEnabled = true;
        const lytExecWidgets = GwUtils.getWidgetsInLayout("lyt_exec_1", this.formUi).map(widget => widget.name);
        let lytExecEnabled = true;
        let btnStartEnabled = true;
        let btnEndEnabled = true;
        console.log("Setting disabled widgets", mincutState, lytExecWidgets);

        switch (mincutState) {
        case MincutState.Planified:
            lytExecEnabled = false;
            btnEndEnabled = false;
            break;

        case MincutState.InProgress:
            tabPlanEnabled = false;
            btnStartEnabled = false;
            break;

        case MincutState.Finished:
            lytExecEnabled = false;
            btnStartEnabled = false;
            btnEndEnabled = false;
            tabPlanEnabled = false;
            break;
        }

        this.setState((state) => ({
            widgetsProperties: {
                ...state.widgetsProperties,
                tab_plan: { disabled: !tabPlanEnabled },
                ...lytExecWidgets.reduce((acc, widget) => {
                    acc[widget] = {
                        ...state.widgetsProperties[widget],
                        disabled: !lytExecEnabled
                    };
                    return acc;
                }, {}),
                btn_start: { disabled: !btnStartEnabled },
                btn_end: { disabled: !btnEndEnabled }
            }
        }));
    };
    onToolClose = () => {
        this.props.removeMarker('mincut');
        this.props.removeLayer("mincutselection");
        this.props.setActiveMincut(null, null);
        if (!this.props.keepManagerOpen) {
            this.props.setCurrentTask(null);
        }
        this.ogClickPoint = null;
        this.setState({
            pendingRequests: false,
            widgetsProperties: {},
            mincutValues: {},
            mincutId: null,
            clickEnabled: true,
        });
    };
    onDlgClose = () => {
        // Manage if mincut is not new (don't delete)
        if (this.props.mincutResult) {
            this.onToolClose();
            this.props.refreshLayer(layer => layer.role === LayerRole.THEME);
            if (this.props.onWidgetAction) {
                this.props.onWidgetAction({ widgetfunction: { functionName: "mincutClose" } });
            }

        } else {
            this.cancelMincut();
        }

    };
    // #endregion
    // #region MINCUT
    setMincut = (clickPoint, updateState = true, action = this.state.action) => {
        this.props.removeLayer("mincutselection");
        let pendingRequests = false;
        if (action === 'mincutValveUnaccess'){
            updateState = false;
            this.props.processStarted("mincut_msg", "Custom mincut");
        }
        if (action === 'mincutNetwork') this.props.processStarted("mincut_msg", "Setting mincut");
        clickPoint = clickPoint || [null, null];
        const requestUrl = GwUtils.getServiceUrl("mincut");
        if (!isEmpty(requestUrl)) {
            const mincutId = this.state.mincutId || this.props.mincutId;
            const epsg = GwUtils.crsStrToInt(this.props.map.projection);
            const zoomRatio = MapUtils.computeForZoom(this.props.map.scales, this.props.map.zoom);
            const params = {
                theme: this.props.currentTheme.title,
                epsg: epsg,
                xcoord: clickPoint[0],
                ycoord: clickPoint[1],
                zoomRatio: zoomRatio,
                action: action,
                mincutId: mincutId
            };

            pendingRequests = true;
            axios.get(requestUrl + "setmincut", { params: params }).then(response => {
                const result = response.data;
                this.manageLayers(result);
                // const newState = { mincutResult: result, mincutId: result?.body?.data?.mincutId || mincutId, pendingRequests: false, clickEnabled: false };
                // if (updateState) this.setState(newState);
                if (action === 'mincutValveUnaccess'){
                    this.setState({ clickEnabled: false });
                    this.props.processFinished("mincut_msg", true, "Custom mincut executed correctly");
                }
                else if (action === 'mincutNetwork'){
                    this.ogClickPoint = clickPoint;
                    this.props.setActiveMincut(result, result?.body?.data?.mincutId || mincutId, this.props.keepManagerOpen);
                    this.props.processFinished("mincut_msg", true, "Mincut setted correctly");
                }  
                this.props.refreshLayer(layer => layer.role === LayerRole.THEME);

            }).catch((e) => {
                console.log(e);
                if (updateState) this.setState({ pendingRequests: false });
                if (action === 'mincutValveUnaccess') this.props.processFinished("mincut_msg", false, "Error on custom mincut");
                if (action === 'mincutNetwork') this.props.processFinished("mincut_msg", false, `Error: "${e}`);
            });
        }
        this.props.addMarker('mincut', clickPoint, '', this.props.map.projection);
        if (updateState) {
            // this.props.setActiveMincut(null, null);
            this.setState({ pendingRequests: pendingRequests });
        }
        // if (updateState) this.setState({ mincutResult: {}, pendingRequests: pendingRequests });
    };

    changeValveStatus = (clickPoint) => {
        this.props.removeLayer("mincutselection");
        this.props.processStarted("mincut_msg", "Change valve status");
        const requestUrl = GwUtils.getServiceUrl("mincut");
        if (!isEmpty(requestUrl)) {
            const mincutId = this.state.mincutId;
            const epsg = GwUtils.crsStrToInt(this.props.map.projection);
            const zoomRatio = MapUtils.computeForZoom(this.props.map.scales, this.props.map.zoom);
            const params = {
                theme: this.props.currentTheme.title,
                epsg: epsg,
                xcoord: clickPoint[0],
                ycoord: clickPoint[1],
                zoomRatio: zoomRatio,
                mincutId: mincutId
            };

            axios.get(requestUrl + "changevalvestatus", { params: params }).then(response => {
                const result = response.data;
                this.manageLayers(result);
                this.props.refreshLayer(layer => layer.role === LayerRole.THEME);
                this.props.processFinished("mincut_msg", true, "Valve status changed");
                // this.setState({ action: 'mincutNetwork' });
            }).catch((e) => {
                this.props.processFinished("mincut_msg", false, "Error changing valve status");
                console.log(e);
            });
        }
        this.props.addMarker('mincut', clickPoint, '', this.props.map.projection);
    };
    acceptMincut = (mincutState = this.state.mincutState, closeDlg = true) => {
        console.log(this.state.mincutValues);
        const ignoreWidgets = ['chk_use_planified', 'txt_infolog'];
        // eslint-disable-next-line
        const fields = Object.entries(this.state.mincutValues).reduce((acc, [key, value]) => {
            let v = value.columnname === 'mincut_state' ? mincutState : value.value;
            if (ignoreWidgets.includes(value.columnname)) v = null;
            if (!(v === null || v === undefined)) {
                acc[value.columnname] = v;
            }
            return acc;
        }, {});
        const requestUrl = GwUtils.getServiceUrl("mincut");
        if (!isEmpty(requestUrl)) {
            const clickPoint = this.ogClickPoint || [null, null];
            const epsg = GwUtils.crsStrToInt(this.props.map.projection);
            const zoomRatio = MapUtils.computeForZoom(this.props.map.scales, this.props.map.zoom);
            const params = {
                theme: this.props.currentTheme.title,
                epsg: epsg,
                xcoord: clickPoint[0],
                ycoord: clickPoint[1],
                zoomRatio: zoomRatio,
                action: this.props.action,
                mincutId: this.state.mincutId || this.props.mincutId,
                usePsectors: this.state.mincutValues.chk_use_planified?.value,
                fields: fields
            };

            this.props.processStarted("mincut_msg", "Aceptar mincut");
            axios.post(requestUrl + "accept", { ...params }).then((response) => {
                const result = response.data;
                // let newState = {};
                let newWidgetsProperties = {};
                const log = result.body?.data?.info?.values;
                if (log) {
                    const messages = log.sort((a, b) => a.id - b.id) // sort by id
                        .map(value => value.message)
                        .join("\n");
                    newWidgetsProperties = { txt_infolog: { value: messages } };
                    // newState = { ...newState, widgetsProperties: { ...this.state.widgetsProperties, txt_infolog: { ...this.state.widgetsProperties.txt_infolog, value: messages } } };
                    // console.log("Mincut state??", newState);
                }
                // show message
                this.props.processFinished("mincut_msg", true, "Mincut guardado correctamente.");
                // refresh map
                this.props.refreshLayer(layer => layer.role === LayerRole.THEME);
                
                this.setState((prevState) => ({
                    ...prevState,
                    widgetsProperties: { ...prevState.widgetsProperties, ...newWidgetsProperties },
                    mincutState: mincutState,
                }))
                this.setDisabledWidgets(mincutState);
                
                // if (mincutState !== this.state.mincutState) newState = { ...newState, mincutState: state };
                // if (newState) this.setState(newState);
                if (closeDlg) {
                    this.onToolClose();
                }
            }).catch((e) => {
                console.log(e);
                this.props.processFinished("mincut_msg", false, "No se ha podido guardar el mincut...");
            });
        }
    };
    cancelMincut = () => {
        const requestUrl = GwUtils.getServiceUrl("mincut");
        if (!isEmpty(requestUrl)) {
            const params = {
                theme: this.props.currentTheme.title,
                mincutId: this.state.mincutId
            };

            this.props.processStarted("mincut_msg", "Cancelar mincut");
            axios.get(requestUrl + "cancel", { params: params }).then(() => {
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
            });
        }
    };
    // #endregion
    render() {
        let resultWindow = null;
        const messageMap = {
            mincutNetwork: LocaleUtils.tr("mincut.clickhelpNetwork"),
            mincutValveUnaccess: LocaleUtils.tr("mincut.clickhelpValveUnaccess"),
            changeValveStatus: LocaleUtils.tr("mincut.clickhelpChangeValveStatus")
        };
        const taskBarMessage = messageMap[this.state.action] || LocaleUtils.tr("mincut.clickhelpNetwork");
        const taskBar = (
            <TaskBar key="GwMincutTaskBar" onHide={this.onToolClose} onShow={this.onShow} task="GwMincut">
                {() => ({
                    body: taskBarMessage
                })}
            </TaskBar>
        );
        if (!this.props.mincutResult) {
            return [this.state.clickEnabled ? taskBar : null];
        }
        const result = this.props.mincutResult;
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
                } else if (result.status === "Failed") {
                    body = null;
                    this.props.processStarted("mincut_msg", "GwMincut Error!");
                    this.props.processFinished("mincut_msg", false, "DB error:" + (result.SQLERR || result.message || "Check logs"));
                } else {
                    body = (
                        <div className="mincut-body" role="body">
                            <GwQtDesignerForm activetabs={this.state.activetabs} autoResetTab={false} loadFormUi={this.loadFormUi}
                                onWidgetAction={this.onWidgetAction} form_xml={result.form_xml} onTabChanged={this.onTabChanged} useNew
                                onWidgetValueChange={this.onWidgetValueChange} widgetsProperties={this.state.widgetsProperties}
                            />
                        </div>
                    );
                    // taskBar = null;
                }
            }
            resultWindow = (
                <ResizeableWindow dockable={this.props.dockable} icon="giswater" initialHeight={this.props.initialHeight}
                    initialWidth={this.props.initialWidth} initialX={this.props.initialX}
                    initialY={this.props.initialY} initiallyDocked={this.props.initiallyDocked} key="GwMincutWindow"
                    minimizeable={true}
                    onClose={this.onDlgClose} scrollable title="Giswater Mincut"
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
    currentTheme: state.theme.current,
    mincutResult: state.mincut.mincutResult,
    mincutId: state.mincut.mincutId,
    keepManagerOpen: state.mincut.keepManagerOpen
});

export default connect(selector, {
    addLayerFeatures: addLayerFeatures,
    addMarker: addMarker,
    panTo: panTo,
    removeMarker: removeMarker,
    removeLayer: removeLayer,
    refreshLayer: refreshLayer,
    processFinished: processFinished,
    processStarted: processStarted,
    setCurrentTask: setCurrentTask,
    changeLayerProperty: changeLayerProperty,
    setActiveMincut: setActiveMincut
})(GwMincut);
