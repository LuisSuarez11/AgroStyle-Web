// Pruebas en dispositivos móviles emulados (Pixel 7 y iPhone 13): MOB-01 a MOB-04.
// Supabase simulado (ver helpers/mockSupabase.js).
import { test, expect } from '@playwright/test';
import { mockSupabase, loginAs } from './helpers/mockSupabase.js';

// El contenido no debe desbordar horizontalmente la pantalla del celular.
async function sinDesbordeHorizontal(page) {
  const { scroll, ancho } = await page.evaluate(() => ({
    scroll: document.documentElement.scrollWidth,
    ancho: window.innerWidth,
  }));
  expect(scroll, `scrollWidth ${scroll} > ancho ${ancho}`).toBeLessThanOrEqual(ancho + 1);
}

test.describe('Móvil', () => {
  test('MOB-01 @smoke: el login cabe en pantalla y permite iniciar sesión táctil', async ({ page }) => {
    await mockSupabase(page);
    await page.goto('/login');
    await expect(page.getByRole('button', { name: 'Iniciar sesión' })).toBeVisible();
    await sinDesbordeHorizontal(page);
    await loginAs(page, 'buyer');
    await expect(page).toHaveURL(/\/dashboard$/);
  });

  test('MOB-02: el registro avanza por pasos en pantalla móvil', async ({ page }) => {
    await mockSupabase(page);
    await page.goto('/register');
    await page.getByText('Comprador', { exact: true }).tap();
    await page.getByRole('button', { name: 'Continuar' }).tap();
    await expect(page.getByPlaceholder('Juan Pérez')).toBeVisible();
    await sinDesbordeHorizontal(page);
  });

  test('MOB-03: el catálogo se ve sin desborde y la búsqueda funciona', async ({ page }) => {
    await mockSupabase(page);
    await loginAs(page, 'buyer');
    await page.goto('/marketplace');
    await expect(page.locator('.pc-card')).toHaveCount(3);
    await sinDesbordeHorizontal(page);
    await page.getByPlaceholder(/Buscar tomate/).fill('soya');
    await expect(page.locator('.pc-card')).toHaveCount(1);
  });

  test('MOB-04: agregar al carrito desde el detalle del producto en móvil', async ({ page }) => {
    await mockSupabase(page);
    await loginAs(page, 'buyer');
    await page.goto('/marketplace');
    await page.getByRole('button', { name: /Tomate/ }).first().tap();
    await page.getByRole('button', { name: /^Agregar/ }).tap();
    await page.getByRole('button', { name: 'Cerrar' }).tap();
    await expect(page.getByRole('button', { name: /Carrito \(1\)/ })).toBeInViewport();
  });
});
