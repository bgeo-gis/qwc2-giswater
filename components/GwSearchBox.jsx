/**
 * Copyright BGEO. All rights reserved.
 * The program is free software: you can redistribute it and/or modify it under the terms of the GNU
 * General Public License as published by the Free Software Foundation, either version 3 of the License,
 * or (at your option) any later version
 */

import React from 'react';
import PropTypes from 'prop-types';
import { connect } from 'react-redux';
import isEmpty from 'lodash.isempty';
import axios from 'axios';
import { logAction } from 'qwc2/actions/logging';
import { panTo, zoomToExtent, zoomToPoint } from 'qwc2/actions/map';
import { LayerRole, addLayerFeatures, addThemeSublayer, removeLayer, addLayer } from 'qwc2/actions/layers';
import { setCurrentTheme } from 'qwc2/actions/theme';
import { openExternalUrl, setCurrentTask } from 'qwc2/actions/task';
import { showIframeDialog, showNotification } from 'qwc2/actions/windows';
import Icon from 'qwc2/components/Icon';
import InputContainer from 'qwc2/components/InputContainer';
import LocaleUtils from 'qwc2/utils/LocaleUtils';
import MapUtils from 'qwc2/utils/MapUtils';
import MiscUtils from 'qwc2/utils/MiscUtils';
import VectorLayerUtils from 'qwc2/utils/VectorLayerUtils';
import './style/SearchBox.css';

import GwUtils from '../utils/GwUtils';
import GwInfo from '../plugins/GwInfo';

class GwSearchBox extends React.Component {
  static propTypes = {
    addLayer: PropTypes.func,
    addLayerFeatures: PropTypes.func,
    addThemeSublayer: PropTypes.func,
    displaycrs: PropTypes.string,
    layers: PropTypes.array,
    localConfig: PropTypes.object,
    logAction: PropTypes.func,
    map: PropTypes.object,
    openExternalUrl: PropTypes.func,
    panTo: PropTypes.func,
    removeLayer: PropTypes.func,
    searchFilter: PropTypes.string,
    searchOptions: PropTypes.shape({
      minScaleDenom: PropTypes.number,
      resultLimit: PropTypes.number,
      sectionsDefaultCollapsed: PropTypes.bool
    }),
    searchProviders: PropTypes.object,
    setCurrentTask: PropTypes.func,
    setCurrentTheme: PropTypes.func,
    showIframeDialog: PropTypes.func,
    showNotification: PropTypes.func,
    theme: PropTypes.object,
    themes: PropTypes.object,
    zoomToExtent: PropTypes.func,
    zoomToPoint: PropTypes.func,
    infoDockable: PropTypes.oneOfType([PropTypes.bool, PropTypes.string]),
  }
  static defaultProps = {
    infoDockable: "right"
  }
  state = {
    searchText: "",
    searchSession: null,
    pendingSearches: [],
    recentSearches: [],
    searchResults: {},
    resultsVisible: false,
    collapsedSections: [],
    expandedLayerGroup: null,
    activeLayerInfo: null,
    identifyResult: null,
    pendingRequests: false
  }
  constructor(props) {
    super(props);
    this.searchBox = null;
    this.searchTimeout = null;
    this.preventBlur = false;
  }

  componentDidUpdate(prevProps, prevState) {
    // If search text changed
    if (this.state.searchText !== prevState.searchText) {
      //this.getSearch();
    }
  }

  getSearch = () => {
    let pendingSearches = false;
    const request_url = GwUtils.getServiceUrl("search");
    if (!isEmpty(request_url) && !isEmpty(this.state.searchText)) {
      //TO DO isTiled:True/False
      const filterText = this.state.searchText;
      const filterSearch = '"searchText": { "filterSign":"", "value": "' + filterText + '" } ';

      const params = {
        "theme": this.props.theme.title,
        "filterFields": filterSearch
      }
      pendingSearches = true
      axios.get(request_url + "getsearch", { params: params }).then(response => {
        const result = response.data;
        this.setState({ searchResults: result, pendingSearches: null })
      }).catch((e) => {
        console.log(e);
        this.setState({ pendingSearches: false });
      });
    }
  }

  setSearch = (display_name, section, filterKey, filterValue, execFunc, tableName) => {  
    this.setState({searchText: display_name})  
    const request_url = GwUtils.getServiceUrl("search");
    if (!isEmpty(request_url)) {
      const extras = '"value": "' + display_name + '", "section": "'+ section +'", "filterKey": "'+filterKey+'","filterValue": "'+filterValue+'", "execFunc": "'+execFunc+'", "tableName": "'+tableName+'"';
      const params = {
        "theme": this.props.theme.title,
        "extras": extras
      }
      axios.get(request_url + "setsearch", { params: params }).then(response => {
        const result = response.data;
        this.panToResult(result.data.geometry)
        this.highlightResult(result)

        //Info if execFunc is present
        if (execFunc) {
          this.identifyFromId(filterValue, tableName)
          
        }
        if(section == "basic_search_address"){
          this.setState({searchText: display_name+", "}) 
        }
        this.clearResults()
      }).catch((e) => {
        console.log(e);
      });
    }
  }

  identifyFromId = (execParam, tableName) => {
    var request_url;
    var pendingRequests;

    request_url = GwUtils.getServiceUrl("info");
    if (!isEmpty(request_url)) {
      const params = {
        "theme": this.props.theme.title,
        "id": execParam, 
        "tableName": tableName
      }
      pendingRequests = true
      axios.get(request_url + "fromid", { params: params }).then((response) => {
        const result = response.data
        this.setState({ identifyResult: result, pendingRequests: false });
      }).catch((e) => {
        console.log(e);
        this.setState({ pendingRequests: false });
      });
    }
    this.setState({ identifyResult: {}, pendingRequests: pendingRequests });
  }

