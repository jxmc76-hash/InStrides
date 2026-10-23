import { Tabs } from 'expo-router';
import { useColorScheme } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Colors } from '../../constants/Colors';

type IoniconsName = React.ComponentProps<typeof Ionicons>['name'];

function TabIcon({ name, color }: { name: IoniconsName; color: string | import('react-native').ColorValue }) {
  return <Ionicons name={name} size={24} color={color as string} />;
}

export default function TabLayout() {
  const rawScheme = useColorScheme();
  const scheme = (rawScheme === 'dark' ? 'dark' : 'light') as 'light' | 'dark';
  const c = Colors[scheme];

  return (
    <Tabs
      screenOptions={{
        tabBarActiveTintColor: Colors.primary,
        tabBarInactiveTintColor: c.textMuted as string,
        tabBarStyle: { backgroundColor: c.card },
        headerStyle: { backgroundColor: c.card },
        headerTintColor: c.text as string,
        headerTitleStyle: { fontWeight: '700' },
      }}
    >
      <Tabs.Screen
        name="grid"
        options={{
          title: 'Grid',
          tabBarIcon: ({ color }) => <TabIcon name="grid-outline" color={color} />,
        }}
      />
      <Tabs.Screen
        name="log"
        options={{
          title: 'Log',
          tabBarIcon: ({ color }) => <TabIcon name="list-outline" color={color} />,
        }}
      />
      <Tabs.Screen
        name="plan"
        options={{
          title: 'Plan',
          tabBarIcon: ({ color }) => <TabIcon name="calendar-outline" color={color} />,
        }}
      />
      <Tabs.Screen
        name="insights"
        options={{
          title: 'Trends',
          tabBarIcon: ({ color }) => <TabIcon name="trending-up-outline" color={color} />,
        }}
      />
      {/* Hide goals tab — not part of new spec */}
      <Tabs.Screen
        name="goals"
        options={{ href: null }}
      />
    </Tabs>
  );
}
