import { ReactNode } from 'react';
import {
  ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, TextInput, View,
  type StyleProp, type TextStyle, type ViewStyle,
} from 'react-native';
import { MAX_CONTENT_WIDTH, radius, spacing, typography, useTheme, type Theme } from '../theme';

/** Centres content and caps its width, so the web build is not one long line. */
export function Screen({ children, style }: { children: ReactNode; style?: StyleProp<ViewStyle> }) {
  const theme = useTheme();
  return (
    <View style={[{ flex: 1, backgroundColor: theme.background }, style]}>
      <View style={{ flex: 1, width: '100%', maxWidth: MAX_CONTENT_WIDTH, alignSelf: 'center' }}>
        {children}
      </View>
    </View>
  );
}

export function Heading({
  children, level = 1, style,
}: { children: ReactNode; level?: 1 | 2 | 3; style?: StyleProp<TextStyle> }) {
  const theme = useTheme();
  const sizes = { 1: 28, 2: 20, 3: 16 } as const;
  return (
    <Text
      accessibilityRole="header"
      style={[
        {
          color: theme.text,
          fontSize: sizes[level],
          fontWeight: level === 3 ? '600' : '700',
          fontFamily: level === 1 ? typography.display : undefined,
          lineHeight: sizes[level] * 1.25,
        },
        style,
      ]}
    >
      {children}
    </Text>
  );
}

export function Body({
  children, muted, numberOfLines, style,
}: { children: ReactNode; muted?: boolean; numberOfLines?: number; style?: StyleProp<TextStyle> }) {
  const theme = useTheme();
  return (
    <Text
      numberOfLines={numberOfLines}
      style={[{ color: muted ? theme.textMuted : theme.text, fontSize: 15, lineHeight: 22 }, style]}
    >
      {children}
    </Text>
  );
}

export function Card({
  children, onPress, style, accessibilityLabel,
}: {
  children: ReactNode;
  onPress?: () => void;
  style?: StyleProp<ViewStyle>;
  accessibilityLabel?: string;
}) {
  const theme = useTheme();
  const base: ViewStyle = {
    backgroundColor: theme.surface,
    borderColor: theme.border,
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: radius.lg,
    padding: spacing.lg,
  };

  if (!onPress) return <View style={[base, style]}>{children}</View>;
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel}
      style={({ pressed }) => [base, pressed && { opacity: 0.7 }, style]}
    >
      {children}
    </Pressable>
  );
}

export function Button({
  label, onPress, variant = 'primary', disabled, loading, icon, style,
}: {
  label: string;
  onPress: () => void;
  variant?: 'primary' | 'secondary' | 'ghost' | 'danger';
  disabled?: boolean;
  loading?: boolean;
  icon?: ReactNode;
  style?: StyleProp<ViewStyle>;
}) {
  const theme = useTheme();
  const palette = buttonPalette(theme, variant);
  const inactive = disabled || loading;

  return (
    <Pressable
      onPress={onPress}
      disabled={inactive}
      accessibilityRole="button"
      accessibilityState={{ disabled: Boolean(inactive), busy: Boolean(loading) }}
      style={({ pressed }) => [
        {
          flexDirection: 'row',
          alignItems: 'center',
          justifyContent: 'center',
          gap: spacing.sm,
          backgroundColor: palette.background,
          borderColor: palette.border,
          borderWidth: variant === 'ghost' ? 0 : StyleSheet.hairlineWidth,
          borderRadius: radius.md,
          // 48pt keeps every control comfortably tappable with floury hands.
          minHeight: 48,
          paddingHorizontal: spacing.lg,
        },
        pressed && !inactive && { opacity: 0.75 },
        inactive && { opacity: 0.45 },
        style,
      ]}
    >
      {loading ? <ActivityIndicator size="small" color={palette.text} /> : icon}
      <Text style={{ color: palette.text, fontSize: 16, fontWeight: '600' }}>{label}</Text>
    </Pressable>
  );
}

function buttonPalette(theme: Theme, variant: 'primary' | 'secondary' | 'ghost' | 'danger') {
  switch (variant) {
    case 'primary':
      return { background: theme.accent, border: theme.accent, text: theme.onAccent };
    case 'danger':
      return { background: 'transparent', border: theme.danger, text: theme.danger };
    case 'ghost':
      return { background: 'transparent', border: 'transparent', text: theme.accent };
    case 'secondary':
    default:
      return { background: theme.surface, border: theme.border, text: theme.text };
  }
}

