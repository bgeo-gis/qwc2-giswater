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
import SideBar from 'qwc2/components/SideBar';
import ResizeableWindow from 'qwc2/components/ResizeableWindow';
import GwUtils from '../../utils/GwUtils';
import { zoomToExtent } from 'qwc2/actions/map';
import { LayerRole, refreshLayer, removeLayer, addLayerFeatures, changeLayerProperty, setFilter } from 'qwc2/actions/layers';
import 'qwc2-giswater/plugins/style/GwSelector.css';
import GwQtDesignerForm from '../../components/GwQtDesignerForm';
import LocaleUtils from 'qwc2/utils/LocaleUtils';

import {setActiveSelector, reloadLayersFilters} from '../../actions/selector';
import { setCurrentTask } from 'qwc2/actions/task';
import IdentifyUtils from 'qwc2/utils/IdentifyUtils';

class GwSelector extends React.Component {
    static propTypes = {
        addLayerFeatures: PropTypes.func,
        changeLayerProperty: PropTypes.func,
        currentTask: PropTypes.string,
        initialHeight: PropTypes.number,
        initialWidth: PropTypes.number,
        initialX: PropTypes.number,
        initialY: PropTypes.number,
        initiallyDocked: PropTypes.bool,
        layers: PropTypes.array,
        map: PropTypes.object,
        mincutIds: PropTypes.array,
        onWidgetAction: PropTypes.func,
        refreshLayer: PropTypes.func,
        removeLayer: PropTypes.func,
        selectorResult: PropTypes.object,
        setActiveSelector: PropTypes.func,
        reloadLayersFilters: PropTypes.func,
        geometry: PropTypes.object,
        setCurrentTask: PropTypes.func,
        theme: PropTypes.object,
        zoomToExtent: PropTypes.func,
        setFilter: PropTypes.func,
    };
    static defaultProps = {
        initialWidth: 480,
        initialHeight: 420,
        initialX: 0,
        initialY: 0,
        initiallyDocked: true,
        geometry: null
    };
    constructor(props) {
        super(props);
    }
    state = {
        selectorResult: null,
        pendingRequests: false,
        isShiftPressed: false
    };
    handleResult = (result) => {
        if (!result || result.schema === null) {
            return;
        }
        if (!this.setOMLayersVisibility(result?.body?.data?.mincutLayer, true)) {
            this.addMincutLayers(result);
        }
        this.setLayersVisibility(result);

        // Zoom to extent & refresh map
        this.panToResult(result);
        // Refresh map
    };
    setLayersVisibility(result) {
        if (result.body?.data?.layersVisibility) {
            const rootLayer = this.props.layers.find(l => l.type === "wms");
            Object.entries(result.body.data.layersVisibility).map(([layerName, visible]) => {
                const { layer, path } = GwUtils.findLayer(rootLayer, layerName);
                if (layer) {
                    this.props.changeLayerProperty(rootLayer.uuid, "visibility", visible, path);
                }
            });
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
                return;
            }
            this.props.zoomToExtent(extent, this.props.map.projection);
        }
    };
    componentDidUpdate(prevProps) {
        if (prevProps.theme !== this.props.theme) {
            this.makeRequest(true);
        }
        if (this.props.selectorResult && this.props.selectorResult !== prevProps.selectorResult) {
            this.setState({selectorResult: null});
        }
        if (prevProps.geometry !== this.props.geometry && this.props.geometry !== null) {
            // Zoom to map and filter layers
            this.panToResult({ body:{ data:{ geometry: this.props.geometry }}});
            this.reloadLayersFilters();
        }
    }
    componentDidMount() {
        // Add event listeners for shift key
        window.addEventListener('keydown', this.handleKeyDown);
        window.addEventListener('keyup', this.handleKeyUp);
    }
    componentWillUnmount() {
        // Remove event listeners
        window.removeEventListener('keydown', this.handleKeyDown);
        window.removeEventListener('keyup', this.handleKeyUp);
    }
    handleKeyDown = (event) => {
        if (event.key === 'Shift') {
            this.setState({ isShiftPressed: true });
        }
    };
    handleKeyUp = (event) => {
        if (event.key === 'Shift') {
            this.setState({ isShiftPressed: false });
        }
    };
    onShow = () => {
        // Make service request
        this.makeRequest();
    };
    onToolClose = () => {
        /*
        if (this.props.onWidgetAction) {
            this.props.onWidgetAction({ widgetfunction: { functionName: "selectorClose" } });
        }*/
        this.props.setActiveSelector(null);
        // this.props.setCurrentTask(null);
        this.setState({ selectorResult: null, pendingRequests: false });
    };
    getSelectors = (params, hideForm = false) => {
        const requestUrl = GwUtils.getServiceUrl("selector");
        if (isEmpty(requestUrl)) {
            return;
        }

        // Send request
        axios.get(requestUrl + "get", { params: params }).then(response => {
            const result = response.data;
            if (!hideForm) {
                this.setState({ selectorResult: result, pendingRequests: false });
            }
            this.handleResult(result);
        }).catch((e) => {
            console.log(e);
            this.setState({ pendingRequests: false });
        });
    };
    setSelectors = (params) => {
        const requestUrl = GwUtils.getServiceUrl("selector");
        if (isEmpty(requestUrl)) {
            return;
        }

        // Send request
        axios.post(requestUrl + "set", { ...params }).then(response => {
            const result = response.data;
            this.setState({ selectorResult: result, pendingRequests: false });
            this.handleResult(result);
            this.reloadLayersFilters();
        }).catch((e) => {
            console.log(e);
            this.setState({ pendingRequests: false });
        });
    };

    reloadLayersFilters = () => {
        // Get filters from HTTP Response
        this.getFilters().then((response) => {
            const muniFilter = response.data.muni_filter;
            const sectorFilter = response.data.sector_filter;

            if (!muniFilter && !sectorFilter) {
                return
            }
            // Get WMS layers
            this.getLayersFiltered(["muni_id","sector_id"]).then((response) => {
                const layers = response.data.body.layers;
                const filter = {};
                const filterArray = this.buildFilterArray(muniFilter, sectorFilter);
                for (const layerToFilter of layers) {
                    filter[layerToFilter] = [filterArray];
                }
                // Set filter
                this.props.setFilter(filter);

                // Refresh map
                this.props.refreshLayer(layer => layer.role === LayerRole.THEME);
            }).catch(error => {
                console.error("Failed in getLayers: ", error);
            });
        }).catch(error => {
            console.error("Failed in getFilters: ", error);
        });
    }

    getLayersFiltered = (filter) => {
        try{
            const queryLayers = this.getQueryableLayers()[0].queryLayers;
            const requestUrl = GwUtils.getServiceUrl("selector");
            const params = {
                theme: this.props.theme.title,
                filter: filter,
                queryLayers: queryLayers
            }
            try{
                return axios.put(requestUrl + "getlayersfiltered", params);
            }catch (e) {
                console.log(e);
            }
        }catch(error){
            console.warn(error);
            return Promise.reject(error);
        }
    }

    getFilters=() =>{
        try {
            const requestUrl = GwUtils.getServiceUrl("util");
            try {
                return axios.get(requestUrl + "getfilters", { params: { theme: this.props.theme.title } });
            } catch (e) {
                console.log(e);
            }
        } catch (error) {
            console.warn(error);
            return Promise.reject(error);
        }
    }

    buildFilterArray = (muniFilter, sectorFilter) => {
        // Build filter array
        const filterArray = [];
        if (muniFilter && sectorFilter) {
            filterArray.push(["muni_id", "IN", muniFilter], "and", ["sector_id", "IN", sectorFilter]);
        } else if (muniFilter) {
            filterArray.push(["muni_id", "IN", muniFilter]);
        } else if (sectorFilter) {
            filterArray.push(["sector_id", "IN", sectorFilter]);
        }
        return filterArray;
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

    setOMLayersVisibility = (layerName, visible = true) => {
        const rootLayer = this.props.layers.find(l => l.type === "wms");
        const { layer, path } = GwUtils.findLayer(rootLayer, layerName);
        if (layer) {
            this.props.changeLayerProperty(rootLayer.uuid, "visibility", visible, path, 'both');
            return true;
        }
        return false;
    };

    addMincutLayers = (result) => {
        if (!result?.body?.data?.mincutArc) {
            return;
        }

        this.removeTempLayers();

        // Arc
        const arc = result.body.data.mincutArc;
        const arcStyle = {
            strokeColor: [255, 206, 128, 1],
            strokeWidth: 6
        };
        const arcFeatures = GwUtils.getGeoJSONFeatures("default", arc, arcStyle);

        const lineFeatures = [].concat(arcFeatures);
        if (!isEmpty(lineFeatures)) {
            this.props.addLayerFeatures({
                id: "temp_lines.geojson",
                name: "temp_lines.geojson",
                title: "Temporal Lines",
                zoomToExtent: true
            }, lineFeatures, true);
        }

        // Init
        const initPoint = result.body.data.mincutInit;
        const initPointStyle = {
            strokeColor: [0, 24, 124, 1],
            strokeWidth: 1,
            circleRadius: 4,
            fillColor: [45, 84, 255, 1]
        };
        const initpointFeatures = GwUtils.getGeoJSONFeatures("default", initPoint, initPointStyle);
        // Node
        const node = result.body.data.mincutNode;
        const nodeStyle = {
            strokeColor: [160, 134, 17, 1],
            strokeWidth: 1,
            circleRadius: 3,
            fillColor: [241, 209, 66, 1]
        };
        const nodeFeatures = GwUtils.getGeoJSONFeatures("default", node, nodeStyle);
        // Connec
        const connec = result.body.data.mincutConnec;
        const connecStyle = {
            strokeColor: [102, 46, 25, 1],
            strokeWidth: 1,
            circleRadius: 3,
            fillColor: [176, 123, 103, 1]
        };
        const connecFeatures = GwUtils.getGeoJSONFeatures("default", connec, connecStyle);
        // Valve proposed
        const valveProposed = result.body.data.mincutProposedValve;
        const valveProposedStyle = {
            strokeColor: [134, 13, 13, 1],
            strokeWidth: 1,
            circleRadius: 6,
            fillColor: [237, 55, 58, 1]
        };
        const valveProposedFeatures = GwUtils.getGeoJSONFeatures("default", valveProposed, valveProposedStyle);
        // Valve not proposed
        const valveNotProposed = result.body.data.mincutNotProposedValve;
        const valveNotProposedStyle = {
            strokeColor: [6, 94, 0, 1],
            strokeWidth: 1,
            circleRadius: 6,
            fillColor: [51, 160, 44, 1]
        };
        const valveNotProposedFeatures = GwUtils.getGeoJSONFeatures("default", valveNotProposed, valveNotProposedStyle);

        const pointFeatures = [].concat(nodeFeatures, connecFeatures, initpointFeatures, valveProposedFeatures, valveNotProposedFeatures);
        if (!isEmpty(pointFeatures)) {
            this.props.addLayerFeatures({
                id: "temp_points.geojson",
                name: "temp_points.geojson",
                title: "Temporal Points",
                zoomToExtent: true
            }, pointFeatures, true);
        }
        this.panToResult(result);
    };
    removeTempLayers = () => {
        this.props.removeLayer("temp_points.geojson");
        this.props.removeLayer("temp_lines.geojson");
        this.props.removeLayer("temp_polygons.geojson");
    };
    onWidgetValueChange = (widget) => {
        let action;
        try {
            action = JSON.parse(widget.property.action);
        } catch (error) {
            action = {};
        }

        // Get request paramas
        const epsg = GwUtils.crsStrToInt(this.props.map.projection);
        const selectorType = action.params.selectorType;
        const tabName = action.params.tabName;
        const id = action.params.id;
        const isAlone = !this.state.isShiftPressed;;
        const disableParent = false; // Use the state to determine if shift is pressed
        const value = action.params.value === 'False';
        const addSchema = "NULL"; // TODO?: allow addSchema
        const params = {
            theme: this.props.theme.title,
            epsg: epsg,
            selectorType: selectorType,
            tabName: tabName,
            id: id,
            isAlone: isAlone,
            disableParent: disableParent,
            value: value,
            addSchema: addSchema,
            ids: this.props.mincutIds
        };

        // Call setselectors
        this.setSelectors(params);
    };
    onWidgetAction = (action) => {
        switch (action.name) {
        default:
            console.warn(`Action \`${action.name}\` cannot be handled.`);
            break;
        }
    };
    makeRequest(hideForm = false) {
        let pendingRequests = false;

        const requestUrl = GwUtils.getServiceUrl("selector");
        if (!isEmpty(requestUrl)) {
            // Get request paramas
            const epsg = GwUtils.crsStrToInt(this.props.map.projection);
            const params = {
                theme: this.props.theme.title,
                epsg: epsg,
                currentTab: "tab_exploitation",
                selectorType: "selector_basic"
            };

            // Send request
            pendingRequests = true;
            this.getSelectors(params, hideForm);
        }
        // Set "Waiting for request..." message
        // this.filteredSelectors = true;
        if (!hideForm) {
            this.setState({ selectorResult: {}, pendingRequests: pendingRequests });
        }
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
                        <GwQtDesignerForm autoResetTab={false} form_xml={result.form_xml} getInitialValues={false} onWidgetAction={this.onWidgetAction}
                            onWidgetValueChange={this.onWidgetValueChange} readOnly={false} useNew />
                    </div>
                );
            }
        }
        if (this.props.selectorResult) {
            return (
                <ResizeableWindow dockable="right" icon="giswater"
                    initialHeight={this.props.initialHeight} initialWidth={this.props.initialWidth}
                    initialX={this.props.initialX} initialY={this.props.initialY} initiallyDocked={this.props.initiallyDocked}
                    key="GwSelector"
                    maximizeable={false} minimizeable={false} onClose={this.onToolClose} scrollable title="GW Selector"
                >
                    {body}
                </ResizeableWindow>
            );
        } else {
            return (
                <SideBar icon="giswater" id="GwSelector" key="GwSelectorNull"
                    onShow={this.onShow} title={LocaleUtils.tr("appmenu.items.GwSelector") || "GW Selector"} >
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
    theme: state.theme.current,
    selectorResult: state.selector.selectorResult,
    mincutIds: state.selector.mincutIds,
    geometry: state.selector.geometry
});

export default connect(selector, {
    addLayerFeatures: addLayerFeatures,
    zoomToExtent: zoomToExtent,
    refreshLayer: refreshLayer,
    removeLayer: removeLayer,
    changeLayerProperty: changeLayerProperty,
    setCurrentTask: setCurrentTask,
    setActiveSelector: setActiveSelector,
    reloadLayersFilters: reloadLayersFilters,
    setFilter: setFilter,
})(GwSelector);
