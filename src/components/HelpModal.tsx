/**
 * Help / quick guide — adapted from the desktop's HelpModal.tsx. The desktop
 * version is almost entirely a keyboard-shortcut cheat sheet (F1-F12, Ctrl+
 * combos); none of that applies here — the plan's own UI-adaptation section
 * removes all keyboard shortcuts in favor of on-screen buttons. This keeps
 * the cashier/admin tab structure and content that IS still relevant.
 */
import { useState, type ReactNode } from 'react';
import { Modal, Pressable, ScrollView, Text, View } from 'react-native';
import { Feather } from '@expo/vector-icons';
import type { AdminUser } from '../types';

type HelpTab = 'cashier' | 'admin';

interface HelpModalProps {
  isOpen: boolean;
  onClose: () => void;
  currentUser: AdminUser | null;
}

function HelpSection({ title, icon, children }: { title: string; icon: ReactNode; children: ReactNode }) {
  return (
    <View className="gap-1.5 rounded-xl border border-gray-100 bg-white p-3">
      <View className="flex-row items-center gap-2">
        {icon}
        <Text className="text-xs font-bold text-gray-900">{title}</Text>
      </View>
      <View>{children}</View>
    </View>
  );
}

function Bullet({ children }: { children: ReactNode }) {
  return (
    <View className="flex-row gap-1.5">
      <Text className="text-xs text-gray-400">•</Text>
      <Text className="flex-1 text-xs leading-relaxed text-gray-700">{children}</Text>
    </View>
  );
}

export function HelpModal({ isOpen, onClose, currentUser }: HelpModalProps) {
  const isAdminLike = currentUser?.role === 'admin';
  const [tab, setTab] = useState<HelpTab>('cashier');

  return (
    <Modal visible={isOpen} animationType="slide" onRequestClose={onClose}>
      <View className="flex-1 bg-gray-50 p-4 pt-10">
        <View className="mb-3 flex-row items-center justify-between">
          <Text className="text-lg font-bold text-gray-900">Help</Text>
          <Pressable onPress={onClose}>
            <Text className="text-sm text-gray-500">Close</Text>
          </Pressable>
        </View>

        <View className="mb-4 flex-row gap-2">
          <Pressable onPress={() => setTab('cashier')} className={`flex-1 items-center rounded-lg py-2 ${tab === 'cashier' ? 'bg-black' : 'bg-gray-100'}`}>
            <Text className={`text-xs font-semibold ${tab === 'cashier' ? 'text-white' : 'text-gray-700'}`}>Cashier Help</Text>
          </Pressable>
          {isAdminLike && (
            <Pressable onPress={() => setTab('admin')} className={`flex-1 items-center rounded-lg py-2 ${tab === 'admin' ? 'bg-black' : 'bg-gray-100'}`}>
              <Text className={`text-xs font-semibold ${tab === 'admin' ? 'text-white' : 'text-gray-700'}`}>Admin Help</Text>
            </Pressable>
          )}
        </View>

        <ScrollView className="flex-1">
          {tab === 'cashier' ? (
            <View className="gap-3">
              <HelpSection title="Sell the easy way" icon={<Feather name="check-circle" size={14} color="#2563EB" />}>
                <View className="gap-1">
                  <Bullet>Open your shift before selling.</Bullet>
                  <Bullet>Use Search or the Scan button (camera or manual entry) to find items.</Bullet>
                  <Bullet>Tap Add to Cart, review the cart, then go to Checkout.</Bullet>
                </View>
              </HelpSection>

              <HelpSection title="Discounts" icon={<Feather name="zap" size={14} color="#2563EB" />}>
                <Text className="text-xs leading-relaxed text-gray-700">
                  Tap the Discount button in the cart. If the discount requires manager approval, you&rsquo;ll be asked to get approval (in person, offline credentials, or a remote request) before it&rsquo;s applied.
                </Text>
              </HelpSection>

              <HelpSection title="Checkout & payment" icon={<Feather name="credit-card" size={14} color="#2563EB" />}>
                <Text className="mb-1 text-xs leading-relaxed text-gray-700">Tap Checkout, then choose the payment method — cash, e-wallet, card, bank transfer, or installment.</Text>
                <Text className="text-xs leading-relaxed text-gray-700">A cash sale shows a denomination picker; other methods ask for a reference number where required.</Text>
              </HelpSection>

              <HelpSection title="Voids, refunds & reprints" icon={<Feather name="rotate-ccw" size={14} color="#2563EB" />}>
                <View className="gap-1">
                  <Bullet>Void a same-day sale from Sales History — needs manager approval unless you already are one.</Bullet>
                  <Bullet>Refund a settled (older-day) sale instead — pick the items being returned.</Bullet>
                  <Bullet>Reprinting a receipt is free once per sale within 24h; after that it needs approval too.</Bullet>
                </View>
              </HelpSection>
            </View>
          ) : (
            <View className="gap-3">
              <HelpSection title="Admin scope" icon={<Feather name="shield" size={14} color="#2563EB" />}>
                <View className="gap-1">
                  <Bullet>Discounts, voids, and reprints may require approval depending on business rules.</Bullet>
                  <Bullet>Managers/OICs/Admins can approve these directly, in person or remotely.</Bullet>
                  <Bullet>Use Settings to manage the API endpoint, printer, and terminal configuration.</Bullet>
                </View>
              </HelpSection>

              <HelpSection title="Security" icon={<Feather name="lock" size={14} color="#2563EB" />}>
                <Text className="text-xs leading-relaxed text-gray-700">
                  Google Authenticator can be enabled per account from Settings → Security. Once enabled, that account needs a 6-digit code at every login on this device.
                </Text>
              </HelpSection>
            </View>
          )}
        </ScrollView>
      </View>
    </Modal>
  );
}
