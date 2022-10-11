import axios from 'axios';
import React from 'react';
import { connect } from 'react-redux';
import PropTypes from 'prop-types';
import isEmpty from 'lodash.isempty';
import SideBar from 'qwc2/components/SideBar';
import IdentifyUtils from 'qwc2/utils/IdentifyUtils';
import ConfigUtils from 'qwc2/utils/ConfigUtils';
import { zoomToExtent } from 'qwc2/actions/map';

import QtDesignerForm from 'qwc2/components/QtDesignerForm';
import GwInfoQtDesignerForm from '../components/GwInfoQtDesignerForm';

class GwSelector extends React.Component {
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
        selection: PropTypes.object
    }
    static defaultProps = {
        replaceImageUrls: true,
        initialWidth: 240,
        initialHeight: 320,
        initialX: 0,
        initialY: 0
    }
    state = {
        selectorResult: null,
        pendingRequests: false,
        filteredSelectors: false
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
        if (!this.state.filteredSelectors && !isEmpty(this.getQueryableLayers())) {
            this.makeRequest();
            this.state.filteredSelectors = true;
        }
        if (prevProps.currentTask === "ThemeSwitcher") {
            this.state.filteredSelectors = false;
        }
    }
    onShow = () => {
        // Make service request
        this.makeRequest();
    }
    onToolClose = () => {
        this.setState({ selectorResult: null, pendingRequests: false });
    }
    clearResults = () => {
        this.setState({ selectorResult: null, pendingRequests: false });
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
    getSelectors = (params) => {
        const request_url = ConfigUtils.getConfigProp("gwSelectorServiceUrl")
        if (isEmpty(request_url)) {
            return false;
        }

        // Send request
        axios.get(request_url + "getselector", { params: params }).then(response => {
            const result = response.data
            this.setState({ selectorResult: result, pendingRequests: false });
            this.filterLayers(result);
        }).catch((e) => {
            console.log(e);
            this.setState({ pendingRequests: false });
        });
    }
    setSelectors = (params) => {
        const request_url = ConfigUtils.getConfigProp("gwSelectorServiceUrl")
        if (isEmpty(request_url)) {
            return false;
        }

        // Send request
        axios.get(request_url + "setselector", { params: params }).then(response => {
            const result = response.data
            this.setState({ selectorResult: result, pendingRequests: false });
            this.filterLayers(result);
        }).catch((e) => {
            console.log(e);
            this.setState({ pendingRequests: false });
        });
    }
    updateField = (widgetName, ev, action) => {
        const queryableLayers = this.getQueryableLayers();
        if (!isEmpty(queryableLayers)) {
            // Get request paramas
            const layer = queryableLayers[0];
            const epsg = this.crsStrToInt(this.props.map.projection)
            const selectorType = "selector_basic"; // TODO: get this from json key 'selectorType'
            const tabName = action.params.tabName;
            const id = action.params.id;
            const isAlone = false;
            const disableParent = false; // TODO?: get if shift is pressed (depending on)
            const value = action.params.value == 'False';
            const addSchema = "NULL"; // TODO?: allow addSchema
            const params = {
                "theme": layer.title,
                "epsg": epsg,
                "selectorType": selectorType,
                "tabName": tabName,
                "id": id,
                "isAlone": isAlone,
                "disableParent": disableParent,
                "value": value,
                "addSchema": addSchema,
                "layers": String(layer.queryLayers)
            }

            // Call setselectors
            this.setSelectors(params);
        }
    }
    dispatchButton = (action) => {
        let pendingRequests = false;
        switch (action.name) {
            default:
                console.warn(`Action \`${action.name}\` cannot be handled.`)
                break;
        }
    }
    makeRequest() {
        let pendingRequests = false;

        const queryableLayers = this.getQueryableLayers();

        const request_url = ConfigUtils.getConfigProp("gwSelectorServiceUrl")
        if (!isEmpty(queryableLayers) && !isEmpty(request_url)) {
            // Get request paramas
            const layer = queryableLayers[0];
            const epsg = this.crsStrToInt(this.props.map.projection)
            const params = {
                "theme": layer.title,
                "epsg": epsg,
                "currentTab": "tab_exploitation",
                "selectorType": "selector_basic",
                "layers": String(layer.queryLayers),
                "loadProject": !this.state.filteredSelectors
            }

            // Send request
            pendingRequests = true
            this.getSelectors(params);
        }
        // Set "Waiting for request..." message
        this.setState({ selectorResult: {}, pendingRequests: pendingRequests });
    }
    render() {
        // Create window
        let body = null;
        if (this.state.pendingRequests === true || this.state.selectorResult !== null) {
            if (isEmpty(this.state.selectorResult)) {
                if (this.state.pendingRequests === true) {
                    body = (<div className="selector-body" role="body"><span className="selector-body-message">Querying...</span></div>); // TODO: TRANSLATION
                } else {
                    body = (<div className="selector-body" role="body"><span className="selector-body-message">No result</span></div>); // TODO: TRANSLATION
                }
            } else {
                const result = this.state.selectorResult
                body = (
                    <div className="selector-body" role="body">
                        <GwInfoQtDesignerForm form_xml={result.form_xml} readOnly={false} dispatchButton={this.dispatchButton} updateField={this.updateField} />
                    </div>
                )
            }
        }
        return (
            <SideBar icon="selector" id="GwSelector" title="GW Selector"
                key="GwSelectorNull" onShow={this.onShow}>
                {body}
            </SideBar>
        );
    }
}

const selector = (state) => ({
    currentTask: state.task.id,
    layers: state.layers.flat,
    map: state.map
});

export default connect(selector, {
    zoomToExtent: zoomToExtent
})(GwSelector);