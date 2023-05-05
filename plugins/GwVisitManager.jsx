/**
 * Copyright BGEO. All rights reserved.
 * The program is free software: you can redistribute it and/or modify it under the terms of the GNU
 * General Public License as published by the Free Software Foundation, either version 3 of the License,
 * or (at your option) any later version
 */

import axios from 'axios';
import React from 'react';
import PropTypes from 'prop-types';
import { connect } from 'react-redux';
import ol from 'openlayers';
import isEmpty from 'lodash.isempty';
import { LayerRole, addMarker, removeMarker, removeLayer, addLayerFeatures, refreshLayer } from 'qwc2/actions/layers';
import { changeSelectionState } from 'qwc2/actions/selection';
import ResizeableWindow from 'qwc2/components/ResizeableWindow';
import Spinner from 'qwc2/components/Spinner';
import IdentifyUtils from 'qwc2/utils/IdentifyUtils';
import LocaleUtils from 'qwc2/utils/LocaleUtils';
import ConfigUtils from 'qwc2/utils/ConfigUtils';
import { panTo } from 'qwc2/actions/map';
import { setCurrentTask } from 'qwc2/actions/task';
import { processFinished, processStarted } from 'qwc2/actions/processNotifications';


import GwQtDesignerForm from '../components/GwQtDesignerForm';
import GwUtils from '../utils/GwUtils';
import GwVisit from './GwVisit';

class GwVisitManager extends React.Component {
    static propTypes = {
        addMarker: PropTypes.func,
        changeSelectionState: PropTypes.func,
        click: PropTypes.object,
        currentIdentifyTool: PropTypes.string,
        currentTask: PropTypes.string,
        initialHeight: PropTypes.number,
        initialWidth: PropTypes.number,
        initialX: PropTypes.number,
        initialY: PropTypes.number,
        initiallyDocked: PropTypes.bool,
        layers: PropTypes.array,
        map: PropTypes.object,
        removeLayer: PropTypes.func,
        refreshLayer: PropTypes.func,
        removeMarker: PropTypes.func,
        setCurrentTask: PropTypes.func,
        selection: PropTypes.object,
        getInitialValues: PropTypes.bool,
        keepManagerOpen: PropTypes.bool,
        vistDockable: PropTypes.oneOfType([PropTypes.bool, PropTypes.string]),
  }
    
    static defaultProps = {
        initialWidth: 800,
        initialHeight: 500,
        initialX: 0,
        initialY: 0,
        initiallyDocked: false,
        keepManagerOpen: false,
        visitDockable: "right"
    }
    state = {
        action: 'visitNetwork',
        visitmanagerState: 0,
        visitmanagerResult: null,
        prevvisitmanagerResult: null,
        pendingRequests: false,
        currentTab: {},
        feature_id: null,
        listJson: null,
        tableWidgets: new Set(),
        filters: {},
        widgetValues: {},
        visitResult: null
    }
    componentDidUpdate(prevProps, prevState) {
        if (this.props.currentTask !== prevProps.currentTask && prevProps.currentTask === "GwVisitManager") {
            this.onToolClose();
        }
        if (!this.state.visitmanagerResult && this.props.currentTask === "GwVisitManager" && this.props.currentTask !== prevProps.currentTask) {
            this.openVisitManager();
        }
        
        if (this.state.visitmanagerResult && this.state.filters !== prevState.filters) {
            this.getList(this.state.visitmanagerResult);
        }
        
    }

    openVisitManager = (updateState = true, action = this.state.action) => {
        let pendingRequests = false;
        const request_url = GwUtils.getServiceUrl("visit");
        if (!isEmpty(request_url)) {
            const params = {
                "theme": this.props.currentTheme.title
            };

            pendingRequests = true;
            axios.get(request_url + "getvisitmanager", { params: params }).then(response => {
                const result = response.data;
                this.getList(result);
                if (updateState) this.setState({ visitmanagerResult: result, prevvisitmanagerResult: null, pendingRequests: false });
            }).catch((e) => {
                console.log(e);
                if (updateState) this.setState({ pendingRequests: false });
            });
        }
        if (updateState) this.setState({ visitmanagerResult: {}, prevvisitmanagerResult: null, pendingRequests: pendingRequests });
    }

