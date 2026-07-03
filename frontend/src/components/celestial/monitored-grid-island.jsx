import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { DataGrid, gridClasses } from '@mui/x-data-grid';
import { alpha, styled } from '@mui/material/styles';
import {
    Box,
    Button,
    Checkbox,
    Dialog,
    DialogActions,
    DialogContent,
    DialogTitle,
    Divider,
    FormControl,
    FormControlLabel,
    FormGroup,
    InputLabel,
    MenuItem,
    Select,
    Typography,
} from '@mui/material';
import { useDispatch, useSelector } from 'react-redux';
import { useTranslation } from 'react-i18next';
import {
    MONITORED_TABLE_DEFAULT_COLUMN_VISIBILITY,
    MONITORED_TABLE_DEFAULT_PAGE_SIZE,
    MONITORED_TABLE_DEFAULT_SORT_MODEL,
    setSelectedMonitoredIds,
    setMonitoredTableColumnVisibility,
    setMonitoredTablePageSize,
    setMonitoredTableSortModel,
    setOpenGridSettingsDialog,
} from './monitored-slice.jsx';
import { toRowSelectionModel, toSelectedIds } from '../../utils/datagrid-selection.js';
import { useUserTimeSettings } from '../../hooks/useUserTimeSettings.jsx';
import TargetNumberIcon from '../common/target-number-icon.jsx';
import { buildTargetKeyFromCelestialRow } from '../target/celestial-target-utils.js';
import CelestialContextMenu from '../target/celestialcontextmenu.jsx';
import { useSocket } from '../common/socket.jsx';
import { useTargetRotatorSelectionDialog } from '../target/use-target-rotator-selection-dialog.jsx';
import { setRotator, setTrackerId, setTrackingStateInBackend } from '../target/target-slice.jsx';
import { toast } from '../../utils/toast-with-timestamp.jsx';
import TransmittersDialog from '../satellites/transmitters-dialog.jsx';

const AU_IN_KM = 149597870.7;
const SECONDS_PER_DAY = 86400;
const AU_PER_DAY_TO_KM_PER_S = AU_IN_KM / SECONDS_PER_DAY;
const LIGHT_TIME_MIN_PER_AU = 8.316746397;
const DIALOG_PAPER_SX = {
    bgcolor: 'background.paper',
    border: (theme) => `1px solid ${theme.palette.divider}`,
    borderRadius: 2,
};
const DIALOG_TITLE_SX = {
    bgcolor: (theme) => theme.palette.mode === 'dark' ? 'grey.900' : 'grey.100',
    borderBottom: (theme) => `1px solid ${theme.palette.divider}`,
    fontSize: '1.25rem',
    fontWeight: 'bold',
    py: 2.5,
};
const DIALOG_CONTENT_SX = {
    px: 3,
    py: 3,
};
const DIALOG_ACTIONS_SX = {
    bgcolor: (theme) => theme.palette.mode === 'dark' ? 'grey.900' : 'grey.100',
    borderTop: (theme) => `1px solid ${theme.palette.divider}`,
    px: 3,
    py: 2.5,
    gap: 2,
};
const DIALOG_CANCEL_BUTTON_SX = {
    borderColor: (theme) => theme.palette.mode === 'dark' ? 'grey.700' : 'grey.400',
    '&:hover': {
        borderColor: (theme) => theme.palette.mode === 'dark' ? 'grey.600' : 'grey.500',
        bgcolor: (theme) => theme.palette.mode === 'dark' ? 'grey.800' : 'grey.200',
    },
};

