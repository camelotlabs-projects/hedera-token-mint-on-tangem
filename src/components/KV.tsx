import { StyleSheet, Text, View } from "react-native";
import { palette, spacing, type } from "../theme";

export function KV({ k, v }: { k: string; v: string }) {
  return (
    <View style={styles.row}>
      <Text style={styles.key}>{k}</Text>
      <Text style={styles.val} numberOfLines={1}>
        {v}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: "row",
    justifyContent: "space-between",
    paddingVertical: 6,
  },
  key: {
    ...type.eyebrow,
    color: palette.textSecondary,
  },
  val: {
    ...type.mono,
    color: palette.textPrimary,
    flexShrink: 1,
    marginLeft: spacing.md,
    textAlign: "right",
  },
});
