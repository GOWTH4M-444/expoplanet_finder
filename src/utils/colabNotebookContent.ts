export interface CNNLayerSpec {
  id: string;
  stepNumber: string;
  name: string;
  kerasSignature: string;
  outputShape: string;
  paramCount: string;
  roleTitle: string;
  simpleExplanation: string;
  astronomicalMeaning: string;
}

export const CNN_ARCHITECTURE_LAYERS: CNNLayerSpec[] = [
  {
    id: 'input',
    stepNumber: '01',
    name: 'Input(2001, 1)',
    kerasSignature: 'layers.Input(shape=(2001, 1))',
    outputShape: '(None, 2001, 1)',
    paramCount: '0',
    roleTitle: 'Normalized Starlight Window',
    simpleExplanation:
      'Receives a standardized 2,001-point slice of starlight measurements centered on a dip, where normal starlight brightness is scaled to 1.0000.',
    astronomicalMeaning:
      'Represents a clean segment of NASA Kepler Spacecraft Cleaned Brightness after removing slow starspot waves.',
  },
  {
    id: 'conv1',
    stepNumber: '02',
    name: 'Conv1D(32, kernel 5, ReLU)',
    kerasSignature: "layers.Conv1D(32, kernel_size=5, activation='relu', padding='same')",
    outputShape: '(None, 2001, 32)',
    paramCount: '192',
    roleTitle: 'Dip Edge & Slope Detector',
    simpleExplanation:
      'Slides 32 tiny 5-point magnifying glasses across the timeline to spot where the star begins to dim (entry) and brighten back up (exit).',
    astronomicalMeaning:
      'Tells the difference between the smooth, gradual dimming of a planet crossing a star and a sudden single-point camera glitch.',
  },
  {
    id: 'maxpool1',
    stepNumber: '03',
    name: 'MaxPool1D (pool=2)',
    kerasSignature: 'layers.MaxPooling1D(pool_size=2)',
    outputShape: '(None, 1000, 32)',
    paramCount: '0',
    roleTitle: 'Smart Time Compression',
    simpleExplanation:
      'Keeps the strongest signal in every pair of neighboring points, shrinking the timeline in half so the model does not get confused by tiny timing shifts.',
    astronomicalMeaning:
      'Ensures that even if a transit happens a few minutes early or late, its key dip edges are still recognized.',
  },
  {
    id: 'conv2',
    stepNumber: '04',
    name: 'Conv1D(64, kernel 5, ReLU)',
    kerasSignature: "layers.Conv1D(64, kernel_size=5, activation='relu', padding='same')",
    outputShape: '(None, 1000, 64)',
    paramCount: '10,304',
    roleTitle: 'U-Shape vs. V-Shape Inspector',
    simpleExplanation:
      'Combines local slopes into 64 wider pattern detectors that examine the overall shape of the bottom of the brightness dip.',
    astronomicalMeaning:
      'Separates flat-bottomed U-shaped planetary transits from steep, pointy V-shaped eclipsing binary star dips.',
  },
  {
    id: 'gap',
    stepNumber: '05',
    name: 'GlobalAvgPool1D',
    kerasSignature: 'layers.GlobalAveragePooling1D()',
    outputShape: '(None, 64)',
    paramCount: '0',
    roleTitle: 'Whole-Curve Pattern Summary',
    simpleExplanation:
      'Summarizes each of the 64 pattern detectors across the entire timeline into 64 clean scores, checking how consistently the pattern repeats.',
    astronomicalMeaning:
      'Rewards steady, repeating planetary transits while preventing the network from memorizing random background starlight noise.',
  },
  {
    id: 'dense1',
    stepNumber: '06',
    name: 'Dense(32, ReLU)',
    kerasSignature: "layers.Dense(32, activation='relu')",
    outputShape: '(None, 32)',
    paramCount: '2,080',
    roleTitle: 'Evidence Weighing Layer',
    simpleExplanation:
      'Combines all 64 pattern scores together—weighing dip depth, duration, symmetry, and baseline steadiness all at once.',
    astronomicalMeaning:
      'Flags impostors that look like a dip at first glance but show alternating deep-and-shallow eclipses from a two-star binary system.',
  },
  {
    id: 'output',
    stepNumber: '07',
    name: 'Dense(1, sigmoid)',
    kerasSignature: "layers.Dense(1, activation='sigmoid')",
    outputShape: '(None, 1)',
    paramCount: '33',
    roleTitle: 'Final Planet Candidate Score',
    simpleExplanation:
      'Converts the combined evidence into a smooth probability from 0% to 100%, where 50% or higher indicates a Planet Candidate.',
    astronomicalMeaning:
      'Produces a clear vetting priority score to help astronomers decide which stars deserve follow-up telescope observations.',
  },
];

