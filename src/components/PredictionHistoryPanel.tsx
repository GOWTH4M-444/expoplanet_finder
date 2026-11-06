import React, { useState } from 'react';
import { History, ChevronDown, ChevronUp, Sparkles, Trash2 } from 'lucide-react';
import { PredictionHistoryEntry } from '../utils/missionTelemetry';
import { playTwinkleSound } from '../utils/sound';

interface PredictionHistoryPanelProps {
  history: PredictionHistoryEntry[];
  activeSampleId: string;
  onSelectHistorySample: (sampleId: string) => void;
  onPopulateComparisonDeck: () => void;
  onClearHistory: () => void;
}

export const PredictionHistoryPanel: React.FC<PredictionHistoryPanelProps> = ({
  history,
  activeSampleId,
  onSelectHistorySample,
  onPopulateComparisonDeck,
  onClearHistory,
}) => {
  const [isExpanded, setIsExpanded] = useState<boolean>(true);

  return (
    <section
      aria-label="Prediction History Comparison Log"
      data-testid="prediction-history-panel"
      className="cyber-glass telemetry-tilt-card spring-enter-2 rounded-lg p-4 flex flex-col gap-3"
    >
      {/* Header with Cyber-Tag & Collapsible Toggle */}
      <div className="flex items-center justify-between gap-2 border-b border-slate-800/80 pb-2.5">
        <div className="min-w-0">
          <div className="flex items-center gap-1.5 text-[10px] font-mono text-cyan-400">
            <span className="w-1.5 h-1.5 rounded-full bg-cyan-400 animate-pulse shrink-0" />
            <span className="truncate">[HIST.LOG // {history.length}/5 SAMPLES]</span>
          </div>
          <h2 className="text-sm font-semibold text-slate-100 mt-0.5 flex items-center gap-1.5">
            <History className="w-3.5 h-3.5 text-cyan-400 shrink-0" />
            <span>Prediction History</span>
          </h2>
        </div>

        <div className="flex items-center gap-1.5 shrink-0">
          {history.length < 5 && (
            <button
              type="button"
              data-testid="populate-5-history-button"
              onClick={() => {
                playTwinkleSound('chime');
                onPopulateComparisonDeck();
                setIsExpanded(true);
              }}
              title="Run and log 5 built-in Kepler star samples for instant side-by-side comparison"
              className="inline-flex items-center gap-1 px-2 py-1 text-[10px] font-mono bg-cyan-950/70 hover:bg-cyan-900/80 text-cyan-300 border border-cyan-500/40 rounded transition-colors whitespace-nowrap"
            >
              <Sparkles className="w-3 h-3 text-cyan-400" />
              <span>Compare 5</span>
            </button>
          )}
          <button
            type="button"
            data-testid="prediction-history-toggle"
            aria-expanded={isExpanded}
            onClick={() => {
              playTwinkleSound('toggle');
              setIsExpanded((prev) => !prev);
            }}
            className="inline-flex items-center gap-1 px-2 py-1 text-[11px] font-mono bg-slate-950/90 hover:bg-slate-800 text-slate-300 border border-slate-800 rounded transition-colors"
          >
            <span>{isExpanded ? 'Collapse' : 'Expand'}</span>
            {isExpanded ? (
              <ChevronUp className="w-3.5 h-3.5 text-cyan-400" />
            ) : (
              <ChevronDown className="w-3.5 h-3.5 text-cyan-400" />
            )}
          </button>
        </div>
      </div>

      {isExpanded && (
        <div className="flex flex-col gap-2.5">
          <div className="flex items-center justify-between text-[11px] text-slate-400">
            <span>Last 5 classified star segments</span>
            {history.length > 1 && (
              <button
                type="button"
                onClick={() => {
                  playTwinkleSound('toggle');
                  onClearHistory();
                }}
                className="inline-flex items-center gap-1 text-[10px] font-mono text-slate-400 hover:text-rose-300 transition-colors"
              >
                <Trash2 className="w-3 h-3" />
                <span>Reset</span>
              </button>
            )}
          </div>

          <div
            data-testid="prediction-history-list"
            className="flex flex-col gap-2"
          >
            {history.map((item, idx) => {
              const isCurrent = item.sampleId === activeSampleId;
              const isCandidate = item.predictedClass === 'Planet candidate';
              const probPercent = (item.probability * 100).toFixed(1);

              return (
                <div
                  key={item.id}
                  data-testid="prediction-history-item"
                  onClick={() => {
                    if (!item.isCustomCsv) {
                      onSelectHistorySample(item.sampleId);
                    }
                  }}
                  role={item.isCustomCsv ? undefined : 'button'}
                  tabIndex={item.isCustomCsv ? undefined : 0}
                  onKeyDown={(e) => {
                    if (!item.isCustomCsv && (e.key === 'Enter' || e.key === ' ')) {
                      e.preventDefault();
                      onSelectHistorySample(item.sampleId);
                    }
                  }}
                  className={`p-2.5 rounded-md border transition-all ${
                    item.isCustomCsv ? '' : 'cursor-pointer'
                  } ${
                    isCurrent
                      ? 'bg-cyan-950/45 border-cyan-400/80 breathing-cyan-glow'
                      : 'bg-slate-950/75 border-slate-800/90 hover:border-slate-700'
                  }`}
                >
                  {/* Row 1: Slot index, Sample Name, KIC ID */}
                  <div className="flex items-center justify-between gap-2">
                    <div className="flex items-center gap-1.5 min-w-0">
                      <span className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-slate-900 border border-slate-800 text-cyan-300 shrink-0">
                        #{idx + 1}
                      </span>
                      <span className="text-xs font-semibold text-slate-100 truncate">
                        {item.sampleName}
                      </span>
                    </div>
                    <span className="text-[10px] font-mono text-slate-400 shrink-0">
                      {item.kicId}
                    </span>
                  </div>

                  {/* Row 2: Verdict Pill + Transit Probability */}
                  <div className="mt-1.5 flex items-center justify-between gap-2 text-[11px] font-mono">
                    <span
                      className={`font-semibold ${
                        isCandidate ? 'text-cyan-300' : 'text-amber-300'
                      }`}
                    >
                      {isCandidate ? '● Planet Candidate' : '▲ False Positive'}
                    </span>
                    <span className="text-slate-200 tabular-nums">
                      {probPercent}% ({item.confidence})
                    </span>
                  </div>

                  {/* Probability comparison bar */}
                  <div className="mt-1.5 w-full h-1.5 bg-slate-900 rounded-full overflow-hidden border border-slate-800/80">
                    <div
                      className={`h-full transition-all duration-500 ${
                        isCandidate
                          ? 'bg-gradient-to-r from-cyan-500 to-emerald-400'
                          : 'bg-gradient-to-r from-amber-500 to-rose-500'
                      }`}
                      style={{ width: `${Math.max(4, Math.min(100, item.probability * 100))}%` }}
                    />
                  </div>

                  {/* Row 3: Quick Comparison Telemetry Chips */}
                  <div className="mt-2 grid grid-cols-3 gap-1.5 pt-1.5 border-t border-slate-800/70 text-[10px] font-mono text-slate-400">
                    <div>
                      <span className="text-slate-500 block">DEPTH</span>
                      <span className="text-slate-200 tabular-nums">
                        {item.transitDepthPpm.toLocaleString()} ppm
                      </span>
                    </div>
                    <div>
                      <span className="text-slate-500 block">RADIUS</span>
                      <span className="text-slate-200 tabular-nums">
                        {item.planetRadiusEarth} R⊕
                      </span>
                    </div>
                    <div>
                      <span className="text-slate-500 block">PERIOD</span>
                      <span className="text-slate-200 tabular-nums">
                        {item.estimatedPeriodDays ? `${item.estimatedPeriodDays}d` : 'Single'}
                      </span>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </section>
  );
};
