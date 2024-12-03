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



class GwNonVisualObjectsManager extends React.Component {
    static propTypes = {
        currentTask: PropTypes.string,
        initialHeight: PropTypes.number,
        initialWidth: PropTypes.number,
        initialX: PropTypes.number,
        initialY: PropTypes.number,
        layers: PropTypes.array,
        map: PropTypes.object,
        setActiveNonVisualObject: PropTypes.func,
        processFinished: PropTypes.func,
        processStarted: PropTypes.func,
        refreshLayer: PropTypes.func,
        setCurrentTask: PropTypes.func,
        setFilter: PropTypes.func,
        theme: PropTypes.object,
        keepManagerOpen: PropTypes.bool,
        title: PropTypes.string
    };
    static defaultProps = {
        title: 'Non Visual Objects Manager',
        initialHeight: 550,
        initialWidth: 915,
        initialX: null,
        initialY: null,
        keepManagerOpen: true
    };
    state = {
        managerResult: null,
        pendingRequests: false,
        widgetsProperties: {},
        widgetValues: {},
        currentTab: {},
        filterValues: {}

    };

    componentDidUpdate(prevProps, prevState) {
        if (prevProps.currentTask !== this.props.currentTask && this.props.currentTask === "GwNonVisualObjectsManager") {
            this.getManager();
        }
        // Manage close tool
        if (prevProps.currentTask !== this.props.currentTask && this.props.currentTask === null) {
            this.onClose();
        }
         // Check if list need to update (current tab changed)
         if (!isEmpty(this.state.currentTab) && ((prevState.currentTab !== this.state.currentTab))) {
            this.getList(this.state.currentTab.tab);
        }
    }

    onWidgetValueChange = (widget, value) => {
        this.setState((state) => ({
            widgetValues: { ...state.widgetValues, [widget.name]: value },
            widgetsProperties: { ...state.widgetsProperties, [widget.name]: { value: value } }

        }));
        console.log("WIDGETPROPERTIES", this.state.widgetsProperties);
    };

    onTabChanged = (tab, widget) => {
        this.setState({ currentTab: { tab: tab, widget: widget } });
    };

