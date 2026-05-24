import RNTangemSdk from "tangem-sdk-react-native";

const cardIdByWallet = new Map<string, string>();

/**
 * Default curve for Hedera HD-wallet derivation.
 * Tangem cards holding Hedera (HBAR/HTS) accounts use SLIP-0010 hardened
 * ED25519 derivation, exposed by the SDK as the `ed25519_slip0010` curve.
 */
const HEDERA_CURVE = "ed25519_slip0010" as const;

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
async function ensureSession(opts?: {
  defaultDerivationPaths?: Record<string, string[]>;
}) {
  try {
    const startOpts: any = { attestationMode: "offline" };
    if (opts?.defaultDerivationPaths) {
      startOpts.defaultDerivationPaths = opts.defaultDerivationPaths;
    }
    await (RNTangemSdk as any).startSession?.(startOpts);
  } catch (_) {
    // Already running or unsupported in this SDK version — proceed anyway.
    // Note: startSession can only be called once per app lifetime, so if a
    // previous call set the wrong derivationPaths we need stopSession first.
    // The discover-flow does that explicitly via restartSessionWithPaths().
  }
}

/**
 * Force-restart the NFC session with a fresh defaultDerivationPaths config.
 * Required for discovery because startSession's config is sticky — calling
 * it twice without stopSession in between has no effect on the 2nd call.
 *
 * Errors during stopSession are tolerated (typically "ALREADY_STOPPED" — fine).
 * Errors during startSession bubble up so the caller can show a UI error.
 */
async function restartSessionWithPaths(paths: Record<string, string[]>) {
  try {
    await (RNTangemSdk as any).stopSession?.();
  } catch (e: any) {
    // Expected: "ALREADY_STOPPED" if session was never started.
    // Unexpected codes are logged so we can debug NFC-reader issues in dev builds.
    if (e?.code && e.code !== "ALREADY_STOPPED") {
      // eslint-disable-next-line no-console
      console.warn("[tangem] stopSession unexpected error:", e?.code, e?.message);
    }
  }
  await (RNTangemSdk as any).startSession?.({
    attestationMode: "offline",
    defaultDerivationPaths: paths,
  });
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
 * Discovery: scan een Tangem-card en geef alle wallet-keys + derived keys terug.
 * Wordt gebruikt door DiscoverScreen om derivation-paths naar account-IDs te mappen
 * via Mirror Node.
 */
export interface DiscoveryWallet {
  cardId: string;
  rootPublicKey: string;       // master pubkey van de SLIP-0010 wallet
  curve: string;
  derivedKeys: Array<{
    index: number;
    publicKey: string;
    chainCode?: string;
    path?: string;   // gevuld wanneer SDK Map-shape retourneert (path = key)
  }>;
}

/**
 * Normaliseer de derivedKeys-veld dat de Tangem-SDK terugstuurt.
 * Verschillende SDK-versies retourneren dit veld als:
 *   - Array<{publicKey, chainCode}>
 *   - Object { "<path>": {publicKey, chainCode} } (= Map-stijl)
 *   - Object met derivedKey-object-shape
 *   - undefined / null / leeg
 * Deze helper geeft altijd een array terug met optioneel pad-info.
 */
function normalizeDerivedKeys(raw: any): Array<{
  index: number;
  publicKey: string;
  chainCode?: string;
  path?: string;
}> {
  if (!raw) return [];

  // Array-formaat
  if (Array.isArray(raw)) {
    return raw.map((dk: any, idx: number) => ({
      index: idx,
      publicKey: dk?.publicKey ?? "",
      chainCode: dk?.chainCode,
    }));
  }

  // Object-formaat (Map-stijl, met paths als keys)
  if (typeof raw === "object") {
    const entries = Object.entries(raw);
    return entries.map(([path, dk]: [string, any], idx: number) => ({
      index: idx,
      path,
      publicKey: dk?.publicKey ?? dk?.extendedPublicKey?.publicKey ?? "",
      chainCode: dk?.chainCode ?? dk?.extendedPublicKey?.chainCode,
    })).filter((dk) => dk.publicKey);
  }

  return [];
}

/**
 * Scan card en derive alle Hedera-paths in één tap.
 *
 * Werkt via de patched native bridge (zie patches/tangem-sdk-react-native+3.1.0.patch):
 * we configureren `defaultDerivationPaths` op `ed25519_slip0010` (Hedera's curve)
 * vóór de scan. De card derived dan alle paden tijdens de NFC-sessie en geeft
 * ze terug in `card.wallets[].derivedKeys`.
 *
 * @param paths Lijst van BIP-44 paden om te deriven. Default: `m/44'/3030'/0'/0'/0..15'`.
 */
export async function scanCardForDiscovery(
  paths: string[] = defaultHederaPaths(16),
): Promise<DiscoveryWallet[]> {
  // Force-restart session zodat de nieuwe config zeker wordt toegepast,
  // ook al was er al een sessie gestart zonder paths.
  await restartSessionWithPaths({ [HEDERA_CURVE]: paths });

  const card: any = await RNTangemSdk.scanCard();

  // Debug-log: laat de runtime-shape van card.wallets zien
  // eslint-disable-next-line no-console
  console.log(
    "[discovery] raw card.wallets:",
    JSON.stringify(card.wallets, null, 2)?.substring(0, 1200),
  );

  const result: DiscoveryWallet[] = [];
  for (const w of card.wallets ?? []) {
    const wallet: any = w;
    const derived = normalizeDerivedKeys(wallet.derivedKeys);
    result.push({
      cardId: card.cardId,
      rootPublicKey: wallet.publicKey,
      curve: wallet.curve,
      derivedKeys: derived,
    });
  }

  return result;
}

/**
 * Sign een vaste test-hash met een specifieke derivation path.
 * Gebruikt door verify-via-sign discovery: we signen test-bytes, dan
 * controleren we welke known pubkey de signature kan verifiëren.
 *
 * @param cardId       NLP-card ID (bv "AF99008300018041")
 * @param rootPubKey   Master pubkey van de SLIP-0010 wallet op de card
 * @param derivationPath  bv "m/44'/3030'/0'/0'/0'"
 * @param testHashHex  32-byte hash hex (zelfde voor alle paden in 1 sessie)
 */
export async function signForDiscovery(
  cardId: string,
  rootPubKey: string,
  derivationPath: string,
  testHashHex: string,
): Promise<Uint8Array> {
  const result: { signatures: string[] } = await RNTangemSdk.sign({
    cardId,
    walletPublicKey: rootPubKey,
    hashes: [testHashHex],
    derivationPath,
  } as any);
  if (!result.signatures?.[0]) {
    throw new Error("Tangem returned no signature");
  }
  return hexToBytes(result.signatures[0]);
}

/** Standaard Hedera-paden 0..n-1 voor BIP-44 derivation */
export function defaultHederaPaths(count = 16): string[] {
  return Array.from({ length: count }, (_, i) => `m/44'/3030'/0'/0'/${i}'`);
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
