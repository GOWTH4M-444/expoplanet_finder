import { RawLightCurvePoint, SampleCurveMetadata } from '../types/exoplanet';

export const BUILTIN_SAMPLE_METADATA: SampleCurveMetadata[] = [
  {
    id: 'confirmed-planet',
    name: 'Confirmed Planet Transit',
    kicId: 'KIC 11904151',
    koiId: 'KOI-72.01 (Kepler-10b)',
    category: 'confirmed_planet',
    isConfirmedPlanet: true,
    dispositionLabel: 'Confirmed Exoplanet (NASA Vetted)',
    shortDescription:
      'Steady, repeating U-shaped brightness dips (~0.17% drop every 2.8 days) with a flat bottom and clean edges as the planet crosses in front of its star.',
    stellarMagnitude: 10.96,
    stellarRadiusSolar: 1.06,
  },
  {
    id: 'eclipsing-binary',
    name: 'Eclipsing Binary',
    kicId: 'KIC 8462852',
    koiId: 'KOI-1452.01 (False Positive)',
    category: 'eclipsing_binary',
    isConfirmedPlanet: false,
    dispositionLabel: 'False Positive — Two Orbiting Stars',
    shortDescription:
      'Deep, steep V-shaped dips (~2.6% brightness drop) alternating with smaller secondary dips (~0.75% drop) caused by two stars eclipsing each other.',
    stellarMagnitude: 12.42,
    stellarRadiusSolar: 1.31,
  },
  {
    id: 'noisy-transit',
    name: 'Noisy Transit',
    kicId: 'KIC 7603200',
    koiId: 'KOI-314.02',
    category: 'noisy_transit',
    isConfirmedPlanet: false,
    dispositionLabel: 'Planet Candidate (High Starlight Jitter)',
    shortDescription:
      'Repeating planet-sized brightness dips (~0.21% drop) partially hidden inside natural starlight flicker and slow starspot waves.',
    stellarMagnitude: 13.85,
    stellarRadiusSolar: 0.54,
  },
  {
    id: 'flat-no-transit',
    name: 'Flat / No Transit',
    kicId: 'KIC 5184732',
    koiId: 'Quiet Reference Star',
    category: 'flat_no_transit',
    isConfirmedPlanet: false,
    dispositionLabel: 'No Transit Signal Detected',
    shortDescription:
      'Steady starlight baseline with gentle telescope drift and normal camera sensor noise, but zero repeating planetary dips.',
    stellarMagnitude: 11.45,
    stellarRadiusSolar: 1.02,
  },
  {
    id: 'instrumental-artifact',
    name: 'Instrumental Artifact',
    kicId: 'KIC 7582680',
    koiId: 'Spacecraft Thruster Glitch',
    category: 'instrumental_artifact',
    isConfirmedPlanet: false,
    dispositionLabel: 'False Positive — Telescope Glitch',
    shortDescription:
      'A single, lopsided sudden brightness drop followed by a slow recovery Curve caused by a spacecraft steering thruster firing or camera pixel reset.',
    stellarMagnitude: 12.78,
    stellarRadiusSolar: 0.96,
  },
  {
    id: 'unknown-candidate',
    name: 'Unknown Candidate',
    kicId: 'KIC 11804465',
    koiId: 'KOI-4878.01 (Unconfirmed)',
    category: 'unknown_candidate',
    isConfirmedPlanet: false,
    dispositionLabel: 'Unvetted Candidate — Needs Follow-Up',
    shortDescription:
      'Shallow (~0.12% drop) repeating dips across two orbits; a promising Earth-sized candidate that still needs ground telescope follow-up to confirm.',
    stellarMagnitude: 13.12,
    stellarRadiusSolar: 0.98,
  },
];

/**
 * Deterministic pseudo-random normal generator (Box-Muller with seeded LCG)
 * so built-in demo curves are 100% reproducible across server and client.
 */
function createSeededNoise(seedStart: number) {
  let seed = seedStart % 2147483647;
  if (seed <= 0) seed += 2147483646;
  const nextUniform = () => {
    seed = (seed * 16807) % 2147483647;
    return (seed - 1) / 2147483646;
  };
  return () => {
    const u1 = Math.max(1e-7, nextUniform());
    const u2 = nextUniform();
    return Math.sqrt(-2.0 * Math.log(u1)) * Math.cos(2.0 * Math.PI * u2);
  };
}

/**
 * Generates a realistic U-shaped planetary transit profile with limb-darkened ingress/egress.
 */
function planetaryTransitDip(phaseOffsetDays: number, halfDurationDays: number, depth: number): number {
  const absDt = Math.abs(phaseOffsetDays);
  if (absDt >= halfDurationDays) return 0;
  const normalizedPos = absDt / halfDurationDays; // 0 at center, 1 at edge
  if (normalizedPos <= 0.62) {
    // Flat-bottomed with subtle limb darkening curvature
    const inner = normalizedPos / 0.62;
    return -depth * (1 - 0.08 * inner * inner);
  }
  // Smooth cosine ingress/egress between 0.62 and 1.0
  const edgeFrac = (normalizedPos - 0.62) / 0.38;
  return -depth * 0.92 * 0.5 * (1 + Math.cos(Math.PI * edgeFrac));
}

/**
 * Generates a steep V-shaped eclipsing binary dip.
 */
function binaryEclipseDip(phaseOffsetDays: number, halfDurationDays: number, depth: number): number {
  const absDt = Math.abs(phaseOffsetDays);
  if (absDt >= halfDurationDays) return 0;
  const frac = 1 - absDt / halfDurationDays;
  return -depth * Math.pow(frac, 1.35);
}

