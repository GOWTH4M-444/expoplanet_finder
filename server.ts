import express from 'express';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import dotenv from 'dotenv';
import { GoogleGenAI, ThinkingLevel } from '@google/genai';
import { createServer as createViteServer } from 'vite';
import {
  BUILTIN_SAMPLE_METADATA,
  generateDemoLightCurvePoints,
  pointsToCSVString,
} from './src/utils/demoCurves';
import {
  parseLightCurveCSV,
  preprocessLightCurve,
  predictWithDemoHeuristic,
  resampleToLength,
} from './src/utils/lightCurve';
import {
  ExplanationResult,
  LightCurveFeatures,
  PredictionResult,
  SampleCurveMetadata,
} from './src/types/exoplanet';
import { COLAB_PYTHON_SCRIPT } from './src/utils/colabNotebookContent';

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const EXPLAIN_SYSTEM_PROMPT =
  'You are an astronomy explainability assistant for a NASA Kepler exoplanet-transit classifier. Explain results clearly for students and beginner ML practitioners. Use only the supplied prediction, probability, and light-curve features. Do not invent astronomical facts. Do not call an object a confirmed exoplanet unless the input metadata explicitly says it is confirmed. Explain that a transit is a small, periodic dip in stellar brightness, while eclipsing binaries and background sources can create similar dips. Keep the explanation under 180 words and format it as four short bullet points plus one caveat.';

function getGeminiClient(): GoogleGenAI | null {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey || apiKey === 'MY_GEMINI_API_KEY' || apiKey.trim() === '') {
    return null;
  }
  return new GoogleGenAI({
    apiKey,
    httpOptions: {
      headers: {
        'User-Agent': 'aistudio-build',
      },
    },
  });
}

/**
 * Generates a deterministic, strictly feature-grounded 4-bullet + 1-caveat explanation
 * following the exact system prompt rules when Gemini API is unreachable or unconfigured.
 */
function buildDeterministicExplanation(
  prediction: PredictionResult,
  features: LightCurveFeatures,
  sampleMeta?: SampleCurveMetadata | null
): ExplanationResult {
  const probPct = (prediction.probability * 100).toFixed(1);
  const isConfirmed = sampleMeta?.isConfirmedPlanet === true;
  const statusPhrase = isConfirmed
    ? `This light curve corresponds to a confirmed exoplanet in input metadata, and the classifier assigned a ${probPct}% planet candidate probability (${prediction.confidence} confidence).`
    : `The classifier labeled this segment "${prediction.predictedClass}" with ${probPct}% probability (${prediction.confidence} confidence); it is not a confirmed exoplanet.`;

  const dipBullet =
    features.dipCount > 0
      ? `Signal evidence: A planetary transit is a small, periodic dip in stellar brightness; here we observe ${features.dipCount} dip(s) with primary depth ${features.transitDepthPpm.toLocaleString()} ppm (${features.transitDepthPercent}%), duration ${features.transitDurationHours} hours, and ${features.dipShapeProfile} morphology.`
      : `Signal evidence: A planetary transit requires a small, periodic dip in brightness, but this segment remains near the ${features.baselineScatterPpm} ppm baseline noise floor (SNR ${features.snrProxy}) with zero significant dips.`;

  const modelWhyBullet =
    prediction.predictedClass === 'Planet candidate'
      ? `Classification rationale: The shallow depth (${features.transitDepthPercent}%), ${
          features.estimatedPeriodDays
            ? `repeating ${features.estimatedPeriodDays}-day period`
            : 'localized profile'
        }, and absence of alternating secondary eclipses match a planetary-sized disk crossing its host star.`
      : `Classification rationale: ${
          features.secondaryEclipseDetected || features.transitDepthPpm > 14000
            ? `The deep ${features.transitDepthPercent}% excursion and V-shaped/secondary eclipse structure indicate an eclipsing binary rather than a planet.`
            : features.dipShapeProfile === 'Asymmetric Artifact'
            ? 'The single non-repeating, sharply asymmetric flux drop matches an instrumental spacecraft artifact rather than an orbital transit.'
            : 'The lack of repeating, high-SNR U-shaped dips prevents classification as a planetary transit candidate.'
        }`;

  const fpAndFollowupBullet =
    'False-positive vetting & next steps: Eclipsing binaries, blended background binaries, starspots, and thruster artifacts can mimic transits; radial-velocity spectroscopy, centroid-shift analysis, and multi-quarter transit timing are needed to improve confidence.';

  const caveat = isConfirmed
    ? 'Scientific caveat: Although input metadata identifies this target as a previously confirmed exoplanet, a light curve alone only measures relative radius ratio and always requires independent radial-velocity or statistical validation.'
    : 'Scientific caveat: Photometric classification only identifies transit candidates vs. likely false positives—scientific confirmation of any exoplanet requires independent follow-up observations and radial-velocity mass vetting.';

  const bullets = [statusPhrase, dipBullet, modelWhyBullet, fpAndFollowupBullet];
  const rawText = bullets.map((b) => `• ${b}`).join('\n') + `\n\nCaveat: ${caveat}`;

  return {
    bullets,
    caveat,
    rawText,
    source: 'fallback',
    modelUsed: 'Deterministic Astronomy Explainability Engine',
  };
}

