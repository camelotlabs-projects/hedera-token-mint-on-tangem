import { ReactNode } from "react";
import { StyleSheet, Text, TouchableOpacity, View } from "react-native";
import { palette, radius, spacing, type } from "../theme";
import { StepBadge } from "./StepBadge";

export type SectionState = "active" | "done" | "locked";

interface Props {
  step?: number;
  title: string;
  subtitle?: string;
  state?: SectionState;
  collapsedSummary?: string;
  onToggle?: () => void;
  collapsed?: boolean;
  children: ReactNode;
}

export function Section({
  step,
  title,
  subtitle,
  state = "active",
  collapsedSummary,
  onToggle,
  collapsed,
  children,
}: Props) {
  const dim = state === "locked";
  const showCollapsed = collapsed && collapsedSummary;

  const Header = (
    <View style={styles.headerRow}>
      {step !== undefined && <StepBadge n={step} state={state} />}
      <View style={{ flex: 1 }}>
        <Text style={[styles.title, dim && styles.dim]}>{title}</Text>
        {subtitle && !showCollapsed && (
          <Text style={styles.subtitle}>{subtitle}</Text>
        )}
        {showCollapsed && (
          <Text style={styles.collapsed}>{collapsedSummary}</Text>
        )}
      </View>
      {state === "done" && <Text style={styles.checkmark}>✓</Text>}
    </View>
  );

  return (
    <View
      style={[
        styles.card,
        state === "locked" && styles.cardLocked,
        state === "active" && styles.cardActive,
      ]}
    >
      {onToggle ? (
        <TouchableOpacity onPress={onToggle} activeOpacity={0.7}>
          {Header}
        </TouchableOpacity>
      ) : (
        Header
      )}
      {!collapsed && <View style={styles.body}>{children}</View>}
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: palette.surface,
    borderColor: palette.borderSubtle,
    borderWidth: 1,
    borderRadius: radius.lg,
    padding: spacing.lg,
    marginTop: spacing.md,
  },
  cardActive: {
    backgroundColor: palette.surfaceElevated,
    borderColor: palette.border,
  },
  cardLocked: {
    opacity: 0.55,
  },
  headerRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.md,
  },
  title: {
    ...type.h2,
    color: palette.textPrimary,
  },
  dim: {
    color: palette.textSecondary,
  },
  subtitle: {
    ...type.small,
    color: palette.textSecondary,
    marginTop: 2,
  },
  collapsed: {
    ...type.mono,
    color: palette.textSecondary,
    marginTop: 4,
  },
  body: {
    marginTop: spacing.md,
  },
  checkmark: {
    ...type.h2,
    color: palette.accent,
  },
});
