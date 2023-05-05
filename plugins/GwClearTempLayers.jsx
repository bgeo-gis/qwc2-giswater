/**
 * Copyright BGEO. All rights reserved.
 * The program is free software: you can redistribute it and/or modify it under the terms of the GNU
 * General Public License as published by the Free Software Foundation, either version 3 of the License,
 * or (at your option) any later version
 */

import React from 'react';
import PropTypes from 'prop-types';
import {connect} from 'react-redux';
import Icon from 'qwc2/components/Icon';
import { removeLayer } from 'qwc2/actions/layers';
import 'qwc2/plugins/style/Buttons.css'

class GwClearTempLayersButton extends React.Component {
    static propTypes = {
        position: PropTypes.number,
        removeLayer: PropTypes.func
    };
    clearLayers() {
        this.props.removeLayer("temp_points.geojson")
        this.props.removeLayer("temp_lines.geojson")
        this.props.removeLayer("temp_polygons.geojson")
    }
    render() {
        return (
            <button className="map-button"
                onClick={() => this.clearLayers()}
                style={{bottom: (5 + 4 * this.props.position) + 'em'}}
                title="Clear Temporal Layers"
            >
                <Icon icon="trash" title="Clear Temporal Layers"/>
            </button>
        );
    }
}

export default connect((state) => ({
}), {
    removeLayer: removeLayer
})(GwClearTempLayersButton);