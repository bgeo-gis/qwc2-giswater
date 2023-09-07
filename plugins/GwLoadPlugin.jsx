/**
 * Copyright © 2023 by BGEO. All rights reserved.
 * The program is free software: you can redistribute it and/or modify it under the terms of the GNU
 * General Public License as published by the Free Software Foundation, either version 3 of the License,
 * or (at your option) any later version
 */

import axios from 'axios';
import React from 'react';
import { connect } from 'react-redux';
import PropTypes from 'prop-types';
import isEmpty from 'lodash.isempty';
import GwUtils from '../utils/GwUtils';


class GwLoadPlugin extends React.Component {
    static propTypes = {
        currentTask: PropTypes.string,
        layers: PropTypes.array,
        map: PropTypes.object,
        theme: PropTypes.object
    };

    state = {
        pendingRequests: false
    };

    constructor(props) {
        super(props);
    }

    componentDidUpdate(prevProps, prevState) {
        if (prevProps.theme !== this.props.theme) {
            this.makeRequest();
        }
    }

    makeRequest() {
        const requestUrl = GwUtils.getServiceUrl("util");
        if (!isEmpty(requestUrl)) {
            // Get request paramas
            const epsg = GwUtils.crsStrToInt(this.props.map.projection);
            const params = {
                theme: this.props.theme.title,
                epsg: epsg
            };

            // Send request
            axios.post(requestUrl + "setinitproject", { ...params }).then(response => {
                const result = response.data;
                console.log("LOADED PLUGIN: ", result);
                this.setState({pendingRequests: false });
            }).catch((e) => {
                console.log(e);
                this.setState({ pendingRequests: false });
            });
        }

    }

    render() {
        return null;
    }
}

const loadplugin = (state) => ({
    currentTask: state.task.id,
    layers: state.layers.flat,
    map: state.map,
    theme: state.theme.current
});

export default connect(loadplugin, {})(GwLoadPlugin);
