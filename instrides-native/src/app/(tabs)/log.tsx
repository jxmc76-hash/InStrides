import { useMemo, useState } from 'react';
import {
  View, Text, ScrollView, TouchableOpacity, StyleSheet,
  useColorScheme, ActivityIndicator, Modal, Pressable, TextInput,
} from 'react-native';
import { Colors } from '../../constants/Colors';
import { useHealthKit, type DailyHealthData, type WorkoutType } from '../../lib/useHealthKit';
import { useUserData } from '../../lib/useUserData';

const WORKOUT_COLORS: Record<WorkoutType, string> = {
  RUN:  '#E8593A',
  YOGA: '#E8A23A',
  GYM:  '#7C4DCA',
  SWIM: '#2BB5C8',
  SIT:  '#E85A5A',
};

function getWeekKey(date: string): string {
  const d = new Date(date + 'T00:00:00');
  const mon = new Date(d);
  mon.setDate(d.getDate() - ((d.getDay() + 6) % 7));
  return mon.toISOString().split('T')[0];
}

function formatDayShort(date: string): { top: string; bottom: string } {
  const d = new Date(date + 'T00:00:00');
  const days = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
  const months = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
  return {
    top: `${days[d.getDay()]} ${d.getDate()}`,
    bottom: months[d.getMonth()],
  };
}

function formatWeekRange(key: string): string {
  const start = new Date(key + 'T00:00:00');
  const end = new Date(start);
  end.setDate(start.getDate() + 6);
  const fmt = (d: Date) => `${d.getDate()} ${['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'][d.getMonth()]}`;
  return `${fmt(start)} – ${fmt(end)}`;
}

function WorkoutCell({ day, type, gymWeights }: { day: DailyHealthData; type: WorkoutType; gymWeights: Record<string,number> }) {
  const workouts = day.workouts.filter(w => w.type === type);
  if (workouts.length === 0) return <Text style={styles.cellAdd}>+</Text>;

  const color = WORKOUT_COLORS[type];
  const total = workouts.reduce((s, w) => s + w.duration, 0);

  let detail = `${total}m`;
  if (type === 'RUN' && workouts[0].distance) {
    detail = `${workouts[0].distance.toFixed(1)}km`;
  } else if (type === 'SWIM' && workouts[0].distance) {
    detail = `${(workouts[0].distance * 1000).toFixed(0)}m`;
  } else if (type === 'GYM') {
    const kg = gymWeights[workouts[0].id];
    if (kg) detail = `${total}m·${kg}kg`;
  } else if (type === 'SIT') {
    detail = `${total}m`;
  }

  return (
    <View style={styles.workoutDone}>
      <Text style={[styles.tick, { color }]}>✓</Text>
      <Text style={[styles.workoutDetail, { color }]} numberOfLines={2}>{detail}</Text>
    </View>
  );
}

// Carry forward VO2 and weight values to days that don't have them
function fillForward(data: DailyHealthData[]): DailyHealthData[] {
  let lastVo2: number | undefined;
  let lastWeight: number | undefined;
  return [...data].reverse().map(d => {
    if (d.vo2Max) lastVo2 = d.vo2Max;
    if (d.weight) lastWeight = d.weight;
    return { ...d, vo2Max: d.vo2Max ?? lastVo2, weight: d.weight ?? lastWeight };
  }).reverse();
}

interface EnergyModalProps {
  date: string;
  current?: number;
  visible: boolean;
  onSave: (v: number) => void;
  onClose: () => void;
  scheme: 'light' | 'dark';
}

function EnergyModal({ date, current, visible, onSave, onClose, scheme }: EnergyModalProps) {
  const c = Colors[scheme];
  const [val, setVal] = useState(current ?? 7);

  const d = new Date(date + 'T00:00:00');
  const label = d.toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long' });

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <Pressable style={styles.modalOverlay} onPress={onClose}>
        <Pressable style={[styles.energySheet, { backgroundColor: c.card }]} onPress={() => {}}>
          <Text style={[styles.energyTitle, { color: c.text }]}>Energy Score</Text>
          <Text style={[styles.energyDate, { color: c.textMuted }]}>{label}</Text>
          <Text style={[styles.energyValue, { color: Colors.primary }]}>{val}</Text>
          <View style={styles.energySlider}>
            {[1,2,3,4,5,6,7,8,9,10].map(n => (
              <TouchableOpacity
                key={n}
                style={[styles.energyDot, { backgroundColor: n <= val ? Colors.primary : c.border }]}
                onPress={() => setVal(n)}
              />
            ))}
          </View>
          <Text style={[styles.energyHint, { color: c.textMuted }]}>How did you feel today?</Text>
          <TouchableOpacity style={[styles.saveBtn, { backgroundColor: Colors.primary }]} onPress={() => { onSave(val); onClose(); }}>
            <Text style={styles.saveBtnText}>Save</Text>
          </TouchableOpacity>
        </Pressable>
      </Pressable>
    </Modal>
  );
}

