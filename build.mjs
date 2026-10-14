#!/usr/bin/env node
/**
 * Generates this folder (a framework-free static site) from the Angular
 * prerendered output in ../dist/fluidity/browser.
 *
 *   node build.mjs
 *
 * Steps
 *   1. Strip the Angular runtime: main-*.js, modulepreloads, framework attrs.
 *   2. Rename Angular view-encapsulation attributes (_ngcontent-* and _nghost-*)
 *      to neutral data-sc-* / data-sh-* scopes. Same specificity, no framework.
 *   3. Stamp every static text node / translatable attribute with data-i18n
 *      keys so plain JS can switch FR/EN/AR at runtime.
 *   4. Inject the scroll-reveal stagger delays that Angular computed in the
 *      templates ([appRevealDelay]) as inline --reveal-delay styles.
 *   5. Wire up site.css + js/i18n.js + js/main.js.
 *   6. Copy stylesheet, fonts, images, robots.txt, sitemap.xml.
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const SRC = path.resolve(HERE, '../dist/fluidity/browser');
const I18N_DIR = path.resolve(HERE, '../src/app/core/i18n');

if (!fs.existsSync(SRC)) {
  console.error(`[build] Angular output not found at ${SRC} — run "npm run build" first.`);
  process.exit(1);
}

// ---------------------------------------------------------------------------
// Page table (seo mirrors each page's SeoService config in the Angular sources)
// ---------------------------------------------------------------------------
const PAGES = [
  { src: 'index.html', out: 'index.html', page: 'home',
    seo: { titleKey: 'home.hero.seoTitle', descKey: 'home.hero.subtitle', path: '/' } },
  { src: '404.html', out: '404.html', page: '404',
    seo: { titleKey: 'notFound.title', descKey: 'notFound.text', path: '/404' } },
  { src: 'a-propos/index.html', out: 'a-propos/index.html', page: 'a-propos',
    seo: { titleKey: 'aboutPage.hero.title', descKey: 'aboutPage.hero.subtitle', path: '/a-propos' } },
  { src: 'services/index.html', out: 'services/index.html', page: 'services',
    seo: { titleKey: 'servicesPage.hero.title', descKey: 'servicesPage.hero.subtitle', path: '/services' } },
  { src: 'solutions/index.html', out: 'solutions/index.html', page: 'solutions',
    seo: { titleKey: 'solutionsPage.hero.title', descKey: 'solutionsPage.hero.subtitle', path: '/solutions' } },
  { src: 'projets/index.html', out: 'projets/index.html', page: 'projets',
    seo: { titleKey: 'projectsPage.hero.title', descKey: 'projectsPage.hero.subtitle', path: '/projets' } },
  { src: 'contact/index.html', out: 'contact/index.html', page: 'contact',
    seo: { titleKey: 'contact.hero.title', descKey: 'contact.hero.subtitle', path: '/contact' } },
  { src: 'mentions-legales/index.html', out: 'mentions-legales/index.html', page: 'mentions-legales',
    seo: { titleKey: 'legalPage.mentions.title', descKey: 'legalPage.mentions.intro', path: '/mentions-legales' } },
  { src: 'politique-confidentialite/index.html', out: 'politique-confidentialite/index.html', page: 'politique-confidentialite',
    seo: { titleKey: 'legalPage.privacy.title', descKey: 'legalPage.privacy.intro', path: '/politique-confidentialite' } },
];

// ---------------------------------------------------------------------------
// Scroll-reveal stagger rules ([appRevealDelay] expressions from the templates)
// delay = a + (i % m) * b   (m = 0 → no modulo; i = index among matching siblings)
// ---------------------------------------------------------------------------
const DEFAULT_RULES = [
  { sel: '.page-hero h1', a: 80 },
  { sel: '.page-hero .lede', a: 160 },
];
const REVEAL_RULES = {
  home: [
    { sel: '.hero-title .line', a: 60, b: 80 },
    { sel: '.hero-sub', a: 220 },
    { sel: '.hero-ctas', a: 300 },
    { sel: '.support', a: 120 },
    { sel: '#solutions .card', b: 90 },
    { sel: '#projets .card', b: 90, m: 3 },
    { sel: '#pourquoi .item', b: 80 },
    { sel: '#technologies .cat', b: 80 },
    { sel: '#temoignages .quote-card', b: 90 },
    { sel: '.value-card', b: 80 },
  ],
  services: [
    { sel: '.grid .card', b: 80, m: 3 },
    { sel: '.mini-process li', b: 60 },
  ],
  solutions: [{ sel: '.solution', a: 80 }],
  projets: [{ sel: '.card', b: 90, m: 2 }],
  about: [
    { sel: '.story-aside', a: 140 },
    { sel: '.value-card', b: 80 },
    { sel: '.why-item', b: 80 },
  ],
  contact: [{ sel: '.info-col', a: 120 }],
  'mentions-legales': [{ sel: '.updated', a: 80 }],
  'politique-confidentialite': [{ sel: '.updated', a: 80 }],
  404: [
    { sel: 'h1', a: 80 },
    { sel: '.text', a: 160 },
    { sel: '.btn-lg', a: 240 },
  ],
};

// ---------------------------------------------------------------------------
// i18n stamping
// ---------------------------------------------------------------------------
const TEXT_ATTRS = ['aria-label', 'placeholder', 'title', 'alt'];
// Never translate: dynamic counters/labels the JS layer owns, brand year, codes.
const EXCLUDE_TEXT_CLASSES = new Set([
  'number', 'suffix', 'card-num', 'count', 'panel-index', 'node-num',
  'step-num', 'num', 'copyright', 'code',
]);
const RAW_TEXT_TAGS = new Set(['script', 'style']);
const VOID_TAGS = new Set([
  'area', 'base', 'br', 'col', 'embed', 'hr', 'img', 'input', 'link', 'meta',
  'param', 'source', 'track', 'wbr',
]);

const norm = (s) =>
  s
    .replace(/&nbsp;/g, ' ')
    .replace(/&#160;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;|&#x27;/g, "'")
    .replace(/&#(\d+);/g, (_, n) => String.fromCodePoint(Number(n)))
    .replace(/&#x([0-9a-f]+);/gi, (_, n) => String.fromCodePoint(parseInt(n, 16)))
    .replace(/[\s\u00A0\u202F\u2009]+/g, ' ')
    .trim();

function flatten(obj, prefix = '', out = new Map()) {
  for (const [k, v] of Object.entries(obj)) {
    const key = prefix ? `${prefix}.${k}` : k;
    if (typeof v === 'string') out.set(key, v);
    else if (v && typeof v === 'object') flatten(v, key, out);
  }
  return out;
}

// ---------------------------------------------------------------------------
// Quote-aware start-tag parser. Returns absolute indexes into `html`.
// ---------------------------------------------------------------------------
function parseStartTag(html, lt) {
  let i = lt + 1;
  const nameStart = i;
  while (i < html.length && !/[\s/>]/.test(html[i])) i++;
  const name = html.slice(nameStart, i);
  const attrs = [];
  let end = -1;
  while (i < html.length) {
    while (i < html.length && /\s/.test(html[i])) i++;
    if (html[i] === '>') { end = i + 1; break; }
    if (html[i] === '/') { i++; continue; }
    const anStart = i;
    while (i < html.length && !/[\s=/>]/.test(html[i])) i++;
    const attrName = html.slice(anStart, i).toLowerCase();
    if (!attrName) { i++; continue; }
    while (i < html.length && /\s/.test(html[i])) i++;
    let value = '';
    let vStart = -1;
    if (html[i] === '=') {
      i++;
      while (i < html.length && /\s/.test(html[i])) i++;
      const q = html[i];
      if (q === '"' || q === "'") {
        i++;
        vStart = i;
        const close = html.indexOf(q, i);
        value = html.slice(i, close === -1 ? html.length : close);
        i = close === -1 ? html.length : close + 1;
      } else {
        const vs = i;
        while (i < html.length && !/[\s>]/.test(html[i])) i++;
        value = html.slice(vs, i);
      }
    }
    attrs.push({ name: attrName, value, vStart });
  }
  if (end === -1) throw new Error(`Unterminated tag at ${lt}: ${html.slice(lt, lt + 80)}`);
  return { end, name: name.toLowerCase(), attrs };
}

function matchesCompound(compound, frame) {
  if (compound.tag && compound.tag !== frame.name) return false;
  if (compound.id && compound.id !== frame.id) return false;
  for (const cls of compound.classes) if (!frame.classes.has(cls)) return false;
  return true;
}

function parseSelector(sel) {
  return sel.trim().split(/\s+/).map((part) => {
    const compound = { tag: null, id: null, classes: [] };
    const re = /([a-zA-Z][\w-]*)|#([\w-]+)|\.([\w-]+)/g;
    let m;
    while ((m = re.exec(part)) !== null) {
      if (m[1]) compound.tag = m[1].toLowerCase();
      else if (m[2]) compound.id = m[2];
      else compound.classes.push(m[3]);
    }
    return compound;
  });
}

function selectorMatches(compounds, idx, frame) {
  if (!matchesCompound(compounds[idx], frame)) return false;
  if (idx === 0) return true;
  let anc = frame.parent;
  while (anc) {
    if (selectorMatches(compounds, idx - 1, anc)) return true;
    anc = anc.parent;
  }
  return false;
}

// ---------------------------------------------------------------------------
// Scan + stamp
// ---------------------------------------------------------------------------
function transformHtml(html, { page, frIndex, stats }) {
  const rules = [...(REVEAL_RULES[page] || []), ...DEFAULT_RULES].map((r) => ({
    ...r, compounds: parseSelector(r.sel), m: r.m || 0, a: r.a || 0, b: r.b || 0,
  }));

  const edits = []; // {pos, str}
  const stack = [];

  // Attribute insertions go immediately BEFORE the tag's closing '>'.
  const attrPos = (frame) =>
    html[frame.tagEnd - 2] === '/' ? frame.tagEnd - 2 : frame.tagEnd - 1;

  const pushText = (text) => {
    if (!text) return;
    const top = stack[stack.length - 1];
    if (top && !top.rawText) top.textParts.push(text);
  };

  function stampAttrs(frame) {
    const pieces = [];
    for (const attrName of TEXT_ATTRS) {
      const a = frame.attrs.find((x) => x.name === attrName);
      if (!a || !a.value || a.vStart === -1) continue;
      const value = norm(a.value);
      if (!value) continue;
      const key = frIndex.get(value);
      if (key) pieces.push(`${attrName}:${key}`);
    }
    if (pieces.length) edits.push({ pos: attrPos(frame), str: ` data-i18n-attr="${pieces.join(';')}"` });
  }

  function finalizeFrame(frame) {
    if (!frame) return;
    // reveal stagger
    if (frame.classes.has('reveal') && frame.parent) {
      const rule = rules.find((r) => selectorMatches(r.compounds, r.compounds.length - 1, frame));
      if (rule) {
        const siblings = frame.parent.children || [];
        let idx = 0;
        for (let k = 0; k < frame.siblingIndex; k++) {
          if (selectorMatches(rule.compounds, rule.compounds.length - 1, siblings[k])) idx++;
        }
        const delay = rule.a + (rule.m ? idx % rule.m : idx) * rule.b;
        if (delay > 0) {
          const styleAttr = frame.attrs.find((x) => x.name === 'style');
          const decl = `--reveal-delay:${delay}ms;`;
          if (styleAttr && styleAttr.vStart !== -1) edits.push({ pos: styleAttr.vStart, str: decl });
          else edits.push({ pos: attrPos(frame), str: ` style="${decl}"` });
        }
      }
    }
    // leaf-text stamping
    if (!frame.hasElemChild && frame.textParts.length) {
      const value = norm(frame.textParts.join(''));
      let excluded = false;
      for (const c of EXCLUDE_TEXT_CLASSES) if (frame.classes.has(c)) { excluded = true; break; }
      if (value && !excluded && frame.name !== 'title') {
        let key = frIndex.get(value);
        let prefix = '';
        let suffix = '';
        if (!key) {
          // Angular merges adjacent literal text into one text node
          // (e.g. "{{ t('contact.form.name') }} *" → "Nom complet *"), so
          // fall back to longest dict value + punctuation-only affix.
          const affixOk = (s) => s.length <= 12 && /^[\s*•·:;,.!?'’»"”)\]\%…-]+$/.test(s);
          let best = null;
          for (const [dv, dk] of frIndex) {
            if (!dv || dv.length >= value.length) continue;
            if (value.startsWith(dv + ' ')) {
              const suf = value.slice(dv.length);
              if (affixOk(suf) && (!best || dv.length > best.len)) best = { dk, len: dv.length, prefix: '', suffix: suf };
            } else if (value.endsWith(' ' + dv)) {
              const pre = value.slice(0, value.length - dv.length);
              if (affixOk(pre) && (!best || dv.length > best.len)) best = { dk, len: dv.length, prefix: pre, suffix: '' };
            }
          }
          if (best) { key = best.dk; prefix = best.prefix; suffix = best.suffix; }
        }
        if (key) {
          let str = ` data-i18n="${key}"`;
          if (prefix) str += ` data-i18n-prefix="${prefix}"`;
          if (suffix) str += ` data-i18n-suffix="${suffix}"`;
          edits.push({ pos: attrPos(frame), str });
          stats.stamped++;
          stats.leafTotal++;
        } else if (value.length > 1) {
          stats.leafTotal++;
          stats.unstamped.push(`<${frame.name}> "${value.slice(0, 70)}"`);
        }
      }
    }
    // attribute stamping (element attrs only; void elements handled at scan time)
    stampAttrs(frame);
  }

  let i = 0;
  while (i < html.length) {
    const lt = html.indexOf('<', i);
    if (lt === -1) { pushText(html.slice(i)); break; }
    if (lt > i) pushText(html.slice(i, lt));

    if (html.startsWith('<!--', lt)) {
      const close = html.indexOf('-->', lt + 4);
      i = close === -1 ? html.length : close + 3;
      continue;
    }
    if (html.startsWith('<!', lt) || html.startsWith('<?', lt)) {
      const close = html.indexOf('>', lt);
      i = close === -1 ? html.length : close + 1;
      continue;
    }
    if (html.startsWith('</', lt)) {
      const gt = html.indexOf('>', lt);
      const name = html.slice(lt + 2, gt === -1 ? html.length : gt).trim().toLowerCase();
      for (let s = stack.length - 1; s >= 0; s--) {
        if (stack[s].name === name) {
          finalizeFrame(stack[s]);
          stack.length = s;
          break;
        }
      }
      i = gt === -1 ? html.length : gt + 1;
      continue;
    }

    const tag = parseStartTag(html, lt);
    const selfClosing = html[tag.end - 2] === '/';
    const rawText = RAW_TEXT_TAGS.has(tag.name);

    if (rawText) {
      const closeRe = new RegExp(`</${tag.name}\\s*>`, 'i');
      const rest = html.slice(tag.end);
      const cm = closeRe.exec(rest);
      i = cm ? tag.end + cm.index + cm[0].length : html.length;
      continue;
    }

    const frame = {
      name: tag.name,
      tagStart: lt,
      tagEnd: tag.end,
      attrs: tag.attrs,
      attrMap: new Map(tag.attrs.map((a) => [a.name, a.value])),
      classes: new Set((tag.attrs.find((a) => a.name === 'class')?.value || '').split(/\s+/).filter(Boolean)),
      id: tag.attrs.find((a) => a.name === 'id')?.value || null,
      textParts: [],
      hasElemChild: false,
      parent: stack[stack.length - 1] || null,
      siblingIndex: 0,
    };

    if (VOID_TAGS.has(tag.name) || selfClosing) {
      stampAttrs(frame); // void elements never get frames — stamp attrs now
    } else {
      if (frame.parent) {
        frame.parent.hasElemChild = true;
        frame.parent.children = frame.parent.children || [];
        frame.siblingIndex = frame.parent.children.length;
        frame.parent.children.push(frame);
      }
      stack.push(frame);
    }
    i = tag.end;
  }

  // apply edits back-to-front
  edits.sort((x, y) => y.pos - x.pos);
  let out = html;
  for (const e of edits) out = out.slice(0, e.pos) + e.str + out.slice(e.pos);
  return out;
}

// ---------------------------------------------------------------------------
// Full page transformation
// ---------------------------------------------------------------------------
function transformPage(html, page, frIndex, totals) {
  // 1. strip Angular runtime
  html = html.replace(/<link rel="modulepreload"[^>]*>\s*/g, '');
  html = html.replace(/\s*<script src="main-[A-Z0-9]+\.js" type="module"><\/script>/g, '');
  html = html.replace(/\s*<link rel="preconnect" href="\/" crossorigin>/g, '');
  html = html.replace(/ data-beasties-container/g, '');
  html = html.replace(/ ng-app-id="ng"/g, '');
  html = html.replace(/ ng-version="[^"]*"/g, '');
  html = html.replace(/ ng-server-context="[^"]*"/g, '');

  // 2. neutral scope attributes (identical specificity, framework-free names)
  html = html.split('_ngcontent-ng-c').join('data-sc-');
  html = html.split('_nghost-ng-c').join('data-sh-');

  // 3. stylesheet → local copy, plain link + framework-free extras
  html = html.replace(
    /<link rel="stylesheet" href="styles-[A-Z0-9]+\.css" media="print" onload="this\.media='all'">/,
    '<link rel="stylesheet" href="styles.css">\n  <link rel="stylesheet" href="site.css">',
  );
  html = html.replace(/<noscript><link rel="stylesheet" href="styles-[A-Z0-9]+\.css"><\/noscript>/, '');

  // 4. stamp i18n keys + reveal delays
  const perPage = { stamped: 0, leafTotal: 0, unstamped: [] };
  html = transformHtml(html, { page, frIndex, stats: perPage });
  totals.stamped += perPage.stamped;
  totals.leafTotal += perPage.leafTotal;
  for (const u of perPage.unstamped) totals.unstamped.push(`${page}: ${u}`);

  // 5. page SEO config + scripts
  const seo = PAGES.find((p) => p.page === page).seo;
  const inject =
    `\n  <script>window.__PAGE_SEO=${JSON.stringify(seo)};</script>\n` +
    `  <script src="js/i18n.js" defer></script>\n` +
    `  <script src="js/main.js" defer></script>\n` +
    '</body>';
  if (!html.includes('</body>')) throw new Error('no </body>');
  html = html.replace(/<\/body>\s*<\/html>\s*$/, `${inject}</html>`);

  return html;
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------
function copyDir(rel) {
  const from = path.join(SRC, rel);
  const to = path.join(HERE, rel);
  if (!fs.existsSync(from)) return;
  fs.mkdirSync(path.dirname(to), { recursive: true });
  fs.cpSync(from, to, { recursive: true });
}

