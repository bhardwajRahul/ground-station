import React from 'react';
import { Box } from '@mui/material';

const BASE_URL = '/body-icons';

const BODY_ICON_FILE_BY_ID = Object.freeze({
    sun: 'sun-sphere-icon.png',
    mercury: 'mercury-sphere-icon.png',
    venus: 'venus-sphere-icon.png',
    earth: 'earth-sphere-icon.png',
    moon: 'moon-sphere-icon.png',
    mars: 'mars-sphere-icon.png',
    jupiter: 'jupiter-sphere-icon.png',
    io: 'io-sphere-icon.png',
    europa: 'europa-sphere-icon.png',
    ganymede: 'ganymede-sphere-icon.png',
    callisto: 'callisto-sphere-icon.png',
    saturn: 'saturn-sphere-icon.png',
    mimas: 'mimas-sphere-icon.png',
    enceladus: 'enceladus-sphere-icon.png',
    tethys: 'tethys-sphere-icon.png',
    dione: 'dione-sphere-icon.png',
    rhea: 'rhea-sphere-icon.png',
    iapetus: 'iapetus-sphere-icon.png',
    uranus: 'uranus-sphere-icon.png',
    neptune: 'neptune-sphere-icon.png',
    ceres: 'ceres-sphere-icon.png',
    haumea: 'haumea-sphere-icon.png',
    makemake: 'makemake-sphere-icon.png',
    eris: 'eris-sphere-icon.png',
    'venus-surface': 'venus-surface-sphere-icon.png',
});

const BODY_ALIASES = Object.freeze({
    sol: 'sun',
    luna: 'moon',
});

const resolvePreset = (size) => {
    if (size === 'full') return '256';
    const numericSize = Number(size);
    if (!Number.isFinite(numericSize)) return '64';
    if (numericSize <= 64) return '64';
    if (numericSize <= 128) return '128';
    return '256';
};

const normalizeBodyId = (value) => {
    const key = String(value || '')
        .trim()
        .toLowerCase()
        .replace(/^body:/, '')
        .replace(/[_\s]+/g, '-');
    return BODY_ALIASES[key] || key;
};

const resolveIconPath = (bodyId, size) => {
    const normalized = normalizeBodyId(bodyId);
    const filename = BODY_ICON_FILE_BY_ID[normalized] || BODY_ICON_FILE_BY_ID.moon;
    return `${BASE_URL}/${resolvePreset(size)}/${filename}`;
};

const BodyIcon = ({
    targetType = 'body',
    bodyId = '',
    size = 24,
    alt = 'body icon',
    sx = {},
}) => {
    if (String(targetType || '').toLowerCase() !== 'body') return null;

    const path = resolveIconPath(bodyId, size);
    const iconSize = Number.isFinite(Number(size)) ? Number(size) : 24;

    return (
        <Box
            component="img"
            src={path}
            alt={alt}
            loading="lazy"
            sx={{
                width: iconSize,
                height: iconSize,
                borderRadius: '50%',
                objectFit: 'cover',
                flexShrink: 0,
                ...sx,
            }}
        />
    );
};

export default React.memo(BodyIcon);
