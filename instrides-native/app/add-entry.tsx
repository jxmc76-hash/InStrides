import { useState } from 'react';
import {
  View, Text, TextInput, TouchableOpacity, ScrollView, StyleSheet,
  useColorScheme, ActivityIndicator, Alert,
} from 'react-native';
import { useRouter } from 'expo-router';
import { useLogData } from '../src/lib/useLogData';
import { Colors } from '../src/constants/Colors';

const CATEGORIES: Record<string, string> = {
  RUN: 'cardio', CYCLE: 'cardio', SWIM: 'cardio', WALK: 'cardio',
  GYM: 'gym', YOGA: 'time', PILATES: 'time',
};

function getCategory(type: string) {
  return CATEGORIES[type.toUpperCase()] ?? 'other';
}

const RUN_SUBTYPES = ['Tempo', 'Hills', 'Distance', 'Speed', 'Warm Down', 'Easy'];

export default function AddEntryScreen() {
  const { logData, addEntry } = useLogData();
  const router = useRouter();
  const rawScheme = useColorScheme();
  const scheme = (rawScheme ?? 'light') as 'light' | 'dark';
  const c = Colors[scheme];

  const today = new Date().toISOString().split('T')[0];
  const [date, setDate] = useState(today);
  const [type, setType] = useState(logData.types[0] ?? 'RUN');
  const [distance, setDistance] = useState('');
  const [duration, setDuration] = useState('');
  const [details, setDetails] = useState('');
  const [subType, setSubType] = useState('');
  const [saving, setSaving] = useState(false);

  const cat = getCategory(type);
  const isRun = type.toUpperCase() === 'RUN';

  const handleSave = async () => {
    if (!date || !type) { Alert.alert('Required', 'Date and activity type are required.'); return; }
    setSaving(true);
    try {
      await addEntry({
        date,
        type,
        details: details.trim() || undefined,
        distance: distance ? parseFloat(distance) : null,
        distanceUnit: 'km',
        duration: duration ? parseInt(duration, 10) : null,
        subType: subType || null,
        isPlanned: false,
        mark: null,
        learnings: [],
        customMetricData: {},
      });
      router.back();
    } catch {
      Alert.alert('Error', 'Failed to save. Please try again.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <ScrollView style={[styles.container, { backgroundColor: c.background }]} contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">

      <View style={styles.field}>
        <Text style={[styles.label, { color: c.textMuted }]}>Date</Text>
        <TextInput
          style={[styles.input, { color: c.text, borderColor: c.border, backgroundColor: c.card }]}
          value={date}
          onChangeText={setDate}
          placeholder="YYYY-MM-DD"
          placeholderTextColor={c.textMuted}
        />
      </View>

      <View style={styles.field}>
        <Text style={[styles.label, { color: c.textMuted }]}>Activity Type</Text>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chips}>
          {logData.types.map((t) => (
            <TouchableOpacity
              key={t}
              style={[styles.chip, { borderColor: c.border }, type === t && { backgroundColor: Colors.primary, borderColor: Colors.primary }]}
              onPress={() => setType(t)}
            >
              <Text style={[styles.chipText, { color: type === t ? '#fff' : c.text }]}>{t}</Text>
            </TouchableOpacity>
          ))}
        </ScrollView>
      </View>

      {(cat === 'cardio' || isRun) ? (
        <View style={styles.field}>
          <Text style={[styles.label, { color: c.textMuted }]}>Distance (km)</Text>
          <TextInput
            style={[styles.input, { color: c.text, borderColor: c.border, backgroundColor: c.card }]}
            value={distance}
            onChangeText={setDistance}
            keyboardType="decimal-pad"
            placeholder="e.g. 8.5"
            placeholderTextColor={c.textMuted}
          />
        </View>
      ) : null}

      <View style={styles.field}>
        <Text style={[styles.label, { color: c.textMuted }]}>Duration (min)</Text>
        <TextInput
          style={[styles.input, { color: c.text, borderColor: c.border, backgroundColor: c.card }]}
          value={duration}
          onChangeText={setDuration}
          keyboardType="number-pad"
          placeholder="e.g. 45"
          placeholderTextColor={c.textMuted}
        />
      </View>

      {isRun ? (
        <View style={styles.field}>
          <Text style={[styles.label, { color: c.textMuted }]}>Run Type</Text>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chips}>
            {RUN_SUBTYPES.map((st) => (
              <TouchableOpacity
                key={st}
                style={[styles.chip, { borderColor: c.border }, subType === st && { backgroundColor: Colors.primary, borderColor: Colors.primary }]}
                onPress={() => setSubType(subType === st ? '' : st)}
              >
                <Text style={[styles.chipText, { color: subType === st ? '#fff' : c.text }]}>{st}</Text>
              </TouchableOpacity>
            ))}
          </ScrollView>
        </View>
      ) : null}

      <View style={styles.field}>
        <Text style={[styles.label, { color: c.textMuted }]}>Notes</Text>
        <TextInput
          style={[styles.input, styles.textarea, { color: c.text, borderColor: c.border, backgroundColor: c.card }]}
          value={details}
          onChangeText={setDetails}
          multiline
          numberOfLines={3}
          placeholder="How did it go?"
          placeholderTextColor={c.textMuted}
        />
      </View>

      <TouchableOpacity
        style={[styles.saveBtn, { backgroundColor: Colors.primary }, saving && { opacity: 0.7 }]}
        onPress={handleSave}
        disabled={saving}
      >
        {saving ? <ActivityIndicator color="#fff" /> : <Text style={styles.saveBtnText}>Save Activity</Text>}
      </TouchableOpacity>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  content: { padding: 20, gap: 20, paddingBottom: 40 },
  field: { gap: 8 },
  label: { fontSize: 13, fontWeight: '600', textTransform: 'uppercase', letterSpacing: 0.5 },
  input: { borderWidth: 1, borderRadius: 10, paddingHorizontal: 14, paddingVertical: 12, fontSize: 16 },
  textarea: { height: 88, textAlignVertical: 'top' },
  chips: { gap: 8, paddingVertical: 2 },
  chip: { borderWidth: 1.5, borderRadius: 20, paddingHorizontal: 14, paddingVertical: 7 },
  chipText: { fontSize: 14, fontWeight: '600' },
  saveBtn: { borderRadius: 14, paddingVertical: 16, alignItems: 'center', marginTop: 8 },
  saveBtnText: { color: '#fff', fontSize: 16, fontWeight: '700' },
});
