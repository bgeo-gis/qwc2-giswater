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
import isEmpty from 'lodash.isempty';
import { LayerRole, addMarker, removeMarker, removeLayer, addLayerFeatures, refreshLayer, changeLayerProperty } from 'qwc2/actions/layers';
import ResizeableWindow from 'qwc2/components/ResizeableWindow';
import TaskBar from 'qwc2/components/TaskBar';
import LocaleUtils from 'qwc2/utils/LocaleUtils';
import MapUtils from 'qwc2/utils/MapUtils';
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
        currentTask: PropTypes.object,
        currentTheme: PropTypes.object,
        dockable: PropTypes.oneOfType([PropTypes.bool, PropTypes.string]),
        initialHeight: PropTypes.number,
        initialWidth: PropTypes.number,
        initialX: PropTypes.number,
        initialY: PropTypes.number,
        initiallyDocked: PropTypes.bool,
        keepManagerOpen: PropTypes.bool,
        layers: PropTypes.array,
        map: PropTypes.object,
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
        mincutResult: null
    };

    state = {
        currentTab: {},
        mincutValues: {},
        activetabs: {},
        widgetsProperties: {},
        clickMode: "mincutNetwork"
    };

    ogClickData = null;
    formUi = null;

    componentDidUpdate(prevProps) {

        if (this.props.currentTask.id === "GwMincut" && this.props.currentTask.mode !== prevProps.currentTask.mode) {
            this.onShow(this.props.currentTask.mode);
        }

        if (this.props.mincutResult !== prevProps.mincutResult) {
            console.log("Mincut result changed", this.props.mincutResult);

            let messages = null;
            if (this.props.mincutResult) {
                this.manageLayers(this.props.mincutResult);
                const log = this.props.mincutResult.body?.data?.info?.values;
                if (log) {
                    messages = log.sort((a, b) => a.id - b.id) // sort by id
                        .map(value => value.message)
                        .join("\n");
                }
            }
            // Clear all widgets and set the log
            this.setState({
                mincutValues: {},
                widgetsProperties: {
                    // chk_use_planified: state.widgetsProperties.chk_use_planified,
                    txt_infolog: { value: messages }
                }
            }, () => {
                // If the xml is the same, GwQtDesignerForm won't reload the form and `loadFormUi` won't be called
                if (this.props.mincutResult && this.props.mincutResult.form_xml === prevProps.mincutResult?.form_xml) {
                    this.setDisabledWidgets(this.props.mincutResult.body.data.mincutState);
                }
            });
        }

        if (this.state.clickMode !== null && this.props.currentTask.id === "GwMincut") {
            this.identifyPoint(prevProps);
        }
    }

    // #region UTILS
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
            let tableWidget = null;
            GwUtils.forEachWidgetInLayout(tab.layout, (widget) => {
                if (widget.class === "QTableView" || widget.class === 'QTableWidget') {
                    tableWidget = widget; // There should only be one
                }
            });

            if (isEmpty(tableWidget)) {
                return;
            }

            const params = {
                theme: this.props.theme.title,
                tableName: tableWidget.property.linkedobject,
                tabName: tab.name,  // tab.name, no? o widget.name?
                idName: "result_id",
                id: this.props.mincutResult.body.data.mincutId
            };
            const requestUrl = GwUtils.getServiceUrl("util");
            axios.get(requestUrl + "getlist", { params: params }).then((response) => {
                const result = response.data;
                this.setState((state) => ({ widgetsProperties: { ...state.widgetsProperties, [tableWidget.name]: {
                    value: GwUtils.getListToValue(result)
                } } }));
            }).catch((e) => {
                console.warn(e);
            });
        } catch (error) {
            console.error(error);
        }
    };
    manageLayers = (result) => {
        const success = this.setOMLayersVisibility(result?.body?.data?.mincutLayer, true);
        if (success) {
            this.props.refreshLayer(layer => layer.role === LayerRole.THEME);
        } else {
            this.addMincutLayers(result);
        }
    };
    addMincutLayers = (result) => {
        this.removeTempLayers();

        if (!result?.body?.data?.mincutArc) {
            return;
        }

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

            switch (this.state.clickMode) {

            case 'mincutNetwork': {
                this.props.addMarker('mincut', clickPoint, '', this.props.map.projection);
                const zoomRatio = MapUtils.computeForZoom(this.props.map.scales, this.props.map.zoom);

                this.setMincut({
                    action: 'mincutNetwork',
                    xcoord: clickPoint[0],
                    ycoord: clickPoint[1],
                    zoomRatio: zoomRatio,
                    epsg: GwUtils.crsStrToInt(this.props.map.projection)
                }).then((result) => {
                    this.ogClickData = {
                        point: clickPoint,
                        zoomRatio: zoomRatio
                    };
                    this.setState({ clickMode: null });
                });
                break;
            }
            case 'changeValveStatus':
                this.changeValveStatus(clickPoint);
                break;

            case 'mincutValveUnaccess':
                this.setMincut({
                    action: 'mincutValveUnaccess',
                    xcoord: clickPoint[0],
                    ycoord: clickPoint[1],
                    zoomRatio: MapUtils.computeForZoom(this.props.map.scales, this.props.map.zoom),
                    epsg: GwUtils.crsStrToInt(this.props.map.projection),
                    mincutId: this.props.mincutResult.body.data.mincutId
                });
                break;
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
        // This is called when the form is loaded
        this.formUi = formUi;
        console.log("Form UI loaded", formUi, this.props.mincutResult);
        this.setDisabledWidgets(this.props.mincutResult.body.data.mincutState);
    };

    onWidgetValueChange = (widget, value) => {
        this.setState((state) => ({
            mincutValues: { ...state.mincutValues, [widget.name]: value },
            widgetsProperties: { ...state.widgetsProperties, [widget.name]: { value: value } }
        }));
    };
    onWidgetAction = (action) => {
        console.log("Action", action);

        const mincutState = this.props.mincutResult.body.data.mincutState;

        switch (action.functionName) {
        case "accept":
        case "apply": {
            let confirmed = true;
            if (mincutState !== MincutState.OnPlaning && this.checkIfDataModified()) {
                confirmed = confirm("Do you want to save the changes?");
            }

            if (confirmed) {
                this.setMincutFields().then(() => {
                    if (action.functionName === "accept") {
                        this.onToolClose();
                    }
                });
            }
            break;
        }
        case "cancel":
            this.onDlgClose();
            break;

        case "real_start":
            if (confirm("Do you want to start the mincut?")) {
                this.setMincutFields().then(() => {
                    this.setMincut({
                        action: "startMincut",
                        mincutId: this.props.mincutResult.body.data.mincutId
                    });
                });
            }
            break;

        case "real_end":
            if (confirm("Do you want to end the mincut?")) {
                this.setMincutFields().then(() => {
                    this.setMincut({
                        action: "endMincut",
                        mincutId: this.props.mincutResult.body.data.mincutId,
                        usePsectors: false
                    });
                });
                this.showTab('tab_log');
            }
            break;

        case "custom_mincut":
            this.props.setCurrentTask("GwMincut", "ValveUnaccess");
            break;

        case "change_valve_status":
            this.props.setCurrentTask("GwMincut", "ChangeValveStatus");
            break;

        case "refresh_mincut":
            this.setMincut({
                action: 'mincutNetwork',
                mincutId: this.props.mincutResult.body.data.mincutId,
                xcoord: this.ogClickData.point[0],
                ycoord: this.ogClickData.point[1],
                zoomRatio: this.ogClickData.zoomRatio
            });
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
            ValveUnaccess: 'mincutValveUnaccess',
            ChangeValveStatus: 'changeValveStatus'
        };
        const action = actionMap[mode] || null;
        console.log("Setting action", action, mode);
        this.setState({ clickMode: action });
    };
    setDisabledWidgets = (mincutState) => {
        let tabPlanEnabled = true;
        const lytExecWidgets = GwUtils.getWidgetsInLayout("lyt_exec_1", this.formUi).map(widget => widget.name);
        let lytExecEnabled = true;
        let btnStartEnabled = true;
        let btnEndEnabled = true;
        let workOrderEnabled = true;
        let toolbarEnabled = true;
        console.log("Setting disabled widgets", mincutState, lytExecWidgets);

        switch (mincutState) {
        case MincutState.OnPlaning:
        case MincutState.Planified:
            lytExecEnabled = false;
            btnEndEnabled = false;
            break;

        case MincutState.InProgress:
            tabPlanEnabled = false;
            btnStartEnabled = false;
            workOrderEnabled = false;
            toolbarEnabled = false;
            break;

        case MincutState.Finished:
        case MincutState.Canceled:
            lytExecEnabled = false;
            btnStartEnabled = false;
            btnEndEnabled = false;
            tabPlanEnabled = false;
            workOrderEnabled = false;
            toolbarEnabled = false;
            break;
        default:
            console.warn("Unknown mincut state", mincutState);
        }

        this.setState((state) => ({
            widgetsProperties: {
                ...state.widgetsProperties,

                tab_plan: { disabled: !tabPlanEnabled },
                work_order: { disabled: !workOrderEnabled },

                btn_valve_status: { disabled: !toolbarEnabled },
                btn_custom_mincut: { disabled: !toolbarEnabled },
                btn_refresh_mincut: { disabled: !toolbarEnabled },

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
        console.log("Closing mincut tool");
        this.props.removeMarker('mincut');
        this.props.removeLayer("mincutselection");
        this.props.setActiveMincut(null, null);
        if (!this.props.keepManagerOpen) {
            this.props.setCurrentTask(null);
        }
        this.ogClickData = null;
        this.setState({
            widgetsProperties: {},
            mincutValues: {},
            clickMode: "mincutNetwork"
        });
    };
    onDlgClose = () => {
        if (this.props.mincutResult.body.data.mincutState === MincutState.OnPlaning) {
            if (confirm("Do you want to delete the mincut?")) {
                this.cancelMincut();
            }
        } else {
            let confirmed = true;
            if (this.checkIfDataModified()) {
                confirmed = confirm("Do you want to discard the changes?");
            }
            if (confirmed) {
                this.onToolClose();
            }
        }
    };
    // #endregion
    // #region MINCUT
    setMincut = (params) => {
        this.props.processStarted("mincut_msg", "Setting mincut");
        const requestUrl = GwUtils.getServiceUrl("mincut");
        params = {
            theme: this.props.currentTheme.title,
            epsg: GwUtils.crsStrToInt(this.props.map.projection),
            ...params
        };
        console.log("Setting mincut", params);
        return axios.get(requestUrl + "setmincut", { params: params }).then((response) => {
            const result = response.data;
            this.props.setActiveMincut(result, this.props.keepManagerOpen);
            this.props.processFinished("mincut_msg", true, "Mincut set successfully.");
            return result;
        }).catch((e) => {
            console.warn(e);
            this.props.processFinished("mincut_msg", false, e.message || "Error setting mincut");
        });
    };

    changeValveStatus = (clickPoint) => {
        this.props.removeLayer("mincutselection");
        this.props.processStarted("mincut_msg", "Change valve status");

        const mincutId = this.props.mincutResult.body.data.mincutId;
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

        const requestUrl = GwUtils.getServiceUrl("mincut");
        axios.get(requestUrl + "changevalvestatus", { params: params }).then(response => {
            this.props.processFinished("mincut_msg", true, "Valve status changed");
            const result = response.data;

            if (result.status === 'Failed'){
                this.props.processFinished("mincut_msg", false, "Error changing valve status: " + result?.NOSQLERR || "unknown error", true);
                return;
            }
             // Refresh mincut after changing valve status
            this.setMincut({
                action: 'mincutNetwork',
                mincutId: this.props.mincutResult.body.data.mincutId,
                xcoord: this.ogClickData.point[0],
                ycoord: this.ogClickData.point[1],
                zoomRatio: this.ogClickData.zoomRatio
            });

        }).catch((e) => {
            this.props.processFinished("mincut_msg", false, "Error changing valve status");
            console.log(e);
        });
    };

    checkIfDataModified = () => {
        return !isEmpty(this.state.mincutValues);
    };

    setMincutFields = () => {
        if (!this.checkIfDataModified() && this.props.mincutResult.body.data.mincutState !== MincutState.OnPlaning) {
            return Promise.resolve();
        }

        const requestUrl = GwUtils.getServiceUrl("mincut");
        const epsg = GwUtils.crsStrToInt(this.props.map.projection);
        const params = {
            theme: this.props.currentTheme.title,
            epsg: epsg,
            mincutId: this.props.mincutResult.body.data.mincutId,
            usePsectors: false,
            // usePsectors: this.state.widgetsProperties.chk_use_planified?.value ?? false,
            fields: this.state.mincutValues
        };

        console.log("Accepting mincut", params);

        this.props.processStarted("mincut_msg", "Aceptar mincut");
        return axios.post(requestUrl + "accept", { ...params }).then((response) => {
            const result = response.data;
            this.props.setActiveMincut(result, this.props.keepManagerOpen);
            this.props.processFinished("mincut_msg", true, "Mincut guardado correctamente.");
        }).catch((e) => {
            console.log(e);
            this.props.processFinished("mincut_msg", false, "No se ha podido guardar el mincut...");
        });
    };
    cancelMincut = () => {
        this.props.processStarted("mincut_msg", "Cancelar mincut");

        const params = {
            theme: this.props.currentTheme.title,
            mincutId: this.props.mincutResult.body.data.mincutId
        };

        const requestUrl = GwUtils.getServiceUrl("mincut");
        return axios.get(requestUrl + "cancel", { params: params }).then(() => {
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
    };

    // #endregion
    render() {
        let resultWindow = null;
        const messageMap = {
            mincutNetwork: LocaleUtils.tr("mincut.clickhelpNetwork"),
            mincutValveUnaccess: LocaleUtils.tr("mincut.clickhelpValveUnaccess"),
            changeValveStatus: LocaleUtils.tr("mincut.clickhelpChangeValveStatus")
        };
        const taskBarMessage = messageMap[this.state.clickMode] || LocaleUtils.tr("mincut.clickhelpNetwork");
        const taskBar = (
            <TaskBar key="GwMincutTaskBar" onShow={this.onShow} task="GwMincut">
                {() => ({
                    body: taskBarMessage
                })}
            </TaskBar>
        );
        if (!this.props.mincutResult) {
            return [this.state.clickMode !== null ? taskBar : null];
        }
        const result = this.props.mincutResult;
        if (result !== null) {
            let body = null;
            if (isEmpty(result)) {
                body = (<div className="mincut-body" role="body"><span className="mincut-body-message">{LocaleUtils.tr("identify.noresults")}</span></div>);
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
                            <GwQtDesignerForm activetabs={this.state.activetabs} autoResetTab={false} form_xml={result.form_xml}
                                getInitialValues={false} loadFormUi={this.loadFormUi} onTabChanged={this.onTabChanged} onWidgetAction={this.onWidgetAction}
                                onWidgetValueChange={this.onWidgetValueChange} useNew
                                widgetsProperties={this.state.widgetsProperties}
                            />
                        </div>
                    );
                    // taskBar = null;
                }
            }
            resultWindow = (
                <ResizeableWindow dockable={this.props.dockable} icon="giswater" initialHeight={this.props.initialHeight}
                    initialWidth={this.props.initialWidth} initialX={this.props.initialX} initialY={this.props.initialY}
                    initiallyDocked={this.props.initiallyDocked} key="GwMincutWindow" minimizeable
                    onClose={this.onDlgClose} scrollable title="Giswater Mincut" splitScreenWhenDocked
                    splitTopAndBottomBar
                >
                    {body}
                </ResizeableWindow>
            );
        }
        return [resultWindow, (this.state.clickMode === null ? null : taskBar)];
    }
}

const selector = (state) => ({
    click: state.map.click || { modifiers: {} },
    currentTask: state.task,
    layers: state.layers.flat,
    map: state.map,
    theme: state.theme.current,
    selection: state.selection,
    currentTheme: state.theme.current,
    mincutResult: state.mincut.mincutResult,
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
