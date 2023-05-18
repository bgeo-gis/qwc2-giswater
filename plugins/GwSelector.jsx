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
import SideBar from 'qwc2/components/SideBar';
import ResizeableWindow from 'qwc2/components/ResizeableWindow';
import IdentifyUtils from 'qwc2/utils/IdentifyUtils';
import ConfigUtils from 'qwc2/utils/ConfigUtils';
import GwUtils from '../utils/GwUtils';
import { zoomToExtent } from 'qwc2/actions/map';
import { LayerRole, refreshLayer, changeLayerProperty } from 'qwc2/actions/layers';
import 'qwc2-giswater/plugins/style/GwSelector.css'

import GwQtDesignerForm from '../components/GwQtDesignerForm';

class GwSelector extends React.Component {
    static propTypes = {
        currentTask: PropTypes.string,
        layers: PropTypes.array,
        map: PropTypes.object,
        theme: PropTypes.object,
        refreshLayer: PropTypes.func,
        zoomToExtent: PropTypes.func,
        changeLayerProperty: PropTypes.func,
        selectorResult: PropTypes.object,
        initialHeight: PropTypes.number,
        initialWidth: PropTypes.number,
        initialX: PropTypes.number,
        initialY: PropTypes.number,
        initiallyDocked: PropTypes.bool
    }
    static defaultProps = {
        initialWidth: 480,
        initialHeight: 420,
        initialX: 0,
        initialY: 0,
        initiallyDocked: true
    }
    constructor(props) {
        super(props);
    }
    state = {
        selectorResult: null,
        pendingRequests: false,
    }

