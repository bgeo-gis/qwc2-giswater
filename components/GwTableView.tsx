import React from 'react';

import Icon from 'qwc2/components/Icon';
import 'qwc2-giswater/components/style/GwTableView.css';


type GwTableViewProps = {
    data: {[key: string]: string}[]
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
        const value = this.props.data;

        const resultsContainerStyle = {
            maxHeight: this.state.currentResult ? '20%' : 'initial'
        };

        return (
            <div className="gwtableview-body">
                <div
                    className="gwtableview-results-container"
                    style={resultsContainerStyle}
                >
                    {value.map(result => {
                        const id = Object.values(result)[0];
                        return (
                            <div
                                className="gwtableview-entry"
                                key={id}
                            >
                                <span
                                    className={this.state.currentResult === result ? "active clickable" : "clickable"}
                                    onClick={() => this.setState({ currentResult: result })}
                                >
                                    {id}
                                </span>
                            </div>
                        );
                    })}
                </div>
                {this.state.currentResult ? (
                    <div className="gwtableview-current-result">
                        <div className="gwtableview-result-title">
                            <Icon icon="minus" onClick={() => this.setState({ currentResult: null })} />
                            <span>{`${Object.keys(this.state.currentResult)[0]}: ${Object.values(this.state.currentResult)[0]}`}</span>
                        </div>
                        <div className="gwtableview-result-attributes">
                            <table>
                                <tbody>
                                    {Object.entries(this.state.currentResult).map(([key, value], i) => (
                                        <tr key={i}>
                                            <td>{key}</td>
                                            <td>{value}</td>
                                        </tr>
                                    ))}
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