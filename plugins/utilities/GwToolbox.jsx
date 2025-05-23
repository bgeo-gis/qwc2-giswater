/**
 * Copyright © 2025 by BGEO. All rights reserved.
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
import GwUtils from '../../utils/GwUtils';
import { refreshLayer, addLayerFeatures, removeLayer } from 'qwc2/actions/layers';
import InputContainer from 'qwc2/components/widgets/InputContainer';
import Icon from 'qwc2/components/Icon';
import LocaleUtils from 'qwc2/utils/LocaleUtils';

import GwQtDesignerForm from '../../components/GwQtDesignerForm';
import 'qwc2-giswater/plugins/style/GwToolbox.css';
import 'qwc2/components/style/IdentifyViewer.css';
import { processFinished, processStarted } from 'qwc2/actions/processNotifications';

import { openToolBoxProcess } from '../../actions/toolbox';

class GwToolbox extends React.Component {
    static propTypes = {
        addLayerFeatures: PropTypes.func,
        currentTask: PropTypes.string,
        customMargin: PropTypes.string,
        icon: PropTypes.string,
        initialHeight: PropTypes.number,
        initialWidth: PropTypes.number,
        initialX: PropTypes.number,
        initialY: PropTypes.number,
        initiallyDocked: PropTypes.bool,
        processFinished: PropTypes.func,
        processStarted: PropTypes.func,
        removeLayer: PropTypes.func,
        showOnlyExpandedEntries: PropTypes.bool,
        theme: PropTypes.object,
        themesCfg: PropTypes.object,
        title: PropTypes.string,
        toolboxInitialWidth: PropTypes.string,
        toolboxMinWidth: PropTypes.string,
        toolboxResult: PropTypes.object,
        zoomToLayer: PropTypes.bool,
        openToolBoxProcess: PropTypes.func,
        processId: PropTypes.number
    };
    static defaultProps = {
        initialWidth: 700,
        initialHeight: 650,
        toolboxInitialWidth: '25em',
        toolboxMinWidth: '25em',
        initialX: null,
        initialY: null,
        initiallyDocked: false,
        zoomToLayer: false,
        icon: 'giswater',
        title: 'GW Toolbox',
        showOnlyExpandedEntries: false,
        customMargin: '0',
        processId: null
    };
    constructor(props) {
        super(props);
    }
    state = {
        toolResult: null,
        toolType: null,

        toolActiveTabs: {},
        hiddenWidgets: ["tab_line", "tab_point", "tab_polygon"],
        executionResult: null,
        toolWidgetValues: {},
        widgetsProperties: {},
        expandedTabs: {},
        toolboxResult: null,
        pendingRequests: false,
        toolboxFilter: ""
    };

    componentDidUpdate(prevProps) {
        if (prevProps.processId !== this.props.processId && this.props.processId !== null) {
            this.toolClicked("processes",{ id: this.props.processId })
        }
    }

    loadWidgetsProperties = (widgetsProperties) => {
        this.setState((state) => ({ widgetsProperties: { ...state.widgetsProperties, ...widgetsProperties } }));
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
        switch (type) {
        case "processes":
            if (this.state.toolResult?.body?.data.id !== tool.id) {
                // Clear previous state first
                this.setState({
                    hiddenWidgets: ["tab_line", "tab_point", "tab_polygon"],
                    toolResult: null,
                    toolType: null,
                    toolWidgetValues: {},
                    toolActiveTabs: {},
                    executionResult: null,
                    widgetsProperties: {}
                }, () => {
                    this.getProcess(tool.id, {}, (response) => {
                        const result = response.data;
                        this.setState({
                            toolResult: result,
                            toolType: type
                        });
                    }, (error) => {
                        this.props.processStarted("get_process", "Get process");
                        this.props.processFinished("get_process", false, `Failed to get process: ${error}`);
                    });
                });
            }
            break;
        case "reports":
            if (this.state.toolResult?.body?.data.listname !== tool.id) {
                this.props.processStarted("get_report", "Gettings report...");
                this.getReport(tool.id, (response) => {
                    const result = response.data;
                    this.props.processFinished("get_report", true, "Report successful!");
                    this.setState({ hiddenWidgets: ["tab_line", "tab_point", "tab_polygon"], toolResult: result, toolType: type, toolWidgetValues: {}, toolActiveTabs: {} });
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
        this.setState({ hiddenWidgets: ["tab_line", "tab_point", "tab_polygon"], toolResult: null, toolType: null, executionResult: null, toolWidgetValues: {}, toolActiveTabs: {}, processId: null });
        if (this.props.processId !== null) {
            this.props.openToolBoxProcess(null);
        }
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
            this.setState({ toolboxResult: result, pendingRequests: false });
        }).catch((e) => {
            console.log(e);
            this.setState({ pendingRequests: false });
        });
    };
    toolOnFieldUpdated = (widget, value) => {
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

        this.setState((state) => ({
            widgetsProperties: { ...state.widgetsProperties, [widget.name]: {  ...state.widgetsProperties[widget.name],value: value } }
        }));
    };
    // eslint-disable-next-line
    onToolButton = (action, widget) => {
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
                return { ...acc, [val.widgetname]: {value: this.state.toolWidgetValues[val.widgetname].value, isMandatory: val.isMandatory}};
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

            // Show message if any empty params
            const emptyParams = Object.keys(params.params).filter(key => params.params[key].isMandatory && isEmpty(params.params[key].value));

            if (emptyParams.length > 0) {
                const emptyParamNames = emptyParams.join(', ');
                this.props.processFinished("process_msg", false, `The following mandatory parameters are empty: ${emptyParamNames}`);
                return;
            }

            const newParams = {};

            for (const key in params.params) {
                if (params.params.hasOwnProperty(key) && params.params[key].hasOwnProperty('value')) {
                    newParams[key] = params.params[key].value;
                }
            }
            params.params = newParams;
            // Send request
            axios.post(requestUrl + "execute_process", {...params}).then(response => {
                const result = response.data;
                if (result.status !== 'Accepted') {
                    this.props.processFinished("process_msg", false, result.NOSQLERR || result.SQLERR || result.message?.text || "Check logs");
                    return;
                }
                this.props.processFinished("process_msg", result.status === "Accepted", result.message?.text);

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

                const hiddenWidgets = ["tab_polygon"];
                const geojsonData = {};

                // Points
                // let allFeatures = [];
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
                    const features = GwUtils.getGeoJSONFeatures('default', point, pointsStyle);
                    if (!isEmpty(features)) {
                        // allFeatures = allFeatures.concat(features);
                        this.props.addLayerFeatures({
                            id: "temp_points.geojson",
                            name: "temp_points.geojson",
                            title: "Temporal Points",
                            zoomToExtent: this.props.zoomToLayer
                        }, features, true);
                    }

                    const pointParams = Object.keys(point.features.reduce((acc, curr) => ({...acc, ...curr.properties}), {}));
                    geojsonData.point_table = {
                        form: {
                            headers:
                                pointParams.map(name => ({
                                    accessorKey: name,
                                    header: name,
                                    id: name
                                })),
                            table: {
                                initialState: {
                                    density: 'compact'
                                },
                                enableTopToolbar: false
                            }
                        },
                        values: point.features.map((l) => l.properties)
                    };
                    this.setState((prevState) => ({
                        widgetsProperties: { ...prevState.widgetsProperties, point_table: { value: geojsonData.point_table } },
                    }));
                } else {
                    hiddenWidgets.push("tab_point");
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
                    const features = GwUtils.getGeoJSONFeatures('default', line, linesStyle);
                    if (!isEmpty(features)) {
                        // allFeatures = allFeatures.concat(features);
                        this.props.addLayerFeatures({
                            id: "temp_lines.geojson",
                            name: "temp_lines.geojson",
                            title: "Temporal Lines",
                            zoomToExtent: this.props.zoomToLayer
                        }, features, true);
                    }

                    const lineParams = Object.keys(line.features.reduce((acc, curr) => ({...acc, ...curr.properties}), {}));
                    geojsonData.line_table = {
                        form: {
                            headers: lineParams.map(name => ({
                                accessorKey: name,
                                header: name,
                                id: name
                            })),
                            table: {
                                initialState: {
                                    density: 'compact'
                                },
                                enableTopToolbar: false
                            }
                        },
                        values: line.features.map((l) => l.properties)
                    };
                    this.setState((prevState) => ({
                        widgetsProperties: { ...prevState.widgetsProperties, line_table: { value: geojsonData.line_table } },
                    }));
                } else {
                    hiddenWidgets.push("tab_line");
                }

                this.setState((prevState) => ({
                    hiddenWidgets: hiddenWidgets,
                    executionResult: result,
                    widgetsProperties: { ...prevState.widgetsProperties, txt_infolog: { value: logText } },
                    toolActiveTabs: { ...prevState.toolActiveTabs, mainTab: "tab_loginfo" },
                }));
            }).catch((e) => {
                console.log(e);
                this.props.processFinished("process_msg", false, `Execution failed "${e}"`);
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
        this.setState((prevState) => ({ toolActiveTabs: { ...prevState.toolActiveTabs, [widget.name]: tab.name } }));
    };
    getExpandedTabClass(type, tabName, defaultVal = false) {
        const path = `${type}.${tabName}`;
        const expanded = this.state.expandedTabs[path] !== undefined ? this.state.expandedTabs[path] : defaultVal;
        return (expanded || !isEmpty(this.state.toolboxFilter)) ? "identify-layer-expandable identify-layer-expanded" : "identify-layer-expandable";
    }
    renderTab(type, tabName, tools) {
        if (this.props.showOnlyExpandedEntries) {
            return (
                <div className="identify-layer-entries toolbox-tool-list" key={`${type}-${tabName}`}>
                    {tools.map(tool => this.renderTool(type, tool))}
                </div>
            );
        } else {
            return (
                <div className={this.getExpandedTabClass(type, tabName)} key={`${type}-${tabName}`}>
                    <div className="identify-result-entry">
                        <span className="clickable"
                            onClick={() => this.toggleTabExpanded(type, tabName)}
                            style={{ userSelect: 'none' }}><b>{tabName}</b>
                        </span>
                    </div>
                    <div className="identify-layer-entries toolbox-tool-list">
                        {tools.map(tool => this.renderTool(type, tool))}
                    </div>
                    <div className="arrow-clickable" onClick={() => this.toggleTabExpanded(type, tabName)} />
                </div>
            );
        }

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
                    style={{ userSelect: 'none', margin: this.props.customMargin }}
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
                if (this.props.showOnlyExpandedEntries) {
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
                                    Object.entries(tabs.fields).map(([tabName, tools]) => this.renderTab(type, tabName, tools))
                                ))}
                            </div>
                        </div>
                    );
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
                                        <span style={{ userSelect: 'none' }}><b>{type.toUpperCase()}</b></span>
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
        }


        let toolWindow = null;
        if (this.state.toolResult !== null) {
            const tool = this.state.toolResult;

            toolWindow = (
                <ResizeableWindow icon={this.props.icon}
                    initialHeight={this.props.initialHeight}
                    initialWidth={this.props.initialWidth}
                    initialX={this.props.initialX}
                    initialY={this.props.initialY}
                    initiallyDocked={this.props.initiallyDocked}
                    key="ToolManager"
                    onClose={this.clearToolManager}
                    title={tool.body.data.alias}
                >
                    <div className={`tool-manager-body toolbox-${this.state.toolType}`} role='body'>
                        <GwQtDesignerForm
                            activetabs={this.state.toolActiveTabs}
                            form_xml={tool.form_xml}
                            hiddenWidgets={this.state.hiddenWidgets}
                            onTabChanged={this.onToolTabChanged}
                            onWidgetAction={this.onToolButton}
                            onWidgetValueChange={this.toolOnFieldUpdated}
                            widgetValues={this.state.toolWidgetValues}
                            loadWidgetsProperties={this.loadWidgetsProperties}
                            useNew widgetsProperties={this.state.widgetsProperties}
                        />
                    </div>
                </ResizeableWindow>
            );
        }

        return [toolWindow, (
            <SideBar icon={this.props.icon} id="GwToolbox" key="GwToolboxNull"
                minWidth={this.props.toolboxMinWidth} onShow={this.onShow}
                title={LocaleUtils.tr('appmenu.items.GwToolbox') || this.props.title}
                width={this.props.toolboxInitialWidth} >
                {body}
            </SideBar>
        )];

    }
}

const selector = (state) => ({
    currentTask: state.task.id,
    layers: state.layers.flat,
    map: state.map,
    theme: state.theme.current,
    processId: state.toolbox.processId,
});

export default connect(selector, {
    refreshLayer: refreshLayer,
    addLayerFeatures: addLayerFeatures,
    removeLayer: removeLayer,
    processStarted: processStarted,
    processFinished: processFinished,
    openToolBoxProcess: openToolBoxProcess
})(GwToolbox);
