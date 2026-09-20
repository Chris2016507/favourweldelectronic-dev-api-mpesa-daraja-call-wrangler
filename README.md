# FAVOURWELD ELECTRONICS — M-PESA Daraja API

Cloudflare Worker backend for initiating M-PESA STK Push payments.

## Endpoints

- `GET /` — service status
- `GET /api/health` — health check
- `POST /api/mpesa/stkpush` — initiates an STK Push
- `POST /api/mpesa/callback` — receives Daraja callback messages

Example request body:

```json
{
  "phone": "0712345678",
  "amount": 100,
  "accountReference": "FW-ORDER-1",
  "description": "Repair payment"
}
```

The phone must be a valid Kenyan mobile number. Amount must be a whole KSh amount between 1 and 250,000.

## Configure secrets

Set secrets interactively in the terminal; do not commit credentials to GitHub:

```bash
npx wrangler secret put DARAJA_CONSUMER_KEY
npx wrangler secret put DARAJA_CONSUMER_SECRET
npx wrangler secret put DARAJA_SHORTCODE
npx wrangler secret put DARAJA_PASSKEY
npx wrangler secret put DARAJA_CALLBACK_URL
```

Optional secret:

```bash
npx wrangler secret put DARAJA_ENV
```

Use `sandbox` (or omit it) for sandbox, and `production` only after Safaricom has approved production credentials. For a standard PayBill STK Push, `CustomerPayBillOnline` is the default transaction type. Configure the shortcode and transaction type according to the Daraja product assigned to your account.

`DARAJA_CALLBACK_URL` must be a publicly reachable HTTPS URL pointing to this Worker’s `/api/mpesa/callback` route, for example `https://YOUR-WORKER-DOMAIN/api/mpesa/callback`.

## Run and deploy

```bash
npm install
npm run dev
```

Deploy using Wrangler (this project has a Worker configuration and is not a static Pages upload):

```bash
npx wrangler deploy
```

## Payment status and production caution

The callback endpoint currently acknowledges callback requests and logs their payload. It does **not** persist transactions, verify callback authenticity, or mark orders as paid. Do not fulfill orders based on the STK Push initiation response alone. Before production use, implement durable transaction storage, correlate callbacks to pending orders, validate callback fields and expected amount/phone/reference, and handle success and failure states safely. Test with Safaricom’s sandbox first.
