/**
 * Copyright © 2025 by BGEO. All rights reserved.
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
import GwQtDesignerForm from '../../components/GwQtDesignerForm';
import GwUtils from '../../utils/GwUtils';
import axios from 'axios';
import { setActivePsector } from '../../actions/psector';
import LocaleUtils from 'qwc2/utils/LocaleUtils';

class GwPsector extends React.Component {
    static propTypes = {
        currentTask: PropTypes.string,
        initialX: PropTypes.number,
        initialY: PropTypes.number,
        theme: PropTypes.object,
        psectorResult: PropTypes.object,
        psectorObj: PropTypes.object,
        setCurrentTask: PropTypes.func,
        setActivePsector: PropTypes.func,
        keepManagerOpen: PropTypes.bool,
        title: PropTypes.string,
    };

    static defaultProps = {
        title: 'Psector',
        keepManagerOpen: true,
        psectorResult: null,
        psectorObj: null
    };

    state = {
        widgetValues: {},
        widgetsProperties: {},
        currentTab: {}
    };

    componentDidUpdate(prevProps,prevState) {
        // Open the dialog when psector data changes
        if (prevProps.psectorResult !== this.props.psectorResult) {
            this.openDialog();
        }

        // Close the dialog when the task is reset
        if (prevProps.currentTask !== this.props.currentTask && this.props.currentTask === null) {
            this.onClose();
        }

        // Check if list need to update (current tab changed)
        if (!isEmpty(this.state.currentTab) && ((prevState.currentTab !== this.state.currentTab))) {
            this.getList(this.state.currentTab.tab);
        }
    }

    openDialog = () => {
        // Initialize form values and properties based on the fetched psector data
        const psector = this.props.psectorObj;
        if (psector) {
            this.setState({
                widgetValues: this.props.psectorResult?.values || {},
                widgetsProperties: this.props.psectorResult?.fields || {}
            });

            const params = {
                theme: this.props.theme.title,
                psectorId: psector.id
            };
            this.getBudget(params).then((response) => {
                const fields = response.data?.fields;
                console.log("Result: ", fields);
                if (fields) {
                    Object.keys(fields).forEach(key => {
                        if (!["gexpenses", "vat", "other"].includes(key)) {
                            fields[key] += " €";
                        }
                        this.setState((state) => ({
                            widgetsProperties: { ...state.widgetsProperties, [`tab_budget_${key}`]: { value: fields[key] } }
                        }));
                    });
                }
            }).catch(error => {
                console.error("Failed in getPsector: ", error);
            });
        }
    };

    getList = (tab) => {
        try {
            const requestUrl = GwUtils.getServiceUrl("util");
            if (isEmpty(requestUrl)) {
                return;
            }

            GwUtils.forEachWidgetInLayout(tab.layout, (widget) => {
                if (widget.class === "QTableView" || widget.class === "QTableWidget") {

                    console.log("Linked object: ", widget.property.linkedobject);

                    let filters = {}
                    switch (widget.property.linkedobject) {
                        case "prices_results":
                            break;
                        case "doc_results":
                            filters = { psector_name: { value: this.props.psectorObj.name, filterSign: "=" } };
                            break;
                        default:
                            filters = { psector_id: { value: this.props.psectorObj.id, filterSign: "=" } };
                            break;
                    }

                    const params = {
                        theme: this.props.theme.title,
                        tableName: widget.property.linkedobject,
                        filterFields: JSON.stringify(filters)
                    };

                    axios.get(requestUrl + "getlist", { params: params }).then((response) => {
                        const result = response.data;
                        this.setState((state) => ({
                            tableValues: { ...state.tableValues, [widget.name]: result },
                            widgetsProperties: {
                                ...state.widgetsProperties,
                                [widget.name]: { value: GwUtils.getListToValue(result) }
                            }
                        }));
                    }).catch((e) => {
                        console.warn(e);
                    });
                }
            });

        } catch (error) {
            console.error(error);
        }
    };


    onWidgetValueChange = (widget, value) => {
        this.setState((state) => ({
            widgetValues: { ...state.widgetValues, [widget.name]: value },
            widgetsProperties: { ...state.widgetsProperties, [widget.name]: { value: value } }
        }));
    };

    onClose = () => {
        // Reset the active psector data and close the dialog
        this.props.setActivePsector(null, false);
        if (!this.props.keepManagerOpen) {
            this.props.setCurrentTask(null);
        }
    };

    onWidgetAction = (action) => {
        const functionName = action.functionName || action.widgetfunction?.functionName;
        switch (functionName) {
            case "close_dlg":
                this.onClose();
                break;
            case "doubleClickselectedRow":
                const path = action.rowData?.path;
                if (!isEmpty(path)) {
                    window.open(path, '_blank');
                }
                break;
            case "help":
                console.log("Help action triggered.");
                break;
            default:
                console.warn(`Unhandled action: ${functionName}`);
                break;
        }
    };

    onTabChanged = (tab, widget) => {
        this.setState({ currentTab: { tab: tab, widget: widget } });
    };

    getBudget(params){
        try {
            const requestUrl = GwUtils.getServiceUrl("psectormanager");
            try {
                return axios.get(requestUrl + "getbudget", { params: params });
            } catch (e) {
                console.log(e);
            }
        } catch (error) {
            console.warn(error);
            return Promise.reject(error);
        }
    }

    render() {
        let window = null;
        if (this.props.psectorResult) {
            let body = null;

            // Check if psector data is empty or contains form XML
            if (isEmpty(this.props.psectorResult.form_xml)) {
                body = <div role="body"><span>No result</span></div>;
            } else {
                body = (
                    <div role="body" className="psector-manager-body">
                        <GwQtDesignerForm
                            form_xml={this.props.psectorResult.form_xml}
                            onWidgetAction={this.onWidgetAction}
                            onWidgetValueChange={this.onWidgetValueChange}
                            readOnly={false}
                            widgetValues={this.state.widgetValues}
                            widgetsProperties={this.state.widgetsProperties}
                            useNew={true}
                            onTabChanged={this.onTabChanged}
                        />
                    </div>
                );
            }
            const width = 1050;
            const height = 628;
            window = (
                <ResizeableWindow
                    dockable={false}
                    icon="giswater"
                    id="GwPsectorWindow"
                    title={LocaleUtils.tr("appmenu.items.GwPsector") || this.props.title}
                    initialWidth={width}
                    initialHeight={height}
                    initialX={this.props.initialX}
                    initialY={this.props.initialY}
                    key="GwPsectorWindow"
                    minHeight={height}
                    minWidth={width}
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
        psectorResult: state.psector.psectorResult,
        psectorObj: state.psector.psectorObj,
    };
};

export default connect(selector, {
    setCurrentTask: setCurrentTask,
    setActivePsector: setActivePsector
})(GwPsector);
