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
import GwQtDesignerForm from '../../components/GwQtDesignerForm';
import GwUtils from '../../utils/GwUtils';
import { setActivePsector } from '../../actions/psector';

class GwPsectorManager extends React.Component {
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
        setActivePsector: PropTypes.func,
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
        title: 'Psector management',
        initialWidth: 1240,
        initialHeight: 585,
        keepManagerOpen: true,
    };

    state = {
        psectorManagerResult: null,
        pendingRequests: false,
        widgetsProperties: {},
        widgetValues: {},
    };

    componentDidUpdate(prevProps) {
        if (prevProps.currentTask !== this.props.currentTask && this.props.currentTask === "GwPsectorManager") {
            this.onShow();
        }
        // Manage close tool
        if (prevProps.currentTask !== this.props.currentTask && this.props.currentTask === null) {
            this.onClose();
        }
        // When user close a toolbox process table is reloaded
        if (prevProps.processId !== this.props.processId && this.props.processId === null) {
            this.getList(this.state.psectorManagerResult);
        }
    }

    onShow = () => {
        // Open dialog
        const params = {
            theme: this.props.theme.title,
            dialogName: "psector_manager",
            layoutName: "lyt_psector_mngr"
        };
        GwUtils.getDialog(params).then((response) => {
            const result = response.data;
            this.setState({ psectorManagerResult: result, pendingRequests: false });
            this.getList(result, false)
        }).catch(error => {
            console.error("Failed in getdialog: ", error);
        });
    };

    onClose = () => {
        // Close dialog
        this.props.setCurrentTask(null);
        this.setState({ psectorManagerResult: null, pendingRequests: false });
    };

    onWidgetAction = (action) => {
        // Get event (action) from widget
        const functionName = action.functionName || action.widgetfunction.functionName;
        switch (functionName) {
            case "selectedRow":{
                // Fill log if row is selected
                if (action.rowSelection) {
                    this.fillTxtInfoLog(action.rowData);
                }else{
                    // Clean log if row is unselected
                    this.setState((state) => ({
                        widgetsProperties: { ...state.widgetsProperties, ["tab_none_txt_info"]: { value: "" } }
                    }));
                }
                break;
            }
            case "doubleClickselectedRow":{
                const psectorObj = action.rowData;
                this.openPsector(psectorObj);
                break;
            }
            case "showPsector":{
                const ids = action.row.map((row) => row.original.id);
                this.getPsectorFeatures(ids).then((response) => {
                    const style = {
                        lineStyle: {
                            strokeColor: [200, 30, 30, 1],
                            strokeWidth: 6
                        },
                        pointStyle: {
                            strokeColor: [200, 30, 30, 1],
                            strokeWidth: 1,
                            circleRadius: 3,
                            fillColor: [200, 30, 30, 1]
                        }
                    }
                    GwUtils.manageGeoJSON(response.data, this.props, style)
                });
                break;
            }
            case "showInactive":{
                this.getList(this.state.psectorManagerResult);
                break;
            }
            case "closeDlg":
                this.onClose();
                break;
            case "help":
                GwUtils.openHelp();
                break;
            default:
                print(functionName);
        }
    };

    openPsector = async (psectorObj) => {
        // Open psector selected
        try {
            const params = {
                theme: this.props.theme.title,
                dialogName: "psector",
                layoutName: "lyt_psector",
                idName: "psector_id",
                id: psectorObj.id,
                tableName: "plan_psector"
            };
            GwUtils.getDialog(params).then((response) => {
                const result = response.data;
                this.props.setActivePsector(result, this.props.keepManagerOpen, psectorObj);
                this.props.setCurrentTask("GwPsector");
            }).catch(error => {
                console.error("Failed in getdialog: ", error);
            });
        } catch (error) {
            console.error("Error fetching psector create dialog:", error);
        }
    };

    getPsectorFeatures = (psectorIds) => {
        try {
            const requestUrl = GwUtils.getServiceUrl("psectormanager");
            const params = {
                theme: this.props.theme.title,
                psectorIds: psectorIds
            };
            try {
                return axios.put(requestUrl + "getpsectorfeatures", params );
            } catch (e) {
                console.log(e);
            }
        } catch (error) {
            console.warn(error);
            return Promise.reject(error);
        }
    }

    loadWidgetsProperties = (widgetsProperties) => {
        this.setState((state) => ({ widgetsProperties: { ...state.widgetsProperties, ...widgetsProperties } }));
    };

    fillTxtInfoLog = (row) => {
        // Fill textarea info log with row values
        const cols = ['Name', 'Priority', 'Status', 'expl_id', 'Descript', 'text1', 'text2', 'Observ'];
        let msg = cols.map(col => `${col}:\n${row[col.toLowerCase()] ?? 'NULL'}\n\n`).join('');
        this.setState((state) => ({
            widgetsProperties: { ...state.widgetsProperties, ["tab_none_txt_info"]: { value: msg } }
        }));
    };

    getList = (psectorManagerResult, filter=null) => {
        //Fill table widget
        try {
            const requestUrl = GwUtils.getServiceUrl("util");
            const widgets = psectorManagerResult.body.data.fields;
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

        if (this.state.pendingRequests === true || this.state.psectorManagerResult !== null) {
            let body = null;

            if (isEmpty(this.state.psectorManagerResult)) {
                let msg = this.state.pendingRequests === true ? "Querying..." : "No result" // TODO: TRANSLATION
                body = (<div role="body"><span>{msg}</span></div>);
            } else {

                const result = this.state.psectorManagerResult;
                if (!isEmpty(result.form_xml)) {
                    body = (
                        <div role="body" className="psector-manager-body">
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
                    id="GwPsectorManager"
                    initialHeight={this.props.initialHeight}
                    initialWidth={this.props.initialWidth}
                    initialX={this.props.initialX}
                    initialY={this.props.initialY}
                    key="GwPsectorManagerWindow"
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
    setActivePsector: setActivePsector
})(GwPsectorManager);


