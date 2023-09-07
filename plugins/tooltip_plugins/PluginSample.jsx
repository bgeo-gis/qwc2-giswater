import React from 'react';
import PropTypes from 'prop-types';
import {connect} from 'react-redux';
import {createSelector} from 'reselect';
import isEmpty from 'lodash.isempty'
import displayCrsSelector from 'qwc2/selectors/displaycrs';;
import {setCurrentTask} from 'qwc2/actions/task';
import { LayerRole, refreshLayer, removeLayer, addLayerFeatures } from 'qwc2/actions/layers';
import { processFinished, processStarted } from 'qwc2/actions/processNotifications';



class PluginSample extends React.Component {
    static propTypes = {
        displaycrs: PropTypes.string,
        enabled: PropTypes.bool,
        layers: PropTypes.array,
        map: PropTypes.object,
        processFinished: PropTypes.func,
        processStarted: PropTypes.func,
        refreshLayer: PropTypes.func,
        setCurrentTask: PropTypes.func,
        theme: PropTypes.object,
        removeLayer: PropTypes.func,
        addLayerFeatures: PropTypes.func
    };
    state = {
        dummyVariable: "Before",
        coordinate: null, 
        elevation: null, 
        extraInfo: null, 
        loadedComponents : [],
        infoButtons: null,
        loading: true,
    };
    componentDidMount(){
        this.setState({newPoint: this.props.newPoint})
        this.changeVariables();
    }
    changeVariables(){
        this.setState({dummyVariable: "After", loading: false});
    }
    // When MapInfoTooltip is closed clear variables/layers
    componentWillUnmount(){
        this.clear();
    }
    
    clear = () => {
        this.setState({coordinate: null, height: null, extraInfo: null, gwInfoResponse: null, loading: true});
    };
    render() {
        const { loading, dummyVariable } = this.state;
        if (loading){
            return null;
        }

        // OnClick remove coordinates
        let body = (
            <button onClick={() => this.props.removeCoordinates()}>{dummyVariable}</button>
        );

        return body;
        
    }
}

const selector = createSelector([state => state, displayCrsSelector], (state, displaycrs) => ({
    // Random variables
    enabled: state.identify.tool !== null,
    map: state.map,
    displaycrs: displaycrs,
    theme: state.theme.current,
    layers: state.layers.flat
}));

export default {
    // Variable to get
    cfg:{
        newPoint: true,
        removeCoordinates: true,
        coordinates: false,
    },
    controls: connect(selector, {
        // Random functions
        setCurrentTask: setCurrentTask,
        refreshLayer: refreshLayer,
        processStarted: processStarted,
        processFinished: processFinished,
        removeLayer: removeLayer,
        addLayerFeatures: addLayerFeatures,
    })(PluginSample)
};