  panToResult = (geometry) => {
    if (!isEmpty(geometry)) {
      const center = GwUtils.getGeometryCenter(geometry.st_astext)
      //Pan to result
      this.props.panTo(center, this.props.map.projection)
      //Zoom to result
      const maxZoom = MapUtils.computeZoom(this.props.map.scales, this.props.theme.minSearchScaleDenom || this.props.searchOptions.minScaleDenom);
      this.props.zoomToPoint(center, maxZoom, this.props.map.projection)
    }
  }

  highlightResult = (result) => {
    // console.log('result :>> ', result);
    if (isEmpty(result) || !result?.data?.geometry) {
        this.props.removeLayer("identifyslection")
    } else {
        const layer = {
            id: "identifyslection",
            role: LayerRole.SELECTION
        };
        const crs = this.props.map.projection
        const geometry = VectorLayerUtils.wktToGeoJSON(result.data.geometry.st_astext, crs, crs)
        const feature = {
            id: result.funcValue,
            geometry: geometry.geometry
        }
        this.props.addLayerFeatures(layer, [feature], true)
    }
    this.resultProcessed = true;
}

  renderSearchResults = () => {
    if (!this.state.resultsVisible || !this.state.searchResults || !this.state.searchResults.data || isEmpty(this.state.searchText)) {
      return null;
    }
    const searchResults = this.state.searchResults;
    const searchResultItems = [];

    searchResults.data.forEach((result) => {
      const alias = result.alias;
      const values = result.values;
      const title = alias+" title"
      const body = alias+" body"
      const resultItems = [];

      if (typeof values !== 'undefined') {
        for (const value of result.values) {
          const display = value.display_name
          resultItems.push(
            <div
              className="searchbox-result"
              onClick={() => this.setSearch(display, result.section, value.key, value.value, result.execFunc, result.tableName)}
              key={display}
            >
              <span className="searchbox-result-label" title={display}>
                {display}
              </span>
            </div>
          );
        }
        searchResultItems.push(
          <div className="searchbox-results-section" key={alias}>
            <div className="searchbox-results-section-title" onClick={() => this.handleCollapseClick(alias)} key={title}>
              <span className={`icon ${this.state.collapsedSections.includes(alias) ? 'icon-expand' : 'icon-collapse'}`}></span>
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
      <div className="searchbox-results" onMouseDown={this.setPreventBlur} ref={MiscUtils.setupKillTouchEvents} key="searchbox-results">
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
  }

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
  
  onCloseInfo = () => {
    this.setState({identifyResult : null});
  }

  render() {
    const placeholder = LocaleUtils.tr("searchbox.placeholder");
    let resultWindow = null;
    let bodyInfo = null;

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

    if (!isEmpty(this.state.identifyResult)) {
      bodyInfo = (
        <GwInfo identifyResult={this.state.identifyResult} onClose={this.onCloseInfo} dockable={this.props.infoDockable} initiallyDocked={true} 
        initialWidth={480}
        initialHeight={800}
        key="GwInfoFromSearch"
       />
      )
    }

    if (bodyInfo) {
      return [resultWindow, bodyInfo];
    }

    return [resultWindow];
  }

  searchTextChanged = (el, text) => {
    let pasted = false;
    if (el) {
      pasted = el.getAttribute('__pasted');
      el.removeAttribute('__pasted');
    }
    if (this.props.layers.find(layer => layer.id === 'searchselection')) {
      this.props.removeLayer('searchselection');
    }
    this.setState({ searchText: text, expandedLayerGroup: null, activeLayerInfo: null });
    clearTimeout(this.searchTimeout);
    this.searchTimeout = setTimeout(() => this.getSearch(pasted), 250);
  }

  onFocus = () => {
    this.setState({ resultsVisible: true });
    if (this.searchBox) {
      this.searchBox.select();
    }
    if (isEmpty(this.state.searchResults)) {
      this.getSearch(false);
    }
  }

  onBlur = () => {
    if (this.preventBlur && this.searchBox) {
      this.searchBox.focus();
    } else {
      this.setState({ resultsVisible: false, collapsedSections: [], expandedLayerGroup: null, activeLayerInfo: null });
    }
  }

  clear = () => {
    if (this.searchBox) {
      this.searchBox.blur();
    }
    this.setState({ searchText: '', searchResults: {} });
    this.props.removeLayer('searchselection');
  }

  clearResults = () => {
    this.setState({ searchResults: {} });
    this.props.removeLayer('searchselection');
  }

  onKeyDown = (ev) => {
    if (ev.keyCode === 27 && this.searchBox) {
      if (this.searchBox.selectionStart !== this.searchBox.selectionEnd) {
        this.searchBox.setSelectionRange(this.searchBox.value.length, this.searchBox.value.length);
      } else {
        this.searchBox.blur();
      }
    }
  }
}

const selector = (state) => ({
  map: state.map,
  layers: state.layers.flat,
  theme: state.theme.current,
  themes: state.theme.themes,
  localConfig: state.localConfig,
});

export default connect(selector, {
  addThemeSublayer: addThemeSublayer,
  addLayer: addLayer,
  addLayerFeatures: addLayerFeatures,
  removeLayer: removeLayer,
  setCurrentTask: setCurrentTask,
  zoomToExtent: zoomToExtent,
  zoomToPoint: zoomToPoint,
  panTo: panTo,
  logAction: logAction,
  setCurrentTheme: setCurrentTheme,
  showNotification: showNotification,
  openExternalUrl: openExternalUrl,
  showIframeDialog: showIframeDialog
})(GwSearchBox);