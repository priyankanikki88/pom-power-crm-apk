import { useNavigation, useRoute, type NavigationProp, type RouteProp } from '@react-navigation/native';
import { useQuery } from '@tanstack/react-query';
import { useMemo, useState } from 'react';
import { ActivityIndicator, Linking, Pressable, RefreshControl, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { Badge, Button, Card, Empty, ErrorBox, Row, text } from '../components/ui';
import { api, ApiError } from '../lib/api';
import { formatDate } from '../lib/dates';
import { colors, radius, space } from '../theme';

export interface Employee {
  id: string;
  employeeCode: string | null;
  fullName: string;
  email: string;
  phone: string | null;
  status: 'ACTIVE' | 'INACTIVE';
  branch: { id: string; code: string; name: string } | null;
  department: { id: string; code: string; name: string } | null;
  reportingManager: { id: string; fullName: string } | null;
  designation: { id: string; code: string; name: string; level: number } | null;
  joiningDate?: string | null;
}

const errorText = (err: unknown, fallback: string) => (err instanceof ApiError ? err.message : fallback);
const digits = (phone: string) => phone.replace(/[^\d+]/g, '');

/** Every employee, company-wide — Employee List / Employee Directory from the mockup are the same screen. */
export function HrEmployeesScreen() {
  const navigation = useNavigation<NavigationProp<Record<string, object | undefined>>>();
  const [search, setSearch] = useState('');
  const q = useQuery({ queryKey: ['hr', 'employees'], queryFn: () => api.get<Employee[]>('/users') });
  const employees = useMemo(() => {
    const rows = q.data ?? [];
    const term = search.trim().toLowerCase();
    if (!term) return rows;
    return rows.filter((e) => e.fullName.toLowerCase().includes(term) || e.employeeCode?.toLowerCase().includes(term) || e.department?.name.toLowerCase().includes(term));
  }, [q.data, search]);

  return (
    <ScrollView style={styles.screen} contentContainerStyle={styles.body} refreshControl={<RefreshControl refreshing={q.isRefetching} onRefresh={() => void q.refetch()} />}>
      <TextInput style={styles.search} placeholder="Search employee name, code, department" placeholderTextColor={colors.muted} value={search} onChangeText={setSearch} />
      {q.isLoading ? <ActivityIndicator color={colors.primary} style={styles.loading} /> : null}
      {q.isError ? <ErrorBox message={errorText(q.error, 'Could not load employees.')} /> : null}
      {q.data && employees.length === 0 ? <Empty title="No employees found" /> : null}
      {employees.map((e) => (
        <Pressable key={e.id} style={styles.card} onPress={() => navigation.navigate('HrEmployeeDetail', { id: e.id, name: e.fullName })} accessibilityRole="button">
          <View style={styles.row}>
            <View style={styles.flex}>
              <Text style={styles.name}>{e.fullName}</Text>
              <Text style={text.muted}>
                {e.employeeCode ? `${e.employeeCode} · ` : ''}
                {e.department?.name ?? 'No Department'}
              </Text>
              {e.designation ? <Text style={text.muted}>{e.designation.name}</Text> : null}
            </View>
            <Badge value={e.status} label={e.status === 'ACTIVE' ? 'Active' : 'Inactive'} />
          </View>
        </Pressable>
      ))}
    </ScrollView>
  );
}

/** Profile / Attendance / Leave / Documents from the mockup — Attendance and Leave stay on this role's own tabs (Attendance Overview is company-wide, not one employee's; Leave reuses the existing Leave screen), so this detail page shows the profile itself. */
export function HrEmployeeDetailScreen() {
  const { id } = useRoute<RouteProp<{ HrEmployeeDetail: { id: string; name: string } }, 'HrEmployeeDetail'>>().params;
  const q = useQuery({ queryKey: ['hr', 'employee', id], queryFn: () => api.get<Employee>(`/users/${id}`) });
  const e = q.data;

  return (
    <ScrollView style={styles.screen} contentContainerStyle={styles.body}>
      {q.isLoading ? <ActivityIndicator color={colors.primary} style={styles.loading} /> : null}
      {q.isError ? <ErrorBox message={errorText(q.error, 'Could not load this employee.')} /> : null}
      {e ? (
        <>
          <Card>
            <View style={styles.row}>
              <Text style={[text.h1, styles.flex]}>{e.fullName}</Text>
              <Badge value={e.status} label={e.status === 'ACTIVE' ? 'Active' : 'Inactive'} />
            </View>
            <Text style={text.muted}>{e.designation?.name ?? 'No Designation'}</Text>
            {e.employeeCode ? <Row label="Employee Code" value={e.employeeCode} /> : null}
            <Row label="Department" value={e.department?.name} />
            <Row label="Reporting To" value={e.reportingManager?.fullName} />
            {e.joiningDate ? <Row label="Date of Joining" value={formatDate(e.joiningDate)} /> : null}
            <Row label="Email" value={e.email} />
            <Row label="Phone" value={e.phone} />
            <Row label="Location" value={e.branch?.name} />
          </Card>
          {e.phone ? (
            <View style={styles.actionsRow}>
              <View style={styles.flex}>
                <Button title="Call" variant="secondary" onPress={() => void Linking.openURL(`tel:${digits(e.phone!)}`)} />
              </View>
              <View style={styles.flex}>
                <Button title="WhatsApp" variant="secondary" onPress={() => void Linking.openURL(`https://wa.me/${digits(e.phone!)}`)} />
              </View>
              <View style={styles.flex}>
                <Button title="Email" variant="secondary" onPress={() => void Linking.openURL(`mailto:${e.email}`)} />
              </View>
            </View>
          ) : null}
        </>
      ) : null}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.bg },
  body: { padding: space.lg, paddingBottom: space.xl },
  loading: { padding: space.lg },
  search: { minHeight: 44, borderWidth: 1, borderColor: colors.border, borderRadius: radius.md, paddingHorizontal: space.md, fontSize: 15, color: colors.text, backgroundColor: colors.surface, marginBottom: space.md },
  card: { backgroundColor: colors.surface, borderRadius: radius.lg, borderWidth: 1, borderColor: colors.border, padding: space.md, marginBottom: space.sm },
  row: { flexDirection: 'row', alignItems: 'center', gap: space.sm },
  flex: { flex: 1 },
  name: { fontSize: 14.5, fontWeight: '700', color: colors.text },
  actionsRow: { flexDirection: 'row', gap: space.sm, marginTop: space.sm },
});
