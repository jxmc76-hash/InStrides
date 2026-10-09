import { useMemo } from 'react';
import {
  View, Text, SectionList, TouchableOpacity, StyleSheet, useColorScheme,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useLogData } from '../../src/lib/useLogData';
import { Colors } from '../../src/constants/Colors';
import type { TrainingPlanSession } from '../../src/constants/types';

const SESSION_TYPE_COLORS: Record<string, string> = {
  Long: '#FF5500', Tempo: '#6366f1', Speed: '#f59e0b', Race: '#ef4444',
  Easy: '#10b981', Rest: '#8E8E93', Parkrun: '#FF5500', Strides: '#0ea5e9',
};

function sessionColor(type: string) {
  return SESSION_TYPE_COLORS[type] ?? Colors.primary;
}

function fmtSessionDate(dateStr: string) {
  const d = new Date(dateStr + 'T00:00:00');
  return d.toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short' });
}

function isPast(dateStr: string) {
  const today = new Date(); today.setHours(0, 0, 0, 0);
  return new Date(dateStr + 'T00:00:00') < today;
}

function isToday(dateStr: string) {
  const today = new Date().toISOString().split('T')[0];
  return dateStr === today;
}

interface SessionRowProps {
  session: TrainingPlanSession;
  onTick: () => void;
  scheme: 'light' | 'dark';
}

function SessionRow({ session, onTick, scheme }: SessionRowProps) {
  const c = Colors[scheme];
  const past = isPast(session.date);
  const today = isToday(session.date);
  const color = sessionColor(session.type);
  const muted = past && !session.isComplete;

  return (
    <View style={[styles.sessionRow, { backgroundColor: c.card }, today && { borderColor: Colors.primary, borderWidth: 1.5 }]}>
      <View style={[styles.sessionDot, { backgroundColor: session.isComplete ? Colors[scheme].success : color, opacity: muted ? 0.4 : 1 }]} />
      <View style={styles.sessionInfo}>
        <View style={styles.sessionTop}>
          <Text style={[styles.sessionDate, { color: c.textMuted }, today && { color: Colors.primary, fontWeight: '700' }]}>
            {fmtSessionDate(session.date)}{today ? ' · Today' : ''}
          </Text>
          <Text style={[styles.sessionType, { color: muted ? c.textMuted : color, opacity: muted ? 0.6 : 1 }]}>
            {session.type}
          </Text>
        </View>
        <Text style={[styles.sessionTarget, { color: muted ? c.textMuted : c.text }]} numberOfLines={2}>
          {session.target}
        </Text>
      </View>
      <TouchableOpacity onPress={onTick} style={styles.tickBtn} hitSlop={12}>
        <Ionicons
          name={session.isComplete ? 'checkmark-circle' : 'ellipse-outline'}
          size={26}
          color={session.isComplete ? Colors[scheme].success : c.textMuted}
        />
      </TouchableOpacity>
    </View>
  );
}

