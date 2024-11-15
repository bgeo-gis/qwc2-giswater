/**
 * Copyright © 2024 by BGEO. All rights reserved.
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

import GwTableWidgetV3 from 'qwc2-giswater/components/GwTableWidgetV3';
import GwTableView from 'qwc2-giswater/components/GwTableView';
import 'qwc2/components/style/QtDesignerForm.css';
import 'qwc2-giswater/components/style/GwQtDesignerForm.css';
import FileSelector from 'qwc2/components/widgets/FileSelector';
import GwUtils from 'qwc2-giswater/utils/GwUtils';
import Icon from 'qwc2/components/Icon';


type Properties = {
    value: any,
    props: {[name: string]: any},
    disabled: boolean,
    hidden: boolean,
    items: any[], // For comboboxes, but needs to be implemented
};

type WidgetsProperties = {
    [widgetName: string]: Properties
};

type GwQtDesignerFormProps = {
    activetabs: any,
    autoResetTab: boolean,
    disabledWidgets: string[],
    onWidgetAction: (action: any, widget?: any) => void,
    form_xml: string,
    getInitialValues: boolean,
    hiddenWidgets: string[],
    locale: string,
    loading: boolean,
    onTabChanged: (tab: any, widget: any) => void,
    readOnly: boolean,
    onWidgetValueChange: (widget: any, value: any, initial?: boolean) => void,
    widgetValues: any,
    useNew: boolean,
    widgetsProperties: WidgetsProperties,
    loadWidgetsProperties: (widgetsProperties: WidgetsProperties) => void,
    loadFormUi: (formUi: any) => void,
    widgetPrefix: string,
    style: React.CSSProperties,
    buttonAlwaysActive: boolean,
};

type GwQtDesignerFormState = {
    activetabs: any,
    formData: any,
    loading: boolean,
    loadingReqId: string | null,
};

export default class GwQtDesignerForm extends React.Component<GwQtDesignerFormProps, GwQtDesignerFormState> {

    static defaultProps: Partial<GwQtDesignerFormProps> = {
        onWidgetValueChange: (name, value, initial = false) => { console.log(name, value, initial); },
        onWidgetAction: (action) => { console.log(action); },
        onTabChanged: (tab, widget) => { console.log(tab, widget); },
        autoResetTab: true,
        widgetValues: {},
        disabledWidgets: [],
        hiddenWidgets: [],
        getInitialValues: true,
        activetabs: {},
        useNew: false,
        loading: false,
        widgetsProperties: {},
        loadWidgetsProperties: (widgetsProperties) => {},
        style: {},
        buttonAlwaysActive: false
    };
    static defaultState: GwQtDesignerFormState = {
        activetabs: {},
        formData: null,
        loading: false,
        loadingReqId: null,
    };
    constructor(props) {
        super(props);
        this.state = GwQtDesignerForm.defaultState;
    }
    componentDidMount() {
        this.componentDidUpdate({});
    }
    componentDidUpdate(prevProps) {

        if (this.props.useNew === false) {
            console.error("GwQtDesignerForm with useNew=false is deprecated. Please use useNew=true");
        }

        // Query form
        if (this.props.form_xml !== prevProps.form_xml) {
            this.setState((state, props) => ({
                ...GwQtDesignerForm.defaultState,
                activetabs: props.autoResetTab ? {} : state.activetabs
            }), () => {
                if (this.props.form_xml) {
                    this.parseForm(this.props.form_xml);
                } else {
                    console.warn("Empty xml");
                }
            });
        }
    }
    render() {
        if (this.state.loading || this.props.loading) {
            return (
                <div className="qt-designer-form-loading">
                    <Spinner/><span>{LocaleUtils.tr("qtdesignerform.loading")}</span>
                </div>
            );
        } else if (this.state.formData) {
            const root = this.state.formData.ui.widget;
            return (
                <div className={"qt-designer-form"} style={this.props.style}>
                    {this.renderLayout(root.layout)}
                </div>
            );
        } else if (!this.props.form_xml) {
            return (
                <span>XML is empty!</span>
            );
        } else {
            return null;
        }
    }
    renderLayout = (layout, nametransform = (name) => name, visible = true, disabled = false) => {
        let containerClass = "";
        let itemStyle = (item, idx) => ({});
        let sortKey = (item, idx?) => idx;
        let containerStyle: any = {};
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
        return ( // @ts-ignore
            <div className={containerClass} key={layout.name} name={layout.name} style={containerStyle}>
                {layout.item.sort((a, b) => (sortKey(a) - sortKey(b))).map((item, idx) => {
                    let child = null;
                    if (item.widget) {
                        child = this.renderWidget(item.widget, nametransform, disabled);
                    } else if (item.layout) {
                        child = this.renderLayout(item.layout, nametransform, true, disabled);
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
        const fitWidgets = ["QLabel", "QCheckBox", "QRadioButton", "Line", "QDateTimeEdit", "QDateEdit", "QTimeEdit", "QPushButton", "QComboBox", "QLineEdit", "QSpinBox", "QDoubleSpinBox", "QSlider"];
        const expandWidgets = ["QTextEdit", "QTextBrowser", "QPlainTextEdit", "QTableWidget", "QTableView"];

        const isSpacer = (item) => {
            if (item.layout) {
                return item.layout.item.find(item => isSpacer(item));
            } else {
                return item.spacer && (item.spacer.property || {}).orientation === "Qt::Vertical";
            }
        }
        const isExpand = (item) => {
            if (item.layout) {
                return item.layout.item.find(item => isExpand(item));
            } else if (item.widget) {
                return expandWidgets.includes(item.widget.class);
            }
            return false;
        }

        let index = 0;
        let hasAuto = false;
        const hasSpacer = items.find(item => isSpacer(item));
        const hasExpand = items.find(item => isExpand(item));
        for (const item of items) {
            const row = useIndex ? index : (parseInt(item.row, 10) || 0);
            const rowSpan = useIndex ? 1 : (parseInt(item.rowspan, 10) || 1);
            if (!hasExpand && item.widget && !fitWidgets.includes(item.widget.class) && rowSpan === 1 && item.widget.property?.fit_vertical !== "true") {
                rows[row] = 'auto';
                hasAuto = true;
            } else if ((isExpand(item) && !hasSpacer) || isSpacer(item)) {
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
    getWidgetProperties = (widget): Properties => {
        const properties = this.getBaseWidgetProperties(widget);
        const userProperties: any = this.props.widgetsProperties[widget.name] || {};

        return {
            value: userProperties.value ?? properties.value,
            props: {
                ...properties.props,
                ...userProperties.props,
                suggestions: userProperties.props?.suggestions || []  // Retrieve suggestions from widget properties (typeahead)
            },
            disabled: userProperties.disabled ?? properties.disabled,
            hidden: userProperties.hidden ?? properties.hidden,
            items: userProperties.items || properties.items || [] // Items for combobox, default to empty if not provided
        };
    };
    renderWidget = (widget, nametransform = (name) => name, disabled = false) => {
        const widgetProperties = this.getWidgetProperties(widget);
        const prop = this.props.useNew ? widgetProperties.props : (widget.property || {});
        if (prop.visible === "false") {
            return null;
        }
        // const attr = widget.attribute || {};
        const inputConstraints: any = {};
        inputConstraints.readOnly = this.props.useNew ? (this.props.readOnly || widgetProperties.disabled || disabled) : (
            this.props.readOnly
            || this.props.disabledWidgets.includes(widget.name)
            || prop.readOnly === "true"
            || prop.enabled === "false"
        );
        const tmpName = (widget.name).replace("_label", "");
        inputConstraints.hidden = this.props.useNew ? widgetProperties.hidden : this.props.hiddenWidgets.includes(tmpName);
        // inputConstraints.readOnly = false;
        inputConstraints.required = !inputConstraints.readOnly && (prop.required === "true");
        inputConstraints.placeholder = prop.placeholderText || "";

        const fontProps = prop.font || {};
        const fontStyle = {
            fontWeight: fontProps.bold === "true" ? "bold" : "normal",
            fontStyle: fontProps.italic === "true" ? "italic" : "normal",
            textDecoration: [fontProps.underline === "true" ? "underline" : "", fontProps.strikeout === "true" ? "line-through" : ""].join(" "),
            fontSize: Math.round((fontProps.pointsize || 9) / 9 * 100) + "%",
            textAlign: 'left',
            textWrap: 'pretty',
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
        const widgetControls = JSON.parse(prop.widgetcontrols || "{}") ?? {};

        // TODO: This should be removed (make sure it's ok)
        if (this.props.widgetValues[widget.name.replace("lbl_", "")]?.visible === false) {
            return null;
        }

        const value = this.props.useNew ? widgetProperties.value : this.getWidgetValue(widget);

        if (widget.class === "GwQtDesignerForm") {
            return (
                <GwQtDesignerForm
                    form_xml={value?.form_xml}
                    style={{height: "100%"}}
                    activetabs={this.props.activetabs}
                    autoResetTab={this.props.autoResetTab}
                    getInitialValues={this.props.getInitialValues}
                    loading={value?.loading}
                    onTabChanged={this.props.onTabChanged}
                    onWidgetAction={this.props.onWidgetAction}
                    onWidgetValueChange={this.props.onWidgetValueChange}
                    readOnly={inputConstraints.readOnly}
                    useNew={true}
                    widgetsProperties={this.props.widgetsProperties}
                    loadWidgetsProperties={this.props.loadWidgetsProperties}
                    // widgetPrefix={widget.name + "_" + (this.props.widgetPrefix ?? '')}
                />
            );
        }
        else if (widget.class === "QTableWidget") {
            if (!value || !value.values) {
                return null;
            }

            const { values, form } = value;

            return (<GwTableWidgetV3 onWidgetAction={this.props.onWidgetAction} form={form} values={values}/>);
        } else if (widget.class === "QTableView") {
            // Check if there is style specified in widgetcontrols
            const widgetControls = JSON.parse(widget.property.widgetcontrols);
            let style = widgetControls.style || "";

            return (<GwTableView values={value.values || []} form={value.form} style={style} />);
        } else if (widget.class === "QLabel") { // @ts-ignore
            return (<div hidden={inputConstraints.hidden} style={fontStyle} title={prop.toolTip}>{prop.text}</div>);
        } else if (widget.class === "Line") {
            const linetype = prop.orientation === "Qt::Vertical" ? "vline" : "hline";
            return (<div className={"qt-designer-form-" + linetype} />);
        } else if (widget.class === "QFrame") {
            return (
                <div className="qt-designer-form-container">
                    <div className="qt-designer-form-frame">
                        {this.renderLayout(widget.layout, nametransform, true, inputConstraints.readOnly)}
                    </div>
                </div>
            );
        } else if (widget.class === "QGroupBox") {
            return (
                <div className="qt-designer-form-container">
                    {/* @ts-ignore */}
                    <div className="qt-designer-form-frame-title" style={fontStyle}>{prop.title}</div>
                    <div className="qt-designer-form-frame">
                        {this.renderLayout(widget.layout, nametransform, true, inputConstraints.readOnly)}
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
                        {widget.widget.map(tab => (this.props.useNew ? this.getWidgetProperties(tab).hidden : this.props.hiddenWidgets.includes(tab.name)) ? null : (
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
                            this.renderLayout(child.layout, nametransform, child.name === activetab, this.getWidgetProperties(child).disabled)
                        ))}
                    </div>
                </div>
            );
        } else if (widget.class === "QTextEdit" || widget.class === "QTextBrowser" || widget.class === "QPlainTextEdit") {
            return (<textarea name={elname} onChange={(ev) => this.props.onWidgetValueChange(widget, ev.target.value)} {...inputConstraints} style={fontStyle} title={prop.toolTip} value={value} />);
        } else if (widget.class === "QLineEdit") {
            // If QLineEdit is typeahead
            if (widget.property.isTypeahead === 'true') {
                const suggestions = widgetProperties.props?.suggestions || [];
                const showSuggestionsList = suggestions.length > 0 && !(suggestions.length === 1 && suggestions[0] === value);
                return (
                    <div key={widget.name} style={{ position: 'relative', width: '100%' }}>
                        <input name={elname} onChange={(ev) => this.props.onWidgetValueChange(widget, ev.target.value)} {...inputConstraints} size={5} style={{ ...fontStyle, width: '100%' }} title={prop.toolTip} type="text" value={value} />

                        {showSuggestionsList && (
                            <div style={{
                                position: 'absolute',
                                backgroundColor: 'white',
                                border: '1px solid #ccc',
                                zIndex: 1000,
                                width: '100%',
                                maxHeight: '150px',
                                overflowY: 'auto'
                            }}>
                                {suggestions.map((suggestion, idx) => (
                                    <div
                                        key={idx}
                                        onClick={() => this.props.onWidgetValueChange(widget, suggestion)}  // Handle suggestion click
                                        style={{
                                            padding: '5px',
                                            cursor: 'pointer',
                                            backgroundColor: '#f9f9f9',
                                            borderBottom: '1px solid #ddd'
                                        }}
                                    >
                                        {suggestion}
                                    </div>
                                ))}
                            </div>
                        )}
                    </div>
                );
            }
            // If QLineEdit is not typeahead
            else{
                return (<input name={elname} onChange={(ev) => this.props.onWidgetValueChange(widget, ev.target.value)} {...inputConstraints} size={5} style={fontStyle} title={prop.toolTip} type="text" value={value} />);
            }
        } else if (widget.class === "QCheckBox" || widget.class === "QRadioButton") {
            const type = widget.class === "QCheckBox" ? "checkbox" : "radio";

            return (
                // @ts-ignore
                <label style={fontStyle} title={prop.toolTip}>
                    <input checked={value} disabled={inputConstraints.readOnly} name={nametransform(this.groupOrName(widget))} onChange={(ev) => this.props.onWidgetValueChange(widget, ev.target.checked)} {...inputConstraints} title={prop.toolTip} type={type} value={widget.name} />
                    {prop.text}
                </label>
            );
        } else if (widget.class === "QComboBox") {
            let items = this.props.widgetsProperties[widget.name]?.items;

            // Fallback to widget.item if items is an empty array or undefined
            if (!items || items.length === 0) {
                items = widget.item;
            }
            if (!Array.isArray(items) && items !== undefined) {
                items = [items];
            }
            const haveEmpty = (items || []).map((item) => (item.property.value || item.property.text) === "");
            return (
                // @ts-ignore
                <select disabled={inputConstraints.readOnly} hidden={inputConstraints.hidden} name={elname} onChange={ev => this.props.onWidgetValueChange(widget, ev.target.value, false, inputConstraints.placeholder)} title={prop.toolTip} {...inputConstraints} style={fontStyle} value={value}>
                    {!haveEmpty ? (
                        <option disabled={inputConstraints.required} hidden={inputConstraints.hidden} value="">
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
                <input max={max} min={min} name={elname} onChange={(ev) => this.props.onWidgetValueChange(widget, ev.target.value)} {...inputConstraints} size={5} step={step} style={fontStyle} title={prop.toolTip} type={type} value={value} />
            );
        } else if (widget.class === "QDateEdit") {
            const min = prop.minimumDate ? this.dateConstraint(prop.minimumDate) : "1900-01-01";
            const max = prop.maximumDate ? this.dateConstraint(prop.maximumDate) : "9999-12-31";
            return (
                <input max={max} min={min} name={elname} onChange={(ev) => this.props.onWidgetValueChange(widget, ev.target.value)} {...inputConstraints} style={fontStyle} title={prop.toolTip} type="date" value={value} />
            );
        } else if (widget.class === "QTimeEdit") {
            return (
                <input name={elname} onChange={(ev) => this.props.onWidgetValueChange(widget, ev.target.value)} {...inputConstraints} style={fontStyle} title={prop.toolTip} type="time" value={value} />
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
                <span className="qt-designer-form-datetime" title={prop.toolTip}>
                    <input
                        max={max[0]}
                        min={min[0]}
                        onChange={(ev) => this.props.onWidgetValueChange(widget, ev.target.value ? ev.target.value + (parts[1] ? ("T" + parts[1]) : "") : "")}
                        readOnly={inputConstraints.readOnly}
                        required={inputConstraints.required}
                        // @ts-ignore
                        style={fontStyle}
                        type="date"
                        value={parts[0]}
                    />
                    <input
                        disabled={!parts[0]}
                        onChange={(ev) => this.props.onWidgetValueChange(widget, parts[0] + (ev.target.value ? "T" + ev.target.value : ""))}
                        {...inputConstraints} style={fontStyle}
                        type="time"
                        value={parts[1] || ""}
                    />
                    <input name={elname} type="hidden" value={prop.value} />
                </span>
            );
        } else if (widget.class === "QWidget") {
            return this.renderLayout(widget.layout, nametransform, true, inputConstraints.readOnly);
        } else if (widget.class === "QPushButton") {
            let text = prop.text;
            if (widgetControls.icon) {
                text = (<Icon icon={widgetControls.icon} />);
            }
            return (<button className="button" disabled={inputConstraints.readOnly && !this.props.buttonAlwaysActive} onClick={() => this.props.onWidgetAction(JSON.parse(widgetFunction), widget)} title={prop.toolTip} type="button">{text}</button>);
        } else if (widget.class === "QgsFileWidget") {
            const accept = "image/*";
            return (<FileSelector accept={accept} file={value} multiple onFilesSelected={(files) => this.props.onWidgetValueChange(widget, files)} showAllFilenames={false} />);
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
            let items = this.props.widgetsProperties[widget.name]?.items;

            // Fallback to widget.item if items is an empty array or undefined
            if (!items || items.length === 0) {
                items = widget.item;
            }
            if (!Array.isArray(items) && items !== undefined) {
                items = [items];
            }

            const optObj = (items || []).find(obj => obj.property.value === prop.value);
            return (this.props.widgetValues[widget.name]?.value ?? (optObj?.property?.value || (items || [""])[0]?.property?.value || ""));

            // Commented out because the onWidgetValueChange called when it updates only uses the value, not the text
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
        } else if (
            widget.class === "QTableWidget" ||
            widget.class === "QTableView"
        ) {
            const values = this.props.widgetValues[widget.name]?.body?.data.fields?.at(0).value ?? (prop.values ? JSON.parse(prop.values) : null);
            const form = this.props.widgetValues[widget.name]?.body?.form ?? (prop.form ? JSON.parse(prop.form) : null);
            return {
                values: values,
                form: form
            };
        }

        return null;
    };
    groupOrName = (widget) => {
        return widget.attribute && widget.attribute.buttonGroup ? widget.attribute.buttonGroup._ : widget.name;
    };
    dateConstraint = (constr) => {
        return (constr.year + "-" + ("0" + constr.month).slice(-2) + "-" + ("0" + constr.day).slice(-2));
    };
    parseForm = (data: string) => {
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
            const counters = {
                widget: 0,
                layout: 0
            };

            const widgetsProperties: WidgetsProperties = {};
            let currentLayout: string = null;

            this.reformatWidget(json.ui.widget, currentLayout, widgetsProperties, counters);

            this.props.loadWidgetsProperties(widgetsProperties);

            // const activetabs = this.filterActiveTabs(json, this.state.activetabs)
            if (this.props.loadFormUi) {
                this.props.loadFormUi(json);
            }

            this.setState({ formData: json, loading: false, loadingReqId: null });
            // this.setState({ formData: json, loading: false, loadingReqId: null, activetabs: activetabs });
        });
    };
    getBaseWidgetProperties = (widget) => {
        return {
            value: widget.value,
            props: widget.property || {},
            disabled: widget.property?.readOnly === "true" || widget.property?.enabled === "false",
            hidden: false,
            items: widget.class === "QComboBox" && widget.item ? MiscUtils.ensureArray(widget.item) : [] // Items for combos
        };
    };
    reformatWidget = (widget, currentLayout: string, widgetsProperties: WidgetsProperties, counters) => {
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
            MiscUtils.ensureArray(widget.item).map(item => this.reformatWidget(item, currentLayout, widgetsProperties, counters));
        }

        widget.containingLayout = currentLayout;
        widget.name = widget.name || (":widget_" + counters.widget++);
        if (this.props.widgetPrefix) {
            widget.name = this.props.widgetPrefix + widget.name;
        }
        widget.value = this.getWidgetValue(widget);

        widgetsProperties[widget.name] = this.getBaseWidgetProperties(widget);

        if (this.props.getInitialValues) {
            const value = widget.value;
            if ((value ?? null) !== null) {  // value is not null or undefined
                this.props.onWidgetValueChange(widget, value, true);
            }
        }

        if (widget.layout) {
            this.reformatLayout(widget.layout, currentLayout, widgetsProperties, counters);
        }
        if (widget.widget) {
            widget.widget = Array.isArray(widget.widget) ? widget.widget : [widget.widget];
            widget.widget.forEach(child => {
                child.name = child.name || (":widget_" + counters.widget++);
                this.reformatWidget(child, currentLayout, widgetsProperties, counters);
            });
        }
    };
    reformatLayout = (layout, currentLayout: string, widgetsProperties: WidgetsProperties, counters) => {
        layout.item = MiscUtils.ensureArray(layout.item);
        layout.name = layout.name || (":layout_" + counters.layout++);
        currentLayout = layout.name;
        layout.item.forEach(item => {
            if (!item) {
                return;
            } else if (item.widget) {
                this.reformatWidget(item.widget, currentLayout, widgetsProperties, counters);
            } else if (item.spacer) {
                item.spacer.property = MiscUtils.ensureArray(item.spacer.property).reduce((res, prop) => {
                    return ({...res, [prop.name]: prop[Object.keys(prop).find(key => key !== "name")]});
                }, {});
            } else if (item.layout) {
                this.reformatLayout(item.layout, currentLayout, widgetsProperties, counters);
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
