/**
 * HONOR brand typeface (HONORSansBrand — extracted from the desktop repo's
 * src/ui/assets/fonts/). Only 4 of the family's 9 weights are bundled —
 * Regular/Medium/DemiBold/Bold — matching every font-medium/font-semibold/
 * font-bold Tailwind class actually used across the ported UI; the font
 * covers CJK/Arabic/multi-script glyphs so even 4 weights run ~8MB each.
 *
 * These are loaded and available by family name via useFonts() below, but
 * NOT yet wired as the app's default typeface: React 19 removed support for
 * patching Text.defaultProps (the usual RN trick for a global default font),
 * and NativeWind's font-bold/font-semibold/font-medium classes set
 * `fontWeight`, not `fontFamily`, so they won't pick these files up on their
 * own. Actually applying the brand look needs either a custom Tailwind
 * fontFamily utility set plus a find/replace across every font-* className
 * in the ported components, or a shared <Text> wrapper adopted everywhere —
 * both substantial, deliberately left as a follow-up rather than half-done.
 */
export const HONOR_BRAND_FONTS = {
  'HONORSansBrand-Regular': require('../assets/fonts/HONORSansBrand-Regular.ttf'),
  'HONORSansBrand-Medium': require('../assets/fonts/HONORSansBrand-Medium.ttf'),
  'HONORSansBrand-DemiBold': require('../assets/fonts/HONORSansBrand-DemiBold.ttf'),
  'HONORSansBrand-Bold': require('../assets/fonts/HONORSansBrand-Bold.ttf'),
};
