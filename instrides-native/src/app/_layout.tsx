import { Stack } from 'expo-router';

export default function RootLayout() {
  return (
    <Stack screenOptions={{ headerShown: false }}>
      <Stack.Screen name="(auth)" />
      <Stack.Screen name="(tabs)" />
      <Stack.Screen name="add-entry" options={{ presentation: 'modal', headerShown: true, title: 'Log Activity' }} />
      <Stack.Screen name="entry-detail" options={{ presentation: 'modal', headerShown: true, title: 'Activity' }} />
    </Stack>
  );
}
