/**
 * Copyright © 2024 by BGEO. All rights reserved.
 * The program is free software: you can redistribute it and/or modify it under the terms of the GNU
 * General Public License as published by the Free Software Foundation, either version 3 of the License,
 * or (at your option) any later version
 */

import axios from 'axios';
import React from 'react';
import { connect } from 'react-redux';
import PropTypes from 'prop-types';
import isEmpty from 'lodash.isempty';
import ResizeableWindow from 'qwc2/components/ResizeableWindow';
import { setCurrentTask } from 'qwc2/actions/task';
import { processFinished, processStarted } from 'qwc2/actions/processNotifications';
import { setActiveNonvisualobject } from '../../actions/nonvisualobject';


import GwQtDesignerForm from '../../components/GwQtDesignerForm';
import GwUtils from '../../utils/GwUtils';



class GwNonVisualObject extends React.Component {
    static propTypes = {
        currentTask: PropTypes.string,
        initialHeight: PropTypes.number,
        initialWidth: PropTypes.number,
        initialX: PropTypes.number,
        initialY: PropTypes.number,
        layers: PropTypes.array,
        map: PropTypes.object,
        processFinished: PropTypes.func,
        processStarted: PropTypes.func,
        refreshLayer: PropTypes.func,
        setActiveNonVisualObject: PropTypes.func,
        setCurrentTask: PropTypes.func,
        setFilter: PropTypes.func,
        theme: PropTypes.object,
        title: PropTypes.string,
        nonvisualobjectResult: PropTypes.object,
        filterFields: PropTypes.object,
        dialogParams: PropTypes.object,
    };
    static defaultProps = {
        nonvisualobjectResult: null,
        filterFields: null,
        dialogParams: null,
        title: 'Non Visual Object',
        initialHeight: 400,
        initialWidth: 300,
        initialX: null,
        initialY: null,
    };
    state = {
        pendingRequests: false,
        widgetsProperties: {},
        widgetValues: {},
        currentTab: {},
        filterValues: {}

    };

    componentDidUpdate(prevProps) {
        if (prevProps.nonvisualobjectResult !== this.props.nonvisualobjectResult && this.props.nonvisualobjectResult !== null) {
            // Get list in case of table in form
            this.getList(this.props.nonvisualobjectResult);
        }
        // Manage close tool
        if (prevProps.currentTask !== this.props.currentTask && this.props.currentTask === null) {
            this.onToolClose();
        }
    }

    getList = (nonvisualobjectResult) => {
        try {
            const requestUrl = GwUtils.getServiceUrl("util");
            const widgets = nonvisualobjectResult.body.data.fields;
            let tableWidget = null;

            if (this.props.dialogParams && this.props.dialogParams.pattern_type) {
                const patternType = this.props.dialogParams.pattern_type.toLowerCase();
                const linkedObjectName = 'tbl_nvo_patterns_' + patternType;

                // Get correct pattern tablewidget
                widgets.forEach(widget => {
                    if ((widget.widgettype == "tableview" || widget.widgettype === "tablewidget") && widget.linkedobject === linkedObjectName) {
                        console.log("table widget::::::::", widget);
                        tableWidget = widget;
                    }
                });
            } else {
                widgets.forEach(widget => {
                    if (widget.widgettype == "tableview" || widget.widgettype === "tablewidget") {
                        tableWidget = widget;
                    }
                });
            }

            if(tableWidget){
                const params = {
                    theme: this.props.theme.title,
                    tabName: tableWidget.tabname,
                    widgetname: tableWidget.widgetname,
                    tableName: tableWidget.linkedobject,
                    filterFields: JSON.stringify(this.props.filterFields)
                };

                axios.get(requestUrl + "getlist", { params: params }).then((response) => {
                    const result = response.data;
                    const resultToPlot = {
                        ...result,
                        curve_type: this.props.dialogParams?.curve_type || "None"
                    };

                    this.getplot(resultToPlot, nonvisualobjectResult);
                    this.setState((state) => ({ widgetsProperties: {...state.widgetsProperties, [tableWidget.widgetname]: {
                        value: GwUtils.getListToValue(result)
                    } } }));
                }).catch((e) => {
                    console.log(e);
                });
            }

        } catch (error) {
            console.warn(error);
        }
    };


