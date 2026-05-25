/**
 * WalletConnect wallet-provider integration for Tangem-signed Hedera txs.
 *
 * Our iOS app acts as the wallet on the WalletConnect v2 protocol. A dapp
 * (e.g. SaucerSwap.finance) presents a pairing URI; we connect via that URI,
 * approve a session exposing our treasury account, and respond to signing
 * requests by routing them through the Tangem card.
 *
 * Two important design choices for this MVP:
 *
 *   1. We bypass the Hedera library's high-level HederaWeb3Wallet because
 *      its signing path assumes a hot HederaWallet with a private key
 *      string. Instead we extend Web3Wallet directly and route signing
 *      through our existing Tangem signWith pipeline.
 *
 *   2. Only the treasury account is exposed as the connected wallet for
 *      now (the most common Tangem-controlled flow). A future revision
 *      will offer a per-session account picker over all configured roles.
 */

import { AccountId, Client, SignerSignature, Transaction } from "@hashgraph/sdk";
import { Web3Wallet, type IWeb3Wallet } from "@walletconnect/web3wallet";
import { Core } from "@walletconnect/core";
import {
  HederaChainId,
  HederaJsonRpcMethod,
  HederaSessionEvent,
  base64StringToTransaction,
  signatureMapToBase64String,
  signerSignaturesToSignatureMap,
} from "@hashgraph/hedera-wallet-connect";

import RNTangemSdk from "tangem-sdk-react-native";
import { ACCOUNTS, HEDERA_DERIVATION_PATH, NETWORK, TANGEM_KEYS } from "./config";
import { getRoleWallet, signForRole } from "./tangem";

// Public Reown / WalletConnect project ID. Free tier from cloud.walletconnect.com.
// Replace with your own at deploy time; this default is a demo registration
// that works but is throttled. Set EXPO_PUBLIC_WALLETCONNECT_PROJECT_ID
// to override at build time.
const PROJECT_ID =
  // @ts-ignore — Expo env handling
  (typeof process !== "undefined" && process.env?.EXPO_PUBLIC_WALLETCONNECT_PROJECT_ID) ||
  "99f94d816f2e5c855b8f4c6ba80554c8";

const METADATA = {
  name: "Hedera Token Mint",
  description: "Tangem-signed Hedera token operations",
  url: "https://github.com/camelotlabs-projects/hedera-token-mint-on-tangem",
  icons: ["https://hashscan.io/favicon.ico"],
};

const HEDERA_CHAIN =
  NETWORK === "mainnet" ? HederaChainId.Mainnet : HederaChainId.Testnet;

/**
 * Account exposed as the connected wallet over WalletConnect.
 *
 * The emission wallet holds the 10M NØA reserved for SaucerSwap LP +
 * public DEX distribution, so it's the one that has to sign liquidity-
 * add and swap transactions. Treasury (0.0.10462288) is a different
 * Tangem card and a different role.
 */
const CONNECTED_ACCOUNT = ACCOUNTS.emission.toString();
const CONNECTED_KEY = TANGEM_KEYS.emission;
/** Role string used by the tangem-sdk wrapper to address the right card. */
const CONNECTED_ROLE = "emission";

export type SessionInfo = {
  topic: string;
  peerName: string;
  peerUrl?: string;
  peerIconUrl?: string;
  expiry: number;
};

type Listener = () => void;
let wallet: IWeb3Wallet | null = null;
const listeners = new Set<Listener>();

export const wcEmit = () => listeners.forEach((l) => l());
export const wcOn = (l: Listener) => {
  listeners.add(l);
  return () => listeners.delete(l);
};

/** Idempotent initialization. Returns the singleton Web3Wallet. */
export async function initWalletConnect(): Promise<IWeb3Wallet> {
  if (wallet) return wallet;
  const core = new Core({ projectId: PROJECT_ID });
  wallet = await Web3Wallet.init({
    core,
    metadata: METADATA,
  });

  wallet.on("session_proposal", onSessionProposal);
  wallet.on("session_request", onSessionRequest);
  wallet.on("session_delete", wcEmit);

  return wallet;
}

