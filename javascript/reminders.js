/* reminders.js — the Reminders view in the Customers tab: an editable month calendar,
   the day's agenda, upcoming dates, and the editor for payments / installs / other. */
(function (root) {
  'use strict';
  const SC = root.SC;
  const { esc, num, $ } = SC;
  const MON = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
  const pad = (n) => String(n).padStart(2, '0');
  const iso = (y, m, d) => `${y}-${pad(m + 1)}-${pad(d)}`;
  const dayName = (d) => new Date(d + 'T00:00:00').toLocaleDateString(undefined, { weekday: 'long', day: 'numeric', month: 'long' });

  // month grid; marks = { 'YYYY-MM-DD': ['payment', 'install'] }
  function gridHTML(y, m, sel, marks, today) {
    const first = new Date(y, m, 1).getDay(), days = new Date(y, m + 1, 0).getDate();
    let cells = '';
    for (let i = 0; i < first; i++) cells += '<span></span>';
    for (let d = 1; d <= days; d++) {
      const v = iso(y, m, d), mk = (marks && marks[v]) || [];
      cells += `<button type="button" class="cal-day ${v === sel ? 'edge' : ''} ${v === today ? 'today' : ''}" data-d="${v}">${d}${mk.length ? `<i class="dots">${mk.slice(0, 3).map((k) => `<b class="${k}"></b>`).join('')}</i>` : ''}</button>`;
    }
    return `<div class="cal-week">${['S', 'M', 'T', 'W', 'T', 'F', 'S'].map((x) => `<span>${x}</span>`).join('')}</div><div class="cal-grid">${cells}</div>`;
  }

  /* ---------- editor ---------- */
  SC.editReminder = (init, onChange) => {
    const s = SC.getSettings();
    const today = SC.todayISO();
    const auto = init && init.auto;
    const doc = auto ? SC.docs.get(init.docId) : null;
    const cur = Object.assign({ id: '', kind: 'payment', title: '', customerId: '', customer: '', date: today, time: '', amount: 0, note: '', docId: '', done: false }, auto ? { date: init.date } : init);
    if (auto && !doc) return;
    let y = +cur.date.slice(0, 4), m = +cur.date.slice(5, 7) - 1;
    const sh = SC.sheet.open({ title: auto ? `Invoice #${doc.number} due date` : cur.id ? 'Edit reminder' : 'New reminder', body: '', footer: '' });

    function foot() {
      sh.el.querySelector('.sheet-foot') && sh.el.querySelector('.sheet-foot').remove();
      const f = document.createElement('div');
      f.className = 'sheet-foot';
      f.innerHTML = auto
        ? `<button type="button" class="btn" data-remind>Remind customer</button><button type="button" class="btn primary" data-save>Save date</button>`
        : (cur.id ? `<button type="button" class="btn danger" data-del>Delete</button>` : '') + `<button type="button" class="btn primary" data-save>${cur.id ? 'Save' : 'Add reminder'}</button>`;
      sh.el.append(f);
    }
    const invoicesFor = () => SC.docs.all().filter((d) => d.type === 'invoice' && SC.statusOf(d) !== 'paid' && ((cur.customerId && d.customerId === cur.customerId) || (!cur.customerId && !cur.customer ? true : d.customer && d.customer.name === cur.customer)));

    function draw() {
      const chips = [['Today', 0], ['Tomorrow', 1], ['In a week', 7], ['In 2 weeks', 14], ['In a month', 30]];
      const custs = SC.customers.all().slice().sort((a, b) => a.name.localeCompare(b.name));
      const invs = invoicesFor();
      sh.setBody(`
        ${auto ? '' : `<div class="seg" id="r-kind">${Object.keys(SC.KIND).map((k) => `<button type="button" data-k="${k}" class="${cur.kind === k ? 'on' : ''}">${SC.KIND[k][0]}</button>`).join('')}</div>
        <div class="field" style="margin-top:14px"><label for="r-title">What</label><input id="r-title" value="${esc(cur.title)}" placeholder="${cur.kind === 'install' ? 'e.g. Install subwoofer + amp' : cur.kind === 'payment' ? 'e.g. Second payment' : 'e.g. Follow up'}" autocomplete="off"></div>
        <div class="field"><label for="r-cust">Customer</label><select id="r-cust"><option value="">No customer</option>${custs.map((c) => `<option value="${esc(c.id)}" ${cur.customerId === c.id ? 'selected' : ''}>${esc(c.name)}</option>`).join('')}</select></div>`}
        <div class="field"><label>Date</label>
          <div class="chips" id="r-chips">${chips.map(([l, n]) => `<button type="button" class="chip" data-add="${n}">${l}</button>`).join('')}</div>
          <div class="cal mini">
            <div class="cal-head"><button type="button" class="icon-btn sm" data-m="-1" aria-label="Previous month">${SC.icon('back', 16)}</button><strong>${MON[m]} ${y}</strong><button type="button" class="icon-btn sm" data-m="1" aria-label="Next month">${SC.icon('chev', 16)}</button></div>
            ${gridHTML(y, m, cur.date, null, today)}
          </div>
          <p class="hint" style="text-align:center;margin-top:6px"><b>${esc(dayName(cur.date))}</b></p>
        </div>
        ${auto ? `<p class="hint">Changing this moves the due date on the invoice itself.</p>` : `
        <div class="grid2"><div class="field"><label for="r-time">Time (optional)</label><input id="r-time" type="time" value="${esc(cur.time)}"></div>
          <div class="field"><label for="r-amt">Amount (${esc(s.currencySymbol)})</label><input id="r-amt" inputmode="decimal" value="${cur.amount || ''}" placeholder="0"></div></div>
        ${invs.length && cur.kind === 'payment' ? `<div class="field"><label for="r-doc">Linked invoice</label><select id="r-doc"><option value="">None</option>${invs.map((d) => `<option value="${esc(d.id)}" ${cur.docId === d.id ? 'selected' : ''}>#${esc(d.number)} · ${SC.money(SC.calc(d).balance, s)} left</option>`).join('')}</select></div>` : ''}
        <div class="field"><label for="r-note">Note</label><textarea id="r-note" placeholder="Optional">${esc(cur.note)}</textarea></div>`}`);
      foot();
    }
    draw();

    sh.el.addEventListener('click', async (e) => {
      let el;
      if ((el = e.target.closest('#r-kind [data-k]'))) { cur.kind = el.dataset.k; collect(); draw(); }
      else if ((el = e.target.closest('[data-m]'))) { collect(); m += +el.dataset.m; if (m < 0) { m = 11; y -= 1; } if (m > 11) { m = 0; y += 1; } draw(); }
      else if ((el = e.target.closest('[data-d]'))) { collect(); cur.date = el.dataset.d; draw(); }
      else if ((el = e.target.closest('[data-add]'))) { collect(); cur.date = SC.addDays(today, +el.dataset.add); y = +cur.date.slice(0, 4); m = +cur.date.slice(5, 7) - 1; draw(); }
      else if (e.target.closest('[data-del]')) { SC.reminders.remove(cur.id); sh.close(); SC.toast('Reminder deleted'); if (onChange) onChange(); }
      else if (e.target.closest('[data-remind]')) { sh.close(); SC.remindCustomer(Object.assign({}, init, { date: cur.date, days: SC.daysUntil(cur.date) })); }
      else if (e.target.closest('[data-save]')) {
        collect();
        if (auto) { doc.dueDate = cur.date; SC.docs.save(doc); }
        else {
          if (!cur.title.trim()) cur.title = SC.KIND[cur.kind][0];
          const c = cur.customerId && SC.customers.get(cur.customerId);
          cur.customer = c ? c.name : cur.customer;
          cur.id = cur.id || SC.uid('rem');
          cur.createdAt = cur.createdAt || Date.now();
          SC.reminders.save(cur);
        }
        sh.close();
        SC.toast(auto ? 'Due date updated' : 'Reminder saved');
        if (SC.notif) SC.notif.sync(true);
        if (onChange) onChange();
      }
    });
    sh.el.addEventListener('change', (e) => {
      if (e.target.id === 'r-cust') { collect(); const c = SC.customers.get(cur.customerId); cur.customer = c ? c.name : ''; cur.docId = ''; draw(); }
      if (e.target.id === 'r-doc') { collect(); const d = SC.docs.get(cur.docId); if (d) { cur.amount = SC.calc(d).balance; if (!cur.title.trim()) cur.title = `Invoice #${d.number} payment`; if (d.dueDate && cur.date === today) cur.date = d.dueDate; draw(); } }
    });
    function collect() {
      if (auto) return;
      const g = (id) => { const x = sh.el.querySelector('#' + id); return x ? x.value : undefined; };
      if (g('r-title') !== undefined) cur.title = g('r-title');
      if (g('r-cust') !== undefined) cur.customerId = g('r-cust');
      if (g('r-time') !== undefined) cur.time = g('r-time');
      if (g('r-amt') !== undefined) cur.amount = num(g('r-amt'));
      if (g('r-doc') !== undefined) cur.docId = g('r-doc');
      if (g('r-note') !== undefined) cur.note = g('r-note');
    }
    return sh;
  };

  /* ---------- the Reminders view ---------- */
  SC.remindersView = (box) => {
    const s = SC.getSettings();
    const today = SC.todayISO();
    let y = +today.slice(0, 4), m = +today.slice(5, 7) - 1, sel = today, perm = 'default';

    box.innerHTML = `<div id="nc"></div>
      <section class="card cal-card"><div class="cal-head"><button type="button" class="icon-btn sm" data-m="-1" aria-label="Previous month">${SC.icon('back', 16)}</button>
        <button type="button" class="cal-title" id="cal-title"></button>
        <button type="button" class="icon-btn sm" data-m="1" aria-label="Next month">${SC.icon('chev', 16)}</button></div><div id="grid"></div>
        <div class="cal-legend"><span><b class="payment"></b>Payment</span><span><b class="install"></b>Install</span><span><b class="custom"></b>Other</span></div></section>
      <div class="row-between agenda-head"><strong id="ag-title"></strong><button type="button" class="btn small" id="ag-add">${SC.icon('plus', 16)} Add</button></div>
      <div class="list" id="agenda"></div>
      <div class="card-title" style="margin:6px 0 0">Coming up</div>
      <div class="list" id="upcoming"></div>`;

    const marks = (items) => { const o = {}; items.forEach((i) => { (o[i.date] = o[i.date] || []).push(i.kind); }); return o; };
    function itemRow(it, i, src) {
      return `<div class="due-row ${it.days < 0 ? 'late' : it.days <= 3 ? 'soon' : ''}" role="button" tabindex="0" data-edit="${src}:${i}">
        <span class="dr-ico ${it.kind === 'install' ? 'sent' : it.days < 0 ? 'overdue' : it.kind === 'payment' ? 'partial' : 'estimate'}">${SC.icon(SC.KIND[it.kind][1], 20)}</span>
        <div class="dr-main"><div class="dr-name">${esc(it.title)}</div>
          <div class="dr-meta">${esc(it.customer || 'No customer')}${it.amount ? ' · ' + SC.money(it.amount, s) : ''}${it.auto ? ' · from invoice' : ''}</div>
          <div class="due-when">${esc(SC.whenLabel(it.days))}${it.time ? ' · ' + esc(it.time) : ''}</div></div>
        <button type="button" class="btn small" data-remind="${src}:${i}">Remind</button></div>`;
    }
    let dayItems = [], upItems = [];
    function draw() {
      const items = SC.dueItems();
      $('#cal-title', box).textContent = `${MON[m]} ${y}`;
      $('#grid', box).innerHTML = gridHTML(y, m, sel, marks(items), today);
      dayItems = items.filter((i) => i.date === sel);
      upItems = items.filter((i) => i.days >= 0 && i.date !== sel).slice(0, 12);
      $('#ag-title', box).textContent = sel === today ? 'Today' : dayName(sel);
      $('#agenda', box).innerHTML = dayItems.length ? dayItems.map((it, i) => itemRow(it, i, 'd')).join('') : `<div class="empty-mini">Nothing on this day. Tap Add to set a reminder.</div>`;
      $('#upcoming', box).innerHTML = upItems.length ? upItems.map((it, i) => itemRow(it, i, 'u')).join('') : `<div class="empty-mini">No other upcoming dates.</div>`;
    }
    async function drawNotif() {
      perm = await SC.notif.permission();
      const on = perm === 'granted' && s.notifOn !== false;
      const k = SC.notif.kind();
      $('#nc', box).innerHTML = perm === 'unsupported'
        ? `<div class="notif-card off"><span class="nc-ico">${SC.icon('bell', 22)}</span><div><strong>In-app reminders are on</strong><span>You'll see a pop-up here whenever something is due within ${SC.window()} days. Phone notifications aren't available in this app yet.</span></div></div>`
        : perm === 'granted'
          ? `<div class="notif-card on"><span class="nc-ico">${SC.icon('bell', 22)}</span><div><strong>Notifications are on</strong><span>Reminders ${SC.window()} days, 7, 3, 1 day before and on the day.</span></div><button type="button" class="btn small" id="nc-test">Test</button></div>`
          : perm === 'denied'
            ? `<div class="notif-card off"><span class="nc-ico">${SC.icon('bell', 22)}</span><div><strong>Notifications are blocked</strong><span>Allow them for this app in your phone's settings, then come back.</span></div></div>`
            : `<div class="notif-card"><span class="nc-ico">${SC.icon('bell', 22)}</span><div><strong>Get reminded</strong><span>Turn on notifications for payment and install dates.</span></div><button type="button" class="btn small primary" id="nc-on">Turn on</button></div>`;
      void k;
    }
    box.addEventListener('click', async (e) => {
      let el;
      if ((el = e.target.closest('[data-m]')) && !e.target.closest('.sheet')) { m += +el.dataset.m; if (m < 0) { m = 11; y -= 1; } if (m > 11) { m = 0; y += 1; } draw(); }
      else if (e.target.closest('#cal-title')) { y = +today.slice(0, 4); m = +today.slice(5, 7) - 1; sel = today; draw(); }
      else if ((el = e.target.closest('.cal-day'))) { sel = el.dataset.d; draw(); }
      else if (e.target.closest('#ag-add')) SC.editReminder({ date: sel }, draw);
      else if ((el = e.target.closest('[data-remind]'))) { e.stopPropagation(); const [src, i] = el.dataset.remind.split(':'); SC.remindCustomer((src === 'd' ? dayItems : upItems)[+i]); }
      else if ((el = e.target.closest('[data-edit]'))) { const [src, i] = el.dataset.edit.split(':'); const it = (src === 'd' ? dayItems : upItems)[+i]; SC.editReminder(it.auto ? it : SC.reminders.get(it.reminderId), () => { draw(); drawNotif(); }); }
      else if (e.target.closest('#nc-on')) { const r = await SC.notif.enable(); if (r === 'granted') SC.toast('Notifications on'); drawNotif(); }
      else if (e.target.closest('#nc-test')) { await SC.notif.show('Simplicity Creations', 'Notifications are working.', 'sc-test'); SC.toast('Test sent'); }
    });
    draw();
    drawNotif();
    return { redraw: draw, select(d) { sel = d; y = +d.slice(0, 4); m = +d.slice(5, 7) - 1; draw(); } };
  };
})(typeof window !== 'undefined' ? window : globalThis);
