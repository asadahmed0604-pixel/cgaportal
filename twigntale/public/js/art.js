/* Har product ka apna artwork — slug se deterministic SVG banta hai.
   Isliye site ko kisi bhi image CDN ki zaroorat nahi. */

function hash(str) {
  let h = 2166136261;
  for (let i = 0; i < String(str).length; i++) {
    h ^= String(str).charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

/* mulberry32 — chhota, tez, deterministic */
function rng(seed) {
  let a = hash(seed);
  return () => {
    a |= 0; a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const shapes = {
  leaf: (s) => `<path d="M0,${-s} C${s * .78},${-s * .45} ${s * .78},${s * .45} 0,${s}
    C${-s * .78},${s * .45} ${-s * .78},${-s * .45} 0,${-s} Z"/>
    <path d="M0,${-s * .86} L0,${s * .86}" stroke-width="${s * .06}" fill="none" stroke="currentColor" opacity=".45"/>`,

  bloom: (s) => {
    let d = '';
    for (let i = 0; i < 6; i++) {
      const a = (i * 60 * Math.PI) / 180;
      const x = Math.cos(a) * s * .52, y = Math.sin(a) * s * .52;
      d += `<ellipse cx="${x.toFixed(2)}" cy="${y.toFixed(2)}" rx="${s * .42}" ry="${s * .24}"
            transform="rotate(${i * 60} ${x.toFixed(2)} ${y.toFixed(2)})"/>`;
    }
    return d + `<circle r="${s * .22}" opacity=".55"/>`;
  },

  fern: (s) => {
    let d = `<path d="M0,${s} L0,${-s}" stroke="currentColor" stroke-width="${s * .07}" fill="none"/>`;
    const n = 9;
    for (let i = 0; i < n; i++) {
      const y = s - (i * 2 * s) / n;
      const len = s * .46 * (1 - i / (n + 2));
      d += `<ellipse cx="${(len * .6).toFixed(2)}" cy="${y.toFixed(2)}" rx="${len}" ry="${(len * .34).toFixed(2)}" transform="rotate(-28 ${(len * .6).toFixed(2)} ${y.toFixed(2)})"/>`;
      d += `<ellipse cx="${(-len * .6).toFixed(2)}" cy="${y.toFixed(2)}" rx="${len}" ry="${(len * .34).toFixed(2)}" transform="rotate(28 ${(-len * .6).toFixed(2)} ${y.toFixed(2)})"/>`;
    }
    return d;
  },

  berry: (s) => {
    let d = `<path d="M0,${s} C${s * .2},${s * .3} ${-s * .2},${-s * .3} 0,${-s}" stroke="currentColor" stroke-width="${s * .07}" fill="none"/>`;
    const pts = [[-.42, -.55, .26], [.4, -.3, .3], [-.3, .05, .24], [.34, .3, .22], [-.12, .62, .2]];
    for (const [x, y, r] of pts) d += `<circle cx="${(x * s).toFixed(2)}" cy="${(y * s).toFixed(2)}" r="${(r * s).toFixed(2)}"/>`;
    return d;
  },

  wave: (s) => {
    let d = '';
    for (let i = 1; i <= 4; i++) {
      const r = (s * i) / 4.2;
      d += `<path d="M${-r},0 A${r},${r * .62} 0 0 1 ${r},0" fill="none" stroke="currentColor" stroke-width="${s * .075}" opacity="${.85 - i * .12}"/>`;
    }
    return d + `<circle r="${s * .1}" opacity=".6"/>`;
  },
};

/* Product artwork — motif, hue aur seed se. variant se chhoti tabdeeli aati hai (gallery ke liye). */
export function productArt(motif = 'leaf', hue = 150, seed = 'tnt', variant = 0, opts = {}) {
  const r = rng(seed + ':' + variant);
  const shape = shapes[motif] || shapes.leaf;
  const size = 400;
  const id = 'a' + hash(seed + variant).toString(36);
  const h2 = (hue + 24 + variant * 12) % 360;
  const dark = opts.dark || false;
  const bg1 = `hsl(${hue} ${dark ? 22 : 38}% ${dark ? 17 : 88}%)`;
  const bg2 = `hsl(${h2} ${dark ? 26 : 46}% ${dark ? 12 : 78}%)`;
  const ink = `hsl(${hue} ${dark ? 30 : 38}% ${dark ? 62 : 30}%)`;

  let body = '';
  const count = 3 + Math.floor(r() * 3);
  for (let i = 0; i < count; i++) {
    const x = 40 + r() * (size - 80);
    const y = 40 + r() * (size - 80);
    const sc = .32 + r() * .5;
    const rot = r() * 360;
    const op = .16 + r() * .22;
    body += `<g transform="translate(${x.toFixed(1)} ${y.toFixed(1)}) rotate(${rot.toFixed(1)}) scale(${sc.toFixed(2)})"
              fill="${ink}" color="${ink}" opacity="${op.toFixed(2)}">${shape(110)}</g>`;
  }
  /* markazi shakal — thori bari aur gehri */
  const cx = size / 2 + (r() - .5) * 40;
  const cy = size / 2 + (r() - .5) * 40;
  body += `<g transform="translate(${cx.toFixed(1)} ${cy.toFixed(1)}) rotate(${(r() * 40 - 20).toFixed(1)})"
            fill="${ink}" color="${ink}" opacity=".72">${shape(112)}</g>`;

  return `<svg viewBox="0 0 ${size} ${size}" xmlns="http://www.w3.org/2000/svg" role="img" aria-label="${(opts.label || 'Product artwork').replace(/"/g, '')}" preserveAspectRatio="xMidYMid slice">
    <defs>
      <linearGradient id="${id}" x1="0" y1="0" x2="1" y2="1">
        <stop offset="0" stop-color="${bg1}"/><stop offset="1" stop-color="${bg2}"/>
      </linearGradient>
      <radialGradient id="${id}g" cx=".3" cy=".22" r=".8">
        <stop offset="0" stop-color="#fff" stop-opacity="${dark ? .07 : .5}"/>
        <stop offset="1" stop-color="#fff" stop-opacity="0"/>
      </radialGradient>
    </defs>
    <rect width="${size}" height="${size}" fill="url(#${id})"/>
    ${body}
    <rect width="${size}" height="${size}" fill="url(#${id}g)"/>
  </svg>`;
}

/* Hero ka bara artwork — neeche se ugte hue stems, halki si hawa ke saath.
   Note: animation hamesha andar wale <g> par jati hai, warna CSS transform
   bahar wale ka translate/scale mita deta hai. */
export function heroArt(dark = false) {
  const r = rng('twig-n-tale-hero');
  const W = 440, H = 620, ground = 596;
  const stems = [];
  for (let i = 0; i < 11; i++) {
    const x = 18 + i * 40 + r() * 16;
    const scale = .42 + r() * .5;
    const lift = 150 * scale * .92;
    const motif = ['fern', 'leaf', 'berry', 'bloom', 'fern'][Math.floor(r() * 5)];
    const hue = 110 + r() * 80;
    const light = dark ? 52 + r() * 14 : 26 + r() * 16;
    stems.push(`<g transform="translate(${x.toFixed(0)} ${(ground - lift).toFixed(0)}) scale(${scale.toFixed(2)})">
      <g style="animation: sway ${(5 + r() * 4).toFixed(1)}s ease-in-out ${(r() * 3).toFixed(1)}s infinite alternate"
         fill="hsl(${hue.toFixed(0)} ${dark ? 26 : 34}% ${light.toFixed(0)}%)"
         color="hsl(${hue.toFixed(0)} ${dark ? 26 : 34}% ${light.toFixed(0)}%)"
         opacity="${(.4 + r() * .45).toFixed(2)}">${(shapes[motif] || shapes.leaf)(150)}</g></g>`);
  }
  return `<svg viewBox="0 0 ${W} ${H}" xmlns="http://www.w3.org/2000/svg" aria-hidden="true" preserveAspectRatio="xMidYMid slice">
    <defs>
      <linearGradient id="heroG" x1="0" y1="0" x2=".6" y2="1">
        <stop offset="0" stop-color="hsl(150 ${dark ? 20 : 36}% ${dark ? 16 : 90}%)"/>
        <stop offset="1" stop-color="hsl(28 ${dark ? 24 : 46}% ${dark ? 12 : 83}%)"/>
      </linearGradient>
      <radialGradient id="heroS" cx=".28" cy=".18" r=".75">
        <stop offset="0" stop-color="#fff" stop-opacity="${dark ? .06 : .55}"/>
        <stop offset="1" stop-color="#fff" stop-opacity="0"/>
      </radialGradient>
      <style>
        #heroStems g { transform-box: fill-box; transform-origin: bottom center; }
        @keyframes sway { from { transform: rotate(-2.5deg); } to { transform: rotate(2.5deg); } }
        @media (prefers-reduced-motion: reduce) { #heroStems g { animation: none !important; } }
      </style>
    </defs>
    <rect width="${W}" height="${H}" fill="url(#heroG)"/>
    <circle cx="330" cy="140" r="86" fill="hsl(38 ${dark ? 30 : 58}% ${dark ? 26 : 78}%)" opacity=".55"/>
    <g id="heroStems">${stems.join('')}</g>
    <ellipse cx="${W / 2}" cy="${ground + 14}" rx="270" ry="54" fill="hsl(150 ${dark ? 18 : 24}% ${dark ? 9 : 74}%)" opacity=".6"/>
    <rect width="${W}" height="${H}" fill="url(#heroS)"/>
  </svg>`;
}

/* ---- icons ---- */
const ic = (p, extra = '') => `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7"
  stroke-linecap="round" stroke-linejoin="round" width="20" height="20" ${extra}>${p}</svg>`;

export const icons = {
  logo: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round">
    <path d="M12 21V8"/><path d="M12 12C12 8 9 5 5 4c0 4 3 7 7 8Z" fill="currentColor" fill-opacity=".18"/>
    <path d="M12 15c0-3.5 2.6-6.2 6.2-7-.2 3.7-2.7 6.4-6.2 7Z" fill="currentColor" fill-opacity=".18"/></svg>`,
  cart: ic('<circle cx="9" cy="20" r="1.4"/><circle cx="18" cy="20" r="1.4"/><path d="M2 3h2.2l2.4 12.4a2 2 0 0 0 2 1.6h8.6a2 2 0 0 0 2-1.6L21 7H5"/>'),
  search: ic('<circle cx="11" cy="11" r="7"/><path d="m20 20-3.5-3.5"/>'),
  user: ic('<circle cx="12" cy="8" r="3.6"/><path d="M4.5 20a7.5 7.5 0 0 1 15 0"/>'),
  heart: ic('<path d="M12 20s-7.5-4.6-7.5-9.4A4.1 4.1 0 0 1 12 7.8a4.1 4.1 0 0 1 7.5 2.8C19.5 15.4 12 20 12 20Z"/>', 'width="18" height="18"'),
  star: `<svg viewBox="0 0 24 24" fill="currentColor"><path d="m12 2.6 2.9 6 6.6.9-4.8 4.6 1.2 6.5L12 17.5 6.1 20.6l1.2-6.5-4.8-4.6 6.6-.9Z"/></svg>`,
  menu: ic('<path d="M4 7h16M4 12h16M4 17h16"/>'),
  x: ic('<path d="M6 6l12 12M18 6 6 18"/>'),
  sun: ic('<circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4"/>'),
  moon: ic('<path d="M20 14.5A8.5 8.5 0 0 1 9.5 4a8.5 8.5 0 1 0 10.5 10.5Z"/>'),
  arrow: ic('<path d="M5 12h14M13 6l6 6-6 6"/>'),
  check: ic('<path d="m5 13 4.5 4.5L19 7"/>'),
  trash: ic('<path d="M4 7h16M10 7V5h4v2M6 7l1 13h10l1-13"/>', 'width="17" height="17"'),
  box: ic('<path d="M3 8.5 12 4l9 4.5v7L12 20l-9-4.5v-7Z"/><path d="M3 8.5 12 13l9-4.5M12 13v7"/>'),
  truck: ic('<path d="M2 7h11v9H2zM13 10h4l4 3.5V16h-8z"/><circle cx="6.5" cy="18" r="1.6"/><circle cx="17" cy="18" r="1.6"/>'),
  leafSmall: ic('<path d="M4 20c0-8 6-14 16-14 0 10-6 14-16 14Z"/><path d="M4 20 14 10"/>'),
  spark: ic('<path d="M12 3v4M12 17v4M3 12h4M17 12h4M6 6l2.5 2.5M15.5 15.5 18 18M18 6l-2.5 2.5M8.5 15.5 6 18"/>'),
};
