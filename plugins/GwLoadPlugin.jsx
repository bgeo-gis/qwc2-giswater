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
import GwUtils from '../utils/GwUtils';
import { processFinished, processStarted } from 'qwc2/actions/processNotifications';
import { LayerRole, changeLayerProperty, refreshLayer } from 'qwc2/actions/layers';
import { setProjectData } from '../actions/project';
import ConfigUtils from 'qwc2/utils/ConfigUtils';


class GwLoadPlugin extends React.Component {
    static propTypes = {
        currentTask: PropTypes.string,
        layers: PropTypes.array,
        map: PropTypes.object,
        processFinished: PropTypes.func,
        processStarted: PropTypes.func,
        changeLayerProperty: PropTypes.func,
        refreshLayer: PropTypes.func,
        setProjectData: PropTypes.func,
        theme: PropTypes.object
    };

    state = {
        pendingRequests: false
    };

    constructor(props) {
        super(props);
    }

    componentDidUpdate(prevProps) {
        if (prevProps.theme !== this.props.theme) {
            this.makeRequest();
            const mapproxy_auth_cfg = ConfigUtils.getConfigProp("mapproxy_auth");

            console.log("Layers: ", this.props.layers);

            // Update each layer individually using changeLayerProperty
            this.props.layers.forEach((layer) => {
                if (layer.role === LayerRole.THEME) {
                    const externalLayerMap = Object.entries(layer.externalLayerMap).reduce((acc, [layerName, externalLayer]) => {
                        let url = externalLayer['url'];
                        if (mapproxy_auth_cfg) {
                            url = url.replace(mapproxy_auth_cfg['source'], mapproxy_auth_cfg['proxy']);
                        }

                        acc[layerName] = {
                            ...externalLayer,
                            queryLayers: [layerName],
                            url: url
                        };
                        return acc;
                    }, {});

                    // Update the layer's externalLayerMap property
                    this.props.changeLayerProperty(layer.id, 'externalLayerMap', externalLayerMap);
                }
            });

            this.props.refreshLayer(layer => layer.role === LayerRole.THEME);
        }
    }

    makeRequest() {
        const requestUrl = GwUtils.getServiceUrl("util");
        if (!isEmpty(requestUrl)) {
            // Get request paramas
            const epsg = GwUtils.crsStrToInt(this.props.map.projection);
            const params = {
                theme: this.props.theme.title,
                epsg: epsg
            };

            axios.post(requestUrl + "setinitproject", { ...params }).then(response => {
                const result = response.data;
                console.log("Load plugin: ", result);
                if (result.status !== 'Accepted') {
                    this.props.processStarted("loadplugin_msg", `Loading plugin`);
                    this.props.processFinished("loadplugin_msg", false, `${result.message?.text}`, 4000);
                    return;

                }
                this.props.setProjectData(result.tiled);
                this.setState({ pendingRequests: false });
            }).catch((e) => {
                console.log(e);
                this.setState({ pendingRequests: false });
                this.props.processStarted("loadplugin_err", `Loading plugin`);
                this.props.processFinished("loadplugin_err", false, `Could not execute the load plugin ${e}`, false);

            });
        }

    }

    render() {
        return null;
    }
}

const loadplugin = (state) => ({
    currentTask: state.task.id,
    layers: state.layers.flat,
    map: state.map,
    theme: state.theme.current
});

export default connect(loadplugin, {
    processFinished: processFinished,
    processStarted: processStarted,
    changeLayerProperty: changeLayerProperty,
    refreshLayer: refreshLayer,
    setProjectData: setProjectData
})(GwLoadPlugin);
