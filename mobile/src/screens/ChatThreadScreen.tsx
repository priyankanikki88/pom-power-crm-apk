import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { useEffect, useRef, useState } from 'react';
import { ActivityIndicator, FlatList, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { ErrorBox } from '../components/ui';
import { api, ApiError, postMultipartFields } from '../lib/api';
import { formatWhen } from '../lib/dates';
import type { SalesStackParams } from '../navigation';
import { colors, radius, space } from '../theme';

interface ChatMessageItem {
  id: string;
  sender: { id: string; fullName: string };
  mine: boolean;
  body: string | null;
  deleted: boolean;
  createdAt: string;
  replyTo: { id: string; sender: string; body: string | null } | null;
  attachments: Array<{ id: string; fileName: string; mimeType: string; size: number }>;
}

const errorText = (err: unknown, fallback: string) => (err instanceof ApiError ? err.message : fallback);

/** One conversation's messages — polled (this CRM's chat has no live socket; the web app polls too) while this screen is open. */
export function ChatThreadScreen({ route }: NativeStackScreenProps<SalesStackParams, 'ChatThread'>) {
  const { id, name } = route.params;
  const qc = useQueryClient();
  const [body, setBody] = useState('');
  const [error, setError] = useState<string | null>(null);
  const listRef = useRef<FlatList<ChatMessageItem>>(null);
  const markedUpTo = useRef<string | null>(null);

  const q = useQuery({ queryKey: ['chat', 'thread', id], queryFn: () => api.get<{ items: ChatMessageItem[]; hasMore: boolean }>(`/chat/conversations/${id}/messages`, { limit: 50 }), refetchInterval: 8_000 });
  const items = q.data?.items ?? [];

  const markRead = useMutation({ mutationFn: (messageId: string) => api.post(`/chat/conversations/${id}/read`, { messageId }) });
  useEffect(() => {
    const last = items.at(-1);
    if (last && last.id !== markedUpTo.current) {
      markedUpTo.current = last.id;
      markRead.mutate(last.id);
      void qc.invalidateQueries({ queryKey: ['chat', 'conversations'] });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [items.length]);

  const send = useMutation({
    mutationFn: (text: string) => postMultipartFields<ChatMessageItem>(`/chat/conversations/${id}/messages`, { body: text }),
    onSuccess: () => {
      setError(null);
      setBody('');
      void q.refetch();
    },
    onError: (err) => setError(errorText(err, 'Could not send the message.')),
  });

  function onSend() {
    const text = body.trim();
    if (!text) return;
    send.mutate(text);
  }

  return (
    <View style={styles.screen}>
      <Text style={styles.header} numberOfLines={1}>
        {name}
      </Text>
      {error ? <ErrorBox message={error} /> : null}
      {q.isError ? <ErrorBox message={errorText(q.error, 'Could not load messages.')} /> : null}
      <FlatList
        ref={listRef}
        data={items}
        keyExtractor={(m) => m.id}
        contentContainerStyle={styles.list}
        onContentSizeChange={() => listRef.current?.scrollToEnd({ animated: false })}
        ListEmptyComponent={q.isLoading ? <ActivityIndicator color={colors.primary} style={styles.loading} /> : null}
        renderItem={({ item: m }) => (
          <View style={[styles.bubbleRow, m.mine && styles.bubbleRowMine]}>
            <View style={[styles.bubble, m.mine ? styles.bubbleMine : styles.bubbleTheirs]}>
              {!m.mine ? <Text style={styles.sender}>{m.sender.fullName}</Text> : null}
              <Text style={[styles.body, m.mine && styles.bodyMine]}>{m.deleted ? 'Message deleted' : (m.body ?? '')}</Text>
              {m.attachments.length > 0 ? (
                <Text style={[styles.attach, m.mine && styles.bodyMine]}>
                  {m.attachments.length} attachment{m.attachments.length === 1 ? '' : 's'} — open on the web CRM to view
                </Text>
              ) : null}
              <Text style={[styles.time, m.mine && styles.timeMine]}>{formatWhen(m.createdAt)}</Text>
            </View>
          </View>
        )}
      />
      <View style={styles.composer}>
        <TextInput style={styles.input} value={body} onChangeText={setBody} placeholder="Message…" placeholderTextColor={colors.muted} multiline maxLength={4000} />
        <Pressable style={[styles.sendBtn, (!body.trim() || send.isPending) && styles.sendBtnOff]} onPress={onSend} disabled={!body.trim() || send.isPending} accessibilityRole="button" accessibilityLabel="Send">
          <Text style={styles.sendText}>{send.isPending ? '…' : 'Send'}</Text>
        </Pressable>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.bg },
  header: { fontSize: 15, fontWeight: '700', color: colors.text, padding: space.md, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.border, backgroundColor: colors.surface },
  loading: { padding: space.xl },
  list: { padding: space.lg, gap: space.sm },
  bubbleRow: { flexDirection: 'row' },
  bubbleRowMine: { justifyContent: 'flex-end' },
  bubble: { maxWidth: '82%', borderRadius: radius.lg, padding: space.md, marginBottom: space.sm },
  bubbleTheirs: { backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border },
  bubbleMine: { backgroundColor: colors.primary },
  sender: { fontSize: 11.5, fontWeight: '700', color: colors.primaryDark, marginBottom: 2 },
  body: { fontSize: 14, color: colors.text },
  bodyMine: { color: '#ffffff' },
  attach: { fontSize: 12, color: colors.muted, marginTop: 4, fontStyle: 'italic' },
  time: { fontSize: 10.5, color: colors.muted, marginTop: 4, alignSelf: 'flex-end' },
  timeMine: { color: 'rgba(255,255,255,0.8)' },
  composer: { flexDirection: 'row', alignItems: 'flex-end', gap: space.sm, padding: space.md, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.border, backgroundColor: colors.surface },
  input: { flex: 1, maxHeight: 100, minHeight: 42, borderWidth: 1, borderColor: colors.border, borderRadius: radius.md, paddingHorizontal: space.md, paddingVertical: 8, fontSize: 14, color: colors.text, backgroundColor: colors.bg },
  sendBtn: { minHeight: 42, paddingHorizontal: 18, borderRadius: radius.md, backgroundColor: colors.primary, alignItems: 'center', justifyContent: 'center' },
  sendBtnOff: { opacity: 0.5 },
  sendText: { color: '#ffffff', fontWeight: '700', fontSize: 14 },
});
