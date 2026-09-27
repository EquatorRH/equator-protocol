// Gates: fast, synthetic fixtures for every branch, mocks and a fake clock for refresh logic.
// Exits 0 whether the real register has the CA absent or stated. Max 30 checks.
import { readFileSync, existsSync, readdirSync, statSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { renderCA, renderSocial, renderRegister, deriveLink, isAddress } from "../src/render.js";
import { INTERVALS, DASH, parseChain, pickTvl, fetchChain, bindings, poll, fmtCompact, fmtGwei, fmtAge, fmtUsd } from "../src/live.js";
import { buildHtml, buildFavicon, tokenValues } from "./build.mjs";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const rd = (p) => readFileSync(join(ROOT, p), "utf8");
const t0 = Date.now();
const results = [];
const check = async (name, fn) => {
  try {
    await fn();
    results.push([true, name]);
  } catch (e) {
    results.push([false, name + " — " + (e && e.message)]);
  }
};
const ok = (c, m = "assertion failed") => {
  if (!c) throw new Error(m);
};
const eq = (a, b, m) => ok(a === b, `${m || "expected equal"}: ${JSON.stringify(a)} !== ${JSON.stringify(b)}`);
const text = (h) => h.replace(/<[^>]+>/g, "").replace(/\s+/g, "");
const DATE_RE = /\b\d{4}-\d{2}-\d{2}\b|\b(?:jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)[a-z]*\.? \d{1,2}\b|\b\d{1,2}\/\d{1,2}\/\d{2,4}\b/i;

// ---- synthetic fixtures (never the live register) ----
const ADDR = "0xAbCdEf0123456789aBcDeF0123456789AbCdEf01";
const ABSENT = { state: "absent", value: null, source: null };
const STATED = { state: "stated", value: ADDR, source: "fixture" };
const CHAIN = { state: "stated", name: "Robinhood Chain", id: 4663, idHex: "0x1237", rpc: "https://rpc.example.test", source: "fixture" };
const regAbsent = { chain: CHAIN, ca: ABSENT, x: { state: "absent", url: null }, github: { state: "absent", url: null } };
const regStated = { chain: CHAIN, ca: STATED, x: { state: "stated", url: "https://x.com/equatorfix" }, github: { state: "stated", url: "https://github.com/equatorfix/site" } };
const rpcOk = [
  { id: 1, result: "0x1237" },
  { id: 3, result: "0x1a74760" },
  { id: 2, result: "0x45d3c05" },
  { id: 4, result: { number: "0x45d3c05", baseFeePerGas: "0x1aa6c10", gasUsed: "0x361031", timestamp: "0x6ab7efe3" } },
];

// ---- 1-2 register ----
const real = JSON.parse(rd("src/register.json"));
await check("register: every record has a valid state and consistent fields", () => {
  for (const [k, r] of Object.entries(real)) {
    ok(["stated", "absent", "unconfirmed"].includes(r.state), `${k} state`);
    const v = k === "ca" ? r.value : k === "chain" ? r.name : r.url;
    if (r.state === "stated") ok(v, `${k} stated needs a value`);
    else ok(v == null, `${k} not stated must have no value`);
  }
  if (real.ca.state === "stated") ok(isAddress(real.ca.value), "stated CA must be a 40-hex address");
});
await check("register: chain id is 4663 and hex form agrees", () => {
  eq(real.chain.id, 4663);
  eq(real.chain.idHex, "0x1237");
  eq(parseInt(real.chain.idHex, 16), real.chain.id);
});

// ---- 3-6 absent branch (synthetic) ----
const caAbsent = renderCA(ABSENT);
await check("absent CA: inert — no button, no copy payload, aria-disabled", () => {
  ok(!/<button|data-copy/.test(caAbsent) && /aria-disabled="true"/.test(caAbsent));
});
await check("absent CA: no date rendered next to the slot", () => ok(!DATE_RE.test(text(caAbsent)) && !/<time/.test(caAbsent)));
await check("absent socials: rendered, inert, no href", () => {
  for (const k of ["x", "github"]) {
    const h = renderSocial(k, regAbsent[k]);
    ok(/<svg/.test(h) && /is-inert/.test(h) && !/href=/.test(h), k);
  }
});
await check("absent register rows: show — and carry no href", () => {
  const h = renderRegister(regAbsent);
  ok(!/href=/.test(h) && (h.match(/>—</g) || []).length === 3, "three em-dashes expected");
});

// ---- 7-11 stated branch (synthetic) ----
const caStated = renderCA(STATED);
await check("stated CA: full address shown in order and copy payload matches", () => {
  ok(text(caStated).includes(ADDR) && caStated.includes(`data-copy="${ADDR}"`));
});
await check("stated CA: no date, live-region present for copy feedback", () => {
  ok(!DATE_RE.test(text(caStated)) && /role="status"/.test(caStated));
});
await check("links: URL stored, handle derived, href only when stated", () => {
  eq(deriveLink("x", regStated.x).handle, "@equatorfix");
  eq(deriveLink("github", regStated.github).handle, "equatorfix");
  ok(/href="https:\/\/x\.com\/equatorfix"/.test(renderSocial("x", regStated.x)));
});
await check("links: wrong host, http or unstated URL never gets an href", () => {
  ok(deriveLink("x", { state: "stated", url: "https://evil.test/x" }) === null);
  ok(deriveLink("x", { state: "stated", url: "http://x.com/a" }) === null);
  ok(deriveLink("github", { state: "absent", url: "https://github.com/a" }) === null);
});
await check("gate warning: 0x hex is not blanket-rejected", () => {
  ok(isAddress(ADDR) && isAddress(ADDR.toLowerCase()) && !isAddress("0x1237") && !isAddress(ADDR + "00"));
  ok(renderRegister(regStated).includes("0x1237"), "chain id hex must render");
  ok(renderRegister(regStated).includes(ADDR), "address must render");
  ok(/ca--absent/.test(renderCA({ state: "stated", value: "0x1237" })), "malformed CA falls back, does not crash");
});

// ---- 12-19 live data: mocks + fake clock ----
await check("rpc: batch parsed to readings", () => {
  const r = parseChain(rpcOk, 4663);
  eq(r.block, 0x45d3c05);
  eq(r.baseFee, 0x1aa6c10);
  eq(r.gasUsed, 0x361031);
});
await check("rpc: wrong chain id is discarded", () => {
  let threw = false;
  try {
    parseChain([{ id: 1, result: "0x1" }], 4663);
  } catch {
    threw = true;
  }
  ok(threw);
});
await check("rpc: fetchChain posts one batch to the register rpc (mock fetch)", async () => {
  let seen;
  const f = async (url, init) => ((seen = { url, body: JSON.parse(init.body) }), { ok: true, json: async () => rpcOk });
  const r = await fetchChain("https://rpc.example.test", 4663, f);
  eq(seen.url, "https://rpc.example.test");
  eq(seen.body.map((x) => x.method).join(), "eth_chainId,eth_blockNumber,eth_gasPrice,eth_getBlockByNumber");
  eq(r.chainId, 4663);
});
await check("tvl: picks chain id 4663; missing chain throws", () => {
  eq(pickTvl([{ chainId: 1, tvl: 5 }, { chainId: 4663, tvl: 42 }], 4663), 42);
  let threw = false;
  try {
    pickTvl([{ chainId: 1, tvl: 5 }], 4663);
  } catch {
    threw = true;
  }
  ok(threw);
});
await check("bindings: unknown is — everywhere, never fabricated", () => {
  const b = bindings({ chain: null, chainAt: null, tvl: null, tvlAt: null, failed: false }, 0);
  for (const k of ["block", "blockAge", "gasPrice", "baseFee", "gasUsed", "chainId", "tvl", "updated"]) eq(b[k], DASH, k);
});
await check("bindings: known values format; block age ticks with the clock", () => {
  const chain = parseChain(rpcOk, 4663);
  const s = { chain, chainAt: 1_000_000, tvl: 1.03e9, tvlAt: 1, failed: false };
  const at = (chain.timestamp + 12) * 1000;
  const b = bindings(s, at);
  eq(b.block, "73,219,077");
  eq(b.blockAge, "12s");
  eq(bindings(s, at + 5000).blockAge, "17s");
  eq(b.tvl, "$1.03B");
  eq(b.gasPrice, "0.0277 gwei");
  eq(b.chainId, "4663 · 0x1237");
});
await check("format helpers: edge cases", () => {
  eq(fmtCompact(3543089), "3.54M");
  eq(fmtGwei(null), DASH);
  eq(fmtAge(125), "2m 5s");
  eq(fmtUsd(NaN), DASH);
});
await check("refresh: fake clock — chain every 15s, tvl every 10min, stop cancels", async () => {
  eq(INTERVALS.chain, 15000);
  eq(INTERVALS.tvl, 600000);
  const queue = [];
  const timers = { setTimeout: (fn, ms) => (queue.push({ fn, ms }), queue.length), clearTimeout: () => queue.pop() };
  let n = 0;
  const stop = poll(async () => void n++, INTERVALS.chain, timers);
  await Promise.resolve();
  await Promise.resolve();
  eq(n, 1, "runs immediately");
  eq(queue[0].ms, 15000);
  queue.shift().fn();
  await Promise.resolve();
  await Promise.resolve();
  eq(n, 2, "runs again on tick");
  stop();
  eq(queue.length, 0, "stop cancels the pending timer");
  let m = 0; // default (real) timers must reschedule too
  const stop2 = poll(async () => void m++, 5);
  await new Promise((r) => setTimeout(r, 60));
  stop2();
  ok(m >= 2, "default timers reschedule");
});

// ---- 20-30 static: palette, motion, mobile, hygiene, dist ----
const listFiles = (dir) =>
  readdirSync(dir).flatMap((f) => {
    const p = join(dir, f);
    return statSync(p).isDirectory() ? listFiles(p) : [p];
  });
const tokensCss = rd("src/tokens.css");
const tokens = tokenValues(tokensCss);
const distReady = existsSync(join(ROOT, "dist/index.html"));
const distHtml = distReady ? rd("dist/index.html") : "";
const LIT = /#[0-9a-fA-F]{8}\b|#[0-9a-fA-F]{6}\b|#[0-9a-fA-F]{3}\b|\b(?:rgba?|hsla?|hwb|oklch|oklab|lab|lch)\(/g;
const stripAnchors = (s) => s.replace(/(?:href|id|for)="#?[^"]*"/g, "").replace(/&#\d+;/g, "");

await check("palette: real-asset provenance per token (k-means, real pixel) and text contrast >= 4.5:1", () => {
  ok(/k-means/.test(tokensCss) && /snapped/.test(tokensCss), "provenance comment missing");
  for (const v of Object.values(tokens)) {
    const base = v.slice(0, 7).toLowerCase();
    ok(new RegExp(base + "\\s+.+@\\(\\d+,\\d+\\)", "i").test(tokensCss), `${base} lacks provenance file@(x,y)`);
  }
  const lum = (h) => {
    const c = [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16) / 255).map((v) => (v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4));
    return 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2];
  };
  const cr = (a, b) => (Math.max(lum(a), lum(b)) + 0.05) / (Math.min(lum(a), lum(b)) + 0.05);
  for (const k of ["ink", "brand", "muted", "accent"]) ok(cr(tokens[k], tokens.bg) >= 4.5, `${k} on bg ${cr(tokens[k], tokens.bg).toFixed(2)}`);
  ok(cr(tokens.muted, tokens.surface) >= 4.5, "muted on surface");
});
await check("palette: colour literals live only in tokens.css", () => {
  const files = [...listFiles(join(ROOT, "src")), ...listFiles(join(ROOT, "scripts"))].filter((f) => !/tokens\.css$|gates\.mjs$/.test(f));
  for (const f of files) {
    const src = stripAnchors(readFileSync(f, "utf8").replace(/\/\*[\s\S]*?\*\//g, ""));
    ok(!LIT.test(src), `literal colour in ${f}`);
    LIT.lastIndex = 0;
  }
});
await check("palette: favicon and dist only use token colours", () => {
  const fav = buildFavicon(JSON.parse(rd("src/favicon.grid.json")), tokens);
  const set = new Set(Object.values(tokens).map((v) => v.toLowerCase()));
  for (const m of fav.match(LIT) || []) ok(set.has(m.toLowerCase()), m);
  if (distReady) for (const m of stripAnchors(distHtml).match(LIT) || []) ok(set.has(m.toLowerCase()), "dist html " + m);
});
await check("favicon: 32x32 SVG, no XML comments", () => {
  const fav = buildFavicon(JSON.parse(rd("src/favicon.grid.json")), tokens);
  ok(/viewBox="0 0 32 32"/.test(fav) && /width="32"/.test(fav) && !/<!--|--/.test(fav) && /<\/svg>\s*$/.test(fav));
  if (distReady) ok(rd("dist/favicon.svg") === fav, "dist favicon out of date");
});
const css = rd("src/styles.css");
await check("motion: only transform and opacity animate; reduced-motion handled", () => {
  for (const m of css.matchAll(/transition:\s*([^;]+);/g))
    for (const part of m[1].split(",")) ok(/^\s*(transform|opacity|none)\b/.test(part), "transition: " + part.trim());
  for (const kf of css.matchAll(/@keyframes\s+\w+\s*\{((?:[^{}]*\{[^}]*\})+)\s*\}/g))
    for (const d of kf[1].matchAll(/([a-z-]+)\s*:/g)) ok(["transform", "opacity"].includes(d[1]), "keyframe prop " + d[1]);
  ok(/prefers-reduced-motion:\s*reduce/.test(css));
});
await check("mobile: no ch units; tap targets declare 48px minimum", () => {
  ok(!/\d\s*ch\b/.test(css), "ch unit found");
  for (const sel of [".social", ".btn", ".rail__btn"]) {
    const m = css.match(new RegExp("\\" + sel + "\\s*\\{[^}]*\\}"));
    ok(m && /(min-)?height:\s*48px/.test(m[0]) || /width:\s*48px/.test(m ? m[0] : ""), sel + " target size");
  }
});
await check("layout: CA slot in header before main; socials last in the top bar", () => {
  const src = rd("src/index.html");
  ok(src.indexOf("{{CA}}") < src.indexOf("<main"), "CA above main");
  ok(src.indexOf('class="socials"') > src.indexOf('class="nav"') && src.indexOf('class="socials"') > src.indexOf('class="brand"'));
});
await check("dist: complete artifact, matches a fresh prerender of the register", () => {
  ok(distReady, "run npm run build first");
  for (const f of ["index.html", "app.css", "app.js", "live.js", "favicon.svg"]) ok(existsSync(join(ROOT, "dist", f)), f);
  eq(distHtml, buildHtml(rd("src/index.html"), real, tokens), "dist/index.html stale");
});
await check("dist: CA branch matches register; no 40-hex address except the register CA", () => {
  const found = new Set((distHtml.match(/0x[0-9a-fA-F]{40}(?![0-9a-fA-F])/g) || []).map((s) => s.toLowerCase()));
  const expected = real.ca.state === "stated" ? [real.ca.value.toLowerCase()] : [];
  eq([...found].join(), expected.join());
  eq(/data-copy=/.test(distHtml), real.ca.state === "stated");
});
await check("bundle: no secrets, no wallet signing or connection", () => {
  const bundle = ["index.html", "app.js", "live.js", "app.css"].map((f) => (distReady ? rd("dist/" + f) : "")).join("\n");
  ok(!/api[_-]?key|secret|private[_ ]?key|bearer\s|mnemonic/i.test(bundle));
  ok(!/eth_sign|personal_sign|eth_requestAccounts|signTypedData|window\.ethereum/.test(bundle));
});
await check("hygiene: no CLAUDE.md, .claude/, or AI attribution", () => {
  ok(!existsSync(join(ROOT, "CLAUDE.md")) && !existsSync(join(ROOT, ".claude")));
  const files = [...listFiles(join(ROOT, "src")), ...listFiles(join(ROOT, "scripts")), ...(distReady ? listFiles(join(ROOT, "dist")) : [])].filter((f) => !/gates\.mjs$/.test(f));
  for (const f of files) ok(!/co-authored-by|generated with|claude|anthropic/i.test(readFileSync(f, "utf8")), f);
});

const failed = results.filter((r) => !r[0]);
for (const [pass, name] of results) console.log((pass ? "PASS " : "FAIL ") + name);
console.log(`\n${results.length} checks, ${failed.length} failed, ${((Date.now() - t0) / 1000).toFixed(2)}s (real CA: ${real.ca.state})`);
if (results.length > 30) {
  console.log("gate budget exceeded (max 30)");
  process.exit(1);
}
process.exit(failed.length ? 1 : 0);
