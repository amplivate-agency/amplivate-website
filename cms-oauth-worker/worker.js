/**
 * Decap CMS "github" backend OAuth proxy.
 *
 * Implements the two endpoints Decap's admin UI expects at `base_url`
 * in admin/config.yml:
 *   GET /auth      -> redirects the popup to GitHub's OAuth consent screen
 *   GET /callback  -> exchanges the returned code for an access token and
 *                     hands it back to the opener window via postMessage
 *
 * Required secrets (set with `wrangler secret put <NAME>`):
 *   GITHUB_CLIENT_ID
 *   GITHUB_CLIENT_SECRET
 *
 * Optional var (set in wrangler.toml [vars] or as a secret):
 *   ALLOWED_ORIGIN  e.g. "https://amplivate.co.uk" — restricts which
 *                   origin the token postMessage is sent to. Defaults to "*".
 */

const STATE_COOKIE = 'oauth_state';

function randomState() {
  return crypto.randomUUID();
}

function getCookie(request, name) {
  const header = request.headers.get('Cookie') || '';
  const match = header.match(new RegExp(`(?:^|;\\s*)${name}=([^;]+)`));
  return match ? decodeURIComponent(match[1]) : null;
}

function renderResult(status, provider, payload, allowedOrigin) {
  const message = status === 'success'
    ? `authorization:${provider}:success:${JSON.stringify(payload)}`
    : `authorization:${provider}:error:${JSON.stringify(payload)}`;

  const html = `<!doctype html>
<html><body>
<script>
  (function() {
    function receiveMessage(e) {
      window.opener.postMessage(
        ${JSON.stringify(message)},
        e.origin
      );
      window.removeEventListener("message", receiveMessage, false);
    }
    window.addEventListener("message", receiveMessage, false);
    window.opener.postMessage("authorizing:${provider}", ${JSON.stringify(allowedOrigin)});
  })();
</script>
</body></html>`;

  return new Response(html, { headers: { 'Content-Type': 'text/html' } });
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    const allowedOrigin = env.ALLOWED_ORIGIN || '*';

    if (url.pathname === '/auth') {
      const state = randomState();
      const redirectUri = `${url.origin}/callback`;
      const authorizeUrl = new URL('https://github.com/login/oauth/authorize');
      authorizeUrl.searchParams.set('client_id', env.GITHUB_CLIENT_ID);
      authorizeUrl.searchParams.set('redirect_uri', redirectUri);
      authorizeUrl.searchParams.set('scope', 'repo');
      authorizeUrl.searchParams.set('state', state);

      return new Response(null, {
        status: 302,
        headers: {
          Location: authorizeUrl.toString(),
          'Set-Cookie': `${STATE_COOKIE}=${state}; HttpOnly; Secure; SameSite=Lax; Max-Age=600; Path=/`,
        },
      });
    }

    if (url.pathname === '/callback') {
      const code = url.searchParams.get('code');
      const state = url.searchParams.get('state');
      const savedState = getCookie(request, STATE_COOKIE);

      if (!code || !state || state !== savedState) {
        return renderResult('error', 'github', { message: 'Invalid or missing OAuth state.' }, allowedOrigin);
      }

      const redirectUri = `${url.origin}/callback`;
      const tokenRes = await fetch('https://github.com/login/oauth/access_token', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Accept: 'application/json',
        },
        body: JSON.stringify({
          client_id: env.GITHUB_CLIENT_ID,
          client_secret: env.GITHUB_CLIENT_SECRET,
          code,
          redirect_uri: redirectUri,
        }),
      });

      const tokenData = await tokenRes.json();

      if (!tokenRes.ok || tokenData.error || !tokenData.access_token) {
        return renderResult('error', 'github', {
          message: tokenData.error_description || 'GitHub token exchange failed.',
        }, allowedOrigin);
      }

      return renderResult('success', 'github', {
        token: tokenData.access_token,
        provider: 'github',
      }, allowedOrigin);
    }

    return new Response('Not found', { status: 404 });
  },
};
