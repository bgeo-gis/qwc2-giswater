/**
 * Copyright BGEO. All rights reserved.
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
import TaskBar from 'qwc2/components/TaskBar';
import LocaleUtils from 'qwc2/utils/LocaleUtils';
import GwUtils from '../utils/GwUtils';
import MapUtils from 'qwc2/utils/MapUtils';

class GwFlowtrace extends React.Component {
    static propTypes = {
        addMarker: PropTypes.func,
        theme: PropTypes.object,
        click: PropTypes.object,
        currentIdentifyTool: PropTypes.string,
        currentTask: PropTypes.string,
        map: PropTypes.object,
        removeLayer: PropTypes.func,
        removeMarker: PropTypes.func,
    }
    state = {
        mode: 'trace',
        bodyText: null
    }
    constructor(props) {
        super(props);
    }
    componentDidUpdate(prevProps, prevState) {
        if (this.props.currentTask === "GwFlowtrace" || this.props.currentIdentifyTool === "GwFlowtrace") {
            this.identifyPoint(prevProps);
        }
    }
    crsStrToInt = (crs) => {
        const parts = crs.split(':')
        return parseInt(parts.slice(-1))
    }
    identifyPoint = (prevProps) => {
        const clickPoint = this.queryPoint(prevProps);
        if (clickPoint) {
            console.log("flowtrace clickPoint:", clickPoint);
            
            this.props.addMarker('flowtrace', clickPoint, '', this.props.map.projection);

            // Call fct upstream/downstream & draw geojson response
            this.makeRequest(clickPoint);
        }
    }
    queryPoint = (prevProps) => {
        if (this.props.click.button !== 0 || this.props.click === prevProps.click || (this.props.click.features || []).find(entry => entry.feature === 'startupposmarker')) {
            return null;
        }
        return this.props.click.coordinate;
    }

    makeRequest(clickPoint) {
        const request_url = GwUtils.getServiceUrl("flowtrace");

        if (!isEmpty(request_url)) {
            let mode = this.state.mode === "trace" ? "upstream" : "downstream";
            this.setState({ bodyText: `Calculating ${mode} flowtrace...` })

            // Get request paramas
            const epsg = this.crsStrToInt(this.props.map.projection)
            const scale = MapUtils.computeForZoom(this.props.map.scales, this.props.map.zoom)
            const params = {
                "theme": this.props.theme.title,
                "epsg": epsg,
                "coords": String(clickPoint),
                "zoom": scale
            }
            // Send request
            axios.get(request_url + mode, { params: params }).then(response => {
                const result = response.data
                console.log("flowtrace", mode, "result", result);
                this.addFlowtraceLayers(result);
            }).catch((e) => {
                console.log(e);
                this.setState({ bodyText: "Could not execute the flowtrace" });
            });
        }
        else {
            this.setState({ bodyText: "The flowtrace url is not configured" })
        }
    }
    addFlowtraceLayers = (result) => {
        this.props.removeLayer("temp_points.geojson")
        this.props.removeLayer("temp_lines.geojson")
        this.props.removeLayer("temp_polygons.geojson")

        // Lines
        let line = result.body.data.line;
        let lines_style = {
            strokeColor: this.state.mode === "trace" ? [235, 167, 48, 1] : [235, 74, 117, 1],
            strokeWidth: 6,
            strokeDash: [1],
            fillColor: [255, 255, 255, 0.33],
            textFill: "blue",
            textStroke: "white",
            textFont: '20pt sans-serif'
        }
        const line_features = GwUtils.getGeoJSONFeatures(line, "default", lines_style)
        if (!isEmpty(line_features)) {
            this.props.addLayerFeatures({
                id: "temp_lines.geojson",
                name: "temp_lines.geojson",
                title: "Temporal Lines",
                zoomToExtent: true
            }, line_features, true);
        }

        // Points
        let point = result.body.data.point;
        let points_style = {
            strokeColor: this.state.mode === "trace" ? [235, 167, 48, 1] : [235, 74, 117, 1],
            strokeWidth: 2,
            strokeDash: [4],
            fillColor: [191, 156, 40, 0.33],
            textFill: "blue",
            textStroke: "white",
            textFont: '20pt sans-serif'
        }
        const point_features = GwUtils.getGeoJSONFeatures(point, "default", points_style)
        if (!isEmpty(point_features)) {
            this.props.addLayerFeatures({
                id: "temp_points.geojson",
                name: "temp_points.geojson",
                title: "Temporal Points",
                zoomToExtent: true
            }, point_features, true);
        }

        if (!isEmpty(line_features) || !isEmpty(point_features)) {
            this.setState({ bodyText: "Drawing flowtrace (you can click again)" })
        }
        else {
            this.setState({ bodyText: "No node found in this position... (you can click again)" })
        }
    }
    onShow = (mode) => {
        this.setState({ bodyText: LocaleUtils.tr("infotool.clickhelpPoint") })
        this.setState({ mode: mode || 'trace' });
    }
    onToolClose = () => {
        this.setState({ bodyText: LocaleUtils.tr("infotool.clickhelpPoint") })
        this.props.removeMarker("flowtrace")
        // this.setState({ mode: 'trace' });
    }
    render() {
        return (
            <TaskBar key="GwFlowtraceTaskBar" onHide={this.onToolClose} onShow={this.onShow} task="GwFlowtrace">
                {() => ({
                    body: this.state.bodyText
                    // body: LocaleUtils.tr("infotool.clickhelpPoint")
                })}
            </TaskBar>
        )
    }
}

const selector = (state) => ({
    click: state.map.click || { modifiers: {} },
    currentTask: state.task.id,
    currentIdentifyTool: state.identify.tool,
    theme: state.theme.current,
    map: state.map,
});

export default connect(selector, {
    addLayerFeatures: addLayerFeatures,
    addMarker: addMarker,
    removeMarker: removeMarker,
    removeLayer: removeLayer,
    addLayerFeatures: addLayerFeatures
})(GwFlowtrace);
