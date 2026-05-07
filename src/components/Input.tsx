import { useState } from "react";
import { KeyboardTypeOptions, StyleSheet, Text, TextInput, View } from "react-native";
import { palette, radius, spacing, type } from "../theme";

interface Props {
  label?: string;
  hint?: string;
  value: string;
  onChangeText: (v: string) => void;
  placeholder?: string;
  keyboardType?: KeyboardTypeOptions;
  autoCapitalize?: "none" | "characters" | "sentences" | "words";
  autoCorrect?: boolean;
  secure?: boolean;
  mono?: boolean;
  multiline?: boolean;
}

export function Input({
  label,
  hint,
  value,
  onChangeText,
  placeholder,
  keyboardType,
  autoCapitalize = "none",
  autoCorrect = false,
  secure,
  mono,
  multiline,
}: Props) {
  const [focused, setFocused] = useState(false);
  return (
    <View style={styles.wrap}>
      {label && <Text style={styles.label}>{label}</Text>}
      <TextInput
        style={[
          styles.input,
          mono && styles.mono,
          multiline && styles.multiline,
          focused && styles.focused,
        ]}
        value={value}
        onChangeText={onChangeText}
        placeholder={placeholder}
        placeholderTextColor={palette.textTertiary}
        keyboardType={keyboardType}
        autoCapitalize={autoCapitalize}
        autoCorrect={autoCorrect}
        secureTextEntry={secure}
        multiline={multiline}
        textAlignVertical={multiline ? "top" : "auto"}
        onFocus={() => setFocused(true)}
        onBlur={() => setFocused(false)}
      />
      {hint && <Text style={styles.hint}>{hint}</Text>}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    marginBottom: spacing.md,
  },
  label: {
    ...type.eyebrow,
    color: palette.textSecondary,
    marginBottom: spacing.sm,
  },
  input: {
    backgroundColor: palette.bg,
    borderColor: palette.border,
    borderWidth: 1,
    borderRadius: radius.md,
    paddingHorizontal: spacing.md,
    paddingVertical: 12,
    color: palette.textPrimary,
    ...type.body,
  },
  mono: {
    ...type.mono,
  },
  multiline: {
    minHeight: 100,
    paddingTop: 12,
  },
  focused: {
    borderColor: palette.accent,
  },
  hint: {
    ...type.small,
    color: palette.textTertiary,
    marginTop: spacing.xs,
  },
});
