/* common.js — helpers shared by several pages: paper scaling, confirm sheet,
   customer editor, PDF building and small formatters. Load after shell.js. */
(function (root) {
  'use strict';
  const SC = root.SC;
  const { esc } = SC;

  SC.initials = (n) =>
    (String(n || '?').trim().split(/\s+/).slice(0, 2).map((w) => w[0] || '').join('') || '?').toUpperCase();

  SC.ago = (ts) => {
    if (!ts) return 'never';
    const m = Math.round((Date.now() - ts) / 60000);
    if (m < 1) return 'just now';
    if (m < 60) return m + ' min ago';
    const h = Math.round(m / 60);
    return h < 24 ? h + ' hr ago' : Math.round(h / 24) + ' d ago';
  };


  /* ---------- product helpers ---------- */
  // Availability badge: uses the feed's price_note ("In Stock", "On Order", …).
  SC.stockTag = (p) => {
    const label = p.note || (p.inStock ? 'In stock' : 'Out of stock');
    const good = p.inStock && !/order|pre-?order|backorder/i.test(label);
    return `<span class="tag ${good ? 'in' : 'out'}">${esc(label)}</span>`;
  };

  // Descriptions in the feed use **bold** and "-" bullet lines.
  SC.mdHTML = (txt) => {
    const inline = (t) => esc(t).replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>');
    let out = '', list = false;
    String(txt || '').split(/\n/).forEach((raw) => {
      const line = raw.trim();
      const b = /^[-•]\s*(.+)$/.exec(line);
      if (b) { if (!list) { out += '<ul style="margin:6px 0;padding-left:18px">'; list = true; } out += '<li>' + inline(b[1]) + '</li>'; return; }
      if (list) { out += '</ul>'; list = false; }
      if (line) out += '<p style="margin:8px 0">' + inline(line) + '</p>';
    });
    return out + (list ? '</ul>' : '');
  };

  /* ---------- scale the fixed-width A4 paper to the phone screen ---------- */
  SC.PAPER_W = 794;
  const fitters = new Set();
  SC.fitPaper = (wrap) => {
    const paper = wrap.querySelector('.paper');
    if (!paper) return;
    const fit = () => {
      if (!document.body.contains(wrap)) { fitters.delete(fit); return; }
      const k = Math.min(1, wrap.clientWidth / SC.PAPER_W);
      paper.style.transform = 'scale(' + k + ')';
      wrap.style.height = Math.ceil(paper.offsetHeight * k) + 'px';
    };
    fit();
    fitters.add(fit);
    wrap.querySelectorAll('img').forEach((im) => im.addEventListener('load', fit));
  };
  root.addEventListener('resize', () => fitters.forEach((f) => f()));

  /* ---------- confirm sheet -> Promise<boolean> ---------- */
  SC.confirm = (o) =>
    new Promise((resolve) => {
      let done = false;
      const sh = SC.sheet.open({
        title: o.title || 'Are you sure?',
        body: `<p class="hint" style="font-size:15px;padding:6px 0 10px">${esc(o.text || '')}</p>`,
        footer: `<button type="button" class="btn" data-sheet-close>Cancel</button>` +
          `<button type="button" class="btn ${o.danger ? 'danger' : 'primary'}" data-ok>${esc(o.ok || 'Confirm')}</button>`,
        onClose: () => { if (!done) { done = true; resolve(false); } }
      });
      sh.el.querySelector('[data-ok]').addEventListener('click', () => { done = true; resolve(true); sh.close(); });
    });

  /* ---------- customer editor (always saves to the customer list) ---------- */
  SC.editCustomer = (cust, o) => {
    o = o || {};
    const c = Object.assign({ id: '', name: '', phone: '', email: '', address: '' }, cust || {});
    const sh = SC.sheet.open({
      title: c.id ? 'Edit customer' : 'New customer',
      body:
        `<div class="field"><label for="cf-name">Name</label><input id="cf-name" autocomplete="off" value="${esc(c.name)}" placeholder="Customer or company name"></div>` +
        `<div class="field"><label for="cf-phone">Phone</label><input id="cf-phone" type="tel" value="${esc(c.phone)}" placeholder="(868) 000-0000"></div>` +
        `<div class="field"><label for="cf-email">Email</label><input id="cf-email" type="email" value="${esc(c.email)}" placeholder="name@email.com"></div>` +
        `<div class="field"><label for="cf-addr">Address</label><textarea id="cf-addr" placeholder="Optional">${esc(c.address)}</textarea></div>`,
      footer: (c.id && o.canDelete ? `<button type="button" class="btn danger" data-del>Delete</button>` : '') +
        `<button type="button" class="btn primary" data-save>Save</button>`
    });
    const $v = (id) => sh.el.querySelector(id).value.trim();
    sh.el.querySelector('[data-save]').addEventListener('click', () => {
      const name = $v('#cf-name');
      if (!name) { SC.toast('Enter a name'); return; }
      const saved = SC.customers.save({ id: c.id || SC.uid('cus'), name, phone: $v('#cf-phone'), email: $v('#cf-email'), address: $v('#cf-addr') });
      sh.close();
      SC.toast('Customer saved');
      if (o.onSave) o.onSave(saved);
    });
    const del = sh.el.querySelector('[data-del]');
    if (del) del.addEventListener('click', async () => {
      sh.close();
      if (await SC.confirm({ title: 'Delete customer?', text: `${c.name} will be removed from your list. Existing documents keep their details.`, ok: 'Delete', danger: true })) {
        SC.customers.remove(c.id);
        SC.toast('Customer deleted');
        if (o.onDelete) o.onDelete();
      }
    });
    return sh;
  };

  /* ---------- files ---------- */
  SC.saveBlob = (blob, name) => {
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = name;
    document.body.append(a);
    a.click();
    setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 1500);
  };

  SC.docFileName = (doc, payId) => {
    const clean = (t) => String(t || '').replace(/[^\w\-]+/g, '-');
    if (doc.type === 'receipt') return 'Receipt_' + clean(doc.number) + '.pdf';
    if (payId) {
      const p = (doc.payments || []).find((x) => x.id === payId);
      return 'Receipt_' + clean(p && p.receiptNumber ? p.receiptNumber : doc.number) + '.pdf';
    }
    return SC.TYPE_LABEL[doc.type] + '-' + clean(doc.number) + '.pdf';
  };

  /* ---------- PDF (html2canvas + jsPDF, loaded on demand) ---------- */
  const loadScript = (src) =>
    new Promise((res, rej) => {
      const el = document.createElement('script');
      el.src = src;
      el.onload = res;
      el.onerror = () => rej(new Error('Could not load the PDF tools. Check your internet connection.'));
      document.head.append(el);
    });

  // Scale factor that makes a paper element fit on one A4 sheet when printing.
  SC.printFit = () => {
    const paper = document.querySelector('.paper');
    if (!paper) return 1;
    return Math.min(1, 1118 / Math.max(1, paper.offsetHeight));
  };

  SC.pdfBlob = async (paperHTML) => {
    if (!root.html2canvas) await loadScript('https://cdnjs.cloudflare.com/ajax/libs/html2canvas/1.4.1/html2canvas.min.js');
    if (!root.jspdf) await loadScript('https://cdnjs.cloudflare.com/ajax/libs/jspdf/2.5.1/jspdf.umd.min.js');
    const host = document.createElement('div');
    host.style.cssText = 'position:fixed;left:-10000px;top:0;width:' + SC.PAPER_W + 'px;';
    host.innerHTML = paperHTML;
    document.body.append(host);
    try {
      await Promise.all(Array.from(host.querySelectorAll('img')).map((i) => (i.complete ? 0 : new Promise((r) => { i.onload = i.onerror = r; }))));
      const paper = host.querySelector('.paper');
      const canvas = await root.html2canvas(paper, { scale: 2, backgroundColor: '#ffffff', useCORS: true });
      const pdf = new root.jspdf.jsPDF({ unit: 'pt', format: 'a4' });
      const pw = pdf.internal.pageSize.getWidth();
      const ph = pdf.internal.pageSize.getHeight();
      // Always one page: if the document is taller than A4, shrink it to fit and centre it.
      const imgH = (canvas.height * pw) / canvas.width;
      const k = Math.min(1, ph / imgH);
      const w = pw * k;
      pdf.addImage(canvas.toDataURL('image/jpeg', 0.92), 'JPEG', (pw - w) / 2, 0, w, imgH * k);
      return pdf.output('blob');
    } finally {
      host.remove();
    }
  };
})(typeof window !== 'undefined' ? window : globalThis);
