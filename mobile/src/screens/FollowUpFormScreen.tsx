import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { useEffect, useState } from 'react';
import { Alert, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { ChipSelect, DateTimeField } from '../components/inputs';
import { Button, Card, ErrorBox, Field, text } from '../components/ui';
import { api, ApiError } from '../lib/api';
import { formatWhen, nextHour, pickedParts } from '../lib/dates';
import { sendOrQueue } from '../lib/outbox';
import type { FollowUpsStackParams } from '../navigation';
import { colors, radius, space } from '../theme';
import { TYPE_LABEL, type CustomerSummary, type FollowUpType, type Paginated } from '../types';

const TYPES = (Object.keys(TYPE_LABEL) as FollowUpType[]).map((value) => ({ value, label: TYPE_LABEL[value] }));

/** Plan a follow-up. The customer comes from the screen that opened this form, or is searched for here. */
export function FollowUpFormScreen({ route, navigation }: NativeStackScreenProps<FollowUpsStackParams, 'FollowUpForm'>) {
  const qc = useQueryClient();
  const [customer, setCustomer] = useState<{ id: string; name: string } | null>(route.params.customer ?? null);
  const [input, setInput] = useState('');
  const [search, setSearch] = useState('');
  const [when, setWhen] = useState(nextHour);
  const [type, setType] = useState<FollowUpType>('CALL');
  const [purpose, setPurpose] = useState('');
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const t = setTimeout(() => setSearch(input.trim()), 350);
    return () => clearTimeout(t);
  }, [input]);
  const results = useQuery({
    queryKey: ['customers', 'picker', search],
    queryFn: () => api.get<Paginated<CustomerSummary>>('/customers', { search, pageSize: 8 }),
    enabled: !customer && search.length >= 2,
  });

  const create = useMutation({
    mutationFn: () =>
      sendOrQueue({
        title: `New follow-up — ${customer!.name}, ${formatWhen(when.toISOString())}`,
        method: 'POST',
        path: '/follow-ups',
        body: { customerId: customer!.id, ...pickedParts(when), type, purpose: purpose.trim() || undefined },
        refresh: ['follow-ups'],
      }),
    onSuccess: (res) => {
      void qc.invalidateQueries({ queryKey: ['follow-ups'] });
      if (res.queued) Alert.alert('Saved on this phone', 'There is no network right now. It will be sent on its own when the network is back — see More → Waiting to Send.');
      navigation.goBack();
    },
    onError: (err) => setError(err instanceof ApiError ? err.message : 'Could not plan the follow-up.'),
  });

  function submit() {
    if (!customer) return setError('Choose the customer.');
    setError(null);
    create.mutate();
  }

  return (
    <ScrollView style={styles.screen} contentContainerStyle={styles.body} keyboardShouldPersistTaps="handled">
      <Card>
        {error ? <ErrorBox message={error} /> : null}
        {customer ? (
          <View style={styles.picked}>
            <View style={styles.flex}>
              <Text style={styles.label}>Customer</Text>
              <Text style={text.h2}>{customer.name}</Text>
            </View>
            {!route.params.customer ? (
              <Pressable onPress={() => setCustomer(null)} hitSlop={10} accessibilityRole="button">
                <Text style={styles.change}>Change</Text>
              </Pressable>
            ) : null}
          </View>
        ) : (
          <>
            <Field label="Customer * (type at least 2 letters)" value={input} onChangeText={setInput} autoCapitalize="none" autoCorrect={false} placeholder="Name, code, mobile…" />
            {results.data?.items.map((c) => (
              <Pressable key={c.id} style={styles.result} onPress={() => setCustomer({ id: c.id, name: c.name })} accessibilityRole="button">
                <Text style={text.body}>{c.name}</Text>
                <Text style={text.muted}>{c.customerCode}</Text>
              </Pressable>
            ))}
            {results.data && results.data.items.length === 0 ? <Text style={[text.muted, styles.none]}>No customer matches.</Text> : null}
          </>
        )}
        <DateTimeField label="Date and time *" value={when} onChange={setWhen} minimumDate={new Date()} />
        <ChipSelect label="Type *" value={type} options={TYPES} onChange={(v) => v && setType(v)} />
        <Field label="Purpose" value={purpose} onChangeText={setPurpose} multiline maxLength={2000} />
        <Button title="Plan Follow-up" onPress={submit} loading={create.isPending} />
      </Card>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.bg },
  body: { padding: space.lg },
  flex: { flex: 1 },
  label: { fontSize: 13, fontWeight: '600', color: colors.muted, marginBottom: 2 },
  picked: { flexDirection: 'row', alignItems: 'center', marginBottom: space.md },
  change: { color: colors.primary, fontWeight: '700', fontSize: 14 },
  result: { padding: space.md, borderWidth: 1, borderColor: colors.border, borderRadius: radius.md, marginBottom: space.sm, backgroundColor: colors.surface },
  none: { marginBottom: space.md },
});
