/**
 * Copyright BGEO. All rights reserved.
 * The program is free software: you can redistribute it and/or modify it under the terms of the GNU
 * General Public License as published by the Free Software Foundation, either version 3 of the License,
 * or (at your option) any later version
 */

import React from 'react';
import {connect} from 'react-redux';
import PropTypes from 'prop-types';
import axios from 'axios';
import url from 'url';
import {v4 as uuidv4} from 'uuid';
import {setCurrentTask} from 'qwc2/actions/task';
import {addLayer, removeLayer, changeLayerProperty} from 'qwc2/actions/layers';
import ResizeableWindow from 'qwc2/components/ResizeableWindow';
import ServiceLayerUtils from 'qwc2/utils/ServiceLayerUtils';
import DatePicker from 'react-datepicker';
import 'react-datepicker/dist/react-datepicker.css';
import {Combobox} from 'react-widgets';
import "react-widgets/dist/css/react-widgets.css";
import {parseISO} from 'date-fns';


class NetCDFExplorer extends React.Component {
    static propTypes = {
        active: PropTypes.bool,
        addLayer: PropTypes.func,
        dataset: PropTypes.string,
        removeLayer: PropTypes.func,
        setCurrentTask: PropTypes.func,
        url: PropTypes.string,
        /** The default window size.  */
        windowSize: PropTypes.shape({
            width: PropTypes.number,
            height: PropTypes.number
        })
        // layer: PropTypes.string,
    };
    static defaultProps = {
        windowSize: {width: 320, height: 320}
    };
    state = {
        dataset: null,
        datasetLayers: null,
        activeDatasetLayer: null,
        layerUuid: null,
        metadata: null,
        date: null,
        zValue: null
    };
    // constructor(props) {
    //     super(props);
    // }
    setActiveLayer(layerData) {
        if (this.state.layerUuid) {
            this.props.removeLayer(this.state.layerUuid);
        }

        const rawLayer = this.state.datasetLayers.find((layer) => layer.name === layerData.id);
        if (!rawLayer) {
            console.error(`Layer "${layerData.id}" does not exist in NetCDF dataset`);
            return;
        }

        const metadataUrlParts = url.parse(this.props.url, true);
        metadataUrlParts.query = {
            request: "GetMetadata",
            item: "layerDetails",
            layerName: layerData.id
        };
        delete metadataUrlParts.search;
        axios.get(url.format(metadataUrlParts)).then((response) => {
            const metadata = response.data;
            console.log("Metadata", metadata);

            let zValue = null;
            if (metadata.zaxis) {
                zValue = metadata.zaxis.values.at(-1);
            }

            let date = null;
            if (metadata.nearestTimeIso) {
                date = parseISO(metadata.nearestTimeIso);
            }

            const uuid = uuidv4();
            const layer = {
                ...rawLayer,
                uuid: uuid,
                id: uuid,
                url: this.props.url,
                // url: this.getUrlWithParams(params),
                featureInfoUrl: this.props.url,
                legendUrl: this.props.url
                // zoomToExtent: true,
                // tiled: true
            };
            console.log("Final Layer", layer);

            this.props.addLayer(layer);
            this.setState({
                activeDatasetLayer: layerData,
                layerUuid: uuid,
                metadata: metadata,
                date: date,
                zValue: zValue
            }, this.updateParams);
        });
    }
    setDataset(datasetName) {
        const wmsUrlParts = url.parse(this.props.url, true);
        wmsUrlParts.query = {
            SERVICE: "WMS",
            REQUEST: "GetCapabilities",
            VERSION: "1.3.0",
            DATASET: datasetName
        };
        delete wmsUrlParts.search;

        axios.get(url.format(wmsUrlParts)).then(response => {
            const layers = ServiceLayerUtils.getWMSLayers(response.data, this.props.url)[0].sublayers;
            const layer = {id: layers[0].name, label: layers[0].title};
            this.setState({ dataset: datasetName, datasetLayers: layers}, () => this.setActiveLayer(layer));
        }).catch((e) => {
            console.warn(e);
        });
    }
    componentDidUpdate(prevProps) {
        if (this.props.active && !prevProps.active) {
            console.log("NetCDF Updated!!");

        }
    }
    getUrlWithParams(params) {
        return this.props.url + "?" + this.encodeQueryData(params);
    }
    encodeQueryData(data) {
        const ret = [];
        for (const d in data) {
            if (data[d]) {
                ret.push(encodeURIComponent(d) + '=' + encodeURIComponent(data[d]));
            }
        }
        return ret.join('&');
    }
    changeParam(paramName, value) {
        this.setState({[paramName]: value}, this.updateParams);
    }
    updateParams() {
        const params = {
            // TILED: true,
            TIME: this.state.date?.toISOString(),
            ELEVATION: this.state.zValue
        };
        this.props.changeLayerProperty(this.state.layerUuid, "url", this.getUrlWithParams(params));
    }
    render() {
        if (!this.state.dataset && !this.props.active) {
            return null;
        }

        let layerSelectWidget = null;
        if (this.state.activeDatasetLayer && this.state.datasetLayers) {
            layerSelectWidget = (
                <Combobox
                    data={this.state.datasetLayers.map((layer) => ({ id: layer.name, label: layer.title }))}
                    onChange={(value) => this.setActiveLayer(value)}
                    textField="label"
                    value={this.state.activeDatasetLayer}
                    valueField="id"
                />
            );
        }

        let zAxisWidget = null;
        if (this.state.metadata?.zaxis) {
            zAxisWidget = (
                <Combobox
                    data={this.state.metadata.zaxis.values}
                    onChange={(value) => this.changeParam("zValue", value)}
                    value={this.state.zValue}
                />
            );
        }

        let timeWidget = null;
        if (this.state.metadata?.datesWithData) {
            const dates = this.state.metadata.datesWithData;
            timeWidget = (<DatePicker
                filterDate={(date) =>
                    dates[date.getFullYear()] &&
                    dates[date.getFullYear()][date.getMonth()] &&
                    dates[date.getFullYear()][date.getMonth()].includes(date.getDate())
                }
                onChange={(date) => this.changeParam("date", date)}
                selected={this.state.date}
            />);
        }

        return (
            <ResizeableWindow icon="catalog" initialHeight={this.props.windowSize.height} initialWidth={this.props.windowSize.width}
                onClose={this.onClose} title="NetCDF Explorer" >
                <div className="layer-catalog" role="body">
                    <Combobox
                        data={["spain", "example", "ccsm"]}
                        onChange={(value) => {this.setDataset(value);}}
                        value={this.state.dataset}
                    />
                    {layerSelectWidget}
                    {timeWidget}
                    {zAxisWidget}
                </div>
            </ResizeableWindow>
        );
    }
    onClose = () => {
        if (this.state.layerUuid) {
            this.props.removeLayer(this.state.layerUuid);
        }
        this.props.setCurrentTask(null);
        this.setState({ layerUuid: null, dataset: null, activeDatasetLayer: null });
    };
}

export default connect(state => ({
    active: state.task.id === "NetCDFExplorer"
    // layers: state.layers.flat,
}), {
    changeLayerProperty: changeLayerProperty,
    setCurrentTask: setCurrentTask,
    addLayer: addLayer,
    removeLayer: removeLayer
})(NetCDFExplorer);
