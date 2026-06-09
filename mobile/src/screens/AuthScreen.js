/**
 * AuthScreen — Sign in / Sign up / Continue without account.
 *
 * Vintage terminal aesthetic. Accessible from the hamburger menu
 * or "Sign in to sync" prompts throughout the app.
 */

import React, { useState, useCallback } from 'react';
import {
  View, Text, TextInput, TouchableOpacity, StyleSheet,
  ActivityIndicator, KeyboardAvoidingView, Platform, ScrollView,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useAuth } from '../context/AuthContext';
import { useGeneration } from '../context/GenerationContext';
import { colors, fonts, spacing, radius } from '../theme';

export default function AuthScreen({ navigation }) {
  const insets = useSafeAreaInsets();
  const { gen } = useGeneration();
  const { signIn, register } = useAuth();
  const accent = gen.accentColor;

  const [mode, setMode] = useState('login'); // 'login' | 'register'
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [username, setUsername] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  const handleSubmit = useCallback(async () => {
    setError(null);
    if (!email.trim() || !password.trim()) {
      setError('Email and password required');
      return;
    }
    setLoading(true);
    try {
      if (mode === 'register') {
        await register(email.trim(), password, { username: username.trim() || undefined });
      } else {
        await signIn(email.trim(), password);
      }
      navigation.goBack();
    } catch (err) {
      setError(err.message || 'Something went wrong');
    }
    setLoading(false);
  }, [mode, email, password, username, signIn, register, navigation]);

  const handleSkip = useCallback(() => {
    navigation.goBack();
  }, [navigation]);

  return (
    <KeyboardAvoidingView
      style={[styles.container, { paddingTop: insets.top }]}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      <ScrollView contentContainerStyle={styles.scroll} keyboardShouldPersistTaps="handled">
        {/* Header */}
        <View style={styles.header}>
          <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backBtn} hitSlop={8}>
            <Ionicons name="chevron-back" size={24} color={colors.textPrimary} />
          </TouchableOpacity>
        </View>

        {/* Branding */}
        <View style={styles.brand}>
          <Text style={[styles.brandTitle, { color: accent }]}>VOID</Text>
          <Text style={styles.brandSub}>CHANNEL</Text>
          <Text style={styles.tagline}>generating since 1895</Text>
        </View>

        {/* Mode toggle */}
        <View style={styles.modeRow}>
          <TouchableOpacity
            onPress={() => { setMode('login'); setError(null); }}
            style={[styles.modeTab, mode === 'login' && { borderBottomColor: accent }]}
          >
            <Text style={[styles.modeText, mode === 'login' && { color: accent }]}>SIGN IN</Text>
          </TouchableOpacity>
          <TouchableOpacity
            onPress={() => { setMode('register'); setError(null); }}
            style={[styles.modeTab, mode === 'register' && { borderBottomColor: accent }]}
          >
            <Text style={[styles.modeText, mode === 'register' && { color: accent }]}>CREATE ACCOUNT</Text>
          </TouchableOpacity>
        </View>

        {/* Form */}
        <View style={styles.form}>
          {mode === 'register' && (
            <View style={styles.field}>
              <Text style={styles.label}>USERNAME</Text>
              <TextInput
                style={[styles.input, { borderColor: accent + '40' }]}
                value={username}
                onChangeText={setUsername}
                placeholder="optional"
                placeholderTextColor={colors.textGhost}
                autoCapitalize="none"
                autoCorrect={false}
              />
            </View>
          )}

          <View style={styles.field}>
            <Text style={styles.label}>EMAIL</Text>
            <TextInput
              style={[styles.input, { borderColor: accent + '40' }]}
              value={email}
              onChangeText={setEmail}
              placeholder="you@example.com"
              placeholderTextColor={colors.textGhost}
              keyboardType="email-address"
              autoCapitalize="none"
              autoCorrect={false}
            />
          </View>

          <View style={styles.field}>
            <Text style={styles.label}>PASSWORD</Text>
            <TextInput
              style={[styles.input, { borderColor: accent + '40' }]}
              value={password}
              onChangeText={setPassword}
              placeholder="6+ characters"
              placeholderTextColor={colors.textGhost}
              secureTextEntry
            />
          </View>

          {error && (
            <View style={styles.errorBox}>
              <Ionicons name="warning-outline" size={14} color="#ff4444" />
              <Text style={styles.errorText}>{error}</Text>
            </View>
          )}

          <TouchableOpacity
            onPress={handleSubmit}
            style={[styles.submitBtn, { backgroundColor: accent }]}
            activeOpacity={0.8}
            disabled={loading}
          >
            {loading ? (
              <ActivityIndicator color={gen.accentOnDark} size="small" />
            ) : (
              <Text style={[styles.submitText, { color: gen.accentOnDark }]}>
                {mode === 'register' ? 'CREATE ACCOUNT' : 'SIGN IN'}
              </Text>
            )}
          </TouchableOpacity>
        </View>

        {/* Skip */}
        <TouchableOpacity onPress={handleSkip} style={styles.skipBtn} activeOpacity={0.7}>
          <Text style={styles.skipText}>CONTINUE WITHOUT ACCOUNT</Text>
          <Text style={styles.skipSub}>your data stays on this device</Text>
        </TouchableOpacity>

        {/* Footer */}
        <Text style={styles.footer}>
          before AI slop, there was human creativity
        </Text>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.bg },
  scroll: { paddingHorizontal: spacing.screenPadding, paddingBottom: 40 },
  header: { flexDirection: 'row', paddingVertical: 12 },
  backBtn: { padding: 4 },
  brand: { alignItems: 'center', marginTop: 20, marginBottom: 32 },
  brandTitle: { fontFamily: fonts.monoBold, fontSize: 36, letterSpacing: 8 },
  brandSub: { fontFamily: fonts.mono, fontSize: 12, color: colors.textMuted, letterSpacing: 6, marginTop: -2 },
  tagline: { fontFamily: fonts.mono, fontSize: 10, color: colors.textGhost, letterSpacing: 1.5, marginTop: 12, fontStyle: 'italic' },
  modeRow: { flexDirection: 'row', marginBottom: 24, gap: 0 },
  modeTab: {
    flex: 1, paddingVertical: 12, alignItems: 'center',
    borderBottomWidth: 2, borderBottomColor: 'transparent',
  },
  modeText: { fontFamily: fonts.monoBold, fontSize: 11, color: colors.textGhost, letterSpacing: 1.5 },
  form: { gap: 16 },
  field: { gap: 6 },
  label: { fontFamily: fonts.mono, fontSize: 9, color: colors.textMuted, letterSpacing: 1.5 },
  input: {
    fontFamily: fonts.mono, fontSize: 14, color: colors.textPrimary,
    backgroundColor: colors.surface, borderWidth: 1, borderRadius: radius.sm,
    paddingHorizontal: 14, paddingVertical: 12,
  },
  errorBox: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingVertical: 4 },
  errorText: { fontFamily: fonts.mono, fontSize: 11, color: '#ff4444' },
  submitBtn: {
    paddingVertical: 14, borderRadius: radius.sm, alignItems: 'center', marginTop: 8,
  },
  submitText: { fontFamily: fonts.monoBold, fontSize: 12, letterSpacing: 2 },
  skipBtn: { alignItems: 'center', marginTop: 28, paddingVertical: 12 },
  skipText: { fontFamily: fonts.mono, fontSize: 10, color: colors.textMuted, letterSpacing: 1.5 },
  skipSub: { fontFamily: fonts.sans, fontSize: 11, color: colors.textGhost, marginTop: 4, fontStyle: 'italic' },
  footer: {
    fontFamily: fonts.mono, fontSize: 9, color: colors.textGhost,
    textAlign: 'center', marginTop: 40, letterSpacing: 1, fontStyle: 'italic',
  },
});
