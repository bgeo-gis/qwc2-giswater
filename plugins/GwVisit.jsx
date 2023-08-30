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
import { LayerRole, addMarker, removeMarker, removeLayer, addLayerFeatures } from 'qwc2/actions/layers';
import { changeSelectionState } from 'qwc2/actions/selection';
import ResizeableWindow from 'qwc2/components/ResizeableWindow';
import TaskBar from 'qwc2/components/TaskBar';
import IdentifyUtils from 'qwc2/utils/IdentifyUtils';
import LocaleUtils from 'qwc2/utils/LocaleUtils';
import MapUtils from 'qwc2/utils/MapUtils';
import VectorLayerUtils from 'qwc2/utils/VectorLayerUtils';
import { panTo } from 'qwc2/actions/map';
import { processFinished, processStarted } from 'qwc2/actions/processNotifications';

import GwQtDesignerForm from '../components/GwQtDesignerForm';
import GwUtils from '../utils/GwUtils';


class GwVisit extends React.Component {
    static propTypes = {
        addLayerFeatures: PropTypes.func,
        addMarker: PropTypes.func,
        changeSelectionState: PropTypes.func,
        click: PropTypes.object,
        currentIdentifyTool: PropTypes.string,
        currentTask: PropTypes.string,
        dispatchButton: PropTypes.func,
        dockable: PropTypes.oneOfType([PropTypes.bool, PropTypes.string]),
        initialHeight: PropTypes.number,
        initialWidth: PropTypes.number,
        initialX: PropTypes.number,
        initialY: PropTypes.number,
        initiallyDocked: PropTypes.bool,
        layers: PropTypes.array,
        map: PropTypes.object,
        processFinished: PropTypes.func,
        processStarted: PropTypes.func,
        removeLayer: PropTypes.func,
        removeMarker: PropTypes.func,
        selection: PropTypes.object,
        theme: PropTypes.object,
        visitResult: PropTypes.object
    };
    static defaultProps = {
        replaceImageUrls: true,
        initialWidth: 480,
        initialHeight: 575,
        initialX: 0,
        initialY: 0,
        initiallyDocked: false,
        visitResult: null,
        dockable: true

    };
    state = {
        visitResult: null,
        pendingRequests: false,
        widgetValues: {},
        mode: 'Visit',
        coords: [null, null],
        identifyResult: null,
        prevIdentifyResult: null,
        theme: null,
        currentTab: {},
        feature_id: null,
        showGraph: false,
        graphJson: null,
        showVisit: false,
        visitJson: null,
        visitWidgetValues: {},
        tableValues: {},
        files: []
    };
    constructor(props) {
        super(props);
        if (props.visitResult) {
            this.state.visitResult = props.visitResult;
        }
    }
    componentDidUpdate(prevProps) {
        if (this.props.currentIdentifyTool !== prevProps.currentIdentifyTool && prevProps.currentIdentifyTool === "GwVisit") {
            this.clearResults();
        }
        if (this.props.currentTask === "GwVisit" || this.props.currentIdentifyTool === "GwVisit") {
            this.identifyPoint(prevProps);
        }
    }
    crsStrToInt = (crs) => {
        const parts = crs.split(':');
        return parseInt(parts.slice(-1), 10);
    };
    dispatchButton = (action, widget) => {
        const requestUrl = GwUtils.getServiceUrl("visit");
        switch (action.functionName) {
        case 'upload_file':
            this.setState((state) => {
                const files = state.files;
                if (action.file instanceof FileList) {
                    for (let i = 0; i < action.file.length; i++) {
                        files.push(action.file[i]);
                    }
                } else {
                    files.push(action.file);
                }
                return {files: files};
            });
            break;
        case 'set_visit': {
            const ignoreWidgets = ['txt_visit_id'];
            console.log("WIDGETS: ", this.state.widgetValues);
            // eslint-disable-next-line
            const fields = Object.entries(this.state.widgetValues).reduce((acc, [key, value]) => {
                // TODO: Did the commented line ever work?
                // let v = value.columnname === 'mincut_state' ? state : value.value;
                let v = value.value;
                if (ignoreWidgets.includes(value.columnname)) {
                    v = null;
                }
                if (!(v === null || v === undefined || v === "")) {
                    acc[value.columnname] = v;
                    console.log(acc[value.columnname], " : ", v);
                }
                return acc;
            }, {});
            if (!isEmpty(requestUrl)) {
                this.props.processStarted("visit_msg", "Aceptar visita");

                const widgets = this.state.visitResult?.body?.data?.fields;
                let tableWidget = null;
                widgets.forEach(w => {
                    if (w.widgettype === "tableview") {
                        tableWidget = w;
                    }
                });

                const formData = new FormData();
                for (let i = 0; i < this.state.files.length; i++) {
                    const file = this.state.files[i];
                    formData.append('files[]', file);
                }
                formData.append("xcoord", this.state.coords[0]);
                formData.append("ycoord", this.state.coords[1]);
                formData.append("epsg", this.crsStrToInt(this.props.map.projection));
                formData.append("theme", this.props.theme.title);
                formData.append("tableName", tableWidget.linkedobject);
                const visitId = this.state.coords[0] ? null : this.state.visitResult?.body?.feature?.visitId;
                formData.append("visitId", visitId || null);
                formData.append("fields", JSON.stringify(fields));
                console.log("FIELDS: ", fields);
                axios.post(requestUrl + 'setvisit', formData, {
                    headers: { 'Content-Type': 'multipart/form-data' }
                }).then((response) => {
                    const result = response.data;
                    // show message
                    this.props.processFinished("visit_msg", result.status === "Accepted", "DB return:" + (result.SQLERR || result.message || "Check logs"));
                    if (result?.status === "Accepted") {
                        this.onToolClose();
                    }
                }).catch((e) => {
                    console.warn(e);
                    this.props.processFinished("visit_msg", false, "Internal server error!");
                });
            }
            break;
        }
        case 'set_previous_form_back':
            this.clearResults();
            break;
        case 'get_visit': {
            const queryableLayers = IdentifyUtils.getQueryLayers(this.props.layers, this.props.map).filter(l => {
                // TODO: If there are some wms external layers this would select more than one layer
                return l.type === "wms";
            });
            if (!isEmpty(queryableLayers) && !isEmpty(requestUrl)) {
                if (queryableLayers.length > 1) {
                    console.warn("There are multiple giswater queryable layers");
                }
                const layer = queryableLayers[0];
                const visitType = this.state.mode === 'Incidencia' ? 2 : 1;
                const ignoreWidgets = ['txt_visit_id'];
                console.log("WIDGETS: ", this.state.widgetValues);
                // eslint-disable-next-line
                const fields = Object.entries(this.state.widgetValues).reduce((acc, [key, value]) => {
                    let v = value.columnname === 'class_id' ? widget : value.value;
                    if (ignoreWidgets.includes(value.columnname)) v = null;
                    if (!(v === null || v === undefined || v === "")) {
                        acc[value.columnname] = v;
                        console.log(acc[value.columnname], " : ", v);
                    }
                    return acc;
                }, {});
                if (isEmpty(fields)) return;
                const epsg = this.crsStrToInt(this.props.map.projection);
                const visitId = this.state.visitResult?.body?.feature?.visitId;
                const params = {
                    theme: this.props.theme.title,
                    epsg: epsg,
                    layers: layer.queryLayers.join(','),
                    visitType: visitType,
                    visitId: visitId,
                    fields: fields
                };

                axios.put(requestUrl + "getvisit", { ...params }).then(response => {
                    const result = response.data;
                    this.setState({ visitResult: result, pendingRequests: false, widgetValues: {} });
                }).catch((e) => {
                    console.log(e);
                    this.setState({ pendingRequests: false });
                });
            }
            break;
        }
        default:
            console.warn(`Action \`${action.functionName}\` cannot be handled.`);
            break;
        }
    };
    updateField = (widget, value, initial = false) => {
        // Get filterSign
        let filterSign = "=";
        if (widget.property.widgetcontrols !== "null") {
            filterSign = JSON.parse(widget.property.widgetcontrols.replace("$gt", ">").replace("$lt", "<")).filterSign;
        }
        let columnname = widget.name;
        if (widget.property.widgetfunction !== "null" && widget.property.widgetfunction !== "{}") {
            columnname = JSON.parse(widget.property.widgetfunction)?.parameters?.columnfind;
            if (!initial) this.dispatchButton(JSON.parse(widget.property.widgetfunction), value);
        }
        columnname = columnname ?? widget.name;
        // Update filters
        this.setState((state) => ({ widgetValues: { ...state.widgetValues, [widget.name]: { columnname: columnname, value: value, filterSign: filterSign } } }));
    };
    onTabChanged = (tab, widget) => {
        this.getList(tab, widget);
        this.setState({ currentTab: { tab: tab, widget: widget } });
    };
    getList = (tab) => {
        try {
            const requestUrl = GwUtils.getServiceUrl("util");
            let tableWidget = null;
            GwUtils.forEachWidgetInLayout(tab.layout, (widget) => {
                if (widget.class === "QTableView") {
                    tableWidget = widget; // There should only be one
                }
            });

            if (isEmpty(tableWidget) || isEmpty(requestUrl)) {
                return;
            }

            const visitId = this.state.visitResult?.body?.feature?.visitId;
            const filters = `{"visit_id": {"columnname": "visit_id", "value": ${visitId || -1}}}`;
            console.log("FILTERS---------", filters);
            const params = {
                theme: this.props.theme.title,
                tableName: tableWidget.property.linkedobject,
                // "tabName": tab.name,  // tab.name, no? o widget.name?
                // "widgetname": tableWidgets[0].name,  // tabname_ prefix cal?
                // "formtype": this.props.formtype,
                // "idName": this.state.identifyResult.feature.idName,
                // "id": this.state.identifyResult.feature.id,
                filterFields: filters // visit id
                // "filterSign": action.params.tabName
            };
            console.log("TEST getList, params:", params);
            axios.get(requestUrl + "getlist", { params: params }).then((response) => {
                const result = response.data;
                console.log("getlist done:", result);
                this.setState((state) => ({ tableValues: { ...state.tableValues, [tableWidget.name]: result }}));
            }).catch((e) => {
                console.warn(e);
                // this.setState({  });
            });
        } catch (error) {
            console.error(error);
        }
    };
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

