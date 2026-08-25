# Modernist in HONOR POS — implementation

Drop-in replacements for `HONOR-POS-Andriod/`. Paths below mirror the repo, so
each file goes exactly where its path says. Logic, props and behaviour are
unchanged — every edit is visual.

## 1. Install the typeface

Modernist is set in Archivo. The repo's `transformIgnorePatterns` already
whitelists `@expo-google-fonts/*`, so:

```
npx expo install @expo-google-fonts/archivo
```

`src/fonts.ts` (replaced) exports `APP_FONTS` — the four Archivo weights plus
the existing HONOR brand faces, so nothing that already referenced
`HONOR_BRAND_FONTS` breaks.

Then in `app/_layout.tsx`, swap the import and the `useFonts` call:

```diff
-import { HONOR_BRAND_FONTS } from '../src/fonts';
+import { APP_FONTS } from '../src/fonts';
...
-  const [fontsLoaded, fontError] = useFonts(HONOR_BRAND_FONTS);
+  const [fontsLoaded, fontError] = useFonts(APP_FONTS);
```

and change the two loading spinners' colours from `#111827` to `INK`
(`import { INK } from '../src/theme'`).

## 2. Tokens

- `tailwind.config.js` — replaced. Adds the `mod-*` colour ramps from the
  design system, sets **every** border radius to 0, and registers the Archivo
  families as `font-a`, `font-a-med`, `font-a-semi`, `font-a-bold`,
  `font-a-display`. (They are `fontFamily` utilities, not `fontWeight` — on
  React Native weight classes don't pick up a custom family, so use these.)
- `src/theme.ts` — new. The same tokens as plain constants for the places
  className can't reach: `ActivityIndicator color`, `Modal` backdrops,
  `placeholderTextColor`.

Keep `honor-blue` in the config only if something still references it; nothing
in the files below does.

## 3. Replaced files

| File | What changed |
| --- | --- |
| `src/components/Button.tsx` | Zero radius, 2px borders, accent primary, **flush-left uppercase labels** (Modernist rule), 52px touch height |
| `src/utils/stockBadge.ts` | Square tags on the neutral/accent ramps; label reads `ON HAND 15` |
| `src/components/ProductFilter.tsx` | Scan field promoted to the top at 52px with a 2px ink border, category chips become flush-left underlined tabs, sort/view controls squared off |
| `src/components/ProductTile.tsx` | Grid tile is a ruled cell (no card, no image block) — name, SKU, price at display size, on-hand tag, `IMEI REQUIRED` marker; row variant keeps the thumbnail |
| `src/components/Cart.tsx` | Denser ruled line items, IMEI lines, VATable/VAT/subtotal breakdown, 2px rule above a display-size total, accent CHECKOUT |
| `src/components/SerialScanModal.tsx` | IMEI capture on the Modernist dialog: 2px field borders, per-unit VALID/DUPLICATE state labels, square checkbox |
| `src/components/LoginForm.tsx` | Uppercase field labels, 2px fields, accent-tinted lockout and error blocks |
| `src/components/TOTPVerification.tsx` | Six 2px code cells, accent-tinted refresh strip, flush-left copy |
| `app/(auth)/login.tsx` | Red poster panel (store / terminal / connection / printer) beside the form on tablet, stacked on phone |
| `src/components/PosHeader.tsx` | **New.** The sell screen's header bar: brand mark, store + register + shift, offline queue, printer state, cashier + menu |

## 4. Two edits inside `app/(pos)/index.tsx`

That file is 644 lines of orchestration, so it isn't replaced. Three changes:

1. Every `bg-gray-50` → `bg-mod-bg`; `ActivityIndicator color="#111827"` → `color={INK}`.
2. Replace the `mb-3 flex-row items-center justify-between` welcome block with
   the new header:

```tsx
import { PosHeader } from '../../src/components/PosHeader';

<PosHeader
  userName={currentUser?.name ?? ''}
  offline={loggedInOffline}
  register={catalog.currentShift.register}
  isWide={isWide}
  cartCount={cart.items.length}
  onCart={() => setShowMobileCart(true)}
  onHistory={() => { setShowSalesHistory(true); void salesHistory.reload(); }}
  onShift={() => setShowShiftModal(true)}
  onMenu={() => setShowUserMenu(true)}
/>
```

  The outer `View` also loses its padding, since the header now runs
  edge-to-edge: `className="flex-1 flex-row"` and put `px-4 pt-4` on the
  catalog column instead.

3. Widen the cart pane and square its divider:

```diff
-      {isWide && <View className="ml-4 w-80">{cartPanel}</View>}
+      {isWide && <View className="w-[440px] border-l-2 border-mod-divider">{cartPanel}</View>}
```

  and bump the grid to fit the wider pane:

```diff
-  const numColumns = viewMode === 'grid' ? Math.max(2, Math.floor((isWide ? width * 0.65 : width) / 220)) : 1;
+  const numColumns = viewMode === 'grid' ? Math.max(2, Math.floor((isWide ? width - 440 : width) / 260)) : 1;
```

## 5. Not touched

Checkout, refund, void, shift, receipt, settings and the remaining modals still
carry the old gray-on-white styling. They're mechanical to convert once these
primitives land — the same four moves each time: radius to 0, borders to 2px,
`gray-*` to `mod-neutral-*`, black primaries to `bg-mod-accent`.
