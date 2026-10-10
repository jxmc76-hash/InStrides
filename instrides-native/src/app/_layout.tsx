import { useEffect, useState } from 'react';
import { Stack, useRouter, useSegments } from 'expo-router';
import { onAuthStateChanged } from '@firebase/auth';
import * as WebBrowser from 'expo-web-browser';
import { auth } from '../lib/firebase';

WebBrowser.maybeCompleteAuthSession();

export default function RootLayout() {
  const [ready, setReady] = useState(false);
  const [uid, setUid] = useState<string | null>(null);
  const router = useRouter();
  const segments = useSegments();

  useEffect(() => {
    const unsub = onAuthStateChanged(auth, (user) => {
      setUid(user?.uid ?? null);
      setReady(true);
    });
    return unsub;
  }, []);

  useEffect(() => {
    if (!ready) return;
    const inAuth = segments[0] === '(auth)';
    if (!uid && !inAuth) {
      router.replace('/(auth)');
    } else if (uid && inAuth) {
      router.replace('/(tabs)');
    }
  }, [ready, uid, segments]);

  return (
    <Stack screenOptions={{ headerShown: false }}>
      <Stack.Screen name="(auth)" />
      <Stack.Screen name="(tabs)" />
      <Stack.Screen name="add-entry" options={{ presentation: 'modal', headerShown: true, title: 'Log Activity' }} />
      <Stack.Screen name="entry-detail" options={{ presentation: 'modal', headerShown: true, title: 'Activity' }} />
    </Stack>
  );
}
