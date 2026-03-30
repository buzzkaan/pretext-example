export const DEFAULT_PROFILE = [
  { width: 0.16, offset: 0 },
  { width: 0.2, offset: 0 },
  { width: 0.26, offset: 0 },
  { width: 0.34, offset: 0 },
  { width: 0.44, offset: 0 },
  { width: 0.5, offset: 0 },
  { width: 0.47, offset: 0 },
  { width: 0.38, offset: 0 },
  { width: 0.28, offset: 0 },
  { width: 0.2, offset: 0 },
];

function normalizeBand(band) {
  return typeof band === 'number' ? { width: band, offset: 0 } : band;
}

export function profileBandIndex(profile, normalizedY) {
  const clamped = Math.max(0, Math.min(0.999999, normalizedY));
  return Math.min(profile.length - 1, Math.floor(clamped * profile.length));
}

export function sampleProfileWidth(profile, normalizedY) {
  return normalizeBand(profile[profileBandIndex(profile, normalizedY)]).width;
}

export function sampleProfileBand(profile, normalizedY) {
  return normalizeBand(profile[profileBandIndex(profile, normalizedY)]);
}
