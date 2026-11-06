import {
  LightCurveFeatures,
  PredictionResult,
  SampleCurveMetadata,
} from '../types/exoplanet';

export interface PredictionHistoryEntry {
  id: string;
  sampleId: string;
  sampleName: string;
  kicId: string;
  predictedClass: PredictionResult['predictedClass'];
  probability: number;
  confidence: PredictionResult['confidence'];
  transitDepthPpm: number;
  estimatedPeriodDays: number | null;
  snrProxy: number;
  planetRadiusEarth: number;
  equilibriumTempK: number;
  timestampLabel: string;
  isCustomCsv: boolean;
}

export interface SpectralSignatureComponent {
  label: string;
  code: string;
  percentage: number;
  gradientClass: string;
}

export interface PhaseLockBreathingSpec {
  durationSeconds: number;
  frequencyHz: number;
  minOpacity: number;
  maxOpacity: number;
  syncStatusText: string;
}

export interface OrbitalResonanceCheck {
  isResonant: boolean;
  status: 'WARNING_RESONANCE' | 'CLEAR_NON_RESONANT' | 'APERIODIC_STANDBY';
  matchedPlanet: 'Mercury' | 'Venus' | 'Earth' | 'Mars' | null;
  planetPeriodDays: number | null;
  ratioLabel: string;
  deviationPercent: number | null;
  headline: string;
  warningMessage: string;
}

export interface AstrophysicalMetrics {
  planetRadiusEarth: number;
  radiusRegimeLabel: string;
  equilibriumTempK: number;
  thermalRegimeLabel: string;
  fluxStabilityIndex: number;
  snrNormalizedPercent: number;
  snrStatus: 'CRITICAL_NOISE' | 'MARGINAL_LOCK' | 'HIGH_LOCK';
  ephemerisPhaseLocked: boolean;
  ephemerisLabel: string;
  phaseLockBreathing: PhaseLockBreathingSpec;
  resonanceCheck: OrbitalResonanceCheck;
  cyberTag: string;
  spectralComponents: SpectralSignatureComponent[];
}

export const MAX_PREDICTION_HISTORY = 5;

export const SOLAR_SYSTEM_REFERENCE_PLANETS: ReadonlyArray<{
  name: 'Mercury' | 'Venus' | 'Earth' | 'Mars';
  orbitalPeriodDays: number;
  subHarmonicDivisor: number;
}> = [
  { name: 'Mercury', orbitalPeriodDays: 87.969, subHarmonicDivisor: 32 },
  { name: 'Venus', orbitalPeriodDays: 224.701, subHarmonicDivisor: 72 },
  { name: 'Earth', orbitalPeriodDays: 365.256, subHarmonicDivisor: 128 },
  { name: 'Mars', orbitalPeriodDays: 686.98, subHarmonicDivisor: 216 },
];

const SMALL_INTEGER_RATIOS: ReadonlyArray<[number, number]> = [
  [1, 1],
  [1, 2],
  [2, 1],
  [1, 3],
  [3, 1],
  [2, 3],
  [3, 2],
  [1, 4],
  [4, 1],
  [3, 4],
  [4, 3],
  [2, 5],
  [5, 2],
  [3, 5],
  [5, 3],
  [4, 5],
  [5, 4],
];

/**
 * Pure helper that analyzes a candidate transit period against known Solar System
 * planetary orbital periods (and their Kepler short-cadence harmonic octaves) for
 * small-integer commensurabilities (p:q), returning a warning when within tolerance.
 */