/** List of currently active sessions. */
export function listSessions(): SessionInfo[] {
  if (!wallet) return [];
  return Object.values(wallet.getActiveSessions() ?? {}).map((s: any) => ({
    topic: s.topic,
    peerName: s.peer?.metadata?.name ?? "unknown dapp",
    peerUrl: s.peer?.metadata?.url,
    peerIconUrl: s.peer?.metadata?.icons?.[0],
    expiry: s.expiry,
  }));
}

/** Disconnect a specific session. */
export async function disconnectSession(topic: string): Promise<void> {
  if (!wallet) return;
  await wallet.disconnectSession({
    topic,
    reason: { code: 6000, message: "User disconnected" },
  });
  wcEmit();
}

/** Pair with a dapp by its WalletConnect URI (`wc:...`). */
export async function pair(uri: string): Promise<void> {
  const w = await initWalletConnect();
  await w.pair({ uri });
}

/** Auto-approve incoming session proposals against the treasury account. */
async function onSessionProposal(event: any): Promise<void> {
  if (!wallet) return;
  const { id, params } = event;
  const accounts = [`${HEDERA_CHAIN}:${CONNECTED_ACCOUNT}`];

  try {
    await wallet.approveSession({
      id,
      namespaces: {
        hedera: {
          chains: [HEDERA_CHAIN],
          accounts,
          methods: [
            HederaJsonRpcMethod.GetNodeAddresses,
            HederaJsonRpcMethod.ExecuteTransaction,
            HederaJsonRpcMethod.SignMessage,
            HederaJsonRpcMethod.SignAndExecuteQuery,
            HederaJsonRpcMethod.SignAndExecuteTransaction,
            HederaJsonRpcMethod.SignTransaction,
          ],
          events: [
            HederaSessionEvent.ChainChanged,
            HederaSessionEvent.AccountsChanged,
          ],
        },
      },
    });
    wcEmit();
  } catch (e) {
    await wallet.rejectSession({
      id,
      reason: { code: 5000, message: (e as Error).message },
    });
  }
}

/**
 * Build a Hedera Client that submits as the treasury account.
 *
 * Hedera SDK insists on a private key for client.setOperator(), but the
 * treasury key lives on Tangem. We pass a throwaway dummy key — execution
 * uses the signature already attached to the tx by tx.signWith(...) above,
 * not the operator key. If a method ever genuinely needs the operator to
 * sign (e.g. running a query), it'll fail loudly and we can revisit.
 */
function makeClientForConnected(): Client {
  // No setOperator. The transaction body the dapp sends already specifies
  // payer = emission and is signed by Tangem; auto-signing again with a
  // dummy ED25519 key here only adds an unwanted second signature on the
  // SignatureMap. Worse, with some SDK versions the second attempt
  // triggers another Tangem NFC interaction the user never expects and
  // returns "user cancelled" if dismissed.
  return NETWORK === "mainnet" ? Client.forMainnet() : Client.forTestnet();
}

