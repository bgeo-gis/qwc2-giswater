/**
 * Copyright © 2023 by BGEO. All rights reserved.
 * The program is free software: you can redistribute it and/or modify it under the terms of the GNU
 * General Public License as published by the Free Software Foundation, either version 3 of the License,
 * or (at your option) any later version
 */

import React from 'react';
import { connect } from 'react-redux';
import PropTypes from 'prop-types';
import Chartist from 'chartist';
import ChartistComponent from 'react-chartist';

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
        const periodDates = info.period_dates;

        // Datos de la red
        const metersIn = info.meters_in; //
        const metersOut = info.meters_out; //
        const nConnec = info.n_connec; // numero acometidas
        const nHydro = info.n_hydro; // numero abonados
        const arcLength = info.arc_length; // longitud red
        const linkLength = info.link_length; // longitud acometidas

        // Pie Chart
        // Datos
        const total = info.total; // total inyectado
        const flow = "2.55"; // TODO: FALTA!!!
        const dmaRwEff = (info.dma_rw_eff * 100)?.toFixed(2); // rendimiento
        const dmaNrwEff = (info.dma_nrw_eff * 100)?.toFixed(2); // dma agua no controlada

        // Gràfico
        const nrw = info?.nrw; // VANC
        const auth = info?.auth; // total abonados

        // Otros indicadores
        // dma agua no controlada
        const explNrwEff = (info.expl_nrw_eff * 100)?.toFixed(2); // expl agua no controlada
        const dmaIli = info.dma_ili?.toFixed(2); // dma indice perdidas
        const explIli = info.expl_ili?.toFixed(2); // expl indice perdidas
        const dmaM4day = info.dma_m4day?.toFixed(2); // dma m3kmdia
        const explM4day = info.expl_m4day?.toFixed(2); // expl m3kmdia
        const dmaNightvol = info.dma_nightvol; // dma min nocturno
        const explNightvol = info.expl_nightvol; // expl min nocturno

        const data = this.props.jsonData?.info?.values?.chart;
        const { dataPiechart, optionsPiechart, dataChart, listeners, optionsChart } = this.getChartData(data, dma, exploitation, nrw, auth);

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
                            <td>{periodDates}</td>
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
                            <td>{metersIn}, {metersOut}</td>
                        </tr>
                        <tr>
                            <td>Número acometidas</td>
                            <td>{nConnec}</td>
                        </tr>
                        <tr>
                            <td>Número abonados</td>
                            <td>{nHydro}</td>
                        </tr>
                        <tr>
                            <td>Longitud red</td>
                            <td>{arcLength}</td>
                        </tr>
                        <tr>
                            <td>Longitud acometidas</td>
                            <td>{linkLength}</td>
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
                        <li>Rendimiento: {dmaRwEff}%</li>
                        <li>VANC: {dmaNrwEff}%</li>
                    </ul>
                </div>
                <div id="GwDmaPieChart">
                    <ChartistComponent data={dataPiechart} options={optionsPiechart} ref={el => { this.plot = el; }} type="Pie" />
                </div>
            </div>
        );
        const barChartBody = (
            <div>
                <div id="GwDmaGraph">
                    <ChartistComponent data={dataChart} listener={listeners} options={optionsChart} ref={el => { this.plot = el; }} type="Line" />
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
                            <td>{dmaNrwEff}%</td>
                            <td>{explNrwEff}%</td>
                        </tr>
                        <tr>
                            <td>Indice de pérdidas</td>
                            <td>{dmaIli}</td>
                            <td>{explIli}</td>
                        </tr>
                        <tr>
                            <td>m3kmdia</td>
                            <td>{dmaM4day}</td>
                            <td>{explM4day}</td>
                        </tr>
                        <tr>
                            <td>Mínimo nocturno</td>
                            <td>{dmaNightvol}</td>
                            <td>{explNightvol}</td>
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
        let dmaLine = null;
        let explLine = null;

        if (data !== null && typeof data !== 'undefined') {
            const extractData = (d, propertyName) => {
                return d[propertyName].map(item => {
                    const value = Object.values(item)[0];
                    const x = Date.parse(Object.keys(value)[0]);
                    const y = Object.values(value)[0];
                    return { x, y };
                });
            };
            dmaLine = extractData(data, dma);
            explLine = extractData(data, exploitation);

        }

        const dataChart = {
            series: [
                {
                    name: 'line1',
                    data: dmaLine,
                    className: 'ct-terrain-line'
                },
                {
                    name: 'line2',
                    data: explLine,
                    className: 'ct-terrain-line2'
                }
            ]
        };

        const optionsChart = {
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
            resize: () => {
                this.update();
            }
        };

        // Pie Chart
        const dataPiechart = {
            labels: ['VANC (' + nrw + ')', 'Total abonados (' + auth + ')'],
            series: [nrw, auth]
        };

        const optionsPiechart = {
            labelInterpolationFnc: function(value) {
                return value;
            }
        };
        return { dataPiechart, optionsPiechart, dataChart, listeners, optionsChart };
    }
}

export default connect((state) => ({
    locale: state.locale.current
}), {
})(GwInfoDmaForm);
