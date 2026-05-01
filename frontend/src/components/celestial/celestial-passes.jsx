import React, { useEffect, useMemo, useState } from 'react';
import {
    Box,
    Button,
    Checkbox,
    Chip,
    Dialog,
    DialogActions,
    DialogContent,
    DialogTitle,
    Divider,
    FormControl,
    FormControlLabel,
    FormGroup,
    IconButton,
    InputLabel,
    MenuItem,
    Select,
    Tooltip,
    Typography,
} from '@mui/material';
import { alpha, darken, lighten, styled } from '@mui/material/styles';
import { DataGrid, gridClasses } from '@mui/x-data-grid';
import AccessTimeFilledIcon from '@mui/icons-material/AccessTimeFilled';
import DoneAllIcon from '@mui/icons-material/DoneAll';
import RadioButtonCheckedIcon from '@mui/icons-material/RadioButtonChecked';
import RefreshIcon from '@mui/icons-material/Refresh';
import SettingsIcon from '@mui/icons-material/Settings';
import { useDispatch, useSelector } from 'react-redux';
import {
    setCelestialPassesTableColumnVisibility,
    setCelestialPassesTablePageSize,
    setCelestialPassesTableSortModel,
} from './celestial-slice.jsx';
import { getClassNamesBasedOnGridEditing, TitleBar } from '../common/common.jsx';
import { useUserTimeSettings } from '../../hooks/useUserTimeSettings.jsx';
import { toRowSelectionModel, toSelectedIds } from '../../utils/datagrid-selection.js';

const getPassBackgroundColor = (color, theme, coefficient) => ({
    backgroundColor: darken(color, coefficient),
    ...theme.applyStyles('light', {
        backgroundColor: lighten(color, coefficient),
    }),
});

const StyledDataGrid = styled(DataGrid)(({ theme }) => ({
    '& .MuiDataGrid-row': {
        borderLeft: '3px solid transparent',
    },
    '& .passes-row-live': {
        backgroundColor: alpha(theme.palette.success.main, 0.2),
        borderLeftColor: alpha(theme.palette.success.main, 0.95),
        ...theme.applyStyles('light', {
            backgroundColor: alpha(theme.palette.success.main, 0.1),
            borderLeftColor: alpha(theme.palette.success.main, 0.65),
        }),
        '&:hover': {
            backgroundColor: alpha(theme.palette.success.main, 0.27),
            ...theme.applyStyles('light', {
                backgroundColor: alpha(theme.palette.success.main, 0.14),
            }),
        },
    },
    '& .passes-row-upcoming-soon': {
        backgroundColor: alpha(theme.palette.warning.main, 0.14),
        borderLeftColor: alpha(theme.palette.warning.main, 0.9),
        ...theme.applyStyles('light', {
            backgroundColor: alpha(theme.palette.warning.main, 0.08),
            borderLeftColor: alpha(theme.palette.warning.main, 0.6),
        }),
    },
    '& .passes-row-passed': {
        '& .MuiDataGrid-cell': {
            color: theme.palette.text.secondary,
        },
        '& .passes-time-absolute': {
            opacity: 0.8,
        },
    },
    '& .passes-row-dead': {
        backgroundColor: alpha(theme.palette.error.main, 0.24),
        borderLeftColor: alpha(theme.palette.error.main, 0.9),
        ...theme.applyStyles('light', {
            backgroundColor: alpha(theme.palette.error.main, 0.1),
            borderLeftColor: alpha(theme.palette.error.main, 0.65),
        }),
    },
    '& .passes-cell-passing': {
        ...getPassBackgroundColor(theme.palette.success.main, theme, 0.7),
    },
    '& .passes-cell-passed': {
        backgroundColor: alpha(theme.palette.info.main, 0.28),
        borderLeft: `2px solid ${alpha(theme.palette.info.main, 0.85)}`,
        ...theme.applyStyles('light', {
            backgroundColor: alpha(theme.palette.info.main, 0.14),
            borderLeft: `2px solid ${alpha(theme.palette.info.main, 0.55)}`,
        }),
    },
    '& .passes-cell-warning': {
        color: theme.palette.error.main,
        textDecoration: 'line-through',
    },
    '& .passes-cell-success': {
        color: theme.palette.success.main,
        fontWeight: 'bold',
        textDecoration: 'underline',
    },
    '& .passes-cell-status': {
        alignItems: 'center',
        paddingTop: 0,
        paddingBottom: 0,
    },
}));

