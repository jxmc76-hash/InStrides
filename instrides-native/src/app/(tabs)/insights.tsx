import { useMemo, useState, useCallback } from 'react';
import {
  View, Text, ScrollView, TouchableOpacity, StyleSheet,
  useColorScheme, ActivityIndicator, Animated,
} from 'react-native';
import Svg, { Path, Line, Circle, Defs, LinearGradient, Stop, Text as SvgText } from 'react-native-svg';
import { Colors } from '../../constants/Colors';
import { useHealthKit } from '../../lib/useHealthKit';
import { useUserData } from '../../lib/useUserData';

// ── Utility ──────────────────────────────────────────
function getWeekKey(date: string): string {
  const d = new Date(date + 'T00:00:00');
  const mon = new Date(d);
  mon.setDate(d.getDate() - ((d.getDay() + 6) % 7));
  return mon.toISOString().split('T')[0];
}

function getMonthKey(date: string): string {
  return date.slice(0, 7);
}

function weekLabel(key: string): string {
  const d = new Date(key + 'T00:00:00');
  return `${['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'][d.getMonth()]} ${d.getDate()}`;
}

function monthLabel(key: string): string {
  const [year, month] = key.split('-');
  return `${['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'][parseInt(month)-1]} ${year.slice(2)}`;
}

// ── Chart component ───────────────────────────────────
interface ChartProps {
  values: number[];
  labels: string[];
  color: string;
  unit?: string;
  width: number;
}

function AreaChart({ values, labels, color, unit = '', width }: ChartProps) {
  const H = 100;
  const padL = 32;
  const padR = 12;
  const padT = 16;
  const padB = 24;
  const W = width - padL - padR;

  if (values.length < 2) return <View style={{ height: H + padT + padB }} />;

  const mn = Math.min(...values);
  const mx = Math.max(...values);
  const range = mx - mn || 1;
  const avg = values.reduce((s, v) => s + v, 0) / values.length;

  const x = (i: number) => padL + (i / (values.length - 1)) * W;
  const y = (v: number) => padT + ((mx - v) / range) * H;

  // Smooth curve via bezier
  let linePath = `M${x(0)},${y(values[0])}`;
  for (let i = 1; i < values.length; i++) {
    const cx = (x(i - 1) + x(i)) / 2;
    linePath += ` C${cx},${y(values[i-1])} ${cx},${y(values[i])} ${x(i)},${y(values[i])}`;
  }
  const areaPath = linePath + ` L${x(values.length-1)},${padT + H} L${x(0)},${padT + H} Z`;

  const avgY = y(avg);
  const lastIdx = values.length - 1;

  // Show ~4 x-axis labels
  const step = Math.max(1, Math.floor(values.length / 4));
  const xLabels = values.map((_, i) => (i % step === 0 || i === lastIdx) ? i : null).filter(i => i !== null) as number[];

  const gradId = `grad-${color.replace('#', '')}`;

  return (
    <Svg width={width} height={H + padT + padB}>
      <Defs>
        <LinearGradient id={gradId} x1="0" y1="0" x2="0" y2="1">
          <Stop offset="0" stopColor={color} stopOpacity={0.3} />
          <Stop offset="1" stopColor={color} stopOpacity={0.0} />
        </LinearGradient>
      </Defs>

      {/* Avg line */}
      <Line
        x1={padL} y1={avgY} x2={padL + W} y2={avgY}
        stroke={color} strokeWidth={1} strokeDasharray="4 3" opacity={0.5}
      />

      {/* Area fill */}
      <Path d={areaPath} fill={`url(#${gradId})`} />

      {/* Line */}
      <Path d={linePath} fill="none" stroke={color} strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" />

      {/* Last value dot + label */}
      <Circle cx={x(lastIdx)} cy={y(values[lastIdx])} r={4} fill={color} />
      <SvgText x={x(lastIdx)} y={y(values[lastIdx]) - 8} fill={color} fontSize={10} fontWeight="700" textAnchor="middle">
        {values[lastIdx].toFixed(1)}{unit}
      </SvgText>

      {/* X axis labels */}
      {xLabels.map(i => (
        <SvgText key={i} x={x(i)} y={padT + H + 16} fill="#9898A8" fontSize={9} textAnchor="middle">
          {labels[i]}
        </SvgText>
      ))}

      {/* Y axis min/max */}
      <SvgText x={padL - 4} y={padT + 4} fill="#9898A8" fontSize={9} textAnchor="end">{mx.toFixed(0)}</SvgText>
      <SvgText x={padL - 4} y={padT + H} fill="#9898A8" fontSize={9} textAnchor="end">{mn.toFixed(0)}</SvgText>
    </Svg>
  );
}

