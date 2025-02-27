/**
 * Copyright © 2025 by BGEO. All rights reserved.
 * The program is free software: you can redistribute it and/or modify it under the terms of the GNU
 * General Public License as published by the Free Software Foundation, either version 3 of the License,
 * or (at your option) any later version
 */

import axios from 'axios';
import React from 'react';
import PropTypes from 'prop-types';
import { connect } from 'react-redux';
import isEmpty from 'lodash.isempty';
import { addMarker, removeMarker, removeLayer, addLayerFeatures } from 'qwc2/actions/layers';
import { processFinished, processStarted } from 'qwc2/actions/processNotifications';
import TaskBar from 'qwc2/components/TaskBar';
import LocaleUtils from 'qwc2/utils/LocaleUtils';
import GwUtils from '../../utils/GwUtils';
import MapUtils from 'qwc2/utils/MapUtils';
import ConfigUtils from 'qwc2/utils/ConfigUtils';


class GwFlowtrace extends React.Component {
    static propTypes = {
        addLayerFeatures: PropTypes.func,
        addMarker: PropTypes.func,
        click: PropTypes.object,
        currentIdentifyTool: PropTypes.string,
        currentTask: PropTypes.string,
        initPointStyle: PropTypes.object,
        map: PropTypes.object,
        processFinished: PropTypes.func,
        processStarted: PropTypes.func,
        removeLayer: PropTypes.func,
        removeMarker: PropTypes.func,
        standardLinesStyle: PropTypes.object,
        standardPointsStyle: PropTypes.object,
        theme: PropTypes.object
    };
    static defaultProps = {
        standardLinesStyle: {
            strokeColor: {
                trace: [232, 48, 235, 1],
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
                trace: [232, 48, 235, 1],
                exit: [235, 74, 117, 1]
            },
            strokeWidth: 2,
            strokeDash: [4],
            fillColor: [191, 156, 40, 0.33],
            textFill: "blue",
            textStroke: "white",
            textFont: "20pt sans-serif"
        },
        initPointStyle: {
            strokeColor: {
                trace: [0, 51, 255, 1],
                exit: [0, 51, 255, 1]
            },
            strokeWidth: 2,
            strokeDash: [4],
            fillColor: [0, 51, 255, 0.33],
            textFill: "blue",
            textStroke: "white",
            textFont: "20pt sans-serif"
        }
    };
    state = {
        mode: 'trace',
        bodyText: null
    };
    /*
    constructor(props) {
        super(props);
    }
    */
    componentDidUpdate(prevProps) {
        if (this.props.currentTask === "GwFlowtrace" || this.props.currentIdentifyTool === "GwFlowtrace") {
            this.identifyPoint(prevProps);
        }
    }
    identifyPoint = (prevProps) => {
        const clickPoint = this.queryPoint(prevProps);
        if (clickPoint) {

            this.props.addMarker('flowtrace', clickPoint, '', this.props.map.projection);

            // Call fct upstream/downstream & draw geojson response
            this.makeRequest(clickPoint);
        }
    };
    queryPoint = (prevProps) => {
        if (this.props.click.button !== 0 || this.props.click === prevProps.click || (this.props.click.features || []).find(entry => entry.feature === 'startupposmarker')) {
            return null;
        }
        return this.props.click.coordinate;
    };

