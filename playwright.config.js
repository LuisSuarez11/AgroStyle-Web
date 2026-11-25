import { defineConfig, devices } from '@playwright/test';

// Las pruebas E2E levantan la app con un Supabase FALSO (URL local inexistente).
// Todas las llamadas a http://127.0.0.1:54321 se interceptan en tests/e2e/helpers/mockSupabase.js,
// por lo que NO se toca ningún backend real ni producción.
const PORT = 5199;

export default defineConfig({
  testDir: './tests/e2e',
  timeout: 30_000,
  expect: { timeout: 7_000 },
  fullyParallel: true,
  retries: process.env.CI ? 1 : 0,
  reporter: [
    ['list'],
    ['html', { open: 'never', outputFolder: 'playwright-report' }],
    ['json', { outputFile: 'evidence/playwright-results.json' }],
  ],
  use: {
    baseURL: `http://127.0.0.1:${PORT}`,
    trace: 'retain-on-failure',
    screenshot: 'on',
  },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
  webServer: {
    // Build + preview: más estable que el servidor de desarrollo (sin recargas de dependencias).
    command: `npx vite build && npx vite preview --host 127.0.0.1 --port ${PORT} --strictPort`,
    url: `http://127.0.0.1:${PORT}`,
    reuseExistingServer: false,
    timeout: 180_000,
    env: {
      VITE_SUPABASE_URL: 'http://127.0.0.1:54321',
      VITE_SUPABASE_ANON_KEY: 'test-anon-key-no-real',
    },
  },
});
