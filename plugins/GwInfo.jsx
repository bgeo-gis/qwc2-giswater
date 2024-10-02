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
import { LayerRole, addMarker, removeMarker, removeLayer, addLayerFeatures, refreshLayer } from 'qwc2/actions/layers';
import ResizeableWindow from 'qwc2/components/ResizeableWindow';
import TaskBar from 'qwc2/components/TaskBar';
import IdentifyUtils from 'qwc2/utils/IdentifyUtils';
import LocaleUtils from 'qwc2/utils/LocaleUtils';
import MapUtils from 'qwc2/utils/MapUtils';
import VectorLayerUtils from 'qwc2/utils/VectorLayerUtils';
import { panTo } from 'qwc2/actions/map';
import { processFinished, processStarted } from 'qwc2/actions/processNotifications';
import { setCurrentTask } from 'qwc2/actions/task';

import GwQtDesignerForm from '../components/GwQtDesignerForm';
import GwUtils from '../utils/GwUtils';

import './style/GwInfo.css';

import { setIdentifyResult } from '../actions/info';


class GwInfo extends React.Component {
    static propTypes = {
        addLayerFeatures: PropTypes.func,
        addMarker: PropTypes.func,
        click: PropTypes.object,
        currentIdentifyTool: PropTypes.string,
        currentTask: PropTypes.string,
        dockable: PropTypes.oneOfType([PropTypes.bool, PropTypes.string]),
        identifyResult: PropTypes.object,
        initialHeight: PropTypes.number,
        initialWidth: PropTypes.number,
        initialX: PropTypes.number,
        initialY: PropTypes.number,
        initiallyDocked: PropTypes.bool,
        layers: PropTypes.array,
        map: PropTypes.object,
        minHeight: PropTypes.number,
        onClose: PropTypes.func,
        panTo: PropTypes.func,
        processFinished: PropTypes.func,
        processStarted: PropTypes.func,
        refreshLayer: PropTypes.func,
        removeLayer: PropTypes.func,
        removeMarker: PropTypes.func,
        selection: PropTypes.object,
        setCurrentTask: PropTypes.func,
        setIdentifyResult: PropTypes.func,
        theme: PropTypes.object
    };

    static defaultProps = {
        minHeight: 500,
        initialWidth: 480,
        initialHeight: 600,
        initialX: 0,
        initialY: 0,
        identifyResult: null,
        initiallyDocked: false,
        dockable: true
    };
    state = {
        mode: 'Point',
        prevIdentifyResult: null,
        pendingRequests: false,
        currentTab: {},
        tableValues: {},
        filterValues: {},
        dataValues: {},
        epaValues: {},
        widgetsProperties: {},
        editingActive: false
    };

