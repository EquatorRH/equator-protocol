// Live-data helpers. Pure and injectable so gates can run them with mocks and a fake clock.
// Unknown always renders as "—". Nothing is estimated or fabricated.

export const DASH = "—";
export const INTERVALS = { chain: 15_000, tvl: 600_000 };
export const LLAMA_CHAINS = "https://api.llama.fi/v2/chains";

const hexNum = (h) => (typeof h === "string" && /^0x[0-9a-fA-F]+$/.test(h) ? Number(BigInt(h)) : null);

export const RPC_BATCH = [
  { jsonrpc: "2.0", id: 1, method: "eth_chainId", params: [] },
  { jsonrpc: "2.0", id: 2, method: "eth_blockNumber", params: [] },
  { jsonrpc: "2.0", id: 3, method: "eth_gasPrice", params: [] },
  { jsonrpc: "2.0", id: 4, method: "eth_getBlockByNumber", params: ["latest", false] },
];

/** Validate an RPC batch response. Returns readings or throws. A wrong chain id discards everything. */
export function parseChain(batch, expectedId) {
  if (!Array.isArray(batch)) throw new Error("bad rpc payload");
  const by = Object.fromEntries(batch.map((r) => [r.id, r.result]));
  const chainId = hexNum(by[1]);
  if (chainId !== expectedId) throw new Error("chain id mismatch");
  const blk = by[4] && typeof by[4] === "object" ? by[4] : {};
  return {
    chainId,
    block: hexNum(by[2]) ?? hexNum(blk.number),
    gasPrice: hexNum(by[3]),
    baseFee: hexNum(blk.baseFeePerGas),
    gasUsed: hexNum(blk.gasUsed),
    timestamp: hexNum(blk.timestamp),
  };
}

export async function fetchChain(rpc, expectedId, fetchFn = fetch, signal) {
  const res = await fetchFn(rpc, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(RPC_BATCH),
    signal,
  });
  if (!res.ok) throw new Error("rpc http " + res.status);
  return parseChain(await res.json(), expectedId);
}

export function pickTvl(chains, expectedId) {
  if (!Array.isArray(chains)) throw new Error("bad llama payload");
  const c = chains.find((x) => x && x.chainId === expectedId);
  if (!c || typeof c.tvl !== "number" || !Number.isFinite(c.tvl)) throw new Error("chain not listed");
  return c.tvl;
}

export async function fetchTvl(expectedId, fetchFn = fetch, signal) {
  const res = await fetchFn(LLAMA_CHAINS, { signal });
  if (!res.ok) throw new Error("llama http " + res.status);
  return pickTvl(await res.json(), expectedId);
}

const nf = new Intl.NumberFormat("en-US");
export const fmtInt = (n) => (Number.isFinite(n) ? nf.format(n) : DASH);

export function fmtCompact(n) {
  if (!Number.isFinite(n)) return DASH;
  const steps = [[1e12, "T"], [1e9, "B"], [1e6, "M"], [1e3, "K"]];
  for (const [v, s] of steps) if (Math.abs(n) >= v) return (n / v).toFixed(2) + s;
  return String(Math.round(n));
}

export const fmtUsd = (n) => (Number.isFinite(n) ? "$" + fmtCompact(n) : DASH);

export function fmtGwei(wei) {
  if (!Number.isFinite(wei)) return DASH;
  const g = wei / 1e9;
  return (g >= 1 ? g.toFixed(2) : g.toFixed(4)) + " gwei";
}

export function fmtAge(sec) {
  if (!Number.isFinite(sec)) return DASH;
  const s = Math.max(0, Math.floor(sec));
  if (s < 60) return s + "s";
  if (s < 3600) return Math.floor(s / 60) + "m " + (s % 60) + "s";
  return Math.floor(s / 3600) + "h " + Math.floor((s % 3600) / 60) + "m";
}

/** state = { chain, chainAt, tvl, tvlAt, failed } (times in ms). Returns bind-key → display text. */
export function bindings(state, nowMs) {
  const c = state.chain;
  const ageSec = c && c.timestamp != null ? nowMs / 1000 - c.timestamp : null;
  const since = state.chainAt != null ? Math.max(0, Math.round((nowMs - state.chainAt) / 1000)) : null;
  let status = "Connecting";
  if (state.chainAt != null) status = state.failed ? "Stale" : "Live";
  else if (state.failed) status = "Offline";
  return {
    block: c ? fmtInt(c.block) : DASH,
    blockAge: fmtAge(ageSec),
    gasPrice: c ? fmtGwei(c.gasPrice) : DASH,
    baseFee: c ? fmtGwei(c.baseFee) : DASH,
    gasUsed: c ? fmtCompact(c.gasUsed) : DASH,
    chainId: c ? `${c.chainId} · 0x${c.chainId.toString(16)}` : DASH,
    tvl: fmtUsd(state.tvl),
    status,
    updated: since == null ? DASH : since + "s ago",
  };
}

/** Self-rescheduling poller. `timers` is injectable for fake-clock tests. Returns stop(). */
export function poll(task, ms, timers = { setTimeout: (f, t) => setTimeout(f, t), clearTimeout: (h) => clearTimeout(h) }) {
  let handle = null;
  let stopped = false;
  const run = async () => {
    try {
      await task();
    } catch {
      /* task reports its own failure */
    }
    if (!stopped) handle = timers.setTimeout(run, ms);
  };
  run();
  return () => {
    stopped = true;
    if (handle != null) timers.clearTimeout(handle);
  };
}
