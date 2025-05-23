/**
 * Copyright © 2025 by BGEO. All rights reserved.
 * The program is free software: you can redistribute it and/or modify it under the terms of the GNU
 * General Public License as published by the Free Software Foundation, either version 3 of the License,
 * or (at your option) any later version
 */

import axios from 'axios';
import React from 'react';
import PropTypes from 'prop-types';
import { connect } from 'react-redux';
import isEmpty from 'lodash.isempty';
import { LayerRole, addMarker, removeMarker, removeLayer, addLayerFeatures, refreshLayer } from 'qwc2/actions/layers';
import ResizeableWindow from 'qwc2/components/ResizeableWindow';
import Spinner from 'qwc2/components/widgets/Spinner';
import IdentifyUtils from 'qwc2/utils/IdentifyUtils';
import LocaleUtils from 'qwc2/utils/LocaleUtils';
import { panTo } from 'qwc2/actions/map';
import { setCurrentTask } from 'qwc2/actions/task';
import { processFinished, processStarted } from 'qwc2/actions/processNotifications';
import ConfigUtils from 'qwc2/utils/ConfigUtils';


import GwQtDesignerForm from '../../components/GwQtDesignerForm';
import GwUtils from '../../utils/GwUtils';

import {setActiveVisit} from '../../actions/visit';

class GwVisitManager extends React.Component {
    static propTypes = {
        addMarker: PropTypes.func,
        click: PropTypes.object,
        currentIdentifyTool: PropTypes.string,
        currentTask: PropTypes.string,
        currentTheme: PropTypes.object,
        getInitialValues: PropTypes.bool,
        initialHeight: PropTypes.number,
        initialWidth: PropTypes.number,
        initialX: PropTypes.number,
        initialY: PropTypes.number,
        initiallyDocked: PropTypes.bool,
        keepManagerOpen: PropTypes.bool,
        layers: PropTypes.array,
        map: PropTypes.object,
        processFinished: PropTypes.func,
        processStarted: PropTypes.func,
        refreshLayer: PropTypes.func,
        removeLayer: PropTypes.func,
        removeMarker: PropTypes.func,
        selection: PropTypes.object,
        setActiveVisit: PropTypes.func,
        setCurrentTask: PropTypes.func,
        visitDockable: PropTypes.oneOfType([PropTypes.bool, PropTypes.string])
    };

    static defaultProps = {
        initialWidth: 870,
        initialHeight: 582,
        initialX: 0,
        initialY: 0,
        initiallyDocked: false,
        keepManagerOpen: true,
        visitDockable: "right"
    };
    state = {
        action: 'visitNetwork',
        visitmanagerState: 0,
        visitmanagerResult: null,
        prevvisitmanagerResult: null,
        pendingRequests: false,
        currentTab: {},
        feature_id: null,
        tableWidgets: new Set(),
        filters: {},
        widgetsProperties: {},
    };
    componentDidUpdate(prevProps, prevState) {
        if (this.props.currentTask !== prevProps.currentTask && prevProps.currentTask === "GwVisitManager") {
            this.onToolClose();
        }
        //console.log(!this.state.visitmanagerResult,    " ",   this.props.currentTask === "GwVisitManager",  " ",    this.props.currentTask !== prevProps.currentTask)
        if (!this.state.visitmanagerResult && this.props.currentTask === "GwVisitManager" && this.props.currentTask !== prevProps.currentTask) {
            this.openVisitManager();
        }

        if (this.state.visitmanagerResult && this.state.filters !== prevState.filters) {
            this.getList(this.state.visitmanagerResult);
        }

    }

    openVisitManager = (updateState = true) => {
        // Open dialog
        const params = {
            theme: this.props.currentTheme.title,
            dialogName: "form_visit",
            layoutName: "lyt_visit_mng"
        };
        GwUtils.getDialog(params).then((response) => {
            const result = response.data;
            this.getList(result)
            if (updateState) this.setState({ visitmanagerResult: result, prevvisitmanagerResult: null, pendingRequests: false });
        }).catch(error => {
            console.error("Failed in getdialog: ", error);
            if (updateState) this.setState({ pendingRequests: false });
        });
        if (updateState) this.setState({ visitmanagerResult: {}, prevvisitmanagerResult: null, pendingRequests: false });
    };

