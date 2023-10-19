/**
 * Copyright © 2023 by BGEO. All rights reserved.
 * The program is free software: you can redistribute it and/or modify it under the terms of the GNU
 * General Public License as published by the Free Software Foundation, either version 3 of the License,
 * or (at your option) any later version
 */

import React from 'react';
import axios from 'axios';
import PropTypes from 'prop-types';
import {connect} from 'react-redux';
import isEmpty from 'lodash.isempty';

import Chartist from 'chartist';
import ChartistComponent from 'react-chartist';
import ChartistAxisTitle from 'chartist-plugin-axistitle';


import ChartistPointLabels from 'chartist-plugin-pointlabels';
import ChartistZoom from 'chartist-plugin-zoom';

import {addMarker, removeMarker} from 'qwc2/actions/layers';
import {changeProfileState} from '../actions/profile';
import Icon from 'qwc2/components/Icon';
import ConfigUtils from 'qwc2/utils/ConfigUtils';
import LocaleUtils from 'qwc2/utils/LocaleUtils';
import { processFinished, processStarted } from 'qwc2/actions/processNotifications';

import ResizeableWindow from 'qwc2/components/ResizeableWindow';
import GwQtDesignerForm from '../components/GwQtDesignerForm';
import GwUtils from '../utils/GwUtils';


import './style/GwProfileGraph.css';
import { Tune } from '@mui/icons-material';

import MeasureUtils from 'qwc2/utils/MeasureUtils';

let resetZoom = null;

class GwProfileGraph extends React.Component {
    nodeIds = [];
    terrainLabels = [];
    static propTypes = {
        addMarker: PropTypes.func,
        changeProfileState: PropTypes.func,
        heighProfilePrecision: PropTypes.number,
        height: PropTypes.number,
        processFinished: PropTypes.func,
        processStarted: PropTypes.func,
        profile: PropTypes.object,
        projection: PropTypes.string,
        removeMarker: PropTypes.func,
        samples: PropTypes.number
    };
    static defaultProps = {
        samples: 500,
        heighProfilePrecision: 0,
        height: 400
    };
    constructor(props) {
        super(props);
        this.tooltip = null;
        this.marker = null;
        this.plot = null;
        // this.queryElevations(props.profile.coordinates, props.profile.length, props.projection);
    }
    state = {
        profilePickerResult: null,
        getProfilesResult: null,
        pendingRequestsDialog: false,
        pendingRequests: false,
        dockerLoaded: false,
        widget_values: {},
        showTerrain: true,
        showTrueTerrain: false,
        width: window.innerWidth,
        data: [],
        isGraphLoading: true,
        terrainMarks: [],
        fullData: null,
        options: null,
        listeners: null,
        terrain: null,
        trueTerrain: null,
        zoomAxisX: null
    };

    componentDidMount() {
        window.addEventListener('resize', this.handleResize);
    }

    componentWillUnmount() {
        window.removeEventListener('resize', this.handleResize);
        this.setState({isGraphLoading: false});
    }

    handleResize = () => {
        this.setState({width: window.innerWidth});
    };

    componentDidUpdate(prevProps) {
        if (this.props.profile.coordinates !== prevProps.profile.coordinates) {
            if (this.props.profile.profiling === true && !isEmpty(this.props.profile.coordinates) ) {
                // Generate profile
                this.queryElevations(this.props.profile.coordinates, this.props.profile.length, this.props.projection);
            } else if (!isEmpty(this.state.data)) {
                this.setState({data: [], pickPositionCallback: null, isGraphLoading: true, terrainMarks: []});
            }
        }
    }

    /**
     * Use elevationService to know the height of the terrain
     * @param {*} coordinates Array of coordinates of each node
     * @param {*} distances Distance between each node
     * @param {*} projection Projection of the map to calculate hheight
     */
    queryElevations(coordinates, distances, projection) {
        const serviceUrl = (ConfigUtils.getConfigProp("elevationServiceUrl") || "").replace(/\/$/, '');
        if (serviceUrl) {
            // this.props.processStarted("profile_msg", "Calculating Profile (2/2)...");
            // this.setState({ isloading: true });
            axios.post(serviceUrl + '/getheightprofile', {coordinates, distances, projection, samples: this.props.samples}).then(response => {
                // this.props.processFinished("profile_msg", true, "Success!");
                // this.setState({data: response.data.elevations, isGraphLoading: false});

                this.setState({data: response.data.elevations, isGraphLoading: false, ...this.getAllValuesForGraph(response.data.elevations)});
                this.props.changeProfileState({...this.props.profile, pickPositionCallback: this.pickPositionCallback});
            }).catch(e => {
                // this.props.processFinished("profile_msg", false, `Failed to get profile: ${e}`);
                // this.setState({ isloading: false });
                console.error("Query failed: " + e);
            });
        }
    }

