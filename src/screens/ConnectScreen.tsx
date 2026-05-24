/**
 * WalletConnect screen — pair the iPhone app with a dapp like SaucerSwap
 * so the treasury Tangem card signs the dapp's transactions.
 *
 * Flow:
 *   1. Open SaucerSwap.finance (or any Hedera-WC dapp) in a browser.
 *   2. Pick WalletConnect, copy the wc:... URI.
 *   3. Paste here, tap Pair. Session shows up in the list.
 *   4. When the dapp asks for a transaction signature, an iOS NFC popup
 *      pops up — tap the treasury card.
 */

import { useEffect, useState } from "react";
import { ScrollView, StyleSheet, Text, View } from "react-native";
import {
  Banner,
  GhostButton,
  Input,
  KV,
  PrimaryButton,
  Section,
} from "../components";
import { palette, spacing, type } from "../theme";
import { ACCOUNTS, NETWORK } from "../config";
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
  treasuryScanned: boolean;
  appendLog: (level: LogEntry["level"], msg: string) => void;
}

export function ConnectScreen({ treasuryScanned, appendLog }: Props) {
  const [uri, setUri] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [sessions, setSessions] = useState<SessionInfo[]>([]);
  const [initialized, setInitialized] = useState(false);

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

  const onPair = async () => {
    if (!uri.trim().startsWith("wc:")) {
      setError("Paste a wc:... URI from the dapp's WalletConnect QR.");
      return;
    }
    setBusy(true);
    setError(null);
    try {
      await pair(uri.trim());
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
        <KV k="Account" v={ACCOUNTS.treasury.toString()} />
        <Text style={styles.hint}>
          Only the treasury account is exposed for now. Dapp signing requests will prompt for a tap on the treasury Tangem card.
        </Text>
      </Section>

      <Section
        step={3}
        title="Pair a dapp"
        subtitle="Paste the wc:... URI from the dapp"
        state={initialized && treasuryScanned ? "active" : "locked"}
      >
        {!treasuryScanned && (
          <Banner
            variant="warning"
            title="Treasury card not scanned"
            message="Scan the treasury card in Setup first — signing requests fail without a cached card."
          />
        )}
        <Input
          label="WalletConnect URI"
          hint="Open SaucerSwap → WalletConnect → tap 'Copy to clipboard' next to the QR, then paste here."
          value={uri}
          onChangeText={setUri}
          placeholder="wc:...@2?relay-protocol=irn&symKey=..."
          autoCapitalize="none"
          mono
          multiline
        />
        <PrimaryButton
          label={busy ? "Pairing…" : "Pair"}
          onPress={onPair}
          disabled={busy || !initialized || !treasuryScanned || !uri.trim()}
          loading={busy}
        />
        {error && (
          <View style={{ marginTop: spacing.md }}>
            <Banner variant="error" title="Failed" message={error} />
          </View>
        )}
      </Section>

      <Section step={4} title="Active sessions" state={sessions.length > 0 ? "active" : "locked"}>
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
