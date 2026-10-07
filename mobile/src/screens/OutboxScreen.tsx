import { useNavigation, type NavigationProp } from '@react-navigation/native';
import { useState } from 'react';
import { Alert, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { Button, Card, Empty, text } from '../components/ui';
import { formatWhen } from '../lib/dates';
import { discardEntry, flushOutbox, useOutbox } from '../lib/outbox';
import { colors, radius, space } from '../theme';

/** A line on Home (and anywhere else it is placed) while entries made without a network have not reached the server. */
export function OutboxBanner() {
  const entries = useOutbox();
  const navigation = useNavigation<NavigationProp<Record<string, object | undefined>>>();
  if (entries.length === 0) return null;
  const failed = entries.filter((e) => e.error).length;
  return (
    <Pressable style={[styles.banner, failed > 0 && styles.bannerFailed]} onPress={() => navigation.navigate('More', { screen: 'Outbox', initial: false })} accessibilityRole="button">
      <Text style={styles.bannerText}>
        {failed > 0 ? `${failed} ${failed === 1 ? 'entry was' : 'entries were'} not accepted by the server — tap to see` : `${entries.length} ${entries.length === 1 ? 'entry is' : 'entries are'} saved on this phone, waiting for the network — tap to see`}
      </Text>
    </Pressable>
  );
}

/**
 * Entries made without a network, oldest first: waiting to be sent, or refused by the server with its reason. They are
 * sent on their own when the network is back; "Send now" tries at once.
 */
export function OutboxScreen() {
  const entries = useOutbox();
  const [busy, setBusy] = useState(false);

  function sendNow() {
    setBusy(true);
    void flushOutbox(true).finally(() => setBusy(false));
  }
  function discard(id: string, title: string) {
    Alert.alert('Discard this entry?', `“${title}” will be removed from this phone and will not be sent.`, [
      { text: 'Keep', style: 'cancel' },
      { text: 'Discard', style: 'destructive', onPress: () => discardEntry(id) },
    ]);
  }

  if (entries.length === 0) {
    return (
      <View style={styles.screen}>
        <Empty title="Nothing is waiting" hint="Everything you entered has reached the server." />
      </View>
    );
  }
  return (
    <ScrollView style={styles.screen} contentContainerStyle={styles.body}>
      <Text style={[text.muted, styles.intro]}>These were saved on this phone because the server could not be reached. They are sent on their own, in this order, when the network is back.</Text>
      <Button title="Send Now" onPress={sendNow} loading={busy} />
      <View style={styles.gap} />
      {entries.map((e) => (
        <Card key={e.id}>
          <Text style={text.h2}>{e.title}</Text>
          <Text style={[text.muted, styles.when]}>Entered {formatWhen(e.createdAt)}</Text>
          {e.error ? <Text style={styles.failed}>Not accepted by the server: {e.error}</Text> : <Text style={styles.waiting}>Waiting for the network</Text>}
          <View style={styles.gap} />
          <Button title="Discard" variant="secondary" onPress={() => discard(e.id, e.title)} />
        </Card>
      ))}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.bg },
  body: { padding: space.lg },
  intro: { marginBottom: space.md },
  gap: { height: space.md },
  when: { marginTop: 2, marginBottom: space.sm },
  waiting: { color: colors.warning, fontSize: 13, fontWeight: '700' },
  failed: { color: colors.danger, fontSize: 13, fontWeight: '700' },
  banner: { backgroundColor: colors.warningSoft, borderRadius: radius.md, padding: space.md, marginBottom: space.md },
  bannerFailed: { backgroundColor: colors.dangerSoft },
  bannerText: { fontSize: 13.5, fontWeight: '600', color: colors.text },
});
