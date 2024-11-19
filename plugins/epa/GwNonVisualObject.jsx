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
    };
    static defaultProps = {
        nonvisualobjectResult: null,
        filterFields: null,
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
        if (prevProps.nonvisualobjectResult !== this.props.nonvisualobjectResult) {
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

            //Get widget
            widgets.forEach(widget => {
                if (widget.widgettype == "tableview" || widget.widgettype === "tablewidget") {
                    tableWidget = widget;

                }
            });

            const params = {
                theme: this.props.theme.title,
                tabName: tableWidget.tabname,
                widgetname: tableWidget.columnname,
                tableName: tableWidget.linkedobject,
                filterFields: JSON.stringify(this.props.filterFields)
            };

            axios.get(requestUrl + "getlist", { params: params }).then((response) => {
                const result = response.data;
                this.setState((state) => ({ widgetsProperties: {...state.widgetsProperties, [tableWidget.columnname]: {
                    value: GwUtils.getListToValue(result)
                } } }));
            }).catch((e) => {
                console.log(e);
            });
        } catch (error) {
            console.warn(error);
        }
    };

    onToolClose = () => {
        this.props.setActiveNonVisualObject(null, null);
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

    render() {
        let window = null;
        if (this.props.nonvisualobjectResult !== null) {
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
                    initialHeight={this.props.initialHeight} initialWidth= {this.props.initialWidth}
                    initialX={this.props.initialX} initialY={this.props.initialY}
                    key="GwNonVisualObjectWindow" maximizeabe={false}
                    minHeight={this.props.initialHeight} minWidth={this.props.initialWidth} minimizeable={true}
                    onClose={this.onToolClose} onShow={this.onShow} title={this.props.title}
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
});

export default connect(selector, {
    setCurrentTask: setCurrentTask,
    processFinished: processFinished,
    processStarted: processStarted,
    setActiveNonVisualObject: setActiveNonvisualobject
})(GwNonVisualObject);
