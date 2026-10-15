/* home.js — Documents list: summary with a period calendar, search, filters. */
(function () {
  'use strict';
  const SC = window.SC;
  const { esc, $ } = SC;

  SC.mountShell();
  const s = SC.getSettings();
  const main = $('#main');
  const docs = SC.docs.all().slice().sort((a, b) => (b.issueDate || '').localeCompare(a.issueDate || '') || (b.createdAt || 0) - (a.createdAt || 0));

  const FILTERS = [
    ['invoice', 'Invoices'], ['estimate', 'Estimates'], ['sent', 'Sent'], ['paid', 'Paid'],
    ['overdue', 'Overdue'], ['partial', 'Partial'], ['receipt', 'Receipts']
  ];
  let filter = 'invoice';
  let term = '';

  /* ---------- period ---------- */
  const pad = (n) => String(n).padStart(2, '0');
  const iso = (y, m, d) => `${y}-${pad(m + 1)}-${pad(d)}`;
  const isoOf = (dt) => iso(dt.getFullYear(), dt.getMonth(), dt.getDate());
  const PRESETS = [['all', 'All time'], ['today', 'Today'], ['week', 'This week'], ['month', 'This month'], ['lastmonth', 'Last month'], ['year', 'This year']];
  function presetRange(k) {
    const n = new Date();
    const y = n.getFullYear(), m = n.getMonth();
    if (k === 'today') return [isoOf(n), isoOf(n)];
    if (k === 'week') { const a = new Date(n); a.setDate(n.getDate() - n.getDay()); const b = new Date(a); b.setDate(a.getDate() + 6); return [isoOf(a), isoOf(b)]; }
    if (k === 'month') return [iso(y, m, 1), isoOf(new Date(y, m + 1, 0))];
    if (k === 'lastmonth') return [isoOf(new Date(y, m - 1, 1)), isoOf(new Date(y, m, 0))];
    if (k === 'year') return [iso(y, 0, 1), iso(y, 11, 31)];
    return ['', ''];
  }
  let period = { key: 'all', from: '', to: '' };
  try { const saved = JSON.parse(localStorage.getItem('sc.period') || 'null'); if (saved && saved.key) period = saved; } catch (e) { /* ignore */ }
  if (period.key !== 'all' && period.key !== 'custom') { const r = presetRange(period.key); period.from = r[0]; period.to = r[1]; }
  const savePeriod = () => { try { localStorage.setItem('sc.period', JSON.stringify(period)); } catch (e) { /* ignore */ } };
  const MON = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  const nice = (d) => { const [y, m, dd] = d.split('-').map(Number); return `${dd} ${MON[m - 1]} ${y}`; };
  function periodLabel() {
    if (period.key === 'custom') return period.from === period.to ? nice(period.from) : `${nice(period.from)} – ${nice(period.to)}`;
    return (PRESETS.find((p) => p[0] === period.key) || PRESETS[0])[1];
  }
  const inPeriod = (d) => (!period.from || d.issueDate >= period.from) && (!period.to || d.issueDate <= period.to);

  /* ---------- list ---------- */
  function inFilter(d, f) {
    if (f === 'estimate') return d.type === 'estimate';
    if (f === 'receipt') return d.type === 'receipt';
    if (f === 'invoice') return d.type === 'invoice';
    return d.type === 'invoice' && SC.statusOf(d) === f;
  }
  function matches(d) {
    if (!inPeriod(d) || !inFilter(d, filter)) return false;
    if (!term) return true;
    const hay = [d.number, d.customer && d.customer.name, ...(d.items || []).map((i) => i.name)].join(' ').toLowerCase();
    return hay.includes(term);
  }

  function row(d) {
    const c = SC.calc(d);
    const name = (d.customer && d.customer.name) || 'No customer';
    const st = SC.statusOf(d);
    const ic = d.type === 'estimate' ? 'edit' : d.type === 'receipt' ? 'receipt' : st === 'paid' ? 'check' : 'docs';
    return `<a class="docrow" href="pages/view.html?id=${encodeURIComponent(d.id)}">
      <span class="dr-ico ${d.type === 'invoice' ? st : d.type}">${SC.icon(ic, 20)}</span>
      <div class="dr-main"><div class="dr-name">${esc(name)}</div>
        <div class="dr-meta">${SC.TYPE_LABEL[d.type]} #${esc(d.number)} · ${esc(SC.fmtDate(d.issueDate))}</div></div>
      <div class="dr-amt"><strong>${SC.money(c.total, s)}</strong>${SC.badge(SC.statusOf(d))}</div>
    </a>`;
  }

  function drawList() {
    const list = docs.filter(matches);
    $('#list').innerHTML = list.length
      ? list.map(row).join('')
      : docs.length
        ? `<div class="empty-mini">Nothing here for ${period.key === 'all' ? 'this filter' : 'this period'}.</div>`
        : `<div class="empty"><h3>No documents yet</h3><p>Create your first invoice using the products from your store.</p>
            <a class="btn primary" href="pages/new.html?type=invoice">${SC.icon('plus', 18)} New invoice</a></div>`;
  }

  function drawChips() {
    $('#chips').innerHTML = FILTERS.map(([k, label]) => {
      const n = docs.filter((d) => inPeriod(d) && inFilter(d, k)).length;
      return `<button type="button" class="chip ${filter === k ? 'on' : ''}" data-f="${k}">${label}${n ? `<i>${n}</i>` : ''}</button>`;
    }).join('');
  }

  function countUp() {
    const els = document.querySelectorAll('[data-amt]');
    const t0 = performance.now();
    const tick = (now) => {
      const k = Math.min(1, (now - t0) / 700), e = 1 - Math.pow(1 - k, 3);
      els.forEach((el) => { el.textContent = SC.money(+el.dataset.amt * e, s); });
      if (k < 1) requestAnimationFrame(tick);
    };
    if (matchMedia('(prefers-reduced-motion: reduce)').matches) return;
    requestAnimationFrame(tick);
  }
  function drawSum() {
    const sum = SC.summaryRange(docs, period.from, period.to);
    $('#sum').innerHTML = `
      <div class="sum-top"><div class="sum-main"><span>Outstanding</span><strong data-amt="${sum.outstanding}">${SC.money(sum.outstanding, s)}</strong></div>
        <button type="button" class="period-btn" id="period-btn">${SC.icon('calendar', 16)}<span>${esc(periodLabel())}</span></button></div>
      <div class="sum-grid three">
        <div class="sum-item"><span>Invoiced</span><strong data-amt="${sum.invoiced}">${SC.money(sum.invoiced, s)}</strong></div>
        <div class="sum-item ok"><span>Paid</span><strong data-amt="${sum.paid}">${SC.money(sum.paid, s)}</strong></div>
        <div class="sum-item bad"><span>Overdue</span><strong data-amt="${sum.overdue}">${SC.money(sum.overdue, s)}</strong></div>
      </div>`;
    countUp();
  }

  /* ---------- calendar sheet ---------- */
  function openPeriod() {
    let from = period.from, to = period.to;
    const base = from ? new Date(from + 'T00:00:00') : new Date();
    let vy = base.getFullYear(), vm = base.getMonth();
    let key = period.key;
    const today = SC.todayISO();
    const sh = SC.sheet.open({
      title: 'Choose period',
      body: '',
      footer: `<button type="button" class="btn" data-clear>All time</button><button type="button" class="btn primary" data-apply>Apply</button>`
    });
    function draw() {
      const first = new Date(vy, vm, 1).getDay();
      const days = new Date(vy, vm + 1, 0).getDate();
      let cells = '';
      for (let i = 0; i < first; i++) cells += '<span></span>';
      for (let d = 1; d <= days; d++) {
        const v = iso(vy, vm, d);
        const edge = v === from || v === to;
        const mid = from && to && v > from && v < to;
        cells += `<button type="button" class="cal-day ${edge ? 'edge' : ''} ${mid ? 'mid' : ''} ${v === today ? 'today' : ''} ${from && to && v === from && from !== to ? 'first' : ''} ${from && to && v === to && from !== to ? 'last' : ''}" data-d="${v}">${d}</button>`;
      }
      sh.setBody(`
        <div class="chips">${PRESETS.map(([k, l]) => `<button type="button" class="chip ${key === k ? 'on' : ''}" data-p="${k}">${l}</button>`).join('')}</div>
        <div class="cal">
          <div class="cal-head"><button type="button" class="icon-btn sm" data-m="-1" aria-label="Previous month">${SC.icon('back', 16)}</button>
            <strong>${MON[vm]} ${vy}</strong>
            <button type="button" class="icon-btn sm" data-m="1" aria-label="Next month">${SC.icon('chev', 16)}</button></div>
          <div class="cal-week">${['S', 'M', 'T', 'W', 'T', 'F', 'S'].map((x) => `<span>${x}</span>`).join('')}</div>
          <div class="cal-grid">${cells}</div>
        </div>
        <p class="hint" style="text-align:center;margin-top:10px">${from ? (to && to !== from ? `${nice(from)} – ${nice(to)}` : nice(from)) : 'Tap a start date, then an end date'}</p>`);
    }
    draw();
    sh.el.addEventListener('click', (e) => {
      let el;
      if ((el = e.target.closest('[data-m]'))) { vm += +el.dataset.m; if (vm < 0) { vm = 11; vy -= 1; } if (vm > 11) { vm = 0; vy += 1; } draw(); }
      else if ((el = e.target.closest('[data-p]'))) {
        key = el.dataset.p;
        const r = presetRange(key); from = r[0]; to = r[1];
        if (from) { const b = new Date(from + 'T00:00:00'); vy = b.getFullYear(); vm = b.getMonth(); }
        draw();
      }
      else if ((el = e.target.closest('[data-d]'))) {
        const d = el.dataset.d;
        key = 'custom';
        if (!from || to) { from = d; to = ''; }
        else if (d < from) { to = from; from = d; }
        else to = d;
        draw();
      }
      else if (e.target.closest('[data-clear]')) { period = { key: 'all', from: '', to: '' }; savePeriod(); sh.close(); refreshAll(); }
      else if (e.target.closest('[data-apply]')) {
        if (from && !to) to = from;
        period = key === 'custom' && from ? { key: 'custom', from, to } : { key: key || 'all', from: from || '', to: to || '' };
        savePeriod(); sh.close(); refreshAll();
      }
    });
  }

  main.innerHTML = `
    <section class="sumcard" id="sum"></section>
    <div class="searchbox">${SC.icon('search', 18)}<input id="q" type="search" placeholder="Search name, number or item" autocomplete="off"></div>
    <div class="chips" id="chips"></div>
    <div class="list" id="list"></div>`;

  function refreshAll() { drawSum(); drawChips(); drawList(); }
  refreshAll();
  $('#q').addEventListener('input', (e) => { term = e.target.value.trim().toLowerCase(); drawList(); });
  main.addEventListener('click', (e) => { if (e.target.closest('#period-btn')) openPeriod(); });
  $('#chips').addEventListener('click', (e) => {
    const b = e.target.closest('[data-f]');
    if (!b) return;
    filter = b.dataset.f;
    drawChips();
    drawList();
  });

  // Quietly keep the product list fresh in the background.
  SC.refreshProducts();
})();
