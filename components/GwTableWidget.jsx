/**
 * Copyright BGEO. All rights reserved.
 * The program is free software: you can redistribute it and/or modify it under the terms of the GNU
 * General Public License as published by the Free Software Foundation, either version 3 of the License,
 * or (at your option) any later version
 */

import React from 'react';
import { connect } from 'react-redux';
import PropTypes from 'prop-types';
import MaterialReactTable from 'material-react-table';
import isEmpty from 'lodash.isempty';

import {
    MRT_ToggleFiltersButton
  } from 'material-react-table';
//Material-UI Imports
import {
    Box,
    Button,
    ListItemIcon,
    MenuItem,
    Typography,
    TextField,
    IconButton
  } from '@mui/material';
//Date Picker Imports
import { AdapterDayjs } from '@mui/x-date-pickers/AdapterDayjs';
import { LocalizationProvider } from '@mui/x-date-pickers/LocalizationProvider';
import { DatePicker } from '@mui/x-date-pickers/DatePicker';

import FileDownloadIcon from '@mui/icons-material/FileDownload';
import FilterAltOff from '@mui/icons-material/FilterAltOff';
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
        // Convert the icon name to PascalCase
        const iconComponentName = iconName.charAt(0).toUpperCase() + iconName.slice(1);
        // Search for the icon's corresponding component in the icons object
        const IconComponent = icons[iconComponentName];
        // Return the icon component
        return IconComponent ? React.createElement(IconComponent) : null;
    }

    render() {
        const data = this.props.values;
        let cols = [];
        const headers = this.props.form.headers || [];
        const tableParams = this.props.form.table;
        if (!isEmpty(headers)){
            Object.keys(data[0]).map(key => {
                const header = headers.filter(header => {
                    return header.accessorKey === key;
                })[0];

                if (header !== undefined && header['filterVariant'] !== undefined){
                    if (header.filterVariant === 'datetime'){
                        header['accessorFn'] = ((row) => {
                            var date = new Date(new Date(row[header.accessorKey]).toDateString());
                            return date;
                        });
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
                                        newValue = new Date(new Date(newValue).toDateString());
                                        column.setFilterValue(newValue);
                                      }}
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

        
        var inputProps = {
            enableGlobalFilter: tableParams.enableGlobalFilter ?? false,
            enableStickyHeader: tableParams.enableStickyHeader ?? true,
            positionToolbarAlertBanner: tableParams.positionToolbarAlertBanner ?? "bottom",
            enableGrouping: tableParams.enableGrouping ?? true,
            enablePinning: tableParams.enablePinning ?? true,
            enableColumnOrdering: tableParams.enableColumnOrdering ?? true,
            enableColumnFilterModes: tableParams.enableColumnFilterModes ?? true,
            //enableFullScreenToggle: tableParams.enableFullScreenToggle ?? false,
            enablePagination: tableParams.enablePagination ?? true,
            enableExporting: tableParams.enableExporting ?? true,
            enableRowActions: tableParams.enableRowActions ?? false,
            initialState: tableParams.initialState ?? {},
            modifyTopToolBar: tableParams.modifyTopToolBar ?? false,
        }
        
        if (inputProps.initialState.columnFilters){
            inputProps.initialState.columnFilters.forEach(filter => {
                if (filter.range){
                    let value = filter.range.value;
                    let timePeriod = filter.range.timePeriod ?? "month";
                    let today = new Date();
                    delete filter.range;

                    if (value == 0){
                        filter.value = today;
                    }
                    switch(timePeriod){
                        case "year":
                            if (value < 0){
                                today.setFullYear(today.getFullYear() - Math.abs(value));
                            } else {
                                today.setFullYear(today.getFullYear() + value);
                            }
                            break;
                        case "month":
                            if (value < 0){
                                today.setMonth(today.getMonth() - Math.abs(value));
                            } else {
                                today.setMonth(today.getMonth() + value);
                            }
                            break;
                        case "day":
                            if (value < 0){
                                today.setDate(today.getDate() - Math.abs(value));
                            } else {
                                today.setDate(today.getDate() + value);
                            }
                            break;
                    }
                    filter.value = today;
                }
            });
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
                                this.props.dispatchButton({ "widgetfunction": item.widgetfunction, "row": row.original });
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
        
        if (inputProps.modifyTopToolBar){
            let customAction = tableParams.renderTopToolbarCustomActions;
            inputProps.renderTopToolbarCustomActions=(({ table }) => {
                let itemList=customAction.map((item,index)=>{
                    let disableProp = {};
                    if (item.disableOnSelect){
                        if (item.moreThanOneDisable){
                            disableProp.disabled = table.getSelectedRowModel().flatRows.length === 0 || table.getSelectedRowModel().flatRows.length > 1;
                        } else {
                            disableProp.disabled = table.getSelectedRowModel().flatRows.length === 0;
                        }
                    }
                    return <Button
                            key={index}
                            color={item.color ?? "success"}
                            {...disableProp}
                            onClick={() => {
                                    let rows;
                                    if (item.getAllRows){
                                        rows = table.getPrePaginationRowModel().rows;
                                    } else {
                                        rows = table.getSelectedRowModel().flatRows;
                                    }
                                    this.props.dispatchButton({ "widgetfunction": item.widgetfunction, "row": rows });
                                } }
                            variant="contained"
                            >
                                {item.text}
                            </Button>
                });
                return (<Box
                    sx={{ display: 'flex', gap: '1rem', p: '0.5rem', flexWrap: 'wrap' }}
                >
                    {itemList}   
                </Box>)
            });
        }
        
        if (inputProps.enableExporting){
            const multipleRowSelection = tableParams.multipleRowSelection;
            inputProps.renderBottomToolbarCustomActions=(({ table }) => (
                <div style={{ display: 'flex', gap: '0.5rem' }}>
                    <Button
                        key={0}
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
                        key={1}
                        disabled={table.getSelectedRowModel().flatRows.length === 0}
                        //only export selected rows
                        onClick={() => handleExportRows(table.getSelectedRowModel().rows)}
                        startIcon={<FileDownloadIcon />}
                        variant="contained"
                        >
                            Export Selected Rows
                        </Button>
                    ) : null}
                </div>
            ));
        }
        
        return (
            <MaterialReactTable
                columns={cols}
                data={data}
                {...inputProps}
                muiTableContainerProps={{
                    sx: { maxHeight: '400px' }, //give the table a max height
                  }}
                renderToolbarInternalActions={({ table }) => (
                    <Box>
                      <IconButton
                        onClick={() => {
                            table.resetColumnFilters()
                        }}
                      >
                        {<FilterAltOff />}
                      </IconButton>
                      <MRT_ToggleFiltersButton table={table} />
                    </Box>
                  )}
            />
        );
    }
}

export default connect((state) => ({
    locale: state.locale.current
}), {
})(GwTableWidget);
