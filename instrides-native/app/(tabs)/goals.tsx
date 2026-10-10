import { View, Text, FlatList, StyleSheet, useColorScheme } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useLogData } from '../../lib/useLogData';
import { Colors } from '../../constants/Colors';
import type { Goal } from '../../constants/types';

function GoalRow({ goal, scheme }: { goal: Goal; scheme: 'light' | 'dark' }) {
  const c = Colors[scheme];
  return (
    <View style={[styles.goalCard, { backgroundColor: c.card }]}>
      <Ionicons
        name={goal.isComplete ? 'checkmark-circle' : 'ellipse-outline'}
        size={22}
        color={goal.isComplete ? Colors[scheme].success : c.textMuted}
        style={styles.goalIcon}
      />
      <View style={styles.goalContent}>
        <Text style={[styles.goalText, { color: goal.isComplete ? c.textMuted : c.text }, goal.isComplete && styles.strikethrough]}>
          {goal.text}
        </Text>
        {goal.target ? <Text style={[styles.goalTarget, { color: c.textMuted }]}>{goal.target}</Text> : null}
      </View>
    </View>
  );
}

export default function GoalsScreen() {
  const { logData } = useLogData();
  const rawScheme = useColorScheme();
  const scheme = (rawScheme ?? 'light') as 'light' | 'dark';
  const c = Colors[scheme];

  const goals = [...logData.goals].sort((a, b) => (a.isComplete ? 1 : 0) - (b.isComplete ? 1 : 0));

  return (
    <View style={[styles.container, { backgroundColor: c.background }]}>
      <FlatList
        data={goals}
        keyExtractor={(g) => String(g.id)}
        contentContainerStyle={styles.list}
        ListEmptyComponent={
          <View style={styles.empty}>
            <Text style={[styles.emptyText, { color: c.textMuted }]}>No goals yet. Set them in the web app.</Text>
          </View>
        }
        renderItem={({ item }) => <GoalRow goal={item} scheme={scheme} />}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  list: { padding: 16, gap: 10, paddingBottom: 32 },
  goalCard: {
    borderRadius: 12, flexDirection: 'row', alignItems: 'flex-start', padding: 14,
    shadowColor: '#000', shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.05, shadowRadius: 3, elevation: 1,
  },
  goalIcon: { marginRight: 12, marginTop: 1 },
  goalContent: { flex: 1 },
  goalText: { fontSize: 15, fontWeight: '500', lineHeight: 22 },
  goalTarget: { fontSize: 13, marginTop: 2 },
  strikethrough: { textDecorationLine: 'line-through', opacity: 0.5 },
  empty: { paddingTop: 80, alignItems: 'center' },
  emptyText: { fontSize: 15, textAlign: 'center' },
});
