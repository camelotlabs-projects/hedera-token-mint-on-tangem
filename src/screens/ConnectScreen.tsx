/**
 * WalletConnect screen — pair the iPhone app with a dapp like SaucerSwap
 * so the emission Tangem card signs the dapp's transactions.
 *
 * The emission account (0.0.10462359) is the one configured to provide
 * SaucerSwap LP + handle public DEX distribution. Treasury and emission
 * are different Tangem cards, so this screen has its own scan step.
 *
 * Flow:
 *   1. Open SaucerSwap.finance (or any Hedera-WC dapp) in a browser.
 *   2. Pick WalletConnect, copy the wc:... URI.
 *   3. Scan emission card here, paste the URI, tap Pair.
 *   4. When the dapp asks for a transaction signature, an iOS NFC popup
 *      pops up — tap the emission card.
 */

import { useEffect, useState } from "react";
import { StyleSheet, Text, View } from "react-native";
import {
  Banner,
  GhostButton,
  Input,
  KV,
  PrimaryButton,
  QrScanner,
  Section,
} from "../components";
import { palette, spacing, type } from "../theme";
import { PublicKey as HederaPublicKey } from "@hashgraph/sdk";
import RNTangemSdk from "tangem-sdk-react-native";
import { ACCOUNTS, HEDERA_DERIVATION_PATH, NETWORK, TANGEM_KEYS } from "../config";
import { getRoleWallet, scanCardForRole } from "../tangem";
import {
  disconnectSession,
  initWalletConnect,
  listSessions,
  pair,
  type SessionInfo,
  wcOn,
} from "../walletconnect";

type LogEntry = { ts: string; level: "info" | "ok" | "err"; msg: string };

interface Props {
  appendLog: (level: LogEntry["level"], msg: string) => void;
}

