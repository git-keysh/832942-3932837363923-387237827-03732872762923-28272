/* customers.js — customer list with quick “new invoice” links. */
(function () {
  'use strict';
  const SC = window.SC;
  const { esc, $ } = SC;

  SC.mountShell();
  const s = SC.getSettings();
  const main = $('#main');
  $('#tb-actions').innerHTML = `<button type="button" class="icon-btn" id="tb-add" aria-label="New customer">${SC.icon('plus')}</button>`;

  let term = '';
  main.innerHTML = `<div class="searchbox">${SC.icon('search', 18)}<input id="q" type="search" placeholder="Search customers" autocomplete="off"></div><div class="list" id="list"></div>`;

  function stats(c) {
    let count = 0, owing = 0;
    SC.docs.all().forEach((d) => {
      if (d.customerId !== c.id && !(d.customer && d.customer.name === c.name)) return;
      count += 1;
      if (d.type === 'invoice') owing += SC.calc(d).balance * (['sent', 'partial', 'overdue'].includes(SC.statusOf(d)) ? 1 : 0);
    });
    return { count, owing: SC.round2(owing) };
  }

  function draw() {
    const all = SC.customers.all();
    const list = all.filter((c) => !term || (c.name + ' ' + c.phone + ' ' + c.email).toLowerCase().includes(term)).sort((a, b) => a.name.localeCompare(b.name));
    $('#list').innerHTML = list.length
      ? list.map((c) => {
          const st = stats(c);
          return `<div class="docrow">
            <div class="avatar">${esc(SC.initials(c.name))}</div>
            <div class="dr-main" role="button" tabindex="0" data-open="${esc(c.id)}"><div class="dr-name">${esc(c.name)}</div>
              <div class="dr-meta">${esc(c.phone || c.email || 'No contact details')}${st.count ? ` · ${st.count} doc${st.count === 1 ? '' : 's'}` : ''}${st.owing > 0 ? ` · owes ${SC.money(st.owing, s)}` : ''}</div></div>
            <a class="btn small" href="new.html?type=invoice&customer=${encodeURIComponent(c.id)}">Invoice</a></div>`;
        }).join('')
      : all.length
        ? `<div class="empty-mini">No customers match.</div>`
        : `<div class="empty"><h3>No customers yet</h3><p>Add customers once and pick them in a tap when invoicing.</p>
            <button type="button" class="btn primary" id="empty-add">${SC.icon('plus', 18)} Add customer</button></div>`;
  }

  function docsOf(c) {
    return SC.docs.all().filter((d) => d.customerId === c.id || (d.customer && d.customer.name === c.name))
      .sort((a, b) => (b.issueDate || '').localeCompare(a.issueDate || '') || (b.createdAt || 0) - (a.createdAt || 0));
  }
  function openHistory(c) {
    const st = stats(c);
    let tab = 'all';
    const all = docsOf(c);
    const TABS = [['all', 'All'], ['invoice', 'Invoices'], ['estimate', 'Estimates'], ['receipt', 'Receipts']];
    const sh = SC.sheet.open({
      title: c.name,
      body: '',
      footer: `<button type="button" class="btn" data-edit>${SC.icon('edit', 18)} Edit</button><a class="btn primary" href="new.html?type=invoice&customer=${encodeURIComponent(c.id)}">${SC.icon('plus', 18)} New invoice</a>`
    });
    function draw() {
      const list = all.filter((d) => tab === 'all' || d.type === tab);
      sh.setBody(`
        <div class="hist-sum"><div><span>Documents</span><strong>${st.count}</strong></div><div><span>Owes</span><strong>${SC.money(st.owing, s)}</strong></div></div>
        <div class="chips">${TABS.map(([k, l]) => `<button type="button" class="chip ${tab === k ? 'on' : ''}" data-tab="${k}">${l}</button>`).join('')}</div>
        <div class="list" style="margin-top:8px">${list.length ? list.map((d) => `<a class="prow" href="view.html?id=${encodeURIComponent(d.id)}">
          <div class="pinfo"><div class="pname">${SC.TYPE_LABEL[d.type]} #${esc(d.number)}</div><div class="pmeta"><span class="sub">${esc(SC.fmtDate(d.issueDate))}</span>${SC.badge(SC.statusOf(d))}</div></div>
          <b>${SC.money(SC.calc(d).total, s)}</b>${SC.icon('chev', 18)}</a>`).join('') : `<div class="empty-mini">Nothing here yet.</div>`}</div>`);
    }
    draw();
    sh.el.addEventListener('click', (e) => {
      const tb = e.target.closest('[data-tab]');
      if (tb) { tab = tb.dataset.tab; draw(); return; }
      if (e.target.closest('[data-edit]')) { sh.close(); setTimeout(() => SC.editCustomer(SC.customers.get(c.id), { canDelete: true, onSave: draw0, onDelete: draw0 }), 280); }
    });
  }
  const draw0 = () => draw();

  const add = () => SC.editCustomer({}, { onSave: draw });
  $('#tb-add').addEventListener('click', add);
  main.addEventListener('click', (e) => {
    const op = e.target.closest('[data-open]');
    if (op) openHistory(SC.customers.get(op.dataset.open));
    else if (e.target.closest('#empty-add')) add();
  });
  $('#q').addEventListener('input', (e) => { term = e.target.value.trim().toLowerCase(); draw(); });
  draw();
})();
