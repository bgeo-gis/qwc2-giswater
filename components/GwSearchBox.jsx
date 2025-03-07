/**
 * Copyright © 2025 by BGEO. All rights reserved.
 * The program is free software: you can redistribute it and/or modify it under the terms of the GNU
 * General Public License as published by the Free Software Foundation, either version 3 of the License,
 * or (at your option) any later version
 */

import React from 'react';
import PropTypes from 'prop-types';
import { connect } from 'react-redux';
import isEmpty from 'lodash.isempty';
import axios from 'axios';
import { panTo, zoomToPoint } from 'qwc2/actions/map';
import { LayerRole, addLayerFeatures, removeLayer, addLayer } from 'qwc2/actions/layers';
import { setCurrentTask } from 'qwc2/actions/task';
import Icon from 'qwc2/components/Icon';
import InputContainer from 'qwc2/components/widgets/InputContainer';
import LocaleUtils from 'qwc2/utils/LocaleUtils';
import MapUtils from 'qwc2/utils/MapUtils';
import MiscUtils from 'qwc2/utils/MiscUtils';
import VectorLayerUtils from 'qwc2/utils/VectorLayerUtils';
import './style/SearchBox.css';

import GwUtils from '../utils/GwUtils';
import {setIdentifyResult} from '../actions/info';

class GwSearchBox extends React.Component {
    static propTypes = {
        addLayer: PropTypes.func,
        addLayerFeatures: PropTypes.func,
        infoDockable: PropTypes.oneOfType([PropTypes.bool, PropTypes.string]),
        layers: PropTypes.array,
        map: PropTypes.object,
        panTo: PropTypes.func,
        removeLayer: PropTypes.func,
        searchFilter: PropTypes.string,
        searchOptions: PropTypes.shape({
            minScaleDenom: PropTypes.number,
            resultLimit: PropTypes.number,
            sectionsDefaultCollapsed: PropTypes.bool
        }),
        setCurrentTask: PropTypes.func,
        setIdentifyResult: PropTypes.func,
        theme: PropTypes.object,
        zoomToPoint: PropTypes.func
    };
    static defaultProps = {
        infoDockable: "right"
    };
    state = {
        searchText: "",
        searchResults: {},
        resultsVisible: false,
        collapsedSections: [],
        identifyResult: null,
        searchAdd: false
    };
    constructor(props) {
        super(props);
        this.searchBox = null;
        this.searchTimeout = null;
        this.preventBlur = false;
    }

    getSearch = () => {
        const requestUrl = GwUtils.getServiceUrl("search");
        if (!isEmpty(requestUrl) && !isEmpty(this.state.searchText)) {
            // TO DO isTiled:True/False
            const filterText = this.state.searchText;
            const filterSearch = '"searchText": { "filterSign":"", "value": "' + filterText + '" } ';

            const params = {
                theme: this.props.theme.title,
                filterFields: filterSearch
            };
            axios.get(requestUrl + "getsearch", { params: params }).then(response => {
                const result = response.data;
                this.setState({ searchResults: result });
            }).catch((e) => {
                console.log(e);
            });
        }
    };

    setSearch = (displayName, section, filterKey, filterValue, execFunc, tableName, searchAdd) => {
        this.setState({ searchText: displayName });
        const requestUrl = GwUtils.getServiceUrl("search");
        if (!isEmpty(requestUrl)) {
            const extras = '"value": "' + displayName + '", "section": "' + section + '", "filterKey": "' + filterKey + '","filterValue": "' + filterValue + '", "execFunc": "' + execFunc + '", "tableName": "' + tableName + '", "searchAdd": "' + searchAdd + '"';
            const params = {
                theme: this.props.theme.title,
                extras: extras
            };
            axios.get(requestUrl + "setsearch", { params: params }).then(response => {
                const result = response.data;
                this.panToResult(result.data.geometry);
                this.highlightResult(result, section);

                // Info if execFunc is present
                if (execFunc) {
                    this.identifyFromId(filterValue, tableName);
                }
                if (section === "basic_search_v2_tab_address" && !searchAdd) {
                    this.searchTextChanged(null, displayName + ", ");
                }
                this.clearResults();
            }).catch((e) => {
                console.log(e);
            });
        }
    };
    identifyFromId = (execParam, tableName) => {
        const requestUrl = GwUtils.getServiceUrl("info");
        if (!isEmpty(requestUrl)) {
            const params = {
                theme: this.props.theme.title,
                id: execParam,
                tableName: tableName
            };
            axios.get(requestUrl + "fromid", { params: params }).then((response) => {
                const result = response.data;
                // this.setState({ identifyResult: result });
                this.props.setIdentifyResult(result);
            }).catch((e) => {
                console.log(e);
            });
        }
        // this.setState({ identifyResult: {} });
    };

