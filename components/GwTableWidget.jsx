/**
 * Copyright 2016-2021 Sourcepole AG
 * All rights reserved.
 *
 * This source code is licensed under the BSD-style license found in the
 * LICENSE file in the root directory of this source tree.
 */

import React from 'react';
import { connect } from 'react-redux';
import PropTypes from 'prop-types';
import MaterialReactTable from 'material-react-table';

//Material-UI Imports
import {
    Box,
    Button,
    ListItemIcon,
    MenuItem,
    Typography,
    TextField,
  } from '@mui/material';
//Date Picker Imports
import { AdapterDayjs } from '@mui/x-date-pickers/AdapterDayjs';
import { LocalizationProvider } from '@mui/x-date-pickers/LocalizationProvider';
import { DatePicker } from '@mui/x-date-pickers/DatePicker';

import FileDownloadIcon from '@mui/icons-material/FileDownload';
import { ExportToCsv } from 'export-to-csv'; //or use your library of choice here

//Icons Imports
import { OpenInBrowser, Cancel, Delete } from '@mui/icons-material';
// import 'qwc2-giswater/components/style/GwInfoDmaForm.css';

class GwTableWidget extends React.Component {
    static propTypes = {
        values: PropTypes.array,
        dispatchButton: PropTypes.func,
    }
    static defaultState = {
        loading: false
    }
    constructor(props) {
        super(props);
        this.state = GwTableWidget.defaultState;
        this.state = { 
            ...this.state,
            rowSelection: {} 
        };
    }

