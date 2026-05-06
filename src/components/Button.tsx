import { ActivityIndicator, StyleSheet, Text, TouchableOpacity, View } from "react-native";
import { palette, radius, spacing, type } from "../theme";

interface Props {
  label: string;
  onPress: () => void;
  disabled?: boolean;
  loading?: boolean;
}

export function PrimaryButton({ label, onPress, disabled, loading }: Props) {
  const isDisabled = disabled || loading;
  return (
    <TouchableOpacity
      style={[styles.btn, styles.primary, isDisabled && styles.disabled]}
      onPress={onPress}
      disabled={isDisabled}
      activeOpacity={0.85}
    >
      <View style={styles.row}>
        {loading && (
          <ActivityIndicator color={palette.accentOn} size="small" style={{ marginRight: spacing.sm }} />
        )}
        <Text style={[styles.label, styles.primaryLabel]}>{label}</Text>
      </View>
    </TouchableOpacity>
  );
}

export function GhostButton({ label, onPress, disabled, loading }: Props) {
  const isDisabled = disabled || loading;
  return (
    <TouchableOpacity
      style={[styles.btn, styles.ghost, isDisabled && styles.disabled]}
      onPress={onPress}
      disabled={isDisabled}
      activeOpacity={0.7}
    >
      <View style={styles.row}>
        {loading && (
          <ActivityIndicator color={palette.accent} size="small" style={{ marginRight: spacing.sm }} />
        )}
        <Text style={[styles.label, styles.ghostLabel]}>{label}</Text>
      </View>
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  btn: {
    borderRadius: radius.md,
    paddingVertical: 14,
    paddingHorizontal: spacing.lg,
    alignItems: "center",
    justifyContent: "center",
    minHeight: 48,
  },
  row: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
  },
  primary: {
    backgroundColor: palette.accent,
  },
  ghost: {
    backgroundColor: "transparent",
    borderWidth: 1,
    borderColor: palette.border,
  },
  disabled: {
    opacity: 0.4,
  },
  label: {
    ...type.button,
  },
  primaryLabel: {
    color: palette.accentOn,
  },
  ghostLabel: {
    color: palette.textPrimary,
  },
});