    constructor(props) {
        super(props);
        // this.state = GwInfo.defaultState;
    }
    componentDidUpdate(prevProps, prevState) {
        if (this.props.currentIdentifyTool !== prevProps.currentIdentifyTool && prevProps.currentIdentifyTool === "GwInfo") {
            this.clearResults();
        }
        // Manage map click
        if (this.props.currentTask === "GwInfo" || this.props.currentIdentifyTool === "GwInfo") {
            if (this.state.mode === "Point") {
                this.identifyPoint(prevProps);
            }
        }
        // Manage highlight and marker from result
        if (this.props.identifyResult && this.props.identifyResult !== prevProps.identifyResult) {
            this.highlightResult(this.props.identifyResult);
            this.addMarkerToResult(this.props.identifyResult);
        }
        // Check if list need to update (current tab or filters changed)
        if (!isEmpty(this.state.currentTab) && ((prevState.currentTab !== this.state.currentTab) || (prevState.filterValues !== this.state.filterValues))) {
            this.getList(this.state.currentTab.tab);
        }
    }
    onWidgetAction = (action, widget, value) => {
        console.info(`Action ${action.functionName}`, action);
        let pendingRequests = false;
        switch (action.functionName) {
        case "featureLink":
        case "get_info_node": {
            this.props.removeLayer("searchselection");

            this.setState({ prevIdentifyResult: this.props.identifyResult, pendingRequests: pendingRequests });
            this.props.setIdentifyResult({});

            const requestUrl = GwUtils.getServiceUrl("info");
            if (!isEmpty(requestUrl)) {
                const action = JSON.parse(widget.property.action|| "{}");
                const params = {
                    theme: this.props.theme.title,
                    id: action.params.id,
                    tableName: "v_edit_node"
                };
                pendingRequests = true;
                axios.get(requestUrl + "fromid", { params: params }).then((response) => {
                    const result = response.data;
                    this.props.setIdentifyResult(result);
                    this.setState({ pendingRequests: false });
                    this.panToResult(result);
                    this.highlightResult(result);
                    this.addMarkerToResult(result);
                }).catch((e) => {
                    console.log(e);
                    this.setState({ pendingRequests: false });
                });
            }
            break;
        }
        case "accept": {
            if (this.checkIfDataModified()) {
                if (confirm(LocaleUtils.tr("identify.confirmSave"))) {
                    this.saveChanges().then(() => {
                        this.clearResults();
                    });
                }
            } else {
                this.clearResults();
            }
            break;
        }
        case "apply":
            if (this.checkIfDataModified() && confirm(LocaleUtils.tr("identify.confirmSave"))) {
                this.saveChanges();
            }
            break;
        case "cancel":
            if (this.checkIfDataModified()) {
                if (confirm(LocaleUtils.tr("identify.confirmDiscard"))) {
                    this.discardChanges();
                    this.clearResults();
                }
            } else {
                this.clearResults();
            }
            break;
        case "manage_visit_class":
            this.getList(this.state.currentTab.tab, value);
            break;

        default:
            console.warn(`Action \`${action.functionName}\` cannot be handled.`, action);
            break;
        }
    };

    checkIfDataModified = () => {
        return !isEmpty(this.state.dataValues) || !isEmpty(this.state.epaValues);
    };

    saveChanges = () => {
        const feature = this.props.identifyResult.body.feature;

        const dataModified = !isEmpty(this.state.dataValues);
        const epaModified = !isEmpty(this.state.epaValues);

        if (!dataModified && !epaModified) {
            return Promise.resolve();
        }

        if (dataModified) {
            this.props.processStarted("info_msg_data", "Update feature Data");
        }

        return this.setFields(
            feature.id,
            feature.tableName,
            this.state.dataValues
        ).then((response) => {
            const dataResult = response.data;
            if (dataModified) {
                this.props.processFinished("info_msg_data", dataResult.status === "Accepted", dataResult.message.text);
            }
            if (epaModified) {
                this.props.processStarted("info_msg_epa", "Update feature EPA");
            }
            this.setFields(
                feature.id,
                this.getEpaTableName(this.state.widgetsProperties.epa_type?.value),
                this.state.epaValues
            ).then((response) => {
                const epaResult = response.data;
                if (epaModified) {
                    this.props.processFinished("info_msg_epa", epaResult.status === "Accepted", epaResult.message.text);
                }

                if (this.props.theme.tiled) {
                    // this.refreshTiles()
                } else {
                    this.props.refreshLayer(layer => layer.role === LayerRole.THEME);
                }

                // Clear dataValues and epaValues after saving
                this.discardChanges();

            }).catch((e) => {
                console.warn(e);
                this.props.processFinished("info_msg_epa", false, `Execution failed: ${e}`);
            });

        }).catch((e) => {
            console.warn(e);
            this.props.processFinished("info_msg_data", false, `Execution failed: ${e}`);
        });
    };

    discardChanges = () => {
        this.setState({ dataValues: {}, epaValues: {} });
    };

