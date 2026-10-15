/* shell.js — header, bottom navigation, bottom sheets, toasts, icons. */
(function (root) {
  'use strict';
  const SC = root.SC;
  const { esc } = SC;

  const P = {
    docs: '<path d="M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8z"/><path d="M14 3v5h5M9 13h6M9 17h6"/>',
    box: '<path d="M21 8l-9-5-9 5v8l9 5 9-5z"/><path d="M3 8l9 5 9-5M12 13v8"/>',
    plus: '<path d="M12 5v14M5 12h14"/>',
    users: '<circle cx="9" cy="8" r="3.5"/><path d="M2.5 20c0-3.6 2.9-6 6.5-6s6.5 2.4 6.5 6"/><path d="M16 4.6a3.5 3.5 0 0 1 0 6.8M18 14.4c2 .7 3.5 2.6 3.5 5.6"/>',
    sliders: '<path d="M4 6h8M18 6h2M4 12h2M12 12h8M4 18h10M20 18h0"/><circle cx="15" cy="6" r="2"/><circle cx="9" cy="12" r="2"/><circle cx="17" cy="18" r="2"/>',
    back: '<path d="M15 5l-7 7 7 7"/>',
    close: '<path d="M6 6l12 12M18 6L6 18"/>',
    search: '<circle cx="11" cy="11" r="6.5"/><path d="M20 20l-4-4"/>',
    refresh: '<path d="M20 11a8 8 0 0 0-14.5-4M4 4v4h4"/><path d="M4 13a8 8 0 0 0 14.5 4M20 20v-4h-4"/>',
    more: '<circle cx="5" cy="12" r="1.4"/><circle cx="12" cy="12" r="1.4"/><circle cx="19" cy="12" r="1.4"/>',
    share: '<path d="M12 3v12M7 8l5-5 5 5"/><path d="M5 13v6a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2v-6"/>',
    trash: '<path d="M4 7h16M10 11v6M14 11v6M6 7l1 12a2 2 0 0 0 2 2h6a2 2 0 0 0 2-2l1-12M9 7V4h6v3"/>',
    edit: '<path d="M4 20h4L19 9l-4-4L4 16z"/><path d="M13.5 6.5l4 4"/>',
    print: '<path d="M7 9V3h10v6"/><rect x="4" y="9" width="16" height="8" rx="2"/><path d="M7 14h10v7H7z"/>',
    check: '<path d="M5 12.5l4.5 4.5L19 7.5"/>',
    chev: '<path d="M9 5l7 7-7 7"/>',
    copy: '<rect x="8" y="8" width="12" height="12" rx="2"/><path d="M16 8V6a2 2 0 0 0-2-2H6a2 2 0 0 0-2 2v8a2 2 0 0 0 2 2h2"/>',
    chat: '<path d="M4 20l1.4-4.2A8 8 0 1 1 8.4 18.8z"/>',
    mail: '<rect x="3" y="5" width="18" height="14" rx="2"/><path d="M3 7l9 6 9-6"/>',
    download: '<path d="M12 4v11M7 11l5 5 5-5M5 20h14"/>',
    upload: '<path d="M12 16V5M7 9l5-5 5 5M5 20h14"/>',
    receipt: '<path d="M6 3h12v18l-3-2-3 2-3-2-3 2z"/><path d="M9 8h6M9 12h6"/>',
    convert: '<path d="M4 8h13l-3-3M20 16H7l3 3"/>',
    calendar: '<rect x="3.5" y="5" width="17" height="15.5" rx="3"/><path d="M8 3v4M16 3v4M3.5 10h17"/>',
    grip: '<circle cx="9" cy="6" r="1.3"/><circle cx="15" cy="6" r="1.3"/><circle cx="9" cy="12" r="1.3"/><circle cx="15" cy="12" r="1.3"/><circle cx="9" cy="18" r="1.3"/><circle cx="15" cy="18" r="1.3"/>',
    dollar: '<path d="M12 3v18M16 7.5c-.8-1.3-2.2-2-4-2-2.4 0-4 1.2-4 3s1.6 2.6 4 3 4 1.2 4 3-1.6 3-4 3c-1.9 0-3.4-.8-4.2-2.2"/>'
  };
  SC.icon = (name, size) => {
    const z = size || 20;
    return `<svg class="ico" width="${z}" height="${z}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${P[name] || ''}</svg>`;
  };

  /* ---------- toast ---------- */
  SC.toast = (msg) => {
    let t = document.getElementById('toast');
    if (!t) {
      t = document.createElement('div');
      t.id = 'toast';
      t.className = 'toast';
      t.setAttribute('role', 'status');
      document.body.append(t);
    }
    t.textContent = msg;
    t.classList.add('show');
    clearTimeout(SC._toastTimer);
    SC._toastTimer = setTimeout(() => t.classList.remove('show'), 2400);
  };

  /* ---------- bottom sheet ---------- */
  SC.sheet = (function () {
    let cur = null;
    function close() {
      if (!cur) return;
      const { el, bd, onClose } = cur;
      cur = null;
      el.classList.remove('open');
      bd.classList.remove('open');
      document.body.classList.remove('lock');
      setTimeout(() => { el.remove(); bd.remove(); }, 260);
      if (onClose) onClose();
    }
    function open(opts) {
      if (cur) { cur.el.remove(); cur.bd.remove(); cur = null; }
      const bd = document.createElement('div');
      bd.className = 'sheet-backdrop';
      const el = document.createElement('div');
      el.className = 'sheet';
      el.setAttribute('role', 'dialog');
      el.setAttribute('aria-modal', 'true');
      el.innerHTML =
        `<div class="sheet-grip"></div><div class="sheet-head"><h3>${esc(opts.title || '')}</h3>` +
        `<button type="button" class="icon-btn sm" data-sheet-close aria-label="Close">${SC.icon('close', 18)}</button></div>` +
        `<div class="sheet-body"></div>${opts.footer ? `<div class="sheet-foot">${opts.footer}</div>` : ''}`;
      document.body.append(bd, el);
      document.body.classList.add('lock');
      const body = el.querySelector('.sheet-body');
      if (opts.body) body.innerHTML = opts.body;
      cur = { el, bd, onClose: opts.onClose };
      bd.addEventListener('click', close);
      el.addEventListener('click', (e) => { if (e.target.closest('[data-sheet-close]')) close(); });
      requestAnimationFrame(() => requestAnimationFrame(() => { bd.classList.add('open'); el.classList.add('open'); }));
      // drag the handle / title down to dismiss, like an iOS sheet
      let y0 = null, dy = 0, t0 = 0;
      const grab = el.querySelectorAll('.sheet-grip, .sheet-head');
      grab.forEach((g) => {
        g.addEventListener('touchstart', (e) => { if (e.target.closest('button')) return; y0 = e.touches[0].clientY; dy = 0; t0 = Date.now(); el.style.transition = 'none'; }, { passive: true });
        g.addEventListener('touchmove', (e) => {
          if (y0 === null) return;
          dy = Math.max(0, e.touches[0].clientY - y0);
          el.style.transform = `translate(-50%, ${dy}px)`;
          bd.style.opacity = String(Math.max(0, 1 - dy / 500));
        }, { passive: true });
        g.addEventListener('touchend', () => {
          if (y0 === null) return;
          const fast = dy / Math.max(1, Date.now() - t0) > 0.6;
          y0 = null;
          el.style.transition = '';
          bd.style.opacity = '';
          if (dy > 110 || fast) { el.style.transform = ''; close(); } else el.style.transform = '';
        });
      });
      return {
        el, body, close,
        setBody(html) { body.innerHTML = html; body.scrollTop = 0; },
        setTitle(t) { el.querySelector('h3').textContent = t; }
      };
    }
    document.addEventListener('keydown', (e) => { if (e.key === 'Escape') close(); });
    return { open, close };
  })();

  /* ---------- page shell ---------- */
  const go = (href, back) => {
    const app = document.querySelector('.app');
    const nav = () => (href === -1 ? history.back() : (location.href = href));
    if (!app || matchMedia('(prefers-reduced-motion: reduce)').matches) { nav(); return; }
    app.classList.add(back ? 'leaving-back' : 'leaving');
    setTimeout(nav, 170);
  };
  SC.go = go;

  SC.mountShell = function () {
    const b = document.body;
    const rootP = b.dataset.root || '';
    const page = b.dataset.page || '';
    const s = SC.getSettings();
    const app = document.querySelector('.app');
    const top = document.getElementById('topbar');
    const logo = s.logo ? (/^(https?:|data:|\/)/i.test(s.logo) ? s.logo : rootP + s.logo) : '';
    const isBack = b.dataset.back === '1';
    if (SC.applyTheme) SC.applyTheme();
    app.classList.add(isBack ? 'enter-push' : 'enter-tab');
    b.classList.add('boot');
    setTimeout(() => b.classList.remove('boot'), 1000);

    const lead = isBack
      ? `<button type="button" class="back-btn" id="tb-back" aria-label="Back">${SC.icon('back', 22)}<span>Back</span></button>`
      : `<span class="brand-mark"><b>SC</b>${logo ? `<img src="${esc(logo)}" alt="" onload="this.parentNode.classList.add('has-img')" onerror="this.remove()">` : ''}</span>`;
    top.innerHTML = `${lead}<h1 id="tb-title">${esc(b.dataset.title || '')}</h1><span class="tb-spacer"></span>`;

    // iOS large title that folds into the bar on scroll
    const lt = document.createElement('div');
    lt.className = 'largetitle';
    lt.innerHTML = `<h2 id="lt">${esc(b.dataset.title || '')}</h2>`;
    top.after(lt);
    const onScroll = () => top.classList.toggle('scrolled', window.scrollY > 36);
    window.addEventListener('scroll', onScroll, { passive: true });
    onScroll();

    // thumb zone: floating actions live bottom-right, above the tab bar
    const fab = document.createElement('div');
    fab.className = 'fab-stack';
    fab.id = 'tb-actions';
    app.append(fab);

    const back = document.getElementById('tb-back');
    if (back) back.addEventListener('click', () => (history.length > 1 ? go(-1, true) : go(rootP + 'index.html', true)));

    if (b.dataset.nav !== 'off') {
      const items = [
        ['home', rootP + 'index.html', 'Documents', 'docs'],
        ['products', rootP + 'pages/products.html', 'Products', 'box'],
        ['new', rootP + 'pages/new.html?type=invoice', 'New', 'plus'],
        ['customers', rootP + 'pages/customers.html', 'Customers', 'users'],
        ['settings', rootP + 'pages/settings.html', 'Settings', 'sliders']
      ];
      const nav = document.createElement('nav');
      nav.className = 'bottomnav';
      nav.setAttribute('aria-label', 'Main');
      nav.innerHTML = items
        .map(([k, href, label, ic]) =>
          k === 'new'
            ? `<a class="nav-new" href="${href}" aria-label="New document"><span>${SC.icon(ic, 26)}</span></a>`
            : `<a class="nav-item ${page === k ? 'on' : ''}" href="${href}">${SC.icon(ic, 24)}<span>${label}</span></a>`
        )
        .join('');
      app.append(nav);
      app.classList.add('has-nav');
    } else {
      app.classList.add('no-nav');
    }

    // page-to-page slide instead of a hard reload
    document.addEventListener('click', (e) => {
      const a = e.target.closest('a[href]');
      if (!a || e.defaultPrevented || e.metaKey || e.ctrlKey || e.shiftKey || a.target === '_blank' || a.hasAttribute('download')) return;
      const h = a.getAttribute('href');
      if (!h || h[0] === '#' || /^(https?:|mailto:|tel:|sms:|javascript:)/i.test(h)) return;
      if (a.classList.contains('nav-item') && a.classList.contains('on')) { e.preventDefault(); window.scrollTo({ top: 0, behavior: 'smooth' }); return; }
      e.preventDefault();
      go(a.href, false);
    });
    // light haptic tick on taps (Android; ignored elsewhere)
    document.addEventListener('pointerdown', (e) => { if (e.target.closest('.btn, .chip, .nav-item, .nav-new, .icon-btn, .seg button') && navigator.vibrate) navigator.vibrate(6); }, { passive: true });
    window.addEventListener('pageshow', () => app.classList.remove('leaving', 'leaving-back'));

    // swipe from the left edge to go back
    if (isBack) {
      const movers = () => app.querySelectorAll(':scope > main, :scope > .largetitle');
      let x0 = null, y0 = 0, dx = 0;
      document.addEventListener('touchstart', (e) => {
        const t = e.touches[0];
        x0 = t.clientX < 28 && !document.body.classList.contains('lock') ? t.clientX : null; y0 = t.clientY; dx = 0;
      }, { passive: true });
      document.addEventListener('touchmove', (e) => {
        if (x0 === null) return;
        const t = e.touches[0];
        if (Math.abs(t.clientY - y0) > Math.abs(t.clientX - x0) * 1.4 && dx < 12) { x0 = null; return; }
        dx = Math.max(0, t.clientX - x0);
        movers().forEach((n) => { n.style.transition = 'none'; n.style.transform = `translateX(${dx}px)`; });
      }, { passive: true });
      document.addEventListener('touchend', () => {
        if (x0 === null) return;
        x0 = null;
        movers().forEach((n) => { n.style.transition = ''; });
        if (dx > 90) { movers().forEach((n) => { n.style.transform = 'translateX(100%)'; }); setTimeout(() => (history.length > 1 ? history.back() : (location.href = rootP + 'index.html')), 160); }
        else movers().forEach((n) => { n.style.transform = ''; });
      });
    }
  };

  SC.setTitle = (t) => {
    const el = document.getElementById('tb-title');
    if (el) el.textContent = t;
    const lt = document.getElementById('lt');
    if (lt) lt.textContent = t;
  };
})(typeof window !== 'undefined' ? window : globalThis);
