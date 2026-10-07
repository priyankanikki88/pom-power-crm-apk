import { useQuery } from '@tanstack/react-query';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { useLayoutEffect } from 'react';
import { ActivityIndicator, Linking, Pressable, RefreshControl, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useAuth } from '../auth/AuthContext';
import { Badge, Button, Card, ErrorBox, Row, text } from '../components/ui';
import { api, ApiError } from '../lib/api';
import { enumLabel } from '../lib/format';
import type { CustomersStackParams } from '../navigation';
import { colors, radius, space } from '../theme';
import type { CustomerDetail } from '../types';

const digits = (phone: string) => phone.replace(/[^\d+]/g, '');
/** WhatsApp needs the country code; an Indian 10-digit mobile gets 91 in front. */
const whatsappNumber = (phone: string) => {
  const d = phone.replace(/\D/g, '');
  return d.length === 10 ? `91${d}` : d;
};

function ContactActions({ phone }: { phone: string }) {
  return (
    <View style={styles.actions}>
      <Pressable style={[styles.action, { backgroundColor: colors.primarySoft }]} onPress={() => void Linking.openURL(`tel:${digits(phone)}`)} accessibilityRole="button" accessibilityLabel={`Call ${phone}`}>
        <Text style={[styles.actionText, { color: colors.primaryDark }]}>Call</Text>
      </Pressable>
      <Pressable style={[styles.action, { backgroundColor: colors.successSoft }]} onPress={() => void Linking.openURL(`https://wa.me/${whatsappNumber(phone)}`)} accessibilityRole="button" accessibilityLabel={`WhatsApp ${phone}`}>
        <Text style={[styles.actionText, { color: colors.success }]}>WhatsApp</Text>
      </Pressable>
    </View>
  );
}

