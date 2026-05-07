import { useState } from "react";
import { ScrollView, StyleSheet, Text, View } from "react-native";
import { HEDERA_DERIVATION_PATH, TANGEM_KEYS } from "../config";
import { makeClient } from "../hedera";
import { signForRole } from "../tangem";
import {
  buildBurn,
  buildFreeze,
  buildKycGrant,
  buildKycRevoke,
  buildMint,
  buildPause,
  buildUnfreeze,
  buildUnpause,
  buildUpdate,
  buildWipe,
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
  const [decimals, setDecimals] = useState("8");
  const [op, setOp] = useState<ManageOp>("mint");
  const [error, setError] = useState<string | null>(null);
  const [lastTxId, setLastTxId] = useState<string | null>(null);
  const [lastStatus, setLastStatus] = useState<string | null>(null);

  // Op-specific fields
  const [amount, setAmount] = useState("");
  const [accountId, setAccountId] = useState("");
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
          if (!amount.trim()) throw new Error("Amount is required");
          tx = buildMint(client, { tokenId: id, amountBaseUnits: toBaseUnits(amount, dec) });
          break;
        }
        case "burn": {
          if (!amount.trim()) throw new Error("Amount is required");
          tx = buildBurn(client, { tokenId: id, amountBaseUnits: toBaseUnits(amount, dec) });
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
          if (!accountId.trim()) throw new Error("Target account ID is required");
          tx = (op === "kycGrant" ? buildKycGrant : buildKycRevoke)(client, {
            tokenId: id,
            accountId: accountId.trim(),
          });
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
    "update",
    "freeze",
    "unfreeze",
    "pause",
    "unpause",
    "wipe",
    "kycGrant",
    "kycRevoke",
  ];

  const needsAmount = op === "mint" || op === "burn" || op === "wipe";
  const needsAccount =
    op === "freeze" ||
    op === "unfreeze" ||
    op === "wipe" ||
    op === "kycGrant" ||
    op === "kycRevoke";
  const isUpdate = op === "update";

  return (
    <View>
      <Section step={2} title="Target token" subtitle="The token you want to act on" state={treasuryScanned ? "active" : "locked"}>
        <Input
          label="Token ID"
          hint="e.g. 0.0.1234567"
          value={tokenId}
          onChangeText={setTokenId}
          placeholder="0.0.X"
          autoCapitalize="none"
          mono
        />
        {(needsAmount || isUpdate) && (
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

        {needsAmount && (
          <Input
            label={op === "mint" ? "Amount to mint" : op === "burn" ? "Amount to burn" : "Amount to wipe"}
            hint="Display units. Multiplied by 10^decimals."
            value={amount}
            onChangeText={setAmount}
            placeholder="1000"
            keyboardType="number-pad"
          />
        )}

        {needsAccount && (
          <Input
            label="Target account"
            value={accountId}
            onChangeText={setAccountId}
            placeholder="0.0.X"
            autoCapitalize="none"
            mono
          />
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
});
