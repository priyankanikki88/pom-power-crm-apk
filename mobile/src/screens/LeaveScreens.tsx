import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { useLayoutEffect, useState } from 'react';
import { ActivityIndicator, Alert, FlatList, Pressable, RefreshControl, ScrollView, StyleSheet, Switch, Text, View } from 'react-native';
import { useAuth } from '../auth/AuthContext';
import { ChipSelect, DateField, Segmented } from '../components/inputs';
import { ReasonAction } from '../components/ReasonAction';
import { Button, Card, Empty, ErrorBox, Field, text } from '../components/ui';
import { api, ApiError } from '../lib/api';
import { formatDate, isoDay } from '../lib/dates';
import { enumLabel } from '../lib/format';
import type { MoreStackParams } from '../navigation';
import { colors, radius, space } from '../theme';

interface LeaveRequest {
  id: string;
  leaveType: 'CASUAL' | 'SICK' | 'EARNED' | 'UNPAID' | 'OTHER';
  startDate: string;
  endDate: string;
  reason: string | null;
  status: 'PENDING' | 'APPROVED' | 'REJECTED' | 'CANCELLED';
  decisionRemarks: string | null;
  halfDay?: boolean;
  /** Present on the approver's list. */
  user?: { id: string; fullName: string };
}

const TONE: Record<string, string> = { PENDING: colors.warning, APPROVED: colors.success, REJECTED: colors.danger, CANCELLED: colors.muted };
const TYPES = (['CASUAL', 'SICK', 'EARNED', 'UNPAID', 'OTHER'] as const).map((value) => ({ value, label: enumLabel(value) }));
const errorText = (err: unknown, fallback: string) => (err instanceof ApiError ? err.message : fallback);
const period = (r: LeaveRequest) => (r.startDate.slice(0, 10) === r.endDate.slice(0, 10) ? formatDate(r.startDate) : `${formatDate(r.startDate)} – ${formatDate(r.endDate)}`);

/**
 * Leave: my own requests with their status (and cancelling one), and — for a user who manages attendance — everyone's
 * requests waiting for a decision, to approve or reject. An approved request marks those working days as Leave.
 */
