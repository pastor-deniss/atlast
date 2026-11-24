// Supabase Auth "Send SMS" hook -> Beem Africa.
//
// Supabase has no built-in Beem provider, so Auth calls this function
// (Authentication -> Hooks -> Send SMS, HTTPS) with the phone number and
// one-time code, and we deliver it. Called by Supabase Auth only, never by
// the app: requests are authenticated with the hook's signing secret, so
// "Enforce JWT verification" must be OFF for this function.
//
// Secrets (Edge Functions -> Secrets):
//   SEND_SMS_HOOK_SECRET  the hook secret Supabase shows (v1,whsec_...)
//   BEEM_API_KEY          Beem dashboard -> SMS -> API Setup
//   BEEM_SECRET_KEY       shown once when the API key is generated
//   BEEM_SENDER_ID        an approved, active sender ID (max 11 characters);
//                         Beem has disabled the default "INFO" sender
//
// API reference: https://docs.beem.africa/api-reference/send-sms.md
import { Webhook } from 'https://esm.sh/standardwebhooks@1.0.0';

interface HookPayload {
  user: { phone?: string };
  sms: { otp: string };
}

interface BeemResponse {
  successful?: boolean;
  code?: number;
  message?: string;
}

function hookError(httpCode: number, message: string) {
  // Shape Supabase Auth expects from a failing hook; the message is shown to
  // the user, so keep it free of provider internals.
  return Response.json({ error: { http_code: httpCode, message } }, { status: httpCode });
}

Deno.serve(async (req) => {
  const secret = Deno.env.get('SEND_SMS_HOOK_SECRET');
  const apiKey = Deno.env.get('BEEM_API_KEY');
  const secretKey = Deno.env.get('BEEM_SECRET_KEY');
  const senderId = Deno.env.get('BEEM_SENDER_ID');
  if (!secret || !apiKey || !secretKey || !senderId) {
    console.error('send-sms: missing SEND_SMS_HOOK_SECRET, BEEM_API_KEY, BEEM_SECRET_KEY or BEEM_SENDER_ID');
    return hookError(500, 'SMS service is not configured.');
  }

  const raw = await req.text();
  let payload: HookPayload;
  try {
    const wh = new Webhook(secret.replace('v1,whsec_', ''));
    payload = wh.verify(raw, Object.fromEntries(req.headers)) as HookPayload;
  } catch {
    return hookError(401, 'Invalid hook signature.');
  }

  // Beem wants international format, digits only, no leading "+".
  const phone = payload.user?.phone?.replace(/[^\d]/g, '');
  const otp = payload.sms?.otp;
  if (!phone || !otp) return hookError(400, 'Missing phone number or code.');

  let res: Response;
  try {
    res = await fetch('https://apisms.beem.africa/v1/send', {
      method: 'POST',
      headers: {
        Authorization: `Basic ${btoa(`${apiKey}:${secretKey}`)}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        source_addr: senderId,
        schedule_time: '',
        encoding: 0,
        message: `Your Atlast code is ${otp}. It expires in a few minutes. Do not share it with anyone.`,
        recipients: [{ recipient_id: 1, dest_addr: phone }],
      }),
    });
  } catch (e) {
    console.error('send-sms: network error', e);
    return hookError(502, 'Could not send the SMS. Please try again.');
  }

  const text = await res.text();
  let body: BeemResponse | undefined;
  try {
    body = JSON.parse(text);
  } catch {
    // Non-JSON body.
  }

  // Code 100 = "Message Submitted Successfully". Common failures: 101 invalid
  // number, 102 insufficient balance, 111 invalid/inactive sender ID,
  // 120 invalid API key/secret.
  if (!res.ok || body?.successful !== true || body.code !== 100) {
    console.error('send-sms: Beem rejected the message', res.status, text);
    if (body?.code === 101) return hookError(400, 'That phone number is not valid.');
    return hookError(502, 'Could not send the SMS. Please try again later.');
  }

  return Response.json({});
});
