import "react-native-get-random-values";
import "text-encoding-polyfill";
import "./src/polyfills";
import { useMemo, useState } from "react";
import {
  KeyboardAvoidingView,
  Linking,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { StatusBar } from "expo-status-bar";
import {
  useFonts,
  Inter_400Regular,
  Inter_500Medium,
  Inter_600SemiBold,
  Inter_700Bold,
} from "@expo-google-fonts/inter";
import {
  ACCOUNTS,
  HAS_SEPARATE_FEE_COLLECTOR,
  HEDERA_DERIVATION_PATH,
  NETWORK,
  TANGEM_KEYS,
  explorerTokenUrl,
  isConfigured,
} from "./src/config";
import {
  buildAccountUpdate,
  buildTokenCreate,
  TokenForm,
  makeClient,
} from "./src/hedera";
import { scanCardForRole, signForRole } from "./src/tangem";
import {
  Banner,
  Checkbox,
  GhostButton,
  Input,
  KV,
  PrimaryButton,
  Radio,
  Section,
} from "./src/components";
import { palette, radius, spacing, type } from "./src/theme";
import { ManageScreen } from "./src/screens/ManageScreen";
import { DiscoverScreen } from "./src/screens/DiscoverScreen";
import { ConnectScreen } from "./src/screens/ConnectScreen";

type LogEntry = { ts: string; level: "info" | "ok" | "err"; msg: string };

const initialForm: TokenForm = {
  tokenType: "fungible",
  name: "",
  symbol: "",
  decimals: 8,
  initialSupplyDisplay: "",
  supplyType: "infinite",
  maxSupplyDisplay: "",
  fee: { type: "none", collectorAccountId: ACCOUNTS.feeCollector.toString() },
  keys: {
    admin: true,
    supply: true,
    kyc: false,
    wipe: false,
    freeze: false,
    feeSchedule: true,
    pause: false,
    metadata: true,
  },
};

export default function App() {
  const [fontsLoaded] = useFonts({
    Inter_400Regular,
    Inter_500Medium,
    Inter_600SemiBold,
    Inter_700Bold,
  });

  const [mode, setMode] = useState<"create" | "manage" | "discover" | "connect">("create");
  const [operatorKey, setOperatorKey] = useState("");
  const [treasuryScanned, setTreasuryScanned] = useState(false);
  const [feeCollectorScanned, setFeeCollectorScanned] = useState(false);
  const [autoAssocDone, setAutoAssocDone] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [createdTokenId, setCreatedTokenId] = useState<string | null>(null);
  const [log, setLog] = useState<LogEntry[]>([]);
  const [logExpanded, setLogExpanded] = useState(false);
  const [form, setForm] = useState<TokenForm>(initialForm);

  const append = (level: LogEntry["level"], msg: string) =>
    setLog((l) => [...l, { ts: new Date().toLocaleTimeString(), level, msg }]);

  const setF = <K extends keyof TokenForm>(k: K, v: TokenForm[K]) =>
    setForm((p) => ({ ...p, [k]: v }));
  const setKey = (k: keyof TokenForm["keys"], v: boolean) =>
    setForm((p) => ({ ...p, keys: { ...p.keys, [k]: v } }));
  const setFee = <K extends keyof NonNullable<TokenForm["fee"]>>(
    k: K,
    v: NonNullable<TokenForm["fee"]>[K],
  ) =>
    setForm((p) => ({
      ...p,
      fee: { ...(p.fee ?? { type: "none", collectorAccountId: "" }), [k]: v },
    }));

  const configured = useMemo(() => isConfigured(), []);
  const setupComplete = operatorKey.trim().length > 0 && treasuryScanned;
  const needsAutoAssoc =
    HAS_SEPARATE_FEE_COLLECTOR &&
    form.fee?.type !== "none" &&
    form.fee?.collectorAccountId === ACCOUNTS.feeCollector.toString();
  const autoAssocSatisfied = !needsAutoAssoc || autoAssocDone;
  const formValid =
    form.name.trim().length > 0 &&
    form.symbol.trim().length > 0 &&
    (form.tokenType === "nft" || form.initialSupplyDisplay.trim().length > 0);

  const reset = () => {
    setCreatedTokenId(null);
    setError(null);
    setForm(initialForm);
    setAutoAssocDone(false);
  };

  const onScanTreasury = async () => {
    setBusy(true);
    setError(null);
    try {
      append("info", "Tap TREASURY card on the back of the device…");
      const rw = await scanCardForRole("treasury");
      append("ok", `Treasury card scanned (id ${rw.cardId.slice(0, 8)}…)`);
      setTreasuryScanned(true);
    } catch (e) {
      const msg = (e as Error).message;
      setError(`Treasury scan failed: ${msg}`);
      append("err", msg);
    } finally {
      setBusy(false);
    }
  };

  const onScanFeeCollector = async () => {
    setBusy(true);
    setError(null);
    try {
      append("info", "Tap FEE COLLECTOR card on the back of the device…");
      const rw = await scanCardForRole("feeCollector");
      append("ok", `Fee collector scanned (id ${rw.cardId.slice(0, 8)}…)`);
      setFeeCollectorScanned(true);
    } catch (e) {
      const msg = (e as Error).message;
      setError(`Fee collector scan failed: ${msg}`);
      append("err", msg);
    } finally {
      setBusy(false);
    }
  };

  const runAutoAssoc = async () => {
    setBusy(true);
    setError(null);
    try {
      if (!operatorKey.trim()) throw new Error("Enter operator private key first");
      if (!feeCollectorScanned) throw new Error("Scan fee collector card first");

      const client = makeClient(operatorKey.trim());
      append("info", "Building AccountUpdate to open auto-association slot…");
      const tx = buildAccountUpdate(client);

      append("info", "Tap FEE COLLECTOR card to sign");
      await tx.signWith(TANGEM_KEYS.feeCollector, async (bytes) =>
        signForRole("feeCollector", HEDERA_DERIVATION_PATH, bytes),
      );

      append("info", "Submitting…");
      const resp = await tx.execute(client);
      const receipt = await resp.getReceipt(client);
      append("ok", `AccountUpdate ${receipt.status.toString()}`);
      setAutoAssocDone(true);
      client.close();
    } catch (e) {
      const msg = (e as Error).message;
      setError(`Auto-association failed: ${msg}`);
      append("err", msg);
    } finally {
      setBusy(false);
    }
  };

  const runMint = async () => {
    setBusy(true);
    setError(null);
    setCreatedTokenId(null);
    try {
      if (!operatorKey.trim()) throw new Error("Enter operator private key first");
      if (!treasuryScanned) throw new Error("Scan treasury card first");
      if (!formValid) throw new Error("Name, symbol and supply are required");

      const client = makeClient(operatorKey.trim());
      append("info", `Building TokenCreate for ${form.symbol} (${form.tokenType})…`);
      const tx = buildTokenCreate(client, form);

      append("info", "Tap TREASURY card to sign");
      await tx.signWith(TANGEM_KEYS.treasury, async (bytes) =>
        signForRole("treasury", HEDERA_DERIVATION_PATH, bytes),
      );

      // If the token has a custom fee that routes to a separate fee collector
      // account (different from the treasury), Hedera consensus requires that
      // collector account-key to also sign the TokenCreate. Skipping this
      // produces INVALID_SIGNATURE — even when allCollectorsAreExempt is true,
      // because the exemption only covers fee payment, not collector-role
      // authorisation.
      const feeCollectorMustSign =
        form.fee &&
        form.fee.type !== "none" &&
        form.fee.collectorAccountId &&
        form.fee.collectorAccountId !== ACCOUNTS.treasury.toString();
      if (feeCollectorMustSign) {
        if (!feeCollectorScanned) {
          throw new Error(
            "Custom fee uses a separate fee collector — scan the fee collector card first (Auto-association section).",
          );
        }
        append("info", "Tap FEE COLLECTOR card to authorise fee collector role");
        await tx.signWith(TANGEM_KEYS.feeCollector, async (bytes) =>
          signForRole("feeCollector", HEDERA_DERIVATION_PATH, bytes),
        );
      }

      append("info", "Submitting…");
      const resp = await tx.execute(client);
      const receipt = await resp.getReceipt(client);
      const id = receipt.tokenId?.toString() ?? null;
      if (!id) throw new Error("No token ID in receipt");
      append("ok", `${form.symbol} minted: ${id}`);
      append("ok", `Tx: ${resp.transactionId.toString()}`);
      setCreatedTokenId(id);
      client.close();
    } catch (e) {
      const msg = (e as Error).message;
      setError(`Mint failed: ${msg}`);
      append("err", msg);
    } finally {
      setBusy(false);
    }
  };

  if (!fontsLoaded) {
    return <SafeAreaView style={styles.safe} />;
  }

  return (
    <SafeAreaView style={styles.safe} edges={["top", "left", "right"]}>
      <StatusBar style="light" />
      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === "ios" ? "padding" : undefined}
        keyboardVerticalOffset={0}
      >
      <ScrollView
        contentContainerStyle={styles.scroll}
        keyboardShouldPersistTaps="handled"
        keyboardDismissMode="interactive"
        automaticallyAdjustKeyboardInsets
      >
        <View style={styles.header}>
          <Text style={styles.eyebrow}>{NETWORK.toUpperCase()}</Text>
          <Text style={styles.h1}>Hedera Token Mint</Text>
          <Text style={styles.lede}>
            Mint Hedera Token Service tokens with hardware signatures from your Tangem card. Operator keys never leave the device.
          </Text>
        </View>

        {!configured && (
          <Banner
            variant="warning"
            title="Configuration required"
            message="Edit src/config.ts with your operator, treasury and Tangem-derived public keys before minting."
          />
        )}

        <Section title="Configuration" subtitle="Loaded from src/config.ts">
          <KV k="Network" v={NETWORK} />
          <KV k="Operator" v={ACCOUNTS.operator.toString()} />
          <KV k="Treasury" v={ACCOUNTS.treasury.toString()} />
          {HAS_SEPARATE_FEE_COLLECTOR && (
            <KV k="Fee collector" v={ACCOUNTS.feeCollector.toString()} />
          )}
          <KV k="Derivation" v={HEDERA_DERIVATION_PATH} />
        </Section>

        <Section
          step={1}
          title="Setup"
          subtitle="Operator key + treasury card"
          state={setupComplete ? "done" : "active"}
          collapsed={setupComplete}
          collapsedSummary={setupComplete ? "Operator key set · Treasury scanned" : undefined}
          onToggle={
            setupComplete
              ? () => {
                  setOperatorKey("");
                  setTreasuryScanned(false);
                }
              : undefined
          }
        >
          <Input
            label="Operator private key"
            hint="ECDSA secp256k1 hex. Held in memory until app closes."
            value={operatorKey}
            onChangeText={setOperatorKey}
            placeholder="3030020100300706052b8104000a0..."
            secure
            mono
          />
          <View style={{ height: spacing.sm }} />
          <PrimaryButton
            label={treasuryScanned ? "Treasury card scanned ✓" : "Scan treasury card"}
            onPress={onScanTreasury}
            disabled={busy || !operatorKey.trim() || treasuryScanned}
            loading={busy && !treasuryScanned}
          />
        </Section>

        <View style={styles.modeRow}>
          <Radio label="Create new token" selected={mode === "create"} onPress={() => setMode("create")} />
          <Radio label="Manage existing" selected={mode === "manage"} onPress={() => setMode("manage")} />
          <Radio label="Discover paths" selected={mode === "discover"} onPress={() => setMode("discover")} />
          <Radio label="Connect dapp" selected={mode === "connect"} onPress={() => setMode("connect")} />
        </View>

        {mode === "connect" ? (
          <ConnectScreen treasuryScanned={treasuryScanned} appendLog={append} />
        ) : mode === "discover" ? (
          <DiscoverScreen />
        ) : mode === "manage" ? (
          <ManageScreen
            operatorKey={operatorKey}
            treasuryScanned={treasuryScanned}
            busy={busy}
            setBusy={setBusy}
            appendLog={append}
          />
        ) : (
        <>
        <Section
          step={2}
          title="Token specification"
          subtitle="Name, supply, fees, keys"
          state={setupComplete ? "active" : "locked"}
        >
          <Text style={styles.fieldLabel}>Token type</Text>
          <View style={styles.row}>
            <Radio
              label="Fungible"
              selected={form.tokenType === "fungible"}
              onPress={() => setF("tokenType", "fungible")}
            />
            <Radio
              label="Non-fungible (NFT)"
              selected={form.tokenType === "nft"}
              onPress={() => setF("tokenType", "nft")}
            />
          </View>

          <Input
            label="Name"
            value={form.name}
            onChangeText={(t) => setF("name", t)}
            placeholder="My Token"
          />
          <Input
            label="Symbol"
            value={form.symbol}
            onChangeText={(t) => setF("symbol", t)}
            placeholder="MYT"
            autoCapitalize="characters"
          />

          {form.tokenType === "fungible" && (
            <>
              <Input
                label="Decimals"
                value={String(form.decimals)}
                onChangeText={(t) => setF("decimals", parseInt(t || "0", 10) || 0)}
                keyboardType="number-pad"
              />
              <Input
                label="Initial supply"
                hint="In display units, e.g. 1000000 for 1M tokens"
                value={form.initialSupplyDisplay}
                onChangeText={(t) => setF("initialSupplyDisplay", t)}
                placeholder="1000000"
                keyboardType="number-pad"
              />
            </>
          )}

          <Text style={styles.fieldLabel}>Supply cap</Text>
          <View style={styles.row}>
            <Radio
              label="Infinite"
              selected={form.supplyType === "infinite"}
              onPress={() => setF("supplyType", "infinite")}
              disabled={form.tokenType === "nft"}
            />
            <Radio
              label="Finite"
              selected={form.supplyType === "finite"}
              onPress={() => setF("supplyType", "finite")}
            />
          </View>
          {form.supplyType === "finite" && (
            <Input
              label="Max supply"
              value={form.maxSupplyDisplay ?? ""}
              onChangeText={(t) => setF("maxSupplyDisplay", t)}
              placeholder="1000000"
              keyboardType="number-pad"
            />
          )}

          <Text style={styles.fieldLabel}>Custom fee</Text>
          <View style={[styles.row, { flexWrap: "wrap" }]}>
            <Radio label="None" selected={form.fee?.type === "none"} onPress={() => setFee("type", "none")} />
            <Radio label="Fractional %" selected={form.fee?.type === "fractional"} onPress={() => setFee("type", "fractional")} />
            <Radio label="Fixed HBAR" selected={form.fee?.type === "fixedHbar"} onPress={() => setFee("type", "fixedHbar")} />
            <Radio label="Fixed token" selected={form.fee?.type === "fixedToken"} onPress={() => setFee("type", "fixedToken")} />
            {form.tokenType === "nft" && (
              <Radio label="Royalty" selected={form.fee?.type === "royalty"} onPress={() => setFee("type", "royalty")} />
            )}
          </View>

          {form.fee?.type === "fractional" && (
            <Input
              label="Percentage"
              hint="Sender pays. 1 = 1%, 0.25 = 0.25%."
              value={form.fee.percent ?? ""}
              onChangeText={(t) => setFee("percent", t)}
              placeholder="1"
              keyboardType="decimal-pad"
            />
          )}
          {form.fee?.type === "fixedHbar" && (
            <Input
              label="Fixed HBAR"
              value={form.fee.hbarAmount ?? ""}
              onChangeText={(t) => setFee("hbarAmount", t)}
              placeholder="0.5"
              keyboardType="decimal-pad"
            />
          )}
          {form.fee?.type === "fixedToken" && (
            <>
              <Input
                label="Token ID"
                value={form.fee.tokenId ?? ""}
                onChangeText={(t) => setFee("tokenId", t)}
                placeholder="0.0.x"
              />
              <Input
                label="Amount (base units)"
                value={form.fee.tokenAmount ?? ""}
                onChangeText={(t) => setFee("tokenAmount", t)}
                placeholder="100"
                keyboardType="number-pad"
              />
            </>
          )}
          {form.fee?.type === "royalty" && (
            <>
              <View style={styles.fractionRow}>
                <View style={{ flex: 1 }}>
                  <Input
                    label="Numerator"
                    value={form.fee.royaltyNumerator ?? ""}
                    onChangeText={(t) => setFee("royaltyNumerator", t)}
                    placeholder="5"
                    keyboardType="number-pad"
                  />
                </View>
                <Text style={styles.divider}>/</Text>
                <View style={{ flex: 1 }}>
                  <Input
                    label="Denominator"
                    value={form.fee.royaltyDenominator ?? ""}
                    onChangeText={(t) => setFee("royaltyDenominator", t)}
                    placeholder="100"
                    keyboardType="number-pad"
                  />
                </View>
              </View>
              <Input
                label="Fallback HBAR (when buyer is exempt)"
                value={form.fee.fallbackHbar ?? ""}
                onChangeText={(t) => setFee("fallbackHbar", t)}
                placeholder="0"
                keyboardType="decimal-pad"
              />
            </>
          )}
          {form.fee?.type !== "none" && (
            <Input
              label="Fee collector account"
              value={form.fee?.collectorAccountId ?? ""}
              onChangeText={(t) => setFee("collectorAccountId", t)}
              placeholder="0.0.x"
            />
          )}

          <Text style={styles.fieldLabel}>Token keys</Text>
          <Text style={styles.hint}>
            Treasury (Tangem) holds every enabled key. Disable to make the role permanently absent.
          </Text>
          <View style={{ marginTop: spacing.sm }}>
            {(["admin", "supply", "kyc", "wipe", "freeze", "feeSchedule", "pause", "metadata"] as const).map((k) => (
              <Checkbox key={k} label={k} checked={form.keys[k]} onPress={() => setKey(k, !form.keys[k])} />
            ))}
          </View>
        </Section>

        {needsAutoAssoc && (
          <Section
            step={3}
            title="Open auto-association"
            subtitle="Required when fee collector is a separate account"
            state={!setupComplete ? "locked" : autoAssocDone ? "done" : "active"}
            collapsed={autoAssocDone}
            collapsedSummary={autoAssocDone ? "Auto-association open ✓" : undefined}
          >
            <Text style={styles.hint}>
              Sets MaxAutomaticTokenAssociations on the fee collector so it can receive the new token without an explicit associate transaction.
            </Text>
            <View style={{ height: spacing.md }} />
            <PrimaryButton
              label={feeCollectorScanned ? "Fee collector scanned ✓" : "Scan fee collector card"}
              onPress={onScanFeeCollector}
              disabled={busy || feeCollectorScanned}
              loading={busy && !feeCollectorScanned}
            />
            <View style={{ height: spacing.sm }} />
            <PrimaryButton
              label="Sign AccountUpdate"
              onPress={runAutoAssoc}
              disabled={busy || !feeCollectorScanned || autoAssocDone}
              loading={busy && feeCollectorScanned && !autoAssocDone}
            />
          </Section>
        )}

        <Section
          step={needsAutoAssoc ? 4 : 3}
          title="Mint"
          subtitle="Sign and submit TokenCreate"
          state={
            !setupComplete || !autoAssocSatisfied
              ? "locked"
              : createdTokenId
                ? "done"
                : "active"
          }
        >
          {createdTokenId ? (
            <>
              <Banner variant="success" title="Token minted">
                <Text style={styles.successId}>{createdTokenId}</Text>
              </Banner>
              <View style={{ height: spacing.sm }} />
              <GhostButton
                label="View on HashScan"
                onPress={() => Linking.openURL(explorerTokenUrl(createdTokenId))}
              />
              <View style={{ height: spacing.sm }} />
              <GhostButton label="Mint another" onPress={reset} />
            </>
          ) : (
            <PrimaryButton
              label={`Mint ${form.symbol || "token"}`}
              onPress={runMint}
              disabled={
                busy ||
                !setupComplete ||
                !autoAssocSatisfied ||
                !formValid ||
                !configured
              }
              loading={busy && setupComplete && !createdTokenId}
            />
          )}
          {!configured && (
            <>
              <View style={{ height: spacing.sm }} />
              <Text style={styles.hint}>Mint disabled — config.ts still uses placeholder values.</Text>
            </>
          )}
        </Section>
        </>
        )}

        {error && <Banner variant="error" title="Error" message={error} />}

        <TouchableOpacity
          onPress={() => setLogExpanded((s) => !s)}
          activeOpacity={0.7}
          style={styles.logHeader}
        >
          <Text style={styles.eyebrow}>Log {log.length > 0 && `(${log.length})`}</Text>
          <Text style={styles.logToggle}>{logExpanded ? "Hide" : "Show"}</Text>
        </TouchableOpacity>
        {logExpanded && (
          <View style={styles.logBody}>
            {log.length === 0 ? (
              <Text style={styles.hint}>No events yet.</Text>
            ) : (
              log.map((l, i) => (
                <Text
                  key={i}
                  style={[
                    styles.logLine,
                    l.level === "ok" && { color: palette.success },
                    l.level === "err" && { color: palette.error },
                  ]}
                >
                  [{l.ts}] {l.msg}
                </Text>
              ))
            )}
          </View>
        )}
      </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: palette.bg },
  scroll: {
    paddingHorizontal: spacing.lg,
    paddingBottom: spacing.xxl,
    paddingTop: spacing.md,
  },
  header: {
    paddingVertical: spacing.lg,
  },
  eyebrow: {
    ...type.eyebrow,
    color: palette.accent,
    marginBottom: spacing.xs,
  },
  h1: {
    ...type.display,
    color: palette.textPrimary,
    marginBottom: spacing.sm,
  },
  lede: {
    ...type.body,
    color: palette.textSecondary,
  },
  fieldLabel: {
    ...type.eyebrow,
    color: palette.textSecondary,
    marginTop: spacing.md,
    marginBottom: spacing.sm,
  },
  hint: {
    ...type.small,
    color: palette.textTertiary,
  },
  row: {
    flexDirection: "row",
    alignItems: "center",
    flexWrap: "wrap",
  },
  modeRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    marginTop: spacing.lg,
    marginBottom: 0,
  },
  fractionRow: {
    flexDirection: "row",
    alignItems: "center",
  },
  divider: {
    color: palette.textSecondary,
    fontSize: 18,
    paddingHorizontal: spacing.md,
    marginTop: spacing.lg,
  },
  successId: {
    ...type.mono,
    color: palette.textPrimary,
    fontSize: 14,
    marginTop: spacing.xs,
  },
  logHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.md,
    marginTop: spacing.md,
  },
  logToggle: {
    ...type.small,
    color: palette.textSecondary,
  },
  logBody: {
    backgroundColor: palette.surface,
    borderColor: palette.borderSubtle,
    borderWidth: 1,
    borderRadius: radius.md,
    padding: spacing.md,
  },
  logLine: {
    ...type.monoSmall,
    color: palette.textSecondary,
    marginBottom: 2,
  },
});
