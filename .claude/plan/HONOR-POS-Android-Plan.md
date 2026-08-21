# HONOR POS — Android Version Plan
**Stack:** React Native · TypeScript · Expo (Managed/Bare workflow)
**Source:** Ported from HONOR POS Desktop (Electron + React + Vite + Tailwind)
**Target:** Android 10+ (API 29+), phone & tablet

---

## 1. Executive Summary

The desktop POS is a full-featured retail system: product catalog, cart/checkout, multiple payment methods (PayMongo, Cash, GCash, PayMaya, Bank Transfer, Installment), shift management, offline queuing, 2FA (TOTP), discount/reprint authorization flows, serialized product tracking, floating stock, and receipt printing. The Android version will replicate all of this in a mobile-native form factor, optimized for tablet-first use at the counter.

---

## 2. Repository Strategy

Create a **new standalone repository** `HONOR-POS-Android` rather than a monorepo. Shared business logic (API call shapes, Zod schemas, type definitions) will be extracted into a `shared/` folder mirroring the desktop's `src/shared/`. This avoids coupling build systems and keeps deployments independent.

```
HONOR-POS-Android/
├── app/                   # Expo Router screens (file-based routing)
│   ├── (auth)/            # Login, TOTP verification
│   ├── (pos)/             # Main POS screen, modals
│   └── _layout.tsx        # Root layout + auth guard
├── src/
│   ├── shared/            # Mirrored from desktop: ipc types → api types, Zod schemas
│   ├── api/               # pos.ts, products.ts, config.ts (ported 1:1)
│   ├── services/          # authService.ts, totpService.ts (ported 1:1)
│   ├── hooks/             # useAppState.ts, useAuth.ts, useScanHandler.ts
│   ├── components/        # All ~44 modal/feature components (RN versions)
│   ├── store/             # (if needed) lightweight Zustand slice
│   ├── utils/             # currency.ts, imei.ts, stockBadge.ts (ported 1:1)
│   └── types.ts           # All core TypeScript interfaces (ported 1:1)
├── assets/                # Fonts, images, icons
├── app.json               # Expo config
├── babel.config.js
├── tsconfig.json
└── package.json
```

---

## 3. Technology Stack Mapping

| Desktop (Electron)             | Android (Expo / React Native)                         | Notes |
|-------------------------------|------------------------------------------------------|-------|
| React 19 + TypeScript         | React Native + TypeScript                            | Same language; JSX differs |
| Vite + Tailwind CSS           | **NativeWind v4** (Tailwind for RN)                  | Same class names, different primitives |
| React Router (MemoryRouter)   | **Expo Router v3** (file-based, native stack)        | URL-style navigation |
| electron.safeStorage          | **expo-secure-store**                                | Encrypted key-value on device |
| better-sqlite3 (Node)         | **expo-sqlite** (native SQLite)                      | Same SQL; async API |
| IPC / preload bridge          | Direct function calls (no process boundary)          | Eliminates entire IPC layer |
| otplib (TOTP)                 | otplib (same npm package)                            | Pure JS, works on RN |
| qrcode npm                    | **react-native-qrcode-svg**                          | SVG-based, no canvas |
| @tabler/icons-react           | **@tabler/icons-react-native**                       | Drop-in equivalent |
| lucide-react                  | **lucide-react-native**                              | Drop-in equivalent |
| Zod                           | Zod (same package)                                   | Unchanged |
| Thermal printer (OS dialog)   | **react-native-thermal-receipt-printer-enhanced**    | Bluetooth/USB/Wi-Fi ESC/POS |
| Barcode scanner (USB HID)     | **expo-barcode-scanner** / react-native-vision-camera | Camera-based scanning |
| PayMongo (child BrowserWindow) | **expo-web-browser** + deep-link callback           | Opens in-app browser |
| Kiosk mode (Windows only)     | Android kiosk: guided access / task lock             | Optional Phase 3 feature |
| Tailwind + index.css          | NativeWind + global StyleSheet                       | |
| window.electron.* IPC         | Removed; services called directly                    | |
| CPU/RAM polling (resourceManager) | Removed (not relevant on mobile)                | |

---

## 4. Architecture

### 4.1 Process Model

The desktop splits into an Electron main process and a renderer. On Android there is a single JS thread — no IPC layer needed. Services and hooks call native modules directly.

