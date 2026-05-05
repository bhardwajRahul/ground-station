import React, { useMemo } from 'react';
import { Box, Chip, CircularProgress, Divider, Typography } from '@mui/material';
import { alpha } from '@mui/material/styles';
import { getClassNamesBasedOnGridEditing, TitleBar } from '../common/common.jsx';
import { useUserTimeSettings } from '../../hooks/useUserTimeSettings.jsx';

const AU_IN_KM = 149597870.7;
const SECONDS_PER_DAY = 86400;
const AU_PER_DAY_TO_KM_PER_S = AU_IN_KM / SECONDS_PER_DAY;
const LIGHT_TIME_MIN_PER_AU = 8.316746397;

const buildTargetKey = (entry) => {
    const explicit = String(entry?.targetKey || entry?.target_key || '').trim();
    if (explicit) return explicit;

    const type = String(entry?.targetType || entry?.target_type || 'mission').toLowerCase();
    if (type === 'body') {
        const bodyId = String(entry?.bodyId || entry?.body_id || entry?.command || '').trim().toLowerCase();
        return bodyId ? `body:${bodyId}` : '';
    }
    const command = String(entry?.command || '').trim();
    return command ? `mission:${command}` : '';
};

const magnitude3 = (vector) => {
    if (!Array.isArray(vector) || vector.length < 3) return NaN;
    const [x, y, z] = vector;
    if (![x, y, z].every((value) => Number.isFinite(value))) return NaN;
    return Math.sqrt(x * x + y * y + z * z);
};

const formatNumber = (value, digits = 2, suffix = '') => {
    if (!Number.isFinite(value)) return '-';
    return `${Number(value).toFixed(digits)}${suffix}`;
};

const formatDateTime = (isoValue, timezone, locale) => {
    if (!isoValue) return '-';
    const parsed = new Date(isoValue);
    if (Number.isNaN(parsed.getTime())) return '-';
    const options = timezone ? { timeZone: timezone } : undefined;
    return parsed.toLocaleString(locale, options);
};