    panToResult = (geometry) => {
        if (!isEmpty(geometry)) {
            const center = GwUtils.getGeometryCenter(geometry.st_astext);
            // Pan to result
            this.props.panTo(center, this.props.map.projection);
            // Zoom to result
            const maxZoom = MapUtils.computeZoom(this.props.map.scales, this.props.theme.minSearchScaleDenom || this.props.searchOptions.minScaleDenom);
            this.props.zoomToPoint(center, maxZoom, this.props.map.projection);
        }
    };

    highlightResult = (result, section) => {
        // console.log('result :>> ', result);
        if (isEmpty(result) || !result?.data?.geometry) {
            this.props.removeLayer("identifyslection");
        } else {
            const layer = {
                id: "identifyslection",
                role: LayerRole.SELECTION
            };
            const crs = this.props.map.projection;
            const geometry = VectorLayerUtils.wktToGeoJSON(result.data.geometry.st_astext, crs, crs);
            const feature = {
                id: result.funcValue,
                geometry: geometry.geometry
            };
            this.props.addLayerFeatures(layer, [feature], true);
        }
        this.resultProcessed = true;
        if (section === "basic_search_v2_tab_address") {
            if (this.highlightTimeout) {
                clearTimeout(this.highlightTimeout);
            }
            this.highlightTimeout = setTimeout(() => {
                this.props.removeLayer("identifyslection");
            }, 6000);
        }
    };

    renderSearchResults = () => {
        if (!this.state.resultsVisible || !this.state.searchResults || !this.state.searchResults.data || isEmpty(this.state.searchText)) {
            return null;
        }
        const searchResults = this.state.searchResults;
        const searchResultItems = [];

        searchResults.data.forEach((result) => {
            const searchAdd = result.searchAdd;
            const alias = result.alias;
            const values = result.values;
            const title = alias + " title";
            const body = alias + " body";
            const resultItems = [];

            if (typeof values !== 'undefined') {
                for (const value of result.values) {
                    const display = value.display_name;
                    resultItems.push(
                        <div
                            className="searchbox-result"
                            key={display}
                            onClick={() => this.setSearch(display, result.section, value.key, value.value, result.execFunc, result.tableName, searchAdd)}
                        >
                            <span className="searchbox-result-label" title={display}>
                                {display}
                            </span>
                        </div>
                    );
                }
                searchResultItems.push(
                    <div className="searchbox-results-section" key={alias}>
                        <div className="searchbox-results-section-title" key={title} onClick={() => this.handleCollapseClick(alias)}>
                            <span className={`icon ${this.state.collapsedSections.includes(alias) ? 'icon-expand' : 'icon-collapse'}`} />
                            <span>{result.alias}</span>
                        </div>
                        {!this.state.collapsedSections.includes(alias) && (
                            <div className="searchbox-results-section-body" key={body}>
                                {resultItems}
                            </div>
                        )}
                    </div>
                );
            }
        });

        return (
            <div className="searchbox-results" key="searchbox-results" onMouseDown={this.setPreventBlur} ref={MiscUtils.setupKillTouchEvents}>
                {searchResultItems.length > 0 ? (
                    searchResultItems
                ) : (
                    <p>No results found.</p>
                )}
            </div>
        );
    };

