import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

// Ruta relativa al repositorio (antes estaba fija a C:/Users/ACER/..., lo que fallaba en CI y en otros equipos).
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
function read(rel) { return fs.readFileSync(path.join(root, rel), 'utf8'); }

function policyHasToAuthenticated(sql, policyName) {
  const re = new RegExp('create policy ' + policyName + '[\\s\\S]*?;', 'm');
  const m = sql.match(re);
  return !!m && /\bto\s+authenticated\b/i.test(m[0]);
}
const results = [];
function test(name, fn) {
  try {
    const ok = fn();
    results.push({ name, ok: !!ok, detail: ok === true ? '' : String(ok) });
  } catch (e) {
    results.push({ name, ok: false, detail: e.message });
  }
}
function assert(cond, msg) { if (!cond) throw new Error(msg); return true; }

const migration = read('supabase/migrations/20261125031000_f3_security_hardening.sql');
const orders = read('src/services/orders.js');
const profiles = read('src/services/profiles.js');
const documents = read('src/services/documents.js');
const farms = read('src/services/farms.js');
const products = read('src/services/products.js');
const cart = read('src/components/CartDrawer.jsx');
const qr = read('src/components/QRPaymentModal.jsx');

test('migration exists and has commit', () => assert(/begin;/i.test(migration) && /\bcommit;/.test(migration), 'missing begin/commit'));
test('profiles self-update hardened', () => assert(migration.includes('enforce_profile_update') && migration.includes("No puedes cambiar tu rol"), 'missing profile trigger'));
test('admin profile RPCs exist', () => assert(migration.includes('admin_approve_profile') && migration.includes('admin_reject_profile'), 'missing profile RPCs'));
test('order atomic RPC exists', () => assert(migration.includes('create_order_atomic') && /for update/i.test(migration) && migration.includes('Stock insuficiente'), 'missing atomic order'));
test('order transition trigger exists', () => assert(migration.includes('enforce_order_update') && migration.includes('Transición de estado inválida'), 'missing transition trigger'));
test('payment RPC exists', () => assert(migration.includes('simulate_pay_order') && migration.includes("Solo pedidos confirmados pueden pagarse"), 'missing payment RPC'));
test('producer confirm/reject RPCs exist', () => assert(migration.includes('producer_confirm_order') && migration.includes('producer_reject_order'), 'missing producer RPCs'));
test('document review RPC exists', () => assert(migration.includes('admin_review_document') && migration.includes("Solo documentos pendientes pueden revisarse"), 'missing doc review RPC'));
test('storage approved-document protection exists', () => assert(migration.includes('storage_object_is_approved_document') && migration.includes('agrostyle_owner_delete_safe'), 'missing storage protection'));
test('safe farm delete exists', () => assert(migration.includes('delete_farm_safe') && migration.includes('tiene productos asociados'), 'missing farm delete RPC'));
test('safe product delete exists', () => assert(migration.includes('delete_product_safe'), 'missing product delete RPC'));
test('orders service uses RPCs', () => assert(orders.includes("rpc('create_order_atomic'") && orders.includes("rpc('producer_confirm_order'") && orders.includes("rpc('producer_reject_order'") && orders.includes("rpc('simulate_pay_order'"), 'orders service not wired to RPCs'));
test('profiles service uses RPCs', () => assert(profiles.includes("rpc('admin_approve_profile'") && profiles.includes("rpc('admin_reject_profile'"), 'profiles service not wired'));
test('documents service uses RPC', () => assert(documents.includes("rpc('admin_review_document'"), 'documents service not wired'));
test('farms service uses safe delete RPC', () => assert(farms.includes("rpc('delete_farm_safe'"), 'farms service not wired'));
test('products service uses safe delete RPC', () => assert(products.includes("rpc('delete_product_safe'"), 'products service not wired'));
test('cart checkout still works via service', () => assert(cart.includes('createOrder({') && cart.includes('items:        orderItems'), 'cart wiring broken'));
test('QR payment still uses payOrder', () => assert(qr.includes('payOrder(order.id)'), 'qr wiring broken'));
test('migration does not modify historical migration.sql', () => assert(fs.existsSync(path.join(root, 'supabase/migration.sql')), 'historical migration missing'));
test('buyer/producer direct order update policies removed', () => assert(migration.includes('drop policy if exists orders_buyer_all on public.orders;') && migration.includes('drop policy if exists orders_producer_update on public.orders;'), 'dangerous policies not dropped'));
test('sensitive RPCs check auth.uid() is null', () => {
  const fns = ['delete_farm_safe','delete_product_safe','producer_confirm_order','producer_reject_order','simulate_pay_order'];
  return assert(fns.every(fn => {
    const idx = migration.indexOf(`create or replace function public.${fn}`);
    const block = migration.slice(idx, idx + 800);
    return /auth\.uid\(\) is null/.test(block) || /v_actor uuid := auth\.uid\(\);[\s\S]*if v_actor is null/.test(block);
  }), 'missing auth.uid() null check');
});
test('sensitive RPCs use IS DISTINCT FROM for actor comparison', () => {
  const checks = [
    /v_owner is distinct from v_actor and not public\.is_admin\(\).*delete_farm_safe/s.test(migration) || /delete_farm_safe[\s\S]*v_owner is distinct from v_actor/.test(migration),
    /delete_product_safe[\s\S]*v_owner is distinct from v_actor/.test(migration),
    /producer_confirm_order[\s\S]*v_order\.producer_id is distinct from v_actor/.test(migration),
    /producer_reject_order[\s\S]*v_order\.producer_id is distinct from v_actor/.test(migration),
    /simulate_pay_order[\s\S]*v_order\.buyer_id is distinct from v_actor/.test(migration),
  ];
  return assert(checks.every(Boolean), 'missing IS DISTINCT FROM actor checks');
});
test('sensitive RPCs revoked from public/anon and granted to authenticated', () => {
  const fns = ['delete_farm_safe(uuid)','delete_product_safe(uuid)','producer_confirm_order(uuid)','producer_reject_order(uuid,text)','simulate_pay_order(uuid)','admin_approve_profile(uuid)','admin_reject_profile(uuid,text)','admin_review_document(uuid,boolean,text)','create_order_atomic(text,jsonb)'];
  return assert(fns.every(fn => migration.includes(`revoke all on function public.${fn} from public, anon;`) && migration.includes(`grant execute on function public.${fn} to authenticated;`)), 'missing revoke/grant hardening');
});
test('enforce_product_write checks producer approved on update/reactivate', () => assert(migration.includes('Solo productores aprobados pueden actualizar o reactivar productos') && migration.includes("producer_status is distinct from 'approved' and not public.is_admin()"), 'missing producer approved check on update'));
test('profiles_self_update has no self-referential subselect', () => {
  const m = migration.match(/create policy profiles_self_update[\s\S]*?with check \(auth\.uid\(\) = id\);/);
  return assert(!!m && !m[0].includes('select p.role from public.profiles') && !m[0].includes('select p.status from public.profiles'), 'profiles_self_update still self-referential');
});


