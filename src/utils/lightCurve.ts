import {
  LightCurveFeatures,
  PredictionResult,
  PreprocessedLightCurveResult,
  ProcessedLightCurvePoint,
  RawLightCurvePoint,
  TransitWindowRange,
} from '../types/exoplanet';

export interface CSVParseOutcome {
  ok: boolean;
  error?: string;
  points: RawLightCurvePoint[];
  nanDroppedCount: number;
  totalDataRows: number;
}

/**
 * Validates and parses a CSV string with required columns: time, flux.
 */
export function parseLightCurveCSV(csvContent: string): CSVParseOutcome {
  if (!csvContent || typeof csvContent !== 'string' || !csvContent.trim()) {
    return {
      ok: false,
      error: 'CSV input is empty. Please upload a file containing "time,flux" columns.',
      points: [],
      nanDroppedCount: 0,
      totalDataRows: 0,
    };
  }

  const lines = csvContent
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line.length > 0 && !line.startsWith('#'));

  if (lines.length < 2) {
    return {
      ok: false,
      error: 'CSV must include a header row ("time,flux") and at least 10 numeric observations.',
      points: [],
      nanDroppedCount: 0,
      totalDataRows: 0,
    };
  }

  const headerLine = lines[0];
  const delimiter = headerLine.includes('\t') ? '\t' : ',';
  const rawHeaders = headerLine
    .split(delimiter)
    .map((h) => h.trim().replace(/^["']|["']$/g, '').toLowerCase());

  const timeIdx = rawHeaders.findIndex(
    (h) => h === 'time' || h === 'bjd' || h === 'bkjd' || h === 'time_bkjd'
  );
  const fluxIdx = rawHeaders.findIndex(
    (h) => h === 'flux' || h === 'pdcsap_flux' || h === 'sap_flux' || h === 'relative_flux'
  );

  if (timeIdx === -1 || fluxIdx === -1) {
    return {
      ok: false,
      error: `Missing required columns. Expected "time" and "flux", but found: [${rawHeaders.join(', ')}].`,
      points: [],
      nanDroppedCount: 0,
      totalDataRows: 0,
    };
  }

  const points: RawLightCurvePoint[] = [];
  let nanDroppedCount = 0;
  let malformedColumnRows = 0;
  const totalDataRows = lines.length - 1;

  for (let i = 1; i < lines.length; i++) {
    const cols = lines[i].split(delimiter).map((c) => c.trim());
    if (cols.length <= Math.max(timeIdx, fluxIdx)) {
      malformedColumnRows++;
      continue;
    }

    const tStr = cols[timeIdx];
    const fStr = cols[fluxIdx];

    if (
      tStr === '' ||
      fStr === '' ||
      tStr.toLowerCase() === 'nan' ||
      fStr.toLowerCase() === 'nan' ||
      tStr.toLowerCase() === 'null' ||
      fStr.toLowerCase() === 'null'
    ) {
      nanDroppedCount++;
      continue;
    }

    const time = Number(tStr);
    const flux = Number(fStr);

    if (!Number.isFinite(time) || !Number.isFinite(flux)) {
      nanDroppedCount++;
      continue;
    }

    points.push({ time, flux });
  }

  if (malformedColumnRows > totalDataRows * 0.5) {
    return {
      ok: false,
      error: `Malformed CSV structure: ${malformedColumnRows} of ${totalDataRows} rows had missing column delimiters.`,
      points: [],
      nanDroppedCount,
      totalDataRows,
    };
  }

  if (points.length < 10) {
    return {
      ok: false,
      error: `Insufficient valid numeric rows (${points.length} found). At least 10 valid (time, flux) pairs are required.`,
      points: [],
      nanDroppedCount,
      totalDataRows,
    };
  }

  return {
    ok: true,
    points,
    nanDroppedCount,
    totalDataRows,
  };
}

/**
 * Computes the median of a numeric array.
 */
export function computeMedian(values: number[]): number {
  if (values.length === 0) return 1;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 !== 0
    ? sorted[mid]
    : (sorted[mid - 1] + sorted[mid]) / 2;
}

/**
 * Computes Median Absolute Deviation (MAD) scaled to standard deviation equivalent.
 */
export function computeRobustScatter(values: number[], medianVal?: number): number {
  if (values.length < 3) return 0.0001;
  const med = medianVal ?? computeMedian(values);
  const absDevs = values.map((v) => Math.abs(v - med));
  const mad = computeMedian(absDevs);
  return Math.max(mad * 1.4826, 1e-6);
}

/**
 * Resamples a 1D array of numbers to an exact target length (default 2001) using linear interpolation.
 */
export function resampleToLength(values: number[], targetLength = 2001): number[] {
  if (values.length === 0) {
    return new Array(targetLength).fill(1);
  }
  if (values.length === 1) {
    return new Array(targetLength).fill(values[0]);
  }
  if (values.length === targetLength) {
    return [...values];
  }

  const result = new Array<number>(targetLength);
  const scale = (values.length - 1) / (targetLength - 1);

  for (let i = 0; i < targetLength; i++) {
    const pos = i * scale;
    const lowIdx = Math.floor(pos);
    const highIdx = Math.min(values.length - 1, Math.ceil(pos));
    const weight = pos - lowIdx;
    result[i] = values[lowIdx] * (1 - weight) + values[highIdx] * weight;
  }

  return result;
}

/**
 * Full 7-step preprocessing pipeline:
 * 1. Sort by time
 * 2. Remove NaNs
 * 3. Interpolate small gaps
 * 4. Remove long-term trend using a rolling median baseline filter
 * 5. Normalize flux to median 1
 * 6. Resample to exactly 2001 points
 * 7. Extract quantitative transit features and human-readable summary
 */
export function preprocessLightCurve(
  rawPoints: RawLightCurvePoint[],
  nanRemovedFromParse = 0,
  targetWindowLength = 2001,
  customMedianWindowSize?: number
): PreprocessedLightCurveResult {
  const initialRowCount = rawPoints.length + nanRemovedFromParse;

  // Step 1 & 2: Filter non-finite values and sort ascending by time
  const validSorted = rawPoints
    .filter((p) => Number.isFinite(p.time) && Number.isFinite(p.flux))
    .sort((a, b) => a.time - b.time);

  const nanRemovedCount = initialRowCount - validSorted.length;

  // Deduplicate identical timestamps by averaging flux
  const deduped: RawLightCurvePoint[] = [];
  for (const pt of validSorted) {
    const last = deduped[deduped.length - 1];
    if (last && Math.abs(pt.time - last.time) < 1e-7) {
      last.flux = (last.flux + pt.flux) / 2;
    } else {
      deduped.push({ time: pt.time, flux: pt.flux });
    }
  }

  // Estimate median time cadence
  const timeDiffs: number[] = [];
  for (let i = 1; i < deduped.length; i++) {
    const dt = deduped[i].time - deduped[i - 1].time;
    if (dt > 0) timeDiffs.push(dt);
  }
  const medianDt = timeDiffs.length > 0 ? computeMedian(timeDiffs) : 0.0204; // ~29.4 min Kepler long cadence

  // Step 3: Interpolate small gaps (gaps between 1.75x and 6x median cadence)
  const interpolated: RawLightCurvePoint[] = [];
  let interpolatedGapCount = 0;

  for (let i = 0; i < deduped.length; i++) {
    interpolated.push(deduped[i]);
    if (i < deduped.length - 1) {
      const gap = deduped[i + 1].time - deduped[i].time;
      const missingSteps = Math.round(gap / medianDt) - 1;
      if (missingSteps >= 1 && missingSteps <= 5) {
        for (let s = 1; s <= missingSteps; s++) {
          const frac = s / (missingSteps + 1);
          interpolated.push({
            time: deduped[i].time + gap * frac,
            flux: deduped[i].flux * (1 - frac) + deduped[i + 1].flux * frac,
          });
          interpolatedGapCount++;
        }
      }
    }
  }

  // Step 4: Remove long-term stellar trend using a configurable rolling median filter
  const n = interpolated.length;
  const defaultHalfWin = Math.max(25, Math.min(90, Math.floor(n * 0.075)));
  const halfWin =
    typeof customMedianWindowSize === 'number' && Number.isFinite(customMedianWindowSize)
      ? Math.max(2, Math.min(Math.floor(n / 2), Math.floor(customMedianWindowSize / 2)))
      : defaultHalfWin;
  const effectiveWindowSize = halfWin * 2 + 1;

  const trendBaseline = new Array<number>(n);
  const detrendedFlux = new Array<number>(n);

  // Compute global median first to check if curve has slow drift
  const rawFluxArray = interpolated.map((p) => p.flux);
  const globalRawMedian = computeMedian(rawFluxArray);

  for (let i = 0; i < n; i++) {
    const start = Math.max(0, i - halfWin);
    const end = Math.min(n - 1, i + halfWin);
    const slice: number[] = [];
    // Sample every 2nd point only in very wide windows (>120 pts) for fast O(N) responsiveness
    const stride = end - start > 120 ? 2 : 1;
    for (let j = start; j <= end; j += stride) {
      slice.push(interpolated[j].flux);
    }
    const localMed = computeMedian(slice);
    trendBaseline[i] = localMed > 0 ? localMed : globalRawMedian || 1;
    detrendedFlux[i] =
      trendBaseline[i] !== 0
        ? interpolated[i].flux / trendBaseline[i]
        : interpolated[i].flux;
  }

  // Step 5: Normalize flux to exact median 1.000000
  const postDetrendMedian = computeMedian(detrendedFlux);
  const normFactor = postDetrendMedian > 0 ? postDetrendMedian : 1;
  const normalizedFlux = detrendedFlux.map((v) => v / normFactor);

  // Step 7a: Extract features & detect dips
  const features = extractLightCurveFeatures(interpolated, normalizedFlux, medianDt);

  // Build ProcessedLightCurvePoint array with transit window highlighting
  const primaryWin = features.primaryTransitWindow;
  const points: ProcessedLightCurvePoint[] = interpolated.map((pt, idx) => ({
    index: idx,
    time: Number(pt.time.toFixed(5)),
    rawFlux: Number((pt.flux / (globalRawMedian || 1)).toFixed(6)),
    trendBaseline: Number((trendBaseline[idx] / (globalRawMedian || 1)).toFixed(6)),
    normalizedFlux: Number(normalizedFlux[idx].toFixed(6)),
    inTransitWindow: primaryWin
      ? pt.time >= primaryWin.startTime && pt.time <= primaryWin.endTime
      : false,
  }));

  // Step 6: Resample to exactly 2001 points for the 1D CNN input tensor (2001, 1)
  const window2001 = resampleToLength(normalizedFlux, targetWindowLength).map((v) =>
    Number(v.toFixed(6))
  );

  const timeSpanDays =
    interpolated.length > 1
      ? Number((interpolated[interpolated.length - 1].time - interpolated[0].time).toFixed(3))
      : 0;

  return {
    points,
    window2001,
    features,
    stats: {
      initialRowCount,
      nanRemovedCount,
      interpolatedGapCount,
      timeSpanDays,
      cadenceMinutes: Number((medianDt * 24 * 60).toFixed(1)),
      medianWindowSize: effectiveWindowSize,
      medianWindowHours: Number((effectiveWindowSize * medianDt * 24).toFixed(1)),
      outputWindowLength: window2001.length,
    },
  };
}

/**
 * Extracts transit depth, duration, period, SNR proxy, dip count, and dip morphology.
 */
export function extractLightCurveFeatures(
  points: RawLightCurvePoint[],
  normalizedFlux: number[],
  medianDtDays: number
): LightCurveFeatures {
  const n = normalizedFlux.length;
  const baselineScatter = computeRobustScatter(normalizedFlux, 1.0);
  const baselineScatterPpm = Math.round(baselineScatter * 1e6);

  // Smooth slightly (3-point moving average) to measure genuine dips rather than single-point outliers
  const smoothed = normalizedFlux.map((val, idx) => {
    if (idx === 0 || idx === n - 1) return val;
    return (normalizedFlux[idx - 1] + val + normalizedFlux[idx + 1]) / 3;
  });

  // Threshold for significant downward excursion: at least 3.2x scatter and at least 350 ppm
  const dipThreshold = 1.0 - Math.max(3.2 * baselineScatter, 0.00035);

  interface DetectedDip {
    startIdx: number;
    endIdx: number;
    minIdx: number;
    minFlux: number;
    depth: number;
    durationDays: number;
    flatBottomRatio: number;
    asymmetryRatio: number;
  }

  const rawDips: DetectedDip[] = [];
  let inDip = false;
  let dipStart = 0;

  for (let i = 0; i < n; i++) {
    if (smoothed[i] < dipThreshold) {
      if (!inDip) {
        inDip = true;
        dipStart = i;
      }
    } else if (inDip) {
      inDip = false;
      const dipEnd = i - 1;
      if (dipEnd - dipStart >= 2) {
        rawDips.push(analyzeSingleDip(points, smoothed, dipStart, dipEnd));
      }
    }
  }
  if (inDip && n - 1 - dipStart >= 2) {
    rawDips.push(analyzeSingleDip(points, smoothed, dipStart, n - 1));
  }

  // Merge dips that are separated by only 1-2 points of noise
  const mergedDips: DetectedDip[] = [];
  for (const d of rawDips) {
    const prev = mergedDips[mergedDips.length - 1];
    if (prev && d.startIdx - prev.endIdx <= 3) {
      const combined = analyzeSingleDip(points, smoothed, prev.startIdx, d.endIdx);
      mergedDips[mergedDips.length - 1] = combined;
    } else {
      mergedDips.push(d);
    }
  }

  if (mergedDips.length === 0) {
    // No significant dip below threshold — measure shallowest excursion for reporting
    let minVal = 1.0;
    let minIdx = Math.floor(n / 2);
    for (let i = 0; i < n; i++) {
      if (smoothed[i] < minVal) {
        minVal = smoothed[i];
        minIdx = i;
      }
    }
    const depth = Math.max(0, 1.0 - minVal);
    const snrProxy = Number((depth / Math.max(baselineScatter, 1e-6)).toFixed(1));
    return {
      transitDepthPpm: Math.round(depth * 1e6),
      transitDepthPercent: Number((depth * 100).toFixed(4)),
      transitDurationHours: 0,
      estimatedPeriodDays: null,
      snrProxy,
      dipCount: 0,
      baselineScatterPpm,
      dipShapeProfile: 'Flat / Noise Floor',
      secondaryEclipseDetected: false,
      primaryTransitWindow: null,
      summaryText: `No statistically significant transit dips detected above the ${baselineScatterPpm} ppm baseline scatter floor (SNR ${snrProxy}).`,
    };
  }

  // Sort dips by depth descending to find the primary transit
  const sortedByDepth = [...mergedDips].sort((a, b) => b.depth - a.depth);
  const deepestDip = sortedByDepth[0];

  // Check for secondary eclipses (alternating shallower dips ~20%-75% of primary depth in Eclipsing Binaries)
  let secondaryEclipseDetected = false;
  const primaryCandidateDips: DetectedDip[] = [];

  for (const d of mergedDips) {
    if (d.depth >= deepestDip.depth * 0.65) {
      primaryCandidateDips.push(d);
    } else if (d.depth >= deepestDip.depth * 0.15 && deepestDip.depth > 0.005) {
      secondaryEclipseDetected = true;
    }
  }

  // Estimate orbital period from spacing between primary dips
  let estimatedPeriodDays: number | null = null;
  if (primaryCandidateDips.length >= 2) {
    const intervals: number[] = [];
    for (let i = 1; i < primaryCandidateDips.length; i++) {
      const dt =
        points[primaryCandidateDips[i].minIdx].time -
        points[primaryCandidateDips[i - 1].minIdx].time;
      if (dt > 0.1) intervals.push(dt);
    }
    if (intervals.length > 0) {
      estimatedPeriodDays = Number(computeMedian(intervals).toFixed(4));
    }
  }

  // Pad the highlighted primary transit window slightly on both sides for clear visual framing
  const padPoints = Math.max(4, Math.round((deepestDip.endIdx - deepestDip.startIdx) * 0.6));
  const winStartIdx = Math.max(0, deepestDip.startIdx - padPoints);
  const winEndIdx = Math.min(n - 1, deepestDip.endIdx + padPoints);

  const primaryTransitWindow: TransitWindowRange = {
    startTime: Number(points[winStartIdx].time.toFixed(4)),
    endTime: Number(points[winEndIdx].time.toFixed(4)),
    centerTime: Number(points[deepestDip.minIdx].time.toFixed(4)),
    startIndex: winStartIdx,
    endIndex: winEndIdx,
  };

  const depth = deepestDip.depth;
  const transitDepthPpm = Math.round(depth * 1e6);
  const transitDepthPercent = Number((depth * 100).toFixed(4));
  const transitDurationHours = Number(
    Math.max(deepestDip.durationDays * 24, medianDtDays * 24 * 2).toFixed(2)
  );
  const pointsInDip = Math.max(1, deepestDip.endIdx - deepestDip.startIdx + 1);
  const snrProxy = Number(
    ((depth / Math.max(baselineScatter, 1e-6)) * Math.sqrt(Math.min(pointsInDip, 16))).toFixed(1)
  );

  // Determine dip morphology
  let dipShapeProfile: LightCurveFeatures['dipShapeProfile'] = 'U-shaped (Flat Bottom)';
  if (deepestDip.asymmetryRatio > 2.3 || (mergedDips.length === 1 && transitDurationHours < 1.1)) {
    dipShapeProfile = 'Asymmetric Artifact';
  } else if (
    secondaryEclipseDetected ||
    depth > 0.015 ||
    deepestDip.flatBottomRatio < 0.28
  ) {
    dipShapeProfile = 'V-shaped (Grazing / Binary)';
  }

  const periodStr = estimatedPeriodDays
    ? `repeating every ${estimatedPeriodDays} days`
    : 'single non-repeating event';

  const summaryText = `Detected ${mergedDips.length} transit dip${mergedDips.length > 1 ? 's' : ''} (${periodStr}) with primary depth ${transitDepthPpm.toLocaleString()} ppm (${transitDepthPercent}%), duration ${transitDurationHours} hrs, ${dipShapeProfile} profile, and SNR ${snrProxy}.`;

  return {
    transitDepthPpm,
    transitDepthPercent,
    transitDurationHours,
    estimatedPeriodDays,
    snrProxy,
    dipCount: mergedDips.length,
    baselineScatterPpm,
    dipShapeProfile,
    secondaryEclipseDetected,
    primaryTransitWindow,
    summaryText,
  };
}

function analyzeSingleDip(
  points: RawLightCurvePoint[],
  smoothed: number[],
  startIdx: number,
  endIdx: number
) {
  let minFlux = Infinity;
  let minIdx = startIdx;
  for (let i = startIdx; i <= endIdx; i++) {
    if (smoothed[i] < minFlux) {
      minFlux = smoothed[i];
      minIdx = i;
    }
  }
  const depth = Math.max(0, 1.0 - minFlux);
  const durationDays = Math.max(0, points[endIdx].time - points[startIdx].time);

  // Count fraction of points inside dip that are within 70% of full depth (U-shape vs V-shape)
  const deepThreshold = 1.0 - depth * 0.7;
  let deepCount = 0;
  for (let i = startIdx; i <= endIdx; i++) {
    if (smoothed[i] <= deepThreshold) deepCount++;
  }
  const totalPts = Math.max(1, endIdx - startIdx + 1);
  const flatBottomRatio = deepCount / totalPts;

  // Measure ingress vs egress symmetry
  const ingressLen = Math.max(1, minIdx - startIdx);
  const egressLen = Math.max(1, endIdx - minIdx);
  const asymmetryRatio = Math.max(ingressLen / egressLen, egressLen / ingressLen);

  return {
    startIdx,
    endIdx,
    minIdx,
    minFlux,
    depth,
    durationDays,
    flatBottomRatio,
    asymmetryRatio,
  };
}

/**
 * Deterministic Heuristic Classifier (Demo Mode Fallback when exoplanet_cnn.keras is absent).
 * Evaluates depth, periodicity, dip morphology, secondary eclipse presence, and SNR.
 */
export function predictWithDemoHeuristic(
  window2001: number[],
  features?: LightCurveFeatures
): PredictionResult {
  // If features were not pre-supplied, compute them from synthetic unit time steps
  const resolvedFeatures: LightCurveFeatures =
    features ??
    extractLightCurveFeatures(
      window2001.map((flux, i) => ({ time: i * 0.01, flux })),
      window2001,
      0.01
    );

  let score = 0.5;
  const contributions: PredictionResult['featureContributions'] = [];

  // 1. Dip existence and SNR check
  if (resolvedFeatures.dipCount === 0 || resolvedFeatures.snrProxy < 4.5) {
    score -= 0.42;
    contributions.push({
      label: 'Transit Signal-to-Noise',
      impact: 'negative',
      detail: `No significant periodic dip above noise floor (SNR ${resolvedFeatures.snrProxy}).`,
    });
  } else if (resolvedFeatures.snrProxy >= 12) {
    score += 0.16;
    contributions.push({
      label: 'Transit Signal-to-Noise',
      impact: 'positive',
      detail: `Clear transit detection above baseline noise (SNR ${resolvedFeatures.snrProxy}).`,
    });
  } else {
    score += 0.06;
    contributions.push({
      label: 'Transit Signal-to-Noise',
      impact: 'neutral',
      detail: `Moderate transit SNR (${resolvedFeatures.snrProxy}) near detection threshold.`,
    });
  }

  // 2. Transit Depth check (Planetary transits are typically 100 ppm to 12,000 ppm / 1.2%)
  // Eclipsing binaries often exceed 15,000 ppm (1.5%+)
  if (resolvedFeatures.transitDepthPpm >= 350 && resolvedFeatures.transitDepthPpm <= 9000) {
    score += 0.18;
    contributions.push({
      label: 'Transit Depth Scale',
      impact: 'positive',
      detail: `Depth of ${resolvedFeatures.transitDepthPpm.toLocaleString()} ppm (${resolvedFeatures.transitDepthPercent}%) is consistent with planetary radii (Earth to Jupiter scale).`,
    });
  } else if (resolvedFeatures.transitDepthPpm > 14000) {
    score -= 0.38;
    contributions.push({
      label: 'Transit Depth Scale',
      impact: 'negative',
      detail: `Excessive depth of ${resolvedFeatures.transitDepthPpm.toLocaleString()} ppm (${resolvedFeatures.transitDepthPercent}%) strongly indicates a stellar companion (eclipsing binary).`,
    });
  }

  // 3. Secondary eclipse check
  if (resolvedFeatures.secondaryEclipseDetected) {
    score -= 0.35;
    contributions.push({
      label: 'Secondary Eclipse Vetting',
      impact: 'negative',
      detail: 'Alternating primary and secondary eclipses detected — classic signature of two self-luminous stars.',
    });
  }

  // 4. Periodicity / Multi-transit repetition
  if (resolvedFeatures.dipCount >= 2 && resolvedFeatures.estimatedPeriodDays !== null) {
    score += 0.15;
    contributions.push({
      label: 'Orbital Periodicity',
      impact: 'positive',
      detail: `${resolvedFeatures.dipCount} repeating transits observed with estimated period ${resolvedFeatures.estimatedPeriodDays} days.`,
    });
  } else if (resolvedFeatures.dipCount === 1) {
    score -= 0.18;
    contributions.push({
      label: 'Single-Event Ambiguity',
      impact: 'negative',
      detail: 'Only a single dip observed; cannot verify orbital periodicity without additional transits.',
    });
  }

  // 5. Dip Morphology (U-shaped vs V-shaped vs Asymmetric Artifact)
  if (resolvedFeatures.dipShapeProfile === 'U-shaped (Flat Bottom)') {
    score += 0.14;
    contributions.push({
      label: 'Dip Morphology',
      impact: 'positive',
      detail: 'Symmetric ingress/egress with flat-bottomed U-profile characteristic of a planetary disk crossing a star.',
    });
  } else if (resolvedFeatures.dipShapeProfile === 'V-shaped (Grazing / Binary)') {
    score -= 0.22;
    contributions.push({
      label: 'Dip Morphology',
      impact: 'negative',
      detail: 'Steep V-shaped minimum typical of grazing eclipsing binaries or blended background binaries.',
    });
  } else if (resolvedFeatures.dipShapeProfile === 'Asymmetric Artifact') {
    score -= 0.36;
    contributions.push({
      label: 'Dip Morphology',
      impact: 'negative',
      detail: 'Sharp asymmetric drop and recovery profile characteristic of a spacecraft thruster firing or pixel dropout.',
    });
  }

  const probability = Number(Math.max(0.02, Math.min(0.97, score)).toFixed(3));
  const predictedClass: PredictionResult['predictedClass'] =
    probability >= 0.5 ? 'Planet candidate' : 'Not planet / false positive';

  const distFromBoundary = Math.abs(probability - 0.5);
  let confidence: PredictionResult['confidence'] = 'Low';
  if (distFromBoundary >= 0.32) {
    confidence = 'High';
  } else if (distFromBoundary >= 0.15) {
    confidence = 'Medium';
  }

  return {
    predictedClass,
    probability,
    confidence,
    isDemoMode: true,
    modelSourceLabel: 'Demo heuristic, not the trained CNN',
    features: resolvedFeatures,
    featureContributions: contributions,
  };
}

/**
 * Generates an immediate, strictly feature-grounded 4-bullet + 1-caveat explanation
 * so the student always sees structured evidence immediately while Gemini API refines it.
 */
export function buildDeterministicExplanation(
  prediction: PredictionResult,
  features: LightCurveFeatures,
  isConfirmedPlanet = false
) {
  const probPct = (prediction.probability * 100).toFixed(1);
  const statusPhrase = isConfirmedPlanet
    ? `Target disposition: Input metadata marks this target as a confirmed exoplanet, and the classifier assigned a ${probPct}% planet candidate probability (${prediction.confidence} confidence).`
    : `Target disposition: The classifier labeled this segment "${prediction.predictedClass}" with ${probPct}% probability (${prediction.confidence} confidence); it is not a confirmed exoplanet.`;

  const dipBullet =
    features.dipCount > 0
      ? `What the dip suggests: A transit is a small, periodic dip in stellar brightness; this curve shows ${features.dipCount} dip(s) with ${features.transitDepthPpm.toLocaleString()} ppm (${features.transitDepthPercent}%) depth, ${features.transitDurationHours}-hour duration, and a ${features.dipShapeProfile} profile.`
      : `What the curve suggests: A transit is a small, periodic dip in brightness, but this segment stays flat within the ${features.baselineScatterPpm} ppm noise floor (SNR ${features.snrProxy}) with zero transit dips.`;

  const modelWhyBullet =
    prediction.predictedClass === 'Planet candidate'
      ? `Why the model classified it as a candidate: The shallow planetary-scale depth (${features.transitDepthPercent}%), ${
          features.estimatedPeriodDays
            ? `repeating ${features.estimatedPeriodDays}-day orbital period`
            : 'localized dip'
        }, and lack of alternating secondary eclipses match a planetary transit.`
      : `Why the model classified it as a false positive: ${
          features.secondaryEclipseDetected || features.transitDepthPpm > 14000
            ? `The deep ${features.transitDepthPercent}% V-shaped primary dip and alternating secondary eclipse indicate two mutually eclipsing stars.`
            : features.dipShapeProfile === 'Asymmetric Artifact'
            ? 'The single non-repeating, sharply asymmetric flux drop matches a spacecraft thruster or pixel sensitivity artifact.'
            : 'The absence of repeating, high-SNR U-shaped dips rules out a periodic planetary transit.'
        }`;

  const fpAndFollowupBullet =
    'False-positive mimics & next steps: Eclipsing binaries, background binaries, stellar spots, and instrumental artifacts can mimic transits; radial-velocity mass measurements and centroid vetting would improve confidence.';

  const caveat = isConfirmedPlanet
    ? 'Although input metadata identifies this star as hosting a confirmed exoplanet, transit photometry alone only measures radius ratio and always requires independent radial-velocity or statistical validation.'
    : 'This educational classifier only separates transit candidates from likely false positives—scientific confirmation of an exoplanet requires follow-up spectroscopy and radial-velocity observations.';

  const bullets = [statusPhrase, dipBullet, modelWhyBullet, fpAndFollowupBullet];
  return {
    bullets,
    caveat,
    rawText: bullets.map((b) => `• ${b}`).join('\n') + `\n\nCaveat: ${caveat}`,
    source: 'fallback' as const,
    modelUsed: 'Grounded Photometric Evidence Engine',
  };
}

