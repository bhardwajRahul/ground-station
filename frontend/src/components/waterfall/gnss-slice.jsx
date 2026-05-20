/**
 * @license
 * Copyright (c) 2025 Efstratios Goudelis
 *
 * This program is free software: you can redistribute it and/or modify
 * it under the terms of the GNU General Public License as published by
 * the Free Software Foundation, either version 3 of the License, or
 * (at your option) any later version.
 *
 * This program is distributed in the hope that it will be useful,
 * but WITHOUT ANY WARRANTY; without even the implied warranty of
 * MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE. See the
 * GNU General Public License for more details.
 *
 * You should have received a copy of the GNU General Public License
 * along with this program. If not, see <https://www.gnu.org/licenses/>.
 *
 */

import { createSlice } from '@reduxjs/toolkit';

const FIX_QUALITY_TIMELINE_WINDOW_MS = 30 * 60 * 1000;
const FIX_QUALITY_TIMELINE_MAX_POINTS = 4000;
const FIX_QUALITY_TIMELINE_MIN_APPEND_MS = 15 * 1000;

function toFiniteNumber(value) {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : null;
}

function getGnssFixStatusFromOutput(output) {
    const normalizedOutput = output || {};
    const eventType = String(normalizedOutput.event || '').toLowerCase();

    // Heartbeat traffic is transport telemetry, not fix-evidence.
    if (eventType === 'gnss_activity') {
        return null;
    }

    const backendFixStatus = String(normalizedOutput.gnss_fix_status || '').trim().toUpperCase();
    if (backendFixStatus === 'FIX' || backendFixStatus === 'NO FIX') {
        // Prefer backend-derived state when available so fix acquire/loss semantics stay centralized.
        return backendFixStatus;
    }

    const latitude = toFiniteNumber(normalizedOutput.latitude);
    const longitude = toFiniteNumber(normalizedOutput.longitude);
    const hasCoords = latitude !== null && longitude !== null;
    const hasPvtField = normalizedOutput.has_pvt !== undefined && normalizedOutput.has_pvt !== null;
    const hasPvt = hasPvtField ? Boolean(normalizedOutput.has_pvt) : null;
    const hasFixQualityField = normalizedOutput.fix_quality !== undefined
        && normalizedOutput.fix_quality !== null
        && String(normalizedOutput.fix_quality).trim() !== '';
    const hasFixQuality = hasFixQualityField && String(normalizedOutput.fix_quality).trim() !== '0';
    const isNmea = eventType === 'nmea' || eventType === 'nmea_gga' || eventType === 'nmea_rmc';
    const isFixSignal = hasCoords || hasFixQualityField || hasPvtField || isNmea;

    if (!isFixSignal) {
        return null;
    }
    return (hasCoords || hasFixQuality || hasPvt) ? 'FIX' : 'NO FIX';
}

const initialState = {
    decodedInsightsActiveTab: 'packets',
    gnssSatellitesSortModel: [{ field: 'satelliteId', sort: 'asc' }],
    // Runtime GNSS summary snapshot. Keep this outside decoders.outputs ring-buffer so
    // table/status-bar churn cannot blank summary fields when old outputs are trimmed.
    receiverSnapshot: {
        lastUpdateMs: null,
        latitude: null,
        longitude: null,
        altitudeM: null,
        fixQuality: null,
        satellites: null,
    },
    activitySnapshot: {
        lastHeartbeatMs: null,
        hasActivity: false,
        hasPvt: false,
        packetsPerSec: 0,
        monitorObsPerSec: 0,
        lossOfLockTotal: 0,
        lossOfLockDelta: 0,
    },
    // Runtime GNSS lifecycle for the decoded island summary.
    gnssFixLifecycle: {
        currentStatus: 'NO DATA',
        currentFixStartedAtMs: null,
        lastFixAcquiredAtMs: null,
        lastClosedFixAcquiredAtMs: null,
        lastFixLostAtMs: null,
        lastFixDurationMs: null,
        lastSignalAtMs: null,
    },
    // UI-only rolling fix quality samples for the last 30 minutes.
    gnssFixQualityTimeline: [],
};

