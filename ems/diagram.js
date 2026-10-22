/* v136: assignment diagrams.
   AI har sawal ke saath diagram deta hai:
   • kind "grid" — coordinate grid (transformations, coordinates, straight-line graphs): sirf numbers / shapes deta hai,
     SVG yahan banta hai taake har line aur point bilkul sahi jagah ho.
   • kind "svg"  — baaqi diagram (geometry, circuits, ray / force diagrams, charts): AI ka SVG, yahan saaf (sanitize) hota hai.
   Browser mein diagram hamesha <img src="data:image/svg+xml,…"> se dikhta hai — is mein koi script nahi chal sakta. */

const num = (v, d = 0) => (Number.isFinite(+v) ? +v : d);
const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
const escX = (t) => String(t == null ? "" : t).replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c])).slice(0, 40);
const FILLS = ["#CFE3F7", "#FDE2C8", "#D8F0D0", "#F3D1E8", "#FFF3B0", "#E2DAF5"];
const STROKES = ["#1F5C99", "#B5591A", "#2E7D32", "#9C2A7A", "#8A6D00", "#5B3FA0"];
const r1 = (v) => Math.round(v * 10) / 10;

function gridSvg(g) {
  g = g || {};
  let xmin = Math.floor(num(g.xmin, -6)), xmax = Math.ceil(num(g.xmax, 6)), ymin = Math.floor(num(g.ymin, -6)), ymax = Math.ceil(num(g.ymax, 6));
  xmin = clamp(xmin, -30, 29); xmax = clamp(xmax, xmin + 1, 30); ymin = clamp(ymin, -30, 29); ymax = clamp(ymax, ymin + 1, 30);
  const span = Math.max(xmax - xmin, ymax - ymin), u = clamp(Math.floor(460 / span), 14, 36), m = 30;
  const W = (xmax - xmin) * u + 2 * m + 46, H = (ymax - ymin) * u + 2 * m;     // daayen taraf labels ke liye jagah
  const X = (x) => r1(m + (clamp(num(x), xmin, xmax) - xmin) * u), Y = (y) => r1(m + (ymax - clamp(num(y), ymin, ymax)) * u);
  const step = span > 16 ? 2 : 1, fs = u < 20 ? 10 : 12, halo = ' stroke="#ffffff" stroke-width="3" paint-order="stroke"';
  const out = [`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${W} ${H}" width="${W}" height="${H}" font-family="Arial, Helvetica, sans-serif">`,
    `<rect x="0" y="0" width="${W}" height="${H}" fill="#ffffff"/>`];
  for (let x = xmin; x <= xmax; x++) out.push(`<line x1="${X(x)}" y1="${Y(ymin)}" x2="${X(x)}" y2="${Y(ymax)}" stroke="#C9CED3" stroke-width="${x % 5 === 0 ? 1 : 0.7}"/>`);
  for (let y = ymin; y <= ymax; y++) out.push(`<line x1="${X(xmin)}" y1="${Y(y)}" x2="${X(xmax)}" y2="${Y(y)}" stroke="#C9CED3" stroke-width="${y % 5 === 0 ? 1 : 0.7}"/>`);
  const hasX = ymin <= 0 && ymax >= 0, hasY = xmin <= 0 && xmax >= 0, ax = hasY ? X(0) : X(xmin), ay = hasX ? Y(0) : Y(ymin);
  const axes = [], labels = [];
  if (g.axes !== false) {
    axes.push(`<line x1="${X(xmin)}" y1="${ay}" x2="${X(xmax) + 10}" y2="${ay}" stroke="#111" stroke-width="1.6"/>`,
      `<path d="M${X(xmax) + 10} ${ay} l-7 -4 v8 z" fill="#111"/>`,
      `<line x1="${ax}" y1="${Y(ymin)}" x2="${ax}" y2="${Y(ymax) - 10}" stroke="#111" stroke-width="1.6"/>`,
      `<path d="M${ax} ${Y(ymax) - 10} l-4 7 h8 z" fill="#111"/>`,
      `<text x="${X(xmax) + 12}" y="${ay + 14}" font-size="${fs + 1}" font-style="italic">${escX(g.xlabel || "x")}</text>`,
      `<text x="${ax + 6}" y="${Y(ymax) - 12}" font-size="${fs + 1}" font-style="italic">${escX(g.ylabel || "y")}</text>`);
    for (let x = xmin; x <= xmax; x++) if (x !== 0 && x % step === 0) axes.push(`<text x="${X(x)}" y="${ay + fs + 3}" font-size="${fs}" text-anchor="middle"${halo}>${x}</text>`);
    for (let y = ymin; y <= ymax; y++) if (y !== 0 && y % step === 0) axes.push(`<text x="${ax - 5}" y="${Y(y) + fs / 3}" font-size="${fs}" text-anchor="end"${halo}>${y}</text>`);
    if (hasX && hasY) axes.push(`<text x="${ax - 5}" y="${ay + fs + 3}" font-size="${fs}" text-anchor="end"${halo}>0</text>`);
  }
  const pts = (L) => (Array.isArray(L) ? L : []).slice(0, 40).map((p) => [num(p && p.x), num(p && p.y)]);
  (Array.isArray(g.segments) ? g.segments : []).slice(0, 12).forEach((s) => {
    if (!s) return;
    const x1 = X(s.x1), y1 = Y(s.y1), x2 = X(s.x2), y2 = Y(s.y2);
    out.push(`<line x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}" stroke="#333" stroke-width="1.8"${s.dashed ? ' stroke-dasharray="6 4"' : ""}/>`);
    if (s.label) { const [lx, ly] = x2 >= x1 ? [x2, y2] : [x1, y1];
      out.push(`<text x="${lx + 4}" y="${ly - 4}" font-size="${fs + 1}" font-weight="bold" fill="#333"${halo}>${escX(s.label)}</text>`); }
  });
  (Array.isArray(g.shapes) ? g.shapes : []).slice(0, 8).forEach((s, i) => {
    const P = pts(s && s.points); if (P.length < 2) return;
    const d = P.map(([x, y]) => `${X(x)},${Y(y)}`).join(" ");
    out.push(P.length === 2 ? `<polyline points="${d}" fill="none" stroke="${STROKES[i % 6]}" stroke-width="2"/>`
      : `<polygon points="${d}" fill="${s.shade === false ? "none" : FILLS[i % 6]}" fill-opacity="0.85" stroke="${STROKES[i % 6]}" stroke-width="2" stroke-linejoin="round"/>`);
    if (s.label) {
      const cx = P.reduce((a, p) => a + p[0], 0) / P.length, cy = P.reduce((a, p) => a + p[1], 0) / P.length;
      labels.push(`<text x="${X(cx)}" y="${Y(cy) + fs / 3}" font-size="${fs + 2}" font-weight="bold" text-anchor="middle" fill="${STROKES[i % 6]}"${halo}>${escX(s.label)}</text>`);
    }
  });
  out.push(...axes, ...labels);                                   // axes / numbers shapes ke upar — chhupen nahi
  (Array.isArray(g.points) ? g.points : []).slice(0, 20).forEach((p) => {
    if (!p) return;
    out.push(`<circle cx="${X(p.x)}" cy="${Y(p.y)}" r="3.5" fill="#111"/>`);
    if (p.label) out.push(`<text x="${X(p.x) + 6}" y="${Y(p.y) - 6}" font-size="${fs + 1}" font-weight="bold"${halo}>${escX(p.label)}</text>`);
  });
  out.push("</svg>");
  return out.join("");
}

