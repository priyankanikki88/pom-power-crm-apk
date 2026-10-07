import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { Alert, StyleSheet, Text, View } from 'react-native';
import { useAuth } from '../auth/AuthContext';
import { api, ApiError } from '../lib/api';
import { formatWhen } from '../lib/dates';
import { enumLabel } from '../lib/format';
import { colors, space } from '../theme';
import type { ApprovalInstance } from '../types';
import { STATUS_TONE } from './docParts';
import { Button, Card, ErrorBox, Field, Row, text } from './ui';

/**
 * The approval of a proforma invoice or a Format-4: who decided it, or — for a user who may approve (approval.action, and
 * not the person who made the document) — Approve / Reject. The approver recorded is always the signed-in user; the
 * "Approved by" box is only the name printed on the document.
 */
export function ApprovalCard({ base, id, docLabel, onDecided }: { base: '/proforma-invoices' | '/format4'; id: string; docLabel: string; onDecided: () => void }) {
  const { user, hasPermission } = useAuth();
  const qc = useQueryClient();
  const q = useQuery({ queryKey: ['approval', base, id], queryFn: () => api.get<ApprovalInstance | null>(`${base}/${id}/approval`) });
  const [displayName, setDisplayName] = useState('');
  const [comments, setComments] = useState('');
  const [error, setError] = useState<string | null>(null);

  const act = useMutation({
    mutationFn: (action: 'APPROVED' | 'REJECTED') => api.post(`${base}/${id}/approval/action`, { action, comments: comments.trim() || undefined, displayName: action === 'APPROVED' ? displayName.trim() || undefined : undefined }),
    onSuccess: () => {
      setComments('');
      setDisplayName('');
      void qc.invalidateQueries({ queryKey: ['approval', base, id] });
      onDecided();
    },
    onError: (err) => setError(err instanceof ApiError ? err.message : 'Could not save the decision.'),
  });

  const a = q.data;
  // Nothing to show until the document has been submitted for approval (the server answers with no approval).
  if (!a) return null;
  const decidedBy = a.decision?.actor?.fullName ?? 'Unknown user';

  function confirm(action: 'APPROVED' | 'REJECTED') {
    setError(null);
    const approve = action === 'APPROVED';
    Alert.alert(approve ? `Approve this ${docLabel}?` : `Reject this ${docLabel}?`, `It will be recorded against your login${user ? ` (${user.fullName})` : ''} with the date and time. This cannot be undone.`, [
      { text: 'No', style: 'cancel' },
      { text: approve ? 'Approve' : 'Reject', style: approve ? 'default' : 'destructive', onPress: () => act.mutate(action) },
    ]);
  }

  return (
    <Card>
      <View style={styles.head}>
        <Text style={[text.h2, styles.flex]}>Approval</Text>
        <Text style={[styles.status, { color: STATUS_TONE[a.status] ?? colors.muted }]}>{enumLabel(a.status)}</Text>
      </View>
      {a.status === 'PENDING' ? (
        a.currentUserCanAct && hasPermission('approval.action') ? (
          <View style={styles.form}>
            {error ? <ErrorBox message={error} /> : null}
            <Field label="Approved by (optional — name to print; blank shows your own)" value={displayName} onChangeText={setDisplayName} maxLength={150} />
            <Field label="Comments (optional)" value={comments} onChangeText={setComments} multiline maxLength={2000} />
            <Button title="Approve" loading={act.isPending && act.variables === 'APPROVED'} disabled={act.isPending} onPress={() => confirm('APPROVED')} />
            <View style={styles.gap} />
            <Button title="Reject" variant="danger" loading={act.isPending && act.variables === 'REJECTED'} disabled={act.isPending} onPress={() => confirm('REJECTED')} />
          </View>
        ) : (
          <Text style={[text.muted, styles.form]}>Waiting for an authorised approver — not the person who made this {docLabel}.</Text>
        )
      ) : (
        <View style={styles.form}>
          <Row label={a.status === 'APPROVED' ? 'Approved by' : 'Rejected by'} value={a.status === 'APPROVED' ? (a.decision?.displayName ?? decidedBy) : decidedBy} />
          <Row label="Approved by user" value={a.status === 'APPROVED' && a.decision?.displayName ? decidedBy : null} />
          <Row label="On" value={a.decision ? formatWhen(a.decision.actedAt) : null} />
          <Row label="Comments" value={a.decision?.comments} />
        </View>
      )}
    </Card>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  head: { flexDirection: 'row', alignItems: 'center', gap: space.sm },
  status: { fontSize: 13, fontWeight: '700' },
  form: { marginTop: space.sm },
  gap: { height: space.sm },
});
