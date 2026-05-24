/**
 * DiscoverScreen — derivation-path discovery voor Tangem multi-wallet cards.
 *
 * Flow:
 *  1. User tapt NLP-card of NT-card
 *  2. SDK retourneert alle pre-derived pubkeys (volgens defaultDerivationPaths op de card)
 *  3. Voor elke pubkey: query Hedera Mirror Node /accounts?account.publickey=
 *  4. Toon mapping: derivation-index → pubkey → account-ID (uit Mirror Node)
 *
 * Resultaat: Steve weet precies welke index in de Tangem-card-derivatie bij welke
 * wallet hoort, klaar om in config.ts te documenteren.
 */

import { useState } from "react";
import {
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import { scanCardForDiscovery, type DiscoveryWallet } from "../tangem";
import { palette, spacing, type } from "../theme";

const MIRROR_BASE = "https://mainnet-public.mirrornode.hedera.com";

interface DiscoveryRow {
  index: number;
  path?: string;             // wanneer SDK het pad meegeeft (Map-shape)
  publicKey: string;
  accountId: string | null;
  accountKnown: boolean;     // true als account ook in Mirror Node bestaat
  rootBalance?: number;       // HBAR balance (informatief)
}

interface KnownWallet {
  accountId: string;
  label: string;
}

// Bekende wallets — match resultaten hiermee voor mooie labels.
const KNOWN_WALLETS: KnownWallet[] = [
  { accountId: "0.0.10462288", label: "Treasury (NT)" },
  { accountId: "0.0.10461274", label: "Fee Collector (NLP)" },
  { accountId: "0.0.10462358", label: "DRIP Wallet (NLP)" },
  { accountId: "0.0.10462359", label: "Emission Wallet (NLP)" },
  { accountId: "0.0.10462363", label: "LR Pool (NLP)" },
  { accountId: "0.0.10462368", label: "DEV Wallet (NLP)" },
  { accountId: "0.0.10462382", label: "Camelot Community (NLP)" },
  { accountId: "0.0.10462832", label: "Project Development (NLP)" },
  { accountId: "0.0.10462833", label: "Project Team (NLP)" },
  { accountId: "0.0.10462904", label: "Founders (NLP)" },
];

const knownByAccount = new Map(
  KNOWN_WALLETS.map((w) => [w.accountId, w.label]),
);

export function DiscoverScreen() {
  const [scanning, setScanning] = useState(false);
  const [cardId, setCardId] = useState<string>("");
  const [rootPubkey, setRootPubkey] = useState<string>("");
  const [rows, setRows] = useState<DiscoveryRow[]>([]);
  const [error, setError] = useState<string>("");

  async function discover() {
    setScanning(true);
    setError("");
    setRows([]);
    try {
      const wallets = await scanCardForDiscovery();
      const slip = wallets.find((w) =>
        w.curve.toLowerCase().includes("slip"),
      );
      if (!slip) {
        throw new Error(
          "Geen SLIP-0010 wallet op deze card. Multi-wallet HD-feature vereist.",
        );
      }
      setCardId(slip.cardId);
      setRootPubkey(slip.rootPublicKey);

      if (slip.derivedKeys.length === 0) {
        throw new Error(
          "Card heeft géén pre-derived keys (defaultDerivationPaths niet geconfigureerd). " +
            "Configureer de card eerst via Tangem-app of gebruik per-path sign-discovery.",
        );
      }

      // Voor elke derived pubkey → query Mirror Node
      const out: DiscoveryRow[] = [];
      for (const dk of slip.derivedKeys) {
        const accountId = await findAccountForPubkey(dk.publicKey);
        const balance = accountId ? await getHbarBalance(accountId) : undefined;
        out.push({
          index: dk.index,
          path: dk.path,
          publicKey: dk.publicKey,
          accountId,
          accountKnown: !!accountId,
          rootBalance: balance,
        });
      }
      setRows(out);
    } catch (e: any) {
      setError(e?.message ?? String(e));
    } finally {
      setScanning(false);
    }
  }

  async function findAccountForPubkey(
    publicKey: string,
  ): Promise<string | null> {
    // Probeer met zowel raw als DER-encoded format — Tangem kan beide retourneren
    const candidates: string[] = [];
    const clean = publicKey.toLowerCase().replace(/^0x/, "");
    candidates.push(clean);
    // ED25519 DER-prefix: 302a300506032b6570032100 (12 bytes / 24 hex chars)
    const DER_PREFIX = "302a300506032b6570032100";
    if (clean.startsWith(DER_PREFIX)) {
      candidates.push(clean.substring(DER_PREFIX.length));
    } else if (clean.length === 64) {
      // raw 32-byte → probeer ook DER-wrapped
      candidates.push(DER_PREFIX + clean);
    }

    for (const candidate of candidates) {
      try {
        const url = `${MIRROR_BASE}/api/v1/accounts?account.publickey=${candidate}`;
        const r = await fetch(url);
        if (!r.ok) continue;
        const j: any = await r.json();
        if (j.accounts?.[0]?.account) return j.accounts[0].account;
      } catch {
        continue;
      }
    }
    return null;
  }

  async function getHbarBalance(accountId: string): Promise<number | undefined> {
    try {
      const r = await fetch(`${MIRROR_BASE}/api/v1/accounts/${accountId}`);
      if (!r.ok) return undefined;
      const j: any = await r.json();
      const tinybars = j.balance?.balance ?? 0;
      return Number(tinybars) / 1e8;
    } catch {
      return undefined;
    }
  }

  function copyMappingAsConfig() {
    const lines: string[] = [];
    lines.push("// === Derivation-path mapping (genereerd door DiscoverScreen) ===");
    lines.push(`// Card ID: ${cardId}`);
    lines.push(`// Root pubkey: ${rootPubkey.substring(0, 24)}...`);
    lines.push("");
    lines.push("export const TANGEM_PATHS = {");
    for (const r of rows) {
      if (!r.accountId) continue;
      const label = knownByAccount.get(r.accountId) ?? `unknown_${r.accountId}`;
      const slug = label.toLowerCase().replace(/[^a-z0-9]+/g, "_");
      // Prefer the SDK-reported path; fall back to constructing from index
      const path = r.path ?? `m/44'/3030'/0'/0'/${r.index}`;
      lines.push(
        `  ${slug}: { path: "${path}", account: "${r.accountId}" }, // ${label}`,
      );
    }
    lines.push("};");
    return lines.join("\n");
  }

  return (
    <ScrollView style={styles.root} contentContainerStyle={styles.content}>
      <Text style={styles.title}>Discover Tangem derivation paths</Text>
      <Text style={styles.subtitle}>
        Tap een Tangem-card (NLP of NT) om de derivation-path → account-ID mapping te ontdekken
        via Hedera Mirror Node.
      </Text>

      <TouchableOpacity
        style={[styles.button, scanning && styles.buttonDisabled]}
        onPress={discover}
        disabled={scanning}
      >
        <Text style={styles.buttonText}>
          {scanning ? "Scannen…" : "📡 Scan card + discover"}
        </Text>
      </TouchableOpacity>

      {error ? (
        <View style={styles.errorBox}>
          <Text style={styles.errorText}>❌ {error}</Text>
        </View>
      ) : null}

      {cardId ? (
        <View style={styles.cardInfo}>
          <Text style={styles.kv}>Card ID: {cardId}</Text>
          <Text style={styles.kv}>Root pubkey: {rootPubkey.substring(0, 32)}…</Text>
          <Text style={styles.kv}>Derived keys: {rows.length}</Text>
        </View>
      ) : null}

      {rows.length > 0 && (
        <>
          <Text style={styles.sectionTitle}>Mapping</Text>
          <View style={styles.table}>
            <View style={styles.tableHeader}>
              <Text style={[styles.cell, styles.cellHeader, styles.colIdx]}>Idx</Text>
              <Text style={[styles.cell, styles.cellHeader, styles.colPub]}>Pubkey</Text>
              <Text style={[styles.cell, styles.cellHeader, styles.colAcc]}>Account</Text>
              <Text style={[styles.cell, styles.cellHeader, styles.colBal]}>HBAR</Text>
            </View>
            {rows.map((r) => {
              const label = r.accountId
                ? knownByAccount.get(r.accountId) ?? "(unknown)"
                : "—";
              return (
                <View key={`${r.index}-${r.path ?? ""}`} style={styles.tableRow}>
                  <Text style={[styles.cell, styles.colIdx]}>{r.index}</Text>
                  <Text style={[styles.cell, styles.colPub]} numberOfLines={1}>
                    {r.publicKey.substring(0, 16)}…
                  </Text>
                  <View style={[styles.colAcc, styles.cellWrap]}>
                    <Text style={styles.cell} numberOfLines={1}>
                      {r.accountId ?? "—"}
                    </Text>
                    {label !== "—" && (
                      <Text style={styles.cellSub}>{label}</Text>
                    )}
                    {r.path && (
                      <Text style={styles.cellSub}>path: {r.path}</Text>
                    )}
                  </View>
                  <Text style={[styles.cell, styles.colBal]}>
                    {r.rootBalance != null ? r.rootBalance.toFixed(2) : "—"}
                  </Text>
                </View>
              );
            })}
          </View>

          <Text style={styles.sectionTitle}>Generated config snippet</Text>
          <View style={styles.codeBox}>
            <Text style={styles.codeText}>{copyMappingAsConfig()}</Text>
          </View>
          <Text style={styles.hint}>
            ⬆ Kopieer dit naar `src/config.ts` om de paths in de Tangem-app vast te leggen.
          </Text>
        </>
      )}

      {rows.length === 0 && !scanning && !error && (
        <View style={styles.hintBox}>
          <Text style={styles.hint}>
            Tap "Scan card" en houd je Tangem-card tegen de iPhone tot je het bericht
            ziet. Eerst tap met de NLP-card; daarna kun je opnieuw tappen met de NT-card
            voor een tweede mapping.
          </Text>
        </View>
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: palette.bg },
  content: { padding: spacing.lg, paddingBottom: spacing.xl * 2 },
  title: { ...type.h2, color: palette.textPrimary, marginBottom: spacing.xs },
  subtitle: {
    ...type.body,
    color: palette.textSecondary,
    marginBottom: spacing.lg,
  },
  button: {
    backgroundColor: palette.accent,
    borderRadius: 8,
    paddingVertical: spacing.md,
    alignItems: "center",
    marginBottom: spacing.lg,
  },
  buttonDisabled: { opacity: 0.5 },
  buttonText: { color: palette.bg, fontSize: 16, fontFamily: "Inter_600SemiBold" },
  errorBox: {
    backgroundColor: "rgba(212, 95, 55, 0.12)",
    borderColor: "rgba(212, 95, 55, 0.7)",
    borderLeftWidth: 3,
    padding: spacing.md,
    marginBottom: spacing.md,
    borderRadius: 4,
  },
  errorText: { color: palette.textPrimary, ...type.body },
  cardInfo: {
    backgroundColor: "rgba(255,255,255,0.04)",
    padding: spacing.md,
    borderRadius: 6,
    marginBottom: spacing.md,
  },
  kv: { color: palette.textSecondary, ...type.mono, marginBottom: 2 },
  sectionTitle: {
    ...type.h1,
    color: palette.textPrimary,
    marginTop: spacing.lg,
    marginBottom: spacing.xs,
  },
  table: {
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.1)",
    borderRadius: 6,
    overflow: "hidden",
  },
  tableHeader: {
    flexDirection: "row",
    backgroundColor: "rgba(255,255,255,0.06)",
    paddingVertical: spacing.xs,
    paddingHorizontal: spacing.sm,
  },
  tableRow: {
    flexDirection: "row",
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.sm,
    borderTopWidth: 1,
    borderColor: "rgba(255,255,255,0.06)",
    alignItems: "center",
  },
  cell: { color: palette.textPrimary, ...type.mono, fontSize: 12 },
  cellHeader: { fontWeight: "600", color: palette.textSecondary },
  cellWrap: { flex: 0 },
  cellSub: { ...type.mono, fontSize: 10, color: palette.textSecondary },
  colIdx: { width: 30 },
  colPub: { width: 110 },
  colAcc: { flex: 1, paddingHorizontal: spacing.xs },
  colBal: { width: 60, textAlign: "right" },
  codeBox: {
    backgroundColor: "#0d1117",
    padding: spacing.md,
    borderRadius: 6,
    marginBottom: spacing.xs,
  },
  codeText: { color: "#c9d1d9", ...type.mono, fontSize: 10 },
  hint: { color: palette.textSecondary, ...type.body, fontSize: 12 },
  hintBox: {
    marginTop: spacing.md,
    padding: spacing.md,
    backgroundColor: "rgba(255,255,255,0.04)",
    borderRadius: 6,
  },
});
