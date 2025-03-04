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


class GwEpaManager extends React.Component {
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
        setFilter: PropTypes.func,
        theme: PropTypes.object,
        title: PropTypes.string,
        addLayerFeatures: PropTypes.func,
        removeLayer: PropTypes.func,
    };

    static defaultProps = {
        title: 'Epa result management',
        initialWidth: 1103,
        initialHeight: 375
    };

    state = {
        epaManagerResult: null,
        pendingRequests: false,
        widgetsProperties: {},
        widgetValues: {}
    };

    componentDidUpdate(prevProps) {
        if (prevProps.currentTask !== this.props.currentTask && this.props.currentTask === "GwEpaManager") {
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
        const requestUrl = GwUtils.getServiceUrl("epamanager");
        if (!isEmpty(requestUrl)) {
            axios.get(requestUrl + "dialog", { params: { theme: this.props.theme.title } }).then(response => {
                const result = response.data;
                this.getList(result)
                this.setState({ epaManagerResult: result, pendingRequests: false });
            }).catch((e) => {
                console.log(e);
                this.setState({ pendingRequests: false });
            });
        }
    };

    onClose = () => {
        this.props.setCurrentTask(null);
        this.setState({ epaManagerResult: null, pendingRequests: false });
    };

    onWidgetAction = (action) => {
        // Get event (action) from widget
        let functionName = action.functionName ? action.functionName : action.widgetfunction.functionName;
        switch (functionName) {
            case "selectedRow":{
                this.disableButtons(action.rowData);
                this.fillTxtInfoLog(action.rowData);
                break;
            }
            case "edit":{
                const epaId = action.row.map((row) => row.original.id)[0];
                const newDescript = prompt(`Set new 'descript' for result '${epaId.toString()}':`);
                if (newDescript !== undefined) {
                    this.editEpaDescript(epaId, newDescript).then(() => {
                        // Refresh the list after editing the description
                        this.getList(this.state.epaManagerResult);
                    }).catch(error => {
                        console.error("Failed to edit description: ", error);
                    });
                    action.removeSelectedRow();
                }
                break;
            }
            case "showInpData":{
                const resultIds = action.row.map((row) => row.original.id);
                this.showInpData(resultIds).then((response) => {
                    this.manageGeoJSON(response.data)
                }).catch(error => {
                    console.error("Failed in toggle archived: ", error);
                });
                action.removeSelectedRow();
                break;
            }
            case "toggleArchive":{
                const epaId = action.row.map((row) => row.original.id)[0];
                const status = action.row.map((row) => row.original.status)[0];
                this.toggleArchive(epaId,status).then(() => {
                    this.getList(this.state.epaManagerResult);
                }).catch(error => {
                    console.error("Failed in toggle archived: ", error);
                });
                action.removeSelectedRow();
                break;
            }
            case "toggleCorporate":{
                const epaId = action.row.map((row) => row.original.id)[0];
                const isCorporate = action.row.map((row) => row.original.iscorporate)[0];
                this.toggleCorporate(epaId,isCorporate).then(() => {
                    this.getList(this.state.epaManagerResult);
                }).catch(error => {
                    console.error("Failed in toggle corporate: ", error);
                });
                action.removeSelectedRow();
                break;
            }
            case "delete":{
                const ids = action.row.map((row) => row.original.id);
                if (!confirm(`Are you sure you want to delete these records:\n${ids.toString()}`)) {
                    break;
                }
                const promises = action.row.map((row) => {
                    return this.deleteEpa(row.original.id);
                });
                Promise.all(promises).then(() => {
                    this.getList(this.state.epaManagerResult);
                });
                action.removeSelectedRow();
                break;
            }
            case "closeDlg":
                this.onClose();
                break;
            case "help":
                GwUtils.openHelp();
                break;
            default:
                console.warn(`Action \`${action.name}\` cannot be handled.`);
                break;
        }
    };

    manageGeoJSON = (result) => {
        // Manage geo json result

        //Remove temporal layers
        this.removeTempLayers();

        // Line
        const line = result.body.data.line;
        const lineStyle = {
            strokeColor: [255, 206, 128, 1],
            strokeWidth: 6
        };
        const lineFeatures = GwUtils.getGeoJSONFeatures("default", line, lineStyle);
        if (!isEmpty(lineFeatures)) {
            this.props.addLayerFeatures({
                id: "temp_lines.geojson",
                name: "temp_lines.geojson",
                title: "Temporal Lines",
                zoomToExtent: true
            }, lineFeatures, true);
        }

        // Point
        const point = result.body.data.point;
        const pointStyle = {
            strokeColor: [160, 134, 17, 1],
            strokeWidth: 1,
            circleRadius: 3,
            fillColor: [241, 209, 66, 1]
        };
        const pointFeatures = GwUtils.getGeoJSONFeatures("default", point, pointStyle);
        if (!isEmpty(pointFeatures)) {
            this.props.addLayerFeatures({
                id: "temp_points.geojson",
                name: "temp_points.geojson",
                title: "Temporal Points",
                zoomToExtent: true
            }, pointFeatures, true);
        }

    }

    removeTempLayers = () => {
        this.props.removeLayer("temp_points.geojson");
        this.props.removeLayer("temp_lines.geojson");
        this.props.removeLayer("temp_polygons.geojson");
    };


    disableButtons = (row) => {
        // Disable material react table buttons depending of the selected row values
        let buttonsToDisable = [];

        //Disable Toggle Archive Button
        if (row.iscorporate == "true" || row.status == "PARTIAL") {
            buttonsToDisable.push("btn_toggle_archive")
        }

        //Disable Toggle Corporate Button
        if (row.rpt_stats == null || row.status != "COMPLETED") {
            buttonsToDisable.push("btn_toggle_corporate")
        }

        this.setState((state) => ({
            widgetsProperties: { ...state.widgetsProperties, ["tab_none_table_view"]: { ...state.widgetsProperties["tab_none_table_view"], buttonsToDisable: buttonsToDisable } }
        }));

    }

    fillTxtInfoLog = (row) => {
        // Fill textarea info log with row values
        let msg = "";
        if (row.addparam) {
            msg += "Properties:\n"
            let corporate_last_dates = row.addparam['corporateLastDates']
            if (corporate_last_dates){
                let corporate_start = corporate_last_dates['start']
                let corporate_end = corporate_last_dates['end']
                if (corporate_start && corporate_end){
                    msg += `Corporate from ${corporate_start} to ${corporate_end}`
                }else if(corporate_start && !corporate_end){
                    msg += `Corporate since ${corporate_start}`
                }else if(!corporate_start && corporate_end){
                    msg += `Corporate until ${corporate_end}`
                }
                msg += "\n"
            }
        }

        if (row.export_options) {
            msg += "\nExport Options:\n"
            for (const text in row.export_options) {
                msg += `${text} : ${row.export_options[text]} \n`
            }
        }

        if (row.network_stats) {
            msg += "\nNetwork Status:\n"
            for (const text in row.network_stats) {
                msg += `${text} : ${row.network_stats[text]} \n`
            }
        }

        if (row.inp_options) {
            msg += "\nInp Options:\n"
            for (const text in row.inp_options) {
                msg += `${text} : ${row.inp_options[text]} \n`
            }
        }

        this.setState((state) => ({
            widgetsProperties: { ...state.widgetsProperties, ["tab_none_txt_info"]: { value: msg } }
        }));
    };

    deleteEpa = async (epaId) => {
        // Manage delete selected epa results
        try {
            const requestUrl = GwUtils.getServiceUrl("epamanager");
            const params = {
                theme: this.props.theme.title,
                epaId: epaId
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

    editEpaDescript = async (resultId, newDescript) => {
        // Edit epa description
        try {
            const requestUrl = GwUtils.getServiceUrl("epamanager");
            const params = {
                theme: this.props.theme.title,
                resultId: resultId,
                newDescript: newDescript
            };
            try {
                return await axios.get(requestUrl + "editdescript", { params });
            } catch (e) {
                console.log(e);
            }
        } catch (error) {
            console.warn(error);
            return Promise.reject(error);
        }
    };

    showInpData = async (resultIds) => {
        // Get inp data from epa result id's
        try {
            const requestUrl = GwUtils.getServiceUrl("epamanager");
            const data = {
                theme: this.props.theme.title,
                resultIds: resultIds
            };
            try {
                return await axios.put(requestUrl + "showinpdata", data);
            } catch (e) {
                console.log(e);
            }
        } catch (error) {
            console.warn(error);
            return Promise.reject(error);
        }
    };

    toggleArchive = async (resultId,status) => {
        // Archive selected epa
        try {
            const requestUrl = GwUtils.getServiceUrl("epamanager");
            const params = {
                theme: this.props.theme.title,
                resultId: resultId,
                status:status
            };
            try {
                return await axios.get(requestUrl + "togglerptarchived", { params });
            } catch (e) {
                console.log(e);
            }
        } catch (error) {
            console.warn(error);
            return Promise.reject(error);
        }
    };

    toggleCorporate = async (resultId,isCorporate) => {
        // Set epa corporate
        try {
            const requestUrl = GwUtils.getServiceUrl("epamanager");
            const params = {
                theme: this.props.theme.title,
                resultId: resultId,
                isCorporate:isCorporate
            };
            try {
                return await axios.get(requestUrl + "togglecorporate", { params });
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

    getList = (epaManagerResult) => {
        //Fill table widget
        try {
            const requestUrl = GwUtils.getServiceUrl("util");
            const widgets = epaManagerResult.body.data.fields;
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

        if (this.state.pendingRequests === true || this.state.epaManagerResult !== null) {
            let body = null;

            if (isEmpty(this.state.epaManagerResult)) {
                let msg = this.state.pendingRequests === true ? "Querying..." : "No result" // TODO: TRANSLATION
                body = (<div role="body"><span>{msg}</span></div>);
            } else {

                const result = this.state.epaManagerResult;
                if (!isEmpty(result.form_xml)) {
                    body = (
                        <div className='epa-manager-body' role="body">
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
                    id="GwEpaManager"
                    initialHeight={this.props.initialHeight}
                    initialWidth={this.props.initialWidth}
                    initialX={this.props.initialX}
                    initialY={this.props.initialY}
                    key="GwEpaManagerWindow"
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
    addLayerFeatures: addLayerFeatures
})(GwEpaManager);


