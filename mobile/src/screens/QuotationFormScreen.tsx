import { useQuery, useQueryClient } from '@tanstack/react-query';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Switch, Text, TextInput, View } from 'react-native';
import { useAuth } from '../auth/AuthContext';
import { CustomerPicker, type PickedCustomer } from '../components/CustomerPicker';
import { ChipSelect, DateField, Segmented } from '../components/inputs';
import { newPaymentDraft, paymentAmount, paymentBody, PaymentFields, type PaymentDraft } from '../components/PaymentSection';
import { Button, Card, ErrorBox, Field, text } from '../components/ui';
import { api, ApiError } from '../lib/api';
import { dayFromIso, isoDay } from '../lib/dates';
import { formatINR } from '../lib/format';
import { AMC_TYPES, amcDraftError, amcPayload, EMPTY_AMC, manageableTypes, oneYearFrom, type AmcDraft, type SalesType } from '../lib/sales';
import type { QuotationsStackParams } from '../navigation';
import { colors, radius, space } from '../theme';
import type { Paginated, ProductVariant, QuotationDetail, SalesDoc } from '../types';

type Mode = 'QUOTATION' | 'PROFORMA' | 'FORMAT4';

interface Line {
  key: string;
  variantId: string;
  title: string;
  code: string;
  /** The price used when nothing is typed: the product master's for a new line, the saved price for a line being edited. */
  basePrice: number;
  qty: string;
  discountPct: string;
  /** Only editable with the price-override permission; blank = keep `basePrice`. */
  unitPrice: string;
  /** Set on a line that already exists on the quotation being edited, with what was saved. */
  saved?: { itemId: string; qty: number; discountPct: number };
}

const AMC_TYPE_OPTIONS = AMC_TYPES.map((t) => ({ value: t, label: t }));
const masterPrice = (v: ProductVariant) => Number(v.priceHistory[0]?.price ?? 0);
const variantTitle = (v: ProductVariant) => `${v.productName ?? v.model.name}${v.rating ? ` · ${v.rating}` : ''}`;
const num = (s: string) => {
  const n = Number(s.replace(/,/g, ''));
  return Number.isFinite(n) ? n : NaN;
};
const errorText = (err: unknown, fallback: string) => (err instanceof ApiError ? err.message : fallback);

const TITLE: Record<Mode, string> = { QUOTATION: 'New Quotation', PROFORMA: 'Direct Proforma', FORMAT4: 'Direct / Paid Format-4' };
const INTRO: Record<Mode, string | null> = {
  QUOTATION: null,
  PROFORMA: 'For a customer who asks for a proforma invoice without a quotation. It is saved as a draft and then submitted for approval.',
  FORMAT4: 'For a customer who has already paid and needs only a Format-4 — no quotation or proforma is made. It goes for approval like every Format-4.',
};

/**
 * One form for every sales document the app makes: a quotation, a direct proforma invoice, a direct / paid Format-4 — each
 * as product sales or as an AMC — and editing a quotation that is still a draft. Prices and GST come from the product
 * master on the server (the exact totals are the server's, shown after saving); a different price can be typed only by a
 * role that holds the price-override permission.
 */
