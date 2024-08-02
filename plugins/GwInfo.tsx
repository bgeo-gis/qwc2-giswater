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
import {setCurrentTask} from 'qwc2/actions/task';

import GwQtDesignerForm from '../components/GwQtDesignerForm';
import GwUtils from '../utils/GwUtils';

import './style/GwInfoGraphs.css';

import { setIdentifyResult } from '../actions/info';


type GwInfoProps = {
    addLayerFeatures: Function,
    addMarker: Function,
    click: any,
    currentIdentifyTool: string,
    currentTask: string,
    dockable: boolean | string,
    identifyResult: any,
    initialHeight: number,
    initialWidth: number,
    initialX: number,
    initialY: number,
    initiallyDocked: boolean,
    layers: Array<any>,
    map: any,
    minHeight: number,
    onClose: Function,
    panTo: Function,
    processFinished: Function,
    processStarted: Function,
    refreshLayer: Function,
    removeLayer: Function,
    removeMarker: Function,
    selection: any,
    setIdentifyResult: Function,
    theme: any,
    setCurrentTask: Function
};

type GwInfoState = {
    mode: string,
    identifyResult: any,
    prevIdentifyResult: any,
    pendingRequests: boolean,
    currentTab: any,
    tableValues: any,
    filterValues: any,
    dataValues: any,
    epaValues: any,
    widgetsProperties: any
};