export default function PlanScreen() {
  const { logData, tickPlanSession } = useLogData();
  const rawScheme = useColorScheme();
  const scheme = (rawScheme ?? 'light') as 'light' | 'dark';
  const c = Colors[scheme];

  const plan = logData.trainingPlans.find((p) => p.title.toLowerCase().includes('half marathon'));

  const sections = useMemo(() => {
    if (!plan) return [];
    const byWeek: Record<string, TrainingPlanSession[]> = {};
    plan.sessions.forEach((s) => {
      const d = new Date(s.date + 'T00:00:00');
      const diff = (d.getDay() === 0 ? -6 : 1 - d.getDay());
      const ws = new Date(d); ws.setDate(d.getDate() + diff);
      const key = ws.toISOString().split('T')[0];
      (byWeek[key] = byWeek[key] ?? []).push(s);
    });
    return Object.keys(byWeek).sort().map((ws) => {
      const we = new Date(ws + 'T00:00:00'); we.setDate(we.getDate() + 6);
      const wsFmt = new Date(ws + 'T00:00:00').toLocaleDateString('en-GB', { day: 'numeric', month: 'short' });
      const weFmt = we.toLocaleDateString('en-GB', { day: 'numeric', month: 'short' });
      return { title: `${wsFmt} – ${weFmt}`, data: byWeek[ws] };
    });
  }, [plan]);

  if (!plan) {
    return (
      <View style={[styles.centered, { backgroundColor: c.background }]}>
        <Text style={[styles.emptyText, { color: c.textMuted }]}>No training plan found.</Text>
      </View>
    );
  }

  const totalSessions = plan.sessions.length;
  const completedSessions = plan.sessions.filter((s) => s.isComplete).length;
  const raceDate = new Date(plan.endDate + 'T00:00:00');
  const daysToRace = Math.ceil((raceDate.getTime() - Date.now()) / 86400000);

  return (
    <View style={[styles.container, { backgroundColor: c.background }]}>
      <View style={[styles.planHeader, { backgroundColor: c.card }]}>
        <Text style={[styles.planTitle, { color: c.text }]}>{plan.title}</Text>
        <View style={styles.planStats}>
          <View style={styles.statItem}>
            <Text style={[styles.statValue, { color: Colors.primary }]}>{daysToRace}</Text>
            <Text style={[styles.statLabel, { color: c.textMuted }]}>days to go</Text>
          </View>
          <View style={[styles.statDivider, { backgroundColor: c.border }]} />
          <View style={styles.statItem}>
            <Text style={[styles.statValue, { color: Colors.primary }]}>{completedSessions}/{totalSessions}</Text>
            <Text style={[styles.statLabel, { color: c.textMuted }]}>sessions done</Text>
          </View>
          <View style={[styles.statDivider, { backgroundColor: c.border }]} />
          <View style={styles.statItem}>
            <Text style={[styles.statValue, { color: Colors.primary }]}>
              {Math.round((completedSessions / totalSessions) * 100)}%
            </Text>
            <Text style={[styles.statLabel, { color: c.textMuted }]}>complete</Text>
          </View>
        </View>
        <View style={[styles.progressBar, { backgroundColor: c.border }]}>
          <View style={[styles.progressFill, { width: `${(completedSessions / totalSessions) * 100}%` }]} />
        </View>
      </View>

      <SectionList
        sections={sections}
        keyExtractor={(s) => String(s.id)}
        contentContainerStyle={styles.list}
        stickySectionHeadersEnabled={false}
        renderSectionHeader={({ section }) => (
          <Text style={[styles.weekHeader, { color: c.textMuted }]}>{section.title}</Text>
        )}
        renderItem={({ item }) => (
          <SessionRow
            session={item}
            scheme={scheme}
            onTick={() => tickPlanSession(plan.id, item.id)}
          />
        )}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  centered: { flex: 1, justifyContent: 'center', alignItems: 'center', padding: 24 },
  emptyText: { fontSize: 15, textAlign: 'center' },
  planHeader: { padding: 20, marginBottom: 8 },
  planTitle: { fontSize: 17, fontWeight: '700', marginBottom: 16 },
  planStats: { flexDirection: 'row', justifyContent: 'space-around', marginBottom: 14 },
  statItem: { alignItems: 'center' },
  statValue: { fontSize: 22, fontWeight: '800' },
  statLabel: { fontSize: 12, marginTop: 2 },
  statDivider: { width: 1, height: 36, alignSelf: 'center' },
  progressBar: { height: 4, borderRadius: 2, overflow: 'hidden' },
  progressFill: { height: 4, backgroundColor: Colors.primary, borderRadius: 2 },
  list: { padding: 16, gap: 8, paddingBottom: 32 },
  weekHeader: { fontSize: 12, fontWeight: '600', textTransform: 'uppercase', letterSpacing: 0.6, paddingVertical: 8 },
  sessionRow: {
    borderRadius: 12, flexDirection: 'row', alignItems: 'center', padding: 14, gap: 12,
    shadowColor: '#000', shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.05, shadowRadius: 3, elevation: 1,
  },
  sessionDot: { width: 10, height: 10, borderRadius: 5 },
  sessionInfo: { flex: 1 },
  sessionTop: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 3 },
  sessionDate: { fontSize: 13 },
  sessionType: { fontSize: 13, fontWeight: '700' },
  sessionTarget: { fontSize: 15, fontWeight: '500', lineHeight: 20 },
  tickBtn: { padding: 2 },
});