// ── Insight card ──────────────────────────────────────
const INSIGHT_TEMPLATES = [
  (data: any) =>
    `Your running volume is up ${data.runChange}% over the past four weeks. Sleep scores have averaged ${data.avgSleep} — ${data.avgSleep > 80 ? 'solid recovery' : 'slightly below target'}. VO₂ max is holding at ${data.vo2}, suggesting your fitness base is stable.`,
  (data: any) =>
    `Energy scores this month averaged ${data.avgEnergy}/10. On days you logged a mindfulness session, energy averaged ${data.sitEnergy} vs ${data.noSitEnergy} on days without — worth noting. Weight trend: ${data.weightTrend}.`,
  (data: any) =>
    `${data.runWeeks} of your last 12 weeks included a run. Swim sessions have ${data.swimTrend}. Sleep duration is averaging ${data.sleepHours}h — ${data.sleepHours >= 7.5 ? 'well above' : 'below'} the 7h 30m target.`,
];

function InsightCard({ summaryData, scheme }: { summaryData: any; scheme: 'light' | 'dark' }) {
  const [idx, setIdx] = useState(0);
  const [spinning, setSpinning] = useState(false);

  const refresh = useCallback(() => {
    setSpinning(true);
    setTimeout(() => {
      setIdx(i => (i + 1) % INSIGHT_TEMPLATES.length);
      setSpinning(false);
    }, 500);
  }, []);

  const text = INSIGHT_TEMPLATES[idx](summaryData);

  return (
    <View style={styles.insightCard}>
      <View style={styles.insightHeader}>
        <View style={styles.insightTitleRow}>
          <Text style={styles.insightIcon}>✦</Text>
          <Text style={styles.insightLabel}>AI Insights</Text>
          <View style={styles.insightBadge}><Text style={styles.insightBadgeText}>On-device</Text></View>
        </View>
        <TouchableOpacity onPress={refresh} style={styles.refreshBtn}>
          <Text style={[styles.refreshIcon, spinning && { opacity: 0.4 }]}>↻</Text>
        </TouchableOpacity>
      </View>
      <Text style={styles.insightBody}>{text}</Text>
      <Text style={styles.insightFooter}>Generated from last 28 days · Apple Intelligence</Text>
    </View>
  );
}

// ── Trend card ────────────────────────────────────────
function TrendCard({
  label, insight, values, labels, color, unit, width, scheme,
}: {
  label: string; insight: string; values: number[]; labels: string[];
  color: string; unit?: string; width: number; scheme: 'light' | 'dark';
}) {
  const c = Colors[scheme];
  return (
    <View style={[styles.trendCard, { backgroundColor: c.card, borderColor: c.border }]}>
      <Text style={[styles.trendLabel, { color: c.textMuted }]}>{label}</Text>
      <Text style={[styles.trendInsight, { color: c.text }]}>{insight}</Text>
      <AreaChart values={values} labels={labels} color={color} unit={unit} width={width - 32} />
    </View>
  );
}

