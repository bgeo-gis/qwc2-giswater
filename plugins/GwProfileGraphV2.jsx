/**
 * Copyright © 2025 by BGEO. All rights reserved.
 * The program is free software: you can redistribute it and/or modify it under the terms of the GNU
 * General Public License as published by the Free Software Foundation, either version 3 of the License,
 * or (at your option) any later version
 */

import React from 'react';
import axios from 'axios';
import PropTypes from 'prop-types';
import { connect } from 'react-redux';
import isEmpty from 'lodash.isempty';
import zoomPlugin from 'chartjs-plugin-zoom';
import ChartDataLabels from 'chartjs-plugin-datalabels';

import { Line } from 'react-chartjs-2';
import {
    Chart as ChartJS,
    CategoryScale,
    LinearScale,
    PointElement,
    LineElement,
    Title,
    Tooltip,
    Filler,
    Legend
} from 'chart.js';

import { addMarker, removeMarker } from 'qwc2/actions/layers';
import { changeProfileState } from '../actions/profile';
import Icon from 'qwc2/components/Icon';
import ConfigUtils from 'qwc2/utils/ConfigUtils';
import LocaleUtils from 'qwc2/utils/LocaleUtils';
import { processFinished, processStarted } from 'qwc2/actions/processNotifications';

import ResizeableWindow from 'qwc2/components/ResizeableWindow';
import GwQtDesignerForm from '../components/GwQtDesignerForm';
import GwUtils from '../utils/GwUtils';

import './style/GwProfileGraphV2.css';

import MeasureUtils from 'qwc2/utils/MeasureUtils';

ChartJS.register(
    CategoryScale,
    LinearScale,
    PointElement,
    LineElement,
    Title,
    Tooltip,
    Filler,
    Legend,
    zoomPlugin,
    ChartDataLabels,
);

class GwProfileGraphV2 extends React.Component {
    nodeIds = [];
    terrainLabels = [];
    static propTypes = {
        addMarker: PropTypes.func,
        changeProfileState: PropTypes.func,
        height: PropTypes.number,
        heightProfilePrecision: PropTypes.number,
        processFinished: PropTypes.func,
        processStarted: PropTypes.func,
        profile: PropTypes.object,
        projection: PropTypes.string,
        removeMarker: PropTypes.func,
        samples: PropTypes.number
    };
    static defaultProps = {
        samples: 500,
        heightProfilePrecision: 0,
        height: 400
    };
    constructor(props) {
        super(props);
        this.tooltip = null;
        this.marker = null;
        this.chartRef = React.createRef();
        Tooltip.positioners.bottom = function(items) {
            const pos = Tooltip.positioners.average(items);
            // Happens when nothing is found
            if (pos === false) {
                return false;
            }

            const chart = this.chart;

            return {
                x: pos.x,
                y: chart.chartArea.top,
                xAlign: 'center',
                yAlign: 'top',
            };
        };
    }
    state = {
        profilePickerResult: null,
        getProfilesResult: null,
        pendingRequestsDialog: false,
        pendingRequests: false,
        dockerLoaded: false,
        widgetsProperties: {},
        showTerrain: true,
        showTrueTerrain: false,
        width: window.innerWidth,
        data: [],
        isGraphLoading: true,
        zoomAxisX: null
    };

    componentDidMount() {
    }

    componentWillUnmount() {
        this.setState({ isGraphLoading: false });
        // Remove marker when component unmounts
        this.props.removeMarker('GwProfileGraph');
    }

    componentDidUpdate(prevProps) {
        console.log(this.props.profile, "...", prevProps.profile);
        if (this.props.profile.coordinates !== prevProps.profile.coordinates) {
            if (this.props.profile.profiling === true && !isEmpty(this.props.profile.coordinates)) {
                this.queryElevations(this.props.profile.coordinates, this.props.profile.length, this.props.projection);
            } else if (!isEmpty(this.state.data)) {
                this.setState({ data: [], pickPositionCallback: null, isGraphLoading: true, terrainMarks: [] });
            }
        }
    }

