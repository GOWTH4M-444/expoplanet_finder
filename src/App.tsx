import React, { useState, useEffect, useCallback, useRef } from 'react';
import {
  Upload,
  FileSpreadsheet,
  AlertCircle,
  Download,
  Sliders,
  CheckCircle2,
  XCircle,
  Volume2,
  VolumeX,
  Keyboard,
} from 'lucide-react';
import {
  BUILTIN_SAMPLE_METADATA,
  generateDemoLightCurvePoints,
  pointsToCSVString,
} from './utils/demoCurves';
import {
  parseLightCurveCSV,
  preprocessLightCurve,
  predictWithDemoHeuristic,
  buildDeterministicExplanation,
} from './utils/lightCurve';
import {
  ExplanationResult,
  PredictionResult,
  PreprocessedLightCurveResult,
  RawLightCurvePoint,
  SampleCurveMetadata,
} from './types/exoplanet';
import { LightCurveChart } from './components/LightCurveChart';
import { PredictionAndExplainPanel } from './components/PredictionAndExplainPanel';
import { ModelArchitectureView } from './components/ModelArchitectureView';
import { ColabTrainingGuideView } from './components/ColabTrainingGuideView';
import { StarfieldCanvas } from './components/StarfieldCanvas';
import { PredictionHistoryPanel } from './components/PredictionHistoryPanel';
import { MissionControlDeck } from './components/MissionControlDeck';
import { playTwinkleSound, isSoundEnabled, setSoundEnabled } from './utils/sound';
import {
  resolveKeyboardShortcut,
  getNextSampleId,
} from './utils/shortcuts';
import {
  PredictionHistoryEntry,
  computeAstrophysicalMetrics,
  upsertPredictionHistory,
} from './utils/missionTelemetry';

type ActiveTab = 'classifier' | 'architecture' | 'training';

const DEFAULT_MEDIAN_WINDOW = 141;

