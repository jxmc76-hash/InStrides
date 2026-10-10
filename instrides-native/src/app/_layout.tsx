import { useEffect, useState } from 'react';
import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { useColorScheme } from 'react-native';
import { onAuthStateChanged } from 'firebase/auth';
import { useRouter, useSegments } from 'expo-router';
import { auth } from '../lib/firebase';
import 'react-native-gesture-handler';

export default function RootLayout() {
  const [authReady, setAuthReady] = useState(false);
  const [user, setUser] = useState<null | { uid: string }>(null);
  const segments = useSegments();
  const router = useRouter();
  const scheme = useColorScheme();

  useEffect(() => {
    const unsub = onAuthStateChanged(auth, (u) => {
      setUser(u);
      setAuthReady(true);
    });
    return unsub;
  }, []);

  useEffect(() => {
    if (!authReady) return;
    const inAuth = segments[0] === '(auth)';
    if (!user && !inAuth) router.replace('/(auth)');
    if (user && inAuth) router.replace('/(tabs)');
  }, [user, authReady, segments]);

  return (
    <>
      <StatusBar style={scheme === 'dark' ? 'light' : 'dark'} />
      <Stack screenOptions={{ headerShown: false }}>
        <Stack.Screen name="(auth)" />
        <Stack.Screen name="(tabs)" />
        <Stack.Screen name="add-entry" options={{ presentation: 'modal', headerShown: true, title: 'Log Activity' }} />
        <Stack.Screen name="entry-detail" options={{ presentation: 'modal', headerShown: true, title: 'Activity' }} />
      </Stack>
    </>
  );
}