    getAllValuesForGraph = (dataElevations) => {
        // Get text for ToolTip
        const distanceStr = LocaleUtils.tr("heightprofile.distance");
        const heightStr = LocaleUtils.tr("heightprofile.height");
        const aslStr = LocaleUtils.tr("heightprofile.asl");

        // Get all variables passed to profile on GwProfilePicker
        const jsonData = this.props.profile.feature.body.data;
        const nodes = jsonData.node;
        const arcs = jsonData.arc;
        const totLength = (nodes.slice(-1))[0].total_distance + 1;
        const trueTerrain = dataElevations.map((elev, index) => ({
            x: index * totLength / this.props.samples,
            y: elev
        }));
        const terrain = [];
        for (let n = 1; n < nodes.length; n++) {
            const n0 = nodes[n - 1];
            const n1 = nodes[n];
            const i0 = Math.floor((n0.total_distance / totLength) * this.props.samples);
            const i1 = Math.ceil((n1.total_distance / totLength) * this.props.samples);
            const delta0 = dataElevations[i0] - n0.top_elev;
            const delta1 = dataElevations[i1 - 1] - n1.top_elev;
            for (let i = i0; i < i1; i++) {
                const localX = (i - i0) / (i1 - i0);
                const delta = delta0 * (1 - localX) + delta1 * localX;
                terrain.push({
                    x: i * totLength / this.props.samples,
                    y: dataElevations[i] - delta
                });
            }
        }
        const terrainMarks = [];

        const nodeXCoordinates = [];
        for (let i = 0; i < nodes.length; i++) {
            // Get info of node
            const node = nodes[i];
            const x = node.total_distance;

            nodeXCoordinates.push(x);
        }

        const data =  jsonData.line.features;
        const sortedArcIds = jsonData.arc.map(item => item.arc_id);
        const callbackCoordinates = [];
        let index = 0;
        for (const arc_id of sortedArcIds) {
            const matchingCoordinates = data.find(item => item.properties.arc_id === arc_id);

            if (matchingCoordinates) {
                const coordinates = matchingCoordinates.geometry.coordinates;
                const processedCoordinates =  index !== 0 ? coordinates.slice(1) : coordinates;
                callbackCoordinates.push(...processedCoordinates);
            }
            index++;
        }

        this.terrainLabels = [];
        for (let i = 0; i < jsonData.terrain.length; i++) {
            const localX = jsonData.terrain[i].total_x / totLength;
            const terrainIndex = Math.floor(localX * (this.props.samples - 1));
            terrainMarks.push({x: jsonData.terrain[i].total_x, y: terrain[terrainIndex].y});
            this.terrainLabels.push(JSON.parse(jsonData.terrain[i].label_n1));
        }

        let minHeight = Math.min(...nodes.map(node => node.elev));
        minHeight = Math.floor(minHeight);
        const maxHeight = Math.max(...nodes.map(node => node.top_elev)) + 1.5;

        // Generates an array to draw a cross on each node location
        const nodesCross = [];
        for (let i = 0; i < terrainMarks.length; i++) {
            nodesCross.push(
                {x: terrainMarks[i].x, y: terrainMarks[i].y + 0.3},
                {x: terrainMarks[i].x, y: minHeight - 2  },
                // {x: terrainMarks[i].x, y: terrainMarks[i].y - 0.3},
                {x: null, y: null},
            );
        }

        const nodesHover = [];
        for (let i = 0; i < terrainMarks.length; i++) {
            nodesHover.push(
                {x: terrainMarks[i].x, y: maxHeight},
                {x: terrainMarks[i].x, y: minHeight - 12},
                // {x: terrainMarks[i].x, y: terrainMarks[i].y - 0.3},
                {x: null, y: null},
            );
        }

        const [nodesTopCoords, nodesBottomCoords] = this.getNodeSequences(jsonData);

        // Combined data and options
        let series = {
            topLine: {
                data: nodesTopCoords,
                className: 'ct-node-pipes',
                options: {
                    showArea: false,
                    showPoint: false,
                    lineSmooth: false
                }
            },
            bottomLine: {
                data: nodesBottomCoords,
                className: 'ct-node-pipes',
                options: {
                    showArea: false,
                    showPoint: false,
                    lineSmooth: false
                }
            },
            terrainMarks: {
                data: terrainMarks,
                className: 'ct-terrain-marks',
                options: {
                    showPoint: true,
                    showLine: false
                },
                // eslint-disable-next-line
                labelFunc: (x) => {
                    for (const label of this.terrainLabels) {
                        if (x === label.total_distance) {
                            return label.code.toString();
                        }
                    }
                    return null;
                }
            },
            nodesCross: {
                data: nodesCross,
                borderDash: [10, 5],
                className: 'ct-nodes-cross',
                options: {
                    showPoint: false,
                    lineSmooth: false
                }
            }
        };
        /*
        if (this.state.showTerrain) {
            series.terrain = {
                data: terrain,
                className: 'ct-terrain-line',
                options: {
                    showArea: false,
                    showPoint: false,
                    lineSmooth: true
                }
            };
        }

        if (this.state.showTrueTerrain) {
            series.trueTerrain = {
                data: trueTerrain,
                className: 'ct-true-terrain',
                options: {
                    showArea: false,
                    showPoint: false,
                    lineSmooth: false
                }
            };
        }
        */
        const maxHeightSupported = 13;

        if (maxHeight - minHeight < maxHeightSupported) {
            let currentHeight = 0.1;
            const guitarSize = 12;
            const spaceBetweenGuitarLines = 2.5;
            const labelBottomMargin = spaceBetweenGuitarLines * 0.2;
            const lineLateralOffset = 1;

            minHeight = minHeight - guitarSize;
            const guitarLines = [];
            let currLinePosition = minHeight + currentHeight;
            let labelPosition = minHeight + currentHeight + labelBottomMargin;

            // elev
            const elevGuitarLabels = nodeXCoordinates.map((entry) => ({
                x: entry,
                y: labelPosition
            }));
            guitarLines.push(...[
                {x: nodeXCoordinates[0] - lineLateralOffset, y: currLinePosition},
                {x: nodeXCoordinates[nodeXCoordinates.length - 1] + lineLateralOffset, y: currLinePosition},
                {x: null, y: null}
            ]);
            currentHeight = currentHeight + spaceBetweenGuitarLines;

            // ymax
            currLinePosition = minHeight + currentHeight;
            labelPosition = minHeight + currentHeight + labelBottomMargin;
            const yMaxGuitarLabels = nodeXCoordinates.map((entry) => ({
                x: entry,
                y: labelPosition
            }));
            guitarLines.push(...[
                {x: nodeXCoordinates[0] - lineLateralOffset, y: currLinePosition},
                {x: nodeXCoordinates[nodeXCoordinates.length - 1] + lineLateralOffset, y: currLinePosition},
                {x: null, y: null}
            ]);
            currentHeight = currentHeight + spaceBetweenGuitarLines;

            // topelev
            currLinePosition = minHeight + currentHeight;
            labelPosition = minHeight + currentHeight + labelBottomMargin;
            const topElevGuitarLabels = nodeXCoordinates.map((entry) => ({
                x: entry,
                y: labelPosition
            }));
            guitarLines.push(...[
                {x: nodeXCoordinates[0] - lineLateralOffset, y: currLinePosition},
                {x: nodeXCoordinates[nodeXCoordinates.length - 1] + lineLateralOffset, y: currLinePosition},
                {x: null, y: null}
            ]);
            currentHeight = currentHeight + spaceBetweenGuitarLines;

            // catalog
            currLinePosition = minHeight + currentHeight;
            labelPosition = minHeight + currentHeight + labelBottomMargin;
            const catalogGuitarArea = [
                {x: nodeXCoordinates[0] - lineLateralOffset, y: currLinePosition + spaceBetweenGuitarLines},
                {x: nodeXCoordinates[nodeXCoordinates.length - 1] + lineLateralOffset, y: currLinePosition + spaceBetweenGuitarLines}
            ];
            const catalogGuitarLabels = arcs.map((arc, i) => ({
                x: (nodes[i].total_distance + nodes[i + 1].total_distance) / 2,
                y: labelPosition
            }));
            const catalogDivisorGuitarLine = nodes.reduce((res, node) => {
                return res.concat([
                    { x: node.total_distance, y: currLinePosition },
                    { x: node.total_distance, y: currLinePosition + spaceBetweenGuitarLines },
                    { x: null, y: null }
                ]);
            }, []);
            guitarLines.push(...[
                {x: nodeXCoordinates[0] - lineLateralOffset, y: currLinePosition},
                {x: nodeXCoordinates[nodeXCoordinates.length - 1] + lineLateralOffset, y: currLinePosition},
                {x: null, y: null}
            ]);

            series = {
                ...series,
                guitar: {
                    data: guitarLines,
                    className: 'ct-guitar-line'
                },
                catalogGuitarArea: {
                    data: catalogGuitarArea,
                    className: 'ct-guitar-area',
                    options: {
                        showArea: true,
                        showPoint: false
                    }
                },
                catalogDivisorGuitarLine: {
                    data: catalogDivisorGuitarLine,
                    className: 'ct-guitar-line',
                    options: {
                        showArea: false,
                        showPoint: false,
                        showLine: true,
                        lineSmooth: false
                    }
                },
                catalogGuitarLabels: {
                    data: catalogGuitarLabels,
                    className: 'ct-guitar-label',
                    options: {
                        showLine: false,
                        showPoint: true
                    },
                    labelFunc: (x) => {
                        for (let i = 0; i < arcs.length; i++) {
                            const firstNodeX = nodes[i].total_distance;
                            const secondNodeX = nodes[i + 1].total_distance;
                            if ((firstNodeX + secondNodeX) / 2 === x) {
                                const text = JSON.parse(arcs[i].descript);
                                return text.catalog + " " + text.dimensions.toString();
                            }
                        }
                        return null;
                    }
                },
                topElevGuitarLabels: {
                    data: topElevGuitarLabels,
                    className: 'ct-guitar-label',
                    options: {
                        showLine: false,
                        showPoint: true
                    },
                    labelFunc: (x) => {
                        for (const label of this.terrainLabels) {
                            if (x === label.total_distance) {
                                return label.top_elev.toString();
                            }
                        }
                        return null;
                    }
                },
                yMaxGuitarLabels: {
                    data: yMaxGuitarLabels,
                    className: 'ct-guitar-label',
                    options: {
                        showLine: false,
                        showPoint: true
                    },
                    labelFunc: (x) => {
                        for (const label of this.terrainLabels) {
                            if (x === label.total_distance) {
                                return label.ymax.toString();
                            }
                        }
                        return null;
                    }
                },
                elevGuitarLabels: {
                    data: elevGuitarLabels,
                    className: 'ct-guitar-label',
                    options: {
                        showLine: false,
                        showPoint: true
                    },
                    labelFunc: (x) => {
                        for (const label of this.terrainLabels) {
                            if (x === label.total_distance) {
                                return label.elev.toString();
                            }
                        }
                        return null;
                    }
                }
            };
        }

        series = {
            ...series,
            areaLine: {
                data: [{x: 0, y: maxHeight}, {x: totLength, y: maxHeight}],
                className: 'ct-testing-hover',
                options: {
                    showPoint: false,
                    lineSmooth: false,
                    showLine: true,
                    showArea: true
                }
            },
            nodesHover: {
                data: nodesHover,
                className: 'ct-nodes-hover',
                options: {
                    showPoint: false,
                    lineSmooth: false
                }
            }
        };

        const fullData = {
            series: Object.entries(series).map(([name, data]) => {
                return {
                    name: name,
                    data: data.data,
                    className: data.className
                };
            })
        };

        let scaleMinSpaceX = 40;
        let scaleMinSpaceY = 30;
        if (totLength > 175) {
            scaleMinSpaceX = 70;
            scaleMinSpaceY = 50;
        } else if (totLength > 100) {
            scaleMinSpaceX = 60;
            scaleMinSpaceY = 40;
        }

        const options = {
            height: this.props.height,
            chartPadding: {left: 5, bottom: 0, top: 0},
            series: Object.entries(series).reduce((res, [name, data]) => {
                return {
                    ...res,
                    [name]: data.options
                };
            }, {}),
            // divisor: 6,
            axisX: { // Generate x labels automatically to be able to zoom
                type: Chartist.AutoScaleAxis,
                scaleMinSpace: scaleMinSpaceX
                // referenceValue: totLength,
                // divisor: 6,
                // ensureTickValue: 0,
                // high: totLength
            },
            axisY: {
                scaleMinSpace: scaleMinSpaceY,
                low: minHeight,
                high: maxHeight
            },
            plugins: [
                // Add titles to the axisY and axisX
                // eslint-disable-next-line
                ChartistAxisTitle({
                    axisX: {
                        axisTitle: distanceStr + " [m]",
                        axisClass: 'ct-axis-title',
                        offset: {x: 0, y: 30},
                        textAnchor: 'middle'
                    },
                    axisY: {
                        axisTitle: heightStr + " [m " + aslStr + "]",
                        axisClass: 'ct-axis-title',
                        offset: {x: -10, y: 10},
                        flipTitle: true
                    }
                }),
                // eslint-disable-next-line
                ChartistPointLabels({
                    textAnchor: 'middle',
                    labelInterpolationFnc: (value, serie) => {
                        const result = value.split(", ");
                        const x = Number(result[0]);
                        const y = Number(result[1]);
                        for (const key of Object.keys(series)) {
                            if (serie.name === key && series[key].labelFunc) {
                                return series[key].labelFunc(x, y);
                            }
                        }
                        return "";
                    }
                }),
                // eslint-disable-next-line
                ChartistZoom({
                    onZoom: (chart, reset) => {
                        this.setState({ zoomAxisX: chart.options.axisX.highLow });
                        // console.log("chart.options.axisX.highLow -> ", chart.options.axisX.highLow);
                        resetZoom = reset;
                    },
                    noClipY: true,
                    autoZoomY: {high: false, low: false}
                })
            ]
        };

        const tmpXCoordinates = this.terrainLabels.map((o) => o.total_distance);
        const listener = {
            // Draw map info when hovering in HeightProfile
            draw: ev => {
                if (ev.type === "area") {
                    // Mouse hover area show tooltip with actual height and distance
                    ev.element._node.addEventListener("mousemove", ev2 => {
                        const rect = ev.element._node.getBoundingClientRect();
                        const idx = Math.min(this.props.samples - 1, Math.round((ev2.clientX - rect.left) / rect.width * this.props.samples));
                        const x = idx / this.props.samples * (totLength - 1);
                        // Marker over the line
                        this.updateMarker(x);
                        this.updateTooltip(x, this.state.data[idx], ev2.clientX, false);
                    });
                    ev.element._node.addEventListener("mouseout", () => {
                        this.clearMarkerAndTooltip();
                    });
                } else if (ev.series !== undefined && ev.series.className !== undefined && ev.series.className === "ct-nodes-hover") {
                    // Mouse hover poin show tooltip with node info
                    ev.element._node.addEventListener("mousemove", ev2 => {
                        const rect = ev.element._node.getBoundingClientRect();
                        const idx = Math.min(this.props.samples - 1, Math.round((ev2.clientX - rect.left) / rect.width * this.props.samples));
                        // Marker over the line
                        // Use ev.value.x instead of x to get coordinates of ev that will match with node x
                        const x = idx / this.props.samples * (totLength - 1);
                        const closestNode = tmpXCoordinates.reduce(function(prev, curr) {
                            return (Math.abs(curr - x) < Math.abs(prev - x) ? curr : prev);
                        });
                        this.updateMarker(x);
                        this.updateTooltip(closestNode, this.state.data[idx], ev2.clientX, true);
                    });
                    ev.element._node.addEventListener("mouseout", () => {
                        this.clearMarkerAndTooltip();
                    });
                }
            }
        };

        return {fullData: fullData, options: options, listener: listener, terrainMarks: terrainMarks, callbackCoordinates: callbackCoordinates, terrain: terrain, trueTerrain: trueTerrain};
    };

