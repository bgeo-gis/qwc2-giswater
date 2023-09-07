/**
 * Copyright © 2023 by BGEO. All rights reserved.
 * The program is free software: you can redistribute it and/or modify it under the terms of the GNU
 * General Public License as published by the Free Software Foundation, either version 3 of the License,
 * or (at your option) any later version
 */

import React from 'react';
import { connect } from 'react-redux';
import PropTypes from 'prop-types';
import xml2js from 'xml2js';
import {v1 as uuidv1} from 'uuid';
import isEmpty from 'lodash.isempty';
import Spinner from 'qwc2/components/Spinner';
import LocaleUtils from 'qwc2/utils/LocaleUtils';
import MiscUtils from 'qwc2/utils/MiscUtils';

import GwTableWidget from 'qwc2-giswater/components/GwTableWidget';
import 'qwc2/components/style/QtDesignerForm.css';
import 'qwc2-giswater/components/style/GwQtDesignerForm.css';
import FileSelector from 'qwc2/components/widgets/FileSelector';
import GwUtils from 'qwc2-giswater/utils/GwUtils';
import Icon from 'qwc2/components/Icon';


class GwQtDesignerForm extends React.Component {
    static propTypes = {
        activetabs: PropTypes.object,
        autoResetTab: PropTypes.bool,
        disabledWidgets: PropTypes.array,
        dispatchButton: PropTypes.func,
        files: PropTypes.array,
        form_xml: PropTypes.string,
        getInitialValues: PropTypes.bool,
        hiddenWidgets: PropTypes.array,
        locale: PropTypes.string,
        onTabChanged: PropTypes.func,
        readOnly: PropTypes.bool,
        replaceImageUrls: PropTypes.bool,
        updateField: PropTypes.func,
        widgetValues: PropTypes.object
    };
    static defaultProps = {
        updateField: (name, value, initial = false) => { console.log(name, value, initial); },
        dispatchButton: (action) => { console.log(action); },
        onTabChanged: (tab, widget) => { console.log(tab, widget); },
        autoResetTab: true,
        widgetValues: {},
        disabledWidgets: [],
        hiddenWidgets: [],
        getInitialValues: true,
        replaceimageUrls: false,
        files: [],
        activetabs: {}
    };
    static defaultState = {
        activetabs: {},
        formData: null,
        loading: false,
        loadingReqId: null,
        files: null
    };
    constructor(props) {
        super(props);
        this.state = GwQtDesignerForm.defaultState;
    }
    componentDidMount() {
        this.componentDidUpdate({});
    }
    componentDidUpdate(prevProps) {
        // Query form
        if (this.props.form_xml !== prevProps.form_xml) {
            console.log("Form  updated");
            this.setState((state, props) => ({
                ...GwQtDesignerForm.defaultState,
                activetabs: props.autoResetTab ? {} : state.activetabs
            }));
            if (this.props.form_xml) {
                this.parseForm(this.props.form_xml);
            } else {
                console.error("Empty xml");
            }
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
        } else if (!this.state.form_xml) {
            return (
                <span>XML is empty!</span>
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
                gridTemplateColumns: this.computeLayoutColumns(layout.item).join(" "),
                gridTemplateRows: this.computeLayoutRows(layout.item).join(" ")
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
        if (layout.item.find(item => item.spacer && (item.spacer.property || {}).orientation === "Qt::Vertical")) {
            containerStyle.height = '100%';
        }
        return (
            <div className={containerClass} key={layout.name} name={layout.name} style={containerStyle}>
                {layout.item.sort((a, b) => (sortKey(a) - sortKey(b))).map((item, idx) => {
                    let child = null;
                    if (item.widget) {
                        child = this.renderWidget(item.widget, updateField, nametransform);
                    } else if (item.layout) {
                        child = this.renderLayout(item.layout, updateField, nametransform);
                    } else if (item.spacer) {
                        child = (<div />);
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
    };
    computeLayoutColumns = (items, useIndex = false) => {
        const columns = [];
        const fitWidgets = ["QLabel", "QCheckBox", "QRadioButton", "Line", "QDateTimeEdit", "QDateEdit", "QTimeEdit", "QSpinBox", "QDoubleSpinBox", "QSlider"];
        let index = 0;
        let hasAuto = false;
        const hasSpacer = items.find(item => (item.spacer && (item.spacer.property || {}).orientation === "Qt::Horizontal"));
        for (const item of items) {
            const col = useIndex ? index : (parseInt(item.column, 10) || 0);
            const colSpan = useIndex ? 1 : (parseInt(item.colspan, 10) || 1);
            if (!hasSpacer && item.widget && !fitWidgets.includes(item.widget.class) && colSpan === 1 && item.widget.property?.fit_horizontal !== "true") {
                columns[col] = 'auto';
                hasAuto = true;
            } else if (item.spacer && (item.spacer.property || {}).orientation === "Qt::Horizontal") {
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
    };
    computeLayoutRows = (items, useIndex = false) => {
        const rows = [];
        const fitWidgets = ["QLabel", "QCheckBox", "QRadioButton", "Line", "QDateTimeEdit", "QDateEdit", "QTimeEdit", "QPushButton", "QComboBox", "QLineEdit"];
        let index = 0;
        let hasAuto = false;
        const hasSpacer = items.find(item => (item.spacer && (item.spacer.property || {}).orientation === "Qt::Vertical"));
        for (const item of items) {
            const row = useIndex ? index : (parseInt(item.row, 10) || 0);
            const rowSpan = useIndex ? 1 : (parseInt(item.rowspan, 10) || 1);
            if (!hasSpacer && item.widget && !fitWidgets.includes(item.widget.class) && rowSpan === 1 && item.widget.property?.fit_vertical !== "true") {
                rows[row] = 'auto';
                hasAuto = true;
            } else if (item.spacer && (item.spacer.property || {}).orientation === "Qt::Vertical") {
                rows[row] = 'auto';
                hasAuto = true;
            } else {
                rows[row] = rows[row] || null; // Placeholder replaced by fit-content below
            }
            ++index;
        }
        const fit = 'fit-content(' + Math.round(1 / rows.length * 100) + '%)';
        for (let row = 0; row < rows.length; ++row) {
            rows[row] = hasAuto ? (rows[row] || fit) : 'auto';
        }
        return rows;
    };
    tabChanged = (tab, widget) => {
        this.setState((prevState) => ({ activetabs: { ...prevState.activetabs, [widget.name]: tab.name } }));
        this.props.onTabChanged(tab, widget);
    };
    renderWidget = (widget, updateField, nametransform = (name) => name) => {
        const prop = widget.property || {};
        if (prop.visible === "false") {
            return null;
        }
        // const attr = widget.attribute || {};
        const inputConstraints = {};
        inputConstraints.readOnly = this.props.readOnly || this.props.disabledWidgets.includes(widget.name) || prop.readOnly === "true" || prop.enabled === "false";
        let tmp_name = (widget.name).replace("_label", "");
        inputConstraints.hidden = this.props.hiddenWidgets.includes(tmp_name);
        // inputConstraints.readOnly = false;
        inputConstraints.required = !inputConstraints.readOnly && (prop.required === "true");
        inputConstraints.placeholder = prop.placeholderText || "";

        const fontProps = prop.font || {};
        const fontStyle = {
            fontWeight: fontProps.bold === "true" ? "bold" : "normal",
            fontStyle: fontProps.italic === "true" ? "italic" : "normal",
            textDecoration: [fontProps.underline === "true" ? "underline" : "", fontProps.strikeout === "true" ? "line-through" : ""].join(" "),
            fontSize: Math.round((fontProps.pointsize || 9) / 9 * 100) + "%",
            textAlign: 'left'
        };
        if (prop.alignment) {
            if (prop.alignment.includes("Qt::AlignRight")) {
                fontStyle.textAlign = 'right';
            } else if (prop.alignment.includes("Qt::AlignCenter")) {
                fontStyle.textAlign = 'center';
            }
        }

        const elname = nametransform(widget.name);
        const widgetFunction = prop.widgetfunction || "{}";
        const widgetControls = JSON.parse(prop.widgetcontrols || "{}");
        if (this.props.widgetValues[widget.name.replace("lbl_", "")]?.visible === false) {
            return null;
        }

        const value = this.getWidgetValue(widget);

        if (widget.class === "QTableWidget") {
            if (!value || !value.values) {
                return null;
            }

            const { values, form } = value;
            // if (!values) {
            //     return (<span>No results found</span>)
            // }

            return (<GwTableWidget dispatchButton={this.props.dispatchButton} form={form} values={values}/>);
        } else if (widget.class === "QTableView") {
            if (!value) {
                return null;
            }

            console.log(value);
            return (
                <div className="qtableview">
                    <table className="qtableview">
                        <tbody>
                            {value.map((v, i) => (
                                <tr className="qtableview-row" key={i}>
                                    <td className="qtableview">
                                        <ul>
                                            {Object.keys(v).map((field, j) => {
                                                if (this.props.replaceImageUrls && /^https?:\/\/.*\.(jpg|jpeg|png|bmp)$/i.exec(v[field])) {
                                                    return (<a href={v[field]} key={j} rel="noreferrer" target="_blank"><img src={v[field]} /></a>);
                                                } else {
                                                    return (<li key={j}><b>{field}</b>: {String(v[field])}</li>);
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
        } else if (widget.class === "QLabel") {
            return (<div hidden={inputConstraints.hidden} style={fontStyle}>{prop.text}</div>);
        } else if (widget.class === "Line") {
            const linetype = (widget.property || {}).orientation === "Qt::Vertical" ? "vline" : "hline";
            return (<div className={"qt-designer-form-" + linetype} />);
        } else if (widget.class === "QFrame") {
            return (
                <div className="qt-designer-form-container">
                    <div className="qt-designer-form-frame">
                        {this.renderLayout(widget.layout, updateField, nametransform)}
                    </div>
                </div>
            );
        } else if (widget.class === "QGroupBox") {
            return (
                <div className="qt-designer-form-container">
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
            const activetab = this.props.activetabs[widget.name] || this.state.activetabs[widget.name] || widget.widget[0].name;
            return (
                <div className="qt-designer-form-container">
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
            return (<textarea name={elname} onChange={(ev) => updateField(widget, ev.target.value)} {...inputConstraints} style={fontStyle} value={value} />);
        } else if (widget.class === "QLineEdit") {
            return (<input name={elname} onChange={(ev) => updateField(widget, ev.target.value)} {...inputConstraints} size={5} style={fontStyle} type="text" value={value} />);
        } else if (widget.class === "QCheckBox" || widget.class === "QRadioButton") {
            const type = widget.class === "QCheckBox" ? "checkbox" : "radio";
            let action;
            try {
                action = JSON.parse(prop.action);
            } catch (error) {
                action = "";
            }
            return (
                <label style={fontStyle}>
                    <input checked={value} disabled={inputConstraints.readOnly} name={nametransform(this.groupOrName(widget))} onChange={(ev) => updateField(widget, ev.target.checked, action)} {...inputConstraints} type={type} value={widget.name} />
                    {prop.text}
                </label>
            );
        } else if (widget.class === "QComboBox") {
            let items = widget.item;
            if (!Array.isArray(widget.item) && items !== undefined) {
                items = [widget.item];
            }
            const haveEmpty = (items || []).map((item) => (item.property.value || item.property.text) === "");
            return (
                <select hidden={inputConstraints.hidden} disabled={inputConstraints.readOnly} name={elname} onChange={ev => updateField(widget, ev.target.value, false, inputConstraints.placeholder)} {...inputConstraints} style={fontStyle} value={value}>
                    {!haveEmpty ? (
                        <option hidden={inputConstraints.hidden} disabled={inputConstraints.required} value="">
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
            );
        } else if (widget.class === "QSpinBox" || widget.class === "QDoubleSpinBox" || widget.class === "QSlider") {
            const min = prop.minimum ?? undefined;
            const max = prop.maximum ?? undefined;
            const step = prop.singleStep ?? 1;
            const type = (widget.class === "QSlider" ? "range" : "number");
            return (
                <input max={max} min={min} name={elname} onChange={(ev) => updateField(widget, ev.target.value)} {...inputConstraints} size={5} step={step} style={fontStyle} type={type} value={value} />
            );
        } else if (widget.class === "QDateEdit") {
            const min = prop.minimumDate ? this.dateConstraint(prop.minimumDate) : "1900-01-01";
            const max = prop.maximumDate ? this.dateConstraint(prop.maximumDate) : "9999-12-31";
            return (
                <input max={max} min={min} name={elname} onChange={(ev) => updateField(widget, ev.target.value)} {...inputConstraints} style={fontStyle} type="date" value={value} />
            );
        } else if (widget.class === "QTimeEdit") {
            return (
                <input name={elname} onChange={(ev) => updateField(widget, ev.target.value)} {...inputConstraints} style={fontStyle} type="time" value={value} />
            );
        } else if (widget.class === "QDateTimeEdit") {

            // We need to send this format EVERYWHERE
            // Storage (xml or widgetVars)
            //    data if time is none
            //    {data}T{time} if time is NOT none

            const min = prop.minimumDate ? this.dateConstraint(prop.minimumDate) : "1900-01-01";
            const max = prop.maximumDate ? this.dateConstraint(prop.maximumDate) : "9999-12-31";
            const parts = (value || "").split("T");
            return (
                <span className="qt-designer-form-datetime">
                    <input
                        max={max[0]}
                        min={min[0]}
                        onChange={(ev) => updateField(widget, ev.target.value ? ev.target.value + (parts[1] ? ("T" + parts[1]) : "") : "")}
                        readOnly={inputConstraints.readOnly}
                        required={inputConstraints.required}
                        style={fontStyle}
                        type="date"
                        value={parts[0]}
                    />
                    <input
                        disabled={!parts[0]}
                        onChange={(ev) => updateField(widget, parts[0] + (ev.target.value ? "T" + ev.target.value : ""))}
                        {...inputConstraints} style={fontStyle}
                        type="time"
                        value={parts[1] || ""}
                    />
                    <input name={elname} type="hidden" value={prop.value} />
                </span>
            );
        } else if (widget.class === "QWidget") {
            return this.renderLayout(widget.layout, updateField, nametransform);
        } else if (widget.class === "QPushButton") {
            let text = prop.text;
            if (widgetControls.icon) {
                text = (<Icon icon={widgetControls.icon} />);
            }
            return (<button className="button" onClick={() => this.props.dispatchButton(JSON.parse(widgetFunction), widget)} type="button">{text}</button>);
        } else if (widget.class === "QgsFileWidget") {
            const accept = "image/*";
            const overrideText = this.props.files ? this.props.files.length + " " + LocaleUtils.tr("fileselector.files") : null;
            return (<FileSelector accept={accept} file={this.state.files} multiple onFilesSelected={this.onFilesSelected} overrideText={overrideText} showAllFilenames={false} />);
        }
        return null;
    };
    getWidgetValue = (widget) => {
        const prop = widget.property || {};

        if (widget.class === "QTextEdit" || widget.class === "QTextBrowser" || widget.class === "QPlainTextEdit" || widget.class === "QLineEdit") {
            return (this.props.widgetValues[widget.name]?.value ?? prop.text);
        } else if (widget.class === "QCheckBox" || widget.class === "QRadioButton") {
            const checked = (this.props.widgetValues[widget.name]?.value ?? prop.checked);
            return checked === true || checked === "true" || checked === "True";
        } else if (widget.class === "QComboBox") {
            // console.log(widget)
            let items = widget.item;
            if (!Array.isArray(widget.item) && items !== undefined) {
                items = [widget.item];
            }

            const optObj = items.find(obj => obj.property.value === prop.value);
            return (this.props.widgetValues[widget.name]?.value ?? optObj.property.value);

            // Commented out because the updateField called when it updates only uses the value, not the text
            // let option_value = null
            // if (prop.textIsValue === "true") {
            //     const optObj = items.find(obj => obj.property.text === prop.value);
            //     option_value = optObj.property.text
            // }
            // else {
            //     const optObj = items.find(obj => obj.property.value === prop.value);
            //     option_value = optObj.property.value
            // }
            // return (this.props.widgetValues[widget.name]?.value || option_value);
        } else if (
            widget.class === "QSpinBox" ||
            widget.class === "QDoubleSpinBox" ||
            widget.class === "QSlider" ||
            widget.class === "QDateEdit" ||
            widget.class === "QTimeEdit"
        ) {
            return (this.props.widgetValues[widget.name]?.value ?? prop.value);
        } else if (widget.class === "QDateTimeEdit") { // Removes milliseconds from the value
            const value = (this.props.widgetValues[widget.name]?.value ?? prop.value);

            const parts = (value || "T").split("T");
            parts[1] = (parts[1] ?? "").replace(/\.\d+$/, ''); // Strip milliseconds

            return parts[1] ? parts[0] + "T" + parts[1] : parts[0];
        } else if (widget.class === "QTableWidget") {
            const values = this.props.widgetValues[widget.name]?.body?.data.fields?.at(0).value ?? (prop.values ? JSON.parse(prop.values) : null);
            const form = this.props.widgetValues[widget.name]?.body?.form ?? (prop.form ? JSON.parse(prop.form) : null);
            return {
                values: values,
                form: form
            };
        } else if (widget.class === "QTableView") {
            return this.props.widgetValues[widget.name]?.body?.data.fields?.at(0).value ?? (prop.values ? JSON.parse(prop.values) : null);
        }

        return null;
    };

    onFilesSelected = (files) => {
        this.props.dispatchButton({ functionName: "upload_file", file: files });
        this.setState({files});
    };
    groupOrName = (widget) => {
        return widget.attribute && widget.attribute.buttonGroup ? widget.attribute.buttonGroup._ : widget.name;
    };
    dateConstraint = (constr) => {
        return (constr.year + "-" + ("0" + constr.month).slice(-2) + "-" + ("0" + constr.day).slice(-2));
    };
    parseForm = (data) => {
        const options = {
            explicitArray: false,
            mergeAttrs: true
        };
        const loadingReqId = uuidv1();
        this.setState({ loading: true, loadingReqId: loadingReqId });
        xml2js.parseString(data.replace(/&/g, '&amp;'), options, (err, json) => {
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

            // const activetabs = this.filterActiveTabs(json, this.state.activetabs)

            this.setState({ formData: json, loading: false, loadingReqId: null });
            // this.setState({ formData: json, loading: false, loadingReqId: null, activetabs: activetabs });
        });
    };
    reformatWidget = (widget, fields, externalFields, counters) => {
        // console.log(widget.property)
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

        if (this.props.getInitialValues) {
            const value = this.getWidgetValue(widget);
            if (value !== null) {
                this.props.updateField(widget, value, true);
            }
        }

        if (widget.layout) {
            this.reformatLayout(widget.layout, fields, externalFields, counters);
        }
        if (widget.widget) {
            widget.widget = Array.isArray(widget.widget) ? widget.widget : [widget.widget];
            widget.widget.forEach(child => {
                child.name = child.name || (":widget_" + counters.widget++);
                this.reformatWidget(child, fields, externalFields, counters);
            });
        }
    };
    reformatLayout = (layout, fields, externalFields, counters) => {
        layout.item = MiscUtils.ensureArray(layout.item);
        layout.name = layout.name || (":layout_" + counters.layout++);
        layout.item.forEach(item => {
            if (!item) {
                return;
            } else if (item.widget) {
                this.reformatWidget(item.widget, fields, externalFields, counters);
            } else if (item.spacer) {
                item.spacer.property = MiscUtils.ensureArray(item.spacer.property).reduce((res, prop) => {
                    return ({...res, [prop.name]: prop[Object.keys(prop).find(key => key !== "name")]});
                }, {});
            } else if (item.layout) {
                this.reformatLayout(item.layout, fields, externalFields, counters);
            }
        });
    };
    filterActiveTabs = (formJson, oldActiveTabs) => {
        const tabs = [];
        GwUtils.forEachWidgetInForm(formJson, widget => {
            if (widget.class === "QTabWidget") {
                tabs.push(widget);
            }
        });

        const activetabsArr = Object.entries(oldActiveTabs);
        const newTabsArr = activetabsArr.filter(([widget, activetab]) => {
            const tabWidget = tabs.find(tab => tab.name === widget);
            // if the tab widget exists
            if (tabWidget) {
                // if the tab widget has the active tab
                if (tabWidget.widget.find(tab => tab.name === activetab)) {
                    return true;
                }
            }
            return false;
        });
        const activetabs = Object.fromEntries(newTabsArr);
        return activetabs;
    };
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
    };
}

export default connect((state) => ({
    locale: state.locale.current
}), {
})(GwQtDesignerForm);
