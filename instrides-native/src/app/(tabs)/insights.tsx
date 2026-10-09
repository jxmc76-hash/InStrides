import { useMemo } from 'react';
import { View, Text, ScrollView, StyleSheet, useColorScheme } from 'react-native';
import { useLogData } from '../../lib/useLogData';
import { Colors } from '../../constants/Colors';

function StatCard({ label, value, unit, scheme }: { label: string; value: string; unit?: string; scheme: 'light' | 'dark' }) {
  const c = Colors[scheme];
  return (
    <View style={[styles.statCard, { backgroundColor: c.card }]}>
      <Text style={[styles.statValue, { color: Colors.primary }]}>{value}</Text>
      {unit ? <Text style={[styles.statUnit, { color: c.textMuted }]}>{unit}</Text> : null}
      <Text style={[styles.statLabel, { color: c.textMuted }]}>{label}</Text>
    </View>
  );
}

export default function InsightsScreen() {
  const { logData } = useLogData();
  const rawScheme = useColorScheme();
  const scheme = (rawScheme ?? 'light') as 'light' | 'dark';
  const c = Colors[scheme];

  const stats = useMemo(() => {
    const real = logData.entries.filter((e) => !e.isPlanned);
    const runs = real.filter((e) => e.type === 'RUN');
    const totalKm = runs.reduce((s, e) => s + (e.distance ?? 0), 0);
    const thisMonth = new Date().toISOString().slice(0, 7);
    const monthEntries = real.filter((e) => e.date.startsWith(thisMonth));
    const monthRuns = monthEntries.filter((e) => e.type === 'RUN');
    const monthKm = monthRuns.reduce((s, e) => s + (e.distance ?? 0), 0);
    const lastSleep = real.slice().reverse().find((e) => e.customMetricData?.SLEEP);
    const lastEnergy = real.slice().reverse().find((e) => e.customMetricData?.ENERGY);
    const lastWeight = real.slice().reverse().find((e) => e.customMetricData?.WEIGHT);
    return { totalKm, monthKm, totalRuns: runs.length, monthRuns: monthRuns.length, lastSleep, lastEnergy, lastWeight };
  }, [logData]);

  return (
    <ScrollView style={[styles.container, { backgroundColor: c.background }]} contentContainerStyle={styles.content}>
      <Text style={[styles.section, { color: c.textMuted }]}>This Month</Text>
      <View style={styles.row}>
        <StatCard label="Running" value={stats.monthKm.toFixed(1)} unit="km" scheme={scheme} />
        <StatCard label="Sessions" value={String(stats.monthRuns)} scheme={scheme} />
      </View>

      <Text style={[styles.section, { color: c.textMuted }]}>All Time</Text>
      <View style={styles.row}>
        <StatCard label="Total Distance" value={stats.totalKm.toFixed(0)} unit="km" scheme={scheme} />
        <StatCard label="Total Runs" value={String(stats.totalRuns)} scheme={scheme} />
      </View>

      {(stats.lastSleep || stats.lastEnergy || stats.lastWeight) ? (
        <>
          <Text style={[styles.section, { color: c.textMuted }]}>Latest Metrics</Text>
          <View style={styles.row}>
            {stats.lastSleep ? <StatCard label="Sleep Score" value={String(stats.lastSleep.customMetricData?.SLEEP)} unit="/100" scheme={scheme} /> : null}
            {stats.lastEnergy ? <StatCard label="Energy" value={String(stats.lastEnergy.customMetricData?.ENERGY)} unit="/10" scheme={scheme} /> : null}
            {stats.lastWeight ? <StatCard label="Weight" value={String(stats.lastWeight.customMetricData?.WEIGHT)} unit="kg" scheme={scheme} /> : null}
          </View>
        </>
      ) : null}

      <View style={[styles.comingSoon, { backgroundColor: c.card }]}>
        <Text style={[styles.comingSoonText, { color: c.textMuted }]}>📈  Charts coming soon</Text>
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  content: { padding: 16, gap: 12, paddingBottom: 40 },
  section: { fontSize: 12, fontWeight: '700', textTransform: 'uppercase', letterSpacing: 0.7, marginTop: 8 },
  row: { flexDirection: 'row', gap: 12 },
  statCard: {
    flex: 1, borderRadius: 14, padding: 16, alignItems: 'center',
    shadowColor: '#000', shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.06, shadowRadius: 4, elevation: 2,
  },
  statValue: { fontSize: 28, fontWeight: '800' },
  statUnit: { fontSize: 13, marginTop: 1 },
  statLabel: { fontSize: 12, marginTop: 4, textAlign: 'center' },
  comingSoon: { borderRadius: 14, padding: 24, alignItems: 'center', marginTop: 8 },
  comingSoonText: { fontSize: 15 },
});
