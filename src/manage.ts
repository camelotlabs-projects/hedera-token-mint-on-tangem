/**
 * Transaction builders for managing an existing Hedera token.
 *
 * Every builder returns a frozen, unsigned transaction. The caller adds the
 * Tangem signature via tx.signWith(...) and submits. The treasury Tangem key
 * is assumed to control admin/supply/freeze/wipe/pause/kyc — change the role
 * in App.tsx if your token uses split keys.
 */

import {
  AccountAllowanceApproveTransaction,
  AccountId,
  AccountUpdateTransaction,
  ContractExecuteTransaction,
  ContractFunctionParameters,
  ContractId,
  Hbar,
  KeyList,
  NftId,
  TokenAirdropTransaction,
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
import Long from "long";
import { ACCOUNTS, SAUCERSWAP_V1 } from "./config";

const SINGLE_NODE = [new AccountId(3)];

/** Convert bigint to unsigned Long (uint64) — required for ContractFunctionParameters.addUint256 */
const bigIntToLong = (n: bigint): Long => Long.fromString(n.toString(), true);

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
  | "airdrop"
  | "update"
  | "freeze"
  | "unfreeze"
  | "pause"
  | "unpause"
  | "wipe"
  | "kycGrant"
  | "kycRevoke"
  // SaucerSwap pool-creatie pipeline (DRIP → Emission → SaucerSwap)
  | "hbarTransfer"
  | "enableAutoAssoc"
  | "approveAllowance"
  | "addLiquidityNewPool";

export const OP_LABELS: Record<ManageOp, string> = {
  mint: "Mint additional supply",
  burn: "Burn supply",
  transfer: "Transfer from treasury",
  airdrop: "Airdrop (HIP-904)",
  update: "Update token",
  freeze: "Freeze account",
  unfreeze: "Unfreeze account",
  pause: "Pause token",
  unpause: "Unpause token",
  wipe: "Wipe account",
  kycGrant: "Grant KYC",
  kycRevoke: "Revoke KYC",
  hbarTransfer: "Transfer HBAR (DRIP → Emission)",
  enableAutoAssoc: "Enable LP auto-association (Emission)",
  approveAllowance: "Approve token allowance (Emission → Router)",
  addLiquidityNewPool: "Create SaucerSwap pool (Emission)",
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
  /** HTS metadata-field (HIP-657). Max 100 bytes. Typically SHA-256 hash of the JSON pointed to by memo. */
  metadata?: Uint8Array;
  autoRenewPeriodSeconds?: number;
  /** Roles to permanently remove. Each becomes an empty KeyList in the tx. */
  removeKeys?: RemovableKey[];
}
export function buildUpdate(client: Client, p: UpdateParams): TokenUpdateTransaction {
  const tx = new TokenUpdateTransaction().setTokenId(TokenId.fromString(p.tokenId));
  if (p.name?.trim()) tx.setTokenName(p.name.trim());
  if (p.symbol?.trim()) tx.setTokenSymbol(p.symbol.trim());
  if (p.memo !== undefined) tx.setTokenMemo(p.memo);
  if (p.metadata && p.metadata.length > 0) tx.setMetadata(p.metadata);
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

// ─── Airdrop (HIP-904) ───────────────────────────────────────────────

/**
 * HIP-904 TokenAirdrop. Same shape as a transfer, but the recipient does
 * not need to associate the token first:
 *
 *   - If the recipient has open auto-association slots, the airdrop
 *     completes immediately (token shows up in their wallet).
 *   - If not, the airdrop becomes a pending claim that the recipient can
 *     accept later via TokenClaimAirdrop. The sender (treasury) pays the
 *     pending-airdrop rent until claimed or rejected.
 *
 * This is the right primitive for distributing to buyers, since the
 * customer never has to issue an associate transaction from their own
 * wallet.
 */
export type AirdropParams = TransferParams;

export function buildAirdrop(client: Client, p: AirdropParams): TokenAirdropTransaction {
  const tx = new TokenAirdropTransaction();
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

  // Airdrop fee is higher than transfer because of pending-airdrop bookkeeping.
  return baseTx(tx, 30).freezeWith(client);
}


// ════════════════════════════════════════════════════════════════════
// SaucerSwap pool-creatie pipeline — DRIP → Emission → SaucerSwap V1
// ════════════════════════════════════════════════════════════════════
//
// Drie wallets, 4 transacties, 4 Tangem-taps verspreid over 2 cards:
//
//   1. HBAR transfer    DRIP    →  Emission       (Card D)
//   2. Auto-assoc       Emission (zelf-update)    (Card C)
//   3. Approve allowance Emission → Router         (Card C)
//   4. Add liquidity     Emission → Router (V1)    (Card C)
//
// De helper `baseTxWithPayer` overschrijft de fee-payer (i.p.v. operator)
// zodat elke transactie door zijn eigen wallet wordt afgerekend.

const baseTxWithPayer = <T extends { setTransactionId: any; setNodeAccountIds: any; setMaxTransactionFee: any }>(
  tx: T,
  payer: AccountId,
  hbar = 5,
): T => {
  tx.setTransactionId(TransactionId.generate(payer));
  tx.setNodeAccountIds(SINGLE_NODE);
  tx.setMaxTransactionFee(new Hbar(hbar));
  return tx;
};

// ─── 1. HBAR-transfer (DRIP → Emission) ─────────────────────────────

export interface HbarTransferParams {
  from: string;             // bv. ACCOUNTS.drip.toString()
  to: string;               // bv. ACCOUNTS.emission.toString()
  hbarAmount: number;       // in hele HBAR (bv. 2000 = 2000 HBAR)
}

export function buildHbarTransfer(client: Client, p: HbarTransferParams): TransferTransaction {
  const from = AccountId.fromString(p.from);
  const to = AccountId.fromString(p.to);
  const amt = new Hbar(p.hbarAmount);

  const tx = new TransferTransaction()
    .addHbarTransfer(from, amt.negated())
    .addHbarTransfer(to, amt);

  // Payer = from (de signer betaalt zijn eigen fees)
  return baseTxWithPayer(tx, from).freezeWith(client);
}

// ─── 2. AccountUpdate: max_auto_associations +1 ─────────────────────
// SaucerSwap router stuurt LP-tokens automatisch naar de pool-maker.
// Zonder open auto-association slot komt LP-token in een pending-airdrop.

export interface EnableAutoAssocParams {
  account: string;          // bv. ACCOUNTS.emission.toString()
  /** Nieuw totaal aantal slots — minstens currentMaxAutoAssoc + 1.
   *  Gebruik 1 als de wallet nooit auto-assoc had en je 1 slot wilt. */
  newMaxAutoAssoc: number;
}

export function buildEnableAutoAssoc(client: Client, p: EnableAutoAssocParams): AccountUpdateTransaction {
  const account = AccountId.fromString(p.account);
  const tx = new AccountUpdateTransaction()
    .setAccountId(account)
    .setMaxAutomaticTokenAssociations(p.newMaxAutoAssoc);
  return baseTxWithPayer(tx, account).freezeWith(client);
}

// ─── 3. Token-allowance: Emission → Router ──────────────────────────
// Router mag X NØA spend van Emission Wallet om in pool te stoppen.

export interface ApproveAllowanceParams {
  tokenId: string;          // NØA: "0.0.10472006"
  owner: string;            // ACCOUNTS.emission.toString()
  spender: string;          // SAUCERSWAP_V1.router
  amountBaseUnits: bigint;  // bv. 2_000_000n * 10n ** 7n voor 2M NØA bij decimals=7
}

export function buildApproveAllowance(
  client: Client,
  p: ApproveAllowanceParams,
): AccountAllowanceApproveTransaction {
  const tokenId = TokenId.fromString(p.tokenId);
  const owner = AccountId.fromString(p.owner);
  const spender = AccountId.fromString(p.spender);

  const tx = new AccountAllowanceApproveTransaction()
    .approveTokenAllowance(tokenId, owner, spender, p.amountBaseUnits);

  return baseTxWithPayer(tx, owner).freezeWith(client);
}

// ─── 4. SaucerSwap V1 addLiquidityETHNewPool ────────────────────────
// Creates a new HBAR/Token pair + adds initial liquidity in one call.
// First-time pool — requires extra pool-creation fee (default 50 HBAR).

export interface AddLiquidityNewPoolParams {
  tokenId: string;            // NØA: "0.0.10472006"
  poolMaker: string;          // signer + fee-payer (Emission Wallet)
  lpRecipient: string;        // wie de LP-tokens ontvangt — typisch DRIP Fund
  tokenAmountBaseUnits: bigint;
  tokenAmountMin: bigint;     // slippage protection (bv. 99% of desired)
  hbarLiquidity: number;       // HBAR voor liquidity (hele HBAR, bv. 2000)
  hbarMin: number;             // slippage protection on HBAR side
  poolCreationFee: number;     // extra HBAR voor first-time pool (default 50)
  deadlineSeconds: number;     // unix-timestamp seconden
}

export function buildAddLiquidityNewPool(
  client: Client,
  p: AddLiquidityNewPoolParams,
): ContractExecuteTransaction {
  const tokenAddr = TokenId.fromString(p.tokenId).toSolidityAddress();
  const lpRecipientAddr = AccountId.fromString(p.lpRecipient).toSolidityAddress();

  const params = new ContractFunctionParameters()
    .addAddress(tokenAddr)
    .addUint256(bigIntToLong(p.tokenAmountBaseUnits))
    .addUint256(bigIntToLong(p.tokenAmountMin))
    .addUint256(bigIntToLong(BigInt(p.hbarMin) * 100_000_000n))  // hbar → tinybars
    .addAddress(lpRecipientAddr)   // ← LP-tokens gaan hierheen (DRIP Fund)
    .addUint256(bigIntToLong(BigInt(p.deadlineSeconds)));

  const totalPayable = p.hbarLiquidity + p.poolCreationFee;

  const tx = new ContractExecuteTransaction()
    .setContractId(ContractId.fromString(SAUCERSWAP_V1.router))
    .setFunction("addLiquidityETHNewPool", params)
    .setPayableAmount(new Hbar(totalPayable))
    .setGas(3_200_000);

  return baseTxWithPayer(tx, AccountId.fromString(p.poolMaker), 50).freezeWith(client);
}
