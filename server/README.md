# WhatsApp auto-send (optional)

The app already sends PDFs with the **WhatsApp** button: on a phone it opens the share sheet with the PDF attached,
on a computer it saves the PDF and opens the chat. Use this server only if you want the PDF to go straight to the
customer's WhatsApp without opening anything.

## What you need from Meta
1. A WhatsApp Business Platform app (developers.facebook.com) with a phone number.
2. The **Phone number ID** and a permanent **access token** (System User) with `whatsapp_business_messaging`.
3. Note: WhatsApp only allows free-form messages and documents to customers who messaged you in the last 24 hours.
   Otherwise an approved message template is required — this code does not bypass that rule.

## Deploy on Firebase (same project as your site)
```
cd server/firebase-functions && npm install
firebase functions:secrets:set WHATSAPP_ACCESS_TOKEN
# in functions/.env (or the console): WHATSAPP_PHONE_NUMBER_ID=...  APP_KEY=choose-a-long-random-key  ALLOWED_ORIGIN=https://your-site
firebase deploy --only functions
```
Copy the function URL into the app: **Settings → WhatsApp auto-send** (sending address + the same access key).
The token never goes into the app or the browser; only the server holds it.
