/**
 * Copyright 2016-2021 Sourcepole AG
 * All rights reserved.
 *
 * This source code is licensed under the BSD-style license found in the
 * LICENSE file in the root directory of this source tree.
 */

import axios from 'axios';
import React from 'react';
import { connect } from 'react-redux';
import PropTypes from 'prop-types';
import xml2js from 'xml2js';
import {v1 as uuidv1} from 'uuid';
import isEmpty from 'lodash.isempty';
import Spinner from 'qwc2/components/Spinner';
import LocaleUtils from 'qwc2/utils/LocaleUtils';
import MiscUtils from 'qwc2/utils/MiscUtils';
import ConfigUtils from 'qwc2/utils/ConfigUtils';

import GwTableWidget from 'qwc2-giswater/components/GwTableWidget';
import 'qwc2/components/style/QtDesignerForm.css';
import 'qwc2-giswater/components/style/GwInfoQtDesignerForm.css';
import FileSelector from 'qwc2/components/widgets/FileSelector';


class GwInfoQtDesignerForm extends React.Component {
    static propTypes = {
        form_xml: PropTypes.string,
        locale: PropTypes.string,
        readOnly: PropTypes.bool,
        updateField: PropTypes.func,
        dispatchButton: PropTypes.func,
        onTabChanged: PropTypes.func,
        listJson: PropTypes.object,
        widgetValues: PropTypes.object,
        theme: PropTypes.string,
        idName: PropTypes.string,
        featureId: PropTypes.string,
        disabledWidgets: PropTypes.array,
        getInitialValues: PropTypes.bool,
        replaceImageUrls: PropTypes.bool,
        files: PropTypes.array
    }
    static defaultProps = {
        updateField: (name, value, widget) => { console.log(name, value, widget) },
        dispatchButton: (action) => { console.log(action) },
        onTabChanged: (tab, widget) => { console.log(tab, widget) },
        widgetValues: {},
        disabledWidgets: [],
        getInitialValues: true,
        replaceimageUrls: false,
        files: []
    }
    static defaultState = {
        activetabs: {},
        formData: null,
        loading: false,
        loadingReqId: null,
        file: null
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
    tabChanged = (tab, widget) => {
        this.setState({ activetabs: { ...this.state.activetabs, [widget.name]: tab.name } });
        this.props.onTabChanged(tab, widget);
    }
    renderWidget = (widget, updateField, nametransform = (name) => name) => {
        const prop = widget.property || {};
        const attr = widget.attribute || {};
        const inputConstraints = {};
        inputConstraints.readOnly = this.props.readOnly || this.props.disabledWidgets.includes(widget.name) || prop.readOnly === "true" || prop.enabled === "false";
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
        const widgetFunction = prop.widgetfunction || "{}";
        const widgetControls = prop.widgetcontrols || "{}";
        if (this.props.widgetValues[widget.name.replace("lbl_", "")]?.visible === false) {
            return null;
        }
        if (widget.class === "QTableWidget") {
            if (isEmpty(this.props.listJson) || !this.props.listJson[widget.name]?.body?.data?.fields) {
                return null;
            }
            const values = this.props.listJson[widget.name].body.data.fields[0].value;
            const form = this.props.listJson[widget.name].body.form;
            if (!values) {
                return (<span>No results found</span>)
            }

            return (<GwTableWidget values={values} form={form} dispatchButton={this.props.dispatchButton}/>);
        }
        else if (widget.class === "QTableView") {
            if (isEmpty(this.props.listJson) || !this.props.listJson[widget.name]?.body?.data?.fields) {
                return null;
            }
            const values = this.props.listJson[widget.name].body.data.fields[0].value;
            if (!values) {
                return (<span>No results found</span>)
            }
            return (
                <div>
                    <table className="qtableview">
                        <tbody>
                        {values.map((value, i) => (
                            <tr className="qtableview-row" key={i}>
                                <td className="qtableview">
                                    <ul>
                                        {Object.keys(value).map((field, j) => {
                                            if (this.props.replaceImageUrls && /^https?:\/\/.*\.(jpg|jpeg|png|bmp)$/i.exec(value[field])) {
                                                return (<a href={value[field]} rel="noreferrer" target="_blank" key={j}><img src={value[field]} /></a>);
                                            } else {
                                                return (<li key={j}><b>{field}</b>: {value[field]}</li>)
                                            }
                                            })}
                                    </ul>
                                </td>
                            </tr>
                        ))}
                        </tbody>
                    </table>
                </div>
            );
        }
        else if (widget.class === "QLabel") {
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
                                onClick={() => this.tabChanged(tab, widget)}
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
            const value = (this.props.widgetValues[widget.name]?.value || prop.text);
            // Call updateFields to get the initial widget value
            if ((this.props.getInitialValues && !this.props.widgetValues[widget.name])) updateField(widget, value);
            return (<textarea name={elname} onChange={(ev) => updateField(widget, ev.target.value)} {...inputConstraints} style={fontStyle} value={value} />);
        } else if (widget.class === "QLineEdit") {
            const value = (this.props.widgetValues[widget.name]?.value || prop.text);
            // Call updateFields to get the initial widget value
            if (this.props.getInitialValues && !this.props.widgetValues[widget.name]) updateField(widget, value);
            return (<input name={elname} onChange={(ev) => updateField(widget, ev.target.value)} {...inputConstraints} size={5} style={fontStyle} type="text" value={value} />);
        } else if (widget.class === "QCheckBox" || widget.class === "QRadioButton") {
            const type = widget.class === "QCheckBox" ? "checkbox" : "radio";
            const inGroup = attr.buttonGroup;
            const checked_ = (this.props.widgetValues[widget.name]?.value || prop.checked);
            const checked = checked_ === true || checked_ === "true" || checked_ === "True";
            // Call updateFields to get the initial widget value
            if (this.props.getInitialValues && !this.props.widgetValues[widget.name]) updateField(widget, checked);
            let action;
            try {
                action = JSON.parse(prop.action);
            } catch (error) {
                action = "";
            }
            return (
                <label style={fontStyle}>
                    <input checked={checked} disabled={inputConstraints.readOnly} name={nametransform(this.groupOrName(widget))} onChange={(ev) => updateField(widget, ev.target.checked, action)} {...inputConstraints} type={type} value={widget.name} />
                    {prop.text}
                </label>
            );
        } else if (widget.class === "QComboBox") {
            let items = widget.item;
            if (!Array.isArray(widget.item)) {
                items = [widget.item];
            }
            const haveEmpty = (items || []).map((item) => (item.property.value || item.property.text) === "");
            const optObj = items.find(obj => obj.property.text === prop.value);
            const value = (this.props.widgetValues[widget.name]?.value || optObj.property.value || optObj.property.text);
            // Call updateFields to get the initial widget value
            if (this.props.getInitialValues && !this.props.widgetValues[widget.name]) updateField(widget, value);
            return (
                <select disabled={inputConstraints.readOnly} name={elname} onChange={ev => updateField(widget, ev.target.value)} {...inputConstraints} style={fontStyle} value={value}>
                    {!haveEmpty ? (
                        <option disabled={inputConstraints.required} value="">
                            {inputConstraints.placeholder || LocaleUtils.tr("editing.select")}
                        </option>
                    ) : null}
                    {(items || []).map((item) => {
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
            const value = (this.props.widgetValues[widget.name]?.value || prop.value);
            // Call updateFields to get the initial widget value
            if (this.props.getInitialValues && !this.props.widgetValues[widget.name]) updateField(widget, value);
            return (
                <input max={max} min={min} name={elname} onChange={(ev) => updateField(widget, ev.target.value)} {...inputConstraints} size={5} step={step} style={fontStyle} type={type} value={value} />
            );
        } else if (widget.class === "QDateEdit") {
            const min = prop.minimumDate ? this.dateConstraint(prop.minimumDate) : "1900-01-01";
            const max = prop.maximumDate ? this.dateConstraint(prop.maximumDate) : "9999-12-31";
            const value = (this.props.widgetValues[widget.name]?.value || prop.value);
            // Call updateFields to get the initial widget value
            if (this.props.getInitialValues && !this.props.widgetValues[widget.name]) updateField(widget, value);
            return (
                <input max={max} min={min} name={elname} onChange={(ev) => updateField(widget, ev.target.value)} {...inputConstraints} style={fontStyle} type="date" value={value} />
            );
        } else if (widget.class === "QTimeEdit") {
            const value = (this.props.widgetValues[widget.name]?.value || prop.value);
            // Call updateFields to get the initial widget value
            if (this.props.getInitialValues && !this.props.widgetValues[widget.name]) updateField(widget, value);
            return (
                <input name={elname} onChange={(ev) => updateField(widget, ev.target.value)} {...inputConstraints} style={fontStyle} type="time" value={value} />
            );
        } else if (widget.class === "QDateTimeEdit") {
            const min = prop.minimumDate ? this.dateConstraint(prop.minimumDate) : "1900-01-01";
            const max = prop.maximumDate ? this.dateConstraint(prop.maximumDate) : "9999-12-31";
            const parts = ((this.props.widgetValues[widget.name]?.value || prop.value) || "T").split("T");
            parts[1] = (parts[1] || "").replace(/\.\d+$/, ''); // Strip milliseconds
            // Call updateFields to get the initial widget value
            if (this.props.getInitialValues && !this.props.widgetValues[widget.name]) updateField(widget, parts[0] || parts[1] ? parts[0] + "T" + parts[1] : "");
            return (
                <span className="qt-designer-form-datetime">
                    <input max={max[0]} min={min[0]} onChange={(ev) => updateField(widget, (ev.target.value ? ev.target.value + (parts[1] ? ("T" + parts[1]) : "") : "").replace(/^T/, ""))} readOnly={inputConstraints.readOnly} required={inputConstraints.required} style={fontStyle} type="date" value={parts[0]} />
                    <input disabled={!parts[0]} onChange={(ev) => updateField(widget, (parts[0] + "T" + ev.target.value).replace(/^T/, ""))} {...inputConstraints} style={fontStyle} type="time" value={parts[1]} />
                    <input name={elname} type="hidden" value={prop.value} />
                </span>
            );
        } else if (widget.class === "QWidget") {
            return this.renderLayout(widget.layout, updateField, nametransform);
        } else if (widget.class === "QPushButton") {
            return (<button className="button" onClick={() => this.props.dispatchButton(JSON.parse(widgetFunction), widget)} type="button">{prop.text}</button>)
        } else if (widget.class === "QgsFileWidget") {
            const accept = "image/*";
            const file = this.state.file; // TODO: Change this so its for each widget and maybe outside this component
            const files = this.props.files.map(file => file.name).join(", ");
            return (<FileSelector accept={accept} file={this.state.file} onFileSelected={this.onFileSelected} multiple={true} showAllFilenames={true} overrideText={files} />);
        }
        return null;
    }
    onFileSelected = (file) => {
        this.props.dispatchButton({ functionName: "upload_file", file: file });
        this.setState({file});
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
        const loadingReqId = uuidv1();
        this.setState({ loading: true, loadingReqId: loadingReqId });
        xml2js.parseString(data, options, (err, json) => {
            if (err !== null) {
                console.warn(err);
            }
            const externalFields = {};
            const fields = {};
            const counters = {
                widget: 0,
                layout: 0
            };
            this.reformatWidget(json.ui.widget, fields, externalFields, counters);
            json.externalFields = externalFields;
            json.fields = fields;
            this.setState({ formData: json, loading: false, loadingReqId: null });
        });
    }
    reformatWidget = (widget, fields, externalFields, counters) => {
        if (widget.property) {
            widget.property = MiscUtils.ensureArray(widget.property).reduce((res, prop) => {
                return ({ ...res, [prop.name]: prop[Object.keys(prop).find(key => key !== "name")] });
            }, {});
        } else {
            widget.property = {};
        }
        if (widget.attribute) {
            widget.attribute = MiscUtils.ensureArray(widget.attribute).reduce((res, prop) => {
                return ({ ...res, [prop.name]: prop[Object.keys(prop).find(key => key !== "name")] });
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
