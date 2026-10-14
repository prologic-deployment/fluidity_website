/* ===========================================================================
 * main.js — the framework-free runtime for the Fluidity site.
 * Every behavior previously provided by the Angular app is reimplemented
 * here in plain DOM APIs:
 *
 *   theme toggle · language switch (FR/EN/AR) · header scroll state ·
 *   mobile menu · language dropdown · scroll reveal · stat counters ·
 *   services coverflow carousel · self-playing process stepper ·
 *   contact form validation + demo submit · flow-field background ·
 *   WebGL hero ("The Flow Engine") — the last two load on demand.
 *
 * The prerendered HTML already contains the full design, styles and content;
 * this file only re-attaches the interactivity Angular used to provide.
 * =========================================================================== */
(function () {
  'use strict';

  /* --------------------------------------------------------------------- */
  /* Helpers                                                                */
  /* --------------------------------------------------------------------- */
  const $ = (sel, root) => (root || document).querySelector(sel);
  const $$ = (sel, root) => Array.prototype.slice.call((root || document).querySelectorAll(sel));
  const reducedMotion =
    typeof window.matchMedia === 'function' &&
    window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  /** Icon markup — exact lucide paths used by the original app. */
  const ICON_PATHS = {
    sun:
      '<circle cx="12" cy="12" r="4"/><path d="M12 2v2"/><path d="M12 20v2"/>' +
      '<path d="m4.93 4.93 1.41 1.41"/><path d="m17.66 17.66 1.41 1.41"/>' +
      '<path d="M2 12h2"/><path d="M20 12h2"/>' +
      '<path d="m6.34 17.66-1.41 1.41"/><path d="m19.07 4.93-1.41 1.41"/>',
    x: '<path d="M18 6 6 18"/><path d="m6 6 12 12"/>',
    play: '<path d="M5 5a2 2 0 0 1 3.008-1.728l11.997 6.998a2 2 0 0 1 .003 3.458l-12 7A2 2 0 0 1 5 19z"/>',
    pause:
      '<rect x="14" y="4" width="4" height="16" rx="1" ry="1"/>' +
      '<rect x="6" y="4" width="4" height="16" rx="1" ry="1"/>',
    check: '<path d="M20 6 9 17l-5-5"/>',
    alert:
      '<circle cx="12" cy="12" r="10"/><line x1="12" x2="12" y1="8" y2="12"/>' +
      '<line x1="12" x2="12.01" y1="16" y2="16"/>',
    loader: '<path d="M21 12a9 9 0 1 1-6.219-8.56"/>',
  };

  function iconSvg(name, size, cls) {
    return (
      '<svg xmlns="http://www.w3.org/2000/svg" width="' + size + '" height="' + size +
      '" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" ' +
      'stroke-linecap="round" stroke-linejoin="round" class="lucide' + (cls ? ' ' + cls : '') +
      '" aria-hidden="true">' + ICON_PATHS[name] + '</svg>'
    );
  }

  /** Nearest view-encapsulation scope attribute (data-sc-*) for a subtree. */
  function findScopeAttr(el) {
    if (!el) return '';
    const names = el.getAttributeNames();
    for (const n of names) if (n.indexOf('data-sc-') === 0) return n;
    const all = el.querySelectorAll('*');
    for (const node of all) {
      const ans = node.getAttributeNames();
      for (const n of ans) if (n.indexOf('data-sc-') === 0) return n;
    }
    return '';
  }

  function applyScope(el, scopeAttr) {
    if (scopeAttr) el.setAttribute(scopeAttr, '');
    return el;
  }

  function el(tag, className, scopeAttr) {
    const node = document.createElement(tag);
    if (className) node.className = className;
    applyScope(node, scopeAttr);
    return node;
  }

  /* --------------------------------------------------------------------- */
  /* i18n core (dictionaries from js/i18n.js)                               */
  /* --------------------------------------------------------------------- */
  const DICTS = window.__I18N || { fr: {} };
  const LANGS = ['fr', 'en', 'ar'];
  const LANG_META = {
    fr: { dir: 'ltr', locale: 'fr', label: 'Français' },
    en: { dir: 'ltr', locale: 'en', label: 'English' },
    ar: { dir: 'rtl', locale: 'ar', label: 'العربية' },
  };
  const LANG_KEY = 'fluidity-lang';
  let currentLang = 'fr';
  try {
    const stored = localStorage.getItem(LANG_KEY);
    if (stored && LANG_META[stored]) currentLang = stored;
  } catch (e) { /* storage unavailable */ }

  function readPath(source, path) {
    let current = source;
    for (const key of path.split('.')) {
      if (current !== null && typeof current === 'object' && key in current) current = current[key];
      else return '';
    }
    return typeof current === 'string' ? current : '';
  }

  /** Dot-path translation with French fallback — mirrors I18nService.t(). */
  function t(path) {
    return readPath(DICTS[currentLang], path) || readPath(DICTS.fr, path) || path;
  }

  /** Structured (non-string) dictionary access — mirrors I18nService.data(). */
  function data(path) {
    const pick = (src) => {
      let cur = src;
      for (const k of path.split('.')) {
        if (cur && typeof cur === 'object' && k in cur) cur = cur[k];
        else return undefined;
      }
      return cur;
    };
    const fromLang = pick(DICTS[currentLang]);
    return fromLang !== undefined ? fromLang : pick(DICTS.fr);
  }

  const refreshHooks = [];
  function onLangRefresh(fn) { refreshHooks.push(fn); }

  function applyLanguage(lang, persist) {
    if (!LANG_META[lang]) return;
    currentLang = lang;
    const meta = LANG_META[lang];
    const html = document.documentElement;
    html.lang = meta.locale;
    html.dir = meta.dir;
    html.classList.toggle('rtl', meta.dir === 'rtl');

    applyStamps(document);
    applySeo();
    refreshHooks.forEach((fn) => { try { fn(); } catch (e) { /* keep other hooks running */ } });

    if (persist) {
      try { localStorage.setItem(LANG_KEY, lang); } catch (e) { /* storage unavailable */ }
    }
  }

  /** Apply data-i18n stamps under `root` (whole document or a restored subtree). */
  function applyStamps(root) {
    $$('[data-i18n]', root).forEach((node) => {
      const key = node.getAttribute('data-i18n');
      const prefix = node.getAttribute('data-i18n-prefix') || '';
      const suffix = node.getAttribute('data-i18n-suffix') || '';
      node.textContent = prefix + t(key) + suffix;
    });
    $$('[data-i18n-attr]', root).forEach((node) => {
      node.getAttribute('data-i18n-attr').split(';').forEach((pair) => {
        const ix = pair.indexOf(':');
        if (ix > 0) node.setAttribute(pair.slice(0, ix), t(pair.slice(ix + 1)));
      });
    });
  }

  /** Mirrors SeoService.setSeo() for the current page. */
  function applySeo() {
    const cfg = window.__PAGE_SEO;
    if (!cfg) return;
    const fullTitle = t(cfg.titleKey) + ' | Fluidity';
    document.title = fullTitle;
    const setMeta = (selector, attr, value) => {
      const node = $(selector);
      if (node && value) node.setAttribute(attr, value);
    };
    setMeta('meta[name="description"]', 'content', t(cfg.descKey));
    setMeta('meta[name="keywords"]', 'content', t('meta.seoKeywords'));
    setMeta('meta[property="og:title"]', 'content', fullTitle);
    setMeta('meta[property="og:description"]', 'content', t(cfg.descKey));
    setMeta('meta[name="twitter:title"]', 'content', fullTitle);
    setMeta('meta[name="twitter:description"]', 'content', t(cfg.descKey));
  }

  /* --------------------------------------------------------------------- */
  /* Theme                                                                  */
  /* --------------------------------------------------------------------- */
  const THEME_KEY = 'fluidity-theme';

  function currentTheme() {
    return document.documentElement.getAttribute('data-theme') === 'dark' ? 'dark' : 'light';
  }

  function syncThemeUi() {
    const dark = currentTheme() === 'dark';
    const meta = $('meta[name="theme-color"]');
    if (meta) meta.setAttribute('content', dark ? '#0B1020' : '#F7F8FC');
    const label = dark ? t('theme.toLight') : t('theme.toDark');
    $$('.theme-toggle').forEach((btn) => {
      btn.setAttribute('aria-label', label);
      btn.setAttribute('title', label);
    });
  }

  function initTheme() {
    $$('.theme-toggle').forEach((btn) => {
      if (btn.dataset.ready) return;
      btn.dataset.ready = '1';
      const scopeAttr = findScopeAttr(btn);
      // The prerendered button holds the moon icon; add the sun beside it and
      // let site.css pick the visible one from html[data-theme].
      const moon = btn.querySelector('lucide-icon');
      if (moon) moon.classList.add('ico-moon');
      if (!btn.querySelector('.ico-sun')) {
        const sun = el('lucide-icon', 'ico-sun', scopeAttr);
        sun.setAttribute('aria-hidden', 'true');
        sun.innerHTML = iconSvg('sun', 18);
        btn.appendChild(sun);
      }
      btn.addEventListener('click', () => {
        const next = currentTheme() === 'dark' ? 'light' : 'dark';
        document.documentElement.setAttribute('data-theme', next);
        try { localStorage.setItem(THEME_KEY, next); } catch (e) { /* storage unavailable */ }
        syncThemeUi();
      });
    });
    syncThemeUi();
    onLangRefresh(syncThemeUi);
  }

  /* --------------------------------------------------------------------- */
  /* Header: scroll state + mobile menu                                     */
  /* --------------------------------------------------------------------- */
  const NAV_ITEMS = [
    { path: '/', labelKey: 'header.nav.home' },
    { path: '/a-propos', labelKey: 'header.nav.about' },
    { path: '/services', labelKey: 'header.nav.services' },
    { path: '/solutions', labelKey: 'header.nav.solutions' },
    { path: '/projets', labelKey: 'header.nav.projects' },
    { path: '/contact', labelKey: 'header.nav.contact' },
  ];

  function currentPathKey() {
    const p = location.pathname.replace(/index\.html$/, '').replace(/\/+$/, '');
    return p === '' ? '/' : p;
  }

  function initHeader() {
    const bar = $('.bar');
    if (!bar) return;
    const headerHost = bar.closest('app-header') || bar.parentElement;
    const scopeAttr = findScopeAttr(bar);
    const isHome = currentPathKey() === '/';

    const updateBar = () => {
      const scrolled = window.scrollY > 24;
      bar.classList.toggle('bar--solid', scrolled || !isHome);
      bar.classList.toggle('bar--home', isHome && !scrolled);
    };
    window.addEventListener('scroll', updateBar, { passive: true });
    updateBar();

    const menuBtn = $('.menu-btn', bar);
    if (!menuBtn) return;

    const menuIco = menuBtn.querySelector('lucide-icon');
    if (menuIco) menuIco.classList.add('ico-menu');
    if (!menuBtn.querySelector('.ico-close')) {
      const closeIco = el('lucide-icon', 'ico-close', scopeAttr);
      closeIco.setAttribute('aria-hidden', 'true');
      closeIco.innerHTML = iconSvg('x', 22);
      menuBtn.appendChild(closeIco);
    }

    let menuEl = null;

    function setMenu(open) {
      menuBtn.setAttribute('aria-expanded', open ? 'true' : 'false');
      menuBtn.setAttribute('aria-label', t(open ? 'header.menuClose' : 'header.menuOpen'));
      document.body.classList.toggle('menu-locked', open);
      if (open && !menuEl) menuEl = buildMobileMenu(headerHost, scopeAttr, () => setMenu(false));
      if (!open && menuEl) { menuEl.remove(); menuEl = null; }
    }

    menuBtn.addEventListener('click', () => {
      setMenu(menuBtn.getAttribute('aria-expanded') !== 'true');
    });
    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape' && menuEl) setMenu(false);
    });
    onLangRefresh(() => {
      const open = menuBtn.getAttribute('aria-expanded') === 'true';
      menuBtn.setAttribute('aria-label', t(open ? 'header.menuClose' : 'header.menuOpen'));
      if (menuEl) {
        menuEl.remove();
        menuEl = buildMobileMenu(headerHost, scopeAttr, () => setMenu(false));
      }
    });
  }

  function buildMobileMenu(host, scopeAttr, closeFn) {
    const menu = el('div', 'mobile-menu', scopeAttr);
    menu.setAttribute('role', 'dialog');
    menu.setAttribute('aria-modal', 'true');
    menu.setAttribute('aria-label', 'Menu');

    const nav = el('nav', 'mobile-nav', scopeAttr);
    nav.setAttribute('aria-label', 'Navigation principale');
    const path = currentPathKey();
    NAV_ITEMS.forEach((item, i) => {
      const a = el('a', 'mobile-link', scopeAttr);
      a.href = item.path;
      a.style.setProperty('--stagger', String(i));
      const active = item.path === '/' ? path === '/' : path === item.path;
      if (active) a.classList.add('is-active');
      a.textContent = t(item.labelKey);
      a.addEventListener('click', closeFn);
      nav.appendChild(a);
    });
    menu.appendChild(nav);

    const actions = el('div', 'mobile-actions', scopeAttr);
    const headerActions = $('.actions', host);
    if (headerActions) {
      const langWrap = $('.wrap', headerActions);
      const themeBtn = $('.theme-toggle', headerActions);
      if (langWrap) {
        const clone = langWrap.cloneNode(true);
        clone.removeAttribute('data-ready');
        // Never carry an open dropdown into the menu clone.
        const openMenu = clone.querySelector('.menu');
        if (openMenu) openMenu.remove();
        const cloneTrigger = clone.querySelector('.trigger');
        if (cloneTrigger) cloneTrigger.setAttribute('aria-expanded', 'false');
        const cloneChev = clone.querySelector('.chev');
        if (cloneChev) cloneChev.classList.remove('chev--open');
        actions.appendChild(clone);
      }
      if (themeBtn) {
        const clone = themeBtn.cloneNode(true);
        clone.removeAttribute('data-ready');
        actions.appendChild(clone);
      }
    }
    menu.appendChild(actions);
    host.appendChild(menu);

    initLanguageSelectors();
    initTheme();
    return menu;
  }

  /* --------------------------------------------------------------------- */
  /* Language selector dropdown                                             */
  /* --------------------------------------------------------------------- */
  function initLanguageSelectors() {
    $$('.wrap').forEach((wrap) => {
      if (wrap.dataset.ready) return;
      wrap.dataset.ready = '1';
      const trigger = $('.trigger', wrap);
      if (!trigger) return;
      const scopeAttr = findScopeAttr(wrap);
      let menu = null;

      const updateCode = () => {
        const code = $('.code', wrap);
        if (code) code.textContent = currentLang.toUpperCase();
      };

      const close = () => {
        if (menu) { menu.remove(); menu = null; }
        trigger.setAttribute('aria-expanded', 'false');
        const chev = $('.chev', trigger);
        if (chev) chev.classList.remove('chev--open');
      };

      const open = () => {
        menu = buildLangMenu(wrap, scopeAttr, () => { close(); });
        trigger.setAttribute('aria-expanded', 'true');
        const chev = $('.chev', trigger);
        if (chev) chev.classList.add('chev--open');
      };

      trigger.addEventListener('click', () => {
        if (menu) close();
        else open();
      });
      document.addEventListener('click', (e) => {
        if (menu && !wrap.contains(e.target)) close();
      });
      document.addEventListener('keydown', (e) => {
        if (e.key === 'Escape') close();
      });
      onLangRefresh(updateCode);
      updateCode();
    });
  }

  function buildLangMenu(wrap, scopeAttr, closeFn) {
    const menu = el('ul', 'menu', scopeAttr);
    menu.setAttribute('role', 'listbox');
    menu.setAttribute('aria-label', t('language.label'));
    LANGS.forEach((code) => {
      const li = el('li', null, scopeAttr);
      const option = el('button', 'option' + (code === currentLang ? ' option--active' : ''), scopeAttr);
      option.type = 'button';
      option.setAttribute('role', 'option');
      option.setAttribute('aria-selected', code === currentLang ? 'true' : 'false');
      const label = document.createElement('span');
      label.textContent = LANG_META[code].label;
      option.appendChild(label);
      if (code === currentLang) {
        const check = el('lucide-icon', null, scopeAttr);
        check.setAttribute('aria-hidden', 'true');
        check.innerHTML = iconSvg('check', 15);
        option.appendChild(check);
      }
      option.addEventListener('click', () => {
        applyLanguage(code, true);
        closeFn();
      });
      li.appendChild(option);
      menu.appendChild(li);
    });
    wrap.appendChild(menu);
    return menu;
  }

  /* --------------------------------------------------------------------- */
  /* Scroll reveal                                                          */
  /* --------------------------------------------------------------------- */
  function initReveal() {
    const els = $$('.reveal');
    if (!els.length) return;
    if (reducedMotion || typeof IntersectionObserver === 'undefined') return;

    const html = document.documentElement;
    // Strip the server-side reveal-done without a reverse fade-out, so the
    // entrance animation plays exactly like the hydrated Angular app.
    html.classList.add('reveal-init');
    els.forEach((node) => node.classList.remove('reveal-done'));
    void document.body.offsetHeight;
    html.classList.remove('reveal-init');

    let ioHealthy = false;
    let allDone = false;
    const waiting = els.slice();

    window.__ioHealthy = () => ioHealthy;

    const forceReveal = () => {
      if (allDone) return;
      allDone = true;
      html.classList.add('reveal-instant');
      waiting.splice(0).forEach((node) => node.classList.add('reveal-done'));
    };
    setTimeout(() => { if (!ioHealthy) forceReveal(); }, 1200);

    const io = new IntersectionObserver(
      (entries) => {
        ioHealthy = true;
        if (allDone) return;
        entries.forEach((entry) => {
          if (!entry.isIntersecting) return;
          entry.target.classList.add('reveal-done');
          io.unobserve(entry.target);
          const ix = waiting.indexOf(entry.target);
          if (ix !== -1) waiting.splice(ix, 1);
        });
      },
      { threshold: 0.15, rootMargin: '0px 0px -8% 0px' },
    );
    els.forEach((node) => io.observe(node));
  }

  /* --------------------------------------------------------------------- */
  /* Stat counters                                                          */
  /* --------------------------------------------------------------------- */
  function initCounters() {
    const numbers = $$('.stat .number');
    if (!numbers.length) return;
    if (reducedMotion || typeof IntersectionObserver === 'undefined') return;

    numbers.forEach((node) => {
      const target = parseInt((node.textContent || '').replace(/[^0-9]/g, ''), 10);
      if (!isFinite(target)) return;
      const isYear = target >= 1900 && target <= 2100;
      const fmt = (v) => (isYear ? String(v) : v.toLocaleString('fr-FR'));
      node.textContent = fmt(0);

      let done = false;
      const settle = () => {
        if (done) return;
        done = true;
        io.disconnect();
        node.textContent = fmt(target);
      };
      const animate = () => {
        if (done) return;
        done = true;
        io.disconnect();
        const start = performance.now();
        const duration = 1400;
        const tick = (now) => {
          const p = Math.min((now - start) / duration, 1);
          const eased = 1 - Math.pow(1 - p, 3);
          node.textContent = fmt(Math.round(target * eased));
          if (p < 1) requestAnimationFrame(tick);
        };
        requestAnimationFrame(tick);
      };
      const io = new IntersectionObserver(
        (entries) => {
          entries.forEach((entry) => { if (entry.isIntersecting) animate(); });
        },
        { threshold: 0.4 },
      );
      io.observe(node.closest('.stat') || node);
      // IO-broken environments (mirrors stat-counter's health timeout).
      setTimeout(() => { if (typeof window.__ioHealthy === 'function' && !window.__ioHealthy()) settle(); }, 1300);
    });
  }

  /* --------------------------------------------------------------------- */
  /* Services coverflow carousel                                            */
  /* --------------------------------------------------------------------- */
  const SCALES = [1, 0.86, 0.74, 0.66];
  const OPACITIES = [1, 0.5, 0.22, 0];

  function initCarousel() {
    const head = $('.carousel-head');
    const viewport = $('.viewport');
    const track = $('.track');
    if (!head || !viewport || !track) return;
    const cards = $$('.card', track);
    if (!cards.length) return;
    const n = cards.length;

    let active = 0;
    let spacing = 320;
    const isRtl = () => document.documentElement.dir === 'rtl';

    const rel = (i) => {
      let d = (((i - active) % n) + n) % n;
      if (d > n / 2) d -= n;
      return d;
    };

    const render = () => {
      cards.forEach((card, i) => {
        const d = rel(i);
        const x = d * spacing * (isRtl() ? -1 : 1);
        const abs = Math.min(Math.abs(d), 3);
        const rot = Math.max(-12, Math.min(12, -d * 7)) * (isRtl() ? -1 : 1);
        card.style.transform =
          'translateX(calc(-50% + ' + x.toFixed(1) + 'px)) scale(' + SCALES[abs] +
          ') rotateY(' + rot.toFixed(1) + 'deg)';
        card.style.opacity = String(OPACITIES[Math.min(Math.abs(d), 3)]);
        card.style.zIndex = String(20 - Math.abs(d));
        card.style.pointerEvents = Math.abs(d) < 3 ? '' : 'none';
        card.classList.toggle('card--center', d === 0);
      });
      const count = $('.count', head);
      if (count) count.textContent = Math.min(active + 1, n) + ' / ' + n;
      const fill = $('.progress-fill');
      if (fill) fill.style.width = ((active + 1) / Math.max(n, 1)) * 100 + '%';
    };

    const measure = () => {
      if (cards[0]) spacing = cards[0].offsetWidth * 0.78;
      const max = Math.max.apply(null, cards.map((c) => c.offsetHeight));
      if (max > 0) track.style.height = max + 'px';
    };

    const focus = (i) => { active = ((i % n) + n) % n; render(); };
    const next = () => focus(active + 1);
    const prev = () => focus(active - 1);

    const ctrls = $$('.ctrl', head);
    if (ctrls[0]) ctrls[0].addEventListener('click', prev);
    if (ctrls[1]) ctrls[1].addEventListener('click', next);

    // Capture the SSR arrow icons so RTL can mirror them like Angular did.
    const leftSvg = ctrls[0] && ctrls[0].querySelector('svg');
    const rightSvg = ctrls[1] && ctrls[1].querySelector('svg');
    const leftHtml = leftSvg ? leftSvg.outerHTML : '';
    const rightHtml = rightSvg ? rightSvg.outerHTML : '';

    viewport.addEventListener('keydown', (e) => {
      if (e.key === 'ArrowRight') (isRtl() ? prev() : next());
      else if (e.key === 'ArrowLeft') (isRtl() ? next() : prev());
    });

    let pointerStart = null;
    let dragged = false;
    let suppressClick = false;
    viewport.addEventListener('pointerdown', (e) => {
      pointerStart = { x: e.clientX, y: e.clientY };
      dragged = false;
      suppressClick = false;
    });
    viewport.addEventListener('pointermove', (e) => {
      if (!pointerStart) return;
      if (Math.abs(e.clientX - pointerStart.x) > 10 || Math.abs(e.clientY - pointerStart.y) > 10) {
        dragged = true;
      }
    });
    const endPointer = (e) => {
      if (!pointerStart) return;
      const dx = e.clientX - pointerStart.x;
      pointerStart = null;
      if (!dragged || Math.abs(dx) < 40) return;
      if (isRtl() ? dx > 0 : dx < 0) next();
      else prev();
      suppressClick = true;
    };
    viewport.addEventListener('pointerup', endPointer);
    viewport.addEventListener('pointerleave', endPointer);

    cards.forEach((card, i) => {
      card.addEventListener('click', (ev) => {
        if (suppressClick) { suppressClick = false; return; }
        if (rel(i) !== 0) { ev.preventDefault(); ev.stopPropagation(); focus(i); }
      });
    });

    onLangRefresh(() => {
      if (ctrls[0] && ctrls[1] && leftHtml && rightHtml) {
        ctrls[0].innerHTML = isRtl() ? rightHtml : leftHtml;
        ctrls[1].innerHTML = isRtl() ? leftHtml : rightHtml;
      }
      render();
    });

    window.addEventListener('resize', () => { measure(); render(); }, { passive: true });
    measure();
    render();
  }

  /* --------------------------------------------------------------------- */
  /* Process stepper (self-playing)                                         */
  /* --------------------------------------------------------------------- */
  const STEP_MS = 5000;
  const RING_R = 21;
  const RING_C = 2 * Math.PI * RING_R;

  function initProcess() {
    const stepper = $('.stepper');
    if (!stepper) return;
    const nodesList = $('.nodes', stepper);
    const zone = $('.panel-zone', stepper);
    const railFill = $('.rail-fill', stepper);
    if (!nodesList || !zone) return;

    const steps = (data('process') || []).filter((s) => s && s.title);
    const n = steps.length;
    if (!n) return;

    const scopeAttr = findScopeAttr(stepper);
    let selected = 0;
    let playing = true;
    let tick = 0;
    let stepStartedAt = Date.now();

    // Capture the SSR icons for the play/pause toggle and the panel arrows.
    const ssPns = $$('.pn', zone);
    const captured = {
      pause: ssPns[0] && ssPns[0].querySelector('svg') ? ssPns[0].querySelector('svg').outerHTML : iconSvg('pause', 15),
      left: ssPns[1] && ssPns[1].querySelector('svg') ? ssPns[1].querySelector('svg').outerHTML : '',
      right: ssPns[2] && ssPns[2].querySelector('svg') ? ssPns[2].querySelector('svg').outerHTML : '',
    };

    const isRtl = () => document.documentElement.dir === 'rtl';
    const arrowHtml = (dir) => {
      const wantLeft = dir === 'left';
      const leftFirst = isRtl() ? captured.right : captured.left;
      const rightFirst = isRtl() ? captured.left : captured.right;
      return wantLeft ? leftFirst : rightFirst;
    };
    const railProgress = () => (n <= 1 ? 100 : (selected / (n - 1)) * 100);
    const ringOffset = () => (RING_C * (1 - tick)).toFixed(1) + 'px';

    function buildNodes() {
      nodesList.innerHTML = '';
      steps.forEach((step, i) => {
        const li = el('li', 'node-item', scopeAttr);
        const btn = el('button', 'node', scopeAttr);
        btn.type = 'button';
        btn.setAttribute('role', 'tab');
        btn.setAttribute('aria-selected', i === selected ? 'true' : 'false');
        btn.setAttribute('aria-label', t('home.process.stepLabel') + ' ' + (i + 1) + ' — ' + step.title);
        if (i === selected) btn.classList.add('node--active');
        else if (i < selected) btn.classList.add('node--done');

        const num = el('span', 'node-num', scopeAttr);
        if (i < selected) {
          const icon = el('lucide-icon', null, scopeAttr);
          icon.setAttribute('aria-hidden', 'true');
          icon.innerHTML = iconSvg('check', 14);
          num.appendChild(icon);
        } else {
          num.textContent = '0' + (i + 1);
        }
        if (i === selected) {
          const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
          svg.setAttribute('class', 'ring');
          svg.setAttribute('viewBox', '0 0 56 56');
          svg.setAttribute('aria-hidden', 'true');
          svg.style.setProperty('--ring-len', RING_C + 'px');
          svg.innerHTML =
            '<circle class="ring-bg" cx="28" cy="28" r="' + RING_R + '"/>' +
            '<circle class="ring-fill" cx="28" cy="28" r="' + RING_R +
            '" stroke-dashoffset="' + ringOffset() + '"/>';
          num.appendChild(svg);
        }
        btn.appendChild(num);

        const title = el('span', 'node-title', scopeAttr);
        title.textContent = step.title;
        btn.appendChild(title);

        btn.addEventListener('click', () => select(i));
        li.appendChild(btn);
        nodesList.appendChild(li);
      });
    }

    function buildPanel() {
      zone.innerHTML = '';
      const panel = el('article', 'panel', scopeAttr);
      panel.setAttribute('role', 'tabpanel');

      const index = el('span', 'panel-index', scopeAttr);
      index.textContent = (selected + 1) + ' / ' + n;
      const h3 = el('h3', null, scopeAttr);
      h3.textContent = steps[selected].title;
      const p = el('p', null, scopeAttr);
      p.textContent = steps[selected].description || '';

      const nav = el('div', 'panel-nav', scopeAttr);

      const playBtn = el('button', 'pn', scopeAttr);
      playBtn.type = 'button';
      playBtn.setAttribute('aria-pressed', String(!playing));
      playBtn.setAttribute('aria-label', playing ? t('home.process.pause') : t('home.process.play'));
      playBtn.innerHTML = playing ? captured.pause : iconSvg('play', 15);
      playBtn.addEventListener('click', togglePlay);

      const prevBtn = el('button', 'pn', scopeAttr);
      prevBtn.type = 'button';
      prevBtn.setAttribute('aria-label', t('home.process.prev'));
      prevBtn.innerHTML = arrowHtml('left');
      prevBtn.addEventListener('click', () => select(selected - 1));

      const nextBtn = el('button', 'pn', scopeAttr);
      nextBtn.type = 'button';
      nextBtn.setAttribute('aria-label', t('home.process.next'));
      nextBtn.innerHTML = arrowHtml('right');
      nextBtn.addEventListener('click', () => select(selected + 1));

      nav.appendChild(playBtn);
      nav.appendChild(prevBtn);
      nav.appendChild(nextBtn);
      panel.appendChild(index);
      panel.appendChild(h3);
      panel.appendChild(p);
      panel.appendChild(nav);
      zone.appendChild(panel);
    }

    function rebuild() {
      buildNodes();
      buildPanel();
      if (railFill) railFill.style.width = railProgress() + '%';
    }

    function select(index) {
      selected = ((index % n) + n) % n;
      stepStartedAt = Date.now();
      tick = 0;
      rebuild();
    }

    function togglePlay() {
      playing = !playing;
      if (playing) {
        stepStartedAt = Date.now();
        tick = 0;
      }
      const btn = zone.querySelector('.pn');
      if (btn) {
        btn.setAttribute('aria-pressed', String(!playing));
        btn.setAttribute('aria-label', playing ? t('home.process.pause') : t('home.process.play'));
        btn.innerHTML = playing ? captured.pause : iconSvg('play', 15);
      }
    }

    // Persistent interval, exactly like the Angular component.
    setInterval(() => {
      if (!playing) return;
      const fraction = (Date.now() - stepStartedAt) / STEP_MS;
      if (fraction >= 1) {
        stepStartedAt = Date.now();
        selected = (selected + 1) % n;
        rebuild();
      } else {
        tick = fraction;
        const ringFill = nodesList.querySelector('.ring-fill');
        if (ringFill) ringFill.setAttribute('stroke-dashoffset', ringOffset());
      }
    }, 100);

    // SSR already rendered step 1 for French; the single hook below covers
    // every later language switch (the boot phase re-applies a stored language
    // after all components registered their hooks).
    onLangRefresh(() => rebuild());
  }

  /* --------------------------------------------------------------------- */
  /* Contact form                                                           */
  /* --------------------------------------------------------------------- */
  const EMAIL_RE =
    /^(?=.{1,254}$)(?=.{1,64}@)[a-zA-Z0-9!#$%&'*+/=?^_`{|}~-]+(?:\.[a-zA-Z0-9!#$%&'*+/=?^_`{|}~-]+)*@(?:[a-zA-Z0-9](?:[a-zA-Z0-9-]*[a-zA-Z0-9])?\.)+[a-zA-Z0-9](?:[a-zA-Z0-9-]*[a-zA-Z0-9])?$/;

  function initContact() {
    const form = $('form[data-sc-3943533529]') || $('form');
    if (!form) return;
    const col = form.closest('.form-col');
    if (!col) return;

    const scopeAttr = findScopeAttr(form);
    const pristineFormHtml = form.outerHTML;

    const FIELDS = {
      name: { required: true, min: 2, errReq: 'contact.form.errors.nameRequired', errMin: null },
      email: { required: true, email: true, errReq: 'contact.form.errors.emailRequired', errEmail: 'contact.form.errors.emailFormat' },
      message: { required: true, min: 10, errReq: 'contact.form.errors.messageRequired', errMin: 'contact.form.errors.messageMin' },
    };

    const touched = {};
    let mode = 'form'; // form | submitting | success
    let liveForm = form;

    function fieldEl(field) {
      return liveForm.querySelector('[formcontrolname="' + field + '"]');
    }

    /**
     * Mirrors ContactPage.errorFor(): returns { invalid, key } where key is
     * the message to show, or null when the field is invalid but the original
     * shows no message (e.g. a too-short name — still blocks submission).
     */
    function validateField(field) {
      const node = fieldEl(field);
      if (!node) return { invalid: false, key: null };
      const cfg = FIELDS[field];
      const value = node.value;
      if (!value) return cfg.required ? { invalid: true, key: cfg.errReq } : { invalid: false, key: null };
      if (cfg.email && !EMAIL_RE.test(value)) return { invalid: true, key: cfg.errEmail };
      if (cfg.min && value.length < cfg.min) return { invalid: true, key: cfg.errMin };
      return { invalid: false, key: null };
    }

    function renderField(field) {
      const node = fieldEl(field);
      if (!node) return;
      const state = touched[field] ? validateField(field) : { invalid: false, key: null };
      const existing = liveForm.querySelector('#c-' + field + '-error');
      if (state.invalid && state.key) {
        let errEl = existing;
        if (!errEl) {
          errEl = el('p', 'field-error', scopeAttr);
          errEl.id = 'c-' + field + '-error';
          const icon = el('lucide-icon', null, scopeAttr);
          icon.setAttribute('aria-hidden', 'true');
          icon.innerHTML = iconSvg('alert', 14);
          errEl.appendChild(icon);
          errEl.appendChild(document.createTextNode(''));
          node.insertAdjacentElement('afterend', errEl);
        }
        errEl.lastChild.textContent = ' ' + t(state.key);
        node.setAttribute('aria-invalid', 'true');
        node.setAttribute('aria-describedby', 'c-' + field + '-error');
      } else {
        if (existing) existing.remove();
        node.removeAttribute('aria-invalid');
        node.removeAttribute('aria-describedby');
      }
    }

    function wire(currentForm) {
      Object.keys(FIELDS).forEach((field) => {
        const node = currentForm.querySelector('[formcontrolname="' + field + '"]');
        if (!node) return;
        node.addEventListener('blur', () => { touched[field] = true; renderField(field); });
        node.addEventListener('input', () => { if (touched[field]) renderField(field); });
      });
      currentForm.addEventListener('submit', onSubmit);
    }

    function showSuccess() {
      mode = 'success';
      const sendSvg = liveForm.querySelector('button[type="submit"] svg');
      let sendHtml = sendSvg ? sendSvg.outerHTML : '';
      sendHtml = sendHtml.replace(/width="\d+"/, 'width="30"').replace(/height="\d+"/, 'height="30"');

      const success = el('div', 'success', scopeAttr);
      success.setAttribute('role', 'status');
      const icon = el('lucide-icon', null, scopeAttr);
      icon.setAttribute('aria-hidden', 'true');
      icon.innerHTML = sendHtml;
      const h2 = el('h2', null, scopeAttr);
      h2.textContent = t('contact.form.successTitle');
      const p = el('p', null, scopeAttr);
      p.textContent = t('contact.form.successText');
      const again = el('button', 'btn btn-ghost', scopeAttr);
      again.type = 'button';
      again.textContent = t('contact.form.again');
      again.addEventListener('click', reset);
      success.appendChild(icon);
      success.appendChild(h2);
      success.appendChild(p);
      success.appendChild(again);

      col.innerHTML = '';
      col.appendChild(success);
    }

    function reset() {
      mode = 'form';
      col.innerHTML = pristineFormHtml;
      liveForm = col.querySelector('form');
      wire(liveForm);
      applyStamps(liveForm); // pristine HTML ships French — re-translate if needed
      Object.keys(touched).forEach((k) => delete touched[k]);
      Object.keys(FIELDS).forEach((f) => renderField(f));
    }

    function onSubmit(e) {
      e.preventDefault();
      let valid = true;
      Object.keys(FIELDS).forEach((field) => {
        touched[field] = true;
        if (validateField(field).invalid) valid = false;
        renderField(field);
      });
      if (!valid) return;

      mode = 'submitting';
      const btn = liveForm.querySelector('button[type="submit"]');
      if (btn) {
        btn.disabled = true;
        btn.innerHTML =
          '<lucide-icon class="spin" aria-hidden="true" ' + scopeAttr + '>' +
          iconSvg('loader', 18) + '</lucide-icon><span>' + t('contact.form.sending') + '</span>';
      }
      // Demo mode: CONTACT_API_URL is empty in the original app too, so the
      // submission simulates latency and then succeeds.
      setTimeout(() => { if (mode === 'submitting') showSuccess(); }, 900);
    }

    // Language switches: re-render any visible messages / success panel.
    onLangRefresh(() => {
      if (mode === 'success') {
        showSuccess();
      } else if (mode === 'submitting') {
        const span = liveForm.querySelector('button[type="submit"] span');
        if (span) span.textContent = t('contact.form.sending');
      } else {
        Object.keys(FIELDS).forEach((field) => { if (touched[field]) renderField(field); });
        const submitSpan = liveForm.querySelector('button[type="submit"] span');
        if (submitSpan) submitSpan.textContent = t('contact.form.submit');
      }
    });

    wire(liveForm);
  }

  /* --------------------------------------------------------------------- */
  /* Visuals: flow-field canvas + WebGL hero (loaded on demand)             */
  /* --------------------------------------------------------------------- */
  function initVisuals() {
    if ($('app-flow-field')) {
      import('./flow.js')
        .then((m) => m.initFlowField())
        .catch(() => { /* background is optional */ });
    }

    const fv = $('app-fluid-visual');
    if (!fv) return;
    const stage = $('.stage', fv);
    if (!stage || reducedMotion) return; // fallback orbs stay visible

    const start = () => {
      import('./hero3d.js')
        .then((m) =>
          m.initHero3d(stage, {
            density: window.matchMedia('(max-width: 47.99em)').matches ? 'low' : 'high',
            onStarted: () => {
              const fallback = $('.fallback', fv);
              if (fallback) fallback.remove();
            },
          }),
        )
        .catch(() => { /* keep CSS fallback orbs */ });
    };

    if (typeof IntersectionObserver === 'undefined') { start(); return; }
    const io = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting) { io.disconnect(); start(); }
        });
      },
      { rootMargin: '200px' },
    );
    io.observe(stage);
    setTimeout(() => {
      const healthy = typeof window.__ioHealthy === 'function' ? window.__ioHealthy() : true;
      if (!healthy) { io.disconnect(); start(); }
    }, 1400);
  }

  /* --------------------------------------------------------------------- */
  /* Boot                                                                   */
  /* --------------------------------------------------------------------- */
  function boot() {
    initTheme();
    initHeader();
    initLanguageSelectors();
    initCounters();
    initCarousel();
    initProcess();
    initContact();
    initReveal();
    initVisuals();
    // Second phase: translate a stored non-French preference now that every
    // component has registered its refresh hooks.
    if (currentLang !== 'fr') applyLanguage(currentLang, false);
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', boot);
  } else {
    boot();
  }
})();
