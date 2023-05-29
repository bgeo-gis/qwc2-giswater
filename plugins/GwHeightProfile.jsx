/**
 * Copyright BGEO. All rights reserved.
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
import {addMarker, removeMarker} from 'qwc2/actions/layers';
import {changeMeasurementState} from 'qwc2/actions/measurement';
import Icon from 'qwc2/components/Icon';
import Spinner from 'qwc2/components/Spinner';
import ConfigUtils from 'qwc2/utils/ConfigUtils';
import LocaleUtils from 'qwc2/utils/LocaleUtils';
import { processFinished, processStarted } from 'qwc2/actions/processNotifications';

import ResizeableWindow from 'qwc2/components/ResizeableWindow';
import GwQtDesignerForm from '../components/GwQtDesignerForm';
import GwUtils from '../utils/GwUtils';

import CtPointLabels from 'qwc2-giswater/libs/bower_components/chartist-plugin-pointlabels/dist/chartist-plugin-pointlabels';
import Zoom from 'qwc2-giswater/libs/bower_components/chartist-plugin-zoom/dist/chartist-plugin-zoom';

import './style/GwHeightProfile.css';

var resetZoom = null;

class GwHeightProfile extends React.Component {
    nodeIds = [];
    terrainLabels = [];
    static propTypes = {
        addMarker: PropTypes.func,
        changeMeasurementState: PropTypes.func,
        heighProfilePrecision: PropTypes.number,
        height: PropTypes.number,
        measurement: PropTypes.object,
        mobile: PropTypes.bool,
        projection: PropTypes.string,
        removeMarker: PropTypes.func,
        samples: PropTypes.number
    }
    static defaultProps = {
        samples: 500,
        heighProfilePrecision: 0,
        height: 400
    }
    constructor(props) {
        super(props);
        this.tooltip = null;
        this.marker = null;
        this.plot = null;
    }
    state = {
        profileToolResult: null,
        getProfilesResult: null,
        pendingRequestsDialog: false,
        pendingRequests: false,
        dockerLoaded: false,
        widget_values: {},
        showTerrain: true,
        showTrueTerrain: false,

        width: window.innerWidth,
        data: [],
        isloading: false
    }

    componentDidMount() {
        window.addEventListener('resize', this.handleResize);
    }

    componentWillUnmount() {
        window.removeEventListener('resize', this.handleResize);
    }

    handleResize = () => {
        this.setState({width: window.innerWidth});
    }

    componentDidUpdate(prevProps, prevState) {
        if (this.props.measurement.coordinates !== prevProps.measurement.coordinates) {
            if (this.props.measurement.profiling === true && this.props.measurement.geomType === "LineString" && !isEmpty(this.props.measurement.coordinates) ) {
                // Generate profile
                this.queryElevations(this.props.measurement.coordinates, this.props.measurement.length, this.props.projection);
            } else if (!isEmpty(this.state.data)) {
                this.setState({data: [], pickPositionCallback: null});
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
            this.setState({ isloading: true });
            axios.post(serviceUrl + '/getheightprofile', {coordinates, distances, projection, samples: this.props.samples}).then(response => {
                this.setState({ isloading: false });
                this.setState({data: response.data.elevations});
                this.props.changeMeasurementState({...this.props.measurement, pickPositionCallback: this.pickPositionCallback});
            }).catch(e => {
                this.setState({ isloading: false });
                console.log("Query failed: " + e);
            });
        }
    }

    getDialog = () => {
        let pendingRequests = false;
        const request_url = GwUtils.getServiceUrl("profile");
        if (!isEmpty(request_url)) {
            // Send request
            pendingRequests = true
            axios.get(request_url + "getdialog", { params: {} }).then(response => {
                const result = response.data
                console.log("profileToolResult");
                console.log(result);
                this.setState({ profileToolResult: result, pendingRequestsDialog: false });
                // this.filterLayers(result);
            }).catch((e) => {
                console.log(e);
                this.setState({ pendingRequestsDialog: false });
            });
        }
        // Set "Waiting for request..." message
        this.setState({ profileToolResult: {}, pendingRequestsDialog: pendingRequests });
    }

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

            const arc = jsonData.arc[i];
            const prevArc = jsonData.arc[i - 1];
            
            if (i === 0) { // FirstNode coordinates
                nodesTopCoords.push(
                    { x: x - halfWidth, y: y },
                    { x: x - halfWidth, y: groundY },
                    { x: x + halfWidth, y: groundY },
                    {
                        x: x + halfWidth,
                        y: numNodes > 1 ? arc.elev1 + arc.cat_geom1 : y,
                    }
                );
                nodesBottomCoords.push(
                    { x: x - halfWidth, y: y },
                    { x: x + halfWidth, y: y },
                    { x: x + halfWidth, y: arc.elev1 }
                );
            } 
            else if (i < numNodes - 1) { // Mid nodes coordinates
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
            } 
            else { // End Node coordinates
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
            }
        }
        return [nodesTopCoords, nodesBottomCoords]
    }

    render() {
        if (!this.props.measurement.profiling) {
            // If graph not needed to be drawn return null
            if (this.state.isloading) {
                return (
                    <div id="HeightProfile">
                        <div className="height-profile-loading-indicator">
                            <Spinner className="spinner" />
                            {LocaleUtils.tr("heightprofile.loading")}
                        </div>
                    </div>
                );
            } else {
                return null;
            }
        }

        // Get text for ToolTip
        const distanceStr = LocaleUtils.tr("heightprofile.distance");
        const heightStr = LocaleUtils.tr("heightprofile.height");
        const aslStr = LocaleUtils.tr("heightprofile.asl");

        // Get all variables passed to measurement on GwProfileTool
        const jsonData = this.props.measurement.feature['body']['data'];
        const totLength = (this.props.measurement.length || []).reduce((tot, num) => tot + num, 0);
        const nodes = jsonData.node;
        const arcs = jsonData.arc;
        

        const trueTerrain = this.state.data.map((elev, index) => ({
            x: index * totLength / this.props.samples,
            y: elev
        }))

        const terrain = []
        for (let n = 1; n < nodes.length; n++) {
            const n0 = nodes[n - 1]
            const n1 = nodes[n]
            const i0 = Math.floor((n0.total_distance / totLength) * this.props.samples)
            const i1 = Math.floor((n1.total_distance / totLength) * this.props.samples)
            const delta0 = this.state.data[i0] - n0.top_elev
            const delta1 = this.state.data[i1-1] - n1.top_elev
            for (let i = i0; i < i1; i++) {
                const localX = (i - i0) / (i1 - i0)
                const delta = delta0 * (1 - localX) + delta1 * localX
                terrain.push({
                    x: i * totLength / this.props.samples,
                    y: this.state.data[i] - delta
                })
            }
        }

        const terrainMarks = [];

        const nodeXCoordinates = [];
        const numNodes = nodes.length;
        for (let i = 0; i < numNodes; i++) {
            // Get info of node
            const node = nodes[i];
            const x = node.total_distance;
            
            nodeXCoordinates.push(x);
        }
        
        this.terrainLabels = [];
        // Get terrain info to show the labels
        for (let i = 0; i < jsonData.terrain.length; i++) {
            const localX = jsonData.terrain[i].total_x / totLength
            const terrainIndex = Math.floor(localX * (this.props.samples-1))
            terrainMarks.push({x: jsonData.terrain[i].total_x, y: terrain[terrainIndex].y});
            // terrainMarks.push({x: jsonData.terrain[i].total_x, y : jsonData.terrain[i].top_n1});
            this.terrainLabels.push(JSON.parse(jsonData.terrain[i].label_n1));
        }

        let minHeight = Math.min(...nodes.map(node => node.elev))
        let maxHeight = Math.max(...nodes.map(node => node.top_elev)) + 1

        // Generates an array to draw a cross on each node location
        const nodesCross = [];
        for(let i = 0; i < terrainMarks.length; i++){
            nodesCross.push(
                {x: terrainMarks[i].x, y: terrainMarks[i].y + 0.3},
                {x: terrainMarks[i].x, y: minHeight - 2.5 },
                // {x: terrainMarks[i].x, y: terrainMarks[i].y - 0.3},
                {x: null, y: null},
            );
        }

        const [nodesTopCoords, nodesBottomCoords] = this.getNodeSequences(jsonData)

        // Combined data and options
        let series = {
            "topLine": {
                data: nodesTopCoords,
                className: 'ct-node-pipes',
                options: {
                    showArea: false,
                    showPoint: false,
                    lineSmooth: false
                }
            },
            "bottomLine": {
                data: nodesBottomCoords,
                className: 'ct-node-pipes',
                options: {
                    showArea: false,
                    showPoint: false,
                    lineSmooth: false
                }
            },
            "terrainMarks": {
                data: terrainMarks,
                className: 'ct-terrain-marks',
                options: {
                    showPoint: true,
                    showLine: false
                },
                labelFunc: (x, y) => {
                    for (const label of this.terrainLabels) {
                        if (x === label.total_distance) {
                            return label.code.toString();
                        }
                    }
                }
            },
            "nodesCross": {
                data: nodesCross,
                borderDash: [10, 5],
                className: 'ct-nodes-cross',
                options: {
                    showPoint: false,
                    lineSmooth: false
                }
            }
        }

        if (this.state.showTerrain) {
            series["terrain"] = {
                data: terrain,
                className: 'ct-terrain-line',
                options: {
                    showArea: true,
                    showPoint: false,
                    lineSmooth: true
                }
            }
        }

        if (this.state.showTrueTerrain) {
            series["trueTerrain"] = {
                data: trueTerrain,
                className: 'ct-true-terrain',
                options: {
                    showArea: true,
                    showPoint: false,
                    lineSmooth: false
                }
            }
        }

        const max_height_supported = 13;
        if (maxHeight - minHeight < max_height_supported) {
            minHeight = minHeight - 12

            // Create all arrays with coordinates to draw guitar
            const divisorGuitarLine = nodes.reduce((res, node) => {
                return res.concat([
                    { x: node.total_distance, y: minHeight + 7.5 },
                    { x: node.total_distance, y: minHeight + 9.5 },
                    { x: null, y: null },
                ])
            }, []);

            const catalogGuitarLabels = arcs.map((arc, i) => ({
                x: (nodes[i].total_distance + nodes[i + 1].total_distance) / 2,
                y: minHeight + 8
            }))

            const topElevGuitarLabels = nodeXCoordinates.map((entry) => ({
                x: entry,
                y: minHeight + 5.6
            }))

            const yMaxGuitarLabels = nodeXCoordinates.map((entry) => ({
                x: entry,
                y: minHeight + 3.1
            }))

            const elevGuitarLabels = nodeXCoordinates.map((entry) => ({
                x: entry,
                y: minHeight + 0.6
            }))

            const minGraphYValue = Math.round(minHeight)

            const catalogGuitarArea = [
                {x: nodeXCoordinates[0] - 1, y: minHeight + 9.5},
                {x: nodeXCoordinates[nodeXCoordinates.length - 1] + 1, y: minHeight + 9.5}
            ];

            const guitar = [
                {x: nodeXCoordinates[0] - 1, y: minHeight + 7.5},
                {x: nodeXCoordinates[nodeXCoordinates.length - 1] + 1, y: minHeight + 7.5},
                {x: null, y: null},
                {x: nodeXCoordinates[0] - 1, y: minHeight + 5},
                {x: nodeXCoordinates[nodeXCoordinates.length - 1] + 1, y: minHeight + 5},
                {x: null, y: null},
                {x: nodeXCoordinates[0] - 1, y: minHeight + 2.5},
                {x: nodeXCoordinates[nodeXCoordinates.length - 1] + 1, y: minHeight + 2.5},
                {x: null, y: null},
                {x: nodeXCoordinates[0] - 1, y: minGraphYValue + 0.1},
                {x: nodeXCoordinates[nodeXCoordinates.length - 1] + 1, y: minGraphYValue + 0.1},
            ];

            series = {
                ...series,
                "guitar": {
                    data: guitar,
                    className: 'ct-guitar-line'
                },
                "catalogGuitarArea": {
                    data: catalogGuitarArea,
                    className: 'ct-guitar-area',
                    options: {
                        showArea: true,
                        showPoint: false
                    }
                },
                "divisorGuitarLine": {
                    data: divisorGuitarLine,
                    className: 'ct-guitar-line',
                    options: {
                        showArea: false,
                        showPoint: false,
                        showLine: true,
                        lineSmooth: false
                    }
                },
                "catalogGuitarLabels": {
                    data: catalogGuitarLabels,
                    className: 'ct-guitar-label',
                    options: {
                        showLine: false,
                        showPoint: true
                    },
                    labelFunc: (x, y) => {
                        for (let i = 0; i < arcs.length; i++) {
                            let firstNodeX = nodes[i].total_distance
                            let secondNodeX = nodes[i + 1].total_distance
                            if ((firstNodeX + secondNodeX) / 2 === x){
                                const text = JSON.parse(arcs[i].descript)
                                return text.catalog + " " + text.dimensions.toString();
                            }
                        }
                    }
                },
                "topElevGuitarLabels": {
                    data: topElevGuitarLabels,
                    className: 'ct-guitar-label',
                    options: {
                        showLine: false,
                        showPoint: true
                    },
                    labelFunc: (x, y) => {
                        for (const label of this.terrainLabels) {
                            if (x === label.total_distance){
                                return label.top_elev.toString();
                            }
                        }
                    }
                },
                "yMaxGuitarLabels": {
                    data: yMaxGuitarLabels,
                    className: 'ct-guitar-label',
                    options: {
                        showLine: false,
                        showPoint: true
                    },
                    labelFunc: (x, y) => {
                        for (const label of this.terrainLabels) {
                            if (x === label.total_distance){
                                return label.ymax.toString();
                            }
                        }
                    }
                },
                "elevGuitarLabels": {
                    data: elevGuitarLabels,
                    className: 'ct-guitar-label',
                    options: {
                        showLine: false,
                        showPoint: true
                    },
                    labelFunc: (x, y) => {
                        for (const label of this.terrainLabels) {
                            if (x === label.total_distance){
                                return label.elev.toString();
                            }
                        }
                    }
                }
            }
        }

        const data = {
            series: Object.entries(series).map(([name, data]) => {
                return {
                    name: name,
                    data: data.data,
                    className: data.className
                }
            })
        };

        const options = {
            // width: this.state.width - 20 + 'px',
            height: this.props.height,
            chartPadding: {left: 5, bottom: 1, top: 0},
            series: Object.entries(series).reduce((res, [name, data]) => {
                return {
                    ...res,
                    [name]: data.options 
                }
            }, {}),
            scaleMinSpace: 20,
            axisX: { // Generate x labels automatically to be able to zoom
                type: Chartist.AutoScaleAxis,
                scaleMinSpace: 50,
                // onlyInteger: true,
                // low: 0,
                // high: nodes.at(-1).total_distance,
                referenceValue: totLength
            },
            axisY: {
                low: minHeight,
                high: maxHeight,
            },
            plugins: [
                // Add titles to the axisY and axisX
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
                CtPointLabels({
                    textAnchor: 'middle',
                    // labelOffset: {
                    //     x: 0,
                    //     y: 0
                    // },
                    labelInterpolationFnc: (value, serie) => {
                        let result = value.split(", ");
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
                Zoom({
                    onZoom : function(chart, reset) { resetZoom = reset; },
                    noClipY: true,
                    autoZoomY: {high: false, low: false},
                })
            ]
        };

        const listeners = {
            // Draw map info when hovering in HeightProfile
            draw: ev => {
                if (ev.type === "area") {
                    // Mouse hover area show tooltip with actual height and distance
                    ev.element._node.addEventListener("mousemove", ev2 => {
                        const rect = ev.element._node.getBoundingClientRect();
                        const idx = Math.min(this.props.samples - 1, Math.round((ev2.clientX - rect.left) / rect.width * this.props.samples));
                        const x = idx / this.props.samples * totLength;
                        // Marker over the line
                        this.updateMarker(x);
                        this.updateTooltip(x, this.state.data[idx], ev2.clientX, false);
                    });
                    ev.element._node.addEventListener("mouseout", () => {
                        this.clearMarkerAndTooltip();
                    });
                } else if (ev.type === "point") {
                    // Mouse hover poin show tooltip with node info
                    ev.element._node.addEventListener("mousemove", ev2 => {
                        const rect = ev.element._node.getBoundingClientRect();
                        const idx = Math.min(this.props.samples - 1, Math.round((ev2.clientX - rect.left) / rect.width * this.props.samples));
                        const x = idx / this.props.samples * totLength;
                        // Marker over the line
                        // Use ev.value.x instead of x to get coordinates of ev that will match with node x
                        this.updateMarker(ev.value.x);
                        this.updateTooltip(ev.value.x, this.state.data[idx], ev2.clientX, true);
                    });
                    ev.element._node.addEventListener("mouseout", () => {
                        this.clearMarkerAndTooltip();
                    });
                }
            }
        };

        let datesWindow = null;
        let datesDocker = null;
        let dockerBody = null;
        let profileTool = null;

        profileTool = (
            <div id="GwHeightProfile">
                <ChartistComponent data={data} listener={listeners} options={options} ref={el => {this.plot = el; }} type="Line" />
                <span className="height-profile-tooltip" ref={el => { this.tooltip = el; }} />
                <span className="height-profile-marker" ref={el => { this.marker = el; }} />
                <div className='height-profile-buttons'>
                    <div className='height-profile-buttons-top'>
                        <div className="checkbox-container">
                            <input id="showTerrain" type="checkbox" 
                                checked={this.state.showTerrain} onChange={(ev) => {this.setState({showTerrain: ev.target.checked })}}
                            />
                            <label htmlFor="showTerrain">Adjusted</label>
                        </div>
                        <div className="checkbox-container">
                            <input id="showTrueTerrain" type="checkbox" 
                                checked={this.state.showTrueTerrain} onChange={(ev) => {this.setState({showTrueTerrain: ev.target.checked })}}
                            />
                            <label htmlFor="showTrueTerrain">Real</label>
                        </div>
                    </div>
                    <div className='height-profile-buttons-bottom'>
                        <Icon className="resetzoom-profile-button" icon="zoom" onClick={() => {if (resetZoom) resetZoom()}}
                            title={"Reset Zoom"} />
                        <Icon className="export-profile-button" icon="export" onClick={() => this.getDialog()}
                            title={"Export profile"} />
                    </div>
                </div>
            </div>
        );

        // Dialog
        if (this.state.pendingRequestsDialog === true || this.state.profileToolResult !== null) {
            let body = null;
            if (isEmpty(this.state.profileToolResult)) {
                if (this.state.pendingRequestsDialog === true) {
                    body = (<div className="profile-export-body" role="body"><span className="profile-export-body-message">Querying...</span></div>); // TODO: TRANSLATION
                } else {
                    body = (<div className="profile-export-body" role="body"><span className="profile-export-body-message">No result</span></div>); // TODO: TRANSLATION
                }
            } else {
                const result = this.state.profileToolResult
                if (!isEmpty(result.form_xml)) {
                    body = (
                        <div className="profile-export-body" role="body">
                            <GwQtDesignerForm form_xml={result.form_xml} readOnly={false} dispatchButton={this.dispatchButton} updateField={this.updateField} widgetValues={this.state.widget_values} getInitialValues={false}/>
                        </div>
                    )
                }

                if (!isEmpty(result.data?.date_from) && !isEmpty(result.data?.date_to)) {
                    dockerBody = (
                        <span>Dates: {result.data.date_from} - {result.data.date_to}</span>
                    )
                }

            }
            datesWindow = (
                <ResizeableWindow icon="date_selector" key="GwDateSelectorWindow" title="GW Profile Tool" id="GwDateSelector"
                    initialHeight={this.props.initialHeight} initialWidth={this.props.initialWidth} dockable={false}
                    onShow={this.onShow} onClose={this.onToolClose}
                >
                    {body}
                </ResizeableWindow>
            )
        }

        // if (this.state.pendingRequestsDialog === true || this.state.dateSelectorResult !== null) {
        if (this.state.pendingRequestsDialog === true || this.state.profileToolResult !== null) {
            datesDocker = (
                <div id="DatesDocker">
                    {dockerBody}
                </div>
            )
            return [datesWindow, datesDocker, profileTool];
        }
        return [profileTool]
    }

    updateField = (widget, ev, action) => {
        this.setState({ widget_values: {...this.state.widget_values, [widget.name]: ev} });
    }

    dispatchButton = (action) => {
        switch (action.functionName) {
            case "accept":
                this.getProfileSvg(this.state.widget_values.txt_vnode, this.state.widget_values.txt_title, this.state.widget_values.date_to)
                break;
            case "closeDlg":
                this.onClose();
                break;
            default:
                console.warn(`Action \`${action.functionName}\` cannot be handled.`)
                break;
        }
    }

    onClose = () => {
        this.setState({ profileToolResult: null, pendingRequestsDialog: false, widget_values: {} });
        //this.props.setCurrentTask(null);
    }
    onToolClose = () => {
        this.setState({ profileToolResult: null, pendingRequestsDialog: false, widget_values: {} });
        //this.props.setCurrentTask(null);
    }

    getProfileSvg = (vnode_dist, title, date) => {
        const requestUrl = GwUtils.getServiceUrl("profile");
        const result = this.props.measurement.feature;
        this.props.processStarted("profile_msg", "Generando Perfil");
        if (!isEmpty(result)){
            if (vnode_dist === undefined){
                vnode_dist = 1
            }
            if (title === undefined){
                title = ""
            }
            if (date === undefined){
                date = ""
            }
            const params = {
                //"result": result,
                "vnode_dist": vnode_dist,
                "title": title,
                "date": date,
                "initNode": this.props.measurement.initNode,
                "endNode": this.props.measurement.endNode,
                "epsg": this.props.measurement.epsg,
                "theme": this.props.measurement.theme
            }
            // Make request
            axios.get(requestUrl + "profilesvg", { params: params }).then(response => {
                this.props.processFinished("profile_msg", true, "Perfil creado correctamente.");
                // Opent new tab with image
                window.open(response.data,'Image');
            }).catch((e) => {
                console.log(e);
                this.props.processFinished("profile_msg", false, "No se ha podido crear el Perfil...");
            });
        }
    }

    /**
     * Adds marker on the map depending where the mouse is located on the profile
     * @param {*} x Length where mouse is hovering
     */
    updateMarker = (x) => {
        // On hover HeightProfile moving marker
        let segmentLengths = this.props.measurement.allNodeLength;
        let coo = this.props.measurement.allNodeCoordinates;

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
        this.props.addMarker('gwheightprofile', p, '', this.props.projection, 1000001); // 1000001: one higher than the zIndex in MeasurementSupport...
    }

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

        if (isPoint){
            // If user is hovering over a node show all its information
            let code = "";
            let topElev = "";
            let ymax = "";
            let elev = "";
            let distance = "";

            for (let i = 0; i < this.terrainLabels.length; i++){
                if (this.terrainLabels[i].total_distance === x){
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
    }

    clearMarkerAndTooltip = () => {
        this.props.removeMarker('gwheightprofile');
        if (this.tooltip) {
            this.marker.style.visibility = this.tooltip.style.visibility = 'hidden';
        }
    }

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
        for (let i = 0; i < paths.length; ++i) {
            if (paths[i].className.baseVal === "ct-area") {
                path = paths[i];
                break;
            }
        }
        if (!path) {
            return;
        }

        // Find sample index
        const segmentLengths = this.props.measurement.length;
        const coo = this.props.measurement.coordinates;
        let x = 0;
        for (let iSegment = 0; iSegment < coo.length - 1; ++iSegment) {
            if (this.pointOnSegment(pos, coo[iSegment], coo[iSegment + 1])) {
                const dx = pos[0] - coo[iSegment][0];
                const dy = pos[1] - coo[iSegment][1];
                x += Math.sqrt(dx * dx + dy * dy);
                break;
            } else {
                x += segmentLengths[iSegment];
            }
        }
        const totLength = (this.props.measurement.length || []).reduce((tot, num) => tot + num, 0);
        const k = Math.min(1, x / totLength);
        const idx = Math.min(this.state.data.length - 1, Math.floor(k * this.props.samples));
        this.updateTooltip(x, this.state.data[idx], path.getBoundingClientRect().left + k * path.getBoundingClientRect().width, false);
    }

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
    }
}

export default connect((state) => ({
    measurement: state.measurement,
    projection: state.map.projection,
    mobile: state.browser.mobile
}), {
    addMarker: addMarker,
    changeMeasurementState: changeMeasurementState,
    removeMarker: removeMarker,
    processFinished: processFinished,
    processStarted: processStarted
})(GwHeightProfile);