```
Android App (single process)
├── Expo Router screens
├── Hooks (useAppState, useAuth)
├── Services (authService, totpService)
├── API layer (pos.ts, products.ts)
├── expo-sqlite (offline store — replaces offlineStore.ts)
└── expo-secure-store (auth token — replaces electron.safeStorage)
```

### 4.2 State Management

Keep the same pattern as desktop: **one central `useAppState` hook** returning all cart, product, checkout, payment, shift, and UI-flag state. Props drilling from the root POS screen to all modals. This avoids introducing Zustand/Redux and keeps the port as direct as possible. If the hook becomes unwieldy on mobile (performance concerns with many re-renders), selectively split into focused hooks per domain (cart, shift, UI) using `useReducer`.

### 4.3 Navigation

Expo Router replaces MemoryRouter + state-flag conditionals:

- `app/(auth)/login.tsx` — Login form
- `app/(auth)/totp.tsx` — TOTP / OTP verification
- `app/(pos)/index.tsx` — Main POS screen (product grid + cart)
- `app/(pos)/checkout.tsx` — Checkout flow (pushed as modal sheet)
- `app/(pos)/shift.tsx` — Shift open/close
- `app/(pos)/settings.tsx` — Settings

Heavy modals (CheckoutModal, SalesHistoryModal, DiscountManagerModal) become **bottom sheets** using `@gorhom/bottom-sheet` or Expo's built-in modal, replacing the current overlay-modal pattern.

### 4.4 Offline Mode

Port `offlineStore.ts` logic directly to `expo-sqlite`:
- Same tables: `pending_sales`, `pending_voids`, `pending_floating_stock_events`, `catalog_meta`, `catalog_products`, `cached_promoters`
- Replace `better-sqlite3` synchronous API with `expo-sqlite` async API (use `await db.runAsync()`, `await db.getAllAsync()`)
- Same JSON mirror fallback can be `AsyncStorage` as a belt-and-suspenders backup
- Sync logic (`syncOfflinePendingSales`, `syncOfflinePendingFloatingStockEvents`) moved to a background task using **expo-background-fetch** + **expo-task-manager**

### 4.5 Auth & Security

| Feature | Desktop | Android |
|---------|---------|---------|
| Token storage | `electron.safeStorage` (OS keychain) | `expo-secure-store` (Android Keystore) |
| TOTP | `otplib` | `otplib` (unchanged) |
| Offline auth hash | `scrypt` via Node crypto | `expo-crypto` (SHA-256) or `react-native-quick-crypto` |
| Session lock (idle 5 min) | `setInterval` + keyboard/mouse events | `AppState` listener + `setTimeout` |
| Force logout (locked 3 hr) | `setTimeout` | `setTimeout` (same pattern) |

### 4.6 Receipt Printing

The desktop uses OS-level print dialogs. Android will target **Bluetooth thermal printers** (most common in Philippine retail POS setups):

- Library: `react-native-thermal-receipt-printer-enhanced`
- Port `Receipt.tsx` and `TransactionSummaryReceipt.tsx` to ESC/POS command builder
- Printer config stored in `expo-secure-store` (IP/MAC/port)
- `PrinterConfigModal` becomes a Bluetooth device picker + IP/port form

### 4.7 Payment Processing

- **PayMongo**: `expo-web-browser.openAuthSessionAsync()` opens the checkout URL in a Chrome Custom Tab; the app listens for the success/cancel deep link callback (configure `scheme` in `app.json`)
- **Cash / GCash manual / PayMaya / Bank Transfer / Installment**: No change — all handled client-side

### 4.8 Barcode / Serial Scanning

- Desktop: USB HID barcode gun fires keyboard events → `useScanHandler.ts` intercepts
- Android: Camera scanning via `expo-barcode-scanner` (simpler) or `react-native-vision-camera` (faster, production-grade)
- Keep `useScanHandler` interface identical; swap the event source from keyboard to camera scan callback

---

## 5. UI / UX Adaptation

### 5.1 Form Factor

Target **10-inch Android tablet in landscape** as the primary form factor (mirrors desktop layout). Phone portrait is a secondary target for managers on the go.

### 5.2 Component Port Strategy

All 44 desktop components map to React Native equivalents:

