/**
 * Copyright 2016-2021 Sourcepole AG
 * All rights reserved.
 *
 * This source code is licensed under the BSD-style license found in the
 * LICENSE file in the root directory of this source tree.
 */

import React from 'react';
import {connect} from 'react-redux';
import PropTypes from 'prop-types';
import xml2js from 'xml2js';
import uuid from 'uuid';
import isEmpty from 'lodash.isempty';
import Spinner from 'qwc2/components/Spinner';
import LocaleUtils from 'qwc2/utils/LocaleUtils';
import MiscUtils from 'qwc2/utils/MiscUtils';

import 'qwc2/components/style/QtDesignerForm.css';


class GwInfoQtDesignerForm extends React.Component {
    static propTypes = {
        form_xml: PropTypes.string,
        locale: PropTypes.string,
        readOnly: PropTypes.bool,
        updateField: PropTypes.func,
        dispatchButton: PropTypes.func
    }
    static defaultProps = {
        updateField: (name, value) => {console.log(name, value)},
        dispatchButton: (action) => {}
    }
    static defaultState = {
        activetabs: {},
        formdata: null,
        loading: false,
        loadingReqId: null
    }
    constructor(props) {
        super(props);
        this.state = GwInfoQtDesignerForm.defaultState;
    }
    componentDidMount() {
        this.componentDidUpdate({});
    }
    componentDidUpdate(prevProps, prevState) {
        // Query form
        if (this.props.form_xml !== prevProps.form_xml) {
            this.setState({
                ...GwInfoQtDesignerForm.defaultState,
                activetabs: this.props.form_xml === prevProps.form_xml ? this.state.activetabs : {}
            });
            this.parseForm(this.props.form_xml);
        }
    }
    render() {
        if (this.state.loading) {
            return (
                <div className="qt-designer-form-loading">
                    <Spinner /><span>{LocaleUtils.tr("qtdesignerform.loading")}</span>
                </div>
            );
        } else if (this.state.formData) {
            const root = this.state.formData.ui.widget;
            return (
                <div className={"qt-designer-form"}>
                    {this.renderLayout(root.layout, this.props.updateField)}
                </div>
            );
        } else {
            return null;
        }
    }
    renderLayout = (layout, updateField, nametransform = (name) => name, visible = true) => {
        let containerClass = "";
        let itemStyle = () => ({});
        let sortKey = (item, idx) => idx;
        let containerStyle = {};
        if (!layout) {
            return null;
        } else if (layout.class === "QGridLayout" || layout.class === "QFormLayout") {
            containerClass = "qt-designer-layout-grid";
            containerStyle = {
                gridTemplateColumns: this.computeLayoutColumns(layout.item).join(" ")
            };
            itemStyle = item => ({
                gridArea: (1 + parseInt(item.row, 10)) + "/" + (1 + parseInt(item.column, 10)) + "/ span " + parseInt(item.rowspan || 1, 10) + "/ span " + parseInt(item.colspan || 1, 10)
            });
            sortKey = (item) => item.row;
        } else if (layout.class === "QVBoxLayout") {
            containerClass = "qt-designer-layout-grid";
            itemStyle = (item, idx) => ({
                gridArea: (1 + idx) + "/1/ span 1/ span 1"
            });
            sortKey = (item, idx) => idx;
        } else if (layout.class === "QHBoxLayout") {
            containerClass = "qt-designer-layout-grid";
            containerStyle = {
                gridTemplateColumns: this.computeLayoutColumns(layout.item, true).join(" ")
            };
            itemStyle = (item, idx) => ({
                gridArea: "1/" + (1 + idx) + "/ span 1/ span 1"
            });
            sortKey = (item, idx) => idx;
        } else {
            return null;
        }
        if (!visible) {
            containerStyle.display = 'none';
        }
        return (
            <div className={containerClass} key={layout.name} style={containerStyle}>
                {layout.item.sort((a, b) => (sortKey(a) - sortKey(b))).map((item, idx) => {
                    let child = null;
                    if (item.widget) {
                        child = this.renderWidget(item.widget, updateField, nametransform);
                    } else if (item.layout) {
                        child = this.renderLayout(item.layout, updateField, nametransform);
                    } else {
                        return null;
                    }
                    return (
                        <div key={"i" + idx} style={itemStyle(item, idx)}>
                            {child}
                        </div>
                    );
                })}
            </div>
        );
    }
    computeLayoutColumns = (items, useIndex = false) => {
        const columns = [];
        const fitWidgets = ["QLabel", "QCheckBox", "QRadioButton", "Line"];
        let index = 0;
        let hasAuto = false;
        for (const item of items) {
            const col = useIndex ? index : (parseInt(item.column, 10) || 0);
            const colSpan = useIndex ? 1 : (parseInt(item.colspan, 10) || 1);
            if (item.widget && !fitWidgets.includes(item.widget.class) && colSpan === 1) {
                columns[col] = 'auto';
                hasAuto = true;
            } else {
                columns[col] = columns[col] || null; // Placeholder replaced by fit-content below
            }
            ++index;
        }
        const fit = 'fit-content(' + Math.round(1 / columns.length * 100) + '%)';
        for (let col = 0; col < columns.length; ++col) {
            columns[col] = hasAuto ? (columns[col] || fit) : 'auto';
        }
        return columns;
    }
    renderWidget = (widget, updateField, nametransform = (name) => name) => {
        const prop = widget.property || {};
        const attr = widget.attribute || {};
        const inputConstraints = {};
        inputConstraints.readOnly = this.props.readOnly || prop.readOnly === "true" || prop.enabled === "false";
        // inputConstraints.readOnly = false;
        inputConstraints.required = !inputConstraints.readOnly && (prop.required === "true");
        inputConstraints.placeholder = prop.placeholderText || "";

        const fontProps = widget.property.font || {};
        const fontStyle = {
            fontWeight: fontProps.bold === "true" ? "bold" : "normal",
            fontStyle: fontProps.italic === "true" ? "italic" : "normal",
            textDecoration: [fontProps.underline === "true" ? "underline" : "", fontProps.strikeout === "true" ? "line-through" : ""].join(" "),
            fontSize: Math.round((fontProps.pointsize || 9) / 9 * 100) + "%"
        };

        const elname = nametransform(widget.name);

        if (widget.class === "QLabel") {
            return (<span style={fontStyle}>{prop.text}</span>);
        } else if (widget.class === "Line") {
            const linetype = (widget.property || {}).orientation === "Qt::Vertical" ? "vline" : "hline";
            return (<div className={"qt-designer-form-" + linetype} />);
        } else if (widget.class === "QFrame") {
            return (
                <div className="qt-designer-form-frame">
                    {this.renderLayout(widget.layout, updateField, nametransform)}
                </div>
            );
        } else if (widget.class === "QGroupBox") {
            return (
                <div>
                    <div className="qt-designer-form-frame-title" style={fontStyle}>{prop.title}</div>
                    <div className="qt-designer-form-frame">
                        {this.renderLayout(widget.layout, updateField, nametransform)}
                    </div>
                </div>
            );
        } else if (widget.class === "QTabWidget") {
            if (isEmpty(widget.widget)) {
                return null;
            }
            const activetab = this.state.activetabs[widget.name] || widget.widget[0].name;
            return (
                <div>
                    <div className="qt-designer-form-tabbar">
                        {widget.widget.map(tab => (
                            <span
                                className={tab.name === activetab ? "qt-designer-form-tab-active" : ""}
                                key={tab.name}
                                onClick={() => this.setState({activetabs: {...this.state.activetabs, [widget.name]: tab.name}})}
                            >
                                {tab.attribute.title}
                            </span>
                        ))}
                    </div>
                    <div className="qt-designer-form-frame">
                        {widget.widget.filter(child => child.layout).map(child => (
                            this.renderLayout(child.layout, updateField, nametransform, child.name === activetab)
                        ))}
                    </div>
                </div>
            );
        } else if (widget.class === "QTextEdit" || widget.class === "QTextBrowser" || widget.class === "QPlainTextEdit") {
            return (<textarea name={elname} onChange={(ev) => updateField(widget.name, ev.target.value)} {...inputConstraints} style={fontStyle} value={prop.text} />);
        } else if (widget.class === "QLineEdit") {
            return (<input name={elname} onChange={(ev) => updateField(widget.name, ev.target.value)} {...inputConstraints} size={5} style={fontStyle} type="text" value={prop.text} />);
        } else if (widget.class === "QCheckBox" || widget.class === "QRadioButton") {
            const type = widget.class === "QCheckBox" ? "checkbox" : "radio";
            const inGroup = attr.buttonGroup;
            const checked = prop.checked === true || prop.checked === "true";
            return (
                <label style={fontStyle}>
                    <input checked={checked} disabled={inputConstraints.readOnly} name={nametransform(this.groupOrName(widget))} onChange={ev => updateField(this.groupOrName(widget), inGroup ? widget.name : ev.target.checked)} {...inputConstraints} type={type} value={widget.name} />
                    {prop.text}
                </label>
            );
        } else if (widget.class === "QComboBox") {
            const haveEmpty = (widget.item || []).map((item) => (item.property.value || item.property.text) === "");
            return (
                <select disabled={inputConstraints.readOnly} name={elname} onChange={ev => updateField(widget.name, ev.target.value)} {...inputConstraints} style={fontStyle} value={prop.value}>
                    {!haveEmpty ? (
                        <option disabled={inputConstraints.required} value="">
                            {inputConstraints.placeholder || LocaleUtils.tr("editing.select")}
                        </option>
                    ) : null}
                    {(widget.item || []).map((item) => {
                        const optval = item.property.value || item.property.text;
                        return (
                            <option key={optval} value={optval}>{item.property.text}</option>
                        );
                    })}
                </select>
            )
        } else if (widget.class === "QSpinBox" || widget.class === "QDoubleSpinBox" || widget.class === "QSlider") {
            const min = prop.minimum ?? undefined;
            const max = prop.maximum ?? undefined;
            const step = prop.singleStep ?? 1;
            const type = (widget.class === "QSlider" ? "range" : "number");
            return (
                <input max={max} min={min} name={elname} onChange={(ev) => updateField(widget.name, ev.target.value)} {...inputConstraints} size={5} step={step} style={fontStyle} type={type} value={prop.value} />
            );
        } else if (widget.class === "QDateEdit") {
            const min = prop.minimumDate ? this.dateConstraint(prop.minimumDate) : "1900-01-01";
            const max = prop.maximumDate ? this.dateConstraint(prop.maximumDate) : "9999-12-31";
            return (
                <input max={max} min={min} name={elname} onChange={(ev) => updateField(widget.name, ev.target.value)} {...inputConstraints} style={fontStyle} type="date" value={prop.value} />
            );
        } else if (widget.class === "QTimeEdit") {
            return (
                <input name={elname} onChange={(ev) => updateField(widget.name, ev.target.value)} {...inputConstraints} style={fontStyle} type="time" value={prop.value} />
            );
        } else if (widget.class === "QDateTimeEdit") {
            const min = prop.minimumDate ? this.dateConstraint(prop.minimumDate) : "1900-01-01";
            const max = prop.maximumDate ? this.dateConstraint(prop.maximumDate) : "9999-12-31";
            const parts = (prop.value || "T").split("T");
            parts[1] = (parts[1] || "").replace(/\.\d+$/, ''); // Strip milliseconds
            return (
                <span className="qt-designer-form-datetime">
                    <input max={max[0]} min={min[0]} onChange={(ev) => updateField(widget.name, ev.target.value ? ev.target.value + "T" + parts[1] : "")} readOnly={inputConstraints.readOnly} required={inputConstraints.required} style={fontStyle} type="date" value={parts[0]} />
                    <input disabled={!parts[0]} onChange={(ev) => updateField(widget.name, parts[0] + "T" + ev.target.value)} {...inputConstraints} style={fontStyle} type="time" value={parts[1]} />
                    <input name={elname} type="hidden" value={prop.value} />
                </span>
            );
        } else if (widget.class === "QWidget") {
            return this.renderLayout(widget.layout, updateField, nametransform);
        } else if (widget.class === "QPushButton") {
            return (<button className="button" onClick={() => this.props.dispatchButton(JSON.parse(prop.action))} type="button">{prop.text}</button>)
        }
        return null;
    }
    groupOrName = (widget) => {
        return widget.attribute && widget.attribute.buttonGroup ? widget.attribute.buttonGroup._ : widget.name;
    }
    dateConstraint = (constr) => {
        return (constr.year + "-" + ("0" + constr.month).slice(-2) + "-" + ("0" + constr.day).slice(-2));
    }
    parseForm = (data) => {
        const options = {
            explicitArray: false,
            mergeAttrs: true
        };
        const loadingReqId = uuid.v1();
        this.setState({loading: true, loadingReqId: loadingReqId});
        xml2js.parseString(data, options, (err, json) => {
            const externalFields = {};
            const fields = {};
            const counters = {
                widget: 0,
                layout: 0
            };
            this.reformatWidget(json.ui.widget, fields, externalFields, counters);
            json.externalFields = externalFields;
            json.fields = fields;
            this.setState({formData: json, loading: false, loadingReqId: null});
        });
    }
    reformatWidget = (widget, fields, externalFields, counters) => {
        if (widget.property) {
            widget.property = MiscUtils.ensureArray(widget.property).reduce((res, prop) => {
                return ({...res, [prop.name]: prop[Object.keys(prop).find(key => key !== "name")]});
            }, {});
        } else {
            widget.property = {};
        }
        if (widget.attribute) {
            widget.attribute = MiscUtils.ensureArray(widget.attribute).reduce((res, prop) => {
                return ({...res, [prop.name]: prop[Object.keys(prop).find(key => key !== "name")]});
            }, {});
        } else {
            widget.attribute = {};
        }
        if (widget.item) {
            MiscUtils.ensureArray(widget.item).map(item => this.reformatWidget(item, fields, externalFields, counters));
        }

        widget.name = widget.name || (":widget_" + counters.widget++);

        if (widget.layout) {
            this.reformatLayout(widget.layout, fields, externalFields, counters);
        }
        if (widget.widget) {
            widget.widget = Array.isArray(widget.widget) ? widget.widget : [widget.widget];
            widget.widget.forEach(child => {
                child.name = (":widget_" + counters.widget++);
                this.reformatWidget(child, fields, externalFields, counters);
            });
        }
    }
    reformatLayout = (layout, fields, externalFields, counters) => {
        layout.item = MiscUtils.ensureArray(layout.item);
        layout.name = layout.name || (":layout_" + counters.layout++);
        layout.item.forEach(item => {
            if (!item) {
                return;
            } else if (item.widget) {
                this.reformatWidget(item.widget, fields, externalFields, counters);
            } else if (item.layout) {
                this.reformatLayout(item.layout, fields, externalFields, counters);
            }
        });
    }
    buildErrMsg = (record) => {
        let message = record.error;
        const errorDetails = record.error_details || {};
        if (!isEmpty(errorDetails.geometry_errors)) {
            message += ":\n";
            message += errorDetails.geometry_errors.map(entry => " - " + entry.reason + " at " + entry.location);
        }
        if (!isEmpty(errorDetails.data_errors)) {
            message += ":\n - " + errorDetails.data_errors.join("\n - ");
        }
        if (!isEmpty(errorDetails.validation_errors)) {
            message += ":\n - " + errorDetails.validation_errors.join("\n - ");
        }
        return message;
    }
}

export default connect((state) => ({
    locale: state.locale.current
}), {
})(GwInfoQtDesignerForm);