test('policies using is_admin/is_approved_producer are scoped TO authenticated', () => {
  const names = ['profiles_admin_read','profiles_admin_update','farms_owner_insert','farms_admin_all','products_owner_insert','products_admin_all','documents_admin_read','documents_admin_update','orders_admin_select','order_items_admin_read'];
  const missing = names.filter(n => !policyHasToAuthenticated(migration, n));
  return assert(missing.length === 0, missing.join(', '));
});
test('public catalog read policies remain separate/public', () => {
  const prod = migration.match(/create policy products_public_read_act on public\.products\s+for select\s+using \(status = 'active'\);/i);
  const farms = migration.match(/create policy farms_public_read on public\.farms\s+for select\s+using \(true\);/i);
  const prodBlock = migration.match(/create policy products_public_read_act[\s\S]*?;/i);
  const farmsBlock = migration.match(/create policy farms_public_read[\s\S]*?;/i);
  return assert(!!prod && !!farms && !/\bto\s+authenticated\b/i.test(prodBlock?.[0]||'') && !/\bto\s+authenticated\b/i.test(farmsBlock?.[0]||''), 'catalog public policies changed');
});
const pass = results.filter(r => r.ok).length;
const fail = results.filter(r => !r.ok).length;
for (const r of results) console.log(`${r.ok ? 'PASS' : 'FAIL'} | ${r.name}${r.detail ? ' | ' + r.detail : ''}`);
console.log(`SUMMARY | ${pass} passed, ${fail} failed`);
if (fail) process.exit(1);