/**
 * Copyright © 2025 by BGEO. All rights reserved.
 * The program is free software: you can redistribute it and/or modify it under the terms of the GNU
 * General Public License as published by the Free Software Foundation, either version 3 of the License,
 * or (at your option) any later version
 */

import React from 'react';
import {connect} from 'react-redux';
import PropTypes from 'prop-types';
import TaskBar from 'qwc2/components/TaskBar';
import { setCurrentTask } from 'qwc2/actions/task';

class GwHelp extends React.Component {
    static propTypes = {

        helpLink: PropTypes.string,
        setCurrentTask: PropTypes.func
    };

    static defaultProps = {
        helpLink: "https://qwc2.bgeo.es/legal/"
    };

    handleButtonClick = () => {
        const { helpLink } = this.props;

        if (helpLink.startsWith("https")) {
            window.open(helpLink, '_blank');
        } else {
            window.open(`assets/pdf/${helpLink}`, '_blank');
        }
        this.props.setCurrentTask(null);
    };

    render() {
        return [(
            <TaskBar key="GwHelpTaskBar"  onHide={this.onToolClose} onShow={this.handleButtonClick} task="GwHelp">
                {() => ({
                })}
            </TaskBar>
        )];
    }
}


export default connect(() => ({}), {
    setCurrentTask: setCurrentTask
})(GwHelp);


