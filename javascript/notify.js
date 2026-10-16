/* notify.js — reminders (payments, installs, anything else), real notifications, and the
   "due soon" pop-up. Load after native.js. */
(function (root) {
  'use strict';
  const SC = root.SC;
  const { esc } = SC;
  const KEY = 'sc.reminders';

  /* ---------- reminder records ---------- */
  SC.reminders = {
    all() { const v = SC.store.read(KEY, []); return Array.isArray(v) ? v : []; },
    get(id) { return this.all().find((r) => r.id === id) || null; },
    save(r) {
      const list = this.all();
      const i = list.findIndex((x) => x.id === r.id);
      if (i >= 0) list[i] = r; else list.push(r);
      SC.store.write(KEY, list);
      return r;
    },
    remove(id) { SC.store.write(KEY, this.all().filter((r) => r.id !== id)); }
  };
  const diffDays = (iso, today) => Math.round((new Date(iso + 'T00:00:00') - new Date((today || SC.todayISO()) + 'T00:00:00')) / 86400000);
  SC.daysUntil = diffDays;
  SC.window = () => Math.max(1, SC.num(SC.getSettings().remindWindow) || 15);

  SC.KIND = { payment: ['Payment', 'dollar', 'bad'], install: ['Install', 'box', 'info'], custom: ['Other', 'check', 'warn'] };

  // Everything with a date: unpaid invoice due dates (automatic) + reminders you added.
  SC.dueItems = () => {
    const today = SC.todayISO();
    const out = [];
    SC.docs.all().forEach((d) => {
      if (d.type !== 'invoice' || !d.dueDate) return;
      const st = SC.statusOf(d, today);
      if (st === 'paid' || st === 'draft') return;
      const c = SC.calc(d), cu = d.customer || {};
      out.push({ key: 'inv:' + d.id, kind: 'payment', auto: true, date: d.dueDate, time: '', title: `Invoice #${d.number} due`, customer: cu.name || '', phone: cu.phone || '', email: cu.email || '', customerId: d.customerId || '', docId: d.id, amount: c.balance, note: '' });
    });
    SC.reminders.all().forEach((r) => {
      if (r.done || !r.date) return;
      const cu = (r.customerId && SC.customers.get(r.customerId)) || {};
      out.push({ key: 'rem:' + r.id, kind: r.kind || 'custom', auto: false, date: r.date, time: r.time || '', title: r.title || SC.KIND[r.kind || 'custom'][0], customer: r.customer || cu.name || '', phone: cu.phone || r.phone || '', email: cu.email || '', customerId: r.customerId || '', docId: r.docId || '', amount: SC.num(r.amount), note: r.note || '', reminderId: r.id });
    });
    out.forEach((i) => { i.days = diffDays(i.date, today); });
    return out.sort((a, b) => a.date.localeCompare(b.date) || (a.time || '').localeCompare(b.time || ''));
  };
  SC.dueSoon = () => SC.dueItems().filter((i) => i.days <= SC.window());

  SC.whenLabel = (days) => (days < 0 ? `Overdue ${-days} day${days === -1 ? '' : 's'}` : days === 0 ? 'Today' : days === 1 ? 'Tomorrow' : `In ${days} days`);

  /* ---------- message to the customer ---------- */
  SC.reminderText = (it, s, url) => {
    s = s || SC.getSettings();
    const hi = it.customer ? `Hi ${it.customer},\n` : '';
    const when = SC.fmtDate(it.date) + (it.time ? ' at ' + it.time : '');
    let t;
    if (it.kind === 'payment') {
      const amt = it.amount ? ` of ${SC.money(it.amount, s)}` : '';
      const rel = it.days < 0 ? `was due on ${when} (${-it.days} day${it.days === -1 ? '' : 's'} ago)` : it.days === 0 ? `is due today (${when})` : `is due on ${when} (${SC.whenLabel(it.days).toLowerCase()})`;
      t = `${hi}A friendly reminder that ${it.title.replace(/ due$/, '').toLowerCase().replace(/^invoice/, 'invoice') || 'your payment'}${amt} ${rel}.`;
    } else if (it.kind === 'install') {
      t = `${hi}A reminder about your installation${it.title && !/^install/i.test(it.title) ? ' (' + it.title + ')' : ''} on ${when}.`;
    } else t = `${hi}Reminder: ${it.title} on ${when}.`;
    if (it.note) t += `\n${it.note}`;
    return t + `\n\nThank you, ${s.businessName}`;
  };

  // Opens the share sheet with the reminder (and a link to the invoice when there is one).
  SC.remindCustomer = async (it) => {
    const s = SC.getSettings();
    let url = '';
    const d = it.docId && SC.docs.get(it.docId);
    if (d) { try { url = await SC.link.make(d, s, ''); } catch (e) { /* no link */ } }
    SC.openShareSheet({ title: 'Remind ' + (it.customer || 'customer'), text: SC.reminderText(it, s), url, phone: it.phone, email: it.email, subject: `Reminder from ${s.businessName}` });
  };

  /* ---------- real notifications ---------- */
  const N = () => root.SCNative || null;
  const Cap = () => (root.Capacitor && root.Capacitor.Plugins) || {};
  SC.notif = {
    kind() { return Cap().LocalNotifications ? 'capacitor' : N() && N().scheduleNotifications ? 'bridge' : ('Notification' in root && 'serviceWorker' in navigator) ? 'web' : 'none'; },
    async permission() {
      const k = this.kind();
      if (k === 'capacitor') { try { const r = await Cap().LocalNotifications.checkPermissions(); return r.display === 'granted' ? 'granted' : r.display === 'denied' ? 'denied' : 'default'; } catch (e) { return 'default'; } }
      if (k === 'bridge') return N().notificationPermission ? String(N().notificationPermission()) : 'default';
      if (k === 'web') return Notification.permission;
      return 'unsupported';
    },
    // The actual permission prompt.
    async enable() {
      const k = this.kind();
      let res = 'unsupported';
      if (k === 'capacitor') { const r = await Cap().LocalNotifications.requestPermissions(); res = r.display === 'granted' ? 'granted' : 'denied'; }
      else if (k === 'bridge') {
        res = await new Promise((ok) => {
          root.onSCNotifPermission = (v) => ok(String(v));
          const v = N().requestNotificationPermission && N().requestNotificationPermission();
          if (v) ok(String(v));
          setTimeout(() => ok('default'), 20000);
        });
      }
      else if (k === 'web') { res = await Notification.requestPermission(); await SC.notif.register(); }
      const s = SC.getSettings(); s.notifOn = res === 'granted'; SC.saveSettings(s);
      if (res === 'granted') this.sync(true);
      return res;
    },
    async register() {
      if (!('serviceWorker' in navigator)) return null;
      try {
        const reg = await navigator.serviceWorker.register(((document.body && document.body.dataset.root) || '') + 'sw.js');
        return reg;
      } catch (e) { return null; }
    },
    async show(title, body, tag) {
      const k = this.kind();
      if (k === 'capacitor') { await Cap().LocalNotifications.schedule({ notifications: [{ id: Math.floor(Math.random() * 1e8), title, body, schedule: { at: new Date(Date.now() + 800) } }] }); return; }
      if (k === 'bridge') { N().scheduleNotifications(JSON.stringify([{ id: Math.floor(Math.random() * 1e8), title, body, at: Date.now() + 800 }])); return; }
      if (k === 'web') {
        const reg = (await SC.notif.register()) && (await navigator.serviceWorker.ready);
        if (reg) reg.showNotification(title, { body, tag: tag || 'sc', icon: ((document.body && document.body.dataset.root) || '') + 'assets/watermark.png', badge: ((document.body && document.body.dataset.root) || '') + 'assets/watermark.png', data: { url: root.location.href } });
        else new Notification(title, { body });
      }
    },
    // Schedules native notifications for upcoming dates; on the web it shows today's reminders once a day.
    async sync(force) {
      const s = SC.getSettings();
      if (!s.notifOn) return;
      const perm = await this.permission();
      if (perm !== 'granted') return;
      const items = SC.dueItems();
      const k = this.kind();
      const offsets = [15, 7, 3, 1, 0];
      const plan = [];
      items.forEach((it) => {
        offsets.forEach((o) => {
          if (o > SC.window()) return;
          const at = new Date(it.date + 'T' + (it.time && o === 0 ? it.time : '09:00') + ':00');
          at.setDate(at.getDate() - (o === 0 && it.time ? 0 : o));
          if (at.getTime() < Date.now() + 5000) return;
          const label = o === 0 ? 'today' : o === 1 ? 'tomorrow' : `in ${o} days`;
          let h = 0; const str = it.key + o; for (let i = 0; i < str.length; i++) h = (h * 31 + str.charCodeAt(i)) % 2147483000;
          plan.push({ id: h || 1, title: it.kind === 'install' ? 'Install ' + label : it.kind === 'payment' ? 'Payment due ' + label : it.title, body: `${it.title}${it.customer ? ' · ' + it.customer : ''}${it.amount ? ' · ' + SC.money(it.amount, s) : ''}`, at: at.getTime() });
        });
      });
      if (k === 'capacitor') {
        try {
          const pend = await Cap().LocalNotifications.getPending();
          if (pend.notifications && pend.notifications.length) await Cap().LocalNotifications.cancel({ notifications: pend.notifications.map((n) => ({ id: n.id })) });
          if (plan.length) await Cap().LocalNotifications.schedule({ notifications: plan.slice(0, 60).map((p) => ({ id: p.id, title: p.title, body: p.body, schedule: { at: new Date(p.at), allowWhileIdle: true } })) });
        } catch (e) { /* ignore */ }
      } else if (k === 'bridge') {
        try { N().scheduleNotifications(JSON.stringify(plan.slice(0, 60))); } catch (e) { /* ignore */ }
      } else if (k === 'web') {
        await this.digest(items);
        const day = SC.todayISO();
        let last = ''; try { last = root.localStorage.getItem('sc.notifDay') || ''; } catch (e) { /* ignore */ }
        if (force || last !== day) {
          const soon = items.filter((i) => i.days <= SC.window());
          if (soon.length) {
            const first = soon[0];
            this.show(soon.length === 1 ? `${first.title} · ${SC.whenLabel(first.days)}` : `${soon.length} dates coming up`, soon.slice(0, 3).map((i) => `${i.title}${i.customer ? ' · ' + i.customer : ''} (${SC.whenLabel(i.days).toLowerCase()})`).join('\n'), 'sc-daily');
          }
          try { root.localStorage.setItem('sc.notifDay', day); } catch (e) { /* ignore */ }
        }
      }
    },
    // Keep a copy of the dates where the service worker can read it (background checks).
    async digest(items) {
      if (!('caches' in root)) return;
      try {
        const c = await caches.open('sc-data');
        await c.put('due.json', new Response(JSON.stringify({ window: SC.window(), items: items.map((i) => ({ key: i.key, title: i.title, customer: i.customer, date: i.date, amount: i.amount })) })));
        const reg = await navigator.serviceWorker.ready;
        if (reg.periodicSync) await reg.periodicSync.register('sc-due', { minInterval: 12 * 3600 * 1000 });
      } catch (e) { /* not supported */ }
    }
  };

  /* ---------- "due soon" pop-up when the app opens ---------- */
  SC.dueSheet = (items, onDone) => {
    const s = SC.getSettings();
    const sh = SC.sheet.open({
      title: 'Coming up',
      body: `<p class="hint" style="margin-bottom:12px">Due within ${SC.window()} days.</p><div class="list">${items.map((it, i) => `
        <div class="due-row ${it.days < 0 ? 'late' : it.days <= 3 ? 'soon' : ''}">
          <span class="dr-ico ${it.kind === 'install' ? 'sent' : it.days < 0 ? 'overdue' : 'partial'}">${SC.icon(SC.KIND[it.kind][1], 20)}</span>
          <div class="dr-main"><div class="dr-name">${esc(it.title)}</div>
            <div class="dr-meta">${esc(it.customer || 'No customer')}${it.amount ? ' · ' + SC.money(it.amount, s) : ''}</div>
            <div class="due-when">${esc(SC.whenLabel(it.days))} · ${esc(SC.fmtDate(it.date))}${it.time ? ' ' + esc(it.time) : ''}</div></div>
          <button type="button" class="btn small" data-remind="${i}">Remind</button></div>`).join('')}</div>`,
      footer: `<button type="button" class="btn" data-open>Open calendar</button><button type="button" class="btn primary" data-sheet-close>Got it</button>`
    });
    sh.el.addEventListener('click', (e) => {
      const b = e.target.closest('[data-remind]');
      if (b) { SC.remindCustomer(items[+b.dataset.remind]); return; }
      if (e.target.closest('[data-open]')) { sh.close(); SC.go((document.body.dataset.root || '') + 'pages/customers.html?tab=reminders'); }
    });
    return sh;
  };

  SC.notif.popup = () => {
    const day = SC.todayISO();
    let seen = ''; try { seen = root.localStorage.getItem('sc.popupDay') || ''; } catch (e) { /* ignore */ }
    const items = SC.dueSoon();
    if (!items.length || seen === day) return;
    try { root.localStorage.setItem('sc.popupDay', day); } catch (e) { /* ignore */ }
    SC.dueSheet(items);
  };

  // dot on the Customers tab when something is due soon
  SC.notif.badge = () => {
    const n = SC.dueSoon().filter((i) => i.days <= 3).length;
    const a = document.querySelector('.bottomnav a[href$="customers.html"]');
    if (a && n) { const b = document.createElement('b'); b.className = 'nav-badge'; b.textContent = n > 9 ? '9+' : String(n); a.append(b); }
  };

  SC.notif.boot = (page) => {
    SC.notif.badge();
    if (page === 'home' || page === 'customers') setTimeout(() => SC.notif.popup(), 900);
    SC.notif.sync();
  };
})(typeof window !== 'undefined' ? window : globalThis);
