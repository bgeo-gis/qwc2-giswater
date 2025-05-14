/**
 * Copyright © 2025 by BGEO. All rights reserved.
 * The program is free software: you can redistribute it and/or modify it under the terms of the GNU
 * General Public License as published by the Free Software Foundation, either version 3 of the License,
 * or (at your option) any later version
 */

import React from 'react';
import { connect } from 'react-redux';
import PropTypes from 'prop-types';
import { MaterialReactTable, useMaterialReactTable } from 'material-react-table'; //
import isEmpty from 'lodash.isempty';
import { createTheme, ThemeProvider } from '@mui/material/styles';
import {
    Box,
    Button,
    ListItemIcon,
    MenuItem,
    TextField,
    IconButton
} from '@mui/material';
// Date Picker Imports
import { AdapterDayjs } from '@mui/x-date-pickers/AdapterDayjs';
import { LocalizationProvider } from '@mui/x-date-pickers/LocalizationProvider';
import { DatePicker } from '@mui/x-date-pickers/DatePicker';
import dayjs from 'dayjs';

import FileDownloadIcon from '@mui/icons-material/FileDownload';
import FilterAltOff from '@mui/icons-material/FilterAltOff';
import { ExportToCsv } from 'export-to-csv-fix-source-map';

import * as icons from '@mui/icons-material';

class GwTableWidgetV3 extends React.Component {
    static propTypes = {
        form: PropTypes.object,
        onWidgetAction: PropTypes.func,
        values: PropTypes.array,
        buttonsToDisable: PropTypes.array
    };
    static defaultState = {
        loading: false
    };
    constructor(props) {
        super(props);
        this.state = GwTableWidgetV3.defaultState;
        this.state = {
            ...this.state,
            rowSelection: {}
        };
    }

    getIconComponent = (iconName) => {
        const iconComponentName = iconName.charAt(0).toUpperCase() + iconName.slice(1);
        const IconComponent = icons[iconComponentName];
        return IconComponent ? React.createElement(IconComponent) : null;
    };

    removeSelectedRow = () => {
        this.setState({
            rowSelection: {}
        });
    };

    getUniqueValues = (data, accessorKey) => {
        const uniqueValues = new Set();
        data.forEach(row => {
            uniqueValues.add(row[accessorKey]);
        });
        return Array.from(uniqueValues);
    };


