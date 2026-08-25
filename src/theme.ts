/**
 * Modernist tokens as plain values, for the props that can't take a className:
 * ActivityIndicator `color`, TextInput `placeholderTextColor`, Modal backdrops,
 * vector-icon `color`.
 */
export const BG = '#f3f2f2';
export const SURFACE = '#eae9e9';
export const INK = '#201e1d';
export const ACCENT = '#1f5aa6';
export const DANGER = '#ec3013';
export const DIVIDER = 'rgba(32,30,29,0.4)';
export const SCRIM = 'rgba(45,43,43,0.55)';

export const NEUTRAL = {
  100: '#f8f4f4',
  200: '#eae7e7',
  300: '#d7d3d3',
  400: '#bab6b6',
  500: '#9b9797',
  600: '#7d7979',
  700: '#605d5d',
  800: '#444141',
  900: '#2d2b2b',
} as const;

export const ACCENT_RAMP = {
  100: '#eaf1fb',
  200: '#cfe1f5',
  300: '#a7c8ec',
  400: '#5c97d9',
  500: '#2f74c4',
  600: '#1b4c8c',
  700: '#123863',
  800: '#0c2745',
  900: '#081a2e',
} as const;

export const DANGER_RAMP = {
  100: '#fff2ef',
  200: '#ffe0d9',
  300: '#ffc4b8',
  400: '#ff9783',
  500: '#ff563c',
  600: '#dd2b0f',
  700: '#ae1800',
  800: '#7c1405',
  900: '#4d170e',
} as const;

/** Placeholder text sits at neutral-500 across every field. */
export const PLACEHOLDER = NEUTRAL[500];