| Desktop Pattern | Mobile Pattern |
|----------------|---------------|
| `<div>` layout | `<View>` layout |
| `<input>` / `<select>` | `<TextInput>` / custom picker |
| CSS Tailwind classes | NativeWind classes (same names) |
| Overlay modals | `<Modal>` or `@gorhom/bottom-sheet` |
| `<table>` (sales history) | `<FlatList>` with column layout |
| `onClick` | `onPress` |
| Hover states | Active/pressed states |
| `window.print()` | ESC/POS thermal print |

### 5.3 Keyboard Shortcuts

Remove all keyboard shortcut bindings (F1–F12, Ctrl+X, etc.) — they don't apply on Android. Replace with on-screen quick-action buttons in the header/footer toolbar.

---

## 6. Shared Code (Reuse Without Change)

The following files can be copied verbatim or with minimal changes:

| File | Reuse |
|------|-------|
| `src/ui/api/pos.ts` | Direct copy — pure fetch calls |
| `src/ui/api/products.ts` | Direct copy |
| `src/ui/api/config.ts` | Direct copy (swap `window.electron.*` calls) |
| `src/ui/services/authService.ts` | Direct copy (swap secure storage) |
| `src/ui/services/totpService.ts` | Direct copy (otplib works on RN) |
| `src/ui/utils/currency.ts` | Direct copy |
| `src/ui/utils/imei.ts` | Direct copy |
| `src/ui/utils/stockBadge.ts` | Direct copy |
| `src/ui/types.ts` | Direct copy |
| `src/shared/ipc.ts` (Zod schemas) | Extract schemas only; drop IPC channel names |

---

## 7. Phased Implementation Plan

### Phase 1 — Foundation & Auth (Weeks 1–2)

**Goal:** App boots, user can log in with TOTP, session persists securely.

- [ ] Initialize Expo project (`expo init HONOR-POS-Android --template expo-template-blank-typescript`)
- [ ] Configure Expo Router, NativeWind v4, TypeScript strict mode
- [ ] Set up ESLint + Prettier (match desktop config)
- [ ] Port `types.ts`, `utils/`, Zod schemas
- [ ] Port `authService.ts` (swap `electron.safeStorage` → `expo-secure-store`)
- [ ] Port `totpService.ts` (otplib — no changes needed)
- [ ] Build Login screen (`app/(auth)/login.tsx`) — port `login-form.tsx`
- [ ] Build TOTP screen (`app/(auth)/totp.tsx`) — port `TOTPVerification.tsx`
- [ ] Build `useAuth` hook with session lock (`AppState` + `setTimeout`)
- [ ] Auth guard in `app/_layout.tsx`
- [ ] `.env` setup (`EXPO_PUBLIC_API_BASE_URL`, etc.)

**Deliverable:** Working login → TOTP → session lock flow on Android emulator.

---

### Phase 2 — Offline Store & Product Catalog (Weeks 3–4)

**Goal:** Product catalog loads online and offline; shift management works.

- [ ] Install `expo-sqlite`; create `src/services/offlineStore.ts` (port `src/electron/offlineStore.ts`)
  - Tables: `pending_sales`, `pending_voids`, `catalog_meta`, `catalog_products`, `cached_promoters`, `pending_floating_stock_events`
  - Convert `better-sqlite3` sync API → `expo-sqlite` async API
- [ ] Port `products.ts` API layer
- [ ] Port `useAppState.ts` hook (product/catalog/shift state only, first pass)
- [ ] Build main POS screen (`app/(pos)/index.tsx`): product grid + search + filter
  - Port `ProductCard.tsx`, `ProductFilter.tsx`, `ProductListRow.tsx`, `Pagination.tsx`
- [ ] Build `ShiftModal` (`app/(pos)/shift.tsx`) — port `ShiftModal.tsx`
- [ ] Catalog snapshot on shift open (writes to `catalog_products` table)
- [ ] Background sync task (`expo-background-fetch`) for `syncOfflinePendingSales`

**Deliverable:** Product grid visible, shift open/close, catalog survives offline.

---

### Phase 3 — Cart & Checkout Core (Weeks 5–7)

**Goal:** Full add-to-cart → checkout → payment → receipt flow.

- [ ] Cart state in `useAppState` (cart items, quantities, discounts)
- [ ] Build Cart panel — port `Cart.tsx`
- [ ] Build Checkout modal — port `CheckoutModal.tsx` (largest component, 62 KB)
  - Cash denomination picker — port `CashDenominationModal.tsx`
  - PayMongo flow — `expo-web-browser.openAuthSessionAsync()` + deep link
  - GCash, PayMaya, Bank Transfer, Installment — port client-side handlers
