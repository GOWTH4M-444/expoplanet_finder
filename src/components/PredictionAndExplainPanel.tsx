import React, { useState } from 'react';
import { RefreshCw, Send, HelpCircle, AlertTriangle } from 'lucide-react';
import {
  ExplanationResult,
  LightCurveFeatures,
  PredictionResult,
  SampleCurveMetadata,
} from '../types/exoplanet';
import { playTwinkleSound } from '../utils/sound';

interface PredictionAndExplainPanelProps {
  prediction: PredictionResult | null;
  isPredicting: boolean;
  explanation: ExplanationResult | null;
  isExplaining: boolean;
  features: LightCurveFeatures;
  activeSampleMeta: SampleCurveMetadata | null;
  onRefreshExplanation: () => void;
}

const PRESET_QUESTIONS = [
  'Why can two eclipsing stars look like a planet transit?',
  'What follow-up telescope checks would confirm this candidate?',
  'How does the 1D CNN read the shape of this dip?',
];

export const PredictionAndExplainPanel: React.FC<PredictionAndExplainPanelProps> = ({
  prediction,
  isPredicting,
  explanation,
  isExplaining,
  features,
  activeSampleMeta,
  onRefreshExplanation,
}) => {
  const [questionInput, setQuestionInput] = useState('');
  const [qaAnswer, setQaAnswer] = useState<string | null>(null);
  const [isAskingQa, setIsAskingQa] = useState(false);

  const handleAskQuestion = async (qText: string) => {
    const trimmed = qText.trim();
    if (!trimmed || !prediction) return;
    playTwinkleSound('chime');
    setQuestionInput(trimmed);
    setIsAskingQa(true);
    try {
      const response = await fetch('/api/explain', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          prediction,
          features,
          sampleMetadata: activeSampleMeta,
          question: trimmed,
        }),
      });
      const data = await response.json();
      if (data.answer) {
        setQaAnswer(data.answer);
      }
    } catch {
      setQaAnswer(
        'Unable to reach the explainability assistant right now. Please review the four key points above.'
      );
    } finally {
      setIsAskingQa(false);
    }
  };

  const isCandidate = prediction?.predictedClass === 'Planet candidate';
  const probPercent = prediction ? (prediction.probability * 100).toFixed(1) : '0.0';
  const confidenceCertaintyPct = prediction
    ? (
        (isCandidate ? prediction.probability : 1 - prediction.probability) * 100
      ).toFixed(1)
    : '95.0';

  return (
    <div className="grid grid-cols-1 lg:grid-cols-12 gap-5 relative z-10">
      {/* Left 5 Columns: Model Prediction Panel */}
      <section
        aria-label="Model Prediction Panel"
        className="lg:col-span-5 cyber-glass telemetry-tilt-card spring-enter-2 rounded-lg p-5 flex flex-col justify-between gap-4"
      >
        <div className="flex flex-col gap-4">
          <div className="flex items-center justify-between border-b border-slate-800/80 pb-3">
            <div>
              <div className="flex items-center gap-1.5 text-[10px] font-mono text-cyan-400">
                <span
                  className={`w-1.5 h-1.5 rounded-full animate-pulse ${
                    isCandidate ? 'bg-cyan-400' : 'bg-amber-400'
                  }`}
                />
                <span>
                  [SYS.LOCK // {confidenceCertaintyPct}% CONFIDENCE]
                </span>
              </div>
              <h2 className="text-base font-semibold text-slate-100 mt-0.5">
                Classifier Verdict
              </h2>
            </div>
            {isPredicting && (
              <span className="text-xs font-mono text-cyan-400">Checking signal...</span>
            )}
          </div>

          {prediction ? (
            <>
              {/* Primary Classification Output */}
              <div
                className={`rounded-md p-4 border ${
                  isCandidate
                    ? 'bg-cyan-950/35 border-cyan-500/40 breathing-cyan-glow'
                    : 'bg-rose-950/35 border-rose-500/40 breathing-amber-glow'
                }`}
              >
                <div className="text-xs font-mono text-slate-300">PREDICTED CLASS</div>
                <div
                  data-testid="predicted-class-label"
                  className={`text-xl font-bold mt-1 ${
                    isCandidate ? 'text-cyan-300' : 'text-rose-300'
                  }`}
                >
                  {isCandidate ? '● Planet candidate' : '▲ Not planet / false positive'}
                </div>

                {/* Probability & Confidence Metrics */}
                <div className="grid grid-cols-2 gap-4 mt-4 pt-3 border-t border-slate-800/80">
                  <div>
                    <div className="text-xs text-slate-400">Transit Probability</div>
                    <div className="text-2xl font-mono font-bold tabular-nums text-slate-100 mt-0.5">
                      {probPercent}
                      <span className="text-xs font-mono text-slate-400 ml-1">%</span>
                    </div>
                  </div>
                  <div>
                    <div className="text-xs text-slate-400">Confidence Level</div>
                    <div
                      className={`text-lg font-mono font-semibold mt-1 ${
                        prediction.confidence === 'High'
                          ? isCandidate
                            ? 'text-cyan-300'
                            : 'text-rose-300'
                          : 'text-amber-300'
                      }`}
                    >
                      {prediction.confidence}
                    </div>
                  </div>
                </div>

                {/* Probability Meter Bar */}
                <div className="mt-3">
                  <div className="w-full h-2 bg-slate-950 rounded overflow-hidden border border-slate-800">
                    <div
                      className={`h-full transition-opacity duration-150 ${
                        isCandidate ? 'bg-cyan-400' : 'bg-rose-400'
                      }`}
                      style={{ width: `${Math.max(4, Math.min(100, Number(probPercent)))}%` }}
                    />
                  </div>
                  <div className="flex justify-between text-[11px] font-mono text-slate-400 mt-1.5">
                    <span className="whitespace-nowrap">0% False Positive</span>
                    <span className="whitespace-nowrap">50% Threshold</span>
                    <span className="whitespace-nowrap">100% Candidate</span>
                  </div>
                </div>
              </div>

              {/* Explicit Demo Mode Notice */}
              {prediction.isDemoMode && (
                <div
                  data-testid="demo-mode-banner"
                  className="bg-amber-950/30 border border-amber-500/40 rounded-md p-3 text-xs text-amber-200 flex items-start gap-2.5"
                >
                  <AlertTriangle className="w-4 h-4 text-amber-400 shrink-0 mt-0.5" />
                  <div>
                    <div className="font-semibold text-amber-300">
                      {prediction.modelSourceLabel}
                    </div>
                    <p className="text-amber-200/80 mt-0.5 leading-relaxed">
                      No trained <code className="font-mono">exoplanet_cnn.keras</code> file is
                      loaded on the server yet, so this score comes from our transparent physics
                      checklist (dip depth, repeat cycle, secondary star check, and U/V shape).
                    </p>
                  </div>
                </div>
              )}

              {/* Feature Evidence Breakdown */}
              <div className="flex flex-col gap-2">
                <h3 className="text-xs font-mono text-slate-400">
                  HOW THE CLUES ADD UP
                </h3>
                <div className="flex flex-col divide-y divide-slate-800/80 border border-slate-800/90 rounded-md bg-slate-950/60">
                  {prediction.featureContributions.map((item, idx) => (
                    <div key={idx} className="p-2.5 text-xs">
                      <div className="flex items-center justify-between font-medium">
                        <span className="text-slate-200">{item.label}</span>
                        <span
                          className={`font-mono ${
                            item.impact === 'positive'
                              ? 'text-cyan-400'
                              : item.impact === 'negative'
                              ? 'text-rose-400'
                              : 'text-amber-400'
                          }`}
                        >
                          {item.impact === 'positive'
                            ? '+ Points to Planet'
                            : item.impact === 'negative'
                            ? '− Points to Impostor'
                            : '· Uncertain Clue'}
                        </span>
                      </div>
                      <p className="text-slate-400 mt-1 leading-relaxed">{item.detail}</p>
                    </div>
                  ))}
                </div>
              </div>
            </>
          ) : (
            <div className="py-12 text-center text-sm text-slate-400">
              Select or upload a Kepler light curve to run classification.
            </div>
          )}
        </div>
      </section>

      {/* Right 7 Columns: Gemini Explainability & Interactive Q&A */}
      <section
        aria-label="Gemini Explainability Assistant"
        className="lg:col-span-7 cyber-glass telemetry-tilt-card spring-enter-3 rounded-lg p-5 flex flex-col justify-between gap-4"
      >
        <div className="flex flex-col gap-4">
          <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-800/80 pb-3">
            <div>
              <div className="flex items-center gap-2 text-xs font-mono text-slate-400">
                <span className="w-1.5 h-1.5 rounded-full bg-cyan-400 animate-pulse" />
                <span className="text-cyan-400">[AI.VET // EXPLAINABILITY ENGINE]</span>
                <span aria-hidden="true">·</span>
                <span className="text-slate-300">
                  {explanation?.source === 'gemini'
                    ? `Powered by ${explanation.modelUsed}`
                    : 'Clear Evidence Summary'}
                </span>
              </div>
              <h2 className="text-base font-semibold text-slate-100 mt-0.5">
                What This Starlight Curve Tells Us
              </h2>
            </div>

            <button
              type="button"
              onClick={() => {
                playTwinkleSound('chime');
                onRefreshExplanation();
              }}
              disabled={isExplaining}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium bg-slate-950 hover:bg-slate-800 disabled:opacity-50 text-slate-200 border border-slate-800 rounded transition-colors whitespace-nowrap shrink-0"
            >
              <RefreshCw className={`w-3.5 h-3.5 text-cyan-400 ${isExplaining ? 'animate-spin' : ''}`} />
              <span>{isExplaining ? 'Refreshing...' : 'Refresh Explanation'}</span>
            </button>
          </div>

          {/* 4 Bullet Points + 1 Scientific Caveat */}
          {explanation ? (
            <div className="flex flex-col gap-3">
              <ul
                data-testid="explanation-bullet-list"
                className="flex flex-col gap-2.5 text-sm text-slate-200 leading-relaxed"
              >
                {explanation.bullets.map((bullet, idx) => (
                  <li
                    key={idx}
                    className="bg-slate-950/70 border border-slate-800/80 rounded-md p-3 flex items-start gap-3"
                  >
                    <span className="font-mono text-xs text-cyan-400 mt-0.5 shrink-0">
                      0{idx + 1}.
                    </span>
                    <span>{bullet}</span>
                  </li>
                ))}
              </ul>

              {/* Scientific Caveat Box */}
              <div
                data-testid="scientific-caveat-box"
                className="bg-slate-950/90 border border-amber-500/40 rounded-md p-3.5 text-xs text-amber-200/90 leading-relaxed"
              >
                <span className="font-mono font-semibold text-amber-300 uppercase mr-2">
                  Scientific Caveats:
                </span>
                {explanation.caveat}
              </div>
            </div>
          ) : null}

          {/* Interactive Student Follow-Up Q&A */}
          <div className="border-t border-slate-800/80 pt-4 mt-1 flex flex-col gap-3">
            <div className="flex items-center justify-between">
              <label
                htmlFor="student-qa-input"
                className="text-xs font-mono text-slate-300 flex items-center gap-1.5"
              >
                <HelpCircle className="w-3.5 h-3.5 text-cyan-400" />
                <span>ASK A FOLLOW-UP QUESTION ABOUT THIS CURVE</span>
              </label>
            </div>

            <div className="flex flex-wrap gap-1.5">
              {PRESET_QUESTIONS.map((q) => (
                <button
                  key={q}
                  type="button"
                  onClick={() => handleAskQuestion(q)}
                  className="text-xs px-2.5 py-1 bg-slate-950 hover:bg-slate-800 text-slate-300 border border-slate-800 rounded transition-colors text-left"
                >
                  {q}
                </button>
              ))}
            </div>

            <form
              onSubmit={(e) => {
                e.preventDefault();
                handleAskQuestion(questionInput);
              }}
              className="flex items-center gap-2"
            >
              <input
                id="student-qa-input"
                type="text"
                value={questionInput}
                onChange={(e) => setQuestionInput(e.target.value)}
                placeholder="Ask why binary stars or starspots mimic planet transits..."
                className="flex-1 bg-slate-950 border border-slate-800 rounded px-3 py-2 text-xs text-slate-100 placeholder:text-slate-500 focus:outline-none focus:border-cyan-500"
              />
              <button
                type="submit"
                disabled={isAskingQa || !questionInput.trim()}
                className="inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-medium bg-cyan-500 hover:bg-cyan-400 disabled:opacity-40 text-slate-950 rounded transition-colors whitespace-nowrap shrink-0"
              >
                <Send className="w-3.5 h-3.5" />
                <span>{isAskingQa ? 'Asking...' : 'Ask'}</span>
              </button>
            </form>

            {qaAnswer && (
              <div
                data-testid="qa-response-box"
                className="bg-cyan-950/25 border border-cyan-500/30 rounded p-3 text-xs text-slate-200 leading-relaxed"
              >
                <div className="font-mono text-[11px] text-cyan-400 mb-1">
                  ANSWER (BASED ON CURRENT LIGHT CURVE):
                </div>
                {qaAnswer}
              </div>
            )}
          </div>
        </div>
      </section>
    </div>
  );
};