    onWidgetValueChange = (widget, value) => {
        let columnname = widget.name;
        if (widget.property.widgetfunction !== "null") {
            columnname = JSON.parse(widget.property.widgetfunction)?.parameters?.columnfind;
        }
        columnname = columnname ?? widget.name;

        if (widget.property.isfilter === "true") {
            // Get filterSign
            let filterSign = "=";
            if (widget.property.widgetcontrols !== "null") {
                filterSign = JSON.parse(widget.property.widgetcontrols.replace("$gt", ">").replace("$lt", "<")).filterSign;
            }
            // Update filters
            const tabName = this.state.currentTab.tab?.name || 'pendingFilters';
            this.setState((state) => ({ filterValues: { ...state.filterValues, [tabName]: {...state.filterValues[tabName], [widget.name]: {columnname: columnname, value: value, filterSign: filterSign}}}}));
        } else {
            const widgetFunction = JSON.parse(widget.property.widgetfunction);
            this.onWidgetAction(widgetFunction, widget, value);
        }

        if (widget.name === "epa_type") {
            this.loadEpaForm(value);
        }

        const newDataValue = {};
        if (widget.containingLayout === "lyt_tab_data" || widget.name === "epa_type") {
            newDataValue[widget.name] = {value: value, columnname: columnname};
        }
        const newEpaValue = {};
        if (widget.containingLayout === "lyt_epa_data_1") {
            newEpaValue[widget.name] = {value: value, columnname: columnname};
        }

        if (widget.property.isTypeahead === 'true' && widget.property.queryText) {
            let queryText = widget.property.queryText;
            let queryTextFilter;
            let parentId = widget.property.parentId;
            let textToSearch = value;

            if (widget.property.queryTextFilter) {
                queryTextFilter = widget.property.queryTextFilter;
            }

            const requestUrl = GwUtils.getServiceUrl("info");
            if (!isEmpty(requestUrl)) {
                const epsg = GwUtils.crsStrToInt(this.props.map.projection);
                const params = {
                    theme: this.props.theme.title,
                    epsg: epsg,
                    queryText: queryText,
                    queryTextFilter: queryTextFilter,
                    parentId: parentId,
                    textToSearch: textToSearch
                };

                console.log("params::::", params);

                axios.get(requestUrl + "gettypeahead", { params: params }).then((response) => {
                    const result = response.data;
                    const list = [];
                    if (result.status === "Accepted" && result.body.data) {
                        result.body.data.forEach((element) => {
                            list.push(element.idval);
                        });
                    }

                   // Update widgetProperties with the new list of suggestions
                   this.setState((state) => ({
                    widgetsProperties: {
                        ...state.widgetsProperties,
                        [widget.name]: {
                            ...state.widgetsProperties[widget.name],
                            value: value,  // update value
                            props: {
                                ...state.widgetsProperties[widget.name]?.props,
                                suggestions: list
                            }
                        }
                    }
                }));
                }).catch((e) => {
                    console.log(e);
                });
            }
        }

        // TODO: use setCurrentTaskBlocked to avoid closing the task while saving or reloading the page
        this.setState((state) => ({
            widgetsProperties: { ...state.widgetsProperties, [widget.name]: {value: value} },
            dataValues: {...state.dataValues, ...newDataValue },
            epaValues: {...state.epaValues, ...newEpaValue }
        }));
    };
    loadWidgetsProperties = (widgetsProperties) => {
        this.setState((state) => ({ widgetsProperties: { ...state.widgetsProperties, ...widgetsProperties } }));
    };
    onTabChanged = (tab, widget) => {
        if (tab.name === "tab_plan") {
            const formVal = this.state.widgetsProperties.form_plan?.value;
            if (!formVal?.form_xml && !formVal?.loading) {
                this.loadPlanForm();
            }
        } else if (tab.name === "tab_epa") {
            const formVal = this.state.widgetsProperties.form_epa?.value;
            const epaType = this.state.widgetsProperties.epa_type?.value;
            if (!formVal?.form_xml && !formVal?.loading) {
                this.loadEpaForm(epaType);
            }
        }

        this.setState({ currentTab: {tab: tab, widget: widget} });
    };

    getEpaTableName = (epaType) => {
        const featureType = this.props.identifyResult.body.feature.featureType;

        epaType = epaType.toLowerCase();
        let tableName = "ve_epa_" + epaType;

        if (featureType === 'connec' && epaType === 'junction') {
            tableName = 've_epa_connec';
        }

        return tableName;
    };