/** One customer: identity, phone actions, contacts and addresses; Edit and Plan Follow-up for roles that may. */
export function CustomerDetailScreen({ route, navigation }: NativeStackScreenProps<CustomersStackParams, 'CustomerDetail'>) {
  const { id } = route.params;
  const { hasPermission } = useAuth();
  const q = useQuery({ queryKey: ['customer', id], queryFn: () => api.get<CustomerDetail>(`/customers/${id}`) });
  const c = q.data;
  const canEdit = hasPermission('customer.manage') && Boolean(c) && !c?.restricted;

  useLayoutEffect(() => {
    navigation.setOptions({
      headerRight: canEdit
        ? () => (
            <Pressable onPress={() => navigation.navigate('CustomerForm', { id })} hitSlop={12} accessibilityRole="button" accessibilityLabel="Edit customer">
              <Text style={styles.headerBtn}>Edit</Text>
            </Pressable>
          )
        : undefined,
    });
  }, [navigation, canEdit, id]);

  /** The follow-up form lives in the Follow-ups tab; `initial: false` keeps that tab's list underneath so Back works. */
  function planFollowUp() {
    if (!c) return;
    navigation.getParent()?.navigate('FollowUps', { screen: 'FollowUpForm', params: { customer: { id: c.id, name: c.name } }, initial: false });
  }

  return (
    <ScrollView style={styles.screen} contentContainerStyle={styles.body} refreshControl={<RefreshControl refreshing={q.isRefetching} onRefresh={() => void q.refetch()} />}>
      {q.isLoading ? <ActivityIndicator color={colors.primary} style={{ padding: space.xl }} /> : null}
      {q.isError ? <ErrorBox message={q.error instanceof ApiError ? q.error.message : 'Could not load this customer.'} /> : null}
      {c ? (
        <>
          <Card>
            <View style={styles.head}>
              <Text style={[text.h1, styles.flex]}>{c.name}</Text>
              <Badge value={c.status} label={enumLabel(c.status)} />
            </View>
            <Text style={text.muted}>
              {c.customerCode}
              {c.tradeName ? ` · ${c.tradeName}` : ''}
            </Text>
            {c.restricted ? <Text style={styles.restricted}>This customer belongs to another sales person, so contact details are hidden.</Text> : null}
            {c.phone ? <ContactActions phone={c.phone} /> : null}
            {hasPermission('followup.manage') && !c.restricted ? (
              <View style={styles.plan}>
                <Button title="Plan Follow-up" variant="secondary" onPress={planFollowUp} />
              </View>
            ) : null}
            {hasPermission('quotation.manage') && hasPermission('product.read') && !c.restricted ? (
              <View style={styles.plan}>
                <Button title="New Quotation" variant="secondary" onPress={() => navigation.getParent()?.navigate('Quotations', { screen: 'QuotationForm', params: { customer: { id: c.id, name: c.name } }, initial: false })} />
              </View>
            ) : null}
          </Card>

          <Card>
            <Text style={[text.h2, styles.section]}>Details</Text>
            <Row label="Mobile" value={c.phone} />
            <Row label="Alt. mobile" value={c.altPhone} />
            <Row label="Email" value={c.email} />
            <Row label="GSTIN" value={c.gstin} />
            <Row label="Type" value={enumLabel(c.type)} />
            <Row label="Stage" value={enumLabel(c.funnelStage)} />
            <Row label="Segment" value={enumLabel(c.businessSegment)} />
            <Row label="Source" value={c.source} />
            <Row label="Sales person" value={c.assignee?.fullName} />
            <Row label="Payment terms" value={c.paymentTerms} />
            <Row label="Credit days" value={c.creditDays} />
          </Card>

          {c.contacts && c.contacts.length > 0 ? (
            <Card>
              <Text style={[text.h2, styles.section]}>Contacts</Text>
              {c.contacts.map((p) => (
                <View key={p.id} style={styles.contact}>
                  <Text style={text.body}>
                    {p.name}
                    {p.isPrimary ? ' (primary)' : ''}
                  </Text>
                  {p.designation ? <Text style={text.muted}>{p.designation}</Text> : null}
                  {p.phone ? <Text style={text.muted}>{p.phone}</Text> : null}
                  {p.email ? <Text style={text.muted}>{p.email}</Text> : null}
                  {p.phone ? <ContactActions phone={p.phone} /> : null}
                </View>
              ))}
            </Card>
          ) : null}

          {c.addresses && c.addresses.length > 0 ? (
            <Card>
              <Text style={[text.h2, styles.section]}>Addresses</Text>
              {c.addresses.map((a, i) => (
                <View key={i} style={styles.contact}>
                  <Text style={styles.addrType}>{enumLabel(a.type)}</Text>
                  <Text style={text.body}>{[a.line1, a.line2, a.city, a.state, a.pincode].filter(Boolean).join(', ')}</Text>
                </View>
              ))}
            </Card>
          ) : null}

          {c.notes ? (
            <Card>
              <Text style={[text.h2, styles.section]}>Notes</Text>
              <Text style={text.body}>{c.notes}</Text>
            </Card>
          ) : null}
        </>
      ) : null}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.bg },
  body: { padding: space.lg },
  flex: { flex: 1 },
  headerBtn: { color: '#ffffff', fontSize: 15, fontWeight: '700' },
  plan: { marginTop: space.sm },
  head: { flexDirection: 'row', alignItems: 'flex-start', gap: space.sm, marginBottom: 2 },
  section: { marginBottom: space.sm },
  restricted: { marginTop: space.sm, fontSize: 13, color: colors.warning },
  actions: { flexDirection: 'row', gap: space.sm, marginTop: space.md },
  action: { flex: 1, minHeight: 44, borderRadius: radius.md, alignItems: 'center', justifyContent: 'center' },
  actionText: { fontSize: 14, fontWeight: '700' },
  contact: { paddingVertical: space.sm, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.border },
  addrType: { fontSize: 12, fontWeight: '700', color: colors.muted, marginBottom: 2 },
});
