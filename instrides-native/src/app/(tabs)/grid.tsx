import { useMemo, useCallback, useState } from 'react';
import {
  View, Text, ScrollView, TouchableOpacity, StyleSheet,
  useColorScheme, ActivityIndicator, Modal, Pressable,
} from 'react-native';
import { Colors } from '../../constants/Colors';
import { useHealthKit, type DailyHealthData, type HealthWorkout, type WorkoutType } from '../../lib/useHealthKit';
import { useUserData } from '../../lib/useUserData';

const WORKOUT_COLORS: Record<WorkoutType, string> = {
  RUN:  '#E8593A',
  YOGA: '#E8A23A',
  GYM:  '#7C4DCA',
  SWIM: '#2BB5C8',
  SIT:  '#E85A5A',
};

const WORKOUT_LABELS: Record<WorkoutType, string> = {
  RUN: 'RUN', YOGA: 'YOGA', GYM: 'GYM', SWIM: 'SWIM', SIT: 'SIT',
};

const ALL_TYPES: WorkoutType[] = ['RUN', 'YOGA', 'GYM', 'SWIM', 'SIT'];

function formatDuration(min: number): string {
  if (min < 60) return `${min}m`;
  const h = Math.floor(min / 60);
  const m = min % 60;
  return m > 0 ? `${h}h${m}m` : `${h}h`;
}

function getWeekKey(date: string): string {
  const d = new Date(date + 'T00:00:00');
  const day = d.getDay();
  const mon = new Date(d);
  mon.setDate(d.getDate() - ((day + 6) % 7));
  return mon.toISOString().split('T')[0];
}

function formatDayLabel(date: string, isToday: boolean): string {
  if (isToday) return 'Today';
  const d = new Date(date + 'T00:00:00');
  const days = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
  return `${days[d.getDay()]} ${d.getDate()}`;
}

interface WorkoutCellProps {
  workouts: HealthWorkout[];
  type: WorkoutType;
  onPress: (workouts: HealthWorkout[]) => void;
}

function WorkoutCell({ workouts, type, onPress }: WorkoutCellProps) {
  if (workouts.length === 0) {
    return <View style={[styles.cell, styles.cellEmpty]} />;
  }
  const totalMin = workouts.reduce((s, w) => s + w.duration, 0);
  const color = WORKOUT_COLORS[type];
  return (
    <TouchableOpacity
      style={[styles.cell, { backgroundColor: color }]}
      onPress={() => onPress(workouts)}
      activeOpacity={0.75}
    >
      <Text style={styles.cellText}>{formatDuration(totalMin)}</Text>
    </TouchableOpacity>
  );
}

interface WorkoutDetailModalProps {
  workouts: HealthWorkout[];
  type: WorkoutType | null;
  visible: boolean;
  onClose: () => void;
  gymWeights: Record<string, number>;
  onSetGymWeight: (id: string, kg: number) => void;
  scheme: 'light' | 'dark';
}