function parseGeminiExplanationText(text: string): { bullets: string[]; caveat: string } {
  const lines = text
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter((l) => l.length > 0);

  const bullets: string[] = [];
  let caveat = '';

  for (const line of lines) {
    const lower = line.toLowerCase();
    if (lower.startsWith('caveat:') || lower.startsWith('**caveat') || lower.includes('scientific caveat')) {
      caveat = line.replace(/^[-*•]\s*/, '').replace(/^\*\*caveat:?\*\*:?\s*/i, '').replace(/^caveat:?\s*/i, '').trim();
    } else if (/^[-*•\d.]/.test(line)) {
      const cleaned = line.replace(/^[-*•\d.)]+\s*/, '').replace(/\*\*/g, '').trim();
      if (cleaned) bullets.push(cleaned);
    } else if (!caveat && bullets.length >= 4) {
      caveat = line.replace(/\*\*/g, '').trim();
    } else if (bullets.length < 4) {
      bullets.push(line.replace(/\*\*/g, '').trim());
    }
  }

  if (!caveat && bullets.length > 4) {
    caveat = bullets.pop() || '';
  }
  if (!caveat) {
    caveat =
      'Scientific confirmation requires additional vetting, centroid analysis, and follow-up radial-velocity observations; this classifier alone cannot confirm an exoplanet.';
  }

  return {
    bullets: bullets.slice(0, 4),
    caveat,
  };
}

