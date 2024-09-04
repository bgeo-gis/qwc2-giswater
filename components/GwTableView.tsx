import React from 'react';

import Icon from 'qwc2/components/Icon';
import 'qwc2-giswater/components/style/GwTableView.css';
import GwUtils from 'qwc2-giswater/utils/GwUtils';


type GwTableViewProps = {
    values: {[key: string]: string}[],
    form: any
};

type GwTableViewState = {
    currentResult?: {[key: string]: string}
};

export default class GwTableView extends React.Component<GwTableViewProps, GwTableViewState> {
    static defaultState: GwTableViewState = {
        currentResult: null,
    };
    
    constructor(props: GwTableViewProps) {
        super(props);
        this.state = GwTableView.defaultState;
    }

    render() {
        const value = this.props.values;
        const replaceImgs = this.props.form?.table?.replaceImgs ?? true;
        const fieldName = value.length === 0 ? null : (this.props.form?.table?.displayField ?? Object.keys(value[0])[0]);

        const resultsContainerStyle = {
            maxHeight: this.state.currentResult ? '20%' : 'initial'
        };

        return (
            <div className="gwtableview-body">
                <div
                    className="gwtableview-results-container"
                    style={resultsContainerStyle}
                >
                    {value.map((result, i) => {
                        return (
                            <div
                                className="gwtableview-entry"
                                key={i}
                            >
                                <span
                                    className={this.state.currentResult === result ? "active clickable" : "clickable"}
                                    onClick={() => this.setState({ currentResult: result })}
                                >
                                    {result[fieldName]}
                                </span>
                            </div>
                        );
                    })}
                </div>
                {this.state.currentResult ? (
                    <div className="gwtableview-current-result">
                        <div className="gwtableview-result-title">
                            <Icon icon="minus" onClick={() => this.setState({ currentResult: null })} />
                            <span>{`${fieldName}: ${this.state.currentResult[fieldName]}`}
                            </span>
                        </div>
                        <div className="gwtableview-result-attributes">
                            <table>
                                <tbody>
                                    {Object.entries(this.state.currentResult).map(([key, value], i) => {
                                        return (
                                            <tr key={i}>
                                                <td>{key}</td>
                                                <td>
                                                    {
                                                        replaceImgs && /^https?:\/\/.*\.(jpg|jpeg|png|bmp|gif)$/i.exec(value) ? 
                                                            (<a href={value} rel="noreferrer" target="_blank"><img src={value} /></a>)
                                                            : (GwUtils.isValidHttpUrl(value) ? <a href={value} rel="noreferrer" target="_blank">{value}</a> : value)
                                                    }
                                                </td>
                                            </tr>
                                        )
                                    })}
                                </tbody>
                            </table>
                        </div>
                    </div>
                ) : null}
            </div>
        );

        return (
            <div className="qtableview-container">
                <table className="qtableview">
                    <thead className="qtableview-head">
                        <tr className="qtableview-row">
                            {Object.keys(value[0]).map((field, i) => (
                                <th className="qtableview-header" key={i}>{field}</th>
                            ))}
                        </tr>
                    </thead>
                    <tbody className="qtableview-body">
                        {value.map((v, i) => (
                            <tr className="qtableview-row" key={i}>
                                {Object.values(v).map((field, j) => (
                                    <td className="qtableview-cell" key={j}>{field}</td>
                                ))}
                            </tr>
                        ))}
                    </tbody>
                </table>
            </div>
        );

    }
}