const getPassStatus = (row, now) => {
    const startMs = Number(row?.eventStartMs);
    const endMs = Number(row?.eventEndMs);
    if (!Number.isFinite(startMs) || !Number.isFinite(endMs)) {
        return 'upcoming';
    }
    if (startMs <= now && endMs >= now) return 'live';
    if (endMs < now) return 'passed';
    return 'upcoming';
};

const getStatusPriority = (status) => {
    if (status === 'live') return 0;
    if (status === 'upcoming') return 1;
    if (status === 'passed') return 2;
    return 3;
};

const formatRelativeTime = (isoValue, nowMs) => {
    const parsed = new Date(isoValue).getTime();
    if (!Number.isFinite(parsed)) return '-';
    const deltaSec = Math.round((parsed - nowMs) / 1000);
    const absSec = Math.abs(deltaSec);

    if (absSec < 60) return deltaSec >= 0 ? 'in <1m' : '<1m ago';
    if (absSec < 3600) {
        const minutes = Math.floor(absSec / 60);
        return deltaSec >= 0 ? `in ${minutes}m` : `${minutes}m ago`;
    }
    if (absSec < 86400) {
        const hours = Math.floor(absSec / 3600);
        return deltaSec >= 0 ? `in ${hours}h` : `${hours}h ago`;
    }
    const days = Math.floor(absSec / 86400);
    return deltaSec >= 0 ? `in ${days}d` : `${days}d ago`;
};

const formatAbsoluteTime = (isoValue, timezone, locale) => {
    const parsed = new Date(isoValue);
    if (Number.isNaN(parsed.getTime())) return '-';
    const options = timezone ? { timeZone: timezone } : undefined;
    return parsed.toLocaleString(locale, options);
};

const formatDuration = (seconds) => {
    const value = Number(seconds);
    if (!Number.isFinite(value) || value < 0) return '-';
    const whole = Math.round(value);
    const minutes = Math.floor(whole / 60);
    const remainder = whole % 60;
    return `${minutes}m ${String(remainder).padStart(2, '0')}s`;
};

const formatAngle = (value) => {
    const numeric = Number(value);
    if (!Number.isFinite(numeric)) return '-';
    return `${numeric.toFixed(1)} deg`;
};

const getProgress = (startMs, endMs, nowMs) => {
    if (!Number.isFinite(startMs) || !Number.isFinite(endMs) || endMs <= startMs) {
        return { percent: 0, label: '-' };
    }
    if (nowMs < startMs) {
        return { percent: 0, label: `Starts ${formatRelativeTime(startMs, nowMs)}` };
    }
    if (nowMs > endMs) {
        return { percent: 100, label: 'Completed' };
    }
    const percent = ((nowMs - startMs) / (endMs - startMs)) * 100;
    return { percent, label: `${Math.round(percent)}%` };
};

const PassStatusCell = ({ status }) => {
    if (status === 'live') {
        return (
            <Chip
                icon={<RadioButtonCheckedIcon sx={{ fontSize: '0.85rem' }} />}
                size="small"
                color="success"
                label="Visible"
                variant="filled"
                sx={{ fontWeight: 700, minWidth: 85 }}
            />
        );
    }
    if (status === 'passed') {
        return (
            <Chip
                icon={<DoneAllIcon sx={{ fontSize: '0.85rem' }} />}
                size="small"
                color="info"
                label="Passed"
                variant="filled"
                sx={{ fontWeight: 700, minWidth: 85 }}
            />
        );
    }
    return (
        <Chip
            icon={<AccessTimeFilledIcon sx={{ fontSize: '0.85rem' }} />}
            size="small"
            color="warning"
            label="Upcoming"
            variant="outlined"
            sx={{ fontWeight: 700, minWidth: 85 }}
        />
    );
};

