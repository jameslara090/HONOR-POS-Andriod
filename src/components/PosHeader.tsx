/**
 * Sell-screen header bar. Replaces the "Welcome, {name}" row: the terminal's
 * real state — store, register, shift, connection, printer — is permanent
 * chrome rather than a transient banner, because cashiers work offline with a
 * paired Bluetooth printer and need both at a glance.
 */
import { Pressable, Text, View } from 'react-native';
import { Feather } from '@expo/vector-icons';
import { INK, NEUTRAL } from '../theme';

interface PosHeaderProps {
  userName: string;
  offline: boolean;
  register: string;
  storeName?: string;
  businessDate?: string;
  shiftOpenedAt?: string;
  queuedCount?: number;
  printerName?: string | null;
  isWide: boolean;
  cartCount: number;
  onCart: () => void;
  onHistory: () => void;
  onShift: () => void;
  onMenu: () => void;
}

function Cell({ children, className = '' }: { children: React.ReactNode; className?: string }) {
  return <View className={`h-full flex-row items-center gap-2 border-l border-mod-neutral-300 px-3 ${className}`}>{children}</View>;
}

export function PosHeader({
  userName,
  offline,
  register,
  storeName = 'SM North EDSA',
  businessDate,
  shiftOpenedAt,
  queuedCount = 0,
  printerName = 'HPRT TP80',
  isWide,
  cartCount,
  onCart,
  onHistory,
  onShift,
  onMenu,
}: PosHeaderProps) {
  return (
    <View className="h-[60px] flex-row items-stretch border-b-2 border-mod-divider bg-mod-bg">
      <View className="h-full justify-center px-4">
        <Text className="font-a-display text-[17px] tracking-display text-mod-ink">HONOR POS</Text>
      </View>

      {isWide && (
        <Cell>
          <Text className="font-a-semi text-[12px] text-mod-ink">{storeName.toUpperCase()}</Text>
          <Text className="font-a text-[12px] text-mod-neutral-700">{register}</Text>
          {shiftOpenedAt ? <Text className="font-a text-[12px] text-mod-neutral-700">SHIFT {shiftOpenedAt}</Text> : null}
        </Cell>
      )}

      {isWide && businessDate && (
        <Cell>
          <Text className="font-a-semi text-[11px] tracking-label text-mod-neutral-700">BUSINESS DATE</Text>
          <Text className="font-a-semi text-[12px] text-mod-ink">{businessDate}</Text>
        </Cell>
      )}

      <View className="flex-1" />

      <Cell>
        <View className={`h-2 w-2 ${offline ? 'bg-mod-danger' : 'bg-mod-neutral-500'}`} />
        <Text className="font-a-semi text-[11px] tracking-label text-mod-ink">
          {offline ? `OFFLINE${queuedCount ? ` · ${queuedCount} QUEUED` : ''}` : 'ONLINE'}
        </Text>
      </Cell>

      {isWide && printerName ? (
        <Cell>
          <Feather name="printer" size={14} color={NEUTRAL[700]} />
          <Text className="font-a-semi text-[11px] tracking-label text-mod-neutral-700">PRINTER OK</Text>
        </Cell>
      ) : null}

      {!isWide && (
        <Pressable onPress={onCart} className="h-full flex-row items-center gap-2 border-l border-mod-neutral-300 px-3 active:bg-mod-accent-100">
          <Feather name="shopping-bag" size={16} color={INK} />
          <Text className="font-a-semi text-[12px] text-mod-ink">{cartCount}</Text>
        </Pressable>
      )}

      {isWide && (
        <>
          <Pressable onPress={onHistory} className="h-full justify-center border-l border-mod-neutral-300 px-4 active:bg-mod-accent-100">
            <Text className="font-a-semi text-[11px] tracking-label text-mod-ink">HISTORY</Text>
          </Pressable>
          <Pressable onPress={onShift} className="h-full justify-center border-l border-mod-neutral-300 px-4 active:bg-mod-accent-100">
            <Text className="font-a-semi text-[11px] tracking-label text-mod-ink">SHIFT</Text>
          </Pressable>
        </>
      )}

      <Pressable onPress={onMenu} className="h-full flex-row items-center gap-2 border-l border-mod-neutral-300 px-4 active:bg-mod-accent-100">
        {isWide ? <Text className="font-a-semi text-[12px] text-mod-ink">{userName}</Text> : null}
        <Feather name="menu" size={16} color={INK} />
      </Pressable>
    </View>
  );
}
