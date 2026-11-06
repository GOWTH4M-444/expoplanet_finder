import test from 'node:test';
import assert from 'node:assert/strict';
import {
  parseLightCurveCSV,
  preprocessLightCurve,
  predictWithDemoHeuristic,
  computeMedian,
  resampleToLength,
} from './lightCurve';
import { generateDemoLightCurvePoints, BUILTIN_SAMPLE_METADATA } from './demoCurves';
import { resolveKeyboardShortcut, getNextSampleId } from './shortcuts';

test('parseLightCurveCSV validates required columns and drops NaNs', () => {
  const missingCols = parseLightCurveCSV('timestamp,brightness\n1,0.99\n2,1.0');
  assert.equal(missingCols.ok, false);
  assert.match(missingCols.error ?? '', /Missing required columns/i);

  const tooFewRows = parseLightCurveCSV('time,flux\n1.0,1.0\n2.0,0.999');
  assert.equal(tooFewRows.ok, false);
  assert.match(tooFewRows.error ?? '', /Insufficient valid numeric rows/i);

  const rows: string[] = ['time,flux'];
  for (let i = 0; i < 20; i++) {
    if (i === 5) {
      rows.push(`${i},NaN`);
    } else {
      rows.push(`${i * 0.1},${1.0 - (i === 10 ? 0.002 : 0)}`);
    }
  }
  const parsed = parseLightCurveCSV(rows.join('\n'));
  assert.equal(parsed.ok, true);
  assert.equal(parsed.nanDroppedCount, 1);
  assert.equal(parsed.points.length, 19);
});

test('preprocessLightCurve sorts by time, normalizes to median 1, and resamples to 2001 points', () => {
  const raw = generateDemoLightCurvePoints('confirmed-planet');
  // Shuffle two points to verify sorting
  const shuffled = [...raw];
  const temp = shuffled[5];
  shuffled[5] = shuffled[25];
  shuffled[25] = temp;

  const processed = preprocessLightCurve(shuffled, 0, 2001);
  assert.equal(processed.window2001.length, 2001);

  // Verify sorted ascending time
  for (let i = 1; i < processed.points.length; i++) {
    assert.ok(processed.points[i].time >= processed.points[i - 1].time);
  }

  // Verify median of normalizedFlux is ~1.0
  const med = computeMedian(processed.points.map((p) => p.normalizedFlux));
  assert.ok(Math.abs(med - 1.0) < 0.0005, `Expected median ~1.0, got ${med}`);
});

test('all 6 built-in Kepler demo curves classify into expected scientific categories', () => {
  const planetIds = ['confirmed-planet', 'noisy-transit', 'unknown-candidate'];
  for (const id of planetIds) {
    const raw = generateDemoLightCurvePoints(id);
    const proc = preprocessLightCurve(raw);
    const pred = predictWithDemoHeuristic(proc.window2001, proc.features);
    assert.equal(
      pred.predictedClass,
      'Planet candidate',
      `Expected ${id} to be classified as Planet candidate, got ${pred.predictedClass} (prob ${pred.probability})`
    );
    assert.ok(pred.probability >= 0.5);
    assert.ok(proc.features.dipCount >= 2, `Expected >=2 dips for ${id}, got ${proc.features.dipCount}`);
  }

  const falsePositiveIds = ['eclipsing-binary', 'flat-no-transit', 'instrumental-artifact'];
  for (const id of falsePositiveIds) {
    const raw = generateDemoLightCurvePoints(id);
    const proc = preprocessLightCurve(raw);
    const pred = predictWithDemoHeuristic(proc.window2001, proc.features);
    assert.equal(
      pred.predictedClass,
      'Not planet / false positive',
      `Expected ${id} to be classified as Not planet / false positive, got ${pred.predictedClass} (prob ${pred.probability})`
    );
    assert.ok(pred.probability < 0.5);
  }
});

test('resampleToLength produces exact 2001 output length from arbitrary inputs', () => {
  const shortArr = [1.0, 0.998, 1.0];
  const resampled = resampleToLength(shortArr, 2001);
  assert.equal(resampled.length, 2001);
  assert.equal(resampled[0], 1.0);
  assert.equal(resampled[1000], 0.998);
  assert.equal(resampled[2000], 1.0);
});

