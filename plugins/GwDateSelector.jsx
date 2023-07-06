/**
 * Copyright BGEO. All rights reserved.
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
import IdentifyUtils from 'qwc2/utils/IdentifyUtils';
import { LayerRole, refreshLayer } from 'qwc2/actions/layers';
import { zoomToExtent } from 'qwc2/actions/map';
import { setCurrentTask } from 'qwc2/actions/task';
import { processFinished, processStarted } from 'qwc2/actions/processNotifications';

import GwQtDesignerForm from '../components/GwQtDesignerForm';
import GwUtils from '../utils/GwUtils';

import './style/GwDateSelector.css';

class GwDateSelector extends React.Component {
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
        theme: PropTypes.object
    };
    static defaultProps = {
        replaceImageUrls: true,
        initialWidth: 320,
        initialHeight: 162,
        initialX: 0,
        initialY: 0
    };
    state = {
        dateSelectorResult: null,
        getDatesResult: null,
        pendingRequests: false,
        filters: {}
    };
    filterLayers = (result) => {
        if (isEmpty(result) || result.schema === null) {
            this.props.processStarted("dateselector_msg", "DateSelector Error!");
            this.props.processFinished("dateselector_msg", false, "Couldn't find schema, please check service config.");
            return;
        }
        const layerFilters = ["filterdate"];  // TODO: get this from config?
        const queryableLayers = this.getQueryableLayers();

        if (!isEmpty(queryableLayers)) {
            // Get values
            const values = this.getFilterValues(result);
            // Get filter query
            const filter = this.getFilterStr(values, layerFilters, result.body.data.layerColumns);
            console.log("filter query =", filter);

            // Apply filter, zoom to extent & refresh map
            console.log("queryable layers =", queryableLayers);
            queryableLayers[0].params.FILTER = filter;
            // Refresh map
            this.props.refreshLayer(layer => layer.role === LayerRole.THEME);
        }
    };
    getFilterValues = (result) => {
        return { from_date: result.body.data?.date_from, to_date: result.body.data?.date_to };
    };
    getFilterStr = (values, layerFilters, layerColumns) => {
        console.log("values ->", values);
        console.log("layerFilters ->", layerFilters);
        console.log("layerColumns ->", layerColumns);
        let filterStr = "";
        for (const lyr of layerColumns) {
            const cols = layerColumns[lyr];  // Get columns for layer
            const fields = layerFilters;  // Get columns to filter
            let fieldsFilterStr = "";
            for (let i = 0; i < fields.length; i++) {
                const field = fields[i];  // Column to filter
                if (!values || !cols.includes(field)) {  // If no value defined or layer doesn't have column to filter
                    continue;
                }
                if (i > 0 && fieldsFilterStr.length > 0) {
                    fieldsFilterStr += " AND ";
                }
                // {layer}: "{field}" >= {from_date} AND "{field}" <= {to_date};
                fieldsFilterStr += "\"" + field + "\" >= '" + values.from_date + "' AND \"" + field + "\" <= '" + values.to_date + "'";
            }
            if (fieldsFilterStr) {
                filterStr += lyr + ": " + fieldsFilterStr + ";";
            }
        }
        return filterStr;
    };
    componentDidMount() {
        this.getDates();
    }
    componentDidUpdate(prevProps) {
        if (prevProps.theme !== this.props.theme) {
            this.getDates();
        }

        // Filter layers if any layer changed visibility
        if (!isEmpty(this.getQueryableLayers())) {
            const prevLayers = IdentifyUtils.getQueryLayers(prevProps.layers, prevProps.map).filter(l => {
                // TODO: If there are some wms external layers this would select more than one layer
                return l.type === "wms";
            })[0]?.queryLayers;
            const curLayers = IdentifyUtils.getQueryLayers(this.props.layers, this.props.map).filter(l => {
                // TODO: If there are some wms external layers this would select more than one layer
                return l.type === "wms";
            })[0]?.queryLayers;
            // If more/less layers are active, filter again
            if (prevLayers && curLayers && prevLayers.length !== curLayers.length) {
                this.getDates(false);
            }
        }

        // Manage open tool
        if (prevProps.currentTask !== this.props.currentTask && this.props.currentTask === "GwDateSelector") {
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
    onClose = () => {
        this.setState({ dateSelectorResult: null, pendingRequests: false });
        this.props.setCurrentTask(null);
    };
    onToolClose = () => {
        this.setState({ dateSelectorResult: null, pendingRequests: false });
        this.props.setCurrentTask(null);
    };
    clearResults = () => {
        this.setState({ dateSelectorResult: null, pendingRequests: false });
    };
    getQueryableLayers = () => {
        if ((typeof this.props.layers === 'undefined' || this.props.layers === null) || (typeof this.props.map === 'undefined' || this.props.map === null)) {
            console.log("return", this.props.layers, this.props.map);
            return [];
        }

        return IdentifyUtils.getQueryLayers(this.props.layers, this.props.map).filter(l => {
            // TODO: If there are some wms external layers this would select more than one layer
            return l.type === "wms";
        });
    };
    getDialog = () => {
        let pendingRequests = false;

        const requestUrl = GwUtils.getServiceUrl("dateselector");
        if (!isEmpty(requestUrl)) {
            // Send request
            pendingRequests = true;
            axios.get(requestUrl + "dialog", { params: {} }).then(response => {
                const result = response.data;
                this.setState({ dateSelectorResult: result, pendingRequests: false });
                // this.filterLayers(result);
            }).catch((e) => {
                console.log(e);
                this.setState({ pendingRequests: false });
            });
        }
        // Set "Waiting for request..." message
        this.setState({ dateSelectorResult: {}, pendingRequests: pendingRequests });
    };
    getDates = (updateState = true) => {
        const queryableLayers = this.getQueryableLayers();

        const requestUrl = GwUtils.getServiceUrl("dateselector");
        if (!isEmpty(queryableLayers) && !isEmpty(requestUrl)) {
            // Get request paramas
            const layer = queryableLayers[0];
            const params = {
                theme: layer.title,
                layers: String(layer.queryLayers)
            };

            // Send request
            axios.get(requestUrl + "dates", { params: params }).then(response => {
                const result = response.data;
                const dateFrom = result.body.data?.date_from;
                const dateTo = result.body.data?.date_to;
                if (updateState) this.setState({ getDatesResult: result, dateSelectorResult: null, filters: { date_from: { value: dateFrom }, date_to: { value: dateTo } } });
                this.filterLayers(result);
            }).catch((e) => {
                console.log(e);
                if (updateState) this.setState({});
            });
        }
        // Set "Waiting for request..." message
        if (updateState) this.setState({ getDatesResult: {}, dateSelectorResult: null });
    };
    setDates = (params) => {
        const requestUrl = GwUtils.getServiceUrl("dateselector");
        if (isEmpty(requestUrl)) {
            return;
        }

        // Send request
        axios.put(requestUrl + "dates", { ...params }).then(response => {
            const result = response.data;
            this.setState({ dateSelectorResult: result, getDatesResult: result, pendingRequests: false });
            this.filterLayers(result);
            this.props.setCurrentTask(null);
        }).catch((e) => {
            console.log(e);
            this.setState({ pendingRequests: false });
        });
    };
    updateField = (widget, ev) => {
        this.setState((state) => ({ filters: { ...state.filters, [widget.name]: { value: ev } } }));
    };
    dispatchButton = (action) => {
        switch (action.functionName) {
        case "accept": {
            const queryableLayers = this.getQueryableLayers();
            if (!isEmpty(queryableLayers)) {
                // Get request paramas
                console.log(this.state.filters);
                const layer = queryableLayers[0];
                const dateFrom = this.state.filters.date_from.value;
                const dateTo = this.state.filters.date_to.value;
                const params = {
                    theme: this.props.theme.title,
                    dateFrom: dateFrom,
                    dateTo: dateTo,
                    layers: String(layer.queryLayers)
                };

                // Call setdates
                this.setDates(params);
            }
            break;
        }
        case "closeDlg":
            this.onClose();
            break;
        default:
            console.warn(`Action \`${action.name}\` cannot be handled.`);
            break;
        }
    };
    render() {
        let datesWindow = null;
        let datesDocker = null;
        let dockerBody = null;
        // Docker
        if (this.state.getDatesResult !== null) {
            if (!isEmpty(this.state.getDatesResult)) {
                let dateFrom = this.state.getDatesResult.body.data.date_from;
                let dateParts = dateFrom.split("-");
                dateFrom = dateParts[2] + '/' + dateParts[1] + '/' + dateParts[0];
                let dateTo = this.state.getDatesResult.body.data.date_to;
                dateParts = dateTo.split("-");
                dateTo = dateParts[2] + '/' + dateParts[1] + '/' + dateParts[0];
                dockerBody = (
                    <span>Dates: {dateFrom} - {dateTo}</span>
                );
            }
        }
        // Dialog
        if (this.state.pendingRequests === true || this.state.dateSelectorResult !== null) {
            let body = null;
            if (isEmpty(this.state.dateSelectorResult)) {
                if (this.state.pendingRequests === true) {
                    body = (<div className="date-selector-body" role="body"><span className="date-selector-body-message">Querying...</span></div>); // TODO: TRANSLATION
                } else {
                    body = (<div className="date-selector-body" role="body"><span className="date-selector-body-message">No result</span></div>); // TODO: TRANSLATION
                }
            } else {
                const result = this.state.dateSelectorResult;
                if (!isEmpty(result.form_xml)) {
                    body = (
                        <div className="date-selector-body" role="body">
                            <GwQtDesignerForm dispatchButton={this.dispatchButton} form_xml={result.form_xml} readOnly={false} updateField={this.updateField} widgetValues={this.state.filters} />
                        </div>
                    );
                }

                if (!isEmpty(result.body?.data?.date_from) && !isEmpty(result.body?.data?.date_to)) {
                    dockerBody = (
                        <span>Dates: {result.body.data.date_from} - {result.body.data.date_to}</span>
                    );
                }

            }
            datesWindow = (
                <ResizeableWindow dockable={false} icon="date_selector" id="GwDateSelector" initialHeight={this.props.initialHeight}
                    initialWidth={this.props.initialWidth} initialX={this.props.initialX}
                    initialY={this.props.initialY} key="GwDateSelectorWindow"
                    onClose={this.onToolClose} onShow={this.onShow} title="GW Date Selector"
                >
                    {body}
                </ResizeableWindow>
            );
        }

        datesDocker = (
            <div id="DatesDocker" key="GwDateSelectorDocker">
                {dockerBody}
            </div>
        );
        return [datesWindow, datesDocker];
    }
}

const selector = (state) => ({
    currentTask: state.task.id,
    layers: state.layers.flat,
    map: state.map,
    theme: state.theme.current
});

export default connect(selector, {
    zoomToExtent: zoomToExtent,
    refreshLayer: refreshLayer,
    setCurrentTask: setCurrentTask,
    processFinished: processFinished,
    processStarted: processStarted
})(GwDateSelector);
