import { StyleSheet, Text, TouchableOpacity, View } from "react-native";
import { palette, radius, spacing, type } from "../theme";

export function Radio({
  label,
  selected,
  onPress,
  disabled,
}: {
  label: string;
  selected: boolean;
  onPress: () => void;
  disabled?: boolean;
}) {
  return (
    <TouchableOpacity
      onPress={onPress}
      disabled={disabled}
      style={[
        styles.radio,
        selected && styles.radioSelected,
        disabled && styles.disabled,
      ]}
      activeOpacity={0.8}
    >
      <Text style={[styles.radioText, selected && styles.radioTextSelected]}>
        {label}
      </Text>
    </TouchableOpacity>
  );
}

export function Checkbox({
  label,
  checked,
  onPress,
}: {
  label: string;
  checked: boolean;
  onPress: () => void;
}) {
  return (
    <TouchableOpacity onPress={onPress} style={styles.checkboxRow} activeOpacity={0.7}>
      <View style={[styles.box, checked && styles.boxChecked]}>
        {checked && <Text style={styles.mark}>✓</Text>}
      </View>
      <Text style={styles.checkboxLabel}>{label}</Text>
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  radio: {
    paddingVertical: 8,
    paddingHorizontal: 14,
    borderRadius: radius.pill,
    borderWidth: 1,
    borderColor: palette.border,
    backgroundColor: palette.bg,
    marginRight: spacing.sm,
    marginBottom: spacing.sm,
  },
  radioSelected: {
    backgroundColor: palette.accent,
    borderColor: palette.accent,
  },
  radioText: {
    ...type.body,
    color: palette.textSecondary,
    fontSize: 13,
  },
  radioTextSelected: {
    color: palette.accentOn,
    fontFamily: "Inter_600SemiBold",
  },
  disabled: {
    opacity: 0.4,
  },
  checkboxRow: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: 6,
  },
  box: {
    width: 20,
    height: 20,
    borderRadius: radius.xs,
    borderWidth: 1,
    borderColor: palette.border,
    backgroundColor: palette.bg,
    alignItems: "center",
    justifyContent: "center",
    marginRight: spacing.md,
  },
  boxChecked: {
    backgroundColor: palette.accent,
    borderColor: palette.accent,
  },
  mark: {
    color: palette.accentOn,
    fontSize: 13,
    fontFamily: "Inter_700Bold",
  },
  checkboxLabel: {
    ...type.body,
    color: palette.textPrimary,
  },
});
