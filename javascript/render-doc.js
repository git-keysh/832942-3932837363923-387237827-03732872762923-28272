/* render-doc.js — draws the printable document (invoice / estimate / receipt) as HTML.
   Pure string building, so the same output is used for the on-screen preview and for printing. */
(function (root) {
  'use strict';
  const SC = root.SC;
  const { esc, num } = SC;

  const asset = (path, rootP) => (!path ? '' : /^(https?:|data:|\/)/i.test(path) ? path : (rootP || '') + path);
  const qtyFmt = (q) => {
    const n = num(q);
    return Number.isInteger(n) ? String(n) : String(SC.round2(n));
  };
  const hide = `onerror="this.style.display='none'"`;

  /* ---------- invoice / estimate ---------- */
  function invoiceHTML(doc, s, o) {
    const isEst = doc.type === 'estimate';
    const c = SC.calc(doc);
    const st = SC.statusOf(doc);
    const m = (n) => SC.money(n, s);
    const logo = asset(s.logo, o.root);
    const cust = doc.customer || {};
    const bizBlock = [s.tagline, s.contactLines].filter(Boolean).join('\n');
    const custLines = [cust.phone, cust.email, cust.address].filter(Boolean).map(esc).join('<br>');

    const rows =
      (doc.items || [])
        .map(
          (i) => `<tr>
            <td class="p-name">${esc(i.name) || '&nbsp;'}${i.variant ? `<span class="p-sub">${esc(i.variant)}</span>` : ''}</td>
            <td class="r">${m(i.price)}</td><td class="c">${qtyFmt(i.qty)}</td><td class="r">${m(num(i.price) * num(i.qty))}</td></tr>`
        )
        .join('') || '<tr><td colspan="4" class="p-empty">No items added</td></tr>';

    const tot = [['Subtotal', m(c.subtotal)]];
    if (c.discount > 0) {
      const d = doc.discount || {};
      tot.push([`Discount${d.type === 'percent' ? ` (${qtyFmt(d.value)}%)` : ''}`, '-' + m(c.discount)]);
    }
    if (num(doc.taxRate) > 0) tot.push([`${esc(s.taxName)} (${qtyFmt(doc.taxRate)}%)`, m(c.taxAmount)]);
    if (c.shipping > 0) tot.push(['Delivery', m(c.shipping)]);
    tot.push(['Total', m(c.total)]);
    if (!isEst && c.paid > 0) tot.push(['Paid', '-' + m(c.paid)]);
    if (num(doc.deposit) > 0 && c.paid === 0) tot.push(['Deposit required', m(doc.deposit)]);

    const dueLabel = isEst ? 'Estimate total' : c.paid > 0 ? 'Balance due' : 'Amount due';
    const dueAmt = isEst ? c.total : c.balance;
    const payBlock = SC.payText(doc, s)
      ? `<div class="p-block"><span class="lbl">PAYMENT DETAILS</span><p>${esc(SC.payText(doc, s)).replace(/\n/g, '<br>')}</p></div>` : '';
    const noteBlock = doc.notes ? `<div class="p-block"><span class="lbl">NOTES</span><p>${esc(doc.notes).replace(/\n/g, '<br>')}</p></div>` : '';
    const termBlock = doc.terms ? `<div class="p-block"><span class="lbl">TERMS</span><p>${esc(doc.terms).replace(/\n/g, '<br>')}</p></div>` : '';

    return `<div class="paper" data-type="${doc.type}" data-status="${st}">
      ${s.showWatermark && logo ? `<img class="p-wm" src="${esc(logo)}" alt="" ${hide}>` : ''}
      <h1 class="p-title">${isEst ? 'ESTIMATE' : 'INVOICE'}</h1>
      <div class="p-head">
        <div class="p-biz">
          <h2>${esc(s.businessName)}</h2>
          <p class="p-muted">${esc(bizBlock)}</p>
        </div>
        <div class="p-logo">${logo ? `<img src="${esc(logo)}" alt="" ${hide}>` : ''}</div>
      </div>
      <div class="p-meta">
        <div class="p-bill">
          <span class="lbl">BILL TO</span>
          <strong>${esc(cust.name) || '—'}</strong>
          ${custLines ? `<small>${custLines}</small>` : ''}
        </div>
        <dl class="p-facts">
          <div><dt>${isEst ? 'ESTIMATE #' : 'INVOICE #'}</dt><dd>${esc(doc.number)}</dd></div>
          <div><dt>ISSUED</dt><dd>${esc(SC.fmtDate(doc.issueDate))}</dd></div>
          ${doc.dueDate ? `<div><dt>${isEst ? 'VALID UNTIL' : 'DUE'}</dt><dd>${esc(SC.fmtDate(doc.dueDate))}</dd></div>` : ''}
          ${doc.fromEstimate ? `<div><dt>ESTIMATE #</dt><dd>${esc(doc.fromEstimate)}</dd></div>` : ''}
        </dl>
      </div>
      <table class="p-items">
        <thead><tr><th>ITEM</th><th class="r">PRICE</th><th class="c">QUANTITY</th><th class="r">AMOUNT</th></tr></thead>
        <tbody>${rows}</tbody>
      </table>
      <div class="p-totals">
        ${tot.map(([a, b]) => `<div class="p-trow"><span>${a}</span><span>${b}</span></div>`).join('')}
        <div class="p-due"><span>${dueLabel}</span><strong>${m(dueAmt)}</strong></div>
      </div>
      ${st === 'paid' ? '<div class="p-stamp">PAID</div>' : ''}
      ${noteBlock}${payBlock}${termBlock}
    </div>`;
  }

  /* ---------- receipt ---------- */
  function receiptHTML(doc, s, o) {
    const r = SC.receiptData(doc, o.receipt === true ? undefined : o.receipt);
    const c = r.calc;
    const m = (n) => SC.money(n, s);
    const logo = asset(s.logo, o.root);
    const part = r.balance > 0;
    const cust = r.customer || {};
    const rows = r.items
      .map((i) => `<tr><td>${esc(i.name)}${i.variant ? ` <span class="r-var">· ${esc(i.variant)}</span>` : ''}</td><td class="r">${m(num(i.price) * num(i.qty))}</td></tr>`)
      .join('');
    const extra = [];
    if (c.discount > 0) extra.push(['Discount', '-' + m(c.discount)]);
    if (c.taxAmount > 0) extra.push([esc(s.taxName), m(c.taxAmount)]);
    if (c.shipping > 0) extra.push(['Delivery', m(c.shipping)]);
    if (r.forInvoice) extra.push([`Invoice #${esc(r.forInvoice)} total`, m(c.total)]);
    const extraRows = extra.map(([a, b]) => `<tr class="r-extra"><td>${a}</td><td class="r">${b}</td></tr>`).join('');
    const paidTo = SC.payText(doc, s)
      ? `<div class="r-card wide"><span class="lbl">PAID TO</span><p>${esc(SC.payText(doc, s)).replace(/\n/g, '<br>')}</p></div>` : '';
    const check = '<svg width="30" height="30" viewBox="0 0 24 24" fill="none" stroke="#fff" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><path d="M5 12.5l4.5 4.5L19 7.5"/></svg>';
    const statusTxt = part ? 'PART PAID' : 'PAID';

    return `<div class="paper receipt" data-type="receipt" data-status="${part ? 'partial' : 'paid'}">
      <div class="r-head">
        <div>
          <div class="r-brand">${logo ? `<img class="r-mark" src="${esc(logo)}" alt="" ${hide}>` : ''}<span>${esc(s.businessName)}</span>
            <span class="r-pill${part ? ' part' : ''}">&#10003; ${statusTxt}</span></div>
          ${s.location ? `<div class="r-loc">${esc(s.location)}</div>` : ''}
        </div>
        <div class="r-confirm"><div class="r-check${part ? ' part' : ''}">${check}</div><span>PAYMENT CONFIRMED</span></div>
      </div>
      <hr class="r-rule">
      <h1 class="r-title">PAYMENT RECEIPT</h1>
      <p class="r-sub">Official confirmation of payment received</p>

      <div class="r-meta">
        <div><span class="lbl"># RECEIPT #</span><strong>${esc(r.number)}</strong></div>
        <div><span class="lbl">DATE</span><strong>${esc(SC.fmtDate(r.date, 'long'))}</strong></div>
        <div class="end"><span class="lbl">STATUS</span><strong class="${part ? 'warn' : 'ok'}">&bull; ${statusTxt}</strong></div>
      </div>

      <div class="r-parties">
        <div><span class="lbl">RECEIVED FROM</span><strong>${esc(cust.name) || '—'}</strong><small>${esc(cust.email || cust.phone || '')}</small></div>
        <div class="end"><span class="lbl">RECEIVED BY</span><strong>${esc(s.businessName)}</strong>${s.receivedBy ? `<small>${esc(s.receivedBy)}</small>` : ''}</div>
      </div>

      <div class="r-amount${part ? ' part' : ''}">
        <div class="r-wm">${statusTxt}</div>
        <span class="lbl">$ TOTAL AMOUNT RECEIVED</span>
        <div class="r-big">${m(r.amount)}</div>
        <div class="r-cur">${esc(s.currencyName)} (${esc(s.currencyCode)})</div>
      </div>

      <div class="r-cards">
        <div class="r-card"><span class="lbl">PAYMENT METHOD</span><strong>${esc(r.method) || '—'}</strong></div>
        <div class="r-card"><span class="lbl">REFERENCE</span><strong class="mono">${esc(r.reference) || '—'}</strong></div>
      </div>
      ${paidTo}

      <div class="r-itemslbl">ITEMS / SERVICES</div>
      <table class="r-items">
        <thead><tr><th>Description</th><th class="r">Amount (${esc(s.currencyCode)})</th></tr></thead>
        <tbody>${rows}${extraRows}</tbody>
        <tfoot>
          <tr class="r-total"><td>TOTAL PAID</td><td class="r">${m(r.amount)}</td></tr>
          ${part ? `<tr class="r-extra"><td>Balance remaining</td><td class="r">${m(r.balance)}</td></tr>` : ''}
        </tfoot>
      </table>

      <div class="r-foot">
        <span>${esc(s.businessName)}${s.receivedBy ? ' &bull; ' + esc(s.receivedBy) : ''}</span>
        <span>${[s.email, s.phone].filter(Boolean).map(esc).join(' &bull; ')}</span>
      </div>
      <div class="r-thanks"><strong>${esc(s.thanksLine || 'Thank you for your business!')}</strong>
        <small>This is a system-generated receipt. No signature required.</small></div>
    </div>`;
  }

  /* opts: { root: path prefix to site root, receipt: false | true | paymentId } */
  SC.renderPaper = (doc, settings, opts) => {
    opts = opts || {};
    return opts.receipt || doc.type === 'receipt' ? receiptHTML(doc, settings, opts) : invoiceHTML(doc, settings, opts);
  };
})(typeof window !== 'undefined' ? window : globalThis);
