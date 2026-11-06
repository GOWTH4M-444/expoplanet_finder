<div align="center">

# 🪐 EXOPLANET FINDER — KEPLER TRANSIT CLASSIFIER
### *Deep-Space Photometric Vetting Observatory · 1D CNN Transit Inference · 3D Orbital Twin · Gemini Explainability*

`[SYS.STATUS // MISSION ACTIVE & VETTED]` · `[TELEMETRY // KIC PHOTOMETRY PIPELINE v2.4]` · `[INPUT // TENSOR (2001, 1)]`

[![License: MIT](https://img.shields.io/badge/License-MIT-06b6d4.svg?style=for-the-badge)](https://opensource.org/licenses/MIT)
[![TensorFlow](https://img.shields.io/badge/TensorFlow_2.x-FF6F00?style=for-the-badge&logo=tensorflow&logoColor=white)](https://www.tensorflow.org/)
[![React 19](https://img.shields.io/badge/React_19-20232A?style=for-the-badge&logo=react&logoColor=61DAFB)](https://react.dev/)
[![Three.js](https://img.shields.io/badge/Three.js_%2B_Drei-000000?style=for-the-badge&logo=threedotjs&logoColor=white)](https://threejs.org/)
[![FastAPI](https://img.shields.io/badge/FastAPI_/_Node-009688?style=for-the-badge&logo=fastapi&logoColor=white)](https://fastapi.tiangolo.com/)
[![Build Status](https://img.shields.io/badge/Build-Passing-10b981?style=for-the-badge&logo=githubactions&logoColor=white)](#)

</div>

---

> **🛰️ SCIENTIFIC SCOPE & MISSION MANDATE**
> **Exoplanet Finder — Kepler Transit Classifier** is an interactive educational and diagnostic observatory built to analyze NASA Kepler stellar light curves. It classifies photometric segments into **`Planet candidate`** vs. **`Not planet / false positive`** (such as eclipsing binary stars, starspot rotation waves, or spacecraft thruster artifacts) and explains the physical evidence. **This system does not claim to discover or officially confirm exoplanets**—scientific confirmation always requires independent radial-velocity mass measurements, high-resolution imaging, and multi-quarter transit-timing verification.

---

## 🌌 1. Mission Overview & Core Capabilities

Every time an exoplanet crosses in front of its host star, it blocks a tiny fraction of starlight—often less than **0.01% to 0.2% (100 to 2,000 ppm)**—creating a periodic dip in the star's brightness curve. However, grazing binary stars, background stellar blends, and spacecraft jitter frequently masquerade as planetary transits.

**Exoplanet Finder** bridges raw space-telescope photometry, deep learning, 3D orbital mechanics, and natural-language astrophysics:

* **`[TEL.KEPLER // PHOTOMETRIC STREAM]`** — Ingests custom `time, flux` CSV light curves or 6 vetted NASA Kepler archetypes, automatically sorting timestamps, filtering `NaN` drop-outs, removing stellar variability via an adjustable rolling median filter, and resampling onto a standardized **`2,001 × 1`** tensor.
* **`[CNN.1D // STELLAR SYNAPSE MATRIX]`** — Evaluates transit morphology using a 1D Convolutional Neural Network trained on star-grouped Kepler light curves (`exoplanet_cnn.keras`), paired with a transparent, physics-informed fallback heuristic when running in standalone mode.
* **`[3D.TWIN // THREE.JS & DREI OBSERVATORY]`** — Renders an interactive 3D digital twin of the host star and orbiting companion, calculating real-time camera-perspective **Flux Attenuation (`-ΔF%`)** as the planet transits across the stellar disk.
* **`[AI.VET // GEMINI EXPLAINABILITY ENGINE]`** — Translates raw numeric telemetry (transit depth in ppm, duration, periodicity, U-shape vs. V-shape profile, and odd-even eclipse checks) into plain-English scientific briefings and interactive Q&A.

---

## 🛰️ 2. Immersive Feature Highlights

### 🔭 A. 3D Exoplanet & Host Star Transit Observatory (`Three.js` + `@react-three/drei`)
* **Ultra-Dark Deep Space Scene (`#030712`)**: Surrounded by a **2,000-point twinkling starfield** (`@react-three/drei` `<Stars />`) with responsive damped `<OrbitControls />`.
* **Composite Host Star & Fresnel Corona**: Procedural solar granulation photosphere, warm emissive lighting, an overlapping semi-transparent **Fresnel corona shader**, and an equatorial solar flare ring.
* **Regime-Adaptive Exoplanet & Atmospheric Rim**: Dynamically morphs between a cratered silicate **Rocky Super-Earth**, a banded **Gas Giant / Sub-Neptune**, or an **Eclipsing Binary Companion**, complete with an additive **Atmospheric Fresnel Glow** mesh.
* **Live Camera-Perspective Occultation HUD**: Tracks the 3D line-of-sight vector between the camera, planet, and star disk—switching between `TRANSIT IN PROGRESS` and `STELLAR FLUX NOMINAL` while computing live **Flux Attenuation (`-0.1789%`)**.

### 🧠 B. 1D Convolutional Neural Network ("The Stellar Synapse Matrix")
* **Holographic Neural Conduit**: Visualizes the 1D CNN architecture as stacked **Spectral Lens Filters** (`Conv1D` layers), **Gravitational Lensing Nodes** (`MaxPooling1D` layers), and a **Core Reactor Array** (`Dense` layers).
* **Interactive Forward Pass Animation**: Trigger a live neural pulse to watch a packet of 2,001-point starlight data propagate layer-by-layer from the input tensor to the final sigmoid classification badge (`[EXOPLANET CANDIDATE: 97.0%]`).

### 📊 C. Mission Control Telemetry HUD & Resonance Vetting
* **Stellar Flux Stability Index**: Circular SVG progress ring quantifying baseline photometric scatter ($\text{ppm}$) across the host star.
* **Multi-Stage Color-Coded SNR Array**: Tri-band Signal-to-Noise threshold bar spanning **Stage 1 (`<6× Noise`)**, **Stage 2 (`6–14× Vet`)**, and **Stage 3 (`>14× Lock`)**.
* **Period-Synchronized Phase Lock Indicator**: Modulates its breathing opacity cycle ($0.56 \rightarrow 1.0$) at a frequency derived directly from the detected orbital period $P$.
* **Solar System Orbital Resonance Check**: Automatically flags small-integer commensurabilities ($1:1, 1:2, 2:3, 3:2, 4:3$, and Kepler short-cadence harmonics) against **Mercury**, **Venus**, **Earth**, and **Mars** (`⚠ RESONANCE WARNING` vs. `● NON-RESONANT`).
* **Live Scrolling Telemetry Logs**: Terminal event stream at the bottom of the deck logging `Classification Started`, `Period Detected`, `Resonance Check Evaluated`, `SNR Threshold Verified`, and `3D Orbital Twin Synchronized`.

### 📈 D. Interactive Light-Curve Preprocessing & Median Filter Slider
* **Real-Time Rolling Median Slider (`9 pts` to `241 pts`)**: Drag the smoothing window or click quick presets (**Narrow `9 pts`**, **Optimal `141 pts`**, **Wide `233 pts`**) to see how over-smoothing erases transit dips while optimal detrending flattens starspot waves.
* **Transit Window Marker Toggle & Brush Zoom**: Toggle predicted transit markers on/off (`[M]`), zoom directly to the primary dip, or inspect the exact **2,001-Point Model Input** tensor.

### 🗂️ E. Prediction History Comparison Log & Global Keyboard Shortcuts
* **Collapsible 5-Target Comparison Sidebar**: Automatically records the last 5 classified star segments with one-click recall to compare transit depth ($\text{ppm}$), planetary radius ($R_\oplus$), and orbital period ($P$).
* **Zero-Latency Hotkeys** & **Web Audio Celestial Chimes**:
  * <kbd>S</kbd> — Cycle through the 6 built-in NASA Kepler archetypes
  * <kbd>U</kbd> — Open the CSV Light-Curve Upload modal
  * <kbd>Space</kbd> — Play / Pause the live photometric scan
  * <kbd>M</kbd> — Toggle predicted transit window markers
  * <kbd>1</kbd> / <kbd>2</kbd> / <kbd>3</kbd> — Switch between **Transit Classifier**, **1D CNN Architecture**, and **Colab Training Guide**

---

## 🏗️ 3. Architecture & Tech Stack

```text
┌──────────────────────────────────────────────────────────────────────────────┐
│                     FRONTEND OBSERVATORY (React 19 + Vite)                   │
│  ┌────────────────────────┐  ┌──────────────────────┐  ┌──────────────────┐  │
│  │ Recharts Photometry    │  │ ExoplanetTransit     │  │ Mission Control  │  │
│  │ + Rolling Median       │  │ Viewer (Three.js +   │  │ Telemetry HUD +  │  │
│  │ Detrending Pipeline    │  │ @react-three/drei)   │  │ Resonance Check  │  │
│  └───────────┬────────────┘  └──────────┬───────────┘  └────────┬─────────┘  │
└──────────────┼──────────────────────────┼───────────────────────┼────────────┘
               │ Normalized (2001, 1)     │ Extracted Telemetry   │
               ▼                          ▼                       ▼
┌──────────────────────────────────────────────────────────────────────────────┐
│                BACKEND INFERENCE & AI GATEWAY (FastAPI / Node)               │
│  ┌────────────────────────────────────┐  ┌────────────────────────────────┐  │
│  │ 1D CNN Inference Engine            │  │ Gemini 2.5 Flash Explainability│  │
│  │ • TensorFlow/Keras (exoplanet_cnn) │  │ • Structured Evidence Summary  │  │
│  │ • Deterministic Physics Fallback   │  │ • Interactive Astrophysics Q&A │  │
│  └────────────────────────────────────┘  └────────────────────────────────┘  │
└──────────────────────────────────────────────────────────────────────────────┘
```

| Layer | Technology | Role in Mission Control |
| :--- | :--- | :--- |
| **Frontend UI** | **React 19, TypeScript, Tailwind CSS v4** | Space-themed glassmorphic observatory, state management, keyboard shortcuts, and Web Audio synthesizer |
| **3D Graphics** | **Three.js, `@react-three/fiber`, `@react-three/drei`** | Real-time 3D host star, Fresnel atmospheric shader, orbital mechanics, and live flux attenuation |
| **2D Visualization** | **Recharts + HTML5 Canvas** | Interactive light-curve plotting, brush zoom/pan, transit window markers, and 2D photometric cross-section |
| **ML Inference** | **TensorFlow / Keras (`1D CNN`)** | Evaluates `2,001 × 1` normalized flux tensors for planetary transit signatures vs. false positives |
| **Backend Runtime** | **Python FastAPI (`uvicorn`) / Node Express** | Serves `/api/predict`, `/api/explain`, and `/api/qa` endpoints with automatic physics fallback |
| **Explainable AI** | **Google Gemini API (`@google/genai`)** | Generates grounded scientific explanations and answers user follow-up questions |

---

## 🚀 4. Quickstart & Local Development Guide

### Step 1: Clone the Repository
```bash
git clone https://github.com/your-username/exoplanet-finder-kepler-classifier.git
cd exoplanet-finder-kepler-classifier
```

### Step 2: Set Up the Python FastAPI Inference Service (Optional for Custom `.keras` Weights)
If you have trained your `exoplanet_cnn.keras` model in Google Colab (see **Section 5**), you can run the dedicated Python FastAPI microservice:

```bash
# Create and activate a virtual environment
python -m venv .venv
source .venv/bin/activate  # On Windows: .venv\Scripts\activate

# Install TensorFlow, FastAPI, and Uvicorn
pip install fastapi uvicorn tensorflow numpy pydantic

# Place your trained exoplanet_cnn.keras file in ./models/exoplanet_cnn.keras
# Start the FastAPI inference server on port 8000
uvicorn backend.main:app --host 0.0.0.0 --port 8000 --reload
```

> **💡 Zero-Config Fallback:** If `exoplanet_cnn.keras` is not present, the application automatically runs its built-in **Deterministic Physics Vetting Engine** so every feature works out-of-the-box without requiring a GPU.

### Step 3: Install Frontend & Full-Stack Dependencies and Launch Mission Control
```bash
# Install Node.js packages
npm install

# Configure your environment variables
cp .env.example .env
# Add your GEMINI_API_KEY inside .env for live AI explainability

# Run the unit test suite (10 astrophysical & pipeline tests)
npm test

# Launch the development observatory on http://localhost:3000
npm run dev
```

---

## 🧬 5. 1D CNN Model Training & Google Colab Guide

The classifier uses a **7-stage 1D Convolutional Neural Network** tailored for `2,001`-point normalized Kepler flux windows:

```text
Input(2001, 1)
  ──► [Conv1D(16, k=9, ReLU) + BatchNorm + MaxPool1D(2)]   # Local ingress/egress edge detector
  ──► [Conv1D(32, k=7, ReLU) + BatchNorm + MaxPool1D(2)]   # U-shape vs. V-shape dip profile extractor
  ──► [Conv1D(64, k=5, ReLU) + BatchNorm + MaxPool1D(2)]   # Multi-orbit periodicity & secondary check
  ──► [GlobalAveragePooling1D]                             # Phase-translation invariance
  ──► [Dense(64, ReLU) + Dropout(0.30)]                    # Nonlinear astrophysical feature fusion
  ──► [Dense(1, Sigmoid)]                                  # P(Planet Candidate) ∈ [0.0, 1.0]
```

### How to Train Your Own Weights in Google Colab
1. Open the **Colab Training Guide** tab directly inside the web application and click **Download `.ipynb` Notebook** (`exoplanet_1d_cnn_colab.ipynb`).
2. Upload the notebook to **Google Colab** and select a **T4 GPU** runtime.
3. The notebook walks through:
   * Fetching NASA Kepler light curves via `lightkurve` (`PDCSAP_FLUX`).
   * **Leakage-Safe Splitting**: Using `GroupShuffleSplit` grouped by `kepid` (Kepler Star ID) so segments from the same star never leak across training and test sets.
   * **Class Imbalance**: Applying `compute_class_weight('balanced')` and evaluating with **PR-AUC** and **ROC-AUC**.
   * Exporting `exoplanet_cnn.keras` and `model_metrics.json` for local deployment.

---

## ⚠️ 6. Scientific Caveat & License

> **🔭 Mandatory Astronomical Disclaimer**
> A photometric transit light curve only measures the **relative radius ratio** $\Delta F \approx (R_p / R_\star)^2$ and orbital ephemeris of a transiting body. Because grazing eclipsing binaries, hierarchical triple systems, background stellar blends, and instrumental artifacts can closely mimic planetary transits, **this application only identifies `Planet candidates` vs. `Likely false positives`**. Confirming a true exoplanet requires follow-up **radial-velocity spectroscopy** (to measure planetary mass and rule out stellar companions), centroid-shift analysis, and statistical validation.

### License
Distributed under the **MIT License**. Built for open-source astronomy education, citizen science vetting, and deep-space machine learning exploration.