const PassesTableSettingsDialog = ({ open, onClose }) => {
    const dispatch = useDispatch();
    const columnVisibility = useSelector((state) => state.celestial?.passesTableColumnVisibility || {});
    const pageSize = useSelector((state) => state.celestial?.passesTablePageSize || 10);

    const columns = [
        { name: 'status', label: 'Status', category: 'basic', alwaysVisible: true },
        { name: 'name', label: 'Name', category: 'basic', alwaysVisible: true },
        { name: 'targetType', label: 'Type', category: 'basic' },
        { name: 'peakElevationDeg', label: 'Peak Elevation', category: 'metrics' },
        { name: 'currentElevationDeg', label: 'Current Elevation', category: 'metrics' },
        { name: 'progress', label: 'Progress', category: 'basic' },
        { name: 'duration', label: 'Duration', category: 'basic' },
        { name: 'eventStart', label: 'Start', category: 'time' },
        { name: 'eventEnd', label: 'End', category: 'time' },
        { name: 'startAzimuthDeg', label: 'Start Azimuth', category: 'metrics' },
        { name: 'endAzimuthDeg', label: 'End Azimuth', category: 'metrics' },
        { name: 'peakAzimuthDeg', label: 'Peak Azimuth', category: 'metrics' },
        { name: 'cacheStatus', label: 'Cache', category: 'source' },
        { name: 'stale', label: 'Stale', category: 'source' },
        { name: 'source', label: 'Source', category: 'source' },
        { name: 'targetId', label: 'Target ID', category: 'source' },
    ];

    const categories = {
        basic: 'Basic',
        time: 'Time',
        metrics: 'Metrics',
        source: 'Source',
    };

    const columnsByCategory = {
        basic: columns.filter((column) => column.category === 'basic'),
        time: columns.filter((column) => column.category === 'time'),
        metrics: columns.filter((column) => column.category === 'metrics'),
        source: columns.filter((column) => column.category === 'source'),
    };

    return (
        <Dialog open={open} onClose={onClose} maxWidth="sm" fullWidth>
            <DialogTitle>Celestial Passes Table Settings</DialogTitle>
            <DialogContent>
                <Box sx={{ mb: 2 }}>
                    <FormControl fullWidth size="small" sx={{ mt: 1 }}>
                        <InputLabel id="celestial-passes-rows-label">Rows per page</InputLabel>
                        <Select
                            labelId="celestial-passes-rows-label"
                            label="Rows per page"
                            value={pageSize}
                            onChange={(event) => dispatch(setCelestialPassesTablePageSize(event.target.value))}
                        >
                            {[5, 10, 15, 20, 25].map((option) => (
                                <MenuItem key={option} value={option}>
                                    {option}
                                </MenuItem>
                            ))}
                        </Select>
                    </FormControl>
                    <Divider sx={{ mt: 2 }} />
                </Box>
                {Object.entries(columnsByCategory).map(([category, items]) => (
                    <Box key={category} sx={{ mb: 2 }}>
                        <Typography variant="subtitle2" sx={{ fontWeight: 700, mb: 1 }}>
                            {categories[category]}
                        </Typography>
                        <FormGroup>
                            {items.map((column) => (
                                <FormControlLabel
                                    key={column.name}
                                    control={(
                                        <Checkbox
                                            checked={column.alwaysVisible || columnVisibility[column.name] !== false}
                                            disabled={column.alwaysVisible}
                                            onChange={() =>
                                                dispatch(
                                                    setCelestialPassesTableColumnVisibility({
                                                        ...columnVisibility,
                                                        [column.name]: columnVisibility[column.name] === false,
                                                    }),
                                                )
                                            }
                                        />
                                    )}
                                    label={column.label}
                                />
                            ))}
                        </FormGroup>
                        <Divider sx={{ mt: 1 }} />
                    </Box>
                ))}
            </DialogContent>
            <DialogActions>
                <Button onClick={onClose} variant="contained">
                    Close
                </Button>
            </DialogActions>
        </Dialog>
    );
};