    loadEpaForm = (epaType) => {
        const requestUrl = GwUtils.getServiceUrl("info");
        if (!isEmpty(requestUrl)) {
            const params = {
                theme: this.props.theme.title,
                id: this.props.identifyResult.body.feature.id,
                tableName: this.getEpaTableName(epaType),
                epaType: epaType
            };

            this.setState((state) => ({
                widgetsProperties: {
                    ...state.widgetsProperties,
                    form_epa: {
                        value: {
                            form_xml: "",
                            loading: true
                        }
                    }
                }
            }));

            axios.get(requestUrl + "fromid", { params: params }).then((response) => {
                const result = response.data;
                this.setState((state) => ({
                    epaValues: {},
                    widgetsProperties: {
                        ...state.widgetsProperties,
                        form_epa: {
                            value: {
                                form_xml: result.form_xml,
                                loading: false
                            }
                        }
                    }
                }));
            });
        }
    };

    loadPlanForm = () => {
        const requestUrl = GwUtils.getServiceUrl("info");
        if (!isEmpty(requestUrl)) {
            const feature = this.props.identifyResult.body.feature;
            const params = {
                theme: this.props.theme.title,
                tableName: feature.tableName,
                featureType: feature.featureType,
                idName: feature.idName,
                id: feature.id
            };
            this.setState((state) => ({
                widgetsProperties: {
                    ...state.widgetsProperties,
                    form_plan: {
                        value: {
                            form_xml: "",
                            loading: true
                        }
                    }
                }
            }));

            axios.get(requestUrl + "getinfoplan", { params: params }).then((response) => {
                const result = response.data;
                this.setState((state) => ({
                    widgetsProperties: {
                        ...state.widgetsProperties,
                        form_plan: {
                            value: {
                                form_xml: result.form_xml,
                                loading: false
                            }
                        }
                    }
                }));
            }).catch((e) => {
                console.log(e);
            });
        }
    };

    getList = (tab, _tableName) => {
        try {
            const requestUrl = GwUtils.getServiceUrl("info");

            const tableWidgets = [];
            GwUtils.forEachWidgetInLayout(tab.layout, (widget) => {
                if (widget.class === "QTableView" || widget.class === "QTableWidget") {
                    tableWidgets.push(widget);
                }
            });

            if (isEmpty(tableWidgets) || isEmpty(requestUrl)) {
                return;
            }

            for (const tableWidget of tableWidgets) {
                const prop = tableWidget.property || {};
                let idName = this.props.identifyResult.body.feature.idName;
                if (tab.name === 'tab_hydrometer' || tab.name === 'tab_hydrometer_val') {
                    idName = 'feature_id';
                }

                let tableName = null;
                // TODO: Is this still necessary?
                if (tab.name === 'tab_visit') {
                    tableName =  _tableName || this.state.widgetsProperties.visit_class?.value;
                }

                const params = {
                    theme: this.props.theme.title,
                    tabName: tab.name,  // tab.name, no? o widget.name?
                    widgetname: tableWidget.name,  // tabname_ prefix cal?
                    // "formtype": this.props.formtype,
                    tableName: tableName || prop.linkedobject,
                    idName: idName,
                    id: this.props.identifyResult.body.feature.id,
                    filterFields: JSON.stringify(this.state.filterValues[this.state.currentTab.tab?.name])
                    // "filterSign": action.params.tabName
                };
                axios.get(requestUrl + "getlist", { params: params }).then((response) => {
                    const result = response.data;
                    this.setState((state) => ({
                        widgetsProperties: {
                            ...state.widgetsProperties,
                            [tableWidget.name]: {
                                value: GwUtils.getListToValue(result)
                            }
                        }
                    }));
                }).catch((e) => {
                    console.log(e);
                });
            }
        } catch (error) {
            console.warn(error);
        }
    };
    setFields = (id, tableName, fields) => {
        if (isEmpty(fields)) {
            return Promise.resolve({
                data: {
                    status: "Accepted",
                    message: { text: "No fields to update." }
                }
            });
        }

        const params = {
            theme: this.props.theme.title,
            id: id,
            tableName: tableName,
            fields: JSON.stringify(fields)
        };

        console.log("setFields :>>", params);

        const requestUrl = GwUtils.getServiceUrl("util");
        return axios.put(requestUrl + "setfields", { ...params });
    };

