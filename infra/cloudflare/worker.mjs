function remapRequest(request, pathname) {
  const url = new URL(request.url);
  url.pathname = pathname;
  url.search = '';
  return new Request(url, {
    method: request.method,
    headers: request.headers,
  });
}

function withDocumentHeaders(response, release) {
  const headers = new Headers(response.headers);
  headers.set('Cache-Control', 'no-cache');
  headers.set('Referrer-Policy', 'strict-origin-when-cross-origin');
  headers.set('X-Content-Type-Options', 'nosniff');
  headers.set('X-Cislokraj-Release', release);
  return new Response(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers,
  });
}

async function gameDocument(request, env) {
  return withDocumentHeaders(
    await env.ASSETS.fetch(remapRequest(request, '/index.html')),
    env.APP_RELEASE,
  );
}

async function landingDocument(request, env) {
  return withDocumentHeaders(
    await env.ASSETS.fetch(remapRequest(request, '/landing.html')),
    env.APP_RELEASE,
  );
}

async function proxyApi(request, env, fetcher) {
  const incomingUrl = new URL(request.url);
  const apiUrl = new URL(incomingUrl.pathname + incomingUrl.search, env.API_ORIGIN);
  const headers = new Headers(request.headers);
  headers.set('X-Forwarded-Host', incomingUrl.host);
  headers.set('X-Forwarded-Proto', incomingUrl.protocol.slice(0, -1));

  const response = await fetcher(new Request(apiUrl, {
    method: request.method,
    headers,
    body: request.body,
    redirect: 'manual',
  }));
  const responseHeaders = new Headers(response.headers);
  responseHeaders.set('Cache-Control', 'no-store');
  return new Response(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers: responseHeaders,
  });
}

export async function handleRequest(request, env, fetcher = fetch) {
  const url = new URL(request.url);

  if (url.hostname === 'www.cislokraj.cz') {
    url.hostname = 'cislokraj.cz';
    return Response.redirect(url, 308);
  }
  if (url.pathname.startsWith('/api/') || url.pathname.startsWith('/v1/')) {
    return proxyApi(request, env, fetcher);
  }
  if (url.pathname === '/') {
    return landingDocument(request, env);
  }
  if (url.pathname === '/hra') {
    return Response.redirect(new URL('/hra/', url), 308);
  }
  if (url.pathname === '/hra/') {
    return gameDocument(request, env);
  }
  if (url.pathname.startsWith('/hra/')) {
    const assetPath = url.pathname.slice('/hra'.length);
    const response = await env.ASSETS.fetch(remapRequest(request, assetPath));
    return response.status === 404 ? gameDocument(request, env) : response;
  }

  return env.ASSETS.fetch(request);
}

export default {
  // Workers pass an ExecutionContext as the third argument. Keep that separate
  // from the injectable fetch function used by handleRequest's unit tests.
  fetch(request, env) {
    return handleRequest(request, env);
  },
};
