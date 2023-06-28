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
import { LayerRole, addMarker, removeMarker, removeLayer, addLayerFeatures, refreshLayer } from 'qwc2/actions/layers';
import ResizeableWindow from 'qwc2/components/ResizeableWindow';
import TaskBar from 'qwc2/components/TaskBar';
import IdentifyUtils from 'qwc2/utils/IdentifyUtils';
import LocaleUtils from 'qwc2/utils/LocaleUtils';
import MapUtils from 'qwc2/utils/MapUtils';
import VectorLayerUtils from 'qwc2/utils/VectorLayerUtils';
import ConfigUtils from 'qwc2/utils/ConfigUtils';
import { panTo } from 'qwc2/actions/map';
import { processFinished, processStarted } from 'qwc2/actions/processNotifications';

import GwQtDesignerForm from '../components/GwQtDesignerForm';
import GwInfoDmaForm from '../components/GwInfoDmaForm';
import GwUtils from '../utils/GwUtils';

import Chartist from 'chartist';
import ChartistComponent from 'react-chartist';
import ChartistAxisTitle from 'chartist-plugin-axistitle';
import Icon from 'qwc2/components/Icon';
import Zoom from 'qwc2-giswater/libs/bower_components/chartist-plugin-zoom/dist/chartist-plugin-zoom';

import './style/GwInfoGraphs.css';

var resetZoom = null;

class GwInfo extends React.Component {
    static propTypes = {
        addMarker: PropTypes.func,
        click: PropTypes.object,
        currentIdentifyTool: PropTypes.string,
        currentTask: PropTypes.string,
        minHeight: PropTypes.number,
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
        selection: PropTypes.object,
        identifyResult: PropTypes.object,
        onClose: PropTypes.func,
        dockable: PropTypes.oneOfType([PropTypes.bool, PropTypes.string])
    }
    static defaultProps = {
        replaceImageUrls: true,
        minHeight: 500,
        initialWidth: 480,
        initialHeight: 600,
        initialX: 0,
        initialY: 0,
        identifyResult: null,
        initiallyDocked: false,
        dockable: true
    }
    state = {
        mode: 'Point',
        identifyResult: null,
        prevIdentifyResult: null,
        pendingRequests: false,
        currentTab: {},
        feature_id: null,
        showGraph: false,
        graphJson: null,
        showVisit: false,
        visitJson: null,
        visitWidgetValues: {},
        tableValues: {},
        filters: {},
        widgetValues: {}
    }

