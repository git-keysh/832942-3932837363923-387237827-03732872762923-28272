/* native.js — everything that has to reach outside the page: sharing, printing, opening links,
   notifications. Works in a normal browser, in a phone WebView app, and (optionally) with a
   small native bridge named SCNative (see docs/native-bridge.md). Load after shell.js. */
(function (root) {
  'use strict';
  const SC = root.SC;
  const { esc } = SC;
  const UA = (root.navigator && navigator.userAgent) || '';
  const N = () => root.SCNative || null;
  const Cap = () => (root.Capacitor && root.Capacitor.Plugins) || {};

  SC.isWebView = () =>
    /; wv\)/.test(UA) || (/iPhone|iPad|iPod/.test(UA) && !/Safari\//.test(UA)) ||
    !!(root.Capacitor && root.Capacitor.isNativePlatform && root.Capacitor.isNativePlatform()) || !!root.ReactNativeWebView || !!N();
  const isIOS = /iPhone|iPad|iPod/.test(UA);

  const blobToBase64 = (blob) => new Promise((res, rej) => {
    const fr = new FileReader();
    fr.onload = () => res(String(fr.result).split(',')[1]);
    fr.onerror = rej;
    fr.readAsDataURL(blob);
  });
  SC.blobToBase64 = blobToBase64;

  /* ---------- open a link outside the app ---------- */
  SC.openExternal = (url) => {
    try {
      if (N() && N().openExternal) { N().openExternal(url); return; }
      if (Cap().Browser) { Cap().Browser.open({ url }); return; }
      if (root.cordova && root.cordova.InAppBrowser) { root.cordova.InAppBrowser.open(url, '_system'); return; }
    } catch (e) { /* fall through */ }
    const w = root.open(url, '_blank');
    if (!w) root.location.href = url;
  };

  /* ---------- native bridge ---------- */
  SC.native = {
    canSharePdf: () => !!((N() && N().sharePdf) || (Cap().Share && Cap().Filesystem)),
    canPrint: () => !!(N() && N().printPage),
    // Share a PDF file through the phone's own share sheet (needs the bridge or Capacitor).
    async sharePdf(file, name, text) {
      const b64 = await blobToBase64(file);
      if (N() && N().sharePdf) { N().sharePdf(b64, name, text || ''); return true; }
      const w = await Cap().Filesystem.writeFile({ path: name, data: b64, directory: 'CACHE' });
      await Cap().Share.share({ title: name, text: text || '', url: w.uri, dialogTitle: 'Share' });
      return true;
    },
    printPage(name) { N().printPage(name || 'Document'); }
  };

  /* ---------- share links: the whole document packed into a web address ---------- */
  const b64url = (bytes) => {
    let s = '';
    for (let i = 0; i < bytes.length; i += 0x8000) s += String.fromCharCode.apply(null, bytes.subarray(i, i + 0x8000));
    return btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
  };
  const unb64url = (t) => {
    const s = atob(t.replace(/-/g, '+').replace(/_/g, '/'));
    const out = new Uint8Array(s.length);
    for (let i = 0; i < s.length; i++) out[i] = s.charCodeAt(i);
    return out;
  };
  const pipe = async (bytes, stream) => {
    const w = stream.writable.getWriter();
    w.write(bytes);
    w.close();
    return new Uint8Array(await new Response(stream.readable).arrayBuffer());
  };
  SC.link = {
    async pack(obj) {
      const bytes = new TextEncoder().encode(JSON.stringify(obj));
      if (typeof CompressionStream !== 'undefined') {
        try { return 'z' + b64url(await pipe(bytes, new CompressionStream('deflate-raw'))); } catch (e) { /* plain */ }
      }
      return 'r' + b64url(bytes);
    },
    async unpack(t) {
      const bytes = unb64url(t.slice(1));
      if (t[0] === 'z') return JSON.parse(new TextDecoder().decode(await pipe(bytes, new DecompressionStream('deflate-raw'))));
      return JSON.parse(new TextDecoder().decode(bytes));
    },
    // Public address of a document page. Anyone with the link can view it and save it as a PDF.
    async make(doc, s, rcpt, extra) {
      const keep = ['businessName', 'tagline', 'contactLines', 'email', 'phone', 'location', 'receivedBy', 'showWatermark', 'currencySymbol', 'currencyCode', 'currencyName', 'taxName', 'thanksLine'];
      const biz = {};
      keep.forEach((k) => { biz[k] = s[k]; });
      if (s.logo && !/^data:/i.test(s.logo)) biz.logo = s.logo;
      const d = await SC.link.pack({ doc, s: biz, r: rcpt || '' });
      const base = new URL(((document.body && document.body.dataset.root) || '') + 'pages/doc.html', root.location.href);
      return base.href + '?d=' + d + (extra || '');
    }
  };

  /* ---------- one share sheet used everywhere ---------- */
  // o: { title, text, url, phone, email, subject, file, onSent }
  SC.openShareSheet = (o) => {
    const full = o.text + (o.url ? '\n\n' + o.url : '');
    const phone = o.phone ? SC.waNumber(o.phone) : '';
    const row = (ic, label, sub, key) =>
      `<button type="button" class="srow" data-sr="${key}"><span class="ico-wrap">${SC.icon(ic, 20)}</span><span>${esc(label)}${sub ? `<small>${esc(sub)}</small>` : ''}</span></button>`;
    const canFile = !!(o.file && ((SC.native.canSharePdf()) || (navigator.canShare && navigator.canShare({ files: [o.file] }) && !SC.isWebView())));
    const sh = SC.sheet.open({
      title: o.title || 'Share',
      body: `<div class="list">
        ${canFile ? row('docs', 'Share PDF file', 'Attach it in any app', 'file') : ''}
        ${navigator.share ? row('share', 'More apps…', 'Your phone’s share menu', 'more') : ''}
        ${row('chat', 'WhatsApp', o.phone || 'Send a message', 'wa')}
        ${row('chat', 'Telegram', '', 'tg')}
        ${row('chat', 'Text message', o.phone || '', 'sms')}
        ${row('mail', 'Email', o.email || 'Opens your email app', 'mail')}
        ${row('copy', 'Copy', o.url ? 'Message and link' : 'Message', 'copy')}
      </div>`
    });
    sh.el.addEventListener('click', async (e) => {
      const b = e.target.closest('[data-sr]');
      if (!b) return;
      const k = b.dataset.sr;
      const sent = () => { if (o.onSent) o.onSent(); };
      if (k === 'file') { sh.close(); try { if (SC.native.canSharePdf()) await SC.native.sharePdf(o.file, o.file.name, o.text); else await navigator.share({ files: [o.file], title: o.subject || o.title, text: o.text }); sent(); } catch (err) { /* cancelled */ } }
      else if (k === 'more') { try { await navigator.share({ title: o.subject || o.title, text: o.text, url: o.url || undefined }); sh.close(); sent(); } catch (err) { /* cancelled */ } }
      else if (k === 'wa') { sh.close(); SC.openExternal('https://wa.me/' + phone + '?text=' + encodeURIComponent(full)); sent(); }
      else if (k === 'tg') { sh.close(); SC.openExternal('https://t.me/share/url?url=' + encodeURIComponent(o.url || ' ') + '&text=' + encodeURIComponent(o.text)); sent(); }
      else if (k === 'sms') { sh.close(); root.location.href = 'sms:' + (o.phone || '') + (isIOS ? '&' : '?') + 'body=' + encodeURIComponent(full); sent(); }
      else if (k === 'mail') { sh.close(); root.location.href = 'mailto:' + encodeURIComponent(o.email || '') + '?subject=' + encodeURIComponent(o.subject || o.title || '') + '&body=' + encodeURIComponent(full); sent(); }
      else if (k === 'copy') {
        try { await navigator.clipboard.writeText(full); SC.toast('Copied'); } catch (err) {
          const ta = document.createElement('textarea'); ta.value = full; document.body.append(ta); ta.select();
          try { document.execCommand('copy'); SC.toast('Copied'); } catch (e2) { SC.toast('Could not copy'); } ta.remove();
        }
        sh.close();
      }
    });
    return sh;
  };
})(typeof window !== 'undefined' ? window : globalThis);
