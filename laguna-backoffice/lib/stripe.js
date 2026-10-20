// Stripe Checkout, without the SDK. Three calls: create a session, read a
// session back, refund a payment. Payment state is always read back from
// Stripe with our own key, never trusted from the browser or a webhook body,
// which is why the webhook needs no signing secret.

export const SITE = process.env.SITE_URL || 'https://surfinglagunabeach.com';
export const CHECKOUT_MINUTES = 30; // Stripe's minimum session life

export function paymentsOn() {
  return !!process.env.STRIPE_SECRET_KEY;
}

function form(obj, prefix = '', out = new URLSearchParams()) {
  for (const [k, v] of Object.entries(obj)) {
    if (v === undefined || v === null) continue;
    const key = prefix ? `${prefix}[${k}]` : k;
    if (typeof v === 'object') form(v, key, out);
    else out.append(key, String(v));
  }
  return out;
}

async function call(method, path, params) {
  const key = process.env.STRIPE_SECRET_KEY;
  if (!key) throw new Error('STRIPE_SECRET_KEY not set');
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), 10000);
  try {
    const url = 'https://api.stripe.com/v1' + path + (method === 'GET' && params ? '?' + form(params) : '');
    const r = await fetch(url, {
      method,
      signal: ctrl.signal,
      headers: {
        Authorization: `Bearer ${key}`,
        'Content-Type': 'application/x-www-form-urlencoded',
        'Stripe-Version': '2024-06-20',
      },
      body: method === 'GET' ? undefined : form(params || {}),
    });
    const j = await r.json().catch(() => ({}));
    if (!r.ok) {
      const err = new Error(j.error?.message || `Stripe HTTP ${r.status}`);
      err.stripe = j.error;
      throw err;
    }
    return j;
  } finally {
    clearTimeout(timer);
  }
}

export function createCheckout({ name, description, amountCents, email, metadata, successUrl, cancelUrl }) {
  return call('POST', '/checkout/sessions', {
    mode: 'payment',
    line_items: { 0: {
      quantity: 1,
      price_data: {
        currency: 'usd',
        unit_amount: amountCents,
        product_data: { name, description },
      },
    } },
    customer_email: email || undefined,
    client_reference_id: metadata.ref || metadata.gift,
    metadata,
    payment_intent_data: { metadata, description: name },
    expires_at: Math.floor(Date.now() / 1000) + CHECKOUT_MINUTES * 60 + 60,
    success_url: successUrl,
    cancel_url: cancelUrl,
  });
}

export function getCheckout(id) {
  return call('GET', '/checkout/sessions/' + encodeURIComponent(id));
}

export function refundPayment(paymentIntent, amountCents, metadata = {}) {
  return call('POST', '/refunds', { payment_intent: paymentIntent, amount: amountCents, metadata });
}
