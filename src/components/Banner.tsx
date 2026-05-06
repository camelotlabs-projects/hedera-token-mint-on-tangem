import { StyleSheet, Text, View } from "react-native";
import { palette, radius, spacing, type } from "../theme";

type Variant = "info" | "success" | "error" | "warning";

const map = {
  info: { bg: palette.surface, border: palette.border, text: palette.textPrimary },
  success: { bg: palette.successBg, border: palette.success, text: palette.success },
  error: { bg: palette.errorBg, border: palette.error, text: palette.error },
  warning: { bg: palette.warningBg, border: palette.warning, text: palette.warning },
};

export function Banner({
  variant = "info",
  title,
  message,
  children,
}: {
  variant?: Variant;
  title?: string;
  message?: string;
  children?: React.ReactNode;
}) {
  const c = map[variant];
  return (
    <View
      style={[
        styles.wrap,
        { backgroundColor: c.bg, borderColor: c.border },
      ]}
    >
      {title && <Text style={[styles.title, { color: c.text }]}>{title}</Text>}
      {message && (
        <Text style={[styles.message, { color: palette.textPrimary }]}>{message}</Text>
      )}
      {children}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    borderWidth: 1,
    borderRadius: radius.md,
    padding: spacing.md,
    marginVertical: spacing.sm,
  },
  title: {
    ...type.eyebrow,
    marginBottom: spacing.xs,
  },
  message: {
    ...type.body,
  },
});