    onToolClose = () => {
        this.props.setCurrentTask(null);
        this.setState({ visitmanagerResult: null, pendingRequests: false, filters: {}, visitResult: null, widgetValues: {}, listJson: null});
    }


    updateField = (widget, value, action) => {
        // Get filterSign
        var filterSign = "=";
        let widgetcontrols = {};
        let filtervalue = value;
        if (widget.property.widgetcontrols !== "null") {
            widgetcontrols = JSON.parse(widget.property.widgetcontrols);
            if (widgetcontrols.filterSign !== undefined){
                filterSign = JSON.parse(widget.property.widgetcontrols.replace("$gt", ">").replace("$lt", "<")).filterSign;
            }
        }
        var columnname = widget.name;
        if (widget.property.widgetfunction !== "null") {
            columnname = JSON.parse(widget.property.widgetfunction)?.parameters?.columnfind;
        }
        columnname = columnname ?? widget.name;
        // Update filters
        if (widget.name === "spm_next_days"){
            this.setState({ filters: { ...this.state.filters } });
        } else if (widget.class === "QComboBox"){
            if (widgetcontrols.getIndex !== undefined && widgetcontrols.getIndex === false){
                for(let key in widget.item){
                    if (widget.item[key].property.value === value){
                        filtervalue = widget.item[key].property.text;
                    }
                }
            }
        }
        this.setState({ widgetValues: { ...this.state.widgetValues, [widget.name]: { value: value }},
            filters: { ...this.state.filters, [columnname]: { value: filtervalue, filterSign: filterSign } } });

    }

    getList = (visitManagerResult) => {
        console.log("GET LIST")
        try {
            var request_url = GwUtils.getServiceUrl("util");
            var widgets = visitManagerResult.body.data.fields;
            var tableWidgets = [];
            widgets.forEach(widget => {
                if (widget.widgettype === "tablewidget"){
                    tableWidgets.push(widget);
                }
            })

            const params = {
                "theme": this.props.currentTheme.title,
                "tabName": tableWidgets[0].tabname,
                "widgetname": tableWidgets[0].columnname,
                "tableName": tableWidgets[0].linkedobject,
                "filterFields": {}
            }
            console.log("PARAMS: ", params)
            axios.get(request_url + "getlist", { params: params }).then((response) => {
                const result = response.data
                //this.setState({ listJson: result, visitmanagerResult: null });
                this.setState((state) => ({ listJson: {...state.listJson, [tableWidgets[0].columnname]: result} }));
            }).catch((e) => {
                console.log(e);
                // this.setState({  });
            })
        } catch (error) {
            console.warn(error);
        }
    }

    dispatchButton = (action) => {
        let functionName = action.widgetfunction.functionName;
        let params = action.widgetfunction.params ?? {};
        switch (functionName) {
            case "open":                
                this.openvisit(action.row[0].original.id, action.row[0].original.visit_type);
                console.log("VISIT RESULT", this.state.visitResult)                
                this.props.refreshLayer(layer => layer.role === LayerRole.THEME);
                if (!this.props.keepManagerOpen){
                    this.setState({ visitmanagerResult: null });
                }               
                break;
            case "delete":
                let ids = [];
                action.row.map((row) => {
                    ids.push(row.original.id)
                })
                if (
                    !confirm(`Are you sure you want to delete these visits ${ids.toString()}`)
                ) {
                    break;
                }
                action.row.map((row) => {
                    this.deletevisit(row.original.id);
                })
                this.setState( { filters: {"visitId": action.row[0].original.id, "action":"delete"} } );
                break; 
            case "visitClose":
                this.setState({ visitResult: null });
                if (!this.props.keepManagerOpen){
                    this.onToolClose();
                }
                break;
            default:
                console.warn(`Action \`${functionName}\` cannot be handled.`)
                break;
        }
    }