const formatRelative = (isoValue, nowMs) => {
    if (!isoValue) return '-';
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

const MetricPair = ({ label, value }) => (
    <Box sx={{ minWidth: 0 }}>
        <Typography variant="caption" sx={{ color: 'text.secondary', display: 'block' }}>
            {label}
        </Typography>
        <Typography variant="body2" sx={{ fontWeight: 700, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
            {value}
        </Typography>
    </Box>
);

const normalizeHexColor = (value) => {
    const text = String(value || '').trim();
    return /^#[0-9A-Fa-f]{6}$/.test(text) ? text.toUpperCase() : '';
};

const CelestialInfoIsland = ({
    selectedTargetKey = '',
    tracks = [],
    passes = [],
    monitoredRows = [],
    gridEditable = false,
    loading = false,
}) => {
    const { timezone, locale } = useUserTimeSettings();
    const normalizedTargetKey = String(selectedTargetKey || '').trim();
    const nowMs = Date.now();

    const trackByTargetKey = useMemo(() => {
        const map = {};
        (tracks || []).forEach((track) => {
            const key = buildTargetKey(track);
            if (key) map[key] = track;
        });
        return map;
    }, [tracks]);

    const monitoredByTargetKey = useMemo(() => {
        const map = {};
        (monitoredRows || []).forEach((row) => {
            const key = buildTargetKey(row);
            if (key) map[key] = row;
        });
        return map;
    }, [monitoredRows]);

    const selectedTrack = normalizedTargetKey ? trackByTargetKey[normalizedTargetKey] || null : null;
    const selectedMonitored = normalizedTargetKey ? monitoredByTargetKey[normalizedTargetKey] || null : null;

    const selectedPasses = useMemo(
        () =>
            (passes || [])
                .filter((pass) => String(pass?.target_key || '').trim() === normalizedTargetKey)
                .sort((left, right) => new Date(left.event_start).getTime() - new Date(right.event_start).getTime()),
        [passes, normalizedTargetKey],
    );

    const activePass = selectedPasses.find((pass) => {
        const startMs = new Date(pass?.event_start || '').getTime();
        const endMs = new Date(pass?.event_end || '').getTime();
        return Number.isFinite(startMs) && Number.isFinite(endMs) && startMs <= nowMs && endMs >= nowMs;
    }) || null;

    const nextPass = selectedPasses.find((pass) => new Date(pass?.event_start || '').getTime() > nowMs) || null;

    const targetType = String(
        selectedTrack?.target_type
        || selectedMonitored?.targetType
        || (normalizedTargetKey.startsWith('body:') ? 'body' : 'mission'),
    ).toLowerCase();
    const targetName = String(
        selectedTrack?.name
        || selectedMonitored?.displayName
        || selectedTrack?.command
        || selectedMonitored?.command
        || normalizedTargetKey
        || '',
    );
    const targetIdentifier = targetType === 'body'
        ? String(selectedTrack?.body_id || selectedMonitored?.bodyId || selectedTrack?.command || '-')
        : String(selectedTrack?.command || selectedMonitored?.command || '-');
    const selectedColor = normalizeHexColor(selectedTrack?.color || selectedMonitored?.color || '');

    const elevationDeg = Number(selectedTrack?.sky_position?.el_deg);
    const azimuthDeg = Number(selectedTrack?.sky_position?.az_deg);
    const explicitVisible = selectedTrack?.visibility?.visible;
    const visible = typeof explicitVisible === 'boolean' ? explicitVisible : (Number.isFinite(elevationDeg) ? elevationDeg > 0 : null);
    const distanceFromSunAu = magnitude3(selectedTrack?.position_xyz_au);
    const speedAuPerDay = magnitude3(selectedTrack?.velocity_xyz_au_per_day);
    const speedKmS = Number.isFinite(speedAuPerDay) ? speedAuPerDay * AU_PER_DAY_TO_KM_PER_S : NaN;
    const lightTimeMinutes = Number.isFinite(distanceFromSunAu) ? distanceFromSunAu * LIGHT_TIME_MIN_PER_AU : NaN;
    const distanceKm = Number.isFinite(distanceFromSunAu) ? distanceFromSunAu * AU_IN_KM : NaN;

    const statusChip = (() => {
        if (selectedTrack?.error) return <Chip size="small" color="error" label="Error" />;
        if (visible === true) return <Chip size="small" color="success" label="Visible" />;
        if (visible === false) return <Chip size="small" color="info" label="Below Horizon" />;
        return <Chip size="small" label="Unknown" />;
    })();

    return (
        <Box sx={{ height: '100%', display: 'flex', flexDirection: 'column', minHeight: 0 }}>
            <TitleBar
                className={getClassNamesBasedOnGridEditing(gridEditable, ['window-title-bar'])}
                sx={{
                    bgcolor: 'background.titleBar',
                    borderBottom: '1px solid',
                    borderColor: 'border.main',
                }}
            >
                <Box sx={{ display: 'flex', alignItems: 'center', width: '100%' }}>
                    <Typography variant="subtitle2" sx={{ fontWeight: 700 }}>
                        Celestial Info
                    </Typography>
                </Box>
            </TitleBar>

            <Box sx={{ flex: 1, minHeight: 0, overflow: 'auto' }}>
                {!normalizedTargetKey ? (
                    <Box sx={{ height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', px: 2, py: 1.5 }}>
                        <Typography variant="body2" sx={{ color: 'text.secondary', fontStyle: 'italic', textAlign: 'center' }}>
                            Select a body or mission from Monitored Celestial or Celestial Passes.
                        </Typography>
                    </Box>
                ) : (
                    <>
                        <Box
                            sx={{
                                position: 'sticky',
                                top: 0,
                                zIndex: 2,
                                px: 1.5,
                                py: 1.25,
                                borderBottom: '1px solid',
                                borderColor: selectedColor ? alpha(selectedColor, 0.55) : 'divider',
                                bgcolor: selectedColor
                                    ? (theme) => alpha(selectedColor, theme.palette.mode === 'dark' ? 0.2 : 0.12)
                                    : 'background.paper',
                            }}
                        >
                            {loading && !selectedTrack ? (
                                <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 1 }}>
                                    <CircularProgress size={16} />
                                    <Typography variant="caption" sx={{ color: 'text.secondary' }}>
                                        Loading details...
                                    </Typography>
                                </Box>
                            ) : null}
                            <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 1 }}>
                                <Box sx={{ minWidth: 0 }}>
                                    <Typography variant="subtitle1" sx={{ fontWeight: 700, lineHeight: 1.15 }}>
                                        {targetName || '-'}
                                    </Typography>
                                    <Typography variant="caption" sx={{ color: 'text.secondary' }}>
                                        {targetType === 'body' ? 'Body' : 'Mission'} · {targetIdentifier}
                                    </Typography>
                                </Box>
                                {statusChip}
                            </Box>
                        </Box>

                        <Box sx={{ p: 1.5 }}>
                            <Box sx={{ display: 'grid', gridTemplateColumns: 'repeat(2, minmax(0, 1fr))', gap: 1.25 }}>
                                <MetricPair label="Elevation" value={formatNumber(elevationDeg, 1, ' deg')} />
                                <MetricPair label="Azimuth" value={formatNumber(azimuthDeg, 1, ' deg')} />
                                <MetricPair label="Distance from Sun" value={formatNumber(distanceFromSunAu, 4, ' AU')} />
                                <MetricPair label="Distance from Sun (km)" value={formatNumber(distanceKm, 0)} />
                                <MetricPair label="Speed" value={formatNumber(speedKmS, 3, ' km/s')} />
                                <MetricPair label="Light Time" value={formatNumber(lightTimeMinutes, 2, ' min')} />
                            </Box>

                            <Divider sx={{ my: 1.25 }} />

                            <Typography variant="overline" sx={{ color: 'secondary.main', fontWeight: 700 }}>
                                Pass Window
                            </Typography>
                            <Box sx={{ display: 'grid', gridTemplateColumns: 'repeat(2, minmax(0, 1fr))', gap: 1.25, mt: 0.5 }}>
                                <MetricPair label="Total Passes" value={String(selectedPasses.length)} />
                                <MetricPair label="Active Pass" value={activePass ? 'Yes' : 'No'} />
                                <MetricPair
                                    label={activePass ? 'Active Since' : 'Next Start'}
                                    value={
                                        activePass
                                            ? formatRelative(activePass.event_start, nowMs)
                                            : (nextPass ? formatRelative(nextPass.event_start, nowMs) : 'No upcoming pass')
                                    }
                                />
                                <MetricPair
                                    label={activePass ? 'Ends' : 'Next Peak'}
                                    value={
                                        activePass
                                            ? formatRelative(activePass.event_end, nowMs)
                                            : (nextPass ? formatDateTime(nextPass.peak_time || nextPass.event_end, timezone, locale) : '-')
                                    }
                                />
                            </Box>

                            <Divider sx={{ my: 1.25 }} />

                            <Typography variant="overline" sx={{ color: 'secondary.main', fontWeight: 700 }}>
                                Data Source
                            </Typography>
                            <Box sx={{ display: 'grid', gridTemplateColumns: 'repeat(2, minmax(0, 1fr))', gap: 1.25, mt: 0.5 }}>
                                <MetricPair label="Source" value={String(selectedTrack?.source || '-')} />
                                <MetricPair label="Cache" value={String(selectedTrack?.cache || '-')} />
                                <MetricPair label="Stale" value={selectedTrack?.stale ? 'Yes' : 'No'} />
                                <MetricPair
                                    label="Last Refresh"
                                    value={formatDateTime(selectedMonitored?.lastRefreshAt, timezone, locale)}
                                />
                            </Box>

                            {selectedTrack?.error ? (
                                <>
                                    <Divider sx={{ my: 1.25 }} />
                                    <Typography variant="caption" sx={{ color: 'error.main', fontWeight: 700 }}>
                                        {String(selectedTrack.error)}
                                    </Typography>
                                </>
                            ) : null}
                        </Box>
                    </>
                )}
            </Box>
        </Box>
    );
};

export default React.memo(CelestialInfoIsland);
