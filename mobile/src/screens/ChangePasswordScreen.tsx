import { useState } from 'react';
import { ScrollView, StyleSheet, Text } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useAuth } from '../auth/AuthContext';
import { Button, Card, ErrorBox, Field, text } from '../components/ui';
import { api, ApiError } from '../lib/api';
import { colors, space } from '../theme';

/** Shown instead of the app while the account still has a temporary password (new account / admin reset) — same rule as the web CRM. */
export function ChangePasswordScreen() {
  const { reload, logout } = useAuth();
  const [currentPassword, setCurrent] = useState('');
  const [newPassword, setNew] = useState('');
  const [confirm, setConfirm] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit() {
    if (newPassword.length < 8 || !/[A-Za-z]/.test(newPassword) || !/\d/.test(newPassword)) return setError('The new password needs at least 8 characters, with a letter and a number.');
    if (newPassword !== confirm) return setError('The two new passwords do not match.');
    setError(null);
    setBusy(true);
    try {
      await api.post('/auth/change-password', { currentPassword, newPassword });
      await reload();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Could not change the password.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <SafeAreaView style={styles.safe}>
      <ScrollView contentContainerStyle={styles.body} keyboardShouldPersistTaps="handled">
        <Text style={text.h1}>Choose your password</Text>
        <Text style={[text.muted, styles.intro]}>You signed in with a temporary password. Set your own to continue.</Text>
        <Card>
          {error ? <ErrorBox message={error} /> : null}
          <Field label="Temporary (current) password" value={currentPassword} onChangeText={setCurrent} secureTextEntry />
          <Field label="New password (min. 8, a letter and a number)" value={newPassword} onChangeText={setNew} secureTextEntry />
          <Field label="New password again" value={confirm} onChangeText={setConfirm} secureTextEntry />
          <Button title="Save Password" onPress={() => void submit()} loading={busy} />
        </Card>
        <Button title="Sign Out" variant="secondary" onPress={() => void logout()} />
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.bg },
  body: { padding: space.lg },
  intro: { marginTop: space.xs, marginBottom: space.lg },
});
