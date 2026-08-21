/**
 * Settings — adapted from the desktop's SettingsModal.tsx, scoped to what
 * this plan phase asks for: API base URL, printer config, terminal config.
 * Dropped entirely (Windows/Electron-only, no Android equivalent): Lock Mode
 * / kiosk (Alt+Tab blocking), Launch at startup, maintenance/dev-server mode,
 * Desktop/Tablet interface toggle. Dark mode is also dropped — no theming
 * system exists yet in this port to toggle. Added beyond the desktop: a
 * Security section wiring the previously-dormant GoogleAuthenticatorSetup /
 * EmailOtpVerification components into an actual enable/disable flow (see
 * memory — the desktop never wires these in anywhere either).
 */
import { useEffect, useState } from 'react';
import { Modal, Pressable, ScrollView, Text, TextInput, View } from 'react-native';
import { Feather } from '@expo/vector-icons';
import { getApiBaseUrl, setApiBaseUrlOverride, removeApiToken } from '../api/config';
import { verifySuperAdminCredentials, hasTOTPEnabled, setTOTPSecret, clearTOTPSecret } from '../services/authService';
import type { AdminUser } from '../types';
import { Button } from './Button';
import { PrinterConfigModal } from './PrinterConfigModal';
import { TerminalConfigModal } from './TerminalConfigModal';
import { GoogleAuthenticatorSetup } from './GoogleAuthenticatorSetup';
import { EmailOtpVerification } from './EmailOtpVerification';

interface SettingsModalProps {
  isOpen: boolean;
  currentUser: AdminUser | null;
  onClose: () => void;
  /** Called after the API base URL changes — the caller should force a fresh login. */
  onApiBaseUrlChanged?: () => void;
}

function Row({ icon, title, subtitle, onPress }: { icon: keyof typeof Feather.glyphMap; title: string; subtitle: string; onPress: () => void }) {
  return (
    <Pressable onPress={onPress} className="flex-row items-center gap-3 rounded-xl border border-gray-200 px-4 py-3.5 active:bg-gray-50">
      <View className="h-9 w-9 items-center justify-center rounded-xl bg-blue-100">
        <Feather name={icon} size={16} color="#1D4ED8" />
      </View>
      <View className="flex-1">
        <Text className="text-sm font-semibold text-gray-900">{title}</Text>
        <Text className="mt-0.5 text-xs text-gray-500">{subtitle}</Text>
      </View>
      <Feather name="chevron-right" size={16} color="#9CA3AF" />
    </Pressable>
  );
}

