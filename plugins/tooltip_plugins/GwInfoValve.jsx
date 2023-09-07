import React from 'react';
import PropTypes from 'prop-types';
import {connect} from 'react-redux';
import {createSelector} from 'reselect';
import isEmpty from 'lodash.isempty'
import displayCrsSelector from 'qwc2/selectors/displaycrs';
import {setCurrentTask} from 'qwc2/actions/task';
import { LayerRole, refreshLayer, removeLayer, addLayerFeatures } from 'qwc2/actions/layers';
import ConfigUtils from 'qwc2/utils/ConfigUtils';
import GwUtils from '../../utils/GwUtils';
import { processFinished, processStarted } from 'qwc2/actions/processNotifications';

import IdentifyUtils from 'qwc2/utils/IdentifyUtils';
import axios from 'axios';
import MapUtils from 'qwc2/utils/MapUtils';
import Icon from 'qwc2/components/Icon';
import VectorLayerUtils from 'qwc2/utils/VectorLayerUtils';

import { setIdentifyResult } from '../../actions/info';

class GwInfoValve extends React.Component {
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
        addLayerFeatures: PropTypes.func,
        setIdentifyResult: PropTypes.func
    };
    static defaultProps = {
        standardLinesStyle: {
           strokeColor: {
                trace: [235, 167, 48, 1],
                exit: [235, 74, 117, 1]
            },
            strokeWidth: 6,
            strokeDash: [1],
            fillColor: [255, 255, 255, 0.33],
            textFill: "blue",
            textStroke: "white",
            textFont: "20pt sans-serif"
        },
        standardPointsStyle: {
            strokeColor: {
              "trace": [235, 167, 48, 1],
              "exit": [235, 74, 117, 1]
            },
            strokeWidth: 2,
            strokeDash: [4],
            fillColor: [191, 156, 40, 0.33],
            textFill: "blue",
            textStroke: "white",
            textFont: "20pt sans-serif"
        }
    };
    state = {
        elevation: null, 
        extraInfo: null, 
        gwInfoResponse: null, 
        loadedComponents : [],
        infoButtons: null,
        loading: true,
    };
    componentDidMount(){
        this.setState({point: this.props.point})
        const point = this.props.point;
        this.loadValveResult(point);
    }
    componentDidUpdate(prevProps) {
        if (prevProps.point !== this.props.point){
            this.clear();
            this.loadValveResult(this.props.point)
        }
    };
    componentWillUnmount(){
        this.clear();
    }
    loadValveResult = (point) => {
        let gwInfoResponse = null;
        const gwInfoService = (GwUtils.getServiceUrl("info") || "");
        const queryableLayers = IdentifyUtils.getQueryLayers(this.props.layers, this.props.map);
        const queryLayers = queryableLayers.reduce((acc, layer) => {
            return acc.concat(layer.queryLayers);
        }, []);
        const epsg = parseInt(this.props.map.projection.split(':').slice(-1), 10);
        const zoomRatio = MapUtils.computeForZoom(this.props.map.scales, this.props.map.zoom);
        const params = {
            theme: this.props.theme.title,
            epsg: epsg,
            xcoord: point.coordinate[0],
            ycoord: point.coordinate[1],
            zoomRatio: zoomRatio,
            layers: queryLayers.join(',')
        };
        axios.get(gwInfoService + 'getlayersfromcoordinates', {params: params}).then(response => {
            gwInfoResponse = response.data
            if (gwInfoResponse) {
                this.setState({gwInfoResponse: gwInfoResponse, loading: false});
            }
        }).catch((e) => {
            console.log(e);
        });
    }
    toggleValveState = (data) => {
        const id = data.id;
        const tableName = data.tableName;
        const value = data.value;
        const fields = {closed: value};

        const requestUrl = GwUtils.getServiceUrl("util");
        if (!isEmpty(requestUrl)) {
            const params = {
                theme: this.props.theme.title,
                id: id,
                tableName: tableName,
                fields: JSON.stringify(fields)
            };

            axios.put(requestUrl + "setfields", { ...params }).then(() => {
                // refresh map
                if (this.props.theme.tiled) {
                    this.refreshTiles();
                } else {
                    this.props.refreshLayer(layer => layer.role === LayerRole.THEME);
                }
                // close
                this.clear();
                this.props.closePopup();
            }).catch((e) => {
                console.log(e);
            });
        }
    };
    refreshTiles = () => {
        const requestUrl = ConfigUtils.getConfigProp("tilingServiceUrl");
        if (isEmpty(requestUrl)) {
            return;
        }

        const params = {
            theme: this.props.theme.title
        };

        const processNotificationId = `tiling_msg-${+new Date()}`;
        this.props.processStarted(processNotificationId, "Updating tiles");
        // Send request
        axios.get(requestUrl + "update", { params: params }).then(response => {
            this.props.processFinished(processNotificationId, true, "Update successful");
            const result = response.data;
            this.props.refreshLayer(layer => layer.role === LayerRole.THEME);
        }).catch((e) => {
            console.log(e);
            this.props.processFinished(processNotificationId, false, "Update failed");
        });
    };
    clear = () => {
        this.props.removeLayer("identifyslection");
        this.setState({point: null, height: null, extraInfo: null, gwInfoResponse: null, loading: true});
    };
    showInfo = (selection, table) => {
        const requestUrl = GwUtils.getServiceUrl("info");
        if (!isEmpty(requestUrl)) {
            const params = {
                theme: this.props.theme.title,
                id: (selection.id).toString(),
                tableName: table
            };
            axios.get(requestUrl + "fromid", { params: params }).then((response) => {
                const result = response.data;
                this.props.setIdentifyResult(result);
                //this.setState({ identifyResult: result });
            }).catch((e) => {
                console.log(e);
            });
        }
    };
    highLightFeature = (selection) => {
        this.props.removeLayer("identifyslection");
        const layer = {
            id: "identifyslection",
            role: LayerRole.SELECTION
        };
        const crs = this.props.map.projection;
        const geometry = VectorLayerUtils.wktToGeoJSON(selection.geometry, crs, crs);
        const feature = {
            id: selection.id,
            geometry: geometry.geometry
        };
        this.props.addLayerFeatures(layer, [feature], true);
    };
    highLightMultipleFeatures = (selection) => {
        let features = [];
        this.props.removeLayer("identifyslection");
        const layer = {
            id: "identifyslection",
            role: LayerRole.SELECTION
        };
        const crs = this.props.map.projection;
        selection.map((values, index) => (
            (values.ids).map((subValues, index) => {
                const geometry = VectorLayerUtils.wktToGeoJSON(subValues.geometry, crs, crs);
                const feature = {
                    id: selection.id,
                    geometry: geometry.geometry
                };
                features.push(feature);
            })
        ));
        this.props.addLayerFeatures(layer, features, true);
    };
    getLastWordFromLayer = (inputString) => {
        const words = inputString.split('_');
        const lastWord = words[words.length - 1];
        const capitalCaseLastWord = lastWord.charAt(0).toUpperCase() + lastWord.slice(1).toLowerCase();
        return capitalCaseLastWord;
      }
    render() {
        const { loading, gwInfoResponse } = this.state;
        if (loading){
            return null;
        }

        let infoButtons = null;
        if (gwInfoResponse && !isEmpty(gwInfoResponse.body?.data?.layersNames)) {
            let valveButton = null;
            let values = null;
            if (gwInfoResponse.body?.data?.valve) {
                valveButton = (
                    <td>
                        <button className="button" onClick={() => this.toggleValveState(gwInfoResponse.body.data.valve)}>{gwInfoResponse.body.data.valve.text}</button>
                    </td>
                );
            }
            if (gwInfoResponse.body?.data?.layersNames) {
                let layernames = gwInfoResponse.body?.data?.layersNames;
                values = (
                    <td>
                        <div className="hover-dropdown">
                            <button>Features</button>
                            <div className="dropdown-content">
                                {layernames.map((values, index) => (
                                    <div key={index} className="hover-dropdown-item">
                                        <span className="first-item">{this.getLastWordFromLayer(values.layerName)}</span>
                                        <Icon className="item-icon" icon="chevron-right"/>
                                        <div className="dropdown-content">
                                            {(values.ids).map((subValues, index) => (
                                                <span key={index} onMouseEnter={() => this.highLightFeature(subValues)} onClick={() => this.showInfo(subValues, values.layerName)}>{subValues.label}</span>
                                            ))}
                                        </div>
                                    </div>
                                ))}
                                <hr/>
                                <div className="hover-dropdown-item" onMouseEnter={() => this.highLightMultipleFeatures(layernames)}>
                                    Identify All ({layernames.reduce((partialSum, component) => partialSum + (component.ids).length,0)})
                                </div>
                            </div>
                        </div>
                    </td>
                );
            }
            infoButtons = (
                <table className="mapinfotooltip-body-gwinfo">
                    <tbody>
                        <tr>
                            {values}
                        </tr>
                        <tr>
                            {valveButton}
                        </tr>
                    </tbody>
                </table>
            );
        }

        return infoButtons;
        
    }
}

const selector = createSelector([state => state, displayCrsSelector], (state, displaycrs) => ({
    enabled: state.identify.tool !== null,
    map: state.map,
    displaycrs: displaycrs,
    theme: state.theme.current,
    layers: state.layers.flat
}));

export default connect(selector, {
    setCurrentTask: setCurrentTask,
    refreshLayer: refreshLayer,
    processStarted: processStarted,
    processFinished: processFinished,
    removeLayer: removeLayer,
    addLayerFeatures: addLayerFeatures,
    setIdentifyResult: setIdentifyResult
})(GwInfoValve);