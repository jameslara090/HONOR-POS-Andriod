/**
 * Archivo carries the Modernist type scale (heading and body are the same
 * family at different weights). Install with:
 *
 *   npx expo install @expo-google-fonts/archivo
 *
 * The four weights below back the Tailwind families font-a / font-a-med /
 * font-a-semi / font-a-bold / font-a-display. On React Native a fontWeight
 * class cannot resolve a bundled family, so components use those fontFamily
 * utilities rather than font-bold and friends.
 *
 * HONORSansBrand stays bundled — it is the corporate typeface and is still
 * available by family name for anything that needs it (receipt headers,
 * marketing surfaces).
 */
import {
  Archivo_400Regular,
  Archivo_500Medium,
  Archivo_600SemiBold,
  Archivo_700Bold,
  Archivo_800ExtraBold,
} from '@expo-google-fonts/archivo';

export const HONOR_BRAND_FONTS = {
  'HONORSansBrand-Regular': require('../assets/fonts/HONORSansBrand-Regular.ttf'),
  'HONORSansBrand-Medium': require('../assets/fonts/HONORSansBrand-Medium.ttf'),
  'HONORSansBrand-DemiBold': require('../assets/fonts/HONORSansBrand-DemiBold.ttf'),
  'HONORSansBrand-Bold': require('../assets/fonts/HONORSansBrand-Bold.ttf'),
};

export const MODERNIST_FONTS = {
  Archivo_400Regular,
  Archivo_500Medium,
  Archivo_600SemiBold,
  Archivo_700Bold,
  Archivo_800ExtraBold,
};

/** Pass this to useFonts() in app/_layout.tsx. */
export const APP_FONTS = { ...MODERNIST_FONTS, ...HONOR_BRAND_FONTS };
