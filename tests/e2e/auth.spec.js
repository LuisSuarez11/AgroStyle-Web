// E2E de autenticación: AUTH-01, AUTH-REG-01, guardas de ruta por rol (AUTH-03).
// Supabase está simulado (ver helpers/mockSupabase.js).
import { test, expect } from '@playwright/test';
import { mockSupabase, loginAs } from './helpers/mockSupabase.js';

test.describe('Autenticación', () => {
  test('AUTH-01 @smoke: comprador inicia y cierra sesión', async ({ page }) => {
    await mockSupabase(page);
    await loginAs(page, 'buyer');
    await expect(page).toHaveURL(/\/dashboard$/);
    await page.getByRole('button', { name: 'Salir' }).click();
    await expect(page).toHaveURL(/\/login$/);
  });

  test('AUTH-01b: credenciales incorrectas muestran un mensaje claro y no inician sesión', async ({ page }) => {
    await mockSupabase(page);
    await page.goto('/login');
    await page.locator('input[type="email"]').fill('comprador@test.local');
    await page.locator('input[type="password"]').fill('incorrecta');
    await page.getByRole('button', { name: 'Iniciar sesión' }).click();
    await expect(page.getByText('Credenciales incorrectas')).toBeVisible();
    await expect(page).toHaveURL(/\/login$/);
  });

  test('AUTH-REG-01 @smoke: registro de comprador (detectó BUG-01: toLower)', async ({ page }) => {
    const { calls } = await mockSupabase(page);
    await page.goto('/register');
    await page.getByText('Comprador', { exact: true }).click();
    await page.getByRole('button', { name: 'Continuar' }).click();
    await page.getByPlaceholder('Juan Pérez').fill('Nuevo Usuario');
    await page.getByPlaceholder('tu@correo.com').fill('  Nuevo@Test.LOCAL ');
    await page.getByPlaceholder('Mínimo 6 caracteres').fill('clave123');
    await page.getByRole('button', { name: 'Crear cuenta' }).click();
    await expect(page).toHaveURL(/\/dashboard$/);
    const signup = calls.find((c) => c.path === '/auth/v1/signup');
    expect(signup.body.email).toBe('nuevo@test.local');
    expect(signup.body.data.role).toBe('buyer');
  });

  test('AUTH-03: usuario sin sesión es redirigido a /login desde rutas protegidas', async ({ page }) => {
    await mockSupabase(page);
    for (const ruta of ['/marketplace', '/dashboard', '/my-orders', '/my-products']) {
      await page.goto(ruta);
      await expect(page).toHaveURL(/\/login$/);
    }
  });

  test('AUTH-03b: un comprador no puede entrar a pantallas de productor', async ({ page }) => {
    await mockSupabase(page);
    await loginAs(page, 'buyer');
    await page.goto('/my-products');
    await expect(page).toHaveURL(/\/dashboard$/);
    await page.goto('/producer-orders');
    await expect(page).toHaveURL(/\/dashboard$/);
  });

  test('AUTH-04: productor pendiente de aprobación no accede a sus pantallas', async ({ page }) => {
    await mockSupabase(page);
    await loginAs(page, 'pending');
    await expect(page.getByRole('heading', { name: 'Cuenta en revision' })).toBeVisible();
    await page.goto('/my-products');
    await expect(page).toHaveURL(/\/dashboard$/);
    await expect(page.getByRole('heading', { name: 'Cuenta en revision' })).toBeVisible();
  });
});
