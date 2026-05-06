import { AccountId, PublicKey } from "@hashgraph/sdk";

/**
 * USER CONFIGURATION
 *
 * Edit the values below before first run. Public-key placeholders are
 * obviously invalid and the app will refuse to mint until they are
 * replaced with values that match your own Tangem-derived wallets.
 *
 * The OPERATOR private key is never stored in source — you enter it in
 * the UI at runtime, and it lives in memory only until the app closes.
 */

export type NetworkName = "mainnet" | "testnet";

export const NETWORK: NetworkName = "mainnet";

/** Operator account: pays HBAR network fees. ECDSA hot key entered in UI. */
const OPERATOR_ACCOUNT_ID = "0.0.0";

/** Treasury account: receives initial supply, holds the token's keys. Tangem-controlled. */
const TREASURY_ACCOUNT_ID = "0.0.0";

/** Optional fee collector. Leave empty to use treasury. Required only when minting tokens with custom fees that route to a separate account. */
const FEE_COLLECTOR_ACCOUNT_ID = "";

/** Hedera SLIP-0010 derivation path. Standard for Hedera (coin type 3030). */
export const HEDERA_DERIVATION_PATH = "m/44'/3030'/0'/0'/0'";

const PLACEHOLDER_PUBKEY =
  "0000000000000000000000000000000000000000000000000000000000000000";

/**
 * Tangem-derived public keys (Ed25519 hex). Look these up via `fetchAccountKey()`
 * or HashScan after creating your Tangem wallets, and paste them here. The
 * treasury key signs token creation; the fee-collector key signs the
 * AccountUpdate that opens an auto-association slot before mint.
 */
export const TANGEM_KEYS = {
  treasury: PublicKey.fromString(PLACEHOLDER_PUBKEY),
  feeCollector: PublicKey.fromString(PLACEHOLDER_PUBKEY),
};

export const ACCOUNTS = {
  operator: AccountId.fromString(OPERATOR_ACCOUNT_ID),
  treasury: AccountId.fromString(TREASURY_ACCOUNT_ID),
  feeCollector: AccountId.fromString(
    FEE_COLLECTOR_ACCOUNT_ID || TREASURY_ACCOUNT_ID,
  ),
};

export const HAS_SEPARATE_FEE_COLLECTOR = Boolean(FEE_COLLECTOR_ACCOUNT_ID);

/** Max auto-associations to set on the fee collector before first mint. */
export const feeCollectorMaxAutoAssoc = 1;

export const explorerTokenUrl = (id: string) =>
  `https://hashscan.io/${NETWORK}/token/${id}`;

export const explorerAccountUrl = (id: string) =>
  `https://hashscan.io/${NETWORK}/account/${id}`;

const MIRROR_BASE: Record<NetworkName, string> = {
  mainnet: "https://mainnet-public.mirrornode.hedera.com",
  testnet: "https://testnet.mirrornode.hedera.com",
};

/** Fetch the on-chain account-key for a given account ID. */
export async function fetchAccountKey(accountId: string): Promise<PublicKey> {
  const r = await fetch(`${MIRROR_BASE[NETWORK]}/api/v1/accounts/${accountId}`);
  if (!r.ok) throw new Error(`Mirror node ${r.status}`);
  const j: any = await r.json();
  if (!j.key?.key) throw new Error(`No account-key for ${accountId}`);
  return PublicKey.fromString(j.key.key);
}

export function isConfigured(): boolean {
  return (
    OPERATOR_ACCOUNT_ID !== "0.0.0" &&
    TREASURY_ACCOUNT_ID !== "0.0.0" &&
    TANGEM_KEYS.treasury.toString().toLowerCase() !== PLACEHOLDER_PUBKEY
  );
}
