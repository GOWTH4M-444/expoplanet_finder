export interface RawLightCurvePoint {
  time: number;
  flux: number;
}

export interface ProcessedLightCurvePoint {
  index: number;
  time: number;
  rawFlux: number;
  trendBaseline: number;
  normalizedFlux: number;
  inTransitWindow: boolean;
}

export interface TransitWindowRange {
  startTime: number;
  endTime: number;
  centerTime: number;
  startIndex: number;
  endIndex: number;
}

export interface LightCurveFeatures {
  transitDepthPpm: number;
  transitDepthPercent: number;
  transitDurationHours: number;
  estimatedPeriodDays: number | null;
  snrProxy: number;
  dipCount: number;
  baselineScatterPpm: number;
  dipShapeProfile: 'U-shaped (Flat Bottom)' | 'V-shaped (Grazing / Binary)' | 'Asymmetric Artifact' | 'Flat / Noise Floor';
  secondaryEclipseDetected: boolean;
  primaryTransitWindow: TransitWindowRange | null;
  summaryText: string;
}

export interface PreprocessingStats {
  initialRowCount: number;
  nanRemovedCount: number;
  interpolatedGapCount: number;
  timeSpanDays: number;
  cadenceMinutes: number;
  medianWindowSize: number;
  medianWindowHours: number;
  outputWindowLength: number;
}

export interface PreprocessedLightCurveResult {
  points: ProcessedLightCurvePoint[];
  window2001: number[];
  features: LightCurveFeatures;
  stats: PreprocessingStats;
}

export type SampleCategory =
  | 'confirmed_planet'
  | 'eclipsing_binary'
  | 'noisy_transit'
  | 'flat_no_transit'
  | 'instrumental_artifact'
  | 'unknown_candidate';

export interface SampleCurveMetadata {
  id: string;
  name: string;
  kicId: string;
  koiId: string;
  category: SampleCategory;
  isConfirmedPlanet: boolean;
  dispositionLabel: string;
  shortDescription: string;
  stellarMagnitude: number;
  stellarRadiusSolar: number;
}

export interface PredictionResult {
  predictedClass: 'Planet candidate' | 'Not planet / false positive';
  probability: number;
  confidence: 'Low' | 'Medium' | 'High';
  isDemoMode: boolean;
  modelSourceLabel: string;
  features: LightCurveFeatures;
  featureContributions: {
    label: string;
    impact: 'positive' | 'negative' | 'neutral';
    detail: string;
  }[];
}

export interface ExplanationResult {
  bullets: string[];
  caveat: string;
  rawText: string;
  source: 'gemini' | 'fallback';
  modelUsed: string;
}
