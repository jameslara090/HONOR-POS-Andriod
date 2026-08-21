import { useState } from 'react';
import { Pressable, Text, TextInput, View, type TextInputProps } from 'react-native';
import type { PromoterOption } from '../types';

interface PromoterComboBoxProps extends Omit<TextInputProps, 'value' | 'onChangeText' | 'onChange'> {
  value: string;
  onChange: (value: string) => void;
  onSelect?: (option: PromoterOption) => void;
  roster: PromoterOption[];
  inputClassName?: string;
}

const MAX_SHOWN = 5;

/**
 * Store-scoped promoter search + dropdown — ported from the desktop's
 * PromoterComboBox.tsx. `roster` is expected to already be scoped to the
 * current store (see getStorePromoters()) — this just filters and displays
 * it, never fetches across stores itself.
 */
export function PromoterComboBox({ value, onChange, onSelect, roster, inputClassName, ...inputProps }: PromoterComboBoxProps) {
  const [open, setOpen] = useState(false);

  const query = value.trim().toLowerCase();
  const matches = query ? roster.filter((p) => p.userId.toLowerCase().includes(query) || p.name.toLowerCase().includes(query)) : roster;
  const shown = matches.slice(0, MAX_SHOWN);
  const remaining = matches.length - shown.length;

  return (
    <View>
      <TextInput
        value={value}
        onChangeText={onChange}
        onFocus={() => setOpen(true)}
        onBlur={() => setTimeout(() => setOpen(false), 150)}
        autoCapitalize="characters"
        autoCorrect={false}
        className={inputClassName}
        {...inputProps}
      />
      {open && shown.length > 0 && (
        <View className="absolute left-0 right-0 top-full z-10 mt-1 rounded-lg border border-gray-200 bg-white shadow-lg">
          {shown.map((p) => (
            <Pressable
              key={p.userId}
              onPress={() => {
                onChange(p.userId);
                onSelect?.(p);
                setOpen(false);
              }}
              className="flex-row items-center justify-between gap-2 px-3 py-2 active:bg-gray-50"
            >
              <Text className="flex-1 text-sm font-medium text-gray-800" numberOfLines={1}>
                {p.name}
              </Text>
              <Text className="font-mono text-xs text-gray-400">{p.userId}</Text>
            </Pressable>
          ))}
          {remaining > 0 && <Text className="border-t border-gray-100 px-3 py-1.5 text-[11px] text-gray-400">+{remaining} more — keep typing to narrow down</Text>}
        </View>
      )}
      {open && query && matches.length === 0 && (
        <View className="absolute left-0 right-0 top-full z-10 mt-1 rounded-lg border border-gray-200 bg-white px-3 py-2 shadow-lg">
          <Text className="text-xs text-gray-400">No promoter matches &ldquo;{value}&rdquo; for this store.</Text>
        </View>
      )}
    </View>
  );
}