test('median filter window size adjustment impacts transit depth and baseline trend as expected', () => {
  const raw = generateDemoLightCurvePoints('confirmed-planet');
  const narrowWindowResult = preprocessLightCurve(raw, 0, 2001, 9);
  const optimalWindowResult = preprocessLightCurve(raw, 0, 2001, 141);

  assert.equal(narrowWindowResult.stats.medianWindowSize, 9);
  assert.equal(optimalWindowResult.stats.medianWindowSize, 141);

  // A narrow 9-point rolling median fits inside the transit dip and attenuates/erases the signal depth
  assert.ok(
    narrowWindowResult.features.transitDepthPpm < optimalWindowResult.features.transitDepthPpm,
    `Expected narrow window (9 pts) depth (${narrowWindowResult.features.transitDepthPpm} ppm) to be smaller than optimal window (141 pts) depth (${optimalWindowResult.features.transitDepthPpm} ppm)`
  );
});

test('resolveKeyboardShortcut maps U, S, Space, M, 1-3 and ignores input focus or modifiers', () => {
  assert.equal(resolveKeyboardShortcut('u', false), 'OPEN_UPLOAD');
  assert.equal(resolveKeyboardShortcut('U', false), 'OPEN_UPLOAD');
  assert.equal(resolveKeyboardShortcut('s', false), 'CYCLE_SAMPLE');
  assert.equal(resolveKeyboardShortcut(' ', false), 'TOGGLE_PLAY');
  assert.equal(resolveKeyboardShortcut('m', false), 'TOGGLE_MARKERS');
  assert.equal(resolveKeyboardShortcut('1', false), 'TAB_CLASSIFIER');
  assert.equal(resolveKeyboardShortcut('2', false), 'TAB_ARCHITECTURE');
  assert.equal(resolveKeyboardShortcut('3', false), 'TAB_TRAINING');

  // Ignored when typing inside an input/textarea or holding Ctrl/Meta
  assert.equal(resolveKeyboardShortcut('s', true), null);
  assert.equal(resolveKeyboardShortcut(' ', true), null);
  assert.equal(resolveKeyboardShortcut('u', false, { ctrlKey: true }), null);

  // Sample cycling wraps around all 6 Kepler demo curves
  const ids = BUILTIN_SAMPLE_METADATA.map((s) => s.id);
  assert.equal(getNextSampleId('confirmed-planet', ids), 'eclipsing-binary');
  assert.equal(getNextSampleId('unknown-candidate', ids), 'confirmed-planet');
});

test('upsertPredictionHistory keeps at most 5 recent classifications and deduplicates by sampleId', async () => {
  const { upsertPredictionHistory, computeAstrophysicalMetrics } = await import(
    './missionTelemetry'
  );

  const sampleIds = BUILTIN_SAMPLE_METADATA.map((s) => s.id);
  let history: ReturnType<typeof upsertPredictionHistory> = [];

  for (const id of sampleIds) {
    const meta = BUILTIN_SAMPLE_METADATA.find((s) => s.id === id) ?? null;
    const raw = generateDemoLightCurvePoints(id);
    const proc = preprocessLightCurve(raw);
    const pred = predictWithDemoHeuristic(proc.window2001, proc.features);
    const astro = computeAstrophysicalMetrics(proc.features, pred, meta);

    assert.ok(astro.planetRadiusEarth > 0);
    assert.ok(astro.equilibriumTempK >= 180);
    assert.equal(astro.spectralComponents.length, 3);

    history = upsertPredictionHistory(
      history,
      {
        id: `entry-${id}`,
        sampleId: id,
        sampleName: meta?.name ?? id,
        kicId: meta?.kicId ?? 'KIC',
        predictedClass: pred.predictedClass,
        probability: pred.probability,
        confidence: pred.confidence,
        transitDepthPpm: proc.features.transitDepthPpm,
        estimatedPeriodDays: proc.features.estimatedPeriodDays,
        snrProxy: proc.features.snrProxy,
        planetRadiusEarth: astro.planetRadiusEarth,
        equilibriumTempK: astro.equilibriumTempK,
        timestampLabel: 'LIVE',
        isCustomCsv: false,
      },
      5
    );
  }

  // Should cap at 5 entries even after 6 samples are classified
  assert.equal(history.length, 5);
  assert.equal(history[0].sampleId, 'unknown-candidate');

  // Re-classifying eclipsing-binary moves it to #1 without duplicating
  const ebEntry = history.find((h) => h.sampleId === 'eclipsing-binary')!;
  history = upsertPredictionHistory(history, ebEntry, 5);
  assert.equal(history.length, 5);
  assert.equal(history[0].sampleId, 'eclipsing-binary');
});