    identifyPoint = (prevProps) => {
        const clickPoint = this.queryPoint(prevProps);
        if (clickPoint) {
            if (this.props.onClose) {
                this.props.onClose();
            }
            // Remove any search selection layer to avoid confusion
            this.props.removeLayer("searchselection");
            let pendingRequests = false;

            const queryableLayers = IdentifyUtils.getQueryLayers(this.props.layers, this.props.map);
            console.log("this.props.layers :>>", this.props.layers);
            console.log("this.props.map :>>", this.props.map);

            console.log("queryableLayers :>>", queryableLayers);

            const requestUrl = GwUtils.getServiceUrl("info");
            if (!isEmpty(queryableLayers) && !isEmpty(requestUrl)) {
                const queryLayers = queryableLayers.reduce((acc, layer) => {
                    return acc.concat(layer.queryLayers);
                }, []);

                const epsg = GwUtils.crsStrToInt(this.props.map.projection);
                const zoomRatio = MapUtils.computeForZoom(this.props.map.scales, this.props.map.zoom);
                const params = {
                    theme: this.props.theme.title,
                    epsg: epsg,
                    xcoord: clickPoint[0],
                    ycoord: clickPoint[1],
                    zoomRatio: zoomRatio,
                    layers: queryLayers.join(',')
                };
                // console.log("LAYEERS: ", queryLayers.join(','));
                pendingRequests = true;
                axios.get(requestUrl + "fromcoordinates", { params: params }).then(response => {
                    const result = response.data;
                    if ((isEmpty(result) || !result.form_xml) && !this.props.theme.tiled) {
                        this.onToolClose();
                        this.props.setCurrentTask("Identify", 'Point', null, {pos: clickPoint, exitTaskOnResultsClose: true});
                        return;
                    }
                    result.body.clickPoint = clickPoint;
                    this.props.setIdentifyResult(result);
                    this.setState({ prevIdentifyResult: null, pendingRequests: false });
                    this.highlightResult(result);
                }).catch((e) => {
                    console.log(e);
                    this.setState({ pendingRequests: false });
                });
            }
            this.props.addMarker('identify', clickPoint, '', this.props.map.projection);
            this.setState({ prevIdentifyResult: null, pendingRequests: pendingRequests });
        }
    };