    queryElevations(coordinates, distances, projection) {
        console.log("Querying elevations for", coordinates, distances, projection);
        const serviceUrl = (ConfigUtils.getConfigProp("elevationServiceUrl") || "").replace(/\/$/, '');
        if (serviceUrl) {
            axios.post(serviceUrl + '/getheightprofile', { coordinates, distances, projection, samples: this.props.samples }).then(response => {
                console.log("RESPONSE:", response);
                if (response.data && response.data.elevations) {
                    this.setState({ data: response.data.elevations, isGraphLoading: !isEmpty(response.data.elevations) ? false : true });
                    // this.setState({ data: response.data.elevations, isGraphLoading: !isEmpty(response.data.elevations) ? false : true, ...this.getAllValuesForGraph(response.data.elevations) });
                    this.props.changeProfileState({ ...this.props.profile, pickPositionCallback: this.pickPositionCallback });
                } else {
                    console.error("Invalid response data:", response.data);
                }
            }).catch(e => {
                console.error("Query failed: " + e);
            });
        }
    }

    /**
     * Adds marker on the map depending where the mouse is located on the profile
     * @param {*} x Length where mouse is hovering
     */
    updateMarker = (x) => {
        // On hover HeightProfile moving marker
        const segmentLengths = this.props.profile.allNodeLength;
        const coords = this.props.profile.allNodeCoordinates;

        if (isEmpty(segmentLengths) || isEmpty(coords)) {
            return;
        }
        let i = 0;
        let runl = 0;
        while (i < segmentLengths.length - 1 && x > runl + segmentLengths[i]) {
            runl += segmentLengths[i++];
        }
        const lambda = (x - runl) / segmentLengths[i];
        const p = [
            coords[i][0] + lambda * (coords[i + 1][0] - coords[i][0]),
            coords[i][1] + lambda * (coords[i + 1][1] - coords[i][1])
        ];
        // Adds marker on actual location on the map
        this.props.addMarker('GwProfileGraph', p, '', this.props.projection, 1000001); // 1000001: one higher than the zIndex in MeasurementSupport...
    };

    getAllValuesForGraph = (dataElevations = this.state.data) => {
        const distanceStr = LocaleUtils.tr("heightprofile.distance");
        const heightStr = LocaleUtils.tr("heightprofile.height");
        const aslStr = LocaleUtils.tr("heightprofile.asl");

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
            const node = nodes[i];
            const x = node.total_distance;
            nodeXCoordinates.push(x);
        }

        const data = jsonData.line.features;
        const sortedArcIds = jsonData.arc.map(item => item.arc_id);
        const callbackCoordinates = [];
        let index = 0;
        for (const arcId of sortedArcIds) {
            const matchingCoordinates = data.find(item => item.properties.arc_id === arcId);
            if (matchingCoordinates) {
                const coordinates = matchingCoordinates.geometry.coordinates;
                const processedCoordinates = index !== 0 ? coordinates.slice(1) : coordinates;
                callbackCoordinates.push(...processedCoordinates);
            }
            index++;
        }

        this.terrainLabels = [];
        for (let i = 0; i < jsonData.terrain.length; i++) {
            const localX = jsonData.terrain[i].total_x / totLength;
            const terrainIndex = Math.floor(localX * (this.props.samples - 1));
            terrainMarks.push({ x: jsonData.terrain[i].total_x, y: terrain[terrainIndex].y });
            this.terrainLabels.push(JSON.parse(jsonData.terrain[i].label_n1));
        }

        let minHeight = Math.min(...nodes.map(node => node.elev));
        minHeight = Math.floor(minHeight);
        const maxHeight = Math.max(...nodes.map(node => node.top_elev)) + 1.5;

