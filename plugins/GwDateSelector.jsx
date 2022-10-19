import axios from 'axios';
import React from 'react';
import { connect } from 'react-redux';
import PropTypes from 'prop-types';
import isEmpty from 'lodash.isempty';
import ResizeableWindow from 'qwc2/components/ResizeableWindow';
import IdentifyUtils from 'qwc2/utils/IdentifyUtils';
import ConfigUtils from 'qwc2/utils/ConfigUtils';
import { zoomToExtent } from 'qwc2/actions/map';
import { setCurrentTask } from 'qwc2/actions/task';

import QtDesignerForm from 'qwc2/components/QtDesignerForm';
import GwInfoQtDesignerForm from '../components/GwInfoQtDesignerForm';

class GwDateSelector extends React.Component {
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
        layers: PropTypes.array,
        map: PropTypes.object,
        removeLayer: PropTypes.func,
        removeMarker: PropTypes.func,
        setCurrentTask: PropTypes.func,
        selection: PropTypes.object
    }
    static defaultProps = {
        replaceImageUrls: true,
        initialWidth: 320,
        initialHeight: 162,
        initialX: 0,
        initialY: 0
    }
    state = {
        dateSelectorResult: null,
        pendingRequests: false,
        filteredSelectors: false,
        date_from: null,
        date_to: null
    }

    crsStrToInt = (crs) => {
        const parts = crs.split(':')
        return parseInt(parts.slice(-1))
    }
    filterLayers = (result) => {
        const layerFilters = ["expl_id", "state"]
        const filterNames = {
            "tab_exploitation": { "key": "expl_id", "column": "expl_id" },
            "tab_network_state": { "key": "id", "column": "state" }
        }
        const queryableLayers = this.getQueryableLayers();

        if (!isEmpty(queryableLayers)) {
            // Get values
            var values = this.getFilterValues(result, filterNames);
            // Get filter query
            var filter = this.getFilterStr(values, layerFilters, result.data.layerColumns);
            console.log("filter query =", filter);

            // Apply filter, zoom to extent & refresh map
            console.log("queryable layers =", queryableLayers);
            const layer = queryableLayers[0];
            layer.params.FILTER = filter;
            this.panToResult(result);
            // TODO: refresh map
        }
    }
    getFilterValues = (result, filterNames) => {
        let values = {}

        console.log(result.form.formTabs);
        for (let i = 0; i < result.form.formTabs.length; i++) {
            const tab = result.form.formTabs[i];
            let tabname = filterNames[tab.tabName];
            if (tabname === undefined) {
                continue;
            }
            let key = tabname.key;
            let columnname = tabname.column;
            values[columnname] = []
            for (let j = 0; j < tab.fields.length; j++) {
                const v = tab.fields[j];
                if (v.value == true) {
                    let value;
                    for (var k in v) {
                        if (k == key) {
                            value = v[k]
                            break;
                        }
                    }
                    values[columnname].push(value);
                }
            }
        }

        return values;
    }
    getFilterStr = (values, layerFilters, layerColumns) => {
        console.log("values ->", values);
        console.log("layerFilters ->", layerFilters);
        console.log("layerColumns ->", layerColumns);
        let filterStr = "";
        for (var lyr in layerColumns) {
            const cols = layerColumns[lyr];  // Get columns for layer
            filterStr += lyr + ": ";
            var fields = layerFilters;  // Get columns to filter
            let fieldsFilterStr = "";
            for (let i = 0; i < fields.length; i++) {
                var field = fields[i];  // Column to filter
                var value = values[field];  // Value to filter
                if (value === undefined || !cols.includes(field)) {  // If no value defined or layer doesn't have column to filter
                    continue;
                }
                if (i > 0 && fieldsFilterStr.length > 0) {
                    fieldsFilterStr += " AND ";
                }
                if (value.length > 0) {
                    fieldsFilterStr += "\"" + field + "\" IN ( " + value.join(' , ') + " )";
                } else {
                    fieldsFilterStr += "\"" + field + "\" = -1";
                }
            }
            filterStr += fieldsFilterStr + ";";
        }
        return filterStr;
    }
    panToResult = (result) => {
        if (!isEmpty(result)) {
            const x1 = result.data.geometry.x1;
            const y1 = result.data.geometry.y1;
            const x2 = result.data.geometry.x2;
            const y2 = result.data.geometry.y2;
            console.log("Zoom to:", x1, y1, x2, y2);
            const extent = [x1, y1, x2, y2];
            if (extent.includes(undefined)) {
                return
            }
            this.props.zoomToExtent(extent, this.props.map.projection);
        }
    }
    componentDidUpdate(prevProps, prevState) {
        // if (!this.state.filteredSelectors && !isEmpty(this.getQueryableLayers())) {
        //     this.makeRequest();
        //     this.state.filteredSelectors = true;
        // }
        // if (prevProps.currentTask === "ThemeSwitcher") {
        //     this.state.filteredSelectors = false;
        // }
        if (prevProps.currentTask !== this.props.currentTask && this.props.currentTask === "DateSelector") {
            this.makeRequest();
        }
        if (prevProps.currentTask !== this.props.currentTask && this.props.currentTask === null) {
            this.onClose();
        }
    }
    onShow = () => {
        // Make service request
        this.makeRequest();
    }
    onClose = () => {
        this.setState({ dateSelectorResult: null, pendingRequests: false, date_from: null, date_to: null });
        this.props.setCurrentTask(null);
    }
    onToolClose = () => {
        this.setState({ dateSelectorResult: null, pendingRequests: false, date_from: null, date_to: null });
        this.props.setCurrentTask(null);
    }
    clearResults = () => {
        this.setState({ dateSelectorResult: null, pendingRequests: false });
    }
    getQueryableLayers = () => {
        if ((typeof this.props.layers === 'undefined' || this.props.layers === null) || (typeof this.props.map === 'undefined' || this.props.map === null)) {
            console.log("return", this.props.layers, this.props.map);
            return [];
        }

        return IdentifyUtils.getQueryLayers(this.props.layers, this.props.map).filter(l => {
            // TODO: If there are some wms external layers this would select more than one layer
            return l.type === "wms"
        });
    }
    getDates = (params) => {
        console.log("getDates()");
        const request_url = ConfigUtils.getConfigProp("gwDateSelectorServiceUrl")
        if (isEmpty(request_url)) {
            return false;
        }

        // Send request
        axios.get(request_url + "getdates", { params: params }).then(response => {
            const result = response.data
            this.setState({ dateSelectorResult: result, pendingRequests: false });
            // this.filterLayers(result);
        }).catch((e) => {
            console.log(e);
            this.setState({ pendingRequests: false });
        });
    }
    setDates = (params) => {
        console.log("setDates()");
        const request_url = ConfigUtils.getConfigProp("gwDateSelectorServiceUrl")
        if (isEmpty(request_url)) {
            return false;
        }

        // Send request
        axios.get(request_url + "setdates", { params: params }).then(response => {
            const result = response.data
            this.setState({ dateSelectorResult: result, pendingRequests: false });
            // this.filterLayers(result);
            this.props.setCurrentTask(null);
        }).catch((e) => {
            console.log(e);
            this.setState({ pendingRequests: false });
        });
    }
    updateField = (widgetName, ev, action) => {
        console.log("updateField()");
        console.log("widgetName", widgetName);
        console.log("ev", ev);
        console.log("action", action);
        this.setState({ [widgetName]: ev });
        return;
    }
    dispatchButton = (action) => {
        let pendingRequests = false;
        console.log("dispatchButton()");
        switch (action.name) {
            case "accept":
                const queryableLayers = this.getQueryableLayers();
                if (!isEmpty(queryableLayers)) {
                    // Get request paramas
                    const layer = queryableLayers[0];
                    const dateFrom = this.state.date_from;
                    const dateTo = this.state.date_to;
                    const params = {
                        "theme": layer.title,
                        "dateFrom": dateFrom,
                        "dateTo": dateTo,
                        "layers": String(layer.queryLayers)
                    }

                    // Call setdates
                    this.setDates(params);
                }
                break;
            case "closeDlg":
                this.onClose();
                break;
            default:
                console.warn(`Action \`${action.name}\` cannot be handled.`)
                break;
        }
    }
    makeRequest() {
        console.log("makeRequest()");
        let pendingRequests = false;

        const queryableLayers = this.getQueryableLayers();
        console.log("queryableLayers =", queryableLayers);

        const request_url = ConfigUtils.getConfigProp("gwDateSelectorServiceUrl");
        console.log("request_url =", request_url);
        if (!isEmpty(queryableLayers) && !isEmpty(request_url)) {
            // Get request paramas
            const layer = queryableLayers[0];
            const epsg = this.crsStrToInt(this.props.map.projection)
            const params = {
                "theme": layer.title
            }

            // Send request
            pendingRequests = true
            this.getDates(params);
        }
        // Set "Waiting for request..." message
        this.setState({ dateSelectorResult: {}, pendingRequests: pendingRequests });
    }
    render() {
        // console.log("render()", this.state);
        // console.log("props", this.props);
        // Create window
        let datesWindow = null;
        if (this.state.pendingRequests === true || this.state.dateSelectorResult !== null) {
            let body = null;
            if (isEmpty(this.state.dateSelectorResult)) {
                if (this.state.pendingRequests === true) {
                    body = (<div className="date-selector-body" role="body"><span className="date-selector-body-message">Querying...</span></div>); // TODO: TRANSLATION
                } else {
                    body = (<div className="date-selector-body" role="body"><span className="date-selector-body-message">No result</span></div>); // TODO: TRANSLATION
                }
            } else {
                const result = this.state.dateSelectorResult
                body = (
                    <div className="date-selector-body" role="body">
                        <GwInfoQtDesignerForm form_xml={result.form_xml} readOnly={false} dispatchButton={this.dispatchButton} updateField={this.updateField} />
                    </div>
                )
            }
            datesWindow = (
                <ResizeableWindow icon="date_selector" key="GwDateSelectorWindow" title="GW Date Selector" id="GwDateSelector"
                    initialHeight={this.props.initialHeight} initialWidth={this.props.initialWidth} dockable={false}
                    onShow={this.onShow} onClose={this.onToolClose}
                >
                    {body}
                </ResizeableWindow>
            )
        }

        return datesWindow;
    }
}

const selector = (state) => ({
    currentTask: state.task.id,
    layers: state.layers.flat,
    map: state.map
});

export default connect(selector, {
    zoomToExtent: zoomToExtent,
    setCurrentTask: setCurrentTask
})(GwDateSelector);