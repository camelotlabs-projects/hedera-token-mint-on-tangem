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

export interface MintParams {
  tokenId: string;
  amountBaseUnits: bigint;
}
export function buildMint(client: Client, p: MintParams): TokenMintTransaction {
  return baseTx(
    new TokenMintTransaction()
      .setTokenId(TokenId.fromString(p.tokenId))
      .setAmount(p.amountBaseUnits),
  ).freezeWith(client);
}

export interface BurnParams {
  tokenId: string;
  amountBaseUnits: bigint;
}
export function buildBurn(client: Client, p: BurnParams): TokenBurnTransaction {
  return baseTx(
    new TokenBurnTransaction()
      .setTokenId(TokenId.fromString(p.tokenId))
      .setAmount(p.amountBaseUnits),
  ).freezeWith(client);
}

// ─── Update ──────────────────────────────────────────────────────────

export interface UpdateParams {
  tokenId: string;
  name?: string;
  symbol?: string;
  memo?: string;
  autoRenewPeriodSeconds?: number;
}
export function buildUpdate(client: Client, p: UpdateParams): TokenUpdateTransaction {
  const tx = new TokenUpdateTransaction().setTokenId(TokenId.fromString(p.tokenId));
  if (p.name?.trim()) tx.setTokenName(p.name.trim());
  if (p.symbol?.trim()) tx.setTokenSymbol(p.symbol.trim());
  if (p.memo !== undefined) tx.setTokenMemo(p.memo);
  if (p.autoRenewPeriodSeconds && p.autoRenewPeriodSeconds > 0) {
    tx.setAutoRenewPeriod(p.autoRenewPeriodSeconds);
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
