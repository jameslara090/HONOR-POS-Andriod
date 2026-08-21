import { ActivityIndicator, Pressable, Text, type PressableProps } from 'react-native';

type Variant = 'primary' | 'secondary' | 'danger' | 'outline';

interface ButtonProps extends Omit<PressableProps, 'children'> {
  variant?: Variant;
  loading?: boolean;
  children: string;
}

const containerVariantClasses: Record<Variant, string> = {
  primary: 'bg-black active:bg-gray-800',
  secondary: 'bg-gray-800 active:bg-gray-900',
  danger: 'bg-red-600 active:bg-red-800',
  outline: 'bg-transparent border border-gray-300 active:bg-gray-100',
};

const textVariantClasses: Record<Variant, string> = {
  primary: 'text-white',
  secondary: 'text-white',
  danger: 'text-white',
  outline: 'text-gray-800',
};

export function Button({ variant = 'primary', loading = false, disabled, children, ...props }: ButtonProps) {
  const isDisabled = disabled || loading;

  return (
    <Pressable
      disabled={isDisabled}
      className={`w-full flex-row items-center justify-center rounded-lg py-3.5 px-4 ${containerVariantClasses[variant]} ${isDisabled ? 'opacity-50' : ''}`}
      {...props}
    >
      {loading && <ActivityIndicator size="small" color="#fff" className="mr-2" />}
      <Text className={`text-base font-bold ${textVariantClasses[variant]}`}>{children}</Text>
    </Pressable>
  );
}
