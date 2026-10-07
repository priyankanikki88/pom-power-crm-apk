import { useQuery } from '@tanstack/react-query';
import { useEffect, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { api } from '../lib/api';
import { colors, radius, space } from '../theme';
import type { CustomerSummary, Paginated } from '../types';
import { Field, text } from './ui';

export interface PickedCustomer {
  id: string;
  name: string;
}

/**
 * Choose a customer by searching the server (name, code, GSTIN, mobile — the same search as the Customers tab, so the
 * user only ever finds customers their role may see). `locked` shows the customer without a way to change it.
 */
export function CustomerPicker({ label = 'Customer', value, onChange, locked, required = true }: { label?: string; value: PickedCustomer | null; onChange: (c: PickedCustomer | null) => void; locked?: boolean; required?: boolean }) {
  const [input, setInput] = useState('');
  const [search, setSearch] = useState('');
  useEffect(() => {
    const t = setTimeout(() => setSearch(input.trim()), 350);
    return () => clearTimeout(t);
  }, [input]);
  const results = useQuery({
    queryKey: ['customers', 'picker', search],
    queryFn: () => api.get<Paginated<CustomerSummary>>('/customers', { search, pageSize: 8 }),
    enabled: !value && search.length >= 2,
  });

  if (value) {
    return (
      <View style={styles.picked}>
        <View style={styles.flex}>
          <Text style={styles.label}>{label}</Text>
          <Text style={text.h2}>{value.name}</Text>
        </View>
        {!locked ? (
          <Pressable onPress={() => onChange(null)} hitSlop={10} accessibilityRole="button" accessibilityLabel={`Change ${label.toLowerCase()}`}>
            <Text style={styles.change}>Change</Text>
          </Pressable>
        ) : null}
      </View>
    );
  }
  return (
    <>
      <Field label={`${label}${required ? ' *' : ''} (type at least 2 letters)`} value={input} onChangeText={setInput} autoCapitalize="none" autoCorrect={false} placeholder="Name, code, mobile…" />
      {results.data?.items.map((c) => (
        <Pressable
          key={c.id}
          style={styles.result}
          onPress={() => {
            onChange({ id: c.id, name: c.name });
            setInput('');
          }}
          accessibilityRole="button"
        >
          <Text style={text.body}>{c.name}</Text>
          <Text style={text.muted}>{c.customerCode}</Text>
        </Pressable>
      ))}
      {results.data && results.data.items.length === 0 ? <Text style={[text.muted, styles.none]}>No customer matches.</Text> : null}
    </>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  label: { fontSize: 13, fontWeight: '600', color: colors.muted, marginBottom: 2 },
  picked: { flexDirection: 'row', alignItems: 'center', marginBottom: space.md },
  change: { color: colors.primary, fontWeight: '700', fontSize: 14 },
  result: { padding: space.md, borderWidth: 1, borderColor: colors.border, borderRadius: radius.md, marginBottom: space.sm, backgroundColor: colors.surface },
  none: { marginBottom: space.md },
});
