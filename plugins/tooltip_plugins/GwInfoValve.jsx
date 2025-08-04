/**
 * Copyright © 2025 by BGEO. All rights reserved.
 * The program is free software: you can redistribute it and/or modify it under the terms of the GNU
 * General Public License as published by the Free Software Foundation, either version 3 of the License,
 * or (at your option) any later version
 */
import React from 'react';
import PropTypes from 'prop-types';
import { connect } from 'react-redux';
import { createSelector } from 'reselect';
import isEmpty from 'lodash.isempty';
import { setCurrentTask } from 'qwc2/actions/task';
import { LayerRole, refreshLayer, removeLayer, addLayerFeatures } from 'qwc2/actions/layers';
import ConfigUtils from 'qwc2/utils/ConfigUtils';
import GwUtils from '../../utils/GwUtils';
import { processFinished, processStarted } from 'qwc2/actions/processNotifications';

import IdentifyUtils from 'qwc2/utils/IdentifyUtils';
import axios from 'axios';
import MapUtils from 'qwc2/utils/MapUtils';
import Icon from 'qwc2/components/Icon';
import VectorLayerUtils from 'qwc2/utils/VectorLayerUtils';

import { setIdentifyResult } from '../../actions/info';

import './style/GwInfoValve.css';

class GwInfoValve extends React.Component {
    static propTypes = {
        addLayerFeatures: PropTypes.func,
        closePopup: PropTypes.func,
        enabled: PropTypes.bool,
        layers: PropTypes.array,
        map: PropTypes.object,
        point: PropTypes.object,
        processFinished: PropTypes.func,
        processStarted: PropTypes.func,
        refreshLayer: PropTypes.func,
        removeLayer: PropTypes.func,
        setCurrentTask: PropTypes.func,
        setIdentifyResult: PropTypes.func,
        theme: PropTypes.object
    };
    static defaultProps = {
        standardLinesStyle: {
            strokeColor: {
                trace: [235, 167, 48, 1],
                exit: [235, 74, 117, 1]
            },
            strokeWidth: 6,
            strokeDash: [1],
            fillColor: [255, 255, 255, 0.33],
            textFill: "blue",
            textStroke: "white",
            textFont: "20pt sans-serif"
        },
        standardPointsStyle: {
            strokeColor: {
                trace: [235, 167, 48, 1],
                exit: [235, 74, 117, 1]
            },
            strokeWidth: 2,
            strokeDash: [4],
            fillColor: [191, 156, 40, 0.33],
            textFill: "blue",
            textStroke: "white",
            textFont: "20pt sans-serif"
        }
    };
    state = {
        elevation: null,
        extraInfo: null,
        gwInfoResponse: null,
        loadedComponents: [],
        infoButtons: null,
        loading: true
    };
    componentDidMount() {
        this.setState({ point: this.props.point });
        const point = this.props.point;
        this.loadValveResult(point);
    }
    componentDidUpdate(prevProps) {
        if (prevProps.point !== this.props.point) {
            this.clear();
            this.loadValveResult(this.props.point);
        }
    }
    componentWillUnmount() {
        this.clear();
    }
    loadValveResult = (point) => {
        let gwInfoResponse = null;
        const gwInfoService = (GwUtils.getServiceUrl("info") || "");
        const queryableLayers = IdentifyUtils.getQueryLayers(this.props.layers, this.props.map);
        const queryLayers = queryableLayers.reduce((acc, layer) => {
            return acc.concat(layer.queryLayers);
        }, []);
        const epsg = parseInt(this.props.map.projection.split(':').slice(-1), 10);
        const zoomRatio = MapUtils.computeForZoom(this.props.map.scales, this.props.map.zoom);
        const params = {
            theme: this.props.theme.title,
            epsg: epsg,
            xcoord: point.coordinate[0],
            ycoord: point.coordinate[1],
            zoomRatio: zoomRatio,
            layers: queryLayers.join(',')
        };
        axios.get(gwInfoService + 'getlayersfromcoordinates', { params: params }).then(response => {
            gwInfoResponse = response.data;
            if (gwInfoResponse) {
                this.setState({ gwInfoResponse: gwInfoResponse, loading: false });
            }
        }).catch((e) => {
            console.warn(e);
        });
    };
    toggleValveState = (data) => {
        const id = data.id;
        const tableName = data.tableName;
        const value = data.value;
        const fields = { closed: value };

        const requestUrl = GwUtils.getServiceUrl("util");
        if (!isEmpty(requestUrl)) {
            const params = {
                theme: this.props.theme.title,
                id: id,
                tableName: tableName,
                fields: JSON.stringify(fields)
            };
            this.props.processStarted("Change valve state", "Updating valve");
            axios.put(requestUrl + "setfields", { ...params }).then(response => {
                const result = response.data;

                if (result.status !== "Accepted") {
                    this.props.processFinished("Change valve state", false, `Update failed: ${result.message.text}`);
                    return;
                }
                // refresh map
                if (this.props.tiled) {
                    console.log("VALVE ID: ", id);
                    this.refreshTiles(id);
                } else {
                    this.props.refreshLayer(layer => layer.role === LayerRole.THEME);
                }
                this.props.processFinished("Change valve state", true, "Update successful");
                // close
                this.clear();
                this.props.closePopup();
            }).catch((e) => {
                console.log(e);
                this.props.processFinished("Change valve state", false, `Update failed: ${e}`);
            });
        }
    };
    refreshTiles = (id) => {
        const requestUrl = ConfigUtils.getConfigProp("tilingServiceUrl");
        if (isEmpty(requestUrl)) {
            return;
        }

        const params = {
            theme: this.props.theme.title,
            valveId: id
        };

        const processNotificationId = `tiling_msg-${+new Date()}`;
        this.props.processStarted(processNotificationId, "Updating tiles");
        // Send request
        axios.get(requestUrl + "seed/feature", { params: params }).then(response => {
            this.props.processFinished(processNotificationId, true, "Update successful");
            this.props.refreshLayer(layer => layer.role === LayerRole.THEME);
        }).catch((e) => {
            console.log(e);
            this.props.processFinished(processNotificationId, false, "Update failed");
        });
    };
    clear = () => {
        this.props.removeLayer("identifyslection");
        this.setState({ point: null, height: null, extraInfo: null, gwInfoResponse: null, loading: true });
    };
    showInfo = (selection, table) => {
        const requestUrl = GwUtils.getServiceUrl("info");
        if (!isEmpty(requestUrl)) {
            const params = {
                theme: this.props.theme.title,
                id: (selection.id).toString(),
                tableName: table
            };
            axios.get(requestUrl + "fromid", { params: params }).then((response) => {
                const result = response.data;
                this.props.setIdentifyResult(result);
                // this.setState({ identifyResult: result });
            }).catch((e) => {
                console.log(e);
            });
        }
    };
    highLightFeature = (selection) => {
        this.props.removeLayer("identifyslection");
        const layer = {
            id: "identifyslection",
            role: LayerRole.SELECTION
        };
        const crs = this.props.map.projection;
        const geometry = VectorLayerUtils.wktToGeoJSON(selection.geometry, crs, crs);
        const feature = {
            id: selection.id,
            geometry: geometry.geometry
        };
        this.props.addLayerFeatures(layer, [feature], true);
    };
    highLightMultipleFeatures = (selection) => {
        const features = [];
        this.props.removeLayer("identifyslection");
        const layer = {
            id: "identifyslection",
            role: LayerRole.SELECTION
        };
        const crs = this.props.map.projection;
        selection.map((values) => (
            (values.ids).map((subValues) => {
                const geometry = VectorLayerUtils.wktToGeoJSON(subValues.geometry, crs, crs);
                const feature = {
                    id: selection.id,
                    geometry: geometry.geometry
                };
                features.push(feature);
            })
        ));
        this.props.addLayerFeatures(layer, features, true);
    };
    getLastWordFromLayer = (inputString) => {
        const words = inputString.split('_');
        const lastWord = words[words.length - 1];
        const capitalCaseLastWord = lastWord.charAt(0).toUpperCase() + lastWord.slice(1).toLowerCase();
        return capitalCaseLastWord;
    };
    render() {
        const { loading, gwInfoResponse } = this.state;
        if (loading) {
            return null;
        }

        let infoButtons = null;
        if (gwInfoResponse && !isEmpty(gwInfoResponse.body?.data?.layersNames)) {
            let valveButton = null;
            let values = null;
            if (gwInfoResponse.body?.data?.valve) {
                valveButton = (
                    <div className='valve-toggle'>
                        <button className="button" onClick={() => this.toggleValveState(gwInfoResponse.body.data.valve)}>{gwInfoResponse.body.data.valve.text}</button>
                    </div>
                );
            }
            if (gwInfoResponse.body?.data?.layersNames) {
                const layernames = gwInfoResponse.body?.data?.layersNames;
                values = (
                    <div className="hover-dropdown">
                        <button>Features</button>
                        <div className="dropdown-content">
                            {layernames.map((vals, i) => (
                                <div className="hover-dropdown-item" key={i}>
                                    <span className="first-item">{this.getLastWordFromLayer(vals.layerName)}</span>
                                    <Icon className="item-icon" icon="chevron-right" />
                                    <div className="dropdown-content">
                                        {(vals.ids).map((subValues, j) => (
                                            <span key={j} onClick={() => this.showInfo(subValues, vals.layerName)} onMouseEnter={() => this.highLightFeature(subValues)}>{subValues.label}</span>
                                        ))}
                                    </div>
                                </div>
                            ))}
                            <hr />
                            <div className="hover-dropdown-item" onMouseEnter={() => this.highLightMultipleFeatures(layernames)}>
                                Identify All ({layernames.reduce((partialSum, component) => partialSum + (component.ids).length, 0)})
                            </div>
                        </div>
                    </div>
                );
            }
            infoButtons = (
                <div className="mapinfotooltip-body-gwinfo">
                    {values}
                    {valveButton}
                </div>
            );
        }

        return infoButtons;

    }
}

export default connect((state) => ({
    enabled: state.task.identifyEnabled,
    map: state.map,
    theme: state.theme.current,
    layers: state.layers.flat,
    tiled: state.project.tiled,
}), {
    setCurrentTask: setCurrentTask,
    refreshLayer: refreshLayer,
    processStarted: processStarted,
    processFinished: processFinished,
    removeLayer: removeLayer,
    addLayerFeatures: addLayerFeatures,
    setIdentifyResult: setIdentifyResult
})(GwInfoValve);
