/**
 * Copyright © 2024 by BGEO. All rights reserved.
 * The program is free software: you can redistribute it and/or modify it under the terms of the GNU
 * General Public License as published by the Free Software Foundation, either version 3 of the License,
 * or (at your option) any later version
 */

import React from 'react';
import PropTypes from 'prop-types';
import { connect } from 'react-redux';
import isEmpty from 'lodash.isempty';

import ResizeableWindow from 'qwc2/components/ResizeableWindow';
import { setCurrentTask } from 'qwc2/actions/task';
import { setActiveWorkspace, setRefreshManager } from '../actions/workspace';

import GwQtDesignerForm from '../components/GwQtDesignerForm';
import GwUtils from '../utils/GwUtils';
import axios from 'axios';


class GwWorkspaceObject extends React.Component {
    static propTypes = {
        currentTask: PropTypes.string,
        initialHeight: PropTypes.number,
        initialWidth: PropTypes.number,
        initialX: PropTypes.number,
        initialY: PropTypes.number,
        theme: PropTypes.object,
        workspaceData: PropTypes.object,
        setCurrentTask: PropTypes.func,
        setActiveWorkspace: PropTypes.func,
        keepManagerOpen: PropTypes.bool,
        title: PropTypes.string,
    };

    static defaultProps = {
        title: 'Workspace Management',
        initialWidth: 400,
        initialHeight: 300,
        keepManagerOpen: true,
        workspaceData: null,
    };

    state = {
        widgetValues: {},
        widgetsProperties: {},
    };

    componentDidUpdate(prevProps) {
        // Open the dialog when workspace data changes
        if (prevProps.workspaceData !== this.props.workspaceData) {
            this.initializeForm(this.props.workspaceData);
        }

        // Close the dialog when the task is reset
        if (prevProps.currentTask !== this.props.currentTask && this.props.currentTask === null) {
            this.onClose();
        }
    }

    initializeForm = (workspaceData) => {
        // Initialize form values and properties based on the fetched workspace data
        const widgetValues = workspaceData?.values || {};
        const workspaceId = workspaceData?.id || null; // Extract the id from the response

        this.setState({
            widgetValues: widgetValues,
            widgetsProperties: workspaceData?.fields || {},
            workspaceId: workspaceId,
        });

    };

    onWidgetValueChange = (widget, value) => {
        this.setState((state) => ({
            widgetValues: { ...state.widgetValues, [widget.name]: value },
            widgetsProperties: { ...state.widgetsProperties, [widget.name]: { value: value } }

        }));
    };

    onClose = () => {
        // Reset the active workspace data and close the dialog
        this.props.setActiveWorkspace(null, false);
        if (!this.props.keepManagerOpen) {
            this.props.setCurrentTask(null);
        }
    };

    onSave = async () => {
        const { widgetValues, workspaceId } = this.state;
        const { workspaceData } = this.props;

        if (!widgetValues || !workspaceData) {
            console.error("Missing data: widgetValues or workspaceData is undefined.");
            return;
        }

        const name = widgetValues["tab_none_name"];
        const descript = widgetValues["tab_none_descript"];
        const isPrivate = widgetValues["tab_none_private"];
        if (!name) {
            alert("Please fill out all required fields before saving.");
            return;
        }

        const payload = {
            theme: this.props.theme?.title || "",
            action: workspaceId ? "UPDATE" : "CREATE", // Determine action based on ID presence
            id: workspaceId,
            name,
            descript,
            private: isPrivate,
        };

        try {
            const requestUrl = GwUtils.getServiceUrl("workspace");
            const response = await axios.post(`${requestUrl}manage`, payload);
            const result = response.data;

            if (result.status === "Accepted") {
                alert("Workspace saved successfully!");
                this.props.setActiveWorkspace(null, false);

                // Refresh the workspace manager
                this.props.setRefreshManager();

                if (!this.props.keepManagerOpen) {
                    this.props.setCurrentTask(null);
                }
            } else {
                alert(`Error: ${result.message}`);
            }
        } catch (error) {
            console.error("Error saving workspace:", error.message);
        }
    };

    onWidgetAction = (action) => {
        const functionName = action.functionName || action.widgetfunction?.functionName;
        switch (functionName) {
            case "closeDlg":
                this.onClose();
                break;
            case "help":
                console.log("Help action triggered.");
                break;
            case "saveFeat":
                this.onSave();
                break;
        }
    };

    render() {
        let window = null;
        const { initialWidth, initialHeight, initialX, initialY, workspaceData } = this.props;
        if (workspaceData) {
            let body = null;

            // Check if workspace data is empty or contains form XML
            if (isEmpty(workspaceData.form_xml)) {
                body = <div role="body"><span>No result</span></div>;
            } else {
                body = (
                    <div className="workspace-object-body" role="body">
                        <GwQtDesignerForm
                            form_xml={workspaceData.form_xml}
                            onWidgetAction={this.onWidgetAction}
                            onWidgetValueChange={this.onWidgetValueChange}
                            readOnly={false}
                            widgetValues={this.state.widgetValues}
                            widgetsProperties={this.state.widgetsProperties}
                            useNew={true}
                        />
                    </div>
                );
            }

            const title = "Workspace Object";
            window = (
                <ResizeableWindow
                    dockable={false}
                    icon="giswater"
                    id="GwWorkspaceObjectWindow"
                    title={title}
                    initialWidth={initialWidth}
                    initialHeight={initialHeight}
                    initialX={initialX}
                    initialY={initialY}
                    key="GwWorkspaceObjectWindow"
                    minHeight={400}
                    minWidth={300}
                    onClose={this.onClose}
                >
                    {body}
                </ResizeableWindow>
            );
        }

        return [window];
    }
}

const selector = (state) => {
    return {
        currentTask: state.task.id,
        theme: state.theme.current,
        workspaceData: state.workspace.workspaceData,
    };
};

export default connect(selector, {
    setCurrentTask: setCurrentTask,
    setActiveWorkspace: setActiveWorkspace,
    setRefreshManager: setRefreshManager,
})(GwWorkspaceObject);
