/**
 * Copyright © 2024 by BGEO. All rights reserved.
 * The program is free software: you can redistribute it and/or modify it under the terms of the GNU
 * General Public License as published by the Free Software Foundation, either version 3 of the License,
 * or (at your option) any later version
 */
import axios from 'axios';
import React from 'react';
import {connect} from 'react-redux';
import PropTypes from 'prop-types';
import isEmpty from 'lodash.isempty';
import ResizeableWindow from 'qwc2/components/ResizeableWindow';
import { setCurrentTask } from 'qwc2/actions/task';
import { processFinished, processStarted } from 'qwc2/actions/processNotifications';
import { LayerRole, refreshLayer, changeLayerProperty } from 'qwc2/actions/layers';
import GwQtDesignerForm from '../../components/GwQtDesignerForm';
import GwUtils from '../../utils/GwUtils';

class GwEpaSelector extends React.Component {

    static propTypes = {
        currentTask: PropTypes.string,
        initialHeight: PropTypes.number,
        initialWidth: PropTypes.number,
        initialX: PropTypes.number,
        initialY: PropTypes.number,
        layers: PropTypes.array,
        map: PropTypes.object,
        processFinished: PropTypes.func,
        changeLayerProperty: PropTypes.func,
        processStarted: PropTypes.func,
        refreshLayer: PropTypes.func,
        setCurrentTask: PropTypes.func,
        theme: PropTypes.object,
        title: PropTypes.string
    };

    static defaultProps = {
        title: 'Result compare selector',
        initialWidth: 465,
        initialHeight: 205
    };

    state = {
        epaSelectorResult: null,
        pendingRequests: false,
        widgetsProperties: {},
        widgetValues: {}
    };

    componentDidUpdate(prevProps){
        // Manage open tool
        if (prevProps.currentTask !== this.props.currentTask && this.props.currentTask === "GwEpaSelector") {
            this.getDialog();
        }
        // Manage close
        if (prevProps.currentTask !== this.props.currentTask && this.props.currentTask === null) {
            this.onClose();
            this.setState({ widgetsProperties: {} });
        }
    }

    onShow = () => {
        // Make service request
        this.getDialog();
    };

    getDialog = () => {
        //Open dialog
        const requestUrl = GwUtils.getServiceUrl("epaselector");
        if (!isEmpty(requestUrl)) {
            // Get dialog from backend in XML format
            axios.put(requestUrl + "dialog", { theme: this.props.theme.title }).then(response => {
                const result = response.data;
                this.setState({ epaSelectorResult: result, pendingRequests: false });
            }).catch((e) => {
                console.log(e);
                this.setState({ pendingRequests: false });
            });
        }
    };

    onClose = () => {
        // Close dialog
        this.props.setCurrentTask(null);
        this.setState({ epaSelectorResult: null, pendingRequests: false });
    };

    onWidgetValueChange = (widget, value) => {
        // Call onwidgetAction if there is a widgetfunction
        if (widget.property.widgetfunction !== "null" && widget.property.widgetfunction !== "{}") {
            this.onWidgetAction(JSON.parse(widget.property.widgetfunction), widget, value);
        }
        // Set selected value of the current combo
        this.setState((state) => ({
            widgetsProperties: { ...state.widgetsProperties, [widget.name]: {  ...state.widgetsProperties[widget.name],value: value } }
        }));
    }

    setComboValues = (updatedWidgetsProperties, comboChilds) => {
        // Set combo values
        const requestUrl = GwUtils.getServiceUrl("epaselector");
        if (!isEmpty(requestUrl)) {
            // Retrieve all combos and replace values if they exist in updatedWidgetsProperties
            const combos = this.getAllCombos().map(combo => {
                    const key = Object.keys(combo)[0];
                    return updatedWidgetsProperties[key] !== undefined ? { [key]: updatedWidgetsProperties[key].value } : combo;
                })
                // Filter only the required combos
                .filter(combo => ["result_name_show", "result_name_compare", "selector_date", "compare_date"].includes(Object.keys(combo)[0]));

            // Get new values of combos
            axios.put(requestUrl + "dialog", { theme: this.props.theme.title, combos: combos, comboChilds:comboChilds }).then(response => {
                const { body } = response.data;
                Object.keys(body).forEach(key => {
                    const listItems = body[key].length > 0 ? body[key].map(value => ({
                        property: { text: value, value: value }
                    })): [{ property: { text: "", value: "" }}];

                    this.setState((state) => ({
                        widgetsProperties: { ...state.widgetsProperties, [key]: { items: listItems, value: listItems[0].property.value }}
                    }));
                });
            })
            .catch(e => {
                console.log(e);
                this.setState({ pendingRequests: false });
            });
        }
    };

