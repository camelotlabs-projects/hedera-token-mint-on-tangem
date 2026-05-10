import { useEffect, useState } from "react";
import { ScrollView, StyleSheet, Text, TouchableOpacity, View } from "react-native";
import { ACCOUNTS, HEDERA_DERIVATION_PATH, NETWORK, TANGEM_KEYS } from "../config";
import { makeClient } from "../hedera";
import { signForRole } from "../tangem";
import {
  buildAirdrop,
  buildBurn,
  buildFreeze,
  buildKycGrant,
  buildKycRevoke,
  buildMint,
  buildPause,
  buildTransfer,
  buildUnfreeze,
  buildUnpause,
  buildUpdate,
  buildWipe,
  metadataFromString,
  toBaseUnits,
  type ManageOp,
  OP_LABELS,
  type RemovableKey,
  REMOVABLE_KEY_LABELS,
} from "../manage";
import { Banner, Checkbox, Input, KV, PrimaryButton, Radio, Section } from "../components";
import { palette, spacing, type } from "../theme";

type LogEntry = { ts: string; level: "info" | "ok" | "err"; msg: string };

interface Props {
  operatorKey: string;
  treasuryScanned: boolean;
  busy: boolean;
  setBusy: (b: boolean) => void;
  appendLog: (level: LogEntry["level"], msg: string) => void;
}

