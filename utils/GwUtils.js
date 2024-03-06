/**
 * Copyright BGEO. All rights reserved.
 * The program is free software: you can redistribute it and/or modify it under the terms of the GNU
 * General Public License as published by the Free Software Foundation, either version 3 of the License,
 * or (at your option) any later version
 */

import isEmpty from 'lodash.isempty';
import ConfigUtils from 'qwc2/utils/ConfigUtils';
import VectorLayerUtils from 'qwc2/utils/VectorLayerUtils';
import CoordinatesUtils from 'qwc2/utils/CoordinatesUtils';
import ol from 'openlayers';

import url from 'url';
import axios from 'axios';
import {LayerRole} from 'qwc2/actions/layers';
import LayerUtils from 'qwc2/utils/LayerUtils';


import {UrlParams} from 'qwc2/utils/PermaLinkUtils';

const GwUtils = {
    getServiceUrl(service) {
        const requestUrl = ConfigUtils.getConfigProp("giswaterServiceUrl");
        if (isEmpty(requestUrl)) {
            return "";
        }
        return requestUrl + service + "/";
    },
    findLayer(layer, name, path = []) {
        if (layer.name === name) {
            return { layer, path };
        } else if (layer.sublayers) {
            for (let i = 0; i < layer.sublayers.length; i++) {
                const found = this.findLayer(layer.sublayers[i], name, [...path, i]);
                if (found.layer) {
                    return found;
                }
            }
        }
        return { layer: null, path };
    },
    forEachWidgetInForm(form, func) {
        this._handleWidget(form.ui.widget, func);
    },
    forEachWidgetInLayout(layout, func) {
        this._handleLayout(layout, func);
    },
    _handleWidget(widget, func) {
        func(widget);

        if (widget.layout) {
            this._handleLayout(widget.layout, func);
        } else if (widget.widget) {
            widget.widget.map(tab => {
                this._handleWidget(tab, func);
            });
        }
    },
    _handleLayout(layout, func) {
        layout.item.map(item => {
            if (item.layout) {
                this._handleLayout(item.layout, func);
            } else if (item.widget) {
                this._handleWidget(item.widget, func);
            }
        });
    },
    getGeoJSONFeatures(styleName = null, data, styleOptions = null, ) {
        if (isEmpty(data.features)) {
            return [];
        }

        let defaultCrs = "EPSG:25831";
        const defaultStyleName = 'default';
        const defaultStyleOptions = {
            strokeColor: [255, 0, 0, 1],
            strokeWidth: 4,
            strokeDash: [4],
            fillColor: [255, 255, 255, 0.33],
            textFill: "blue",
            textStroke: "white",
            textFont: '20pt sans-serif'
        };
        if (!styleName) {
            styleName = defaultStyleName;
        }
        if (!styleOptions) {
            styleOptions = defaultStyleOptions;
        }
        if (data.crs && data.crs.properties && data.crs.properties.name) {
            // Extract CRS from FeatureCollection crs
            defaultCrs = CoordinatesUtils.fromOgcUrnCrs(data.crs.properties.name);
        }
        const features = data.features.map(feature => {
            let crs = defaultCrs;
            if (feature.crs?.properties?.name) {
                crs = CoordinatesUtils.fromOgcUrnCrs(data.crs.properties.name);
            } else if (feature.geometry?.crs?.properties?.name){
                crs = CoordinatesUtils.fromOgcUrnCrs(feature.geometry.crs.properties.name);
            } else if (typeof feature.crs === "string") {
                crs = feature.crs;
            }
            if (feature.geometry && feature.geometry.coordinates) {
                feature.geometry.coordinates = feature.geometry.coordinates.map(VectorLayerUtils.convert3dto2d);
            }
            // [[5,6], pointstyle2], [[5,6], pointstyle2]
            const featureId = feature.properties.feature_id;
            let featureMatch = false;
            let newStyle = null;
            for (let i = 3; i < arguments.length; i++) {
                if (arguments[i][0].includes(featureId)){
                    featureMatch = true;
                    newStyle = arguments[i][1];
                    break;
                }
            }
            return {
                ...feature,
                crs: crs,
                styleName: styleName,
                styleOptions: featureMatch ? newStyle : styleOptions
            };
        });
        return features;
    },
    getGeometryCenter(geom) {
        const geometry = new ol.format.WKT().readGeometry(geom);
        const type = geometry.getType();
        let center = null;
        switch (type) {
        case "Polygon":
            center = geometry.getInteriorPoint().getCoordinates();
            break;
        case "MultiPolygon":
            center = geometry.getInteriorPoints().getClosestPoint(ol.extent.getCenter(geometry.getExtent()));
            break;
        case "Point":
            center = geometry.getCoordinates();
            break;
        case "MultiPoint":
            center = geometry.getClosestPoint(ol.extent.getCenter(geometry.getExtent()));
            break;
        case "LineString":
            center = geometry.getCoordinateAt(0.5);
            break;
        case "MultiLineString":
            center = geometry.getClosestPoint(ol.extent.getCenter(geometry.getExtent()));
            break;
        case "Circle":
            center = geometry.getCenter();
            break;
        default:
            break;
        }
        return center;
    },
    crsStrToInt(crs) {
        const parts = crs.split(':');
        return parseInt(parts.slice(-1), 10);
    },
    generatePermaLink(state, coordinates, callback, user = false) {
        const fullUrl = UrlParams.getFullUrl();
        if (!ConfigUtils.getConfigProp("permalinkServiceUrl")) {
            callback(fullUrl);
            return;
        }
        const permalinkState = {};
        if (ConfigUtils.getConfigProp("storeAllLayersInPermalink")) {
            permalinkState.layers = state.layers.flat.filter(layer => layer.role !== LayerRole.BACKGROUND);
        } else {
            // Only store redlining layers
            const exploded = LayerUtils.explodeLayers(state.layers.flat.filter(layer => layer.role !== LayerRole.BACKGROUND));
            const redliningLayers = exploded.map((entry, idx) => ({...entry, pos: idx}))
                .filter(entry => entry.layer.role === LayerRole.USERLAYER && entry.layer.type === 'vector')
                .map(entry => ({...entry.layer, pos: entry.pos}));
            permalinkState.layers = redliningLayers;
        }
        const url = new URL(fullUrl);
        url.searchParams.set('c', coordinates);
        const updatedUrl = url.toString();
        permalinkState.url = updatedUrl;
        const route = user ? "userpermalink" : "createpermalink";
        console.log("state -> ", permalinkState);
        axios.post(ConfigUtils.getConfigProp("permalinkServiceUrl").replace(/\/$/, '') + "/" + route, permalinkState)
            .then(response => callback(response.data.permalink || fullUrl))
            .catch(() => callback(fullUrl));
    }
};

export default GwUtils;
