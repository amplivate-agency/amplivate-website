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
 */

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

    let body;
    try {
      body = await request.json();
    } catch {
      return new Response(JSON.stringify({ error: 'Invalid request body.' }), {
        status: 400,
        headers: { ...headers, 'Content-Type': 'application/json' },
      });
    }

    // Honeypot: a hidden field real visitors never fill in. Bots that
    // blindly fill every field trip this instead of hitting a CAPTCHA.
    if (body._gotcha) {
      return new Response(JSON.stringify({ ok: true }), {
        headers: { ...headers, 'Content-Type': 'application/json' },
      });
    }

    const { name, email, business, service, message } = body;

    if (!name || !email || !message) {
      return new Response(JSON.stringify({ error: 'Name, email, and message are required.' }), {
        status: 400,
        headers: { ...headers, 'Content-Type': 'application/json' },
      });
    }

    const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (typeof email !== 'string' || !emailPattern.test(email)) {
      return new Response(JSON.stringify({ error: 'Please provide a valid email address.' }), {
        status: 400,
        headers: { ...headers, 'Content-Type': 'application/json' },
      });
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
      return new Response(JSON.stringify({ error: 'Could not send the message. Please try again.' }), {
        status: 502,
        headers: { ...headers, 'Content-Type': 'application/json' },
      });
    }

    return new Response(JSON.stringify({ ok: true }), {
      headers: { ...headers, 'Content-Type': 'application/json' },
    });
  },
};
