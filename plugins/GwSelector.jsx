import axios from 'axios';
import React from 'react';
import {connect} from 'react-redux';
import PropTypes from 'prop-types';
import isEmpty from 'lodash.isempty';
import SideBar from 'qwc2/components/SideBar';
import IdentifyUtils from 'qwc2/utils/IdentifyUtils';
import ConfigUtils from 'qwc2/utils/ConfigUtils';

import QtDesignerForm from 'qwc2/components/QtDesignerForm';
import GwInfoQtDesignerForm from '../components/GwInfoQtDesignerForm';

class GwSelector extends React.Component {
    static propTypes = {
        addMarker: PropTypes.func,
        changeSelectionState: PropTypes.func,
        click: PropTypes.object,
        currentIdentifyTool: PropTypes.string,
        currentTask: PropTypes.string,
        initialHeight: PropTypes.number,
        initialWidth: PropTypes.number,
        initialX: PropTypes.number,
        initialY: PropTypes.number,
        layers: PropTypes.array,
        map: PropTypes.object,
        removeLayer: PropTypes.func,
        removeMarker: PropTypes.func,
        selection: PropTypes.object
    }
    static defaultProps = {
        replaceImageUrls: true,
        initialWidth: 240,
        initialHeight: 320,
        initialX: 0,
        initialY: 0
    }
    state = {
        selectorResult: null,
        pendingRequests: false
    }

