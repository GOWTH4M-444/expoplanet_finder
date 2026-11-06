export type ShortcutAction =
  | 'TOGGLE_PLAY'
  | 'CYCLE_SAMPLE'
  | 'OPEN_UPLOAD'
  | 'TOGGLE_MARKERS'
  | 'TAB_CLASSIFIER'
  | 'TAB_ARCHITECTURE'
  | 'TAB_TRAINING'
  | 'TOGGLE_HELP';

export interface ShortcutSpec {
  keyLabel: string;
  action: ShortcutAction;
  description: string;
}

export const KEYBOARD_SHORTCUT_SPECS: ShortcutSpec[] = [
  { keyLabel: 'Space', action: 'TOGGLE_PLAY', description: 'Play / Pause light-curve transit scan' },
  { keyLabel: 'S', action: 'CYCLE_SAMPLE', description: 'Cycle through the 6 Kepler demo curves' },
  { keyLabel: 'U', action: 'OPEN_UPLOAD', description: 'Open CSV upload & paste drawer' },
  { keyLabel: 'M', action: 'TOGGLE_MARKERS', description: 'Toggle transit window markers on chart' },
  { keyLabel: '1 / 2 / 3', action: 'TAB_CLASSIFIER', description: 'Switch tabs (Classifier / CNN / Colab)' },
];

/**
 * Pure, unit-testable keyboard shortcut resolver.
 * Ignores keystrokes when focus is inside an input, textarea, or select element,
 * or when system modifier keys (Ctrl, Meta, Alt) are pressed.
 */
export function resolveKeyboardShortcut(
  key: string,
  isEditingText: boolean,
  modifiers: { ctrlKey?: boolean; metaKey?: boolean; altKey?: boolean } = {}
): ShortcutAction | null {
  if (isEditingText) return null;
  if (modifiers.ctrlKey || modifiers.metaKey || modifiers.altKey) return null;

  if (key === ' ' || key === 'Spacebar') {
    return 'TOGGLE_PLAY';
  }

  const normalized = key.trim().toLowerCase();
  switch (normalized) {
    case 's':
      return 'CYCLE_SAMPLE';
    case 'u':
      return 'OPEN_UPLOAD';
    case 'm':
      return 'TOGGLE_MARKERS';
    case '1':
      return 'TAB_CLASSIFIER';
    case '2':
      return 'TAB_ARCHITECTURE';
    case '3':
      return 'TAB_TRAINING';
    case '?':
    case '/':
      return 'TOGGLE_HELP';
    default:
      return null;
  }
}

/**
 * Pure helper to cycle deterministically through an ordered list of sample IDs.
 */
export function getNextSampleId(currentId: string, sampleIds: string[]): string {
  if (sampleIds.length === 0) return '';
  const idx = sampleIds.indexOf(currentId);
  if (idx === -1) return sampleIds[0];
  return sampleIds[(idx + 1) % sampleIds.length];
}
