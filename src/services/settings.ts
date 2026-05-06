import AsyncStorage from "@react-native-async-storage/async-storage";

const KEY = "hedera-token-mint:settings:v1";

export type Network = "mainnet" | "testnet";

export interface Settings {
  network: Network;
  operatorAccountId: string;
  operatorPrivateKey: string;
  treasuryAccountId: string;
  derivationPath: string;
  feeCollectorAccountId?: string;
  feeCollectorMaxAutoAssoc?: number;
}

export const DEFAULT_SETTINGS: Settings = {
  network: "mainnet",
  operatorAccountId: "",
  operatorPrivateKey: "",
  treasuryAccountId: "",
  derivationPath: "m/44'/3030'/0'/0'/0'",
  feeCollectorAccountId: "",
  feeCollectorMaxAutoAssoc: 1,
};

export async function loadSettings(): Promise<Settings> {
  try {
    const raw = await AsyncStorage.getItem(KEY);
    if (!raw) return DEFAULT_SETTINGS;
    return { ...DEFAULT_SETTINGS, ...JSON.parse(raw) };
  } catch {
    return DEFAULT_SETTINGS;
  }
}

export async function saveSettings(s: Settings): Promise<void> {
  await AsyncStorage.setItem(KEY, JSON.stringify(s));
}

export async function clearSettings(): Promise<void> {
  await AsyncStorage.removeItem(KEY);
}
