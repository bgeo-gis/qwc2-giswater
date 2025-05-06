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
import { processFinished, processStarted } from 'qwc2/actions/processNotifications';
import { setActiveWorkspace } from "../../actions/workspace";
import LocaleUtils from 'qwc2/utils/LocaleUtils';

import GwQtDesignerForm from '../../components/GwQtDesignerForm';
import GwUtils from '../../utils/GwUtils';
import {reloadLayersFilters} from '../../actions/selector';
class GwWorkspaceManager extends React.Component {

    static propTypes = {
        currentTask: PropTypes.string,
        initialHeight: PropTypes.number,
        initialWidth: PropTypes.number,
        initialX: PropTypes.number,
        initialY: PropTypes.number,
        layers: PropTypes.array,
        map: PropTypes.object,
        setActiveWorkspace: PropTypes.func,
        processFinished: PropTypes.func,
        processStarted: PropTypes.func,
        refreshLayer: PropTypes.func,
        setCurrentTask: PropTypes.func,
        setFilter: PropTypes.func,
        keepManagerOpen: PropTypes.bool,
        theme: PropTypes.object,
        title: PropTypes.string,
        reloadLayersFilters: PropTypes.func,
        geometry: PropTypes.object
    };

    static defaultProps = {
        title: 'Workspace management',
        initialWidth: 1050,
        initialHeight: 476,
        keepManagerOpen: true,
        geometry: null
    };

    state = {
        workspaceManagementResult: null,
        pendingRequests: false,
        widgetsProperties: {},
        widgetValues: {},
        infoText: ""
    };

    componentDidUpdate(prevProps) {
        if (prevProps.currentTask !== this.props.currentTask) {
            if (this.props.currentTask === "GwWorkspaceManager") {
                this.onShow();
            }
        }

        // Detect refreshManager change and refresh the list
        if (prevProps.refreshManager !== this.props.refreshManager) {
            this.getList(this.state.workspaceManagementResult);
        }

        // Close tool
        if (prevProps.currentTask !== this.props.currentTask && this.props.currentTask === null) {
            this.onClose();
        }
    }

    onShow = () => {
        // Open dialog
        const params = {
            theme: this.props.theme.title,
            dialogName: "workspace_manager",
            layoutName: "lyt_workspace_mngr"
        };
        GwUtils.getDialog(params).then((response) => {
            const result = response.data;
            this.setState({ workspaceManagementResult: result, pendingRequests: false });
            this.getList(result)
        }).catch(error => {
            console.error("Failed in getdialog: ", error);
            this.setState({ pendingRequests: false });
        });
    };

    onpenWorkspaceObject = (optionalAtr = null) => {
        // Open dialog
        let params = {
            theme: this.props.theme.title,
            dialogName: "workspace_open",
            layoutName: "lyt_workspace_open"
        };

        if (optionalAtr) {
            params = {...params, ...optionalAtr }
        }

        GwUtils.getDialog(params).then((response) => {
            const result = response.data;
            this.props.setActiveWorkspace({...result, ...optionalAtr }, this.props.keepManagerOpen);
            this.props.setCurrentTask("GwWorkspaceObject");
        }).catch(error => {
            console.error("Failed in getdialog: ", error);
            this.setState({ pendingRequests: false });
        });
    };

    getList = (workspaceManagementResult) => {
        //Fill table widget

        try {
            const requestUrl = GwUtils.getServiceUrl("util");
            const widgets = workspaceManagementResult.body.data.fields;
            let tableWidget = null;


            widgets.forEach(widget => {
                if (widget.widgettype === "tablewidget") {
                    tableWidget = widget;

                }
            });

            const params = {
                theme: this.props.theme.title,
                tabName: tableWidget.tabname,
                widgetname: tableWidget.widgetname,
                tableName: 'tbl_workspace_manager',
                filterFields: {}
            };

            axios.get(requestUrl + "getlist", { params: params })
                .then((response) => {
                    const result = response.data;
                    // Update the state with the new widgetsProperties
                    this.setState((state) => ({
                        widgetsProperties: {
                            ...state.widgetsProperties,
                            [tableWidget.widgetname]: {
                                value: GwUtils.getListToValue(result) // Ensure this method parses the result correctly
                            }
                        }
                    }));
                })
                .catch((e) => {
                    // Log the error with more context
                    console.error("Error in getlist API call:", e);
                });

        } catch (error) {
            console.warn(error);
        }
    };

