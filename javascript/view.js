/* view.js — preview a document exactly as it prints, then send it, record payments,
   issue receipts, convert estimates, duplicate, print or save as PDF. */
(function () {
  'use strict';
  const SC = window.SC;
  const { esc, num, $ } = SC;

  const qs = new URLSearchParams(location.search);
  const id = qs.get('id');
  const s = SC.getSettings();
  const main = $('#main');
  SC.mountShell();

  let doc = SC.docs.get(id);
  if (!doc) {
    SC.setTitle('Not found');
    main.innerHTML = `<div class="empty"><h3>Document not found</h3><p>It may have been deleted on this device.</p>
      <a class="btn primary" href="../index.html">Back to documents</a></div>`;
    return;
  }
  let rcpt = qs.get('r') || ''; // payment id whose receipt is being previewed ('' = the document itself)
  const m = (n) => SC.money(n, s);
  const lower = (t) => t.toLowerCase();

  /* ---------- rendering ---------- */
  function paperHTML() {
    return SC.renderPaper(doc, s, { root: '../', receipt: rcpt || false });
  }
  function drawPaper() {
    const wrap = $('#pw');
    wrap.innerHTML = paperHTML();
    SC.fitPaper(wrap);
  }

  function actions() {
    const st = SC.statusOf(doc);
    const send = ['send', 'Send', SC.icon('share', 18)];
    const pay = ['pay', 'Payment', SC.icon('dollar', 18)];
    if (doc.type === 'receipt') return [{ k: 'share', l: 'Share', i: SC.icon('share', 18), p: 1 }, { k: 'pdf', l: 'PDF', i: SC.icon('download', 18) }];
    if (doc.type === 'estimate') {
      const conv = { k: 'convert', l: 'Convert to invoice', i: SC.icon('convert', 18) };
      const snd = { k: 'send', l: 'Send', i: SC.icon('share', 18) };
      if (doc.status === 'converted') return [Object.assign(snd, { p: 1 })];
      return doc.status === 'accepted' ? [Object.assign(conv, { p: 1 }), snd] : [Object.assign(snd, { p: 1 }), conv];
    }
    const snd = { k: 'send', l: send[1], i: send[2] };
    const rec = { k: pay[0], l: pay[1], i: pay[2] };
    if (st === 'draft') return [Object.assign(snd, { p: 1 }), rec];
    if (st === 'paid') return [{ k: 'receipt', l: 'Receipt', i: SC.icon('receipt', 18), p: 1 }, snd];
    return [Object.assign(rec, { p: 1 }), snd];
  }

  function draw() {
    doc = SC.docs.get(id);
    const c = SC.calc(doc);
    const st = SC.statusOf(doc);
    SC.setTitle(SC.TYPE_LABEL[doc.type] + ' #' + doc.number);
    document.title = SC.TYPE_LABEL[doc.type] + ' ' + doc.number + ' · ' + s.businessName;
    const pays = doc.type === 'invoice' ? doc.payments || [] : [];
    if (rcpt && !pays.some((p) => p.id === rcpt)) rcpt = '';
    const acts = actions();
    const showBal = doc.type === 'invoice' && c.paid > 0 && c.balance > 0;
    main.innerHTML = `
      <div class="card view-head">
        <div><div class="vh-num">${SC.TYPE_LABEL[doc.type]} #${esc(doc.number)}</div>
          <div class="muted">${esc((doc.customer && doc.customer.name) || 'No customer')} · ${esc(SC.fmtDate(doc.issueDate))}</div></div>
        <div class="vh-right">${SC.badge(st)}<strong>${m(c.total)}</strong>${showBal ? `<span class="hint">Balance ${m(c.balance)}</span>` : ''}</div>
      </div>
      ${pays.length ? `<select id="rc-sel" aria-label="Choose what to preview"><option value="">Invoice #${esc(doc.number)}</option>${pays.map((p) =>
        `<option value="${esc(p.id)}" ${rcpt === p.id ? 'selected' : ''}>Receipt ${esc(p.receiptNumber)} · ${m(p.amount)}</option>`).join('')}</select>` : ''}
      <div class="paper-wrap" id="pw"></div>`;
    drawPaper();
    scheduleWarm();
    let bar = $('#actionbar');
    if (!bar) { bar = document.createElement('div'); bar.id = 'actionbar'; bar.className = 'actionbar no-print'; $('.app').append(bar); }
    bar.innerHTML = `<button type="button" class="icon-btn round" data-a="back" aria-label="Back">${SC.icon('back')}</button>
      ${acts.map((a) => `<button type="button" class="btn ${a.p ? 'primary' : ''}" data-a="${a.k}">${a.i}${esc(a.l)}</button>`).join('')}
      <button type="button" class="icon-btn round" data-a="more" aria-label="More options">${SC.icon('more')}</button>`;
  }

  /* ---------- helpers ---------- */
  function markSent() {
    if (rcpt || doc.type === 'receipt' || doc.status !== 'draft') return;
    doc.status = 'sent';
    doc.sentAt = Date.now();
    SC.docs.save(doc);
    draw();
  }
  const shareMsg = () => SC.shareText(doc, s, rcpt || undefined);
  const subject = () => {
    const what = rcpt ? 'Receipt' : SC.TYPE_LABEL[doc.type];
    return `${what} ${rcpt ? ((doc.payments || []).find((p) => p.id === rcpt) || {}).receiptNumber || doc.number : doc.number} from ${s.businessName}`;
  };
  const row = (icon, label, sub, key, cls) =>
    `<button type="button" class="srow ${cls || ''}" data-r="${key}"><span class="ico-wrap">${SC.icon(icon, 20)}</span><span>${esc(label)}${sub ? `<small>${esc(sub)}</small>` : ''}</span></button>`;

  /* ---------- PDF: built ahead of time so Share can fire straight from a tap ---------- */
  let pdfCache = null; // { key, promise, file }
  const pdfKey = () => JSON.stringify([doc, rcpt]);
  function warmPdf() {
    const key = pdfKey();
    if (pdfCache && pdfCache.key === key) return pdfCache;
    const entry = { key, file: null, promise: null };
    entry.promise = SC.pdfBlob(paperHTML()).then((blob) => {
      entry.file = new File([blob], SC.docFileName(doc, rcpt), { type: 'application/pdf' });
      return entry.file;
    });
    entry.promise.catch(() => { if (pdfCache === entry) pdfCache = null; });
    pdfCache = entry;
    return entry;
  }
  let warmTimer = 0;
  const scheduleWarm = () => { clearTimeout(warmTimer); warmTimer = setTimeout(() => { try { warmPdf(); } catch (e) { /* ignore */ } }, 1500); };

  async function makePdf() {
    SC.toast('Preparing PDF…');
    try {
      const file = await warmPdf().promise;
      SC.saveBlob(file, file.name);
      SC.toast('PDF saved');
    } catch (e) { SC.toast((e && e.message) || 'Could not make the PDF'); }
  }

  /* ---------- Share: works inside an app's web view, not just in a browser ---------- */
  let linkCache = null;
  async function shareLink(extra) {
    if (!linkCache || linkCache.key !== pdfKey()) linkCache = { key: pdfKey(), url: await SC.link.make(doc, s, rcpt || '', extra) };
    return linkCache.url;
  }
  async function shareDoc() {
    const c = doc.customer || {};
    const entry = warmPdf();
    let file = entry.file;
    if (SC.native.canSharePdf()) {
      if (!file) { SC.toast('Preparing PDF…'); try { file = await entry.promise; } catch (e) { SC.toast('Could not make the PDF'); return; } }
      try { await SC.native.sharePdf(file, file.name, shareMsg()); markSent(); return; } catch (e) { /* fall through to the sheet */ }
    }
    if (!SC.isWebView() && file && navigator.canShare && navigator.canShare({ files: [file] })) {
      try { await navigator.share({ files: [file], title: subject(), text: shareMsg() }); markSent(); return; } catch (err) { if (err && err.name === 'AbortError') return; }
    }
    let url = '';
    try { url = await shareLink(); } catch (e) { /* no link */ }
    SC.openShareSheet({ title: 'Share', text: shareMsg(), url, phone: c.phone, email: c.email, subject: subject(), file, onSent: markSent });
  }

  // Print: the print dialog where the app allows it; otherwise a clear way to print from the phone's browser.
  async function printIt() {
    const name = SC.docFileName(doc, rcpt).replace(/\.pdf$/, '');
    if (SC.native.canPrint()) { try { SC.native.printPage(name); return; } catch (e) { /* fall through */ } }
    const old = document.title;
    let fired = false;
    const mark = () => { fired = true; };
    window.addEventListener('beforeprint', mark);
    document.title = name;
    document.documentElement.style.setProperty('--fit', String(SC.printFit()));
    try { window.print(); } catch (e) { /* blocked */ }
    setTimeout(() => {
      window.removeEventListener('beforeprint', mark);
      document.title = old; document.documentElement.style.removeProperty('--fit');
      if (!fired && SC.isWebView()) printFallback();
    }, 1400);
  }
  async function printFallback() {
    const c = doc.customer || {};
    let url = '';
    try { url = await shareLink(); } catch (e) { /* ignore */ }
    const sh = SC.sheet.open({
      title: 'Print',
      body: `<p class="hint" style="margin-bottom:10px">Printing isn't available inside this app. Open the document in your phone's browser and the print screen will appear there.</p><div class="list">
        ${url ? row('print', 'Open in browser to print', 'Print screen opens automatically', 'obr') : ''}
        ${row('download', 'Save PDF', 'Print it from any other app', 'pdf')}
        ${url ? row('share', 'Share link', 'Send it to a printer or another phone', 'lnk') : ''}</div>`
    });
    sh.el.addEventListener('click', (e) => {
      const b = e.target.closest('[data-r]');
      if (!b) return;
      sh.close();
      if (b.dataset.r === 'obr') SC.openExternal(url + (url.includes('?') ? '&' : '?') + 'print=1');
      else if (b.dataset.r === 'pdf') makePdf();
      else SC.openShareSheet({ title: 'Share link', text: shareMsg(), url, phone: c.phone, email: c.email, subject: subject(), onSent: markSent });
    });
  }

  /* ---------- send ---------- */
  function openSend() {
    const c = doc.customer || {};
    const sh = SC.sheet.open({
      title: rcpt || doc.type === 'receipt' ? 'Share receipt' : 'Send ' + lower(SC.TYPE_LABEL[doc.type]),
      body: `<div class="list">
        ${row('chat', 'WhatsApp', c.phone || 'Send a message', 'wa')}
        ${row('mail', 'Email', c.email || 'Opens your email app', 'mail')}
        ${row('chat', 'Text message', c.phone || '', 'sms')}
        ${row('share', 'Share', 'Send the PDF with any app', 'sharepdf')}
        ${row('copy', 'Copy message', '', 'copy')}
        ${row('download', 'Download PDF', '', 'pdf')}
        ${row('print', 'Print', '', 'print')}
      </div>`
    });
    sh.el.addEventListener('click', async (e) => {
      const b = e.target.closest('[data-r]');
      if (!b) return;
      const k = b.dataset.r;
      const text = shareMsg();
      if (k === 'wa') { sh.close(); window.open('https://wa.me/' + SC.waNumber(c.phone) + '?text=' + encodeURIComponent(text), '_blank'); markSent(); }
      else if (k === 'mail') { sh.close(); location.href = 'mailto:' + encodeURIComponent(c.email || '') + '?subject=' + encodeURIComponent(subject()) + '&body=' + encodeURIComponent(text); markSent(); }
      else if (k === 'sms') { sh.close(); location.href = 'sms:' + (c.phone || '') + '?body=' + encodeURIComponent(text); markSent(); }
      else if (k === 'sharepdf') { sh.close(); shareDoc(); }
      else if (k === 'copy') {
        try { await navigator.clipboard.writeText(text); SC.toast('Message copied'); } catch (err) { SC.toast('Could not copy'); }
        sh.close(); markSent();
      }
      else if (k === 'pdf') { sh.close(); makePdf(); }
      else if (k === 'print') { sh.close(); setTimeout(printIt, 300); }
    });
  }

  /* ---------- record payment ---------- */
  function openPayment() {
    const c = SC.calc(doc);
    const sh = SC.sheet.open({
      title: 'Record payment',
      body: `<div class="field"><label for="rp-amt">Amount (${esc(s.currencySymbol)})</label><input id="rp-amt" inputmode="decimal" value="${c.balance || ''}"></div>
        <div class="grid2"><div class="field"><label for="rp-date">Date</label><input id="rp-date" type="date" value="${SC.todayISO()}"></div>
        <div class="field"><label for="rp-method">Method</label><select id="rp-method">${SC.METHODS.map((x) => `<option>${esc(x)}</option>`).join('')}</select></div></div>
        <div class="field"><label for="rp-ref">Reference</label><input id="rp-ref" placeholder="Optional" autocomplete="off"></div>
        <p class="hint">Balance due: ${m(c.balance)}. A receipt is created automatically.</p>`,
      footer: `<button type="button" class="btn primary" data-save>Save payment</button>`
    });
    sh.el.querySelector('[data-save]').addEventListener('click', () => {
      const amount = num($('#rp-amt', sh.el).value);
      if (amount <= 0) { SC.toast('Enter an amount'); return; }
      const pay = SC.addPayment(doc, { amount, date: $('#rp-date', sh.el).value, method: $('#rp-method', sh.el).value, reference: $('#rp-ref', sh.el).value.trim() });
      if (doc.status === 'draft') doc.status = 'sent';
      SC.docs.save(doc);
      rcpt = pay.id;
      sh.close();
      draw();
      SC.toast('Payment recorded · ' + pay.receiptNumber);
    });
  }

  /* ---------- more ---------- */
  function openMore() {
    const st = SC.statusOf(doc);
    const pays = doc.type === 'invoice' ? doc.payments || [] : [];
    const sh = SC.sheet.open({
      title: 'Options',
      body: `<div class="list">
        ${row('edit', 'Edit', '', 'edit')}
        ${row('copy', 'Duplicate', 'Make a new draft from this', 'dup')}
        ${doc.type === 'invoice' && st === 'draft' ? row('check', 'Mark as sent', '', 'sent') : ''}
        ${doc.type === 'estimate' && doc.status !== 'converted' && doc.status !== 'accepted' ? row('check', 'Mark as accepted', '', 'accept') : ''}
        ${doc.type === 'estimate' && doc.status === 'draft' ? row('check', 'Mark as sent', '', 'sent') : ''}
        ${doc.type === 'invoice' && st !== 'paid' ? row('dollar', 'Record payment', '', 'pay') : ''}
        ${row('download', 'Download PDF', '', 'pdf')}
        ${row('print', 'Print', '', 'print')}
        ${pays.map((p) => row('receipt', `Receipt ${p.receiptNumber}`, `${m(p.amount)} · ${SC.fmtDate(p.date)} · ${p.method}`, 'p:' + p.id)).join('')}
        ${row('trash', 'Delete', '', 'del', 'danger')}
      </div>`
    });
    sh.el.addEventListener('click', async (e) => {
      const b = e.target.closest('[data-r]');
      if (!b) return;
      const k = b.dataset.r;
      sh.close();
      if (k === 'edit') location.href = 'new.html?id=' + encodeURIComponent(doc.id);
      else if (k === 'dup') { const c = SC.duplicateDoc(doc); SC.docs.save(c); location.href = 'view.html?id=' + encodeURIComponent(c.id); }
      else if (k === 'sent') { doc.status = 'sent'; doc.sentAt = Date.now(); SC.docs.save(doc); draw(); SC.toast('Marked as sent'); }
      else if (k === 'accept') { doc.status = 'accepted'; SC.docs.save(doc); draw(); SC.toast('Estimate accepted'); }
      else if (k === 'pay') setTimeout(openPayment, 280);
      else if (k === 'pdf') makePdf();
      else if (k === 'print') setTimeout(printIt, 300);
      else if (k === 'del') {
        if (await SC.confirm({ title: 'Delete this document?', text: `${SC.TYPE_LABEL[doc.type]} #${doc.number} will be permanently removed from this device.`, ok: 'Delete', danger: true })) {
          SC.docs.remove(doc.id);
          location.replace('../index.html');
        }
      }
      else if (k.startsWith('p:')) setTimeout(() => openPaymentActions(k.slice(2)), 280);
    });
  }

  function openPaymentActions(pid) {
    const p = (doc.payments || []).find((x) => x.id === pid);
    if (!p) return;
    const sh = SC.sheet.open({
      title: 'Receipt ' + p.receiptNumber,
      body: `<p class="hint" style="font-size:15px;padding-bottom:8px">${m(p.amount)} received ${esc(SC.fmtDate(p.date))} by ${esc(p.method)}${p.reference ? ' · ' + esc(p.reference) : ''}.</p>
        <div class="list">${row('receipt', 'View receipt', '', 'view')}${row('trash', 'Remove payment', 'The receipt number is not reused', 'rm', 'danger')}</div>`
    });
    sh.el.addEventListener('click', async (e) => {
      const b = e.target.closest('[data-r]');
      if (!b) return;
      sh.close();
      if (b.dataset.r === 'view') { rcpt = pid; draw(); }
      if (b.dataset.r === 'rm' && await SC.confirm({ title: 'Remove this payment?', text: 'The balance on the invoice goes back up.', ok: 'Remove', danger: true })) {
        doc.payments = (doc.payments || []).filter((x) => x.id !== pid);
        SC.docs.save(doc);
        if (rcpt === pid) rcpt = '';
        draw();
        SC.toast('Payment removed');
      }
    });
  }

  /* ---------- events ---------- */
  main.addEventListener('change', (e) => {
    if (e.target.id === 'rc-sel') { rcpt = e.target.value; drawPaper(); }
  });
  $('.app').addEventListener('click', (e) => {
    const b = e.target.closest('[data-a]');
    if (!b) return;
    const k = b.dataset.a;
    if (k === 'back') SC.go(history.length > 1 ? -1 : '../index.html', true);
    else if (k === 'send') openSend();
    else if (k === 'share') shareDoc();
    else if (k === 'pay') openPayment();
    else if (k === 'more') openMore();
    else if (k === 'pdf') makePdf();
    else if (k === 'receipt') {
      const pays = doc.payments || [];
      rcpt = pays.length ? pays[pays.length - 1].id : '';
      draw();
      window.scrollTo({ top: 0, behavior: 'smooth' });
    }
    else if (k === 'convert') {
      const inv = SC.estimateToInvoice(doc);
      SC.docs.save(inv);
      doc.status = 'converted';
      doc.convertedTo = inv.id;
      SC.docs.save(doc);
      SC.go('view.html?id=' + encodeURIComponent(inv.id));
    }
  });

  draw();
})();