export function SettingsModal({ isOpen, currentUser, onClose, onApiBaseUrlChanged }: SettingsModalProps) {
  const isPrivilegedUser = currentUser?.role === 'admin';
  const isSuperAdmin = !!currentUser?.roles?.includes('Super Admin');

  const [apiBaseUrl, setApiBaseUrlInput] = useState('');
  const [apiSaving, setApiSaving] = useState(false);
  const [apiMessage, setApiMessage] = useState<string | null>(null);
  const [showSuperAdminPrompt, setShowSuperAdminPrompt] = useState(false);
  const [saIdentifier, setSaIdentifier] = useState('');
  const [saPassword, setSaPassword] = useState('');

  const [showPrinter, setShowPrinter] = useState(false);
  const [showTerminal, setShowTerminal] = useState(false);
  const [showTotpSetup, setShowTotpSetup] = useState(false);
  const [showTotpDisableVerify, setShowTotpDisableVerify] = useState(false);
  const [totpEnabled, setTotpEnabled] = useState(false);

  useEffect(() => {
    if (!isOpen) return;
    void (() => {
      setApiBaseUrlInput(getApiBaseUrl());
      setApiMessage(null);
      setShowSuperAdminPrompt(false);
      setSaIdentifier('');
      setSaPassword('');
      setTotpEnabled(currentUser ? hasTOTPEnabled(currentUser.email) : false);
    })();
  }, [isOpen, currentUser]);

  const handleSaveApiBaseUrl = async () => {
    setApiSaving(true);
    setApiMessage(null);
    try {
      let parsed: URL;
      try {
        parsed = new URL(apiBaseUrl.trim());
      } catch {
        setApiMessage('Invalid URL format.');
        return;
      }
      if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
        setApiMessage('URL must use http:// or https://');
        return;
      }
      if (!isSuperAdmin) {
        setShowSuperAdminPrompt(true);
        if (!saIdentifier.trim() || !saPassword.trim()) {
          setApiMessage('Enter Super Admin credentials to apply API changes.');
          return;
        }
        const auth = await verifySuperAdminCredentials(saIdentifier.trim(), saPassword);
        if (!auth.ok) {
          setApiMessage(auth.message ?? 'Super Admin validation failed.');
          return;
        }
      }
      const { changed, baseUrl } = setApiBaseUrlOverride(parsed.toString().replace(/\/$/, ''));
      if (!changed) {
        setApiMessage('API URL unchanged.');
        return;
      }
      removeApiToken();
      setApiMessage(`Saved: ${baseUrl}. Please log in again.`);
      onApiBaseUrlChanged?.();
    } finally {
      setApiSaving(false);
    }
  };

  return (
    <Modal visible={isOpen} animationType="slide" transparent onRequestClose={onClose}>
      <View className="flex-1 items-center justify-center bg-black/40 p-4">
        <View className="max-h-[85%] w-full max-w-sm overflow-hidden rounded-2xl bg-white">
          <View className="flex-row items-center justify-between border-b border-gray-100 px-5 py-4">
            <Text className="text-xl font-bold text-gray-900">Settings</Text>
            <Pressable onPress={onClose}>
              <Feather name="x" size={20} color="#9CA3AF" />
            </Pressable>
          </View>

          <ScrollView className="p-4" contentContainerClassName="gap-3">
            {currentUser && (
              <View className="rounded-xl border border-gray-200 bg-gray-50 px-4 py-3.5">
                <View className="mb-2 flex-row items-center gap-3">
                  <View className="h-9 w-9 items-center justify-center rounded-xl bg-blue-100">
                    <Feather name="shield" size={16} color="#1D4ED8" />
                  </View>
                  <View className="flex-1">
                    <Text className="text-sm font-semibold text-gray-900">Security</Text>
                    <Text className="mt-0.5 text-xs text-gray-500">Google Authenticator: {totpEnabled ? 'Enabled' : 'Not enabled'}</Text>
                  </View>
                </View>
                <Button variant={totpEnabled ? 'outline' : 'primary'} onPress={() => (totpEnabled ? setShowTotpDisableVerify(true) : setShowTotpSetup(true))}>
                  {totpEnabled ? 'Disable Google Authenticator' : 'Enable Google Authenticator'}
                </Button>
              </View>
            )}

            {isPrivilegedUser && (
              <View className="rounded-xl border border-gray-200 px-4 py-3.5">
                <Text className="text-sm font-semibold text-gray-900">API Base URL</Text>
                <Text className="mb-2 mt-0.5 text-xs text-gray-500">Change the backend endpoint for this device. Saving signs you out.</Text>
                <TextInput
                  value={apiBaseUrl}
                  onChangeText={(v) => {
                    setApiBaseUrlInput(v);
                    setApiMessage(null);
                  }}
                  placeholder="http://127.0.0.1:8000"
                  autoCapitalize="none"
                  editable={!apiSaving}
                  className="rounded-lg border border-gray-300 px-3 py-2 text-sm"
                />
                {!isSuperAdmin && showSuperAdminPrompt && (
                  <View className="mt-2 gap-2">
                    <TextInput
                      value={saIdentifier}
                      onChangeText={setSaIdentifier}
                      placeholder="Super Admin email or User ID"
                      autoCapitalize="none"
                      editable={!apiSaving}
                      className="rounded-lg border border-gray-300 px-3 py-2 text-sm"
                    />
                    <TextInput
                      value={saPassword}
                      onChangeText={setSaPassword}
                      placeholder="Super Admin password"
                      secureTextEntry
                      editable={!apiSaving}
                      className="rounded-lg border border-gray-300 px-3 py-2 text-sm"
                    />
                  </View>
                )}
                <View className="mt-2">
                  <Button onPress={handleSaveApiBaseUrl} loading={apiSaving} disabled={apiSaving || !apiBaseUrl.trim()}>
                    Save API URL
                  </Button>
                </View>
                {apiMessage && <Text className="mt-2 text-xs text-gray-600">{apiMessage}</Text>}
              </View>
            )}

            <Row icon="printer" title="Printer Settings" subtitle="Configure receipt printer" onPress={() => setShowPrinter(true)} />
            {isPrivilegedUser && <Row icon="terminal" title="Terminal Settings" subtitle="Register, POS serial, MIN#" onPress={() => setShowTerminal(true)} />}
          </ScrollView>

          <View className="border-t border-gray-100 p-4">
            <Button variant="outline" onPress={onClose}>
              Close
            </Button>
          </View>
        </View>
      </View>

      <PrinterConfigModal isOpen={showPrinter} onClose={() => setShowPrinter(false)} />
      <TerminalConfigModal isOpen={showTerminal} onClose={() => setShowTerminal(false)} />

      <Modal visible={showTotpSetup} animationType="slide" onRequestClose={() => setShowTotpSetup(false)}>
        {currentUser && (
          <GoogleAuthenticatorSetup
            email={currentUser.email}
            onComplete={(secret) => {
              setTOTPSecret(currentUser.email, secret);
              setTotpEnabled(true);
              setShowTotpSetup(false);
            }}
            onCancel={() => setShowTotpSetup(false)}
          />
        )}
      </Modal>

      <Modal visible={showTotpDisableVerify} animationType="slide" onRequestClose={() => setShowTotpDisableVerify(false)}>
        {currentUser && (
          <EmailOtpVerification
            email={currentUser.email}
            onVerify={() => {
              clearTOTPSecret(currentUser.email);
              setTotpEnabled(false);
              setShowTotpDisableVerify(false);
            }}
            onCancel={() => setShowTotpDisableVerify(false)}
          />
        )}
      </Modal>
    </Modal>
  );
}
