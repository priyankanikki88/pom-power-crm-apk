import { useState } from 'react';
import { KeyboardAvoidingView, Platform, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useAuth } from '../auth/AuthContext';
import { Button, ErrorBox, Field } from '../components/ui';
import { APP_NAME } from '../config';
import { ApiError } from '../lib/api';
import { colors, space } from '../theme';

export function LoginScreen() {
  const { login } = useAuth();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit() {
    if (!email.trim() || !password) {
      setError('Enter your email and password.');
      return;
    }
    setError(null);
    setBusy(true);
    try {
      await login(email, password);
    } catch (err) {
      setError(err instanceof ApiError ? (err.status === 401 ? 'Wrong email or password.' : err.message) : 'Could not sign in. Try again.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <SafeAreaView style={styles.safe}>
      <KeyboardAvoidingView style={styles.flex} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <ScrollView contentContainerStyle={styles.body} keyboardShouldPersistTaps="handled">
          <View style={styles.brand}>
            <View style={styles.mark}>
              <Text style={styles.markText}>P</Text>
            </View>
            <Text style={styles.title}>{APP_NAME}</Text>
            <Text style={styles.sub}>Sign in with your CRM account</Text>
          </View>
          <View style={styles.card}>
            {error ? <ErrorBox message={error} /> : null}
            <Field label="Email" value={email} onChangeText={setEmail} autoCapitalize="none" autoCorrect={false} keyboardType="email-address" textContentType="username" autoComplete="email" returnKeyType="next" />
            <Field label="Password" value={password} onChangeText={setPassword} secureTextEntry textContentType="password" autoComplete="password" returnKeyType="go" onSubmitEditing={() => void submit()} />
            <Button title="Sign In" onPress={() => void submit()} loading={busy} />
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.navy },
  flex: { flex: 1 },
  body: { flexGrow: 1, justifyContent: 'center', padding: space.xl },
  brand: { alignItems: 'center', marginBottom: space.xl },
  mark: { width: 56, height: 56, borderRadius: 16, backgroundColor: colors.primary, alignItems: 'center', justifyContent: 'center', marginBottom: space.md },
  markText: { color: '#fff', fontSize: 28, fontWeight: '800' },
  title: { color: '#fff', fontSize: 22, fontWeight: '700' },
  sub: { color: '#b6c0d4', fontSize: 14, marginTop: space.xs },
  card: { backgroundColor: colors.surface, borderRadius: 16, padding: space.xl },
});
