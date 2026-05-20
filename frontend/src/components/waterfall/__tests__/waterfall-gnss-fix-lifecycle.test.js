import { describe, expect, it } from 'vitest';
import reducer, { resetGnssFixLifecycle, updateGnssFixLifecycleFromOutput } from '../gnss-slice.jsx';

describe('waterfall gnss fix lifecycle', () => {
    it('accepts backend-authored gnss_fix_status for fix transitions', () => {
        let state = reducer(undefined, { type: '@@INIT' });

        state = reducer(state, updateGnssFixLifecycleFromOutput({
            decoder_type: 'gnss',
            timestamp: 100,
            output: {
                gnss_fix_status: 'FIX',
            },
        }));

        expect(state.gnssFixLifecycle.currentStatus).toBe('FIX');
        expect(state.gnssFixLifecycle.currentFixStartedAtMs).toBe(100_000);
        expect(state.gnssFixLifecycle.lastFixAcquiredAtMs).toBe(100_000);

        state = reducer(state, updateGnssFixLifecycleFromOutput({
            decoder_type: 'gnss',
            timestamp: 106,
            output: {
                gnss_fix_status: 'NO FIX',
            },
        }));

        expect(state.gnssFixLifecycle.currentStatus).toBe('NO FIX');
        expect(state.gnssFixLifecycle.currentFixStartedAtMs).toBeNull();
        expect(state.gnssFixLifecycle.lastClosedFixAcquiredAtMs).toBe(100_000);
        expect(state.gnssFixLifecycle.lastFixLostAtMs).toBe(106_000);
        expect(state.gnssFixLifecycle.lastFixDurationMs).toBe(6_000);
    });

    it('resets lifecycle to NO DATA for a new streaming session', () => {
        let state = reducer(undefined, { type: '@@INIT' });
        state = reducer(state, updateGnssFixLifecycleFromOutput({
            decoder_type: 'gnss',
            timestamp: 100,
            output: {
                gnss_fix_status: 'FIX',
            },
        }));

        expect(state.gnssFixLifecycle.currentStatus).toBe('FIX');
        expect(state.gnssFixLifecycle.currentFixStartedAtMs).toBe(100_000);

        state = reducer(state, resetGnssFixLifecycle());
        expect(state.gnssFixLifecycle).toEqual({
            currentStatus: 'NO DATA',
            currentFixStartedAtMs: null,
            lastFixAcquiredAtMs: null,
            lastClosedFixAcquiredAtMs: null,
            lastFixLostAtMs: null,
            lastFixDurationMs: null,
            lastSignalAtMs: null,
        });
        expect(state.gnssFixQualityTimeline).toEqual([]);
    });

    it('keeps previous closed-fix acquisition after a new fix starts', () => {
        let state = reducer(undefined, { type: '@@INIT' });

        // First fix acquisition.
        state = reducer(state, updateGnssFixLifecycleFromOutput({
            decoder_type: 'gnss',
            timestamp: 100,
            output: { gnss_fix_status: 'FIX' },
        }));

        // First fix lost.
        state = reducer(state, updateGnssFixLifecycleFromOutput({
            decoder_type: 'gnss',
            timestamp: 106,
            output: { gnss_fix_status: 'NO FIX' },
        }));

        // New fix acquired again.
        state = reducer(state, updateGnssFixLifecycleFromOutput({
            decoder_type: 'gnss',
            timestamp: 120,
            output: { gnss_fix_status: 'FIX' },
        }));

        expect(state.gnssFixLifecycle.currentStatus).toBe('FIX');
        expect(state.gnssFixLifecycle.currentFixStartedAtMs).toBe(120_000);
        expect(state.gnssFixLifecycle.lastFixAcquiredAtMs).toBe(120_000);
        // Previous closed-fix acquisition remains the first one.
        expect(state.gnssFixLifecycle.lastClosedFixAcquiredAtMs).toBe(100_000);
    });

    it('stores receiver snapshot independently from decoders output history', () => {
        let state = reducer(undefined, { type: '@@INIT' });

        state = reducer(state, updateGnssFixLifecycleFromOutput({
            decoder_type: 'gnss',
            timestamp: 200,
            output: {
                event: 'nmea_gga',
                latitude: 40.1,
                longitude: 22.9,
                altitude_m: 170.5,
                fix_quality: '5',
                satellites: 9,
                gnss_fix_status: 'FIX',
            },
        }));

        state = reducer(state, updateGnssFixLifecycleFromOutput({
            decoder_type: 'gnss',
            timestamp: 201,
            output: {
                event: 'tracking',
                message: 'TRACKING G12',
            },
        }));

        expect(state.receiverSnapshot.latitude).toBe(40.1);
        expect(state.receiverSnapshot.longitude).toBe(22.9);
        expect(state.receiverSnapshot.altitudeM).toBe(170.5);
        expect(state.receiverSnapshot.fixQuality).toBe('5');
        expect(state.receiverSnapshot.satellites).toBe(9);
        expect(state.receiverSnapshot.lastUpdateMs).toBe(200_000);
    });

    it('treats gnss_activity as transport telemetry, not fix evidence', () => {
        let state = reducer(undefined, { type: '@@INIT' });

        state = reducer(state, updateGnssFixLifecycleFromOutput({
            decoder_type: 'gnss',
            timestamp: 300,
            output: {
                event: 'gnss_activity',
                gnss_fix_status: 'FIX',
                has_pvt: true,
                udp_packets_per_sec: 1500,
            },
        }));

        expect(state.gnssFixLifecycle.currentStatus).toBe('NO DATA');
        expect(state.activitySnapshot.lastHeartbeatMs).toBe(300_000);
        expect(state.activitySnapshot.packetsPerSec).toBe(1500);
    });

    it('tracks a rolling 30-minute fix-quality timeline', () => {
        let state = reducer(undefined, { type: '@@INIT' });

        state = reducer(state, updateGnssFixLifecycleFromOutput({
            decoder_type: 'gnss',
            timestamp: 100,
            output: {
                event: 'nmea_gga',
                fix_quality: '5',
            },
        }));
        expect(state.gnssFixQualityTimeline).toEqual([
            { timestampMs: 100_000, quality: 5 },
        ]);

        // Same quality within the minimum append interval should not add a duplicate point.
        state = reducer(state, updateGnssFixLifecycleFromOutput({
            decoder_type: 'gnss',
            timestamp: 105,
            output: {
                event: 'nmea_gga',
                fix_quality: '5',
            },
        }));
        expect(state.gnssFixQualityTimeline).toHaveLength(1);

        // Different quality is always appended.
        state = reducer(state, updateGnssFixLifecycleFromOutput({
            decoder_type: 'gnss',
            timestamp: 106,
            output: {
                event: 'nmea_gga',
                fix_quality: '4',
            },
        }));
        expect(state.gnssFixQualityTimeline).toHaveLength(2);

        // Move beyond 30m and ensure old points are pruned.
        state = reducer(state, updateGnssFixLifecycleFromOutput({
            decoder_type: 'gnss',
            timestamp: 2000,
            output: {
                event: 'nmea_gga',
                fix_quality: '3',
            },
        }));
        expect(state.gnssFixQualityTimeline).toEqual([
            { timestampMs: 2_000_000, quality: 3 },
        ]);
    });
});
