import { env } from "cloudflare:workers";
import { httpServerHandler } from "cloudflare:node";
import express from "express";

const app = express();
app.use(express.json({ limit: "32kb" }));

// Values are configured as Cloudflare Worker secrets, never committed here.
const config = env as unknown as Record<string, string | undefined>;

app.get("/", (_req, res) => {
  res.json({ service: "FAVOURWELD ELECTRONICS Daraja API", status: "ok" });
});

app.get("/api/health", (_req, res) => res.json({ success: true }));

function required(name: string): string {
  const value = config[name];
  if (!value) throw new Error(`Missing Cloudflare secret: ${name}`);
  return value;
}

function darajaBaseUrl(): string {
  return config.DARAJA_ENV === "production"
    ? "https://api.safaricom.co.ke"
    : "https://sandbox.safaricom.co.ke";
}

function normalizePhone(value: unknown): string | null {
  if (typeof value !== "string" && typeof value !== "number") return null;
  let phone = String(value).replace(/[\s+()-]/g, "");
  if (phone.startsWith("0")) phone = `254${phone.slice(1)}`;
  if (phone.startsWith("7") || phone.startsWith("1")) phone = `254${phone}`;
  return /^254[17]\d{8}$/.test(phone) ? phone : null;
}

async function getAccessToken(): Promise<string> {
  const key = required("DARAJA_CONSUMER_KEY");
  const secret = required("DARAJA_CONSUMER_SECRET");
  const credentials = btoa(`${key}:${secret}`);
  const response = await fetch(`${darajaBaseUrl()}/oauth/v1/generate?grant_type=client_credentials`, {
    headers: { Authorization: `Basic ${credentials}` },
  });
  const data = await response.json() as { access_token?: string; errorMessage?: string };
  if (!response.ok || !data.access_token) {
    throw new Error(data.errorMessage || "Daraja authentication failed");
  }
  return data.access_token;
}

app.post("/api/mpesa/stkpush", async (req, res) => {
  try {
    const phone = normalizePhone(req.body?.phone);
    const amount = Number(req.body?.amount);
    if (!phone) return res.status(400).json({ success: false, error: "Enter a valid Kenyan M-PESA phone number, e.g. 0712345678." });
    if (!Number.isSafeInteger(amount) || amount < 1 || amount > 250000) {
      return res.status(400).json({ success: false, error: "Amount must be a whole number between KSh 1 and KSh 250,000." });
    }

    const shortcode = required("DARAJA_SHORTCODE");
    const passkey = required("DARAJA_PASSKEY");
    const callbackUrl = required("DARAJA_CALLBACK_URL");
    const timestamp = new Date().toISOString().replace(/[-:TZ.]/g, "").slice(0, 14);
    const password = btoa(`${shortcode}${passkey}${timestamp}`);
    const token = await getAccessToken();
    const response = await fetch(`${darajaBaseUrl()}/mpesa/stkpush/v1/processrequest`, {
      method: "POST",
      headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        BusinessShortCode: shortcode,
        Password: password,
        Timestamp: timestamp,
        TransactionType: config.DARAJA_TRANSACTION_TYPE || "CustomerPayBillOnline",
        Amount: amount,
        PartyA: phone,
        PartyB: shortcode,
        PhoneNumber: phone,
        CallBackURL: callbackUrl,
        AccountReference: String(req.body?.accountReference || "FAVOURWELD").slice(0, 12),
        TransactionDesc: String(req.body?.description || "FAVOURWELD payment").slice(0, 13),
      }),
    });
    const data = await response.json() as Record<string, unknown>;
    if (!response.ok) return res.status(502).json({ success: false, error: "Daraja could not start the payment request.", details: data });
    return res.status(200).json({ success: true, message: "STK Push request submitted. Check the phone for the M-PESA prompt.", data });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unexpected payment error";
    const missingSecret = message.startsWith("Missing Cloudflare secret:");
    return res.status(missingSecret ? 503 : 502).json({ success: false, error: missingSecret ? message : "Unable to initiate M-PESA payment. Check Daraja configuration and try again." });
  }
});

// Daraja sends asynchronous transaction results to this endpoint.
// Persist and validate callback results before treating an order as paid.
app.post("/api/mpesa/callback", (req, res) => {
  console.log("Daraja callback received", JSON.stringify(req.body));
  res.status(200).json({ ResultCode: 0, ResultDesc: "Accepted" });
});

app.listen(3000);
export default httpServerHandler({ port: 3000 });