const fr = JSON.parse(fs.readFileSync(path.join(I18N_DIR, 'fr.json'), 'utf8'));
const en = JSON.parse(fs.readFileSync(path.join(I18N_DIR, 'en.json'), 'utf8'));
const ar = JSON.parse(fs.readFileSync(path.join(I18N_DIR, 'ar.json'), 'utf8'));

// value → first key index (normalized), with ambiguity report
const frIndex = new Map();
const ambiguous = [];
for (const [key, value] of flatten(fr)) {
  const v = norm(value);
  if (!v) continue;
  if (frIndex.has(v)) {
    if (frIndex.get(v) !== key) ambiguous.push(`"${v.slice(0, 40)}" → ${frIndex.get(v)} | ${key}`);
    continue;
  }
  frIndex.set(v, key);
}

const totals = { stamped: 0, leafTotal: 0, unstamped: [] };

for (const p of PAGES) {
  const srcPath = path.join(SRC, p.src);
  if (!fs.existsSync(srcPath)) { console.error(`[build] missing ${srcPath}`); process.exit(1); }
  const html = fs.readFileSync(srcPath, 'utf8');
  const out = transformPage(html, p.page, frIndex, totals);
  const outPath = path.join(HERE, p.out);
  fs.mkdirSync(path.dirname(outPath), { recursive: true });
  fs.writeFileSync(outPath, out);
  console.log(`[build] ${p.out} (${(out.length / 1024).toFixed(0)} KB)`);
}

