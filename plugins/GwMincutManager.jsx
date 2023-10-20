/**
 * Copyright © 2023 by BGEO. All rights reserved.
 * The program is free software: you can redistribute it and/or modify it under the terms of the GNU
 * General Public License as published by the Free Software Foundation, either version 3 of the License,
 * or (at your option) any later version
 */

import axios from 'axios';
import React from 'react';
import PropTypes from 'prop-types';
import { connect } from 'react-redux';
import isEmpty from 'lodash.isempty';
import { LayerRole, addMarker, removeMarker, removeLayer, addLayerFeatures, refreshLayer } from 'qwc2/actions/layers';
import { changeSelectionState } from 'qwc2/actions/selection';
import ResizeableWindow from 'qwc2/components/ResizeableWindow';
import Spinner from 'qwc2/components/Spinner';
import IdentifyUtils from 'qwc2/utils/IdentifyUtils';
import LocaleUtils from 'qwc2/utils/LocaleUtils';
import { panTo, zoomToExtent } from 'qwc2/actions/map';
import { setCurrentTask } from 'qwc2/actions/task';
import { processFinished, processStarted } from 'qwc2/actions/processNotifications';

import GwQtDesignerForm from '../components/GwQtDesignerForm';
import GwUtils from '../utils/GwUtils';

import {setActiveMincut} from '../actions/mincut';
import {setActiveSelector} from '../actions/selector';

class GwMincutManager extends React.Component {
    static propTypes = {
        addMarker: PropTypes.func,
        changeSelectionState: PropTypes.func,
        click: PropTypes.object,
        currentIdentifyTool: PropTypes.string,
        currentTask: PropTypes.string,
        currentTheme: PropTypes.object,
        getInitialValues: PropTypes.bool,
        initialHeight: PropTypes.number,
        initialWidth: PropTypes.number,
        initialX: PropTypes.number,
        initialY: PropTypes.number,
        initiallyDocked: PropTypes.bool,
        keepManagerOpen: PropTypes.bool,
        layers: PropTypes.array,
        map: PropTypes.object,
        processFinished: PropTypes.func,
        processStarted: PropTypes.func,
        refreshLayer: PropTypes.func,
        removeLayer: PropTypes.func,
        removeMarker: PropTypes.func,
        selection: PropTypes.object,
        setActiveMincut: PropTypes.func,
        setActiveSelector: PropTypes.func,
        setCurrentTask: PropTypes.func,
        zoomToExtent: PropTypes.func
    };
    static defaultProps = {
        initialWidth: 800,
        initialHeight: 500,
        initialX: 0,
        initialY: 0,
        initiallyDocked: false,
        keepManagerOpen: true
    };
    state = {
        action: 'mincutNetwork',
        mincutmanagerState: 0,
        mincutmanagerResult: null,
        prevmincutmanagerResult: null,
        pendingRequests: false,
        currentTab: {},
        feature_id: null,
        filters: {},
        widgetValues: {},
        mincutResult: null,
        selectorResult: null,
        mincutId: null
    };
    componentDidUpdate(prevProps, prevState) {
        if (this.props.currentTask !== prevProps.currentTask && prevProps.currentTask === "GwMincutManager") {
            this.onToolClose();
        }
        if (!this.state.mincutmanagerResult && this.props.currentTask === "GwMincutManager" && this.props.currentTask !== prevProps.currentTask) {
            this.openMincutManager();
        }

        if (this.state.mincutmanagerResult && this.state.filters !== prevState.filters) {
            this.getList(this.state.mincutmanagerResult);
        }

    }

    openMincutManager = (updateState = true) => {
        const requestUrl = GwUtils.getServiceUrl("mincut");
        if (!isEmpty(requestUrl)) {
            const params = {
                theme: this.props.currentTheme.title
            };

            axios.get(requestUrl + "getmincutmanager", { params: params }).then(response => {
                const result = response.data;
                this.getList(result);
                if (updateState) this.setState({ mincutmanagerResult: result, prevmincutmanagerResult: null, pendingRequests: false });
            }).catch((e) => {
                console.log(e);
                if (updateState) this.setState({ pendingRequests: false });
            });
        }
    };

    onToolClose = () => {
        this.props.setCurrentTask(null);
        this.setState({ mincutmanagerResult: null, pendingRequests: false, filters: {}, mincutResult: null, selectorResult: null, widgetValues: {}, mincutId: null});
    };