    onClose = () => {
        this.props.setCurrentTask(null);
        this.setState({ workspaceManagementResult: null, pendingRequests: false });
    };

    onRowSelect = async (rowId) => {
        try {
            const requestUrl = GwUtils.getServiceUrl("workspace");
            const params = {
                theme: this.props.theme.title,
                action: "INFO",
                id: rowId
            };

            const response = await axios.post(`${requestUrl}manage`, params);
            const result = response.data;
            if (result.status === "Accepted") {
                // Update the state or info panel with the fetched data
                this.setState({
                    infoData: result.body.form.infoText || {}
                });
            } else {
                console.error("Failed to fetch row information:", result.message);
            }
        } catch (error) {
            console.error("Error during row selection:", error);
        }
    };

    help = () => {
        console.log("help pressed")
    }

    onWidgetAction = (action) => {
        // Get event (action) from widget
        const functionName = action.functionName || action.widgetfunction.functionName;
        switch (functionName) {
            case "selectedRow":{
                // Fill log if row is selected
                if (action.rowSelection) {
                    this.fetchWorkspaceInfo(action.rowData.id);
                }else{
                    // Clean log if row is unselected
                    this.setState((state) => ({
                        widgetsProperties: { ...state.widgetsProperties, ["tab_none_txt_info"]: { value: "" } }
                    }));
                }
                break;
            }
            case "setCurrent": {
                const selectedId = action.row.map((row) => row.original.id)[0];
                this.setCurrentWorkspace(selectedId);
                break;
            }
            case "togglePrivacy": {
                const selectedId = action.row.map((row) => row.original.id)[0];
                this.togglePrivacy(selectedId).then(() => {
                    // Refresh the table after toggling privacy
                    this.getList(this.state.workspaceManagementResult);
                }).catch((error) => {
                    console.error("Failed to toggle privacy:", error);
                    alert("An error occurred while toggling privacy.");
                });
                break;
            }

            case "create": {
                this.onpenWorkspaceObject();
                break;
            }
            case "edit": {
                const selectedId = action.row.map((row) => row.original.id)[0];
                const other = {
                    tableName: "cat_workspace",
                    id: selectedId,
                    idName: "id"
                }
                this.onpenWorkspaceObject(other);
                break;
            }
            case "delete":{
                const ids = action.row.map((row) => row.original.id);
                if (!confirm(`Are you sure you want to delete these records:\n${ids.toString()}`)) {
                    break;
                }
                const promises = action.row.map((row) => {
                    return this.deleteWorkspace(row.original.id);
                });
                Promise.all(promises).then(() => {
                    this.getList(this.state.workspaceManagementResult);
                });
                action.removeSelectedRow();
                break;
            }
            case "closeDlg":
                this.onClose();
                break;
            case "help":
                this.help();
                break;
            default:
                console.warn(`Action \`${action.name}\` cannot be handled.`);
                break;
        }
    };

    deleteWorkspace = async (workspaceId) => {
        try {
            const requestUrl = GwUtils.getServiceUrl("workspace");
            const data = {
                theme: this.props.theme?.title || '',
                action: "DELETE",
                id: workspaceId
            };

            // Call the manage endpoint with the correct payload structure
            const response = await axios.post(requestUrl + "manage", data);
            const result = response.data;
            // Check the response status
            if (result.status !== "Accepted") {
                console.error("Failed to delete workspace:", result.message);
                alert("Failed to delete workspace: " + result.message?.text || result.message);
                return;
            }

            // Refresh the list of workspaces
            this.getList(this.state.workspaceManagementResult);
        } catch (error) {
            console.error("Error deleting workspace:", error);
            alert("An error occurred while deleting the workspace.");
        }
    };


