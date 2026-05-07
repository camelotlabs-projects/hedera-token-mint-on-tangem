/**
 * Transaction builders for managing an existing Hedera token.
 *
 * Every builder returns a frozen, unsigned transaction. The caller adds the
 * Tangem signature via tx.signWith(...) and submits. The treasury Tangem key
 * is assumed to control admin/supply/freeze/wipe/pause/kyc — change the role
 * in App.tsx if your token uses split keys.
 */

import {
  AccountId,
  Hbar,
  KeyList,
  NftId,
  TokenBurnTransaction,
  TokenFreezeTransaction,
  TokenGrantKycTransaction,
  TokenId,
  TokenMintTransaction,
  TokenPauseTransaction,
  TokenRevokeKycTransaction,
  TokenUnfreezeTransaction,
  TokenUnpauseTransaction,
  TokenUpdateTransaction,
  TokenWipeTransaction,
  TransactionId,
  TransferTransaction,
  type Client,
} from "@hashgraph/sdk";
import { ACCOUNTS } from "./config";

const SINGLE_NODE = [new AccountId(3)];

const baseTx = <T extends { setTransactionId: any; setNodeAccountIds: any; setMaxTransactionFee: any }>(
  tx: T,
  hbar = 5,
): T => {
  tx.setTransactionId(TransactionId.generate(ACCOUNTS.operator));
  tx.setNodeAccountIds(SINGLE_NODE);
  tx.setMaxTransactionFee(new Hbar(hbar));
  return tx;
};

export type ManageOp =
  | "mint"
  | "burn"
  | "transfer"
  | "update"
  | "freeze"
  | "unfreeze"
  | "pause"
  | "unpause"
  | "wipe"
  | "kycGrant"
  | "kycRevoke";

export const OP_LABELS: Record<ManageOp, string> = {
  mint: "Mint additional supply",
  burn: "Burn supply",
  transfer: "Transfer from treasury",
  update: "Update token",
  freeze: "Freeze account",
  unfreeze: "Unfreeze account",
  pause: "Pause token",
  unpause: "Unpause token",
  wipe: "Wipe account",
  kycGrant: "Grant KYC",
  kycRevoke: "Revoke KYC",
};

/** Multiplies a display amount by 10^decimals to get base units. */
export function toBaseUnits(display: string, decimals: number): bigint {
  const cleaned = display.replace(/[\s,_]/g, "");
  if (!cleaned) return 0n;
  return BigInt(cleaned) * 10n ** BigInt(decimals);
}

// ─── Mint / Burn ─────────────────────────────────────────────────────

export type MintParams =
  | { kind: "fungible"; tokenId: string; amountBaseUnits: bigint }
  | { kind: "nft"; tokenId: string; metadata: Uint8Array[] };

export function buildMint(client: Client, p: MintParams): TokenMintTransaction {
  const tx = new TokenMintTransaction().setTokenId(TokenId.fromString(p.tokenId));
  if (p.kind === "fungible") {
    tx.setAmount(p.amountBaseUnits);
  } else {
    tx.setMetadata(p.metadata);
  }
  // NFT mints can hit the 1HBAR floor per serial; allow up to 20 serials per call.
  return baseTx(tx, p.kind === "nft" ? 30 : 5).freezeWith(client);
}

export type BurnParams =
  | { kind: "fungible"; tokenId: string; amountBaseUnits: bigint }
  | { kind: "nft"; tokenId: string; serials: number[] };

export function buildBurn(client: Client, p: BurnParams): TokenBurnTransaction {
  const tx = new TokenBurnTransaction().setTokenId(TokenId.fromString(p.tokenId));
  if (p.kind === "fungible") {
    tx.setAmount(p.amountBaseUnits);
  } else {
    tx.setSerials(p.serials as any);
  }
  return baseTx(tx).freezeWith(client);
}

/** Encode a metadata URI string to UTF-8 bytes (max 100 per Hedera). */
export function metadataFromString(s: string): Uint8Array {
  const bytes = new TextEncoder().encode(s);
  if (bytes.length > 100) {
    throw new Error(`Metadata too long: ${bytes.length} bytes (max 100). Use a URI/CID instead of raw JSON.`);
  }
  return bytes;
}

// ─── Update ──────────────────────────────────────────────────────────

/**
 * Roles that can be safely removed via TokenUpdate. Removing a role is
 * permanent — Hedera does not allow re-adding the key once cleared. Admin
 * and supply are deliberately excluded; removing admin freezes governance,
 * and removing supply blocks future mint/burn forever.
 */
export type RemovableKey = "kyc" | "wipe" | "freeze" | "feeSchedule" | "pause" | "metadata";

export const REMOVABLE_KEY_LABELS: Record<RemovableKey, string> = {
  kyc: "KYC",
  wipe: "Wipe",
  freeze: "Freeze",
  feeSchedule: "Fee schedule",
  pause: "Pause",
  metadata: "Metadata",
};