async function tangemSignTx(tx: Transaction): Promise<Transaction> {
  // Hedera dapps freeze a tx with the full failover node list (often
  // ~30 variants), each with its own bodyBytes (the nodeAccountID
  // field differs). Signing all of those on a Tangem card needs 3+
  // NFC taps because the SDK caps a single sign call at 10 hashes;
  // multi-tap on iOS NFC is unreliable in practice (second popup
  // intermittently times out as "user cancelled").
  //
  // The single-tap fix: keep only variant [0], sign it once, attach
  // the signature to that one entry, and reduce the SDK's parallel
  // bookkeeping arrays so execute() submits to that variant's node.
  // The dapp loses node failover, but execute() succeeds on node[0]
  // for a fresh submit — that's the path it would try first anyway.
  const inner: any = (tx as any)._signedTransactions;
  const list: any[] = inner?.list ?? inner?._list ?? (Array.isArray(inner) ? inner : []);
  if (!Array.isArray(list) || list.length === 0) {
    throw new Error("tx._signedTransactions is empty — can't extract body");
  }

  const nodeIdsRaw: any = (tx as any)._nodeAccountIds;
  const nodeIds: any[] = nodeIdsRaw?.list ?? nodeIdsRaw?._list ?? nodeIdsRaw ?? [];
  if (nodeIds.length !== list.length) {
    throw new Error(`node id list (${nodeIds.length}) and signed-tx list (${list.length}) out of sync`);
  }

  // Find a variant whose node is on our trust list. Hedera mainnet's
  // founding nodes (0.0.3 .. 0.0.10) have far better uptime than the
  // later-added council nodes; the dapp picks 30 random nodes for the
  // failover list and sometimes the first slot is one of the flakier
  // ones (we hit "All nodes are unhealthy" on 0.0.32). Walk the
  // variants and keep the first founding node we see.
  const TRUSTED = new Set(["0.0.3", "0.0.4", "0.0.5", "0.0.6", "0.0.7", "0.0.8", "0.0.9", "0.0.10"]);
  let chosenIdx = 0;
  for (let i = 0; i < nodeIds.length; i++) {
    const id = nodeIds[i]?.toString?.() ?? String(nodeIds[i]);
    if (TRUSTED.has(id)) {
      chosenIdx = i;
      break;
    }
  }
  const chosenNode = nodeIds[chosenIdx]?.toString?.() ?? String(nodeIds[chosenIdx]);
  console.log(`[WC] reducing ${list.length} variants to 1 — picking idx ${chosenIdx} (node ${chosenNode})`);

  // 1. Keep only the chosen variant across every parallel bookkeeping
  //    array the SDK indexes by node — keeps the lock-step intact.
  const keepOnly = (arr: any, idx: number) => {
    if (!arr) return;
    const target = arr.list ?? arr._list ?? arr;
    if (!Array.isArray(target) || target.length <= 1) return;
    const survivor = target[idx];
    target.length = 0;
    target.push(survivor);
  };
  keepOnly((tx as any)._signedTransactions, chosenIdx);
  keepOnly((tx as any)._transactions, chosenIdx);
  keepOnly((tx as any)._transactionIds, chosenIdx);
  keepOnly((tx as any)._nodeAccountIds, chosenIdx);
  keepOnly((tx as any)._signerPublicKeys, chosenIdx);

  // 2. Sign the surviving body in a single Tangem tap.
  const survivor = list[0];
  const bodyBytes: Uint8Array = survivor.bodyBytes ?? survivor.body;
  if (!bodyBytes || bodyBytes.length === 0) {
    throw new Error("variant [0] has no bodyBytes");
  }
  const hashHex = Array.from(bodyBytes)
    .map((x) => x.toString(16).padStart(2, "0"))
    .join("");

  const rw = getRoleWallet(CONNECTED_ROLE);
  if (!rw) throw new Error("Emission card not scanned — scan it in Setup first");
  console.log("[WC] Tangem sign: 1 hash — tap card");
  const r: any = await (RNTangemSdk as any).sign({
    cardId: rw.cardId,
    walletPublicKey: rw.slipPublicKey,
    hashes: [hashHex],
    derivationPath: HEDERA_DERIVATION_PATH,
    initialMessage: { header: "Sign LP transaction" },
  });
  const sigHex: string = r?.signatures?.[0];
  if (!sigHex) throw new Error("Tangem returned no signature");
  const clean = sigHex.replace(/^0x/, "");
  const sig = new Uint8Array(clean.length / 2);
  for (let j = 0; j < sig.length; j++) sig[j] = parseInt(clean.substr(j * 2, 2), 16);

  // 3. Verify locally before we hand it off — Hedera will reject as
  //    INVALID_SIGNATURE for both "wrong card" and "bad encoding", and
  //    we can't tell those apart from a precheck error. Doing it here
  //    surfaces the right diagnosis immediately.
  const ok = CONNECTED_KEY.verify(bodyBytes, sig);
  if (!ok) {
    throw new Error(
      `Tangem sig fails offline verification against ${CONNECTED_KEY.toStringRaw().slice(0, 16)}…. ` +
        `Either the emission card's derived key doesn't match the on-chain key (wrong card or wrong derivation path), ` +
        `or the SDK is hashing the body differently than Tangem did.`,
    );
  }
  console.log("[WC] sig verified locally against connected key");

  // 4. Attach via the SDK's official path (handles proto encoding for us).
  (tx as any).addSignature(CONNECTED_KEY, sig);
  console.log("[WC] sig attached via addSignature");
  return tx;
}

