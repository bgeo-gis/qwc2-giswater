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
import { LayerRole, addMarker, removeMarker, removeLayer, addLayerFeatures } from 'qwc2/actions/layers';
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
import { setCurrentTask } from 'qwc2/actions/task';

import { setActiveVisit } from '../actions/visit';
import CoordinatesUtils from 'qwc2/utils/CoordinatesUtils';

import url from 'url';

class GwVisit extends React.Component {
    static propTypes = {
        addLayerFeatures: PropTypes.func,
        addMarker: PropTypes.func,
        click: PropTypes.object,
        currentIdentifyTool: PropTypes.string,
        currentTask: PropTypes.string,
        dockable: PropTypes.oneOfType([PropTypes.bool, PropTypes.string]),
        initialHeight: PropTypes.number,
        initialWidth: PropTypes.number,
        initialX: PropTypes.number,
        initialY: PropTypes.number,
        initiallyDocked: PropTypes.bool,
        keepManagerOpen: PropTypes.bool,
        layers: PropTypes.array,
        map: PropTypes.object,
        onWidgetAction: PropTypes.func,
        processFinished: PropTypes.func,
        processStarted: PropTypes.func,
        removeLayer: PropTypes.func,
        removeMarker: PropTypes.func,
        selection: PropTypes.object,
        setActiveVisit: PropTypes.func,
        setCurrentTask: PropTypes.func,
        state: PropTypes.object,
        theme: PropTypes.object,
        visitResult: PropTypes.object
    };
    static defaultProps = {
        initialWidth: 480,
        initialHeight: 520,
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
        widgetsProperties: {},
        mode: 'Visit',
        coords: [null, null],
        currentTab: {},
        location: ""
    };
    componentDidUpdate(prevProps) {
        if (this.props.currentTask === "GwVisit") {
            this.identifyPoint(prevProps);
        }
    }
    onWidgetAction = (action, widget) => {
        const requestUrl = GwUtils.getServiceUrl("visit");
        switch (action.functionName) {
        case 'apply':
        case 'accept': {
            const ignoreWidgets = ['txt_visit_id', 'tbl_files', 'mail', 'sendto'];
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
                    // console.log(acc[value.columnname], " : ", v);
                }
                return acc;
            }, {});

            this.props.processStarted("visit_msg", "Aceptar visita");

            const widgets = this.props.visitResult?.body?.data?.fields;

            if (this.state.widgetValues?.mail?.value) {
                const email = this.state.widgetValues.sendto.value;
                let shareUrl = "";
                const posCrs = this.props.state.map.projection;
                const prec = CoordinatesUtils.getUnits(posCrs) === 'degrees' ? 4 : 0;
                const coordinates =  this.state.coords.map(x => x.toFixed(prec)).join(",");
                GwUtils.generatePermaLink(this.props.state, coordinates, (permalink => {
                    shareUrl = permalink;
                    this.setState({location: permalink});
                    const urlParts = url.parse(shareUrl, true);
                    urlParts.query.hc = 1;
                    if (!urlParts.query.c) {
                        const posCrs = urlParts.query.crs || this.props.state.map.projection;
                        const prec = CoordinatesUtils.getUnits(posCrs) === 'degrees' ? 20 : 0;
                        urlParts.query.c = this.state.coords.map(x => x.toFixed(prec)).join(",");
                        // urlParts.query.c =this.state.coords.map(x => x).join(",");
                        const url = new URL(window.location.href);
                        const sValue = url.searchParams.get('s');
                        urlParts.query.s = sValue;
                    }
                    delete urlParts.search;
                    shareUrl = url.format(urlParts);
                    const params = {
                        widgets: widgets,
                        widgetValues: this.state.widgetValues,
                        ignoreWidgets: ignoreWidgets,
                        email: email,
                        shareUrl: shareUrl
                    };
                    axios.post(requestUrl + "getmail", {...params}).then((response) => {
                        const result = response.data;
                        window.location.href = result;
                    }).catch((e) => {
                        console.warn(e);
                    });
                }));
            }

            let tableWidget = null;
            widgets.forEach(w => {
                if (w.widgettype === "tableview") {
                    tableWidget = w;
                }
            });