async function startServer() {
  const app = express();
  const PORT = 3000;

  app.use(express.json({ limit: '10mb' }));

  // Check if a trained Keras model file exists in the backend directory
  const kerasModelPath = path.join(__dirname, 'exoplanet_cnn.keras');

  // 1. GET /api/samples — Metadata for the 6 built-in demo Kepler light curves
  app.get('/api/samples', (req, res) => {
    const sampleId = typeof req.query.id === 'string' ? req.query.id : undefined;
    if (sampleId) {
      const meta = BUILTIN_SAMPLE_METADATA.find((s) => s.id === sampleId);
      if (!meta) {
        res.status(404).json({ error: `Sample "${sampleId}" not found.` });
        return;
      }
      const points = generateDemoLightCurvePoints(sampleId);
      const csv = pointsToCSVString(points);
      res.json({ metadata: meta, points, csv });
      return;
    }

    res.json({
      samples: BUILTIN_SAMPLE_METADATA,
      hasTrainedKerasFile: fs.existsSync(kerasModelPath),
    });
  });

  // 2. POST /api/predict — Preprocesses CSV or 2001-point window and runs classification
  app.post('/api/predict', (req, res) => {
    try {
      const { csv, points, normalizedWindow, features: clientFeatures } = req.body ?? {};
      const hasKerasModel = fs.existsSync(kerasModelPath);

      let window2001: number[] = [];
      let features: LightCurveFeatures | undefined = clientFeatures;
      let preprocessedResult = null;

      if (typeof csv === 'string' && csv.trim().length > 0) {
        const parsed = parseLightCurveCSV(csv);
        if (!parsed.ok) {
          res.status(400).json({ error: parsed.error });
          return;
        }
        preprocessedResult = preprocessLightCurve(parsed.points, parsed.nanDroppedCount, 2001);
        window2001 = preprocessedResult.window2001;
        features = preprocessedResult.features;
      } else if (Array.isArray(points) && points.length >= 10) {
        preprocessedResult = preprocessLightCurve(points, 0, 2001);
        window2001 = preprocessedResult.window2001;
        features = preprocessedResult.features;
      } else if (Array.isArray(normalizedWindow) && normalizedWindow.length > 0) {
        window2001 = resampleToLength(
          normalizedWindow.map((v: unknown) => Number(v)).filter((v: number) => Number.isFinite(v)),
          2001
        );
      } else {
        res.status(400).json({
          error:
            'Request must provide a valid "csv" string, "points" array, or 2001-point "normalizedWindow" array.',
        });
        return;
      }

      const prediction = predictWithDemoHeuristic(window2001, features);

      // Clearly flag whether exoplanet_cnn.keras is present or running Demo Mode heuristic
      if (!hasKerasModel) {
        prediction.isDemoMode = true;
        prediction.modelSourceLabel = 'Demo heuristic, not the trained CNN';
      }

      res.json({
        prediction: prediction.predictedClass,
        predictedClass: prediction.predictedClass,
        probability: prediction.probability,
        confidence: prediction.confidence,
        isDemoMode: prediction.isDemoMode,
        modelSourceLabel: prediction.modelSourceLabel,
        computedFeatures: prediction.features,
        featureContributions: prediction.featureContributions,
        stats: preprocessedResult?.stats ?? null,
        windowLength: window2001.length,
      });
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Unexpected prediction error';
      res.status(500).json({ error: message });
    }
  });

  // 3. POST /api/explain — Calls Gemini with the required astronomy explainability system prompt
  app.post('/api/explain', async (req, res) => {
    try {
      const { prediction, features, sampleMetadata, question } = req.body ?? {};
      if (!prediction || !features) {
        res.status(400).json({
          error: 'Both "prediction" and "features" objects are required for /api/explain.',
        });
        return;
      }

      const ai = getGeminiClient();

      // If student asked a custom follow-up question in the Q&A box
      if (typeof question === 'string' && question.trim().length > 0) {
        if (!ai) {
          // Deterministic educational Q&A answer grounded in the curve's features
          const qLower = question.toLowerCase();
          let answer = '';
          if (qLower.includes('binary') || qLower.includes('false positive')) {
            answer = `An eclipsing binary occurs when two stars orbit each other along our line of sight. Unlike a planet (which typically blocks 0.01%–1% of starlight and produces a flat-bottomed U-shaped dip), an eclipsing binary often produces deep V-shaped dips (${features.transitDepthPercent}% in this curve) and alternating secondary eclipses(${
              features.secondaryEclipseDetected ? 'detected here' : 'not seen here'
            }).`;
          } else if (qLower.includes('cnn') || qLower.includes('model') || qLower.includes('layer')) {
            answer = `A 1D Convolutional Neural Network slides short 5-point filters across the 2,001 normalized flux points. Early Conv1D layers detect local slopes (ingress and egress edges), while deeper Conv1D + GlobalAveragePooling1D layers evaluate overall dip symmetry, flat-bottom morphology, and repetition.`;
          } else if (qLower.includes('confirm') || qLower.includes('follow')) {
            answer = `A Kepler transit curve only shows that something dimmed the star by ${features.transitDepthPpm.toLocaleString()} ppm. Confirming a true planet requires high-resolution radial-velocity spectroscopy to measure the gravitational wobble (mass) and high-contrast imaging to rule out blended background stars.`;
          } else {
            answer = `For this segment (${prediction.predictedClass}, ${(
              prediction.probability * 100
            ).toFixed(1)}% probability), the primary evidence is a ${features.transitDepthPpm.toLocaleString()} ppm (${
              features.transitDepthPercent
            }%) excursion lasting ${features.transitDurationHours} hours with SNR ${
              features.snrProxy
            } and a ${features.dipShapeProfile} profile. Remember that additional radial-velocity and centroid vetting are required to confirm any planetary candidate.`;
          }
          res.json({ answer, source: 'fallback' });
          return;
        }

        try {
          const qaPrompt = `Context Data (Do not invent facts outside this data):
- Classification: ${prediction.predictedClass} (Probability: ${(prediction.probability * 100).toFixed(1)}%, Confidence: ${prediction.confidence})
- Metadata Confirmed Status: ${sampleMetadata?.isConfirmedPlanet ? 'Confirmed Exoplanet in NASA Archive' : 'Not confirmed / Candidate or False Positive'}
- Transit Depth: ${features.transitDepthPpm} ppm (${features.transitDepthPercent}%)
- Duration: ${features.transitDurationHours} hours
- Estimated Period: ${features.estimatedPeriodDays ? `${features.estimatedPeriodDays} days` : 'Single event / unknown'}
- SNR Proxy: ${features.snrProxy}
- Number of Dips: ${features.dipCount}
- Dip Shape Profile: ${features.dipShapeProfile}
- Secondary Eclipse Detected: ${features.secondaryEclipseDetected}

Student Question: "${question.trim()}"
Provide a clear, educational answer in 2-4 sentences for a student learning astronomy and ML.`;

          const response = await ai.models.generateContent({
            model: 'gemini-3.8-flash',
            contents: qaPrompt,
            config: {
              systemInstruction: EXPLAIN_SYSTEM_PROMPT,
              thinkingConfig: { thinkingLevel: ThinkingLevel.LOW },
            },
          });

          res.json({
            answer: response.text?.trim() || 'Unable to generate response.',
            source: 'gemini',
          });
          return;
        } catch {
          res.json({
            answer: `Based on the supplied light-curve features (depth ${features.transitDepthPpm.toLocaleString()} ppm, duration ${features.transitDurationHours} hrs, SNR ${features.snrProxy}, ${features.dipCount} dips, ${features.dipShapeProfile}), the classifier output "${prediction.predictedClass}" (${(prediction.probability * 100).toFixed(1)}%). Follow-up radial velocity and centroid vetting are always required before confirming any exoplanet.`,
            source: 'fallback',
          });
          return;
        }
      }

      // Standard 4-bullet + 1-caveat explanation
      if (!ai) {
        const fallback = buildDeterministicExplanation(prediction, features, sampleMetadata);
        res.json(fallback);
        return;
      }

      const userPrompt = `Explain this NASA Kepler light-curve classification result to a student:
- Predicted Class: ${prediction.predictedClass}
- Transit Probability: ${(prediction.probability * 100).toFixed(1)}% (raw: ${prediction.probability})
- Confidence Level: ${prediction.confidence}
- Classifier Mode: ${prediction.modelSourceLabel}
- Input Metadata Confirmed Status: ${
        sampleMetadata?.isConfirmedPlanet
          ? `Explicitly marked as confirmed exoplanet (${sampleMetadata.koiId})`
          : `NOT confirmed (${sampleMetadata?.dispositionLabel || 'Custom/Unconfirmed Upload'})`
      }
- Computed Features:
  * Transit Depth: ${features.transitDepthPpm} ppm (${features.transitDepthPercent}%)
  * Transit Duration: ${features.transitDurationHours} hours
  * Estimated Orbital Period: ${
    features.estimatedPeriodDays ? `${features.estimatedPeriodDays} days` : 'Not periodic / single event'
  }
  * Signal-to-Noise Proxy (SNR): ${features.snrProxy}
  * Number of Detected Dips: ${features.dipCount}
  * Dip Shape Morphology: ${features.dipShapeProfile}
  * Secondary Eclipse Detected: ${features.secondaryEclipseDetected ? 'Yes' : 'No'}
  * Baseline Photometric Scatter: ${features.baselineScatterPpm} ppm

Include:
1. What the light-curve dip suggests.
2. Why the model classified it as a planet candidate or false positive.
3. Common false-positive explanations (eclipsing binary, background eclipsing binary, stellar variability, instrumental artifact).
4. What additional evidence would improve confidence.
Plus one concise "Caveat:" line at the end.`;

      try {
        const response = await ai.models.generateContent({
          model: 'gemini-3.8-flash',
          contents: userPrompt,
          config: {
            systemInstruction: EXPLAIN_SYSTEM_PROMPT,
            thinkingConfig: { thinkingLevel: ThinkingLevel.LOW },
          },
        });

        const rawText = response.text?.trim() ?? '';
        if (!rawText) {
          res.json(buildDeterministicExplanation(prediction, features, sampleMetadata));
          return;
        }

        const parsed = parseGeminiExplanationText(rawText);
        if (parsed.bullets.length === 0) {
          res.json(buildDeterministicExplanation(prediction, features, sampleMetadata));
          return;
        }

        const result: ExplanationResult = {
          bullets: parsed.bullets,
          caveat: parsed.caveat,
          rawText,
          source: 'gemini',
          modelUsed: 'gemini-3.8-flash',
        };
        res.json(result);
      } catch {
        // Fallback gracefully so UI remains functional even if Gemini quota or key fails
        const fallback = buildDeterministicExplanation(prediction, features, sampleMetadata);
        res.json(fallback);
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Unexpected explainability error';
      res.status(500).json({ error: message });
    }
  });

  // 4. GET /api/colab-notebook — Downloads a ready-to-open Jupyter Notebook (.ipynb)
  app.get('/api/colab-notebook', (_req, res) => {
    const ipynb = {
      nbformat: 4,
      nbformat_minor: 0,
      metadata: {
        colab: {
          provenance: [],
          name: 'Exoplanet_Finder_Kepler_1D_CNN_Training.ipynb',
        },
        kernelspec: {
          name: 'python3',
          display_name: 'Python 3',
        },
      },
      cells: [
        {
          cell_type: 'markdown',
          metadata: {},
          source: [
            '# Exoplanet Finder — Kepler 1D CNN Transit Classifier\n',
            ' Educational training notebook for classifying NASA Kepler light-curve segments (`Planet Candidate = 1` vs `False Positive = 0`).\n',
            '- **Input:** Normalized 2,001-point Kepler PDCSAP flux window `(2001, 1)`\n',
            '- **Architecture:** `Input(2001,1) -> Conv1D(32,5,ReLU) -> MaxPool1D -> Conv1D(64,5,ReLU) -> GlobalAveragePooling1D -> Dense(32,ReLU) -> Dense(1,sigmoid)`\n',
            '- **Anti-Leakage Split:** Grouped strictly by host star (`kepid` / KIC ID) using `GroupShuffleSplit`.\n',
          ],
        },
        {
          cell_type: 'code',
          execution_count: null,
          metadata: {},
          outputs: [],
          source: COLAB_PYTHON_SCRIPT.split('\n').map((line) => line + '\n'),
        },
      ],
    };

    res.setHeader('Content-Type', 'application/x-ipynb+json');
    res.setHeader(
      'Content-Disposition',
      'attachment; filename="exoplanet_cnn_colab.ipynb"'
    );
    res.send(JSON.stringify(ipynb, null, 2));
  });

  if (process.env.NODE_ENV !== 'production') {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(__dirname, 'dist');
    app.use(express.static(distPath));
    app.get('*', (_req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`Exoplanet Finder server running on http://0.0.0.0:${PORT}`);
  });
}

startServer();