            const requestUrl = GwUtils.getServiceUrl("visit");
            if (!isEmpty(queryableLayers) && !isEmpty(requestUrl)) {
                if (queryableLayers.length > 1) {
                    console.warn("There are multiple giswater queryable layers");
                }
                const layer = queryableLayers[0];
                const visitType = this.state.mode === 'Incidencia' ? 2 : 1;

                const epsg = this.crsStrToInt(this.props.map.projection);
                const zoomRatio = MapUtils.computeForZoom(this.props.map.scales, this.props.map.zoom);
                const params = {
                    theme: this.props.theme.title,
                    epsg: epsg,
                    xcoord: clickPoint[0],
                    ycoord: clickPoint[1],
                    zoomRatio: zoomRatio,
                    layers: layer.queryLayers.join(','),
                    visitType: visitType
                };

                pendingRequests = true;
                axios.get(requestUrl + "getvisit", { params: params }).then(response => {
                    const result = response.data;
                    this.setState({ visitResult: result, coords: clickPoint, pendingRequests: false });
                    this.highlightResult(result);
                }).catch((e) => {
                    console.log(e);
                    this.setState({ pendingRequests: false });
                });
            }
            this.props.addMarker('visit', clickPoint, '', this.props.map.projection);
            this.setState({ visitResult: {}, pendingRequests: pendingRequests });
        }
    };

    highlightResult = (result) => {
        // console.log('result :>> ', result);
        if (isEmpty(result) || !result?.feature?.geometry) {
            this.props.removeLayer("visitselection");
        } else {
            const layer = {
                id: "visitselection",
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
    onShow = (mode) => {
        this.setState({ mode: mode || 'Visit' });
    };
    onToolClose = () => {
        this.props.removeMarker('visit');
        this.props.removeLayer("visitselection");
        this.props.changeSelectionState({ geomType: undefined });
        this.setState({ visitResult: null, pendingRequests: false, files: [], widgetValues: {} });
    };

    clearResults = () => {
        if (this.props.visitResult) {
            this.onToolClose();
            if (this.props.dispatchButton) {
                this.props.dispatchButton({ widgetfunction: { functionName: "visitClose" } });
            }
        }
        this.props.removeMarker('visit');
        this.props.removeLayer("visitselection");
        this.setState({ visitResult: null, pendingRequests: false, files: [], widgetValues: {} });
    };

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
                } else {
                    const widgetValues = {
                        ...this.state.widgetValues,
                        ...this.state.tableValues
                    };
                    body = (
                        <div className="identify-body" role="body">
                            <GwQtDesignerForm dispatchButton={this.dispatchButton} files={this.state.files} form_xml={result.form_xml}
                                getInitialValues initiallyDocked={this.props.initiallyDocked}
                                onTabChanged={this.onTabChanged} readOnly={false} replaceImageUrls
                                theme={this.state.theme} updateField={this.updateField} widgetValues={widgetValues}
                            />
                        </div>
                    );
                }
            }
            const title = this.state.visitResult.body?.data?.form?.headerText || "Visit";
            resultWindow = (
                <ResizeableWindow dockable={this.props.dockable} icon="giswater"
                    initialHeight={this.state.mode === "Dma" ? 800 : this.props.initialHeight} initialWidth={this.props.initialWidth}
                    initialX={this.props.initialX} initialY={this.props.initialY} initiallyDocked={this.props.initiallyDocked} key="GwInfoWindow"
                    onClose={this.clearResults}
                    scrollable={this.state.mode === "Dma" ? true : false} title={title}
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
