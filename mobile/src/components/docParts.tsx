import * as Sharing from 'expo-sharing';
import { useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { ApiError, downloadToCache } from '../lib/api';
import { formatDate } from '../lib/dates';
import { formatINR } from '../lib/format';
import { colors, space } from '../theme';
import type { AmcFields, QuotationItem } from '../types';
import { Button, Card, ErrorBox, Row, text } from './ui';

export const STATUS_TONE: Record<string, string> = {
  DRAFT: colors.muted,
  PENDING: colors.warning,
  APPROVAL_PENDING: colors.warning,
  SENT: colors.primaryDark,
  APPROVED: colors.success,
  FINAL: colors.success,
  REJECTED: colors.danger,
  CANCELLED: colors.danger,
  EXPIRED: colors.warning,
};

/** Downloads the document's official PDF with the user's token and hands it to Android's share sheet (open / WhatsApp / save). */
export function PdfButton({ path, fileName, title }: { path: string; fileName: string; title: string }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function open() {
    setError(null);
    setBusy(true);
    try {
      const uri = await downloadToCache(path, `${fileName.replace(/[^A-Za-z0-9._-]+/g, '-')}.pdf`);
      if (!(await Sharing.isAvailableAsync())) throw new ApiError(0, 'This phone cannot open or share files from the app.');
      await Sharing.shareAsync(uri, { mimeType: 'application/pdf', dialogTitle: title });
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Could not open the PDF.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <View style={styles.gap}>
      {error ? <ErrorBox message={error} /> : null}
      <Button title="Open / Share PDF" onPress={() => void open()} loading={busy} />
    </View>
  );
}

/** The AMC block of an AMC document: type, period, site, scope and its own terms. Nothing on a product document. */
export function AmcCard({ doc }: { doc: AmcFields }) {
  if (doc.salesType !== 'AMC') return null;
  const terms = (doc.amcTerms ?? '').split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
  return (
    <Card>
      <Text style={[text.h2, styles.section]}>AMC details</Text>
      <Row label="AMC type" value={doc.amcType} />
      <Row label="Period" value={doc.amcStartDate && doc.amcEndDate ? `${formatDate(doc.amcStartDate)} – ${formatDate(doc.amcEndDate)}` : null} />
      <Row label="Site address" value={doc.siteAddress ?? 'Same as billing address'} />
      <Row label="Scope / remarks" value={doc.amcRemarks} />
      {terms.length > 0 ? (
        <View style={styles.gap}>
          <Text style={text.muted}>AMC terms &amp; conditions</Text>
          {terms.map((t, i) => (
            <Text key={i} style={[text.body, styles.term]}>
              {i + 1}. {t}
            </Text>
          ))}
        </View>
      ) : null}
    </Card>
  );
}

export function ItemsCard({ items, title = 'Items' }: { items: QuotationItem[]; title?: string }) {
  return (
    <Card>
      <Text style={[text.h2, styles.section]}>
        {title} ({items.length})
      </Text>
      {items.map((it, i) => (
        <View key={it.id} style={styles.item}>
          <Text style={text.body}>
            {i + 1}. {it.productNameSnapshot || it.descriptionSnapshot}
            {it.ratingSnapshot ? ` · ${it.ratingSnapshot}` : ''}
          </Text>
          <View style={styles.itemRow}>
            <Text style={[text.muted, styles.flex]}>
              {Number(it.qty).toLocaleString('en-IN')} × {formatINR(it.unitPriceSnapshot)}
              {Number(it.discountPct) > 0 ? ` · ${Number(it.discountPct)}% off` : ''} · GST {Number(it.gstRateSnapshot)}%
            </Text>
            <Text style={styles.lineTotal}>{formatINR(it.lineTotal)}</Text>
          </View>
        </View>
      ))}
    </Card>
  );
}

export function TotalsCard({ subtotal, discountTotal, taxTotal, grandTotal }: { subtotal: string; discountTotal?: string; taxTotal: string; grandTotal: string }) {
  return (
    <Card>
      <Row label="Subtotal" value={formatINR(subtotal)} />
      {discountTotal && Number(discountTotal) > 0 ? <Row label="Discount" value={`− ${formatINR(discountTotal)}`} /> : null}
      <Row label="GST" value={formatINR(taxTotal)} />
      <View style={styles.total}>
        <Text style={text.h2}>Grand Total</Text>
        <Text style={text.h1}>{formatINR(grandTotal)}</Text>
      </View>
    </Card>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  gap: { marginTop: space.md },
  section: { marginBottom: space.sm },
  term: { marginTop: space.xs },
  item: { paddingVertical: space.sm, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.border },
  itemRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-end', gap: space.sm, marginTop: 2 },
  lineTotal: { fontSize: 14, fontWeight: '700', color: colors.text },
  total: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: space.md },
});
