/**
 * Copyright BGEO. All rights reserved.
 * The program is free software: you can redistribute it and/or modify it under the terms of the GNU
 * General Public License as published by the Free Software Foundation, either version 3 of the License,
 * or (at your option) any later version
 */

import axios from 'axios';
import React from 'react';
import { connect } from 'react-redux';
import PropTypes from 'prop-types';
import isEmpty from 'lodash.isempty';
import SideBar from 'qwc2/components/SideBar';
import ResizeableWindow from 'qwc2/components/ResizeableWindow';
import IdentifyUtils from 'qwc2/utils/IdentifyUtils';
import ConfigUtils from 'qwc2/utils/ConfigUtils';
import GwUtils from '../utils/GwUtils';
import VectorLayerUtils from 'qwc2/utils/VectorLayerUtils';
import { zoomToExtent } from 'qwc2/actions/map';
import { LayerRole, refreshLayer, addLayerFeatures, removeLayer } from 'qwc2/actions/layers';
import InputContainer from 'qwc2/components/InputContainer';
import Icon from 'qwc2/components/Icon';

import GwQtDesignerForm from '../components/GwQtDesignerForm';
import { ThirtyFpsOutlined, WidgetsRounded } from '@mui/icons-material';
import 'qwc2-giswater/plugins/style/GwToolbox.css'
import 'qwc2/components/style/IdentifyViewer.css';
import { processFinished, processStarted } from 'qwc2/actions/processNotifications';

// import './style/IdentifyViewer.css';