    getDialog = () => {
        let pendingRequests = false;
        const requestUrl = GwUtils.getServiceUrl("profile");
        if (!isEmpty(requestUrl)) {
            // Send request
            pendingRequests = true;
            axios.get(requestUrl + "getdialog", { params: {} }).then(response => {
                const result = response.data;
                this.setState({ profilePickerResult: result, pendingRequestsDialog: false });
            }).catch((e) => {
                console.log(e);
                this.setState({ pendingRequestsDialog: false });
            });
        }
        // Set "Waiting for request..." message
        this.setState({ profilePickerResult: {}, pendingRequestsDialog: pendingRequests });
    };

    getNodeSequences = (jsonData) => {
        const nodesTopCoords = [];
        const nodesBottomCoords = [];

        const numNodes = jsonData.node.length;
        for (let i = 0; i < numNodes; i++) {
            // Get info of node
            const node = jsonData.node[i];
            const x = node.total_distance;
            const y = node.elev;
            const groundY = node.top_elev;
            const halfWidth = node.cat_geom1 / 2;
            const surfaceType = node.surface_type;
            const arc = jsonData.arc[i];
            const prevArc = jsonData.arc[i - 1];

            if (i === 0) { // FirstNode coordinates
                if (surfaceType == "TOP") {
                    nodesTopCoords.push(
                        { x: x - halfWidth, y: y },
                        { x: x - halfWidth, y: groundY },
                        { x: x + halfWidth, y: groundY },
                        {
                            x: x + halfWidth,
                            y: numNodes > 1 ? arc.elev1 + arc.cat_geom1 : y
                        }
                    );
                    nodesBottomCoords.push(
                        { x: x - halfWidth, y: y },
                        { x: x + halfWidth, y: y },
                        { x: x + halfWidth, y: arc.elev1 }
                    );
                } else {
                    nodesTopCoords.push(
                        { x: x - halfWidth, y: y },
                        { x: x - halfWidth, y: numNodes > 1 ? arc.elev1 + arc.cat_geom1 : y },
                        {
                            x: x + halfWidth,
                            y: numNodes > 1 ? arc.elev1 + arc.cat_geom1 : y
                        }
                    );
                    nodesBottomCoords.push(
                        { x: x - halfWidth, y: y },
                        { x: x + halfWidth, y: y },
                        { x: x + halfWidth, y: arc.elev1 }
                    );
                }

            } else if (i < numNodes - 1) { // Mid nodes coordinates
                if (surfaceType == "TOP") {
                    nodesTopCoords.push(
                        { x: x - halfWidth, y: prevArc.elev2 + prevArc.cat_geom1 },
                        { x: x - halfWidth, y: groundY },
                        { x: x + halfWidth, y: groundY },
                        { x: x + halfWidth, y: arc.elev1 + arc.cat_geom1 }
                    );
                    nodesBottomCoords.push(
                        { x: x - halfWidth, y: prevArc.elev2 },
                        { x: x - halfWidth, y: y },
                        { x: x + halfWidth, y: y },
                        { x: x + halfWidth, y: arc.elev1 }
                    );
                } else {
                    nodesTopCoords.push(
                        { x: x - halfWidth, y: prevArc.elev2 + prevArc.cat_geom1 },
                        { x: x + halfWidth, y: arc.elev1 + arc.cat_geom1 }
                    );
                    nodesBottomCoords.push(
                        { x: x - halfWidth, y: prevArc.elev2 },
                        { x: x - halfWidth, y: y },
                        { x: x + halfWidth, y: y },
                        { x: x + halfWidth, y: arc.elev1 }
                    );
                }

            } else { // End Node coordinates
                if (surfaceType == "TOP") {
                    nodesTopCoords.push(
                        { x: x - halfWidth, y: prevArc.elev2 + prevArc.cat_geom1 },
                        { x: x - halfWidth, y: groundY },
                        { x: x + halfWidth, y: groundY },
                        { x: x + halfWidth, y: y }
                    );
                    nodesBottomCoords.push(
                        { x: x - halfWidth, y: prevArc.elev2 },
                        { x: x - halfWidth, y: y },
                        { x: x + halfWidth, y: y }
                    );
                } else {
                    nodesTopCoords.push(
                        { x: x - halfWidth, y: prevArc.elev2 + prevArc.cat_geom1 },
                        { x: x + halfWidth, y: prevArc.elev2 + prevArc.cat_geom1 },
                        { x: x + halfWidth, y: y }
                    );
                    nodesBottomCoords.push(
                        { x: x - halfWidth, y: prevArc.elev2 },
                        { x: x - halfWidth, y: y },
                        { x: x + halfWidth, y: y }
                    );
                }

            }
        }
        return [nodesTopCoords, nodesBottomCoords];
    };

