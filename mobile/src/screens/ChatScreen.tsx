import { useMutation, useQuery } from '@tanstack/react-query';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { useEffect, useState } from 'react';
import { ActivityIndicator, FlatList, Pressable, RefreshControl, StyleSheet, Text, TextInput, View } from 'react-native';
import { Empty, ErrorBox } from '../components/ui';
import { api, ApiError } from '../lib/api';
import { formatWhen } from '../lib/dates';
import type { SalesStackParams } from '../navigation';
import { colors, radius, space } from '../theme';

export interface ChatConversationRow {
  id: string;
  type: 'DIRECT' | 'GROUP';
  name: string;
  isAdmin: boolean;
  members: Array<{ id: string; fullName: string; isAdmin: boolean }>;
  lastMessage: { id: string; sender: string; body: string; createdAt: string } | null;
  lastMessageAt: string | null;
  unread: number;
}
interface ChatUser {
  id: string;
  fullName: string;
  email: string;
}

const errorText = (err: unknown, fallback: string) => (err instanceof ApiError ? err.message : fallback);

function initials(name: string): string {
  const parts = name.trim().split(/\s+/);
  return ((parts[0]?.[0] ?? '') + (parts[1]?.[0] ?? '')).toUpperCase() || '?';
}

/**
 * Internal staff chat (chat.use) — one-to-one and group conversations, same backend the web CRM's Chat page uses.
 * There is no customer-facing chat in this CRM (only internal staff), so unlike the mockup's Internal/Customer
 * tabs, this screen is internal only.
 */
export function ChatScreen({ navigation }: NativeStackScreenProps<SalesStackParams, 'Chat'>) {
  const list = useQuery({ queryKey: ['chat', 'conversations'], queryFn: () => api.get<ChatConversationRow[]>('/chat/conversations'), refetchInterval: 15_000 });
  const [picking, setPicking] = useState(false);
  const [input, setInput] = useState('');
  const [search, setSearch] = useState('');
  useEffect(() => {
    const t = setTimeout(() => setSearch(input.trim()), 300);
    return () => clearTimeout(t);
  }, [input]);
  const users = useQuery({ queryKey: ['chat', 'users', search], queryFn: () => api.get<ChatUser[]>('/chat/users', { q: search || undefined }), enabled: picking });
  const startDirect = useMutation({
    mutationFn: (userId: string) => api.post<{ id: string }>('/chat/direct', { userId }),
    onSuccess: (res, userId) => {
      setPicking(false);
      setInput('');
      const name = users.data?.find((u) => u.id === userId)?.fullName ?? 'Chat';
      navigation.navigate('ChatThread', { id: res.id, name });
    },
  });

  return (
    <View style={styles.screen}>
      {picking ? (
        <View style={styles.pickerWrap}>
          <TextInput style={styles.search} placeholder="Search people…" placeholderTextColor={colors.muted} value={input} onChangeText={setInput} autoCapitalize="none" autoCorrect={false} />
          {users.isLoading ? <ActivityIndicator color={colors.primary} style={styles.loading} /> : null}
          {users.data?.map((u) => (
            <Pressable key={u.id} style={styles.result} onPress={() => startDirect.mutate(u.id)} accessibilityRole="button">
              <Text style={styles.resultName}>{u.fullName}</Text>
              <Text style={styles.resultMeta}>{u.email}</Text>
            </Pressable>
          ))}
          <Pressable style={styles.cancelBtn} onPress={() => setPicking(false)} accessibilityRole="button">
            <Text style={styles.cancelText}>Cancel</Text>
          </Pressable>
        </View>
      ) : (
        <Pressable style={styles.newBtn} onPress={() => setPicking(true)} accessibilityRole="button">
          <Text style={styles.newBtnText}>+ New Chat</Text>
        </Pressable>
      )}

      {list.isError ? <ErrorBox message={errorText(list.error, 'Could not load chats.')} /> : null}
      <FlatList
        data={list.data ?? []}
        keyExtractor={(c) => c.id}
        contentContainerStyle={styles.list}
        refreshControl={<RefreshControl refreshing={list.isRefetching} onRefresh={() => void list.refetch()} />}
        ListEmptyComponent={list.isLoading ? <ActivityIndicator color={colors.primary} style={styles.loading} /> : <Empty title="No chats yet" hint="Start one with + New Chat." />}
        renderItem={({ item: c }) => (
          <Pressable style={styles.row} onPress={() => navigation.navigate('ChatThread', { id: c.id, name: c.name })} accessibilityRole="button">
            <View style={styles.avatar}>
              <Text style={styles.avatarText}>{initials(c.name)}</Text>
            </View>
            <View style={styles.rowBody}>
              <View style={styles.rowHead}>
                <Text style={styles.name} numberOfLines={1}>
                  {c.name}
                </Text>
                {c.lastMessage ? <Text style={styles.time}>{formatWhen(c.lastMessage.createdAt)}</Text> : null}
              </View>
              <Text style={styles.preview} numberOfLines={1}>
                {c.lastMessage ? `${c.type === 'GROUP' ? `${c.lastMessage.sender}: ` : ''}${c.lastMessage.body}` : 'No messages yet'}
              </Text>
            </View>
            {c.unread > 0 ? (
              <View style={styles.badge}>
                <Text style={styles.badgeText}>{c.unread > 99 ? '99+' : c.unread}</Text>
              </View>
            ) : null}
          </Pressable>
        )}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.bg },
  newBtn: { margin: space.lg, minHeight: 44, borderRadius: radius.md, backgroundColor: colors.primary, alignItems: 'center', justifyContent: 'center' },
  newBtnText: { color: '#ffffff', fontWeight: '700', fontSize: 14 },
  pickerWrap: { padding: space.lg, gap: space.sm },
  search: { minHeight: 46, borderWidth: 1, borderColor: colors.border, borderRadius: radius.md, paddingHorizontal: space.md, fontSize: 15, color: colors.text, backgroundColor: colors.surface },
  result: { padding: space.md, borderWidth: 1, borderColor: colors.border, borderRadius: radius.md, backgroundColor: colors.surface },
  resultName: { fontSize: 14, fontWeight: '700', color: colors.text },
  resultMeta: { fontSize: 12.5, color: colors.muted },
  cancelBtn: { alignItems: 'center', paddingVertical: space.sm },
  cancelText: { color: colors.muted, fontWeight: '600' },
  loading: { padding: space.xl },
  list: { paddingHorizontal: space.lg, paddingBottom: space.xl },
  row: { flexDirection: 'row', alignItems: 'center', gap: space.md, paddingVertical: space.md, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.border },
  avatar: { width: 42, height: 42, borderRadius: 21, backgroundColor: colors.primarySoft, alignItems: 'center', justifyContent: 'center' },
  avatarText: { color: colors.primaryDark, fontWeight: '800', fontSize: 15 },
  rowBody: { flex: 1 },
  rowHead: { flexDirection: 'row', justifyContent: 'space-between', gap: space.sm },
  name: { flex: 1, fontSize: 15, fontWeight: '700', color: colors.text },
  time: { fontSize: 11.5, color: colors.muted },
  preview: { fontSize: 13, color: colors.muted, marginTop: 2 },
  badge: { minWidth: 22, height: 22, borderRadius: 11, backgroundColor: colors.danger, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 5 },
  badgeText: { color: '#ffffff', fontSize: 11, fontWeight: '800' },
});
