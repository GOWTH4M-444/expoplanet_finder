import React, { useEffect, useMemo, useState } from 'react';
import {
  ResponsiveContainer,
  ComposedChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ReferenceArea,
  ReferenceLine,
  Brush,
} from 'recharts';
import { ZoomIn, ZoomOut, RotateCcw, Crosshair, Play, Pause } from 'lucide-react';
import {
  LightCurveFeatures,
  PreprocessingStats,
  ProcessedLightCurvePoint,
  SampleCurveMetadata,
} from '../types/exoplanet';
import { playTwinkleSound } from '../utils/sound';

interface LightCurveChartProps {
  points: ProcessedLightCurvePoint[];
  window2001: number[];
  features: LightCurveFeatures;
  stats: PreprocessingStats;
  activeSampleMeta: SampleCurveMetadata | null;
  customFileName: string | null;
  medianWindowSize: number;
  onMedianWindowChange: (newWindowSize: number) => void;
  showTransitMarkers: boolean;
  onToggleTransitMarkers: () => void;
  isPlaying: boolean;
  onTogglePlay: () => void;
}

type ChartViewMode = 'detrended' | 'raw_with_trend' | 'cnn_tensor_2001';

export const LightCurveChart: React.FC<LightCurveChartProps> = ({
  points,
  window2001,
  features,
  stats,
  activeSampleMeta,
  customFileName,
  medianWindowSize,
  onMedianWindowChange,
  showTransitMarkers,
  onToggleTransitMarkers,
  isPlaying,
  onTogglePlay,
}) => {
  const [viewMode, setViewMode] = useState<ChartViewMode>('detrended');
  const [zoomRange, setZoomRange] = useState<{ startIndex: number; endIndex: number } | null>(null);
  const [scanStep, setScanStep] = useState<number>(0);

  const activeSeries = useMemo(() => {
    if (viewMode === 'cnn_tensor_2001') {
      return window2001.map((flux, idx) => ({
        index: idx,
        xValue: idx,
        normalizedFlux: flux,
        rawFlux: flux,
        trendBaseline: 1.0,
        inTransitWindow: idx >= 880 && idx <= 1120,
      }));
    }
    return points.map((p) => ({
      ...p,
      xValue: p.time,
    }));
  }, [points, window2001, viewMode]);

  const totalLen = activeSeries.length;
  const startIdx = zoomRange ? Math.max(0, Math.min(zoomRange.startIndex, totalLen - 2)) : 0;
  const endIdx = zoomRange
    ? Math.min(totalLen - 1, Math.max(zoomRange.endIndex, startIdx + 5))
    : totalLen - 1;

  const visibleData = useMemo(() => {
    return activeSeries.slice(startIdx, endIdx + 1);
  }, [activeSeries, startIdx, endIdx]);

  // Advance playhead across visibleData when isPlaying is true
  useEffect(() => {
    if (!isPlaying || visibleData.length === 0) return;
    const timer = window.setInterval(() => {
      setScanStep((prev) => (prev + 8) % visibleData.length);
    }, 120);
    return () => window.clearInterval(timer);
  }, [isPlaying, visibleData.length]);

  const activeScanPoint =
    visibleData.length > 0 ? visibleData[scanStep % visibleData.length] : null;

  const yDomain = useMemo(() => {
    if (visibleData.length === 0) return [0.995, 1.005];
    let minVal = Infinity;
    let maxVal = -Infinity;
    for (const d of visibleData) {
      const v = viewMode === 'raw_with_trend' ? d.rawFlux : d.normalizedFlux;
      if (v < minVal) minVal = v;
      if (v > maxVal) maxVal = v;
    }
    const span = Math.max(maxVal - minVal, 0.0008);
    const pad = span * 0.18;
    return [Number((minVal - pad).toFixed(6)), Number((maxVal + pad).toFixed(6))];
  }, [visibleData, viewMode]);

  const handleZoomIn = () => {
    playTwinkleSound('toggle');
    const currentSpan = endIdx - startIdx;
    if (currentSpan <= 30) return;
    const quarter = Math.max(5, Math.floor(currentSpan * 0.22));
    setZoomRange({
      startIndex: startIdx + quarter,
      endIndex: endIdx - quarter,
    });
  };

  const handleZoomOut = () => {
    playTwinkleSound('toggle');
    if (!zoomRange) return;
    const currentSpan = endIdx - startIdx;
    const expand = Math.max(15, Math.floor(currentSpan * 0.35));
    const nextStart = Math.max(0, startIdx - expand);
    const nextEnd = Math.min(totalLen - 1, endIdx + expand);
    if (nextStart === 0 && nextEnd === totalLen - 1) {
      setZoomRange(null);
    } else {
      setZoomRange({ startIndex: nextStart, endIndex: nextEnd });
    }
  };

  const handleFocusPrimaryTransit = () => {
    playTwinkleSound('chime');
    if (viewMode === 'cnn_tensor_2001') {
      setZoomRange({ startIndex: 750, endIndex: 1250 });
      return;
    }
    if (!features.primaryTransitWindow) return;
    const win = features.primaryTransitWindow;
    const span = Math.max(30, (win.endIndex - win.startIndex) * 3);
    const center = Math.floor((win.startIndex + win.endIndex) / 2);
    setZoomRange({
      startIndex: Math.max(0, center - span),
      endIndex: Math.min(totalLen - 1, center + span),
    });
  };

  const handleResetZoom = () => {
    playTwinkleSound('toggle');
    setZoomRange(null);
  };

  const primaryWin = features.primaryTransitWindow;
  const isOverSmoothingWarning = medianWindowSize <= 37;
  const isUnderDetrending = medianWindowSize >= 205;

  const transitMarkerBounds = useMemo(() => {
    if (!primaryWin) return null;
    if (viewMode === 'cnn_tensor_2001') {
      const scale = 2000 / Math.max(1, points.length - 1);
      return {
        x1: Math.round(primaryWin.startIndex * scale),
        x2: Math.round(primaryWin.endIndex * scale),
        center: Math.round(((primaryWin.startIndex + primaryWin.endIndex) / 2) * scale),
      };
    }
    return {
      x1: primaryWin.startTime,
      x2: primaryWin.endTime,
      center: primaryWin.centerTime,
    };
  }, [primaryWin, viewMode, points.length]);

  return (
    <section
      aria-label="Interactive Kepler Light Curve Visualization"
      className="cyber-glass telemetry-tilt-card spring-enter-1 rounded-lg p-5 flex flex-col gap-4 relative z-10"
    >
      {/* Header Row: Target Title, Metadata & View Controls */}
      <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4 border-b border-slate-800/80 pb-4">
        <div>
          <div className="flex flex-wrap items-center gap-2 text-xs text-slate-400 font-mono">
            <span className="inline-flex items-center gap-1.5 text-cyan-400">
              <span className="w-1.5 h-1.5 rounded-full bg-cyan-400 animate-pulse" />
              <span>[TEL.KEPLER // PHOTOMETRIC STREAM]</span>
            </span>
            <span aria-hidden="true">·</span>
            <span>{activeSampleMeta ? activeSampleMeta.kicId : 'CUSTOM UPLOAD'}</span>
            <span aria-hidden="true">·</span>
            <span>{activeSampleMeta ? activeSampleMeta.koiId : customFileName || 'CSV Segment'}</span>
            <span aria-hidden="true">·</span>
            <span>{stats.initialRowCount.toLocaleString()} measurements</span>
            <span aria-hidden="true">·</span>
            <span>{stats.timeSpanDays} days observed</span>
            {activeSampleMeta && (
              <>
                <span aria-hidden="true">·</span>
                <span
                  className={
                    activeSampleMeta.isConfirmedPlanet ? 'text-cyan-400' : 'text-amber-400'
                  }
                >
                  {activeSampleMeta.dispositionLabel}
                </span>
              </>
            )}
          </div>
          <h2 className="text-lg font-semibold text-slate-100 mt-1">
            {activeSampleMeta ? activeSampleMeta.name : customFileName || 'Uploaded Light Curve'}{' '}
            — Starlight Brightness Over Time
          </h2>
        </div>

        {/* Segmented View Mode Control */}
        <div className="flex flex-wrap items-center gap-2">
          <div
            role="group"
            aria-label="Light curve display mode"
            className="flex items-center bg-slate-950/90 border border-slate-800 rounded-md p-0.5"
          >
            <button
              type="button"
              onClick={() => {
                playTwinkleSound('tab');
                setViewMode('detrended');
                setZoomRange(null);
              }}
              className={`px-3 py-1.5 text-xs font-medium rounded transition-colors whitespace-nowrap shrink-0 ${
                viewMode === 'detrended'
                  ? 'bg-cyan-500/20 text-cyan-300 border border-cyan-500/40'
                  : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              Cleaned Brightness
            </button>
            <button
              type="button"
              onClick={() => {
                playTwinkleSound('tab');
                setViewMode('raw_with_trend');
                setZoomRange(null);
              }}
              className={`px-3 py-1.5 text-xs font-medium rounded transition-colors whitespace-nowrap shrink-0 ${
                viewMode === 'raw_with_trend'
                  ? 'bg-cyan-500/20 text-cyan-300 border border-cyan-500/40'
                  : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              Raw Flux + Smooth Trend
            </button>
            <button
              type="button"
              onClick={() => {
                playTwinkleSound('tab');
                setViewMode('cnn_tensor_2001');
                setZoomRange(null);
              }}
              className={`px-3 py-1.5 text-xs font-medium rounded transition-colors whitespace-nowrap shrink-0 ${
                viewMode === 'cnn_tensor_2001'
                  ? 'bg-cyan-500/20 text-cyan-300 border border-cyan-500/40'
                  : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              2,001-Pt Model Input
            </button>
          </div>
        </div>
      </div>

      {/* Interactive Rolling Median Filter Window Size Control Bar */}
      <div
        data-testid="median-filter-control-bar"
        className="bg-slate-950/85 border border-slate-800/90 rounded-md p-3.5 flex flex-col gap-2.5"
      >
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
          <div className="flex flex-wrap items-center gap-2">
            <label
              htmlFor="median-filter-window-slider"
              className="text-xs font-semibold text-slate-200"
            >
              Noise Filtering Window (Rolling Median):
            </label>
            <span
              data-testid="median-window-readout"
              className="text-xs font-mono font-semibold text-cyan-300 tabular-nums"
            >
              {stats.medianWindowSize} pts ({stats.medianWindowHours} hrs)
            </span>
            <span aria-hidden="true" className="text-slate-600">
              ·
            </span>
            <span
              className={`text-xs font-mono ${
                isOverSmoothingWarning
                  ? 'text-amber-300'
                  : isUnderDetrending
                  ? 'text-slate-300'
                  : 'text-cyan-400'
              }`}
            >
              {isOverSmoothingWarning
                ? '▲ Too Narrow: Traces inside the dip & erases the planet signal'
                : isUnderDetrending
                ? '· Very Wide: Gentle smoothing of slow starspot waves'
                : '● Balanced: Removes slow starlight waves while keeping the transit dip sharp'}
            </span>
          </div>

          {/* Preset Filter Window Buttons */}
          <div className="flex items-center gap-1.5 shrink-0">
            <button
              type="button"
              onClick={() => {
                playTwinkleSound('toggle');
                onMedianWindowChange(9);
              }}
              className={`px-2 py-1 text-[11px] font-mono rounded border transition-colors whitespace-nowrap ${
                medianWindowSize === 9
                  ? 'bg-amber-500/20 border-amber-500/50 text-amber-300'
                  : 'bg-slate-900 border-slate-800 text-slate-400 hover:text-slate-200'
              }`}
            >
              Narrow (9 pts)
            </button>
            <button
              type="button"
              onClick={() => {
                playTwinkleSound('toggle');
                onMedianWindowChange(141);
              }}
              className={`px-2 py-1 text-[11px] font-mono rounded border transition-colors whitespace-nowrap ${
                medianWindowSize === 141
                  ? 'bg-cyan-500/20 border-cyan-500/50 text-cyan-300'
                  : 'bg-slate-900 border-slate-800 text-slate-400 hover:text-slate-200'
              }`}
            >
              Optimal (141 pts)
            </button>
            <button
              type="button"
              onClick={() => {
                playTwinkleSound('toggle');
                onMedianWindowChange(233);
              }}
              className={`px-2 py-1 text-[11px] font-mono rounded border transition-colors whitespace-nowrap ${
                medianWindowSize === 233
                  ? 'bg-cyan-500/20 border-cyan-500/50 text-cyan-300'
                  : 'bg-slate-900 border-slate-800 text-slate-400 hover:text-slate-200'
              }`}
            >
              Wide (233 pts)
            </button>
          </div>
        </div>

        <div className="flex items-center gap-3">
          <span className="text-[11px] font-mono text-slate-400 whitespace-nowrap">9 pts (2.2h)</span>
          <input
            id="median-filter-window-slider"
            type="range"
            min={9}
            max={241}
            step={4}
            value={medianWindowSize}
            onChange={(e) => onMedianWindowChange(Number(e.target.value))}
            aria-label="Median Filter Window Size"
            className="w-full h-1.5 bg-slate-800 rounded-lg appearance-none cursor-pointer accent-cyan-400"
          />
          <span className="text-[11px] font-mono text-slate-400 whitespace-nowrap">
            241 pts (60.2h)
          </span>
        </div>
      </div>

      {/* Interactive Zoom + Play/Pause Scan (Space) + Transit Window Marker Toggle Switch (M) */}
      <div className="flex flex-wrap items-center justify-between gap-3 text-xs">
        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            data-testid="play-pause-scan-button"
            aria-pressed={isPlaying}
            onClick={onTogglePlay}
            className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded border font-medium transition-colors whitespace-nowrap shrink-0 ${
              isPlaying
                ? 'bg-cyan-500/25 border-cyan-400 text-cyan-200'
                : 'bg-slate-950 hover:bg-slate-800 border-slate-800 text-slate-200'
            }`}
          >
            {isPlaying ? (
              <>
                <Pause className="w-3.5 h-3.5 text-cyan-300" />
                <span>Pause Scan (Space)</span>
              </>
            ) : (
              <>
                <Play className="w-3.5 h-3.5 text-cyan-400" />
                <span>Play Scan (Space)</span>
              </>
            )}
          </button>

          <button
            type="button"
            onClick={handleZoomIn}
            aria-label="Zoom in light curve"
            className="inline-flex items-center gap-1.5 px-2.5 py-1.5 bg-slate-950 hover:bg-slate-800 text-slate-200 border border-slate-800 rounded transition-colors whitespace-nowrap shrink-0"
          >
            <ZoomIn className="w-3.5 h-3.5 text-cyan-400" />
            <span>Zoom In</span>
          </button>
          <button
            type="button"
            onClick={handleZoomOut}
            disabled={!zoomRange}
            aria-label="Zoom out light curve"
            className="inline-flex items-center gap-1.5 px-2.5 py-1.5 bg-slate-950 hover:bg-slate-800 disabled:opacity-40 text-slate-200 border border-slate-800 rounded transition-colors whitespace-nowrap shrink-0"
          >
            <ZoomOut className="w-3.5 h-3.5 text-cyan-400" />
            <span>Zoom Out</span>
          </button>
          {primaryWin && (
            <button
              type="button"
              onClick={handleFocusPrimaryTransit}
              className="inline-flex items-center gap-1.5 px-2.5 py-1.5 bg-cyan-950/60 hover:bg-cyan-900/60 text-cyan-300 border border-cyan-500/40 rounded transition-colors whitespace-nowrap shrink-0"
            >
              <Crosshair className="w-3.5 h-3.5" />
              <span>Zoom to Main Dip ({primaryWin.centerTime} d)</span>
            </button>
          )}
          {zoomRange && (
            <button
              type="button"
              onClick={handleResetZoom}
              className="inline-flex items-center gap-1.5 px-2.5 py-1.5 bg-slate-950 hover:bg-slate-800 text-amber-300 border border-amber-500/40 rounded transition-colors whitespace-nowrap shrink-0"
            >
              <RotateCcw className="w-3.5 h-3.5" />
              <span>Reset Full View</span>
            </button>
          )}
        </div>

        {/* Dedicated Toggle Switch for Predicted Transit Window Markers */}
        <div className="flex items-center gap-2.5 bg-slate-950/90 border border-slate-800 rounded-md px-3 py-1.5">
          <span
            id="transit-window-switch-label"
            className="text-xs font-medium text-slate-200 whitespace-nowrap"
          >
            Show Transit Window Markers (M)
          </span>
          <button
            type="button"
            role="switch"
            aria-checked={showTransitMarkers}
            aria-labelledby="transit-window-switch-label"
            data-testid="transit-window-toggle-switch"
            onClick={onToggleTransitMarkers}
            className={`relative inline-flex h-5 w-9 shrink-0 cursor-pointer rounded-full border transition-colors duration-150 focus:outline-none ${
              showTransitMarkers
                ? 'bg-amber-500/30 border-amber-400'
                : 'bg-slate-800 border-slate-700'
            }`}
          >
            <span
              className={`pointer-events-none inline-block h-3.5 w-3.5 transform rounded-full transition-transform duration-150 mt-0.5 ${
                showTransitMarkers
                  ? 'translate-x-4 bg-amber-300'
                  : 'translate-x-0.5 bg-slate-400'
              }`}
            />
          </button>
          <span className="text-[11px] font-mono text-slate-400 w-7">
            {showTransitMarkers ? 'ON' : 'OFF'}
          </span>
        </div>
      </div>

      {/* Live Scanner Telemetry Banner when Play Scan (Space) is active */}
      {isPlaying && activeScanPoint && (
        <div
          data-testid="live-scan-readout"
          className="bg-cyan-950/40 border border-cyan-500/40 rounded px-3 py-2 text-xs font-mono text-cyan-200 flex flex-wrap items-center justify-between gap-2"
        >
          <span>
            ▶ LIVE TIME-SERIES SCANNER ACTIVE (Press Space to Pause)
          </span>
          <span className="tabular-nums">
            {viewMode === 'cnn_tensor_2001'
              ? `Point #${activeScanPoint.xValue}`
              : `Day ${Number(activeScanPoint.xValue).toFixed(3)} d`}{' '}
            · Flux: {Number(activeScanPoint.normalizedFlux).toFixed(6)} (
            {Math.round((activeScanPoint.normalizedFlux - 1) * 1e6)} ppm)
          </span>
        </div>
      )}

      {/* Main Recharts Canvas Stage */}
      <div
        data-testid="light-curve-chart-container"
        className="w-full h-[340px] bg-[#07090E] border border-slate-800/80 rounded-md p-2 cursor-crosshair"
      >
        <ResponsiveContainer width="100%" height="100%">
          <ComposedChart data={visibleData} margin={{ top: 12, right: 18, left: 10, bottom: 8 }}>
            <CartesianGrid stroke="#1E293B" strokeDasharray="3 3" vertical={false} />
            <XAxis
              dataKey="xValue"
              type="number"
              domain={['dataMin', 'dataMax']}
              tick={{ fill: '#94A3B8', fontSize: 11, fontFamily: 'IBM Plex Mono' }}
              tickFormatter={(val: number) =>
                viewMode === 'cnn_tensor_2001' ? `#${Math.round(val)}` : `${val.toFixed(2)}d`
              }
              stroke="#334155"
            />
            <YAxis
              domain={yDomain}
              tick={{ fill: '#94A3B8', fontSize: 11, fontFamily: 'IBM Plex Mono' }}
              tickFormatter={(val: number) => val.toFixed(4)}
              stroke="#334155"
              width={66}
            />
            <Tooltip
              content={({ active, payload }) => {
                if (!active || !payload || payload.length === 0) return null;
                const row = payload[0].payload;
                const deltaPpm = Math.round((row.normalizedFlux - 1.0) * 1e6);
                return (
                  <div className="bg-slate-950/95 border border-slate-700 rounded px-3 py-2 text-xs font-mono shadow-lg">
                    <div className="text-slate-400">
                      {viewMode === 'cnn_tensor_2001'
                        ? `Model Point: #${row.xValue} of 2000`
                        : `Observation Day: ${Number(row.xValue).toFixed(4)} d`}
                    </div>
                    <div className="text-cyan-300 font-semibold mt-0.5">
                      Relative Brightness: {Number(row.normalizedFlux).toFixed(6)} ({deltaPpm >= 0 ? `+${deltaPpm}` : deltaPpm} ppm)
                    </div>
                    {viewMode === 'raw_with_trend' && (
                      <div className="text-amber-300 mt-0.5">
                        Smooth Trend Line: {Number(row.trendBaseline).toFixed(6)}
                      </div>
                    )}
                    {showTransitMarkers && row.inTransitWindow && (
                      <div className="text-amber-400 mt-0.5">▲ Inside Predicted Transit Window</div>
                    )}
                  </div>
                );
              }}
            />

            {/* Baseline Median 1.0000 Reference Line */}
            <ReferenceLine
              y={1.0}
              stroke="#475569"
              strokeDasharray="4 4"
              ifOverflow="extendDomain"
            />

            {/* Live Scanner Playhead Line when Playing */}
            {isPlaying && activeScanPoint && (
              <ReferenceLine
                x={activeScanPoint.xValue}
                stroke="#22D3EE"
                strokeWidth={2}
                label={{
                  value: 'Scan',
                  position: 'insideTopLeft',
                  fill: '#22D3EE',
                  fontSize: 10,
                }}
              />
            )}

            {/* Highlighted Predicted Transit Window Markers (Controlled by Toggle Switch) */}
            {showTransitMarkers && transitMarkerBounds && (
              <>
                <ReferenceArea
                  x1={transitMarkerBounds.x1}
                  x2={transitMarkerBounds.x2}
                  fill="#F59E0B"
                  fillOpacity={0.14}
                  stroke="#F59E0B"
                  strokeOpacity={0.45}
                />
                <ReferenceLine
                  x={transitMarkerBounds.center}
                  stroke="#F59E0B"
                  strokeDasharray="2 2"
                  label={{
                    value: 'Predicted Transit Window',
                    position: 'insideTopRight',
                    fill: '#FBBF24',
                    fontSize: 10,
                  }}
                />
              </>
            )}

            {viewMode === 'raw_with_trend' ? (
              <>
                <Line
                  type="monotone"
                  dataKey="rawFlux"
                  name="Raw Brightness"
                  stroke="#38BDF8"
                  strokeWidth={1.25}
                  dot={false}
                  isAnimationActive={false}
                />
                <Line
                  type="monotone"
                  dataKey="trendBaseline"
                  name="Rolling Median Trend"
                  stroke="#F59E0B"
                  strokeWidth={2}
                  dot={false}
                  isAnimationActive={false}
                />
              </>
            ) : (
              <Line
                type="monotone"
                dataKey="normalizedFlux"
                name="Cleaned Brightness"
                stroke="#06B6D4"
                strokeWidth={1.5}
                dot={false}
                isAnimationActive={false}
              />
            )}

            <Brush
              dataKey="xValue"
              height={24}
              stroke="#06B6D4"
              fill="#0B0F19"
              travellerWidth={8}
              tickFormatter={(val: number) =>
                viewMode === 'cnn_tensor_2001' ? `${Math.round(val)}` : `${Number(val).toFixed(1)}d`
              }
            />
          </ComposedChart>
        </ResponsiveContainer>
      </div>

      {/* Computed Photometric Features Telemetry Strip */}
      <div className="grid grid-cols-2 sm:grid-cols-3 xl:grid-cols-5 gap-3 pt-1">
        <div className="bg-slate-950/80 border border-slate-800/90 rounded p-3">
          <div className="text-xs text-slate-400">Brightness Drop (Depth)</div>
          <div className="mt-1 flex items-baseline gap-1.5">
            <span className="text-xl font-semibold font-mono tabular-nums text-slate-100">
              {features.transitDepthPpm.toLocaleString()}
            </span>
            <span className="text-xs font-mono text-slate-400">ppm</span>
          </div>
          <div className="text-xs font-mono text-cyan-400 mt-0.5 tabular-nums">
            {features.transitDepthPercent}% starlight blocked
          </div>
        </div>

        <div className="bg-slate-950/80 border border-slate-800/90 rounded p-3">
          <div className="text-xs text-slate-400">Dip Duration</div>
          <div className="mt-1 flex items-baseline gap-1.5">
            <span className="text-xl font-semibold font-mono tabular-nums text-slate-100">
              {features.transitDurationHours}
            </span>
            <span className="text-xs font-mono text-slate-400">hrs</span>
          </div>
          <div className="text-xs font-mono text-slate-400 mt-0.5">
            {features.dipShapeProfile}
          </div>
        </div>

        <div className="bg-slate-950/80 border border-slate-800/90 rounded p-3">
          <div className="text-xs text-slate-400">Repeat Cycle (Period)</div>
          <div className="mt-1 flex items-baseline gap-1.5">
            <span className="text-xl font-semibold font-mono tabular-nums text-slate-100">
              {features.estimatedPeriodDays !== null ? features.estimatedPeriodDays : '—'}
            </span>
            {features.estimatedPeriodDays !== null && (
              <span className="text-xs font-mono text-slate-400">days</span>
            )}
          </div>
          <div className="text-xs font-mono text-slate-400 mt-0.5">
            {features.estimatedPeriodDays !== null ? 'Time between dips' : 'Single / non-repeating'}
          </div>
        </div>

        <div className="bg-slate-950/80 border border-slate-800/90 rounded p-3">
          <div className="text-xs text-slate-400">Signal Clarity (SNR)</div>
          <div className="mt-1 flex items-baseline gap-1.5">
            <span className="text-xl font-semibold font-mono tabular-nums text-slate-100">
              {features.snrProxy}
            </span>
            <span className="text-xs font-mono text-slate-400">× noise</span>
          </div>
          <div className="text-xs font-mono text-slate-400 mt-0.5 tabular-nums">
            Background jitter: {features.baselineScatterPpm} ppm
          </div>
        </div>

        <div className="bg-slate-950/80 border border-slate-800/90 rounded p-3 col-span-2 sm:col-span-1">
          <div className="text-xs text-slate-400">Detected Dips</div>
          <div className="mt-1 flex items-baseline gap-1.5">
            <span className="text-xl font-semibold font-mono tabular-nums text-slate-100">
              {features.dipCount}
            </span>
            <span className="text-xs font-mono text-slate-400">dips</span>
          </div>
          <div className="text-xs font-mono text-slate-400 mt-0.5">
            {features.secondaryEclipseDetected ? '▲ Secondary star dip seen' : '● Clean single-planet pattern'}
          </div>
        </div>
      </div>

      {/* Preprocessing Pipeline Summary Bar */}
      <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-slate-400 bg-slate-950/60 border border-slate-800/70 rounded px-3 py-2 font-mono">
        <span>
          Spacecraft Cleaned Brightness Pipeline: Sorted by time · {stats.nanRemovedCount} empty points removed ·{' '}
          {stats.interpolatedGapCount} small gaps filled · Noise Filter ({stats.medianWindowSize} pts) · Resized to{' '}
          {stats.outputWindowLength} pts
        </span>
        <span className="text-cyan-400">Normal Starlight = 1.000000</span>
      </div>
    </section>
  );
};
