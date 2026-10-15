/* Sends an invoice PDF to a customer on WhatsApp (Meta WhatsApp Cloud API).
   The app posts JSON: { to, filename, caption, pdf (base64) }.
   Secrets stay here on the server: WHATSAPP_ACCESS_TOKEN, WHATSAPP_PHONE_NUMBER_ID,
   WHATSAPP_API_VERSION (optional), APP_KEY (optional shared key), ALLOWED_ORIGIN (optional). */
const { onRequest } = require('firebase-functions/v2/https');

const MAX_BYTES = 15 * 1024 * 1024; // keep well under Meta's document limit
const fail = (res, code, error) => res.status(code).json({ ok: false, error });

exports.sendWhatsApp = onRequest(
  { secrets: ['WHATSAPP_ACCESS_TOKEN'], memory: '512MiB', timeoutSeconds: 60, maxInstances: 5 },
  async (req, res) => {
    res.set('Access-Control-Allow-Origin', process.env.ALLOWED_ORIGIN || '*');
    res.set('Access-Control-Allow-Headers', 'Content-Type, x-app-key');
    if (req.method === 'OPTIONS') return res.status(204).send('');
    if (req.method !== 'POST') return fail(res, 405, 'Use POST');

    const token = process.env.WHATSAPP_ACCESS_TOKEN;
    const phoneId = process.env.WHATSAPP_PHONE_NUMBER_ID;
    const version = process.env.WHATSAPP_API_VERSION || 'v21.0';
    if (!token || !phoneId) return fail(res, 500, 'WhatsApp is not set up on the server yet');
    if (process.env.APP_KEY && req.get('x-app-key') !== process.env.APP_KEY) return fail(res, 401, 'Wrong access key');

    const { to, filename, caption, pdf } = req.body || {};
    const phone = String(to || '').replace(/\D/g, '');
    if (phone.length < 8 || phone.length > 15) return fail(res, 400, 'That phone number does not look right');
    if (typeof pdf !== 'string' || !pdf) return fail(res, 400, 'No PDF was attached');
    const buf = Buffer.from(pdf, 'base64');
    if (buf.length > MAX_BYTES) return fail(res, 413, 'The PDF is too large');
    if (buf.subarray(0, 5).toString() !== '%PDF-') return fail(res, 400, 'That file is not a PDF');
    const name = String(filename || 'Document.pdf').replace(/[^\w.\- ]+/g, '-').slice(0, 80).replace(/(?<!\.pdf)$/i, '.pdf');

    try {
      // 1) upload the PDF to Meta
      const form = new FormData();
      form.append('messaging_product', 'whatsapp');
      form.append('type', 'application/pdf');
      form.append('file', new Blob([buf], { type: 'application/pdf' }), name);
      const up = await fetch(`https://graph.facebook.com/${version}/${phoneId}/media`, {
        method: 'POST', headers: { Authorization: `Bearer ${token}` }, body: form
      });
      const upBody = await up.json().catch(() => ({}));
      if (!up.ok || !upBody.id) return fail(res, 502, (upBody.error && upBody.error.message) || 'Upload to WhatsApp failed');

      // 2) send it as a document message
      const msg = await fetch(`https://graph.facebook.com/${version}/${phoneId}/messages`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          messaging_product: 'whatsapp', to: phone, type: 'document',
          document: { id: upBody.id, filename: name, caption: String(caption || '').slice(0, 1000) }
        })
      });
      const msgBody = await msg.json().catch(() => ({}));
      if (!msg.ok) return fail(res, 502, (msgBody.error && msgBody.error.message) || 'WhatsApp refused the message');
      return res.json({ ok: true, id: msgBody.messages && msgBody.messages[0] && msgBody.messages[0].id });
    } catch (e) {
      return fail(res, 502, 'Could not reach WhatsApp');
    }
  }
);