export function Field({
  label, value, onChangeText, placeholder, multiline, keyboardType, autoFocus, minHeight, hint, style,
}: {
  label?: string;
  value: string;
  onChangeText: (text: string) => void;
  placeholder?: string;
  multiline?: boolean;
  keyboardType?: 'default' | 'numeric' | 'url';
  autoFocus?: boolean;
  minHeight?: number;
  hint?: string;
  style?: StyleProp<ViewStyle>;
}) {
  const theme = useTheme();
  return (
    <View style={[{ gap: spacing.xs }, style]}>
      {label ? <Text style={{ color: theme.textMuted, fontSize: 13, fontWeight: '600' }}>{label}</Text> : null}
      <TextInput
        value={value}
        onChangeText={onChangeText}
        placeholder={placeholder}
        placeholderTextColor={theme.textFaint}
        multiline={multiline}
        keyboardType={keyboardType}
        autoFocus={autoFocus}
        autoCapitalize={keyboardType === 'url' ? 'none' : 'sentences'}
        autoCorrect={keyboardType !== 'url'}
        accessibilityLabel={label}
        style={{
          backgroundColor: theme.surface,
          borderColor: theme.border,
          borderWidth: StyleSheet.hairlineWidth,
          borderRadius: radius.md,
          color: theme.text,
          fontSize: 16,
          padding: spacing.md,
          minHeight: minHeight ?? (multiline ? 120 : 48),
          textAlignVertical: multiline ? 'top' : 'center',
        }}
      />
      {hint ? <Text style={{ color: theme.textFaint, fontSize: 12 }}>{hint}</Text> : null}
    </View>
  );
}

export function Chip({
  label, selected, onPress, tone = 'neutral',
}: {
  label: string;
  selected?: boolean;
  onPress?: () => void;
  tone?: 'neutral' | 'success' | 'warning' | 'accent';
}) {
  const theme = useTheme();
  const tones = {
    neutral: { background: theme.surfaceMuted, text: theme.textMuted },
    success: { background: theme.successSoft, text: theme.success },
    warning: { background: theme.warningSoft, text: theme.warning },
    accent: { background: theme.accentSoft, text: theme.accent },
  } as const;
  const palette = selected ? { background: theme.accent, text: theme.onAccent } : tones[tone];

  const content = (
    <View
      style={{
        backgroundColor: palette.background,
        borderRadius: radius.pill,
        paddingHorizontal: spacing.md,
        paddingVertical: 6,
      }}
    >
      <Text style={{ color: palette.text, fontSize: 13, fontWeight: '600' }}>{label}</Text>
    </View>
  );

  if (!onPress) return content;
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityState={{ selected: Boolean(selected) }}
      style={({ pressed }) => (pressed ? { opacity: 0.7 } : undefined)}
    >
      {content}
    </Pressable>
  );
}

export function EmptyState({
  title, message, action,
}: { title: string; message: string; action?: ReactNode }) {
  return (
    <View style={{ alignItems: 'center', gap: spacing.md, padding: spacing.xl }}>
      <Heading level={2} style={{ textAlign: 'center' }}>{title}</Heading>
      <Body muted style={{ textAlign: 'center' }}>{message}</Body>
      {action}
    </View>
  );
}

export function Notice({
  tone = 'warning', title, children,
}: { tone?: 'warning' | 'danger' | 'success'; title?: string; children: ReactNode }) {
  const theme = useTheme();
  const tones = {
    warning: { background: theme.warningSoft, text: theme.warning },
    danger: { background: theme.accentSoft, text: theme.danger },
    success: { background: theme.successSoft, text: theme.success },
  } as const;
  const palette = tones[tone];

  return (
    <View style={{ backgroundColor: palette.background, borderRadius: radius.md, padding: spacing.md, gap: spacing.xs }}>
      {title ? <Text style={{ color: palette.text, fontWeight: '700', fontSize: 14 }}>{title}</Text> : null}
      <Text style={{ color: palette.text, fontSize: 14, lineHeight: 20 }}>{children}</Text>
    </View>
  );
}

export function Loading({ message }: { message?: string }) {
  const theme = useTheme();
  return (
    <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', gap: spacing.md, padding: spacing.xl }}>
      <ActivityIndicator color={theme.accent} />
      {message ? <Body muted style={{ textAlign: 'center' }}>{message}</Body> : null}
    </View>
  );
}

export function Divider() {
  const theme = useTheme();
  return <View style={{ height: StyleSheet.hairlineWidth, backgroundColor: theme.border }} />;
}

export { ScrollView };