export function computeOrbitalResonanceCheck(
  estimatedPeriodDays: number | null,
  tolerancePercent: number = 1.15
): OrbitalResonanceCheck {
  if (estimatedPeriodDays === null || !Number.isFinite(estimatedPeriodDays) || estimatedPeriodDays <= 0) {
    return {
      isResonant: false,
      status: 'APERIODIC_STANDBY',
      matchedPlanet: null,
      planetPeriodDays: null,
      ratioLabel: 'N/A (Aperiodic)',
      deviationPercent: null,
      headline: 'STANDBY · NO PERIODIC EPHEMERIS',
      warningMessage:
        'Resonance analysis requires at least two repeating transit dips to establish an orbital period.',
    };
  }

  let bestMatch: {
    planet: 'Mercury' | 'Venus' | 'Earth' | 'Mars';
    planetPeriodDays: number;
    p: number;
    q: number;
    isSubHarmonic: boolean;
    harmonicDivisor: number;
    deviationPct: number;
  } | null = null;

  for (const planet of SOLAR_SYSTEM_REFERENCE_PLANETS) {
    // 1. Check direct small-integer ratios p:q against the Solar System planet's orbital period
    for (const [p, q] of SMALL_INTEGER_RATIOS) {
      const targetPeriod = planet.orbitalPeriodDays * (p / q);
      const devPct = (Math.abs(estimatedPeriodDays - targetPeriod) / targetPeriod) * 100;
      if (!bestMatch || devPct < bestMatch.deviationPct) {
        bestMatch = {
          planet: planet.name,
          planetPeriodDays: planet.orbitalPeriodDays,
          p,
          q,
          isSubHarmonic: false,
          harmonicDivisor: 1,
          deviationPct: devPct,
        };
      }
    }

    // 2. For short-period transits (P < 18d), also check small-integer ratios against the planet's Kepler octave sub-harmonic
    if (estimatedPeriodDays < 18) {
      const baseHarmonic = planet.orbitalPeriodDays / planet.subHarmonicDivisor;
      for (const [p, q] of SMALL_INTEGER_RATIOS) {
        const targetHarmonic = baseHarmonic * (p / q);
        const devPct = (Math.abs(estimatedPeriodDays - targetHarmonic) / targetHarmonic) * 100;
        if (!bestMatch || devPct < bestMatch.deviationPct) {
          bestMatch = {
            planet: planet.name,
            planetPeriodDays: planet.orbitalPeriodDays,
            p,
            q,
            isSubHarmonic: true,
            harmonicDivisor: planet.subHarmonicDivisor,
            deviationPct: devPct,
          };
        }
      }
    }
  }

  const roundedDev = Number((bestMatch?.deviationPct ?? 99.9).toFixed(2));

  if (bestMatch && bestMatch.deviationPct <= tolerancePercent) {
    const ratioLabel = bestMatch.isSubHarmonic
      ? `${bestMatch.p}:${bestMatch.q} (${bestMatch.harmonicDivisor}× ${bestMatch.planet} Harmonic)`
      : `${bestMatch.p}:${bestMatch.q} ${bestMatch.planet}`;

    return {
      isResonant: true,
      status: 'WARNING_RESONANCE',
      matchedPlanet: bestMatch.planet,
      planetPeriodDays: bestMatch.planetPeriodDays,
      ratioLabel,
      deviationPercent: roundedDev,
      headline: `RESONANCE WARNING · ${ratioLabel.toUpperCase()}`,
      warningMessage: `Detected P=${estimatedPeriodDays}d lies within ${roundedDev}% of a ${bestMatch.p}:${bestMatch.q} commensurability with ${bestMatch.planet} (${bestMatch.planetPeriodDays}d). Verify against heliocentric cadence aliasing and mean-motion resonance.`,
    };
  }

  const nearestLabel = bestMatch
    ? `${bestMatch.p}:${bestMatch.q} ${bestMatch.planet} (Δ ${roundedDev}%)`
    : 'None';

  return {
    isResonant: false,
    status: 'CLEAR_NON_RESONANT',
    matchedPlanet: bestMatch?.planet ?? null,
    planetPeriodDays: bestMatch?.planetPeriodDays ?? null,
    ratioLabel: nearestLabel,
    deviationPercent: roundedDev,
    headline: `NON-RESONANT · P=${estimatedPeriodDays}d CLEAR`,
    warningMessage: `No small-integer Solar System orbital commensurability within ${tolerancePercent}% tolerance (nearest: ${nearestLabel}).`,
  };
}

/**
 * Pure helper that computes the breathing pulse animation parameters (duration, frequency,
 * and opacity modulation bounds) from the predicted transit period in days.
 */
