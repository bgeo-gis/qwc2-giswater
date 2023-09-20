/**
 * Copyright 2018-2021 Sourcepole AG
 * All rights reserved.
 *
 * This source code is licensed under the BSD-style license found in the
 * LICENSE file in the root directory of this source tree.
 */

import React from 'react';
import PropTypes from 'prop-types';
import {connect} from 'react-redux';
import {createSelector} from 'reselect';
import axios from 'axios';
import isEmpty from 'lodash.isempty';
import {setCurrentTask} from 'qwc2/actions/task';
import { LayerRole, refreshLayer } from 'qwc2/actions/layers';
import ConfigUtils from 'qwc2/utils/ConfigUtils';
import CoordinatesUtils from 'qwc2/utils/CoordinatesUtils';
import IdentifyUtils from 'qwc2/utils/IdentifyUtils';
import LocaleUtils from 'qwc2/utils/LocaleUtils';
import MapUtils from 'qwc2/utils/MapUtils';
import CopyButton from 'qwc2/components/widgets/CopyButton';
import Icon from 'qwc2/components/Icon';
import displayCrsSelector from 'qwc2/selectors/displaycrs';
import 'qwc2/plugins/style/MapInfoTooltip.css';
import GwUtils from '../utils/GwUtils';
import { processFinished, processStarted } from 'qwc2/actions/processNotifications';

