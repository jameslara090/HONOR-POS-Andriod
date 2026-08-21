/**
 * Customer search/create — ported from the desktop's CustomerSelectModal.tsx.
 * Search debounces against the live API, falling back to the offline cached
 * list; create posts to the server or, offline, queues the profile and
 * returns a walk-in pseudo-customer (id: 0) for this sale only.
 */
import { useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Modal, Pressable, ScrollView, Text, TextInput, View } from 'react-native';
import { createCustomer, searchCustomers } from '../api/customers';
import type { PosCustomer } from '../types';
import { Button } from './Button';

interface CustomerSelectModalProps {
  isOpen: boolean;
  required?: boolean;
  selectedCustomer: PosCustomer | null;
  onSelect: (customer: PosCustomer | null) => void;
  onClose: () => void;
}

const PHONE_REGEX = /^09\d{9}$/;
const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export function CustomerSelectModal({ isOpen, required, selectedCustomer, onSelect, onClose }: CustomerSelectModalProps) {
  const [mode, setMode] = useState<'search' | 'create'>('search');
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<PosCustomer[]>([]);
  const [searching, setSearching] = useState(false);
  const [offline, setOffline] = useState(false);

  const [name, setName] = useState('');
  const [company, setCompany] = useState('');
  const [phone, setPhone] = useState('');
  const [email, setEmail] = useState('');
  const [address, setAddress] = useState('');
  const [tin, setTin] = useState('');
  const [formError, setFormError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const [wasOpen, setWasOpen] = useState(isOpen);
  if (isOpen !== wasOpen) {
    setWasOpen(isOpen);
    if (isOpen) {
      setMode('search');
      setQuery('');
      setResults([]);
      setOffline(false);
      setName('');
      setCompany('');
      setPhone('');
      setEmail('');
      setAddress('');
      setTin('');
      setFormError(null);
    }
  }

  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    if (query.trim().length < 2) return;
    debounceRef.current = setTimeout(() => {
      setSearching(true);
      void searchCustomers(query.trim())
        .then(({ customers, offline: off }) => {
          setResults(customers);
          setOffline(off);
        })
        .finally(() => setSearching(false));
    }, 350);
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, [query]);

  const handleSelect = (customer: PosCustomer | null) => {
    onSelect(customer);
    onClose();
  };

  const displayResults = query.trim().length < 2 ? [] : results;

  const handleCreate = async () => {
    setFormError(null);
    const trimmedName = name.trim();
    if (!trimmedName) {
      setFormError('Name is required.');
      return;
    }
    const trimmedPhone = phone.trim();
    if (trimmedPhone && !PHONE_REGEX.test(trimmedPhone.replace(/[\s-]/g, ''))) {
      setFormError('Phone must be a valid 11-digit PH mobile number (09XXXXXXXXX).');
      return;
    }
    const trimmedEmail = email.trim();
    if (trimmedEmail && !EMAIL_REGEX.test(trimmedEmail)) {
      setFormError('Email is not valid.');
      return;
    }
    setSubmitting(true);
    try {
      const { customer } = await createCustomer({
        name: trimmedName,
        company: company.trim() || undefined,
        phone: trimmedPhone || undefined,
        email: trimmedEmail || undefined,
        address: address.trim() || undefined,
        tin: tin.trim() || undefined,
      });
      handleSelect(customer);
    } catch (e) {
      setFormError(e instanceof Error ? e.message : 'Failed to create customer.');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Modal visible={isOpen} animationType="slide" transparent onRequestClose={onClose}>
      <View className="flex-1 items-center justify-center bg-black/40 p-4">
        <View className="max-h-[80%] w-full max-w-md gap-3 rounded-2xl bg-white p-6">
          <View className="flex-row gap-2">
            <Pressable onPress={() => setMode('search')} className={`flex-1 items-center rounded-md py-2 ${mode === 'search' ? 'bg-black' : 'bg-gray-100'}`}>
              <Text className={`text-sm font-semibold ${mode === 'search' ? 'text-white' : 'text-gray-700'}`}>Search</Text>
            </Pressable>
            <Pressable onPress={() => setMode('create')} className={`flex-1 items-center rounded-md py-2 ${mode === 'create' ? 'bg-black' : 'bg-gray-100'}`}>
              <Text className={`text-sm font-semibold ${mode === 'create' ? 'text-white' : 'text-gray-700'}`}>New</Text>
            </Pressable>
          </View>

          {mode === 'search' ? (
            <>
              <TextInput
                value={query}
                onChangeText={setQuery}
                placeholder="Search name, phone, or company"
                autoFocus
                className="rounded-lg border border-gray-300 px-3 py-2.5 text-sm"
              />
              {offline && <Text className="text-xs text-amber-600">Offline — showing previously cached customers.</Text>}
              <ScrollView className="max-h-64">
                {searching ? (
                  <ActivityIndicator className="py-4" />
                ) : displayResults.length === 0 ? (
                  <Text className="py-4 text-center text-sm text-gray-400">
                    {query.trim().length < 2 ? 'Type at least 2 characters to search.' : 'No customers found.'}
                  </Text>
                ) : (
                  displayResults.map((c) => (
                    <Pressable key={c.id} onPress={() => handleSelect(c)} className="border-b border-gray-100 py-3 active:bg-gray-50">
                      <Text className="text-sm font-semibold text-gray-900">{c.name}</Text>
                      {(c.phone || c.company) && (
                        <Text className="text-xs text-gray-500">{[c.company, c.phone].filter(Boolean).join(' · ')}</Text>
                      )}
                    </Pressable>
                  ))
                )}
              </ScrollView>
              {selectedCustomer && (
                <Pressable onPress={() => handleSelect(null)} className="items-center py-2">
                  <Text className="text-sm text-red-600">Clear selected customer</Text>
                </Pressable>
              )}
              {!required && (
                <Button variant="outline" onPress={() => handleSelect(null)}>
                  Continue without customer
                </Button>
              )}
            </>
          ) : (
            <ScrollView className="max-h-96 gap-2">
              <Text className="mb-1 text-xs font-medium text-gray-700">Name *</Text>
              <TextInput value={name} onChangeText={setName} className="mb-2 rounded-lg border border-gray-300 px-3 py-2.5 text-sm" />
              <Text className="mb-1 text-xs font-medium text-gray-700">Company</Text>
              <TextInput value={company} onChangeText={setCompany} className="mb-2 rounded-lg border border-gray-300 px-3 py-2.5 text-sm" />
              <Text className="mb-1 text-xs font-medium text-gray-700">Phone</Text>
              <TextInput
                value={phone}
                onChangeText={setPhone}
                keyboardType="phone-pad"
                placeholder="09XXXXXXXXX"
                className="mb-2 rounded-lg border border-gray-300 px-3 py-2.5 text-sm"
              />
              <Text className="mb-1 text-xs font-medium text-gray-700">Email</Text>
              <TextInput
                value={email}
                onChangeText={setEmail}
                keyboardType="email-address"
                autoCapitalize="none"
                className="mb-2 rounded-lg border border-gray-300 px-3 py-2.5 text-sm"
              />
              <Text className="mb-1 text-xs font-medium text-gray-700">Address</Text>
              <TextInput value={address} onChangeText={setAddress} className="mb-2 rounded-lg border border-gray-300 px-3 py-2.5 text-sm" />
              <Text className="mb-1 text-xs font-medium text-gray-700">TIN</Text>
              <TextInput value={tin} onChangeText={setTin} className="mb-2 rounded-lg border border-gray-300 px-3 py-2.5 text-sm" />
              {formError && <Text className="mb-2 text-sm text-red-600">{formError}</Text>}
              <Button onPress={handleCreate} loading={submitting}>
                Create Customer
              </Button>
            </ScrollView>
          )}

          <Pressable onPress={onClose} className="items-center py-2">
            <Text className="text-sm text-gray-500">Close</Text>
          </Pressable>
        </View>
      </View>
    </Modal>
  );
}
