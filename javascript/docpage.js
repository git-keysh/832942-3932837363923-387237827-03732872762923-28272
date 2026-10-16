/* docpage.js — what a customer sees when they open a shared link: the document, a way to
   save/print it, and reminders for the due date (notifications + calendar). */
(function () {
  'use strict';
  const SC = window.SC;
  const { esc, $ } = SC;
  const qs = new URLSearchParams(location.search);
  const main = $('#main');

  SC.mountShell();
  SC.getSettings = () => Object.assign({}, SC.DEFAULT_SETTINGS, window.__docSettings || {});

  const LS = 'scc.reminders';
  const read = () => { try { return JSON.parse(localStorage.getItem(LS) || '[]'); } catch (e) { return []; } };
  const write = (v) => { try { localStorage.setItem(LS, JSON.stringify(v)); } catch (e) { /* ignore */ } };
  const ymd = (iso) => iso.replace(/-/g, '');

  async function start() {
    let payload;
    try { payload = await SC.link.unpack(qs.get('d') || ''); } catch (e) { payload = null; }
    if (!payload || !payload.doc) {
      main.innerHTML = `<div class="empty"><h3>This link isn't valid</h3><p>Ask for a new link to be sent to you.</p></div>`;
      return;
    }
    const doc = payload.doc, s = Object.assign({}, SC.DEFAULT_SETTINGS, payload.s || {}), rcpt = payload.r || '';
    window.__docSettings = s;
    const c = SC.calc(doc);
    const kind = rcpt || doc.type === 'receipt' ? 'Receipt' : SC.TYPE_LABEL[doc.type];
    SC.setTitle(`${kind} #${doc.number}`);
    document.title = `${kind} ${doc.number} · ${s.businessName}`;
    const due = doc.type === 'invoice' && doc.dueDate && c.balance > 0 ? doc.dueDate : '';
    const days = due ? SC.daysUntil(due) : null;
    const item = due ? { key: 'inv:' + doc.number, title: `${s.businessName}: invoice #${doc.number}`, customer: s.businessName, date: due, amount: c.balance } : null;
    const money = (n) => SC.money(n, s);

    main.innerHTML = `
      <div class="card view-head"><div><div class="vh-num">${esc(kind)} #${esc(doc.number)}</div><div class="muted">${esc(s.businessName)}</div></div>
        <div class="vh-right"><strong>${money(c.total)}</strong>${due ? `<span class="badge ${days < 0 ? 'bad' : days <= 3 ? 'warn' : 'info'}">${esc(SC.whenLabel(days))}</span>` : ''}</div></div>
      ${due ? `<section class="card" id="rem-card"></section>` : ''}
      <div class="paper-wrap" id="pw"></div>`;
    const wrap = $('#pw');
    wrap.innerHTML = SC.renderPaper(doc, s, { root: '../', receipt: rcpt || false });
    SC.fitPaper(wrap);

    const bar = document.createElement('div');
    bar.className = 'actionbar no-print';
    bar.innerHTML = `<button type="button" class="btn primary" id="d-pdf">${SC.icon('download', 18)} Save PDF</button><button type="button" class="btn" id="d-print">${SC.icon('print', 18)} Print</button>`;
    $('.app').append(bar);
    $('#d-pdf').addEventListener('click', async () => {
      SC.toast('Preparing PDF…');
      try { const blob = await SC.pdfBlob(SC.renderPaper(doc, s, { root: '../', receipt: rcpt || false })); SC.saveBlob(blob, SC.docFileName(doc, rcpt)); SC.toast('PDF saved'); } catch (e) { SC.toast((e && e.message) || 'Could not make the PDF'); }
    });
    const doPrint = () => { document.documentElement.style.setProperty('--fit', String(SC.printFit())); window.print(); };
    $('#d-print').addEventListener('click', doPrint);
    if (qs.get('print') === '1') setTimeout(doPrint, 900);

    if (!item) return;

    /* ----- reminders for the customer ----- */
    const gcal = () => 'https://calendar.google.com/calendar/render?action=TEMPLATE&text=' + encodeURIComponent(`Payment due: ${s.businessName} invoice #${doc.number}`) +
      '&dates=' + ymd(due) + '/' + ymd(SC.addDays(due, 1)) + '&details=' + encodeURIComponent(`${money(c.balance)} due to ${s.businessName}.\n${location.href}`);
    const ics = () => {
      const t = (x) => x.replace(/[\\,;]/g, '\\$&').replace(/\n/g, '\\n');
      const lines = ['BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//Simplicity Creations//EN', 'BEGIN:VEVENT', `UID:${doc.number}-${due}@simplicity`, `DTSTAMP:${new Date().toISOString().replace(/[-:]/g, '').slice(0, 15)}Z`,
        `DTSTART;VALUE=DATE:${ymd(due)}`, `DTEND;VALUE=DATE:${ymd(SC.addDays(due, 1))}`, `SUMMARY:${t(`Payment due: ${s.businessName} invoice #${doc.number}`)}`, `DESCRIPTION:${t(`${money(c.balance)} due to ${s.businessName}.`)}`,
        'BEGIN:VALARM', 'TRIGGER:-P3D', 'ACTION:DISPLAY', 'DESCRIPTION:Payment due in 3 days', 'END:VALARM', 'BEGIN:VALARM', 'TRIGGER:-P1D', 'ACTION:DISPLAY', 'DESCRIPTION:Payment due tomorrow', 'END:VALARM', 'END:VEVENT', 'END:VCALENDAR'];
      return new Blob([lines.join('\r\n')], { type: 'text/calendar' });
    };
    const enabled = () => read().some((r) => r.key === item.key);

    async function drawCard() {
      const perm = await SC.notif.permission();
      const on = enabled() && perm === 'granted';
      $('#rem-card').innerHTML = `<div class="card-title">Payment reminder</div>
        <div class="notif-card ${on ? 'on' : ''}" style="margin:0 0 12px"><span class="nc-ico">${SC.icon('bell', 22)}</span>
          <div><strong>${on ? 'Reminder is on' : 'Never miss the due date'}</strong><span>${on ? `We'll remind you before ${esc(SC.fmtDate(due))}.` : perm === 'denied' ? 'Notifications are blocked in your browser settings. You can still add it to your calendar.' : `${money(c.balance)} is due ${esc(SC.fmtDate(due))}.`}</span></div></div>
        <div class="btn-row">${on ? '' : perm === 'denied' || perm === 'unsupported' ? '' : `<button type="button" class="btn primary" id="rm-on">${SC.icon('bell', 18)} Remind me</button>`}
          <button type="button" class="btn" id="rm-cal">${SC.icon('calendar', 18)} Add to calendar</button></div>`;
    }
    async function enable() {
      const r = await SC.notif.enable();
      if (r === 'granted') {
        const list = read().filter((x) => x.key !== item.key); list.push(item); write(list);
        try {
          const cache = await caches.open('sc-data');
          await cache.put('due.json', new Response(JSON.stringify({ window: 15, items: list })));
          const reg = await navigator.serviceWorker.ready;
          if (reg.periodicSync) await reg.periodicSync.register('sc-due', { minInterval: 12 * 3600 * 1000 });
        } catch (e) { /* not supported */ }
        SC.notif.show('Reminder set', `We'll remind you before ${SC.fmtDate(due)} · ${money(c.balance)}`, 'sc-set');
        SC.toast('Reminder on');
      } else SC.toast(r === 'denied' ? 'Notifications were blocked' : 'Notifications are not available here');
      drawCard();
    }
    drawCard();
    $('#rem-card').addEventListener('click', (e) => {
      if (e.target.closest('#rm-on')) enable();
      else if (e.target.closest('#rm-cal')) {
        const sh = SC.sheet.open({ title: 'Add to calendar', body: `<div class="list">
          <button type="button" class="srow" data-c="g"><span class="ico-wrap">${SC.icon('calendar', 20)}</span><span>Google Calendar<small>Opens your calendar app or browser</small></span></button>
          <button type="button" class="srow" data-c="ics"><span class="ico-wrap">${SC.icon('download', 20)}</span><span>Calendar file (.ics)<small>For Apple, Outlook and others</small></span></button></div>` });
        sh.el.addEventListener('click', (ev) => {
          const b = ev.target.closest('[data-c]');
          if (!b) return;
          sh.close();
          if (b.dataset.c === 'g') SC.openExternal(gcal()); else SC.saveBlob(ics(), `Payment-due-${doc.number}.ics`);
        });
      }
    });

    // pop-up when the due date is within 15 days (or already past)
    if (days <= 15 && !sessionStorage.getItem('sc.popup.' + item.key)) {
      try { sessionStorage.setItem('sc.popup.' + item.key, '1'); } catch (e) { /* ignore */ }
      setTimeout(() => {
        const sh = SC.sheet.open({
          title: days < 0 ? 'Payment overdue' : 'Payment reminder',
          body: `<div class="popup-hero ${days < 0 ? 'late' : ''}"><span class="nc-ico">${SC.icon('bell', 26)}</span><strong>${money(c.balance)}</strong>
            <span>Invoice #${esc(doc.number)} · ${esc(SC.whenLabel(days))}</span><span class="muted">Due ${esc(SC.fmtDate(due))}</span></div>`,
          footer: `<button type="button" class="btn" data-sheet-close>Close</button>${enabled() ? '' : `<button type="button" class="btn primary" data-on>Remind me</button>`}`
        });
        const on = sh.el.querySelector('[data-on]');
        if (on) on.addEventListener('click', () => { sh.close(); enable(); });
      }, 700);
    }
    if (enabled() && days <= 15) SC.notif.show(days < 0 ? 'Payment overdue' : 'Payment due ' + SC.whenLabel(days).toLowerCase(), `${s.businessName} · invoice #${doc.number} · ${money(c.balance)}`, 'sc-open');
  }
  start();
})();
