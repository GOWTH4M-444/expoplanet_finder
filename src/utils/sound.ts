// Web Audio API Synthesizer for gentle celestial twinkling chimes

let sharedAudioCtx: AudioContext | null = null;
let soundEnabled = true;

export function isSoundEnabled(): boolean {
  return soundEnabled;
}

export function setSoundEnabled(enabled: boolean): void {
  soundEnabled = enabled;
}

/**
 * Plays a gentle, crystalline celestial chime using the Web Audio API.
 * Safe in headless browsers and restricted environments.
 */
export function playTwinkleSound(variant: 'chime' | 'tab' | 'toggle' = 'chime'): void {
  if (!soundEnabled || typeof window === 'undefined') return;

  try {
    const AudioContextClass =
      window.AudioContext ||
      (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!AudioContextClass) return;

    if (!sharedAudioCtx) {
      sharedAudioCtx = new AudioContextClass();
    }
    if (sharedAudioCtx.state === 'suspended') {
      sharedAudioCtx.resume().catch(() => {});
    }

    const now = sharedAudioCtx.currentTime;

    // Select harmonic frequencies (in Hz) for a warm, crystalline space chime
    const notes =
      variant === 'tab'
        ? [587.33, 880.0, 1174.66] // D5 -> A5 -> D6
        : variant === 'toggle'
        ? [659.25, 987.77] // E5 -> B5
        : [523.25, 783.99, 1046.5, 1318.51]; // C5 -> G5 -> C6 -> E6

    notes.forEach((freq, idx) => {
      if (!sharedAudioCtx) return;
      const osc = sharedAudioCtx.createOscillator();
      const gain = sharedAudioCtx.createGain();

      osc.type = idx % 2 === 0 ? 'sine' : 'triangle';
      const startTime = now + idx * 0.045;
      const duration = 0.28;

      osc.frequency.setValueAtTime(freq, startTime);
      // Slight upward shimmer
      osc.frequency.exponentialRampToValueAtTime(freq * 1.008, startTime + duration);

      gain.gain.setValueAtTime(0.0001, startTime);
      gain.gain.linearRampToValueAtTime(0.035 / (idx + 1), startTime + 0.015);
      gain.gain.exponentialRampToValueAtTime(0.0001, startTime + duration);

      osc.connect(gain);
      gain.connect(sharedAudioCtx.destination);

      osc.start(startTime);
      osc.stop(startTime + duration + 0.02);
    });
  } catch {
    // Ignore audio context restrictions silently
  }
}
