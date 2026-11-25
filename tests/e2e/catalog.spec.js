// E2E de catálogo y carrito: CAT-01, CART-01, CART-02. Supabase simulado.
import { test, expect } from '@playwright/test';
import { mockSupabase, loginAs } from './helpers/mockSupabase.js';

async function abrirMarketplace(page) {
  await mockSupabase(page);
  await loginAs(page, 'buyer');
  await page.goto('/marketplace');
  await expect(page.getByText('productos encontrados')).toBeVisible();
}

async function abrirProducto(page, nombre) {
  await page.getByRole('button', { name: new RegExp(nombre) }).first().click();
}

test.describe('Catálogo (CAT-01)', () => {
  test('CAT-01 @smoke: lista los productos activos', async ({ page }) => {
    await abrirMarketplace(page);
    await expect(page.locator('.pc-card')).toHaveCount(3);
    await expect(page.locator('.mk-results-head strong')).toHaveText('3');
  });

  test('CAT-01b: la búsqueda por texto filtra resultados y se puede limpiar', async ({ page }) => {
    await abrirMarketplace(page);
    await page.getByPlaceholder(/Buscar tomate/).fill('tomate');
    await expect(page.locator('.pc-card')).toHaveCount(1);
    await expect(page.locator('.pc-name')).toHaveText('Tomate');
    await page.getByRole('button', { name: 'Limpiar filtros' }).first().click();
    await expect(page.locator('.pc-card')).toHaveCount(3);
  });

  test('CAT-01c: el filtro por categoría muestra solo esa categoría', async ({ page }) => {
    await abrirMarketplace(page);
    await page.locator('.mk-chip', { hasText: 'Granos' }).click();
    await expect(page.locator('.pc-card')).toHaveCount(1);
    await expect(page.locator('.pc-name')).toHaveText('Soya');
  });

  test('CAT-01d: búsqueda sin coincidencias muestra estado vacío', async ({ page }) => {
    await abrirMarketplace(page);
    await page.getByPlaceholder(/Buscar tomate/).fill('zzzz-no-existe');
    await expect(page.getByText('Sin resultados')).toBeVisible();
  });

  test('CAT-01e: ordenar por precio de menor a mayor', async ({ page }) => {
    await abrirMarketplace(page);
    await page.locator('.mk-sort select').selectOption('price_asc');
    await expect(page.locator('.pc-name').first()).toHaveText('Cebolla'); // Bs 4.5
    await expect(page.locator('.pc-name').last()).toHaveText('Tomate');   // Bs 10
  });
});

test.describe('Carrito (CART-01 / CART-02)', () => {
  test('CART-00 @smoke: agregar un producto muestra el carrito con la cantidad', async ({ page }) => {
    await abrirMarketplace(page);
    await abrirProducto(page, 'Tomate');
    await page.getByRole('button', { name: /^Agregar/ }).click();
    await expect(page.getByText(/agregado al carrito|agregados al carrito/)).toBeVisible();
    await page.getByRole('button', { name: 'Cerrar' }).click();
    await expect(page.getByRole('button', { name: /Carrito \(1\)/ })).toBeVisible();
  });

  test('CART-01: no permite mezclar productos de dos productores', async ({ page }) => {
    await abrirMarketplace(page);
    await abrirProducto(page, 'Tomate');
    await page.getByRole('button', { name: /^Agregar/ }).click();
    await page.getByRole('button', { name: 'Cerrar' }).click();

    await abrirProducto(page, 'Soya'); // Finca B
    await page.getByRole('button', { name: /^Agregar/ }).click();
    await expect(page.getByText(/El carrito ya tiene productos de Finca A/)).toBeVisible();
    await page.getByRole('button', { name: 'Cerrar' }).click();
    await expect(page.getByRole('button', { name: /Carrito \(1\)/ })).toBeVisible();
  });

  test('CART-02: el carrito se conserva al recargar la página (corrige BUG-02)', async ({ page }) => {
    await abrirMarketplace(page);
    await abrirProducto(page, 'Tomate');
    await page.getByRole('button', { name: /^Agregar/ }).click();
    await page.getByRole('button', { name: 'Cerrar' }).click();
    await expect(page.getByRole('button', { name: /Carrito \(1\)/ })).toBeVisible();

    await page.reload();
    await expect(page.getByText('productos encontrados')).toBeVisible();
    await expect(page.getByRole('button', { name: /Carrito \(1\)/ })).toBeVisible();
  });
});
