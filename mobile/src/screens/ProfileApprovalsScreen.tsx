import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { ActivityIndicator, Pressable, RefreshControl, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useAuth } from '../auth/AuthContext';
import { AuthImage } from '../components/photos';
import { ReasonAction } from '../components/ReasonAction';
import { Badge, Button, Card, Empty, ErrorBox, text } from '../components/ui';
import { api, ApiError } from '../lib/api';
import { colors, radius, space } from '../theme';
import { PROFILE_FIELDS, showField, type ProfileDetails } from './ProfileScreens';

interface Change {
  id: string;
  userId: string;
  proposedJson: Partial<ProfileDetails>;
  reason: string | null;
  submittedAt: string;
  user: { id: string; fullName: string; profileDetails: ProfileDetails | null };
}
interface Signature {
  id: string;
  uploadedAt: string;
  user: { fullName: string };
}

const errorText = (err: unknown, fallback: string) => (err instanceof ApiError ? err.message : fallback);
const when = (iso: string) => new Date(iso).toLocaleString('en-IN', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' });

function ChangeCard({ c, own }: { c: Change; own: boolean }) {
  const qc = useQueryClient();
  const [error, setError] = useState<string | null>(null);
  const decide = useMutation({
    mutationFn: (body: { decision: 'APPROVED' | 'REJECTED'; remarks?: string }) => api.post(`/employee-profile/changes/${c.id}/decide`, body),
    onSuccess: () => void qc.invalidateQueries({ queryKey: ['employee-profile'] }),
    onError: (err) => setError(errorText(err, 'Could not save the decision.')),
  });

  return (
    <Card>
      <View style={styles.head}>
        <Text style={styles.name}>{c.user.fullName}</Text>
        <Badge value="PENDING" label="Pending" />
      </View>
      <Text style={text.muted}>Sent {when(c.submittedAt)}</Text>
      {PROFILE_FIELDS.filter((f) => f.key in c.proposedJson).map((f) => (
        <View key={f.key} style={styles.diff}>
          <Text style={styles.label}>{f.label}</Text>
          <Text style={styles.old}>{showField(f.key, c.user.profileDetails?.[f.key])}</Text>
          <Text style={styles.new}>→ {showField(f.key, c.proposedJson[f.key])}</Text>
        </View>
      ))}
      {c.reason ? <Text style={[text.muted, styles.gap]}>Note: {c.reason}</Text> : null}
      {error ? <ErrorBox message={error} /> : null}
      {own ? (
        <Text style={[text.muted, styles.gap]}>This is your own change — another reviewer decides it.</Text>
      ) : (
        <View style={styles.actions}>
          <Button title="Approve" loading={decide.isPending} onPress={() => decide.mutate({ decision: 'APPROVED' })} />
          <ReasonAction title="Reject" label="Why? (the employee sees this)" confirmTitle="Reject change" danger busy={decide.isPending} onSubmit={(remarks) => decide.mutate({ decision: 'REJECTED', remarks })} />
        </View>
      )}
    </Card>
  );
}

function SignatureCard({ s }: { s: Signature }) {
  const qc = useQueryClient();
  const [error, setError] = useState<string | null>(null);
  const decide = useMutation({
    mutationFn: (decision: 'APPROVED' | 'REJECTED') => api.post(`/employee-profile/signatures/${s.id}/decide`, { decision }),
    onSuccess: () => void qc.invalidateQueries({ queryKey: ['employee-profile'] }),
    onError: (err) => setError(errorText(err, 'Could not save the decision.')),
  });

  return (
    <Card>
      <View style={styles.head}>
        <Text style={styles.name}>{s.user.fullName}</Text>
        <Badge value="PENDING" label="Pending" />
      </View>
      <Text style={[text.muted, styles.gap]}>Uploaded {when(s.uploadedAt)}</Text>
      <AuthImage path={`/employee-profile/signatures/${s.id}/image`} cacheName={`signature-review-${s.id}`} contain />
      {error ? <ErrorBox message={error} /> : null}
      <View style={styles.actions}>
        <Button title="Verify" loading={decide.isPending} onPress={() => decide.mutate('APPROVED')} />
        <Button title="Reject" variant="danger" disabled={decide.isPending} onPress={() => decide.mutate('REJECTED')} />
      </View>
    </Card>
  );
}

/** HR → Profile Approvals: employees' detail changes and new signatures waiting for HR (employee.profile.review). */
export function ProfileApprovalsScreen() {
  const { user } = useAuth();
  const [tab, setTab] = useState<'changes' | 'signatures'>('changes');
  const changes = useQuery({ queryKey: ['employee-profile', 'changes', 'SUBMITTED'], queryFn: () => api.get<Change[]>('/employee-profile/changes', { status: 'SUBMITTED' }) });
  const signatures = useQuery({ queryKey: ['employee-profile', 'signatures', 'SUBMITTED'], queryFn: () => api.get<Signature[]>('/employee-profile/signatures', { status: 'SUBMITTED' }) });
  const q = tab === 'changes' ? changes : signatures;

  return (
    <ScrollView style={styles.screen} contentContainerStyle={styles.body} refreshControl={<RefreshControl refreshing={q.isRefetching} onRefresh={() => void q.refetch()} />}>
      <View style={styles.tabs}>
        {(
          [
            ['changes', `Detail changes (${changes.data?.length ?? 0})`],
            ['signatures', `Signatures (${signatures.data?.length ?? 0})`],
          ] as const
        ).map(([id, label]) => (
          <Pressable key={id} style={[styles.tab, tab === id && styles.tabOn]} onPress={() => setTab(id)} accessibilityRole="tab" accessibilityState={{ selected: tab === id }}>
            <Text style={[styles.tabText, tab === id && styles.tabTextOn]}>{label}</Text>
          </Pressable>
        ))}
      </View>
      {q.isLoading ? <ActivityIndicator color={colors.primary} style={styles.loading} /> : null}
      {q.isError ? <ErrorBox message={errorText(q.error, 'Could not load the approvals.')} /> : null}
      {tab === 'changes' ? (
        <>
          {changes.data && changes.data.length === 0 ? <Empty title="No profile change waiting" /> : null}
          {changes.data?.map((c) => <ChangeCard key={c.id} c={c} own={c.userId === user?.id} />)}
        </>
      ) : (
        <>
          {signatures.data && signatures.data.length === 0 ? <Empty title="No signature waiting" hint="A verified signature prints on the employee's new quotations, proformas and Format-4s." /> : null}
          {signatures.data?.map((s) => <SignatureCard key={s.id} s={s} />)}
        </>
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.bg },
  body: { padding: space.lg, paddingBottom: space.xl },
  loading: { padding: space.lg },
  tabs: { flexDirection: 'row', gap: space.sm, marginBottom: space.md },
  tab: { flex: 1, paddingVertical: space.sm, borderRadius: radius.md, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.surface, alignItems: 'center' },
  tabOn: { backgroundColor: colors.primary, borderColor: colors.primary },
  tabText: { fontSize: 13, fontWeight: '600', color: colors.text },
  tabTextOn: { color: '#fff' },
  head: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 2 },
  name: { fontSize: 15, fontWeight: '700', color: colors.text },
  diff: { marginTop: space.sm },
  label: { fontSize: 12, fontWeight: '600', color: colors.muted },
  old: { fontSize: 13, color: colors.muted, textDecorationLine: 'line-through' },
  new: { fontSize: 13.5, color: colors.text, fontWeight: '600' },
  gap: { marginTop: space.sm },
  actions: { gap: space.sm, marginTop: space.md },
});
