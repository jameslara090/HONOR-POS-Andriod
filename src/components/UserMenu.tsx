/**
 * User menu — ported from the desktop's UserMenu.tsx, but expanded into the
 * single navigation hub for this port: the desktop spreads these actions
 * across a header toolbar (refresh icon, cart icon, user avatar dropdown)
 * plus scattered buttons elsewhere in App.tsx for cash movement/sales
 * summary/warranty lookup/help, none of which this port has a header bar
 * for yet. Reachable via a single "Menu" button on the POS screen instead.
 * "Reading report" (X-report) is dropped — not built in any earlier phase
 * (see Phase 4 memory: X-Report/Reading-Report variants are still scope-cut).
 * "Shut down this computer" is dropped — no Android equivalent.
 */
import { Modal, Pressable, ScrollView, Text, View } from 'react-native';
import { Feather } from '@expo/vector-icons';
import type { AdminUser } from '../types';

interface UserMenuProps {
  isOpen: boolean;
  currentUser: AdminUser;
  hasOpenShift: boolean;
  onClose: () => void;
  onSalesHistory: () => void;
  onSettings: () => void;
  onShift: () => void;
  onFloatingStock: () => void;
  onCashMovement: () => void;
  onSalesSummary: () => void;
  onWarrantyLookup: () => void;
  onHelp: () => void;
  onLogout: () => void;
  onRestartApp: () => void;
  onExitApp: () => void;
}

function MenuItem({
  icon,
  label,
  onPress,
  danger,
}: {
  icon: keyof typeof Feather.glyphMap;
  label: string;
  onPress: () => void;
  danger?: boolean;
}) {
  return (
    <Pressable onPress={onPress} className="flex-row items-center gap-3 px-4 py-3 active:bg-gray-100">
      <Feather name={icon} size={17} color={danger ? '#DC2626' : '#4B5563'} />
      <Text className={`text-sm font-medium ${danger ? 'text-red-600' : 'text-gray-700'}`}>{label}</Text>
    </Pressable>
  );
}

export function UserMenu({
  isOpen,
  currentUser,
  hasOpenShift,
  onClose,
  onSalesHistory,
  onSettings,
  onShift,
  onFloatingStock,
  onCashMovement,
  onSalesSummary,
  onWarrantyLookup,
  onHelp,
  onLogout,
  onRestartApp,
  onExitApp,
}: UserMenuProps) {
  const roleLabel = currentUser.role === 'admin' ? 'Admin User' : currentUser.role === 'cashier' ? 'Cashier User' : 'User';
  // role is a coarse admin/cashier bucket (OIC/Manager/Area Supervisor all fall
  // under 'cashier' too) — check the real roles list so Settings only hides for
  // the actual Cashier role, not every non-admin role.
  const isCashier = !!currentUser.roles?.includes('Cashier');

  const fire = (action: () => void) => {
    onClose();
    action();
  };

  return (
    <Modal visible={isOpen} animationType="fade" transparent onRequestClose={onClose}>
      <Pressable className="flex-1 bg-black/30" onPress={onClose}>
        <Pressable onPress={(e) => e.stopPropagation()} className="absolute right-4 top-16 w-64 overflow-hidden rounded-2xl bg-white shadow-xl">
          <View className="border-b border-gray-100 px-4 py-3">
            <Text className="text-sm font-semibold text-gray-900" numberOfLines={1}>
              {currentUser.name}
            </Text>
            <Text className="text-xs text-gray-500" numberOfLines={1}>
              {currentUser.email}
            </Text>
            <Text className="mt-0.5 text-xs text-gray-500">{roleLabel}</Text>
          </View>

          <ScrollView className="max-h-[60vh]">
            <MenuItem icon="clock" label="Sales History" onPress={() => fire(onSalesHistory)} />
            {!isCashier && <MenuItem icon="settings" label="Settings" onPress={() => fire(onSettings)} />}
            <MenuItem icon="briefcase" label={hasOpenShift ? 'Close / manage shift' : 'Open shift'} onPress={() => fire(onShift)} />
            {hasOpenShift && <MenuItem icon="dollar-sign" label="Cash Movement" onPress={() => fire(onCashMovement)} />}
            <MenuItem icon="radio" label="Floating Stock" onPress={() => fire(onFloatingStock)} />
            {!isCashier && <MenuItem icon="bar-chart-2" label="Sales Summary" onPress={() => fire(onSalesSummary)} />}
            <MenuItem icon="shield" label="Warranty Lookup" onPress={() => fire(onWarrantyLookup)} />
            <MenuItem icon="help-circle" label="Help" onPress={() => fire(onHelp)} />

            <View className="my-1 border-t border-gray-100" />

            <MenuItem icon="log-out" label="Logout" onPress={() => fire(onLogout)} />
            <MenuItem icon="refresh-cw" label="Restart app" onPress={() => fire(onRestartApp)} />
            <MenuItem icon="x-circle" label="Exit app" onPress={() => fire(onExitApp)} danger />
          </ScrollView>
        </Pressable>
      </Pressable>
    </Modal>
  );
}