test('computePhaseLockBreathingSpec modulates breathing pulse duration and opacity bounds from transit period', async () => {
  const { computePhaseLockBreathingSpec } = await import('./missionTelemetry');

  const shortOrbit = computePhaseLockBreathingSpec(2.756, true);
  const longOrbit = computePhaseLockBreathingSpec(4.812, true);
  const aperiodic = computePhaseLockBreathingSpec(null, false);

  assert.ok(
    shortOrbit.durationSeconds < longOrbit.durationSeconds,
    `Expected shorter period (2.756d -> ${shortOrbit.durationSeconds}s) to breathe faster than longer period (4.812d -> ${longOrbit.durationSeconds}s)`
  );
  assert.equal(shortOrbit.minOpacity, 0.56);
  assert.equal(shortOrbit.maxOpacity, 1.0);
  assert.equal(aperiodic.minOpacity, 0.45);
  assert.match(shortOrbit.syncStatusText, /LIVE SYNC/i);
  assert.match(aperiodic.syncStatusText, /STANDBY SYNC/i);
});

test('generateMissionTelemetryLogs emits Classification Started, Period Detected, and SNR Threshold Verified events', async () => {
  const { computeAstrophysicalMetrics, generateMissionTelemetryLogs } = await import(
    './missionTelemetry'
  );

  const meta = BUILTIN_SAMPLE_METADATA[0];
  const raw = generateDemoLightCurvePoints(meta.id);
  const proc = preprocessLightCurve(raw);
  const pred = predictWithDemoHeuristic(proc.window2001, proc.features);
  const metrics = computeAstrophysicalMetrics(proc.features, pred, meta);

  const logs = generateMissionTelemetryLogs(proc.features, pred, meta, metrics);
  const titles = logs.map((l) => l.eventTitle);

  assert.ok(titles.includes('Classification Started'));
  assert.ok(titles.includes('Period Detected'));
  assert.ok(titles.includes('SNR Threshold Verified'));
  assert.ok(logs.length >= 5);
});

test('computeOrbitalResonanceCheck detects small-integer ratios with known Solar System planets', async () => {
  const { computeOrbitalResonanceCheck } = await import('./missionTelemetry');

  // 1:2 Earth resonance (~182.63 days)
  const earthHalf = computeOrbitalResonanceCheck(182.63);
  assert.equal(earthHalf.isResonant, true);
  assert.equal(earthHalf.status, 'WARNING_RESONANCE');
  assert.equal(earthHalf.matchedPlanet, 'Earth');
  assert.match(earthHalf.ratioLabel, /1:2 Earth/);

  // 2:3 Venus resonance (~149.80 days)
  const venusTwoThirds = computeOrbitalResonanceCheck(149.8);
  assert.equal(venusTwoThirds.isResonant, true);
  assert.equal(venusTwoThirds.matchedPlanet, 'Venus');
  assert.match(venusTwoThirds.ratioLabel, /2:3 Venus/);

  // Short-period Kepler harmonic commensurability (2.756d -> 1:1 32x Mercury Harmonic)
  const mercuryHarmonic = computeOrbitalResonanceCheck(2.756);
  assert.equal(mercuryHarmonic.isResonant, true);
  assert.equal(mercuryHarmonic.status, 'WARNING_RESONANCE');
  assert.equal(mercuryHarmonic.matchedPlanet, 'Mercury');

  // Non-resonant period (3.6088d)
  const nonResonant = computeOrbitalResonanceCheck(3.6088);
  assert.equal(nonResonant.isResonant, false);
  assert.equal(nonResonant.status, 'CLEAR_NON_RESONANT');

  // Aperiodic / null period
  const aperiodic = computeOrbitalResonanceCheck(null);
  assert.equal(aperiodic.isResonant, false);
  assert.equal(aperiodic.status, 'APERIODIC_STANDBY');
});