    render() {
        const data = this.props.values || [];
        const cols = [];
        const headers = this.props?.form?.headers || [];
        const tableParams = this.props?.form?.table || {};
        if (!isEmpty(headers)) {
            for (let i = 0; i < headers.length; i++) {
                const header = headers[i];

                if (header !== undefined && header.filterVariant !== undefined) {
                    if (header.filterVariant === 'datetime') {
                        header.accessorFn = (row) => {
                            const date = dayjs(row[header.accessorKey]);
                            return date.isValid() ? date : null;
                        };
                        header.Cell = ({ cell }) => {
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
                        /* eslint-disable */
                        header.Filter = ({ column }) => (
                            <LocalizationProvider dateAdapter={AdapterDayjs}>
                                <DatePicker
                                    value={column.getFilterValue() ? dayjs(column.getFilterValue()) : null}
                                    onChange={(newValue) => {
                                        const dayJsValue = dayjs(newValue);
                                        column.setFilterValue(dayJsValue.isValid() ? dayJsValue : undefined);
                                    }}
                                    renderInput={(params) => (
                                        <TextField
                                            {...params}
                                            helperText={'Filter Mode: ' + column.getFilterFn().name}
                                            sx={{ minWidth: '120px' }}
                                            variant="standard"
                                        />
                                    )}
                                />
                            </LocalizationProvider>
                        );
                        /* eslint-enable */
                    }else if (header.filterVariant === 'select') {
                        const uniqueValues = this.getUniqueValues(data, header.accessorKey);
                        header.Filter = ({ column }) => (
                            <TextField
                                select
                                value={column.getFilterValue() || ''}
                                onChange={(event) => {
                                    column.setFilterValue(event.target.value || undefined);
                                }}
                                variant="standard"
                                sx={{ minWidth: '120px' }}
                                helperText={'Filter Mode: ' + column.getFilterFn().name}
                            >
                                <MenuItem value={undefined}>
                                    <em>Clear filter</em>
                                </MenuItem>
                                {uniqueValues.map((value, index) => (
                                    <MenuItem key={index} value={value}>
                                        {value}
                                    </MenuItem>
                                ))}
                            </TextField>
                        );
                    }
                }

                if (header !== undefined) {
                    cols.push(header);
                }
            }
        }

        const { rowSelection } = this.state;
        const currentDate = new Date();
        const pad = (num) => num.toString().padStart(2, '0');
        const filename = `exported_${currentDate.getFullYear()}_${pad(currentDate.getMonth() + 1)}_${pad(currentDate.getDate())}_${pad(currentDate.getHours())}_${pad(currentDate.getMinutes())}_${pad(currentDate.getSeconds())}`;

        const csvOptions = {
            filename: filename,
            fieldSeparator: ',',
            quoteStrings: '"',
            decimalSeparator: '.',
            showLabels: true,
            useBom: true,
            useKeysAsHeaders: false,
            headers: cols.map((c) => c.header)
        };

        const csvExporter = new ExportToCsv(csvOptions);

        const handleExportRows = (rows) => {
            csvExporter.generateCsv(rows.map((row) => {
                const noNullValuesRow = {};
                Object.entries(row.original).forEach(([key, value]) => {
                    noNullValuesRow[key] = value === null ? "" : value;
                });
                return noNullValuesRow;
            }));
        };

        const handleExportData = () => {
            csvExporter.generateCsv(data);
          };

        const inputProps = {
            enableTopToolbar: tableParams.enableTopToolbar ?? true,
            enableGlobalFilter: tableParams.enableGlobalFilter ?? false,
            enableStickyHeader: tableParams.enableStickyHeader ?? true,
            positionToolbarAlertBanner: tableParams.positionToolbarAlertBanner ?? "bottom",
            enableGrouping: tableParams.enableGrouping ?? true,
            enableColumnPinning: tableParams.enableColumnPinning ?? true, // Actualización
            enableColumnOrdering: tableParams.enableColumnOrdering ?? true,
            enableColumnFilters: tableParams.enableColumnFilters ?? true,
            enableColumnFilterModes: tableParams.enableColumnFilterModes ?? true,
            enablePagination: tableParams.enablePagination ?? true,
            enableExporting: tableParams.enableExporting ?? true,
            enableRowActions: tableParams.enableRowActions ?? false,
            initialState: tableParams.initialState ?? {},
            modifyTopToolBar: tableParams.modifyTopToolBar ?? false,
            enableFullScreenToggle: false,
            exportButtonColor: tableParams.exportButtonColor ?? "#007bff" // blue
        };

        const exportButtonTheme = createTheme({
            palette: {
                primary: {
                    main: inputProps.exportButtonColor
                }
            }
        });

        if (tableParams.enableRowSelection) {
            inputProps.getRowId = (row) => row.id;
            inputProps.muiTableBodyRowProps = ({ row }) => ({
                onClick: () => {
                    // Update selection state
                    if (tableParams.multipleRowSelection) {
                        this.setState((prevState) => ({
                            rowSelection: {
                                ...prevState.rowSelection,
                                [row.id]: !prevState.rowSelection[row.id],
                            },
                        }));
                    } else {
                        this.setState({
                            rowSelection: {
                                [row.id]: !this.state.rowSelection[row.id],
                            },
                        });
                    }
                    // Trigger callback or handle the row click
                    if (this.props.onWidgetAction) {
                        this.props.onWidgetAction({
                            functionName: "selectedRow",
                            rowData: row.original, // Pass the full row data
                            rowSelection: !this.state.rowSelection[row.id]
                        });
                    }
                },
                onDoubleClick: () => {
                    // Update selection state
                    if (tableParams.multipleRowSelection) {
                        this.setState((prevState) => ({
                            rowSelection: {
                                ...prevState.rowSelection,
                                [row.id]: !prevState.rowSelection[row.id],
                            },
                        }));
                    } else {
                        this.setState({
                            rowSelection: {
                                [row.id]: !this.state.rowSelection[row.id],
                            },
                        });
                    }
                    // Trigger callback or handle the row click
                    if (this.props.onWidgetAction) {
                        this.props.onWidgetAction({
                            functionName: "doubleClickselectedRow",
                            rowData: row.original, // Pass the full row data
                        });
                    }
                },
                selected: this.state.rowSelection[row.id],
                sx: { cursor: 'pointer' },
            });
            inputProps.state = { rowSelection };
        }

        if (inputProps.enableRowActions) {
            const menuItems = tableParams.renderRowActionMenuItems;
            inputProps.renderRowActionMenuItems = ({ row, closeMenu }) => {
                return menuItems.map((item, index) => {
                    const IconComponent = this.getIconComponent(item.icon);
                    return (
                        <MenuItem
                            key={index}
                            onClick={() => {
                                this.props.onWidgetAction({ widgetfunction: item.widgetfunction, row: row.original });
                                closeMenu();
                            }}
                            sx={{ m: 0 }}
                        >
                            <ListItemIcon>{IconComponent}</ListItemIcon>
                            {item.text}
                        </MenuItem>
                    );
                });
            };
        }

        if (inputProps.modifyTopToolBar) {
            const customAction = tableParams.renderTopToolbarCustomActions;
            inputProps.renderTopToolbarCustomActions = ({ table }) => {
                const buttonsList = this.props.buttonsToDisable;
                return (
                    <Box sx={{ display: 'flex', gap: '1rem', p: '0.5rem', flexWrap: 'wrap' }}>
                        {customAction.map((item, index) => {
                            const disableProp = {};
                            if (item.disableOnSelect) {
                                disableProp.disabled = item.moreThanOneDisable
                                    ? table.getSelectedRowModel().flatRows.length === 0 || table.getSelectedRowModel().flatRows.length > 1
                                    : table.getSelectedRowModel().flatRows.length === 0;
                            }
                            if (buttonsList.includes(item.name)){
                                disableProp.disabled = true
                            }
                            return (
                                <Button
                                    color={item.color ?? "success"}
                                    key={index}
                                    {...disableProp}
                                    onClick={() => {
                                        const rows = item.getAllRows
                                            ? table.getPrePaginationRowModel().rows
                                            : table.getSelectedRowModel().flatRows;
                                        this.props.onWidgetAction({ widgetfunction: item.widgetfunction, row: rows, removeSelectedRow: this.removeSelectedRow });
                                    }}
                                    variant="contained"
                                >
                                    {item.text}
                                </Button>
                            );
                        })}
                    </Box>
                );
            };
        }

        if (inputProps.enableExporting) {
            const multipleRowSelection = tableParams.multipleRowSelection;
            inputProps.renderBottomToolbarCustomActions = ({ table }) => (
                <div style={{ display: 'flex', gap: '0.5rem' }}>
                    <ThemeProvider theme={exportButtonTheme}>
                        <Button
                            color="primary"
                            onClick={handleExportData}
                            startIcon={<FileDownloadIcon />}
                            variant="contained"
                        >
                            Export All Data
                        </Button>
                        <Button
                            disabled={!table.getIsSomeRowsSelected()}
                            onClick={() => handleExportRows(table.getSelectedRowModel().flatRows)}
                            startIcon={<FileDownloadIcon />}
                            variant="contained"
                        >
                            Export Selected Rows
                        </Button>
                    </ThemeProvider>
                    <IconButton onClick={() => table.resetColumnFilters()}>
                        <FilterAltOff />
                    </IconButton>
                </div>
            );
        }

        return (
            <MaterialReactTable
                columns={cols}
                data={data}
                enableRowSelection={tableParams.enableRowSelection}
                {...inputProps}
            />
        );
    }
}

export default connect((state) => ({
    locale: state.locale.current
}), {
})(GwTableWidgetV3);
