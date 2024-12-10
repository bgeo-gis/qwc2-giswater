/**
 * Copyright © 2024 by BGEO. All rights reserved.
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
import Spinner from 'qwc2/components/Spinner';
import LocaleUtils from 'qwc2/utils/LocaleUtils';
import { panTo, zoomToExtent } from 'qwc2/actions/map';
import { setCurrentTask } from 'qwc2/actions/task';
import { processFinished, processStarted } from 'qwc2/actions/processNotifications';

import GwQtDesignerForm from '../components/GwQtDesignerForm';
import GwUtils from '../utils/GwUtils';

import {setActiveMincut} from '../actions/mincut';
import {setActiveSelector} from '../actions/selector';
import { ConstructionOutlined } from '@mui/icons-material';

class GwMincutManager extends React.Component {
    static propTypes = {
        addLayerFeatures: PropTypes.func,
        addMarker: PropTypes.func,
        changeLayerProperty: PropTypes.func,
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
        setActiveMincut: PropTypes.func,
        setActiveSelector: PropTypes.func,
        setCurrentTask: PropTypes.func,
        zoomToExtent: PropTypes.func
    };
    static defaultProps = {
        initialWidth: 800,
        initialHeight: 500,
        initialX: 0,
        initialY: 0,
        initiallyDocked: false,
        keepManagerOpen: true
    };
    state = {
        action: 'mincutNetwork',
        mincutmanagerState: 0,
        mincutmanagerResult: null,
        prevmincutmanagerResult: null,
        pendingRequests: false,
        currentTab: {},
        feature_id: null,
        widgetsProperties: {},
        mincutResult: null,
        selectorResult: null,
        mincutId: null
    };
    componentDidUpdate(prevProps) {
        if (this.props.currentTask !== prevProps.currentTask && prevProps.currentTask === "GwMincutManager") {
            this.onToolClose();
        }
        if (!this.state.mincutmanagerResult && this.props.currentTask === "GwMincutManager" && this.props.currentTask !== prevProps.currentTask) {
            this.openMincutManager();
        }
    }

    openMincutManager = (updateState = true) => {
        const requestUrl = GwUtils.getServiceUrl("mincut");
        if (!isEmpty(requestUrl)) {
            const params = {
                theme: this.props.currentTheme.title
            };

            axios.get(requestUrl + "getmincutmanager", { params: params }).then(response => {
                const result = response.data;
                this.getList(result);
                if (updateState) this.setState({ mincutmanagerResult: result, prevmincutmanagerResult: null, pendingRequests: false });
            }).catch((e) => {
                console.log(e);
                if (updateState) this.setState({ pendingRequests: false });
            });
        }
    };

    onToolClose = () => {
        this.props.setCurrentTask(null);
        this.setState({ mincutmanagerResult: null, pendingRequests: false, mincutResult: null, selectorResult: null, widgetsProperties: {}, mincutId: null});
    };


    onWidgetValueChange = (widget, value) => {
        this.setState((state) => ({
            widgetsProperties: { ...state.widgetsProperties, [widget.name]: { value: value }}
        }));

    };

    getList = (mincutManagerResult) => {
        try {
            const requestUrl = GwUtils.getServiceUrl("util");
            // TODO: Change to use GwUtils.forEachWidgetInForm
            const widgets = mincutManagerResult.body.data.fields;
            let tableWidget = null;
            widgets.forEach(widget => {
                if (widget.widgettype === "tablewidget") {
                    tableWidget = widget;
                }
            });

            const params = {
                theme: this.props.currentTheme.title,
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
                // this.setState({  });
            });
        } catch (error) {
            console.warn(error);
        }
    };

    onWidgetAction = (action) => {
        const functionName = action.widgetfunction.functionName;
        switch (functionName) {
        case "selector":
            this.selectorMincut(action.row);
            break;
        case "open":
            this.openMincut(action.row[0].original.id);
            this.props.refreshLayer(layer => layer.role === LayerRole.THEME);
            if (!this.props.keepManagerOpen) {
                console.log("this.props.keepManagerOpen", this.props.keepManagerOpen);
                console.log("!!!!!! Closing mincut manager");
                this.setState({ mincutmanagerResult: null });
            }
            break;
        case "cancel":
            if (confirm(`Are you sure you want to cancel mincuts ${action.row.map((row) => row.original.id).toString()}`)) {
                const promises = action.row.map((row) => {
                    return this.cancelMincut(row.original.id);
                });
                Promise.all(promises).then(() => {
                    this.getList(this.state.mincutmanagerResult);
                });
            }
            break;
        case "delete": {
            const ids = [];
            action.row.map((row) => {
                ids.push(row.original.id);
            });
            // eslint-disable-next-line
            if (confirm(`Are you sure you want to delete these mincuts ${ids.toString()}`)) {
                const promises = action.row.map((row) => {
                    return this.deleteMincut(row.original.id);
                });
                action.removeSelectedRow();
                Promise.all(promises).then(() => {
                    this.getList(this.state.mincutmanagerResult);
                });
            }
            break;
        }
        case "mincutClose":
            this.setState({ mincutResult: null });
            if (!this.props.keepManagerOpen) {
                this.onToolClose();
            }
            break;
        case "selectorClose":
            this.setState({ selectorResult: null });
            break;
        case "refresh":
            this.getList(this.state.mincutmanagerResult);
            break;

        default:
            console.warn(`Action \`${functionName}\` cannot be handled.`);
            break;
        }
    };

    selectorMincut = (rows) => {
        if (rows.length === 0) {
            console.log("No rows");
        } else {
            const ids = (rows.map((row) => row.original.id)).join(",");
            try {
                const requestUrl = GwUtils.getServiceUrl("selector");
                if (!isEmpty(requestUrl)) {
                    // Get request paramas
                    const epsg = GwUtils.crsStrToInt(this.props.map.projection);
                    const params = {
                        theme: this.props.currentTheme.title,
                        epsg: epsg,
                        currentTab: "tab_mincut",
                        selectorType: "selector_mincut",
                        // "layers": String(layer.queryLayers),
                        // "loadProject": false,
                        ids: ids
                    };
                    // Send request
                    axios.get(requestUrl + "get", { params: params }).then(response => {
                        const result = response.data;
                        this.props.setActiveSelector(result, ids, this.props.keepManagerOpen);
                        // this.setState({ selectorResult: result, pendingRequests: false });
                        // this.filterLayers(result);
                    }).catch((e) => {
                        console.log(e);
                        this.setState({ pendingRequests: false });
                    });
                }
            } catch (error) {
                console.error(error);
            }
        }
    };

    openMincut = (mincutId) => {
        try {
            const requestUrl = GwUtils.getServiceUrl("mincut");

            const params = {
                theme: this.props.currentTheme.title,
                mincutId: mincutId
            };
            axios.get(requestUrl + "open", { params: params }).then((response) => {
                const result = response.data;
                this.props.setActiveMincut(result, this.props.keepManagerOpen);
                this.props.setCurrentTask("GwMincut");
            }).catch((e) => {
                console.log(e);
            });
        } catch (error) {
            console.warn(error);
        }
    };

    cancelMincut = (mincutId) => {
        try {
            const requestUrl = GwUtils.getServiceUrl("mincut");

            const params = {
                theme: this.props.currentTheme.title,
                mincutId: mincutId
            };
            return axios.post(requestUrl + "cancel", { ...params }).catch((e) => {
                console.warn(e);
            });
        } catch (error) {
            console.warn(error);
            return Promise.reject(error);
        }
    };

    deleteMincut = (mincutId) => {
        try {
            const requestUrl = GwUtils.getServiceUrl("mincut");

            const params = {
                theme: this.props.currentTheme.title,
                mincutId: mincutId
            };
            return axios.delete(requestUrl + "delete", { params }).catch((e) => {
                console.warn(e);
            });
        } catch (error) {
            console.warn(error);
            return Promise.reject(error);
        }
    };

    render() {
        let resultWindow = null;
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
                } else if (result.status === "Failed") {
                    body = null;
                    this.props.processStarted("mincutmanager_msg", "GwMincutManager Error!");
                    this.props.processFinished("mincutmanager_msg", false, "DB error:" + (result.SQLERR || result.message || "Check logs"));
                } else {
                    body = (
                        <div className="manager-body" role="body">
                            <GwQtDesignerForm form_xml={result.form_xml} getInitialValues={false}
                                onWidgetAction={this.onWidgetAction}
                                onWidgetValueChange={this.onWidgetValueChange} readOnly={false} theme={this.props.currentTheme.title}
                                useNew widgetsProperties={this.state.widgetsProperties}
                            />
                        </div>
                    );
                }
            }
            resultWindow = (
                <ResizeableWindow dockable="bottom" icon="giswater" initialHeight={600} initialWidth= {900}
                    initialX={this.props.initialX} initialY={this.props.initialY}
                    initiallyDocked={this.props.initiallyDocked} key="GwMincutManagerWindow" minimizeable
                    onClose={this.onToolClose}
                    scrollable title="Giswater Mincut Manager"
                >
                    {body}
                </ResizeableWindow>
            );

        }

        return resultWindow;
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
    panTo: panTo,
    removeMarker: removeMarker,
    removeLayer: removeLayer,
    refreshLayer: refreshLayer,
    processFinished: processFinished,
    processStarted: processStarted,
    setCurrentTask: setCurrentTask,
    setActiveMincut: setActiveMincut,
    setActiveSelector: setActiveSelector,
    zoomToExtent: zoomToExtent
})(GwMincutManager);
