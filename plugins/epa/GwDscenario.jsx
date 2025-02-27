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
import { setActiveDscenario } from '../../actions/dscenario';

class GwDscenario extends React.Component {
    static propTypes = {
        currentTask: PropTypes.string,
        initialHeight: PropTypes.number,
        initialWidth: PropTypes.number,
        initialX: PropTypes.number,
        initialY: PropTypes.number,
        theme: PropTypes.object,
        dscenarioResult: PropTypes.object,
        dscenarioId: PropTypes.number,
        setCurrentTask: PropTypes.func,
        setActiveDscenario: PropTypes.func,
        keepManagerOpen: PropTypes.bool,
        title: PropTypes.string,
    };

    static defaultProps = {
        title: 'Dscenario',
        initialWidth: 960,
        initialHeight: 400,
        keepManagerOpen: true,
        dscenarioResult: null,
        dscenarioId: null
    };

    state = {
        widgetValues: {},
        widgetsProperties: {},
        currentTab: {}
    };

    componentDidUpdate(prevProps,prevState) {
        // Open the dialog when dscenario data changes
        if (prevProps.dscenarioResult !== this.props.dscenarioResult) {
            this.openDialog(this.props.dscenarioResult);
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

    openDialog = (dscenarioResult) => {
        // Initialize form values and properties based on the fetched dscenario data
        this.setState({
            widgetValues: dscenarioResult?.values || {},
            widgetsProperties: dscenarioResult?.fields || {}
        });
        this.getListInitial(dscenarioResult);
    };

    getList = (tab) => {
        try {
            const requestUrl = GwUtils.getServiceUrl("util");
            let tableWidget = null;

            console.log(tab)
            //Get widget
            GwUtils.forEachWidgetInLayout(tab.layout, (widget) => {
                if (widget.class === "QTableView" || widget.class === "QTableWidget") {
                    tableWidget = widget;
                }
            });

            if (isEmpty(tableWidget) || isEmpty(requestUrl)) {
                return;
            }

            let filters = { dscenario_id : { value : this.props.dscenarioId, filterSign : "=" } };

            const params = {
                theme: this.props.theme.title,
                tableName: tableWidget.property.linkedobject,
                filterFields: JSON.stringify(filters)
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


            let filters = { dscenario_id : { value : this.props.dscenarioId, filterSign : "=" } };

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

    onClose = () => {
        // Reset the active dscenario data and close the dialog
        this.props.setActiveDscenario(null, false);
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

    render() {
        let window = null;
        if (this.props.dscenarioResult) {
            let body = null;

            // Check if dscenario data is empty or contains form XML
            if (isEmpty(this.props.dscenarioResult.form_xml)) {
                body = <div role="body"><span>No result</span></div>;
            } else {
                body = (
                    <div role="body" className="dscenario-manager-body">
                        <GwQtDesignerForm
                            form_xml={this.props.dscenarioResult.form_xml}
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

            window = (
                <ResizeableWindow
                    dockable={false}
                    icon="giswater"
                    id="GwDscenarioWindow"
                    title={this.props.title}
                    initialWidth={this.props.initialWidth}
                    initialHeight={this.props.initialHeight}
                    initialX={this.props.initialX}
                    initialY={this.props.initialY}
                    key="GwDscenarioWindow"
                    minHeight={this.props.initialHeight}
                    minWidth={this.props.initialHeight}
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
        dscenarioResult: state.dscenario.dscenarioResult,
        dscenarioId: state.dscenario.dscenarioId,
    };
};

export default connect(selector, {
    setCurrentTask: setCurrentTask,
    setActiveDscenario: setActiveDscenario
})(GwDscenario);
