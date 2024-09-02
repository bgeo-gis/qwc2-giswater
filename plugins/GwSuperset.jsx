/**
 * Copyright © 2024 by BGEO. All rights reserved.
 * The program is free software: you can redistribute it and/or modify it under the terms of the GNU
 * General Public License as published by the Free Software Foundation, either version 3 of the License,
 * or (at your option) any later version
 */

import React from 'react';
import {connect} from 'react-redux';
import PropTypes from 'prop-types';
import TaskBar from 'qwc2/components/TaskBar';
import { setCurrentTask } from 'qwc2/actions/task';

class GwSuperset extends React.Component {
    static propTypes = {

        setCurrentTask: PropTypes.func,
        urlLink: PropTypes.string
    };

    static defaultProps = {
        urlLink: "https://qwc1.bgeo.es/superset"
    };

    handleButtonClick = () => {
        const { urlLink } = this.props;

        if (urlLink.startsWith("https") || urlLink.startsWith("http")) {
            window.open(urlLink, '_blank');
        } else {
            window.open(`assets/pdf/${urlLink}`, '_blank');
        }
        this.props.setCurrentTask(null);
    };

    render() {
        return [(
            <TaskBar key="GwSupersetTaskBar"  onHide={this.onToolClose} onShow={this.handleButtonClick} task="GwSuperset">
                {() => ({
                })}
            </TaskBar>
        )];
    }
}


export default connect(() => ({}), {
    setCurrentTask: setCurrentTask
})(GwSuperset);


