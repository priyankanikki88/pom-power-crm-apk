import { useQuery } from '@tanstack/react-query';
import { ActivityIndicator, RefreshControl, ScrollView, StyleSheet, Text } from 'react-native';
import { Card, Empty, Row, text } from '../components/ui';
import { api } from '../lib/api';
import { colors, space } from '../theme';

const CATEGORY_LABEL: Record<string, string> = { LAPTOP: 'Laptop', MOBILE_PHONE: 'Mobile Phone', SIM_CARD: 'SIM Card', VEHICLE: 'Vehicle', TOOL: 'Tool', FURNITURE: 'Furniture', OTHER: 'Other' };

interface MyAsset {
  id: string;
  assignedAt: string;
  asset: { id: string; assetCode: string; category: string; name: string; serialNo: string | null };
}

/** What's currently issued to me — adding/editing assets and issuing/returning them stays on the web CRM. */
export function MyAssetsScreen() {
  const assets = useQuery({ queryKey: ['assets', 'me'], queryFn: () => api.get<MyAsset[]>('/assets/me') });
  const rows = assets.data ?? [];

  return (
    <ScrollView style={styles.screen} contentContainerStyle={styles.body} refreshControl={<RefreshControl refreshing={assets.isRefetching} onRefresh={() => void assets.refetch()} />}>
      {assets.isLoading ? <ActivityIndicator color={colors.primary} style={styles.loading} /> : null}
      {!assets.isLoading && rows.length === 0 ? <Empty title="Nothing issued to you" /> : null}
      {rows.map((r) => (
        <Card key={r.id}>
          <Text style={text.h2}>{r.asset.name}</Text>
          <Row label="Code" value={r.asset.assetCode} />
          <Row label="Category" value={CATEGORY_LABEL[r.asset.category] ?? r.asset.category} />
          {r.asset.serialNo ? <Row label="Serial No." value={r.asset.serialNo} /> : null}
          <Row label="Since" value={new Date(r.assignedAt).toLocaleDateString('en-IN')} />
        </Card>
      ))}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.bg },
  body: { padding: space.lg, paddingBottom: space.xl },
  loading: { padding: space.lg },
});