    crsStrToInt = (crs) => {
        const parts = crs.split(':')
        return parseInt(parts.slice(-1))
    }
    handleResult = (result) => {
        if (!result || result.schema === null) {
            return false;
        }
        
        this.setLayersVisibility(result)

        // Zoom to extent & refresh map
        this.panToResult(result);
        // Refresh map
        this.props.refreshLayer(layer => layer.role === LayerRole.THEME);
    }
    setLayersVisibility(result) {
        if (result.body?.data?.layersVisibility) {
            const rootLayer = this.props.layers.find(l => l.type === "wms");
            Object.entries(result.body.data.layersVisibility).map(([layerName, visible]) => {
                const { layer, path } = GwUtils.findLayer(rootLayer, layerName);
                if (layer) {
                    this.props.changeLayerProperty(rootLayer.uuid, "visibility", visible, path);
                }
            })
        }
    }
    panToResult = (result) => {
        if (!isEmpty(result) && result.body?.data?.geometry) {
            const x1 = result.body.data.geometry.x1;
            const y1 = result.body.data.geometry.y1;
            const x2 = result.body.data.geometry.x2;
            const y2 = result.body.data.geometry.y2;
            console.log("Zoom to:", x1, y1, x2, y2);
            const extent = [x1, y1, x2, y2];
            if (extent.includes(undefined)) {
                return
            }
            this.props.zoomToExtent(extent, this.props.map.projection);
        }
    }
    componentDidUpdate(prevProps, prevState) {
        if (prevProps.theme != this.props.theme) {
            this.makeRequest(true)
        }
    }
    componentDidMount() {
    }
    onShow = () => {
        // Make service request
        this.makeRequest();
    }
    onToolClose = () => {
        if (this.props.dispatchButton){
            this.props.dispatchButton({ "widgetfunction": { "functionName": "selectorClose" } });
        }
        this.setState({ selectorResult: null, pendingRequests: false });
    }
    getSelectors = (params, hide_form = false) => {
        const request_url = GwUtils.getServiceUrl("selector");
        if (isEmpty(request_url)) {
            return false;
        }

        // Send request
        axios.get(request_url + "get", { params: params }).then(response => {
            const result = response.data
            if (!hide_form)
                this.setState({ selectorResult: result, pendingRequests: false });
            this.handleResult(result);
        }).catch((e) => {
            console.log(e);
            this.setState({ pendingRequests: false });
        });
    }
    setSelectors = (params) => {
        const request_url = GwUtils.getServiceUrl("selector");
        if (isEmpty(request_url)) {
            return false;
        }

        // Send request
        axios.post(request_url + "set", { ...params }).then(response => {
            const result = response.data
            this.setState({ selectorResult: result, pendingRequests: false });
            this.handleResult(result);
        }).catch((e) => {
            console.log(e);
            this.setState({ pendingRequests: false });
        });
    }
    updateField = (widgetName, ev, action) => {
        // Get request paramas
        const epsg = this.crsStrToInt(this.props.map.projection)
        const selectorType = action.params.selectorType;
        const tabName = action.params.tabName;
        const id = action.params.id;
        const isAlone = false;
        const disableParent = false; // TODO?: get if shift is pressed (depending on)
        const value = action.params.value == 'False';
        const addSchema = "NULL"; // TODO?: allow addSchema
        const params = {
            "theme": this.props.theme.title,
            "epsg": epsg,
            "selectorType": selectorType,
            "tabName": tabName,
            "id": id,
            "isAlone": isAlone,
            "disableParent": disableParent,
            "value": value,
            "addSchema": addSchema
        }

        // Call setselectors
        this.setSelectors(params);
    }
    dispatchButton = (action) => {
        let pendingRequests = false;
        switch (action.name) {
            default:
                console.warn(`Action \`${action.name}\` cannot be handled.`)
                break;
        }
    }
    makeRequest(hide_form = false) {
        let pendingRequests = false;

        const request_url = GwUtils.getServiceUrl("selector");
        if (!isEmpty(request_url)) {
            // Get request paramas
            const epsg = this.crsStrToInt(this.props.map.projection)
            const params = {
                "theme": this.props.theme.title,
                "epsg": epsg,
                "currentTab": "tab_exploitation",
                "selectorType": "selector_basic"
            }

            // Send request
            pendingRequests = true
            this.getSelectors(params, hide_form);
        }
        // Set "Waiting for request..." message
        // this.filteredSelectors = true;
        if (!hide_form)
            this.setState({ selectorResult: {}, pendingRequests: pendingRequests });
    }
    render() {
        // Create window
        let body = null;
        const result = this.state.selectorResult || this.props.selectorResult;
        if (this.state.pendingRequests === true || result !== null) {
            if (isEmpty(result)) {
                if (this.state.pendingRequests === true) {
                    body = (<div className="selector-body" role="body"><span className="selector-body-message">Querying...</span></div>); // TODO: TRANSLATION
                } else {
                    body = (<div className="selector-body" role="body"><span className="selector-body-message">No result</span></div>); // TODO: TRANSLATION
                }
            } else if (!result.form_xml) {
                body = (<div className="selector-body" role="body"><span className="selector-body-message">{result.message}</span></div>);
            } else {
                body = (
                    <div className="selector-body" role="body">
                        <GwQtDesignerForm form_xml={result.form_xml} autoResetTab={false} readOnly={false} getInitialValues={false}
                            dispatchButton={this.dispatchButton} updateField={this.updateField} />
                    </div>
                )
            }
        }
        if (this.props.selectorResult){
            return (
                <ResizeableWindow icon="selector" dockable="right"
                    initialHeight={this.props.initialHeight} initialWidth={this.props.initialWidth}
                    initialX={this.props.initialX} initialY={this.props.initialY} initiallyDocked={this.props.initiallyDocked}
                    key="GwSelector"
                    onClose={this.onToolClose} title="GW Selector" maximizeable={false} minimizeable={false} scrollable={true}
                >
                    {body}
                </ResizeableWindow>
            );
        } else {
            return (
                <SideBar icon="selector" id="GwSelector" title="GW Selector"
                    key="GwSelectorNull" onShow={this.onShow} >
                    {body}
                </SideBar>
            );
        }
        
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
    changeLayerProperty: changeLayerProperty
})(GwSelector);
