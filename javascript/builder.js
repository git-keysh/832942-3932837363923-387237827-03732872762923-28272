/* builder.js — create / edit an invoice, estimate or receipt.
   Customer, items (from the product feed or custom), discount, tax, delivery, deposit, notes. */
(function () {
  'use strict';
  const SC = window.SC;
  const { esc, num, $ } = SC;

  const qs = new URLSearchParams(location.search);
  const s = SC.getSettings();
  const editId = qs.get('id');
  let doc = editId ? SC.docs.get(editId) : null;
  const isEdit = !!doc;
  if (!doc) {
    const t = ['invoice', 'estimate', 'receipt'].includes(qs.get('type')) ? qs.get('type') : 'invoice';
    doc = SC.newDoc(t, s);
  }

  if (doc.paymentDetails === undefined) doc.paymentDetails = SC.payText(doc, s);
  SC.mountShell();
  const main = $('#main');
  const m = (n) => SC.money(n, s);
  const KIND = () => SC.TYPE_LABEL[doc.type];
  const title = () => SC.setTitle(isEdit ? 'Edit ' + KIND().toLowerCase() : 'New ' + KIND().toLowerCase());

  /* ---------- skeleton ---------- */
  main.innerHTML = `
    ${isEdit ? '' : `<div class="seg" id="type-seg"></div>`}
    <section class="card" id="sec-details"></section>
    <section class="card" id="sec-cust"></section>
    <section class="card" id="sec-items"></section>
    <section class="card" id="sec-adjust"></section>
    <section class="card" id="sec-pay" hidden></section>
    <section class="card" id="sec-notes"></section>
    <section class="card totals" id="sec-totals"></section>`;

  const bar = document.createElement('div');
  bar.className = 'stickybar';
  bar.innerHTML = `<button type="button" class="icon-btn round" id="sb-back" aria-label="Back">${SC.icon('back')}</button><div class="sb-total"><span>Total</span><strong id="sb-total">${m(0)}</strong></div>
    <button type="button" class="btn primary" id="save">Save &amp; preview</button>`;
  $('.app').append(bar);
  $('#sb-back').addEventListener('click', () => SC.go(history.length > 1 ? -1 : '../index.html', true));

  /* ---------- type switch ---------- */
  function drawType() {
    const seg = $('#type-seg');
    if (!seg) return;
    seg.innerHTML = ['invoice', 'estimate', 'receipt']
      .map((t) => `<button type="button" data-type="${t}" class="${doc.type === t ? 'on' : ''}">${SC.TYPE_LABEL[t]}</button>`)
      .join('');
  }
  main.addEventListener('click', (e) => {
    const b = e.target.closest('#type-seg [data-type]');
    if (!b || b.dataset.type === doc.type) return;
    doc.type = b.dataset.type;
    doc.number = SC.suggestNumber(doc.type, s);
    doc.dueDate = doc.type !== 'receipt' && s.defaultDueDays > 0 ? SC.addDays(doc.issueDate, s.defaultDueDays) : '';
    title();
    drawAll();
  });

  let numEdited = false;

  /* ---------- details ---------- */
  function drawDetails() {
    const isRc = doc.type === 'receipt';
    const isEst = doc.type === 'estimate';
    const due = isEst ? 'Valid until' : 'Due date';
    const days = [['', 'On receipt'], ['7', '7 days'], ['14', '14 days'], ['30', '30 days']];
    $('#sec-details').innerHTML = `
      <div class="card-title">Details</div>
      <div class="grid2">
        <div class="field"><label for="d-num">${KIND()} number</label><input id="d-num" value="${esc(doc.number)}" autocomplete="off"></div>
        <div class="field"><label for="d-issue">Issue date</label><input id="d-issue" type="date" value="${esc(doc.issueDate)}"></div>
      </div>
      ${isRc ? '' : `<div class="field"><label for="d-due">${due}</label><input id="d-due" type="date" value="${esc(doc.dueDate)}">
        <div class="chips" id="d-presets">${days.map(([n, l]) => `<button type="button" class="chip" data-days="${n}">${l}</button>`).join('')}</div></div>`}`;
  }
  main.addEventListener('input', (e) => {
    if (e.target.id === 'd-num') { doc.number = e.target.value; numEdited = true; }
    if (e.target.id === 'd-issue') doc.issueDate = e.target.value;
    if (e.target.id === 'd-due') doc.dueDate = e.target.value;
  });
  main.addEventListener('click', (e) => {
    const b = e.target.closest('#d-presets [data-days]');
    if (!b) return;
    doc.dueDate = b.dataset.days ? SC.addDays(doc.issueDate, +b.dataset.days) : '';
    $('#d-due').value = doc.dueDate;
  });

  /* ---------- customer ---------- */
  function drawCust() {
    const c = doc.customer || {};
    $('#sec-cust').innerHTML = `<div class="card-title">Customer</div>` + (c.name
      ? `<div class="cust"><div class="avatar">${esc(SC.initials(c.name))}</div>
           <div class="cust-info"><strong>${esc(c.name)}</strong><span>${esc(c.phone || c.email || 'No contact details')}</span></div>
           <button type="button" class="btn small" id="c-pick">Change</button></div>`
      : `<button type="button" class="btn block" id="c-pick">${SC.icon('users', 18)} Add customer</button>`);
  }
  function setCustomer(c) {
    doc.customerId = c.id;
    doc.customer = { name: c.name, phone: c.phone || '', email: c.email || '', address: c.address || '' };
    drawCust();
  }
  function openCustomers() {
    let term = '';
    const sh = SC.sheet.open({
      title: 'Select customer',
      body: `<div class="sheet-search"><div class="searchbox">${SC.icon('search', 18)}<input id="cs-q" type="search" placeholder="Search customers" autocomplete="off"></div></div><div class="list" id="cs-list"></div>`,
      footer: `<button type="button" class="btn primary" data-new>${SC.icon('plus', 18)} New customer</button>`
    });
    const draw = () => {
      const all = SC.customers.all().filter((c) => !term || (c.name + ' ' + c.phone + ' ' + c.email).toLowerCase().includes(term))
        .sort((a, b) => a.name.localeCompare(b.name));
      $('#cs-list', sh.el).innerHTML = all.length
        ? all.map((c) => `<div class="prow" role="button" tabindex="0" data-cid="${esc(c.id)}"><div class="avatar">${esc(SC.initials(c.name))}</div>
            <div class="pinfo"><div class="pname">${esc(c.name)}</div><div class="pmeta"><span class="sub">${esc(c.phone || c.email || '')}</span></div></div>${SC.icon('chev', 18)}</div>`).join('')
        : `<div class="empty-mini">${SC.customers.all().length ? 'No match.' : 'No saved customers yet. Add one below.'}</div>`;
    };
    draw();
    sh.el.addEventListener('input', (e) => { if (e.target.id === 'cs-q') { term = e.target.value.trim().toLowerCase(); draw(); } });
    sh.el.addEventListener('click', (e) => {
      const r = e.target.closest('[data-cid]');
      if (r) { setCustomer(SC.customers.get(r.dataset.cid)); sh.close(); return; }
      if (e.target.closest('[data-new]')) {
        sh.close();
        setTimeout(() => SC.editCustomer({}, { onSave: setCustomer }), 280);
      }
    });
  }
  main.addEventListener('click', (e) => { if (e.target.closest('#c-pick')) openCustomers(); });

  /* ---------- items ---------- */
  function lineHTML(it, i) {
    return `<div class="line" data-i="${i}">
      <div class="line-top">${doc.items.length > 1 ? `<span class="grip" data-grip aria-label="Drag to reorder">${SC.icon('grip', 20)}</span>` : ''}<input class="l-name" value="${esc(it.name)}" placeholder="Item name" autocomplete="off">
        <button type="button" class="icon-btn sm danger" data-del aria-label="Remove item">${SC.icon('trash', 16)}</button></div>
      ${it.variant ? `<span class="line-var">${esc(it.variant)}</span>` : ''}
      <div class="line-row">
        <div class="mini"><span>Price (${esc(s.currencySymbol)})</span><input class="l-price" inputmode="decimal" value="${esc(it.price)}"></div>
        <div class="mini"><span>Qty</span><div class="stepper"><button type="button" data-dec aria-label="Less">−</button><input class="l-qty" inputmode="decimal" value="${esc(it.qty)}"><button type="button" data-inc aria-label="More">+</button></div></div>
        <div class="mini r"><span>Amount</span><strong class="l-amt">${m(SC.lineTotal(it))}</strong></div>
      </div>
      <div class="line-disc"><span>Discount</span>
        <div class="seg mini" data-dseg><button type="button" data-dt="amount" class="${(it.disc || {}).type !== 'percent' ? 'on' : ''}">${esc(s.currencySymbol)}</button><button type="button" data-dt="percent" class="${(it.disc || {}).type === 'percent' ? 'on' : ''}">%</button></div>
        <input class="l-disc" inputmode="decimal" placeholder="0" value="${num((it.disc || {}).value) || ''}"></div></div>`;
  }
  function drawItems() {
    $('#sec-items').innerHTML = `<div class="row-between" style="margin-bottom:12px"><div class="card-title" style="margin:0">Items</div>
        <span class="hint">${doc.items.length} ${doc.items.length === 1 ? 'line' : 'lines'}</span></div>
      <div id="lines">${doc.items.length ? doc.items.map(lineHTML).join('') : `<div class="empty-mini">No items yet. Add products from your store or a custom item.</div>`}</div>
      <div class="btn-row"><button type="button" class="btn" id="add-prod">${SC.icon('box', 18)} Products</button>
        <button type="button" class="btn" id="add-custom">${SC.icon('plus', 18)} Custom item</button></div>`;
  }
  /* drag a line by its handle to reorder (touch or mouse) */
  (function () {
    let el = null, startY = 0, startTop = 0;
    const box = () => $('#lines');
    document.addEventListener('pointerdown', (e) => {
      const g = e.target.closest('[data-grip]');
      if (!g || !box().contains(g)) return;
      e.preventDefault();
      el = g.closest('.line');
      startY = e.clientY;
      el.classList.add('dragging');
      g.setPointerCapture(e.pointerId);
      if (navigator.vibrate) navigator.vibrate(10);
    });
    document.addEventListener('pointermove', (e) => {
      if (!el) return;
      if (e.clientY < 110) window.scrollBy(0, -12); else if (e.clientY > innerHeight - 160) window.scrollBy(0, 12);
      el.style.transform = `translateY(${e.clientY - startY}px) scale(1.02)`;
      const r = el.getBoundingClientRect(), cy = r.top + r.height / 2;
      const prev = el.previousElementSibling, next = el.nextElementSibling;
      const swap = (ref, before) => {
        const t0 = el.offsetTop;
        box().insertBefore(el, before ? ref : ref.nextSibling);
        startY -= t0 - el.offsetTop;
        el.style.transform = `translateY(${e.clientY - startY}px) scale(1.02)`;
        if (navigator.vibrate) navigator.vibrate(5);
      };
      if (prev && prev.classList.contains('line')) { const pr = prev.getBoundingClientRect(); if (cy < pr.top + pr.height / 2) return swap(prev, true); }
      if (next && next.classList.contains('line')) { const nr = next.getBoundingClientRect(); if (cy > nr.top + nr.height / 2) return swap(next, false); }
    });
    const end = () => {
      if (!el) return;
      const order = Array.from(box().querySelectorAll('.line')).map((l) => +l.dataset.i);
      el = null;
      doc.items = order.map((i) => doc.items[i]);
      drawItems();
      drawTotals();
    };
    document.addEventListener('pointerup', end);
    document.addEventListener('pointercancel', end);
  })();

  function addLine(item) {
    const hit = item.pid && doc.items.find((x) => x.pid === item.pid && (x.variant || '') === (item.variant || ''));
    if (hit) hit.qty = num(hit.qty) + num(item.qty || 1);
    else doc.items.push({ name: item.name, price: num(item.price), qty: num(item.qty || 1), variant: item.variant || '', pid: item.pid || '' });
    drawItems();
    drawTotals();
  }
  const lines = () => $('#sec-items');
  lines().addEventListener('input', (e) => {
    const ln = e.target.closest('.line');
    if (!ln) return;
    const it = doc.items[+ln.dataset.i];
    if (e.target.classList.contains('l-name')) it.name = e.target.value;
    if (e.target.classList.contains('l-price')) it.price = num(e.target.value);
    if (e.target.classList.contains('l-qty')) it.qty = num(e.target.value);
    if (e.target.classList.contains('l-disc')) it.disc = Object.assign({ type: 'amount' }, it.disc, { value: num(e.target.value) });
    $('.l-amt', ln).textContent = m(SC.lineTotal(it));
    drawTotals();
  });
  lines().addEventListener('click', (e) => {
    const ln = e.target.closest('.line');
    if (ln) {
      const i = +ln.dataset.i;
      const it = doc.items[i];
      if (e.target.closest('[data-del]')) { doc.items.splice(i, 1); drawItems(); drawTotals(); return; }
      const step = e.target.closest('[data-inc],[data-dec]');
      if (step) {
        it.qty = step.hasAttribute('data-inc') ? num(it.qty) + 1 : Math.max(1, num(it.qty) - 1);
        $('.l-qty', ln).value = it.qty;
        $('.l-amt', ln).textContent = m(SC.lineTotal(it));
        drawTotals();
      }
      const dt = e.target.closest('[data-dt]');
      if (dt) {
        it.disc = Object.assign({ value: 0 }, it.disc, { type: dt.dataset.dt });
        ln.querySelectorAll('[data-dt]').forEach((b) => b.classList.toggle('on', b === dt));
        $('.l-amt', ln).textContent = m(SC.lineTotal(it));
        drawTotals();
      }
      return;
    }
    if (e.target.closest('#add-prod')) openPicker();
    if (e.target.closest('#add-custom')) {
      addLine({ name: '', price: 0, qty: 1 });
      const inputs = lines().querySelectorAll('.l-name');
      if (inputs.length) inputs[inputs.length - 1].focus();
    }
  });

  /* ---------- product picker ---------- */
  function openPicker(start) {
    let cat = 'All';
    let term = '';
    let view = 'list';
    let vp = null, vColor = '', vSize = '', vQty = 1;
    const sh = SC.sheet.open({ title: 'Add items', body: '', footer: `<button type="button" class="btn primary" data-sheet-close>Done</button>` });
    const body = sh.body;

    const productRow = (p) => `<div class="prow" role="button" tabindex="0" data-pid="${esc(p.id)}">
        <div class="thumb" style="background-image:url('${esc(p.image)}')"></div>
        <div class="pinfo"><div class="pname">${esc(p.fullName)}</div>
          <div class="pmeta"><b>${p.price ? m(p.price) : '—'}</b>${SC.stockTag(p)}</div></div>
        <span class="icon-btn sm">${SC.icon('plus', 16)}</span></div>`;
    const quickRow = (it) => `<div class="prow" role="button" tabindex="0" data-qid="${esc(it.id)}">
        <div class="thumb" style="display:grid;place-items:center;color:var(--muted)">${SC.icon('receipt', 22)}</div>
        <div class="pinfo"><div class="pname">${esc(it.name)}</div><div class="pmeta"><b>${it.price ? m(it.price) : 'Set price'}</b><span class="sub">Service / extra</span></div></div>
        <span class="icon-btn sm">${SC.icon('plus', 16)}</span></div>`;

    function drawList() {
      const products = SC.getCachedProducts().list;
      const cats = ['All'].concat(Array.from(new Set(products.map((p) => p.category))));
      const t = term;
      const okTxt = (str) => !t || str.toLowerCase().includes(t);
      const quick = SC.items.all().filter((i) => okTxt(i.name));
      const prods = products.filter((p) => (cat === 'All' || p.category === cat) && okTxt(p.fullName + ' ' + p.category + ' ' + p.type));
      let html = '';
      if (cat === 'All' && quick.length) html += `<div class="card-title" style="margin:6px 0 0">Services &amp; extras</div>` + quick.map(quickRow).join('');
      if (products.length) {
        html += `<div class="card-title" style="margin:10px 0 0">Products</div>` + (prods.length ? prods.map(productRow).join('') : `<div class="empty-mini">No products match.</div>`);
      } else {
        html += `<div class="empty-mini">No products loaded yet.<br><button type="button" class="btn small" data-load style="margin-top:10px">Load products</button><div id="pk-err" class="hint"></div></div>`;
      }
      $('#pk-cats', body).innerHTML = products.length ? cats.map((c) => `<button type="button" class="chip ${cat === c ? 'on' : ''}" data-cat="${esc(c)}">${esc(c)}</button>`).join('') : '';
      $('#pk-list', body).innerHTML = html;
    }
    function showList() {
      view = 'list';
      sh.setTitle('Add items');
      body.innerHTML = `<div class="sheet-search"><div class="searchbox">${SC.icon('search', 18)}<input id="pk-q" type="search" placeholder="Search products" autocomplete="off" value="${esc(term)}"></div></div>
        <div class="chips" id="pk-cats"></div><div class="list" id="pk-list"></div>`;
      drawList();
    }
    function showVariant() {
      view = 'variant';
      const p = vp;
      sh.setTitle('Choose options');
      const chips = (arr, key, cur) => arr.map((v) => `<button type="button" class="chip ${cur === v ? 'on' : ''}" data-${key}="${esc(v)}">${esc(v)}</button>`).join('');
      body.innerHTML = `<img class="pd-img" src="${esc(SC.variantImage(p, vColor))}" alt="">
        <div class="pname" style="margin:12px 0 2px;font-size:17px">${esc(p.fullName)}</div>
        <div class="pmeta"><b>${p.price ? m(p.price) : '—'}</b>${SC.stockTag(p)}</div>
        ${p.colors.length ? `<div class="field" style="margin-top:14px"><label>Colour</label><div class="chips" style="flex-wrap:wrap">${chips(p.colors, 'color', vColor)}</div></div>` : ''}
        ${p.sizes.length ? `<div class="field"><label>Size</label><div class="chips" style="flex-wrap:wrap">${chips(p.sizes, 'size', vSize)}</div></div>` : ''}
        <div class="field"><label>Quantity</label><div class="stepper" style="width:fit-content"><button type="button" data-qd>−</button>
          <input value="${vQty}" readonly aria-label="Quantity"><button type="button" data-qi>+</button></div></div>
        <div class="btn-row"><button type="button" class="btn" data-vback>Back</button><button type="button" class="btn primary" data-addv>Add to ${KIND().toLowerCase()}</button></div>`;
    }
    function chooseProduct(p) {
      if (p.colors.length > 1 || p.sizes.length > 1) {
        vp = p; vColor = p.colors[0] || ''; vSize = p.sizes[0] || ''; vQty = 1;
        showVariant();
      } else {
        addLine({ name: p.fullName, price: p.price, qty: 1, pid: p.id, variant: [p.colors[0], p.sizes[0]].filter(Boolean).join(' · ') });
        SC.toast('Added ' + p.name);
      }
    }

    body.addEventListener('input', (e) => { if (e.target.id === 'pk-q') { term = e.target.value.trim().toLowerCase(); drawList(); } });
    body.addEventListener('click', async (e) => {
      const t = e.target;
      let el;
      if ((el = t.closest('[data-pid]'))) { const p = SC.getCachedProducts().list.find((x) => x.id === el.dataset.pid); if (p) chooseProduct(p); return; }
      if ((el = t.closest('[data-qid]'))) {
        const it = SC.items.get(el.dataset.qid);
        if (it) { addLine({ name: it.name, price: it.price, qty: 1 }); SC.toast('Added ' + it.name); }
        return;
      }
      if ((el = t.closest('[data-cat]'))) { cat = el.dataset.cat; drawList(); return; }
      if (t.closest('[data-load]')) {
        t.closest('[data-load]').disabled = true;
        const r = await SC.refreshProducts();
        if (r.ok) drawList();
        else { drawList(); const er = $('#pk-err', body); if (er) er.textContent = 'Could not load products. Try again in a moment.'; }
        return;
      }
      if (view === 'variant') {
        if ((el = t.closest('[data-color]'))) { vColor = el.dataset.color; showVariant(); return; }
        if ((el = t.closest('[data-size]'))) { vSize = el.dataset.size; showVariant(); return; }
        if (t.closest('[data-qd]')) { vQty = Math.max(1, vQty - 1); showVariant(); return; }
        if (t.closest('[data-qi]')) { vQty += 1; showVariant(); return; }
        if (t.closest('[data-vback]')) { showList(); return; }
        if (t.closest('[data-addv]')) {
          addLine({ name: vp.fullName, price: vp.price, qty: vQty, pid: vp.id, variant: [vColor, vSize].filter(Boolean).join(' · ') });
          SC.toast('Added ' + vp.name);
          showList();
        }
      }
    });

    showList();
    if (start) chooseProduct(start);
    // Pick up any product changes in the background.
    SC.refreshProducts().then((r) => { if (!r.ok) return; if (!doc.items.length) drawItems(); if (view === 'list' && SC.sheet && $('#pk-list')) drawList(); });
  }

  /* ---------- adjustments ---------- */
  function drawAdjust() {
    const d = doc.discount || { type: 'amount', value: 0 };
    const val = (v) => (num(v) ? String(num(v)) : '');
    $('#sec-adjust').innerHTML = `<div class="card-title">Adjustments</div>
      <div class="field"><label for="a-disc">Discount</label><div class="inline">
        <div class="seg mini" id="a-dtype"><button type="button" data-t="amount" class="${d.type === 'amount' ? 'on' : ''}">${esc(s.currencySymbol)}</button><button type="button" data-t="percent" class="${d.type === 'percent' ? 'on' : ''}">%</button></div>
        <input id="a-disc" inputmode="decimal" placeholder="0" value="${val(d.value)}"></div></div>
      <div class="grid2">
        <div class="field"><label for="a-tax">${esc(s.taxName)} rate (%)</label><input id="a-tax" inputmode="decimal" placeholder="0" value="${val(doc.taxRate)}"></div>
        <div class="field"><label for="a-ship">Delivery (${esc(s.currencySymbol)})</label><input id="a-ship" inputmode="decimal" placeholder="0" value="${val(doc.shipping)}"></div>
      </div>
      ${doc.type === 'receipt' ? '' : `<div class="field"><label for="a-dep">Deposit required (${esc(s.currencySymbol)})</label><input id="a-dep" inputmode="decimal" placeholder="0" value="${val(doc.deposit)}"></div>`}`;
  }
  $('#sec-adjust').addEventListener('input', (e) => {
    const id = e.target.id;
    if (id === 'a-disc') doc.discount = Object.assign({ type: 'amount' }, doc.discount, { value: num(e.target.value) });
    if (id === 'a-tax') doc.taxRate = num(e.target.value);
    if (id === 'a-ship') doc.shipping = num(e.target.value);
    if (id === 'a-dep') doc.deposit = num(e.target.value);
    drawTotals();
  });
  $('#sec-adjust').addEventListener('click', (e) => {
    const b = e.target.closest('#a-dtype [data-t]');
    if (!b) return;
    doc.discount = Object.assign({ value: 0 }, doc.discount, { type: b.dataset.t });
    $('#a-dtype').querySelectorAll('button').forEach((x) => x.classList.toggle('on', x === b));
    drawTotals();
  });

  /* ---------- receipt payment ---------- */
  function drawPay() {
    const sec = $('#sec-pay');
    sec.hidden = doc.type !== 'receipt';
    if (sec.hidden) return;
    const p = doc.payment || (doc.payment = { method: 'Cash', reference: '', date: SC.todayISO() });
    sec.innerHTML = `<div class="card-title">Payment received</div>
      <div class="grid2">
        <div class="field"><label for="p-method">Method</label><select id="p-method">${SC.METHODS.map((x) => `<option ${p.method === x ? 'selected' : ''}>${esc(x)}</option>`).join('')}</select></div>
        <div class="field"><label for="p-date">Date</label><input id="p-date" type="date" value="${esc(p.date)}"></div>
      </div>
      <div class="field"><label for="p-ref">Reference</label><input id="p-ref" value="${esc(p.reference)}" placeholder="Transaction or cheque number" autocomplete="off"></div>`;
  }
  $('#sec-pay').addEventListener('input', (e) => {
    doc.payment = doc.payment || {};
    if (e.target.id === 'p-method') doc.payment.method = e.target.value;
    if (e.target.id === 'p-date') doc.payment.date = e.target.value;
    if (e.target.id === 'p-ref') doc.payment.reference = e.target.value;
  });

  /* ---------- notes ---------- */
  function drawNotes() {
    const isRc = doc.type === 'receipt';
    $('#sec-notes').innerHTML = `<div class="card-title">Notes</div>
      <div class="field"><label for="n-notes">Note to customer</label><textarea id="n-notes" placeholder="Optional">${esc(doc.notes)}</textarea></div>
      ${isRc ? '' : `<div class="field"><label for="n-terms">Terms</label><textarea id="n-terms" placeholder="Optional">${esc(doc.terms)}</textarea></div>`}
      <div class="field"><label for="n-pay">${isRc ? 'Paid to' : 'Payment details'}</label><textarea id="n-pay" placeholder="Bank, account number, Linx…">${esc(doc.paymentDetails)}</textarea></div>`;
  }
  $('#sec-notes').addEventListener('input', (e) => {
    if (e.target.id === 'n-notes') doc.notes = e.target.value;
    if (e.target.id === 'n-terms') doc.terms = e.target.value;
    if (e.target.id === 'n-pay') doc.paymentDetails = e.target.value;
  });

  /* ---------- totals ---------- */
  function drawTotals() {
    const c = SC.calc(doc);
    const row = (a, b, cls) => `<div class="trow ${cls || ''}"><span>${a}</span><span>${b}</span></div>`;
    let h = row('Subtotal', m(c.subtotal));
    if (c.discount > 0) h += row('Discount', '-' + m(c.discount));
    if (c.taxAmount > 0) h += row(`${esc(s.taxName)} (${num(doc.taxRate)}%)`, m(c.taxAmount));
    if (c.shipping > 0) h += row('Delivery', m(c.shipping));
    h += row('Total', m(c.total), 'total');
    if (doc.type !== 'receipt' && c.paid > 0) h += row('Paid so far', '-' + m(c.paid)) + row('Balance', m(c.balance));
    if (doc.type !== 'receipt' && num(doc.deposit) > 0) h += row('Deposit required', m(doc.deposit));
    $('#sec-totals').innerHTML = h;
    $('#sb-total').textContent = m(c.total);
  }

  /* ---------- save ---------- */
  $('#save').addEventListener('click', () => {
    if (!(doc.customer && doc.customer.name && doc.customer.name.trim())) {
      SC.toast('Add a customer first');
      $('#sec-cust').scrollIntoView({ behavior: 'smooth', block: 'center' });
      return;
    }
    const items = doc.items.filter((i) => String(i.name || '').trim() || num(i.price));
    if (!items.length) { SC.toast('Add at least one item'); $('#sec-items').scrollIntoView({ behavior: 'smooth', block: 'center' }); return; }
    items.forEach((i) => { if (!String(i.name || '').trim()) i.name = 'Item'; });
    doc.items = items;
    s.paymentDetails = doc.paymentDetails || '';
    SC.saveSettings(s);
    doc.number = String(doc.number || '').trim() || SC.suggestNumber(doc.type, s);
    const used = () => SC.docs.all().some((d) => d.id !== doc.id && d.type === doc.type && d.number === doc.number);
    // an automatic number that was taken meanwhile just moves up to the next free one
    if (!numEdited && !isEdit) { for (let k = 0; k < 500 && used(); k++) doc.number = SC.suggestNumber(doc.type, Object.assign({}, s, { [{ invoice: 'nextInvoice', estimate: 'nextEstimate', receipt: 'nextReceipt' }[doc.type]]: (parseInt(/(\d+)\s*$/.exec(doc.number)[1], 10) || 0) + 1 })); }
    if (used()) {
      SC.toast(`${KIND()} number ${doc.number} is already used`);
      $('#d-num').focus();
      return;
    }
    if (doc.type === 'receipt') { doc.payment = doc.payment || {}; doc.payment.date = doc.payment.date || doc.issueDate; }
    SC.docs.save(doc);
    location.replace('view.html?id=' + encodeURIComponent(doc.id));
  });

  function drawAll() {
    drawType(); drawDetails(); drawCust(); drawItems(); drawAdjust(); drawPay(); drawNotes(); drawTotals();
  }

  title();
  drawAll();
  SC.refreshProducts();

  // Deep links: ?customer=<id> (from Customers) and ?product=<id> (from Products).
  const cid = qs.get('customer');
  if (cid && !isEdit) { const c = SC.customers.get(cid); if (c) setCustomer(c); }
  const pid = qs.get('product');
  if (pid && !isEdit) { const p = SC.getCachedProducts().list.find((x) => x.id === pid); if (p) openPicker(p); }
})();
