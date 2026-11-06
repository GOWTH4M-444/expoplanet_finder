import React, { useEffect, useRef, useState } from 'react';
import {
  Play,
  Pause,
  Activity,
  Orbit,
  Compass,
  Radio,
  Terminal,
  RotateCcw,
  AlertTriangle,
  CheckCircle2,
} from 'lucide-react';
import {
  LightCurveFeatures,
  PredictionResult,
  SampleCurveMetadata,
} from '../types/exoplanet';
import {
  AstrophysicalMetrics,
  TelemetryLogEvent,
  computeAstrophysicalMetrics,
  generateMissionTelemetryLogs,
} from '../utils/missionTelemetry';
import { ExoplanetTransitViewer } from './ExoplanetTransitViewer.jsx';
import { playTwinkleSound } from '../utils/sound';

interface MissionControlDeckProps {
  features: LightCurveFeatures;
  prediction: PredictionResult | null;
  activeSampleMeta: SampleCurveMetadata | null;
}

export const MissionControlDeck: React.FC<MissionControlDeckProps> = ({
  features,
  prediction,
  activeSampleMeta,
}) => {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const terminalFeedRef = useRef<HTMLDivElement | null>(null);
  const [simRunning, setSimRunning] = useState<boolean>(true);
  const [simSpeed, setSimSpeed] = useState<1 | 2>(1);
  const [livePhaseLabel, setLivePhaseLabel] = useState<string>('IN TRANSIT');
  const [logStreamPaused, setLogStreamPaused] = useState<boolean>(false);

  const metrics: AstrophysicalMetrics = computeAstrophysicalMetrics(
    features,
    prediction,
    activeSampleMeta
  );

  const [telemetryLogs, setTelemetryLogs] = useState<TelemetryLogEvent[]>(() =>
    generateMissionTelemetryLogs(features, prediction, activeSampleMeta, metrics)
  );

  // Reset and re-seed telemetry log feed whenever target or prediction updates
  useEffect(() => {
    const baseLogs = generateMissionTelemetryLogs(
      features,
      prediction,
      activeSampleMeta,
      metrics
    );
    setTelemetryLogs(baseLogs);
  }, [features, prediction, activeSampleMeta, metrics.fluxStabilityIndex]);

  // Append live scrolling telemetry heartbeat events to the terminal feed
  useEffect(() => {
    if (logStreamPaused) return;
    let tickCount = 1;
    const interval = window.setInterval(() => {
      const targetId = activeSampleMeta?.koiId ?? 'KEPLER-452b';
      const cycleEvents: Omit<TelemetryLogEvent, 'id' | 'timestamp'>[] = [
        {
          subsystem: 'CNN.1D',
          eventTitle: 'Classification Started',
          detail: `Re-verifying 2,001-pt flux tensor for ${targetId}; baseline scatter ${features.baselineScatterPpm} ppm.`,
          level: 'info',
        },
        {
          subsystem: 'EPHEMERIS',
          eventTitle: 'Period Detected',
          detail:
            features.estimatedPeriodDays !== null
              ? `Phase lock confirmed at P = ${features.estimatedPeriodDays}d (${metrics.phaseLockBreathing.frequencyHz} Hz sync cycle).`
              : `Aperiodic flux profile monitored; standby sync cycle ${metrics.phaseLockBreathing.durationSeconds}s.`,
          level: features.estimatedPeriodDays !== null ? 'success' : 'warning',
        },
        {
          subsystem: 'SNR.LOCK',
          eventTitle: 'SNR Threshold Verified',
          detail: `Multi-stage SNR array locked at ${features.snrProxy}× (${metrics.snrStatus.replace('_', ' ')}).`,
          level: 'success',
        },
        {
          subsystem: '3D.TWIN',
          eventTitle: 'Flux Attenuation Sampled',
          detail: `3D transit chord occultation ΔF = -${features.transitDepthPercent.toFixed(4)}% (${features.transitDepthPpm.toLocaleString()} ppm).`,
          level: 'info',
        },
      ];
      const chosen = cycleEvents[(tickCount - 1) % cycleEvents.length];
      const sec = (tickCount * 1.8).toFixed(2).padStart(5, '0');
      tickCount += 1;

      setTelemetryLogs((prev) => {
        const next: TelemetryLogEvent[] = [
          ...prev,
          {
            ...chosen,
            id: `live-log-${Date.now()}-${tickCount}`,
            timestamp: `00:${sec}`,
          },
        ];
        return next.slice(-14);
      });
    }, 2600);

    return () => window.clearInterval(interval);
  }, [
    logStreamPaused,
    activeSampleMeta,
    features.baselineScatterPpm,
    features.estimatedPeriodDays,
    features.snrProxy,
    features.transitDepthPercent,
    features.transitDepthPpm,
    metrics.phaseLockBreathing.durationSeconds,
    metrics.phaseLockBreathing.frequencyHz,
    metrics.snrStatus,
  ]);

  // Auto-scroll only the internal terminal feed container
  useEffect(() => {
    const el = terminalFeedRef.current;
    if (el && !logStreamPaused) {
      el.scrollTop = el.scrollHeight;
    }
  }, [telemetryLogs, logStreamPaused]);

  const isCandidate = prediction?.predictedClass === 'Planet candidate';
  const isBinary =
    features.secondaryEclipseDetected || metrics.planetRadiusEarth >= 20;

  // 2D Exoplanet Orbital Transit Simulator Canvas Animation
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    let animId = 0;
    let phase = 0.0;

    const render = () => {
      const width = canvas.width;
      const height = canvas.height;
      ctx.clearRect(0, 0, width, height);

      ctx.strokeStyle = 'rgba(34, 211, 238, 0.06)';
      ctx.lineWidth = 1;
      for (let x = 24; x < width; x += 32) {
        ctx.beginPath();
        ctx.moveTo(x, 0);
        ctx.lineTo(x, height);
        ctx.stroke();
      }
      for (let y = 20; y < height; y += 28) {
        ctx.beginPath();
        ctx.moveTo(0, y);
        ctx.lineTo(width, y);
        ctx.stroke();
      }

      const starX = width * 0.5;
      const starY = height * 0.42;
      const starRadius = 32;
      const orbitRx = width * 0.37;
      const orbitRy = 12;

      if (simRunning) {
        phase += 0.018 * simSpeed;
        if (phase > Math.PI) phase -= Math.PI * 2;
      }

      const planetX = starX + Math.sin(phase) * orbitRx;
      const planetY = starY + Math.cos(phase) * orbitRy;
      const inFront = Math.cos(phase) > 0;

      const planetRadius = isBinary
        ? 14
        : Math.max(5, Math.min(11, 4.2 + Math.sqrt(metrics.planetRadiusEarth) * 2.0));

      ctx.save();
      ctx.setLineDash([4, 4]);
      ctx.strokeStyle = 'rgba(148, 163, 184, 0.28)';
      ctx.lineWidth = 1.2;
      ctx.beginPath();
      ctx.ellipse(starX, starY, orbitRx, orbitRy, 0, Math.PI, Math.PI * 2);
      ctx.stroke();
      ctx.restore();

      const drawOrbitingBody = () => {
        ctx.save();
        if (isBinary) {
          const binGrad = ctx.createRadialGradient(
            planetX - 2,
            planetY - 2,
            1,
            planetX,
            planetY,
            planetRadius * 1.4
          );
          binGrad.addColorStop(0, '#fed7aa');
          binGrad.addColorStop(0.55, '#f97316');
          binGrad.addColorStop(1, 'rgba(249, 115, 22, 0)');
          ctx.fillStyle = binGrad;
          ctx.beginPath();
          ctx.arc(planetX, planetY, planetRadius * 1.4, 0, Math.PI * 2);
          ctx.fill();
        } else {
          ctx.beginPath();
          ctx.arc(planetX, planetY, planetRadius + 2, 0, Math.PI * 2);
          ctx.fillStyle = inFront
            ? 'rgba(34, 211, 238, 0.38)'
            : 'rgba(56, 189, 248, 0.22)';
          ctx.fill();

          const bodyGrad = ctx.createRadialGradient(
            planetX - planetRadius * 0.3,
            planetY - planetRadius * 0.3,
            1,
            planetX,
            planetY,
            planetRadius
          );
          bodyGrad.addColorStop(0, inFront ? '#0f172a' : '#38bdf8');
          bodyGrad.addColorStop(1, '#020617');
          ctx.beginPath();
          ctx.arc(planetX, planetY, planetRadius, 0, Math.PI * 2);
          ctx.fillStyle = bodyGrad;
          ctx.fill();
        }
        ctx.restore();
      };

      if (!inFront) {
        drawOrbitingBody();
      }

      const coronaGrad = ctx.createRadialGradient(
        starX,
        starY,
        starRadius * 0.4,
        starX,
        starY,
        starRadius * 1.85
      );
      coronaGrad.addColorStop(0, 'rgba(254, 240, 138, 0.95)');
      coronaGrad.addColorStop(0.45, 'rgba(251, 191, 36, 0.55)');
      coronaGrad.addColorStop(0.75, 'rgba(245, 158, 11, 0.16)');
      coronaGrad.addColorStop(1, 'rgba(245, 158, 11, 0)');
      ctx.fillStyle = coronaGrad;
      ctx.beginPath();
      ctx.arc(starX, starY, starRadius * 1.85, 0, Math.PI * 2);
      ctx.fill();

      const starDiskGrad = ctx.createRadialGradient(
        starX - 5,
        starY - 5,
        4,
        starX,
        starY,
        starRadius
      );
      starDiskGrad.addColorStop(0, '#fef9c3');
      starDiskGrad.addColorStop(0.65, '#facc15');
      starDiskGrad.addColorStop(1, '#d97706');
      ctx.fillStyle = starDiskGrad;
      ctx.beginPath();
      ctx.arc(starX, starY, starRadius, 0, Math.PI * 2);
      ctx.fill();

      ctx.save();
      ctx.setLineDash([4, 4]);
      ctx.strokeStyle = 'rgba(34, 211, 238, 0.45)';
      ctx.lineWidth = 1.2;
      ctx.beginPath();
      ctx.ellipse(starX, starY, orbitRx, orbitRy, 0, 0, Math.PI);
      ctx.stroke();
      ctx.restore();

      if (inFront) {
        drawOrbitingBody();
      }

      const distFromStarCenter = Math.abs(planetX - starX);
      const isTransitingDisk =
        inFront && distFromStarCenter < starRadius + planetRadius * 0.75;

      const traceTop = height - 38;
      const traceBottom = height - 10;
      const traceLeft = 16;
      const traceRight = width - 16;
      const traceWidth = traceRight - traceLeft;

      ctx.strokeStyle = 'rgba(30, 41, 59, 0.9)';
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(traceLeft, traceTop);
      ctx.lineTo(traceRight, traceTop);
      ctx.stroke();

      ctx.beginPath();
      ctx.strokeStyle = isBinary ? '#f59e0b' : '#22d3ee';
      ctx.lineWidth = 2;

      for (let i = 0; i <= 80; i++) {
        const u = i / 80;
        const samplePhase = (u - 0.5) * Math.PI * 2;
        const sx = starX + Math.sin(samplePhase) * orbitRx;
        const sFront = Math.cos(samplePhase) > 0;
        const sDist = Math.abs(sx - starX);

        let dipFactor = 0;
        if (sFront && sDist < starRadius + planetRadius * 0.6) {
          const normDist = sDist / (starRadius + planetRadius * 0.6);
          dipFactor = isBinary
            ? Math.max(0, 1 - normDist)
            : Math.pow(Math.max(0, 1 - Math.pow(normDist, 2.6)), 0.75);
        } else if (!sFront && isBinary && sDist < starRadius) {
          const normDist = sDist / starRadius;
          dipFactor = 0.35 * Math.max(0, 1 - normDist);
        }

        const px = traceLeft + u * traceWidth;
        const py = traceTop + dipFactor * (traceBottom - traceTop);
        if (i === 0) ctx.moveTo(px, py);
        else ctx.lineTo(px, py);
      }
      ctx.stroke();

      const normPhaseU = (phase + Math.PI) / (Math.PI * 2);
      const dotX = traceLeft + normPhaseU * traceWidth;
      let currentDip = 0;
      if (isTransitingDisk) {
        const normDist =
          distFromStarCenter / (starRadius + planetRadius * 0.6);
        currentDip = isBinary
          ? Math.max(0, 1 - normDist)
          : Math.pow(Math.max(0, 1 - Math.pow(normDist, 2.6)), 0.75);
      }
      const dotY = traceTop + currentDip * (traceBottom - traceTop);

      ctx.fillStyle = isTransitingDisk ? '#fbbf24' : '#22d3ee';
      ctx.beginPath();
      ctx.arc(dotX, dotY, 4, 0, Math.PI * 2);
      ctx.fill();

      if (simRunning) {
        setLivePhaseLabel(
          isTransitingDisk ? 'TRANSIT OCCULTATION ACTIVE' : 'BASELINE ORBITAL PHASE'
        );
        animId = window.requestAnimationFrame(render);
      }
    };

    render();
    return () => {
      if (animId) window.cancelAnimationFrame(animId);
    };
  }, [simRunning, simSpeed, isBinary, metrics.planetRadiusEarth]);

  // SVG Ring Parameters for Stellar Flux Stability Index
  const ringRadius = 32;
  const ringCircumference = 2 * Math.PI * ringRadius;
  const ringOffset =
    ringCircumference - (metrics.fluxStabilityIndex / 100) * ringCircumference;

  // Multi-stage SNR percentages across 3 threshold zones:
  // Stage 1: Noise Floor (0-6x), Stage 2: Marginal Lock (6-14x), Stage 3: High Lock (14-50x+)
  const snr = features.snrProxy;
  const stage1Fill = Math.min(100, Math.round((Math.min(snr, 6) / 6) * 100));
  const stage2Fill =
    snr <= 6 ? 0 : Math.min(100, Math.round((Math.min(snr - 6, 8) / 8) * 100));
  const stage3Fill =
    snr <= 14 ? 0 : Math.min(100, Math.round((Math.min(snr - 14, 36) / 36) * 100));

  return (
    <section
      aria-label="Mission Control Observatory Telemetry Deck"
      data-testid="mission-control-deck"
      className="flex flex-col gap-5"
    >
      {/* Top Row: Three.js 3D Exoplanet Model Viewer (7/12) + Mission Control Telemetry HUD Sidebar (5/12) */}
      <div className="grid grid-cols-1 xl:grid-cols-12 gap-5 items-stretch">
        <ExoplanetTransitViewer
          features={features}
          prediction={prediction}
          activeSampleMeta={activeSampleMeta}
          metrics={metrics}
        />

        {/* Mission Control Telemetry HUD Sidebar (5/12 cols) */}
        <aside
          aria-label="Mission Control Telemetry HUD Sidebar"
          data-testid="mission-control-hud"
          className="xl:col-span-5 cyber-glass telemetry-tilt-card spring-enter-2 rounded-lg p-4 flex flex-col justify-between gap-3.5 relative"
        >
          {/* Header with Cyber-Tag & Rolling Telemetry Log */}
          <div className="border-b border-slate-800/80 pb-2.5 flex items-center justify-between gap-2">
            <div>
              <div className="flex items-center gap-1.5 text-[10px] font-mono text-amber-300">
                <span>{metrics.cyberTag}</span>
              </div>
              <h3 className="text-xs sm:text-sm font-semibold text-slate-100 mt-0.5 flex items-center gap-1.5">
                <Activity className="w-3.5 h-3.5 text-cyan-400 shrink-0" />
                <span>Mission Control Telemetry HUD</span>
              </h3>
            </div>
            <div className="text-[10px] font-mono text-cyan-300 bg-slate-950/90 border border-cyan-500/30 rounded px-2 py-1">
              [TELEMETRY // {activeSampleMeta?.kicId ?? 'CSV'} // SNR: {features.snrProxy}×]
            </div>
          </div>

          {/* 1. Circular SVG Progress Ring: Stellar Flux Stability Index */}
          <div
            data-testid="flux-stability-ring-card"
            className="flex items-center gap-3.5 bg-slate-950/85 border border-cyan-500/20 rounded-md p-3"
          >
            <div className="relative w-[78px] h-[78px] shrink-0 flex items-center justify-center">
              <svg className="w-full h-full -rotate-90" viewBox="0 0 78 78">
                <circle
                  cx="39"
                  cy="39"
                  r={ringRadius}
                  fill="none"
                  stroke="rgba(30, 41, 59, 0.95)"
                  strokeWidth="6.5"
                />
                <circle
                  cx="39"
                  cy="39"
                  r={ringRadius}
                  fill="none"
                  stroke={metrics.fluxStabilityIndex >= 75 ? '#22d3ee' : '#f59e0b'}
                  strokeWidth="6.5"
                  strokeLinecap="round"
                  strokeDasharray={ringCircumference}
                  strokeDashoffset={ringOffset}
                />
              </svg>
              <div className="absolute inset-0 flex flex-col items-center justify-center font-mono">
                <span
                  data-testid="flux-stability-value"
                  className="text-sm font-bold text-slate-100 tabular-nums"
                >
                  {metrics.fluxStabilityIndex}%
                </span>
                <span className="text-[9px] text-cyan-300">STABILITY</span>
              </div>
            </div>

            <div className="min-w-0 flex-1">
              <div className="flex items-center justify-between">
                <span className="text-xs font-semibold text-slate-100">
                  Stellar Flux Stability Index
                </span>
                <span className="text-[10px] font-mono text-cyan-400">
                  {metrics.fluxStabilityIndex >= 80 ? 'NOMINAL' : 'ELEVATED JITTER'}
                </span>
              </div>
              <p className="text-[11px] text-slate-400 mt-1 leading-snug">
                Photometric baseline scatter:{' '}
                <strong className="font-mono text-slate-200">
                  {features.baselineScatterPpm} ppm
                </strong>{' '}
                across {activeSampleMeta?.stellarRadiusSolar ?? 1.0} R☉ host star.
              </p>
            </div>
          </div>

          {/* 2. Multi-Stage Color-Coded SNR Bar */}
          <div
            data-testid="multi-stage-snr-bar"
            className="bg-slate-950/85 border border-cyan-500/20 rounded-md p-3 flex flex-col gap-2"
          >
            <div className="flex items-center justify-between text-[11px] font-mono">
              <span className="text-slate-200 font-semibold">
                Multi-Stage SNR Threshold Array
              </span>
              <span
                className={
                  metrics.snrStatus === 'HIGH_LOCK'
                    ? 'text-cyan-300 font-semibold'
                    : metrics.snrStatus === 'MARGINAL_LOCK'
                    ? 'text-amber-300 font-semibold'
                    : 'text-rose-400 font-semibold'
                }
              >
                {features.snrProxy}× ({metrics.snrStatus.replace('_', ' ')})
              </span>
            </div>

            {/* 3 Segmented Color-Coded Stages */}
            <div className="grid grid-cols-3 gap-1.5">
              {/* Stage 1: Noise Floor (<6x) */}
              <div className="flex flex-col gap-1">
                <div className="h-2.5 w-full bg-slate-900 rounded-l overflow-hidden border border-slate-800">
                  <div
                    className="h-full bg-gradient-to-r from-rose-600 to-rose-400 transition-all duration-500"
                    style={{ width: `${stage1Fill}%` }}
                  />
                </div>
                <span className="text-[9px] font-mono text-rose-300">
                  STG 1: &lt;6× NOISE
                </span>
              </div>

              {/* Stage 2: Marginal Vetting (6-14x) */}
              <div className="flex flex-col gap-1">
                <div className="h-2.5 w-full bg-slate-900 overflow-hidden border border-slate-800">
                  <div
                    className="h-full bg-gradient-to-r from-amber-500 to-yellow-400 transition-all duration-500"
                    style={{ width: `${stage2Fill}%` }}
                  />
                </div>
                <span className="text-[9px] font-mono text-amber-300">
                  STG 2: 6–14× VET
                </span>
              </div>

              {/* Stage 3: High-Confidence Lock (>14x) */}
              <div className="flex flex-col gap-1">
                <div className="h-2.5 w-full bg-slate-900 rounded-r overflow-hidden border border-slate-800">
                  <div
                    className="h-full bg-gradient-to-r from-cyan-400 to-emerald-400 transition-all duration-500"
                    style={{ width: `${stage3Fill}%` }}
                  />
                </div>
                <span className="text-[9px] font-mono text-cyan-300">
                  STG 3: &gt;14× LOCK
                </span>
              </div>
            </div>
          </div>

          {/* 3. Phase Lock Indicator with breathing opacity modulation based on predicted transit period */}
          <div
            data-testid="ephemeris-phase-lock"
            style={
              {
                '--phase-pulse-duration': `${metrics.phaseLockBreathing.durationSeconds}s`,
                '--phase-min-opacity': metrics.phaseLockBreathing.minOpacity,
                '--phase-max-opacity': metrics.phaseLockBreathing.maxOpacity,
                animationDuration: `${metrics.phaseLockBreathing.durationSeconds}s`,
              } as React.CSSProperties
            }
            className={`rounded-md p-3 border flex flex-col gap-2 text-[11px] font-mono ${
              metrics.ephemerisPhaseLocked
                ? 'bg-emerald-950/35 border-emerald-500/50 text-emerald-300 phase-lock-breathing-locked'
                : 'bg-amber-950/35 border-amber-500/50 text-amber-300 phase-lock-breathing-unlocked'
            }`}
          >
            <div className="flex items-center justify-between gap-2">
              <div className="flex items-center gap-2 min-w-0">
                <Radio
                  style={{ animationDuration: `${metrics.phaseLockBreathing.durationSeconds}s` }}
                  className={`w-4 h-4 shrink-0 animate-spin ${
                    metrics.ephemerisPhaseLocked ? 'text-emerald-400' : 'text-amber-400'
                  }`}
                />
                <div className="truncate">
                  <div className="font-semibold truncate">{metrics.ephemerisLabel}</div>
                  <div
                    data-testid="phase-lock-sync-readout"
                    className="text-[10px] text-slate-300 truncate"
                  >
                    {metrics.phaseLockBreathing.syncStatusText}
                  </div>
                </div>
              </div>
              <span className="px-2 py-0.5 rounded bg-slate-950/90 border border-slate-800 text-[10px] shrink-0">
                {metrics.ephemerisPhaseLocked ? 'LOCKED' : 'UNLOCKED'}
              </span>
            </div>

            {/* Synchronized Breathing Opacity Modulation Bar */}
            <div className="flex items-center justify-between gap-2 pt-1.5 border-t border-slate-800/70 text-[10px]">
              <span className="text-slate-400 whitespace-nowrap">
                Opacity Modulation: {Math.round(metrics.phaseLockBreathing.minOpacity * 100)}%–100%
              </span>
              <div
                data-testid="phase-lock-opacity-wave"
                className="flex-1 h-1.5 bg-slate-950 rounded-full overflow-hidden border border-slate-800"
              >
                <div
                  style={{
                    animationDuration: `${metrics.phaseLockBreathing.durationSeconds}s`,
                  }}
                  className={`h-full w-full ${
                    metrics.ephemerisPhaseLocked
                      ? 'bg-gradient-to-r from-emerald-500 via-cyan-400 to-emerald-300 phase-lock-breathing-locked'
                      : 'bg-gradient-to-r from-amber-500 via-orange-400 to-yellow-300 phase-lock-breathing-unlocked'
                  }`}
                />
              </div>
            </div>
          </div>

          {/* 4. Resonance Check Indicator: Small-Integer Ratio Commensurability with Known Solar System Planets */}
          <div
            data-testid="resonance-check-indicator"
            className={`rounded-md p-3 border flex flex-col gap-1.5 text-[11px] font-mono ${
              metrics.resonanceCheck.isResonant
                ? 'bg-amber-950/45 border-amber-400/60 text-amber-200'
                : metrics.resonanceCheck.status === 'CLEAR_NON_RESONANT'
                ? 'bg-slate-950/85 border-cyan-500/30 text-slate-200'
                : 'bg-slate-950/75 border-slate-800 text-slate-400'
            }`}
          >
            <div className="flex items-center justify-between gap-2">
              <div className="flex items-center gap-2 min-w-0">
                {metrics.resonanceCheck.isResonant ? (
                  <AlertTriangle className="w-4 h-4 text-amber-400 shrink-0" />
                ) : (
                  <CheckCircle2 className="w-4 h-4 text-cyan-400 shrink-0" />
                )}
                <div className="truncate">
                  <div className="text-xs font-semibold text-slate-100 truncate">
                    Resonance Check ·{' '}
                    <span
                      data-testid="resonance-ratio-label"
                      className={
                        metrics.resonanceCheck.isResonant
                          ? 'text-amber-300'
                          : 'text-cyan-300'
                      }
                    >
                      {metrics.resonanceCheck.ratioLabel}
                    </span>
                  </div>
                  <div className="text-[10px] text-slate-400 truncate">
                    {metrics.resonanceCheck.headline}
                  </div>
                </div>
              </div>

              <span
                data-testid="resonance-check-status"
                className={`px-2 py-0.5 rounded border text-[10px] font-semibold shrink-0 ${
                  metrics.resonanceCheck.isResonant
                    ? 'bg-amber-950/90 border-amber-400/60 text-amber-300'
                    : metrics.resonanceCheck.status === 'CLEAR_NON_RESONANT'
                    ? 'bg-emerald-950/70 border-emerald-500/40 text-emerald-300'
                    : 'bg-slate-900 border-slate-700 text-slate-400'
                }`}
              >
                {metrics.resonanceCheck.isResonant
                  ? '⚠ RESONANCE WARNING'
                  : metrics.resonanceCheck.status === 'CLEAR_NON_RESONANT'
                  ? '● NON-RESONANT'
                  : '○ STANDBY'}
              </span>
            </div>

            <p
              data-testid="resonance-warning-message"
              className="text-[10px] font-sans text-slate-300 leading-snug pt-1 border-t border-slate-800/70"
            >
              {metrics.resonanceCheck.warningMessage}
            </p>
          </div>
        </aside>
      </div>

      {/* Bottom Row: 2D Photometric Disk Simulator (6/12) + Spectral Signature & Radius Breakdown (6/12) */}
      <div className="grid grid-cols-1 xl:grid-cols-12 gap-5">
        {/* Widget A: 2D Exoplanet Orbital Transit Simulator (6/12 cols) */}
        <div
          data-testid="exoplanet-transit-simulator"
          className="xl:col-span-6 cyber-glass telemetry-tilt-card spring-enter-2 rounded-lg p-4 flex flex-col justify-between gap-3"
        >
          <div className="flex items-center justify-between gap-2 border-b border-slate-800/80 pb-2">
            <div>
              <div className="flex items-center gap-1.5 text-[10px] font-mono text-cyan-400">
                <span>[SIM.ORBIT // 2D PHOTOMETRIC CROSS-SECTION]</span>
              </div>
              <h3 className="text-xs sm:text-sm font-semibold text-slate-100 mt-0.5 flex items-center gap-1.5">
                <Orbit className="w-3.5 h-3.5 text-cyan-400 shrink-0" />
                <span>2D Photometric Disk & Dip Synchronizer</span>
              </h3>
            </div>

            <div className="flex items-center gap-1.5">
              <button
                type="button"
                onClick={() => {
                  playTwinkleSound('toggle');
                  setSimSpeed((s) => (s === 1 ? 2 : 1));
                }}
                className="px-2 py-1 text-[10px] font-mono bg-slate-950 hover:bg-slate-800 text-slate-300 border border-slate-800 rounded transition-colors"
              >
                {simSpeed}x
              </button>
              <button
                type="button"
                onClick={() => {
                  playTwinkleSound('toggle');
                  setSimRunning((r) => !r);
                }}
                aria-label={simRunning ? 'Pause orbital simulator' : 'Play orbital simulator'}
                className="inline-flex items-center gap-1 px-2 py-1 text-[10px] font-mono bg-cyan-950/70 hover:bg-cyan-900/70 text-cyan-300 border border-cyan-500/40 rounded transition-colors"
              >
                {simRunning ? <Pause className="w-3 h-3" /> : <Play className="w-3 h-3" />}
                <span>{simRunning ? 'Live' : 'Paused'}</span>
              </button>
            </div>
          </div>

          <div className="relative bg-slate-950/90 border border-slate-800/90 rounded-md overflow-hidden flex flex-col items-center">
            <canvas
              ref={canvasRef}
              width={400}
              height={164}
              className="w-full h-[164px] block"
            />
            <div className="w-full px-3 py-1.5 bg-slate-950/95 border-t border-slate-800/80 flex items-center justify-between text-[10px] font-mono">
              <span
                className={
                  livePhaseLabel.includes('TRANSIT')
                    ? 'text-amber-300 font-semibold'
                    : 'text-cyan-300'
                }
              >
                ● {livePhaseLabel}
              </span>
              <span className="text-slate-400 tabular-nums">
                ΔF: -{features.transitDepthPpm.toLocaleString()} ppm ({features.dipShapeProfile.split(' ')[0]})
              </span>
            </div>
          </div>
        </div>

        {/* Widget C: Spectral Signature & Atmospheric Composition Bar (6/12 cols) */}
        <div
          data-testid="spectral-signature-bar"
          className="xl:col-span-6 cyber-glass telemetry-tilt-card spring-enter-3 rounded-lg p-4 flex flex-col justify-between gap-3"
        >
          <div className="border-b border-slate-800/80 pb-2">
            <div className="flex items-center gap-1.5 text-[10px] font-mono text-cyan-400">
              <span>[SPEC.SIG // RADIUS & ATMOSPHERE]</span>
            </div>
            <h3 className="text-xs sm:text-sm font-semibold text-slate-100 mt-0.5 flex items-center gap-1.5">
              <Compass className="w-3.5 h-3.5 text-cyan-400 shrink-0" />
              <span>Spectral Signature & Radius Breakdown</span>
            </h3>
          </div>

          {/* Planetary Radius (R_earth) & Equilibrium Temperature (K) Readout */}
          <div className="grid grid-cols-2 gap-2.5">
            <div className="bg-slate-950/85 border border-slate-800/90 rounded-md p-2.5">
              <div className="text-[10px] font-mono text-slate-400">
                EST. BODY RADIUS (R⊕)
              </div>
              <div className="mt-0.5 flex items-baseline gap-1 font-mono">
                <span
                  data-testid="estimated-radius-readout"
                  className="text-base font-bold text-cyan-300 tabular-nums"
                >
                  {metrics.planetRadiusEarth}
                </span>
                <span className="text-xs text-slate-400">R⊕</span>
              </div>
              <div className="text-[10px] text-slate-400 mt-0.5 truncate">
                {metrics.radiusRegimeLabel}
              </div>
            </div>

            <div className="bg-slate-950/85 border border-slate-800/90 rounded-md p-2.5">
              <div className="text-[10px] font-mono text-slate-400">
                EQUILIBRIUM TEMP (K)
              </div>
              <div className="mt-0.5 flex items-baseline gap-1 font-mono">
                <span
                  data-testid="equilibrium-temp-readout"
                  className="text-base font-bold text-amber-300 tabular-nums"
                >
                  {metrics.equilibriumTempK}
                </span>
                <span className="text-xs text-slate-400">K</span>
              </div>
              <div className="text-[10px] text-slate-400 mt-0.5 truncate">
                {metrics.thermalRegimeLabel}
              </div>
            </div>
          </div>

          {/* Spectral Composition & Atmospheric Probability Bars */}
          <div className="flex flex-col gap-2 bg-slate-950/80 border border-slate-800/80 rounded-md p-2.5">
            <div className="flex items-center justify-between text-[10px] font-mono text-slate-400">
              <span>INFERRED SPECTRAL SIGNATURE</span>
              <span className={isCandidate ? 'text-cyan-300' : 'text-amber-300'}>
                {isCandidate ? 'PLANETARY REGIME' : 'STELLAR / ARTIFACT REGIME'}
              </span>
            </div>

            {metrics.spectralComponents.map((comp) => (
              <div key={comp.label} className="flex flex-col gap-1">
                <div className="flex items-center justify-between text-[11px] font-mono">
                  <span className="text-slate-200 truncate">{comp.label}</span>
                  <span className="text-slate-400 shrink-0">
                    {comp.code} · <strong className="text-slate-200">{comp.percentage}%</strong>
                  </span>
                </div>
                <div className="w-full h-1.5 bg-slate-900 rounded-full overflow-hidden">
                  <div
                    className={`h-full bg-gradient-to-r ${comp.gradientClass}`}
                    style={{ width: `${comp.percentage}%` }}
                  />
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Bottom Terminal Section: Live Scrolling Mission Telemetry Logs */}
      <div
        data-testid="telemetry-logs-section"
        className="cyber-glass telemetry-tilt-card spring-enter-3 rounded-lg p-4 flex flex-col gap-3"
      >
        <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-800/80 pb-2.5">
          <div>
            <div className="flex items-center gap-2 text-[10px] font-mono text-cyan-400">
              <span>[SYS.STREAM // REAL-TIME MISSION EVENT LOGS]</span>
              <span className="text-slate-600">·</span>
              <span className="text-emerald-300">
                {logStreamPaused ? 'STREAM PAUSED' : 'LIVE TELEMETRY FEED'}
              </span>
            </div>
            <h3 className="text-xs sm:text-sm font-semibold text-slate-100 mt-0.5 flex items-center gap-1.5">
              <Terminal className="w-3.5 h-3.5 text-cyan-400 shrink-0" />
              <span>Telemetry Logs — Live Mission Control Event Stream</span>
            </h3>
          </div>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => {
                playTwinkleSound('toggle');
                setTelemetryLogs(
                  generateMissionTelemetryLogs(
                    features,
                    prediction,
                    activeSampleMeta,
                    metrics
                  )
                );
              }}
              className="inline-flex items-center gap-1 px-2.5 py-1 text-[10px] font-mono bg-slate-950 hover:bg-slate-800 text-slate-300 border border-slate-800 rounded transition-colors"
            >
              <RotateCcw className="w-3 h-3 text-cyan-400" />
              <span>Replay Sequence</span>
            </button>
            <button
              type="button"
              data-testid="toggle-telemetry-stream-button"
              onClick={() => {
                playTwinkleSound('toggle');
                setLogStreamPaused((p) => !p);
              }}
              className="inline-flex items-center gap-1 px-2.5 py-1 text-[10px] font-mono bg-cyan-950/70 hover:bg-cyan-900/70 text-cyan-300 border border-cyan-500/40 rounded transition-colors"
            >
              {logStreamPaused ? (
                <>
                  <Play className="w-3 h-3" />
                  <span>Resume Feed</span>
                </>
              ) : (
                <>
                  <Pause className="w-3 h-3" />
                  <span>Pause Feed</span>
                </>
              )}
            </button>
          </div>
        </div>

        {/* Scrolling Terminal Feed Viewport */}
        <div
          ref={terminalFeedRef}
          data-testid="telemetry-logs-feed"
          className="bg-[#030712]/95 border border-slate-800/90 rounded-md p-3 h-[156px] overflow-y-auto font-mono text-xs flex flex-col gap-1.5"
        >
          {telemetryLogs.map((log) => (
            <div
              key={log.id}
              data-testid="telemetry-log-entry"
              className="flex flex-wrap sm:flex-nowrap items-baseline gap-2 py-1 border-b border-slate-900/90 last:border-b-0 leading-relaxed"
            >
              <span className="text-[10px] text-slate-500 tabular-nums shrink-0">
                [{log.timestamp}]
              </span>
              <span
                className={`text-[10px] px-1.5 py-0.5 rounded border shrink-0 ${
                  log.level === 'success'
                    ? 'bg-emerald-950/60 border-emerald-500/40 text-emerald-300'
                    : log.level === 'warning'
                    ? 'bg-amber-950/60 border-amber-500/40 text-amber-300'
                    : 'bg-cyan-950/60 border-cyan-500/40 text-cyan-300'
                }`}
              >
                {log.subsystem}
              </span>
              <strong
                className={`text-[11px] shrink-0 ${
                  log.level === 'success'
                    ? 'text-emerald-300'
                    : log.level === 'warning'
                    ? 'text-amber-300'
                    : 'text-cyan-300'
                }`}
              >
                {log.eventTitle}:
              </strong>
              <span className="text-[11px] text-slate-300 break-words">
                {log.detail}
              </span>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
};