    setCurrentWorkspace = async (workspaceId) => {
        try {
            const requestUrl = GwUtils.getServiceUrl("workspace");
            const payload = {
                theme: this.props.theme.title,
                filterFields: {},
                pageInfo: {},
                type: "workspace",
                id: workspaceId,
            };

            // Execute the procedure to set the current workspace
            const response = await axios.post(`${requestUrl}setcurrent`, payload);
            this.props.reloadLayersFilters(response.data.geometry);

        } catch (error) {
            console.error("Error setting workspace as current:", error.message);
            alert(`An error occurred: ${error.message} (INP CONFIGURATION IS NULL)`);
        }
    };

    togglePrivacy = async (workspaceId) => {
        try {
            const requestUrl = GwUtils.getServiceUrl("workspace");
            const payload = {
                theme: this.props.theme?.title || "",
                action: "TOGGLE",
                id: workspaceId,
            };

            const response = await axios.post(`${requestUrl}manage`, payload);
            const result = response.data;

            if (result.status !== "Accepted") {
                alert(`Failed to toggle privacy: ${result.message?.text || result.message}`);
            }
        } catch (error) {
            console.error("Error toggling privacy:", error.message);
            throw error;
        }
    };

    fetchWorkspaceInfo = async (workspaceId) => {
        try {
            const requestUrl = GwUtils.getServiceUrl("workspace");
            const payload = {
                theme: this.props.theme.title, // Ensure theme is passed correctly
                action: "INFO",
                id: workspaceId, // Pass the workspace ID
            };

            // Make the request to the backend
            const response = await axios.post(`${requestUrl}manage`, payload);
            const result = response.data;

            if (result.status === "Accepted") {
                // Use the infoText from the backend response
                const infoText = result.body.infoText || "No additional information available.";
                this.setState((state) => ({
                    widgetsProperties: { ...state.widgetsProperties, ["tab_none_txt_info"]: { value: infoText } }
                }));
            } else {
                console.error("Failed to fetch workspace info:", result.message);
                alert(`Error: ${result.message}`);
            }
        } catch (error) {
            console.error("Error fetching workspace info:", error.message);
            alert(`An error occurred: ${error.message}`);
        }
    };

    render() {
        let resultWindow = null;

        if (this.state.pendingRequests === true || this.state.workspaceManagementResult !== null) {
            let body = null;

            if (isEmpty(this.state.workspaceManagementResult)) {
                let msg = this.state.pendingRequests === true ? "Querying..." : "No result" // TODO: TRANSLATION
                body = (<div role="body"><span>{msg}</span></div>);
            } else {

                const result = this.state.workspaceManagementResult;
                if (!isEmpty(result.form_xml)) {
                    body = (
                        <div role="body" className="workspace-manager-body">
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
                    id="GwWorkspaceManagement"
                    initialHeight={this.props.initialHeight}
                    initialWidth={this.props.initialWidth}
                    initialX={this.props.initialX}
                    initialY={this.props.initialY}
                    key="GwWorkspaceManagementWindow"
                    maximizeabe={false}
                    minHeight={this.props.initialHeight}
                    minWidth={this.props.initialWidth}
                    minimizeable={false}
                    onClose={this.onClose}
                    onShow={this.onShow}
                    title={LocaleUtils.tr("appmenu.items.GwWorkspaceManager") || this.props.title}
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
    theme: state.theme.current,
    refreshManager: state.workspace.refreshManager,
    geometry: state.selector.geometry
});

export default connect(selector, {
    setCurrentTask: setCurrentTask,
    processFinished: processFinished,
    processStarted: processStarted,
    setActiveWorkspace: setActiveWorkspace,
    reloadLayersFilters: reloadLayersFilters
})(GwWorkspaceManager);