export function QuotationFormScreen({ route, navigation }: NativeStackScreenProps<QuotationsStackParams, 'QuotationForm'>) {
  const mode: Mode = route.params?.mode ?? 'QUOTATION';
  const editId = route.params?.editId;
  const { hasPermission } = useAuth();
  const canOverridePrice = hasPermission('quotation.price.override');
  const canRecordPayment = mode === 'FORMAT4' && hasPermission('payment.manage');
  const qc = useQueryClient();

  const types = manageableTypes(hasPermission, mode === 'QUOTATION' ? 'quotation' : mode === 'PROFORMA' ? 'proforma' : 'format4');
  const [salesType, setSalesType] = useState<SalesType>(route.params?.salesType ?? types[0] ?? 'PRODUCT');
  const isAmc = salesType === 'AMC';
  const [amc, setAmc] = useState<AmcDraft>(EMPTY_AMC);
  const [isProject, setIsProject] = useState(false);
  const [projectName, setProjectName] = useState('');
  const [customer, setCustomer] = useState<PickedCustomer | null>(route.params?.customer ?? null);
  const [lines, setLines] = useState<Line[]>([]);
  const [subject, setSubject] = useState('');
  const [notes, setNotes] = useState('');
  const [validUntil, setValidUntil] = useState<Date | null>(null);
  const [payment, setPayment] = useState<PaymentDraft>(newPaymentDraft);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  // Editing: load the quotation once and fill the form from it (again after a save that failed part-way).
  const existing = useQuery({ queryKey: ['quotation', editId], queryFn: () => api.get<QuotationDetail>(`/quotations/${editId}`), enabled: Boolean(editId) });
  const filledFrom = useRef<QuotationDetail | null>(null);
  useEffect(() => {
    const q = existing.data;
    if (!q || filledFrom.current === q) return;
    filledFrom.current = q;
    setCustomer({ id: q.customer.id, name: q.customer.name });
    setSalesType(q.salesType === 'AMC' ? 'AMC' : 'PRODUCT');
    setAmc({ amcType: q.amcType ?? '', start: dayFromIso(q.amcStartDate), end: dayFromIso(q.amcEndDate), siteAddress: q.siteAddress ?? '', amcRemarks: q.amcRemarks ?? '', amcTerms: q.amcTerms ?? '' });
    setIsProject(Boolean(q.isProject));
    setProjectName(q.projectName ?? '');
    setSubject(q.subject ?? '');
    setNotes(q.notes ?? '');
    setValidUntil(dayFromIso(q.validUntil));
    setLines(
      q.items.map((it) => ({
        key: `item-${it.id}`,
        variantId: it.productVariantId ?? '',
        title: `${it.productNameSnapshot || it.descriptionSnapshot}${it.ratingSnapshot ? ` · ${it.ratingSnapshot}` : ''}`,
        code: it.productCodeSnapshot ?? '',
        basePrice: Number(it.unitPriceSnapshot),
        qty: String(Number(it.qty)),
        discountPct: Number(it.discountPct) > 0 ? String(Number(it.discountPct)) : '',
        unitPrice: '',
        saved: { itemId: it.id, qty: Number(it.qty), discountPct: Number(it.discountPct) },
      })),
    );
  }, [existing.data]);

  useLayoutEffect(() => {
    navigation.setOptions({ title: editId ? 'Edit Quotation' : `${isAmc && mode === 'QUOTATION' ? 'New AMC Quotation' : TITLE[mode]}${isAmc && mode !== 'QUOTATION' ? ' (AMC)' : ''}` });
  }, [navigation, editId, isAmc, mode]);

  const [input, setInput] = useState('');
  const [search, setSearch] = useState('');
  useEffect(() => {
    const t = setTimeout(() => setSearch(input.trim()), 350);
    return () => clearTimeout(t);
  }, [input]);
  const products = useQuery({
    queryKey: ['products', 'picker', search],
    queryFn: () => api.get<Paginated<ProductVariant>>('/products', { search, active: 'true', pageSize: 8 }),
    enabled: search.length >= 2,
  });

  const setLine = (key: string, patch: Partial<Line>) => setLines((ls) => ls.map((l) => (l.key === key ? { ...l, ...patch } : l)));
  function addProduct(v: ProductVariant) {
    setLines((ls) => (ls.some((l) => l.variantId === v.id) ? ls : [...ls, { key: `new-${v.id}`, variantId: v.id, title: variantTitle(v), code: v.productCode, basePrice: masterPrice(v), qty: '1', discountPct: '', unitPrice: '' }]));
    setInput('');
    setSearch('');
  }

  // An estimate before GST, only to help while typing — the saved document carries the server's own totals.
  const estimate = lines.reduce((sum, l) => {
    const price = l.unitPrice.trim() ? num(l.unitPrice) : l.basePrice;
    const qty = num(l.qty);
    const disc = l.discountPct.trim() ? num(l.discountPct) : 0;
    return Number.isFinite(price) && Number.isFinite(qty) && Number.isFinite(disc) ? sum + price * qty * (1 - disc / 100) : sum;
  }, 0);

  const itemInput = (l: Line) => ({
    productVariantId: l.variantId,
    qty: num(l.qty),
    ...(l.discountPct.trim() ? { discountPct: num(l.discountPct) } : {}),
    ...(canOverridePrice && l.unitPrice.trim() ? { unitPrice: num(l.unitPrice) } : {}),
  });
  // A project order is a product sale marked as one (bulk / tender / plant); an AMC is never a project.
  // Sent only when it matters (marked, or un-marking while editing), so an older server is never given a field it does not know.
  const projectFields = () => (isAmc || (!isProject && !editId) ? {} : { isProject, ...(isProject ? { projectName: projectName.trim() } : {}) });
  const typeFields = () => ({ salesType, ...(isAmc ? amcPayload(amc) : projectFields()) });

  /** A new document. For a direct Format-4 the payment already received is recorded straight after, when one was typed. */
  async function create() {
    const items = lines.map(itemInput);
    if (mode === 'QUOTATION') {
      const q = await api.post<QuotationDetail>('/quotations', { customerId: customer!.id, subject: subject.trim() || undefined, notes: notes.trim() || undefined, validUntil: validUntil ? isoDay(validUntil) : undefined, items, ...typeFields() });
      void qc.invalidateQueries({ queryKey: ['quotations'] });
      navigation.replace('QuotationDetail', { id: q.id, no: q.quotationNo });
      return;
    }
    if (mode === 'PROFORMA') {
      const pi = await api.post<SalesDoc>('/proforma-invoices/direct', { customerId: customer!.id, items, validUntil: validUntil ? isoDay(validUntil) : undefined, ...typeFields() });
      void qc.invalidateQueries({ queryKey: ['sales-docs'] });
      navigation.replace('DocDetail', { kind: 'PROFORMA', id: pi.id, no: pi.proformaNo ?? '' });
      return;
    }
    const f4 = await api.post<SalesDoc>('/format4/direct-paid', { customerId: customer!.id, items, ...typeFields() });
    void qc.invalidateQueries({ queryKey: ['sales-docs'] });
    const amount = canRecordPayment ? paymentAmount(payment) : null;
    let notice: string | undefined;
    if (amount !== null) {
      try {
        await api.post('/payments', { customerId: customer!.id, format4DocumentId: f4.id, ...paymentBody(payment, amount) });
      } catch (err) {
        // The Format-4 exists; the payment can be recorded again from its page.
        notice = `The Format-4 was created, but the payment was not recorded: ${errorText(err, 'unknown error')}. Record it below.`;
      }
    }
    navigation.replace('DocDetail', { kind: 'FORMAT4', id: f4.id, no: f4.format4No ?? '', notice });
  }

  /** Saves the changes to a draft quotation: its header, then new lines, changed lines and removed lines, one request each. */
  async function saveEdit(q: QuotationDetail) {
    await api.patch(`/quotations/${q.id}`, { subject: subject.trim(), notes: notes.trim(), ...(validUntil ? { validUntil: isoDay(validUntil) } : {}), ...(isAmc ? amcPayload(amc) : projectFields()) });
    // New lines first: the server never lets a quotation drop to no lines, so removals come last.
    for (const l of lines.filter((x) => !x.saved)) await api.post(`/quotations/${q.id}/items`, itemInput(l));
    for (const l of lines) {
      if (!l.saved) continue;
      const qty = num(l.qty);
      const discountPct = l.discountPct.trim() ? num(l.discountPct) : 0;
      const changes = {
        ...(qty !== l.saved.qty ? { qty } : {}),
        ...(discountPct !== l.saved.discountPct ? { discountPct } : {}),
        ...(canOverridePrice && l.unitPrice.trim() && num(l.unitPrice) !== l.basePrice ? { unitPrice: num(l.unitPrice) } : {}),
      };
      if (Object.keys(changes).length > 0) await api.patch(`/quotations/${q.id}/items/${l.saved.itemId}`, changes);
    }
    const kept = new Set(lines.map((l) => l.saved?.itemId));
    for (const it of q.items) if (!kept.has(it.id)) await api.delete(`/quotations/${q.id}/items/${it.id}`);
    void qc.invalidateQueries({ queryKey: ['quotations'] });
    await qc.invalidateQueries({ queryKey: ['quotation', q.id] });
    navigation.goBack();
  }

  function submit() {
    if (!customer) return setError('Choose the customer.');
    if (lines.length === 0) return setError(isAmc ? 'Add the equipment covered (at least one line).' : 'Add at least one product.');
    const amcError = isAmc ? amcDraftError(amc) : null;
    if (amcError) return setError(amcError);
    for (const l of lines) {
      if (!(num(l.qty) > 0)) return setError(`${l.title}: enter a quantity above 0.`);
      if (l.discountPct.trim() && !(num(l.discountPct) >= 0 && num(l.discountPct) <= 100)) return setError(`${l.title}: discount must be between 0 and 100%.`);
      if (l.unitPrice.trim() && !(num(l.unitPrice) >= 0)) return setError(`${l.title}: enter a valid price.`);
    }
    if (canRecordPayment && payment.amount.trim() && paymentAmount(payment) === null) return setError('Payment received: enter a valid amount, or leave it empty.');
    setError(null);
    setSaving(true);
    const q = existing.data;
    (editId && q ? saveEdit(q) : create())
      .catch((err) => {
        if (editId) {
          // Each change is its own request, so the ones before the failure are already saved: show the quotation as it now is.
          setError(`${errorText(err, 'Could not save.')} Changes made before this one were saved — the form now shows the quotation as it is.`);
          void existing.refetch();
        } else {
          setError(errorText(err, 'Could not save.'));
        }
      })
      .finally(() => setSaving(false));
  }

  if (editId && !existing.data) {
    return (
      <View style={[styles.screen, styles.body]}>
        {existing.isError ? <ErrorBox message={errorText(existing.error, 'Could not load this quotation.')} /> : <ActivityIndicator color={colors.primary} style={{ padding: space.xl }} />}
      </View>
    );
  }
  if (editId && existing.data && existing.data.status !== 'DRAFT') {
    return (
      <View style={[styles.screen, styles.body]}>
        <ErrorBox message="Only a draft quotation can be edited. Go back and use “Revise” to make a new draft copy of this one." />
      </View>
    );
  }

  return (
    <ScrollView style={styles.screen} contentContainerStyle={styles.body} keyboardShouldPersistTaps="handled">
      {!editId && types.length > 1 ? (
        <View style={styles.typeRow}>
          <Segmented
            value={salesType}
            options={[
              { value: 'PRODUCT' as const, label: 'Product Sales' },
              { value: 'AMC' as const, label: 'AMC (Annual Maintenance)' },
            ]}
            onChange={setSalesType}
          />
        </View>
      ) : null}

      <Card>
        {error ? <ErrorBox message={error} /> : null}
        {!editId && INTRO[mode] ? <Text style={[text.muted, styles.intro]}>{INTRO[mode]}</Text> : null}
        <CustomerPicker value={customer} onChange={setCustomer} locked={Boolean(editId) || Boolean(route.params?.customer)} />
        {mode === 'QUOTATION' ? <Field label="Subject (heading printed on the quotation)" value={subject} onChangeText={setSubject} maxLength={200} /> : null}
        {mode !== 'FORMAT4' ? <DateField label="Valid until (optional)" value={validUntil} onChange={setValidUntil} minimumDate={new Date()} allowClear={!editId} /> : null}
      </Card>

      {isAmc ? (
        <Card>
          <Text style={[text.h2, styles.section]}>AMC details</Text>
          <ChipSelect label="AMC type *" value={amc.amcType || null} options={AMC_TYPE_OPTIONS} onChange={(v) => v && setAmc((a) => ({ ...a, amcType: v }))} />
          <DateField label="Start date *" value={amc.start} onChange={(start) => start && setAmc((a) => ({ ...a, start, end: a.end ?? oneYearFrom(start) }))} />
          <DateField label="End date *" value={amc.end} minimumDate={amc.start ?? undefined} onChange={(end) => end && setAmc((a) => ({ ...a, end }))} />
          <Field label="Site address (blank = same as billing)" value={amc.siteAddress} onChangeText={(siteAddress) => setAmc((a) => ({ ...a, siteAddress }))} multiline maxLength={2000} />
          <Field label="Scope / remarks (visits, coverage, exclusions)" value={amc.amcRemarks} onChangeText={(amcRemarks) => setAmc((a) => ({ ...a, amcRemarks }))} multiline maxLength={4000} />
          <Field label="AMC terms & conditions — one per line" value={amc.amcTerms} onChangeText={(amcTerms) => setAmc((a) => ({ ...a, amcTerms }))} multiline maxLength={10000} />
          <Text style={text.muted}>The proforma and Format-4 made from this AMC follow these terms unchanged.</Text>
        </Card>
      ) : null}

      {!isAmc ? (
        <Card>
          <View style={styles.switchRow}>
            <Text style={[text.body, styles.flex]}>Project order (bulk / tender / large commercial order, or a complete plant)</Text>
            <Switch value={isProject} onValueChange={setIsProject} accessibilityLabel="Project order" />
          </View>
          {isProject ? <Field label="Project / tender name (optional)" value={projectName} onChangeText={setProjectName} maxLength={200} /> : null}
        </Card>
      ) : null}

      <Card>
        <Text style={[text.h2, styles.section]}>
          {isAmc ? 'Equipment covered & AMC charge' : 'Products'} ({lines.length})
        </Text>
        {lines.map((l) => (
          <View key={l.key} style={styles.line}>
            <View style={styles.lineHead}>
              <Text style={[text.body, styles.flex]}>{l.title}</Text>
              <Pressable onPress={() => setLines((ls) => ls.filter((x) => x.key !== l.key))} hitSlop={10} accessibilityRole="button" accessibilityLabel={`Remove ${l.title}`}>
                <Text style={styles.remove}>Remove</Text>
              </Pressable>
            </View>
            <Text style={text.muted}>
              {l.code ? `${l.code} · ` : ''}
              {l.saved ? `Saved price ${formatINR(l.basePrice)}` : l.basePrice > 0 ? `List price ${formatINR(l.basePrice)}` : 'No list price set'}
            </Text>
            <View style={styles.lineInputs}>
              <View style={styles.small}>
                <Text style={styles.label}>Qty *</Text>
                <TextInput style={styles.input} value={l.qty} onChangeText={(v) => setLine(l.key, { qty: v })} keyboardType="decimal-pad" accessibilityLabel="Quantity" />
              </View>
              <View style={styles.small}>
                <Text style={styles.label}>Discount %</Text>
                <TextInput style={styles.input} value={l.discountPct} onChangeText={(v) => setLine(l.key, { discountPct: v })} keyboardType="decimal-pad" accessibilityLabel="Discount percent" />
              </View>
              {canOverridePrice ? (
                <View style={styles.flex}>
                  <Text style={styles.label}>{isAmc ? 'Charge (₹)' : 'Price (₹)'}</Text>
                  <TextInput style={styles.input} value={l.unitPrice} onChangeText={(v) => setLine(l.key, { unitPrice: v })} keyboardType="decimal-pad" placeholder={l.saved ? 'Saved price' : 'List price'} placeholderTextColor={colors.muted} accessibilityLabel="Unit price" />
                </View>
              ) : null}
            </View>
          </View>
        ))}
        <Field label={`Add ${isAmc ? 'equipment' : 'a product'} (type at least 2 letters)`} value={input} onChangeText={setInput} autoCapitalize="none" autoCorrect={false} placeholder="Name, code, rating…" />
        {products.data?.items.map((v) => (
          <Pressable key={v.id} style={styles.result} onPress={() => addProduct(v)} accessibilityRole="button">
            <Text style={text.body}>{variantTitle(v)}</Text>
            <Text style={text.muted}>
              {v.productCode}
              {masterPrice(v) > 0 ? ` · ${formatINR(masterPrice(v))}` : ''}
            </Text>
          </Pressable>
        ))}
        {products.data && products.data.items.length === 0 ? <Text style={text.muted}>No product matches.</Text> : null}
      </Card>

      {canRecordPayment ? (
        <Card>
          <Text style={[text.h2, styles.section]}>Payment received (optional)</Text>
          <Text style={[text.muted, styles.intro]}>What the customer has paid, so the Format-4 shows it as the advance received. Leave the amount empty to record it later.</Text>
          <PaymentFields value={payment} onChange={setPayment} amountLabel="Amount received (₹)" />
        </Card>
      ) : null}

      <Card>
        {mode === 'QUOTATION' ? <Field label="Notes" value={notes} onChangeText={setNotes} multiline /> : null}
        {lines.length > 0 ? <Text style={[text.muted, styles.estimate]}>About {formatINR(estimate)} before GST. The exact total is calculated when you save.</Text> : null}
        <Button title={editId ? 'Save Changes' : mode === 'QUOTATION' ? 'Save Quotation (Draft)' : mode === 'PROFORMA' ? 'Save Proforma (Draft)' : 'Create Format-4'} onPress={submit} loading={saving} />
      </Card>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.bg },
  body: { padding: space.lg },
  flex: { flex: 1 },
  typeRow: { marginHorizontal: -space.lg, marginTop: -space.sm, marginBottom: space.xs },
  intro: { marginBottom: space.md },
  section: { marginBottom: space.sm },
  line: { paddingVertical: space.md, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.border, marginBottom: space.sm },
  lineHead: { flexDirection: 'row', alignItems: 'flex-start', gap: space.sm },
  remove: { color: colors.danger, fontWeight: '700', fontSize: 13 },
  lineInputs: { flexDirection: 'row', gap: space.sm, marginTop: space.sm },
  small: { width: 92 },
  label: { fontSize: 12, fontWeight: '600', color: colors.muted, marginBottom: 2 },
  input: { minHeight: 44, borderWidth: 1, borderColor: colors.border, borderRadius: radius.md, paddingHorizontal: space.md, fontSize: 15, color: colors.text, backgroundColor: colors.surface },
  result: { padding: space.md, borderWidth: 1, borderColor: colors.border, borderRadius: radius.md, marginBottom: space.sm, backgroundColor: colors.surface },
  estimate: { marginBottom: space.md },
  switchRow: { flexDirection: 'row', alignItems: 'center', gap: space.md, marginBottom: space.sm },
});
