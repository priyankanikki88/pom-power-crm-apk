import { useQuery } from '@tanstack/react-query';
import { useState } from 'react';
import { ActivityIndicator, RefreshControl, ScrollView, StyleSheet, Text } from 'react-native';
import { AuthImage, PhotoAdder } from '../components/photos';
import { Card, Empty, ErrorBox, text } from '../components/ui';
import { api, ApiError } from '../lib/api';
import { colors, space } from '../theme';

interface Branch {
  id: string;
  code: string;
  name: string;
  active: boolean;
}

function BranchStamp({ b }: { b: Branch }) {
  // A new upload replaces the stamp, so each one gets its own cache file — otherwise the old cached image would show.
  const [version, setVersion] = useState(() => Date.now());
  return (
    <Card>
      <Text style={styles.name}>
        {b.name} <Text style={text.muted}>({b.code})</Text>
      </Text>
      <AuthImage key={version} path={`/branches/${b.id}/stamp/image`} cacheName={`branch-stamp-${b.id}-${version}`} contain missing="No stamp uploaded yet" />
      <PhotoAdder uploadPath={`/branches/${b.id}/stamp`} onUploaded={() => setVersion(Date.now())} />
    </Card>
  );
}

/** Admin → Branch Stamps (branch.manage): each branch's stamp, printed on the official PDFs of documents filed under it. */
export function BranchStampsScreen() {
  const q = useQuery({ queryKey: ['branches', 'all'], queryFn: () => api.get<Branch[]>('/branches', { all: 'true' }) });
  const branches = (q.data ?? []).filter((b) => b.active);

  return (
    <ScrollView style={styles.screen} contentContainerStyle={styles.body} refreshControl={<RefreshControl refreshing={q.isRefetching} onRefresh={() => void q.refetch()} />}>
      <Text style={[text.muted, styles.intro]}>
        Photograph or pick a clear scan of the branch&apos;s stamp on white paper. New documents of the branch print it; documents already printed keep their old stamp.
      </Text>
      {q.isLoading ? <ActivityIndicator color={colors.primary} style={styles.loading} /> : null}
      {q.isError ? <ErrorBox message={q.error instanceof ApiError ? q.error.message : 'Could not load the branches.'} /> : null}
      {q.data && branches.length === 0 ? <Empty title="No branches yet" hint="Add branches on the website first (Administration → Branches)." /> : null}
      {branches.map((b) => (
        <BranchStamp key={b.id} b={b} />
      ))}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.bg },
  body: { padding: space.lg, paddingBottom: space.xl },
  loading: { padding: space.lg },
  intro: { marginBottom: space.md },
  name: { fontSize: 15, fontWeight: '700', color: colors.text, marginBottom: space.sm },
});