    onToolClose = () => {
        this.props.setCurrentTask(null);
        this.setState({ visitmanagerResult: null, pendingRequests: false, filters: {}, widgetsProperties: {} });
    };

    onWidgetValueChange = (widget, value) => {
        // Get filterSign
        let filterSign = "=";
        let widgetcontrols = {};
        let filtervalue = value;
        if (widget.property.widgetcontrols !== "null") {
            widgetcontrols = JSON.parse(widget.property.widgetcontrols);
            if (widgetcontrols.filterSign !== undefined) {
                filterSign = JSON.parse(widget.property.widgetcontrols.replace("$gt", ">").replace("$lt", "<")).filterSign;
            }
        }
        let columnname = widget.name;
        if (widget.property.widgetfunction !== "null") {
            columnname = JSON.parse(widget.property.widgetfunction)?.parameters?.columnfind;
        }
        columnname = columnname ?? widget.name;
        // Update filters
        if (widget.name === "spm_next_days") {
            this.setState((state) => ({ filters: { ...state.filters } }));
        } else if (widget.class === "QComboBox") {
            if (widgetcontrols.getIndex !== undefined && widgetcontrols.getIndex === false) {
                for (const key in widget.item) {
                    if (widget.item[key].property.value === value) {
                        filtervalue = widget.item[key].property.text;
                    }
                }
            }
        }
        this.setState((state) => ({
            widgetsProperties: { ...state.widgetsProperties, [widget.name]: { value: value } },
            filters: { ...state.filters, [columnname]: { value: filtervalue, filterSign: filterSign } }
        }));
    };

    getList = (visitManagerResult) => {
        try {
            const requestUrl = GwUtils.getServiceUrl("util");
            const widgets = visitManagerResult.body.data.fields;
            const tableWidgets = [];
            widgets.forEach(widget => {
                if (widget.widgettype === "tablewidget") {
                    tableWidgets.push(widget);
                }
            });

            const params = {
                theme: this.props.currentTheme.title,
                tabName: tableWidgets[0].tabname,
                widgetname: tableWidgets[0].columnname,
                tableName: tableWidgets[0].linkedobject,
                filterFields: {}
            };
            axios.get(requestUrl + "getlist", { params: params }).then((response) => {
                const result = response.data;
                this.setState((state) => ({
                    widgetsProperties: {...state.widgetsProperties, [tableWidgets[0].widgetname]: {
                        value: GwUtils.getListToValue(result)
                    }}
                }));
            }).catch((e) => {
                console.log(e);
                // this.setState({  });
            });
        } catch (error) {
            console.warn(error);
        }
    };

    onWidgetAction = (action) => {
        const functionName = action.widgetfunction.functionName;
        switch (functionName) {
        case "open":
            this.openVisit(action.row[0].original.id, action.row[0].original.visit_type);
            this.props.refreshLayer(layer => layer.role === LayerRole.THEME);
            if (!this.props.keepManagerOpen) {
                this.setState({ visitmanagerResult: null });
            }
            break;
        case "delete": {
            const ids = action.row.map((row) => row.original.id);
            // eslint-disable-next-line
            if (!confirm(`Are you sure you want to delete these visits ${ids.toString()}`)) {
                break;
            }
            const promises = action.row.map((row) => {
                return this.deleteVisit(row.original.id);
            });

            Promise.all(promises).then(() => {
                this.getList(this.state.visitmanagerResult);
            });

            action.removeSelectedRow();
            this.setState( { filters: {visitId: action.row[0].original.id, action: "delete"} } );
            break;
        }
        case "refresh":
            this.getList(this.state.visitmanagerResult);
            break;
        default:
            console.warn(`Action \`${functionName}\` cannot be handled.`);
            break;
        }
    };


    getQueryableLayers = () => {
        if ((typeof this.props.layers === 'undefined' || this.props.layers === null) || (typeof this.props.map === 'undefined' || this.props.map === null)) {
            return [];
        }

        return IdentifyUtils.getQueryLayers(this.props.layers, this.props.map).filter(l => {
            // TODO: If there are some wms external layers this would select more than one layer
            return l.type === "wms";
        });
    };