export function ManageScreen({
  operatorKey,
  treasuryScanned,
  busy,
  setBusy,
  appendLog,
}: Props) {
  const [tokenId, setTokenId] = useState("");
  const [decimals, setDecimals] = useState("7");
  const [treasuryTokens, setTreasuryTokens] = useState<
    { id: string; symbol: string; name: string; type: string }[]
  >([]);
  const [tokensFetching, setTokensFetching] = useState(false);
  const [op, setOp] = useState<ManageOp>("mint");
  const [error, setError] = useState<string | null>(null);
  const [lastTxId, setLastTxId] = useState<string | null>(null);
  const [lastStatus, setLastStatus] = useState<string | null>(null);

  // Op-specific fields
  const [tokenKind, setTokenKind] = useState<"fungible" | "nft">("fungible");
  const [amount, setAmount] = useState("");
  const [accountId, setAccountId] = useState("");
  const [metadataLines, setMetadataLines] = useState("");
  const [serialsInput, setSerialsInput] = useState("");
  const [updateName, setUpdateName] = useState("");
  const [updateSymbol, setUpdateSymbol] = useState("");
  const [updateMemo, setUpdateMemo] = useState("");
  const [removeKeys, setRemoveKeys] = useState<Record<RemovableKey, boolean>>({
    kyc: false,
    wipe: false,
    freeze: false,
    feeSchedule: false,
    pause: false,
    metadata: false,
  });
  const toggleRemove = (k: RemovableKey) =>
    setRemoveKeys((s) => ({ ...s, [k]: !s[k] }));

  // KYC batch state — selection map keyed by account id, value = include in grant.
  // Source of truth is `accountId` (the textarea); selection mirrors parsed lines.
  const [kycSelection, setKycSelection] = useState<Record<string, boolean>>({});
  const [kycFetching, setKycFetching] = useState(false);

  const parsedAccounts = (() => {
    if (op !== "kycGrant" && op !== "kycRevoke") return [] as string[];
    return Array.from(
      new Set(
        accountId
          .split(/\s+/)
          .map((s) => s.trim())
          .filter(Boolean),
      ),
    );
  })();

  // Whenever the accountId textarea changes, default-include any new lines.
  useEffect(() => {
    setKycSelection((prev) => {
      const next: Record<string, boolean> = {};
      for (const a of parsedAccounts) next[a] = prev[a] ?? true;
      return next;
    });
  }, [accountId, op]);

  const toggleKyc = (a: string) =>
    setKycSelection((s) => ({ ...s, [a]: !s[a] }));

  const fetchTreasuryTokens = async () => {
    setTokensFetching(true);
    try {
      const network = NETWORK === "mainnet" ? "mainnet-public" : "testnet";
      const base = `https://${network}.mirrornode.hedera.com`;
      const treasury = ACCOUNTS.treasury.toString();
      const r = await fetch(`${base}/api/v1/accounts/${treasury}/tokens?limit=100`);
      const j: any = await r.json();
      const ids: string[] = (j?.tokens ?? []).map((t: any) => t.token_id as string);
      const enriched = await Promise.all(
        ids.map(async (id) => {
          try {
            const rr = await fetch(`${base}/api/v1/tokens/${id}`);
            const jj: any = await rr.json();
            return {
              id,
              symbol: (jj?.symbol as string) ?? id,
              name: (jj?.name as string) ?? "",
              type: (jj?.type as string) ?? "",
            };
          } catch {
            return { id, symbol: id, name: "", type: "" };
          }
        }),
      );
      setTreasuryTokens(enriched);
    } catch (e) {
      appendLog("err", `Token list fetch failed: ${(e as Error).message}`);
    } finally {
      setTokensFetching(false);
    }
  };

  // Auto-load the token picker once, when the screen mounts.
  useEffect(() => {
    fetchTreasuryTokens();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const fetchKycCandidates = async () => {
    if (!tokenId.trim()) {
      setError("Token ID is required to fetch holders");
      return;
    }
    setKycFetching(true);
    setError(null);
    try {
      const network = NETWORK === "mainnet" ? "mainnet-public" : "testnet";
      const base = `https://${network}.mirrornode.hedera.com`;
      const r = await fetch(`${base}/api/v1/tokens/${tokenId.trim()}/balances?limit=100`);
      const j: any = await r.json();
      const accounts: string[] = (j?.balances ?? []).map((b: any) => b.account as string);
      // Filter out accounts that already have KYC granted (skip GRANTED for grant op).
      const filtered: string[] = [];
      for (const a of accounts) {
        try {
          const rr = await fetch(`${base}/api/v1/accounts/${a}/tokens?token.id=${tokenId.trim()}`);
          const jj: any = await rr.json();
          const status = jj?.tokens?.[0]?.kyc_status;
          if (op === "kycGrant" && status === "NOT_GRANTED") filtered.push(a);
          else if (op === "kycRevoke" && status === "GRANTED") filtered.push(a);
        } catch {}
      }
      if (filtered.length === 0) {
        appendLog("info", `No holders need ${op === "kycGrant" ? "KYC grant" : "KYC revoke"}.`);
        return;
      }
      setAccountId(filtered.join("\n"));
      appendLog("ok", `Fetched ${filtered.length} candidate(s) for ${OP_LABELS[op]}.`);
    } catch (e) {
      setError(`Fetch failed: ${(e as Error).message}`);
    } finally {
      setKycFetching(false);
    }
  };

  const targetReady = tokenId.trim().length > 0 && operatorKey.trim().length > 0 && treasuryScanned;

  const reset = () => {
    setError(null);
    setLastTxId(null);
    setLastStatus(null);
  };

  const run = async () => {
    setBusy(true);
    reset();
    try {
      if (!operatorKey.trim()) throw new Error("Setup not complete");
      if (!treasuryScanned) throw new Error("Scan treasury card first");
      if (!tokenId.trim()) throw new Error("Token ID is required");

      const client = makeClient(operatorKey.trim());
      const dec = parseInt(decimals || "0", 10);
      const id = tokenId.trim();
      let tx: any;

      switch (op) {
        case "mint": {
          if (tokenKind === "nft") {
            const lines = metadataLines.split("\n").map((s) => s.trim()).filter(Boolean);
            if (lines.length === 0) throw new Error("Provide at least one metadata URI/CID (one per line)");
            if (lines.length > 10) throw new Error("Max 10 NFT serials per mint transaction");
            tx = buildMint(client, {
              kind: "nft",
              tokenId: id,
              metadata: lines.map(metadataFromString),
            });
          } else {
            if (!amount.trim()) throw new Error("Amount is required");
            tx = buildMint(client, {
              kind: "fungible",
              tokenId: id,
              amountBaseUnits: toBaseUnits(amount, dec),
            });
          }
          break;
        }
        case "burn": {
          if (tokenKind === "nft") {
            const serials = serialsInput
              .split(/[\s,]+/)
              .map((s) => s.trim())
              .filter(Boolean)
              .map((s) => parseInt(s, 10));
            if (serials.length === 0 || serials.some((n) => !Number.isFinite(n) || n <= 0)) {
              throw new Error("Provide one or more valid serial numbers");
            }
            tx = buildBurn(client, { kind: "nft", tokenId: id, serials });
          } else {
            if (!amount.trim()) throw new Error("Amount is required");
            tx = buildBurn(client, {
              kind: "fungible",
              tokenId: id,
              amountBaseUnits: toBaseUnits(amount, dec),
            });
          }
          break;
        }
        case "update": {
          const removeList = (Object.keys(removeKeys) as RemovableKey[]).filter((k) => removeKeys[k]);
          if (
            !updateName.trim() &&
            !updateSymbol.trim() &&
            !updateMemo.trim() &&
            removeList.length === 0
          ) {
            throw new Error("Provide at least one field to update or a key to remove");
          }
          tx = buildUpdate(client, {
            tokenId: id,
            name: updateName,
            symbol: updateSymbol,
            memo: updateMemo,
            removeKeys: removeList,
          });
          break;
        }
        case "freeze":
        case "unfreeze": {
          if (!accountId.trim()) throw new Error("Target account ID is required");
          tx = (op === "freeze" ? buildFreeze : buildUnfreeze)(client, {
            tokenId: id,
            accountId: accountId.trim(),
          });
          break;
        }
        case "pause":
        case "unpause": {
          tx = (op === "pause" ? buildPause : buildUnpause)(client, { tokenId: id });
          break;
        }
        case "wipe": {
          if (!accountId.trim()) throw new Error("Target account ID is required");
          if (!amount.trim()) throw new Error("Amount is required");
          tx = buildWipe(client, {
            tokenId: id,
            accountId: accountId.trim(),
            amountBaseUnits: toBaseUnits(amount, dec),
          });
          break;
        }
        case "kycGrant":
        case "kycRevoke": {
          // Batch mode: process only checked accounts from the parsed list.
          const accounts = parsedAccounts.filter((a) => kycSelection[a]);
          if (accounts.length === 0) throw new Error("Tick at least one target account");

          // Pre-flight: check each account's relationship to the token. Skip
          // any that haven't associated yet (TokenAssociate is the buyer's
          // job, in their own wallet). Skip those already in the desired
          // KYC state. This avoids burning Tangem taps on guaranteed fails.
          const network = NETWORK === "mainnet" ? "mainnet-public" : "testnet";
          const base = `https://${network}.mirrornode.hedera.com`;
          appendLog("info", `Pre-flighting ${accounts.length} account(s) against mirror…`);
          const eligible: string[] = [];
          const skipped: { account: string; reason: string }[] = [];
          for (const a of accounts) {
            try {
              const rr = await fetch(`${base}/api/v1/accounts/${a}/tokens?token.id=${id}`);
              const jj: any = await rr.json();
              const rel = jj?.tokens?.[0];
              if (!rel) {
                skipped.push({ account: a, reason: "not associated with token" });
                continue;
              }
              const status = rel.kyc_status;
              if (op === "kycGrant" && status === "GRANTED") {
                skipped.push({ account: a, reason: "already GRANTED" });
                continue;
              }
              if (op === "kycRevoke" && status !== "GRANTED") {
                skipped.push({ account: a, reason: `kyc=${status}` });
                continue;
              }
              eligible.push(a);
            } catch (e) {
              skipped.push({ account: a, reason: `mirror error: ${(e as Error).message}` });
            }
          }
          for (const s of skipped) {
            appendLog("info", `skip ${s.account} — ${s.reason}`);
          }
          if (eligible.length === 0) {
            const summary = `${OP_LABELS[op]}: 0/${accounts.length} eligible (all skipped)`;
            appendLog("err", summary);
            setLastStatus(summary);
            client.close();
            return;
          }

          appendLog("info", `${OP_LABELS[op]} → ${id} for ${eligible.length} eligible account(s) (${skipped.length} skipped)`);
          const builder = op === "kycGrant" ? buildKycGrant : buildKycRevoke;
          const successes: string[] = [];
          const failures: { account: string; error: string }[] = [];

          for (let i = 0; i < eligible.length; i++) {
            const acc = eligible[i];
            try {
              const innerTx = builder(client, { tokenId: id, accountId: acc });
              appendLog("info", `[${i + 1}/${eligible.length}] ${acc} — tap treasury card`);
              await innerTx.signWith(TANGEM_KEYS.treasury, async (bytes: Uint8Array) =>
                signForRole("treasury", HEDERA_DERIVATION_PATH, bytes),
              );
              const r = await innerTx.execute(client);
              const rec = await r.getReceipt(client);
              successes.push(acc);
              appendLog("ok", `[${i + 1}/${eligible.length}] ${acc} ✓ ${rec.status.toString()}`);
              if (i < eligible.length - 1) {
                // give iOS NFC stack time to tear the previous session down
                await new Promise((res) => setTimeout(res, 1500));
              }
            } catch (e) {
              const msg = (e as Error).message;
              failures.push({ account: acc, error: msg });
              appendLog("err", `[${i + 1}/${eligible.length}] ${acc} ✗ ${msg}`);
            }
          }

          const summary = `${OP_LABELS[op]}: ${successes.length}/${eligible.length} succeeded (${skipped.length} skipped, ${failures.length} failed)`;
          appendLog(failures.length === 0 ? "ok" : "err", summary);
          setLastStatus(summary);
          setLastTxId(failures.length === 0 ? "" : `${failures.length} failed`);
          client.close();
          return; // skip the single-tx tail below
        }
        case "transfer":
        case "airdrop": {
          if (!accountId.trim()) throw new Error("Recipient account ID is required");
          const builder = op === "airdrop" ? buildAirdrop : buildTransfer;
          if (tokenKind === "nft") {
            const serials = serialsInput
              .split(/[\s,]+/)
              .map((s) => s.trim())
              .filter(Boolean)
              .map((s) => parseInt(s, 10));
            if (serials.length === 0 || serials.some((n) => !Number.isFinite(n) || n <= 0)) {
              throw new Error("Provide one or more valid serial numbers");
            }
            tx = builder(client, {
              kind: "nft",
              tokenId: id,
              recipientAccountId: accountId.trim(),
              serials,
            });
          } else {
            if (!amount.trim()) throw new Error("Amount is required");
            tx = builder(client, {
              kind: "fungible",
              tokenId: id,
              recipientAccountId: accountId.trim(),
              amountBaseUnits: toBaseUnits(amount, dec),
            });
          }
          break;
        }
      }

      appendLog("info", `${OP_LABELS[op]} → ${id}`);
      appendLog("info", "Tap TREASURY card to sign");
      await tx.signWith(TANGEM_KEYS.treasury, async (bytes: Uint8Array) =>
        signForRole("treasury", HEDERA_DERIVATION_PATH, bytes),
      );

      appendLog("info", "Submitting…");
      const resp = await tx.execute(client);
      const receipt = await resp.getReceipt(client);
      const status = receipt.status.toString();
      const txId = resp.transactionId.toString();
      appendLog("ok", `${OP_LABELS[op]}: ${status}`);
      appendLog("ok", `Tx: ${txId}`);
      setLastStatus(status);
      setLastTxId(txId);
      client.close();
    } catch (e) {
      const msg = (e as Error).message;
      setError(msg);
      appendLog("err", msg);
    } finally {
      setBusy(false);
    }
  };

  const ops: ManageOp[] = [
    "mint",
    "burn",
    "transfer",
    "airdrop",
    "update",
    "freeze",
    "unfreeze",
    "pause",
    "unpause",
    "wipe",
    "kycGrant",
    "kycRevoke",
  ];

  const isSendOp = op === "transfer" || op === "airdrop";
  const hasKindToggle = op === "mint" || op === "burn" || isSendOp;
  const ftAmount =
    (hasKindToggle && tokenKind === "fungible") || op === "wipe";
  const nftMint = op === "mint" && tokenKind === "nft";
  const nftBurnOrTransfer = (op === "burn" || isSendOp) && tokenKind === "nft";
  const needsAccount =
    op === "freeze" ||
    op === "unfreeze" ||
    op === "wipe" ||
    op === "kycGrant" ||
    op === "kycRevoke" ||
    isSendOp;
  const isUpdate = op === "update";

  const isKycOp = op === "kycGrant" || op === "kycRevoke";
  const accountFieldLabel = isSendOp
    ? "Recipient account"
    : isKycOp
      ? "Target accounts (one per line for batch)"
      : "Target account";
  const accountFieldHint =
    op === "transfer"
      ? "Must have an associated slot for this token (auto-association or manual TokenAssociate)."
      : op === "airdrop"
        ? "No association needed. If recipient has free auto-assoc slots the token lands immediately; otherwise it sits as a pending claim until the recipient accepts it."
        : isKycOp
          ? "Paste one account per line. The app loops through each one with a single tap on the treasury card per account. Failures are reported per account; remaining accounts continue."
          : undefined;

  return (
    <View>
      <Section step={2} title="Target token" subtitle="The token you want to act on" state={treasuryScanned ? "active" : "locked"}>
        {treasuryTokens.length > 0 && (
          <View style={styles.tokenPicker}>
            <Text style={styles.fieldLabel}>Tokens in treasury</Text>
            <View style={{ flexDirection: "row", flexWrap: "wrap" }}>
              {treasuryTokens.map((t) => {
                const selected = tokenId.trim() === t.id;
                return (
                  <TouchableOpacity
                    key={t.id}
                    onPress={() => {
                      setTokenId(t.id);
                      // NFTs always have decimals 0; FT keep user-set value.
                      if (t.type === "NON_FUNGIBLE_UNIQUE") setDecimals("0");
                    }}
                    style={[styles.tokenPill, selected && styles.tokenPillSelected]}
                    activeOpacity={0.7}
                  >
                    <Text style={[styles.tokenPillSymbol, selected && styles.tokenPillTextSelected]}>{t.symbol}</Text>
                    <Text style={[styles.tokenPillId, selected && styles.tokenPillTextSelected]}>{t.id}</Text>
                  </TouchableOpacity>
                );
              })}
            </View>
            <View style={{ flexDirection: "row", marginTop: spacing.sm }}>
              <PrimaryButton
                label={tokensFetching ? "Refreshing…" : "Refresh"}
                onPress={fetchTreasuryTokens}
                disabled={tokensFetching}
                loading={tokensFetching}
              />
            </View>
          </View>
        )}
        <Input
          label="Token ID"
          hint="Pick from the list above or paste manually."
          value={tokenId}
          onChangeText={setTokenId}
          placeholder="0.0.X"
          autoCapitalize="none"
          mono
        />
        {(ftAmount || isUpdate) && (
          <Input
            label="Decimals"
            hint="Used to convert amount to base units. Match the token."
            value={decimals}
            onChangeText={setDecimals}
            placeholder="8"
            keyboardType="number-pad"
          />
        )}
      </Section>

      <Section step={3} title="Operation" subtitle="Pick the action and fill the fields" state={tokenId.trim() ? "active" : "locked"}>
        <View style={styles.opGrid}>
          {ops.map((o) => (
            <Radio key={o} label={OP_LABELS[o]} selected={op === o} onPress={() => setOp(o)} />
          ))}
        </View>

        {hasKindToggle && (
          <View style={{ marginBottom: spacing.md }}>
            <Text style={styles.fieldLabel}>Token kind</Text>
            <View style={styles.row}>
              <Radio label="Fungible" selected={tokenKind === "fungible"} onPress={() => setTokenKind("fungible")} />
              <Radio label="NFT" selected={tokenKind === "nft"} onPress={() => setTokenKind("nft")} />
            </View>
          </View>
        )}

        {ftAmount && (
          <Input
            label={
              op === "mint"
                ? "Amount to mint"
                : op === "burn"
                  ? "Amount to burn"
                  : op === "transfer"
                    ? "Amount to transfer"
                    : op === "airdrop"
                      ? "Amount to airdrop"
                      : "Amount to wipe"
            }
            hint="Display units. Multiplied by 10^decimals."
            value={amount}
            onChangeText={setAmount}
            placeholder="1000"
            keyboardType="number-pad"
          />
        )}

        {nftMint && (
          <Input
            label="Metadata (one URI per line)"
            hint="Each line creates a new serial. Recommended: ipfs://<CID> pointing to HIP-412 metadata JSON. Max 100 bytes per line, max 10 serials per tx."
            value={metadataLines}
            onChangeText={setMetadataLines}
            placeholder="ipfs://bafkreih..."
            multiline
            mono
            autoCapitalize="none"
          />
        )}

        {nftBurnOrTransfer && (
          <Input
            label="Serial numbers"
            hint="Comma- or space-separated, e.g. 1,2,7"
            value={serialsInput}
            onChangeText={setSerialsInput}
            placeholder="1, 2, 7"
            keyboardType="numbers-and-punctuation"
            mono
          />
        )}

        {needsAccount && (
          <Input
            label={accountFieldLabel}
            hint={accountFieldHint}
            value={accountId}
            onChangeText={setAccountId}
            placeholder={isKycOp ? "0.0.X\n0.0.Y\n0.0.Z" : "0.0.X"}
            autoCapitalize="none"
            mono
            multiline={isKycOp}
          />
        )}

        {isKycOp && (
          <View style={styles.kycBlock}>
            <View style={{ flexDirection: "row", flexWrap: "wrap", gap: spacing.sm }}>
              <PrimaryButton
                label={kycFetching ? "Fetching…" : `Fetch ${op === "kycGrant" ? "NOT_GRANTED" : "GRANTED"} holders from mirror`}
                onPress={fetchKycCandidates}
                disabled={kycFetching || !tokenId.trim()}
                loading={kycFetching}
              />
            </View>
            {parsedAccounts.length > 0 && (
              <View style={{ marginTop: spacing.md }}>
                <Text style={styles.fieldLabel}>
                  {parsedAccounts.filter((a) => kycSelection[a]).length} / {parsedAccounts.length} selected
                </Text>
                {parsedAccounts.map((a) => (
                  <Checkbox
                    key={a}
                    label={a}
                    checked={!!kycSelection[a]}
                    onPress={() => toggleKyc(a)}
                  />
                ))}
              </View>
            )}
          </View>
        )}

        {isUpdate && (
          <>
            <Input label="New name" value={updateName} onChangeText={setUpdateName} placeholder="(unchanged if empty)" />
            <Input label="New symbol" value={updateSymbol} onChangeText={setUpdateSymbol} placeholder="(unchanged if empty)" autoCapitalize="characters" />
            <Input label="Memo" value={updateMemo} onChangeText={setUpdateMemo} placeholder="(unchanged if empty)" />

            <View style={styles.removeBlock}>
              <Banner
                variant="warning"
                title="Remove keys (permanent)"
                message="Checking a key clears it on-chain. Once removed, that role can never be re-added — the operation becomes impossible forever. Admin and supply are excluded as a guard rail."
              />
              <View style={{ height: spacing.sm }} />
              {(Object.keys(REMOVABLE_KEY_LABELS) as RemovableKey[]).map((k) => (
                <Checkbox
                  key={k}
                  label={`Remove ${REMOVABLE_KEY_LABELS[k]} key`}
                  checked={removeKeys[k]}
                  onPress={() => toggleRemove(k)}
                />
              ))}
            </View>
          </>
        )}
      </Section>

      <Section step={4} title="Execute" subtitle="Sign with treasury and submit" state={targetReady ? "active" : "locked"}>
        <PrimaryButton label={`Run ${OP_LABELS[op]}`} onPress={run} disabled={busy || !targetReady} loading={busy} />
        {error && (
          <View style={{ marginTop: spacing.md }}>
            <Banner variant="error" title="Failed" message={error} />
          </View>
        )}
        {lastStatus && lastTxId && !error && (
          <View style={{ marginTop: spacing.md }}>
            <Banner variant="success" title={lastStatus} message={`Tx: ${lastTxId}`} />
          </View>
        )}
      </Section>
    </View>
  );
}

const styles = StyleSheet.create({
  opGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    marginBottom: spacing.md,
  },
  removeBlock: {
    marginTop: spacing.lg,
  },
  kycBlock: {
    marginTop: spacing.md,
  },
  tokenPicker: {
    marginBottom: spacing.md,
  },
  tokenPill: {
    paddingVertical: 8,
    paddingHorizontal: 12,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: palette.border,
    backgroundColor: palette.bg,
    marginRight: spacing.sm,
    marginBottom: spacing.sm,
  },
  tokenPillSelected: {
    borderColor: palette.accent,
    backgroundColor: palette.accent,
  },
  tokenPillSymbol: {
    ...type.body,
    color: palette.textPrimary,
    fontFamily: "Inter_600SemiBold",
    fontSize: 13,
  },
  tokenPillId: {
    ...type.mono,
    color: palette.textSecondary,
    fontSize: 11,
    marginTop: 2,
  },
  tokenPillTextSelected: {
    color: palette.accentOn,
  },
  row: {
    flexDirection: "row",
    flexWrap: "wrap",
  },
  fieldLabel: {
    ...type.eyebrow,
    color: palette.textSecondary,
    marginBottom: spacing.sm,
  },
});
