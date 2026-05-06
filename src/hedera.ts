import {
  AccountId,
  AccountUpdateTransaction,
  Client,
  CustomFee,
  CustomFixedFee,
  CustomFractionalFee,
  CustomRoyaltyFee,
  FeeAssessmentMethod,
  Hbar,
  HbarUnit,
  PrivateKey,
  TokenCreateTransaction,
  TokenId,
  TokenSupplyType,
  TokenType,
  TransactionId,
} from "@hashgraph/sdk";
import {
  ACCOUNTS,
  NETWORK,
  TANGEM_KEYS,
  feeCollectorMaxAutoAssoc,
} from "./config";

const SINGLE_NODE = [new AccountId(3)];

export function makeClient(operatorKeyInput: string): Client {
  const c = NETWORK === "mainnet" ? Client.forMainnet() : Client.forTestnet();
  const cleaned = operatorKeyInput
    .replace(/-----.*?-----/g, "")
    .replace(/\s+/g, "")
    .replace(/^0x/i, "")
    .trim();
  let key: PrivateKey;
  try {
    key = PrivateKey.fromStringECDSA(cleaned);
  } catch (_) {
    try {
      key = PrivateKey.fromStringED25519(cleaned);
    } catch (_) {
      key = PrivateKey.fromString(cleaned);
    }
  }
  c.setOperator(ACCOUNTS.operator, key);
  return c;
}

export function buildAccountUpdate(client: Client): AccountUpdateTransaction {
  return new AccountUpdateTransaction()
    .setTransactionId(TransactionId.generate(ACCOUNTS.operator))
    .setNodeAccountIds(SINGLE_NODE)
    .setAccountId(ACCOUNTS.feeCollector)
    .setMaxAutomaticTokenAssociations(feeCollectorMaxAutoAssoc)
    .setMaxTransactionFee(new Hbar(5))
    .freezeWith(client);
}

export type FeeType = "none" | "fractional" | "fixedHbar" | "fixedToken" | "royalty";

export interface FeeConfig {
  type: FeeType;
  /** fractional: percent as string, e.g. "1" for 1% */
  percent?: string;
  /** fixedHbar: amount in HBAR, e.g. "0.5" */
  hbarAmount?: string;
  /** fixedToken: amount + token id (existing HTS token) */
  tokenAmount?: string;
  tokenId?: string;
  /** royalty (NFT only): numerator/denominator + fallback fixed HBAR */
  royaltyNumerator?: string;
  royaltyDenominator?: string;
  fallbackHbar?: string;
  collectorAccountId: string;
}

export interface TokenForm {
  tokenType: "fungible" | "nft";
  name: string;
  symbol: string;
  decimals: number;
  initialSupplyDisplay: string;
  supplyType: "infinite" | "finite";
  maxSupplyDisplay?: string;
  fee?: FeeConfig;
  keys: {
    admin: boolean;
    supply: boolean;
    kyc: boolean;
    wipe: boolean;
    freeze: boolean;
    feeSchedule: boolean;
    pause: boolean;
    metadata: boolean;
  };
  autoRenewPeriodSeconds?: number;
}

function parseSupply(display: string, decimals: number): bigint {
  return BigInt(display.replace(/[._\s]/g, "") || "0") * 10n ** BigInt(decimals);
}

function buildCustomFee(form: TokenForm): CustomFee | null {
  const f = form.fee;
  if (!f || f.type === "none" || !f.collectorAccountId) return null;
  const collector = AccountId.fromString(f.collectorAccountId);

  switch (f.type) {
    case "fractional": {
      if (!f.percent || parseFloat(f.percent) <= 0) return null;
      const num = Math.round(parseFloat(f.percent) * 100);
      return new CustomFractionalFee()
        .setNumerator(num)
        .setDenominator(10000)
        .setMin(0)
        .setMax(0)
        .setAssessmentMethod(FeeAssessmentMethod.Exclusive)
        .setFeeCollectorAccountId(collector)
        .setAllCollectorsAreExempt(true);
    }
    case "fixedHbar": {
      if (!f.hbarAmount || parseFloat(f.hbarAmount) <= 0) return null;
      return new CustomFixedFee()
        .setHbarAmount(Hbar.from(parseFloat(f.hbarAmount), HbarUnit.Hbar))
        .setFeeCollectorAccountId(collector)
        .setAllCollectorsAreExempt(true);
    }
    case "fixedToken": {
      if (!f.tokenAmount || !f.tokenId) return null;
      return new CustomFixedFee()
        .setAmount(BigInt(f.tokenAmount.replace(/[._\s]/g, "") || "0"))
        .setDenominatingTokenId(TokenId.fromString(f.tokenId))
        .setFeeCollectorAccountId(collector)
        .setAllCollectorsAreExempt(true);
    }
    case "royalty": {
      const num = parseInt(f.royaltyNumerator ?? "0", 10);
      const den = parseInt(f.royaltyDenominator ?? "100", 10);
      if (num <= 0 || den <= 0) return null;
      const royalty = new CustomRoyaltyFee()
        .setNumerator(num)
        .setDenominator(den)
        .setFeeCollectorAccountId(collector)
        .setAllCollectorsAreExempt(true);
      if (f.fallbackHbar && parseFloat(f.fallbackHbar) > 0) {
        royalty.setFallbackFee(
          new CustomFixedFee().setHbarAmount(
            Hbar.from(parseFloat(f.fallbackHbar), HbarUnit.Hbar),
          ),
        );
      }
      return royalty;
    }
  }
}

export function buildTokenCreate(client: Client, form: TokenForm): TokenCreateTransaction {
  const isNft = form.tokenType === "nft";
  const decimals = isNft ? 0 : form.decimals;

  const tx = new TokenCreateTransaction()
    .setTransactionId(TransactionId.generate(ACCOUNTS.operator))
    .setNodeAccountIds(SINGLE_NODE)
    .setTokenName(form.name)
    .setTokenSymbol(form.symbol)
    .setDecimals(decimals)
    .setTokenType(isNft ? TokenType.NonFungibleUnique : TokenType.FungibleCommon)
    .setTreasuryAccountId(ACCOUNTS.treasury)
    .setAutoRenewAccountId(ACCOUNTS.operator)
    .setAutoRenewPeriod(form.autoRenewPeriodSeconds ?? 7_776_000)
    .setMaxTransactionFee(new Hbar(40));

  if (isNft) {
    tx.setInitialSupply(0);
  } else {
    tx.setInitialSupply(parseSupply(form.initialSupplyDisplay, decimals));
  }

  if (form.supplyType === "infinite" && !isNft) {
    tx.setSupplyType(TokenSupplyType.Infinite);
  } else {
    tx.setSupplyType(TokenSupplyType.Finite);
    if (form.maxSupplyDisplay) {
      tx.setMaxSupply(parseSupply(form.maxSupplyDisplay, decimals));
    }
  }

  const k = TANGEM_KEYS.treasury;
  if (form.keys.admin) tx.setAdminKey(k);
  if (form.keys.supply) tx.setSupplyKey(k);
  if (form.keys.kyc) tx.setKycKey(k);
  if (form.keys.wipe) tx.setWipeKey(k);
  if (form.keys.freeze) tx.setFreezeKey(k);
  if (form.keys.feeSchedule) tx.setFeeScheduleKey(k);
  if (form.keys.pause) tx.setPauseKey(k);
  if (form.keys.metadata) tx.setMetadataKey(k);

  const customFee = buildCustomFee(form);
  if (customFee) tx.setCustomFees([customFee]);

  return tx.freezeWith(client);
}