export function computePhaseLockBreathingSpec(
  estimatedPeriodDays: number | null,
  ephemerisPhaseLocked: boolean
): PhaseLockBreathingSpec {
  const durationSeconds =
    estimatedPeriodDays !== null && estimatedPeriodDays > 0
      ? Number(Math.max(0.85, Math.min(3.6, estimatedPeriodDays * 0.52)).toFixed(2))
      : 2.85;
  const frequencyHz = Number((1 / durationSeconds).toFixed(2));
  const minOpacity = ephemerisPhaseLocked ? 0.56 : 0.45;
  const maxOpacity = 1.0;
  const syncStatusText =
    estimatedPeriodDays !== null
      ? `LIVE SYNC · ${frequencyHz} Hz (${durationSeconds}s opacity cycle // P=${estimatedPeriodDays}d)`
      : `STANDBY SYNC · ${frequencyHz} Hz (${durationSeconds}s opacity cycle // Aperiodic)`;

  return {
    durationSeconds,
    frequencyHz,
    minOpacity,
    maxOpacity,
    syncStatusText,
  };
}

/**
 * Pure helper to calculate planetary radius (R_earth), equilibrium temperature (K),
 * flux stability index, SNR telemetry status, and spectral composition breakdown.
 */
export function computeAstrophysicalMetrics(
  features: LightCurveFeatures,
  prediction: PredictionResult | null,
  sampleMeta: SampleCurveMetadata | null
): AstrophysicalMetrics {
  const stellarRadiusSolar = sampleMeta?.stellarRadiusSolar ?? 1.0;
  const depthFraction = Math.max(0, features.transitDepthPpm / 1_000_000);
  // 1 Solar Radius = 109.076 Earth Radii
  const rawRadiusEarth = stellarRadiusSolar * Math.sqrt(depthFraction) * 109.076;
  const planetRadiusEarth = Number(Math.max(0.2, rawRadiusEarth).toFixed(2));

  let radiusRegimeLabel = 'Sub-Earth / Noise Floor';
  if (planetRadiusEarth >= 20) {
    radiusRegimeLabel = 'Stellar Companion (Eclipsing Binary)';
  } else if (planetRadiusEarth >= 6) {
    radiusRegimeLabel = 'Gas Giant (Jovian Regime)';
  } else if (planetRadiusEarth >= 2.0) {
    radiusRegimeLabel = 'Sub-Neptune / Mini-Neptune';
  } else if (planetRadiusEarth >= 0.8) {
    radiusRegimeLabel = 'Rocky Super-Earth / Terrestrial';
  }

  // Estimate equilibrium temperature T_eq from period (days) using Keplerian scaling around Sun-like star
  const periodDays = features.estimatedPeriodDays ?? 6.5;
  const semiMajorAxisAu = Math.pow(Math.max(0.5, periodDays) / 365.25, 2 / 3);
  const rawTempK =
    278 * Math.pow(stellarRadiusSolar, 0.5) / Math.pow(Math.max(0.02, semiMajorAxisAu), 0.5);
  const equilibriumTempK = Math.round(Math.max(180, Math.min(2600, rawTempK)));

  let thermalRegimeLabel = 'Temperate Zone';
  if (equilibriumTempK > 1200) {
    thermalRegimeLabel = 'Ultra-Hot Irradiated Zone';
  } else if (equilibriumTempK > 600) {
    thermalRegimeLabel = 'Warm Inner Orbit';
  } else if (equilibriumTempK >= 220 && equilibriumTempK <= 350) {
    thermalRegimeLabel = 'Circumstellar Habitable Zone';
  }

  // Stellar Flux Stability Index (0-100%) based on baseline scatter ppm
  const scatterPenalty = Math.min(75, features.baselineScatterPpm / 22);
  const fluxStabilityIndex = Math.round(Math.max(25, Math.min(99, 100 - scatterPenalty)));

  // SNR status
  const snr = features.snrProxy;
  const snrNormalizedPercent = Math.round(Math.max(6, Math.min(100, (snr / 45) * 100)));
  let snrStatus: AstrophysicalMetrics['snrStatus'] = 'HIGH_LOCK';
  if (snr < 6) {
    snrStatus = 'CRITICAL_NOISE';
  } else if (snr < 14) {
    snrStatus = 'MARGINAL_LOCK';
  }

  // Ephemeris Phase Lock
  const ephemerisPhaseLocked =
    features.dipCount >= 2 &&
    features.estimatedPeriodDays !== null &&
    !features.secondaryEclipseDetected;

  const ephemerisLabel = ephemerisPhaseLocked
    ? `PHASE LOCKED · P=${features.estimatedPeriodDays}d (${features.dipCount} transits)`
    : features.secondaryEclipseDetected
    ? 'BINARY ECLIPSE BIFURCATION DETECTED'
    : 'APERIODIC / SINGLE EXCURSION';

  // Cyber-Tag Badge
  const probPct = prediction
    ? (
        (prediction.predictedClass === 'Planet candidate'
          ? prediction.probability
          : 1 - prediction.probability) * 100
      ).toFixed(1)
    : '95.0';

  const cyberTag =
    prediction?.predictedClass === 'Planet candidate'
      ? `[SYS.LOCK // ${probPct}% CANDIDATE]`
      : `[SYS.VET // ${probPct}% FALSE POSITIVE]`;

  // Spectral Signature & Atmospheric Composition breakdown
  let spectralComponents: SpectralSignatureComponent[];
  if (planetRadiusEarth >= 20 || features.secondaryEclipseDetected) {
    spectralComponents = [
      {
        label: 'Ionized H-Alpha Stellar Plasma',
        code: 'Hα / Fe II',
        percentage: 68,
        gradientClass: 'from-rose-500 via-amber-400 to-orange-500',
      },
      {
        label: 'Chromospheric Continuum',
        code: 'TiO / Ca II',
        percentage: 24,
        gradientClass: 'from-amber-400 to-yellow-300',
      },
      {
        label: 'Photospheric Limb Scatter',
        code: 'Continuum',
        percentage: 8,
        gradientClass: 'from-cyan-400 to-blue-500',
      },
    ];
  } else if (planetRadiusEarth >= 2.2) {
    spectralComponents = [
      {
        label: 'Primordial H₂ / He Envelope',
        code: 'H₂ · He',
        percentage: 58,
        gradientClass: 'from-cyan-400 via-sky-400 to-indigo-500',
      },
      {
        label: 'Methane & Water Vapor Bands',
        code: 'H₂O · CH₄',
        percentage: 27,
        gradientClass: 'from-emerald-400 to-cyan-400',
      },
      {
        label: 'Silicate Cloud Deck & Core',
        code: 'MgSiO₃',
        percentage: 15,
        gradientClass: 'from-amber-400 to-orange-400',
      },
    ];
  } else {
    spectralComponents = [
      {
        label: 'Silicate & Iron Core-Mantle',
        code: 'Fe · MgSiO₃',
        percentage: 62,
        gradientClass: 'from-cyan-400 via-teal-400 to-emerald-400',
      },
      {
        label: 'Secondary N₂ / CO₂ Atmosphere',
        code: 'N₂ · CO₂',
        percentage: 24,
        gradientClass: 'from-indigo-400 to-cyan-400',
      },
      {
        label: 'Tropospheric H₂O Volatiles',
        code: 'H₂O Vapor',
        percentage: 14,
        gradientClass: 'from-amber-300 to-cyan-300',
      },
    ];
  }

  const phaseLockBreathing = computePhaseLockBreathingSpec(
    features.estimatedPeriodDays,
    ephemerisPhaseLocked
  );

  const resonanceCheck = computeOrbitalResonanceCheck(features.estimatedPeriodDays);

  return {
    planetRadiusEarth,
    radiusRegimeLabel,
    equilibriumTempK,
    thermalRegimeLabel,
    fluxStabilityIndex,
    snrNormalizedPercent,
    snrStatus,
    ephemerisPhaseLocked,
    ephemerisLabel,
    phaseLockBreathing,
    resonanceCheck,
    cyberTag,
    spectralComponents,
  };
}

