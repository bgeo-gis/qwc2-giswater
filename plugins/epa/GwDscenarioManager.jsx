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
import ResizeableWindow from 'qwc2/components/ResizeableWindow';
import { setCurrentTask } from 'qwc2/actions/task';
import { removeLayer, addLayerFeatures } from 'qwc2/actions/layers';
import { processFinished, processStarted } from 'qwc2/actions/processNotifications';
import { setActiveDscenario } from '../../actions/dscenario';
import { openToolBoxProcess } from '../../actions/toolbox';
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
        processId: PropTypes.number
    };

    static defaultProps = {
        title: 'Dscenario manager',
        initialWidth: 1065,
        initialHeight: 515,
        keepManagerOpen: true,
        processId: null
    };

    state = {
        dscenarioManagerResult: null,
        pendingRequests: false,
        widgetsProperties: {},
        widgetValues: {}
    };

    componentDidUpdate(prevProps) {
        if (prevProps.currentTask !== this.props.currentTask && this.props.currentTask === "GwDscenarioManager") {
            this.onShow();
        }
        // Manage close tool
        if (prevProps.currentTask !== this.props.currentTask && this.props.currentTask === null) {
            this.onClose();
        }
        // When user close a toolbox process table is reloaded
        if (prevProps.processId !== this.props.processId && this.props.processId === null) {
            this.getList(this.state.dscenarioManagerResult);
        }
    }

    onShow = () => {
        // Open dialog
        const params = {
            theme: this.props.theme.title,
            dialogName: "dscenario_manager",
            layoutName: "lyt_dscenario_mngr"
        };
        GwUtils.getDialog(params).then((response) => {
            const result = response.data;
            this.setState({ dscenarioManagerResult: result, pendingRequests: false });
            this.getList(result, false)
        }).catch(error => {
            console.error("Failed in getdialog: ", error);
        });
    };

    onClose = () => {
        // Close dialog
        this.props.setCurrentTask(null);
        this.setState({ dscenarioManagerResult: null, pendingRequests: false });
    };

    onWidgetAction = (action) => {
        // Get event (action) from widget
        let functionName = action.functionName || action.widgetfunction.functionName;
        switch (functionName) {
            case "showInactive":{
                console.log("well done")
                this.getList(this.state.dscenarioManagerResult);
                break;
            }
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
                this.props.openToolBoxProcess(3110);
                break;
            }
            case "create_mincut":{
                this.props.openToolBoxProcess(3158);
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

    openDscenario = async (dscenarioId) => {
        // Open dscenario selected
        try {
            const requestUrl = GwUtils.getServiceUrl("dscenariomanager");
            const params = {
                theme: this.props.theme.title,
                formType: "dscenario",
                layoutName: "lyt_dscenario",
                idName: "dscenario_id",
                id: dscenarioId
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

    getList = (dscenarioManagerResult, filter = null) => {
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
            const showInactiveChecked = filter !== null ? filter :!this.state.widgetValues.tab_none_chk_show_inactive;
            const filters =  showInactiveChecked ? {} : { active : { value : true, filterSign : "=" } };
            const params = {
                theme: this.props.theme.title,
                tabName: tableWidget.tabname,
                widgetname: tableWidget.widgetname,
                tableName: tableWidget.linkedobject,
                filterFields: JSON.stringify(filters)
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

    onWidgetValueChange = (widget, value) => {
        this.setState((state) => ({
            widgetValues: { ...state.widgetValues, [widget.name]: value },
            widgetsProperties: { ...state.widgetsProperties, [widget.name]: { value: value } }
        }));
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
                                onWidgetValueChange={this.onWidgetValueChange}
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
    theme: state.theme.current,
    processId: state.toolbox.processId,
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