export function LeaveScreen({ navigation }: NativeStackScreenProps<MoreStackParams, 'Leave'>) {
  const { hasPermission } = useAuth();
  const canDecide = hasPermission('attendance.manage');
  const qc = useQueryClient();
  const [view, setView] = useState<'mine' | 'pending'>('mine');
  const [error, setError] = useState<string | null>(null);
  const mine = useQuery({ queryKey: ['leave', 'mine'], queryFn: () => api.get<LeaveRequest[]>('/attendance/leave-requests/mine') });
  const pending = useQuery({ queryKey: ['leave', 'pending'], queryFn: () => api.get<LeaveRequest[]>('/attendance/leave-requests', { status: 'PENDING' }), enabled: canDecide });
  const q = view === 'mine' ? mine : pending;

  useLayoutEffect(() => {
    navigation.setOptions({
      headerRight: () => (
        <Pressable onPress={() => navigation.navigate('LeaveForm')} hitSlop={12} accessibilityRole="button" accessibilityLabel="Apply for leave">
          <Text style={styles.headerBtn}>+ Apply</Text>
        </Pressable>
      ),
    });
  }, [navigation]);

  const refresh = () => {
    void qc.invalidateQueries({ queryKey: ['leave'] });
    void qc.invalidateQueries({ queryKey: ['attendance'] });
  };
  const cancel = useMutation({ mutationFn: (id: string) => api.post(`/attendance/leave-requests/${id}/cancel`), onSuccess: refresh, onError: (err) => setError(errorText(err, 'Could not cancel the request.')) });
  const decide = useMutation({
    mutationFn: (v: { id: string; decision: 'APPROVED' | 'REJECTED'; remarks?: string }) => api.post(`/attendance/leave-requests/${v.id}/decide`, { decision: v.decision, remarks: v.remarks }),
    onSuccess: refresh,
    onError: (err) => setError(errorText(err, 'Could not save the decision.')),
  });

  function confirmCancel(r: LeaveRequest) {
    setError(null);
    Alert.alert('Cancel this leave request?', r.status === 'APPROVED' ? 'The leave already marked on those days will be removed.' : 'The request will be withdrawn.', [
      { text: 'No', style: 'cancel' },
      { text: 'Yes, cancel it', style: 'destructive', onPress: () => cancel.mutate(r.id) },
    ]);
  }
  function confirmApprove(r: LeaveRequest) {
    setError(null);
    Alert.alert('Approve this leave?', `${r.user?.fullName ?? 'The employee'} — ${period(r)}. Those working days will be marked as Leave.`, [
      { text: 'No', style: 'cancel' },
      { text: 'Approve', onPress: () => decide.mutate({ id: r.id, decision: 'APPROVED' }) },
    ]);
  }

  return (
    <View style={styles.screen}>
      {canDecide ? (
        <View>
          <Segmented
            value={view}
            options={[
              { value: 'mine' as const, label: 'My Leave' },
              { value: 'pending' as const, label: pending.data && pending.data.length > 0 ? `To Decide (${pending.data.length})` : 'To Decide' },
            ]}
            onChange={setView}
          />
        </View>
      ) : null}
      {q.isError ? <View style={styles.pad}><ErrorBox message={errorText(q.error, 'Could not load leave requests.')} /></View> : null}
      {error ? <View style={styles.pad}><ErrorBox message={error} /></View> : null}
      <FlatList
        data={q.data ?? []}
        keyExtractor={(r) => r.id}
        contentContainerStyle={styles.list}
        keyboardShouldPersistTaps="handled"
        refreshControl={<RefreshControl refreshing={q.isRefetching} onRefresh={() => void q.refetch()} />}
        ListEmptyComponent={q.isLoading ? <ActivityIndicator style={styles.pad} color={colors.primary} /> : <Empty title={view === 'mine' ? 'No leave requests yet' : 'Nothing is waiting for a decision'} hint={view === 'mine' ? 'Tap + Apply to ask for leave.' : undefined} />}
        renderItem={({ item }) => (
          <View style={styles.item}>
            <View style={styles.row}>
              <Text style={styles.name}>{item.user ? item.user.fullName : `${enumLabel(item.leaveType)} Leave`}</Text>
              <Text style={[styles.status, { color: TONE[item.status] ?? colors.muted }]}>{enumLabel(item.status)}</Text>
            </View>
            <Text style={text.body}>
              {item.user ? `${enumLabel(item.leaveType)} leave · ` : ''}
              {period(item)}
              {item.halfDay ? ' · half day' : ''}
            </Text>
            {item.reason ? <Text style={[text.muted, styles.line]}>{item.reason}</Text> : null}
            {item.decisionRemarks ? <Text style={[text.muted, styles.line]}>Approver: {item.decisionRemarks}</Text> : null}
            {view === 'mine' && (item.status === 'PENDING' || item.status === 'APPROVED') ? (
              <View style={styles.gap}>
                <Button title="Cancel Request" variant="secondary" disabled={cancel.isPending} onPress={() => confirmCancel(item)} />
              </View>
            ) : null}
            {view === 'pending' ? (
              <View style={styles.gap}>
                <Button title="Approve" disabled={decide.isPending} onPress={() => confirmApprove(item)} />
                <View style={styles.gapSmall} />
                <ReasonAction title="Reject" label="Why is it rejected" confirmTitle="Reject Leave" danger busy={decide.isPending} onSubmit={(remarks) => decide.mutate({ id: item.id, decision: 'REJECTED', remarks })} />
              </View>
            ) : null}
          </View>
        )}
      />
    </View>
  );
}

