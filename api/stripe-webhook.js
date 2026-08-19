import crypto from 'node:crypto';

export const config = { api: { bodyParser: false } };

function send(response, status, body) {
  response.setHeader('Cache-Control', 'no-store');
  return response.status(status).json(body);
}

async function rawBody(request) {
  const chunks = [];
  for await (const chunk of request) chunks.push(Buffer.from(chunk));
  return Buffer.concat(chunks);
}

function validSignature(payload, header, secret) {
  if (!header || !secret) return false;
  const values = Object.fromEntries(
    header.split(',').map((part) => part.split('=', 2))
  );
  const timestamp = Number(values.t);
  if (!Number.isFinite(timestamp) || Math.abs(Date.now() / 1000 - timestamp) > 300) return false;
  const expected = crypto
    .createHmac('sha256', secret)
    .update(`${timestamp}.${payload.toString('utf8')}`)
    .digest('hex');
  const signatures = header.split(',')
    .filter((part) => part.startsWith('v1='))
    .map((part) => part.slice(3));
  return signatures.some((signature) => {
    if (signature.length !== expected.length) return false;
    return crypto.timingSafeEqual(Buffer.from(signature), Buffer.from(expected));
  });
}

async function grantCredit(event, session) {
  const key = process.env.SUPABASE_SECRET_KEY;
  const url = process.env.SUPABASE_URL;
  const userId = session.metadata?.user_id;
  const priceId = session.metadata?.price_id;
  if (!url || !key || !userId) throw new Error('Fulfillment is not configured.');
  if (priceId !== process.env.STRIPE_PRICE_ID) throw new Error('Unexpected price.');
  if (session.payment_status !== 'paid' || session.currency !== 'usd' || session.amount_total !== 199) {
    throw new Error('Unexpected payment state.');
  }
  const result = await fetch(`${url}/rest/v1/rpc/grant_argument_autopsy_paid_credit`, {
    method: 'POST',
    headers: {
      apikey: key,
      Authorization: `Bearer ${key}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      stripe_event_id: event.id,
      stripe_session_id: session.id,
      requested_user_id: userId,
      purchased_price_id: priceId,
      purchased_amount: session.amount_total,
      purchased_currency: session.currency
    })
  });
  if (!result.ok) throw new Error('Credit grant failed.');
}

export default async function handler(request, response) {
  if (request.method !== 'POST') {
    response.setHeader('Allow', 'POST');
    return send(response, 405, { error: 'Method not allowed.' });
  }
  const payload = await rawBody(request);
  if (!validSignature(payload, request.headers['stripe-signature'], process.env.STRIPE_WEBHOOK_SECRET)) {
    return send(response, 400, { error: 'Invalid webhook signature.' });
  }
  try {
    const event = JSON.parse(payload.toString('utf8'));
    if (event.type === 'checkout.session.completed') {
      await grantCredit(event, event.data.object);
    }
    return send(response, 200, { received: true });
  } catch {
    return send(response, 500, { error: 'Webhook fulfillment failed.' });
  }
}