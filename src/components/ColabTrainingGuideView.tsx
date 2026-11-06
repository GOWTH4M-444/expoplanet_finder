import React, { useState } from 'react';
import {
  Copy,
  Check,
  Download,
  Code2,
  ChevronDown,
  ChevronUp,
  AlertCircle,
  CheckCircle2,
} from 'lucide-react';
import {
  COLAB_PYTHON_SCRIPT,
  TRAINING_PIPELINE_STEPS,
} from '../utils/colabNotebookContent';
import { playTwinkleSound } from '../utils/sound';

export const ColabTrainingGuideView: React.FC = () => {
  const [copied, setCopied] = useState(false);
  const [openStepDrawers, setOpenStepDrawers] = useState<Record<string, boolean>>({});
  const [showFullScriptDrawer, setShowFullScriptDrawer] = useState(false);

  const toggleStepDrawer = (stepId: string) => {
    playTwinkleSound('toggle');
    setOpenStepDrawers((prev) => ({
      ...prev,
      [stepId]: !prev[stepId],
    }));
  };

  const handleCopyCode = async () => {
    playTwinkleSound('chime');
    try {
      await navigator.clipboard.writeText(COLAB_PYTHON_SCRIPT);
      setCopied(true);
      setTimeout(() => setCopied(false), 2500);
    } catch {
      // Ignore clipboard failure in restricted iframes
    }
  };

  return (
    <div className="flex flex-col gap-6 relative z-10">
      {/* Visual 7-Step Interactive Training Workflow */}
      <section
        aria-label="Google Colab Training Plan"
        className="bg-slate-900/80 border border-slate-800/90 rounded-lg p-6 flex flex-col gap-5"
      >
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-slate-800/80 pb-4">
          <div>
            <div className="text-xs font-mono text-cyan-400">
              STEP-BY-STEP VISUAL TRAINING GUIDE · ZERO RAW CODE CLUTTER
            </div>
            <h2 className="text-xl font-semibold text-slate-100 mt-1">
              How to Train the 1D CNN on NASA Kepler Data in Google Colab
            </h2>
            <p className="text-sm text-slate-300 mt-1 max-w-3xl leading-relaxed">
              Follow these seven plain-English stages to download real NASA starlight curves, clean
              out slow starspot waves, keep stars strictly separated between training and testing,
              and export your own <code className="font-mono text-cyan-300">exoplanet_cnn.keras</code> model.
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2.5 shrink-0">
            <a
              href="/api/colab-notebook"
              onClick={() => playTwinkleSound('chime')}
              download="exoplanet_cnn_colab.ipynb"
              className="inline-flex items-center gap-2 px-4 py-2.5 text-xs font-semibold bg-cyan-400 hover:bg-cyan-300 text-slate-950 rounded-md transition-colors whitespace-nowrap shrink-0"
            >
              <Download className="w-4 h-4" />
              <span>Download .ipynb Colab Notebook</span>
            </a>
          </div>
        </div>

        {/* 7 Interactive Visual Workflow Cards with Expandable Code Drawers */}
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
          {TRAINING_PIPELINE_STEPS.map((item) => {
            const isDrawerOpen = Boolean(openStepDrawers[item.step]);
            return (
              <div
                key={item.step}
                className="bg-slate-950/85 border border-slate-800/90 rounded-md p-4 flex flex-col justify-between gap-3"
              >
                <div className="flex flex-col gap-2">
                  <div className="flex items-center justify-between text-xs font-mono">
                    <span className="text-cyan-400 font-semibold">STEP {item.step}</span>
                    <span className="text-slate-400">{item.friendlyBadge}</span>
                  </div>
                  <h3 className="text-sm font-semibold text-slate-100">{item.title}</h3>
                  <p className="text-xs text-slate-300 leading-relaxed">{item.summary}</p>
                </div>

                <div className="flex flex-col gap-2.5 pt-2.5 border-t border-slate-800/80">
                  <div className="text-[11px] text-amber-200/90 flex items-start gap-2 leading-relaxed">
                    <AlertCircle className="w-3.5 h-3.5 text-amber-400 shrink-0 mt-0.5" />
                    <span>
                      <strong className="font-mono text-amber-300">Key Tip:</strong>{' '}
                      {item.criticalPitfall}
                    </span>
                  </div>

                  {/* Optional Collapsible Code Snippet Drawer per Step */}
                  <div>
                    <button
                      type="button"
                      onClick={() => toggleStepDrawer(item.step)}
                      aria-expanded={isDrawerOpen}
                      className="w-full inline-flex items-center justify-between px-2.5 py-1.5 text-xs font-mono bg-slate-900 hover:bg-slate-800 text-cyan-300 border border-slate-800 rounded transition-colors"
                    >
                      <span className="inline-flex items-center gap-1.5">
                        <Code2 className="w-3.5 h-3.5" />
                        <span>{isDrawerOpen ? 'Hide Step Code' : 'View Step Python Snippet'}</span>
                      </span>
                      {isDrawerOpen ? (
                        <ChevronUp className="w-3.5 h-3.5" />
                      ) : (
                        <ChevronDown className="w-3.5 h-3.5" />
                      )}
                    </button>

                    {isDrawerOpen && (
                      <pre className="mt-2 bg-[#05070B] border border-slate-800 rounded p-2.5 text-[11px] font-mono text-slate-200 overflow-x-auto leading-relaxed">
                        <code>{item.codeSnippet}</code>
                      </pre>
                    )}
                  </div>
                </div>
              </div>
            );
          })}
        </div>

        {/* Evaluation Metrics Summary Strip */}
        <div className="bg-slate-950/80 border border-slate-800/90 rounded-md p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div className="flex items-start gap-3">
            <CheckCircle2 className="w-4 h-4 text-cyan-400 shrink-0 mt-0.5" />
            <div className="text-xs text-slate-300 leading-relaxed">
              <strong className="text-slate-100">How We Measure Success on Held-Out Stars:</strong>{' '}
              Instead of relying on simple accuracy, the notebook evaluates{' '}
              <span className="text-cyan-300 font-mono">Precision</span> (how many flagged candidates
              are real planets), <span className="text-cyan-300 font-mono">Recall</span> (how many real
              planets the model catches), <span className="text-cyan-300 font-mono">F1 Score</span>,{' '}
              <span className="text-cyan-300 font-mono">ROC-AUC</span>, and a full{' '}
              <span className="text-cyan-300 font-mono">Confusion Matrix</span>.
            </div>
          </div>
        </div>
      </section>

      {/* Collapsible Full Python Notebook Code Drawer (Tucked Safely Away by Default) */}
      <section
        aria-label="Collapsible Full Colab Python Script Drawer"
        className="bg-slate-900/80 border border-slate-800/90 rounded-lg p-5 flex flex-col gap-4"
      >
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <div className="text-xs font-mono text-slate-400">
              OPTIONAL CODE DRAWER · COMPLETE GOOGLE COLAB SCRIPT
            </div>
            <h2 className="text-base font-semibold text-slate-100 mt-0.5">
              Full Python Training Script (Exports exoplanet_cnn.keras)
            </h2>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={handleCopyCode}
              className="inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-medium bg-slate-950 hover:bg-slate-800 text-slate-200 border border-slate-700 rounded-md transition-colors whitespace-nowrap shrink-0"
            >
              {copied ? (
                <>
                  <Check className="w-3.5 h-3.5 text-cyan-400" />
                  <span className="text-cyan-300">Copied to Clipboard</span>
                </>
              ) : (
                <>
                  <Copy className="w-3.5 h-3.5 text-cyan-400" />
                  <span>Copy Full Colab Script</span>
                </>
              )}
            </button>

            <button
              type="button"
              data-testid="toggle-full-colab-drawer"
              aria-expanded={showFullScriptDrawer}
              onClick={() => {
                playTwinkleSound('toggle');
                setShowFullScriptDrawer((prev) => !prev);
              }}
              className="inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-semibold bg-cyan-500/20 hover:bg-cyan-500/30 text-cyan-300 border border-cyan-500/40 rounded-md transition-colors whitespace-nowrap shrink-0"
            >
              <Code2 className="w-3.5 h-3.5" />
              <span>
                {showFullScriptDrawer ? 'Hide Full Python Code' : 'Expand Full Python Code'}
              </span>
              {showFullScriptDrawer ? (
                <ChevronUp className="w-3.5 h-3.5" />
              ) : (
                <ChevronDown className="w-3.5 h-3.5" />
              )}
            </button>
          </div>
        </div>

        {showFullScriptDrawer && (
          <pre
            data-testid="full-colab-code-block"
            className="bg-[#05070B] border border-slate-800 rounded-md p-4 text-xs font-mono text-slate-200 overflow-x-auto max-h-[520px] leading-relaxed"
          >
            <code>{COLAB_PYTHON_SCRIPT}</code>
          </pre>
        )}
      </section>
    </div>
  );
};
