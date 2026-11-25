// Simulación (mock) de Supabase para pruebas E2E sin backend.
// Intercepta http://127.0.0.1:54321 (URL falsa configurada en playwright.config.js).

export const SUPABASE_HOST = '127.0.0.1:54321';

export const USERS = {
  buyer:    { id: 'u-buyer',    email: 'comprador@test.local',    password: 'clave123', role: 'buyer',    status: 'approved', full_name: 'Carla Compradora' },
  producer: { id: 'u-producer', email: 'productor@test.local',    password: 'clave123', role: 'producer', status: 'approved', full_name: 'Pedro Productor' },
  pending:  { id: 'u-pending',  email: 'pendiente@test.local',    password: 'clave123', role: 'producer', status: 'pending',  full_name: 'Paula Pendiente' },
  admin:    { id: 'u-admin',    email: 'admin@test.local',        password: 'clave123', role: 'admin',    status: 'approved', full_name: 'Andrés Admin' },
};

export const PRODUCTS = [
  { id: 'p1', producerId: 'prod-A', producerName: 'Finca A', farmId: 'f1', farmName: 'Finca A', farmZone: 'Warnes', lat: -17.51, lng: -63.17,
    name: 'Tomate', category: 'verduras', description: 'Tomate fresco', price: 10, suggestedPrice: 6, quantity: 100, unit: 'kg',
    imageUrl: null, availabilityType: 'immediate', availableDate: null, status: 'active', createdAt: '2026-11-20T10:00:00Z', updatedAt: '2026-11-20T10:00:00Z' },
  { id: 'p2', producerId: 'prod-A', producerName: 'Finca A', farmId: 'f1', farmName: 'Finca A', farmZone: 'Warnes', lat: -17.51, lng: -63.17,
    name: 'Cebolla', category: 'verduras', description: 'Cebolla blanca', price: 4.5, suggestedPrice: 6, quantity: 50, unit: 'kg',
    imageUrl: null, availabilityType: 'immediate', availableDate: null, status: 'active', createdAt: '2026-11-21T10:00:00Z', updatedAt: '2026-11-21T10:00:00Z' },
  { id: 'p3', producerId: 'prod-B', producerName: 'Finca B', farmId: 'f2', farmName: 'Finca B', farmZone: 'Montero', lat: -17.34, lng: -63.25,
    name: 'Soya', category: 'granos', description: 'Soya en grano', price: 7, suggestedPrice: 7, quantity: 500, unit: 'kg',
    imageUrl: null, availabilityType: 'immediate', availableDate: null, status: 'active', createdAt: '2026-11-22T10:00:00Z', updatedAt: '2026-11-22T10:00:00Z' },
];

const b64url = (o) => Buffer.from(JSON.stringify(o)).toString('base64url');

function fakeJwt(user) {
  const now = Math.floor(Date.now() / 1000);
  return `${b64url({ alg: 'HS256', typ: 'JWT' })}.${b64url({ sub: user.id, role: 'authenticated', exp: now + 3600, iat: now })}.firma`;
}

function authUser(u) {
  return {
    id: u.id, aud: 'authenticated', role: 'authenticated', email: u.email,
    email_confirmed_at: '2026-11-01T00:00:00Z', app_metadata: {}, user_metadata: { full_name: u.full_name, role: u.role },
    created_at: '2026-11-01T00:00:00Z',
  };
}

function sessionFor(u) {
  const now = Math.floor(Date.now() / 1000);
  return {
    access_token: fakeJwt(u), token_type: 'bearer', expires_in: 3600, expires_at: now + 3600,
    refresh_token: `refresh-${u.id}`, user: authUser(u),
  };
}

const CORS = {
  'access-control-allow-origin': '*',
  'access-control-allow-headers': '*',
  'access-control-allow-methods': '*',
};

/**
 * Instala el mock en la página.
 * @param {import('@playwright/test').Page} page
 * @param {{products?: object[], failLogin?: boolean}} [opts]
 * @returns {{calls: Array<{method:string, path:string, body:any}>}} registro de llamadas para aserciones
 */
export async function mockSupabase(page, opts = {}) {
  const products = opts.products ?? PRODUCTS;
  const calls = [];
  let current = null; // usuario autenticado en el mock

  // Recursos externos (fuentes, CSS de Leaflet) bloquean el render si la red es lenta: se sirven vacíos
  // para que las pruebas sean deterministas y funcionen sin internet.
  await page.route(/^https:\/\/(fonts\.googleapis\.com|fonts\.gstatic\.com|unpkg\.com)\//, (route) =>
    route.fulfill({ status: 200, contentType: 'text/css', body: '' }));

  await page.route(`http://${SUPABASE_HOST}/**`, async (route) => {
    const req = route.request();
    const url = new URL(req.url());
    const path = url.pathname;
    const method = req.method();
    let body = null;
    try { body = req.postDataJSON(); } catch { /* sin cuerpo */ }

    if (method === 'OPTIONS') return route.fulfill({ status: 204, headers: CORS });
    calls.push({ method, path, body });

    const json = (status, data) => route.fulfill({
      status, headers: { ...CORS, 'content-type': 'application/json' }, body: JSON.stringify(data),
    });

    // ---- Auth ----
    if (path === '/auth/v1/token') {
      const u = Object.values(USERS).find((x) => x.email === body?.email && x.password === body?.password);
      if (!u || opts.failLogin) {
        return json(400, { error: 'invalid_grant', error_description: 'Invalid login credentials', code: 'invalid_credentials', msg: 'Invalid login credentials' });
      }
      current = u;
      return json(200, sessionFor(u));
    }
    if (path === '/auth/v1/signup') {
      const u = { id: 'u-new', email: body.email, password: body.password, role: body.data?.role ?? 'buyer',
        status: (body.data?.role ?? 'buyer') === 'buyer' ? 'approved' : 'pending', full_name: body.data?.full_name ?? '' };
      USERS.__lastSignup = u;
      current = u;
      return json(200, sessionFor(u));
    }
    if (path === '/auth/v1/user') {
      return current ? json(200, authUser(current)) : json(401, { msg: 'unauthorized' });
    }
    if (path === '/auth/v1/logout') {
      current = null;
      return route.fulfill({ status: 204, headers: CORS });
    }

    // ---- REST ----
    if (path === '/rest/v1/profiles') {
      const u = current ?? USERS.__lastSignup;
      const row = u ? { id: u.id, full_name: u.full_name, email: u.email, role: u.role, status: u.status, rejection_reason: null, created_at: '2026-11-01T00:00:00Z' } : null;
      const single = (req.headers()['accept'] || '').includes('vnd.pgrst.object');
      return json(200, single ? row : (row ? [row] : []));
    }
    if (path === '/rest/v1/products') return json(200, products);
    if (path.startsWith('/rest/v1/rpc/')) return json(200, null);
    if (path.startsWith('/rest/v1/')) return json(200, []);

    return json(404, { message: `mock: ruta no simulada ${path}` });
  });

  return { calls };
}

/** Inicia sesión por la interfaz con el usuario simulado indicado. */
export async function loginAs(page, key) {
  const u = USERS[key];
  await page.goto('/login');
  await page.locator('input[type="email"]').fill(u.email);
  await page.locator('input[type="password"]').fill(u.password);
  await page.getByRole('button', { name: 'Iniciar sesión' }).click();
  await page.waitForURL('**/dashboard');
}