export function ConnectScreen({ appendLog }: Props) {
  const [uri, setUri] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [sessions, setSessions] = useState<SessionInfo[]>([]);
  const [initialized, setInitialized] = useState(false);
  const [emissionScanned, setEmissionScanned] = useState(false);
  const [scannerVisible, setScannerVisible] = useState(false);

  const refresh = () => setSessions(listSessions());

  useEffect(() => {
    let unsub: (() => boolean) | null = null;
    (async () => {
      try {
        await initWalletConnect();
        setInitialized(true);
        refresh();
        unsub = wcOn(refresh) as any;
      } catch (e) {
        setError(`Init failed: ${(e as Error).message}`);
      }
    })();
    return () => {
      if (unsub) unsub();
    };
  }, []);

  const onVerifyEmissionSign = async () => {
    setBusy(true);
    setError(null);
    try {
      const rw = getRoleWallet("emission");
      if (!rw) throw new Error("Scan emission card first");
      appendLog("info", `slip root: ${rw.slipPublicKey.slice(0, 16)}…`);

      // Sign a deterministic dummy hash and verify offline against the
      // expected emission pubkey. Tells us whether the card derives to the
      // right account-key at HEDERA_DERIVATION_PATH.
      const dummy = new Uint8Array(32);
      for (let i = 0; i < 32; i++) dummy[i] = i + 1;
      const dummyHex = Array.from(dummy)
        .map((b) => b.toString(16).padStart(2, "0"))
        .join("");

      appendLog("info", `Tap emission card to sign dummy hash…`);
      const r: any = await (RNTangemSdk as any).sign({
        cardId: rw.cardId,
        walletPublicKey: rw.slipPublicKey,
        hashes: [dummyHex],
        derivationPath: HEDERA_DERIVATION_PATH,
      });
      const sigHex = r.signatures?.[0] ?? "";
      const sig = new Uint8Array(sigHex.length / 2);
      for (let i = 0; i < sig.length; i++) sig[i] = parseInt(sigHex.substr(i * 2, 2), 16);

      const expected = TANGEM_KEYS.emission;
      const okExpected = expected.verify(dummy, sig);
      appendLog(okExpected ? "ok" : "err", `verify against expected emission (${expected.toString().slice(0, 16)}…) = ${okExpected}`);

      const root = HederaPublicKey.fromString(rw.slipPublicKey);
      const okRoot = root.verify(dummy, sig);
      appendLog(okRoot ? "err" : "ok", `verify against slip root = ${okRoot}${okRoot ? " ← SDK silently signed with ROOT" : ""}`);
    } catch (e) {
      const msg = (e as Error).message;
      setError(msg);
      appendLog("err", msg);
    } finally {
      setBusy(false);
    }
  };

  const onScanEmission = async () => {
    setBusy(true);
    setError(null);
    try {
      appendLog("info", "Tap EMISSION card on the back of the device…");
      const rw = await scanCardForRole("emission");
      appendLog("ok", `Emission card scanned (id ${rw.cardId.slice(0, 8)}…)`);
      setEmissionScanned(true);
    } catch (e) {
      const msg = (e as Error).message;
      setError(msg);
      appendLog("err", msg);
    } finally {
      setBusy(false);
    }
  };

  const onListWallets = async () => {
    setBusy(true);
    setError(null);
    try {
      appendLog("info", "Tap card to enumerate ALL wallets (any curve)…");
      const card: any = await (RNTangemSdk as any).scanCard();
      const wallets = card?.wallets ?? [];
      appendLog("ok", `cardId: ${card?.cardId}`);
      appendLog("ok", `Card has ${wallets.length} wallet(s):`);
      wallets.forEach((w: any, i: number) => {
        appendLog("ok", `  [${i}] ${w.curve}  pub=${w.publicKey}`);
      });
    } catch (e) {
      const msg = (e as Error).message;
      setError(msg);
      appendLog("err", msg);
    } finally {
      setBusy(false);
    }
  };

  const doPair = async (rawUri: string) => {
    if (!rawUri.trim().startsWith("wc:")) {
      setError("Paste a wc:... URI from the dapp's WalletConnect QR.");
      return;
    }
    setBusy(true);
    setError(null);
    try {
      await pair(rawUri.trim());
      appendLog("ok", `Paired with dapp via WalletConnect`);
      setUri("");
      refresh();
    } catch (e) {
      const msg = (e as Error).message;
      setError(msg);
      appendLog("err", msg);
    } finally {
      setBusy(false);
    }
  };

  const onPair = () => doPair(uri);

  const onScanResult = (data: string) => {
    setScannerVisible(false);
    setUri(data);
    // Auto-pair the moment we capture a wc:... uri so the user doesn't
    // need to tap "Pair" after the scan.
    if (data.startsWith("wc:")) {
      doPair(data);
    }
  };

  const onDisconnect = async (topic: string, name: string) => {
    setBusy(true);
    try {
      await disconnectSession(topic);
      appendLog("info", `Disconnected from ${name}`);
      refresh();
    } catch (e) {
      const msg = (e as Error).message;
      setError(msg);
      appendLog("err", msg);
    } finally {
      setBusy(false);
    }
  };

  return (
    <View>
      <Section step={2} title="Connected wallet" subtitle="Exposed to dapps via WalletConnect">
        <KV k="Network" v={NETWORK} />
        <KV k="Account" v={ACCOUNTS.emission.toString()} />
        <Text style={styles.hint}>
          The emission account is exposed for SaucerSwap LP and public DEX distribution. Signing requests prompt a tap on the emission Tangem card.
        </Text>
      </Section>

      <Section
        step={3}
        title="Scan emission card"
        subtitle="Tap the emission Tangem so signing requests can be routed to it"
        state={emissionScanned ? "done" : "active"}
        collapsed={emissionScanned}
        collapsedSummary={emissionScanned ? "Emission card scanned ✓" : undefined}
        onToggle={emissionScanned ? () => setEmissionScanned(false) : undefined}
      >
        <PrimaryButton
          label={emissionScanned ? "Emission card scanned ✓" : "Scan emission card"}
          onPress={onScanEmission}
          disabled={busy || emissionScanned}
          loading={busy && !emissionScanned}
        />
        {emissionScanned && (
          <>
            <View style={{ height: spacing.sm }} />
            <GhostButton
              label="Verify sign (debug)"
              onPress={onVerifyEmissionSign}
              disabled={busy}
            />
            <View style={{ height: spacing.sm }} />
            <GhostButton
              label="List all wallets on card (debug)"
              onPress={onListWallets}
              disabled={busy}
            />
          </>
        )}
      </Section>

      <Section
        step={4}
        title="Pair a dapp"
        subtitle="Paste the wc:... URI from the dapp"
        state={initialized && emissionScanned ? "active" : "locked"}
      >
        {!emissionScanned && (
          <Banner
            variant="warning"
            title="Emission card not scanned"
            message="Scan the emission card above first — signing requests fail without a cached card."
          />
        )}
        <Input
          label="WalletConnect URI"
          hint="Scan the dapp's WalletConnect QR, or paste a wc:... URI manually."
          value={uri}
          onChangeText={setUri}
          placeholder="wc:...@2?relay-protocol=irn&symKey=..."
          autoCapitalize="none"
          mono
          multiline
        />
        <PrimaryButton
          label="Scan QR"
          onPress={() => setScannerVisible(true)}
          disabled={busy || !initialized || !emissionScanned}
        />
        <View style={{ height: spacing.sm }} />
        <PrimaryButton
          label={busy ? "Pairing…" : "Pair from URI"}
          onPress={onPair}
          disabled={busy || !initialized || !emissionScanned || !uri.trim()}
          loading={busy}
        />
        <QrScanner
          visible={scannerVisible}
          onClose={() => setScannerVisible(false)}
          onScan={onScanResult}
        />
        {error && (
          <View style={{ marginTop: spacing.md }}>
            <Banner variant="error" title="Failed" message={error} />
          </View>
        )}
      </Section>

      <Section step={5} title="Active sessions" state={sessions.length > 0 ? "active" : "locked"}>
        {sessions.length === 0 && <Text style={styles.hint}>No sessions yet.</Text>}
        {sessions.map((s) => (
          <View key={s.topic} style={styles.sessionRow}>
            <View style={{ flex: 1 }}>
              <Text style={styles.sessionName}>{s.peerName}</Text>
              {s.peerUrl && <Text style={styles.sessionUrl}>{s.peerUrl}</Text>}
            </View>
            <GhostButton label="Disconnect" onPress={() => onDisconnect(s.topic, s.peerName)} disabled={busy} />
          </View>
        ))}
      </Section>
    </View>
  );
}

const styles = StyleSheet.create({
  hint: {
    ...type.small,
    color: palette.textTertiary,
    marginTop: spacing.sm,
  },
  sessionRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingVertical: spacing.sm,
    borderBottomColor: palette.borderSubtle,
    borderBottomWidth: 1,
  },
  sessionName: {
    ...type.body,
    color: palette.textPrimary,
    fontFamily: "Inter_600SemiBold",
  },
  sessionUrl: {
    ...type.small,
    color: palette.textSecondary,
    marginTop: 2,
  },
});