    render() {
        if (!this.props.profile.profiling) {
            // If graph not needed to be drawn return null
            return null;
            /*
            if (this.state.isGraphLoading) {
                return null;
            } else {
                return null;
            }*/
        }
        if (this.props.profile.profiling && this.state.isGraphLoading) {
            return null;
        }

        let datesWindow = null;
        let datesDocker = null;
        let dockerBody = null;
        let profileTool = null;

        const fullData = this.state.fullData;
        const options = this.state.options;
        const indexTerrain = fullData.series.findIndex(item => item.name === 'terrain');
        if (this.state.showTerrain) {
            if (indexTerrain === -1) {
                fullData.series.push({
                    name: 'terrain',
                    data: this.state.terrain,
                    className: 'ct-terrain-line'
                });
                options.series.terrain = {
                    showArea: false,
                    showPoint: false,
                    lineSmooth: true
                };
            }

        } else {
            if (indexTerrain !== -1) {
                fullData.series.splice(indexTerrain, 1);
            }
        }

        const indexTrueTerrain = fullData.series.findIndex(item => item.name === 'trueTerrain');
        if (this.state.showTrueTerrain) {
            if (indexTrueTerrain === -1) {
                fullData.series.push({
                    name: 'trueTerrain',
                    data: this.state.trueTerrain,
                    className: 'ct-true-terrain'
                });
                options.series.terrain = {
                    showArea: false,
                    showPoint: false,
                    lineSmooth: false
                };
            }
        } else {
            if (indexTrueTerrain !== -1) {
                fullData.series.splice(indexTrueTerrain, 1);
            }
        }

        profileTool = (
            <div id="GwProfileGraph" key="1">
                <ChartistComponent data={fullData} listener={this.state.listener} options={options} ref={el => {this.plot = el; }} type="Line" />
                <span className="height-profile-tooltip" ref={el => { this.tooltip = el; }} />
                <span className="height-profile-marker" ref={el => { this.marker = el; }} />
                <div className='height-profile-buttons'>
                    <div className='height-profile-buttons-top'>
                        <div className="checkbox-container">
                            <input checked={this.state.showTerrain} id="showTerrain"
                                onChange={(ev) => {this.setState({showTerrain: ev.target.checked });}} type="checkbox"
                            />
                            <label htmlFor="showTerrain">Adjusted</label>
                        </div>
                        <div className="checkbox-container">
                            <input checked={this.state.showTrueTerrain} id="showTrueTerrain"
                                onChange={(ev) => {this.setState({showTrueTerrain: ev.target.checked });}} type="checkbox"
                            />
                            <label htmlFor="showTrueTerrain">Real</label>
                        </div>
                    </div>
                    <div className='height-profile-buttons-bottom'>
                        <Icon className="resetzoom-profile-button" icon="zoom" onClick={() => {if (resetZoom) resetZoom(); this.setState({zoomAxisX: null});}}
                            title={"Reset Zoom"} />
                        <Icon className="export-profile-button" icon="export" onClick={() => this.getDialog()}
                            title={"Export profile"} />
                    </div>
                </div>
            </div>
        );

        // Dialog
        if (this.state.pendingRequestsDialog === true || this.state.profilePickerResult !== null) {
            let body = null;
            if (isEmpty(this.state.profilePickerResult)) {
                if (this.state.pendingRequestsDialog === true) {
                    body = (<div className="profile-export-body" role="body"><span className="profile-export-body-message">Querying...</span></div>); // TODO: TRANSLATION
                } else {
                    body = (<div className="profile-export-body" role="body"><span className="profile-export-body-message">No result</span></div>); // TODO: TRANSLATION
                }
            } else {
                const result = this.state.profilePickerResult;
                if (!isEmpty(result.form_xml)) {
                    body = (
                        <div className="profile-export-body" role="body">
                            <GwQtDesignerForm dispatchButton={this.dispatchButton} form_xml={result.form_xml} getInitialValues={false} readOnly={false} updateField={this.updateField} widgetValues={this.state.widget_values}/>
                        </div>
                    );
                }

                if (!isEmpty(result.data?.date_from) && !isEmpty(result.data?.date_to)) {
                    dockerBody = (
                        <span>Dates: {result.data.date_from} - {result.data.date_to}</span>
                    );
                }

            }
            datesWindow = (
                <ResizeableWindow dockable={false} icon="giswater" id="GwDateSelector" key="GwDateSelectorWindow" minimizeable="true"
                    onClose={this.onToolClose} onShow={this.onShow} title="GW Profile Tool"
                >
                    {body}
                </ResizeableWindow>
            );
        }

        // if (this.state.pendingRequestsDialog === true || this.state.dateSelectorResult !== null) {
        if (this.state.pendingRequestsDialog === true || this.state.profilePickerResult !== null) {
            datesDocker = (
                <div id="DatesDocker" key="DatesDocker">
                    {dockerBody}
                </div>
            );
            return [datesWindow, datesDocker, profileTool];
        }
        return [profileTool];
    }