function WorkoutDetailModal({ workouts, type, visible, onClose, gymWeights, onSetGymWeight, scheme }: WorkoutDetailModalProps) {
  const c = Colors[scheme];
  if (!type) return null;
  const color = WORKOUT_COLORS[type];

  const formatTime = (iso: string) => {
    const d = new Date(iso);
    return d.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' });
  };

  const formatPace = (w: HealthWorkout) => {
    if (!w.distance || w.distance === 0) return null;
    const minPerKm = w.duration / w.distance;
    const m = Math.floor(minPerKm);
    const s = Math.round((minPerKm - m) * 60);
    return `${m}:${String(s).padStart(2, '0')}/km`;
  };

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <Pressable style={styles.modalOverlay} onPress={onClose}>
        <Pressable style={[styles.modalSheet, { backgroundColor: c.card }]} onPress={() => {}}>
          <View style={[styles.modalHandle, { backgroundColor: c.border }]} />
          <View style={[styles.modalTypeBar, { backgroundColor: color }]} />
          <Text style={[styles.modalTitle, { color: c.text }]}>{WORKOUT_LABELS[type]}</Text>

          {workouts.length > 1 && (
            <Text style={[styles.modalSubtitle, { color: c.textMuted }]}>{workouts.length} sessions this day</Text>
          )}

          {workouts.map((w, i) => (
            <View key={w.id} style={[styles.workoutRow, { borderTopColor: c.border }]}>
              {workouts.length > 1 && (
                <Text style={[styles.workoutIndex, { color: c.textMuted }]}>Session {i + 1}</Text>
              )}

              {type === 'RUN' && (
                <>
                  <Row label="Start time" value={formatTime(w.startDate)} c={c} />
                  <Row label="Duration" value={formatDuration(w.duration)} c={c} />
                  {w.distance && <Row label="Distance" value={`${w.distance.toFixed(2)} km`} c={c} />}
                  {formatPace(w) && <Row label="Avg pace" value={formatPace(w)!} c={c} />}
                </>
              )}

              {type === 'SWIM' && (
                <>
                  <Row label="Duration" value={formatDuration(w.duration)} c={c} />
                  {w.distance && <Row label="Distance" value={`${(w.distance * 1000).toFixed(0)} m`} c={c} />}
                  {formatPace(w) && <Row label="Avg pace" value={formatPace(w)!} c={c} />}
                </>
              )}

              {type === 'GYM' && (
                <>
                  <Row label="Duration" value={formatDuration(w.duration)} c={c} />
                  <Row
                    label="Weight used"
                    value={gymWeights[w.id] ? `${gymWeights[w.id]} kg` : 'Tap to add'}
                    c={c}
                    onPress={() => {
                      // In a real app, prompt user for weight
                    }}
                  />
                </>
              )}

              {type === 'YOGA' && (
                <Row label="Duration" value={formatDuration(w.duration)} c={c} />
              )}

              {type === 'SIT' && (
                <Row label="Duration" value={formatDuration(w.duration)} c={c} />
              )}
            </View>
          ))}

          <TouchableOpacity style={[styles.closeBtn, { backgroundColor: color }]} onPress={onClose}>
            <Text style={styles.closeBtnText}>Close</Text>
          </TouchableOpacity>
        </Pressable>
      </Pressable>
    </Modal>
  );
}

function Row({ label, value, c, onPress }: { label: string; value: string; c: any; onPress?: () => void }) {
  return (
    <TouchableOpacity style={styles.detailRow} onPress={onPress} disabled={!onPress}>
      <Text style={[styles.detailLabel, { color: c.textMuted }]}>{label}</Text>
      <Text style={[styles.detailValue, { color: c.text }]}>{value}</Text>
    </TouchableOpacity>
  );
}