/** Handle an incoming JSON-RPC session_request from a paired dapp. */
async function onSessionRequest(event: any): Promise<void> {
  if (!wallet) return;
  const { id, topic, params } = event;
  const { request, chainId } = params;
  const method = request.method as HederaJsonRpcMethod;
  console.log("[WC] session_request", { method, paramKeys: Object.keys(request.params ?? {}) });

  const respondError = async (code: number, message: string) => {
    console.log("[WC] respondError", { code, message });
    await wallet!.respondSessionRequest({
      topic,
      response: { id, jsonrpc: "2.0", error: { code, message } },
    });
  };

  try {
    switch (method) {
      case HederaJsonRpcMethod.SignAndExecuteTransaction: {
        console.log("[WC] SignAndExecute: deserializing tx");
        const tx = base64StringToTransaction(request.params.transactionList);
        console.log("[WC] tx type:", tx.constructor.name, "isFrozen:", (tx as any).isFrozen?.());
        console.log("[WC] requesting Tangem sign…");
        await tangemSignTx(tx);
        console.log("[WC] Tangem sign returned, executing…");
        const client = makeClientForConnected();
        const resp = await tx.execute(client);
        console.log("[WC] execute returned txId:", resp.transactionId.toString());
        // Match the Hedera-wallet-connect library's response shape exactly:
        // TransactionResponse.toJSON() — the dapp deserializes this back into
        // a TransactionResponse to fetch the receipt itself. A bespoke object
        // shape causes the dapp to treat it as a cancellation/malformed
        // response.
        await wallet.respondSessionRequest({
          topic,
          response: {
            id,
            jsonrpc: "2.0",
            result: (resp as any).toJSON(),
          },
        });
        client.close();
        break;
      }
      case HederaJsonRpcMethod.SignTransaction: {
        // HIP-820 names the param `transactionBody`. Older / off-spec dapps
        // sometimes send `body` or `transactionList`; accept all three so
        // a misformatted request can't silently produce an empty signature
        // and surface as a phantom "user cancelled".
        const raw =
          request.params.transactionBody ??
          request.params.body ??
          request.params.transactionList;
        if (!raw) {
          await respondError(5000, "SignTransaction missing transactionBody param");
          return;
        }
        const bodyBytes: Uint8Array =
          typeof raw === "string" ? Buffer.from(raw, "base64") : raw;
        const sigBytes = await signForRole(
          CONNECTED_ROLE,
          HEDERA_DERIVATION_PATH,
          bodyBytes,
        );
        const signerSig = new SignerSignature({
          publicKey: CONNECTED_KEY,
          signature: sigBytes,
          accountId: AccountId.fromString(CONNECTED_ACCOUNT),
        });
        const sigMap = signerSignaturesToSignatureMap([signerSig]);
        const sigMapBase64 = signatureMapToBase64String(sigMap);
        await wallet.respondSessionRequest({
          topic,
          response: {
            id,
            jsonrpc: "2.0",
            result: { signatureMap: sigMapBase64 },
          },
        });
        break;
      }
      case HederaJsonRpcMethod.ExecuteTransaction: {
        const tx = base64StringToTransaction(request.params.transactionList);
        const client = makeClientForConnected();
        const resp = await tx.execute(client);
        await wallet.respondSessionRequest({
          topic,
          response: {
            id,
            jsonrpc: "2.0",
            result: (resp as any).toJSON(),
          },
        });
        client.close();
        break;
      }
      default:
        await respondError(4001, `Unsupported method ${method} in MVP`);
        return;
    }
  } catch (e) {
    console.log("[WC] handler caught error:", (e as Error).message, (e as any).stack);
    await respondError(5000, (e as Error).message);
  }
  wcEmit();
}
