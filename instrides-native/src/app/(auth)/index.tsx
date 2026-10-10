import { useState } from 'react';
import {
  View, Text, TextInput, TouchableOpacity, StyleSheet,
  KeyboardAvoidingView, Platform, ActivityIndicator, useColorScheme, Alert,
} from 'react-native';
import { signInWithEmailAndPassword, createUserWithEmailAndPassword, sendPasswordResetEmail } from '@firebase/auth';
import { auth } from '../../lib/firebase';
import { Colors } from '../../constants/Colors';

export default function LoginScreen() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [isRegister, setIsRegister] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const scheme = useColorScheme() ?? 'light';
  const c = Colors[scheme];

  const handleForgotPassword = async () => {
    if (!email.trim()) {
      Alert.alert('Enter your email first', 'Type your email address above, then tap Forgot Password.');
      return;
    }
    try {
      await sendPasswordResetEmail(auth, email.trim());
      Alert.alert('Email sent', `Check your inbox at ${email.trim()} for a password reset link.`);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message.replace('Firebase: ', '') : 'Failed to send reset email');
    }
  };

  const handleAuth = async () => {
    setError('');
    setLoading(true);
    try {
      if (isRegister) {
        await createUserWithEmailAndPassword(auth, email.trim(), password);
      } else {
        await signInWithEmailAndPassword(auth, email.trim(), password);
      }
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message.replace('Firebase: ', '') : 'Authentication failed');
    } finally {
      setLoading(false);
    }
  };

  return (
    <KeyboardAvoidingView
      style={[styles.container, { backgroundColor: c.background }]}
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
    >
      <View style={styles.inner}>
        <View style={styles.header}>
          <Text style={[styles.logo, { color: Colors.primary }]}>IN</Text>
          <Text style={[styles.logoSub, { color: c.text }]}>STRIDES</Text>
        </View>
        <Text style={[styles.tagline, { color: c.textMuted }]}>Your training log</Text>

        <View style={[styles.card, { backgroundColor: c.card }]}>
          <TextInput
            style={[styles.input, { color: c.text, borderColor: c.border, backgroundColor: c.background }]}
            placeholder="Email"
            placeholderTextColor={c.textMuted}
            value={email}
            onChangeText={setEmail}
            autoCapitalize="none"
            keyboardType="email-address"
            autoComplete="email"
          />
          <TextInput
            style={[styles.input, { color: c.text, borderColor: c.border, backgroundColor: c.background }]}
            placeholder="Password"
            placeholderTextColor={c.textMuted}
            value={password}
            onChangeText={setPassword}
            secureTextEntry
          />

          {error ? <Text style={styles.error}>{error}</Text> : null}

          <TouchableOpacity
            style={[styles.btn, { backgroundColor: Colors.primary }]}
            onPress={handleAuth}
            disabled={loading}
          >
            {loading
              ? <ActivityIndicator color="#fff" />
              : <Text style={styles.btnText}>{isRegister ? 'Create Account' : 'Sign In'}</Text>}
          </TouchableOpacity>

          {!isRegister && (
            <TouchableOpacity onPress={handleForgotPassword}>
              <Text style={[styles.forgot, { color: c.textMuted }]}>Forgot password?</Text>
            </TouchableOpacity>
          )}
        </View>

        <TouchableOpacity onPress={() => setIsRegister(!isRegister)}>
          <Text style={[styles.toggle, { color: Colors.primary }]}>
            {isRegister ? 'Already have an account? Sign In' : "Don't have an account? Sign Up"}
          </Text>
        </TouchableOpacity>
      </View>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  inner: { flex: 1, justifyContent: 'center', paddingHorizontal: 24 },
  header: { flexDirection: 'row', alignItems: 'baseline', marginBottom: 4 },
  logo: { fontSize: 48, fontWeight: '900', letterSpacing: -2 },
  logoSub: { fontSize: 32, fontWeight: '800', letterSpacing: 1, marginLeft: 2 },
  tagline: { fontSize: 15, marginBottom: 36 },
  card: { borderRadius: 16, padding: 20, marginBottom: 20, gap: 12 },
  input: {
    borderWidth: 1, borderRadius: 10, paddingHorizontal: 14, paddingVertical: 12,
    fontSize: 16,
  },
  btn: {
    borderRadius: 12, paddingVertical: 14, alignItems: 'center', marginTop: 4,
  },
  btnText: { color: '#fff', fontSize: 16, fontWeight: '700' },
  toggle: { textAlign: 'center', fontSize: 14, paddingVertical: 8 },
  forgot: { textAlign: 'center', fontSize: 13, paddingTop: 4 },
  error: { color: '#FF3B30', fontSize: 13, textAlign: 'center' },
});
