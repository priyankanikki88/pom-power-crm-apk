import { useNavigation, type NavigationProp } from '@react-navigation/native';
import { useQuery } from '@tanstack/react-query';
import { useState } from 'react';
import { ActivityIndicator, RefreshControl, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useAuth } from '../auth/AuthContext';
import { PhotoAdder } from '../components/photos';
import { Button, Card, ErrorBox, Field, Row, text } from '../components/ui';
import { api, ApiError } from '../lib/api';
import { colors, space } from '../theme';

interface ProfileDetails {
  dateOfBirth: string | null;
  bloodGroup: string | null;
  maritalStatus: string | null;
  personalEmail: string | null;
  alternatePhone: string | null;
  currentAddress: string | null;
  permanentAddress: string | null;
  emergencyContactName: string | null;
  emergencyContactPhone: string | null;
  highestQualification: string | null;
  priorExperienceYears: number | null;
  skills: string | null;
}
interface ChangeRequest {
  id: string;
  status: 'SUBMITTED' | 'APPROVED' | 'REJECTED';
  reviewRemarks: string | null;
}
interface SignatureStatus {
  id: string;
  uploadedAt: string;
}
interface MyProfile {
  details: ProfileDetails | null;
  pendingChange: ChangeRequest | null;
  currentSignature: SignatureStatus | null;
  pendingSignature: SignatureStatus | null;
}

/** Every role's "My Profile" — Service Engineer keeps its own richer ServiceEngineerProfileScreen instead of this one. */
export function ProfileScreen() {
  const { user } = useAuth();
  const navigation = useNavigation<NavigationProp<Record<string, object | undefined>>>();
  const me = useQuery({ queryKey: ['employee-profile', 'me'], queryFn: () => api.get<MyProfile>('/employee-profile/me') });

  return (
    <ScrollView style={styles.screen} contentContainerStyle={styles.body} refreshControl={<RefreshControl refreshing={me.isRefetching} onRefresh={() => void me.refetch()} />}>
      <Card>
        <Text style={text.h1}>{user?.fullName}</Text>
        <Text style={[text.muted, styles.sub]}>{user?.employeeCode ? `Emp ID: ${user.employeeCode}` : user?.email}</Text>
        <Row label="Designation" value={user?.designation?.name} />
        <Row label="Department" value={user?.department?.name} />
        <Row label="Branch" value={user?.branch?.name} />
        <Row label="Reporting Manager" value={user?.reportingManager?.fullName} />
        <Row label="Phone" value={user?.phone} />
        <Row label="Email" value={user?.email} />
      </Card>

      {me.isLoading ? <ActivityIndicator color={colors.primary} style={styles.loading} /> : null}
      {me.data?.pendingChange ? (
        <Card>
          <Text style={text.muted}>Your profile change is waiting for HR to review it.</Text>
        </Card>
      ) : null}

      <View style={styles.link}>
        <Button title="Edit My Profile" variant="secondary" onPress={() => navigation.navigate('ProfileEdit')} />
      </View>
      <View style={styles.link}>
        <Button title="My Payslips" variant="secondary" onPress={() => navigation.navigate('Payslips')} />
      </View>
    </ScrollView>
  );
}

const FIELDS: Array<{ key: keyof ProfileDetails; label: string; multiline?: boolean; keyboardType?: 'default' | 'phone-pad' | 'email-address' | 'numeric' }> = [
  { key: 'dateOfBirth', label: 'Date of birth (YYYY-MM-DD)' },
  { key: 'bloodGroup', label: 'Blood group' },
  { key: 'maritalStatus', label: 'Marital status' },
  { key: 'personalEmail', label: 'Personal email', keyboardType: 'email-address' },
  { key: 'alternatePhone', label: 'Alternate phone', keyboardType: 'phone-pad' },
  { key: 'currentAddress', label: 'Current address', multiline: true },
  { key: 'permanentAddress', label: 'Permanent address', multiline: true },
  { key: 'emergencyContactName', label: 'Emergency contact name' },
  { key: 'emergencyContactPhone', label: 'Emergency contact phone', keyboardType: 'phone-pad' },
  { key: 'highestQualification', label: 'Highest qualification' },
  { key: 'priorExperienceYears', label: 'Prior experience (years)', keyboardType: 'numeric' },
  { key: 'skills', label: 'Skills' },
];

/** Submits a change request — nothing here applies until HR approves it. Signature upload has its own, separate approval. */
export function ProfileEditScreen() {
  const me = useQuery({ queryKey: ['employee-profile', 'me'], queryFn: () => api.get<MyProfile>('/employee-profile/me') });
  const [form, setForm] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);
  const d = me.data?.details;
  const value = (key: keyof ProfileDetails) => form[key] ?? (d?.[key] != null ? String(d[key]) : '');

  async function submit() {
    setError(null);
    const fields: Record<string, string | number> = {};
    for (const f of FIELDS) {
      if (!(f.key in form)) continue;
      const v = form[f.key]!.trim();
      if (!v) continue;
      fields[f.key] = f.key === 'priorExperienceYears' ? Number(v) : v;
    }
    if (Object.keys(fields).length === 0) return setError('Change at least one field.');
    setBusy(true);
    try {
      await api.post('/employee-profile/me/changes', { fields });
      setDone(true);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Could not submit the change.');
    } finally {
      setBusy(false);
    }
  }

  if (me.data?.pendingChange && !done) {
    return (
      <ScrollView style={styles.screen} contentContainerStyle={styles.body}>
        <Card>
          <Text style={text.body}>You already have a profile change waiting for HR to review. You can submit another once that one is decided.</Text>
        </Card>
      </ScrollView>
    );
  }

  if (done) {
    return (
      <ScrollView style={styles.screen} contentContainerStyle={styles.body}>
        <Card>
          <Text style={text.body}>Submitted. Your change will apply once HR approves it.</Text>
        </Card>
      </ScrollView>
    );
  }

  return (
    <ScrollView style={styles.screen} contentContainerStyle={styles.body} keyboardShouldPersistTaps="handled">
      <Card>
        {error ? <ErrorBox message={error} /> : null}
        <Text style={[text.muted, styles.sub]}>Changes sit with HR for approval before they take effect.</Text>
        {FIELDS.map((f) => (
          <Field key={f.key} label={f.label} value={value(f.key)} onChangeText={(v) => setForm((x) => ({ ...x, [f.key]: v }))} multiline={f.multiline} keyboardType={f.keyboardType} maxLength={f.multiline ? 2000 : 150} />
        ))}
        <Button title="Submit for Review" onPress={() => void submit()} loading={busy} />
      </Card>

      <Text style={[text.h2, styles.section]}>My Signature</Text>
      <Card>
        <Text style={text.muted}>Printed on Quotations, Proforma Invoices and Format-4 documents you issue, once HR approves it.</Text>
        {me.data?.currentSignature ? <Row label="Approved signature" value={`Uploaded ${new Date(me.data.currentSignature.uploadedAt).toLocaleDateString('en-IN')}`} /> : null}
        {me.data?.pendingSignature ? <Row label="Pending review" value={`Uploaded ${new Date(me.data.pendingSignature.uploadedAt).toLocaleDateString('en-IN')}`} /> : null}
        <PhotoAdder uploadPath="/employee-profile/me/signature" onUploaded={() => void me.refetch()} />
      </Card>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.bg },
  body: { padding: space.lg, paddingBottom: space.xl },
  sub: { marginTop: 2, marginBottom: space.md },
  section: { marginVertical: space.sm },
  link: { marginBottom: space.md },
  loading: { padding: space.sm },
});