- [ ] Build Customer Select modal — port `CustomerSelectModal.tsx`
- [ ] Build Receipt component — port `Receipt.tsx` + `TransactionSummaryReceipt.tsx`
  - Integrate `react-native-thermal-receipt-printer-enhanced` for Bluetooth printing
  - Fallback: PDF via `expo-print` + `expo-sharing`
- [ ] Barcode/serial scan — `expo-barcode-scanner` integration for `useScanHandler`
- [ ] Build `SerialScanModal` / `CartSerialScanModal` — port from desktop
- [ ] Offline sale queuing to `pending_sales` table

**Deliverable:** End-to-end sale: scan product → cart → checkout → print receipt.

---

### Phase 4 — Discount, Reprint & Authorization Flows (Week 8)

**Goal:** All approval-gated flows work on mobile.

- [ ] Build `DiscountManagerModal` — port from desktop (in-person + remote request)
- [ ] Port `useDiscountApprovalPolling.ts` hook (polling logic unchanged)
- [ ] Build `DiscountModal` (quick discount entry)
- [ ] Build `ReprintGateControl` — port reprint gate logic
- [ ] Port `useReprintApprovalPolling.ts`
- [ ] Build `SalesHistoryModal` — port from desktop (`FlatList` for table rows)
- [ ] Build `RefundModal` — port from desktop
- [ ] Build `VoidConfirmModal` — port from desktop
- [ ] Build `RetrieveModal` — port from desktop (held transactions)
- [ ] Build `ZReport` component

**Deliverable:** Discounts, refunds, voids, reprints all working with remote authorization.

---

### Phase 5 — Settings, Floating Stock & Polish (Weeks 9–10)

**Goal:** All remaining features complete; app is production-ready.

- [ ] Build `SettingsModal` — port from desktop (API URL, printer config, terminal config)
  - `PrinterConfigModal` → Bluetooth device picker + IP/port form
  - `TerminalConfigModal` — port from desktop
- [ ] Build `CashMovementModal` — port from desktop
- [ ] Build `FloatingStockModal` — port from desktop
  - `PromoterComboBox` → RN searchable dropdown
- [ ] Build `SalesSummaryModal` — port from desktop
- [ ] Build `WarrantyLookupModal` — port from desktop
- [ ] Build `UserMenu` — port from desktop (user info, shift, logout)
- [ ] Build `HelpModal` — port from desktop
- [ ] Build `SessionLockModal` (PIN screen) — port from desktop
- [ ] Build `PowerActionModal` — port from desktop
- [ ] Floating stock sync (`syncOfflinePendingFloatingStockEvents`)
- [ ] Offline promoter validation (`cached_promoters` table)
- [ ] HONOR brand fonts (`HONORSansBrand-*`) loaded via `expo-font`
- [ ] Splash screen + app icon (`expo-splash-screen`)
- [ ] Google Authenticator setup screen — port `GoogleAuthenticatorSetup.tsx` (`react-native-qrcode-svg`)
- [ ] Email OTP screen — port `EmailOtpVerification.tsx`

**Deliverable:** Feature-complete Android app.

---

### Phase 6 — Testing, QA & Build (Weeks 11–12)

**Goal:** Stable, signed APK ready for deployment.

- [ ] Unit tests: port existing Vitest tests to **Jest** + **@testing-library/react-native**
  - `offlineStore.test.ts`, `pos.test.ts`, `authService.test.ts`, `stockBadge.test.ts`