            const formData = new FormData();
            const files = this.state.widgetsProperties.addfile?.value;
            console.log("widgetsProperties: ", this.state.widgetsProperties);
            console.log("widgetValues: ", this.state.widgetValues);
            console.log("FILES: ", files);
            console.log(typeof files);
            if (files instanceof FileList) {
                for (let i = 0; i < files.length; i++) {
                    formData.append('files[]', files[i])
                }
            } else {
                formData.append('files[]', files);
            }
            formData.append("xcoord", this.state.coords[0]);
            formData.append("ycoord", this.state.coords[1]);
            formData.append("epsg", GwUtils.crsStrToInt(this.props.map.projection));
            formData.append("theme", this.props.theme.title);
            formData.append("tableName", tableWidget.linkedobject);
            const visitId = this.state.coords[0] ? null : this.props.visitResult?.body?.feature?.visitId;
            console.log("VISIT ID: ", visitId);
            console.log("FIELDS: ", fields);
            console.log("visitResult: ", this.props.visitResult);
            formData.append("visitId", visitId || null);
            formData.append("fields", JSON.stringify(fields));
            axios.post(requestUrl + 'setvisit', formData, {
                headers: { 'Content-Type': 'multipart/form-data' }
            }).then((response) => {
                const result = response.data;
                // show message
                this.props.processFinished("visit_msg", result.status === "Accepted", "DB return:" + (result.SQLERR || result.message?.text || "Check logs"));
                if (result?.status === "Accepted") {
                    this.setState((state) => ({
                        widgetsProperties: {
                            ...state.widgetsProperties,
                            addfile: { value: null }
                        },
                    }));
                    if (action.functionName === 'accept') {
                        this.onToolClose();
                    } else {
                        this.getList(this.state.currentTab.tab);
                    }
                }
            }).catch((e) => {
                console.warn(e);
                this.props.processFinished("visit_msg", false, "Internal server error!");
            });