    setPreventBlur = () => {
        this.preventBlur = true;
        setTimeout(() => { this.preventBlur = false; return false; }, 100);
    };

    handleCollapseClick = (section) => {
        this.setState(prevState => {
            const { collapsedSections } = prevState;
            const index = collapsedSections.indexOf(section);
            if (index > -1) {
                return { collapsedSections: [...collapsedSections.slice(0, index), ...collapsedSections.slice(index + 1)] };
            }
            return { collapsedSections: [...collapsedSections, section] };
        }, () => {
            console.log('collapsedSections:', this.state.collapsedSections);
        });
    };

    render() {
        const placeholder = LocaleUtils.tr("searchbox.placeholder");
        let resultWindow = null;

        resultWindow = (
            <div className="SearchBox" key="GwSearchBox">
                <InputContainer className="searchbox-field">
                    <Icon icon="search" role="prefix" />
                    <input onBlur={this.onBlur} onChange={ev => this.searchTextChanged(ev.target, ev.target.value)}
                        onFocus={this.onFocus} onKeyDown={this.onKeyDown}
                        onPaste={ev => ev.target.setAttribute('__pasted', 1)}
                        placeholder={placeholder} ref={el => { this.searchBox = el; }}
                        role="input"
                        type="text" value={this.state.searchText} />
                    <Icon icon="remove" onClick={this.clear} role="suffix" />
                </InputContainer>
                {this.renderSearchResults()}
            </div>
        );
        /*
        if (!isEmpty(this.state.identifyResult)) {
            bodyInfo = (
                <GwInfo dockable={this.props.infoDockable} identifyResult={this.state.identifyResult} initialHeight={800} initialWidth={480}
                    initiallyDocked
                    key="GwInfoFromSearch"
                    onClose={this.onCloseInfo}
                />
            );
        }

        if (bodyInfo) {
            return [resultWindow, bodyInfo];
        }
        */
        return [resultWindow];
    }

    searchTextChanged = (el, text) => {
        this.setState({ searchResults: {} });
        let pasted = false;
        if (el) {
            pasted = el.getAttribute('__pasted');
            el.removeAttribute('__pasted');
        }
        if (this.props.layers.find(layer => layer.id === 'searchselection')) {
            this.props.removeLayer('searchselection');
        }
        this.setState({ searchText: text });
        clearTimeout(this.searchTimeout);
        this.searchTimeout = setTimeout(() => this.getSearch(pasted), 250);
    };

    onFocus = () => {
        this.setState({ resultsVisible: true });
        if (this.searchBox) {
            this.searchBox.select();
        }
        if (isEmpty(this.state.searchResults)) {
            this.getSearch(false);
        }
    };

    onBlur = () => {
        if (this.preventBlur && this.searchBox) {
            this.searchBox.focus();
        } else {
            this.setState({ resultsVisible: false });
        }
    };

    clear = () => {
        if (this.searchBox) {
            this.searchBox.blur();
        }
        this.setState({ searchText: '', searchResults: {} });
        this.props.removeLayer('searchselection');
    };

    clearResults = () => {
        this.setState({ searchResults: {} });
        this.props.removeLayer('searchselection');
    };

    onKeyDown = (ev) => {
        if (ev.keyCode === 27 && this.searchBox) {
            if (this.searchBox.selectionStart !== this.searchBox.selectionEnd) {
                this.searchBox.setSelectionRange(this.searchBox.value.length, this.searchBox.value.length);
            } else {
                this.searchBox.blur();
            }
        }
    };
}

const selector = (state) => ({
    map: state.map,
    layers: state.layers.flat,
    theme: state.theme.current
});

export default connect(selector, {
    addLayer: addLayer,
    addLayerFeatures: addLayerFeatures,
    removeLayer: removeLayer,
    setCurrentTask: setCurrentTask,
    zoomToPoint: zoomToPoint,
    panTo: panTo,
    setIdentifyResult: setIdentifyResult
})(GwSearchBox);