const CelestialPasses = ({
    passes = [],
    tracks = [],
    loading = false,
    gridEditable = false,
    onTargetSelected = null,
    onRefresh = null,
    refreshDisabled = false,
}) => {
    const dispatch = useDispatch();
    const { timezone, locale } = useUserTimeSettings();
    const [quickFilterPreset, setQuickFilterPreset] = useState('all');
    const [settingsOpen, setSettingsOpen] = useState(false);
    const [nowMs, setNowMs] = useState(() => Date.now());
    const [page, setPage] = useState(0);
    const [selectedIds, setSelectedIds] = useState([]);
    const columnVisibility = useSelector((state) => state.celestial?.passesTableColumnVisibility || {});
    const pageSize = useSelector((state) => state.celestial?.passesTablePageSize || 10);
    const sortModel = useSelector((state) => state.celestial?.passesTableSortModel || []);
    const rowSelectionModel = useMemo(() => toRowSelectionModel(selectedIds), [selectedIds]);

    useEffect(() => {
        const interval = setInterval(() => setNowMs(Date.now()), 1000);
        return () => clearInterval(interval);
    }, []);

    const currentElevationByTargetKey = useMemo(() => {
        const map = {};
        (tracks || []).forEach((track) => {
            const key = String(track?.target_key || '').trim();
            if (!key) return;
            const elevation = Number(track?.sky_position?.el_deg);
            if (Number.isFinite(elevation)) {
                map[key] = elevation;
            }
        });
        return map;
    }, [tracks]);

    const rows = useMemo(() => (passes || []).map((pass) => {
        const eventStartMs = new Date(pass.event_start).getTime();
        const eventEndMs = new Date(pass.event_end).getTime();
        const status = getPassStatus({ eventStartMs, eventEndMs }, nowMs);
        const currentElevation = currentElevationByTargetKey[String(pass.target_key || '').trim()];
        return {
            id: pass.id || `${pass.target_key || 'target'}_${pass.event_start || ''}`,
            status,
            name: pass.name || '-',
            targetType: String(pass.target_type || 'mission').toLowerCase() === 'body' ? 'Body' : 'Mission',
            targetKey: pass.target_key || '',
            targetId:
                String(pass.target_type || 'mission').toLowerCase() === 'body'
                    ? (pass.body_id || '-')
                    : (pass.command || '-'),
            peakElevationDeg: Number(pass.peak_elevation_deg),
            currentElevationDeg: currentElevation,
            eventStart: pass.event_start,
            eventEnd: pass.event_end,
            eventStartMs,
            eventEndMs,
            durationSeconds: Number(pass.duration_seconds),
            startAzimuthDeg: Number(pass.start_azimuth_deg),
            endAzimuthDeg: Number(pass.end_azimuth_deg),
            peakAzimuthDeg: Number(pass.peak_azimuth_deg),
            cacheStatus: pass.cache || '-',
            stale: pass.stale ? 'Yes' : 'No',
            source: pass.source || '-',
        };
    }), [passes, nowMs, currentElevationByTargetKey]);

    const filteredRows = useMemo(() => {
        if (quickFilterPreset === 'live') {
            return rows.filter((row) => row.status === 'live');
        }
        if (quickFilterPreset === 'next30') {
            return rows.filter((row) => {
                if (row.status === 'live') return true;
                if (row.status !== 'upcoming') return false;
                return (row.eventStartMs - nowMs) <= 30 * 60 * 1000;
            });
        }
        if (quickFilterPreset === 'highEl') {
            return [...rows]
                .filter((row) => Number.isFinite(row.peakElevationDeg) && row.peakElevationDeg >= 20)
                .sort((a, b) => b.peakElevationDeg - a.peakElevationDeg);
        }
        return rows;
    }, [rows, quickFilterPreset, nowMs]);

    useEffect(() => {
        const selectedId = selectedIds[0];
        if (!selectedId) return;
        const exists = filteredRows.some((row) => row.id === selectedId);
        if (!exists) {
            setSelectedIds([]);
        }
    }, [filteredRows, selectedIds]);

    const columns = useMemo(() => [
        {
            field: 'status',
            headerName: 'Status',
            minWidth: 140,
            align: 'center',
            headerAlign: 'center',
            cellClassName: 'passes-cell-status',
            sortComparator: (v1, v2) => getStatusPriority(v1) - getStatusPriority(v2),
            renderCell: (params) => (
                <Box
                    sx={{
                        width: '100%',
                        height: '100%',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                    }}
                >
                    <PassStatusCell status={params.value} />
                </Box>
            ),
        },
        {
            field: 'name',
            headerName: 'Name',
            minWidth: 150,
            flex: 1.2,
            renderCell: (params) => (
                <Typography
                    component="span"
                    variant="body2"
                    sx={{
                        fontWeight: 700,
                        whiteSpace: 'nowrap',
                        overflow: 'hidden',
                        textOverflow: 'ellipsis',
                        lineHeight: 1.2,
                    }}
                >
                    {params?.value || '-'}
                </Typography>
            ),
        },
        { field: 'targetType', headerName: 'Type', minWidth: 90, flex: 0.8 },
        {
            field: 'peakElevationDeg',
            headerName: 'Peak Elevation',
            minWidth: 125,
            valueFormatter: (value) => formatAngle(value),
            cellClassName: (params) => {
                const value = Number(params?.value);
                if (!Number.isFinite(value)) return '';
                if (value < 10.0) return 'passes-cell-warning';
                if (value > 45.0) return 'passes-cell-success';
                return '';
            },
        },
        {
            field: 'currentElevationDeg',
            headerName: 'Current Elevation',
            minWidth: 130,
            valueFormatter: (value, row) => {
                if (row?.status !== 'live') return '-';
                return formatAngle(value);
            },
        },
        {
            field: 'progress',
            headerName: 'Progress',
            minWidth: 120,
            sortable: false,
            renderCell: (params) => {
                const progress = getProgress(params.row.eventStartMs, params.row.eventEndMs, nowMs);
                return progress.label;
            },
        },
        {
            field: 'duration',
            headerName: 'Duration',
            minWidth: 100,
            valueGetter: (_value, row) => formatDuration(row.durationSeconds),
        },
        {
            field: 'eventStart',
            headerName: 'Start',
            minWidth: 180,
            renderCell: (params) => (
                <Box sx={{ whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                    <Typography component="span" variant="caption" sx={{ fontWeight: 700, color: 'text.primary' }}>
                        {formatRelativeTime(params.value, nowMs)}
                    </Typography>
                    <Typography component="span" className="passes-time-absolute" variant="caption" sx={{ color: 'text.secondary', ml: 0.5 }}>
                        · {formatAbsoluteTime(params.value, timezone, locale)}
                    </Typography>
                </Box>
            ),
        },
        {
            field: 'eventEnd',
            headerName: 'End',
            minWidth: 180,
            renderCell: (params) => (
                <Box sx={{ whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                    <Typography component="span" variant="caption" sx={{ fontWeight: 700, color: 'text.primary' }}>
                        {formatRelativeTime(params.value, nowMs)}
                    </Typography>
                    <Typography component="span" className="passes-time-absolute" variant="caption" sx={{ color: 'text.secondary', ml: 0.5 }}>
                        · {formatAbsoluteTime(params.value, timezone, locale)}
                    </Typography>
                </Box>
            ),
        },
        { field: 'startAzimuthDeg', headerName: 'Start Azimuth', minWidth: 120, valueFormatter: (value) => formatAngle(value) },
        { field: 'endAzimuthDeg', headerName: 'End Azimuth', minWidth: 120, valueFormatter: (value) => formatAngle(value) },
        { field: 'peakAzimuthDeg', headerName: 'Peak Azimuth', minWidth: 120, valueFormatter: (value) => formatAngle(value) },
        { field: 'cacheStatus', headerName: 'Cache', minWidth: 90 },
        { field: 'stale', headerName: 'Stale', minWidth: 80 },
        { field: 'source', headerName: 'Source', minWidth: 130 },
        { field: 'targetId', headerName: 'Target ID', minWidth: 180 },
    ], [nowMs, timezone, locale]);

    const handleQuickPreset = (preset) => {
        setQuickFilterPreset(preset);
        if (preset === 'highEl') {
            dispatch(setCelestialPassesTableSortModel([
                { field: 'peakElevationDeg', sort: 'desc' },
                { field: 'eventStart', sort: 'asc' },
            ]));
            return;
        }
        dispatch(setCelestialPassesTableSortModel([
            { field: 'status', sort: 'asc' },
            { field: 'eventStart', sort: 'asc' },
        ]));
    };

    const getRowClassName = (params) => {
        const classes = ['pointer-cursor'];
        if (params.row.status === 'live') classes.push('passes-row-live');
        else if (params.row.status === 'passed') classes.push('passes-row-passed');
        if (
            params.row.status === 'upcoming'
            && Number.isFinite(params.row.eventStartMs)
            && (params.row.eventStartMs - nowMs) <= 30 * 60 * 1000
        ) {
            classes.push('passes-row-upcoming-soon');
        }
        return classes.join(' ');
    };

    return (
        <Box sx={{ height: '100%', display: 'flex', flexDirection: 'column', minHeight: 0 }}>
            <TitleBar
                className={getClassNamesBasedOnGridEditing(gridEditable, ['window-title-bar'])}
                sx={{
                    bgcolor: 'background.titleBar',
                    borderBottom: '1px solid',
                    borderColor: 'border.main',
                    height: 30,
                    minHeight: 30,
                    py: 0,
                    display: 'flex',
                    alignItems: 'center',
                }}
            >
                <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', width: '100%', height: '100%' }}>
                    <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, minWidth: 0, flex: 1 }}>
                        <Typography variant="subtitle2" sx={{ fontWeight: 700, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                            Celestial Passes
                        </Typography>
                        <Typography variant="caption" sx={{ color: 'text.secondary', whiteSpace: 'nowrap' }}>
                            ({rows.length} {rows.length === 1 ? 'pass' : 'passes'})
                        </Typography>
                    </Box>
                    <Box sx={{ display: 'flex', gap: 0.5, alignItems: 'center' }}>
                        <Button size="small" variant={quickFilterPreset === 'all' ? 'contained' : 'outlined'} onClick={() => handleQuickPreset('all')} sx={{ minHeight: 24, height: 24, py: 0, px: 1, lineHeight: 1.1, fontSize: '0.72rem' }}>
                            All
                        </Button>
                        <Button size="small" variant={quickFilterPreset === 'live' ? 'contained' : 'outlined'} onClick={() => handleQuickPreset('live')} sx={{ minHeight: 24, height: 24, py: 0, px: 1, lineHeight: 1.1, fontSize: '0.72rem' }}>
                            Live
                        </Button>
                        <Button size="small" variant={quickFilterPreset === 'next30' ? 'contained' : 'outlined'} onClick={() => handleQuickPreset('next30')} sx={{ minHeight: 24, height: 24, py: 0, px: 1, lineHeight: 1.1, fontSize: '0.72rem' }}>
                            Next 30m
                        </Button>
                        <Button size="small" variant={quickFilterPreset === 'highEl' ? 'contained' : 'outlined'} onClick={() => handleQuickPreset('highEl')} sx={{ minHeight: 24, height: 24, py: 0, px: 1, lineHeight: 1.1, fontSize: '0.72rem' }}>
                            High El
                        </Button>
                        <Tooltip title="Table settings">
                            <span>
                                <IconButton size="small" onClick={() => setSettingsOpen(true)} sx={{ p: '2px' }}>
                                    <SettingsIcon fontSize="small" />
                                </IconButton>
                            </span>
                        </Tooltip>
                        <Tooltip title="Refresh passes">
                            <span>
                                <IconButton
                                    size="small"
                                    onClick={onRefresh}
                                    disabled={refreshDisabled || !onRefresh}
                                    sx={{ p: '2px' }}
                                >
                                    <RefreshIcon fontSize="small" />
                                </IconButton>
                            </span>
                        </Tooltip>
                    </Box>
                </Box>
            </TitleBar>
            <Box sx={{ flex: 1, minHeight: 0 }}>
                <StyledDataGrid
                    rows={filteredRows}
                    columns={columns}
                    loading={loading}
                    disableMultipleRowSelection
                    pageSizeOptions={[5, 10, 15, 20, 25]}
                    paginationModel={{ pageSize, page }}
                    onPaginationModelChange={(model) => {
                        setPage(model.page);
                        dispatch(setCelestialPassesTablePageSize(model.pageSize));
                    }}
                    rowSelectionModel={rowSelectionModel}
                    onRowSelectionModelChange={(model) => {
                        const ids = toSelectedIds(model);
                        const selectedId = ids.length ? ids[0] : null;
                        setSelectedIds(selectedId ? [selectedId] : []);
                        if (!selectedId || !onTargetSelected) return;
                        const selectedRow = filteredRows.find((row) => row.id === selectedId);
                        if (selectedRow?.targetKey) {
                            onTargetSelected(selectedRow.targetKey);
                        }
                    }}
                    sortModel={sortModel}
                    onSortModelChange={(model) => dispatch(setCelestialPassesTableSortModel(model))}
                    columnVisibilityModel={columnVisibility}
                    onColumnVisibilityModelChange={(model) => dispatch(setCelestialPassesTableColumnVisibility(model))}
                    getRowClassName={getRowClassName}
                    density="compact"
                    sx={{
                        border: 0,
                        marginTop: 0,
                        [`& .${gridClasses.cell}:focus, & .${gridClasses.cell}:focus-within`]: {
                            outline: 'none',
                        },
                        [`& .${gridClasses.columnHeader}:focus, & .${gridClasses.columnHeader}:focus-within`]: {
                            outline: 'none',
                        },
                        '& .MuiDataGrid-overlay': {
                            fontSize: '0.875rem',
                            fontStyle: 'italic',
                            color: 'text.secondary',
                        },
                        '& .MuiDataGrid-selectedRowCount': {
                            visibility: 'hidden',
                            position: 'absolute',
                        },
                    }}
                />
            </Box>
            <PassesTableSettingsDialog open={settingsOpen} onClose={() => setSettingsOpen(false)} />
        </Box>
    );
};

export default React.memo(CelestialPasses);