const StyledDataGrid = styled(DataGrid)(({ theme }) => ({
    '& .MuiDataGrid-row': {
        borderLeft: '3px solid transparent',
    },
    '& .celestial-row-visible': {
        backgroundColor: alpha(theme.palette.success.main, 0.15),
        borderLeftColor: alpha(theme.palette.success.main, 0.9),
        ...theme.applyStyles('light', {
            backgroundColor: alpha(theme.palette.success.main, 0.08),
            borderLeftColor: alpha(theme.palette.success.main, 0.6),
        }),
        '&:hover': {
            backgroundColor: alpha(theme.palette.success.main, 0.2),
            ...theme.applyStyles('light', {
                backgroundColor: alpha(theme.palette.success.main, 0.12),
            }),
        },
    },
    '& .celestial-row-below': {
        backgroundColor: alpha(theme.palette.info.main, 0.1),
        borderLeftColor: alpha(theme.palette.info.main, 0.75),
        ...theme.applyStyles('light', {
            backgroundColor: alpha(theme.palette.info.main, 0.05),
            borderLeftColor: alpha(theme.palette.info.main, 0.5),
        }),
    },
    '& .celestial-row-dead': {
        backgroundColor: alpha(theme.palette.error.main, 0.18),
        borderLeftColor: alpha(theme.palette.error.main, 0.9),
        ...theme.applyStyles('light', {
            backgroundColor: alpha(theme.palette.error.main, 0.1),
            borderLeftColor: alpha(theme.palette.error.main, 0.65),
        }),
        '& .MuiDataGrid-cell': {
            color: theme.palette.text.secondary,
        },
    },
    '& .celestial-row-unknown': {
        borderLeftColor: alpha(theme.palette.text.secondary, 0.55),
    },
    '& .celestial-row-selected': {
        backgroundColor: alpha(theme.palette.secondary.main, 0.25),
        borderLeftColor: alpha(theme.palette.secondary.main, 0.95),
        fontWeight: 'bold',
        ...theme.applyStyles('light', {
            backgroundColor: alpha(theme.palette.secondary.main, 0.12),
            borderLeftColor: alpha(theme.palette.secondary.main, 0.75),
        }),
        '&:hover': {
            backgroundColor: alpha(theme.palette.secondary.main, 0.3),
            ...theme.applyStyles('light', {
                backgroundColor: alpha(theme.palette.secondary.main, 0.16),
            }),
        },
    },
}));

const formatNumeric = (value, digits = 3) => {
    if (!Number.isFinite(value)) return '-';
    return Number(value).toFixed(digits);
};

const formatNumericUpTo = (value, maxDigits = 3) => {
    if (!Number.isFinite(value)) return '-';
    return Number(value)
        .toFixed(maxDigits)
        .replace(/\.?0+$/, '');
};

const formatLastRefresh = (value, timezone, locale) => {
    if (!value) return 'Never';
    const parsed = new Date(value);
    if (Number.isNaN(parsed.getTime())) return 'Unknown';
    const options = timezone ? { timeZone: timezone } : undefined;
    return parsed.toLocaleString(locale, options);
};

const formatAge = (value, nowMs) => {
    if (!value) return 'Never';
    const parsed = new Date(value).getTime();
    if (!Number.isFinite(parsed)) return 'Unknown';
    const diffSec = Math.max(0, Math.floor((nowMs - parsed) / 1000));
    if (diffSec < 60) return `${diffSec}s`;
    if (diffSec < 3600) return `${Math.floor(diffSec / 60)}m`;
    if (diffSec < 86400) return `${Math.floor(diffSec / 3600)}h`;
    return `${Math.floor(diffSec / 86400)}d`;
};

const magnitude3 = (vector) => {
    if (!Array.isArray(vector) || vector.length < 3) return NaN;
    const [x, y, z] = vector;
    if (![x, y, z].every((v) => Number.isFinite(v))) return NaN;
    return Math.sqrt(x * x + y * y + z * z);
};

const computeProjectionSpan = (orbitSampling) => {
    const past = Number(orbitSampling?.past_hours);
    const future = Number(orbitSampling?.future_hours);
    const step = Number(orbitSampling?.step_minutes);
    if (!Number.isFinite(past) || !Number.isFinite(future) || !Number.isFinite(step)) {
        return '-';
    }
    return `${past}h / ${future}h @ ${step}m`;
};

const getVisibilityState = (visible, elevationDeg) => {
    if (typeof visible === 'boolean') {
        return visible ? 'visible' : 'below';
    }
    if (Number.isFinite(elevationDeg)) {
        return elevationDeg > 0 ? 'visible' : 'below';
    }
    return 'unknown';
};

const formatAngle = (value, digits = 1) => {
    if (!Number.isFinite(value)) return '-';
    return `${Number(value).toFixed(digits)}°`;
};

const buildTrackingTargetKey = (trackingState = {}) => {
    const targetType = String(
        trackingState?.target_type
        || (trackingState?.command ? 'mission' : (trackingState?.body_id ? 'body' : 'satellite')),
    ).toLowerCase();
    if (targetType === 'body') {
        const bodyId = String(trackingState?.body_id || '').trim().toLowerCase();
        return bodyId ? `body:${bodyId}` : '';
    }
    if (targetType === 'mission') {
        const command = String(trackingState?.command || '').trim();
        return command ? `mission:${command}` : '';
    }
    return '';
};

