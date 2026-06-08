import React, { useState, useCallback, useRef } from 'react';
import { View, TextInput, TouchableOpacity, StyleSheet, Animated } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { colors, fonts, radius } from '../theme';

export default function SearchBar({ value, onChangeText, onSubmit, placeholder, accentColor }) {
  const [focused, setFocused] = useState(false);
  const borderAnim = useRef(new Animated.Value(0)).current;
  const accent = accentColor || colors.amber;

  const handleFocus = useCallback(() => {
    setFocused(true);
    Animated.timing(borderAnim, { toValue: 1, duration: 200, useNativeDriver: false }).start();
  }, []);

  const handleBlur = useCallback(() => {
    setFocused(false);
    Animated.timing(borderAnim, { toValue: 0, duration: 200, useNativeDriver: false }).start();
  }, []);

  const borderColor = borderAnim.interpolate({
    inputRange: [0, 1],
    outputRange: [colors.border, accent],
  });

  return (
    <Animated.View style={[styles.container, { borderColor }]}>
      <Ionicons name="search" size={16} color={focused ? accent : colors.textGhost} style={styles.icon} />
      <TextInput
        style={styles.input}
        value={value}
        onChangeText={onChangeText}
        onSubmitEditing={onSubmit}
        onFocus={handleFocus}
        onBlur={handleBlur}
        placeholder={placeholder || 'SEARCH THE ARCHIVE...'}
        placeholderTextColor={colors.textGhost}
        returnKeyType="search"
        autoCorrect={false}
        autoCapitalize="none"
        selectionColor={accent}
      />
      {value ? (
        <TouchableOpacity onPress={() => onChangeText('')} style={styles.clearBtn} hitSlop={8}>
          <Ionicons name="close-circle" size={16} color={colors.textMuted} />
        </TouchableOpacity>
      ) : null}
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row', alignItems: 'center',
    backgroundColor: 'rgba(255,255,255,0.04)',
    borderWidth: 1, borderRadius: radius.sm, paddingHorizontal: 12, height: 44,
  },
  icon: { marginRight: 10 },
  input: { flex: 1, fontFamily: fonts.mono, fontSize: 12, color: colors.textPrimary, letterSpacing: 0.8, paddingVertical: 0 },
  clearBtn: { padding: 4, marginLeft: 4 },
});