/**
 * Generates deterministic RawLightCurvePoint[] (and CSV representation) for any of the 6 demo samples.
 */
export function generateDemoLightCurvePoints(sampleId: string): RawLightCurvePoint[] {
  const numPoints = 960; // ~10 days of 15-min resampled Kepler cadence
  const dt = 0.0104; // ~15 minutes in days
  const startTime = 131.5; // Kepler BKJD epoch
  const pts: RawLightCurvePoint[] = [];

  switch (sampleId) {
    case 'confirmed-planet': {
      const randn = createSeededNoise(10101);
      const period = 2.78;
      const firstEpoch = startTime + 1.45;
      const depth = 0.00168; // 1680 ppm
      const halfDur = 0.085; // ~4.08 hours total duration

      for (let i = 0; i < numPoints; i++) {
        const time = Number((startTime + i * dt).toFixed(5));
        const stellarWave = 1.0 + 0.00035 * Math.sin((2 * Math.PI * (time - startTime)) / 6.5);
        const cyclePhase = (((time - firstEpoch) % period) + period) % period;
        const distToTransit = cyclePhase > period / 2 ? cyclePhase - period : cyclePhase;
        const dip = planetaryTransitDip(distToTransit, halfDur, depth);
        const noise = randn() * 0.00014;
        pts.push({ time, flux: Number((stellarWave + dip + noise).toFixed(6)) });
      }
      return pts;
    }

    case 'eclipsing-binary': {
      const randn = createSeededNoise(20202);
      const period = 3.12;
      const firstEpoch = startTime + 1.2;
      const primaryDepth = 0.0265;
      const secondaryDepth = 0.0078;
      const halfDur = 0.135;

      for (let i = 0; i < numPoints; i++) {
        const time = Number((startTime + i * dt).toFixed(5));
        const ellipsoidalModulation =
          1.0 + 0.0008 * Math.cos((4 * Math.PI * (time - firstEpoch)) / period);
        const cyclePhase = (((time - firstEpoch) % period) + period) % period;
        const distPrimary = cyclePhase > period / 2 ? cyclePhase - period : cyclePhase;
        const distSecondary = cyclePhase - period / 2;

        const dip1 = binaryEclipseDip(distPrimary, halfDur, primaryDepth);
        const dip2 = binaryEclipseDip(distSecondary, halfDur * 0.9, secondaryDepth);
        const noise = randn() * 0.00028;
        pts.push({
          time,
          flux: Number((ellipsoidalModulation + dip1 + dip2 + noise).toFixed(6)),
        });
      }
      return pts;
    }

    case 'noisy-transit': {
      const randn = createSeededNoise(30303);
      const period = 2.42;
      const firstEpoch = startTime + 1.05;
      const depth = 0.00215;
      const halfDur = 0.088;

      for (let i = 0; i < numPoints; i++) {
        const time = Number((startTime + i * dt).toFixed(5));
        const drift = 1.0 + 0.0012 * Math.sin((2 * Math.PI * (time - startTime)) / 4.8);
        const cyclePhase = (((time - firstEpoch) % period) + period) % period;
        const distToTransit = cyclePhase > period / 2 ? cyclePhase - period : cyclePhase;
        const dip = planetaryTransitDip(distToTransit, halfDur, depth);
        const noise = randn() * 0.00044;
        pts.push({ time, flux: Number((drift + dip + noise).toFixed(6)) });
      }
      return pts;
    }

    case 'flat-no-transit': {
      const randn = createSeededNoise(40404);
      for (let i = 0; i < numPoints; i++) {
        const time = Number((startTime + i * dt).toFixed(5));
        const drift = 1.0 + 0.0004 * Math.cos((2 * Math.PI * (time - startTime)) / 7.2);
        const noise = randn() * 0.00018;
        pts.push({ time, flux: Number((drift + noise).toFixed(6)) });
      }
      return pts;
    }

    case 'instrumental-artifact': {
      const randn = createSeededNoise(50505);
      const artifactEpoch = startTime + 4.85;
      for (let i = 0; i < numPoints; i++) {
        const time = Number((startTime + i * dt).toFixed(5));
        let artifact = 0;
        const dtArtifact = time - artifactEpoch;
        if (dtArtifact >= -0.015 && dtArtifact < 0) {
          artifact = -0.0048 * ((dtArtifact + 0.015) / 0.015);
        } else if (dtArtifact >= 0 && dtArtifact <= 0.38) {
          artifact = -0.0048 * Math.exp(-dtArtifact / 0.055);
        }
        const noise = randn() * 0.00019;
        pts.push({ time, flux: Number((1.0 + artifact + noise).toFixed(6)) });
      }
      return pts;
    }

    case 'unknown-candidate':
    default: {
      const randn = createSeededNoise(60606);
      const period = 3.95;
      const firstEpoch = startTime + 1.9;
      const depth = 0.00118;
      const halfDur = 0.078;

      for (let i = 0; i < numPoints; i++) {
        const time = Number((startTime + i * dt).toFixed(5));
        const drift = 1.0 + 0.0003 * Math.sin((2 * Math.PI * (time - startTime)) / 5.9);
        const cyclePhase = (((time - firstEpoch) % period) + period) % period;
        const distToTransit = cyclePhase > period / 2 ? cyclePhase - period : cyclePhase;
        const dip = planetaryTransitDip(distToTransit, halfDur, depth);
        const noise = randn() * 0.00024;
        pts.push({ time, flux: Number((drift + dip + noise).toFixed(6)) });
      }
      return pts;
    }
  }
}

export function pointsToCSVString(points: RawLightCurvePoint[]): string {
  const header = 'time,flux';
  const rows = points.map((p) => `${p.time},${p.flux}`);
  return [header, ...rows].join('\n');
}
