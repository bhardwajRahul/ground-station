/**
 * @license
 * Copyright (c) 2025 Efstratios Goudelis
 */

import { createSlice, createAsyncThunk } from '@reduxjs/toolkit';

// Async thunks to query backend via unified Socket.IO api.call
export const fetchRuntimeSnapshot = createAsyncThunk(
    'sessions/fetchRuntimeSnapshot',
    async ({ socket, sdr_id = null, session_id = null }) => {
        // Session runtime introspection is intentionally disabled on the backend.
        // Keep this thunk as a no-op so legacy callers do not emit removed commands.
        void socket;
        void sdr_id;
        void session_id;
        return { sessions: {}, sdrs: {} };
    }
);

export const fetchSessionView = createAsyncThunk(
    'sessions/fetchSessionView',
    async ({ socket, session_id }) => {
        // Session view introspection is intentionally disabled on the backend.
        void socket;
        void session_id;
        return null;
    }
);

const initialState = {
    runtimeSnapshot: {
        loading: false,
        error: null,
        data: { sessions: {}, sdrs: {} },
        lastUpdated: null,
    },
    sessionView: {
        loading: false,
        error: null,
        data: null,
    },
};

const sessionsSlice = createSlice({
    name: 'sessions',
    initialState,
    reducers: {
        clearSessionErrors(state) {
            state.runtimeSnapshot.error = null;
            state.sessionView.error = null;
        },
        setRuntimeSnapshot(state, action) {
            // Payload is expected to be the snapshot: { sessions: {}, sdrs: {} }
            state.runtimeSnapshot.data = action.payload || { sessions: {}, sdrs: {} };
            state.runtimeSnapshot.lastUpdated = Date.now();
            state.runtimeSnapshot.loading = false;
            state.runtimeSnapshot.error = null;
        },
    },
    extraReducers: (builder) => {
        builder
            // Snapshot
            .addCase(fetchRuntimeSnapshot.pending, (state) => {
                state.runtimeSnapshot.loading = true;
                state.runtimeSnapshot.error = null;
            })
            .addCase(fetchRuntimeSnapshot.fulfilled, (state, action) => {
                state.runtimeSnapshot.loading = false;
                state.runtimeSnapshot.data = action.payload || { sessions: {}, sdrs: {} };
                state.runtimeSnapshot.lastUpdated = Date.now();
            })
            .addCase(fetchRuntimeSnapshot.rejected, (state, action) => {
                state.runtimeSnapshot.loading = false;
                state.runtimeSnapshot.error = action.payload || 'Failed to fetch runtime snapshot';
            })
            // Session view
            .addCase(fetchSessionView.pending, (state) => {
                state.sessionView.loading = true;
                state.sessionView.error = null;
            })
            .addCase(fetchSessionView.fulfilled, (state, action) => {
                state.sessionView.loading = false;
                state.sessionView.data = action.payload;
            })
            .addCase(fetchSessionView.rejected, (state, action) => {
                state.sessionView.loading = false;
                state.sessionView.error = action.payload || 'Failed to fetch session view';
            });
    }
});

export const { clearSessionErrors, setRuntimeSnapshot } = sessionsSlice.actions;
export default sessionsSlice.reducer;