    getQueryableLayers = () => {
        if ((typeof this.props.layers === 'undefined' || this.props.layers === null) || (typeof this.props.map === 'undefined' || this.props.map === null)) {
            return [];
        }

        return IdentifyUtils.getQueryLayers(this.props.layers, this.props.map).filter(l => {
            // TODO: If there are some wms external layers this would select more than one layer
            return l.type === "wms"
        });
    }

    crsStrToInt = (crs) => {
        const parts = crs.split(':')
        return parseInt(parts.slice(-1))
    }

    openvisit = (visitId, visitType) => {
        console.log("open")
        try {
            var request_url = GwUtils.getServiceUrl("visit");

            const params = {
                "theme": this.props.currentTheme.title,
                "visitId": visitId,
                "visitType": visitType
            }
            console.log("PARAMS",params)
            axios.get(request_url + "get", { params: params }).then((response) => {
                const result = response.data
                this.setState({ visitResult: result });
                console.log("RESULT", result)
                console.log("VISIT RESULT", this.state.visitResult)
            }).catch((e) => {
                console.log(e);
            })
        } catch (error) {
            console.warn(error);
        }         
    }


    deletevisit = (visitId) => {
        try {
            var request_url = GwUtils.getServiceUrl("visit");

            const params = {
                "theme": this.props.currentTheme.title,
                "visitId": visitId
            }
            axios.delete(request_url + "delete", { params }).then((response) => {
                const result = response.data
            }).catch((e) => {
                console.log(e);
                // this.setState({  });
            })
        } catch (error) {
            console.warn(error);
        }
    }

    render() {
        let resultWindow = null;
        let bodyvisit = null;
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
                }
                else if (result.status === "Failed") {
                    body = null;
                    this.props.processStarted("visitmanager_msg", "GwVisitManager Error!");
                    this.props.processFinished("visitmanager_msg", false, "DB error:" + (result.SQLERR || result.message || "Check logs"));
                }
                else {
                    body = (
                        <div className="manager-body" role="body">
                            <GwQtDesignerForm form_xml={result.form_xml} readOnly={false}
                                theme={this.props.currentTheme.title}
                                dispatchButton={this.dispatchButton} updateField={this.updateField}
                                listJson={this.state.listJson} widgetValues={this.state.widgetValues} getInitialValues={false}
                            />
                        </div>
                    )
                }
            }
            resultWindow = (
                <ResizeableWindow icon="visit" dockable="bottom" scrollable={true}
                    initialHeight={600} initialWidth= {900}
                    initialX={this.props.initialX} initialY={this.props.initialY} initiallyDocked={this.props.initiallyDocked}
                    key="GwVisitManagerWindow"
                    onClose={this.onToolClose} title="Giswater Visit Manager"
                >
                    {body}
                </ResizeableWindow>
            );            
        }

        if (this.state.visitResult){            
            bodyvisit = (
                <GwVisit visitResult={this.state.visitResult} dispatchButton={this.dispatchButton} dockable={this.props.visitDockable} initiallyDocked="true" key="visitFromManager"/>
            )
        }

        if (bodyvisit){
            return [resultWindow, bodyvisit];
        }
        return [resultWindow];
    }
}

const selector = (state) => ({
    click: state.map.click || { modifiers: {} },
    currentTask: state.task.id,
    currentIdentifyTool: state.identify.tool,
    layers: state.layers.flat,
    map: state.map,
    selection: state.selection,
    currentTheme: state.theme.current
});

export default connect(selector, {
    addLayerFeatures: addLayerFeatures,
    addMarker: addMarker,
    changeSelectionState: changeSelectionState,
    panTo: panTo,
    removeMarker: removeMarker,
    removeLayer: removeLayer,
    refreshLayer: refreshLayer,
    processFinished: processFinished,
    processStarted: processStarted,
    setCurrentTask: setCurrentTask
})(GwVisitManager);