- [ ] E2E tests: **Maestro** (recommended for Expo) — login, sale, offline, sync flows
- [ ] Test on physical devices: Samsung Galaxy Tab A (10.4"), Galaxy Tab S7
- [ ] Test Bluetooth thermal printer pairing and printing
- [ ] Test PayMongo deep link flow (GCash, Maya, etc.)
- [ ] EAS Build setup (`eas.json`) — internal distribution profile for APK
- [ ] `eas build --platform android --profile preview` → distribute via EAS Update or direct APK
- [ ] Code signing (Android keystore managed by EAS)
- [ ] Performance pass: memo, FlatList `getItemLayout`, image caching

**Deliverable:** Signed APK distributed to testers via EAS.

---

## 8. Key Dependencies (package.json preview)

```json
{
  "dependencies": {
    "expo": "~52.x",
    "expo-router": "~4.x",
    "expo-sqlite": "~14.x",
    "expo-secure-store": "~13.x",
    "expo-web-browser": "~13.x",
    "expo-barcode-scanner": "~13.x",
    "expo-font": "~12.x",
    "expo-splash-screen": "~0.27.x",
    "expo-print": "~12.x",
    "expo-sharing": "~11.x",
    "expo-background-fetch": "~12.x",
    "expo-task-manager": "~11.x",
    "expo-crypto": "~13.x",
    "nativewind": "^4.x",
    "react-native": "0.76.x",
    "react": "18.x",
    "typescript": "~5.3",
    "@expo/vector-icons": "^14.x",
    "@gorhom/bottom-sheet": "^4.x",
    "@tabler/icons-react-native": "^3.x",
    "lucide-react-native": "^0.x",
    "react-native-qrcode-svg": "^6.x",
    "react-native-svg": "^14.x",
    "react-native-thermal-receipt-printer-enhanced": "^1.x",
    "otplib": "^13.x",
    "zod": "^3.x",
    "@react-navigation/native": "^6.x",
    "react-native-safe-area-context": "^4.x",
    "react-native-screens": "^3.x",
    "react-native-gesture-handler": "^2.x",
    "react-native-reanimated": "^3.x"
  }
}
```

> **Note:** `expo-barcode-scanner` is deprecated in newer Expo SDK — use `react-native-vision-camera` + `vision-camera-code-scanner` for production-grade scanning speed on the POS counter.

---

## 9. Environment Variables

Expo uses the `EXPO_PUBLIC_` prefix for variables accessible in the JS bundle:

```env
EXPO_PUBLIC_API_BASE_URL=https://api.honorph.com
EXPO_PUBLIC_API_RECOVERY_PIN=123456
EXPO_PUBLIC_ALLOW_INSECURE_POS_API_HTTP=0
```

Sensitive values (signing keys, secrets) stay in EAS Secrets, not `.env`.

---

## 10. Risk Register

| Risk | Impact | Mitigation |
|------|--------|------------|
| `better-sqlite3` → `expo-sqlite` async API mismatch | High | Port offlineStore.ts carefully; wrap all DB calls in async functions from the start |
| Bluetooth printer compatibility (many brands) | High | Test early with target hardware; keep ESC/POS commands generic |
| `useAppState` performance (100+ state vars) | Medium | Use `React.memo` on all child components; split hook if needed |
| PayMongo deep link callback on Android | Medium | Test `expo-web-browser` with custom scheme; fallback to polling |
| NativeWind v4 class coverage gaps | Low | Keep a global StyleSheet fallback for edge cases |
| TOTP time drift on device | Low | `otplib` window ±1 step handles this by default |
| Vision Camera permissions UX | Low | Follow Expo permissions best-practice pattern |

---

## 11. Recommended Project Initialization Commands

```bash
# 1. Create the Expo project
npx create-expo-app HONOR-POS-Android --template expo-template-blank-typescript

# 2. Install Expo Router
npx expo install expo-router react-native-safe-area-context react-native-screens \
  expo-constants expo-linking expo-status-bar

# 3. Install core dependencies
npx expo install expo-sqlite expo-secure-store expo-web-browser expo-barcode-scanner \
  expo-font expo-splash-screen expo-print expo-sharing \
  expo-background-fetch expo-task-manager expo-crypto

# 4. Install NativeWind
npm install nativewind tailwindcss
npx tailwindcss init

# 5. Install UI / icons
npm install @gorhom/bottom-sheet react-native-gesture-handler react-native-reanimated \
  react-native-svg react-native-qrcode-svg \
  @tabler/icons-react-native lucide-react-native

# 6. Install business logic (same as desktop)
npm install otplib zod

# 7. Install thermal printer
npm install react-native-thermal-receipt-printer-enhanced

# 8. Set up EAS
npm install -g eas-cli
eas init
```

---

## 12. Definition of Done (per phase)

A phase is complete when:
1. All checklist items are merged to `main`
2. No TypeScript errors (`tsc --noEmit`)
3. All ported unit tests pass (`jest`)
4. Feature is manually verified on a physical Android device
5. No regressions in previously completed phases
