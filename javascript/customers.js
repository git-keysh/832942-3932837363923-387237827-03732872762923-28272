/* customers.js — customer list with quick “new invoice” links. */
(function () {
  'use strict';
  const SC = window.SC;
  const { esc, $ } = SC;

  SC.mountShell();
  const s = SC.getSettings();
  const main = $('#main');

  let term = '';
  const nDue = SC.dueSoon().length;
  main.innerHTML = `<div class="seg" id="tabs"><button type="button" data-tab="c" class="on">Customers</button><button type="button" data-tab="r">Reminders${nDue ? `<i class="tab-n">${nDue}</i>` : ''}</button></div>
    <div id="v-cust" class="view-stack"><div class="searchbox">${SC.icon('search', 18)}<input id="q" type="search" placeholder="Search customers" autocomplete="off"></div><div class="list" id="list"></div></div>
    <div id="v-rem" class="view-stack" hidden></div>`;
  let remView = null;
  function showTab(k) {
    $('#v-cust').hidden = k !== 'c';
    $('#v-rem').hidden = k !== 'r';
    document.querySelectorAll('#tabs button').forEach((b) => b.classList.toggle('on', b.dataset.tab === k));
    SC.setTitle(k === 'r' ? 'Reminders' : 'Customers');
    if (k === 'r') {
      if (!remView) remView = SC.remindersView($('#v-rem'));
      else remView.redraw();
    }
    $('#tb-actions').innerHTML = `<button type="button" class="icon-btn" id="tb-add" aria-label="${k === 'r' ? 'New reminder' : 'New customer'}">${SC.icon('plus')}</button>`;
    $('#tb-add').addEventListener('click', () => (k === 'r' ? SC.editReminder({ date: SC.todayISO() }, () => remView && remView.redraw()) : add()));
  }
  $('#tabs').addEventListener('click', (e) => { const b = e.target.closest('[data-tab]'); if (b) showTab(b.dataset.tab); });

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
    const TABS = [['all', 'All'], ['invoice', 'Invoices'], ['estimate', 'Estimates'], ['receipt', 'Receipts'], ['rem', 'Reminders']];
    const sh = SC.sheet.open({
      title: c.name,
      body: '',
      footer: `<button type="button" class="btn" data-edit>${SC.icon('edit', 18)} Edit</button><a class="btn primary" href="new.html?type=invoice&customer=${encodeURIComponent(c.id)}">${SC.icon('plus', 18)} New invoice</a>`
    });
    function draw() {
      if (tab === 'rem') {
        const its = SC.dueItems().filter((i) => i.customerId === c.id || i.customer === c.name);
        sh.setBody(`<div class="chips">${TABS.map(([k, l]) => `<button type="button" class="chip ${tab === k ? 'on' : ''}" data-tab="${k}">${l}</button>`).join('')}</div>
          <div class="list" style="margin-top:8px">${its.length ? its.map((it, i) => `<div class="due-row ${it.days < 0 ? 'late' : it.days <= 3 ? 'soon' : ''}" role="button" tabindex="0" data-ritem="${i}">
            <span class="dr-ico ${it.kind === 'install' ? 'sent' : it.days < 0 ? 'overdue' : 'partial'}">${SC.icon(SC.KIND[it.kind][1], 20)}</span>
            <div class="dr-main"><div class="dr-name">${esc(it.title)}</div><div class="dr-meta">${esc(SC.fmtDate(it.date))}${it.amount ? ' · ' + SC.money(it.amount, s) : ''}</div><div class="due-when">${esc(SC.whenLabel(it.days))}</div></div>
            <button type="button" class="btn small" data-rremind="${i}">Remind</button></div>`).join('') : `<div class="empty-mini">No reminders for ${esc(c.name)}.</div>`}</div>
          <button type="button" class="btn block" id="h-addrem" style="margin-top:12px">${SC.icon('plus', 18)} Add reminder</button>`);
        sh._its = its;
        return;
      }
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
      let el;
      if ((el = e.target.closest('[data-rremind]'))) { e.stopPropagation(); SC.remindCustomer(sh._its[+el.dataset.rremind]); return; }
      if ((el = e.target.closest('[data-ritem]'))) { const it = sh._its[+el.dataset.ritem]; SC.editReminder(it.auto ? it : SC.reminders.get(it.reminderId), draw); return; }
      if (e.target.closest('#h-addrem')) { SC.editReminder({ customerId: c.id, customer: c.name, date: SC.todayISO() }, draw); return; }
      if (e.target.closest('[data-edit]')) { sh.close(); setTimeout(() => SC.editCustomer(SC.customers.get(c.id), { canDelete: true, onSave: draw0, onDelete: draw0 }), 280); }
    });
  }
  const draw0 = () => draw();

  const add = () => SC.editCustomer({}, { onSave: draw });
  main.addEventListener('click', (e) => {
    const op = e.target.closest('[data-open]');
    if (op) openHistory(SC.customers.get(op.dataset.open));
    else if (e.target.closest('#empty-add')) add();
  });
  $('#q').addEventListener('input', (e) => { term = e.target.value.trim().toLowerCase(); draw(); });
  draw();
  showTab(new URLSearchParams(location.search).get('tab') === 'reminders' ? 'r' : 'c');
})();
