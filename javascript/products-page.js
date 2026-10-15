/* products-page.js — browse the products, refresh them, and manage quick items (services/extras such as Installation). */
(function () {
  'use strict';
  const SC = window.SC;
  const { esc, num, $ } = SC;

  SC.mountShell();
  const s = SC.getSettings();
  const m = (n) => SC.money(n, s);
  const main = $('#main');
  $('#tb-actions').innerHTML = `<button type="button" class="icon-btn" id="tb-refresh" aria-label="Refresh products">${SC.icon('refresh')}</button>`;

  let state = SC.getCachedProducts();
  let status = state.list.length ? 'cache' : 'none'; // live | cache | none
  let error = '';
  let cat = 'All';
  let term = '';

  main.innerHTML = `
    <div class="syncbar" id="sync"></div>
    <section class="card" id="quick"></section>
    <div class="searchbox">${SC.icon('search', 18)}<input id="q" type="search" placeholder="Search products" autocomplete="off"></div>
    <div class="chips" id="cats"></div>
    <div class="list" id="plist"></div>`;

  /* ---------- sync bar ---------- */
  function drawSync() {
    const n = state.list.length;
    const dot = status === 'live' ? 'live' : status === 'cache' ? 'cache' : '';
    const head = status === 'live' ? 'Products up to date' : status === 'cache' ? 'Saved copy' : 'No products';
    const sub = status === 'live' ? `${n} products · just now`
      : status === 'cache' ? `${n} products · ${SC.ago(state.fetchedAt)}${error ? ' · ' + esc(error) : ''}`
      : esc(error || 'Tap refresh to load your products');
    $('#sync').innerHTML = `<span class="dot ${dot}"></span><div><strong>${head}</strong><span class="muted">${sub}</span></div>
      <button type="button" class="btn small" id="sync-btn">Refresh</button>`;
  }

  async function refresh(manual) {
    const btns = [$('#sync-btn'), $('#tb-refresh')];
    btns.forEach((b) => b && (b.disabled = true));
    $('#sync').querySelector('strong').textContent = 'Updating…';
    const r = await SC.refreshProducts();
    state = { list: r.list, fetchedAt: r.fetchedAt };
    status = r.ok ? 'live' : state.list.length ? 'cache' : 'none';
    error = r.ok ? '' : r.error;
    drawSync();
    drawCats();
    drawList();
    if (r.ok && manual === true) SC.toast('Products updated');
  }

  /* ---------- list ---------- */
  function drawCats() {
    const cats = ['All'].concat(Array.from(new Set(state.list.map((p) => p.category))));
    $('#cats').innerHTML = state.list.length ? cats.map((c) => `<button type="button" class="chip ${cat === c ? 'on' : ''}" data-cat="${esc(c)}">${esc(c)}</button>`).join('') : '';
  }
  function drawList() {
    const list = state.list.filter((p) => (cat === 'All' || p.category === cat) && (!term || (p.fullName + ' ' + p.category + ' ' + p.type).toLowerCase().includes(term)));
    $('#plist').innerHTML = list.length
      ? list.map((p) => `<div class="prow" role="button" tabindex="0" data-pid="${esc(p.id)}">
          <div class="thumb" style="background-image:url('${esc(p.image)}')"></div>
          <div class="pinfo"><div class="pname">${esc(p.fullName)}</div>
            <div class="pmeta"><b>${p.price ? m(p.price) : '—'}</b>${SC.stockTag(p)}
              <span class="sub">${esc(p.category)}</span></div></div>${SC.icon('chev', 18)}</div>`).join('')
      : state.list.length ? `<div class="empty-mini">No products match.</div>` : '';
  }

  function openDetail(p) {
    let color = p.colors[0] || '';
    const draw = () => sh.setBody(`
      <img class="pd-img" src="${esc(SC.variantImage(p, color))}" alt="">
      ${p.images.length > 1 ? `<div class="pd-thumbs">${p.images.map((im) => `<img src="${esc(im.src)}" alt="" data-img="${esc(im.color)}" class="${color && im.color === color ? 'on' : ''}">`).join('')}</div>` : ''}
      <div class="pname" style="font-size:18px;margin-top:8px">${esc(p.fullName)}</div>
      <div class="pmeta"><b style="font-size:18px">${p.price ? m(p.price) : '—'}</b>${SC.stockTag(p)}</div>
      ${p.colors.length ? `<div class="field" style="margin-top:12px"><label>Colours</label><div class="chips" style="flex-wrap:wrap">${p.colors.map((c) => `<span class="chip ${c === color ? 'on' : ''}" data-color="${esc(c)}">${esc(c)}</span>`).join('')}</div></div>` : ''}
      ${p.sizes.length ? `<div class="field"><label>Sizes</label><div class="chips" style="flex-wrap:wrap">${p.sizes.map((z) => `<span class="chip">${esc(z)}</span>`).join('')}</div></div>` : ''}
      ${p.description ? `<div class="pd-desc">${SC.mdHTML(p.description)}</div>` : ''}`);
    const sh = SC.sheet.open({
      title: p.name || 'Product',
      body: '',
      footer: `<a class="btn primary" href="new.html?type=invoice&product=${encodeURIComponent(p.id)}">${SC.icon('plus', 18)} Add to new invoice</a>`
    });
    draw();
    sh.el.addEventListener('click', (e) => {
      const c = e.target.closest('[data-color]');
      const i = e.target.closest('[data-img]');
      if (c) { color = c.dataset.color; draw(); }
      else if (i && i.dataset.img) { color = i.dataset.img; draw(); }
    });
  }

  /* ---------- quick items ---------- */
  function drawQuick() {
    const items = SC.items.all();
    $('#quick').innerHTML = `<div class="row-between" style="margin-bottom:10px"><div class="card-title" style="margin:0">Services &amp; extras</div>
        <button type="button" class="btn small" id="qi-add">${SC.icon('plus', 16)} Add</button></div>
      <p class="hint" style="margin-bottom:10px">Things that are not products, like installation or wiring. They appear at the top when you add items.</p>
      ${items.length ? `<div class="list">${items.map((i) => `<div class="prow" role="button" tabindex="0" data-qid="${esc(i.id)}">
        <div class="thumb" style="display:grid;place-items:center;color:var(--muted)">${SC.icon('receipt', 22)}</div>
        <div class="pinfo"><div class="pname">${esc(i.name)}</div><div class="pmeta"><b>${i.price ? m(i.price) : 'Price set per invoice'}</b></div></div>${SC.icon('chev', 18)}</div>`).join('')}</div>`
        : `<div class="empty-mini">No extras yet.</div>`}`;
  }
  function editQuick(it) {
    const cur = Object.assign({ id: '', name: '', price: 0 }, it || {});
    const sh = SC.sheet.open({
      title: cur.id ? 'Edit item' : 'New item',
      body: `<div class="field"><label for="qi-name">Name</label><input id="qi-name" value="${esc(cur.name)}" placeholder="e.g. Installation" autocomplete="off"></div>
        <div class="field"><label for="qi-price">Default price (${esc(s.currencySymbol)})</label><input id="qi-price" inputmode="decimal" value="${cur.price || ''}" placeholder="0"></div>`,
      footer: (cur.id ? `<button type="button" class="btn danger" data-del>Delete</button>` : '') + `<button type="button" class="btn primary" data-save>Save</button>`
    });
    sh.el.querySelector('[data-save]').addEventListener('click', () => {
      const name = $('#qi-name', sh.el).value.trim();
      if (!name) { SC.toast('Enter a name'); return; }
      SC.items.save({ id: cur.id || SC.uid('item'), name, price: num($('#qi-price', sh.el).value) });
      sh.close();
      drawQuick();
    });
    const del = sh.el.querySelector('[data-del]');
    if (del) del.addEventListener('click', () => { SC.items.remove(cur.id); sh.close(); drawQuick(); });
  }

  /* ---------- events ---------- */
  main.addEventListener('click', (e) => {
    let el;
    if (e.target.closest('#sync-btn')) refresh(true);
    else if ((el = e.target.closest('[data-cat]'))) { cat = el.dataset.cat; drawCats(); drawList(); }
    else if ((el = e.target.closest('[data-pid]'))) { const p = state.list.find((x) => x.id === el.dataset.pid); if (p) openDetail(p); }
    else if (e.target.closest('#qi-add')) editQuick(null);
    else if ((el = e.target.closest('[data-qid]'))) editQuick(SC.items.get(el.dataset.qid));
  });
  $('#tb-refresh').addEventListener('click', () => refresh(true));
  $('#q').addEventListener('input', (e) => { term = e.target.value.trim().toLowerCase(); drawList(); });
  drawSync();
  drawCats();
  drawList();
  drawQuick();
  refresh();
})();