/* AI / teacher ka SVG — sirf shakal wale elements; script, links, images, event handlers, CSS url() sab hata do */
const SVG_TAGS = new Set(["svg", "g", "line", "rect", "circle", "ellipse", "polygon", "polyline", "path", "text", "tspan", "defs", "marker", "title", "desc", "pattern", "lineargradient", "radialgradient", "stop", "clippath", "use"]);
function cleanSvg(s) {
  s = String(s || "").trim();
  if (!/^<svg[\s>]/i.test(s) || s.length > 80000) return "";
  s = s.replace(/<!--[\s\S]*?-->/g, "").replace(/<!\[CDATA\[[\s\S]*?\]\]>/g, "").replace(/<!(DOCTYPE|ENTITY)[^>]*>/gi, "")
    .replace(/<(script|style|foreignObject|iframe|image|a)\b[\s\S]*?<\/\1\s*>/gi, "").replace(/<(script|style|foreignObject|iframe|image|a)\b[^>]*\/?>/gi, "");
  let bad = false;
  s = s.replace(/<\/?([a-zA-Z][\w:-]*)([^>]*)>/g, (tag, name, attrs) => {
    if (!SVG_TAGS.has(name.toLowerCase())) { bad = bad || /^\w/.test(name); return ""; }
    const clean = attrs.replace(/\s(on\w+|style)\s*=\s*("[^"]*"|'[^']*'|[^\s>]+)/gi, "")
      .replace(/\s((?:xlink:)?href)\s*=\s*("[^"]*"|'[^']*'|[^\s>]+)/gi, (all, k, v) => (/^["']?#/.test(v) ? all : ""))
      .replace(/url\(\s*(?!["']?#)[^)]*\)/gi, "none");
    return `<${tag[1] === "/" ? "/" : ""}${name}${tag[1] === "/" ? "" : clean}>`;
  });
  if (!/xmlns=/.test(s.slice(0, 300))) s = s.replace(/^<svg/i, '<svg xmlns="http://www.w3.org/2000/svg"');
  return /<\/svg>\s*$/i.test(s) ? s : "";
}

/* grid spec — sirf numbers / chhote labels rakho */
function cleanGrid(g) {
  g = g && typeof g === "object" ? g : {};
  const n = (v) => Math.round(num(v) * 100) / 100, lab = (v) => String(v == null ? "" : v).slice(0, 30), arr = (v, k) => (Array.isArray(v) ? v.slice(0, k) : []);
  const xmin = clamp(Math.floor(num(g.xmin, -6)), -30, 29), ymin = clamp(Math.floor(num(g.ymin, -6)), -30, 29);
  return { xmin, xmax: clamp(Math.ceil(num(g.xmax, 6)), xmin + 1, 30), ymin, ymax: clamp(Math.ceil(num(g.ymax, 6)), ymin + 1, 30),
    shapes: arr(g.shapes, 8).filter((s) => s && Array.isArray(s.points) && s.points.length >= 2).map((s) => ({ label: lab(s.label), points: arr(s.points, 40).map((p) => ({ x: n(p && p.x), y: n(p && p.y) })) })),
    points: arr(g.points, 20).filter(Boolean).map((p) => ({ label: lab(p.label), x: n(p.x), y: n(p.y) })),
    segments: arr(g.segments, 12).filter(Boolean).map((s) => ({ label: lab(s.label), x1: n(s.x1), y1: n(s.y1), x2: n(s.x2), y2: n(s.y2), dashed: !!s.dashed })) };
}
/* sawal ke diagram object se SVG (AI ka jawab) */
function renderDiagram(d) {
  if (!d || typeof d !== "object") return "";
  if (d.kind === "grid") return gridSvg(cleanGrid(d.grid));
  if (d.kind === "svg") return cleanSvg(d.svg);
  return "";
}
/* AI marking ke liye — grid ke asal coordinates (SVG se zyada saaf) */
function diagramText(d) {
  if (!d || typeof d !== "object" || d.kind === "none") return "";
  if (d.kind === "grid") {
    const g = d.grid || {};
    return `Coordinate grid x ${g.xmin}..${g.xmax}, y ${g.ymin}..${g.ymax}. ` +
      (g.shapes || []).map((s) => `Shape ${s.label || ""}: ${(s.points || []).map((p) => `(${p.x}, ${p.y})`).join(" ")}`).join("; ") +
      ((g.points || []).length ? "; Points: " + g.points.map((p) => `${p.label || ""}(${p.x}, ${p.y})`).join(" ") : "") +
      ((g.segments || []).length ? "; Lines: " + g.segments.map((s) => `${s.label || ""} (${s.x1}, ${s.y1})–(${s.x2}, ${s.y2})`).join(" ") : "");
  }
  return d.kind === "svg" ? "Diagram (SVG source): " + cleanSvg(d.svg).slice(0, 3000) : "";
}

/* v136b: grid ki saadi likhai (AI aur editor dono yehi likhte hain) → grid spec
   "x: -6 to 6" · "y: -6 to 6" · "A: (1, 1) (4, 1) (1, 3)" (shape) · "P: (2, 4)" (point) · "y = x: (-6, -6) (6, 6) line dashed" (line) */
function parseGridText(t) {
  const g = { xmin: -6, xmax: 6, ymin: -6, ymax: 6, shapes: [], points: [], segments: [] };
  String(t || "").split(/\n+/).map((l) => l.replace(/[←#].*$/, "").trim()).filter(Boolean).slice(0, 60).forEach((l) => {
    const r = /^([xy])\s*:\s*(-?\d+)\s*(?:to|\.\.|,|–|—)\s*(-?\d+)/i.exec(l) || /^([xy])\s*:\s*(-?\d+)\s*-\s*(-?\d+)/i.exec(l);
    if (r) { const a = +r[2], b = +r[3]; if (r[1].toLowerCase() === "x") { g.xmin = Math.min(a, b); g.xmax = Math.max(a, b); } else { g.ymin = Math.min(a, b); g.ymax = Math.max(a, b); } return; }
    const P = [...l.matchAll(/\(\s*(-?\d+(?:\.\d+)?)\s*,\s*(-?\d+(?:\.\d+)?)\s*\)/g)].map((m) => ({ x: +m[1], y: +m[2] }));
    if (!P.length) return;
    const c = l.indexOf(":"), head = c > 0 && !l.slice(0, c).includes("(") ? l.slice(0, c).trim().slice(0, 30) : "", tail = l.slice(l.lastIndexOf(")") + 1);
    if (P.length === 1) g.points.push({ label: head, ...P[0] });
    else if (P.length === 2 && !/\bshape\b/i.test(tail)) g.segments.push({ label: head, x1: P[0].x, y1: P[0].y, x2: P[1].x, y2: P[1].y, dashed: /dashed/i.test(tail) });
    else g.shapes.push({ label: head, points: P });
  });
  return g;
}
/* sawal ka diagram: AI object (d) → ya editor ka grid spec → ya editor ka SVG. Wapas {svg, grid, info} */
function buildDiagram(d, grid, svg, info) {
  if (d && typeof d === "object") { const s = renderDiagram(d); return { svg: s, grid: s && d.kind === "grid" ? cleanGrid(d.grid) : null, info: s ? diagramText(d).slice(0, 4000) : "" }; }
  if (typeof grid === "string" && grid.trim()) grid = parseGridText(grid);
  if (grid && typeof grid === "object") { const G = cleanGrid(grid); return { svg: gridSvg(G), grid: G, info: diagramText({ kind: "grid", grid: G }).slice(0, 4000) }; }
  const s = cleanSvg(svg);
  return { svg: s, grid: null, info: s ? String(info || "Diagram (SVG source): " + s.slice(0, 3000)).slice(0, 4000) : "" };
}

module.exports = { gridSvg, cleanSvg, cleanGrid, parseGridText, renderDiagram, diagramText, buildDiagram };
