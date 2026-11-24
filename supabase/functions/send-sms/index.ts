// Supabase Auth "Send SMS" hook -> Africa's Talking.
//
// Supabase has no built-in Africa's Talking provider, so Auth calls this
// function (Authentication -> Hooks -> Send SMS, HTTPS) with the phone number
// and one-time code, and we deliver it. Called by Supabase Auth only, never by
// the app: requests are authenticated with the hook's signing secret, so
// "Enforce JWT verification" must be OFF for this function.
//
// Secrets (Edge Functions -> Secrets):
//   SEND_SMS_HOOK_SECRET  the hook secret Supabase shows (v1,whsec_...)
//   AT_USERNAME           Africa's Talking app username ("sandbox" for sandbox)
//   AT_API_KEY            Africa's Talking API key for that app
//   AT_SENDER_ID          optional; an approved sender ID / short code
import { Webhook } from 'https://esm.sh/standardwebhooks@1.0.0';

interface HookPayload {
  user: { phone?: string };
  sms: { otp: string };
}

function hookError(httpCode: number, message: string) {
  // Shape Supabase Auth expects from a failing hook; the message is shown to
  // the user, so keep it free of provider internals.
  return Response.json({ error: { http_code: httpCode, message } }, { status: httpCode });
}

Deno.serve(async (req) => {
  const secret = Deno.env.get('SEND_SMS_HOOK_SECRET');
  const username = Deno.env.get('AT_USERNAME');
  const apiKey = Deno.env.get('AT_API_KEY');
  const senderId = Deno.env.get('AT_SENDER_ID');
  if (!secret || !username || !apiKey) {
    console.error('send-sms: missing SEND_SMS_HOOK_SECRET, AT_USERNAME or AT_API_KEY');
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

  const phone = payload.user?.phone?.replace(/[^\d]/g, '');
  const otp = payload.sms?.otp;
  if (!phone || !otp) return hookError(400, 'Missing phone number or code.');

  const host = username === 'sandbox' ? 'api.sandbox.africastalking.com' : 'api.africastalking.com';
  const form = new URLSearchParams({
    username,
    to: `+${phone}`,
    message: `Your Atlast code is ${otp}. It expires in a few minutes. Do not share it with anyone.`,
  });
  if (senderId) form.set('from', senderId);

  let res: Response;
  try {
    res = await fetch(`https://${host}/version1/messaging`, {
      method: 'POST',
      headers: {
        apiKey,
        Accept: 'application/json',
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: form,
    });
  } catch (e) {
    console.error('send-sms: network error', e);
    return hookError(502, 'Could not send the SMS. Please try again.');
  }

  const text = await res.text();
  let recipient: { status?: string; statusCode?: number } | undefined;
  try {
    recipient = JSON.parse(text)?.SMSMessageData?.Recipients?.[0];
  } catch {
    // Non-JSON body (e.g. "The supplied authentication is invalid").
  }

  // 100 Processed, 101 Sent, 102 Queued are all accepted.
  if (!res.ok || !recipient || ![100, 101, 102].includes(recipient.statusCode ?? 0)) {
    console.error('send-sms: Africa\'s Talking rejected the message', res.status, text);
    return hookError(502, 'Could not send the SMS. Please check the number and try again.');
  }

  return Response.json({});
});