class GwToolbox extends React.Component {
    static propTypes = {
        currentTask: PropTypes.string,
        theme: PropTypes.object,
        toolboxResult: PropTypes.object,
        initialHeight: PropTypes.number,
        initialWidth: PropTypes.number,
        initialX: PropTypes.number,
        initialY: PropTypes.number,
        initiallyDocked: PropTypes.bool,
        toolboxInitialWidth: PropTypes.number,
        removeLayer: PropTypes.func,
        processStarted: PropTypes.func,
        processFinished: PropTypes.func,
    }
    static defaultProps = {
        initialWidth: 480,
        initialHeight: 550,
        initialX: null,
        initialY: null,
        initiallyDocked: false
    }
    constructor(props) {
        super(props);
    }
    state = {
        toolResult: null,
        toolType: null,

        toolActiveTabs: {},
        executionResult: null,
        toolWidgetValues: {},

        expandedTabs: {},
        toolboxResult: null,
        pendingRequests: false,
        toolboxFilter: ""
    }
    getProcess(process_id, parentVals, callback) {
        const request_url = GwUtils.getServiceUrl("toolbox");
        if (!isEmpty(request_url)) {
            const params = {
                "theme": this.props.theme.title,
                "id": process_id,
                "parentVals": parentVals,
            }

            axios.post(request_url + "getprocess", { ...params }).then(callback || (() => {})).catch((e) => {
                console.warn(e);
            });
        }
    }
    getReport(report_id, callback) {
        const request_url = GwUtils.getServiceUrl("toolbox");
        if (!isEmpty(request_url)) {
            const params = {
                "theme": this.props.theme.title,
                "id": report_id,
            }

            axios.post(request_url + "getreport", { ...params }).then(callback || (() => {})).catch((e) => {
                console.warn(e);
            });
        }
    }
    toolClicked(type, tool) {
        console.log("Clicked:", type, tool)
        switch (type) {
            case "processes":
                if (this.state.toolResult?.body?.data.id !== tool.id) {
                    this.getProcess(tool.id, {}, (response) => {
                        const result = response.data
                        console.log("getprocess result:", result)
                        this.setState({ toolResult: result, toolType: type, toolWidgetValues: {}, toolActiveTabs: {} });
                    })
                }
                break;
            case "reports":
                if (this.state.toolResult?.body?.data.listname !== tool.id) {
                    this.getReport(tool.id, (response) => {
                        const result = response.data
                        console.log("getraport result:", result)
                        this.setState({ toolResult: result, toolType: type, toolWidgetValues: {}, toolActiveTabs: {} });
                    })
                }
                break
            default:
                console.warn(`Type \`${type}\` cannot be handled.`)
                break;
        }
    }
    clearToolManager = () => {
        this.setState({ toolResult: null, toolType: null, executionResult: null, toolWidgetValues: {}, toolActiveTabs: {} })
    }
    onShow = () => {
        let pendingRequests = false;

        const request_url = GwUtils.getServiceUrl("toolbox");
        if (!isEmpty(request_url)) {
            // Get request paramas
            const params = {
                "theme": this.props.theme.title,
                "filter": this.state.toolboxFilter
            }

            // Send request
            pendingRequests = true
            this.getToolbox(params);
        }
        // Set "Waiting for request..." message
        this.setState({ toolboxResult: {}, pendingRequests: pendingRequests });
    }
    getToolbox = (params) => {
        const request_url = GwUtils.getServiceUrl("toolbox");
        if (isEmpty(request_url)) {
            return false;
        }
        
        // Send request
        axios.get(request_url + "gettoolbox", { params: params }).then(response => {
            const result = response.data
            console.log("gettoolbox result:", result)
            this.setState({ toolboxResult: result, pendingRequests: false });
        }).catch((e) => {
            console.log(e);
            this.setState({ pendingRequests: false });
        });
    }
    toolOnFieldUpdated = (widget, value, action) => {
        // console.log(widget, value, this.state.toolWidgetValues)
        if (this.state.toolWidgetValues[widget.name] && widget.property.isParent === "true") {
            const newToolWidgetValues = { ...this.state.toolWidgetValues, [widget.name]: { value: value } }
            this.getProcess(this.state.toolResult.body.data.id, newToolWidgetValues, (response) => {
                const result = response.data
                
                const cleanedWidgetVals = {...newToolWidgetValues}
                delete cleanedWidgetVals[widget.name]

                Object.entries(newToolWidgetValues).map(([widget_name, props]) => {
                    if (props.parentId || "" === widget.name) {
                        delete cleanedWidgetVals[widget_name]
                    }
                })

                console.log("patata getprocess result:", result, cleanedWidgetVals)
                this.setState({ toolWidgetValues: cleanedWidgetVals, toolResult: result, toolType: "process" });
            })
        }
        else {
            this.setState((prevState, props) => ({ 
                toolWidgetValues: { 
                    ...prevState.toolWidgetValues, 
                    [widget.name]: { value: value, parentId: widget.property.parentId || null } 
                } 
            }))
        }
    }
    onToolButton = (action, widget) => {
        console.log("Tool Clicked", action)
        switch (action.functionName) {
            case "close":
                this.clearToolManager()
                break
            
            case "run":
                if (this.state.toolType !== "processes" && this.state.toolResult === null)
                    return

                const data = this.state.toolResult.body.data

                const request_url = GwUtils.getServiceUrl("toolbox");
                if (isEmpty(request_url))
                    return
                
                    
                const inputs = data.fields?.reduce((acc, val) => {
                    return { ...acc, [val.widgetname]: this.state.toolWidgetValues[val.widgetname].value}
                }, {})
                const params = {
                    "theme": this.props.theme.title,
                    "functionname": data.functionname,
                    "params": inputs || {}
                }

                if (this.state.toolWidgetValues.cmb_layers) { // It will only have a value if it exists
                    params["tableName"] = this.state.toolWidgetValues.cmb_layers.value
                    const toolFeatureType = data.functionparams.featureType;
                    params["featureType"] = this.state.toolWidgetValues.cmb_feature_type?.value || Object.keys(toolFeatureType)[0]
                }

                this.props.processStarted("process_msg", `Executing "${data.alias}"`)

                // Send request
                axios.post(request_url + "execute_process", {...params}).then(response => {

                    this.props.processFinished("process_msg", true, "Execution successful")
                    
                    const result = response.data
                    console.log("process result:", result)
                    let log_text = ""
                    let log = result.body?.data?.info?.values;
                    if (log) {
                        log_text = log
                            .sort((a, b) => a.id - b.id) // sort by id
                            .map(value => value.message)
                            .join("\n");
                    }
                        
                    this.props.removeLayer("temp_points.geojson")
                    this.props.removeLayer("temp_lines.geojson")
                    this.props.removeLayer("temp_polygons.geojson")
                    
                    // Points
                    let all_features = []
                    const point = result.body.data.point;
                    if (point && !isEmpty(point?.features)) {
                        const points_style = {
                            strokeColor: [235, 74, 117, 1],
                            strokeWidth: 2,
                            strokeDash: [4],
                            fillColor: [191, 156, 40, 0.33],
                            textFill: "blue",
                            textStroke: "white",
                            textFont: '20pt sans-serif'
                        }
                        const features = GwUtils.getGeoJSONFeatures(point, 'default', points_style);
                        if (!isEmpty(features)) {
                            all_features = all_features.concat(features)
                            this.props.addLayerFeatures({
                                id: "temp_points.geojson",
                                name: "temp_points.geojson",
                                title: "Temporal Points",
                                zoomToExtent: false
                            }, features, true);
                        }
                    }
                    
                    const line = result.body.data.line;
                    if (line && !isEmpty(line?.features)) {
                        const lines_style = {
                            strokeColor: [235, 74, 117, 1],
                            strokeWidth: 6,
                            strokeDash: [1],
                            fillColor: [255, 255, 255, 0.33],
                            textFill: "blue",
                            textStroke: "white",
                            textFont: '20pt sans-serif'
                        }
                    const features = GwUtils.getGeoJSONFeatures(line, 'default', lines_style);
                    // console.log("Tool Lines Features", features)
                    if (!isEmpty(features)) {
                        all_features = all_features.concat(features)
                        this.props.addLayerFeatures({
                            id: "temp_lines.geojson",
                            name: "temp_lines.geojson",
                            title: "Temporal Lines",
                            zoomToExtent: false
                        }, features, true);
                    }
                    }
                    // console.log(all_features)
                    if (!isEmpty(all_features)) {
                        const bbox = VectorLayerUtils.computeFeaturesBBox(all_features)
                        // console.log(bbox)
                        this.props.zoomToExtent(bbox.bounds, bbox.crs)
                    }
                    
                    // if (!isEmpty(all_features)) {
                    //     this.props.addLayerFeatures({
                        //         id: "temp_all.geojson",
                        //         name: "temp_all.geojson",
                        //         title: "Temporal Al",
                    //         zoomToExtent: true
                    //     }, all_features, true);
                    // }

                    this.setState((prevState, props) => ({ 
                        executionResult: result, 
                        toolWidgetValues: { ...prevState.toolWidgetValues, txt_infolog: { value: log_text } },
                        toolActiveTabs: { ...prevState.toolActiveTabs, mainTab: "tab_loginfo" }
                    }))
                // this.setState({ toolboxResult: result, pendingRequests: false });
                }).catch((e) => {
                    console.log(e);
                    this.props.processFinished("process_msg", false, "Execution failed")
                    // this.setState({ pendingRequests: false });
                });
                break
        }
    }
    filterUpdate(value) {
        this.setState({toolboxFilter: value})
        
        const params = {
            "theme": this.props.theme.title,
            "filter": value
        }

        this.getToolbox(params);
    }
    toggleTabExpanded(type, tab_name, default_val = false) {
        const path = `${type}.${tab_name}`
        const newstate = this.state.expandedTabs[path] !== undefined ? !this.state.expandedTabs[path] : !default_val;

        this.setState((prevState, props) => ({ expandedTabs: {...prevState.expandedTabs, [path]: newstate} }));
    }
    onToolTabChanged = (tab, widget) => {
        // console.log("Tool Tab:", tab, widget)
        this.setState((prevState, props) => ({ toolActiveTabs: { ...prevState.toolActiveTabs, [widget.name]: tab.name } }));
    }
    getExpandedTabClass(type, tab_name, default_val = false) {
        const path = `${type}.${tab_name}`
        const expanded = this.state.expandedTabs[path] !== undefined ? this.state.expandedTabs[path] : default_val;
        return (expanded || !isEmpty(this.state.toolboxFilter)) ? "identify-layer-expandable identify-layer-expanded" : "identify-layer-expandable";
    }
    renderTab(type, tab_name, tools) {
        return (
            <div className={this.getExpandedTabClass(type, tab_name)} key={`${type}-${tab_name}`}>
                <div className="identify-result-entry">
                    <span className="clickable" onClick={() => this.toggleTabExpanded(type, tab_name)}><b>{tab_name}</b></span>
                </div>
                <div className="identify-layer-entries toolbox-tool-list">
                    {tools.map(tool => this.renderTool(type, tool))}
                </div>
            </div>
        )
    }
    renderTool(type, tool) {
        let className = "clickable";
        if (type === this.state.toolType && this.state.toolResult?.body.data.id === tool.id) {
            className = "active clickable"
        }
        return (
            <div className="identify-result-entry" key={`${tool.alias}`}>
                <span 
                    className={className} 
                    onClick={()=>{this.toolClicked(type, tool)}}
                    title={`${tool.alias} - ${tool.functionname || ""}`}
                >
                    {tool.alias}
                </span>
            </div>
        )
    }
    render() {
        // Create window
        let body = null;
        const result = this.state.toolboxResult || this.props.toolboxResult;
        if (this.state.pendingRequests === true || result !== null) {
            if (isEmpty(result)) {
                if (this.state.pendingRequests === true) {
                    body = (<div className="toolbox-body" role="body"><span className="identify-body-message">Querying...</span></div>); // TODO: TRANSLATION
                } else {
                    body = (<div className="toolbox-body" role="body"><span className="identify-body-message">No result</span></div>); // TODO: TRANSLATION
                }
            } else {
                body = (
                    <div className="toolbox-body" role="body">
                        <div className='toolbox-filter'>
                            <InputContainer className="searchbox-field">
                                <input onChange={ev => this.filterUpdate(ev.target.value)}
                                    role="input"
                                    type="text" value={this.state.toolboxFilter} />
                                <Icon icon="remove" onClick={() => this.filterUpdate("")} role="suffix" />
                            </InputContainer>
                        </div>
                        <div className='toolbox-results-container'>
                            {Object.entries(result.body.data).map(([type, tabs]) => (
                                <div className="toolbox-type" key={type}>
                                    <span><b>{type.toUpperCase()}</b></span>
                                    <div className="toolbox-tabs-container">
                                        {Object.entries(tabs.fields).map(([tab_name, tools]) => this.renderTab(type, tab_name, tools))}
                                    </div>
                                </div>
                            ))}
                        </div>
                    </div>
                )
            }
        }
        let toolWindow = null
        if (this.state.toolResult !== null) {
            const tool = this.state.toolResult
            console.log("Tool Widget Vals", this.state.toolWidgetValues)
            console.log("Tool", tool)

            toolWindow = (
                <ResizeableWindow icon="giswater"
                    key="ToolManager"
                    initialHeight={this.props.initialHeight} initialWidth={this.props.initialWidth}
                    initialX={this.props.initialX} initialY={this.props.initialY} initiallyDocked={this.props.initiallyDocked}
                    onClose={this.clearToolManager} title={tool.body.data.alias}
                >
                    <div className={`tool-manager-body toolbox-${this.state.toolType}`} role='body'>
                        <GwQtDesignerForm 
                            form_xml={tool.form_xml} 
                            dispatchButton={this.onToolButton} 
                            updateField={this.toolOnFieldUpdated} 
                            onTabChanged={this.onToolTabChanged} 
                            activetabs={this.state.toolActiveTabs} 
                            widgetValues={this.state.toolWidgetValues} 
                        />
                    </div>
                </ResizeableWindow>
            )
        }

        return [toolWindow, (
            <SideBar icon="giswater" id="GwToolbox" title="GW Toolbox"
                key="GwToolboxNull" onShow={this.onShow} width={this.props.toolboxInitialWidth} >
                {body}
            </SideBar>
        )];
        
    }
}

const selector = (state) => ({
    currentTask: state.task.id,
    layers: state.layers.flat,
    map: state.map,
    theme: state.theme.current
});

export default connect(selector, {
    zoomToExtent: zoomToExtent,
    refreshLayer: refreshLayer,
    addLayerFeatures: addLayerFeatures,
    removeLayer: removeLayer,
    processStarted: processStarted,
    processFinished: processFinished,
})(GwToolbox);
