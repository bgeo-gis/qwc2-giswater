/**
 * Copyright 2017-2021 Sourcepole AG
 * All rights reserved.
 *
 * This source code is licensed under the BSD-style license found in the
 * LICENSE file in the root directory of this source tree.
 */

import React from 'react';
import axios from 'axios';
import PropTypes from 'prop-types';
import {connect} from 'react-redux';
import isEmpty from 'lodash.isempty';
import Chartist from 'chartist';
import ChartistComponent from 'react-chartist';
import ChartistAxisTitle from 'chartist-plugin-axistitle';
import FileSaver from 'file-saver';
import {addMarker, removeMarker} from 'qwc2/actions/layers';
import {changeMeasurementState} from 'qwc2/actions/measurement';
import Icon from 'qwc2/components/Icon';
import Spinner from 'qwc2/components/Spinner';
import ConfigUtils from 'qwc2/utils/ConfigUtils';
import LocaleUtils from 'qwc2/utils/LocaleUtils';

import ResizeableWindow from 'qwc2/components/ResizeableWindow';
import GwInfoQtDesignerForm from '../components/GwInfoQtDesignerForm';
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

        width: window.innerWidth,
        data: [],
        isloading: false
    }

    /**
     * Add an event listener to know when graph is resized
     */
    componentDidMount() {
        window.addEventListener('resize', this.handleResize);
    }

    /**
     * Removes an event listener to know when graph is resized
     */
    componentWillUnmount() {
        window.removeEventListener('resize', this.handleResize);
    }

    /**
     * Set new width when windows resized
     */
    handleResize = () => {
        this.setState({width: window.innerWidth});
    }

    /**
     * When the component is updated checks if it has to draw a graphic or not
     * @param {*} prevProps Previous state of Props
     * @param {*} prevState Previous state of State
     */
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

        const nodeXCoordinates = [];
        const nodeYCoordinates = [];
        const highestYCoordinates = [];

        const superiorCoordinates = [];
        const inferiorCoordinates = [];
        const terrainMarks = [];

        // Reset class arrays
        this.terrainLabels = [];
        this.nodeIds = [];

        for (let i = 0; i < jsonData.node.length; i++) {
            // Get info of node
            const node = jsonData.node[i];
            const x = node.total_distance;
            const y = node.elev;
            const yMaxHeight = node.top_elev;
            const halfSizeNode = node.cat_geom1 / 2;

            const arc = jsonData.arc[i];
            const prevArc = jsonData.arc[i - 1];
            const numNodes = jsonData.node.length;

            nodeXCoordinates.push(x);
            nodeYCoordinates.push(y);
            highestYCoordinates.push(yMaxHeight);
            // Get coordinates to draw superior line of nodes in the graphic
            if (i === 0) {
                // FirstNode coordinates
                superiorCoordinates.push({ x: x - halfSizeNode, y: y });
                superiorCoordinates.push({ x: x - halfSizeNode, y: yMaxHeight });
                superiorCoordinates.push({ x: x + halfSizeNode, y: yMaxHeight });
                superiorCoordinates.push({
                    x: x + halfSizeNode,
                    y: i < numNodes - 1 ? arc.elev1 + arc.cat_geom1 : y,
                });
            } else if (i !== numNodes - 1) {
                // Mid nodes coordinates
                superiorCoordinates.push({ x: x - halfSizeNode, y: prevArc.elev2 + prevArc.cat_geom1 });
                superiorCoordinates.push({ x: x - halfSizeNode, y: yMaxHeight });
                superiorCoordinates.push({ x: x + halfSizeNode, y: yMaxHeight });
                superiorCoordinates.push({ x: x + halfSizeNode, y: arc.elev1 + arc.cat_geom1 });
            } else {
                // End Node coordinates
                superiorCoordinates.push({ x: x - halfSizeNode, y: prevArc.elev2 + prevArc.cat_geom1 });
                superiorCoordinates.push({ x: x - halfSizeNode, y: yMaxHeight });
                superiorCoordinates.push({ x: x + halfSizeNode, y: yMaxHeight });
                superiorCoordinates.push({ x: x + halfSizeNode, y: y });
            }
            // Get coordinates to draw inferior line of nodes in the graphic
            if (i === 0) {
                // FirstNode
                inferiorCoordinates.push({ x: x - halfSizeNode, y: y });
                inferiorCoordinates.push({ x: x + halfSizeNode, y: y });
                inferiorCoordinates.push({ x: x + halfSizeNode, y: arc.elev1 });
            } else if (i !== numNodes - 1) {
                // Mid nodes
                inferiorCoordinates.push({ x: x - halfSizeNode, y: prevArc.elev2 });
                inferiorCoordinates.push({ x: x - halfSizeNode, y: y });
                inferiorCoordinates.push({ x: x + halfSizeNode, y: y });
                inferiorCoordinates.push({ x: x + halfSizeNode, y: arc.elev1 });
            } else {
                // End Node
                inferiorCoordinates.push({ x: x - halfSizeNode, y: prevArc.elev2 });
                inferiorCoordinates.push({ x: x - halfSizeNode, y: y });
                inferiorCoordinates.push({ x: x + halfSizeNode, y: y });
            }
        }

        // Get terrain info to show the labels
        for (let i = 0; i < jsonData.terrain.length; i++) {
            terrainMarks.push({x: jsonData.terrain[i].total_x, y : jsonData.terrain[i].top_n1});
            this.terrainLabels.push(JSON.parse(jsonData.terrain[i].label_n1));
            this.nodeIds.push(this.terrainLabels[i].code);
        }

        // Generates an array to draw a cross on each node location
        const nodesCross = [];
        for(let i = 0; i < terrainMarks.length; i++){
            nodesCross.push(
                {x: terrainMarks[i]["x"] - 0.3, y: terrainMarks[i]["y"]},
                {x: terrainMarks[i]["x"] + 0.3, y: terrainMarks[i]["y"]},
                {x: null, y: null},
                {x: terrainMarks[i]["x"], y: terrainMarks[i]["y"] + 0.3},
                {x: terrainMarks[i]["x"], y: terrainMarks[i]["y"] - 0.3},
                {x: null, y: null},
            );
        }

        // Terrain line coordinates
        const terrain = highestYCoordinates.map((entry, index) => ({
            x: nodeXCoordinates[index],
            y: entry
        }))

        // Adds more space to start and end of terrain line
        terrain.unshift({x: nodeXCoordinates[0] - 1, y: highestYCoordinates[0]});
        terrain.push({x: nodeXCoordinates[nodeXCoordinates.length - 1] + 1, y: highestYCoordinates[highestYCoordinates.length -1]});
        const terrainLabels = this.terrainLabels;
        // All lines that will be displayed on the graphic
        let data = {
            series: [
                {
                    name: 'terrain',
                    data: terrain,
                    className: 'ct-terrain-line'
                },
                {
                    name: "topLine",
                    data: superiorCoordinates ,
                    className: 'ct-node-pipes'
                },
                {
                    name: "bottomLine",
                    data: inferiorCoordinates,
                    className: 'ct-node-pipes'
                },
                {
                    name: "terrainMarks",
                    data: terrainMarks,
                    className: 'ct-terrain-marks'
                },
                {
                    name: "nodesCross",
                    data: nodesCross,
                    className: 'ct-terrain-line'
                }
            ]
        };
        let options;
        // TODO: automatically adjust text sizes epending on height, also zoom
        // Maximum height supported to draw the table
        const max_height_supported = 13;
        if (Math.max(...highestYCoordinates) - Math.min(...nodeYCoordinates) > max_height_supported){
            // Draw the profile without table
            const minHeight = Math.min(...nodeYCoordinates);
            const maxHeight = Math.max(...highestYCoordinates) + 1;
            // All lines to be drawn on profile and classnames to edit the css
            options = {
                width: this.state.width - 20 + 'px',
                height: this.props.height,
                chartPadding: {left: 5, bottom: 1, top: 0},
                // Properties of each line
                series: {
                    'terrain': {
                        showArea: true,
                        showPoint: false,
                        lineSmooth: false
                    },
                    "topLine": {
                        showArea: false,
                        showPoint: false,
                        lineSmooth: false
                    },
                    "bottomLine": {
                        showArea: false,
                        showPoint: false,
                        lineSmooth: false
                    },
                    "terrainMarks": {
                        showPoint: true,
                        showLine: false
                    },
                    "nodesCross": {
                        showPoint: false,
                        lineSmooth: false
                    }
                },
                scaleMinSpace: 20,
                axisX: {
                    // Generate x labels automatically to be able to zoom
                    type: Chartist.AutoScaleAxis//,
                },
                axisY: {
                    //type: Chartist.AutoScaleAxis,
                    low: minHeight,
                    high: maxHeight
                },
                //Plugins used on profile
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

                    // Adds Node Id label on top of each node
                    CtPointLabels({
                        textAnchor: 'middle',
                        labelInterpolationFnc: function(value, serie) {
                            let label = "";
                            if (serie.name === 'terrainMarks') {
                                let result = value.split(", ");
                                result[0] = Number(result[0]);
                                result[1] = Number(result[1]);
                                terrainLabels.forEach(element => {
                                    if (result[0] === element.total_distance && result[1] === element.top_elev){
                                        label = element.code.toString();
                                    }
                                });
                            }
                            return label;
                        }
                    }),

                    // Do zoom on x axis
                    Zoom({
                        onZoom : function(chart, reset) { resetZoom = reset; },
                        noClipY: true,
                        autoZoomY: {high: false, low: false},
                    })
            ]};
        } else {
            // Generate profile with table
            const minHeight = Math.min(...nodeYCoordinates) - 12;
            const maxHeight = Math.max(...highestYCoordinates) + 1;

            // Create all arrays with coordinates to draw guitar
            const divisorGuitarLine = [];
            for(let i = 0; i < jsonData["arc"].length; i++){
                let firstNodeXCoordinate = jsonData["node"][i]["total_distance"];
                let secondNodeXCoordinate = jsonData["node"][i + 1]["total_distance"];
                divisorGuitarLine.push(
                    {x: firstNodeXCoordinate, y: minHeight + 7.5},
                    {x: firstNodeXCoordinate, y: minHeight + 9.5},
                    {x: null, y: null},
                    {x: secondNodeXCoordinate, y: minHeight + 7.5},
                    {x: secondNodeXCoordinate, y: minHeight + 9.5}
                    );
            }

            const catalogGuitarLabels = jsonData["arc"].map((entry, index) => ({
                x: (jsonData["node"][index]["total_distance"] + jsonData["node"][index + 1]["total_distance"]) / 2,
                y: minHeight + 8
            }))

            const topElevGuitarLabels = nodeXCoordinates.map((entry, index) => ({
                x: entry,
                y: minHeight + 5.6
            }))

            const yMaxGuitarLabels = nodeXCoordinates.map((entry, index) => ({
                x: entry,
                y: minHeight + 3.1
            }))

            const elevGuitarLabels = nodeXCoordinates.map((entry, index) => ({
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

            // Adds new lines to be drawn on the graphic
            data.series.push({
                name: "guitar",
                data: guitar,
                className: 'ct-guitar-line'
            },
            {
                name: 'catalogGuitarArea',
                data: catalogGuitarArea,
                className: 'ct-guitar-area'
            },
            {
                name: "divisorGuitarLine",
                data: divisorGuitarLine,
                className: 'ct-guitar-line'
            },
            {
                name: "catalogGuitarLabels",
                data: catalogGuitarLabels,
                className: 'ct-guitar-label'
            },
            {
                name: "topElevGuitarLabels",
                data: topElevGuitarLabels,
                className: 'ct-guitar-label'
            },
            {
                name: "yMaxGuitarLabels",
                data: yMaxGuitarLabels,
                className: 'ct-guitar-label'
            },
            {
                name: "elevGuitarLabels",
                data: elevGuitarLabels,
                className: 'ct-guitar-label'
            });

            options = {
                width: this.state.width - 20 + 'px',
                height: this.props.height,
                chartPadding: {left: 5, bottom: 1, top: 0},
                // Set each line properties
                series: {
                    'terrain': {
                        showArea: true,
                        showPoint: false,
                        lineSmooth: false
                    },
                    "topLine": {
                        showArea: false,
                        showPoint: false,
                        lineSmooth: false
                    },
                    "bottomLine": {
                        showArea: false,
                        showPoint: false,
                        lineSmooth: false
                    },
                    "terrainMarks": {
                        showPoint: true,
                        showLine: false
                    },
                    "nodesCross": {
                        showPoint: false,
                        lineSmooth: false
                    },
                    "catalogGuitarArea": {
                        showArea: true,
                        showPoint: false
                    },
                    "divisorGuitarLine": {
                        showArea: false,
                        showPoint: false,
                        showLine: true,
                        lineSmooth: false
                    },
                    "catalogGuitarLabels": {
                        showLine: false,
                        showPoint: true
                    },
                    "topElevGuitarLabels": {
                        showLine: false,
                        showPoint: true
                    },
                    "yMaxGuitarLabels": {
                        showLine: false,
                        showPoint: true
                    },
                    "elevGuitarLabels": {
                        showLine: false,
                        showPoint: true
                    }
                },
                scaleMinSpace: 20,
                axisX: {
                    type: Chartist.AutoScaleAxis
                },
                axisY: {
                    // TODO: Fix sometimes low value gets -1
                    low: minGraphYValue,
                    high: maxHeight,
                    onlyInteger: true
                },
                plugins: [
                    // Displays a title for the axisX and axisY
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
                    // Show labels on the table, depending on line series draw one label or another
                    CtPointLabels({
                        textAnchor: 'middle',
                        labelInterpolationFnc: function(value, serie) {
                            let label = "";
                            if (serie.name === 'terrainMarks') {
                                let result = value.split(", ");
                                result[0] = Number(result[0]);
                                result[1] = Number(result[1]);
                                terrainLabels.forEach(element => {
                                    if (result[0] === element.total_distance && result[1] === element.top_elev){
                                        label = element.code.toString();
                                    }
                                });
                            } else if (serie.name === 'catalogGuitarLabels') {
                                let result = value.split(", ");
                                result[0] = Number(result[0]);
                                result[1] = Number(result[1]);

                                for (let i = 0; i < jsonData["arc"].length; i++){
                                    let firstNodeXCoordinate = jsonData["node"][i]["total_distance"]
                                    let secondNodeXCoordinate = jsonData["node"][i + 1]["total_distance"]
                                    if ((firstNodeXCoordinate + secondNodeXCoordinate) / 2 === result[0]){
                                        const text = JSON.parse(jsonData["arc"][i]["descript"])
                                        label = text["catalog"] + " " + text["dimensions"].toString();
                                    }
                                }
                            } else if (serie.name === 'topElevGuitarLabels') {
                                let result = value.split(", ");
                                result[0] = Number(result[0]);
                                result[1] = Number(result[1]);
                                terrainLabels.forEach(element => {
                                    if (result[0] === element.total_distance){
                                        label = element.top_elev.toString();
                                    }
                                });
                            } else if (serie.name === 'yMaxGuitarLabels') {
                                let result = value.split(", ");
                                result[0] = Number(result[0]);
                                result[1] = Number(result[1]);
                                terrainLabels.forEach(element => {
                                    if (result[0] === element.total_distance){
                                        label = element.ymax.toString();
                                    }
                                });
                            } else if (serie.name === 'elevGuitarLabels') {
                                let result = value.split(", ");
                                result[0] = Number(result[0]);
                                result[1] = Number(result[1]);
                                terrainLabels.forEach(element => {
                                    if (result[0] === element.total_distance){
                                        label = element.elev.toString();
                                    }
                                });
                            }
                            return label;
                        }
                    }),
                    // Make zoom on axisX
                    Zoom({
                        onZoom : function(chart, reset) { resetZoom = reset; },
                        noClipY: true,
                        autoZoomY: {high: false, low: false},
                    })
            ]};
        }

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
                <div>
                    <Icon className="resetzoom-profile-button" icon="zoom" onClick={() => {if (resetZoom) resetZoom()}}
                        title={"Reset Zoom"} />
                    <Icon className="export-profile-button" icon="export" onClick={() => this.getDialog()}
                        title={"Export profile"} />
                </div>
            </div>
        );

        // Dialog
        if (this.state.pendingRequestsDialog === true || this.state.profileToolResult !== null) {
            let body = null;
            if (isEmpty(this.state.profileToolResult)) {
                if (this.state.pendingRequestsDialog === true) {
                    body = (<div className="date-selector-body" role="body"><span className="date-selector-body-message">Querying...</span></div>); // TODO: TRANSLATION
                } else {
                    body = (<div className="date-selector-body" role="body"><span className="date-selector-body-message">No result</span></div>); // TODO: TRANSLATION
                }
            } else {
                const result = this.state.profileToolResult
                if (!isEmpty(result.form_xml)) {
                    body = (
                        <div className="date-selector-body" role="body">
                            <GwInfoQtDesignerForm form_xml={result.form_xml} readOnly={false} dispatchButton={this.dispatchButton} updateField={this.updateField} widgetValues={this.state.widget_values} getInitialValues={false}/>
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

    /**
     * Gets the svg of actual profile
     * @param {*} soloPozos Return a svg with only 'pozos'
     */
    getProfileSvg = (vnode_dist, title, date) => {
        const requestUrl = GwUtils.getServiceUrl("profile");
        const result = this.props.measurement.feature;
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
                // Opent new tab with image
                window.open(response.data,'Image');
                // Delete image
                axios.delete(requestUrl + "profilesvg", { params: {"img_path": response.data} })
                .catch((e) => {
                    console.log(e);
                });
            }).catch((e) => {
                console.log(e);
            });
        }
    }

    /**
     * Adds marker on the map depending where the mouse is located in the profile
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

    /**
     * Removes created marker and tooltip
     */
    clearMarkerAndTooltip = () => {
        this.props.removeMarker('gwheightprofile');
        if (this.tooltip) {
            this.marker.style.visibility = this.tooltip.style.visibility = 'hidden';
        }
    }
    /**
     * Unknown functionality
     * @param {*} pos
     * @returns
     */
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

    /**
     * Unknown functionality
     * @param {*} q
     * @param {*} p1
     * @param {*} p2
     * @returns
     */
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
    removeMarker: removeMarker
})(GwHeightProfile);
