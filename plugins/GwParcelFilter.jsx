/**
 * Copyright © 2024 by BGEO. All rights reserved.
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
import { LayerRole, refreshLayer, setFilter} from 'qwc2/actions/layers';
import { zoomToExtent } from 'qwc2/actions/map';
import { setCurrentTask } from 'qwc2/actions/task';
import { processFinished, processStarted } from 'qwc2/actions/processNotifications';


import GwQtDesignerForm from '../components/GwQtDesignerForm';
import GwUtils from '../utils/GwUtils';

import './style/GwParcelFilter.css';

class GwParcelFilter extends React.Component {
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
        setFilter: PropTypes.func,
        theme: PropTypes.object,
        title: PropTypes.string
    };
    static defaultProps = {
        replaceImageUrls: true,
        initialWidth: 385,
        initialHeight: 190,
        initialX: 0,
        initialY: 0,
        title: 'Parcel Filter'
    };
    state = {
        parcelFilterResult: null,
        pendingRequests: false,
        widgetValues: {
            "pool_from": {
                "value": ""
            },
            "pool_to": {
                "value": ""
            },
            "garden_from": {
                "value": ""
            },
            "garden_to": {
                "value": ""
            }
        }
    };

    componentDidUpdate(prevProps) {
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
            }
        }

        // Manage open tool
        if (prevProps.currentTask !== this.props.currentTask && this.props.currentTask === "GwParcelFilter") {
            this.getDialog();
        }
        // Manage close tool
        if (prevProps.currentTask !== this.props.currentTask && this.props.currentTask === null) {
            this.onClose();
        }
    }

    getDialog = () => {
        let pendingRequests = false;

        const requestUrl = GwUtils.getServiceUrl("parcelfilter");
        if (!isEmpty(requestUrl)) {
            // Send request
            pendingRequests = true;
            axios.get(requestUrl + "dialog", { params: {} }).then(response => {
                const result = response.data;
                this.setState({ parcelFilterResult: result, pendingRequests: false });
            }).catch((e) => {
                console.log(e);
                this.setState({ pendingRequests: false });
            });
        }
        // Set "Waiting for request..." message
        this.setState({ parcelFilterResult: {}, pendingRequests: pendingRequests });
    };

    onClose = () => {
        this.setState({ parcelFilterResult: null, pendingRequests: false });
        this.props.setCurrentTask(null);
    };
    onToolClose = () => {
        this.setState({ parcelFilterResult: null, pendingRequests: false });
        this.props.setCurrentTask(null);
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

    updateField = (widget, ev) => {
        this.setState((state) => ({ widgetValues: { ...state.widgetValues, [widget.name]: { value: ev } } }));
    };

    onWidgetAction = (action) => {
        switch (action.functionName) {
        case "accept": {
            const queryableLayers = this.getQueryableLayers();
            if (!isEmpty(queryableLayers)) {
                // Get filter values from state
                const poolCheckbox = this.state.widgetValues.pool_checkbox.value;
                const gardenFrom = this.state.widgetValues.garden_from.value;
                const gardenTo = this.state.widgetValues.garden_to.value;
                this.filterLayers(poolCheckbox, gardenFrom, gardenTo)
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

    filterLayers = (hasPool, gardenFrom, gardenTo) => {
        const queryableLayers = this.getQueryableLayers();
        if (!isEmpty(queryableLayers)) {
            let filter = {};
            let layerToFilter="LtsHabDia";
    
            let filterPool = '';
            if (hasPool) {
                filterPool = ["m2piscina", ">", "0"]; 
            }
            let filterGarden = this.buildFilterArray("m2garden", gardenFrom, gardenTo); 

            //Add expr to filter
            if (filterPool.length > 0) { 
                filter[layerToFilter]= [filterPool];
                if(filterGarden.length > 0){
                    filter[layerToFilter].push("and",filterGarden);
                }
            }else if (filterGarden.length > 0){
                filter[layerToFilter]= [filterGarden];
            }
            //Set filter
            this.props.setFilter(filter);
            // Refresh map
            this.props.refreshLayer(layer => layer.role === LayerRole.THEME);
        }
    }
    
    buildFilterArray = (fieldName, from, to) => {
        let filterArray = [];
    
        if (from !== '' && to !== '') {
            filterArray.push([fieldName, ">=", from], "and", [fieldName, "<=", to]);
        } else if (from !== '') {
            filterArray.push([fieldName, ">=", from]);
        } else if (to !== '') {
            filterArray.push([fieldName, "<=", to]);
        }
    
        return filterArray;
    }

    render() {
        let parcelWindow=null;
          // Dialog
        if (this.state.pendingRequests === true || this.state.parcelFilterResult !== null) {
            let body = null;
            if (isEmpty(this.state.parcelFilterResult)) {
                if (this.state.pendingRequests === true) {
                    body = (<div className="parcel-filter-body" role="body"><span className="parcel-filter-body-message">Querying...</span></div>); // TODO: TRANSLATION
                } else {
                    body = (<div className="parcel-filter-body" role="body"><span className="parcel-filter-body-message">No result</span></div>); // TODO: TRANSLATION
                }
            } else {
                const result = this.state.parcelFilterResult;
                if (!isEmpty(result.form_xml)) {
                    body = (
                        <div className="parcel-filter-body" role="body">
                            <GwQtDesignerForm onWidgetAction={this.onWidgetAction} form_xml={result.form_xml} readOnly={false} updateField={this.updateField} widgetValues={this.state.widgetValues} />
                        </div>
                    );
                }
            }

            parcelWindow = (
                <ResizeableWindow 
                    dockable={false} icon="parcel-filter" id="GwParcelFilter" 
                    minHeight={this.props.initialHeight} minWidth={this.props.initialWidth}
                    initialHeight={this.props.initialHeight} initialWidth={this.props.initialWidth}
                    initialX={this.props.initialX} initialY={this.props.initialY}
                    key="GwParcelFilterWindow" minimizeable={false} maximizeabe={false}
                    onClose={this.onToolClose} onShow={this.onShow} title={this.props.title}
                >
                    {body}
                </ResizeableWindow>
            );
        }

        return [parcelWindow];
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
    setFilter: setFilter,
    processFinished: processFinished,
    processStarted: processStarted
})(GwParcelFilter);
