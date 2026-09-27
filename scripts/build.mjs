// Build: prerender the register into HTML and emit a complete static deployment artifact in dist/.
import { readFileSync, writeFileSync, rmSync, mkdirSync, copyFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { renderCA, renderSocial, renderRegister, renderContractNote, publicRegister } from "../src/render.js";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const SRC = join(ROOT, "src");
const DIST = join(ROOT, "dist");
const read = (p) => readFileSync(join(SRC, p), "utf8");

export function tokenValues(css) {
  return Object.fromEntries([...css.matchAll(/--([a-z0-9-]+):\s*(#[0-9a-fA-F]{6,8})\s*;/g)].map((m) => [m[1], m[2]]));
}

export function buildHtml(template, reg, tokens) {
  const json = JSON.stringify(publicRegister(reg)).replace(/</g, "\\u003c");
  return template
    .replace("{{THEME}}", tokens.bg)
    .replace("{{REGISTER_JSON}}", () => json)
    .replace("{{X}}", () => renderSocial("x", reg.x))
    .replace("{{GITHUB}}", () => renderSocial("github", reg.github))
    .replace("{{CA}}", () => renderCA(reg.ca))
    .replace("{{CANOTE}}", () => renderContractNote(reg.ca))
    .replace("{{REGISTER}}", () => renderRegister(reg));
}

// Favicon = the real logo's 32x32 alpha grid (premultiplied resize, see sample-brand.py), one rect per row run.
export function buildFavicon(grid, tokens) {
  const rects = [];
  grid.alpha.forEach((row, y) => {
    const a = row.match(/../g).map((h) => parseInt(h, 16));
    for (let x = 0; x < a.length; ) {
      if (!a[x]) { x++; continue; }
      let e = x;
      while (e < a.length && a[e] === a[x]) e++;
      rects.push(`<rect x="${x}" y="${y}" width="${e - x}" height="1"${a[x] < 255 ? ` fill-opacity="${(a[x] / 255).toFixed(2)}"` : ""}/>`);
      x = e;
    }
  });
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 32 32" width="32" height="32"><rect width="32" height="32" rx="7" fill="${tokens.bg}"/><g fill="${tokens.brand}" shape-rendering="crispEdges">${rects.join("")}</g></svg>\n`;
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const reg = JSON.parse(read("register.json"));
  const tokensCss = read("tokens.css");
  const tokens = tokenValues(tokensCss);

  rmSync(DIST, { recursive: true, force: true });
  mkdirSync(DIST, { recursive: true });
  writeFileSync(join(DIST, "index.html"), buildHtml(read("index.html"), reg, tokens));
  writeFileSync(join(DIST, "app.css"), tokensCss + "\n" + read("styles.css"));
  writeFileSync(join(DIST, "favicon.svg"), buildFavicon(JSON.parse(read("favicon.grid.json")), tokens));
  copyFileSync(join(SRC, "brand", "logo-mark.png"), join(DIST, "logo-mark.png"));
  copyFileSync(join(SRC, "brand", "apple-touch-icon.png"), join(DIST, "apple-touch-icon.png"));
  copyFileSync(join(SRC, "brand", "og.jpg"), join(DIST, "og.jpg"));
  for (const f of ["app.js", "live.js"]) copyFileSync(join(SRC, f), join(DIST, f));
  writeFileSync(join(DIST, "robots.txt"), "User-agent: *\nAllow: /\n");
  console.log("build ok -> dist/");
}
