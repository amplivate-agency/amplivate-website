/**
 * Contact form handler for amplivate.co.uk.
 *
 * Receives the contact form's POST as JSON and emails it to the Amplivate
 * owner via Cloudflare Email Sending. Sending is free as long as TO_EMAIL
 * is a *verified destination address* (see README "Deploy notes" below) —
 * that's the only reason this doesn't need the Workers Paid plan.
 *
 * Required vars (wrangler.toml [vars], or `wrangler secret put` if you'd
 * rather they not be visible in the repo):
 *   FROM_EMAIL      e.g. "notifications@amplivate.co.uk" — must be on a
 *                   domain onboarded via `wrangler email sending enable`.
 *   TO_EMAIL        the verified destination address that receives enquiries.
 *   ALLOWED_ORIGIN  e.g. "https://amplivate.co.uk" — the only origin the
 *                   form is allowed to POST from. Defaults to "*", which
 *                   is fine for testing but should be locked down for launch.
 *
 * Required bindings (wrangler.toml):
 *   EMAIL           [[send_email]] binding, see wrangler.toml.
 *   RATE_LIMITER    [[ratelimits]] binding, see wrangler.toml. Caps each
 *                   sending IP to 5 requests per 60 seconds so this can't
 *                   be used to mail-bomb TO_EMAIL or burn the Email Sending
 *                   quota.
 */

const MAX_LENGTHS = { name: 200, business: 200, service: 200, message: 5000 };

// Control characters other than \r and \n (those are checked separately,
// since `message` is a textarea and is allowed to be multi-line).
const CONTROL_CHARS = /[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/;
const LINE_BREAK = /[\r\n]/;

function corsHeaders(allowedOrigin) {
  return {
    'Access-Control-Allow-Origin': allowedOrigin,
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
  };
}

function escapeHtml(value) {
  return String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

function jsonResponse(data, status, headers) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { ...headers, 'Content-Type': 'application/json' },
  });
}

// `name`, `business`, and `service` end up in the email subject line and
// single-line fields in the body — a stray \r\n could otherwise be used to
// smuggle extra header-like lines into the outgoing message. `message` is
// a textarea and is allowed real line breaks, so it's only checked for
// other control characters.
function isValidSingleLineField(value, maxLength) {
  return (
    typeof value === 'string' &&
    value.length <= maxLength &&
    !LINE_BREAK.test(value) &&
    !CONTROL_CHARS.test(value)
  );
}

function isValidMessage(value, maxLength) {
  return typeof value === 'string' && value.length > 0 && value.length <= maxLength && !CONTROL_CHARS.test(value);
}

export default {
  async fetch(request, env) {
    const allowedOrigin = env.ALLOWED_ORIGIN || '*';
    const headers = corsHeaders(allowedOrigin);

    if (request.method === 'OPTIONS') {
      return new Response(null, { headers });
    }

    if (request.method !== 'POST') {
      return new Response('Method not allowed', { status: 405, headers });
    }

    if (env.RATE_LIMITER) {
      const ip = request.headers.get('CF-Connecting-IP') || 'unknown';
      const { success } = await env.RATE_LIMITER.limit({ key: ip });
      if (!success) {
        return jsonResponse({ error: 'Too many requests. Please try again in a minute.' }, 429, headers);
      }
    }

    let body;
    try {
      body = await request.json();
    } catch {
      return jsonResponse({ error: 'Invalid request body.' }, 400, headers);
    }

    // Honeypot: a hidden field real visitors never fill in. Bots that
    // blindly fill every field trip this instead of hitting a CAPTCHA.
    if (body._gotcha) {
      return jsonResponse({ ok: true }, 200, headers);
    }

    const { name, email, business, service, message } = body;

    if (!isValidSingleLineField(name, MAX_LENGTHS.name)) {
      return jsonResponse({ error: 'Please provide a valid name.' }, 400, headers);
    }

    const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (typeof email !== 'string' || email.length > 320 || !emailPattern.test(email)) {
      return jsonResponse({ error: 'Please provide a valid email address.' }, 400, headers);
    }

    if (!isValidMessage(message, MAX_LENGTHS.message)) {
      return jsonResponse({ error: 'Please provide a message.' }, 400, headers);
    }

    if (business !== undefined && business !== '' && !isValidSingleLineField(business, MAX_LENGTHS.business)) {
      return jsonResponse({ error: 'Please provide a valid business name.' }, 400, headers);
    }

    if (service !== undefined && service !== '' && !isValidSingleLineField(service, MAX_LENGTHS.service)) {
      return jsonResponse({ error: 'Please provide a valid service.' }, 400, headers);
    }

    const subject = service ? `New enquiry: ${service}` : 'New enquiry from amplivate.co.uk';

    const text = [
      `Name: ${name}`,
      `Email: ${email}`,
      business ? `Business: ${business}` : null,
      service ? `Enquiring about: ${service}` : null,
      '',
      message,
    ]
      .filter(Boolean)
      .join('\n');

    const html = `
      <p><strong>Name:</strong> ${escapeHtml(name)}</p>
      <p><strong>Email:</strong> ${escapeHtml(email)}</p>
      ${business ? `<p><strong>Business:</strong> ${escapeHtml(business)}</p>` : ''}
      ${service ? `<p><strong>Enquiring about:</strong> ${escapeHtml(service)}</p>` : ''}
      <p><strong>Message:</strong></p>
      <p>${escapeHtml(message).replace(/\n/g, '<br>')}</p>
    `;

    try {
      await env.EMAIL.send({
        to: env.TO_EMAIL,
        from: { email: env.FROM_EMAIL, name: 'Amplivate website' },
        replyTo: email,
        subject,
        text,
        html,
      });
    } catch (error) {
      return jsonResponse({ error: 'Could not send the message. Please try again.' }, 502, headers);
    }

    return jsonResponse({ ok: true }, 200, headers);
  },
};
