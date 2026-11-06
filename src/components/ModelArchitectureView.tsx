import React, { useState, useEffect } from 'react';
import { Layers, ArrowRight, Cpu, CheckCircle2, Zap, Sparkles } from 'lucide-react';
import { CNN_ARCHITECTURE_LAYERS, CNNLayerSpec } from '../utils/colabNotebookContent';
import { LightCurveFeatures, PredictionResult } from '../types/exoplanet';
import { playTwinkleSound } from '../utils/sound';

interface ModelArchitectureViewProps {
  features: LightCurveFeatures;
  prediction: PredictionResult | null;
}

type ConduitNodeKind = 'input_stream' | 'spectral_lens' | 'gravitational_pool' | 'core_reactor';

function getConduitKind(layerId: string): ConduitNodeKind {
  if (layerId.includes('conv1d')) return 'spectral_lens';
  if (layerId.includes('pool') || layerId.includes('gap')) return 'gravitational_pool';
  if (layerId.includes('dense') || layerId.includes('output')) return 'core_reactor';
  return 'input_stream';
}

export const ModelArchitectureView: React.FC<ModelArchitectureViewProps> = ({
  features,
  prediction,
}) => {
  const [selectedLayer, setSelectedLayer] = useState<CNNLayerSpec>(CNN_ARCHITECTURE_LAYERS[1]);
  const [pulseStepIndex, setPulseStepIndex] = useState<number | null>(null);
  const [pulseComplete, setPulseComplete] = useState<boolean>(false);

  const isCandidate = prediction?.predictedClass === 'Planet candidate';
  const certaintyPct = prediction
    ? ((isCandidate ? prediction.probability : 1 - prediction.probability) * 100).toFixed(1)
    : '97.0';

  const handleSelectLayer = (layer: CNNLayerSpec) => {
    playTwinkleSound('chime');
    setSelectedLayer(layer);
  };

  const handleRunForwardPass = () => {
    playTwinkleSound('chime');
    setPulseComplete(false);
    setPulseStepIndex(0);
    setSelectedLayer(CNN_ARCHITECTURE_LAYERS[0]);
  };

  // Step through all 7 layers during an active Forward Pass animation
  useEffect(() => {
    if (pulseStepIndex === null) return;
    if (pulseStepIndex >= CNN_ARCHITECTURE_LAYERS.length) {
      setPulseStepIndex(null);
      setPulseComplete(true);
      playTwinkleSound('chime');
      return;
    }

    setSelectedLayer(CNN_ARCHITECTURE_LAYERS[pulseStepIndex]);
    const timer = window.setTimeout(() => {
      setPulseStepIndex((prev) => (prev !== null ? prev + 1 : null));
    }, 380);

    return () => window.clearTimeout(timer);
  }, [pulseStepIndex]);

  return (
    <div className="flex flex-col gap-6 relative z-10">
      {/* Architecture Pipeline Header Card: "The Stellar Synapse Matrix" */}
      <section
        aria-label="1D CNN Architecture Pipeline — The Stellar Synapse Matrix"
        data-testid="stellar-synapse-matrix"
        className="cyber-glass spring-enter-1 rounded-lg p-6 flex flex-col gap-5"
      >
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4 border-b border-slate-800/80 pb-4">
          <div>
            <div className="flex items-center gap-2 text-xs font-mono text-cyan-400">
              <span>[SYNAPSE.MATRIX // HOLOGRAPHIC 1D CNN CONDUIT]</span>
              <span aria-hidden="true">·</span>
              <span className="text-slate-400">12,609 LEARNABLE WEIGHTS</span>
            </div>
            <h2 className="text-xl font-semibold text-slate-100 mt-1">
              01. The Stellar Synapse Matrix — 1D CNN Deep-Space Data Conduit
            </h2>
          </div>

          <div className="flex flex-wrap items-center gap-3">
            <button
              type="button"
              data-testid="run-forward-pass-button"
              onClick={handleRunForwardPass}
              disabled={pulseStepIndex !== null}
              className="inline-flex items-center gap-2 px-4 py-2 text-xs font-mono font-semibold bg-cyan-400 hover:bg-cyan-300 disabled:opacity-60 text-slate-950 rounded-md transition-colors shadow-md"
            >
              <Zap className="w-3.5 h-3.5" />
              <span>
                {pulseStepIndex !== null
                  ? `Propagating Layer ${pulseStepIndex + 1}/7...`
                  : 'Run Live Forward Pass'}
              </span>
            </button>

            <div
              data-testid="synapse-verdict-badge"
              className={`px-3 py-2 rounded-md border font-mono text-xs font-semibold ${
                pulseComplete
                  ? 'bg-cyan-950/80 border-cyan-400 text-cyan-200 breathing-cyan-glow'
                  : 'bg-slate-950/90 border-slate-800 text-cyan-300'
              }`}
            >
              {isCandidate
                ? `[EXOPLANET CANDIDATE: ${certaintyPct}%]`
                : `[FALSE POSITIVE VETTED: ${certaintyPct}%]`}
            </div>
          </div>
        </div>

        {/* Holographic Conduit Legend */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-3 text-xs">
          <div className="bg-slate-950/80 border border-cyan-500/30 rounded-md p-3 flex flex-col gap-1">
            <div className="font-mono text-cyan-300 font-semibold flex items-center gap-1.5">
              <Sparkles className="w-3.5 h-3.5 text-cyan-400" />
              <span>Spectral Lens Filters (Conv1D)</span>
            </div>
            <p className="text-slate-400 text-[11px] leading-relaxed">
              Stacked holographic plates where 32 and 64 sliding spectroscopic lenses extract
              transit ingress, flat U-bottoms, and dip symmetry.
            </p>
          </div>

          <div className="bg-slate-950/80 border border-sky-500/30 rounded-md p-3 flex flex-col gap-1">
            <div className="font-mono text-sky-300 font-semibold flex items-center gap-1.5">
              <Layers className="w-3.5 h-3.5 text-sky-400" />
              <span>Gravitational Lensing Nodes (Pooling)</span>
            </div>
            <p className="text-slate-400 text-[11px] leading-relaxed">
              Concentrated cyan energy cores (`MaxPool1D` & `GAP1D`) that compress 2,001 points
              into invariant orbital feature vectors.
            </p>
          </div>

          <div className="bg-slate-950/80 border border-emerald-500/30 rounded-md p-3 flex flex-col gap-1">
            <div className="font-mono text-emerald-300 font-semibold flex items-center gap-1.5">
              <Cpu className="w-3.5 h-3.5 text-emerald-400" />
              <span>Core Reactor Array (Dense & Sigmoid)</span>
            </div>
            <p className="text-slate-400 text-[11px] leading-relaxed">
              3D hexagonal constellation matrix where active neurons lock onto the final transit
              probability coordinate.
            </p>
          </div>
        </div>

        {/* Interactive 7-Layer Holographic Conduit Flow */}
        <div
          role="tablist"
          aria-label="CNN Architecture Layers"
          className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-7 gap-2.5"
        >
          {CNN_ARCHITECTURE_LAYERS.map((layer, index) => {
            const isSelected = selectedLayer.id === layer.id;
            const isPulsing = pulseStepIndex === index;
            const kind = getConduitKind(layer.id);

            return (
              <button
                key={layer.id}
                role="tab"
                aria-selected={isSelected}
                type="button"
                onClick={() => handleSelectLayer(layer)}
                className={`text-left p-3.5 rounded-md border transition-all flex flex-col justify-between gap-3 relative overflow-hidden ${
                  isPulsing
                    ? 'bg-cyan-900/60 border-cyan-300 text-slate-100 breathing-cyan-glow scale-[1.02]'
                    : isSelected
                    ? 'bg-cyan-950/50 border-cyan-400 text-slate-100'
                    : 'bg-slate-950/80 border-slate-800/90 text-slate-300 hover:border-slate-700'
                }`}
              >
                <div className="flex items-center justify-between text-xs font-mono">
                  <span className={isSelected ? 'text-cyan-300 font-semibold' : 'text-slate-400'}>
                    Layer {layer.stepNumber}
                  </span>
                  {index < CNN_ARCHITECTURE_LAYERS.length - 1 && (
                    <ArrowRight
                      className={`w-3.5 h-3.5 hidden lg:block ${
                        isPulsing ? 'text-cyan-300 translate-x-0.5' : 'text-slate-500'
                      }`}
                    />
                  )}
                </div>

                {/* Visual Holographic Glyph per Conduit Node Type */}
                <div className="h-9 flex items-center justify-center bg-slate-950/90 border border-slate-800/80 rounded px-2">
                  {kind === 'spectral_lens' && (
                    <div
                      title="Stacked Spectral Lens Plates"
                      className="flex items-center gap-1"
                    >
                      {[0, 1, 2, 3, 4].map((plate) => (
                        <span
                          key={plate}
                          className={`w-2 h-6 rounded-xs skew-x-[-14deg] border ${
                            isSelected || isPulsing
                              ? 'bg-cyan-400/35 border-cyan-300'
                              : 'bg-cyan-950/60 border-cyan-500/40'
                          }`}
                        />
                      ))}
                    </div>
                  )}
                  {kind === 'gravitational_pool' && (
                    <div
                      title="Gravitational Lensing Node"
                      className="relative flex items-center justify-center w-7 h-7 rounded-full border border-sky-400/60 bg-sky-950/50"
                    >
                      <span className="w-3 h-3 rounded-full bg-cyan-400" />
                    </div>
                  )}
                  {kind === 'core_reactor' && (
                    <div
                      title="Hexagonal Core Reactor Constellation"
                      className="grid grid-cols-4 gap-1"
                    >
                      {[0, 1, 2, 3, 4, 5, 6, 7].map((cell) => (
                        <span
                          key={cell}
                          className={`w-2 h-2 rotate-45 rounded-[1px] ${
                            (cell + index) % 2 === 0
                              ? 'bg-emerald-400'
                              : 'bg-cyan-500/40'
                          }`}
                        />
                      ))}
                    </div>
                  )}
                  {kind === 'input_stream' && (
                    <div className="w-full flex items-center gap-0.5">
                      {[3, 3, 6, 8, 6, 3, 3].map((h, i) => (
                        <span
                          key={i}
                          style={{ height: `${h * 2.5}px` }}
                          className="flex-1 bg-cyan-400/70 rounded-xs"
                        />
                      ))}
                    </div>
                  )}
                </div>

                <div>
                  <div className="text-xs font-mono font-semibold text-slate-100 break-words">
                    {layer.name}
                  </div>
                  <div className="text-[11px] text-slate-400 mt-1">{layer.roleTitle}</div>
                </div>

                <div className="pt-2 border-t border-slate-800/80 flex items-center justify-between text-[11px] font-mono text-slate-400">
                  <span>Out: {layer.outputShape.replace('(None, ', '(')}</span>
                </div>
              </button>
            );
          })}
        </div>

        {/* Selected Layer Deep-Dive Inspector */}
        <div className="bg-slate-950/90 border border-slate-800 rounded-lg p-5 grid grid-cols-1 lg:grid-cols-12 gap-5">
          <div className="lg:col-span-5 flex flex-col justify-between gap-4 border-b lg:border-b-0 lg:border-r border-slate-800/80 pb-4 lg:pb-0 lg:pr-5">
            <div>
              <div className="text-xs font-mono text-cyan-400">
                LAYER {selectedLayer.stepNumber} IN PLAIN ENGLISH
              </div>
              <h3 className="text-lg font-semibold text-slate-100 mt-1">
                {selectedLayer.name} — {selectedLayer.roleTitle}
              </h3>
              <div className="mt-3 bg-slate-900 border border-slate-800 rounded px-3 py-2 text-xs font-mono text-cyan-300 overflow-x-auto">
                {selectedLayer.kerasSignature}
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3 text-xs font-mono">
              <div className="bg-slate-900/70 border border-slate-800/80 rounded p-2.5">
                <div className="text-slate-400">Data Shape Out</div>
                <div className="text-slate-100 font-semibold mt-0.5">
                  {selectedLayer.outputShape}
                </div>
              </div>
              <div className="bg-slate-900/70 border border-slate-800/80 rounded p-2.5">
                <div className="text-slate-400">Learned Weights</div>
                <div className="text-slate-100 font-semibold mt-0.5">
                  {selectedLayer.paramCount}
                </div>
              </div>
            </div>
          </div>

          <div className="lg:col-span-7 flex flex-col justify-between gap-4">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="bg-slate-900/50 border border-slate-800/80 rounded p-3.5">
                <div className="text-xs font-mono text-slate-400 mb-1.5">
                  WHAT THIS LAYER DOES
                </div>
                <p className="text-sm text-slate-200 leading-relaxed">
                  {selectedLayer.simpleExplanation}
                </p>
              </div>
              <div className="bg-slate-900/50 border border-slate-800/80 rounded p-3.5">
                <div className="text-xs font-mono text-cyan-400 mb-1.5">
                  WHY IT MATTERS FOR FINDING PLANETS
                </div>
                <p className="text-sm text-slate-200 leading-relaxed">
                  {selectedLayer.astronomicalMeaning}
                </p>
              </div>
            </div>

            {/* Active Curve Context Link */}
            <div className="bg-slate-900/80 border border-slate-800 rounded p-3 text-xs font-mono text-slate-300 flex flex-wrap items-center justify-between gap-2">
              <span>
                Current Curve: {features.transitDepthPpm.toLocaleString()} ppm drop ·{' '}
                {features.dipCount} dips · {features.dipShapeProfile}
              </span>
              {prediction && (
                <span className="text-cyan-400">
                  Final Sigmoid Score: {(prediction.probability * 100).toFixed(1)}% ({prediction.predictedClass})
                </span>
              )}
            </div>
          </div>
        </div>
      </section>

      {/* Why a 1D CNN? Section + Layer Table */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        <section
          aria-label="Why use a 1D CNN for light curves"
          className="lg:col-span-6 cyber-glass rounded-lg p-6 flex flex-col gap-4"
        >
          <div className="border-b border-slate-800/80 pb-3">
            <div className="text-xs font-mono text-slate-400">PLAIN-ENGLISH INTUITION</div>
            <h2 className="text-lg font-semibold text-slate-100 mt-0.5">
              02. Why Use a 1D CNN for Starlight Curves?
            </h2>
          </div>

          <p className="text-sm text-slate-300 leading-relaxed">
            A standard neural network looks at all 2,001 points as separate, unrelated numbers—if a
            transit dip happens 15 minutes later than expected, a standard network gets confused. A{' '}
            <strong>1D Convolutional Neural Network (1D CNN)</strong> slides small pattern-finding
            windows across the timeline, learning shapes regardless of where they sit:
          </p>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mt-1">
            <div className="bg-slate-950/75 border border-slate-800/90 rounded p-3.5">
              <div className="flex items-center gap-2 text-xs font-mono text-cyan-400 font-semibold">
                <Layers className="w-4 h-4" />
                <span>1. Spotting Dip Depth</span>
              </div>
              <p className="text-xs text-slate-300 mt-1.5 leading-relaxed">
                Compares the bottom of the dip directly against the normal starlight right next to
                it, telling gentle ~0.15% planet dips apart from deep ~2.5% binary star eclipses.
              </p>
            </div>

            <div className="bg-slate-950/75 border border-slate-800/90 rounded p-3.5">
              <div className="flex items-center gap-2 text-xs font-mono text-cyan-400 font-semibold">
                <Cpu className="w-4 h-4" />
                <span>2. Smooth Entry & Exit</span>
              </div>
              <p className="text-xs text-slate-300 mt-1.5 leading-relaxed">
                5-point sliding filters check whether the dimming edge matches the brightening edge,
                immediately catching lopsided spacecraft thruster glitches.
              </p>
            </div>

            <div className="bg-slate-950/75 border border-slate-800/90 rounded p-3.5">
              <div className="flex items-center gap-2 text-xs font-mono text-cyan-400 font-semibold">
                <CheckCircle2 className="w-4 h-4" />
                <span>3. U-Shape vs. V-Shape</span>
              </div>
              <p className="text-xs text-slate-300 mt-1.5 leading-relaxed">
                Deeper 64-filter layers zoom out to see the whole dip, separating flat-bottomed
                U-shaped planetary transits from pointy V-shaped grazing binary stars.
              </p>
            </div>

            <div className="bg-slate-950/75 border border-slate-800/90 rounded p-3.5">
              <div className="flex items-center gap-2 text-xs font-mono text-cyan-400 font-semibold">
                <ArrowRight className="w-4 h-4" />
                <span>4. Steady Repetition</span>
              </div>
              <p className="text-xs text-slate-300 mt-1.5 leading-relaxed">
                Whole-curve pooling averages pattern scores across the entire 2,001-point window,
                rewarding evenly spaced transits while flagging alternating binary eclipses.
              </p>
            </div>
          </div>
        </section>

        {/* Complete Layer-by-Layer Reference Table */}
        <section
          aria-label="Layer Reference Table"
          className="lg:col-span-6 cyber-glass rounded-lg p-6 flex flex-col gap-4"
        >
          <div className="border-b border-slate-800/80 pb-3">
            <div className="text-xs font-mono text-slate-400">COMPLETE LAYER SUMMARY</div>
            <h2 className="text-lg font-semibold text-slate-100 mt-0.5">
              03. Layer Shapes & Roles at a Glance
            </h2>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse text-xs">
              <thead>
                <tr className="border-b border-slate-800 text-slate-400 font-mono">
                  <th className="py-2.5 pr-3">Layer</th>
                  <th className="py-2.5 px-3">Output Shape</th>
                  <th className="py-2.5 px-3 text-right">Weights</th>
                  <th className="py-2.5 pl-3">Plain-English Role</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800/70">
                {CNN_ARCHITECTURE_LAYERS.map((layer) => (
                  <tr
                    key={layer.id}
                    onClick={() => handleSelectLayer(layer)}
                    className="hover:bg-slate-800/40 cursor-pointer transition-colors"
                  >
                    <td className="py-2.5 pr-3 font-mono font-medium text-cyan-300 whitespace-nowrap">
                      {layer.name}
                    </td>
                    <td className="py-2.5 px-3 font-mono tabular-nums text-slate-300 whitespace-nowrap">
                      {layer.outputShape}
                    </td>
                    <td className="py-2.5 px-3 font-mono tabular-nums text-right text-slate-300">
                      {layer.paramCount}
                    </td>
                    <td className="py-2.5 pl-3 text-slate-300">{layer.roleTitle}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      </div>
    </div>
  );
};
