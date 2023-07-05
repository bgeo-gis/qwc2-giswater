/**
 * Copyright BGEO. All rights reserved.
 * The program is free software: you can redistribute it and/or modify it under the terms of the GNU
 * General Public License as published by the Free Software Foundation, either version 3 of the License,
 * or (at your option) any later version
 */

import axios from 'axios';
import React from 'react';
import { useState } from 'react';
import { connect } from 'react-redux';
import PropTypes from 'prop-types';
import Chartist from 'chartist';
import ChartistComponent from 'react-chartist';
import ChartistAxisTitle from 'chartist-plugin-axistitle';
import xml2js from 'xml2js';
import isEmpty from 'lodash.isempty';
import Spinner from 'qwc2/components/Spinner';
import LocaleUtils from 'qwc2/utils/LocaleUtils';
import MiscUtils from 'qwc2/utils/MiscUtils';
import ConfigUtils from 'qwc2/utils/ConfigUtils';

import 'qwc2-giswater/components/style/GwInfoDmaForm.css';

class GwInfoDmaForm extends React.Component {
    static propTypes = {
        jsonData: PropTypes.object
    };

    render() {
        const info = this.props.jsonData?.info?.values?.info || {};

        const dma = info.dma;
        const exploitation = info.exploitation;

        // Período e intérvalo
        const period = info.period;
        const period_dates = info.period_dates;

        // Datos de la red
        const meters_in = info.meters_in; //
        const meters_out = info.meters_out; //
        const n_connec = info.n_connec; // numero acometidas
        const n_hydro = info.n_hydro; // numero abonados
        const arc_length = info.arc_length; // longitud red
        const link_length = info.link_length; // longitud acometidas

        // Pie Chart
        // Datos
        const total = info.total; // total inyectado
        const flow = "2.55"; // TODO: FALTA!!!
        const dma_rw_eff = (info.dma_rw_eff * 100)?.toFixed(2); // rendimiento
        const dma_nrw_eff = (info.dma_nrw_eff * 100)?.toFixed(2); // dma agua no controlada

        // Gràfico
        const nrw = info?.nrw; // VANC
        const auth = info?.auth; // total abonados

        // Otros indicadores
        // dma agua no controlada
        const expl_nrw_eff = (info.expl_nrw_eff * 100)?.toFixed(2); // expl agua no controlada
        const dma_ili = info.dma_ili?.toFixed(2); // dma indice perdidas
        const expl_ili = info.expl_ili?.toFixed(2); // expl indice perdidas
        const dma_m4day = info.dma_m4day?.toFixed(2); // dma m3kmdia
        const expl_m4day = info.expl_m4day?.toFixed(2); // expl m3kmdia
        const dma_nightvol = info.dma_nightvol; // dma min nocturno
        const expl_nightvol = info.expl_nightvol; // expl min nocturno

        const data = this.props.jsonData?.info?.values?.chart;
        const { data_piechart, options_piechart, data_chart, listeners, options_chart } = this.getChartData(data, dma, exploitation, nrw, auth);

        const periodBody = (
            <div className="periodBody">
                <table>
                    <tbody>
                        <tr>
                            <th>Período</th>
                            <td>{period}</td>
                        </tr>
                        <tr>
                            <th>Intérvalo:</th>
                            <td>{period_dates}</td>
                        </tr>
                    </tbody>
                </table>
            </div>
        );
        const networkBody = (
            <div className="networkBody">
                <table>
                    <thead>
                        <tr>
                            <th>Datos de red</th>
                        </tr>
                    </thead>
                    <tbody>
                        <tr>
                            <td>Códigos sectoriales</td>
                            <td>{meters_in}, {meters_out}</td>
                        </tr>
                        <tr>
                            <td>Número acometidas</td>
                            <td>{n_connec}</td>
                        </tr>
                        <tr>
                            <td>Número abonados</td>
                            <td>{n_hydro}</td>
                        </tr>
                        <tr>
                            <td>Longitud red</td>
                            <td>{arc_length}</td>
                        </tr>
                        <tr>
                            <td>Longitud acometidas</td>
                            <td>{link_length}</td>
                        </tr>
                    </tbody>
                </table>
            </div>
        );
        const pieChartBody = (
            <div className="pieChartBody">
                <div id="pieChartData">
                    <ul>
                        <li>Total inyectado: {total} m3</li>
                        <li>Caudal: {flow} lps</li>
                        <li>Total abonados: {auth} m3</li>
                        <li>Total VANC: {nrw} m3</li>
                        <li>Rendimiento: {dma_rw_eff}%</li>
                        <li>VANC: {dma_nrw_eff}%</li>
                    </ul>
                </div>
                <div id="GwDmaPieChart">
                    <ChartistComponent data={data_piechart} options={options_piechart} ref={el => { this.plot = el; }} type="Pie" />
                </div>
            </div>
        );
        const barChartBody = (
            <div>
                <div id="GwDmaGraph">
                    <ChartistComponent data={data_chart} listener={listeners} options={options_chart} ref={el => { this.plot = el; }} type="Line" />
                </div>
                <div className="graphDmaLegend">
                    <p className="graphLineDma">{dma}</p>
                    <p className="graphLineExpl">{exploitation}</p>
                </div>
            </div>

        );
        const othersBody = (
            <div className="othersBody">
                <table>
                    <thead>
                        <tr>
                            <th>Otros indicadores</th>
                            <th>DMA</th>
                            <th>EXPL</th>
                        </tr>
                    </thead>
                    <tbody>
                        <tr>
                            <td>Agua no controlada</td>
                            <td>{dma_nrw_eff}%</td>
                            <td>{expl_nrw_eff}%</td>
                        </tr>
                        <tr>
                            <td>Indice de pérdidas</td>
                            <td>{dma_ili}</td>
                            <td>{expl_ili}</td>
                        </tr>
                        <tr>
                            <td>m3kmdia</td>
                            <td>{dma_m4day}</td>
                            <td>{expl_m4day}</td>
                        </tr>
                        <tr>
                            <td>Mínimo nocturno</td>
                            <td>{dma_nightvol}</td>
                            <td>{expl_nightvol}</td>
                        </tr>
                    </tbody>
                </table>
            </div>
        );

        return (
            <div id="dmaDiv">
                <h1><b>{dma} ({exploitation})</b></h1>
                {periodBody}
                {networkBody}
                {pieChartBody}
                {barChartBody}
                {othersBody}
            </div>
        );
    }