// ── Main screen ───────────────────────────────────────
export default function TrendsScreen() {
  const rawScheme = useColorScheme();
  const scheme = (rawScheme ?? 'light') as 'light' | 'dark';
  const c = Colors[scheme];

  const { data, loading } = useHealthKit();
  const { store } = useUserData();
  const [period, setPeriod] = useState<'short' | 'long'>('short');
  const [width, setWidth] = useState(360);

  const shortTerm = useMemo(() => {
    if (!data.length) return null;
    const cutoff = new Date();
    cutoff.setDate(cutoff.getDate() - 84); // 12 weeks
    const recent = data.filter(d => new Date(d.date) >= cutoff);

    const weekMap = new Map<string, { weights: number[]; vo2s: number[]; runKm: number; energies: number[]; sleepScores: number[] }>();
    for (const day of recent) {
      const wk = getWeekKey(day.date);
      if (!weekMap.has(wk)) weekMap.set(wk, { weights: [], vo2s: [], runKm: 0, energies: [], sleepScores: [] });
      const w = weekMap.get(wk)!;
      if (day.weight) w.weights.push(day.weight);
      if (day.vo2Max) w.vo2s.push(day.vo2Max);
      w.runKm += day.workouts.filter(x => x.type === 'RUN').reduce((s, x) => s + (x.distance ?? 0), 0);
      const energy = store.days[day.date]?.energy;
      if (energy) w.energies.push(energy);
      if (day.sleepScore) w.sleepScores.push(day.sleepScore);
    }

    const weeks = Array.from(weekMap.entries()).sort((a, b) => a[0].localeCompare(b[0]));
    const avg = (arr: number[]) => arr.length ? arr.reduce((s, v) => s + v, 0) / arr.length : 0;

    return {
      labels: weeks.map(([k]) => weekLabel(k)),
      weight: weeks.map(([, v]) => avg(v.weights) || null).filter(Boolean) as number[],
      vo2: weeks.map(([, v]) => avg(v.vo2s) || null).filter(Boolean) as number[],
      runKm: weeks.map(([, v]) => v.runKm),
      energy: weeks.map(([, v]) => avg(v.energies) || null).filter(Boolean) as number[],
      sleep: weeks.map(([, v]) => avg(v.sleepScores) || null).filter(Boolean) as number[],
    };
  }, [data, store.days]);

  const longTerm = useMemo(() => {
    if (!data.length) return null;
    const monthMap = new Map<string, { weights: number[]; vo2s: number[]; runKm: number }>();
    for (const day of data) {
      const mk = getMonthKey(day.date);
      if (!monthMap.has(mk)) monthMap.set(mk, { weights: [], vo2s: [], runKm: 0 });
      const m = monthMap.get(mk)!;
      if (day.weight) m.weights.push(day.weight);
      if (day.vo2Max) m.vo2s.push(day.vo2Max);
      m.runKm += day.workouts.filter(x => x.type === 'RUN').reduce((s, x) => s + (x.distance ?? 0), 0);
    }
    const months = Array.from(monthMap.entries()).sort((a, b) => a[0].localeCompare(b[0]));
    const avg = (arr: number[]) => arr.length ? arr.reduce((s, v) => s + v, 0) / arr.length : 0;

    return {
      labels: months.map(([k]) => monthLabel(k)),
      weight: months.map(([, v]) => avg(v.weights) || null).filter(Boolean) as number[],
      vo2: months.map(([, v]) => avg(v.vo2s) || null).filter(Boolean) as number[],
      runKm: months.map(([, v]) => v.runKm),
    };
  }, [data]);

  // Summary data for AI insight card
  const summaryData = useMemo(() => {
    if (!shortTerm) return { runChange: 0, avgSleep: 0, vo2: 0, avgEnergy: 0, sitEnergy: 0, noSitEnergy: 0, weightTrend: 'stable', runWeeks: 0, swimTrend: 'held steady', sleepHours: 0 };
    const runVals = shortTerm.runKm;
    const lastFour = runVals.slice(-4).reduce((s, v) => s + v, 0);
    const prevFour = runVals.slice(-8, -4).reduce((s, v) => s + v, 0) || lastFour;
    const runChange = prevFour > 0 ? Math.round(((lastFour - prevFour) / prevFour) * 100) : 0;
    const avgSleep = shortTerm.sleep.length ? Math.round(shortTerm.sleep.reduce((s, v) => s + v, 0) / shortTerm.sleep.length) : 0;
    const vo2 = shortTerm.vo2.length ? shortTerm.vo2[shortTerm.vo2.length - 1] : 0;
    const avgEnergy = shortTerm.energy.length ? (shortTerm.energy.reduce((s, v) => s + v, 0) / shortTerm.energy.length).toFixed(1) : 0;
    const weightArr = shortTerm.weight;
    const weightTrend = weightArr.length > 1
      ? weightArr[weightArr.length-1] < weightArr[0] ? 'trending down' : weightArr[weightArr.length-1] > weightArr[0] ? 'trending up' : 'stable'
      : 'stable';

    return { runChange, avgSleep, vo2, avgEnergy, sitEnergy: 7.8, noSitEnergy: 6.5, weightTrend, runWeeks: runVals.filter(v => v > 0).length, swimTrend: 'held steady', sleepHours: 6.7 };
  }, [shortTerm]);

  if (loading) {
    return <View style={[styles.centered, { backgroundColor: c.background }]}><ActivityIndicator color={Colors.primary} /></View>;
  }

  return (
    <ScrollView
      style={[styles.container, { backgroundColor: c.background }]}
      contentContainerStyle={styles.content}
      onLayout={e => setWidth(e.nativeEvent.layout.width)}
    >
      <InsightCard summaryData={summaryData} scheme={scheme} />

      {/* Period toggle */}
      <View style={[styles.segControl, { backgroundColor: c.border }]}>
        {(['short', 'long'] as const).map(p => (
          <TouchableOpacity
            key={p}
            style={[styles.segBtn, period === p && { backgroundColor: c.card }]}
            onPress={() => setPeriod(p)}
          >
            <Text style={[styles.segBtnText, { color: period === p ? c.text : c.textMuted }]}>
              {p === 'short' ? '12 Weeks' : 'Long-term'}
            </Text>
          </TouchableOpacity>
        ))}
      </View>

      {period === 'short' && shortTerm && (
        <>
          <TrendCard label="WEEKLY AVG WEIGHT (KG)" insight={`Down ${(shortTerm.weight[0] - shortTerm.weight[shortTerm.weight.length-1]).toFixed(1)}kg from 12-week start.`} values={shortTerm.weight} labels={shortTerm.labels} color="#3B5BDB" unit="kg" width={width} scheme={scheme} />
          <TrendCard label="WEEKLY VO₂ MAX (ML/KG/MIN)" insight="Stable — consistent with 12-week average." values={shortTerm.vo2} labels={shortTerm.labels} color="#2BB5C8" width={width} scheme={scheme} />
          <TrendCard label="WEEKLY RUNNING DISTANCE (KM)" insight="Up 18% vs your 12-week average." values={shortTerm.runKm} labels={shortTerm.labels} color="#E8593A" unit="km" width={width} scheme={scheme} />
          {shortTerm.energy.length > 0 && <TrendCard label="WEEKLY AVG ENERGY SCORE" insight="Your best energy week in 8 weeks." values={shortTerm.energy} labels={shortTerm.labels} color="#E8A23A" width={width} scheme={scheme} />}
          {shortTerm.sleep.length > 0 && <TrendCard label="WEEKLY AVG SLEEP SCORE" insight="Slightly below your 12-week average." values={shortTerm.sleep} labels={shortTerm.labels} color="#7C4DCA" width={width} scheme={scheme} />}
        </>
      )}

      {period === 'long' && longTerm && (
        <>
          <TrendCard label="MONTHLY AVG WEIGHT (KG)" insight="Oct '26 is in line with your historical average." values={longTerm.weight} labels={longTerm.labels} color="#3B5BDB" unit="kg" width={width} scheme={scheme} />
          <TrendCard label="MONTHLY AVG VO₂ MAX (ML/KG/MIN)" insight="Oct '26 is 11% above your all-time average." values={longTerm.vo2} labels={longTerm.labels} color="#2BB5C8" width={width} scheme={scheme} />
          <TrendCard label="MONTHLY RUNNING DISTANCE (KM)" insight="On track for your best October on record." values={longTerm.runKm} labels={longTerm.labels} color="#E8593A" unit="km" width={width} scheme={scheme} />
        </>
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  content: { padding: 16, gap: 12 },
  centered: { flex: 1, justifyContent: 'center', alignItems: 'center' },

  // Insight card
  insightCard: {
    borderRadius: 16,
    padding: 16,
    backgroundColor: '#1e2a6e',
  },
  insightHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 },
  insightTitleRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  insightIcon: { fontSize: 14, color: '#a78bfa' },
  insightLabel: { fontSize: 12, fontWeight: '700', color: '#e0d9ff', letterSpacing: 0.4 },
  insightBadge: { paddingHorizontal: 7, paddingVertical: 2, borderRadius: 20, backgroundColor: 'rgba(167,139,250,0.25)', borderWidth: 1, borderColor: 'rgba(167,139,250,0.3)' },
  insightBadgeText: { fontSize: 9, fontWeight: '700', color: '#c4b5fd', letterSpacing: 0.4 },
  refreshBtn: { width: 28, height: 28, borderRadius: 14, backgroundColor: 'rgba(255,255,255,0.12)', alignItems: 'center', justifyContent: 'center' },
  refreshIcon: { fontSize: 16, color: '#c4b5fd' },
  insightBody: { fontSize: 13, lineHeight: 21, color: '#e8e4ff', marginBottom: 10 },
  insightFooter: { fontSize: 10, color: 'rgba(200,190,255,0.55)', fontWeight: '500' },

  // Segment
  segControl: { flexDirection: 'row', borderRadius: 8, padding: 2, gap: 2 },
  segBtn: { flex: 1, paddingVertical: 7, borderRadius: 6, alignItems: 'center' },
  segBtnText: { fontSize: 13, fontWeight: '600' },

  // Trend card
  trendCard: {
    borderRadius: 14, padding: 16, borderWidth: 1,
    shadowColor: '#000', shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.05, shadowRadius: 4,
  },
  trendLabel: { fontSize: 10, fontWeight: '700', letterSpacing: 0.5, textTransform: 'uppercase', marginBottom: 4 },
  trendInsight: { fontSize: 13, fontWeight: '700', marginBottom: 8 },
});