const SettingsDialog = ({ open, onClose }) => {
    const dispatch = useDispatch();
    const columnVisibility = useSelector((state) => state.celestialMonitored.tableColumnVisibility);
    const tablePageSize = useSelector((state) => state.celestialMonitored.tablePageSize);
    const handleResetValues = useCallback(() => {
        dispatch(setMonitoredTableColumnVisibility({ ...MONITORED_TABLE_DEFAULT_COLUMN_VISIBILITY }));
        dispatch(setMonitoredTablePageSize(MONITORED_TABLE_DEFAULT_PAGE_SIZE));
        dispatch(setMonitoredTableSortModel([...MONITORED_TABLE_DEFAULT_SORT_MODEL]));
    }, [dispatch]);

    const columns = [
        { name: 'displayName', label: 'Name', category: 'identity', alwaysVisible: true },
        { name: 'targetType', label: 'Type', category: 'identity' },
        { name: 'command', label: 'Target ID', category: 'identity' },
        { name: 'source', label: 'Source', category: 'identity' },
        { name: 'sourceMode', label: 'Source Mode', category: 'identity' },
        { name: 'elevationDeg', label: 'Elevation (deg)', category: 'state' },
        { name: 'azimuthDeg', label: 'Azimuth (deg)', category: 'state' },
        { name: 'distanceFromSunAu', label: 'Distance from Sun (AU)', category: 'metrics' },
        { name: 'speedKmS', label: 'Speed (km/s)', category: 'metrics' },
        { name: 'lightTimeMinutes', label: 'Light Time (min)', category: 'metrics' },
        { name: 'lastRefreshAt', label: 'Last Refresh', category: 'state' },
        { name: 'lastRefreshAge', label: 'Refresh Age', category: 'state' },
        { name: 'projectionSpan', label: 'Projection Span', category: 'projection' },
        { name: 'cacheStatus', label: 'Cache', category: 'projection' },
        { name: 'stale', label: 'Stale', category: 'projection' },
        { name: 'sampleCount', label: 'Samples', category: 'projection' },
        { name: 'lastError', label: 'Last Error', category: 'state' },
    ];

    const categories = {
        identity: 'Identity',
        state: 'State',
        metrics: 'Metrics',
        projection: 'Projection',
    };

    const columnsByCategory = {
        identity: columns.filter((col) => col.category === 'identity'),
        state: columns.filter((col) => col.category === 'state'),
        metrics: columns.filter((col) => col.category === 'metrics'),
        projection: columns.filter((col) => col.category === 'projection'),
    };

    return (
        <Dialog open={open} onClose={onClose} maxWidth="sm" fullWidth PaperProps={{ sx: DIALOG_PAPER_SX }}>
            <DialogTitle sx={DIALOG_TITLE_SX}>Monitored Celestial Table Settings</DialogTitle>
            <DialogContent sx={DIALOG_CONTENT_SX}>
                <Box sx={{ mb: 2 }}>
                    <FormControl fullWidth size="small" sx={{ mt: 2 }}>
                        <InputLabel id="celestial-table-rows-label">Rows per page</InputLabel>
                        <Select
                            labelId="celestial-table-rows-label"
                            value={tablePageSize}
                            label="Rows per page"
                            onChange={(event) => dispatch(setMonitoredTablePageSize(event.target.value))}
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

                {Object.entries(columnsByCategory).map(([category, cols]) => (
                    <Box key={category} sx={{ mb: 2 }}>
                        <Typography variant="subtitle2" sx={{ fontWeight: 'bold', mb: 1 }}>
                            {categories[category]}
                        </Typography>
                        <FormGroup>
                            {cols.map((column) => (
                                <FormControlLabel
                                    key={column.name}
                                    control={
                                        <Checkbox
                                            checked={column.alwaysVisible || columnVisibility[column.name] !== false}
                                            onChange={() =>
                                                dispatch(
                                                    setMonitoredTableColumnVisibility({
                                                        ...columnVisibility,
                                                        [column.name]: !columnVisibility[column.name],
                                                    }),
                                                )
                                            }
                                            disabled={column.alwaysVisible}
                                        />
                                    }
                                    label={column.label}
                                />
                            ))}
                        </FormGroup>
                        <Divider sx={{ mt: 1 }} />
                    </Box>
                ))}
            </DialogContent>
            <DialogActions sx={DIALOG_ACTIONS_SX}>
                <Button onClick={handleResetValues} variant="outlined" color="warning">
                    Reset Values
                </Button>
                <Button onClick={onClose} variant="outlined" sx={DIALOG_CANCEL_BUTTON_SX}>
                    Close
                </Button>
            </DialogActions>
        </Dialog>
    );
};

