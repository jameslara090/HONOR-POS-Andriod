import { Pressable, Text, View } from 'react-native';

interface PaginationProps {
  page: number;
  totalPages: number;
  onPrev: () => void;
  onNext: () => void;
}

export function Pagination({ page, totalPages, onPrev, onNext }: PaginationProps) {
  return (
    <View className="mt-4 flex-row items-center justify-between">
      <Pressable
        disabled={page <= 1}
        onPress={onPrev}
        className={`rounded-md border border-gray-300 px-4 py-2 ${page <= 1 ? 'opacity-40' : 'active:bg-gray-100'}`}
      >
        <Text className="text-sm font-medium text-gray-700">Prev</Text>
      </Pressable>
      <Text className="text-sm text-gray-600">
        Page <Text className="font-semibold text-gray-900">{Math.min(page, totalPages)}</Text> of{' '}
        <Text className="font-semibold text-gray-900">{totalPages}</Text>
      </Text>
      <Pressable
        disabled={page >= totalPages}
        onPress={onNext}
        className={`rounded-md border border-gray-300 px-4 py-2 ${page >= totalPages ? 'opacity-40' : 'active:bg-gray-100'}`}
      >
        <Text className="text-sm font-medium text-gray-700">Next</Text>
      </Pressable>
    </View>
  );
}
