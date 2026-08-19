function send(response, status, body) {
  response.setHeader('Cache-Control', 'no-store');
  return response.status(status).json(body);
}

async function supabaseRequest(path, options = {}, keyName = 'SUPABASE_SECRET_KEY') {
  const url = process.env.SUPABASE_URL;
  const key = process.env[keyName];
  if (!url || !key) throw new Error('Supabase is not configured.');
  return fetch(url + path, {
    ...options,
    headers: {
      apikey: key,
      'Content-Type': 'application/json',
      ...(options.headers || {})
    }
  });
}

async function authenticatedUser(request) {
  const authorization = request.headers.authorization || '';
  if (!authorization.startsWith('Bearer ')) return null;
  const result = await supabaseRequest('/auth/v1/user', {
    headers: { Authorization: authorization }
  }, 'SUPABASE_PUBLISHABLE_KEY');
  return result.ok ? result.json() : null;
}

function checkoutOrigin(request) {
  const origin = request.headers.origin || '';
  const parsed = new URL(origin);
  const allowed = parsed.protocol === 'https:' && (
    parsed.hostname === 'wheredidthatstart.com' ||
    parsed.hostname === 'www.wheredidthatstart.com' ||
    parsed.hostname.endsWith('.vercel.app')
  );
  if (!allowed) throw new Error('Unsupported checkout origin.');
  return parsed.origin;
}

export default async function handler(request, response) {
  if (request.method !== 'POST') {
    response.setHeader('Allow', 'POST');
    return send(response, 405, { error: 'Method not allowed.' });
  }

  if (!process.env.STRIPE_SECRET_KEY || !process.env.STRIPE_PRICE_ID) {
    return send(response, 503, { error: 'Payments are not configured.' });
  }

  try {
    const user = await authenticatedUser(request);
    if (!user?.id || !user?.email) {
      return send(response, 401, { error: 'Sign in before purchasing a report.' });
    }

    const origin = checkoutOrigin(request);
    const form = new URLSearchParams({
      mode: 'payment',
      'line_items[0][price]': process.env.STRIPE_PRICE_ID,
      'line_items[0][quantity]': '1',
      client_reference_id: user.id,
      customer_email: user.email,
      'metadata[user_id]': user.id,
      'metadata[price_id]': process.env.STRIPE_PRICE_ID,
      success_url: `${origin}/?payment=success&session_id={CHECKOUT_SESSION_ID}#autopsy`,
      cancel_url: `${origin}/?payment=cancelled#autopsy`,
      'payment_intent_data[description]': 'Argument Autopsy additional report',
      allow_promotion_codes: 'false'
    });

    const stripeResponse = await fetch('https://api.stripe.com/v1/checkout/sessions', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${process.env.STRIPE_SECRET_KEY}`,
        'Content-Type': 'application/x-www-form-urlencoded'
      },
      body: form
    });
    const session = await stripeResponse.json().catch(() => ({}));
    if (!stripeResponse.ok || !session.url) {
      return send(response, 502, { error: 'Checkout could not be started.' });
    }
    return send(response, 200, { url: session.url });
  } catch {
    return send(response, 502, { error: 'Checkout could not be started.' });
  }
}