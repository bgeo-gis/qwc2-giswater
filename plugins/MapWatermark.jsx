/**
 * Copyright BGEO. All rights reserved.
 * The program is free software: you can redistribute it and/or modify it under the terms of the GNU
 * General Public License as published by the Free Software Foundation, either version 3 of the License,
 * or (at your option) any later version
 */

import React from 'react';
import {connect} from 'react-redux';
import PropTypes from 'prop-types';
import ConfigUtils from 'qwc2/utils/ConfigUtils';
// import 'qwc2/plugins/style/MapCopyright.css';
import 'qwc2-giswater/plugins/style/MapWatermark.css';


/**
 * Displays layer attributions in the bottom right corner of the map.
 */
class MapWatermark extends React.Component {
    static propTypes = {
        mobile: PropTypes.bool,
        /** The logo file format. */
        logoFormat: PropTypes.string,
        /** The logo image URL if a different source than the default assets/img/logo.<ext> and assets/img/logo-mobile.<ext> is desired. */
        logoSrc: PropTypes.string,
        /** The hyperlink to open when the logo is clicked. */
        logoUrl: PropTypes.string,
        width: PropTypes.string,
        bottom: PropTypes.string,
        opacity: PropTypes.string,
    };
    static defaultProps = {
        logoFormat: "svg",
        width: "100px",
        bottom: "3em",
        opacity: "60%",
    };
    render() {
        let logo;
        const assetsPath = ConfigUtils.getAssetsPath();
        if (this.props.mobile) {
            logo = assetsPath + "/img/logo-mobile." + this.props.logoFormat;
        } else {
            logo = assetsPath + "/img/logo."  + this.props.logoFormat;
        }

        const style = {
            width: this.props.width,
            bottom: this.props.bottom,
            opacity: this.props.opacity,
        }

        let logoEl = (<img className="logo" src={this.props.logoSrc || logo} />);
        if (this.props.logoUrl) {
            logoEl = (<a href={this.props.logoUrl} rel="noreferrer" target="_blank">{logoEl}</a>);
        }
        return (
            <div id="MapWatermark" style={style}>
                {logoEl}
            </div>
        );
    }
}

const selector = (state) => ({
    mobile: state.browser.mobile,
});

export default connect(selector, {})(MapWatermark);
