import { ActivityIndicator, Pressable, Text, View, type PressableProps } from 'react-native';
import { INK } from '../theme';

type Variant = 'primary' | 'secondary' | 'danger' | 'outline' | 'ghost';

interface ButtonProps extends Omit<PressableProps, 'children'> {
  variant?: Variant;
  loading?: boolean;
  /** Modernist keeps labels flush left; pass an element to sit at the right edge. */
  trailing?: React.ReactNode;
  children: string;
}

const containerVariantClasses: Record<Variant, string> = {
  primary: 'bg-mod-accent active:bg-mod-accent-600',
  secondary: 'bg-mod-ink active:bg-mod-neutral-800',
  danger: 'bg-red-700 active:bg-red-800',
  outline: 'bg-transparent border-2 border-mod-ink active:bg-mod-accent-100',
  ghost: 'bg-transparent active:bg-mod-accent-100',
};

const textVariantClasses: Record<Variant, string> = {
  primary: 'text-white',
  secondary: 'text-white',
  danger: 'text-white',
  outline: 'text-mod-ink',
  ghost: 'text-mod-ink',
};

export function Button({ variant = 'primary', loading = false, disabled, trailing, children, ...props }: ButtonProps) {
  const isDisabled = disabled || loading;

  return (
    <Pressable
      disabled={isDisabled}
      className={`relative w-full min-h-[52px] flex-row items-center justify-center px-4 py-3 ${containerVariantClasses[variant]} ${isDisabled ? 'opacity-45' : ''}`}
      {...props}
    >
      <View className="flex-row items-center gap-2">
        {loading && <ActivityIndicator size="small" color={variant === 'outline' || variant === 'ghost' ? INK : '#fff'} />}
        <Text className={`font-a-display text-[14px] tracking-label ${textVariantClasses[variant]}`}>{children.toUpperCase()}</Text>
      </View>
      {trailing && <View className="absolute inset-y-0 right-4 items-center justify-center">{trailing}</View>}
    </Pressable>
  );
}