    crsStrToInt = (crs) => {
        const parts = crs.split(':')
        return parseInt(parts.slice(-1))
    }
    filterLayers = () => {
        const queryableLayers = this.getQueryableLayers();

        if (!isEmpty(queryableLayers)) {
            // Get request paramas
            const layer = queryableLayers[0];
            console.log(queryableLayers);
            layer.params.FILTER = "v_edit_link:\"expl_id\" = '1';v_edit_arc:\"expl_id\" = '1';v_edit_gully:\"expl_id\" = '1';v_edit_connec:\"expl_id\" = '1';v_edit_node:\"expl_id\" = '1'";
            // this.panToResult();
        }
    }
    panToResult = (result) => {
        // TODO: Maybe we should zoom to the result as well
        if (!isEmpty(result)) {
            // const center = this.getGeometryCenter(result.feature.geometry)
            // this.props.panTo(center, this.props.map.projection)
        }
    }
    componentDidUpdate(prevProps, prevState) {
        // this.setState({selectorResult: {}, pendingRequests: false})
    }
    onShow = () => {
        // Make service request
        this.makeRequest();
    }
    onToolClose = () => {
        this.setState({selectorResult: null, pendingRequests: false});
    }
    clearResults = () => {
        this.setState({selectorResult: null, pendingRequests: false});
    }
    getQueryableLayers = () => {
        if ((typeof this.props.layers === 'undefined' || this.props.layers === null) || (typeof this.props.map === 'undefined' || this.props.map === null)) {
            console.log("return", this.props.layers, this.props.map);
            return [];
        }

        return IdentifyUtils.getQueryLayers(this.props.layers, this.props.map).filter(l => {
            return l.url === "http://162.55.167.202/qgisserver" // TODO: Hardcoded
        });
    }
    updateField = (widgetName, ev, action) => {
        
        let pendingRequests = false;

        const queryableLayers = this.getQueryableLayers();
        const request_url = ConfigUtils.getConfigProp("gwSelectorServiceUrl")
        if (!isEmpty(queryableLayers) && !isEmpty(request_url)) {
            // Get request paramas
            const layer = queryableLayers[0];
            const epsg = this.crsStrToInt(this.props.map.projection)
            const selectorType = "selector_basic"; // TODO: get this from json key 'selectorType'
            const tabName = action.params.tabName;
            const id = action.params.id;
            const isAlone = false;
            const disableParent = false; // TODO?: get if shift is pressed (depending on)
            const value = action.params.value == 'False';
            const addSchema = "NULL"; // TODO?: allow addSchema
            const params = {
                "theme": layer.title,
                "epsg": epsg,
                "selectorType": selectorType,
                "tabName": tabName,
                "id": id,
                "isAlone": isAlone,
                "disableParent": disableParent,
                "value": value,
                "addSchema": addSchema
            }

            // Send request
            pendingRequests = true
            axios.get(request_url + "setselector", {params: params}).then(response => {
                const result = response.data
                this.setState({selectorResult: result, pendingRequests: false});
            }).catch((e) => {
                console.log(e);
                this.setState({pendingRequests: false});
            });
        }
    }
    dispatchButton = (action, ev = null) => {
        let pendingRequests = false;
        switch (action.name) {
            case "setSelectors":
                // this.filterLayers();

                const queryableLayers = this.getQueryableLayers();
                const request_url = ConfigUtils.getConfigProp("gwSelectorServiceUrl")
                if (!isEmpty(queryableLayers) && !isEmpty(request_url)) {
                    // Get request paramas
                    const layer = queryableLayers[0];
                    const epsg = this.crsStrToInt(this.props.map.projection)
                    const selectorType = "selector_basic"; // TODO: get this from json key 'selectorType'
                    const tabName = action.params.tabName;
                    const id = action.params.id;
                    const isAlone = false;
                    const disableParent = false; // TODO?: get if shift is pressed (depending on)
                    console.log("ev =", ev);
                    const value = ev == 0;
                    const addSchema = "NULL"; // TODO?: allow addSchema
                    const params = {
                        "theme": layer.title,
                        "epsg": epsg,
                        "selectorType": selectorType,
                        "tabName": tabName,
                        "id": id,
                        "isAlone": isAlone,
                        "disableParent": disableParent,
                        "value": value,
                        "addSchema": addSchema
                    }
        
                    // Send request
                    pendingRequests = true
                    axios.get(request_url + "setselector", {params: params}).then(response => {
                        const result = response.data
                        this.setState({selectorResult: result, pendingRequests: false});
                    }).catch((e) => {
                        console.log(e);
                        this.setState({pendingRequests: false});
                    });
                }
                break;

            default:
                console.warn(`Action \`${action.name}\` cannot be handled.`)
                break;
        }
    }
    makeRequest() {
        let pendingRequests = false;

        const queryableLayers = this.getQueryableLayers();

        const request_url = ConfigUtils.getConfigProp("gwSelectorServiceUrl")
        if (!isEmpty(queryableLayers) && !isEmpty(request_url)) {
            // Get request paramas
            const layer = queryableLayers[0];
            const epsg = this.crsStrToInt(this.props.map.projection)
            const params = {
                "theme": layer.title,
                "epsg": epsg,
                "currentTab": "tab_exploitation",
                "selectorType": "selector_basic"
            }

            // Send request
            pendingRequests = true
            axios.get(request_url + "getselector", {params: params}).then(response => {
                const result = response.data
                this.setState({selectorResult: result, pendingRequests: false});
            }).catch((e) => {
                console.log(e);
                this.setState({pendingRequests: false});
            });
        }
        // Set "Waiting for request..." message
        this.setState({selectorResult: {}, pendingRequests: pendingRequests});
    }
    render() {
        // Create window
        let body = null;
        if (this.state.pendingRequests === true || this.state.selectorResult !== null) {
            if (isEmpty(this.state.selectorResult)) {
                if (this.state.pendingRequests === true) {
                    body = (<div className="selector-body" role="body"><span className="selector-body-message">Querying...</span></div>); // TODO: TRANSLATION
                } else {
                    body = (<div className="selector-body" role="body"><span className="selector-body-message">No result</span></div>); // TODO: TRANSLATION
                }
            } else {
                const result = this.state.selectorResult
                // body = (
                //     <div className="selector-body" role="body">
                //         <GwInfoQtDesignerForm form_xml={result.form_xml} readOnly={true} dispatchButton={this.dispatchButton} />
                //     </div>
                // )
                // console.log(result.form_xml);
                body = (
                    <div className="selector-body" role="body">
                        <GwInfoQtDesignerForm form_xml={result.form_xml} readOnly={false} dispatchButton={this.dispatchButton} updateField={this.updateField}/>
                    </div>
                )
            }
        }
        return (
            <SideBar icon="selector" id="GwSelector" title="GW Selector"
            key="GwSelectorNull" onShow={this.onShow}>
                {body}
            </SideBar>
        );
    }
}

const selector = (state) => ({
    currentTask: state.task.id,
    layers: state.layers.flat,
    map: state.map
});

export default connect(selector, {
})(GwSelector);