    getplot = (table, nonvisualobjectResult) => {
        try {
            const requestUrl = GwUtils.getServiceUrl("nonvisual");
            const widgets = nonvisualobjectResult.body.data.fields;
            let plotwidget = null;

            //Get widget
            widgets.forEach(widget => {
                if (widget.widgettype == "label" ) {
                    plotwidget = widget;
                }
            });

            axios.post(requestUrl + "plot", table)
                .then((response) => {
                    let result = response.data;

                    // Remove xml and doctype tags
                    if (typeof result === 'string') {
                        result = result.replace(/^<\?xml[\s\S]*?\?>/, '')
                                       .replace(/<!DOCTYPE[\s\S]*?>/, '')
                                       .trim();
                    }
                    // Set SVG to widget
                    this.setState((state) => ({ widgetsProperties: {...state.widgetsProperties, [plotwidget.widgetname]: {
                        value: (result)
                    } } }));
                })
                .catch((e) => {
                    console.error("Error generating plot:", e);
                });
        } catch (error) {
            console.warn("Error in getplot:", error);
        }
    };


    onToolClose = () => {
        this.props.setActiveNonVisualObject(null, null);
        this.setState({ widgetsProperties: {}, widgetValues: {} });
        if (!this.props.keepManagerOpen) {
            this.props.setCurrentTask(null);
        }
    };

    onWidgetAction = (action) => {
        let functionName = action.functionName ? action.functionName : action.widgetfunction.functionName;
        switch (functionName) {
        case "closeDlg": this.onToolClose(); break;
        case "help":     GwUtils.openHelp();    break;
        default:
            console.warn(`Action \`${action.name}\` cannot be handled.`);
            break;
        }
    };
    onWidgetValueChange = (widget, value) => {
        this.setState((state) => ({
            widgetValues: { ...state.widgetValues, [widget.name]: value },
            widgetsProperties: { ...state.widgetsProperties, [widget.name]: { value: value } }

        }));
    };


    render() {
        let window = null;
        if (this.props.nonvisualobjectResult !== null && this.props.dialogParams !== null) {
            let body = null;
            if (isEmpty(this.props.nonvisualobjectResult)) {
                if (this.state.pendingRequests === true) {
                    body = (<div role="body"><span>Querying...</span></div>);
                } else {
                    body = (<div role="body"><span>No result</span></div>);
                }
            } else {
                const result = this.props.nonvisualobjectResult;
                if (!isEmpty(result.form_xml)) {
                    body = (
                        <div className="nvo-object-body" role="body">
                            <GwQtDesignerForm form_xml={result.form_xml} onWidgetAction={this.onWidgetAction}
                            onTabChanged={this.onTabChanged} onWidgetValueChange={this.onWidgetValueChange} readOnly={false}
                            widgetValues={this.state.widgetValues} useNew widgetsProperties={this.state.widgetsProperties}/>
                        </div>
                    );
                }
            }

            window = (
                <ResizeableWindow
                    dockable={false} icon="giswater" id="GwNonVisualObject"
                    initialHeight={this.props.dialogParams.initialHeight} initialWidth= {this.props.dialogParams.initialWidth}
                    initialX={this.props.initialX} initialY={this.props.initialY}
                    key="GwNonVisualObjectWindow" maximizeabe={true}
                    minHeight={this.props.dialogParams.minHeight} minWidth={this.props.dialogParams.minWidth} minimizeable={false}
                    onClose={this.onToolClose} onShow={this.onShow} title={this.props.dialogParams.title}
                >
                    {body}
                </ResizeableWindow>
            );
        }

        return [window];
    }
}

const selector = (state) => ({
    currentTask: state.task.id,
    layers: state.layers.flat,
    map: state.map,
    theme: state.theme.current,
    nonvisualobjectResult: state.nonvisualobject.nonvisualobjectResult,
    keepManagerOpen: state.nonvisualobject.keepManagerOpen,
    filterFields: state.nonvisualobject.filterFields,
    dialogParams: state.nonvisualobject.dialogParams
});

export default connect(selector, {
    setCurrentTask: setCurrentTask,
    processFinished: processFinished,
    processStarted: processStarted,
    setActiveNonVisualObject: setActiveNonvisualobject
})(GwNonVisualObject);