        const nodesCross = [];
        for (let i = 0; i < terrainMarks.length; i++) {
            nodesCross.push(
                { x: terrainMarks[i].x, y: terrainMarks[i].y, label: this.terrainLabels[i] },
                { x: terrainMarks[i].x, y: minHeight - 2 },
                { x: null, y: null },
            );
        }

        const nodesHover = [];
        for (let i = 0; i < terrainMarks.length; i++) {
            nodesHover.push(
                { x: terrainMarks[i].x, y: maxHeight },
                { x: terrainMarks[i].x, y: minHeight - 12 },
                { x: null, y: null },
            );
        }

        const [nodesTopCoords, nodesBottomCoords] = this.getNodeSequences(jsonData);

        const dataSets = [
            {
                label: 'Top Line',
                data: nodesTopCoords,
                borderColor: 'black',
                pointStyle: false,
                fill: false
            },
            {
                label: 'Bottom Line',
                data: nodesBottomCoords,
                borderColor: 'black',
                pointStyle: false,
                fill: false
            },
            // {
            //     label: 'Terrain Marks',
            //     data: terrainMarks,
            //     borderColor: 'rgb(0,0,255)',
            //     pointStyle: true,
            //     lineStyle: false,
            //     fill: false,
            //     pointRadius: 5
            // },
            {
                label: 'Nodes Cross',
                data: nodesCross,
                borderColor: 'rgba(54,54,54,0.3)',
                borderDash: [10, 5],
                pointStyle: false,
                // fill: false,
                // pointRadius: 0
            },
            // {
            //     label: 'Nodes Hover',
            //     data: nodesHover,
            //     borderColor: 'rgb(0,255,0)',
            //     pointStyle: true,
            //     // fill: false,
            //     // pointRadius: 0
            // }
        ];

        if (this.state.showTerrain) {
            dataSets.push({
                label: 'Terrain',
                data: terrain,
                borderColor: 'DarkGreen',
                pointStyle: false,
                fill: false
            });
        }

        if (this.state.showTrueTerrain) {
            dataSets.push({
                label: 'True Terrain',
                data: trueTerrain,
                borderColor: 'red',
                pointStyle: false,
                fill: false
            });
        }

        const options = {
            responsive: true,
            maintainAspectRatio: false,
            scales: {
                x: {
                    type: 'linear',
                    position: 'bottom',
                    title: {
                        display: true,
                        text: distanceStr + " [m]"
                    }
                },
                y: {
                    title: {
                        display: true,
                        text: heightStr + " [m " + aslStr + "]"
                    },
                    min: minHeight,
                    max: maxHeight
                }
            },
            plugins: {
                legend: {
                    display: false
                },
                datalabels: {
                    align: 'start',
                    anchor: 'end',
                    offset: -20,
                    formatter: (value, context) => {
                        if (context.dataset.label === 'Nodes Cross' && value.label) {
                            // console.log("VALUE:", value);
                            return value.label.code;
                        }
                        return '';
                    }
                },
                zoom: {
                    pan: {
                        enabled: true,
                        modifierKey: 'ctrl',
                        mode: 'x',
                    },
                    limits: {
                        x: {
                            // TODO: maybe there's a better way to calculate this
                            min: -0.1 * totLength,
                            max: 1.1 * totLength
                        },
                    },
                    zoom: {
                        wheel: {
                            enabled: false
                        },
                        pinch: {
                            enabled: true
                        },
                        drag: {
                            enabled: true,

                        },
                        mode: 'x',
                    }
                },
                tooltip: {
                    position: 'bottom',
                    interaction: {
                        intersect: false,
                        mode: 'x',
                    },
                    callbacks: {
                        title: (context) => `${distanceStr}: ${context[0].parsed.x.toFixed(2)} m`,
                        label: (context) => '',
                        footer: (context) => {
                            console.log("CONTEXT:", context);

                            let x = context[0].parsed.x;

                            const node = context.find(item => item.dataset.label === 'Nodes Cross' && item.raw.label);
                            if (node) {
                                console.log("ITEM:", node);
                                x = node.raw.x;
                                return (
                                    `Code: ${node.raw.label.code}\n` +
                                    `Top Elev: ${node.raw.label.top_elev}\n` +
                                    `Ymax: ${node.raw.label.ymax}\n` +
                                    `Elev: ${node.raw.label.elev}`
                                )
                                output += `\nCode: ${node.raw.label.code}`;
                                output += `\nTop Elev: ${node.raw.label.top_elev}`;
                                output += `\nYmax: ${node.raw.label.ymax}`;
                                output += `\nElev: ${node.raw.label.elev}`;
                            }

                            this.updateMarker(x);

                            return `${heightStr}: ${context[0].parsed.y.toFixed(2)} m`;
                            // return `${context}`;
                            return 'testing :>';
                            const terrainLabel = this.terrainLabels.find(label => label.x === context[0].parsed.x);
                            if (terrainLabel) {
                                return `Terrain: ${terrainLabel.label}`;
                            }
                            return '';
                        }
                    }
                }
            }
        };