export interface UpdateParams {
  tokenId: string;
  name?: string;
  symbol?: string;
  memo?: string;
  autoRenewPeriodSeconds?: number;
  /** Roles to permanently remove. Each becomes an empty KeyList in the tx. */
  removeKeys?: RemovableKey[];
}
export function buildUpdate(client: Client, p: UpdateParams): TokenUpdateTransaction {
  const tx = new TokenUpdateTransaction().setTokenId(TokenId.fromString(p.tokenId));
  if (p.name?.trim()) tx.setTokenName(p.name.trim());
  if (p.symbol?.trim()) tx.setTokenSymbol(p.symbol.trim());
  if (p.memo !== undefined) tx.setTokenMemo(p.memo);
  if (p.autoRenewPeriodSeconds && p.autoRenewPeriodSeconds > 0) {
    tx.setAutoRenewPeriod(p.autoRenewPeriodSeconds);
  }

  const empty = new KeyList(); // sentinel for "remove this key permanently"
  for (const role of p.removeKeys ?? []) {
    switch (role) {
      case "kyc": tx.setKycKey(empty); break;
      case "wipe": tx.setWipeKey(empty); break;
      case "freeze": tx.setFreezeKey(empty); break;
      case "feeSchedule": tx.setFeeScheduleKey(empty); break;
      case "pause": tx.setPauseKey(empty); break;
      case "metadata": tx.setMetadataKey(empty); break;
    }
  }

  return baseTx(tx, 30).freezeWith(client);
}

// ─── Freeze / Unfreeze ───────────────────────────────────────────────

export interface FreezeParams {
  tokenId: string;
  accountId: string;
}
export function buildFreeze(client: Client, p: FreezeParams): TokenFreezeTransaction {
  return baseTx(
    new TokenFreezeTransaction()
      .setTokenId(TokenId.fromString(p.tokenId))
      .setAccountId(AccountId.fromString(p.accountId)),
  ).freezeWith(client);
}
export function buildUnfreeze(client: Client, p: FreezeParams): TokenUnfreezeTransaction {
  return baseTx(
    new TokenUnfreezeTransaction()
      .setTokenId(TokenId.fromString(p.tokenId))
      .setAccountId(AccountId.fromString(p.accountId)),
  ).freezeWith(client);
}

// ─── Pause / Unpause ─────────────────────────────────────────────────

export interface PauseParams {
  tokenId: string;
}
export function buildPause(client: Client, p: PauseParams): TokenPauseTransaction {
  return baseTx(new TokenPauseTransaction().setTokenId(TokenId.fromString(p.tokenId))).freezeWith(client);
}
export function buildUnpause(client: Client, p: PauseParams): TokenUnpauseTransaction {
  return baseTx(new TokenUnpauseTransaction().setTokenId(TokenId.fromString(p.tokenId))).freezeWith(client);
}

// ─── Wipe ────────────────────────────────────────────────────────────

export interface WipeParams {
  tokenId: string;
  accountId: string;
  amountBaseUnits: bigint;
}
export function buildWipe(client: Client, p: WipeParams): TokenWipeTransaction {
  return baseTx(
    new TokenWipeTransaction()
      .setTokenId(TokenId.fromString(p.tokenId))
      .setAccountId(AccountId.fromString(p.accountId))
      .setAmount(p.amountBaseUnits),
  ).freezeWith(client);
}

// ─── KYC ─────────────────────────────────────────────────────────────

export interface KycParams {
  tokenId: string;
  accountId: string;
}
export function buildKycGrant(client: Client, p: KycParams): TokenGrantKycTransaction {
  return baseTx(
    new TokenGrantKycTransaction()
      .setTokenId(TokenId.fromString(p.tokenId))
      .setAccountId(AccountId.fromString(p.accountId)),
  ).freezeWith(client);
}
export function buildKycRevoke(client: Client, p: KycParams): TokenRevokeKycTransaction {
  return baseTx(
    new TokenRevokeKycTransaction()
      .setTokenId(TokenId.fromString(p.tokenId))
      .setAccountId(AccountId.fromString(p.accountId)),
  ).freezeWith(client);
}

// ─── Transfer (treasury → recipient) ─────────────────────────────────

/**
 * Build a transfer from the configured treasury account to a recipient.
 * Treasury is the sender; the Tangem treasury key signs.
 *
 * For NFT: pass `serials`. Each serial moves once.
 * For FT:  pass `amountBaseUnits`. The recipient must have an open
 *          association slot (auto-association or explicit TokenAssociate).
 */
export type TransferParams =
  | {
      kind: "fungible";
      tokenId: string;
      recipientAccountId: string;
      amountBaseUnits: bigint;
    }
  | {
      kind: "nft";
      tokenId: string;
      recipientAccountId: string;
      serials: number[];
    };

export function buildTransfer(client: Client, p: TransferParams): TransferTransaction {
  const tx = new TransferTransaction();
  const tokenId = TokenId.fromString(p.tokenId);
  const sender = ACCOUNTS.treasury;
  const recipient = AccountId.fromString(p.recipientAccountId);

  if (p.kind === "fungible") {
    const amt = p.amountBaseUnits;
    tx.addTokenTransfer(tokenId, sender, -amt);
    tx.addTokenTransfer(tokenId, recipient, amt);
  } else {
    for (const serial of p.serials) {
      tx.addNftTransfer(new NftId(tokenId, serial), sender, recipient);
    }
  }

  return baseTx(tx).freezeWith(client);
}
