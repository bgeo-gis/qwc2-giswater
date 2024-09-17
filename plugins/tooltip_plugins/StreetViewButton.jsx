import React from 'react';
import PropTypes from 'prop-types';
import proj4 from 'proj4';

class StreetViewButton extends React.Component {
    static propTypes = {
        point: PropTypes.object.isRequired,
        projection: PropTypes.string.isRequired,
        heading: PropTypes.number,
        pitch: PropTypes.number,
        fov: PropTypes.number
    };

    static defaultProps = {
        heading: 0,
        pitch: 0,
        fov: 90
    };

    // Convert to EPSG:4326
    convertCoordinates = (coordinate) => {
        const sourceCRS = this.props.projection;
        const targetCRS = 'EPSG:4326';
        return proj4(sourceCRS, targetCRS, coordinate);
    };

    // Open Google Street View in a floating window
    openStreetView = () => {
        const { coordinate } = this.props.point;
        const [longitude, latitude] = this.convertCoordinates(coordinate);

        console.log("Converted coordinates:", latitude, longitude);

        const { heading, pitch, fov } = this.props;
        const streetViewUrl = `https://www.google.com/maps/@?api=1&map_action=pano&viewpoint=${latitude},${longitude}&heading=${heading}&pitch=${pitch}&fov=${fov}`;

        const width = 450;
        const height = window.innerHeight * 0.8;
        const left = window.innerWidth - width;
        const top = (window.innerHeight - height) / 2;

        window.open(
            streetViewUrl,
            'StreetViewWindow',
            `width=${width},height=${height},top=${top},left=${left},toolbar=no,location=no,menubar=no,scrollbars=no,status=no,resizable=yes`
        );
    };

    render() {
        return (
            <button className="button" onClick={this.openStreetView}>
                Street View
            </button>
        );
    }
}

export default StreetViewButton;