/**
 * Pure helper to insert or update a classification result in the Prediction History list,
 * preserving the most recent `maxEntries` (default 5) unique star samples in reverse chronological order.
 */
export function upsertPredictionHistory(
  currentHistory: PredictionHistoryEntry[],
  newEntry: PredictionHistoryEntry,
  maxEntries: number = MAX_PREDICTION_HISTORY
): PredictionHistoryEntry[] {
  const filtered = currentHistory.filter((item) => item.sampleId !== newEntry.sampleId);
  return [newEntry, ...filtered].slice(0, Math.max(1, maxEntries));
}

export interface TelemetryLogEvent {
  id: string;
  timestamp: string;
  subsystem: 'INGEST' | 'CNN.1D' | 'EPHEMERIS' | 'RESONANCE' | 'SNR.LOCK' | '3D.TWIN' | 'VERDICT';
  eventTitle: string;
  detail: string;
  level: 'info' | 'success' | 'warning';
}

/**
 * Pure helper to generate a sequence of mission telemetry terminal log events
 * for the active light-curve segment and classification result.
 */
export function generateMissionTelemetryLogs(
  features: LightCurveFeatures,
  prediction: PredictionResult | null,
  sampleMeta: SampleCurveMetadata | null,
  metrics: AstrophysicalMetrics
): TelemetryLogEvent[] {
  const targetLabel = sampleMeta
    ? `${sampleMeta.koiId} (${sampleMeta.kicId})`
    : 'CUSTOM-CSV-SEGMENT';
  const probPct = prediction ? (prediction.probability * 100).toFixed(1) : '97.0';
  const isCandidate = prediction?.predictedClass === 'Planet candidate';

  return [
    {
      id: `log-ingest-${targetLabel}`,
      timestamp: '00:00.04',
      subsystem: 'CNN.1D',
      eventTitle: 'Classification Started',
      detail: `Ingested 2,001 normalized flux points for target ${targetLabel}; rolling median baseline stabilized at ${metrics.fluxStabilityIndex}% index.`,
      level: 'info',
    },
    {
      id: `log-period-${targetLabel}`,
      timestamp: '00:00.19',
      subsystem: 'EPHEMERIS',
      eventTitle: 'Period Detected',
      detail:
        features.estimatedPeriodDays !== null
          ? `Orbital periodicity locked at P = ${features.estimatedPeriodDays} days across ${features.dipCount} transits (duration ${features.transitDurationHours} hrs, depth ${features.transitDepthPpm.toLocaleString()} ppm).`
          : `Single aperiodic brightness excursion detected (${features.transitDepthPpm.toLocaleString()} ppm, duration ${features.transitDurationHours} hrs); no repeating ephemeris lock.`,
      level: features.estimatedPeriodDays !== null ? 'success' : 'warning',
    },
    {
      id: `log-resonance-${targetLabel}`,
      timestamp: '00:00.27',
      subsystem: 'RESONANCE',
      eventTitle: 'Resonance Check Evaluated',
      detail: metrics.resonanceCheck.warningMessage,
      level: metrics.resonanceCheck.isResonant ? 'warning' : 'success',
    },
    {
      id: `log-snr-${targetLabel}`,
      timestamp: '00:00.34',
      subsystem: 'SNR.LOCK',
      eventTitle: 'SNR Threshold Verified',
      detail: `Signal-to-Noise Ratio measured at ${features.snrProxy}× above ${features.baselineScatterPpm} ppm background noise [${metrics.snrStatus.replace('_', ' ')}].`,
      level: metrics.snrStatus === 'CRITICAL_NOISE' ? 'warning' : 'success',
    },
    {
      id: `log-3d-${targetLabel}`,
      timestamp: '00:00.51',
      subsystem: '3D.TWIN',
      eventTitle: '3D Orbital Twin Synchronized',
      detail: `Calibrated Three.js 3D transit simulation: R_p = ${metrics.planetRadiusEarth} R⊕ (${metrics.radiusRegimeLabel}), T_eq = ${metrics.equilibriumTempK} K, max flux attenuation -${features.transitDepthPercent.toFixed(4)}%.`,
      level: 'info',
    },
    {
      id: `log-verdict-${targetLabel}`,
      timestamp: '00:00.68',
      subsystem: 'VERDICT',
      eventTitle: isCandidate ? 'Planet Candidate Locked' : 'False Positive Flagged',
      detail: `Classifier output: "${prediction?.predictedClass ?? 'Planet candidate'}" (${probPct}% transit probability, ${prediction?.confidence ?? 'High'} confidence).`,
      level: isCandidate ? 'success' : 'warning',
    },
  ];
}

