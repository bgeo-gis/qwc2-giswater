/**
 * Copyright © 2025 by BGEO. All rights reserved.
 * The program is free software: you can redistribute it and/or modify it under the terms of the GNU
 * General Public License as published by the Free Software Foundation, either version 3 of the License,
 * or (at your option) any later version
 */

import React from 'react';
import { connect } from 'react-redux';
import MapButton from 'qwc2/components/MapButton';
import { removeLayer } from 'qwc2/actions/layers';
import { setCurrentTask } from 'qwc2/actions/task';
import { LayerRole } from 'qwc2/actions/layers';
import {changeRedliningState} from 'qwc2/actions/redlining';

type GwClearTempLayersButtonProps = {
    closeTasks: boolean,
    position: number,
    layers: any[],
    removeLayer: (layerId: any) => void,
    setCurrentTask: (task: any) => void,
    currentTask: string,
    changeRedliningState: (task: any) => void
};

class GwClearTempLayersButton extends React.Component<GwClearTempLayersButtonProps> {

    redliningOpen: boolean;

    static defaultProps: Partial<GwClearTempLayersButtonProps> = {
        closeTasks: false
    };

    constructor(props) {
        super(props);
        this.redliningOpen = false;
    }

    componentDidUpdate(prevProps) {
        if (prevProps.currentTask === "Redlining" && this.props.currentTask !== "Redlining" && this.redliningOpen) {
            this.redliningOpen = false;
            this.clearLayers();
        }
    }

    clearLayers() {
        [...this.props.layers].reverse().forEach(layer => {
            if (layer.role === LayerRole.USERLAYER) {
                this.props.removeLayer(layer.id);
            }
        });

        if (this.props.closeTasks) {
            this.props.setCurrentTask(null);
        }
    }

    btnClicked(){
        if (this.props.currentTask === "Redlining"){
            this.props.changeRedliningState({action: null, geomType: null, numericInput: false});
            this.props.setCurrentTask(null);
            this.redliningOpen = true
        }
        else{
            this.clearLayers();
        }
    }

    render() {
        return (
            <MapButton
                icon="trash"
                onClick={() => this.btnClicked()}
                position={this.props.position}
                tooltip="Clear Temporal Layers"
            />
        );
    }
}

export default connect(state => ({ // @ts-ignore
    layers: state.layers.flat,  // @ts-ignore
    currentTask: state.task.id
}), {
    removeLayer: removeLayer,
    setCurrentTask: setCurrentTask,
    changeRedliningState: changeRedliningState
})(GwClearTempLayersButton);
