import { useQuery } from '@tanstack/react-query';
import { ActivityIndicator, Linking, Pressable, RefreshControl, ScrollView, StyleSheet, Text, View } from 'react-native';
import { Badge, Empty, ErrorBox, text } from '../components/ui';
import { api, ApiError } from '../lib/api';
import { formatDate } from '../lib/dates';
import { colors, radius, space } from '../theme';

interface TeamMember {
  id: string;
  employeeCode: string | null;
  fullName: string;
  email: string;
  phone: string | null;
  status: string;
  lastLoginAt: string | null;
  branch: { id: string; code: string; name: string } | null;
  department: { id: string; code: string; name: string } | null;
  designation: { id: string; code: string; name: string; level: number } | null;
  userRoles: Array<{ role: { id: string; name: string } }>;
}

const errorText = (err: unknown, fallback: string) => (err instanceof ApiError ? err.message : fallback);
const digits = (phone: string) => phone.replace(/[^\d+]/g, '');

/**
 * Everyone who reports to the signed-in manager, direct and indirect (GET /users/team — the team.view scope, not the
 * company-wide Users admin screen, which stays on the web CRM). Read-only: adding, editing or reassigning a team
 * member's role is a web CRM action.
 */
export function TeamManagementScreen() {
  const q = useQuery({ queryKey: ['users', 'team'], queryFn: () => api.get<TeamMember[]>('/users/team') });
  const rows = q.data ?? [];

  return (
    <ScrollView style={styles.screen} contentContainerStyle={styles.body} refreshControl={<RefreshControl refreshing={q.isRefetching} onRefresh={() => void q.refetch()} />}>
      {q.isLoading ? <ActivityIndicator color={colors.primary} style={{ padding: space.xl }} /> : null}
      {q.isError ? <ErrorBox message={errorText(q.error, 'Could not load your team.')} /> : null}
      {q.data && rows.length === 0 ? <Empty title="No one reports to you yet" hint="Reporting lines are set on the web CRM." /> : null}
      {rows.map((m) => (
        <View key={m.id} style={styles.card}>
          <View style={styles.head}>
            <Text style={[text.h2, styles.flex]} numberOfLines={1}>
              {m.fullName}
            </Text>
            <Badge value={m.status} label={m.status === 'ACTIVE' ? 'Active' : 'Inactive'} />
          </View>
          <Text style={text.muted}>{m.userRoles.map((r) => r.role.name).join(', ') || 'No role assigned'}</Text>
          {m.designation ? <Text style={text.muted}>{m.designation.name}</Text> : null}
          <Text style={text.muted}>
            {[m.branch?.name, m.department?.name].filter(Boolean).join(' · ') || '—'}
          </Text>
          <Text style={styles.meta}>{m.employeeCode ?? m.email}</Text>
          <Text style={styles.meta}>{m.lastLoginAt ? `Last active ${formatDate(m.lastLoginAt)}` : 'Never signed in'}</Text>
          {m.phone ? (
            <View style={styles.actions}>
              <Pressable style={[styles.action, { backgroundColor: colors.primarySoft }]} onPress={() => void Linking.openURL(`tel:${digits(m.phone!)}`)} accessibilityRole="button" accessibilityLabel={`Call ${m.fullName}`}>
                <Text style={[styles.actionText, { color: colors.primaryDark }]}>Call</Text>
              </Pressable>
              <Pressable style={[styles.action, { backgroundColor: colors.successSoft }]} onPress={() => void Linking.openURL(`https://wa.me/${digits(m.phone!).replace(/^\+/, '')}`)} accessibilityRole="button" accessibilityLabel={`WhatsApp ${m.fullName}`}>
                <Text style={[styles.actionText, { color: colors.success }]}>WhatsApp</Text>
              </Pressable>
            </View>
          ) : null}
        </View>
      ))}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.bg },
  body: { padding: space.lg },
  flex: { flex: 1 },
  card: { backgroundColor: colors.surface, borderRadius: radius.lg, borderWidth: 1, borderColor: colors.border, padding: space.lg, marginBottom: space.md },
  head: { flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between', gap: space.sm, marginBottom: 2 },
  meta: { fontSize: 13, color: colors.muted, marginTop: 2 },
  actions: { flexDirection: 'row', gap: space.sm, marginTop: space.md },
  action: { flex: 1, minHeight: 40, borderRadius: radius.md, alignItems: 'center', justifyContent: 'center' },
  actionText: { fontSize: 14, fontWeight: '700' },
});