function buildHistoryEntryForSample(
  sampleMeta: SampleCurveMetadata | null,
  customName: string | null,
  proc: PreprocessedLightCurveResult,
  pred: PredictionResult
): PredictionHistoryEntry {
  const astro = computeAstrophysicalMetrics(proc.features, pred, sampleMeta);
  const sampleId = customName ? `csv:${customName}` : sampleMeta?.id ?? 'unknown';
  return {
    id: `${sampleId}-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
    sampleId,
    sampleName: customName ?? sampleMeta?.name ?? 'Custom Light Curve',
    kicId: sampleMeta?.kicId ?? 'CSV UPLOAD',
    predictedClass: pred.predictedClass,
    probability: pred.probability,
    confidence: pred.confidence,
    transitDepthPpm: proc.features.transitDepthPpm,
    estimatedPeriodDays: proc.features.estimatedPeriodDays,
    snrProxy: proc.features.snrProxy,
    planetRadiusEarth: astro.planetRadiusEarth,
    equilibriumTempK: astro.equilibriumTempK,
    timestampLabel: 'LIVE',
    isCustomCsv: Boolean(customName),
  };
}

function buildInitialHistoryDeck(): PredictionHistoryEntry[] {
  const initialIds = [
    'confirmed-planet',
    'eclipsing-binary',
    'noisy-transit',
    'flat-no-transit',
    'instrumental-artifact',
  ];
  return initialIds.map((id) => {
    const meta = BUILTIN_SAMPLE_METADATA.find((s) => s.id === id) ?? null;
    const raw = generateDemoLightCurvePoints(id);
    const proc = preprocessLightCurve(raw, 0, 2001, DEFAULT_MEDIAN_WINDOW);
    const pred = predictWithDemoHeuristic(proc.window2001, proc.features);
    return buildHistoryEntryForSample(meta, null, proc, pred);
  });
}

export default function App() {
  const [activeTab, setActiveTab] = useState<ActiveTab>('classifier');
  const [selectedSampleId, setSelectedSampleId] = useState<string>('confirmed-planet');
  const [customFileName, setCustomFileName] = useState<string | null>(null);
  const [csvError, setCsvError] = useState<string | null>(null);
  const [showPasteModal, setShowPasteModal] = useState<boolean>(false);
  const [pasteCsvText, setPasteCsvText] = useState<string>('');
  const [medianWindowSize, setMedianWindowSize] = useState<number>(DEFAULT_MEDIAN_WINDOW);
  const [audioMuted, setAudioMuted] = useState<boolean>(() => !isSoundEnabled());
  const [showTransitMarkers, setShowTransitMarkers] = useState<boolean>(true);
  const [isPlayingScan, setIsPlayingScan] = useState<boolean>(false);
  const [lastShortcutFeedback, setLastShortcutFeedback] = useState<string>(
    'Shortcuts Ready: [S] Next Sample · [U] Upload CSV · [Space] Play/Pause · [M] Markers'
  );
  const [predictionHistory, setPredictionHistory] = useState<PredictionHistoryEntry[]>(
    () => buildInitialHistoryDeck()
  );

  // Raw points source so slider adjustments re-run the rolling median filter from raw photometry
  const [rawSource, setRawSource] = useState<{
    points: RawLightCurvePoint[];
    nanDropped: number;
  }>(() => ({
    points: generateDemoLightCurvePoints('confirmed-planet'),
    nanDropped: 0,
  }));

  // Processed light-curve state (initialized synchronously with Confirmed Planet Transit)
  const [processedData, setProcessedData] = useState<PreprocessedLightCurveResult>(() => {
    const initialRaw = generateDemoLightCurvePoints('confirmed-planet');
    return preprocessLightCurve(initialRaw, 0, 2001, DEFAULT_MEDIAN_WINDOW);
  });

  const [prediction, setPrediction] = useState<PredictionResult | null>(() => {
    const initialRaw = generateDemoLightCurvePoints('confirmed-planet');
    const proc = preprocessLightCurve(initialRaw, 0, 2001, DEFAULT_MEDIAN_WINDOW);
    return predictWithDemoHeuristic(proc.window2001, proc.features);
  });

  const [isPredicting, setIsPredicting] = useState<boolean>(false);
  const [explanation, setExplanation] = useState<ExplanationResult | null>(() => {
    const initialRaw = generateDemoLightCurvePoints('confirmed-planet');
    const proc = preprocessLightCurve(initialRaw, 0, 2001, DEFAULT_MEDIAN_WINDOW);
    const pred = predictWithDemoHeuristic(proc.window2001, proc.features);
    return buildDeterministicExplanation(pred, proc.features, true);
  });
  const [isExplaining, setIsExplaining] = useState<boolean>(false);

  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const pasteTextareaRef = useRef<HTMLTextAreaElement | null>(null);

  const activeSampleMeta: SampleCurveMetadata | null = customFileName
    ? null
    : BUILTIN_SAMPLE_METADATA.find((s) => s.id === selectedSampleId) ?? null;

  const runBackendPredictionAndExplanation = useCallback(
    async (
      proc: PreprocessedLightCurveResult,
      sampleMeta: SampleCurveMetadata | null,
      customNameOverride: string | null = null
    ) => {
      setIsPredicting(true);
      setIsExplaining(true);

      const localPred = predictWithDemoHeuristic(proc.window2001, proc.features);
      setPrediction(localPred);
      setPredictionHistory((prev) =>
        upsertPredictionHistory(
          prev,
          buildHistoryEntryForSample(sampleMeta, customNameOverride, proc, localPred),
          5
        )
      );
      setExplanation(
        buildDeterministicExplanation(
          localPred,
          proc.features,
          sampleMeta?.isConfirmedPlanet === true
        )
      );

      let resolvedPred = localPred;

      try {
        const predRes = await fetch('/api/predict', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            normalizedWindow: proc.window2001,
            features: proc.features,
          }),
        });
        if (predRes.ok) {
          const predJson = await predRes.json();
          resolvedPred = {
            predictedClass: predJson.predictedClass,
            probability: predJson.probability,
            confidence: predJson.confidence,
            isDemoMode: predJson.isDemoMode,
            modelSourceLabel: predJson.modelSourceLabel,
            features: predJson.computedFeatures ?? proc.features,
            featureContributions:
              predJson.featureContributions ?? localPred.featureContributions,
          };
          setPrediction(resolvedPred);
          setPredictionHistory((prev) =>
            upsertPredictionHistory(
              prev,
              buildHistoryEntryForSample(sampleMeta, customNameOverride, proc, resolvedPred),
              5
            )
          );
        }
      } catch {
        // Keep localPred if offline
      } finally {
        setIsPredicting(false);
      }

      try {
        const explainRes = await fetch('/api/explain', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            prediction: resolvedPred,
            features: proc.features,
            sampleMetadata: sampleMeta,
          }),
        });
        if (explainRes.ok) {
          const explainJson: ExplanationResult = await explainRes.json();
          setExplanation(explainJson);
        }
      } catch {
        // Keep previous or fallback
      } finally {
        setIsExplaining(false);
      }
    },
    []
  );

  // Trigger initial explanation on mount
  useEffect(() => {
    const initialMeta =
      BUILTIN_SAMPLE_METADATA.find((s) => s.id === 'confirmed-planet') ?? null;
    runBackendPredictionAndExplanation(processedData, initialMeta, null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleSwitchTab = useCallback((tab: ActiveTab) => {
    playTwinkleSound('tab');
    setActiveTab(tab);
  }, []);

  const handleSelectDemoSample = useCallback(
    (sampleId: string) => {
      playTwinkleSound('chime');
      setCsvError(null);
      setCustomFileName(null);
      setSelectedSampleId(sampleId);
      const rawPts = generateDemoLightCurvePoints(sampleId);
      setRawSource({ points: rawPts, nanDropped: 0 });
      const proc = preprocessLightCurve(rawPts, 0, 2001, medianWindowSize);
      setProcessedData(proc);
      const meta = BUILTIN_SAMPLE_METADATA.find((s) => s.id === sampleId) ?? null;
      runBackendPredictionAndExplanation(proc, meta);
    },
    [medianWindowSize, runBackendPredictionAndExplanation]
  );

  const handleCycleNextSample = useCallback(() => {
    const allIds = BUILTIN_SAMPLE_METADATA.map((s) => s.id);
    const nextId = getNextSampleId(selectedSampleId, allIds);
    const nextMeta = BUILTIN_SAMPLE_METADATA.find((s) => s.id === nextId);
    handleSelectDemoSample(nextId);
    setLastShortcutFeedback(`[S] Switched Sample → ${nextMeta?.name ?? nextId}`);
  }, [selectedSampleId, handleSelectDemoSample]);

  const handleTogglePlayScan = useCallback(() => {
    playTwinkleSound('toggle');
    setIsPlayingScan((prev) => {
      const next = !prev;
      setLastShortcutFeedback(
        next ? '[Space] Transit Scan: Playing' : '[Space] Transit Scan: Paused'
      );
      return next;
    });
  }, []);

  const handleToggleTransitMarkers = useCallback(() => {
    playTwinkleSound('toggle');
    setShowTransitMarkers((prev) => {
      const next = !prev;
      setLastShortcutFeedback(
        next ? '[M] Transit Window Markers: ON' : '[M] Transit Window Markers: OFF'
      );
      return next;
    });
  }, []);

  const handleTriggerUploadShortcut = useCallback(() => {
    playTwinkleSound('chime');
    setActiveTab('classifier');
    setShowPasteModal(true);
    setCsvError(null);
    setLastShortcutFeedback('[U] Opened CSV Upload & Paste Drawer');
  }, []);

  // Global Keyboard Shortcuts Listener ('U', 'S', 'Space', 'M', '1', '2', '3')
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement | null;
      const tagName = target?.tagName?.toLowerCase() ?? '';
      const isEditingText =
        tagName === 'input' ||
        tagName === 'textarea' ||
        tagName === 'select' ||
        Boolean(target?.isContentEditable);

      const action = resolveKeyboardShortcut(e.key, isEditingText, {
        ctrlKey: e.ctrlKey,
        metaKey: e.metaKey,
        altKey: e.altKey,
      });

      if (!action) return;

      e.preventDefault();

      switch (action) {
        case 'TOGGLE_PLAY':
          handleTogglePlayScan();
          break;
        case 'CYCLE_SAMPLE':
          setActiveTab('classifier');
          handleCycleNextSample();
          break;
        case 'OPEN_UPLOAD':
          handleTriggerUploadShortcut();
          break;
        case 'TOGGLE_MARKERS':
          setActiveTab('classifier');
          handleToggleTransitMarkers();
          break;
        case 'TAB_CLASSIFIER':
          handleSwitchTab('classifier');
          setLastShortcutFeedback('[1] Switched to Transit Classifier');
          break;
        case 'TAB_ARCHITECTURE':
          handleSwitchTab('architecture');
          setLastShortcutFeedback('[2] Switched to 1D CNN Architecture');
          break;
        case 'TAB_TRAINING':
          handleSwitchTab('training');
          setLastShortcutFeedback('[3] Switched to Colab Training Guide');
          break;
        default:
          break;
      }
    };

    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [
    handleTogglePlayScan,
    handleCycleNextSample,
    handleTriggerUploadShortcut,
    handleToggleTransitMarkers,
    handleSwitchTab,
  ]);

  const handleMedianWindowChange = (newWindowSize: number) => {
    const clampedOdd = Math.max(
      9,
      Math.min(241, newWindowSize % 2 === 0 ? newWindowSize + 1 : newWindowSize)
    );
    setMedianWindowSize(clampedOdd);
    const proc = preprocessLightCurve(
      rawSource.points,
      rawSource.nanDropped,
      2001,
      clampedOdd
    );
    setProcessedData(proc);
    runBackendPredictionAndExplanation(proc, activeSampleMeta, customFileName);
  };

  const handleProcessCsvText = (csvString: string, sourceFileName: string) => {
    playTwinkleSound('chime');
    const parseResult = parseLightCurveCSV(csvString);
    if (!parseResult.ok) {
      setCsvError(parseResult.error ?? 'Invalid CSV format.');
      return false;
    }

    setCsvError(null);
    setCustomFileName(sourceFileName);
    setSelectedSampleId('');
    setRawSource({
      points: parseResult.points,
      nanDropped: parseResult.nanDroppedCount,
    });
    const proc = preprocessLightCurve(
      parseResult.points,
      parseResult.nanDroppedCount,
      2001,
      medianWindowSize
    );
    setProcessedData(proc);
    runBackendPredictionAndExplanation(proc, null, sourceFileName);
    return true;
  };

  const handlePopulateComparisonDeck = () => {
    setPredictionHistory(buildInitialHistoryDeck());
  };

  const handleClearHistory = () => {
    if (!prediction) return;
    setPredictionHistory([
      buildHistoryEntryForSample(
        activeSampleMeta,
        customFileName,
        processedData,
        prediction
      ),
    ]);
  };

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (event) => {
      const content = typeof event.target?.result === 'string' ? event.target.result : '';
      handleProcessCsvText(content, file.name);
    };
    reader.readAsText(file);
    e.target.value = '';
  };

  const handleDownloadActiveCsv = () => {
    playTwinkleSound('chime');
    const rawPts = processedData.points.map((p) => ({
      time: p.time,
      flux: p.rawFlux,
    }));
    const csvStr = pointsToCSVString(rawPts);
    const blob = new Blob([csvStr], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${selectedSampleId || customFileName || 'kepler_light_curve'}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const handleToggleAudio = () => {
    const nextMuted = !audioMuted;
    setAudioMuted(nextMuted);
    setSoundEnabled(!nextMuted);
    if (!nextMuted) {
      playTwinkleSound('chime');
    }
  };

  return (
    <div className="min-h-screen flex flex-col bg-transparent text-slate-100 relative">
      {/* Animated Twinkling Starfield Particle Canvas */}
      <StarfieldCanvas />

      {/* Top Bar Contract: 3 Zones separated by gap-8 */}
      <header className="flex items-center justify-between gap-3 sm:gap-8 px-4 sm:px-6 py-3.5 border-b border-slate-800/90 bg-[#07090E]/90 backdrop-blur-sm sticky top-0 z-30">
        {/* Zone 1: Single text element wordmark */}
        <a
          href="#top"
          onClick={(e) => {
            e.preventDefault();
            handleSwitchTab('classifier');
          }}
          className="text-sm sm:text-base font-bold tracking-tight text-slate-100 whitespace-nowrap shrink-0"
        >
          Exoplanet Finder <span className="hidden sm:inline">— Kepler Transit Classifier</span>
        </a>

        {/* Zone 2: 4 concise single-line navigation links */}
        <nav
          aria-label="Primary Workspace Navigation"
          className="hidden md:flex items-center gap-6 text-sm font-medium text-slate-300"
        >
          <button
            type="button"
            onClick={() => handleSwitchTab('classifier')}
            className={`py-1 transition-colors whitespace-nowrap shrink-0 ${
              activeTab === 'classifier'
                ? 'text-cyan-400 underline underline-offset-8 decoration-2 decoration-cyan-400'
                : 'hover:text-slate-100'
            }`}
          >
            Transit Classifier
          </button>
          <button
            type="button"
            onClick={() => handleSwitchTab('architecture')}
            className={`py-1 transition-colors whitespace-nowrap shrink-0 ${
              activeTab === 'architecture'
                ? 'text-cyan-400 underline underline-offset-8 decoration-2 decoration-cyan-400'
                : 'hover:text-slate-100'
            }`}
          >
            1D CNN Architecture
          </button>
          <button
            type="button"
            onClick={() => handleSwitchTab('training')}
            className={`py-1 transition-colors whitespace-nowrap shrink-0 ${
              activeTab === 'training'
                ? 'text-cyan-400 underline underline-offset-8 decoration-2 decoration-cyan-400'
                : 'hover:text-slate-100'
            }`}
          >
            Colab Training Guide
          </button>
          <button
            type="button"
            onClick={handleDownloadActiveCsv}
            className="py-1 text-slate-300 hover:text-slate-100 transition-colors whitespace-nowrap shrink-0"
          >
            Export Active CSV
          </button>
        </nav>

        {/* Zone 3: 1 primary action */}
        <div className="flex items-center gap-3 shrink-0">
          <input
            ref={fileInputRef}
            type="file"
            accept=".csv,.txt,.tsv"
            onChange={handleFileUpload}
            className="hidden"
            aria-label="Upload CSV file input"
          />
          <button
            type="button"
            onClick={() => {
              playTwinkleSound('chime');
              setActiveTab('classifier');
              fileInputRef.current?.click();
            }}
            className="px-3 sm:px-4 py-2 text-xs font-semibold text-slate-950 bg-cyan-400 hover:bg-cyan-300 rounded-md transition-colors whitespace-nowrap shrink-0"
          >
            Upload CSV
          </button>
        </div>
      </header>

      {/* Mobile Navigation Bar */}
      <div className="flex md:hidden items-center justify-around border-b border-slate-800 bg-slate-950/90 px-3 py-2 text-xs font-medium relative z-20">
        <button
          type="button"
          onClick={() => handleSwitchTab('classifier')}
          className={`px-3 py-1.5 rounded whitespace-nowrap ${
            activeTab === 'classifier' ? 'bg-cyan-500/20 text-cyan-300' : 'text-slate-400'
          }`}
        >
          Classifier
        </button>
        <button
          type="button"
          onClick={() => handleSwitchTab('architecture')}
          className={`px-3 py-1.5 rounded whitespace-nowrap ${
            activeTab === 'architecture' ? 'bg-cyan-500/20 text-cyan-300' : 'text-slate-400'
          }`}
        >
          1D CNN Model
        </button>
        <button
          type="button"
          onClick={() => handleSwitchTab('training')}
          className={`px-3 py-1.5 rounded whitespace-nowrap ${
            activeTab === 'training' ? 'bg-cyan-500/20 text-cyan-300' : 'text-slate-400'
          }`}
        >
          Colab Guide
        </button>
      </div>

      {/* Prominent Mandatory Scientific Disclaimer Banner + Global Keyboard Shortcuts & Sound Bar */}
      <div
        role="region"
        aria-label="Scientific Scope Disclaimer and Keyboard Shortcuts"
        className="bg-slate-950/90 border-b border-slate-800/90 px-4 sm:px-6 py-2.5 text-xs text-slate-300 flex flex-col xl:flex-row xl:items-center justify-between gap-2.5 relative z-20"
      >
        <div>
          <strong className="text-amber-300 font-semibold">Scientific Scope Notice:</strong>{' '}
          Educational classifier for NASA Kepler light curves. It does not confirm exoplanets —
          scientific confirmation requires additional vetting and follow-up telescope observations.
        </div>

        <div className="flex flex-wrap items-center gap-3">
          {/* Interactive Global Keyboard Shortcuts Status & Quick Triggers */}
          <div
            data-testid="keyboard-shortcuts-bar"
            className="flex flex-wrap items-center gap-2 bg-slate-900/90 border border-slate-800 rounded px-2.5 py-1 font-mono text-[11px]"
          >
            <Keyboard className="w-3.5 h-3.5 text-cyan-400 shrink-0" />
            <button
              type="button"
              onClick={handleCycleNextSample}
              className="text-slate-300 hover:text-cyan-300 transition-colors whitespace-nowrap"
            >
              <kbd className="text-cyan-300 font-semibold">[S]</kbd> Next Sample
            </button>
            <span aria-hidden="true" className="text-slate-600">·</span>
            <button
              type="button"
              onClick={handleTriggerUploadShortcut}
              className="text-slate-300 hover:text-cyan-300 transition-colors whitespace-nowrap"
            >
              <kbd className="text-cyan-300 font-semibold">[U]</kbd> Upload
            </button>
            <span aria-hidden="true" className="text-slate-600">·</span>
            <button
              type="button"
              onClick={handleTogglePlayScan}
              className="text-slate-300 hover:text-cyan-300 transition-colors whitespace-nowrap"
            >
              <kbd className="text-cyan-300 font-semibold">[Space]</kbd>{' '}
              {isPlayingScan ? 'Pause' : 'Play'}
            </button>
            <span aria-hidden="true" className="text-slate-600">·</span>
            <button
              type="button"
              onClick={handleToggleTransitMarkers}
              className="text-slate-300 hover:text-cyan-300 transition-colors whitespace-nowrap"
            >
              <kbd className="text-cyan-300 font-semibold">[M]</kbd> Markers
            </button>
            <span aria-hidden="true" className="text-slate-600">·</span>
            <span
              data-testid="shortcut-feedback-status"
              className="text-amber-300 whitespace-nowrap"
            >
              {lastShortcutFeedback}
            </span>
          </div>

          <button
            type="button"
            onClick={handleToggleAudio}
            aria-label={audioMuted ? 'Enable celestial chime sound' : 'Mute celestial chime sound'}
            className="inline-flex items-center gap-1.5 px-2.5 py-1 text-xs font-mono bg-slate-900 hover:bg-slate-800 text-cyan-300 border border-slate-800 rounded transition-colors whitespace-nowrap shrink-0"
          >
            {audioMuted ? (
              <>
                <VolumeX className="w-3.5 h-3.5 text-slate-400" />
                <span className="text-slate-400">Chime Sound: Off</span>
              </>
            ) : (
              <>
                <Volume2 className="w-3.5 h-3.5 text-cyan-400" />
                <span>Chime Sound: On</span>
              </>
            )}
          </button>
        </div>
      </div>

      {/* Main Content Container */}
      <main className="flex-1 max-w-[1440px] w-full mx-auto px-4 sm:px-6 py-6 relative z-10">
        {activeTab === 'classifier' && (
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
            {/* Left Column (3/12 on desktop): Upload, Prediction History & 6 Demo Light Curves Deck */}
            <aside
              aria-label="Light Curve Selection, Prediction History, and CSV Upload"
              className="lg:col-span-3 flex flex-col gap-5"
            >
              {/* Card 1: 6 Built-In NASA Kepler Demo Light Curves */}
              <div className="cyber-glass telemetry-tilt-card spring-enter-1 rounded-lg p-4 flex flex-col gap-3">
                <div className="flex items-center justify-between border-b border-slate-800/80 pb-2.5">
                  <div>
                    <div className="flex items-center gap-1.5 text-[10px] font-mono text-cyan-400">
                      <span className="w-1.5 h-1.5 rounded-full bg-cyan-400 animate-pulse" />
                      <span>[DECK.KEPLER // 6 ARCHETYPES]</span>
                    </div>
                    <h2 className="text-sm font-semibold text-slate-100 mt-0.5">
                      Select a Starlight Curve
                    </h2>
                  </div>
                  <button
                    type="button"
                    onClick={handleCycleNextSample}
                    title="Press 'S' to cycle samples"
                    className="px-2 py-1 text-[11px] font-mono bg-slate-950 hover:bg-slate-800 text-cyan-300 border border-slate-800 rounded transition-colors whitespace-nowrap"
                  >
                    Next (S)
                  </button>
                </div>

                <div className="flex flex-col gap-2">
                  {BUILTIN_SAMPLE_METADATA.map((sample) => {
                    const isSelected = !customFileName && selectedSampleId === sample.id;
                    const isPlanetArchetype =
                      sample.category === 'confirmed_planet' ||
                      sample.category === 'noisy_transit' ||
                      sample.category === 'unknown_candidate';

                    return (
                      <button
                        key={sample.id}
                        type="button"
                        onClick={() => handleSelectDemoSample(sample.id)}
                        className={`text-left p-3 rounded-md border transition-colors ${
                          isSelected
                            ? 'bg-cyan-950/45 border-cyan-400 text-slate-100 breathing-cyan-glow'
                            : 'bg-slate-950/70 border-slate-800/90 text-slate-300 hover:border-slate-700'
                        }`}
                      >
                        <div className="flex items-center justify-between gap-2">
                          <span className="text-xs font-semibold text-slate-100">
                            {sample.name}
                          </span>
                          <span
                            className={`text-[11px] font-mono ${
                              sample.isConfirmedPlanet
                                ? 'text-cyan-400'
                                : isPlanetArchetype
                                ? 'text-amber-300'
                                : 'text-rose-400'
                            }`}
                          >
                            {sample.kicId}
                          </span>
                        </div>
                        <p className="text-[11px] text-slate-400 mt-1 leading-snug">
                          {sample.shortDescription}
                        </p>
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* Card 2: Collapsible Prediction History Comparison Panel (Last 5 Results) */}
              <PredictionHistoryPanel
                history={predictionHistory}
                activeSampleId={customFileName ? `csv:${customFileName}` : selectedSampleId}
                onSelectHistorySample={handleSelectDemoSample}
                onPopulateComparisonDeck={handlePopulateComparisonDeck}
                onClearHistory={handleClearHistory}
              />

              {/* Card 3: CSV Upload & Schema Validator */}
              <div className="cyber-glass telemetry-tilt-card spring-enter-3 rounded-lg p-4 flex flex-col gap-3">
                <div className="border-b border-slate-800/80 pb-2.5">
                  <div className="flex items-center gap-1.5 text-[10px] font-mono text-cyan-400">
                    <span className="w-1.5 h-1.5 rounded-full bg-cyan-400 animate-pulse" />
                    <span>[DATA.INGEST // CSV TELEMETRY]</span>
                  </div>
                  <h2 className="text-sm font-semibold text-slate-100 mt-0.5">
                    Upload or Paste CSV (time, flux)
                  </h2>
                </div>

                <p className="text-xs text-slate-400 leading-relaxed">
                  Upload any CSV file with <code className="font-mono text-slate-200">time</code> and{' '}
                  <code className="font-mono text-slate-200">flux</code> columns. Empty rows and slow starlight waves are automatically cleaned.
                </p>

                <div className="flex flex-col gap-2">
                  <button
                    type="button"
                    onClick={() => {
                      playTwinkleSound('chime');
                      fileInputRef.current?.click();
                    }}
                    className="w-full inline-flex items-center justify-center gap-2 px-3.5 py-2.5 text-xs font-semibold bg-cyan-500 hover:bg-cyan-400 text-slate-950 rounded-md transition-colors"
                  >
                    <Upload className="w-4 h-4" />
                    <span>Choose CSV File (U)</span>
                  </button>

                  <div className="grid grid-cols-2 gap-2">
                    <button
                      type="button"
                      onClick={() => {
                        playTwinkleSound('toggle');
                        setShowPasteModal((prev) => !prev);
                        setCsvError(null);
                      }}
                      className="inline-flex items-center justify-center gap-1.5 px-2.5 py-2 text-xs font-medium bg-slate-950 hover:bg-slate-800 text-slate-200 border border-slate-800 rounded transition-colors whitespace-nowrap"
                    >
                      <FileSpreadsheet className="w-3.5 h-3.5 text-cyan-400" />
                      <span>{showPasteModal ? 'Hide CSV Box' : 'Paste CSV Data'}</span>
                    </button>

                    <button
                      type="button"
                      onClick={() => {
                        handleProcessCsvText(
                          'timestamp,brightness\n131.5,1.0001\n131.6,0.9998',
                          'malformed_headers.csv'
                        );
                      }}
                      className="inline-flex items-center justify-center gap-1.5 px-2.5 py-2 text-xs font-medium bg-slate-950 hover:bg-slate-800 text-amber-300 border border-slate-800 rounded transition-colors whitespace-nowrap"
                    >
                      <Sliders className="w-3.5 h-3.5" />
                      <span>Test Invalid CSV</span>
                    </button>
                  </div>
                </div>

                {/* Paste Custom CSV Drawer */}
                {showPasteModal && (
                  <div
                    data-testid="csv-paste-drawer"
                    className="mt-1 flex flex-col gap-2 bg-slate-950 border border-slate-800 rounded p-3"
                  >
                    <label htmlFor="paste-csv-textarea" className="text-xs font-mono text-slate-300">
                      Raw CSV (time,flux):
                    </label>
                    <textarea
                      id="paste-csv-textarea"
                      ref={pasteTextareaRef}
                      rows={5}
                      value={pasteCsvText}
                      onChange={(e) => setPasteCsvText(e.target.value)}
                      placeholder={'time,flux\n131.50,1.0001\n131.52,0.9984\n...'}
                      className="w-full bg-slate-900 border border-slate-800 rounded p-2 text-xs font-mono text-slate-200 focus:outline-none focus:border-cyan-500"
                    />
                    <div className="flex items-center justify-between gap-2">
                      <button
                        type="button"
                        onClick={() => {
                          playTwinkleSound('toggle');
                          const demoPts = generateDemoLightCurvePoints('confirmed-planet').slice(0, 60);
                          setPasteCsvText(pointsToCSVString(demoPts));
                        }}
                        className="text-[11px] font-mono text-cyan-400 hover:underline"
                      >
                        Fill sample rows
                      </button>
                      <button
                        type="button"
                        onClick={() =>
                          handleProcessCsvText(pasteCsvText, 'pasted_segment.csv')
                        }
                        className="px-3 py-1.5 text-xs font-medium bg-cyan-500 text-slate-950 rounded hover:bg-cyan-400"
                      >
                        Parse & Classify
                      </button>
                    </div>
                  </div>
                )}

                {/* CSV Validation Error Alert */}
                {csvError && (
                  <div
                    role="alert"
                    data-testid="csv-validation-error"
                    className="bg-rose-950/45 border border-rose-500/50 rounded-md p-3 text-xs text-rose-200 flex items-start gap-2.5"
                  >
                    <XCircle className="w-4 h-4 text-rose-400 shrink-0 mt-0.5" />
                    <div className="flex-1">
                      <div className="font-semibold text-rose-300">CSV Validation Error</div>
                      <p className="mt-0.5 leading-relaxed">{csvError}</p>
                    </div>
                  </div>
                )}

                {customFileName && !csvError && (
                  <div className="bg-cyan-950/30 border border-cyan-500/40 rounded-md p-2.5 text-xs text-cyan-200 flex items-center gap-2">
                    <CheckCircle2 className="w-4 h-4 text-cyan-400 shrink-0" />
                    <span className="truncate">
                      Loaded: <strong className="font-mono">{customFileName}</strong>
                    </span>
                  </div>
                )}

                <button
                  type="button"
                  onClick={handleDownloadActiveCsv}
                  className="inline-flex items-center justify-center gap-1.5 px-3 py-2 text-xs font-mono text-slate-300 hover:text-slate-100 bg-slate-950 border border-slate-800 rounded transition-colors"
                >
                  <Download className="w-3.5 h-3.5 text-cyan-400" />
                  <span>Download Current Curve (.csv)</span>
                </button>
              </div>
            </aside>

            {/* Right Main Stage (9/12 on desktop): Interactive Plot + Mission Control Observatory Deck + Prediction + Gemini Explainability */}
            <div className="lg:col-span-9 flex flex-col gap-6">
              <LightCurveChart
                points={processedData.points}
                window2001={processedData.window2001}
                features={processedData.features}
                stats={processedData.stats}
                activeSampleMeta={activeSampleMeta}
                customFileName={customFileName}
                medianWindowSize={medianWindowSize}
                onMedianWindowChange={handleMedianWindowChange}
                showTransitMarkers={showTransitMarkers}
                onToggleTransitMarkers={handleToggleTransitMarkers}
                isPlaying={isPlayingScan}
                onTogglePlay={handleTogglePlayScan}
              />

              {/* Mission Control Observatory Deck: 2D Orbital Simulator + Telemetry HUD + Spectral Signature Bar */}
              <MissionControlDeck
                features={processedData.features}
                prediction={prediction}
                activeSampleMeta={activeSampleMeta}
              />

              <PredictionAndExplainPanel
                prediction={prediction}
                isPredicting={isPredicting}
                explanation={explanation}
                isExplaining={isExplaining}
                features={processedData.features}
                activeSampleMeta={activeSampleMeta}
                onRefreshExplanation={() =>
                  runBackendPredictionAndExplanation(
                    processedData,
                    activeSampleMeta,
                    customFileName
                  )
                }
              />
            </div>
          </div>
        )}

        {activeTab === 'architecture' && (
          <ModelArchitectureView
            features={processedData.features}
            prediction={prediction}
          />
        )}

        {activeTab === 'training' && <ColabTrainingGuideView />}
      </main>

      {/* Quiet Educational Footer */}
      <footer className="border-t border-slate-800/80 bg-slate-950/90 px-6 py-4 mt-8 text-xs text-slate-400 flex flex-wrap items-center justify-between gap-4 relative z-20">
        <div className="flex items-center gap-2">
          <AlertCircle className="w-3.5 h-3.5 text-amber-400 shrink-0" />
          <span>
            Exoplanet Finder — Educational NASA Kepler Transit Classifier. Classifies planet
            candidates vs. false positives; does not confirm exoplanets.
          </span>
        </div>
        <div className="font-mono text-slate-400">
          1D CNN Input(2001,1) · Gemini Explainability
        </div>
      </footer>
    </div>
  );
}
