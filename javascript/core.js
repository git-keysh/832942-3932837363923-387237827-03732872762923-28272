/* core.js — shared helpers, storage, calculations, numbering.
   No DOM needed here, so it can be tested in Node. */
(function (root) {
  'use strict';
  const SC = (root.SC = root.SC || {});

  /* ---------- tiny utils ---------- */
  const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  const MONTHS_LONG = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];

  SC.$ = (sel, el) => (el || document).querySelector(sel);
  SC.$$ = (sel, el) => Array.from((el || document).querySelectorAll(sel));
  SC.esc = (s) =>
    String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  SC.num = (v) => {
    const n = parseFloat(v);
    return Number.isFinite(n) ? n : 0;
  };
  SC.round2 = (n) => Math.round((n + Number.EPSILON) * 100) / 100;
  SC.pad = (n, w) => String(n).padStart(w || 2, '0');
  SC.uid = (p) => (p || 'id') + '_' + Math.random().toString(36).slice(2, 8) + Date.now().toString(36).slice(-4);
  SC.clone = (o) => JSON.parse(JSON.stringify(o));
  SC.titleCase = (s) => String(s || '').toLowerCase().replace(/(^|[\s\-/])([a-z])/g, (m, a, b) => a + b.toUpperCase());

  /* ---------- dates (all ISO yyyy-mm-dd, local time) ---------- */
  const parseISO = (iso) => {
    const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(iso || '');
    return m ? new Date(+m[1], +m[2] - 1, +m[3]) : null;
  };
  const toISO = (d) => d.getFullYear() + '-' + SC.pad(d.getMonth() + 1) + '-' + SC.pad(d.getDate());
  SC.todayISO = () => toISO(new Date());
  SC.addDays = (iso, days) => {
    const d = parseISO(iso) || new Date();
    d.setDate(d.getDate() + days);
    return toISO(d);
  };
  SC.daysBetween = (a, b) => {
    const x = parseISO(a), y = parseISO(b);
    return x && y ? Math.round((y - x) / 86400000) : 0;
  };
  SC.fmtDate = (iso, style) => {
    const d = parseISO(iso);
    if (!d) return '';
    return style === 'long'
      ? `${MONTHS_LONG[d.getMonth()]} ${d.getDate()}, ${d.getFullYear()}`
      : `${d.getDate()} ${MONTHS[d.getMonth()]} ${d.getFullYear()}`;
  };
  SC.monthKey = (iso) => String(iso || '').slice(0, 7);

  /* ---------- storage ---------- */
  const K = { docs: 'sc.docs', customers: 'sc.customers', settings: 'sc.settings', items: 'sc.items', products: 'sc.products' };
  const mem = {}; // used only if localStorage is blocked
  function read(key, fallback) {
    try {
      const raw = root.localStorage.getItem(key);
      return raw ? JSON.parse(raw) : fallback;
    } catch (e) {
      return key in mem ? mem[key] : fallback;
    }
  }
  function write(key, value) {
    try {
      root.localStorage.setItem(key, JSON.stringify(value));
      return true;
    } catch (e) {
      mem[key] = value;
      return false;
    }
  }
  SC.store = { read, write, keys: K };

  /* ---------- settings ---------- */
  SC.DEFAULT_SETTINGS = {
    businessName: 'SIMPLICITY CREATIONS LTD',
    tagline: 'Where Simple Things Are Extraordinary',
    contactLines:
      "Product Sales & Installation Services\nAdrian Installer (868)716-8237\nD'Abadie Store (868) 759-3037\nCouva Store (868)704-4477\nsimplicity_creations@hotmail.com\nCheck Out- FaceBook : TikTok : Instagram : YouTube",
    email: 'simplicity_creations@hotmail.com',
    phone: '',
    location: 'Trinidad & Tobago',
    receivedBy: '',
    logo: 'assets/watermark.png',
    showWatermark: true,
    currencySymbol: '$',
    currencyCode: 'TTD',
    currencyName: 'Trinidad & Tobago Dollars',
    taxName: 'VAT',
    taxRate: 0,
    defaultDueDays: 0,
    invoicePrefix: '',
    estimatePrefix: 'EST-',
    nextInvoice: 177,
    nextEstimate: 1,
    nextReceipt: 1,
    paymentDetails: '',
    invoiceTerms: '',
    thanksLine: 'Thank you for your business!',
    theme: 'auto'
  };
  SC.getSettings = () => Object.assign({}, SC.DEFAULT_SETTINGS, read(K.settings, {}));
  SC.saveSettings = (s) => write(K.settings, s);
  // Light / dark / auto (follows the phone). Applied early by a tiny script in each page head too.
  SC.applyTheme = (mode) => {
    const m = mode || SC.getSettings().theme || 'auto';
    const dark = m === 'dark' || (m === 'auto' && root.matchMedia && root.matchMedia('(prefers-color-scheme: dark)').matches);
    document.documentElement.dataset.theme = dark ? 'dark' : 'light';
    const mc = document.querySelector('meta[name="theme-color"]');
    if (mc) mc.setAttribute('content', dark ? '#000000' : '#f2f2f7');
  };
  if (root.matchMedia) root.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', () => SC.applyTheme());

  /* ---------- collections ---------- */
  function collection(key, seed) {
    return {
      all() {
        const v = read(key, null);
        return Array.isArray(v) ? v : seed ? seed() : [];
      },
      get(id) {
        return this.all().find((x) => x.id === id) || null;
      },
      save(item) {
        const list = this.all();
        const i = list.findIndex((x) => x.id === item.id);
        if (i >= 0) list[i] = item;
        else list.unshift(item);
        write(key, list);
        return item;
      },
      remove(id) {
        write(key, this.all().filter((x) => x.id !== id));
      }
    };
  }
  SC.customers = collection(K.customers);
  SC.items = collection(K.items, () => [
    { id: 'item_installation', name: 'Installation', price: 0 },
    { id: 'item_wires', name: 'Wires & Accessories', price: 0 },
    { id: 'item_enclosure', name: 'Enclosure', price: 0 }
  ]);

  const docsCol = collection(K.docs);
  SC.docs = {
    all: () => docsCol.all(),
    get: (id) => docsCol.get(id),
    remove: (id) => docsCol.remove(id),
    save(doc) {
      const isNew = !docsCol.get(doc.id);
      doc.updatedAt = Date.now();
      if (isNew) {
        doc.createdAt = doc.createdAt || Date.now();
        SC.bumpCounter(doc);
      }
      return docsCol.save(doc);
    }
  };

  /* ---------- numbering ---------- */
  const COUNTER = { invoice: 'nextInvoice', estimate: 'nextEstimate', receipt: 'nextReceipt' };
  SC.suggestNumber = (type, s) => {
    s = s || SC.getSettings();
    const n = s[COUNTER[type]] || 1;
    if (type === 'receipt') return 'RCP-' + SC.todayISO().slice(0, 4) + '-' + SC.pad(n, 3);
    return (type === 'estimate' ? s.estimatePrefix : s.invoicePrefix) + n;
  };
  // After a new doc is saved, move the counter past its number.
  SC.bumpCounter = (doc) => {
    const m = /(\d+)\s*$/.exec(doc.number || '');
    if (!m) return;
    const s = SC.getSettings();
    const key = COUNTER[doc.type];
    const n = parseInt(m[1], 10);
    if (n + 1 > (s[key] || 1)) {
      s[key] = n + 1;
      SC.saveSettings(s);
    }
  };

  /* ---------- money ---------- */
  SC.money = (n, s) => {
    s = s || SC.getSettings();
    const v = SC.round2(SC.num(n));
    const body = Math.abs(v).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
    return (v < 0 ? '-' : '') + (s.currencySymbol || '$') + body;
  };
  SC.METHODS = ['Cash', 'Bank Transfer', 'Linx / Debit', 'Credit Card', 'Cheque', 'Other'];

  /* ---------- documents ---------- */
  SC.newDoc = (type, s) => {
    s = s || SC.getSettings();
    const today = SC.todayISO();
    return {
      id: SC.uid('doc'),
      type,
      number: SC.suggestNumber(type, s),
      status: 'draft',
      issueDate: today,
      dueDate: type !== 'receipt' && s.defaultDueDays > 0 ? SC.addDays(today, s.defaultDueDays) : '',
      customerId: '',
      customer: { name: '', phone: '', email: '', address: '' },
      items: [],
      discount: { type: 'amount', value: 0 },
      taxRate: SC.num(s.taxRate),
      shipping: 0,
      deposit: 0,
      notes: '',
      terms: s.invoiceTerms || '',
      paymentDetails: s.paymentDetails || '',
      payments: [],
      payment: { method: 'Cash', reference: '', date: today },
      createdAt: Date.now()
    };
  };

  SC.calc = (doc) => {
    const items = doc.items || [];
    const subtotal = SC.round2(items.reduce((sum, i) => sum + SC.num(i.price) * SC.num(i.qty), 0));
    const d = doc.discount || { type: 'amount', value: 0 };
    let discount = d.type === 'percent' ? (subtotal * SC.num(d.value)) / 100 : SC.num(d.value);
    discount = SC.round2(Math.min(Math.max(discount, 0), subtotal));
    const taxable = subtotal - discount;
    const taxAmount = SC.round2((taxable * SC.num(doc.taxRate)) / 100);
    const shipping = SC.round2(Math.max(SC.num(doc.shipping), 0));
    const total = SC.round2(taxable + taxAmount + shipping);
    let paid = SC.round2((doc.payments || []).reduce((sum, p) => sum + SC.num(p.amount), 0));
    if (doc.type === 'receipt') paid = total;
    const balance = SC.round2(Math.max(total - paid, 0));
    return { subtotal, discount, taxAmount, shipping, total, paid, balance };
  };

  // Payment details live on each invoice/estimate (older documents fall back to the old setting).
  SC.payText = (doc, s) => String(doc.paymentDetails !== undefined ? doc.paymentDetails : doc.showPaymentDetails ? (s && s.paymentDetails) || '' : '').trim();

  SC.statusOf = (doc, today) => {
    today = today || SC.todayISO();
    if (doc.type === 'receipt') return 'paid';
    if (doc.type === 'estimate') return doc.status || 'draft';
    const c = SC.calc(doc);
    if (c.total > 0 && c.paid >= c.total) return 'paid';
    const late = !!doc.dueDate && doc.dueDate < today;
    if (c.paid > 0) return late ? 'overdue' : 'partial';
    if (doc.status === 'sent') return late ? 'overdue' : 'sent';
    return 'draft';
  };

  SC.STATUS = {
    draft: ['Draft', 'gray'],
    sent: ['Sent', 'info'],
    partial: ['Partial', 'warn'],
    paid: ['Paid', 'ok'],
    overdue: ['Overdue', 'bad'],
    accepted: ['Accepted', 'ok'],
    converted: ['Invoiced', 'ok']
  };
  SC.badge = (st) => {
    const [label, cls] = SC.STATUS[st] || [st, 'gray'];
    return `<span class="badge ${cls}">${label}</span>`;
  };
  SC.TYPE_LABEL = { invoice: 'Invoice', estimate: 'Estimate', receipt: 'Receipt' };

  SC.addPayment = (doc, p) => {
    const s = SC.getSettings();
    const date = p.date || SC.todayISO();
    const n = s.nextReceipt || 1;
    const pay = {
      id: SC.uid('pay'),
      date,
      amount: SC.round2(SC.num(p.amount)),
      method: p.method || 'Cash',
      reference: p.reference || '',
      receiptNumber: 'RCP-' + date.slice(0, 4) + '-' + SC.pad(n, 3)
    };
    s.nextReceipt = n + 1;
    SC.saveSettings(s);
    doc.payments = (doc.payments || []).concat(pay);
    return pay;
  };

  SC.duplicateDoc = (doc) => {
    const s = SC.getSettings();
    const today = SC.todayISO();
    const c = SC.clone(doc);
    const gap = doc.dueDate && doc.issueDate ? SC.daysBetween(doc.issueDate, doc.dueDate) : 0;
    c.id = SC.uid('doc');
    c.number = SC.suggestNumber(c.type, s);
    c.status = 'draft';
    c.payments = [];
    c.sentAt = null;
    c.fromEstimate = '';
    c.createdAt = Date.now();
    c.issueDate = today;
    c.dueDate = gap > 0 ? SC.addDays(today, gap) : '';
    if (c.payment) c.payment.date = today;
    return c;
  };

  SC.estimateToInvoice = (est) => {
    const inv = SC.newDoc('invoice');
    inv.customerId = est.customerId;
    inv.customer = SC.clone(est.customer || {});
    inv.items = SC.clone(est.items || []);
    inv.discount = SC.clone(est.discount || inv.discount);
    inv.taxRate = est.taxRate;
    inv.shipping = est.shipping;
    inv.deposit = est.deposit;
    inv.notes = est.notes;
    inv.terms = est.terms || inv.terms;
    inv.paymentDetails = est.paymentDetails || '';
    inv.fromEstimate = est.number;
    return inv;
  };

  // Data needed to draw/describe a receipt for a receipt doc or for one payment on an invoice.
  SC.receiptData = (doc, payId) => {
    const c = SC.calc(doc);
    if (doc.type === 'receipt') {
      const p = doc.payment || {};
      return {
        number: doc.number, date: p.date || doc.issueDate, customer: doc.customer || {}, amount: c.total,
        method: p.method || 'Cash', reference: p.reference || '', items: doc.items || [], calc: c, forInvoice: '', balance: 0
      };
    }
    const pays = doc.payments || [];
    const p = pays.find((x) => x.id === payId) || pays[pays.length - 1] || { amount: 0, date: doc.issueDate, method: '', reference: '', receiptNumber: '' };
    return {
      number: p.receiptNumber || '', date: p.date, customer: doc.customer || {}, amount: SC.num(p.amount),
      method: p.method, reference: p.reference, items: doc.items || [], calc: c, forInvoice: doc.number, balance: c.balance
    };
  };

  // T&T numbers: 7 digits -> +1 868, 10 digits -> +1.
  SC.waNumber = (phone) => {
    const d = String(phone || '').replace(/\D/g, '');
    if (d.length === 7) return '1868' + d;
    if (d.length === 10) return '1' + d;
    return d;
  };

  SC.shareText = (doc, s, payId) => {
    const m = (n) => SC.money(n, s);
    const name = (doc.customer && doc.customer.name) || '';
    const hi = name ? `Hi ${name},\n` : '';
    if (doc.type === 'receipt' || payId) {
      const r = SC.receiptData(doc, payId === true ? undefined : payId);
      let t = `${hi}Receipt ${r.number} from ${s.businessName}: we received ${m(r.amount)}`;
      t += r.date ? ` on ${SC.fmtDate(r.date)}` : '';
      t += r.method ? ` (${r.method})` : '';
      t += r.forInvoice ? ` for invoice #${r.forInvoice}.` : '.';
      if (r.balance > 0) t += `\nBalance remaining: ${m(r.balance)}`;
      return t + `\n\n${s.thanksLine || 'Thank you!'}`;
    }
    const c = SC.calc(doc);
    const kind = doc.type === 'estimate' ? 'estimate' : 'invoice';
    const lines = (doc.items || []).map((i) => `• ${i.name}${i.variant ? ' (' + i.variant + ')' : ''} ×${i.qty} — ${m(SC.num(i.price) * SC.num(i.qty))}`);
    let t = `${hi}Here is ${kind} #${doc.number} from ${s.businessName}.\n\n${lines.join('\n')}\n\nTotal: ${m(c.total)}`;
    if (kind === 'invoice' && c.paid > 0) t += `\nBalance due: ${m(c.balance)}`;
    if (doc.deposit > 0 && c.paid === 0) t += `\nDeposit required: ${m(doc.deposit)}`;
    if (doc.dueDate) t += `\n${kind === 'estimate' ? 'Valid until' : 'Due'}: ${SC.fmtDate(doc.dueDate)}`;
    if (SC.payText(doc, s)) t += `\n\nPayment details:\n${SC.payText(doc, s)}`;
    return t + `\n\n${s.thanksLine || 'Thank you!'}`;
  };

  SC.summary = (docs) => {
    const today = SC.todayISO();
    const month = SC.monthKey(today);
    let outstanding = 0, overdue = 0, paidMonth = 0;
    docs.forEach((d) => {
      if (d.type === 'estimate') return;
      const c = SC.calc(d);
      if (d.type === 'receipt') {
        if (SC.monthKey((d.payment && d.payment.date) || d.issueDate) === month) paidMonth += c.total;
        return;
      }
      (d.payments || []).forEach((p) => {
        if (SC.monthKey(p.date) === month) paidMonth += SC.num(p.amount);
      });
      const st = SC.statusOf(d, today);
      if (st === 'sent' || st === 'partial' || st === 'overdue') outstanding += c.balance;
      if (st === 'overdue') overdue += c.balance;
    });
    return { outstanding: SC.round2(outstanding), overdue: SC.round2(overdue), paidMonth: SC.round2(paidMonth) };
  };

  // Totals for documents inside a date range (ISO strings, either end may be empty).
  SC.summaryRange = (docs, from, to) => {
    const today = SC.todayISO();
    const inR = (d) => (!from || d >= from) && (!to || d <= to);
    let invoiced = 0, paid = 0, outstanding = 0, overdue = 0;
    docs.forEach((d) => {
      if (d.type === 'estimate') return;
      const c = SC.calc(d);
      if (d.type === 'receipt') {
        if (inR((d.payment && d.payment.date) || d.issueDate)) paid += c.total;
        return;
      }
      (d.payments || []).forEach((p) => { if (inR(p.date)) paid += SC.num(p.amount); });
      if (!inR(d.issueDate)) return;
      invoiced += c.total;
      const st = SC.statusOf(d, today);
      if (st === 'sent' || st === 'partial' || st === 'overdue') outstanding += c.balance;
      if (st === 'overdue') overdue += c.balance;
    });
    return { invoiced: SC.round2(invoiced), paid: SC.round2(paid), outstanding: SC.round2(outstanding), overdue: SC.round2(overdue) };
  };

  /* ---------- backup ---------- */
  SC.exportAll = () => ({
    app: 'sc-invoices', version: 1, exportedAt: new Date().toISOString(),
    docs: SC.docs.all(), customers: SC.customers.all(), items: SC.items.all(), settings: SC.getSettings()
  });
  SC.importAll = (obj) => {
    if (!obj || obj.app !== 'sc-invoices') throw new Error('This is not a Simplicity backup file');
    if (Array.isArray(obj.docs)) write(K.docs, obj.docs);
    if (Array.isArray(obj.customers)) write(K.customers, obj.customers);
    if (Array.isArray(obj.items)) write(K.items, obj.items);
    if (obj.settings && typeof obj.settings === 'object') write(K.settings, obj.settings);
  };
  SC.resetAll = () => {
    Object.values(K).forEach((k) => {
      try { root.localStorage.removeItem(k); } catch (e) { delete mem[k]; }
    });
  };
})(typeof window !== 'undefined' ? window : globalThis);
