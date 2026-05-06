import { StyleSheet, Text, View } from "react-native";
import { palette, radius, type } from "../theme";
import { SectionState } from "./Section";

export function StepBadge({ n, state }: { n: number; state: SectionState }) {
  const variant =
    state === "done"
      ? styles.done
      : state === "active"
        ? styles.active
        : styles.locked;
  const text =
    state === "done"
      ? styles.doneText
      : state === "active"
        ? styles.activeText
        : styles.lockedText;
  return (
    <View style={[styles.badge, variant]}>
      <Text style={[styles.text, text]}>{n}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  badge: {
    width: 28,
    height: 28,
    borderRadius: radius.pill,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1,
  },
  active: {
    backgroundColor: palette.accent,
    borderColor: palette.accent,
  },
  done: {
    backgroundColor: "transparent",
    borderColor: palette.accent,
  },
  locked: {
    backgroundColor: "transparent",
    borderColor: palette.border,
  },
  text: {
    ...type.button,
    fontSize: 13,
  },
  activeText: {
    color: palette.accentOn,
  },
  doneText: {
    color: palette.accent,
  },
  lockedText: {
    color: palette.textTertiary,
  },
});