        return { fullData: { datasets: dataSets }, options: options };
    };

    getNodeSequences = (jsonData) => {
        const nodesTopCoords = [];
        const nodesBottomCoords = [];

        const numNodes = jsonData.node.length;
        for (let i = 0; i < numNodes; i++) {
            const node = jsonData.node[i];
            const x = node.total_distance;
            const y = node.elev;
            const groundY = node.top_elev;
            const halfWidth = node.cat_geom1 / 2;
            const surfaceType = node.surface_type;
            const arc = jsonData.arc[i];
            const prevArc = jsonData.arc[i - 1];

            if (i === 0) {
                if (surfaceType === "TOP") {
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

            } else if (i < numNodes - 1) {
                if (surfaceType === "TOP") {
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

            } else {
                if (surfaceType === "TOP") {
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
            console.log("111");
            return null;
        }
        if (this.props.profile.profiling && (this.state.isGraphLoading || isEmpty(this.state.data))) {
            console.log("222");
            return null;
        }

        // const fullData = this.state.fullData;
        // const options = this.state.options;

        const { fullData, options } = this.getAllValuesForGraph();

        console.log("Full Data:", fullData);
        console.log("Options:", options);
        console.log("Ref:", this.chartRef);
        const extraControls = [
            {
                icon: 'refresh',
                callback: () => { if (this.chartRef.current) this.chartRef.current.resetZoom(); },
                title: "Reset Zoom",
            },
            {
                icon: 'line',
                active: this.state.showTrueTerrain,
                callback: () => { this.setState({ showTrueTerrain: !this.state.showTrueTerrain }); },
                title: "Show Real Terrain"
            },
            {
                icon: 'export',
                active: this.state.showTerrain,
                callback: () => { this.setState({ showTerrain: !this.state.showTerrain }); },
                title: "Show Adjusted Terrain"
            }
        ];
        return (
            <ResizeableWindow
                dockable="bottom" extraControls={extraControls} icon="profile"
                initialHeight={this.props.height} initialWidth={600} initiallyDocked
                key="GwProfile" onClose={this.onClose} onExternalWindowResized={this.resizeChart}
                splitScreenWhenDocked
                title={LocaleUtils.tr("appmenu.items.GwProfilePicker")} usePortal={false}
            >
                <div id="GwProfileGraphV2" role="body" key="1">
                    <Line data={fullData} options={options} ref={this.chartRef}
                        plugins={[{
                            afterDraw: chart => {
                                if (chart.tooltip?._active?.length) {
                                    let x = chart.tooltip._active[0].element.x;
                                    // console.log("X:", x);
                                    // this.updateMarker(x);
                                    let yAxis = chart.scales.y;
                                    let ctx = chart.ctx;
                                    ctx.save();
                                    ctx.beginPath();
                                    ctx.setLineDash([5, 5]);
                                    ctx.moveTo(x, yAxis.top);
                                    ctx.lineTo(x, yAxis.bottom);
                                    ctx.lineWidth = 1;
                                    ctx.strokeStyle = 'rgba(0, 0, 255, 0.4)';
                                    ctx.stroke();
                                    ctx.restore();
                                }
                                else {
                                    // console.log("NO ACTIVE");
                                    // this.props.removeMarker('GwProfileGraph');
                                }
                            }
                        }]}
                    />
                    {/*
                    <div className='height-profile-buttons'>
                        <div className='height-profile-buttons-top'>
                            <div className="checkbox-container">
                                <input checked={this.state.showTerrain} id="showTerrain"
                                    onChange={(ev) => { this.setState({ showTerrain: ev.target.checked }); }} type="checkbox"
                                />
                                <label htmlFor="showTerrain">Adjusted</label>
                            </div>
                            <div className="checkbox-container">
                                <input checked={this.state.showTrueTerrain} id="showTrueTerrain"
                                    onChange={(ev) => { this.setState({ showTrueTerrain: ev.target.checked }); }} type="checkbox"
                                />
                                <label htmlFor="showTrueTerrain">Real</label>
                            </div>
                        </div>
                        <div className='height-profile-buttons-bottom'>
                            <Icon className="resetzoom-profile-button" icon="expand" onClick={() => { if (this.chartRef.current) this.chartRef.current.resetZoom(); this.setState({ zoomAxisX: null }); }}
                                title={"Reset Graph Zoom"} />
                            <Icon className="export-profile-button" icon="export" onClick={() => this.getDialog()}
                                title={"Export profile"} />
                        </div>
                    </div>
                    */}
                </div>
            </ResizeableWindow>
        );
    }

    getDialog = () => {
        let pendingRequests = false;
        const requestUrl = GwUtils.getServiceUrl("profile");
        if (!isEmpty(requestUrl)) {
            pendingRequests = true;
            axios.get(requestUrl + "getdialog", { params: {} }).then(response => {
                const result = response.data;
                this.setState({ profilePickerResult: result, pendingRequestsDialog: false });
            }).catch((e) => {
                console.log(e);
                this.setState({ pendingRequestsDialog: false });
            });
        }
        this.setState({ profilePickerResult: {}, pendingRequestsDialog: pendingRequests });
    };

    onWidgetValueChange = (widget, value) => {
        this.setState((state) => ({ widgetsProperties: { ...state.widgetsProperties, [widget.name]: { value: value } } }));
    };

    onWidgetAction = (action) => {
        switch (action.functionName) {
            case "accept":
                this.getProfileSvg(
                    this.state.widgetsProperties.txt_vnode.value,
                    this.state.widgetsProperties.txt_title.value,
                    this.state.widgetsProperties.date_to.value
                );
                break;
            case "closeDlg":
                this.onClose();
                break;
            default:
                console.warn(`Action \`${action.functionName}\` not implemented`);
        }
    };

    getProfileSvg = (vnode, title, dateTo) => {
        const requestUrl = GwUtils.getServiceUrl("profile");
        if (!isEmpty(requestUrl)) {
            this.props.processStarted("profile");
            axios.post(requestUrl + "getprofile", {
                profile: this.props.profile,
                vnode: vnode,
                title: title,
                dateTo: dateTo
            }).then(response => {
                this.props.processFinished("profile");
                const result = response.data;
                this.setState({ getProfilesResult: result });
            }).catch((e) => {
                console.log(e);
                this.props.processFinished("profile");
            });
        }
    };

    onClose = () => {
        this.setState({ profilePickerResult: null, getProfilesResult: null });
        // Remove marker when tool is closed
        this.props.removeMarker('GwProfileGraph');
    };
}

const selector = (state) => ({
    profile: state.profile,
    projection: state.map.projection
});

export default connect(selector, {
    addMarker,
    removeMarker,
    changeProfileState,
    processStarted,
    processFinished
})(GwProfileGraphV2);