    loadWidgetsProperties = (widgetsProperties) => {
        this.setState((state) => ({ widgetsProperties: { ...state.widgetsProperties, ...widgetsProperties } }));
    };

    onWidgetAction = (action, widget, value) => {
        // Do an action depending of the function name
        switch (action.functionName) {
            case "closeDlg":
                this.onClose();
                break;
            case "accept":
                this.accept();
                break;
            case "help":
                GwUtils.openHelp();
                break;
            case "setComboValues":
                if (Object.keys(this.state.widgetsProperties).length > 0) {
                    this.setComboValues({ [widget.name]: { value: value } }, action.parameters.cmbListToChange)
                }
                break;
            default:
                console.warn(`Action \`${action.name}\` cannot be handled.`);
                break;
        }
    };

    getAllCombos = () => {
        // Return the list of combos with their names and values.
        const widgets = this.state.widgetsProperties
        const combos = []
        for (const widget in widgets) {
            //Check if widget type is combo box.
            if (widgets[widget].value != null || widgets[widget].items?.length > 0) {
                combos.push({ [widget]: widgets[widget].value })
            }
        }
        return combos
    }

    accept = () => {
        // When user click button Accept
        const requestUrl = GwUtils.getServiceUrl("epaselector");
        if (!isEmpty(requestUrl)) {
            // Get all combo names and selected values
            const combos = this.getAllCombos()
            // Call 'accept' backend call
            axios.put(requestUrl + "accept", { theme: this.props.theme.title, combos:combos }).then(() => {
                // Reload layers if there is a result name show selected
                if (!isEmpty(this.state.widgetsProperties["result_name_show"]["value"])) {
                    this.manageLayers()
                }
                // Open 'Compare Theme' in new window if there is a result name compare selected
                if (!isEmpty(this.state.widgetsProperties["result_name_compare"]["value"])) {
                    this.openCompareTheme()
                }
                this.onClose()
            }).catch((e) => {
                console.log(e);
            });
        }
    };

    manageLayers = () => {
        // Enable layers
        const requestUrl = GwUtils.getServiceUrl("util");
        if (!isEmpty(requestUrl)) {
            axios.get(requestUrl + "getlayers", { params: { theme: this.props.theme.title} }).then(response => {
                const layerName = response.data.epa_selector_result;
                const rootLayer = this.props.layers.find(l => l.type === "wms");
                const { layer, path } = GwUtils.findLayer(rootLayer, layerName);
                if (layer) {
                    this.props.changeLayerProperty(rootLayer.uuid, "visibility", true, path, 'both');
                    this.props.refreshLayer(layer => layer.role === LayerRole.THEME);
                }
            }).catch((e) => {
                console.log(e);
            });
        }
    };

    openCompareTheme = () => {
        // Open Compare Theme in new Window
        const requestUrl = GwUtils.getServiceUrl("epaselector");
        if (!isEmpty(requestUrl)) {
            axios.get(requestUrl + "getcomparethemeid", { params: { theme: this.props.theme.title} }).then(response => {
                const themeId = response.data.themeId;
                const url = location.href.split("?")[0] + '?t=' + themeId;
                window.open(url, '_blank');
            }).catch((e) => {
                console.log(e);
            });
        }
    };

    render() {
        let resultWindow = null;
        if(this.state.pendingRequests === true || this.state.epaSelectorResult !== null){
            let body = null;
            if(isEmpty(this.state.epaSelectorResult)){
                let msg = this.state.pendingRequests === true ? "Querying..." : "No result"
                body = (<div role="body"><span>{msg}</span></div>);
            }else{
                const result = this.state.epaSelectorResult;
                if (!isEmpty(result.form_xml)) {
                    body = (
                        <div role="body">
                            <GwQtDesignerForm
                                form_xml={result.form_xml}
                                onWidgetAction={this.onWidgetAction}
                                loadWidgetsProperties={this.loadWidgetsProperties}
                                onWidgetValueChange={this.onWidgetValueChange}
                                readOnly={false}
                                widgetValues={this.state.widgetValues}
                                useNew widgetsProperties={this.state.widgetsProperties}/>
                        </div>
                    );
                }
            }
            resultWindow = (
                <ResizeableWindow
                    dockable={false}
                    icon="giswater"
                    id="GwEpaSelector"
                    initialHeight={this.props.initialHeight}
                    initialWidth={this.props.initialWidth}
                    initialX={this.props.initialX}
                    initialY={this.props.initialY}
                    key="GwEpaSelectorWindow"
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
    refreshLayer: refreshLayer,
    changeLayerProperty: changeLayerProperty
})(GwEpaSelector);