    openVisit = (visitId, visitType) => {
        try {
            const requestUrl = GwUtils.getServiceUrl("visit");

            const params = {
                theme: this.props.currentTheme.title,
                visitId: visitId,
                visitType: visitType
            };
            axios.get(requestUrl + "getvisit", { params: params }).then((response) => {
                const result = response.data;
                this.props.setActiveVisit(result, this.props.keepManagerOpen);
            }).catch((e) => {
                console.log(e);
            });
        } catch (error) {
            console.warn(error);
        }
    };


    deleteVisit = (visitId) => {
        try {
            const requestUrl = GwUtils.getServiceUrl("visit");

            const params = {
                theme: this.props.currentTheme.title,
                visitId: visitId
            };
            return axios.delete(requestUrl + "delete", { params }).catch((e) => {
                console.log(e);
                // this.setState({  });
            });
        } catch (error) {
            console.warn(error);
            return Promise.reject(error);
        }
    };

    render() {
        let resultWindow = null;
        if (this.state.pendingRequests === true || this.state.visitmanagerResult !== null) {
            let body = null;

            if (isEmpty(this.state.visitmanagerResult)) {
                if (this.state.pendingRequests === true) {
                    body = (<div className="visitmanager-body" role="body"><Spinner /><span className="visitmanager-body-message">{LocaleUtils.tr("identify.querying")}</span></div>);
                } else {
                    body = (<div className="visitmanager-body" role="body"><span className="visitmanager-body-message">{LocaleUtils.tr("identify.noresults")}</span></div>);
                }
            } else {
                const result = this.state.visitmanagerResult;
                if (result.schema === null) {
                    body = null;
                    this.props.processStarted("visitmanager_msg", "GwVisitManager Error!");
                    this.props.processFinished("visitmanager_msg", false, "Couldn't find schema, please check service config.");
                } else if (result.status === "Failed") {
                    body = null;
                    this.props.processStarted("visitmanager_msg", "GwVisitManager Error!");
                    this.props.processFinished("visitmanager_msg", false, "DB error:" + (result.SQLERR || result.message || "Check logs"));
                } else {
                    body = (
                        <div className="visitmanager-body" role="body">
                            <GwQtDesignerForm form_xml={result.form_xml} getInitialValues={false}
                                onWidgetAction={this.onWidgetAction}
                                onWidgetValueChange={this.onWidgetValueChange} readOnly={false}
                                theme={this.props.currentTheme.title} useNew
                                widgetsProperties={this.state.widgetsProperties}
                            />
                        </div>
                    );
                }
            }
            resultWindow = (
                <ResizeableWindow
                    dockable="bottom"
                    icon="giswater"
                    initialHeight={this.props.initialHeight}
                    initialWidth= {this.props.initialWidth}
                    initialX={this.props.initialX}
                    initialY={this.props.initialY}
                    initiallyDocked={this.props.initiallyDocked}
                    key="GwVisitManagerWindow"
                    minWidth={this.props.initialWidth}
                    minHeight={this.props.initialHeight}
                    minimizeable="true"
                    onClose={this.onToolClose}
                    scrollable title={LocaleUtils.tr("appmenu.items.GwVisitManager") || "Giswater Visit Manager"}
                >
                    {body}
                </ResizeableWindow>
            );
        }
        return [resultWindow];
    }
}

export default connect((state) => {
    const enabled = state.task.id === "Identify" || (
        state.task.identifyEnabled &&
        ConfigUtils.getConfigProp("identifyTool", state.theme.current, "Identify") === "Identify"
    );
    return {
        click: state.map.click || { modifiers: {} },
        enabled: enabled,
        currentTask: state.task.id,
        layers: state.layers.flat,
        map: state.map,
        selection: state.selection,
        currentTheme: state.theme.current
    };
}, {
    addLayerFeatures: addLayerFeatures,
    addMarker: addMarker,
    panTo: panTo,
    removeMarker: removeMarker,
    removeLayer: removeLayer,
    refreshLayer: refreshLayer,
    processFinished: processFinished,
    processStarted: processStarted,
    setCurrentTask: setCurrentTask,
    setActiveVisit: setActiveVisit
})(GwVisitManager);
