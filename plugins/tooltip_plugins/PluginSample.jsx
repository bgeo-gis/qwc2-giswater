/**
 * Copyright © 2024 by BGEO. All rights reserved.
 * The program is free software: you can redistribute it and/or modify it under the terms of the GNU
 * General Public License as published by the Free Software Foundation, either version 3 of the License,
 * or (at your option) any later version
 */
import React from 'react';
import PropTypes from 'prop-types';
import {connect} from 'react-redux';
import {createSelector} from 'reselect';
import isEmpty from 'lodash.isempty';
import displayCrsSelector from 'qwc2/selectors/displaycrs';
import {setCurrentTask} from 'qwc2/actions/task';
import { LayerRole, refreshLayer, removeLayer, addLayerFeatures } from 'qwc2/actions/layers';
import { processFinished, processStarted } from 'qwc2/actions/processNotifications';


class PluginSample extends React.Component {
    static propTypes = {
        addLayerFeatures: PropTypes.func,
        displaycrs: PropTypes.string,
        enabled: PropTypes.bool,
        layers: PropTypes.array,
        map: PropTypes.object,
        processFinished: PropTypes.func,
        processStarted: PropTypes.func,
        refreshLayer: PropTypes.func,
        removeLayer: PropTypes.func,
        setCurrentTask: PropTypes.func,
        theme: PropTypes.object
    };
    state = {
        dummyVariable: "Before",
        coordinate: null,
        elevation: null,
        extraInfo: null,
        loadedComponents: [],
        infoButtons: null,
        loading: true
    };
    componentDidMount() {
        this.setState({newPoint: this.props.newPoint});
        this.changeVariables();
    }
    changeVariables() {
        this.setState({dummyVariable: "After", loading: false});
    }
    // When MapInfoTooltip is closed clear variables/layers
    componentWillUnmount() {
        this.clear();
    }

    clear = () => {
        this.setState({coordinate: null, height: null, extraInfo: null, gwInfoResponse: null, loading: true});
    };
    render() {
        const { loading, dummyVariable } = this.state;
        if (loading) {
            return null;
        }

        // OnClick remove coordinates
        const body = (
            <button onClick={() => this.props.removeCoordinates()}>{dummyVariable}</button>
        );

        return body;

    }
}

const selector = createSelector([state => state, displayCrsSelector], (state, displaycrs) => ({
    // Random variables
    enabled: state.task.identifyEnabled,
    map: state.map,
    displaycrs: displaycrs,
    theme: state.theme.current,
    layers: state.layers.flat
}));

export default {
    // Variable to get
    cfg: {
        newPoint: true,
        removeCoordinates: true,
        coordinates: false
    },
    controls: connect(selector, {
        // Random functions
        setCurrentTask: setCurrentTask,
        refreshLayer: refreshLayer,
        processStarted: processStarted,
        processFinished: processFinished,
        removeLayer: removeLayer,
        addLayerFeatures: addLayerFeatures
    })(PluginSample)
};