export default function LogScreen() {
  const rawScheme = useColorScheme();
  const scheme = (rawScheme ?? 'light') as 'light' | 'dark';
  const c = Colors[scheme];

  const { data, loading } = useHealthKit();
  const { store, setEnergy, setNotes } = useUserData();

  const [energyModal, setEnergyModal] = useState<{ date: string; current?: number } | null>(null);

  const filled = useMemo(() => fillForward(data), [data]);

  // Group into weeks
  const weeks = useMemo(() => {
    const map = new Map<string, DailyHealthData[]>();
    for (const day of filled) {
      const wk = getWeekKey(day.date);
      if (!map.has(wk)) map.set(wk, []);
      map.get(wk)!.push(day);
    }
    return Array.from(map.entries()).sort((a, b) => b[0].localeCompare(a[0]));
  }, [filled]);

  const types: WorkoutType[] = (store.selectedWorkoutTypes as WorkoutType[]);

  if (loading) {
    return (
      <View style={[styles.centered, { backgroundColor: c.background }]}>
        <ActivityIndicator color={Colors.primary} />
      </View>
    );
  }

  return (
    <View style={[styles.container, { backgroundColor: c.background }]}>
      <ScrollView horizontal showsHorizontalScrollIndicator={false}>
        <View>
          {/* Column headers */}
          <View style={[styles.headerRow, { backgroundColor: c.card, borderBottomColor: c.border }]}>
            <Text style={[styles.hDate, { color: c.textMuted }]}>DATE</Text>
            <Text style={[styles.hCell, { color: c.textMuted }]}>SLEEP</Text>
            <Text style={[styles.hCell, { color: c.textMuted }]}>NRG</Text>
            <Text style={[styles.hCell, { color: c.textMuted }]}>VO₂</Text>
            <Text style={[styles.hCell, { color: c.textMuted }]}>KG</Text>
            {types.map(t => (
              <Text key={t} style={[styles.hCell, { color: WORKOUT_COLORS[t] }]}>{t}</Text>
            ))}
          </View>

          <ScrollView>
            {weeks.map(([weekKey, days]) => {
              // Weekly summary
              const totalWorkouts = days.reduce((s, d) => s + d.workouts.length, 0);
              const avgSleep = days.filter(d => d.sleepScore).length > 0
                ? Math.round(days.reduce((s, d) => s + (d.sleepScore ?? 0), 0) / days.filter(d => d.sleepScore).length)
                : null;
              const avgEnergy = days.filter(d => store.days[d.date]?.energy).length > 0
                ? (days.reduce((s, d) => s + (store.days[d.date]?.energy ?? 0), 0) / days.filter(d => store.days[d.date]?.energy).length).toFixed(1)
                : null;
              const latestVo2 = days.find(d => d.vo2Max)?.vo2Max;
              const latestWeight = days.find(d => d.weight)?.weight;

              return (
                <View key={weekKey}>
                  {/* Week summary row */}
                  <View style={[styles.weekRow, { backgroundColor: c.background, borderBottomColor: c.border }]}>
                    <Text style={[styles.weekLabel, { color: c.textMuted }]}>{formatWeekRange(weekKey)}</Text>
                    <Text style={[styles.weekCell, { color: c.textMuted }]}>{avgSleep ?? '—'}</Text>
                    <Text style={[styles.weekCell, { color: c.textMuted }]}>{avgEnergy ?? '—'}</Text>
                    <Text style={[styles.weekCell, { color: c.textMuted }]}>{latestVo2 ?? '—'}</Text>
                    <Text style={[styles.weekCell, { color: c.textMuted }]}>{latestWeight ?? '—'}</Text>
                    {types.map(t => (
                      <Text key={t} style={[styles.weekCell, { color: c.textMuted }]}>
                        {days.filter(d => d.workouts.some(w => w.type === t)).length > 0
                          ? `${days.filter(d => d.workouts.some(w => w.type === t)).length}d`
                          : '—'}
                      </Text>
                    ))}
                  </View>

                  {/* Day rows */}
                  {days.map(day => {
                    const dayLabel = formatDayShort(day.date);
                    const energy = store.days[day.date]?.energy;
                    return (
                      <View key={day.date} style={[styles.dayRow, { borderBottomColor: c.border }]}>
                        <View style={styles.dateColWide}>
                          <Text style={[styles.dayTop, { color: c.text }]}>{dayLabel.top}</Text>
                          <Text style={[styles.dayBot, { color: c.textMuted }]}>{dayLabel.bottom}</Text>
                        </View>

                        {/* Sleep */}
                        <View style={styles.metricCell}>
                          {day.sleepScore
                            ? <Text style={[styles.metricVal, { color: c.textSecondary }]}>{day.sleepScore}</Text>
                            : <Text style={styles.cellAdd}>+</Text>}
                        </View>

                        {/* Energy */}
                        <TouchableOpacity
                          style={styles.metricCell}
                          onPress={() => setEnergyModal({ date: day.date, current: energy })}
                        >
                          {energy
                            ? <View style={styles.energyBadge}><Text style={styles.energyBadgeText}>{energy}</Text></View>
                            : <Text style={styles.cellAdd}>+</Text>}
                        </TouchableOpacity>

                        {/* VO2 */}
                        <View style={styles.metricCell}>
                          {day.vo2Max
                            ? <Text style={[styles.metricVal, { color: c.textMuted }]}>{day.vo2Max}</Text>
                            : <Text style={styles.cellAdd}>+</Text>}
                        </View>

                        {/* Weight */}
                        <View style={styles.metricCell}>
                          {day.weight
                            ? <Text style={[styles.metricVal, { color: c.textMuted }]}>{day.weight}</Text>
                            : <Text style={styles.cellAdd}>+</Text>}
                        </View>

                        {/* Workout columns */}
                        {types.map(t => (
                          <View key={t} style={styles.metricCell}>
                            <WorkoutCell day={day} type={t} gymWeights={store.gymWeights} />
                          </View>
                        ))}
                      </View>
                    );
                  })}
                </View>
              );
            })}
          </ScrollView>
        </View>
      </ScrollView>

      {energyModal && (
        <EnergyModal
          date={energyModal.date}
          current={energyModal.current}
          visible
          onSave={(v) => setEnergy(energyModal.date, v)}
          onClose={() => setEnergyModal(null)}
          scheme={scheme}
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  centered: { flex: 1, justifyContent: 'center', alignItems: 'center' },

  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 8,
    borderBottomWidth: 1,
    paddingLeft: 12,
  },
  hDate: { width: 70, fontSize: 9, fontWeight: '700', letterSpacing: 0.5 },
  hCell: { width: 56, fontSize: 9, fontWeight: '700', letterSpacing: 0.5, textAlign: 'center' },

  weekRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 6,
    borderBottomWidth: 2,
    paddingLeft: 12,
    opacity: 0.7,
  },
  weekLabel: { width: 70, fontSize: 10, fontWeight: '700' },
  weekCell: { width: 56, fontSize: 10, fontWeight: '600', textAlign: 'center' },

  dayRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 6,
    borderBottomWidth: StyleSheet.hairlineWidth,
    paddingLeft: 12,
  },
  dateColWide: { width: 70 },
  dayTop: { fontSize: 12, fontWeight: '600' },
  dayBot: { fontSize: 10 },

  metricCell: { width: 56, alignItems: 'center', justifyContent: 'center', minHeight: 36 },
  metricVal: { fontSize: 12, fontVariant: ['tabular-nums'] },
  cellAdd: { fontSize: 16, color: '#C7C7CC' },

  workoutDone: { alignItems: 'center' },
  tick: { fontSize: 12, fontWeight: '800' },
  workoutDetail: { fontSize: 10, fontWeight: '600', textAlign: 'center' },

  energyBadge: {
    width: 24, height: 24, borderRadius: 12,
    backgroundColor: '#D4F7D4',
    alignItems: 'center', justifyContent: 'center',
  },
  energyBadgeText: { fontSize: 11, fontWeight: '800', color: '#2A7A2A' },

  // Energy modal
  modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'center', alignItems: 'center' },
  energySheet: {
    width: 300, borderRadius: 20, padding: 24, alignItems: 'center',
    shadowColor: '#000', shadowOffset: { width: 0, height: 8 }, shadowOpacity: 0.2, shadowRadius: 20,
  },
  energyTitle: { fontSize: 18, fontWeight: '800', marginBottom: 4 },
  energyDate: { fontSize: 13, marginBottom: 20 },
  energyValue: { fontSize: 48, fontWeight: '900', marginBottom: 12 },
  energySlider: { flexDirection: 'row', gap: 8, marginBottom: 12 },
  energyDot: { width: 22, height: 22, borderRadius: 11 },
  energyHint: { fontSize: 12, marginBottom: 20 },
  saveBtn: { width: '100%', padding: 14, borderRadius: 12, alignItems: 'center' },
  saveBtnText: { color: '#fff', fontSize: 16, fontWeight: '700' },
});