    getChartData(data, dma, exploitation, nrw, auth) {
        let dma_line = null;
        let expl_line = null;

        if (data !== null && typeof data !== 'undefined') {
            const extractData = (data, propertyName) => {
                return data[propertyName].map(item => {
                    const key = Object.keys(item)[0];
                    const value = Object.values(item)[0];
                    const x = Date.parse(Object.keys(value)[0]);
                    const y = Object.values(value)[0];
                    return { x, y };
                });
            };
            dma_line = extractData(data, dma);
            expl_line = extractData(data, exploitation);

        }

        const data_chart = {
            series: [
                {
                    name: 'line1',
                    data: dma_line,
                    className: 'ct-terrain-line'
                },
                {
                    name: 'line2',
                    data: expl_line,
                    className: 'ct-terrain-line2'
                }
            ]
        };

        const options_chart = {
            width: '100%',
            height: 200,
            chartPadding: { left: 5, bottom: 1, top: 0 },
            series: {
                line1: {
                    low: 0,
                    showArea: false,
                    showPoint: false,
                    lineSmooth: false
                },
                line2: {
                    low: 0,
                    showArea: false,
                    showPoint: false,
                    lineSmooth: false
                }
            },

            axisX: {
                type: Chartist.FixedScaleAxis,
                divisor: 5,
                labelInterpolationFnc: value => new Date(value).toLocaleString(undefined, {
                    month: 'short',
                    day: 'numeric'
                })
                /*
            labelInterpolationFnc: function(value) {
              return moment(value).format('MMM D');
            }
            */
            }
        };

        const listeners = {
            resize: ev => {
                this.update();
            }
        };

        // Pie Chart
        const data_piechart = {
            labels: ['VANC (' + nrw + ')', 'Total abonados (' + auth + ')'],
            series: [nrw, auth]
        };

        const options_piechart = {
            labelInterpolationFnc: function(value) {
                return value;
            }
        };
        return { data_piechart, options_piechart, data_chart, listeners, options_chart };
    }
}

export default connect((state) => ({
    locale: state.locale.current
}), {
})(GwInfoDmaForm);
