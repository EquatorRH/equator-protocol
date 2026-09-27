// Pure string renderers over the register. Used at build time (prerender) and by the gates
// with synthetic fixtures. Rule: no href for unstated records; handles are derived from URLs.

export const ADDRESS_RE = /^0x[0-9a-fA-F]{40}$/;

export const isAddress = (s) => typeof s === "string" && ADDRESS_RE.test(s);

const esc = (s) =>
  String(s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);

const HOSTS = {
  x: ["x.com", "www.x.com", "twitter.com", "www.twitter.com"],
  github: ["github.com", "www.github.com"],
};

/** Parse a stored URL; returns { href, handle } or null when the URL is not usable for that kind. */
export function deriveLink(kind, rec) {
  if (!rec || rec.state !== "stated" || typeof rec.url !== "string") return null;
  let u;
  try {
    u = new URL(rec.url);
  } catch {
    return null;
  }
  if (u.protocol !== "https:" || !HOSTS[kind].includes(u.hostname.toLowerCase())) return null;
  const seg = u.pathname.split("/").filter(Boolean)[0];
  if (!seg) return null;
  return { href: u.href, handle: kind === "x" ? "@" + seg : seg };
}

// Official X mark and GitHub Octicon (mark-github-16).
const ICON = {
  x: '<svg viewBox="0 0 24 24" width="20" height="20" aria-hidden="true" focusable="false" fill="currentColor"><path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z"/></svg>',
  github:
    '<svg viewBox="0 0 16 16" width="20" height="20" aria-hidden="true" focusable="false" fill="currentColor"><path d="M8 0c4.42 0 8 3.58 8 8a8.013 8.013 0 0 1-5.45 7.59c-.4.08-.55-.17-.55-.38 0-.27.01-1.13.01-2.2 0-.75-.25-1.23-.54-1.48 1.78-.2 3.65-.88 3.65-3.95 0-.88-.31-1.59-.82-2.15.08-.2.36-1.02-.08-2.12 0 0-.67-.22-2.2.82-.64-.18-1.32-.27-2-.27-.68 0-1.36.09-2 .27-1.53-1.03-2.2-.82-2.2-.82-.44 1.1-.16 1.92-.08 2.12-.51.56-.82 1.28-.82 2.15 0 3.06 1.86 3.75 3.64 3.95-.23.2-.44.55-.51 1.07-.46.21-1.61.55-2.33-.66-.15-.24-.6-.83-1.23-.82-.67.01-.27.38.01.53.34.19.73.9.82 1.13.16.45.68 1.31 2.69.94 0 .67.01 1.3.01 1.49 0 .21-.15.45-.55.38A7.995 7.995 0 0 1 0 8c0-4.42 3.58-8 8-8Z"/></svg>',
};
const NAME = { x: "X", github: "GitHub" };

export function renderSocial(kind, rec) {
  const link = deriveLink(kind, rec);
  if (link) {
    return `<a class="social" href="${esc(link.href)}" target="_blank" rel="noopener noreferrer" aria-label="${NAME[kind]} ${esc(link.handle)} (opens in a new tab)">${ICON[kind]}</a>`;
  }
  return `<a class="social is-inert" role="link" aria-disabled="true" aria-label="${NAME[kind]} — not yet published">${ICON[kind]}</a>`;
}

const COPY_ICON =
  '<svg class="ca__ic ca__ic--copy" viewBox="0 0 24 24" width="20" height="20" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><rect x="9" y="9" width="11" height="11" rx="2.5"/><path d="M5 15V6.5A2.5 2.5 0 0 1 7.5 4H15"/></svg>';
const CHECK_ICON =
  '<svg class="ca__ic ca__ic--check" viewBox="0 0 24 24" width="20" height="20" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="m5 12.5 4.5 4.5L19 7.5"/></svg>';

/** The always-visible CA slot. Two branches: stated (copyable) and absent (inert, no date, no button). */
export function renderCA(rec) {
  const addr = rec && rec.state === "stated" && isAddress(rec.value) ? rec.value : null;
  if (!addr) {
    return `<div class="ca ca--absent" role="group" aria-disabled="true" aria-label="Contract address, not yet announced">
  <span class="ca__label">Contract address</span>
  <span class="ca__addr ca__addr--pending">Not yet announced</span>
</div>`;
  }
  const chars = [...addr].map((c, i) => `<span class="ca__ch" style="--i:${i}">${c}</span>`).join("");
  return `<button type="button" class="ca ca--stated" data-copy="${addr}" aria-label="Copy contract address ${addr}">
  <span class="ca__label">Contract address</span>
  <span class="ca__addr" aria-hidden="true">${chars}</span>
  <span class="ca__action" aria-hidden="true">${COPY_ICON}${CHECK_ICON}<span class="ca__hint" data-idle="Copy" data-done="Copied">Copy</span></span>
  <span class="ca__bloom" aria-hidden="true"></span>
</button>
<span class="sr-only" id="ca-status" role="status" aria-live="polite"></span>`;
}

const STATE_LABEL = { stated: "Stated", absent: "Not yet stated", unconfirmed: "Unconfirmed" };

function row(name, state, valueHtml) {
  return `<li class="reg__row" data-state="${state}" data-reveal style="--i:var(--n)"><span class="reg__name">${name}</span><span class="reg__val">${valueHtml}</span><span class="reg__state"><i class="reg__dot" aria-hidden="true"></i>${STATE_LABEL[state] || "Unconfirmed"}</span></li>`;
}

const DASH = '<span class="dim">—</span>';

export function renderRegister(reg) {
  const rows = [];
  const c = reg.chain;
  rows.push(
    row("Network", c.state, c.state === "stated" ? `${esc(c.name)} · ${esc(c.id)} <span class="dim">(${esc(c.idHex)})</span>` : DASH),
  );
  const ca = reg.ca;
  rows.push(
    row("Contract address", isAddress(ca.value) && ca.state === "stated" ? "stated" : ca.state === "stated" ? "unconfirmed" : ca.state,
      ca.state === "stated" && isAddress(ca.value) ? `<span class="mono brk">${ca.value}</span>` : DASH),
  );
  for (const kind of ["x", "github"]) {
    const l = deriveLink(kind, reg[kind]);
    rows.push(
      row(NAME[kind], l ? "stated" : reg[kind].state === "stated" ? "unconfirmed" : reg[kind].state,
        l ? `<a class="reg__link" href="${esc(l.href)}" target="_blank" rel="noopener noreferrer">${esc(l.handle)}</a>` : DASH),
    );
  }
  return rows.map((r, i) => r.replace("var(--n)", i)).join("\n");
}

export function renderContractNote(rec) {
  const stated = rec && rec.state === "stated" && isAddress(rec.value);
  return stated
    ? "The contract address is published in the bar above. Verify it against every official channel before you interact with anything."
    : "The Equator contract address has not been announced. The bar above activates the moment it is stated. Until then nothing can be copied and nothing is implied.";
}

/** Fields the client needs at runtime (no sources). */
export function publicRegister(reg) {
  const { chain, ca, x, github } = reg;
  const { source: _s, ...c } = chain;
  return { chain: c, ca: { state: ca.state, value: ca.value ?? null }, x: { state: x.state, url: x.url ?? null }, github: { state: github.state, url: github.url ?? null } };
}
