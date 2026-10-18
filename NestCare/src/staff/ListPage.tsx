// Shared list screen: title bar, optional stat tiles, search, filter pills, pull-to-refresh list.
import React, { useState } from 'react';
import { FlatList, RefreshControl, View, Text } from 'react-native';
import type { LucideIcon } from 'lucide-react-native';
import { Inbox } from 'lucide-react-native';
import { useLoad, matchesQ } from './hooks';
import { C, Empty, Pills, Screen, SearchBar } from './ui';

type Opt = { key: string; label: string };

export default function ListPage<T extends { _id?: string }>({
  title,
  subtitle,
  onBack,
  right,
  load,
  deps = [],
  searchOn,
  searchPlaceholder,
  filters,
  filterFn,
  renderItem,
  header,
  emptyText = 'Nothing here yet.',
  emptyIcon = Inbox,
  reloadKey,
}: {
  title: string;
  subtitle?: string;
  onBack?: () => void;
  right?: React.ReactNode;
  load: () => Promise<T[]>;
  deps?: any[];
  /** Strings to search in for each row. Omit to hide the search bar. */
  searchOn?: (item: T) => (string | undefined | null)[];
  searchPlaceholder?: string;
  filters?: Opt[];
  filterFn?: (item: T, key: string) => boolean;
  renderItem: (item: T, index: number) => React.ReactElement;
  /** Rendered above the search bar (stat tiles). */
  header?: (items: T[], reload: () => void) => React.ReactNode;
  emptyText?: string;
  emptyIcon?: LucideIcon;
  reloadKey?: number;
}) {
  const [q, setQ] = useState('');
  const [f, setF] = useState('');
  const { data, loading, refreshing, error, refresh, reload } = useLoad(load, [
    ...deps,
    reloadKey,
  ]);
  const items = (data ?? []).filter(
    it =>
      (!f || !filterFn || filterFn(it, f)) &&
      (!searchOn || matchesQ(q, ...searchOn(it))),
  );

  return (
    <Screen
      title={title}
      subtitle={subtitle}
      onBack={onBack}
      right={right}
      loading={loading && !data}
    >
      <FlatList
        data={items}
        keyExtractor={(it, i) => it._id ?? String(i)}
        renderItem={({ item, index }) => renderItem(item, index)}
        contentContainerStyle={{ paddingBottom: 40 }}
        keyboardShouldPersistTaps="handled"
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={refresh}
            tintColor={C.primary}
          />
        }
        ListHeaderComponent={
          <View>
            {header ? (
              <View style={{ padding: 12, paddingBottom: 0 }}>
                {header(data ?? [], reload)}
              </View>
            ) : null}
            {searchOn ? (
              <SearchBar
                value={q}
                onChange={setQ}
                placeholder={searchPlaceholder}
              />
            ) : null}
            {filters ? (
              <Pills options={filters} value={f} onChange={setF} />
            ) : null}
            {error ? (
              <Text style={{ color: C.danger, fontWeight: '700', padding: 12 }}>
                {error}
              </Text>
            ) : null}
          </View>
        }
        ListEmptyComponent={<Empty icon={emptyIcon} text={emptyText} />}
      />
    </Screen>
  );
}