/** Apply for leave: type, from and to dates, reason. It goes to the attendance approver. */
export function LeaveFormScreen({ navigation }: NativeStackScreenProps<MoreStackParams, 'LeaveForm'>) {
  const qc = useQueryClient();
  const [leaveType, setLeaveType] = useState<LeaveRequest['leaveType']>('CASUAL');
  const [start, setStart] = useState<Date>(() => new Date());
  const [end, setEnd] = useState<Date>(() => new Date());
  const [reason, setReason] = useState('');
  const [halfDay, setHalfDay] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // What is left of each leave type this leave year (an older server without balances simply shows nothing).
  const balance = useQuery({ queryKey: ['leave', 'balance'], queryFn: () => api.get<{ label: string; balances: Array<{ leaveType: string; available: number }> }>('/attendance/leave-balance'), retry: false });

  const apply = useMutation({
    // A half day is one date; the server takes it from the EL / CL / ML left, or without pay when none is left.
    mutationFn: () => api.post('/attendance/leave-requests', { leaveType, startDate: isoDay(start), endDate: isoDay(halfDay ? start : end), reason: reason.trim() || undefined, ...(halfDay ? { halfDay: true } : {}) }),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['leave'] });
      navigation.goBack();
    },
    onError: (err) => setError(errorText(err, 'Could not send the leave request.')),
  });

  function submit() {
    if (!halfDay && isoDay(end) < isoDay(start)) return setError('The last day must be on or after the first day.');
    setError(null);
    apply.mutate();
  }

  return (
    <ScrollView style={styles.screen} contentContainerStyle={styles.pad} keyboardShouldPersistTaps="handled">
      <Card>
        {error ? <ErrorBox message={error} /> : null}
        {balance.data ? (
          <Text style={[text.muted, styles.balance]}>
            Left this leave year ({balance.data.label}): {balance.data.balances.map((b) => `${b.leaveType === 'CASUAL' ? 'CL' : b.leaveType === 'EARNED' ? 'EL' : 'ML'} ${b.available}`).join(' · ')}
          </Text>
        ) : null}
        <View style={styles.switchRow}>
          <Text style={[text.body, styles.flex]}>Half day (taken from EL, CL or ML left; without pay if none)</Text>
          <Switch value={halfDay} onValueChange={setHalfDay} accessibilityLabel="Half day" />
        </View>
        {!halfDay ? <ChipSelect label="Leave type *" value={leaveType} options={TYPES} onChange={(v) => v && setLeaveType(v)} /> : null}
        <DateField
          label={halfDay ? 'Date *' : 'First day *'}
          value={start}
          onChange={(d) => {
            if (!d) return;
            setStart(d);
            if (isoDay(end) < isoDay(d)) setEnd(d);
          }}
        />
        {!halfDay ? <DateField label="Last day *" value={end} minimumDate={start} onChange={(d) => d && setEnd(d)} /> : null}
        <Field label="Reason" value={reason} onChangeText={setReason} multiline maxLength={1000} />
        <Button title="Send Leave Request" onPress={submit} loading={apply.isPending} />
      </Card>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.bg },
  pad: { padding: space.lg },
  list: { padding: space.lg, flexGrow: 1 },
  headerBtn: { color: '#ffffff', fontSize: 15, fontWeight: '700' },
  item: { backgroundColor: colors.surface, borderRadius: radius.lg, borderWidth: 1, borderColor: colors.border, padding: space.lg, marginBottom: space.sm },
  row: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: space.sm, marginBottom: 2 },
  name: { fontSize: 15, fontWeight: '700', color: colors.text, flex: 1 },
  status: { fontSize: 12, fontWeight: '700' },
  line: { marginTop: 2 },
  gap: { marginTop: space.md },
  gapSmall: { height: space.sm },
  flex: { flex: 1 },
  balance: { marginBottom: space.md },
  switchRow: { flexDirection: 'row', alignItems: 'center', gap: space.md, marginBottom: space.md },
});