            break;
        }
        case 'cancel':
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
                const ignoreWidgets = ['txt_visit_id', 'tbl_files'];
                // console.log("WIDGETS: ", this.state.widgetValues);
                // eslint-disable-next-line
                const fields = Object.entries(this.state.widgetValues).reduce((acc, [key, value]) => {
                    let v = value.columnname === 'class_id' ? widget : value.value;
                    if (ignoreWidgets.includes(value.columnname)) v = null;
                    if (!(v === null || v === undefined || v === "")) {
                        acc[value.columnname] = v;
                    }
                    return acc;
                }, {});
                if (isEmpty(fields)) return;
                const epsg = GwUtils.crsStrToInt(this.props.map.projection);
                const visitId = this.props.visitResult?.body?.feature?.visitId;
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
                    this.props.setActiveVisit(result);
                    this.setState({ pendingRequests: false, widgetValues: {} });
                }).catch((e) => {
                    console.log(e);
                    this.setState({ pendingRequests: false });
                });
            }
            break;
        }
        case 'show_mails': {
            let hiddenWidgets = ["sendto"];
            if (widget) {
                hiddenWidgets = [];
            }
            this.setState({ hiddenWidgets: hiddenWidgets });
            break;
        }
        default:
            console.warn(`Action \`${action.functionName}\` cannot be handled.`);
            break;
        }
    };
    onWidgetValueChange = (widget, value, initial = false) => {
        // Get filterSign
        let filterSign = "=";
        if (widget.property.widgetcontrols !== "null") {
            filterSign = JSON.parse(widget.property.widgetcontrols.replace("$gt", ">").replace("$lt", "<")).filterSign;
        }
        let columnname = widget.name;
        if (widget.property.widgetfunction !== "null" && widget.property.widgetfunction !== "{}") {
            columnname = JSON.parse(widget.property.widgetfunction)?.parameters?.columnfind;
            if (!initial) this.onWidgetAction(JSON.parse(widget.property.widgetfunction), value);
        }
        columnname = columnname ?? widget.name;
        // Update filters
        this.setState((state) => ({
            widgetsProperties: { ...state.widgetsProperties, [widget.name]: { value: value } },
            widgetValues: { ...state.widgetValues, [widget.name]: { columnname: columnname, value: value, filterSign: filterSign } }
        }));
    };
    onTabChanged = (tab, widget) => {
        this.getList(tab);
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

            const visitResult = this.props.visitResult;
            const visitId = visitResult?.body?.feature?.visitId;
            const filters = `{"visit_id": {"columnname": "visit_id", "value": ${visitId || -1}}}`;
            const params = {
                theme: this.props.theme.title,
                tableName: tableWidget.property.linkedobject,
                filterFields: filters // visit id
            };
            axios.get(requestUrl + "getlist", { params: params }).then((response) => {
                const result = response.data;
                this.setState((state) => ({
                    tableValues: { ...state.tableValues, [tableWidget.name]: result },
                    widgetsProperties: { ...state.widgetsProperties, [tableWidget.name]: {
                        value: GwUtils.getListToValue(result)
                    } }
                }));
            }).catch((e) => {
                console.warn(e);
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
            const queryableLayers = IdentifyUtils.getQueryLayers(this.props.layers, this.props.map);

            const requestUrl = GwUtils.getServiceUrl("visit");
            if (!isEmpty(queryableLayers) && !isEmpty(requestUrl)) {
                const queryLayers = queryableLayers.reduce((acc, layer) => {
                    return acc.concat(layer.queryLayers);
                }, []);

                const visitType = this.state.mode === 'Incidencia' ? 2 : 1;

                const epsg = GwUtils.crsStrToInt(this.props.map.projection);
                const zoomRatio = MapUtils.computeForZoom(this.props.map.scales, this.props.map.zoom);
                const params = {
                    theme: this.props.theme.title,
                    epsg: epsg,
                    xcoord: clickPoint[0],
                    ycoord: clickPoint[1],
                    zoomRatio: zoomRatio,
                    layers: queryLayers.join(','),
                    visitType: visitType
                };

                pendingRequests = true;
                axios.get(requestUrl + "getvisit", { params: params }).then(response => {
                    const result = response.data;
                    this.props.setActiveVisit(result);
                    this.setState({ coords: clickPoint, pendingRequests: false });
                    this.highlightResult(result);
                }).catch((e) => {
                    console.log(e);
                    this.setState({ pendingRequests: false });
                });
            }
            this.props.addMarker('visit', clickPoint, '', this.props.map.projection);
            this.setState({ tableValues: {}, pendingRequests: pendingRequests });
        }
    };

    highlightResult = (result) => {
        if (isEmpty(result) || !result?.body?.feature?.geometry) {
            this.props.removeLayer("visitselection");
        } else {
            const layer = {
                id: "visitselection",
                role: LayerRole.SELECTION
            };
            const crs = this.props.map.projection;
            const geometry = VectorLayerUtils.wktToGeoJSON(result.body.feature.geometry.st_astext, crs, crs);
            const feature = {
                id: result.body.feature.visitId,
                geometry: geometry.geometry
            };
            this.props.addLayerFeatures(layer, [feature], true);
        }
    };
    queryPoint = (prevProps) => {
        if (this.props.click.button !== 0 || this.props.click === prevProps.click || (this.props.click.features || []).find(entry => entry.feature === 'startupposmarker')) {
            return null;
        }
        if (this.props.click.feature === 'searchmarker' && this.props.click.geometry ) {
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
        this.props.setActiveVisit(null);
        if (!this.props.keepManagerOpen) {
            this.props.setCurrentTask(null);
        }
        this.setState({ coords: [null, null], pendingRequests: false, files: [], widgetsProperties: {}, widgetValues: {}, tableValues: {}, hiddenWidgets: ["sendto"] });
    };

    clearResults = () => {
        this.onToolClose();
        this.props.removeMarker('visit');
        this.props.removeLayer("visitselection");
        this.setState({ coords: [null, null], pendingRequests: false, files: [], widgetsProperties: {}, widgetValues: {}, tableValues: {}, hiddenWidgets: ["sendto"] });
    };

    render() {
        let resultWindow = null;
        if (this.state.pendingRequests === true || this.props.visitResult !== null ) {
            const result = this.props.visitResult;
            let body = null;
            if (isEmpty(result)) {
                if (this.state.pendingRequests === true) {
                    body = (<div className="identify-body" role="body"><span className="identify-body-message">{LocaleUtils.tr("identify.querying")}</span></div>);
                } else {
                    body = (<div className="identify-body" role="body"><span className="identify-body-message">{LocaleUtils.tr("identify.noresults")}</span></div>);
                }
            } else {
                if (result.schema === null) {
                    body = null;
                    this.props.processStarted("info_msg", "GwVisit Error!");
                    this.props.processFinished("info_msg", false, "Couldn't find schema, please check service config.");
                } else {
                    body = (
                        <div className="identify-body" role="body">
                            <GwQtDesignerForm files={this.state.files} form_xml={result.form_xml} getInitialValues={false}
                                intiallyDocked={this.props.initiallyDocked} onTabChanged={this.onTabChanged}
                                onWidgetAction={this.onWidgetAction} onWidgetValueChange={this.onWidgetValueChange} readOnly={false}
                                style={{ height: '100%'}} useNew
                                widgetsProperties={this.state.widgetsProperties}
                            />
                        </div>
                    );
                }
            }
            const title = result?.body?.data?.form?.headerText || "Visit";
            resultWindow = (
                <ResizeableWindow dockable={this.props.dockable} icon="giswater"
                    initialHeight={this.props.initialHeight} initialWidth={this.props.initialWidth} initialX={this.props.initialX}
                    initialY={this.props.initialY} initiallyDocked={this.props.initiallyDocked} key="GwInfoWindow" minimizeable
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
    selection: state.selection,
    visitResult: state.visit.visitResult,
    keepManagerOpen: state.visit.keepManagerOpen,
    state
});

export default connect(selector, {
    addLayerFeatures: addLayerFeatures,
    addMarker: addMarker,
    panTo: panTo,
    removeMarker: removeMarker,
    removeLayer: removeLayer,
    processFinished: processFinished,
    processStarted: processStarted,
    setCurrentTask: setCurrentTask,
    setActiveVisit: setActiveVisit
})(GwVisit);