    updateField = (widget, ev) => {
        this.setState((state) => ({ widget_values: {...state.widget_values, [widget.name]: ev} }));
    };

    dispatchButton = (action) => {
        switch (action.functionName) {
        case "accept":
            this.getProfileSvg(this.state.widget_values.txt_vnode, this.state.widget_values.txt_title, this.state.widget_values.date_to);
            break;
        case "closeDlg":
            this.onClose();
            break;
        default:
            console.warn(`Action \`${action.functionName}\` cannot be handled.`);
            break;
        }
    };

    onClose = () => {
        this.setState({ profilePickerResult: null, pendingRequestsDialog: false, widget_values: {} });
        // this.props.setCurrentTask(null);
    };
    onToolClose = () => {
        this.setState({ profilePickerResult: null, pendingRequestsDialog: false, widget_values: {} });
        // this.props.setCurrentTask(null);
    };

    getProfileSvg = (vnodeDist, title, date) => {
        const requestUrl = GwUtils.getServiceUrl("profile");
        const result = this.props.profile.feature;
        this.props.processStarted("profile_msg", "Generando Perfil");
        if (!isEmpty(result)) {
            if (vnodeDist === undefined || isEmpty(vnodeDist)) {
                vnodeDist = 1;
            }
            if (title === undefined) {
                title = "";
            }
            if (date === undefined) {
                date = "";
            }
            const params = {
                vnodeDist: vnodeDist,
                title: title,
                date: date,
                initNode: this.props.profile.initNode,
                endNode: this.props.profile.endNode,
                epsg: this.props.profile.epsg,
                theme: this.props.profile.theme
            };
            // Make request
            axios.get(requestUrl + "profilesvg", { params: params }).then(response => {
                this.props.processFinished("profile_msg", true, "Perfil creado correctamente.");
                // Opent new tab with image
                window.open(response.data, 'Image');
            }).catch((e) => {
                console.log(e);
                this.props.processFinished("profile_msg", false, "No se ha podido crear el Perfil...");
            });
        }
    };

