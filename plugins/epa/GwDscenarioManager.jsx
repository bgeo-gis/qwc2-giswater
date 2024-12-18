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
import { removeLayer, addLayerFeatures } from 'qwc2/actions/layers';
import { processFinished, processStarted } from 'qwc2/actions/processNotifications';
import { setActiveDscenario, openToolBoxProcess } from '../../actions/dscenario';
import GwQtDesignerForm from '../../components/GwQtDesignerForm';
import GwUtils from '../../utils/GwUtils';


class GwDscenarioManager extends React.Component {
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
        setCurrentTask: PropTypes.func,
        setActiveDscenario: PropTypes.func,
        openToolBoxProcess: PropTypes.func,
        setFilter: PropTypes.func,
        theme: PropTypes.object,
        title: PropTypes.string,
        addLayerFeatures: PropTypes.func,
        keepManagerOpen: PropTypes.bool,
        removeLayer: PropTypes.func,
    };

    static defaultProps = {
        title: 'Dscenario manager',
        initialWidth: 1065,
        initialHeight: 375,
        keepManagerOpen: true
    };

    state = {
        dscenarioManagerResult: null,
        pendingRequests: false,
        widgetsProperties: {},
        widgetValues: {}
    };

    componentDidUpdate(prevProps) {
        if (prevProps.currentTask !== this.props.currentTask && this.props.currentTask === "GwDscenarioManager") {
            this.getDialog();
        }
        // Manage close tool
        if (prevProps.currentTask !== this.props.currentTask && this.props.currentTask === null) {
            this.onClose();
        }
    }

    onShow = () => {
        // Make service request
        this.getDialog();
    };


    getDialog = () => {
        // Open dialog
        const requestUrl = GwUtils.getServiceUrl("dscenariomanager");
        if (!isEmpty(requestUrl)) {
            axios.get(requestUrl + "dialog", { params: { theme: this.props.theme.title } }).then(response => {
                const result = response.data;
                this.getList(result)
                this.setState({ dscenarioManagerResult: result, pendingRequests: false });
            }).catch((e) => {
                console.log(e);
                this.setState({ pendingRequests: false });
            });
        }
    };

    onClose = () => {
        this.props.setCurrentTask(null);
        this.setState({ dscenarioManagerResult: null, pendingRequests: false });
    };

    onWidgetAction = (action) => {
        // Get event (action) from widget
        let functionName = action.functionName || action.widgetfunction.functionName;
        switch (functionName) {
            case "toggle_active":{
                const dscenarioId = action.row.map((row) => row.original.id)[0];
                const isActive = action.row.map((row) => row.original.active)[0];
                this.toggleActive(dscenarioId, isActive).then(() => {
                    // Refresh the list after setting active
                    this.getList(this.state.dscenarioManagerResult);
                }).catch(error => {
                    console.error("Failed to setting active: ", error);
                });
                action.removeSelectedRow();
                break;
            }
            case "doubleClickselectedRow":{
                const dscenarioId = action.rowData.id;
                this.openDscenario(dscenarioId);
                break;
            }
            case "create_crm":{
                // not yet
                this.openToolBoxProcess(3110);

                break;
            }
            case "create_mincut":{
                // not yet
                this.openToolBoxProcess(3158);
                break;
            }
            case "delete":{
                const ids = action.row.map((row) => row.original.id);
                if (!confirm(`CAUTION! Deleting a dscenario will delete data from features related to the dscenario.`
                    + `\nAre you sure you want to delete these records:\n${ids.toString()}`)) {
                    break;
                }
                const promises = action.row.map((row) => {
                    return this.deleteDscenario(row.original.id);
                });
                Promise.all(promises).then(() => {
                    this.getList(this.state.dscenarioManagerResult);
                });
                action.removeSelectedRow();
                break;
            }
            case "close_dlg":
                this.onClose();
                break;
            case "help":
                GwUtils.openHelp();
                break;
        }
    };

    openToolBoxProcess = (processId) => {
        this.props.openToolBoxProcess(processId);
        this.props.setCurrentTask("GwToolbox");
    }

    openDscenario = async (dscenarioId) => {
        try {
            const requestUrl = GwUtils.getServiceUrl("dscenariomanager");
            const params = {
                theme: this.props.theme.title,
                formType: "dscenario",
                layoutName: "lyt_dscenario"
            };

            // Make a request to open the workspace dialog without an ID
            const response = await axios.get(requestUrl + "getdscenario", { params });
            const result = response.data;

            // Check if the response is valid
            if (result.status !== "Accepted") {
                return;
            }

            // Set the active workspace and switch to the workspace object task
            this.props.setActiveDscenario(result, this.props.keepManagerOpen, dscenarioId);
            this.props.setCurrentTask("GwDscenario");
        } catch (error) {
            console.error("Error fetching dscenario create dialog:", error);
        }
    };

    toggleActive = async (dscenarioId, active) => {
        // Set active dscenario
        try {
            const requestUrl = GwUtils.getServiceUrl("dscenariomanager");
            const params = {
                theme: this.props.theme.title,
                dscenarioId: dscenarioId,
                active: active
            };
            try {
                return await axios.get(requestUrl + "setactive", { params });
            } catch (e) {
                console.log(e);
            }
        } catch (error) {
            console.warn(error);
            return Promise.reject(error);
        }
    };

    deleteDscenario = async (dscenarioId) => {
        // Manage delete selected epa results
        try {
            const requestUrl = GwUtils.getServiceUrl("dscenariomanager");
            const params = {
                theme: this.props.theme.title,
                dscenarioId: dscenarioId
            };
            try {
                return await axios.delete(requestUrl + "delete", { params });
            } catch (e) {
                console.log(e);
            }
        } catch (error) {
            console.warn(error);
            return Promise.reject(error);
        }
    };

    loadWidgetsProperties = (widgetsProperties) => {
        this.setState((state) => ({ widgetsProperties: { ...state.widgetsProperties, ...widgetsProperties } }));
    };

    getList = (dscenarioManagerResult) => {
        //Fill table widget
        try {
            const requestUrl = GwUtils.getServiceUrl("util");
            const widgets = dscenarioManagerResult.body.data.fields;
            let tableWidget = null;

            widgets.forEach(widget => {
                if (widget.widgettype === "tablewidget") {
                    tableWidget = widget;
                }
            });

            if (isEmpty(tableWidget) || isEmpty(requestUrl)) {
                return;
            }

            const params = {
                theme: this.props.theme.title,
                tabName: tableWidget.tabname,
                widgetname: tableWidget.widgetname,
                tableName: tableWidget.linkedobject,
                filterFields: {}
            };
            axios.get(requestUrl + "getlist", { params: params }).then((response) => {
                const result = response.data;
                this.setState((state) => ({ widgetsProperties: {...state.widgetsProperties, [tableWidget.widgetname]: {
                    value: GwUtils.getListToValue(result)
                } } }));
            }).catch((e) => {
                console.log(e);
            });
        } catch (error) {
            console.warn(error);
        }
    };

    render() {
        let resultWindow = null;

        if (this.state.pendingRequests === true || this.state.dscenarioManagerResult !== null) {
            let body = null;

            if (isEmpty(this.state.dscenarioManagerResult)) {
                let msg = this.state.pendingRequests === true ? "Querying..." : "No result" // TODO: TRANSLATION
                body = (<div role="body"><span>{msg}</span></div>);
            } else {

                const result = this.state.dscenarioManagerResult;
                if (!isEmpty(result.form_xml)) {
                    body = (
                        <div role="body" className="dscenario-manager-body">
                            <GwQtDesignerForm
                                form_xml={result.form_xml}
                                onWidgetAction={this.onWidgetAction}
                                loadWidgetsProperties={this.loadWidgetsProperties}
                                readOnly={false}
                                widgetValues={this.state.widgetValues}
                                useNew widgetsProperties={this.state.widgetsProperties}
                            />
                        </div>
                    );
                }
            }

            resultWindow = (
                <ResizeableWindow
                    dockable={false}
                    icon="giswater"
                    id="GwDscenarioManager"
                    initialHeight={this.props.initialHeight}
                    initialWidth={this.props.initialWidth}
                    initialX={this.props.initialX}
                    initialY={this.props.initialY}
                    key="GwDscenarioManagerWindow"
                    maximizeabe={false}
                    minHeight={this.props.initialHeight}
                    minWidth={this.props.initialWidth}
                    minimizeable={false}
                    onClose={this.onClose}
                    onShow={this.onShow}
                    title={this.props.title}
                >
                    {body}
                </ResizeableWindow>
            );
        }
        return [resultWindow];
    }
}

const selector = (state) => ({
    currentTask: state.task.id,
    layers: state.layers.flat,
    map: state.map,
    theme: state.theme.current
});

export default connect(selector, {
    setCurrentTask: setCurrentTask,
    processFinished: processFinished,
    processStarted: processStarted,
    removeLayer: removeLayer,
    addLayerFeatures: addLayerFeatures,
    setActiveDscenario: setActiveDscenario,
    openToolBoxProcess: openToolBoxProcess
})(GwDscenarioManager);

