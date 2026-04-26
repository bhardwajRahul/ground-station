/**
 * VFO Custom Hooks
 *
 * Reusable hooks for VFO audio state management and event handling
 */

import React from 'react';
import { useSelector } from 'react-redux';
import { useAudio } from '../../dashboard/audio-provider.jsx';
import { selectRunningRigTransmitters } from '../../target/transmitter-selectors.js';

/**
 * Hook to manage VFO audio state (mute, buffer, levels, RF power)
 * @returns {object} Audio state and handlers
 */
export const useVfoAudioState = () => {
    const { setVfoMute } = useAudio();

    // Get persisted mute state from Redux
    const vfoMutedRedux = useSelector(state => state.vfo.vfoMuted || {
        1: false,
        2: false,
        3: false,
        4: false
    });

    // Handle VFO mute toggle
    const handleVfoMuteToggle = (vfoIndex) => {
        const newMutedState = !vfoMutedRedux[vfoIndex];
        // Call audio provider to mute/unmute
        // Backend sends vfo_number as 1-4, which matches our vfoIndex
        if (setVfoMute) {
            setVfoMute(vfoIndex, newMutedState);
        }
    };

    return {
        vfoMuted: vfoMutedRedux,
        handleVfoMuteToggle
    };
};

/**
 * Hook to get VFO decoder information from Redux
 * @returns {object} Decoder info and helper functions
 */
export const useVfoDecoderInfo = () => {
    // Get active decoders from Redux state
    const activeDecoders = useSelector(state => state.decoders.active || {});
    const currentSessionId = useSelector(state => state.decoders.currentSessionId);

    // Get decoder info for a specific VFO (works for both data decoders and transcription)
    const getVFODecoderInfo = (vfoIndex) => {
        if (!currentSessionId || !vfoIndex) return null;
        const decoderKey = `${currentSessionId}_vfo${vfoIndex}`;
        return activeDecoders[decoderKey] || null;
    };

    return {
        getVFODecoderInfo,
        activeDecoders,
        currentSessionId
    };
};

/**
 * Hook to handle wheel events on VFO sliders
 * @param {object} vfoMarkers - VFO marker configurations
 * @param {object} vfoActive - Active state of VFOs
 * @param {function} onVFOPropertyChange - Property change handler
 */
export const useVfoWheelHandlers = (vfoMarkers, vfoActive, onVFOPropertyChange) => {
    React.useEffect(() => {
        const handleWheel = (e, vfoIndex, property, min, max, current) => {
            // Check if VFO is active before processing wheel event
            if (!vfoActive[vfoIndex]) {
                return;
            }
            e.preventDefault();
            const delta = e.deltaY > 0 ? -1 : 1;
            const newValue = Math.max(min, Math.min(max, current + delta));
            onVFOPropertyChange(vfoIndex, { [property]: newValue });
        };

        const squelchElements = document.querySelectorAll('[data-slider="squelch"]');
        const volumeElements = document.querySelectorAll('[data-slider="volume"]');

        squelchElements.forEach((el) => {
            const vfoIndex = parseInt(el.getAttribute('data-vfo-index'));
            const listener = (e) => handleWheel(e, vfoIndex, 'squelch', -150, 0, vfoMarkers[vfoIndex]?.squelch || -150);
            el.addEventListener('wheel', listener, { passive: false });
            el._wheelListener = listener;
        });

        volumeElements.forEach((el) => {
            const vfoIndex = parseInt(el.getAttribute('data-vfo-index'));
            const listener = (e) => handleWheel(e, vfoIndex, 'volume', 0, 100, vfoMarkers[vfoIndex]?.volume || 50);
            el.addEventListener('wheel', listener, { passive: false });
            el._wheelListener = listener;
        });

        return () => {
            squelchElements.forEach((el) => {
                if (el._wheelListener) {
                    el.removeEventListener('wheel', el._wheelListener);
                }
            });
            volumeElements.forEach((el) => {
                if (el._wheelListener) {
                    el.removeEventListener('wheel', el._wheelListener);
                }
            });
        };
    }, [vfoMarkers, vfoActive, onVFOPropertyChange]);
};

/**
 * Hook to get satellite and transmitter data from Redux
 * @returns {object} Satellite and transmitter data
 */
export const useVfoSatelliteData = () => {
    // Get doppler-corrected transmitters from all running tracker views.
    const transmitters = useSelector(selectRunningRigTransmitters);

    // Get target satellite data
    const satelliteDetails = useSelector(state => state.targetSatTrack.satelliteData?.details || null);
    const satelliteTransmitters = useSelector(state => state.targetSatTrack.satelliteData?.transmitters || []);
    const targetSatelliteName = satelliteDetails?.name || '';

    // Combine details and transmitters for the TransmittersTable component
    const targetSatelliteData = satelliteDetails ? {
        ...satelliteDetails,
        transmitters: satelliteTransmitters
    } : null;

    return {
        transmitters,
        satelliteDetails,
        satelliteTransmitters,
        targetSatelliteName,
        targetSatelliteData
    };
};

/**
 * Hook to get VFO streaming and mute state from Redux
 * @returns {object} Streaming and mute state
 */
export const useVfoStreamingState = () => {
    // Get streaming VFOs from Redux state (array of currently streaming VFO numbers)
    const streamingVFOs = useSelector(state => state.vfo.streamingVFOs);

    // Get muted VFOs from Redux state
    const vfoMutedRedux = useSelector(state => state.vfo.vfoMuted || {});

    return {
        streamingVFOs,
        vfoMutedRedux
    };
};