    /**
     * Adds marker on the map depending where the mouse is located on the profile
     * @param {*} x Length where mouse is hovering
     */
    updateMarker = (x) => {
        // On hover HeightProfile moving marker
        const segmentLengths = this.props.profile.allNodeLength;
        const coo = this.props.profile.allNodeCoordinates;

        if (isEmpty(segmentLengths) || isEmpty(coo)) {
            return;
        }
        let i = 0;
        let runl = 0;
        while (i < segmentLengths.length - 1 && x > runl + segmentLengths[i]) {
            runl += segmentLengths[i++];
        }
        const lambda = (x - runl) / segmentLengths[i];
        const p = [
            coo[i][0] + lambda * (coo[i + 1][0] - coo[i][0]),
            coo[i][1] + lambda * (coo[i + 1][1] - coo[i][1])
        ];
        // Adds marker on actual location on the map
        this.props.addMarker('GwProfileGraph', p, '', this.props.projection, 1000001); // 1000001: one higher than the zIndex in MeasurementSupport...
    };

    /**
     * Display tooltip on mouse location and display information
     * @param {*} x Actual x of mouse
     * @param {*} y Actual y of mouse
     * @param {*} plotPos Position of plot
     * @param {*} isPoint Point selected
     */
    updateTooltip = (x, y, plotPos, isPoint) => {
        if (!this.tooltip) {
            return;
        }
        if (isPoint) {
            // If user is hovering over a node show all its information
            let code = "";
            let topElev = "";
            let ymax = "";
            let elev = "";
            let distance = "";

            for (let i = 0; i < this.terrainLabels.length; i++) {
                // console.log("this.terrainLabels[i -> ", this.terrainLabels[i]);
                if (this.terrainLabels[i].total_distance === x) {
                    code = this.terrainLabels[i].code.toString();
                    topElev = this.terrainLabels[i].top_elev.toString() + " m";
                    ymax = this.terrainLabels[i].ymax.toString() + " m";
                    elev = this.terrainLabels[i].elev.toString() + " m";
                    distance = this.terrainLabels[i].total_distance.toString() + " m";
                }
            }

            this.marker.style.visibility = this.tooltip.style.visibility = 'visible';
            this.marker.style.left = this.tooltip.style.left = plotPos + 'px';
            this.marker.style.bottom = '30px';
            this.marker.style.height = (this.props.height - 30) + 'px';
            this.tooltip.style.bottom = this.props.height + 'px';
            this.tooltip.innerHTML = "<b>" + "Code:" + "</b> " + code + " <br />" +
                                    "<b>" + "Top Elev:" + "</b> " + topElev + " <br />" +
                                    "<b>" + "Ymax" + ":</b> " + ymax + "<br />" +
                                    "<b>" + "Elev" + ":</b> " + elev + " <br />" +
                                    "<b>" + "Distance" + ":</b> " + distance;
        } else {
            // Show height and distance of actual position on the graph
            const distanceStr = LocaleUtils.tr("heightprofile.distance");
            const heightStr = LocaleUtils.tr("heightprofile.height");
            const aslStr = LocaleUtils.tr("heightprofile.asl");
            const heighProfilePrecision = this.props.heighProfilePrecision;
            const distance = Math.round(x * Math.pow(10, heighProfilePrecision)) / Math.pow(10, heighProfilePrecision);
            const height = Math.round(y * Math.pow(10, heighProfilePrecision)) / Math.pow(10, heighProfilePrecision);
            this.marker.style.visibility = this.tooltip.style.visibility = 'visible';
            this.marker.style.left = this.tooltip.style.left = plotPos + 'px';
            this.marker.style.bottom = '30px';
            this.marker.style.height = (this.props.height - 30) + 'px';
            this.tooltip.style.bottom = this.props.height + 'px';
            this.tooltip.innerHTML = "<b>" + distanceStr + ":</b> " + distance + " m<br />" +
                                    "<b>" + heightStr + ":</b> " + height + " m " + aslStr;
        }
    };

