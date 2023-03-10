/**
 * Copyright 2017-2021 Sourcepole AG
 * All rights reserved.
 *
 * This source code is licensed under the BSD-style license found in the
 * LICENSE file in the root directory of this source tree.
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


import GwInfoQtDesignerForm from '../components/GwInfoQtDesignerForm';
import GwUtils from '../utils/GwUtils';
import GwMincut from './GwMincut';
import GwSelector from './GwSelector';

class GwMincutManager extends React.Component {
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
        keepManagerOpen: PropTypes.bool
    }
    static defaultProps = {
        initialWidth: 800,
        initialHeight: 500,
        initialX: 0,
        initialY: 0,
        initiallyDocked: false,
        keepManagerOpen: false
    }
    state = {
        action: 'mincutNetwork',
        mincutmanagerState: 0,
        mincutmanagerResult: null,
        prevmincutmanagerResult: null,
        pendingRequests: false,
        currentTab: {},
        feature_id: null,
        listJson: null,
        tableWidgets: new Set(),
        filters: {},
        widgetValues: {},
        mincutResult: null,
        selectorResult: null
    }
    componentDidUpdate(prevProps, prevState) {
        if (this.props.currentTask !== prevProps.currentTask && prevProps.currentTask === "GwMincutManager") {
            this.onToolClose();
        }
        if (!this.state.mincutmanagerResult && this.props.currentTask === "GwMincutManager" && this.props.currentTask !== prevProps.currentTask) {
            this.openMincutManager();
        }
        
        if (this.state.mincutmanagerResult && this.state.filters !== prevState.filters) {
            this.getList(this.state.mincutmanagerResult);
        }
        
    }

    openMincutManager = (updateState = true, action = this.state.action) => {
        let pendingRequests = false;
        const request_url = GwUtils.getServiceUrl("mincut");
        if (!isEmpty(request_url)) {
            const params = {
                "theme": this.props.currentTheme.title
            };

            pendingRequests = true;
            axios.get(request_url + "getmincutmanager", { params: params }).then(response => {
                const result = response.data;
                this.getList(result);
                if (updateState) this.setState({ mincutmanagerResult: result, prevmincutmanagerResult: null, pendingRequests: false });
            }).catch((e) => {
                console.log(e);
                if (updateState) this.setState({ pendingRequests: false });
            });
        }
        // if (updateState) this.setState({ mincutmanagerResult: {}, prevmincutmanagerResult: null, pendingRequests: pendingRequests });
    }

    onToolClose = () => {
        this.props.setCurrentTask(null);
        this.setState({ mincutmanagerResult: null, pendingRequests: false, filters: {}, mincutResult: null, selectorResult: null, widgetValues: {}, listJson: null});
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

    getList = (mincutManagerResult) => {
        try {
            var request_url = GwUtils.getServiceUrl("mincut");
            var widgets = mincutManagerResult.body.data.fields;
            var tableWidgets = [];
            widgets.forEach(widget => {
                if (widget.widgettype === "tableview"){
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
            axios.get(request_url + "getlist", { params: params }).then((response) => {
                const result = response.data
                //this.setState({ listJson: result, mincutmanagerResult: null });
                this.setState({ listJson: {...this.state.listJson, [tableWidgets[0].columnname]: result} });
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
            case "selector":
                this.selectorMincut(action.row);
                break;
            case "open":
                this.openMincut(action.row[0].original.id);
                this.props.refreshLayer(layer => layer.role === LayerRole.THEME);
                if (!this.props.keepManagerOpen){
                    this.setState({ mincutmanagerResult: null });
                }
                break;
            case "cancel":
                action.row.map((row) => {
                    this.cancelMincut(row.original.id);
                })
                this.setState( { filters: {"mincutId": action.row[0].original.id, "action":"cancel"} } );
                break;
            case "delete":
                let ids = [];
                action.row.map((row) => {
                    ids.push(row.original.id)
                })

                if (
                    !confirm(`Are you sure you want to delete these mincuts ${ids.toString()}`)
                ) {
                    break;
                }
                action.row.map((row) => {
                    this.deleteMincut(row.original.id);
                })
                this.setState( { filters: {"mincutId": action.row[0].original.id, "action":"delete"} } );
                break;
            case "mincutClose":
                this.setState({ mincutResult: null });
                if (!this.props.keepManagerOpen){
                    this.onToolClose();
                }
                break;
            case "selectorClose":
                this.setState({ selectorResult: null });
                break;
            default:
                console.warn(`Action \`${functionName}\` cannot be handled.`)
                break;
        }
    }

    selectorMincut = (rows) => {
        if (rows.length === 0){
            console.log("No rows");
        } else {
            let ids = [];
            rows.map(row => {
                ids.push(row.original.id);
            })
            let idsString = ids.join(",");
            try {
                let pendingRequests = false;
                const queryableLayers = this.getQueryableLayers();
    
                const request_url = GwUtils.getServiceUrl("selector");
                if (!isEmpty(queryableLayers) && !isEmpty(request_url)) {
                    // Get request paramas
                    const layer = queryableLayers[0];
                    const epsg = this.crsStrToInt(this.props.map.projection)
                    const params = {
                        "theme": layer.title,
                        "epsg": epsg,
                        "currentTab": "tab_mincut",
                        "selectorType": "selector_mincut",
                        "layers": String(layer.queryLayers),
                        "loadProject": false,
                        "ids": idsString
                    }
                    // Send request
                    pendingRequests = true
                    // Send request
                    axios.get(request_url + "get", { params: params }).then(response => {
                        const result = response.data
                        this.setState({ selectorResult: result, pendingRequests: false });
                        //this.filterLayers(result);
                    }).catch((e) => {
                        console.log(e);
                        this.setState({ pendingRequests: false });
                    });
                }
            } catch (error) {
                console.warn(error);
            }
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

    openMincut = (mincutId) => {
        try {
            var request_url = GwUtils.getServiceUrl("mincut");

            const params = {
                "theme": this.props.currentTheme.title,
                "mincutId": mincutId
            }
            axios.get(request_url + "open", { params: params }).then((response) => {
                const result = response.data
                this.setState( { mincutResult: result } );
            }).catch((e) => {
                console.log(e);
            })
        } catch (error) {
            console.warn(error);
        }
    }

    cancelMincut = (mincutId) => {
        try {
            var request_url = GwUtils.getServiceUrl("mincut");

            const params = {
                "theme": this.props.currentTheme.title,
                "mincutId": mincutId
            }
            axios.post(request_url + "cancel", { ...params }).then((response) => {
                const result = response.data
            }).catch((e) => {
                console.log(e);
                // this.setState({  });
            })
        } catch (error) {
            console.warn(error);
        }
    }

    deleteMincut = (mincutId) => {
        try {
            var request_url = GwUtils.getServiceUrl("mincut");

            const params = {
                "theme": this.props.currentTheme.title,
                "mincutId": mincutId
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
        let bodyMincut = null;
        let bodySelector = null;
        if (this.state.pendingRequests === true || this.state.mincutmanagerResult !== null) {
            let body = null;
            
            if (isEmpty(this.state.mincutmanagerResult)) {
                if (this.state.pendingRequests === true) {
                    body = (<div className="mincutmanager-body" role="body"><Spinner /><span className="mincutmanager-body-message">{LocaleUtils.tr("identify.querying")}</span></div>);
                } else {
                    body = (<div className="mincutmanager-body" role="body"><span className="mincutmanager-body-message">{LocaleUtils.tr("identify.noresults")}</span></div>);
                }
            } else {
                const result = this.state.mincutmanagerResult;
                if (result.schema === null) {
                    body = null;
                    this.props.processStarted("mincutmanager_msg", "GwMincutManager Error!");
                    this.props.processFinished("mincutmanager_msg", false, "Couldn't find schema, please check service config.");
                }
                else if (result.status === "Failed") {
                    body = null;
                    this.props.processStarted("mincutmanager_msg", "GwMincutManager Error!");
                    this.props.processFinished("mincutmanager_msg", false, "DB error:" + (result.SQLERR || result.message || "Check logs"));
                }
                else {
                    body = (
                        <div id="mincut-body" role="body">
                            <GwInfoQtDesignerForm form_xml={result.form_xml} readOnly={false}
                                theme={this.props.currentTheme.title}
                                dispatchButton={this.dispatchButton} updateField={this.updateField}
                                listJson={this.state.listJson} widgetValues={this.state.widgetValues} getInitialValues={false}
                            />
                        </div>
                    )
                }
            }
            resultWindow = (
                <ResizeableWindow icon="mincut" dockable="bottom" scrollable={true}
                    initialHeight={600} initialWidth= {900}
                    initialX={this.props.initialX} initialY={this.props.initialY} initiallyDocked={this.props.initiallyDocked}
                    key="GwMincutManagerWindow"
                    onClose={this.onToolClose} title="Giswater Mincut Manager"
                >
                    {body}
                </ResizeableWindow>
            );
            
        }

        if (this.state.mincutResult){
            bodyMincut = (
                <GwMincut mincutResult={this.state.mincutResult} dispatchButton={this.dispatchButton}/>
            )
        }
        if (this.state.selectorResult){
            bodySelector = (
                <GwSelector selectorResult={this.state.selectorResult} dispatchButton={this.dispatchButton}/>
            )
        }

        if (bodyMincut){
            return [resultWindow, bodyMincut];
        }
        if (bodySelector){
            return [resultWindow, bodySelector];
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
})(GwMincutManager);