// assets
const stylesSrc = fs.readdirSync(SRC).find((f) => /^styles-[A-Z0-9]+\.css$/.test(f));
fs.copyFileSync(path.join(SRC, stylesSrc), path.join(HERE, 'styles.css'));
console.log(`[build] styles.css (from ${stylesSrc})`);
copyDir('media');
copyDir('brand');
copyDir('images');
for (const f of ['robots.txt', 'sitemap.xml', 'favicon.svg']) {
  if (fs.existsSync(path.join(SRC, f))) fs.copyFileSync(path.join(SRC, f), path.join(HERE, f));
}

// dictionaries → js/i18n.js
fs.mkdirSync(path.join(HERE, 'js'), { recursive: true });
fs.writeFileSync(
  path.join(HERE, 'js/i18n.js'),
  '/* Language dictionaries (generated by build.mjs from src/app/core/i18n). */\n' +
    'window.__I18N = ' + JSON.stringify({ fr, en, ar }) + ';\n',
);
console.log(`[build] js/i18n.js (${(fs.statSync(path.join(HERE, 'js/i18n.js')).size / 1024).toFixed(0)} KB)`);

// report
console.log(`\n[build] i18n coverage: ${totals.stamped}/${totals.leafTotal} text nodes stamped`);
if (ambiguous.length) console.log(`[build] ambiguous FR values (first key wins): ${ambiguous.length}`);
if (totals.unstamped.length) {
  console.log(`[build] unstamped text nodes (${totals.unstamped.length}):`);
  for (const u of totals.unstamped.slice(0, 30)) console.log(`   - ${u}`);
  if (totals.unstamped.length > 30) console.log(`   … and ${totals.unstamped.length - 30} more`);
}
console.log('\n[build] done.');