export default function GridScreen() {
  const rawScheme = useColorScheme();
  const scheme = (rawScheme ?? 'light') as 'light' | 'dark';
  const c = Colors[scheme];

  const { data, loading, authorized } = useHealthKit();
  const { store } = useUserData();
  const types = (store.selectedWorkoutTypes as WorkoutType[]).filter(t => ALL_TYPES.includes(t));

  const [modalWorkouts, setModalWorkouts] = useState<HealthWorkout[]>([]);
  const [modalType, setModalType] = useState<WorkoutType | null>(null);
  const [modalVisible, setModalVisible] = useState(false);

  const openModal = useCallback((workouts: HealthWorkout[], type: WorkoutType) => {
    setModalWorkouts(workouts);
    setModalType(type);
    setModalVisible(true);
  }, []);

  // Group data by week for separator rendering
  const rows = useMemo(() => {
    const result: Array<{ type: 'day'; day: DailyHealthData } | { type: 'sep'; key: string }> = [];
    let prevWeek: string | null = null;
    for (const day of data) {
      const week = getWeekKey(day.date);
      if (prevWeek !== null && week !== prevWeek) {
        result.push({ type: 'sep', key: `sep-${week}` });
      }
      result.push({ type: 'day', day });
      prevWeek = week;
    }
    return result;
  }, [data]);

  const today = new Date().toISOString().split('T')[0];

  if (!authorized && !loading) {
    return (
      <View style={[styles.centered, { backgroundColor: c.background }]}>
        <Text style={[styles.authText, { color: c.text }]}>Health access required</Text>
        <Text style={[styles.authSub, { color: c.textMuted }]}>Please grant access to Apple Health to view your workouts.</Text>
      </View>
    );
  }

  if (loading) {
    return (
      <View style={[styles.centered, { backgroundColor: c.background }]}>
        <ActivityIndicator color={Colors.primary} />
        <Text style={[styles.authSub, { color: c.textMuted }]}>Reading Health data…</Text>
      </View>
    );
  }

  return (
    <View style={[styles.container, { backgroundColor: c.background }]}>
      <ScrollView>
        {/* Header row */}
        <View style={[styles.headerRow, { backgroundColor: c.card, borderBottomColor: c.border }]}>
          <View style={styles.dateCol} />
          {types.map(t => (
            <View key={t} style={styles.workoutCol}>
              <Text style={[styles.colHeader, { color: WORKOUT_COLORS[t] }]}>{t}</Text>
            </View>
          ))}
        </View>

        {rows.map((row) => {
          if (row.type === 'sep') {
            return (
              <View key={row.key} style={styles.weekSep}>
                <View style={[styles.weekSepLine, { borderColor: c.border }]} />
              </View>
            );
          }
          const { day } = row;
          const isToday = day.date === today;
          return (
            <View
              key={day.date}
              style={[styles.dayRow, { borderBottomColor: c.border }]}
            >
              <View style={styles.dateCol}>
                <Text style={[styles.dateLabel, { color: isToday ? Colors.primary : c.textMuted }, isToday && styles.dateLabelToday]}>
                  {formatDayLabel(day.date, isToday)}
                </Text>
              </View>
              {types.map(t => {
                const workouts = day.workouts.filter(w => w.type === t);
                return (
                  <View key={t} style={styles.workoutCol}>
                    <WorkoutCell
                      workouts={workouts}
                      type={t}
                      onPress={(ws) => openModal(ws, t)}
                    />
                  </View>
                );
              })}
            </View>
          );
        })}
      </ScrollView>

      <WorkoutDetailModal
        workouts={modalWorkouts}
        type={modalType}
        visible={modalVisible}
        onClose={() => setModalVisible(false)}
        gymWeights={store.gymWeights}
        onSetGymWeight={() => {}}
        scheme={scheme}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  centered: { flex: 1, justifyContent: 'center', alignItems: 'center', padding: 32, gap: 12 },
  authText: { fontSize: 17, fontWeight: '700', textAlign: 'center' },
  authSub: { fontSize: 14, textAlign: 'center', lineHeight: 20, marginTop: 4 },

  headerRow: {
    flexDirection: 'row',
    paddingVertical: 10,
    borderBottomWidth: 1,
    position: 'sticky' as any,
    top: 0,
    zIndex: 10,
  },
  colHeader: {
    fontSize: 10,
    fontWeight: '800',
    letterSpacing: 0.6,
    textAlign: 'center',
    textTransform: 'uppercase',
  },

  dayRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 4,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },

  dateCol: { width: 64, paddingLeft: 12 },
  workoutCol: { flex: 1, paddingHorizontal: 2 },

  dateLabel: { fontSize: 11, fontWeight: '500' },
  dateLabelToday: { fontWeight: '800' },

  cell: {
    borderRadius: 8,
    minHeight: 36,
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 6,
    paddingHorizontal: 2,
  },
  cellEmpty: { backgroundColor: 'rgba(142,142,147,0.15)' },
  cellText: { fontSize: 10, fontWeight: '800', color: '#fff' },

  weekSep: { paddingVertical: 2 },
  weekSepLine: { borderTopWidth: 2, borderStyle: 'dashed', marginHorizontal: 12 },

  // Modal
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.4)',
    justifyContent: 'flex-end',
  },
  modalSheet: {
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    paddingBottom: 40,
    paddingHorizontal: 20,
    paddingTop: 12,
  },
  modalHandle: { width: 40, height: 4, borderRadius: 2, alignSelf: 'center', marginBottom: 16 },
  modalTypeBar: { height: 3, borderRadius: 2, marginBottom: 12 },
  modalTitle: { fontSize: 20, fontWeight: '800', marginBottom: 4 },
  modalSubtitle: { fontSize: 13, marginBottom: 16 },
  workoutRow: { borderTopWidth: StyleSheet.hairlineWidth, paddingTop: 12, marginTop: 12 },
  workoutIndex: { fontSize: 12, fontWeight: '700', marginBottom: 8, textTransform: 'uppercase', letterSpacing: 0.5 },
  detailRow: { flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 8 },
  detailLabel: { fontSize: 14 },
  detailValue: { fontSize: 14, fontWeight: '600' },
  closeBtn: { marginTop: 20, borderRadius: 12, padding: 16, alignItems: 'center' },
  closeBtnText: { color: '#fff', fontSize: 16, fontWeight: '700' },
});