    updateField = (widget, value) => {
        // Get filterSign
        let filterSign = "=";
        let widgetcontrols = {};
        let filtervalue = value;
        if (widget.property.widgetcontrols !== "null") {
            widgetcontrols = JSON.parse(widget.property.widgetcontrols);
            if (widgetcontrols.filterSign !== undefined) {
                filterSign = JSON.parse(widget.property.widgetcontrols.replace("$gt", ">").replace("$lt", "<")).filterSign;
            }
        }
        let columnname = widget.name;
        if (widget.property.widgetfunction !== "null") {
            columnname = JSON.parse(widget.property.widgetfunction)?.parameters?.columnfind;
        }
        columnname = columnname ?? widget.name;
        // Update filters
        if (widget.name === "spm_next_days") {
            this.setState((state) => ({ filters: { ...state.filters } }));
        } else if (widget.class === "QComboBox") {
            if (widgetcontrols.getIndex !== undefined && widgetcontrols.getIndex === false) {
                for (const key in widget.item) {
                    if (widget.item[key].property.value === value) {
                        filtervalue = widget.item[key].property.text;
                    }
                }
            }
        }
        this.setState((state) => ({ widgetValues: { ...state.widgetValues, [widget.name]: { value: value }},
            filters: { ...state.filters, [columnname]: { value: filtervalue, filterSign: filterSign } } }));

    };

    getList = (mincutManagerResult) => {
        try {
            const requestUrl = GwUtils.getServiceUrl("util");
            // TODO: Change to use GwUtils.forEachWidgetInForm
            const widgets = mincutManagerResult.body.data.fields;
            let tableWidget = null;
            widgets.forEach(widget => {
                if (widget.widgettype === "tablewidget") {
                    tableWidget = widget;
                }
            });

            const params = {
                theme: this.props.currentTheme.title,
                tabName: tableWidget.tabname,
                widgetname: tableWidget.columnname,
                tableName: tableWidget.linkedobject,
                filterFields: {}
            };

            axios.get(requestUrl + "getlist", { params: params }).then((response) => {
                const result = response.data;
                this.setState((state) => ({ widgetValues: {...state.widgetValues, [tableWidget.columnname]: result} }));
            }).catch((e) => {
                console.log(e);
                // this.setState({  });
            });
        } catch (error) {
            console.warn(error);
        }
    };

    dispatchButton = (action) => {
        const functionName = action.widgetfunction.functionName;
        switch (functionName) {
        case "selector":
            this.selectorMincut(action.row);
            break;
        case "open":
            this.openMincut(action.row[0].original.id);
            this.props.refreshLayer(layer => layer.role === LayerRole.THEME);
            if (!this.props.keepManagerOpen) {
                this.setState({ mincutmanagerResult: null });
            }
            break;
        case "cancel":
            action.row.map((row) => {
                this.cancelMincut(row.original.id);
            });
            this.setState( { filters: {mincutId: action.row[0].original.id, action: "cancel"} } );
            break;
        case "delete": {
            const ids = [];
            action.row.map((row) => {
                ids.push(row.original.id);
            });
            // eslint-disable-next-line
            if (!confirm(`Are you sure you want to delete these mincuts ${ids.toString()}`)) {
                break;
            }
            action.row.map((row) => {
                this.deleteMincut(row.original.id);
            });
            action.removeSelectedRow();
            this.setState( { filters: {mincutId: action.row[0].original.id, action: "delete"} } );
            break;
        }
        case "mincutClose":
            this.setState({ mincutResult: null });
            if (!this.props.keepManagerOpen) {
                this.onToolClose();
            }
            break;
        case "selectorClose":
            this.setState({ selectorResult: null });
            break;
        default:
            console.warn(`Action \`${functionName}\` cannot be handled.`);
            break;
        }
    };

    selectorMincut = (rows) => {
        if (rows.length === 0) {
            console.log("No rows");
        } else {
            const ids = (rows.map((row) => row.original.id)).join(",");
            try {
                const requestUrl = GwUtils.getServiceUrl("selector");
                if (!isEmpty(requestUrl)) {
                    // Get request paramas
                    const epsg = GwUtils.crsStrToInt(this.props.map.projection);
                    const params = {
                        theme: this.props.currentTheme.title,
                        epsg: epsg,
                        currentTab: "tab_mincut",
                        selectorType: "selector_mincut",
                        // "layers": String(layer.queryLayers),
                        // "loadProject": false,
                        ids: ids
                    };
                    // Send request
                    axios.get(requestUrl + "get", { params: params }).then(response => {
                        const result = response.data;
                        this.props.setActiveSelector(result, ids, this.props.keepManagerOpen);
                        // this.setState({ selectorResult: result, pendingRequests: false });
                        // this.filterLayers(result);
                    }).catch((e) => {
                        console.log(e);
                        this.setState({ pendingRequests: false });
                    });
                }
            } catch (error) {
                console.error(error);
            }
        }
    };

    getQueryableLayers = () => {
        if ((typeof this.props.layers === 'undefined' || this.props.layers === null) || (typeof this.props.map === 'undefined' || this.props.map === null)) {
            return [];
        }

        return IdentifyUtils.getQueryLayers(this.props.layers, this.props.map).filter(l => {
            // TODO: If there are some wms external layers this would select more than one layer
            return l.type === "wms";
        });
    };

