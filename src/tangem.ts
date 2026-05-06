import RNTangemSdk from "tangem-sdk-react-native";

const cardIdByWallet = new Map<string, string>();

export interface TangemWalletInfo {
  cardId: string;
  walletPublicKey: string;
  curve: string;
}

/**
 * Scan a card and return all wallets present on it. Adds discovered
 * wallets to the wallet→cardId map so future signs route to the right card.
 * Can be called multiple times — once per card if the user has separate
 * cards for treasury vs. fee collector.
 */
async function ensureSession() {
  try {
    await (RNTangemSdk as any).startSession?.({
      attestationMode: "offline",
    });
  } catch (_) {
    // Already running or unsupported in this SDK version — proceed anyway
  }
}

export async function scanCard(): Promise<TangemWalletInfo[]> {
  await ensureSession();
  const card = await RNTangemSdk.scanCard();
  const wallets = (card.wallets ?? []).map((w: any) => ({
    cardId: card.cardId,
    walletPublicKey: w.publicKey,
    curve: w.curve,
  }));
  for (const w of wallets) {
    cardIdByWallet.set(w.walletPublicKey.toLowerCase(), w.cardId);
  }
  return wallets;
}

export function knownWallets(): string[] {
  return Array.from(cardIdByWallet.keys());
}

/**
 * Sign raw bytes with a specific Tangem wallet. The user is prompted to
 * tap the card containing that wallet. If the wallet's cardId was cached
 * via scanCard(), the SDK targets that exact card; otherwise it accepts
 * any card with the matching wallet.
 */
export async function signWithWallet(
  walletPublicKey: string,
  messageBytes: Uint8Array,
): Promise<Uint8Array> {
  const cardId = cardIdByWallet.get(walletPublicKey.toLowerCase());
  const hashHex = bytesToHex(messageBytes);
  const args: any = {
    walletPublicKey,
    hashes: [hashHex],
  };
  if (cardId) args.cardId = cardId;
  const result: { signatures: string[] } = await RNTangemSdk.sign(args);
  if (!result.signatures?.[0]) {
    throw new Error("Tangem returned no signature");
  }
  return hexToBytes(result.signatures[0]);
}

/**
 * Scan a card and return its ed25519_slip0010 wallet root + cardId.
 * The user taps once. We cache the result for later use in sign().
 */
export interface RoleWallet {
  cardId: string;
  slipPublicKey: string;
}

const roleWallets = new Map<string, RoleWallet>();

export async function scanCardForRole(role: string): Promise<RoleWallet> {
  await ensureSession();
  const card = await RNTangemSdk.scanCard();
  const slip = (card.wallets ?? []).find(
    (w: any) => (w.curve ?? "").toLowerCase().includes("slip"),
  );
  if (!slip) {
    throw new Error(`Tapped card has no ed25519_slip0010 wallet`);
  }
  const rw = { cardId: card.cardId, slipPublicKey: slip.publicKey };
  roleWallets.set(role, rw);
  return rw;
}

export function getRoleWallet(role: string): RoleWallet | undefined {
  return roleWallets.get(role);
}

/**
 * Sign with a previously-scanned card's slip0010 wallet using a BIP-44
 * derivation path. Single NFC operation = single tap.
 */
export async function signForRole(
  role: string,
  derivationPath: string,
  messageBytes: Uint8Array,
): Promise<Uint8Array> {
  const rw = roleWallets.get(role);
  if (!rw) throw new Error(`Scan ${role} card first`);
  const hashHex = bytesToHex(messageBytes);
  const result: { signatures: string[] } = await RNTangemSdk.sign({
    cardId: rw.cardId,
    walletPublicKey: rw.slipPublicKey,
    hashes: [hashHex],
    derivationPath,
  } as any);
  if (!result.signatures?.[0]) {
    throw new Error("Tangem returned no signature");
  }
  return hexToBytes(result.signatures[0]);
}

function bytesToHex(b: Uint8Array): string {
  return Array.from(b).map((x) => x.toString(16).padStart(2, "0")).join("");
}

function hexToBytes(hex: string): Uint8Array {
  const clean = hex.replace(/^0x/, "");
  const arr = new Uint8Array(clean.length / 2);
  for (let i = 0; i < arr.length; i++) {
    arr[i] = parseInt(clean.substr(i * 2, 2), 16);
  }
  return arr;
}