    makeRequest(clickPoint) {
        const requestUrl = GwUtils.getServiceUrl("flowtrace");

        if (!isEmpty(requestUrl)) {
            const mode = this.state.mode === "trace" ? "upstream" : "downstream";
            this.setState({ bodyText: `Calculating ${mode} flowtrace...` });
            this.props.processStarted("flowtrace_msg", `Calculating ${mode} flowtrace...`);

            // Get request paramas
            const epsg = GwUtils.crsStrToInt(this.props.map.projection);
            const scale = MapUtils.computeForZoom(this.props.map.scales, this.props.map.zoom);
            const params = {
                theme: this.props.theme.title,
                epsg: epsg,
                coords: String(clickPoint),
                zoom: scale
            };
            // Send request
            axios.get(requestUrl + mode, { params: params }).then(response => {
                const result = response.data;
                this.addFlowtraceLayers(result, result.body.data.initPoint.toString());
            }).catch((e) => {
                console.error(e);
                this.setState({ bodyText: "Could not execute the flowtrace" });
                this.props.processFinished("flowtrace_msg", false, `Could not execute the flowtrace ${e}`);
            });
        } else {
            this.setState({ bodyText: "The flowtrace url is not configured" });
        }
    }
    addFlowtraceLayers = (result, nodeId) => {
        this.props.removeLayer("temp_points.geojson");
        this.props.removeLayer("temp_lines.geojson");
        this.props.removeLayer("temp_polygons.geojson");

        // Lines
        const lines = result.body.data.line;
        const standardLinesConfig = this.props.standardLinesStyle;
        const standardLinesStyle = {
            ...standardLinesConfig,
            strokeColor: this.state.mode === "trace" ? standardLinesConfig.strokeColor.trace : standardLinesConfig.strokeColor.exit
        };
        const lineFeatures = GwUtils.getGeoJSONFeatures("default", lines, standardLinesStyle);
        if (!isEmpty(lineFeatures)) {
            this.props.addLayerFeatures({
                id: "temp_lines.geojson",
                name: "temp_lines.geojson",
                title: "Temporal Lines",
                zoomToExtent: true
            }, lineFeatures, true);
        }

        // Points
        const points = result.body.data.point;
        const standardPointsConfig = this.props.standardPointsStyle;
        const initPointConfig = this.props.initPointStyle;
        const standardPointsStyle = {
            ...standardPointsConfig,
            strokeColor: this.state.mode === "trace" ? standardPointsConfig.strokeColor.trace : standardPointsConfig.strokeColor.exit
        };
        const initPointStyle = {
            ...initPointConfig,
            strokeColor: this.state.mode === "trace" ? initPointConfig.strokeColor.trace : initPointConfig.strokeColor.exit
        };
        const initPointArray = [[nodeId], initPointStyle];
        const pointFeatures = GwUtils.getGeoJSONFeatures("default", points, standardPointsStyle, initPointArray);
        if (!isEmpty(pointFeatures)) {
            this.props.addLayerFeatures({
                id: "temp_points.geojson",
                name: "temp_points.geojson",
                title: "Temporal Points",
                zoomToExtent: true
            }, pointFeatures, true);
        }

        if (!isEmpty(lineFeatures) || !isEmpty(pointFeatures)) {
            this.setState({ bodyText: "Drawing flowtrace (you can click again)" });
            this.props.processFinished("flowtrace_msg", true, "Flowtrace calculated!");
        } else {
            this.props.processFinished("flowtrace_msg", false, "No node found in position");
            this.setState({ bodyText: "No node found in this position... (you can click again)" });
        }
    };
    onShow = (mode) => {
        this.setState({ bodyText: LocaleUtils.tr("infotool.clickhelpPoint") });
        this.setState({ mode: mode || 'trace' });
    };
    onToolClose = () => {
        this.setState({ bodyText: LocaleUtils.tr("infotool.clickhelpPoint") });
        this.props.removeMarker("flowtrace");
        // this.setState({ mode: 'trace' });
    };
    render() {
        return (
            <TaskBar key="GwFlowtraceTaskBar" onHide={this.onToolClose} onShow={this.onShow} task="GwFlowtrace">
                {() => ({
                    body: this.state.bodyText
                    // body: LocaleUtils.tr("infotool.clickhelpPoint")
                })}
            </TaskBar>
        );
    }
}

export default connect((state) => {
    const enabled = state.task.id === "Identify" || (
        state.task.identifyEnabled &&
        ConfigUtils.getConfigProp("identifyTool", state.theme.current, "Identify") === "Identify"
    );
    return {
        click: state.map.click || { modifiers: {} },
        enabled: enabled,
        theme: state.theme.current,
        map: state.map
    };
}, {
    addLayerFeatures: addLayerFeatures,
    addMarker: addMarker,
    removeMarker: removeMarker,
    removeLayer: removeLayer,
    processFinished: processFinished,
    processStarted: processStarted
})(GwFlowtrace);
