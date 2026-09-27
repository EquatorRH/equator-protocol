import { INTERVALS, bindings, fetchChain, fetchTvl, poll } from "./live.js";

const $ = (s, r = document) => r.querySelector(s);
const $$ = (s, r = document) => [...r.querySelectorAll(s)];
const reduced = matchMedia("(prefers-reduced-motion: reduce)").matches;
const root = document.documentElement;

let register = null;
try {
  register = JSON.parse($("#register").textContent);
} catch {
  /* live data simply stays at "—" */
}

/* header height drives scene padding so the fixed CA slot never covers content */
const top = $("#top");
const syncTop = () => root.style.setProperty("--top-h", Math.ceil(top.getBoundingClientRect().height) + "px");
syncTop();
new ResizeObserver(syncTop).observe(top);

/* entrance: header, hero and CA in one coordinated sequence */
requestAnimationFrame(() =>
  requestAnimationFrame(() => {
    root.classList.add("is-ready");
    const ca = $(".ca--stated");
    if (ca) ca.classList.add("is-in");
  }),
);

/* scroll reveal */
const io = new IntersectionObserver(
  (entries) => {
    for (const e of entries) {
      if (e.isIntersecting) {
        e.target.classList.add("is-in");
        io.unobserve(e.target);
      }
    }
  },
  { threshold: 0.15 },
);
$$("[data-reveal]").forEach((el) => io.observe(el));

/* rail: scene counter + prev/next */
const scenes = $$("[data-scene]");
const railI = $("[data-rail-i]");
const railLabel = $("[data-rail-label]");
const prev = $('[data-rail="prev"]');
const next = $('[data-rail="next"]');
let current = 0;
const setCurrent = (i) => {
  current = i;
  railI.textContent = String(i + 1).padStart(2, "0");
  railLabel.textContent = scenes[i].dataset.label;
  prev.disabled = i === 0;
  next.disabled = i === scenes.length - 1;
};
const sio = new IntersectionObserver(
  (entries) => {
    for (const e of entries) if (e.isIntersecting) setCurrent(scenes.indexOf(e.target));
  },
  { rootMargin: "-45% 0px -50% 0px" },
);
scenes.forEach((s) => sio.observe(s));
setCurrent(0);
const go = (i) => scenes[Math.max(0, Math.min(scenes.length - 1, i))].scrollIntoView({ behavior: reduced ? "auto" : "smooth", block: "start" });
prev.addEventListener("click", () => go(current - 1));
next.addEventListener("click", () => go(current + 1));

/* click-to-copy */
const ca = $(".ca--stated");
if (ca) {
  const status = $("#ca-status");
  const hint = $(".ca__hint", ca);
  let timer = 0;
  const copy = async (text) => {
    try {
      await navigator.clipboard.writeText(text);
      return true;
    } catch {
      const t = document.createElement("textarea");
      t.value = text;
      t.setAttribute("readonly", "");
      t.style.cssText = "position:fixed;top:0;left:0;opacity:0";
      document.body.append(t);
      t.select();
      let ok = false;
      try {
        ok = document.execCommand("copy");
      } catch {
        /* ignored */
      }
      t.remove();
      return ok;
    }
  };
  ca.addEventListener("click", async () => {
    const ok = await copy(ca.dataset.copy);
    clearTimeout(timer);
    hint.textContent = ok ? hint.dataset.done : "Copy failed";
    status.textContent = ok ? "Contract address copied" : "Copy failed, select the address manually";
    ca.classList.toggle("is-copied", ok);
    timer = setTimeout(() => {
      ca.classList.remove("is-copied");
      hint.textContent = hint.dataset.idle;
      status.textContent = "";
    }, 1800);
  });
}

/* live data */
if (register && register.chain && register.chain.state === "stated") {
  const { id, rpc } = register.chain;
  const state = { chain: null, chainAt: null, tvl: null, tvlAt: null, failed: false };
  const cache = new Map();

  const paint = () => {
    const b = bindings(state, Date.now());
    for (const [key, text] of Object.entries(b)) {
      for (const el of $$(`[data-bind="${key}"]`)) {
        if (cache.get(el) === text) continue;
        const first = !cache.has(el);
        cache.set(el, text);
        el.textContent = text;
        if (!reduced && !first) {
          el.classList.remove("tick");
          void el.offsetWidth;
          el.classList.add("tick");
        }
      }
    }
  };

  const withTimeout = async (fn) => {
    const ac = new AbortController();
    const t = setTimeout(() => ac.abort(), 10_000);
    try {
      return await fn(ac.signal);
    } finally {
      clearTimeout(t);
    }
  };

  poll(async () => {
    if (document.hidden && state.chainAt != null) return;
    try {
      state.chain = await withTimeout((s) => fetchChain(rpc, id, fetch, s));
      state.chainAt = Date.now();
      state.failed = false;
    } catch {
      state.failed = true;
    }
    paint();
  }, INTERVALS.chain);

  poll(async () => {
    try {
      state.tvl = await withTimeout((s) => fetchTvl(id, fetch, s));
      state.tvlAt = Date.now();
    } catch {
      /* keep last good value, or "—" */
    }
    paint();
  }, INTERVALS.tvl);

  setInterval(paint, 1000); // block age and "updated" tick locally between polls
  paint();
}
