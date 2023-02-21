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
//import { OpenInBrowser, Cancel, Delete } from '@mui/icons-material';
import * as icons from '@mui/icons-material';
// import 'qwc2-giswater/components/style/GwInfoDmaForm.css';

class GwTableWidget extends React.Component {
    static propTypes = {
        values: PropTypes.array,
        dispatchButton: PropTypes.func,
        form: PropTypes.object,
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

    getIconComponent = (iconName) => {
        // Convertir el nombre del icono a PascalCase
        const iconComponentName = iconName.charAt(0).toUpperCase() + iconName.slice(1);
        // Buscar el componente de icono correspondiente dentro del objeto de iconos
        const IconComponent = icons[iconComponentName];
        // Devolver el componente de icono
        return IconComponent ? React.createElement(IconComponent) : null;
    }

    render() {
        const data = this.props.values;
        let cols = [];
        const headers = this.props.form.headers;
        const tableParams = this.props.form.table;
        if (headers !== undefined){
            console.log("entramos")
            Object.keys(data[0]).map(key => {
                const header = headers.filter(header => {
                    return header.accessorKey === key;
                })[0];

                if (header !== undefined && header['filterVariant'] !== undefined){
                    if (header.filterVariant === 'datetime'){
                        header['Cell'] = ({ cell }) => {
                            const date = new Date(cell.getValue());
                            if (!date || date.getTime() === 0) {
                                return "";
                            }
                            return date.toLocaleDateString('es-ES', {
                                day: '2-digit',
                                month: '2-digit',
                                year: 'numeric'
                            });
                        };
                        header['Filter'] = ({ column }) => (
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
                        );
                    }
                }

                if (header !== undefined){
                    cols.push(header);
                }

            });
        }
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

        
        var inputProps = {
            enableGlobalFilter: tableParams.enableGlobalFilter ?? false,
            enableStickyHeader: tableParams.enableStickyHeader ?? true,
            positionToolbarAlertBanner: tableParams.positionToolbarAlertBanner ?? "bottom",
            enableGrouping: tableParams.enableGrouping ?? true,
            enablePinning: tableParams.enablePinning ?? true,
            enableColumnOrdering: tableParams.enableColumnOrdering ?? true,
            enableColumnFilterModes: tableParams.enableColumnFilterModes ?? true,
            enableFullScreenToggle: tableParams.enableFullScreenToggle ?? false,
            enablePagination: tableParams.enablePagination ?? true,
            //enableRowSelection: tableParams.enableRowSelection ?? true,
            enableRowActions: tableParams.enableRowActions ?? false,
            initialState: tableParams.initialState ?? {}
        }

        if (inputProps.enablePagination){
            inputProps.muiTablePaginationProps={
                rowsPerPageOptions: tableParams.muiTablePaginationProps.rowsPerPageOptions ?? [5, 10, 20, 50, 100],
                showFirstButton: tableParams.muiTablePaginationProps.showFirstButton ?? true,
                showLastButton: tableParams.muiTablePaginationProps.showLastButton ?? true
            }
        }
        
        if (tableParams.enableRowSelection){
            inputProps.getRowId=((row) => row.userId);
            inputProps.muiTableBodyRowProps=(({ row }) => ({
                onClick: () => {
                    if (tableParams.multipleRowSelection){
                        this.setState(prevState => ({
                            rowSelection: {
                                ...prevState.rowSelection,
                                [row.id]: !prevState.rowSelection[row.id],
                            }
                        }));
                    } else {
                        this.setState({
                            rowSelection: {
                                [row.id]: !rowSelection[row.id]
                            }
                        })
                    }
                    
                },
                selected: rowSelection[row.id],
                sx: {
                    cursor: 'pointer',
                }
            }));
            inputProps.state={rowSelection};
        }
        
        if (inputProps.enableRowActions){
            let menuItems = tableParams.renderRowActionMenuItems;
            inputProps.renderRowActionMenuItems= (({ row, closeMenu }) => {
                let itemList=menuItems.map((item,index)=>{
                    const IconComponent = this.getIconComponent(item.icon);
                    return <MenuItem
                            key={index}
                            onClick={() => {
                                this.props.dispatchButton({ "functionName": item.widgetfunction, "row": row.original });
                                closeMenu();
                            } }
                            sx={{ m: 0 }}
                            >
                                <ListItemIcon>
                                    {IconComponent}
                                </ListItemIcon>
                                {item.text}
                            </MenuItem>
                });
                return itemList;
            })
        }
        const multipleRowSelection = tableParams.multipleRowSelection;
        inputProps.renderTopToolbarCustomActions=(({ table }) => (
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
                {multipleRowSelection ? (
                    <Button
                    disabled={
                    !table.getIsSomeRowsSelected() && !table.getIsAllRowsSelected()
                    }
                    //only export selected rows
                    onClick={() => handleExportRows(table.getSelectedRowModel().rows)}
                    startIcon={<FileDownloadIcon />}
                    variant="contained"
                    >
                        Export Selected Rows
                    </Button>
                ) : null}
                <Button onClick={() => table.resetColumnFilters()}>
                Reset Filters
                </Button>
            </Box>
        ));

        return (
            <MaterialReactTable
                columns={cols}
                data={data}
                {...inputProps}
            />
        );
    }
}

export default connect((state) => ({
    locale: state.locale.current
}), {
})(GwTableWidget);