    clearMarkerAndTooltip = () => {
        this.props.removeMarker('GwProfileGraph');
        if (this.tooltip) {
            this.marker.style.visibility = this.tooltip.style.visibility = 'hidden';
        }
    };

    pickPositionCallback = (pos) => {
        if (!pos) {
            this.clearMarkerAndTooltip();
            return;
        }
        // Find ct-area path
        if (!this.plot || !this.plot.chart) {
            return;
        }
        const paths = this.plot.chart.getElementsByTagName("path");
        let path = null;

        for (let i = paths.length - 1; i >= 0; --i) {
            if (paths[i].className.baseVal === "ct-area") {
                path = paths[i];
                break;
            }
        }
        if (!path) {
            return;
        }

        // Find sample index
        const segmentLengths = this.props.profile.allNodeLength;
        const coo = this.state.callbackCoordinates;
        let x = 0;
        for (let iSegment = 0; iSegment < coo.length - 1; ++iSegment) {
            if (this.pointOnSegment(pos, coo[iSegment], coo[iSegment + 1])) {
                const len = MeasureUtils.computeSegmentLengths([pos, coo[iSegment]], this.props.projection, true)[0];
                x += len;
                break;
            } else {
                x += segmentLengths[iSegment];
            }
        }
        const tolerance = 1.5;
        const foundCoordinate = this.state.terrainMarks.find(coordinate => Math.abs(coordinate.x - x) <= tolerance);
        let isNode = false;
        let nodeX = null;
        if (foundCoordinate) {
            isNode = true;
            nodeX = foundCoordinate.x;
        }

        const totLength = (this.props.profile.length || []).reduce((tot, num) => tot + num, 0);
        const k = Math.min(1, x / (totLength + 1));
        const idx = Math.min(this.state.data.length - 1, Math.floor(k * this.props.samples));
        const realX = x;
        x = isNode ? nodeX : x;

        // console.log("realX -> ", realX);
        // console.log("x -> ", x);
        const isInRange = !this.state.zoomAxisX || (realX >= this.state.zoomAxisX.low && realX <= this.state.zoomAxisX.high);
        if (isInRange) {
            this.updateTooltip( x, this.state.data[idx], path.getBoundingClientRect().left + k * path.getBoundingClientRect().width, isNode);
        } else {
            this.clearMarkerAndTooltip();
        }
    };

    pointOnSegment = (q, p1, p2) => {
        const tol = 1E-3;
        // Determine whether points lie on same line: cross-product (P2-P1) x (Q - P1) zero?
        const cross = (p2[0] - p1[0]) * (q[1] - p1[1]) - (q[0] - p1[0]) * (p2[1] - p1[1]);
        if (Math.abs(cross) > tol) {
            return false;
        }
        // Determine if coordinates lie within segment coordinates
        if ((Math.abs(p1[0] - p2[0]) > tol)) {
            return (p1[0] <= q[0] && q[0] <= p2[0]) || (p2[0] <= q[0] && q[0] <= p1[0]);
        } else {
            return (p1[1] <= q[1] && q[1] <= p2[1]) || (p2[1] <= q[1] && q[1] <= p1[1]);
        }
    };
}

export default connect((state) => ({
    profile: state.profile,
    projection: state.map.projection
}), {
    addMarker: addMarker,
    changeProfileState: changeProfileState,
    removeMarker: removeMarker,
    processFinished: processFinished,
    processStarted: processStarted
})(GwProfileGraph);