    render() {
        const data = this.props.values;
        let cols = [];
        const stateList = ["Planified", "In Progress", "Finished", "Canceled", "On Planning"];
        const typeList = ["Demo", "Real", "Test"];
        const explList = ["expl_01", "expl_02"];
        Object.keys(data[0]).map(key => {
            let capi = key.charAt(0).toUpperCase() + key.slice(1);
            if (key === "state") {
                cols.push({
                    header: capi,
                    accessorKey: key,
                    filterVariant: 'select',
                    filterSelectOptions: stateList
                });
            } else if (key === "mincut_type") {
                cols.push({
                    header: capi,
                    accessorKey: key,
                    filterVariant: 'select',
                    filterSelectOptions: typeList
                });
            } else if (key === "exploitation") {
                cols.push({
                    header: capi,
                    accessorKey: key,
                    filterVariant: 'select',
                    filterSelectOptions: explList
                });
            } else if (key === "anl_tstamp"){
                cols.push({
                    accessorFn: (row) => new Date(row.received_date),
                    header: capi,
                    accessorKey: key,
                    filterFn: 'greaterThanOrEqualTo',
                    sortingFn: 'datetime',
                    Cell: ({ cell }) => {
                        const date = cell.getValue();
                        if (!date || date.getTime() === 0) {
                            return "";
                        }
                        return date.toLocaleDateString('es-ES', {
                            day: '2-digit',
                            month: '2-digit',
                            year: 'numeric'
                        });
                    },
                    Header: ({ column }) => <em>{column.columnDef.header}</em>,


                    //Custom Date Picker Filter from @mui/x-date-pickers
                    Filter: ({ column }) => (
                        <LocalizationProvider dateAdapter={AdapterDayjs}>
                            <DatePicker
                                inputFormat="DD/MM/YYYY"
                                onChange={(newValue) => {
                                    column.setFilterValue(newValue);
                                } }
                                renderInput={(params) => {
                                    return (
                                      <TextField
                                        {...params}
                                        helperText={'Filter Mode: ' + column.getFilterFn().name}
                                        sx={{ minWidth: '120px' }}
                                        variant="standard" />
                                    );
                                }}
                                value={column.getFilterValue()} />
                        </LocalizationProvider>
                    ),
                });
            } else if (key === "received_date" || key === "forecast_start" || key === "forecast_end") {
                cols.push({
                    accessorFn: (row) => new Date(row.received_date),
                    header: capi,
                    accessorKey: key,
                    //filterFn: 'lessThanOrEqualTo',
                    //filterVariant: 'range',
                    sortingFn: 'datetime',
                    Cell: ({ cell }) => {
                        const date = cell.getValue();
                        if (!date || date.getTime() === 0) {
                            //console.log(date);
                            return "";
                        }
                        return date.toLocaleDateString('es-ES', {
                            day: '2-digit',
                            month: '2-digit',
                            year: 'numeric'
                        });
                    },
                    Header: ({ column }) => <em>{column.columnDef.header}</em>,


                    //Custom Date Picker Filter from @mui/x-date-pickers
                    Filter: ({ column }) => (
                        <LocalizationProvider dateAdapter={AdapterDayjs}>
                            <DatePicker
                                inputFormat="DD/MM/YYYY"
                                onChange={(newValue) => {
                                    column.setFilterValue(newValue);
                                } }

                                renderInput={(params) => {
                                    return (
                                      <TextField
                                        {...params}
                                        helperText={'Filter Mode: ' + column.getFilterFn().name}
                                        sx={{ minWidth: '120px' }}
                                        variant="standard" />
                                    );
                                  }}
                                value={column.getFilterValue()} />
                        </LocalizationProvider>
                    ),
                });
            } else {
                cols.push({
                    header: capi,
                    accessorKey: key
                });
            }

        });
        const { rowSelection } = this.state;
        const csvOptions = {
            fieldSeparator: ',',
            quoteStrings: '"',
            decimalSeparator: '.',
            showLabels: true,
            useBom: true,
            useKeysAsHeaders: false,
            headers: cols.map((c) => c.header),
        };

        const csvExporter = new ExportToCsv(csvOptions);

        const handleExportRows = (rows) => {
            csvExporter.generateCsv(rows.map((row) => row.original));
        };

        const handleExportData = () => {
            csvExporter.generateCsv(data);
        };

        let monthAgo = new Date();
        monthAgo.setMonth(monthAgo.getMonth() - 1);

        return (
            <MaterialReactTable
                columns={cols}
                data={data}
                enableColumnOrdering
                enableColumnFilterModes
                enableGlobalFilter={false} //turn off a feature
                // Pagination
                enablePagination={true}
                enableFullScreenToggle={false}
                muiTablePaginationProps={{
                    rowsPerPageOptions: [5, 10, 15, 20],
                    showFirstButton: false,
                    showLastButton: false,
                }}
                // Select row
                getRowId={(row) => row.userId}
                muiTableBodyRowProps={({ row }) => ({
                    onClick: () => this.setState({
                        rowSelection: {
                            [row.id]: !rowSelection[row.id]
                        }
                    }),
                    selected: rowSelection[row.id],
                    sx: {
                        cursor: 'pointer',
                    },
                })}
                state={{ rowSelection }}
                // Mostrar filtros por defecto
                initialState={{ showColumnFilters: false, pagination: { pageSize: 5, pageIndex: 0 }, density: 'spacious',
                    columnFilters: [
                        {
                            id: "anl_tstamp",
                            value: monthAgo
                        }
                      ],
                    sorting: [
                        {
                            id: 'id',
                            desc: false
                        }
                    ] }}
                // Exportar
                renderTopToolbarCustomActions={({ table }) => (
                    <Box
                        sx={{ display: 'flex', gap: '1rem', p: '0.5rem', flexWrap: 'wrap' }}
                    >
                        
                        <Button
                            disabled={table.getPrePaginationRowModel().rows.length === 0}
                            //export all rows, including from the next page, (still respects filtering and sorting)
                            onClick={() => handleExportRows(table.getPrePaginationRowModel().rows)}
                            startIcon={<FileDownloadIcon />}
                            variant="contained"
                        >
                            Export Data
                        </Button>
                        <Button onClick={() => table.resetColumnFilters()}>
                        Reset Filters
                        </Button>
                    </Box>
                )}
                // Opciones de cada row
                enableGrouping
                enablePinning
                enableRowActions
                //enableRowSelection
                renderRowActionMenuItems={({ row, closeMenu }) => [
                    <MenuItem
                        key={0}
                        onClick={() => {
                            this.props.dispatchButton({ "functionName": "open", "row": row.original });
                            closeMenu();
                        } }
                        sx={{ m: 0 }}
                    >
                        <ListItemIcon>
                            <OpenInBrowser />
                        </ListItemIcon>
                        Open
                    </MenuItem>,
                    <MenuItem
                        key={1}
                        onClick={() => {
                            this.props.dispatchButton({ "functionName": "cancel", "row": row.original });
                            closeMenu();
                        } }
                        sx={{ m: 0 }}
                    >
                        <ListItemIcon>
                            <Cancel />
                        </ListItemIcon>
                        Cancel
                    </MenuItem>,
                    <MenuItem
                        key={2}
                        onClick={() => {
                            this.props.dispatchButton({ "functionName": "delete", "row": row.original });
                            closeMenu();
                        } }
                        sx={{ m: 0 }}
                    >
                        <ListItemIcon>
                            <Delete />
                        </ListItemIcon>
                        Delete
                    </MenuItem>,
                ]}
                positionToolbarAlertBanner="bottom"
                enableStickyHeader />
        );
    }
}

export default connect((state) => ({
    locale: state.locale.current
}), {
})(GwTableWidget);
