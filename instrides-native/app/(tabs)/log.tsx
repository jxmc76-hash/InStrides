import { useMemo } from 'react';
import {
  View, Text, FlatList, TouchableOpacity, StyleSheet,
  useColorScheme, ActivityIndicator,
} from 'react-native';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useLogData } from '../../lib/useLogData';
import { Colors } from '../../constants/Colors';
import type { Entry } from '../../constants/types';

const TYPE_COLORS: Record<string, string> = {
  RUN: '#FF5500', GYM: '#6366f1', YOGA: '#10b981', SWIM: '#0ea5e9',
  CYCLE: '#f59e0b', WALK: '#84cc16',
};

function typeColor(type: string) {
  return TYPE_COLORS[type.toUpperCase()] ?? '#8E8E93';
}

function entryMetric(entry: Entry) {
  if (entry.distance) {
    const d = entry.distance >= 10 ? Math.round(entry.distance) : +entry.distance.toFixed(1);
    return `${d} ${entry.distanceUnit ?? 'km'}`;
  }
  if (entry.duration) return `${entry.duration} min`;
  if (entry.reps) return `${entry.reps} reps`;
  return '';
}

function fmtDate(dateStr: string) {
  const d = new Date(dateStr + 'T00:00:00');
  const today = new Date(); today.setHours(0, 0, 0, 0);
  const diff = Math.round((today.getTime() - d.getTime()) / 86400000);
  if (diff === 0) return 'Today';
  if (diff === 1) return 'Yesterday';
  return d.toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short' });
}

function EntryCard({ entry, onPress, scheme }: { entry: Entry; onPress: () => void; scheme: 'light' | 'dark' }) {
  const c = Colors[scheme];
  const metric = entryMetric(entry);
  const color = typeColor(entry.type);

  return (
    <TouchableOpacity onPress={onPress} style={[styles.card, { backgroundColor: c.card }]} activeOpacity={0.7}>
      <View style={[styles.typeBar, { backgroundColor: color }]} />
      <View style={styles.cardContent}>
        <View style={styles.cardTop}>
          <Text style={[styles.typeName, { color: c.text }]}>{entry.type}</Text>
          {metric ? <Text style={[styles.metric, { color: Colors.primary }]}>{metric}</Text> : null}
        </View>
        <View style={styles.cardBottom}>
          <Text style={[styles.dateText, { color: c.textMuted }]}>{fmtDate(entry.date)}</Text>
          {entry.subType ? <Text style={[styles.subType, { color: c.textMuted }]}>{entry.subType}</Text> : null}
        </View>
        {entry.details ? <Text style={[styles.details, { color: c.textSecondary }]} numberOfLines={1}>{entry.details}</Text> : null}
      </View>
      <Ionicons name="chevron-forward" size={16} color={c.textMuted} style={styles.chevron} />
    </TouchableOpacity>
  );
}

export default function LogScreen() {
  const { logData, loading } = useLogData();
  const router = useRouter();
  const rawScheme = useColorScheme();
  const scheme = (rawScheme ?? 'light') as 'light' | 'dark';
  const c = Colors[scheme];

  const entries = useMemo(
    () => [...logData.entries].filter((e) => !e.isPlanned).sort((a, b) => b.date.localeCompare(a.date)),
    [logData.entries],
  );

  if (loading) {
    return (
      <View style={[styles.centered, { backgroundColor: c.background }]}>
        <ActivityIndicator color={Colors.primary} />
      </View>
    );
  }

  return (
    <View style={[styles.container, { backgroundColor: c.background }]}>
      <FlatList
        data={entries}
        keyExtractor={(e) => String(e.id)}
        contentContainerStyle={styles.list}
        ListEmptyComponent={
          <View style={styles.empty}>
            <Text style={[styles.emptyText, { color: c.textMuted }]}>No activities yet. Tap + to log your first one.</Text>
          </View>
        }
        renderItem={({ item }) => (
          <EntryCard
            entry={item}
            scheme={scheme}
            onPress={() => router.push({ pathname: '/entry-detail', params: { id: String(item.id) } })}
          />
        )}
      />

      <TouchableOpacity
        style={[styles.fab, { backgroundColor: Colors.primary }]}
        onPress={() => router.push('/add-entry')}
        activeOpacity={0.85}
      >
        <Ionicons name="add" size={30} color="#fff" />
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  centered: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  list: { padding: 16, gap: 10, paddingBottom: 100 },
  card: {
    borderRadius: 14, flexDirection: 'row', alignItems: 'center',
    overflow: 'hidden',
    shadowColor: '#000', shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.06, shadowRadius: 4, elevation: 2,
  },
  typeBar: { width: 4, alignSelf: 'stretch' },
  cardContent: { flex: 1, padding: 14 },
  cardTop: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 },
  typeName: { fontSize: 16, fontWeight: '700' },
  metric: { fontSize: 16, fontWeight: '800' },
  cardBottom: { flexDirection: 'row', gap: 8, alignItems: 'center' },
  dateText: { fontSize: 13 },
  subType: { fontSize: 13 },
  details: { fontSize: 13, marginTop: 4 },
  chevron: { marginRight: 12 },
  empty: { paddingTop: 80, alignItems: 'center' },
  emptyText: { fontSize: 15, textAlign: 'center', lineHeight: 22 },
  fab: {
    position: 'absolute', bottom: 24, right: 24,
    width: 58, height: 58, borderRadius: 29,
    justifyContent: 'center', alignItems: 'center',
    shadowColor: '#FF5500', shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.35, shadowRadius: 8, elevation: 6,
  },
});