export interface TrainingStepGuide {
  step: string;
  title: string;
  friendlyBadge: string;
  summary: string;
  criticalPitfall: string;
  codeSnippet: string;
}

export const TRAINING_PIPELINE_STEPS: TrainingStepGuide[] = [
  {
    step: '01',
    title: 'Download Kepler Starlight Files from NASA',
    friendlyBadge: 'Archive Data Collection',
    summary:
      'Fetch the official table of Kepler Objects of Interest (KOIs) from the NASA Exoplanet Archive and download the matching starlight brightness files from the MAST archive.',
    criticalPitfall:
      'Only train on objects with a clear verdict—Confirmed Planets (label 1) vs. Known False Positives (label 0)—and leave unconfirmed candidates out of the training labels.',
    codeSnippet: `# Query vetted Kepler targets (Confirmed = 1, False Positive = 0)
koi_df = pd.read_csv("nasa_kepler_koi_table.csv")
vetted = koi_df[koi_df["koi_disposition"].isin(["CONFIRMED", "FALSE POSITIVE"])].copy()
vetted["label"] = (vetted["koi_disposition"] == "CONFIRMED").astype(int)`,
  },
  {
    step: '02',
    title: 'Read Spacecraft Cleaned Brightness (Astropy)',
    friendlyBadge: 'Spacecraft Cleaned Brightness',
    summary:
      'Open each NASA FITS light-curve file with Astropy to extract the observation time and the Spacecraft Cleaned Brightness (PDCSAP_FLUX), skipping moments when the telescope was firing thrusters.',
    criticalPitfall:
      'Always use the Spacecraft Cleaned Brightness column rather than raw sensor counts so temperature shifts and telescope drift are already pre-filtered.',
    codeSnippet: `with fits.open(fits_path) as hdul:
    table = hdul[1].data
    # Keep only clean telescope measurements (quality == 0)
    clean = (table["SAP_QUALITY"] == 0) & np.isfinite(table["PDCSAP_FLUX"])
    time, flux = table["TIME"][clean], table["PDCSAP_FLUX"][clean]`,
  },
  {
    step: '03',
    title: 'Smooth Out Starlight Waves & Normalize to 1.0',
    friendlyBadge: 'Noise Filtering & Detrending',
    summary:
      'Run a wide rolling median filter across the timeline to flatten slow starspot waves without erasing short planetary dips, then divide by the median so normal brightness equals 1.0.',
    criticalPitfall:
      'Keep the smoothing window at least 3 times wider than the transit dip itself—if the window is too narrow, it will trace inside the dip and erase the planet signal.',
    codeSnippet: `# Smooth slow starspot waves with a wide 141-point rolling median
baseline_trend = median_filter(flux, size=141, mode="nearest")
normalized_flux = (flux / baseline_trend) / np.median(flux / baseline_trend)`,
  },
  {
    step: '04',
    title: 'Center & Resize Every Curve to 2,001 Points',
    friendlyBadge: '2,001-Point Windowing',
    summary:
      'Cut out a window centered on the transit dip (with plenty of normal baseline starlight on both sides) and smoothly resample it to exactly 2,001 evenly spaced points.',
    criticalPitfall:
      'Include surrounding baseline starlight on the left and right of the dip so the 1D CNN can compare the dip against the star’s natural noise floor.',
    codeSnippet: `x_old = np.linspace(0.0, 1.0, len(segment))
x_new = np.linspace(0.0, 1.0, 2001)
window_2001 = interp1d(x_old, segment, kind="linear")(x_new).reshape(2001, 1)`,
  },
  {
    step: '05',
    title: 'Smart Star Separation (Group by Star ID)',
    friendlyBadge: 'Smart Star Separation',
    summary:
      'Keep all light-curve segments from the same star together in either the Training, Validation, or Test group (70% / 15% / 15%) so the model is tested on stars it has truly never seen before.',
    criticalPitfall:
      'Never shuffle rows randomly! If one transit of a star is in Training and another transit of the same star is in Testing, the model memorizes the star’s noise and cheats on the test.',
    codeSnippet: `# Smart Star Separation: keep all segments from the same KIC star together
splitter = GroupShuffleSplit(n_splits=1, test_size=0.15, random_state=42)
train_idx, test_idx = next(splitter.split(X, y, groups=star_kic_ids))`,
  },
  {
    step: '06',
    title: 'Train the 1D CNN with Balanced Class Weights',
    friendlyBadge: 'Balanced Neural Training',
    summary:
      'Train the 1D CNN using Binary Cross-Entropy loss, the Adam optimizer, and balanced class weights so the network pays equal attention to rare planets and common false positives.',
    criticalPitfall:
      'Because false positives outnumber real planets in raw telescope catalogs, plain accuracy is misleading—use balanced weights and track ROC-AUC.',
    codeSnippet: `model.compile(optimizer=tf.keras.optimizers.Adam(1e-3), loss="binary_crossentropy", metrics=["AUC"])
model.fit(X_train, y_train, validation_data=(X_val, y_val), class_weight=class_weight_dict, epochs=40)`,
  },
  {
    step: '07',
    title: 'Check Precision, Recall & Export exoplanet_cnn.keras',
    friendlyBadge: 'Evaluation & Model Export',
    summary:
      'Test the trained network on held-out stars using Precision, Recall, F1 Score, ROC-AUC, and a Confusion Matrix, then export the finished file as exoplanet_cnn.keras.',
    criticalPitfall:
      'Always inspect the false alarms in the confusion matrix to see whether grazing eclipsing binaries or noisy stars are tricking the model.',
    codeSnippet: `print(f"ROC-AUC: {roc_auc_score(y_test, y_prob):.4f} | F1: {f1_score(y_test, y_pred):.4f}")
model.save("exoplanet_cnn.keras")`,
  },
];