    constructor(props) {
        super(props);
        if(props.identifyResult){
            this.state.identifyResult = props.identifyResult;            
        }
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
            if (this.state.mode === "Dma") {
                this.identifyDma(prevProps)
            }
            if (this.state.mode === "Scada"){
                this.showGraph(prevProps)
            }
            
        }
        // Manage highlight and marker from result
        if(this.props.identifyResult && this.props.identifyResult != prevProps.identifyResult) {
            this.highlightResult(this.state.identifyResult)
            this.addMarkerToResult(this.state.identifyResult)
        }
        // Check if list need to update (current tab or filters changed)
        if (!isEmpty(this.state.currentTab) && ((prevState.currentTab !== this.state.currentTab) || (prevState.filters !== this.state.filters))) {
            this.getList(this.state.currentTab.tab, this.state.currentTab.widget);
        }
    }
    crsStrToInt = (crs) => {
        const parts = crs.split(':')
        return parseInt(parts.slice(-1))
    }
    dispatchButton = (action, widget) => {
        let pendingRequests = false;
        switch (action.functionName) {
            case "featureLink":
            case "get_info_node":
                this.props.removeLayer("searchselection");

                this.setState((state) => ({ identifyResult: {}, prevIdentifyResult: state.identifyResult, pendingRequests: pendingRequests }));

                const request_url = GwUtils.getServiceUrl("info");
                if (!isEmpty(request_url)) {

                    const params = {
                        "theme": this.props.theme.title,
                        "id": widget.property.text,
                        "tableName": "v_edit_node"
                    }
                    pendingRequests = true
                    axios.get(request_url + "fromid", { params: params }).then((response) => {
                        const result = response.data
                        this.setState({ identifyResult: result, pendingRequests: false });
                        this.panToResult(result)
                        this.highlightResult(result)
                        this.addMarkerToResult(result)
                    }).catch((e) => {
                        console.log(e);
                        this.setState({ pendingRequests: false });
                    });
                }
                break;
            case "accept":
                console.log("widgetValues :>>", this.state.widgetValues);
                const data = {id: this.state.feature_id, tableName: "v_edit_arc", fields: this.state.widgetValues};
                this.setFields(data);
                
                break;
            case "cancel":
                this.clearResults();
                break;
            default:
                console.warn(`Action \`${action.functionName}\` cannot be handled.`)
                break;
        }
    }
    updateField = (widget, value) => {
        console.log("widget :>> ", widget);
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
            this.setState((state) => ({ filters: {...state.filters, [widget.name]: {columnname: columnname, value: value, filterSign: filterSign}} }));
        } else {
            this.setState((state) => ({ widgetValues: {...state.widgetValues, [widget.name]: {columnname: columnname, value: value}} }))
        }
    }
    onTabChanged = (tab, widget) => {
        this.setState({ currentTab: {tab: tab, widget: widget} });
    }
    getList = (tab, widget) => {
        try {
            const request_url = GwUtils.getServiceUrl("info");

            let tableWidget = null;
            GwUtils.forEachWidgetInLayout(tab.layout, (widget) => {
                if (widget.class === "QTableView") {
                    tableWidget = widget // There should only be one
                }
            })

            if (isEmpty(tableWidget) || isEmpty(request_url)) {
                return null;
            }
            const prop = tableWidget.property || {};
            let idName = this.state.identifyResult.body.feature.idName;
            if (tab.name === 'tab_hydrometer' || tab.name === 'tab_hydrometer_val') {
                idName = 'feature_id';
            }
            const params = {
                "theme": this.props.theme.title,
                "tabName": tab.name,  // tab.name, no? o widget.name?
                "widgetname": tableWidget.name,  // tabname_ prefix cal?
                //"formtype": this.props.formtype,
                "tableName": prop.linkedobject,
                "idName": idName,
                "id": this.state.identifyResult.body.feature.id,
                "filterFields": JSON.stringify(this.state.filters)
                //"filterSign": action.params.tabName
            }
            axios.get(request_url + "getlist", { params: params }).then((response) => {
                const result = response.data
                console.log("getlist done:", result);
                this.setState((state) => ({ tableValues: {...state.tableValues, [tableWidget.name]: result} }));
            }).catch((e) => {
                console.log(e);
            })
        } catch (error) {
            console.warn(error);
        }

    }
    setFields = (data) => {
        const id = data.id;
        const tableName = data.tableName;
        const fields = data.fields;

        const request_url = GwUtils.getServiceUrl("util");
        if (!isEmpty(request_url)) {
            const params = {
                "theme": this.props.theme.title,
                "id": id,
                "tableName": tableName,
                "fields": JSON.stringify(fields)
            };

            this.props.processStarted("info_msg", "Update feature");
            axios.put(request_url + "setfields", { ...params }).then((response) => {
                const result = response.data;
                this.props.processFinished("info_msg", result.status === "Accepted", result.message.text);
                // refresh map
                if (this.props.theme.tiled) {
                    //this.refreshTiles()
                }
                else {
                    this.props.refreshLayer(layer => layer.role === LayerRole.THEME);
                }
                // close
                this.clearResults();
            }).catch((e) => {
                console.warn(e);
                this.props.processFinished("info_msg", false, `Execution failed "${e}"`);
            });
        }
    }
    showGraph = (prevProps) => {
        const clickPoint = this.queryPoint(prevProps);
        if (clickPoint) {
            // let pendingRequests = false;

            const request_url = GwUtils.getServiceUrl("info");
            if (!isEmpty(request_url)) {
                console.log("theme -> ", this.props.theme.title)
                const params = {
                    "theme": this.props.theme.title,
                    "node_id": this.state.feature_id
                }

                // pendingRequests = true
                axios.get(request_url + "getgraph", { params: params }).then(response => {
                    const result = response.data
                    console.log("getGraph -> ", result)
                    if (this.state.mode === "Scada"){ this.setState({identifyResult: result})}
                    this.setState({ graphJson: result, showGraph: true, pendingRequests: false });
                    this.highlightResult(result)
                }).catch((e) => {
                    console.log(e);
                    this.setState({ pendingRequests: false });
                });
            }
        }
    }

    showVisit = (prevProps) => {
        this.setState({ showVisit: true });

        const request_url = GwUtils.getServiceUrl("visit");
        if (!isEmpty(request_url)) {
            const params = {
                "theme": this.props.theme.title,
                "visit_id": 10,
                "featureType": "node",
                "id": this.state.feature_id
            }

            axios.get(request_url + "get", { params: params }).then(response => {
                const result = response.data
                console.log("getVisit -> ", result)
                this.setState({ visitJson: result, showVisit: true, pendingRequests: false });
            }).catch((e) => {
                console.log(e);
                this.setState({ pendingRequests: false });
            });
        }
    }

    identifyDma = (prevProps) => {
        const clickPoint = this.queryPoint(prevProps);
        if (clickPoint) {
            // Remove any search selection layer to avoid confusion
            this.props.removeLayer("searchselection");
            let pendingRequests = false;

            const request_url = GwUtils.getServiceUrl("info");
            if (!isEmpty(request_url)) {
                const epsg = this.crsStrToInt(this.props.map.projection)
                const zoomRatio = MapUtils.computeForZoom(this.props.map.scales, this.props.map.zoom)
                const params = {
                    "theme": this.props.theme.title,
                    "epsg": epsg,
                    "xcoord": clickPoint[0],
                    "ycoord": clickPoint[1],
                    "zoomRatio": zoomRatio
                }

                pendingRequests = true
                axios.get(request_url + "getdma", { params: params }).then(response => {
                    const result = response.data;
                    console.log("identifypointid -> ", result.body.data.info.values.info.dma);
                    this.setState({ identifyResult: result, prevIdentifyResult: null, pendingRequests: false });
                }).catch((e) => {
                    console.log(e);
                    this.setState({ pendingRequests: false });
                });
            }
            this.props.removeMarker('identify');
            this.props.addMarker('identify', clickPoint, '', this.props.map.projection);
            this.setState({ identifyResult: {}, prevIdentifyResult: null, pendingRequests: pendingRequests });

        }
    }

    identifyPoint = (prevProps) => {
        const clickPoint = this.queryPoint(prevProps);
        if (clickPoint) {
            if(this.props.onClose){
                this.props.onClose();
            }
            // Remove any search selection layer to avoid confusion
            this.props.removeLayer("searchselection");
            let pendingRequests = false;

            const queryableLayers = IdentifyUtils.getQueryLayers(this.props.layers, this.props.map)

            const request_url = GwUtils.getServiceUrl("info");
            if (!isEmpty(queryableLayers) && !isEmpty(request_url)) {
                const queryLayers = queryableLayers.reduce((acc, layer) => {
                    return acc.concat(layer.queryLayers)
                }, [])

                const epsg = this.crsStrToInt(this.props.map.projection)
                const zoomRatio = MapUtils.computeForZoom(this.props.map.scales, this.props.map.zoom)
                const params = {
                    "theme": this.props.theme.title,
                    "epsg": epsg,
                    "xcoord": clickPoint[0],
                    "ycoord": clickPoint[1],
                    "zoomRatio": zoomRatio,
                    "layers": queryLayers.join(',')
                }

                pendingRequests = true
                axios.get(request_url + "fromcoordinates", { params: params }).then(response => {
                    const result = response.data;
                    this.setState({ identifyResult: result, prevIdentifyResult: null, pendingRequests: false, feature_id: result.body.feature.id });
                    this.highlightResult(result);
                }).catch((e) => {
                    console.log(e);
                    this.setState({ pendingRequests: false });
                });
            }
            this.props.addMarker('identify', clickPoint, '', this.props.map.projection);
            this.setState({ identifyResult: {}, prevIdentifyResult: null, pendingRequests: pendingRequests });
        }
    }

    highlightResult = (result) => {
        // console.log('result :>> ', result);
        if (isEmpty(result) || !result?.body?.feature?.geometry) {
            this.props.removeLayer("identifyslection")
        } else {
            const layer = {
                id: "identifyslection",
                role: LayerRole.SELECTION
            };
            const crs = this.props.map.projection
            console.log("geometry -> ",result.body.feature.geometry.st_astext);
            console.log("crs -> ",crs);
            const geometry = VectorLayerUtils.wktToGeoJSON(result.body.feature.geometry.st_astext, crs, crs)
            const feature = {
                id: result.body.feature.id,
                geometry: geometry.geometry
            }
            this.props.addLayerFeatures(layer, [feature], true)
        }
    }
    panToResult = (result) => {
        // TODO: Maybe we should zoom to the result as well
        if (!isEmpty(result)) {
            const center = GwUtils.getGeometryCenter(result.body.feature.geometry.st_astext)
            this.props.panTo(center, this.props.map.projection)
        }
    }
    addMarkerToResult = (result) => {
        if (!isEmpty(result) && result?.body?.feature?.geometry ) {            
            const center = GwUtils.getGeometryCenter(result.body.feature.geometry.st_astext)
            this.props.addMarker('identify', center, '', this.props.map.projection);
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
    onShow = (mode) => {
        this.clearResults();
        this.setState({mode: mode || 'Point'});
    }
    onToolClose = () => {
        this.props.removeMarker('identify');
        this.props.removeLayer("identifyslection");
        this.setState({ identifyResult: null, pendingRequests: false, showGraph: false, graphJson: null, mode: 'Point' });
    }
    clearResults = () => {
        this.props.removeMarker('identify');
        this.props.removeLayer("identifyslection");
        this.setState({ identifyResult: null, pendingRequests: false, widgetValues: {}, filters: {}, showGraph: false, graphJson: null });
        if(this.props.onClose){
            this.props.onClose();
        }
    }
    showPrevResult = () => {
        const result = this.state.prevIdentifyResult
        this.setState({ identifyResult: result, prevIdentifyResult: null });
        this.highlightResult(result);
        this.addMarkerToResult(result);
        this.panToResult(result);
    }
    closeVisit = () => {
        this.setState({ showVisit: false, visitJson: null, visitWidgetValues: {} });
    }
    render() {
        let resultWindow = null;
        let graphWindow = null;
        let visitWindow = null;
        let noIdentifyResult = false;
        if (this.state.pendingRequests === true || this.state.identifyResult  !== null) {
            let body = null;
            if (isEmpty(this.state.identifyResult) || !this.state.identifyResult.form_xml) {
                if (this.state.pendingRequests === true) {
                    body = (<div className="identify-body" role="body"><span className="identify-body-message">{LocaleUtils.tr("identify.querying")}</span></div>);
                } else {
                    noIdentifyResult = true;
                    body = (<div className="identify-body" role="body"><span className="identify-body-message">{LocaleUtils.tr("identify.noresults")}</span></div>);
                }
            } else {
                const result = this.state.identifyResult ;
                const prevResultButton = !isEmpty(this.state.prevIdentifyResult) ? (<button className='button' onClick={this.showPrevResult}>Back</button>) : null;
                if (result.schema === null) {
                    body = null;
                    this.props.processStarted("info_msg", "GwInfo Error!");
                    this.props.processFinished("info_msg", false, "Couldn't find schema, please check service config.");
                }
                else if (this.state.mode === "Point") {
                    const widgetValues = { 
                        ...this.state.filters,
                        ...this.state.tableValues,
                        ...this.state.widgetValues
                    }
                    body = (
                        <div className="identify-body" role="body">
                            {prevResultButton}
                            <GwQtDesignerForm form_xml={result.form_xml} readOnly={false} getInitialValues={false}
                                dispatchButton={this.dispatchButton} updateField={this.updateField} onTabChanged={this.onTabChanged}
                                widgetValues={widgetValues}
                            />                            
                        </div>
                    )
                }
                else if (this.state.mode === "Dma") {
                    body = (
                        <div className="identify-body" role="body">
                            <GwInfoDmaForm jsonData ={result.body.data}/>
                        </div>
                    )
                }
            }
            resultWindow = (               
                <ResizeableWindow icon="giswater" dockable={this.props.dockable} minHeight={this.props.minHeight}
                    initialHeight={this.state.mode === "Dma" ? 800 : this.props.initialHeight} initialWidth={this.props.initialWidth}
                    initialX={this.props.initialX} initialY={this.props.initialY} initiallyDocked={this.props.initiallyDocked} scrollable={this.state.mode === "Dma" ? true : false}
                    key="GwInfoWindow"
                    onClose={this.clearResults} title="Giswater Info"
                >
                    {body}
                </ResizeableWindow>
            );
                      
            if (this.state.showGraph && !noIdentifyResult && this.state.graphJson !== null){
                let result = this.state.graphJson
                let fields_real = result.body.data.fields.real_data
                let fields_gen = result.body.data.fields.gen_data
                let labels = [];
                let line1 = [];
                let line2 = [];

                fields_real.forEach(element => {
                    labels.push(element['time'].split(':')[0]);
                    line1.push({x: parseInt(element['time'].split(':')[0]) ,y: element['head']});
                });

                fields_gen.forEach(element => {
                    labels.push(element['time'].split(':')[0]);
                    line2.push({x: parseInt(element['time'].split(':')[0]) ,y: element['head']});
                });

                let data = {
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
                let options = {
                    width: window.innerWidth - 20 + 'px',
                    height: 200,
                    chartPadding: {left: 5, bottom: 1, top: 0},
                    series: {
                        'line1': {
                            low: 0,
                            showArea: true,
                            showPoint: false,
                            lineSmooth: true
                        },
                        'line2': {
                            low: 0,
                            showArea: true,
                            showPoint: false,
                            lineSmooth: true
                        }
                    },
                    /*
                    axisX: {
                        // Generate x labels automatically to be able to zoom
                        type: Chartist.AutoScaleAxis//,
                    },
                    */
                   /*
                    axisX: {
                        min: 0,
                        max: line1[line1.length - 1]['x']
                    },
                    */
                    axisX: {
                        type: Chartist.AutoScaleAxis,
                        onlyInteger: true,
                        scaleMinSpace: 0
                    },
                    /*,
                    axisY: {
                        type: Chartist.AutoScaleAxis
                    },
                    */
                    //Plugins used on profile
                    plugins: [
                        // Add titles to the axisY and axisX
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
                        Zoom({
                            onZoom : function(chart, reset) { resetZoom = reset; },
                            noClipY: true,
                            autoZoomY: {high: true, low: true},
                        })
                ]};
                const listeners = {};
                graphWindow = (
                    <div id="GwInfoGraph">
                        <ChartistComponent data={data} listener={listeners} options={options} ref={el => {this.plot = el; }} type="Line" />
                        <div>
                            <Icon className="resetzoom-profile-button" icon="zoom" onClick={() => {if (resetZoom) resetZoom()}}
                                title={"Reset Zoom"} />
                        </div>
                    </div>
                );

            }
            if (this.state.showVisit && !noIdentifyResult && this.state.visitJson !== null) {
                body = (
                    <div className="visit-body" role="body">
                        <GwQtDesignerForm form_xml={this.state.visitJson.form_xml} readOnly={false} 
                            getInitialValues={true} widgetValues={this.state.visitWidgetValues}
                        />
                    </div>
                )
                visitWindow = (
                    <ResizeableWindow icon="giswater"
                        initialHeight={this.props.initialHeight} initialWidth={this.props.initialWidth}
                        initialX={this.props.initialX} initialY={this.props.initialY} initiallyDocked={false} scrollable={true}
                        key="GwVisitWindow"
                        onClose={this.closeVisit} title="Giswater Visit"
                    >
                    {body}
                </ResizeableWindow>
                );
            }
        }
        return [this.state.mode !== "Scada" ? resultWindow : null , graphWindow, visitWindow, (
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
    theme: state.theme.current
});

export default connect(selector, {
    addLayerFeatures: addLayerFeatures,
    addMarker: addMarker,
    panTo: panTo,
    removeMarker: removeMarker,
    removeLayer: removeLayer,
    refreshLayer: refreshLayer,
    processFinished: processFinished,
    processStarted: processStarted
})(GwInfo);