class GwInfo extends React.Component<GwInfoProps, GwInfoState> {
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
        setIdentifyResult: PropTypes.func,
        theme: PropTypes.object,
        setCurrentTask: PropTypes.func
    };
    static defaultProps: Partial<GwInfoProps> = {
        minHeight: 500,
        initialWidth: 480,
        initialHeight: 600,
        initialX: 0,
        initialY: 0,
        identifyResult: null,
        initiallyDocked: false,
        dockable: true
    };
    static defaultState: GwInfoState = {
        mode: 'Point',
        identifyResult: null,
        prevIdentifyResult: null,
        pendingRequests: false,
        currentTab: {},
        tableValues: {},
        filterValues: {},
        dataValues: {},
        epaValues: {},
        widgetsProperties: {}
    };

    constructor(props) {
        super(props);
        this.state = GwInfo.defaultState;
    }
    componentDidUpdate(prevProps: GwInfoProps, prevState: GwInfoState) {
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
            this.highlightResult(this.state.identifyResult || this.props.identifyResult);
            this.addMarkerToResult(this.state.identifyResult || this.props.identifyResult);
        }
        // Check if list need to update (current tab or filters changed)
        if (!isEmpty(this.state.currentTab) && ((prevState.currentTab !== this.state.currentTab) || (prevState.filterValues !== this.state.filterValues))) {
            this.getList(this.state.currentTab.tab);
        }
    }
    onWidgetAction = (action, widget, value?) => {
        let pendingRequests = false;
        switch (action.functionName) {
        case "featureLink":
        case "get_info_node": {
            this.props.removeLayer("searchselection");

            this.setState((state) => ({ identifyResult: {}, prevIdentifyResult: state.identifyResult, pendingRequests: pendingRequests }));

            const requestUrl = GwUtils.getServiceUrl("info");
            if (!isEmpty(requestUrl)) {
                const params = {
                    theme: this.props.theme.title,
                    id: widget.property.text,
                    tableName: "v_edit_node"
                };
                pendingRequests = true;
                axios.get(requestUrl + "fromid", { params: params }).then((response) => {
                    const result = response.data;
                    this.setState({ identifyResult: result, pendingRequests: false });
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
            console.log("dataValues :>>", this.state.dataValues);
            const data = {id: this.state.identifyResult.body.feature.id, tableName: "v_edit_arc", fields: this.state.dataValues};
            this.setFields(data);
            break;
        }
        case "cancel":
            this.clearResults();
            break;
        case "manage_visit_class":
            this.getList(this.state.currentTab.tab, value);
            break;

        default:
            console.warn(`Action \`${action.functionName}\` cannot be handled.`, action);
            break;
        }
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
            let tabName = this.state.currentTab.tab?.name || 'pendingFilters';
            this.setState((state) => ({ filterValues: { ...state.filterValues, [tabName] : {...state.filterValues[tabName], [widget.name]: {columnname: columnname, value: value, filterSign: filterSign}}}}));
        } else {
            let widgetFunction = JSON.parse(widget.property.widgetfunction)
            this.onWidgetAction(widgetFunction, widget, value);
        }

        const newDataValue = {};
        if (widget.containingLayout === "lyt_tab_data") {
            newDataValue[widget.name] = {value: value, columnname: columnname};
        }
        const newEpaValue = {};
        if (widget.containingLayout === "lyt_tab_epa") {
            newEpaValue[widget.name] = {value: value, columnname: columnname};
        }
        
        this.setState((state) => ({
            widgetsProperties: { ...state.widgetsProperties, [widget.name]: {value: value} },
            dataValues: {...state.dataValues, ...newDataValue },
            epaValues: {...state.epaValues, ...newEpaValue }
        }));
    };
    loadWidgetsProperties = (widgetsProperties) => {
        this.setState({ widgetsProperties: widgetsProperties });
    };
    onTabChanged = (tab, widget) => {
        this.setState({ currentTab: {tab: tab, widget: widget} });
    };
    getList = (tab, _tableName?) => {
        try {
            const requestUrl = GwUtils.getServiceUrl("info");

            let tableWidget = null;
            let tableName = null;
            GwUtils.forEachWidgetInLayout(tab.layout, (widget) => {
                if (widget.class === "QTableView" || widget.class === "QTableWidget") {
                    tableWidget = widget; // There should only be one
                }
            });

            if (isEmpty(tableWidget) || isEmpty(requestUrl)) {
                return;
            }
            console.log(this.state.identifyResult)
            const prop = tableWidget.property || {};
            let idName = this.state.identifyResult.body.feature.idName;
            if (tab.name === 'tab_hydrometer' || tab.name === 'tab_hydrometer_val') {
                idName = 'feature_id';
            }

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
                id: this.state.identifyResult.body.feature.id,
                filterFields: JSON.stringify(this.state.filterValues[this.state.currentTab.tab?.name]),
                // "filterSign": action.params.tabName
            };
            axios.get(requestUrl + "getlist", { params: params }).then((response) => {
                const result = response.data;
                this.setState((state) => ({
                    widgetsProperties: {
                        ...state.widgetsProperties,
                        [tableWidget.name]: {
                            value: result.body?.data.fields?.at(0).value
                        }
                    } 
                }));
            }).catch((e) => {
                console.log(e);
            });
        } catch (error) {
            console.warn(error);
        }

    };
    setFields = (data) => {
        const id = data.id;
        const tableName = data.tableName;
        const fields = data.fields;

        const requestUrl = GwUtils.getServiceUrl("util");
        if (!isEmpty(requestUrl)) {
            const params = {
                theme: this.props.theme.title,
                id: id,
                tableName: tableName,
                fields: JSON.stringify(fields)
            };

            this.props.processStarted("info_msg", "Update feature");
            axios.put(requestUrl + "setfields", { ...params }).then((response) => {
                const result = response.data;
                this.props.processFinished("info_msg", result.status === "Accepted", result.message.text);
                // refresh map
                if (this.props.theme.tiled) {
                    // this.refreshTiles()
                } else {
                    this.props.refreshLayer(layer => layer.role === LayerRole.THEME);
                }
                // close
                this.clearResults();
            }).catch((e) => {
                console.warn(e);
                this.props.processFinished("info_msg", false, `Execution failed "${e}"`);
            });
        }
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
                console.log("LAYEERS: ", queryLayers.join(','));
                pendingRequests = true;
                axios.get(requestUrl + "fromcoordinates", { params: params }).then(response => {
                    const result = response.data;
                    if ((isEmpty(result) || !result.form_xml) && !this.props.theme.tiled) {
                        this.onToolClose();
                        this.props.setCurrentTask("Identify", 'Point', null, {pos: clickPoint, exitTaskOnResultsClose: true});
                        return;
                    }
                    this.setState({ identifyResult: result, prevIdentifyResult: null, pendingRequests: false });
                    this.highlightResult(result);
                }).catch((e) => {
                    console.log(e);
                    this.setState({ pendingRequests: false });
                });
            }
            this.props.addMarker('identify', clickPoint, '', this.props.map.projection);
            this.setState({ identifyResult: {}, prevIdentifyResult: null, pendingRequests: pendingRequests });
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
        if (!isEmpty(result) && result?.body?.feature?.geometry ) {
            const center = GwUtils.getGeometryCenter(result.body.feature.geometry.st_astext);
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
        this.setState({ identifyResult: null, pendingRequests: false, mode: 'Point' });
    };
    clearResults = () => {
        this.props.removeMarker('identify');
        this.props.removeLayer("identifyslection");
        this.props.setIdentifyResult(null);
        this.setState({ identifyResult: null, pendingRequests: false, widgetsProperties: {}, dataValues: {}, filterValues: {} });
        if (this.props.onClose) {
            this.props.onClose();
        }
    };
    showPrevResult = () => {
        this.setState((state) => ({ identifyResult: state.prevIdentifyResult, prevIdentifyResult: null }));
        this.highlightResult(this.state.prevIdentifyResult);
        this.addMarkerToResult(this.state.prevIdentifyResult);
        this.panToResult(this.state.prevIdentifyResult);
    };
    render() {
        let resultWindow = null;
        const identifyResult = this.state.identifyResult || this.props.identifyResult;
        const headerText = identifyResult?.body?.form?.headerText;
        if (this.state.pendingRequests === true || identifyResult  !== null) {
            let body = null;
            if (isEmpty(identifyResult) || !identifyResult.form_xml) {
                let text;
                if (this.state.pendingRequests === true) {
                    text = LocaleUtils.tr("identify.querying")
                } else {
                    text = LocaleUtils.tr("identify.noresults")
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
                    body = (
                        <div className="identify-body" role="body">
                            {prevResultButton}
                            <GwQtDesignerForm onWidgetAction={this.onWidgetAction} form_xml={result.form_xml} getInitialValues={false}
                                onTabChanged={this.onTabChanged} readOnly={false} onWidgetValueChange={this.onWidgetValueChange}
                                loadWidgetsProperties={this.loadWidgetsProperties}
                                widgetsProperties={this.state.widgetsProperties} useNew={true}
                            />
                        </div>
                    );
                }
            }
            resultWindow = (
                <ResizeableWindow dockable={this.props.dockable} icon="giswater" initialHeight={this.props.initialHeight} initialWidth={this.props.initialWidth}
                    initialX={this.props.initialX} initialY={this.props.initialY}
                    initiallyDocked={this.props.initiallyDocked} key="GwInfoWindow" minHeight={this.props.minHeight} minimizeable
                    onClose={this.clearResults}
                    scrollable={false}  title={typeof headerText !== "undefined" ? headerText : "Info"}
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