export const COLAB_PYTHON_SCRIPT = `# ==============================================================================
# Exoplanet Finder — Kepler 1D CNN Transit Classifier (Google Colab Notebook)
# Trains Input(2001,1) -> Conv1D(32,5) -> MaxPool1D -> Conv1D(64,5) -> GAP -> Dense(32) -> Dense(1, sigmoid)
# Exports trained weights as: exoplanet_cnn.keras
# ==============================================================================

# !pip install -q astropy astroquery scikit-learn tensorflow pandas matplotlib

import os
import numpy as np
import pandas as pd
from astropy.io import fits
from scipy.ndimage import median_filter
from scipy.interpolate import interp1d
from sklearn.model_selection import GroupShuffleSplit
from sklearn.utils.class_weight import compute_class_weight
from sklearn.metrics import (
    precision_score, recall_score, f1_score, roc_auc_score, confusion_matrix, classification_report
)
import tensorflow as tf
from tensorflow.keras import layers, models, callbacks

WINDOW_LENGTH = 2001
RANDOM_SEED = 42
np.random.seed(RANDOM_SEED)
tf.random.set_seed(RANDOM_SEED)

# ------------------------------------------------------------------------------
# 1. Load NASA Kepler Light Curve from FITS & Preprocess to 2001 Points
# ------------------------------------------------------------------------------
def parse_and_preprocess_kepler_fits(fits_path: str, window_len: int = WINDOW_LENGTH) -> np.ndarray:
    """Reads TIME and Spacecraft Cleaned Brightness (PDCSAP_FLUX) and returns a (2001, 1) normalized window."""
    with fits.open(fits_path, memmap=False) as hdul:
        data = hdul[1].data
        time = np.asarray(data['TIME'], dtype=np.float64)
        flux = np.asarray(data['PDCSAP_FLUX'], dtype=np.float64)
        quality = np.asarray(data['SAP_QUALITY'], dtype=np.int32)

    # Filter out flagged quality cadences and NaNs
    mask = (quality == 0) & np.isfinite(time) & np.isfinite(flux)
    time, flux = time[mask], flux[mask]

    # Sort ascending by time
    order = np.argsort(time)
    time, flux = time[order], flux[order]

    # Noise Filtering: Remove slow starspot waves using a rolling median baseline (width=141 cadences)
    baseline = median_filter(flux, size=141, mode='nearest')
    baseline = np.where(baseline > 0, baseline, np.median(flux))
    norm_flux = flux / baseline
    norm_flux = norm_flux / np.median(norm_flux)

    # Resample onto a uniform 2001-point grid centered on the deepest transit candidate
    min_idx = int(np.argmin(norm_flux))
    half_span = min(len(norm_flux) // 2, 1000)
    start_idx = max(0, min_idx - half_span)
    end_idx = min(len(norm_flux), start_idx + 2 * half_span)
    segment = norm_flux[start_idx:end_idx]

    x_old = np.linspace(0.0, 1.0, len(segment))
    x_new = np.linspace(0.0, 1.0, window_len)
    interpolator = interp1d(x_old, segment, kind='linear', fill_value='extrapolate')
    window_2001 = interpolator(x_new).astype(np.float32)

    return window_2001.reshape(window_len, 1)

# ------------------------------------------------------------------------------
# 2. Build the 1D CNN Architecture
# ------------------------------------------------------------------------------
def build_exoplanet_1d_cnn(input_length: int = WINDOW_LENGTH) -> tf.keras.Model:
    model = models.Sequential([
        layers.Input(shape=(input_length, 1), name="kepler_flux_input"),
        layers.Conv1D(32, kernel_size=5, activation="relu", padding="same", name="conv1d_ingress_egress"),
        layers.MaxPooling1D(pool_size=2, name="maxpool_temporal"),
        layers.Conv1D(64, kernel_size=5, activation="relu", padding="same", name="conv1d_dip_morphology"),
        layers.GlobalAveragePooling1D(name="global_avg_pool"),
        layers.Dense(32, activation="relu", name="dense_vetting_head"),
        layers.Dense(1, activation="sigmoid", name="transit_probability")
    ], name="exoplanet_kepler_1d_cnn")

    model.compile(
        optimizer=tf.keras.optimizers.Adam(learning_rate=1e-3),
        loss="binary_crossentropy",
        metrics=[
            "accuracy",
            tf.keras.metrics.AUC(name="roc_auc", curve="ROC"),
            tf.keras.metrics.Precision(name="precision"),
            tf.keras.metrics.Recall(name="recall"),
        ],
    )
    return model

# ------------------------------------------------------------------------------
# 3. Smart Star Separation (Leakage-Free Split by Star KIC ID)
# ------------------------------------------------------------------------------
def train_and_evaluate_pipeline(X: np.ndarray, y: np.ndarray, kic_ids: np.ndarray):
    """
    Splits dataset strictly by KIC star ID (never random rows), trains with class weights,
    evaluates metrics, and exports exoplanet_cnn.keras.
    """
    gss_test = GroupShuffleSplit(n_splits=1, test_size=0.15, random_state=RANDOM_SEED)
    train_val_idx, test_idx = next(gss_test.split(X, y, groups=kic_ids))

    X_train_val, y_train_val, groups_tv = X[train_val_idx], y[train_val_idx], kic_ids[train_val_idx]
    X_test, y_test = X[test_idx], y[test_idx]

    gss_val = GroupShuffleSplit(n_splits=1, test_size=0.176, random_state=RANDOM_SEED)
    train_idx, val_idx = next(gss_val.split(X_train_val, y_train_val, groups=groups_tv))

    X_train, y_train = X_train_val[train_idx], y_train_val[train_idx]
    X_val, y_val = X_train_val[val_idx], y_train_val[val_idx]

    # Assert zero star overlap across splits
    assert len(set(groups_tv[train_idx]).intersection(set(kic_ids[test_idx]))) == 0, "Star leakage detected!"

    # Compute balanced class weights for imbalanced KOI tables
    classes = np.unique(y_train)
    weights = compute_class_weight(class_weight="balanced", classes=classes, y=y_train)
    class_weight_dict = {int(c): float(w) for c, w in zip(classes, weights)}
    print("Computed Class Weights:", class_weight_dict)

    model = build_exoplanet_1d_cnn()
    model.summary()

    early_stop = callbacks.EarlyStopping(
        monitor="val_roc_auc", mode="max", patience=8, restore_best_weights=True
    )

    history = model.fit(
        X_train, y_train,
        validation_data=(X_val, y_val),
        epochs=40,
        batch_size=32,
        class_weight=class_weight_dict,
        callbacks=[early_stop],
        verbose=1
    )

    # Evaluate on held-out KIC stars
    y_prob = model.predict(X_test).ravel()
    y_pred = (y_prob >= 0.5).astype(int)

    print("\\n--- Held-Out Test Set Evaluation (Star-Separated) ---")
    print(f"Precision : {precision_score(y_test, y_pred):.4f}")
    print(f"Recall    : {recall_score(y_test, y_pred):.4f}")
    print(f"F1 Score  : {f1_score(y_test, y_pred):.4f}")
    print(f"ROC-AUC   : {roc_auc_score(y_test, y_prob):.4f}")
    print("Confusion Matrix:\\n", confusion_matrix(y_test, y_pred))
    print(classification_report(y_test, y_pred, target_names=["False Positive (0)", "Confirmed Planet (1)"]))

    # Export trained Keras model for backend placement
    export_path = "exoplanet_cnn.keras"
    model.save(export_path)
    print(f"Successfully exported trained model to: {os.path.abspath(export_path)}")
    return model, history

if __name__ == "__main__":
    print("Running synthetic Kepler transit verification pass...")
    n_samples = 240
    kic_groups = np.repeat(np.arange(60), 4)
    labels = (kic_groups % 2 == 0).astype(np.int32)
    X_synth = np.ones((n_samples, WINDOW_LENGTH, 1), dtype=np.float32) + np.random.normal(0, 0.0003, (n_samples, WINDOW_LENGTH, 1)).astype(np.float32)
    for idx in range(n_samples):
        if labels[idx] == 1:
            X_synth[idx, 960:1040, 0] -= 0.0018
        else:
            X_synth[idx, 980:1020, 0] -= np.linspace(0, 0.025, 40)
    train_and_evaluate_pipeline(X_synth, labels, kic_groups)
`;