const MonitoredCelestialGridIsland = ({
    rows = [],
    loading = false,
    onRowDoubleClick = null,
    onTargetSelected = null,
    targetNumberByTargetKey = {},
}) => {
    const { t } = useTranslation('earthview');
    const { t: tSat } = useTranslation('satellites');
    const { socket } = useSocket();
    const dispatch = useDispatch();
    const { requestRotatorForTarget, dialog: rotatorSelectionDialog } = useTargetRotatorSelectionDialog();
    const { timezone, locale } = useUserTimeSettings();
    const tracks = useSelector((state) => state.celestial?.celestialTracks?.celestial || []);
    const trackerInstances = useSelector((state) => state.trackerInstances?.instances || []);
    const { trackingState, trackerViews } = useSelector((state) => state.targetSatTrack || {});
    const {
        selectedIds,
        tableColumnVisibility,
        tablePageSize,
        tableSortModel,
        openGridSettingsDialog,
    } = useSelector((state) => state.celestialMonitored);
    const [nowMs, setNowMs] = useState(() => Date.now());
    const [page, setPage] = useState(0);
    const [rowContextMenu, setRowContextMenu] = useState(null);
    const [transmittersDialogOpen, setTransmittersDialogOpen] = useState(false);
    const [transmittersDialogData, setTransmittersDialogData] = useState(null);
    const rowSelectionModel = useMemo(() => toRowSelectionModel(selectedIds), [selectedIds]);
    const currentlyTrackedTargetKey = useMemo(() => buildTrackingTargetKey(trackingState), [trackingState]);

    useEffect(() => {
        const interval = setInterval(() => setNowMs(Date.now()), 30000);
        return () => clearInterval(interval);
    }, []);

    const trackByTargetKey = useMemo(() => {
        const entries = Array.isArray(tracks) ? tracks : [];
        return entries.reduce((acc, track) => {
            const key = buildTargetKeyFromCelestialRow(track);
            if (key) acc[key] = track;
            return acc;
        }, {});
    }, [tracks]);

    const enrichedRows = useMemo(
        () =>
            (rows || []).map((row) => {
                const targetKey = buildTargetKeyFromCelestialRow(row);
                const track = trackByTargetKey[targetKey] || {};
                const targetType = String(row.targetType || row.target_type || 'mission').toLowerCase();
                const distanceAu = magnitude3(track.position_xyz_au);
                const speedAuPerDay = magnitude3(track.velocity_xyz_au_per_day);
                const speedKmS = Number.isFinite(speedAuPerDay) ? speedAuPerDay * AU_PER_DAY_TO_KM_PER_S : NaN;
                const lightTimeMin = Number.isFinite(distanceAu) ? distanceAu * LIGHT_TIME_MIN_PER_AU : NaN;
                const sampleCount = Array.isArray(track.orbit_samples_xyz_au) ? track.orbit_samples_xyz_au.length : 0;
                const rawElevationDeg = Number(track?.sky_position?.el_deg);
                const rawAzimuthDeg = Number(track?.sky_position?.az_deg);
                const elevationDeg = Number.isFinite(rawElevationDeg) ? rawElevationDeg : null;
                const azimuthDeg = Number.isFinite(rawAzimuthDeg) ? rawAzimuthDeg : null;
                const visibility = getVisibilityState(track?.visibility?.visible, rawElevationDeg);
                const targetIdentifier = targetType === 'body'
                    ? String(row.bodyId || row.body_id || row.command || '').trim().toLowerCase()
                    : String(row.command || row.mission_id || row.missionId || '').trim();
                return {
                    ...row,
                    targetType,
                    targetKey,
                    targetIdentifier,
                    missionId: String(row.mission_id || row.missionId || '').trim().toLowerCase(),
                    command: String(row.command || '').trim(),
                    bodyId: String(row.bodyId || row.body_id || '').trim().toLowerCase(),
                    transmitters: Array.isArray(row?.transmitters)
                        ? row.transmitters
                        : (Array.isArray(track?.transmitters) ? track.transmitters : []),
                    color: row.color || track.color || null,
                    source: track.source || '-',
                    sourceMode: row.sourceMode || row.source_mode || (targetType === 'body' ? 'static-body' : '-'),
                    visibility,
                    elevationDeg,
                    azimuthDeg,
                    distanceFromSunAu: distanceAu,
                    speedKmS,
                    lightTimeMinutes: lightTimeMin,
                    lastRefreshAge: formatAge(row.lastRefreshAt, nowMs),
                    projectionSpan: computeProjectionSpan(track.orbit_sampling),
                    cacheStatus: track.cache || '-',
                    stale: track.stale ? 'Yes' : 'No',
                    sampleCount,
                };
            }),
        [rows, trackByTargetKey, nowMs],
    );
    const applyTargetSelection = useCallback((rawId) => {
        if (rawId == null) return;
        const selectedRow = enrichedRows.find((row) => String(row.id) === String(rawId));
        if (!selectedRow) return;
        dispatch(setSelectedMonitoredIds([selectedRow.id]));
        if (onTargetSelected) {
            onTargetSelected(selectedRow);
        }
    }, [dispatch, enrichedRows, onTargetSelected]);

    const columns = useMemo(
        () => [
            {
                field: 'displayName',
                headerName: 'Name',
                minWidth: 170,
                flex: 1,
                renderCell: (params) => (
                    <Box
                        sx={{
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'flex-start',
                            width: '100%',
                            height: '100%',
                            minWidth: 0,
                            gap: 0.75,
                        }}
                    >
                        {(() => {
                            const targetKey = String(params.row?.targetKey || '').trim();
                            const targetNumber = Number(targetNumberByTargetKey?.[targetKey]);
                            if (!Number.isFinite(targetNumber) || targetNumber <= 0) return null;
                            return (
                                <TargetNumberIcon
                                    targetNumber={targetNumber}
                                    prefix="T"
                                    size={16}
                                    sx={{ flexShrink: 0 }}
                                />
                            );
                        })()}
                        {(() => {
                            const value = String(params.row?.color || '').trim();
                            const valid = /^#[0-9A-Fa-f]{6}$/.test(value);
                            const swatchColor = valid ? value : 'transparent';
                            return (
                                <Box
                                    sx={{
                                        width: 12,
                                        height: 12,
                                        borderRadius: '3px',
                                        border: '1px solid',
                                        borderColor: 'divider',
                                        bgcolor: swatchColor,
                                        flexShrink: 0,
                                    }}
                                    title={valid ? value.toUpperCase() : 'No color'}
                                />
                            );
                        })()}
                        <Typography
                            component="span"
                            variant="body2"
                            sx={{
                                fontWeight: 700,
                                whiteSpace: 'nowrap',
                                overflow: 'hidden',
                                textOverflow: 'ellipsis',
                                lineHeight: 1.2,
                                minWidth: 0,
                            }}
                        >
                            {params?.value || '-'}
                        </Typography>
                    </Box>
                ),
            },
            {
                field: 'targetType',
                headerName: 'Type',
                minWidth: 95,
                valueGetter: (value) => (String(value || '').toLowerCase() === 'body' ? 'Body' : 'Mission'),
            },
            {
                field: 'command',
                headerName: 'Target ID',
                minWidth: 170,
                flex: 1,
                valueGetter: (value, row) =>
                    String(row?.targetType || '').toLowerCase() === 'body' ? (row?.bodyId || value) : value,
            },
            { field: 'source', headerName: 'Source', minWidth: 110, flex: 0.7 },
            { field: 'sourceMode', headerName: 'Source Mode', minWidth: 120, flex: 0.8 },
            {
                field: 'elevationDeg',
                width: 80,
                minWidth: 80,
                headerName: 'Elevation (deg)',
                type: 'number',
                align: 'center',
                headerAlign: 'center',
                valueFormatter: (value) => formatAngle(value, 2),
            },
            {
                field: 'azimuthDeg',
                width: 90,
                minWidth: 90,
                headerName: 'Azimuth (deg)',
                align: 'center',
                headerAlign: 'center',
                valueGetter: (value) => formatAngle(value, 2),
            },
            {
                field: 'distanceFromSunAu',
                headerName: 'Distance from Sun (AU)',
                width: 90,
                minWidth: 90,
                valueGetter: (value) => formatNumericUpTo(value, 3),
            },
            {
                field: 'speedKmS',
                headerName: 'Speed (km/s)',
                width: 90,
                minWidth: 90,
                valueGetter: (value) => formatNumeric(value, 3),
            },
            {
                field: 'lightTimeMinutes',
                headerName: 'Light Time (min)',
                width: 90,
                minWidth: 90,
                valueGetter: (value) => formatNumeric(value, 2),
            },
            { field: 'lastRefreshAge', headerName: 'Refresh Age', width: 70, minWidth: 70 },
            { field: 'projectionSpan', headerName: 'Projection Span', minWidth: 150 },
            { field: 'cacheStatus', headerName: 'Cache', minWidth: 90 },
            { field: 'stale', headerName: 'Stale', minWidth: 80 },
            { field: 'sampleCount', headerName: 'Samples', minWidth: 90, type: 'number' },
            {
                field: 'lastError',
                headerName: 'Last Error',
                minWidth: 250,
                flex: 1.2,
                valueGetter: (value) => value || '-',
            },
            {
                field: 'lastRefreshAt',
                headerName: 'Last Refresh',
                minWidth: 185,
                valueGetter: (value) => formatLastRefresh(value, timezone, locale),
            },
        ],
        [timezone, locale, targetNumberByTargetKey],
    );

    const copyTextToClipboard = useCallback(async (text) => {
        if (navigator?.clipboard?.writeText) {
            await navigator.clipboard.writeText(text);
            return;
        }
        const textArea = document.createElement('textarea');
        textArea.value = text;
        textArea.setAttribute('readonly', '');
        textArea.style.position = 'absolute';
        textArea.style.left = '-9999px';
        document.body.appendChild(textArea);
        textArea.select();
        document.execCommand('copy');
        document.body.removeChild(textArea);
    }, []);

    const handleCloseRowContextMenu = useCallback(() => {
        setRowContextMenu(null);
    }, []);

    const handleSuppressNativeContextMenu = useCallback((event) => {
        event.preventDefault();
        if (typeof event.stopPropagation === 'function') {
            event.stopPropagation();
        }
        setRowContextMenu(null);
    }, []);

    // Bind context-menu directly on each row for consistent browser behavior.
    const handleRowContextMenu = useCallback((event) => {
        const rowId = event.currentTarget?.getAttribute?.('data-id');
        if (!rowId) return;
        const row = enrichedRows.find((entry) => String(entry?.id) === String(rowId));
        if (!row) return;
        event.preventDefault();
        event.stopPropagation();
        // Match earth-view UX: right-click again closes an already open menu.
        if (rowContextMenu) {
            setRowContextMenu(null);
            return;
        }
        applyTargetSelection(row.id);
        setRowContextMenu({
            mouseX: event.clientX + 2,
            mouseY: event.clientY - 6,
            row,
        });
    }, [applyTargetSelection, enrichedRows, rowContextMenu]);

    const handleRowMenuAction = useCallback(async (action) => {
        const row = rowContextMenu?.row;
        if (!row) return;
        try {
            if (action === 'set-target') {
                const targetType = String(row.targetType || '').toLowerCase() === 'body' ? 'body' : 'mission';
                const missionCommand = String(row.command || row.targetIdentifier || '').trim();
                const missionId = String(row.missionId || '').trim().toLowerCase();
                const bodyId = String(row.bodyId || row.targetIdentifier || '').trim().toLowerCase();
                const isTargetable = targetType === 'body' ? Boolean(bodyId) : Boolean(missionCommand);
                if (!socket || !isTargetable) {
                    return;
                }
                const selectedAssignment = await requestRotatorForTarget(row.displayName || row.targetIdentifier || row.targetKey);
                if (!selectedAssignment) {
                    return;
                }
                const assignmentAction = String(selectedAssignment?.action || 'retarget_current_slot');
                const isCreateNewSlot = assignmentAction === 'create_new_slot';
                const trackerId = String(selectedAssignment?.trackerId || '');
                const rotatorId = String(selectedAssignment?.rotatorId || 'none');
                const assignmentRigId = String(selectedAssignment?.rigId || 'none');
                if (!trackerId) {
                    return;
                }
                const selectedTrackerInstance = trackerInstances.find(
                    (instance) => String(instance?.tracker_id || '') === trackerId
                );
                const selectedTrackerView = trackerViews?.[trackerId] || {};
                const selectedTrackerState = selectedTrackerView?.trackingState || selectedTrackerInstance?.tracking_state || {};
                const nextRigId = isCreateNewSlot
                    ? assignmentRigId
                    : String(
                        selectedTrackerView?.selectedRadioRig
                        ?? selectedTrackerState?.rig_id
                        ?? assignmentRigId
                        ?? 'none'
                    );
                const nextRotatorId = isCreateNewSlot ? 'none' : rotatorId;
                const nextTransmitterId = isCreateNewSlot
                    ? 'none'
                    : String(selectedTrackerState?.transmitter_id || 'none');

                dispatch(setTrackerId(trackerId));
                dispatch(setRotator({ value: nextRotatorId, trackerId }));

                const targetPatch = targetType === 'body'
                    ? {
                        target_type: 'body',
                        target_name: row.displayName || bodyId,
                        body_id: bodyId,
                        mission_id: null,
                        command: null,
                    }
                    : {
                        target_type: 'mission',
                        target_name: row.displayName || missionCommand,
                        mission_id: missionId || null,
                        command: missionCommand,
                        body_id: null,
                    };

                const newTrackingState = isCreateNewSlot
                    ? {
                        tracker_id: trackerId,
                        ...targetPatch,
                        norad_id: null,
                        group_id: null,
                        rig_id: nextRigId,
                        rotator_id: nextRotatorId,
                        transmitter_id: 'none',
                        rig_state: 'disconnected',
                        rotator_state: 'disconnected',
                        rig_vfo: 'none',
                        vfo1: 'uplink',
                        vfo2: 'downlink',
                    }
                    : {
                        ...selectedTrackerState,
                        tracker_id: trackerId,
                        ...targetPatch,
                        norad_id: null,
                        group_id: null,
                        rig_id: nextRigId,
                        rotator_id: nextRotatorId,
                        transmitter_id: nextTransmitterId,
                    };

                await dispatch(setTrackingStateInBackend({ socket, data: newTrackingState })).unwrap();
                return;
            }
            if (action === 'edit-transmitters') {
                setTransmittersDialogData({
                    name: row.displayName || row.targetIdentifier || row.targetKey || '',
                    target_key: row.targetKey || '',
                    transmitters: Array.isArray(row.transmitters) ? row.transmitters : [],
                });
                setTransmittersDialogOpen(true);
                return;
            }
            if (action === 'copy-identifier') {
                await copyTextToClipboard(row.targetIdentifier || '-');
                return;
            }
            if (action === 'copy-target-key') {
                await copyTextToClipboard(row.targetKey || '-');
                return;
            }
            if (action === 'copy-summary') {
                const summary = [
                    row.displayName || '-',
                    row.targetType === 'body'
                        ? `Body ${row.targetIdentifier || '-'}`
                        : `Mission ${row.targetIdentifier || '-'}`,
                    `Source ${row.source || '-'}`,
                    `Mode ${row.sourceMode || '-'}`,
                ].join(' | ');
                await copyTextToClipboard(summary);
            }
        } catch (error) {
            toast.error(`${t('satellite_info.failed_tracking')}: ${error?.message || error?.error || 'Unknown error'}`);
        } finally {
            setRowContextMenu(null);
        }
    }, [
        applyTargetSelection,
        copyTextToClipboard,
        dispatch,
        requestRotatorForTarget,
        rowContextMenu?.row,
        socket,
        t,
        trackerInstances,
        trackerViews,
    ]);

    const rowContextMenuItems = useMemo(() => {
        const row = rowContextMenu?.row;
        if (!row) return [];
        const targetType = String(row.targetType || '').toLowerCase() === 'body' ? 'body' : 'mission';
        const missionCommand = String(row.command || row.targetIdentifier || '').trim();
        const bodyId = String(row.bodyId || row.targetIdentifier || '').trim().toLowerCase();
        const isTargetable = targetType === 'body' ? Boolean(bodyId) : Boolean(missionCommand);
        const isCurrentlyTargeted = Boolean(row.targetKey) && String(row.targetKey).trim() === currentlyTrackedTargetKey;
        return [
            {
                key: 'set-target',
                label: t('satellites_table.context_menu.set_as_target'),
                disabled: !socket || !isTargetable || isCurrentlyTargeted,
                onClick: () => handleRowMenuAction('set-target'),
            },
            {
                key: 'edit-transmitters',
                label: t('satellites_table.context_menu.edit_transmitters'),
                disabled: !row?.targetKey,
                onClick: () => handleRowMenuAction('edit-transmitters'),
            },
            { type: 'divider', key: 'divider-copy' },
            {
                key: 'copy-identifier',
                label: row.targetType === 'body' ? 'Copy body ID' : 'Copy mission command',
                onClick: () => handleRowMenuAction('copy-identifier'),
            },
            { key: 'copy-target-key', label: 'Copy target key', onClick: () => handleRowMenuAction('copy-target-key') },
            { key: 'copy-summary', label: 'Copy target summary', onClick: () => handleRowMenuAction('copy-summary') },
        ];
    }, [currentlyTrackedTargetKey, handleRowMenuAction, rowContextMenu?.row, socket, t]);

    return (
        <>
            {rotatorSelectionDialog}
            <Box sx={{ width: '100%', height: '100%', display: 'flex', flexDirection: 'column', minHeight: 0 }}>
            <Box sx={{ width: '100%', flex: 1, minHeight: 0 }}>
                <StyledDataGrid
                    rows={enrichedRows}
                    columns={columns}
                    getRowId={(row) => row.id}
                    loading={loading}
                    disableMultipleRowSelection
                    disableRowSelectionOnClick={false}
                    rowSelectionModel={rowSelectionModel}
                    onRowSelectionModelChange={(nextSelection) => {
                        const selected = toSelectedIds(nextSelection);
                        const selectedId = selected.length ? selected[0] : null;
                        // Keep one-target behavior deterministic: ignore transient de-select events
                        // and only update when we have an actual row target.
                        if (selectedId == null) return;
                        applyTargetSelection(selectedId);
                    }}
                    // Row click must also trigger focus. A newly added target can already be selected
                    // in state, so selection-change callbacks may not fire on first user click.
                    onRowClick={(params) => {
                        applyTargetSelection(params?.row?.id);
                    }}
                    onRowDoubleClick={(params) => {
                        if (onRowDoubleClick) {
                            onRowDoubleClick(params?.row || null);
                        }
                    }}
                    slotProps={{
                        row: {
                            onContextMenu: handleRowContextMenu,
                        },
                    }}
                    density="compact"
                    columnVisibilityModel={tableColumnVisibility}
                    onColumnVisibilityModelChange={(model) => dispatch(setMonitoredTableColumnVisibility(model))}
                    paginationModel={{ pageSize: tablePageSize, page }}
                    onPaginationModelChange={(model) => {
                        setPage(model.page);
                        dispatch(setMonitoredTablePageSize(model.pageSize));
                    }}
                    pageSizeOptions={[5, 10, 15, 20, 25]}
                    sortModel={tableSortModel}
                    onSortModelChange={(model) => dispatch(setMonitoredTableSortModel(model))}
                    getRowClassName={(params) => {
                        if ((selectedIds || [])[0] === params.row.id) {
                            return 'celestial-row-selected pointer-cursor';
                        }
                        if (params.row.lastError && params.row.lastError !== '-') {
                            return 'celestial-row-dead pointer-cursor';
                        }
                        if (params.row.visibility === 'visible') {
                            return 'celestial-row-visible pointer-cursor';
                        }
                        if (params.row.visibility === 'below') {
                            return 'celestial-row-below pointer-cursor';
                        }
                        return 'celestial-row-unknown pointer-cursor';
                    }}
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
                    }}
                />
            </Box>
            <CelestialContextMenu
                open={Boolean(rowContextMenu)}
                onClose={handleCloseRowContextMenu}
                onSuppressNativeContextMenu={handleSuppressNativeContextMenu}
                anchorPosition={
                    rowContextMenu
                        ? { top: rowContextMenu.mouseY, left: rowContextMenu.mouseX }
                        : undefined
                }
                title={rowContextMenu?.row?.displayName || '-'}
                targetType={rowContextMenu?.row?.targetType || 'mission'}
                targetIdentifier={rowContextMenu?.row?.targetIdentifier || '-'}
                items={rowContextMenuItems}
            />
            <TransmittersDialog
                open={transmittersDialogOpen}
                onClose={() => setTransmittersDialogOpen(false)}
                title={tSat('satellite_database.edit_transmitters_title', {
                    name: transmittersDialogData?.name || rowContextMenu?.row?.displayName || '',
                })}
                satelliteData={transmittersDialogData}
                variant="paper"
                widthOffsetPx={20}
            />
            <SettingsDialog
                open={openGridSettingsDialog}
                onClose={() => dispatch(setOpenGridSettingsDialog(false))}
            />
            </Box>
        </>
    );
};

export default React.memo(MonitoredCelestialGridIsland);
