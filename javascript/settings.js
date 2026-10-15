/* settings.js — business details, logo, currency/tax, numbering, payment text,
   product feed address, and backup/restore. Every field saves as you leave it. */
(function () {
  'use strict';
  const SC = window.SC;
  const { esc, num, $ } = SC;

  SC.mountShell();
  const main = $('#main');
  let s = SC.getSettings();

  const text = (k, label, ph) => `<div class="field"><label for="s-${k}">${label}</label><input id="s-${k}" data-k="${k}" value="${esc(s[k])}" placeholder="${esc(ph || '')}" autocomplete="off"></div>`;
  const numf = (k, label) => `<div class="field"><label for="s-${k}">${label}</label><input id="s-${k}" data-k="${k}" data-t="num" inputmode="decimal" value="${esc(s[k])}"></div>`;
  const area = (k, label, ph) => `<div class="field"><label for="s-${k}">${label}</label><textarea id="s-${k}" data-k="${k}" placeholder="${esc(ph || '')}">${esc(s[k])}</textarea></div>`;

  function logoSrc() {
    return /^(https?:|data:|\/)/i.test(s.logo || '') ? s.logo : '../' + (s.logo || '');
  }

  function draw() {
    main.innerHTML = `
      <section class="card"><div class="card-title">Appearance</div>
        <div class="seg" id="theme-seg">${[['auto', 'Auto'], ['light', 'Light'], ['dark', 'Dark']].map(([k, l]) => `<button type="button" data-theme="${k}" class="${(s.theme || 'auto') === k ? 'on' : ''}">${l}</button>`).join('')}</div>
        <p class="hint" style="margin-top:10px">Auto follows your phone's setting.</p>
      </section>

      <section class="card"><div class="card-title">Business</div>
        ${text('businessName', 'Business name')}
        ${text('tagline', 'Tagline')}
        ${area('contactLines', 'Contact lines (shown under the name)', 'One per line')}
        <div class="grid2">${text('email', 'Email')}${text('phone', 'Phone')}</div>
        ${text('location', 'Location (receipts)')}
        ${text('receivedBy', 'Received by (receipts)', 'Your name')}
      </section>

      <section class="card"><div class="card-title">Logo</div>
        <div class="row-between" style="margin-bottom:12px"><img id="logo-prev" alt="" style="max-height:70px;max-width:60%;object-fit:contain" src="${esc(logoSrc())}" onerror="this.style.display='none'">
          <div style="display:grid;gap:8px"><label class="btn small" for="logo-file" style="cursor:pointer">${SC.icon('upload', 16)} Upload</label>
          <button type="button" class="btn small" id="logo-reset">Use default</button></div></div>
        <input id="logo-file" type="file" accept="image/*" hidden>
        <label class="check"><input type="checkbox" data-k="showWatermark" data-t="bool" ${s.showWatermark ? 'checked' : ''}> Show faint logo watermark on documents</label>
      </section>

      <section class="card"><div class="card-title">Money &amp; tax</div>
        <div class="grid2">${text('currencySymbol', 'Currency symbol')}${text('currencyCode', 'Currency code')}</div>
        ${text('currencyName', 'Currency name (receipts)')}
        <div class="grid2">${text('taxName', 'Tax name')}${numf('taxRate', 'Default tax rate (%)')}</div>
        ${numf('defaultDueDays', 'Default due in (days, 0 = on receipt)')}
      </section>

      <section class="card"><div class="card-title">Numbering</div>
        <div class="grid2">${text('invoicePrefix', 'Invoice prefix')}${numf('nextInvoice', 'Next invoice no.')}</div>
        <div class="grid2">${text('estimatePrefix', 'Estimate prefix')}${numf('nextEstimate', 'Next estimate no.')}</div>
        ${numf('nextReceipt', 'Next receipt no.')}
      </section>

      <section class="card"><div class="card-title">Document text</div>
        ${area('invoiceTerms', 'Default terms')}
        ${text('thanksLine', 'Thank-you line')}
      </section>

      <section class="card"><div class="card-title">Backup</div>
        <p class="hint" style="margin-bottom:12px">Your documents live on this device. Save a backup file now and then, especially before clearing browser data.</p>
        <div class="btn-row"><button type="button" class="btn" id="bk-export">${SC.icon('download', 18)} Export</button>
          <label class="btn" for="bk-file" style="cursor:pointer">${SC.icon('upload', 18)} Import</label></div>
        <input id="bk-file" type="file" accept=".json,application/json" hidden>
        <button type="button" class="btn danger block" id="bk-reset" style="margin-top:12px">Erase everything on this device</button>
      </section>`;
  }

  /* ---------- autosave ---------- */
  function save(el) {
    const k = el.dataset.k;
    if (!k) return;
    s[k] = el.dataset.t === 'bool' ? el.checked : el.dataset.t === 'num' ? num(el.value) : el.value.trim();
    SC.saveSettings(s);
    SC.toast('Saved');
  }
  main.addEventListener('change', (e) => { if (e.target.dataset && e.target.dataset.k) save(e.target); });

  /* ---------- logo ---------- */
  function shrink(file) {
    return new Promise((resolve, reject) => {
      const fr = new FileReader();
      fr.onerror = () => reject(new Error('Could not read that image'));
      fr.onload = () => {
        const img = new Image();
        img.onerror = () => reject(new Error('That is not an image'));
        img.onload = () => {
          const k = Math.min(1, 700 / Math.max(img.width, img.height));
          const c = document.createElement('canvas');
          c.width = Math.round(img.width * k);
          c.height = Math.round(img.height * k);
          c.getContext('2d').drawImage(img, 0, 0, c.width, c.height);
          resolve(c.toDataURL('image/png'));
        };
        img.src = fr.result;
      };
      fr.readAsDataURL(file);
    });
  }
  main.addEventListener('change', async (e) => {
    if (e.target.id !== 'logo-file' || !e.target.files[0]) return;
    try {
      s.logo = await shrink(e.target.files[0]);
      SC.saveSettings(s);
      const p = $('#logo-prev');
      p.style.display = '';
      p.src = s.logo;
      SC.toast('Logo updated');
    } catch (err) { SC.toast(err.message); }
    e.target.value = '';
  });
  main.addEventListener('click', async (e) => {
    const t = e.target;
    const th = t.closest('#theme-seg [data-theme]');
    if (th) {
      s.theme = th.dataset.theme;
      SC.saveSettings(s);
      SC.applyTheme(s.theme);
      document.querySelectorAll('#theme-seg button').forEach((x) => x.classList.toggle('on', x === th));
      return;
    }
    if (t.closest('#logo-reset')) {
      s.logo = SC.DEFAULT_SETTINGS.logo;
      SC.saveSettings(s);
      const p = $('#logo-prev');
      p.style.display = '';
      p.src = logoSrc();
      SC.toast('Default logo restored');
    } else if (t.closest('#bk-export')) {
      SC.saveBlob(new Blob([JSON.stringify(SC.exportAll(), null, 2)], { type: 'application/json' }), 'simplicity-backup-' + SC.todayISO() + '.json');
    } else if (t.closest('#bk-reset')) {
      if (await SC.confirm({ title: 'Erase everything?', text: 'All documents, customers and settings on this device will be deleted. Export a backup first if unsure.', ok: 'Erase', danger: true })) {
        SC.resetAll();
        location.reload();
      }
    }
  });
  main.addEventListener('change', async (e) => {
    if (e.target.id !== 'bk-file' || !e.target.files[0]) return;
    try {
      SC.importAll(JSON.parse(await e.target.files[0].text()));
      SC.toast('Backup restored');
      setTimeout(() => location.reload(), 700);
    } catch (err) { SC.toast(err.message || 'Could not read that file'); }
    e.target.value = '';
  });

  draw();
})();
