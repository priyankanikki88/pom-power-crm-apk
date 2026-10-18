import { useQuery } from '@tanstack/react-query';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { useEffect, useState } from 'react';
import { ActivityIndicator, FlatList, Pressable, RefreshControl, StyleSheet, Text, TextInput, View } from 'react-native';
import { Empty, ErrorBox, text } from '../components/ui';
import { api, ApiError } from '../lib/api';
import { formatINR } from '../lib/format';
import type { ProductsStackParams } from '../navigation';
import { colors, radius, space } from '../theme';
import type { Paginated, ProductVariant } from '../types';

/** Read-only product catalogue browse for the field sales team — search by name, rating or code. Adding / editing products stays on the web CRM. */
export function ProductsScreen({ navigation }: NativeStackScreenProps<ProductsStackParams, 'ProductList'>) {
  const [input, setInput] = useState('');
  const [term, setTerm] = useState('');
  // Wait for a pause in typing before asking the server.
  useEffect(() => {
    const t = setTimeout(() => setTerm(input.trim()), 350);
    return () => clearTimeout(t);
  }, [input]);
  const q = useQuery({
    queryKey: ['products', 'list', term],
    queryFn: () => api.get<Paginated<ProductVariant>>('/products', { search: term || undefined, active: 'true', pageSize: 50 }),
  });
  const items = q.data?.items ?? [];

  return (
    <View style={styles.screen}>
      <View style={styles.searchWrap}>
        <TextInput
          style={styles.search}
          placeholder="Search product — name, rating, code"
          placeholderTextColor={colors.muted}
          value={input}
          onChangeText={setInput}
          autoComplete="off"
          accessibilityLabel="Search products"
        />
      </View>
      {q.isError ? <ErrorBox message={q.error instanceof ApiError ? q.error.message : 'Could not load products.'} /> : null}
      <FlatList
        data={items}
        keyExtractor={(i) => i.id}
        contentContainerStyle={styles.body}
        refreshControl={<RefreshControl refreshing={q.isRefetching} onRefresh={() => void q.refetch()} />}
        ListEmptyComponent={
          q.isLoading ? <ActivityIndicator color={colors.primary} style={{ padding: space.xl }} /> : <Empty title="No products found" hint={term ? 'Try a different search.' : undefined} />
        }
        renderItem={({ item }) => (
          <Pressable style={styles.row} onPress={() => navigation.navigate('ProductDetail', { id: item.id })} accessibilityRole="button">
            <Text style={text.h2}>{item.productName ?? item.model.name}</Text>
            <Text style={text.muted}>
              {item.productCode}
              {item.rating ? ` · ${item.rating}` : ''}
            </Text>
            {item.priceHistory[0] ? <Text style={styles.price}>{formatINR(item.priceHistory[0].price)}</Text> : <Text style={text.muted}>Price not set</Text>}
          </Pressable>
        )}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.bg },
  searchWrap: { padding: space.lg, paddingBottom: space.sm },
  search: { minHeight: 48, borderWidth: 1, borderColor: colors.border, borderRadius: radius.md, paddingHorizontal: space.md, fontSize: 15, color: colors.text, backgroundColor: colors.surface },
  body: { paddingHorizontal: space.lg, paddingBottom: space.xl },
  row: { backgroundColor: colors.surface, borderRadius: radius.lg, borderWidth: 1, borderColor: colors.border, padding: space.lg, marginBottom: space.md },
  price: { marginTop: space.xs, fontSize: 15, fontWeight: '700', color: colors.text },
});
