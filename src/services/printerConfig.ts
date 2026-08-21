/**
 * Receipt printer preferences — adapted from the desktop's PrinterConfigModal.tsx.
 * The desktop lists OS-registered printers via Electron's `listPrinters` IPC and
 * silently prints HTML to one. Neither exists on Android: there's no OS printer
 * registry, and no Bluetooth/USB thermal-printer library has been chosen yet
 * (see printing.ts / escpos.ts — PDF share is the only wired print path so far).
 * This just persists the preferences a real transport will need once one lands:
 * a free-text device identifier, paper width for the ESC/POS layout, and
 * auto-print-after-checkout.
 */
import * as SecureStore from 'expo-secure-store';

const PRINTER_NAME_KEY = 'pos_printer_name';
const AUTO_PRINT_KEY = 'pos_auto_print_receipt';
const PAPER_WIDTH_KEY = 'pos_printer_paper_width_mm';

export const PAPER_WIDTH_OPTIONS = [
  { value: '80', label: '80mm (standard thermal)' },
  { value: '76', label: '76mm (3" standard)' },
  { value: '58', label: '58mm (compact thermal)' },
] as const;

export interface PrinterPreferences {
  printerName: string;
  autoPrint: boolean;
  paperWidthMm: string;
}

const DEFAULTS: PrinterPreferences = { printerName: '', autoPrint: false, paperWidthMm: '80' };

let cached: PrinterPreferences | null = null;

export async function getPrinterPreferences(): Promise<PrinterPreferences> {
  if (cached) return cached;
  const [printerName, autoPrint, paperWidthMm] = await Promise.all([
    SecureStore.getItemAsync(PRINTER_NAME_KEY),
    SecureStore.getItemAsync(AUTO_PRINT_KEY),
    SecureStore.getItemAsync(PAPER_WIDTH_KEY),
  ]);
  cached = {
    printerName: printerName ?? DEFAULTS.printerName,
    autoPrint: autoPrint === '1',
    paperWidthMm: paperWidthMm ?? DEFAULTS.paperWidthMm,
  };
  return cached;
}

export async function savePrinterPreferences(prefs: PrinterPreferences): Promise<void> {
  cached = prefs;
  await Promise.all([
    SecureStore.setItemAsync(PRINTER_NAME_KEY, prefs.printerName),
    SecureStore.setItemAsync(AUTO_PRINT_KEY, prefs.autoPrint ? '1' : '0'),
    SecureStore.setItemAsync(PAPER_WIDTH_KEY, prefs.paperWidthMm),
  ]);
}
