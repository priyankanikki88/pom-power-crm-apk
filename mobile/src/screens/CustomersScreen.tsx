import { useInfiniteQuery } from '@tanstack/react-query';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { useEffect, useLayoutEffect, useState } from 'react';
import { ActivityIndicator, FlatList, Pressable, RefreshControl, StyleSheet, Text, TextInput, View } from 'react-native';
import { useAuth } from '../auth/AuthContext';
import { Badge, Empty } from '../components/ui';
import { api, ApiError } from '../lib/api';
import { enumLabel } from '../lib/format';
import type { CustomersStackParams } from '../navigation';
import { colors, radius, space } from '../theme';
import type { CustomerSummary, Paginated } from '../types';

const PAGE_SIZE = 25;

/** Customer list: server-side search (name, code, GSTIN, mobile — same endpoint as the web CRM), loaded a page at a time. */
export function CustomersScreen({ navigation }: NativeStackScreenProps<CustomersStackParams, 'CustomerList'>) {
  const { hasPermission } = useAuth();
  const canAdd = hasPermission('customer.manage');
  useLayoutEffect(() => {
    navigation.setOptions({
      headerRight: canAdd
        ? () => (
            <Pressable onPress={() => navigation.navigate('CustomerForm')} hitSlop={12} accessibilityRole="button" accessibilityLabel="Add customer">
              <Text style={styles.headerBtn}>+ New</Text>
            </Pressable>
          )
        : undefined,
    });
  }, [navigation, canAdd]);
  const [input, setInput] = useState('');
  const [search, setSearch] = useState('');
  // Wait for a pause in typing before asking the server.
  useEffect(() => {
    const t = setTimeout(() => setSearch(input.trim()), 350);
    return () => clearTimeout(t);
  }, [input]);

  const list = useInfiniteQuery({
    queryKey: ['customers', search],
    initialPageParam: 1,
    queryFn: ({ pageParam }) => api.get<Paginated<CustomerSummary>>('/customers', { search: search || undefined, page: pageParam, pageSize: PAGE_SIZE }),
    getNextPageParam: (last) => (last.page * last.pageSize < last.total ? last.page + 1 : undefined),
  });
  const items = list.data?.pages.flatMap((p) => p.items) ?? [];
  const total = list.data?.pages[0]?.total ?? 0;

  return (
    <View style={styles.screen}>
      <View style={styles.searchBox}>
        <TextInput
          value={input}
          onChangeText={setInput}
          placeholder="Search name, code, GSTIN, mobile…"
          placeholderTextColor={colors.muted}
          style={styles.search}
          autoCapitalize="none"
          autoCorrect={false}
          returnKeyType="search"
          accessibilityLabel="Search customers"
        />
        {list.data ? <Text style={styles.count}>{total.toLocaleString('en-IN')} customer{total === 1 ? '' : 's'}</Text> : null}
      </View>
      {list.isError ? <Text style={styles.error}>{list.error instanceof ApiError ? list.error.message : 'Could not load customers.'}</Text> : null}
      <FlatList
        data={items}
        keyExtractor={(c) => c.id}
        contentContainerStyle={styles.list}
        refreshControl={<RefreshControl refreshing={list.isRefetching && !list.isFetchingNextPage} onRefresh={() => void list.refetch()} />}
        onEndReachedThreshold={0.4}
        onEndReached={() => {
          if (list.hasNextPage && !list.isFetchingNextPage) void list.fetchNextPage();
        }}
        ListEmptyComponent={list.isLoading ? <ActivityIndicator style={styles.loading} color={colors.primary} /> : <Empty title={search ? 'No customer matches your search' : 'No customers yet'} />}
        ListFooterComponent={list.isFetchingNextPage ? <ActivityIndicator style={styles.loading} color={colors.primary} /> : null}
        renderItem={({ item }) => {
          const address = item.addresses?.[0];
          return (
            <Pressable style={({ pressed }) => [styles.item, pressed && styles.pressed]} onPress={() => navigation.navigate('CustomerDetail', { id: item.id, name: item.name })} accessibilityRole="button">
              <View style={styles.itemHead}>
                <Text style={styles.name} numberOfLines={2}>
                  {item.name}
                </Text>
                <Badge value={item.status} label={enumLabel(item.status)} />
              </View>
              <Text style={styles.meta}>
                {item.customerCode}
                {address ? ` · ${address.city}, ${address.state}` : ''}
              </Text>
              {item.phone ? <Text style={styles.meta}>{item.phone}</Text> : null}
              {item.assignee ? <Text style={styles.meta}>Sales person: {item.assignee.fullName}</Text> : null}
            </Pressable>
          );
        }}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.bg },
  headerBtn: { color: '#ffffff', fontSize: 15, fontWeight: '700' },
  searchBox: { padding: space.lg, paddingBottom: space.sm },
  search: { minHeight: 46, borderWidth: 1, borderColor: colors.border, borderRadius: radius.md, paddingHorizontal: space.md, fontSize: 15, color: colors.text, backgroundColor: colors.surface },
  count: { marginTop: space.sm, fontSize: 12.5, color: colors.muted },
  error: { color: colors.danger, paddingHorizontal: space.lg, paddingBottom: space.sm },
  list: { paddingHorizontal: space.lg, paddingBottom: space.xl, flexGrow: 1 },
  loading: { padding: space.xl },
  item: { backgroundColor: colors.surface, borderRadius: radius.lg, borderWidth: 1, borderColor: colors.border, padding: space.lg, marginBottom: space.sm },
  pressed: { opacity: 0.75 },
  itemHead: { flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between', gap: space.sm, marginBottom: 2 },
  name: { flex: 1, fontSize: 15, fontWeight: '700', color: colors.text },
  meta: { fontSize: 13, color: colors.muted, marginTop: 2 },
});
