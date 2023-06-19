/**
 * Copyright BGEO. All rights reserved.
 * The program is free software: you can redistribute it and/or modify it under the terms of the GNU
 * General Public License as published by the Free Software Foundation, either version 3 of the License,
 * or (at your option) any later version
 */

import isEmpty from 'lodash.isempty';
import ConfigUtils from 'qwc2/utils/ConfigUtils';
import VectorLayerUtils from 'qwc2/utils/VectorLayerUtils';
import ol from 'openlayers';

const GwUtils = {
    getServiceUrl(service) {
        const request_url = ConfigUtils.getConfigProp("giswaterServiceUrl")
        if (isEmpty(request_url)) {
            return "";
        }
        return request_url + service + "/";
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
        this._handleWidget(form.ui.widget, func)
    },
    forEachWidgetInLayout(layout, func) {
        this._handleLayout(layout, func)
    },
    _handleWidget(widget, func) {
        func(widget)

        if (widget.layout) {
            this._handleLayout(widget.layout, func)
        }
        else if (widget.widget) {
            widget.widget.map(tab => {
                this._handleWidget(tab, func)
            })
        }
    },
    _handleLayout(layout, func) {
        layout.item.map(item => {
            if (item.layout) {
                this._handleLayout(item.layout, func)
            }
            else if (item.widget) {
                this._handleWidget(item.widget, func)
            }
        })
    },
    getGeoJSONFeatures(data, styleName=null, styleOptions=null) {
        if (isEmpty(data.features)) {
            return []
        }
        let defaultCrs = "EPSG:25831";
        let defaultStyleName = 'default'
        let defaultStyleOptions = {
            strokeColor: [255, 0, 0, 1],
            strokeWidth: 4,
            strokeDash: [4],
            fillColor: [255, 255, 255, 0.33],
            textFill: "blue",
            textStroke: "white",
            textFont: '20pt sans-serif'
        }
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
            if (feature.crs && feature.crs.properties && feature.crs.properties.name) {
                crs = CoordinatesUtils.fromOgcUrnCrs(data.crs.properties.name);
            } else if (typeof feature.crs === "string") {
                crs = feature.crs;
            }
            if (feature.geometry && feature.geometry.coordinates) {
                feature.geometry.coordinates = feature.geometry.coordinates.map(VectorLayerUtils.convert3dto2d);
            }
            
            return { ...feature, 
                crs: crs, 
                styleName: styleName,
                styleOptions: styleOptions
            };
        });
        return features
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
    }
};

export default GwUtils;