    getList = (tab) => {
        try {
            const requestUrl = GwUtils.getServiceUrl("util");
            let tableWidget = null;

            //Get widget
            GwUtils.forEachWidgetInLayout(tab.layout, (widget) => {
                if (widget.class === "QTableView" || widget.class === "QTableWidget") {
                    tableWidget = widget;
                }
            });

            if (isEmpty(tableWidget) || isEmpty(requestUrl)) {
                return;
            }

            let filters = {};
            const params = {
                theme: this.props.theme.title,
                tableName: tableWidget.property.linkedobject,
                filterFields: filters
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

    // Get list for initial tab
    getListInitial = (result) => {
        try {
            const requestUrl = GwUtils.getServiceUrl("util");
            const widgets = result.body.data.fields;
            let firstTab = null;
            let tableWidget = null;

            //Get first tab form tabWidget
            widgets.forEach(widget => {
                if (widget.widgettype === "tabwidget") {
                    firstTab = widget.tabs[0];
                }

            });
            // Get the tablewidget from the first tab
            widgets.forEach(widget => {
                if (firstTab && widget.tabname === firstTab.tabName) {
                    tableWidget = widget;
                }
            });

            const params = {
                theme: this.props.theme.title,
                tabName: tableWidget.tabname,
                widgetname: tableWidget.columnname,
                tableName: tableWidget.linkedobject,
                filterFields: {}
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

    getManager = () => {
        let pendingRequests = false;

        const requestUrl = GwUtils.getServiceUrl("nonvisual");
        if (!isEmpty(requestUrl)) {
            // Send request
            pendingRequests = true;
            axios.get(requestUrl + "open", { params: {theme: this.props.theme.title} }).then(response => {
                const result = response.data;
                this.getListInitial(result);
                console.log("Non visual objects manager response:", result);
                this.setState({ managerResult: result, pendingRequests: false });
            }).catch((e) => {
                console.log(e);
                this.setState({ pendingRequests: false });
            });
        }
        // Set "Waiting for request..." message
        this.setState({ managerResult: {}, pendingRequests: pendingRequests });
    };

    onClose = () => {
        this.setState({ managerResult: null, pendingRequests: false });
        this.props.setCurrentTask(null);
    };

    onWidgetAction = (action) => {
        let functionName = action.functionName ? action.functionName : action.widgetfunction.functionName;
        switch (functionName) {
        case "openRoughness":
            console.log("Opening roughness...");
            this.openNonVisualObject("lyt_nvo_roughness","nvo_roughness", "cat_mat_roughness", "id", action.row[0].original.id);
            break;
        case "openCurves":
            console.log("Opening curves...");
            this.openNonVisualObject("lyt_nvo_curves","nvo_curves", "v_edit_inp_curve", "id", action.row[0].original.id, "curve_id");
            break;
        case "openPatterns":
            console.log("Opening patterns...");
            this.openNonVisualObject("lyt_nvo_patterns","nvo_patterns", "v_edit_inp_pattern", "pattern_id", action.row[0].original.pattern_id, "pattern_id");
            break;
        case "openTimeseries":
            console.log("Opening tiemseries...");
            break;
        case "openControls":
            console.log("Opening controls...");
            this.openNonVisualObject("lyt_nvo_controls","nvo_controls", "v_edit_inp_controls", "id", action.row[0].original.id);
            break;
        case "openRules":
            console.log("Opening rules...");
            this.openNonVisualObject("lyt_nvo_rules","nvo_rules", "v_edit_inp_rules", "id", action.row[0].original.id);
            break;
        case "openLIDS":
            console.log("Opening LIDS...");
            break;
        case "closeDlg": this.onClose(); break;
        case "help":     GwUtils.openHelp();    break;
        default:
            console.warn(`Action \`${action.name}\` cannot be handled.`);
            break;
        }
    };

    // Open specific non visual object
    openNonVisualObject = (layoutName, formType, tableName, id, idVal, filterColumn=null) => {
        if (!this.props.keepManagerOpen) {
            this.setState({ managerResult: null });
        }
        try{
            const requestUrl = GwUtils.getServiceUrl("nonvisual");
            if (!isEmpty(requestUrl)) {
                // Send request
                console.log("Requesting dialog...");
                const params = {
                    theme: this.props.theme.title,
                    formType: formType,
                    layoutName:layoutName,
                    tableName: tableName,
                    id: id,
                    idVal: idVal
                };

                axios.get(requestUrl + "getnonvisualobject", { params: params }).then(response => {
                    const result = response.data;
                    const filterFields = { [filterColumn]: idVal };

                    //Open non visual object dialog
                    this.props.setActiveNonVisualObject(result, this.props.keepManagerOpen, filterFields);
                    this.props.setCurrentTask("GwNonVisualObject");
                }).catch((e) => {
                    console.log("FAILED: ",e);
                });
            }
        } catch (error) {
            console.warn("ERROR:", error);
        }
    }

    render() {
        let managerWindow = null;
        // Open dialog
        if (this.state.pendingRequests === true || this.state.managerResult !== null) {
            let body = null;
            if (isEmpty(this.state.managerResult)) {
                if (this.state.pendingRequests === true) {
                    body = (<div role="body"><span>Querying...</span></div>); // TODO: TRANSLATION
                } else {
                    body = (<div role="body"><span>No result</span></div>); // TODO: TRANSLATION
                }
            } else {
                const result = this.state.managerResult;
                if (!isEmpty(result.form_xml)) {
                    body = (
                        <div className="generic-manager-body" role="body">
                            <GwQtDesignerForm form_xml={result.form_xml} onWidgetAction={this.onWidgetAction}
                            onTabChanged={this.onTabChanged} onWidgetValueChange={this.onWidgetValueChange} readOnly={false}
                            widgetValues={this.state.widgetValues} useNew widgetsProperties={this.state.widgetsProperties}/>
                        </div>
                    );
                }
            }

            managerWindow = (

                <ResizeableWindow
                    dockable={false} icon="giswater" id="GwNonVisualObjectsManager"
                    initialX={this.props.initialX} initialY={this.props.initialY}
                    key="GwNonVisualObjectsManagerWindow" maximizeabe={false}
                    minHeight={this.props.initialHeight} minWidth={this.props.initialWidth} minimizeable={true}
                    onClose={this.onClose} onShow={this.onShow} title={this.props.title}
                >
                    {body}
                </ResizeableWindow>
            );
        }
        return [managerWindow];
    }
}

const selector = (state) => ({
    currentTask: state.task.id,
    layers: state.layers.flat,
    map: state.map,
    theme: state.theme.current,
});

export default connect(selector, {
    setCurrentTask: setCurrentTask,
    processFinished: processFinished,
    processStarted: processStarted,
    setActiveNonVisualObject: setActiveNonvisualobject
})(GwNonVisualObjectsManager);