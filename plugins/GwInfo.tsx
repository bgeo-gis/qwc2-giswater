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
import GwInfoDmaForm from '../components/GwInfoDmaForm';
import GwUtils from '../utils/GwUtils';

import Chartist from 'chartist';
import ChartistComponent from 'react-chartist';
import ChartistAxisTitle from 'chartist-plugin-axistitle';
import Icon from 'qwc2/components/Icon';
import ChartistZoom from 'chartist-plugin-zoom';

import './style/GwInfoGraphs.css';

import { setIdentifyResult } from '../actions/info';

let resetZoom = null;

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
    showGraph: boolean,
    graphJson: any,
    tableValues: any,
    filterValues: any,
    widgetValues: any,
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
        showGraph: false,
        graphJson: null,
        tableValues: {},
        filterValues: {},
        widgetValues: {},
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
            if (this.state.mode === "Dma") {
                this.identifyDma(prevProps);
            }
            if (this.state.mode === "Scada") {
                this.showGraph(prevProps);
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
            console.log("widgetValues :>>", this.state.widgetValues);
            const data = {id: this.state.identifyResult.body.feature.id, tableName: "v_edit_arc", fields: this.state.widgetValues};
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
            console.warn(`Action \`${action.functionName}\` cannot be handled.`);
            break;
        }
    };
    onWidgetValueChange = (widget, value, isInitialValue=false) => {
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
            if (!isInitialValue){
                let tabName = this.state.currentTab.tab?.name || 'pendingFilters';
                this.setState((state) => ({ filterValues: { ...state.filterValues, [tabName] : {...state.filterValues[tabName], [widget.name]: {columnname: columnname, value: value, filterSign: filterSign}}}}));
            }

        } else {
            let widgetFunction = JSON.parse(widget.property.widgetfunction)
            this.onWidgetAction(widgetFunction, widget, value);
        }

        this.setState((state) => ({
            widgetsProperties: { ...state.widgetsProperties, [widget.name]: {value: value} },
            widgetValues: {...state.widgetValues, [widget.name]: {columnname: columnname, value: value}} 
        }));

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
            if (tab.name === 'tab_visit') {
                tableName =  _tableName || this.state.widgetValues.visit_class?.value;
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
                // this.setState((state) => ({ tableValues: {...state.tableValues, [tableWidget.name]: result} }));
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
    showGraph = (prevProps) => {
        const clickPoint = this.queryPoint(prevProps);
        if (clickPoint) {
            // let pendingRequests = false;

            const requestUrl = GwUtils.getServiceUrl("info");
            if (!isEmpty(requestUrl)) {
                const params = {
                    theme: this.props.theme.title,
                    node_id: this.state.identifyResult.body.feature.id
                };

                // pendingRequests = true
                axios.get(requestUrl + "getgraph", { params: params }).then(response => {
                    const result = response.data;
                    console.log("getGraph -> ", result);
                    if (this.state.mode === "Scada") { this.setState({identifyResult: result});}
                    this.setState({ graphJson: result, showGraph: true, pendingRequests: false });
                    this.highlightResult(result);
                }).catch((e) => {
                    console.log(e);
                    this.setState({ pendingRequests: false });
                });
            }
        }
    };

    identifyDma = (prevProps) => {
        const clickPoint = this.queryPoint(prevProps);
        if (clickPoint) {
            // Remove any search selection layer to avoid confusion
            this.props.removeLayer("searchselection");
            let pendingRequests = false;

            const requestUrl = GwUtils.getServiceUrl("info");
            if (!isEmpty(requestUrl)) {
                const epsg = GwUtils.crsStrToInt(this.props.map.projection);
                const zoomRatio = MapUtils.computeForZoom(this.props.map.scales, this.props.map.zoom);
                const params = {
                    theme: this.props.theme.title,
                    epsg: epsg,
                    xcoord: clickPoint[0],
                    ycoord: clickPoint[1],
                    zoomRatio: zoomRatio
                };

                pendingRequests = true;
                axios.get(requestUrl + "getdma", { params: params }).then(response => {
                    const result = response.data;
                    this.setState({ identifyResult: result, prevIdentifyResult: null, pendingRequests: false });
                }).catch((e) => {
                    console.error(e);
                    this.setState({ pendingRequests: false });
                });
            }
            this.props.removeMarker('identify');
            this.props.addMarker('identify', clickPoint, '', this.props.map.projection);
            this.setState({ identifyResult: {}, prevIdentifyResult: null, pendingRequests: pendingRequests });

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
        this.setState({ identifyResult: null, pendingRequests: false, showGraph: false, graphJson: null, mode: 'Point' });
    };
    clearResults = () => {
        this.props.removeMarker('identify');
        this.props.removeLayer("identifyslection");
        this.props.setIdentifyResult(null);
        this.setState({ identifyResult: null, pendingRequests: false, widgetsProperties: {}, widgetValues: {}, filterValues: {}, showGraph: false, graphJson: null });
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

    renderGraph = () => {
        const result = this.state.graphJson;
        const fieldsReal = result.body.data.fields.real_data;
        const fieldsGen = result.body.data.fields.gen_data;
        const labels = [];
        const line1 = [];
        const line2 = [];

        fieldsReal.forEach(element => {
            labels.push(element.time.split(':')[0]);
            line1.push({x: parseInt(element.time.split(':')[0], 10), y: element.head});
        });

        fieldsGen.forEach(element => {
            labels.push(element.time.split(':')[0]);
            line2.push({x: parseInt(element.time.split(':')[0], 10), y: element.head});
        });

        const data = {
            labels: labels,
            series: [
                {
                    name: 'line1',
                    data: line1,
                    className: 'ct-line-real'
                },
                {
                    name: 'line2',
                    data: line2,
                    className: 'ct-line-gen'
                }
            ]
        };
        const options = {
            width: window.innerWidth - 20 + 'px',
            height: 200,
            chartPadding: {left: 5, bottom: 1, top: 0},
            series: {
                line1: {
                    low: 0,
                    showArea: true,
                    showPoint: false,
                    lineSmooth: true
                },
                line2: {
                    low: 0,
                    showArea: true,
                    showPoint: false,
                    lineSmooth: true
                }
            },
            axisX: {
                type: Chartist.AutoScaleAxis,
                onlyInteger: true,
                scaleMinSpace: 0
            },
            // Plugins used on profile
            plugins: [
                // Add titles to the axisY and axisX
                // eslint-disable-next-line
                ChartistAxisTitle({
                    axisX: {
                        axisTitle: "Tiempo",
                        axisClass: 'ct-axis-title',
                        offset: {x: 0, y: 30},
                        textAnchor: 'middle'
                    },
                    axisY: {
                        axisTitle: "Elevación",
                        axisClass: 'ct-axis-title',
                        offset: {x: -10, y: 10},
                        flipTitle: true
                    }
                }),

                // Do zoom on x axis
                // eslint-disable-next-line
                ChartistZoom({
                    onZoom: function(chart, reset) { resetZoom = reset; },
                    noClipY: true,
                    autoZoomY: {high: true, low: true}
                })
            ]};
        const listeners = {};
        return (
            <div id="GwInfoGraph">
                <ChartistComponent data={data} listener={listeners} options={options} type="Line" />
                {/* <ChartistComponent data={data} listener={listeners} options={options} ref={el => {this.plot = el; }} type="Line" /> */}
                <div>
                    <Icon className="resetzoom-profile-button" icon="zoom" onClick={() => {if (resetZoom) resetZoom();}}
                        title={"Reset Zoom"} />
                </div>
            </div>
        );
    }

    loadWidgetsProperties = (widgets) => {
        const widgetValues = Object.entries(widgets).reduce((acc, [name, data]: any[]) => {
            if (data.value === null) {
                return acc;
            }

            let columnname = name;
            if (data.props.widgetfunction !== "null") {
                columnname = JSON.parse(data.props.widgetfunction)?.parameters?.columnfind;
            }
            columnname = columnname ?? name;

            return {...acc, [name]: {columnname: columnname, value: data.value}};
        });

        this.setState({ widgetValues: widgetValues });
    }
    render() {
        let resultWindow = null;
        let graphWindow = null;
        let noIdentifyResult = false;
        const identifyResult = this.state.identifyResult || this.props.identifyResult;
        const headerText = identifyResult?.body?.form?.headerText;
        if (this.state.pendingRequests === true || identifyResult  !== null) {
            let body = null;
            if (isEmpty(identifyResult) || !identifyResult.form_xml) {
                if (this.state.pendingRequests === true) {
                    body = (<div className="identify-body" role="body"><span className="identify-body-message">{LocaleUtils.tr("identify.querying")}</span></div>);
                } else {
                    noIdentifyResult = true;
                    body = (<div className="identify-body" role="body"><span className="identify-body-message">{LocaleUtils.tr("identify.noresults")}</span></div>);
                }
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
                } else if (this.state.mode === "Dma") {
                    body = (
                        <div className="identify-body" role="body">
                            <GwInfoDmaForm jsonData ={result.body.data}/>
                        </div>
                    );
                }
            }
            resultWindow = (
                <ResizeableWindow dockable={this.props.dockable} icon="giswater" initialHeight={this.state.mode === "Dma" ? 800 : this.props.initialHeight} initialWidth={this.props.initialWidth}
                    initialX={this.props.initialX} initialY={this.props.initialY}
                    initiallyDocked={this.props.initiallyDocked} key="GwInfoWindow" minHeight={this.props.minHeight} minimizeable
                    onClose={this.clearResults}
                    scrollable={this.state.mode === "Dma" ? true : false}  title={typeof headerText !== "undefined" ? headerText : "Info"}
                >
                    {body}
                </ResizeableWindow>
            );

            if (this.state.showGraph && !noIdentifyResult && this.state.graphJson !== null) {
                graphWindow = this.renderGraph();
            }
        }
        return [this.state.mode !== "Scada" ? resultWindow : null, graphWindow, (
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
