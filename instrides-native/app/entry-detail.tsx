import { View, Text, ScrollView, TouchableOpacity, StyleSheet, useColorScheme, Alert } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useLogData } from '../src/lib/useLogData';
import { Colors } from '../src/constants/Colors';

function Row({ label, value, scheme }: { label: string; value: string; scheme: 'light' | 'dark' }) {
  const c = Colors[scheme];
  return (
    <View style={[styles.row, { borderBottomColor: c.separator }]}>
      <Text style={[styles.rowLabel, { color: c.textMuted }]}>{label}</Text>
      <Text style={[styles.rowValue, { color: c.text }]}>{value}</Text>
    </View>
  );
}

export default function EntryDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { logData, deleteEntry } = useLogData();
  const router = useRouter();
  const rawScheme = useColorScheme();
  const scheme = (rawScheme ?? 'light') as 'light' | 'dark';
  const c = Colors[scheme];

  const entry = logData.entries.find((e) => String(e.id) === id);

  if (!entry) {
    return (
      <View style={[styles.centered, { backgroundColor: c.background }]}>
        <Text style={{ color: c.textMuted }}>Activity not found.</Text>
      </View>
    );
  }

  const fmtDate = new Date(entry.date + 'T00:00:00').toLocaleDateString('en-GB', {
    weekday: 'long', day: 'numeric', month: 'long', year: 'numeric',
  });

  const handleDelete = () => {
    Alert.alert('Delete Activity', 'Are you sure?', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete', style: 'destructive',
        onPress: async () => { await deleteEntry(entry.id); router.back(); },
      },
    ]);
  };

  return (
    <ScrollView style={[styles.container, { backgroundColor: c.background }]} contentContainerStyle={styles.content}>
      <View style={[styles.card, { backgroundColor: c.card }]}>
        <Text style={[styles.type, { color: Colors.primary }]}>{entry.type}</Text>
        {entry.subType ? <Text style={[styles.subType, { color: c.textMuted }]}>{entry.subType}</Text> : null}
        <Text style={[styles.date, { color: c.textSecondary }]}>{fmtDate}</Text>
      </View>

      <View style={[styles.card, { backgroundColor: c.card }]}>
        {entry.distance ? <Row label="Distance" value={`${entry.distance} ${entry.distanceUnit ?? 'km'}`} scheme={scheme} /> : null}
        {entry.duration ? <Row label="Duration" value={`${entry.duration} min`} scheme={scheme} /> : null}
        {entry.reps ? <Row label="Reps" value={String(entry.reps)} scheme={scheme} /> : null}
        {entry.weight ? <Row label="Weight" value={`${entry.weight} ${entry.weightUnit ?? 'kg'}`} scheme={scheme} /> : null}
        {entry.otherRating ? <Row label="Effort" value={`${entry.otherRating}/10`} scheme={scheme} /> : null}
        {entry.details ? <Row label="Notes" value={entry.details} scheme={scheme} /> : null}
        {entry.learnings?.length ? <Row label="Learnings" value={entry.learnings.join(', ')} scheme={scheme} /> : null}
      </View>

      <TouchableOpacity style={[styles.deleteBtn, { backgroundColor: c.card }]} onPress={handleDelete}>
        <Ionicons name="trash-outline" size={18} color={c.destructive} />
        <Text style={[styles.deleteBtnText, { color: c.destructive }]}>Delete Activity</Text>
      </TouchableOpacity>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  centered: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  content: { padding: 16, gap: 12, paddingBottom: 40 },
  card: { borderRadius: 14, padding: 20, shadowColor: '#000', shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.06, shadowRadius: 4, elevation: 2 },
  type: { fontSize: 28, fontWeight: '800', marginBottom: 2 },
  subType: { fontSize: 15, marginBottom: 4 },
  date: { fontSize: 15 },
  row: { flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 12, borderBottomWidth: StyleSheet.hairlineWidth },
  rowLabel: { fontSize: 15 },
  rowValue: { fontSize: 15, fontWeight: '600', maxWidth: '60%', textAlign: 'right' },
  deleteBtn: { borderRadius: 14, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', padding: 16, gap: 8 },
  deleteBtnText: { fontSize: 16, fontWeight: '600' },
});