    highlightResult = (result) => {
        if (isEmpty(result) || !result?.body?.feature?.geometry) {
            this.props.removeLayer("identifyslection");
        } else {
            const layer = {
                id: "identifyslection",
                role: LayerRole.SELECTION
            };
            const crs = this.props.map.projection;
            const geometry = VectorLayerUtils.wktToGeoJSON(result.body.feature.geometry.st_astext, crs, crs);
            const feature = {
                id: result.body.feature.id,
                geometry: geometry.geometry
            };
            this.props.addLayerFeatures(layer, [feature], true);
        }
    };
    panToResult = (result) => {
        // TODO: Maybe we should zoom to the result as well
        if (!isEmpty(result)) {
            const center = GwUtils.getGeometryCenter(result.body.feature.geometry.st_astext);
            this.props.panTo(center, this.props.map.projection);
        }
    };
    addMarkerToResult = (result) => {
        let center = null;
        if (!isEmpty(result) && result?.body?.clickPoint) {
            center = result.body.clickPoint;
        } else if (!isEmpty(result) && result?.body?.feature?.geometry) {
            center = GwUtils.getGeometryCenter(result.body.feature.geometry.st_astext);
        }
        if (center) {
            this.props.addMarker('identify', center, '', this.props.map.projection);
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
        this.clearResults();
        this.setState({mode: mode || 'Point'});
    };
    onToolClose = () => {
        this.props.removeMarker('identify');
        this.props.removeLayer("identifyslection");
        this.setState({ pendingRequests: false, mode: 'Point' });
    };
    clearResults = () => {
        this.props.removeMarker('identify');
        this.props.removeLayer("identifyslection");
        this.props.setIdentifyResult(null);
        this.discardChanges();
        this.setState({ editingActive: false, pendingRequests: false, widgetsProperties: {}, dataValues: {}, filterValues: {} });
        if (this.props.onClose) {
            this.props.onClose();
        }
    };
    setEditingActive = (active) => {
        if (this.checkIfDataModified()) {
            if (confirm(LocaleUtils.tr("identify.confirmSave"))) {
                this.saveChanges();
                this.setState({ editingActive: active });
            }
        } else {
            this.setState({ editingActive: active });
        }
    };
    showPrevResult = () => {
        this.props.setIdentifyResult(this.state.prevIdentifyResult);
        this.setState({ prevIdentifyResult: null });
        this.highlightResult(this.state.prevIdentifyResult);
        this.addMarkerToResult(this.state.prevIdentifyResult);
        this.panToResult(this.state.prevIdentifyResult);
    };
    render() {
        let resultWindow = null;
        const identifyResult = this.props.identifyResult;
        const headerText = identifyResult?.body?.form?.headerText;
        if (this.state.pendingRequests === true || identifyResult  !== null) {
            let body = null;
            if (isEmpty(identifyResult) || !identifyResult.form_xml) {
                let text;
                if (this.state.pendingRequests === true) {
                    text = LocaleUtils.tr("identify.querying");
                } else {
                    text = LocaleUtils.tr("identify.noresults");
                }
                body = (<div className="identify-body" role="body"><span className="identify-body-message">{text}</span></div>);
            } else {
                const result = identifyResult;
                const prevResultButton = !isEmpty(this.state.prevIdentifyResult) ? (<button className='button' onClick={this.showPrevResult}>Back</button>) : null;
                if (result.schema === null) {
                    body = null;
                    this.props.processStarted("info_msg", "GwInfo Error!");
                    this.props.processFinished("info_msg", false, "Couldn't find schema, please check service config.");
                } else if (this.state.mode === "Point") {
                    const widgetsProperties = {
                        ...this.state.widgetsProperties,
                        tab_data: {
                            disabled: !this.state.editingActive
                        },
                        tab_epa: {
                            disabled: !this.state.editingActive
                        }
                    };

                    body = (
                        <div className="identify-body" role="body">
                            {prevResultButton}
                            <GwQtDesignerForm buttonAlwaysActive form_xml={result.form_xml} getInitialValues={false} loadWidgetsProperties={this.loadWidgetsProperties}
                                onTabChanged={this.onTabChanged} onWidgetAction={this.onWidgetAction}
                                onWidgetValueChange={this.onWidgetValueChange}
                                style={{height: "100%"}}
                                useNew widgetsProperties={widgetsProperties}
                            />
                        </div>
                    );
                }
            }
            resultWindow = (
                <ResizeableWindow dockable={this.props.dockable} extraControls={[
                    {
                        active: this.state.editingActive,
                        icon: "edited",
                        callback: () => {
                            this.setEditingActive(!this.state.editingActive);
                        },
                        msgid: "Toggle editing mode"
                    }
                ]} icon="giswater" initialHeight={this.props.initialHeight}
                initialWidth={this.props.initialWidth} initialX={this.props.initialX}
                initialY={this.props.initialY} initiallyDocked={this.props.initiallyDocked} key="GwInfoWindow" minHeight={this.props.minHeight}
                minimizeable onClose={() => {
                    if (this.checkIfDataModified()) {
                        if (confirm(LocaleUtils.tr("identify.confirmDiscard"))) {
                            this.clearResults();
                        }
                    } else {
                        this.clearResults();
                    }
                }}
                scrollable={false}
                title={typeof headerText !== "undefined" ? headerText : "Info"}
                splitScreenWhenDocked
                splitTopAndBottomBar
                >
                    {body}
                </ResizeableWindow>
            );
        }
        return [resultWindow, (
            <TaskBar key="GwInfoTaskBar" onHide={this.onToolClose} onShow={this.onShow} task="GwInfo">
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
    selection: state.selection,
    theme: state.theme.current,
    identifyResult: state.info.identifyResult
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
    setIdentifyResult: setIdentifyResult,
    setCurrentTask: setCurrentTask
})(GwInfo);