class GwMapInfoTooltip extends React.Component {
    static propTypes = {
        /** The number of decimal places to display for metric/imperial coordinates. */
        cooPrecision: PropTypes.number,
        /** The number of decimal places to display for degree coordinates. */
        degreeCooPrecision: PropTypes.number,
        displaycrs: PropTypes.string,
        /** The number of decimal places to display for elevation values. */
        elevationPrecision: PropTypes.number,
        enabled: PropTypes.bool,
        includeWGS84: PropTypes.bool,
        layers: PropTypes.array,
        map: PropTypes.object,
        processFinished: PropTypes.func,
        processStarted: PropTypes.func,
        refreshLayer: PropTypes.func,
        setCurrentTask: PropTypes.func,
        theme: PropTypes.object
    };
    static defaultProps = {
        cooPrecision: 0,
        degreeCooPrecision: 4,
        elevationPrecision: 0,
        includeWGS84: true
    };
    state = {
        coordinate: null, elevation: null, extraInfo: null, gwInfoResponse: null
    };
    componentDidUpdate(prevProps) {
        if (!this.props.enabled && this.state.coordinate) {
            this.clear();
            return;
        }
        const newPoint = this.props.map.click;
        if (!newPoint || newPoint.button !== 2) {
            if (this.state.coordinate) {
                this.clear();
            }
        } else {
            const oldPoint = prevProps.map.click;
            if (!oldPoint || oldPoint.pixel[0] !== newPoint.pixel[0] || oldPoint.pixel[1] !== newPoint.pixel[1]) {
                this.setState({coordinate: newPoint.coordinate, elevation: null});
                const serviceParams = {pos: newPoint.coordinate.join(","), crs: this.props.map.projection};
                const elevationService = (ConfigUtils.getConfigProp("elevationServiceUrl") || "").replace(/\/$/, '');
                const elevationPrecision = prevProps.elevationPrecision;
                if (elevationService) {
                    axios.get(elevationService + '/getelevation', {params: serviceParams}).then(response => {
                        this.setState({elevation: Math.round(response.data.elevation * Math.pow(10, elevationPrecision)) / Math.pow(10, elevationPrecision)});
                    }).catch(() => {});
                }
                const mapInfoService = ConfigUtils.getConfigProp("mapInfoService");
                if (mapInfoService) {
                    axios.get(mapInfoService, {params: serviceParams}).then(response => {
                        this.setState({extraInfo: response.data.results});
                    }).catch(() => {});
                }
                const gwInfoService = (GwUtils.getServiceUrl("info") || "");
                if (gwInfoService) {
                    const queryableLayers = IdentifyUtils.getQueryLayers(this.props.layers, this.props.map);
                    const queryLayers = queryableLayers.reduce((acc, layer) => {
                        return acc.concat(layer.queryLayers);
                    }, []);

                    const epsg = parseInt(this.props.map.projection.split(':').slice(-1), 10);
                    const zoomRatio = MapUtils.computeForZoom(this.props.map.scales, this.props.map.zoom);
                    const params = {
                        theme: this.props.theme.title,
                        epsg: epsg,
                        xcoord: newPoint.coordinate[0],
                        ycoord: newPoint.coordinate[1],
                        zoomRatio: zoomRatio,
                        layers: queryLayers.join(',')
                    };
                    axios.get(gwInfoService + 'getlayersfromcoordinates', {params: params}).then(response => {
                        this.setState({gwInfoResponse: response.data});
                    }).catch(() => {});
                    this.setState({gwInfoResponse: null});
                }
            }
        }
    }
    toggleValveState = (data) => {
        const id = data.id;
        const tableName = data.tableName;
        const value = data.value;
        const fields = {closed: value};

        const requestUrl = GwUtils.getServiceUrl("util");
        if (!isEmpty(requestUrl)) {
            const params = {
                theme: this.props.theme.title,
                id: id,
                tableName: tableName,
                fields: JSON.stringify(fields)
            };

            axios.put(requestUrl + "setfields", { ...params }).then(() => {
                // refresh map
                if (this.props.theme.tiled) {
                    this.refreshTiles();
                } else {
                    this.props.refreshLayer(layer => layer.role === LayerRole.THEME);
                }
                // close
                this.clear();
            }).catch((e) => {
                console.log(e);
            });
        }
    };
    refreshTiles = () => {
        const requestUrl = ConfigUtils.getConfigProp("tilingServiceUrl");
        if (isEmpty(requestUrl)) {
            return;
        }

        const params = {
            theme: this.props.theme.title
        };

        const processNotificationId = `tiling_msg-${+new Date()}`;
        this.props.processStarted(processNotificationId, "Updating tiles");
        // Send request
        axios.get(requestUrl + "update", { params: params }).then(response => {
            this.props.processFinished(processNotificationId, true, "Update successful");
            const result = response.data;
            this.props.refreshLayer(layer => layer.role === LayerRole.THEME);
        }).catch((e) => {
            console.log(e);
            this.props.processFinished(processNotificationId, false, "Update failed");
        });
    };
    clear = () => {
        this.setState({coordinate: null, height: null, extraInfo: null, gwInfoResponse: null});
    };
    render() {
        if (!this.state.coordinate) {
            return null;
        }

        const info = [];

        const projections = [this.props.displaycrs];
        if (!projections.includes(this.props.map.projection)) {
            projections.push(this.props.map.projection);
        }
        if (this.props.includeWGS84 && !projections.includes("EPSG:4326")) {
            projections.push("EPSG:4326");
        }
        projections.map(crs => {
            const coo = CoordinatesUtils.reproject(this.state.coordinate, this.props.map.projection, crs);
            const digits = CoordinatesUtils.getUnits(crs) === 'degrees' ? this.props.degreeCooPrecision : this.props.cooPrecision;
            info.push([
                (CoordinatesUtils.getAvailableCRS()[crs] || {label: crs}).label,
                coo.map(x => LocaleUtils.toLocaleFixed(x, digits)).join(", ")
            ]);
        });

        if (this.state.elevation) {
            info.push([
                LocaleUtils.tr("mapinfotooltip.elevation"),
                this.state.elevation + " m"
            ]);
        }

        if (this.state.extraInfo) {
            info.push(...this.state.extraInfo);
        }
        const title = LocaleUtils.tr("mapinfotooltip.title");
        const pixel = MapUtils.getHook(MapUtils.GET_PIXEL_FROM_COORDINATES_HOOK)(this.state.coordinate);
        const style = {
            left: pixel[0] + "px",
            top: pixel[1] + "px"
        };
        const text = info.map(entry => entry.join(": ")).join("\n");
        let routingButtons = null;
        if (ConfigUtils.havePlugin("Routing")) {
            const prec = CoordinatesUtils.getUnits(this.props.displaycrs) === 'degrees' ? 4 : 0;
            const pos = CoordinatesUtils.reproject(this.state.coordinate, this.props.map.projection, this.props.displaycrs);
            const point = {
                text: pos.map(x => x.toFixed(prec)).join(", ") + " (" + this.props.displaycrs + ")",
                pos: [...pos],
                crs: this.props.displaycrs
            };
            routingButtons = (
                <table className="mapinfotooltip-body-routing">
                    <tbody>
                        <tr>
                            <td><b>{LocaleUtils.tr("routing.route")}:</b></td>
                            <td>
                                <button className="button" onClick={() => this.props.setCurrentTask("Routing", null, null, {from: point})}>{LocaleUtils.tr("routing.fromhere")}</button>
                                <button className="button" onClick={() => this.props.setCurrentTask("Routing", null, null, {to: point})}>{LocaleUtils.tr("routing.tohere")}</button>
                                <button className="button" onClick={() => this.props.setCurrentTask("Routing", null, null, {via: point})}>{LocaleUtils.tr("routing.addviapoint")}</button>
                            </td>
                        </tr>
                        <tr>
                            <td><b>{LocaleUtils.tr("routing.reachability")}:</b></td>
                            <td>
                                <button className="button" onClick={() => this.props.setCurrentTask("Routing", null, null, {isocenter: point})}>{LocaleUtils.tr("routing.isocenter")}</button>
                                <button className="button" onClick={() => this.props.setCurrentTask("Routing", null, null, {isoextracenter: point})}>{LocaleUtils.tr("routing.isoextracenter")}</button>
                            </td>
                        </tr>
                    </tbody>
                </table>
            );
        }
        let infoButtons = null;
        const gwInfoResponse = this.state.gwInfoResponse;
        if (ConfigUtils.havePlugin("GwInfo") && gwInfoResponse) {
            let valveButton = null;
            if (gwInfoResponse.body?.data?.valve) {
                valveButton = (
                    <td>
                        <button className="button" onClick={() => this.toggleValveState(gwInfoResponse.body.data.valve)}>{gwInfoResponse.body.data.valve.text}</button>
                    </td>
                );
            }
            infoButtons = (
                <table className="mapinfotooltip-body-gwinfo">
                    <tbody>
                        <tr>
                            {valveButton}
                        </tr>
                    </tbody>
                </table>
            );
        }
        return (
            <div className="mapinfotooltip" style={style}>
                <div className="mapinfotooltip-window">
                    <div className="mapinfotooltip-titlebar">
                        <span className="mapinfotooltip-title">{title}</span>
                        <CopyButton buttonClass="mapinfotooltip-button" text={text} />
                        <Icon className="mapinfotooltip-button" icon="remove" onClick={this.clear}/>
                    </div>
                    <div className="mapinfotooltip-body">
                        <table>
                            <tbody>
                                {info.map((entry, index) => (
                                    <tr key={"row" + index}>
                                        <td><b>{entry[0]}:</b></td>
                                        <td>{entry[1]}</td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                        {routingButtons}
                        {infoButtons}
                    </div>
                </div>
            </div>
        );
    }
}

const selector = createSelector([state => state, displayCrsSelector], (state, displaycrs) => ({
    enabled: state.identify.tool !== null,
    map: state.map,
    displaycrs: displaycrs,
    theme: state.theme.current,
    layers: state.layers.flat
}));

export default connect(selector, {
    setCurrentTask: setCurrentTask,
    refreshLayer: refreshLayer,
    processStarted: processStarted,
    processFinished: processFinished
})(GwMapInfoTooltip);
