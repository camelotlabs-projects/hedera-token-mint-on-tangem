/**
 * Browser-API polyfills required by WalletConnect / Reown libraries.
 *
 * The hedera-wallet-connect package re-exports its dapp side, which pulls
 * @walletconnect/modal in. That module calls window.matchMedia, window.location
 * and a handful of other DOM APIs at module-eval time. None of those exist in
 * React Native's Hermes runtime, so the bundle crashes the moment we import
 * the library.
 *
 * We can't tree-shake those imports away without a Metro resolver hack, so
 * the practical fix is to stub the browser globals. The wallet side of the
 * library doesn't actually call any of these at runtime; they're just enough
 * to make module-eval succeed.
 *
 * Keep this file at the top of the entry imports — BEFORE any WalletConnect
 * import — or the polyfills land too late and the bundle still crashes.
 */

const g: any = globalThis;

if (typeof g.window === "undefined") g.window = g;
if (typeof g.document === "undefined") g.document = {};

const win: any = g.window;

if (typeof win.matchMedia !== "function") {
  win.matchMedia = (query: string) => ({
    matches: false,
    media: query,
    onchange: null,
    addListener: () => {},
    removeListener: () => {},
    addEventListener: () => {},
    removeEventListener: () => {},
    dispatchEvent: () => false,
  });
}

if (typeof win.location === "undefined") {
  win.location = {
    href: "",
    origin: "",
    protocol: "",
    host: "",
    hostname: "",
    pathname: "",
    search: "",
    hash: "",
  };
}

if (typeof win.navigator === "undefined") {
  win.navigator = { userAgent: "react-native" };
}

if (typeof win.localStorage === "undefined") {
  const store: Record<string, string> = {};
  win.localStorage = {
    getItem: (k: string) => store[k] ?? null,
    setItem: (k: string, v: string) => {
      store[k] = String(v);
    },
    removeItem: (k: string) => {
      delete store[k];
    },
    clear: () => {
      for (const k of Object.keys(store)) delete store[k];
    },
    key: (i: number) => Object.keys(store)[i] ?? null,
    get length() {
      return Object.keys(store).length;
    },
  };
}