    openMincut = (mincutId) => {
        try {
            const requestUrl = GwUtils.getServiceUrl("mincut");

            const params = {
                theme: this.props.currentTheme.title,
                mincutId: mincutId
            };
            axios.get(requestUrl + "open", { params: params }).then((response) => {
                const result = response.data;
                this.props.setActiveMincut(result, mincutId, this.props.keepManagerOpen);
                this.addMincutLayers(result);
                // this.setState( { mincutResult: result, mincutId: mincutId } );
            }).catch((e) => {
                console.log(e);
            });
        } catch (error) {
            console.warn(error);
        }
    };

    removeTempLayers = () => {
        this.props.removeLayer("temp_points.geojson");
        this.props.removeLayer("temp_lines.geojson");
        this.props.removeLayer("temp_polygons.geojson");
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
        this.panToResult(result);
    };

    panToResult = (result) => {
        if (!isEmpty(result) && result.body?.data?.geometry) {
            const x1 = result.body.data.geometry.x1;
            const y1 = result.body.data.geometry.y1;
            const x2 = result.body.data.geometry.x2;
            const y2 = result.body.data.geometry.y2;
            console.log("Zoom to:", x1, y1, x2, y2);
            const extent = [x1, y1, x2, y2];
            if (extent.includes(undefined)) {
                return;
            }
            this.props.zoomToExtent(extent, this.props.map.projection);
        }
    };

    cancelMincut = (mincutId) => {
        try {
            const requestUrl = GwUtils.getServiceUrl("mincut");

            const params = {
                theme: this.props.currentTheme.title,
                mincutId: mincutId
            };
            axios.post(requestUrl + "cancel", { ...params }).catch((e) => {
                console.warn(e);
            });
        } catch (error) {
            console.warn(error);
        }
    };

    deleteMincut = (mincutId) => {
        try {
            const requestUrl = GwUtils.getServiceUrl("mincut");

            const params = {
                theme: this.props.currentTheme.title,
                mincutId: mincutId
            };
            axios.delete(requestUrl + "delete", { params }).catch((e) => {
                console.warn(e);
            });
        } catch (error) {
            console.warn(error);
        }
    };

    render() {
        let resultWindow = null;
        // const bodyMincut = null;
        // const bodySelector = null;
        if (this.state.pendingRequests === true || this.state.mincutmanagerResult !== null) {
            let body = null;

            if (isEmpty(this.state.mincutmanagerResult)) {
                if (this.state.pendingRequests === true) {
                    body = (<div className="mincutmanager-body" role="body"><Spinner /><span className="mincutmanager-body-message">{LocaleUtils.tr("identify.querying")}</span></div>);
                } else {
                    body = (<div className="mincutmanager-body" role="body"><span className="mincutmanager-body-message">{LocaleUtils.tr("identify.noresults")}</span></div>);
                }
            } else {
                const result = this.state.mincutmanagerResult;
                if (result.schema === null) {
                    body = null;
                    this.props.processStarted("mincutmanager_msg", "GwMincutManager Error!");
                    this.props.processFinished("mincutmanager_msg", false, "Couldn't find schema, please check service config.");
                } else if (result.status === "Failed") {
                    body = null;
                    this.props.processStarted("mincutmanager_msg", "GwMincutManager Error!");
                    this.props.processFinished("mincutmanager_msg", false, "DB error:" + (result.SQLERR || result.message || "Check logs"));
                } else {
                    body = (
                        <div className="manager-body" role="body">
                            <GwQtDesignerForm dispatchButton={this.dispatchButton} form_xml={result.form_xml}
                                getInitialValues={false}
                                readOnly={false} theme={this.props.currentTheme.title}
                                updateField={this.updateField} widgetValues={this.state.widgetValues}
                            />
                        </div>
                    );
                }
            }
            resultWindow = (
                <ResizeableWindow dockable="bottom" icon="giswater" initialHeight={600} initialWidth= {900}
                    initialX={this.props.initialX} initialY={this.props.initialY}
                    initiallyDocked={this.props.initiallyDocked} key="GwMincutManagerWindow" minimizeable={true}
                    onClose={this.onToolClose}
                    scrollable title="Giswater Mincut Manager"
                >
                    {body}
                </ResizeableWindow>
            );

        }
        /*
        if (this.state.mincutResult) {
            bodyMincut = (
                <GwMincut dispatchButton={this.dispatchButton} key="MincutFromManager" mincutId={this.state.mincutId} mincutResult={this.state.mincutResult}/>
            );
        }
        if (this.state.selectorResult) {
            bodySelector = (
                <GwSelector dispatchButton={this.dispatchButton} key="SelectorFromManager" selectorResult={this.state.selectorResult}/>
            );
        }

        if (bodyMincut) {
            return [resultWindow, bodyMincut];
        }
        if (bodySelector) {
            return [resultWindow, bodySelector];
        }*/
        return [resultWindow];
    }
}

const selector = (state) => ({
    click: state.map.click || { modifiers: {} },
    currentTask: state.task.id,
    currentIdentifyTool: state.identify.tool,
    layers: state.layers.flat,
    map: state.map,
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
    setActiveMincut: setActiveMincut,
    setActiveSelector: setActiveSelector,
    zoomToExtent:zoomToExtent 
})(GwMincutManager);
