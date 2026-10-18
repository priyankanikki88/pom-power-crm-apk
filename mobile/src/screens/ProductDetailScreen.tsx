import { useQuery } from '@tanstack/react-query';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { useState } from 'react';
import { ActivityIndicator, Linking, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { Empty, ErrorBox, Row, text } from '../components/ui';
import { api, ApiError } from '../lib/api';
import { formatDate } from '../lib/dates';
import { enumLabel, formatINR } from '../lib/format';
import type { ProductsStackParams } from '../navigation';
import { colors, radius, space } from '../theme';

interface ProductDocument {
  id: string;
  docType: string;
  fileUrl: string;
  fileName: string;
  uploadedAt: string;
}
interface ProductVariantDetail {
  id: string;
  productCode: string;
  productName: string | null;
  sku: string | null;
  rating: string | null;
  description: string | null;
  warranty: string | null;
  hsnCode: string | null;
  active: boolean;
  updatedAt: string;
  model: { name: string; series: { name: string; productType: { name: string; category: { name: string } } } };
  ratingUnit: { name: string } | null;
  priceHistory: Array<{ price: string; currency: string }>;
  taxAssignments: Array<{ taxRate: { ratePercent: string; hsnCode: string | null } }>;
  documents: ProductDocument[];
  display: { title: string };
}

const errorText = (err: unknown, fallback: string) => (err instanceof ApiError ? err.message : fallback);
type Tab = 'DETAILS' | 'DOCUMENTS';

/** Read-only product detail (Details + Documents) — same /products/:id the web Product Master uses. Editing stays on the web CRM. */
export function ProductDetailScreen({ route }: NativeStackScreenProps<ProductsStackParams, 'ProductDetail'>) {
  const { id } = route.params;
  const q = useQuery({ queryKey: ['products', 'detail', id], queryFn: () => api.get<ProductVariantDetail>(`/products/${id}`) });
  const [tab, setTab] = useState<Tab>('DETAILS');
  const v = q.data;

  if (q.isLoading) return <ActivityIndicator style={{ padding: space.xl }} color={colors.primary} />;
  if (!v) return <View style={styles.body}><ErrorBox message={errorText(q.error, 'Could not load this product.')} /></View>;

  const gst = v.taxAssignments[0]?.taxRate.ratePercent;

  return (
    <ScrollView style={styles.screen} contentContainerStyle={styles.body}>
      <View style={styles.head}>
        <Text style={[text.h1, styles.flex]}>{v.display.title}</Text>
        <View style={[styles.activeBadge, { backgroundColor: v.active ? colors.successSoft : colors.dangerSoft }]}>
          <Text style={[styles.activeText, { color: v.active ? colors.success : colors.danger }]}>{v.active ? 'Active' : 'Inactive'}</Text>
        </View>
      </View>
      <Text style={text.muted}>
        {v.productCode}
        {v.sku ? ` · SKU ${v.sku}` : ''}
      </Text>

      <View style={styles.tabs}>
        {(['DETAILS', 'DOCUMENTS'] as const).map((t) => {
          const active = t === tab;
          return (
            <Pressable key={t} style={[styles.tab, active && styles.tabActive]} onPress={() => setTab(t)} accessibilityRole="tab" accessibilityState={{ selected: active }}>
              <Text style={[styles.tabText, active && styles.tabTextActive]}>{t === 'DETAILS' ? 'Details' : `Documents (${v.documents.length})`}</Text>
            </Pressable>
          );
        })}
      </View>

      {tab === 'DETAILS' ? (
        <View style={styles.card}>
          <Row label="Category" value={v.model.series.productType.category.name} />
          <Row label="Type" value={v.model.series.productType.name} />
          <Row label="Series" value={v.model.series.name} />
          <Row label="Model" value={v.model.name} />
          <Row label="Rating" value={v.rating ? `${v.rating}${v.ratingUnit ? ` ${v.ratingUnit.name}` : ''}` : null} />
          <Row label="Price" value={v.priceHistory[0] ? formatINR(v.priceHistory[0].price) : 'Not set'} />
          <Row label="GST" value={gst ? `${gst}%` : 'Not set'} />
          <Row label="HSN/SAC" value={v.hsnCode} />
          <Row label="Warranty" value={v.warranty} />
          <Row label="Description" value={v.description} />
          <Row label="Last updated" value={formatDate(v.updatedAt)} />
        </View>
      ) : (
        <View style={styles.card}>
          {v.documents.length === 0 ? (
            <Empty title="No documents" />
          ) : (
            v.documents.map((d) => (
              <Pressable key={d.id} style={styles.docRow} onPress={() => void Linking.openURL(d.fileUrl)} accessibilityRole="button">
                <View style={styles.flex}>
                  <Text style={text.body} numberOfLines={1}>
                    {d.fileName}
                  </Text>
                  <Text style={text.muted}>
                    {enumLabel(d.docType)} · {formatDate(d.uploadedAt)}
                  </Text>
                </View>
                <Text style={styles.openLink}>Open</Text>
              </Pressable>
            ))
          )}
        </View>
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.bg },
  body: { padding: space.lg, paddingBottom: space.xl },
  flex: { flex: 1 },
  head: { flexDirection: 'row', alignItems: 'flex-start', gap: space.sm },
  activeBadge: { borderRadius: 999, paddingHorizontal: 10, paddingVertical: 4 },
  activeText: { fontSize: 11.5, fontWeight: '700' },
  tabs: { flexDirection: 'row', gap: space.sm, marginTop: space.lg, marginBottom: space.md },
  tab: { flex: 1, minHeight: 40, borderRadius: radius.md, backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border, alignItems: 'center', justifyContent: 'center' },
  tabActive: { backgroundColor: colors.primary, borderColor: colors.primary },
  tabText: { fontSize: 13, fontWeight: '700', color: colors.text },
  tabTextActive: { color: '#ffffff' },
  card: { backgroundColor: colors.surface, borderRadius: radius.lg, borderWidth: 1, borderColor: colors.border, padding: space.lg },
  docRow: { flexDirection: 'row', alignItems: 'center', gap: space.sm, paddingVertical: space.sm, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.border },
  openLink: { color: colors.primary, fontWeight: '700', fontSize: 13 },
});
