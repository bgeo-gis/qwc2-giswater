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
import GwUtils from '../utils/GwUtils';
import VectorLayerUtils from 'qwc2/utils/VectorLayerUtils';
import { zoomToExtent } from 'qwc2/actions/map';
import { refreshLayer, addLayerFeatures, removeLayer } from 'qwc2/actions/layers';
import InputContainer from 'qwc2/components/InputContainer';
import Icon from 'qwc2/components/Icon';

import GwQtDesignerForm from '../components/GwQtDesignerForm';
import 'qwc2-giswater/plugins/style/GwToolbox.css';
import 'qwc2/components/style/IdentifyViewer.css';
import { processFinished, processStarted } from 'qwc2/actions/processNotifications';

class GwToolbox extends React.Component {
    static propTypes = {
        addLayerFeatures: PropTypes.func,
        currentTask: PropTypes.string,
        initialHeight: PropTypes.number,
        initialWidth: PropTypes.number,
        initialX: PropTypes.number,
        initialY: PropTypes.number,
        initiallyDocked: PropTypes.bool,
        processFinished: PropTypes.func,
        processStarted: PropTypes.func,
        removeLayer: PropTypes.func,
        theme: PropTypes.object,
        toolboxInitialWidth: PropTypes.number,
        toolboxResult: PropTypes.object,
        zoomToExtent: PropTypes.func
    };
    static defaultProps = {
        initialWidth: 480,
        initialHeight: 550,
        initialX: null,
        initialY: null,
        initiallyDocked: false
    };
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
    };
    getProcess(processId, parentVals, callback, errorCallback) {
        const requestUrl = GwUtils.getServiceUrl("toolbox");
        if (!isEmpty(requestUrl)) {
            const params = {
                theme: this.props.theme.title,
                id: processId,
                parentVals: parentVals
            };

            axios.post(requestUrl + "getprocess", { ...params }).then(callback || (() => {})).catch((e) => {
                console.warn(e);
                if (errorCallback) {
                    errorCallback(e);
                }
            });
        }
    }
    getReport(reportId, callback, errorCallback) {
        const requestUrl = GwUtils.getServiceUrl("toolbox");
        if (!isEmpty(requestUrl)) {
            const params = {
                theme: this.props.theme.title,
                id: reportId
            };

            axios.post(requestUrl + "getreport", { ...params }).then(callback || (() => {})).catch((e) => {
                console.warn(e);
                if (errorCallback) {
                    errorCallback(e);
                }
            });
        }
    }
    toolClicked(type, tool) {
        console.log("Clicked:", type, tool);
        switch (type) {
        case "processes":
            if (this.state.toolResult?.body?.data.id !== tool.id) {
                this.getProcess(tool.id, {}, (response) => {
                    const result = response.data;
                    console.log("getprocess result:", result);
                    this.setState({ toolResult: result, toolType: type, toolWidgetValues: {}, toolActiveTabs: {} });
                }, (error) => {
                    this.props.processStarted("get_process", "Get process");
                    this.props.processFinished("get_process", false, `Failed to get process: ${error}`);
                });
            }
            break;
        case "reports":
            if (this.state.toolResult?.body?.data.listname !== tool.id) {
                this.props.processStarted("get_report", "Gettings report...");
                this.getReport(tool.id, (response) => {
                    const result = response.data;
                    console.log("getraport result:", result);
                    this.props.processFinished("get_report", true, "Report successful!");
                    this.setState({ toolResult: result, toolType: type, toolWidgetValues: {}, toolActiveTabs: {} });
                }, (error) => {
                    this.props.processFinished("get_report", false, `Failed to get report: ${error}`);
                });
            }
            break;
        default:
            console.warn(`Type \`${type}\` cannot be handled.`);
            break;
        }
    }
    clearToolManager = () => {
        this.setState({ toolResult: null, toolType: null, executionResult: null, toolWidgetValues: {}, toolActiveTabs: {} });
    };
    onShow = () => {
        let pendingRequests = false;

        const requestUrl = GwUtils.getServiceUrl("toolbox");
        if (!isEmpty(requestUrl)) {
            // Get request paramas
            const params = {
                theme: this.props.theme.title,
                filter: this.state.toolboxFilter
            };

            // Send request
            pendingRequests = true;
            this.getToolbox(params);
        }
        // Set "Waiting for request..." message
        this.setState({ toolboxResult: {}, pendingRequests: pendingRequests });
    };
    getToolbox = (params) => {
        const requestUrl = GwUtils.getServiceUrl("toolbox");
        if (isEmpty(requestUrl)) {
            return;
        }

        // Send request
        axios.get(requestUrl + "gettoolbox", { params: params }).then(response => {
            const result = response.data;
            console.log("gettoolbox result:", result);
            this.setState({ toolboxResult: result, pendingRequests: false });
        }).catch((e) => {
            console.log(e);
            this.setState({ pendingRequests: false });
        });
    };
    toolOnFieldUpdated = (widget, value) => {
        // console.log(widget, value, this.state.toolWidgetValues)
        if (this.state.toolWidgetValues[widget.name] && widget.property.isParent === "true") {
            const newToolWidgetValues = { ...this.state.toolWidgetValues, [widget.name]: { value: value } };
            this.getProcess(this.state.toolResult.body.data.id, newToolWidgetValues, (response) => {
                const result = response.data;

                const cleanedWidgetVals = {...newToolWidgetValues};
                delete cleanedWidgetVals[widget.name];

                Object.entries(newToolWidgetValues).map(([widgetName, props]) => {
                    if (props.parentId === widget.name) {
                        delete cleanedWidgetVals[widgetName];
                    }
                });

                console.log("patata getprocess result:", result, cleanedWidgetVals);
                this.setState({ toolWidgetValues: cleanedWidgetVals, toolResult: result, toolType: "process" });
            });
        } else {
            this.setState((prevState) => ({
                toolWidgetValues: {
                    ...prevState.toolWidgetValues,
                    [widget.name]: { value: value, parentId: widget.property.parentId || null }
                }
            }));
        }
    };
    // eslint-disable-next-line
    onToolButton = (action, widget) => {
        console.log("Tool Clicked", action);
        switch (action.functionName) {
        case "close":
            this.clearToolManager();
            break;

        case "run": {
            if (this.state.toolType !== "processes" && this.state.toolResult === null) {
                return;
            }

            const data = this.state.toolResult.body.data;

            const requestUrl = GwUtils.getServiceUrl("toolbox");
            if (isEmpty(requestUrl)) {
                return;
            }


            const inputs = data.fields?.reduce((acc, val) => {
                return { ...acc, [val.widgetname]: this.state.toolWidgetValues[val.widgetname].value};
            }, {});
            const params = {
                theme: this.props.theme.title,
                functionname: data.functionname,
                params: inputs || {}
            };

            if (this.state.toolWidgetValues.cmb_layers) { // It will only have a value if it exists
                params.tableName = this.state.toolWidgetValues.cmb_layers.value;
                const toolFeatureType = data.functionparams.featureType;
                params.featureType = this.state.toolWidgetValues.cmb_feature_type?.value || Object.keys(toolFeatureType)[0];
            }

            this.props.processStarted("process_msg", `Executing "${data.alias}"`);

            // Send request
            axios.post(requestUrl + "execute_process", {...params}).then(response => {
                const result = response.data;
                console.log("process result:", result);

                this.props.processFinished("process_msg", result.status === "Accepted", result.message.text);

                let logText = "";
                const log = result.body?.data?.info?.values;
                if (log) {
                    logText = log
                        .sort((a, b) => a.id - b.id) // sort by id
                        .map(value => value.message)
                        .join("\n");
                }

                this.props.removeLayer("temp_points.geojson");
                this.props.removeLayer("temp_lines.geojson");
                this.props.removeLayer("temp_polygons.geojson");

                // Points
                let allFeatures = [];
                const point = result.body.data.point;
                if (point && !isEmpty(point?.features)) {
                    const pointsStyle = {
                        strokeColor: [235, 74, 117, 1],
                        strokeWidth: 2,
                        strokeDash: [4],
                        fillColor: [191, 156, 40, 0.33],
                        textFill: "blue",
                        textStroke: "white",
                        textFont: '20pt sans-serif'
                    };
                    const features = GwUtils.getGeoJSONFeatures(point, 'default', pointsStyle);
                    if (!isEmpty(features)) {
                        allFeatures = allFeatures.concat(features);
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
                    const linesStyle = {
                        strokeColor: [235, 74, 117, 1],
                        strokeWidth: 6,
                        strokeDash: [1],
                        fillColor: [255, 255, 255, 0.33],
                        textFill: "blue",
                        textStroke: "white",
                        textFont: '20pt sans-serif'
                    };
                    const features = GwUtils.getGeoJSONFeatures(line, 'default', linesStyle);
                    // console.log("Tool Lines Features", features)
                    if (!isEmpty(features)) {
                        allFeatures = allFeatures.concat(features);
                        this.props.addLayerFeatures({
                            id: "temp_lines.geojson",
                            name: "temp_lines.geojson",
                            title: "Temporal Lines",
                            zoomToExtent: false
                        }, features, true);
                    }
                }
                // console.log(allFeatures)
                if (!isEmpty(allFeatures)) {
                    const bbox = VectorLayerUtils.computeFeaturesBBox(allFeatures);
                    // console.log(bbox)
                    this.props.zoomToExtent(bbox.bounds, bbox.crs);
                }

                // if (!isEmpty(allFeatures)) {
                //     this.props.addLayerFeatures({
                //         id: "temp_all.geojson",
                //         name: "temp_all.geojson",
                //         title: "Temporal Al",
                //         zoomToExtent: true
                //     }, allFeatures, true);
                // }

                this.setState((prevState) => ({
                    executionResult: result,
                    toolWidgetValues: { ...prevState.toolWidgetValues, txt_infolog: { value: logText } },
                    toolActiveTabs: { ...prevState.toolActiveTabs, mainTab: "tab_loginfo" }
                }));
                // this.setState({ toolboxResult: result, pendingRequests: false });
            }).catch((e) => {
                console.log(e);
                this.props.processFinished("process_msg", false, `Execution failed "${e}"`);
                // this.setState({ pendingRequests: false });
            });
            break;
        }
        default:
            console.warn(`Button with action ${action} is not handled`);
        }
    };
    filterUpdate(value) {
        this.setState({toolboxFilter: value});

        const params = {
            theme: this.props.theme.title,
            filter: value
        };

        this.getToolbox(params);
    }
    toggleTabExpanded(type, tabName, defaultVal = false) {
        const path = `${type}.${tabName}`;
        const newstate = this.state.expandedTabs[path] !== undefined ? !this.state.expandedTabs[path] : !defaultVal;

        this.setState((prevState) => ({ expandedTabs: {...prevState.expandedTabs, [path]: newstate} }));
    }
    onToolTabChanged = (tab, widget) => {
        // console.log("Tool Tab:", tab, widget)
        this.setState((prevState) => ({ toolActiveTabs: { ...prevState.toolActiveTabs, [widget.name]: tab.name } }));
    };
    getExpandedTabClass(type, tabName, defaultVal = false) {
        const path = `${type}.${tabName}`;
        const expanded = this.state.expandedTabs[path] !== undefined ? this.state.expandedTabs[path] : defaultVal;
        return (expanded || !isEmpty(this.state.toolboxFilter)) ? "identify-layer-expandable identify-layer-expanded" : "identify-layer-expandable";
    }
    renderTab(type, tabName, tools) {
        return (
            <div className={this.getExpandedTabClass(type, tabName)} key={`${type}-${tabName}`}>
                <div className="identify-result-entry">
                    <span className="clickable" onClick={() => this.toggleTabExpanded(type, tabName)}><b>{tabName}</b></span>
                </div>
                <div className="identify-layer-entries toolbox-tool-list">
                    {tools.map(tool => this.renderTool(type, tool))}
                </div>
            </div>
        );
    }
    renderTool(type, tool) {
        let className = "clickable";
        if (type === this.state.toolType && this.state.toolResult?.body.data.id === tool.id) {
            className = "active clickable";
        }
        return (
            <div className="identify-result-entry" key={`${tool.alias}`}>
                <span
                    className={className}
                    onClick={()=>{this.toolClicked(type, tool);}}
                    title={`${tool.alias} - ${tool.functionname || ""}`}
                >
                    {tool.alias}
                </span>
            </div>
        );
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
                                        {Object.entries(tabs.fields).map(([tabName, tools]) => this.renderTab(type, tabName, tools))}
                                    </div>
                                </div>
                            ))}
                        </div>
                    </div>
                );
            }
        }
        let toolWindow = null;
        if (this.state.toolResult !== null) {
            const tool = this.state.toolResult;
            console.log("Tool Widget Vals", this.state.toolWidgetValues);
            console.log("Tool", tool);

            toolWindow = (
                <ResizeableWindow icon="giswater"
                    initialHeight={this.props.initialHeight}
                    initialWidth={this.props.initialWidth} initialX={this.props.initialX}
                    initialY={this.props.initialY} initiallyDocked={this.props.initiallyDocked} key="ToolManager"
                    onClose={this.clearToolManager} title={tool.body.data.alias}
                >
                    <div className={`tool-manager-body toolbox-${this.state.toolType}`} role='body'>
                        <GwQtDesignerForm
                            activetabs={this.state.toolActiveTabs}
                            dispatchButton={this.onToolButton}
                            form_xml={tool.form_xml}
                            onTabChanged={this.onToolTabChanged}
                            updateField={this.toolOnFieldUpdated}
                            widgetValues={this.state.toolWidgetValues}
                        />
                    </div>
                </ResizeableWindow>
            );
        }

        return [toolWindow, (
            <SideBar icon="giswater" id="GwToolbox" key="GwToolboxNull"
                onShow={this.onShow} title="GW Toolbox" width={this.props.toolboxInitialWidth} >
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
    processFinished: processFinished
})(GwToolbox);