export const gnssSlice = createSlice({
    name: 'gnssState',
    initialState,
    reducers: {
        setDecodedInsightsActiveTab: (state, action) => {
            state.decodedInsightsActiveTab = action.payload === 'gnss' ? 'gnss' : 'packets';
        },
        setGnssSatellitesSortModel: (state, action) => {
            state.gnssSatellitesSortModel = action.payload;
        },
        resetGnssFixLifecycle: (state) => {
            // Reset live GNSS runtime state for a fresh streaming/decoder session.
            state.receiverSnapshot = {
                lastUpdateMs: null,
                latitude: null,
                longitude: null,
                altitudeM: null,
                fixQuality: null,
                satellites: null,
            };
            state.activitySnapshot = {
                lastHeartbeatMs: null,
                hasActivity: false,
                hasPvt: false,
                packetsPerSec: 0,
                monitorObsPerSec: 0,
                lossOfLockTotal: 0,
                lossOfLockDelta: 0,
            };
            state.gnssFixLifecycle = {
                currentStatus: 'NO DATA',
                currentFixStartedAtMs: null,
                lastFixAcquiredAtMs: null,
                lastClosedFixAcquiredAtMs: null,
                lastFixLostAtMs: null,
                lastFixDurationMs: null,
                lastSignalAtMs: null,
            };
            state.gnssFixQualityTimeline = [];
        },
        updateGnssFixLifecycleFromOutput: (state, action) => {
            const payload = action.payload || {};
            if (payload.decoder_type !== 'gnss') {
                return;
            }

            const timestampMs = Number(payload.timestamp) * 1000;
            if (!Number.isFinite(timestampMs)) {
                return;
            }

            const output = payload.output || {};
            const eventType = String(output.event || '').toLowerCase();

            if (eventType === 'gnss_activity') {
                const activity = state.activitySnapshot;
                activity.lastHeartbeatMs = timestampMs;
                activity.hasActivity = Boolean(output.has_activity);
                activity.hasPvt = Boolean(output.has_pvt);
                activity.packetsPerSec = toFiniteNumber(output.udp_packets_per_sec) || 0;
                activity.monitorObsPerSec = toFiniteNumber(output.monitor_observations_per_sec) || 0;
                activity.lossOfLockTotal = toFiniteNumber(output.loss_of_lock_total) || 0;
                activity.lossOfLockDelta = toFiniteNumber(output.loss_of_lock_delta) || 0;
                return;
            }

            const receiver = state.receiverSnapshot;
            const latitude = toFiniteNumber(output.latitude);
            const longitude = toFiniteNumber(output.longitude);
            const altitudeM = toFiniteNumber(output.altitude_m);
            const satellites = toFiniteNumber(output.satellites);
            const hasFixQualityField = output.fix_quality !== undefined
                && output.fix_quality !== null
                && String(output.fix_quality).trim() !== '';
            const isNmea = eventType === 'nmea' || eventType === 'nmea_gga' || eventType === 'nmea_rmc';

            if (latitude !== null) receiver.latitude = latitude;
            if (longitude !== null) receiver.longitude = longitude;
            if (altitudeM !== null) receiver.altitudeM = altitudeM;
            if (satellites !== null) receiver.satellites = satellites;
            if (hasFixQualityField) {
                receiver.fixQuality = String(output.fix_quality).trim();
            }

            if (
                isNmea
                || latitude !== null
                || longitude !== null
                || altitudeM !== null
                || satellites !== null
                || hasFixQualityField
            ) {
                receiver.lastUpdateMs = timestampMs;
            }

            const derivedStatus = getGnssFixStatusFromOutput(output);

            // Track a compact rolling timeline for UI diagnostics.
            if (hasFixQualityField) {
                const qualityValue = toFiniteNumber(output.fix_quality);
                if (qualityValue !== null) {
                    const timeline = state.gnssFixQualityTimeline;
                    const lastPoint = timeline.length > 0 ? timeline[timeline.length - 1] : null;
                    if (
                        !lastPoint
                        || lastPoint.quality !== qualityValue
                        || (timestampMs - lastPoint.timestampMs) >= FIX_QUALITY_TIMELINE_MIN_APPEND_MS
                    ) {
                        timeline.push({
                            timestampMs,
                            quality: qualityValue,
                        });
                    }

                    const cutoffMs = timestampMs - FIX_QUALITY_TIMELINE_WINDOW_MS;
                    while (timeline.length > 0 && timeline[0].timestampMs < cutoffMs) {
                        timeline.shift();
                    }
                    if (timeline.length > FIX_QUALITY_TIMELINE_MAX_POINTS) {
                        timeline.splice(0, timeline.length - FIX_QUALITY_TIMELINE_MAX_POINTS);
                    }
                }
            }

            if (!derivedStatus) {
                return;
            }

            const lifecycle = state.gnssFixLifecycle;
            lifecycle.lastSignalAtMs = timestampMs;

            if (derivedStatus === lifecycle.currentStatus) {
                return;
            }

            if (derivedStatus === 'FIX') {
                lifecycle.currentStatus = 'FIX';
                lifecycle.currentFixStartedAtMs = timestampMs;
                lifecycle.lastFixAcquiredAtMs = timestampMs;
                return;
            }

            if (lifecycle.currentStatus === 'FIX' && lifecycle.currentFixStartedAtMs !== null) {
                lifecycle.lastClosedFixAcquiredAtMs = lifecycle.currentFixStartedAtMs;
                lifecycle.lastFixDurationMs = Math.max(0, timestampMs - lifecycle.currentFixStartedAtMs);
            }
            lifecycle.currentStatus = 'NO FIX';
            lifecycle.currentFixStartedAtMs = null;
            lifecycle.lastFixLostAtMs = timestampMs;
        },
    },
});

export const {
    setDecodedInsightsActiveTab,
    setGnssSatellitesSortModel,
    resetGnssFixLifecycle,
    updateGnssFixLifecycleFromOutput,
} = gnssSlice.actions;

export default gnssSlice.reducer;
