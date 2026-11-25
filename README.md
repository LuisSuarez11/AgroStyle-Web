# AgroStyle

Aplicación web de comercialización agrícola construida con React + Vite + Supabase. El proyecto implementa los flujos priorizados en los documentos SQA de AgroStyle: autenticación por roles, catálogo, detalle de producto, carrito, pedidos y pago QR simulado.

## Requisitos

- Node.js 20+
- npm
- Un proyecto de Supabase

## Configuración

1. Instala dependencias:

   ```bash
   npm install
   ```

2. Crea tu archivo de entorno:

   ```bash
   copy .env.example .env.local
   ```

3. Completa en `.env.local`:

   ```env
   VITE_SUPABASE_URL=https://tu-proyecto.supabase.co
   VITE_SUPABASE_ANON_KEY=tu-anon-key
   VITE_SUPABASE_BUCKET=agrostyle
   ```

4. En Supabase SQL Editor, ejecuta [`supabase/migration.sql`](./supabase/migration.sql).

5. En Supabase Storage, crea un bucket público llamado `agrostyle`.

6. Inicia la aplicación:

   ```bash
   npm run dev
   ```

## Scripts

- `npm run dev`: inicia el servidor de desarrollo.
- `npm run build`: genera el build de producción.
- `npm run preview`: previsualiza el build.
- `npm run lint`: ejecuta ESLint.

## Flujos cubiertos

Basado en el Test Plan ágil SQA y la matriz de trazabilidad:

- **MOB-AUTH-01/02/03/04/05**: registro con validaciones, inicio/cierre de sesión, persistencia de sesión y roles Productor/Comprador.
- **MOB-CAT-01/02**: catálogo de productos activos, búsqueda/filtros y detalle de producto.
- **MOB-CART-01**: carrito con agregar, modificar cantidad, retirar y total.
- **MOB-ORD-01**: creación de pedido, consulta por comprador y confirmación/rechazo por productor.
- **MOB-PAY-QR-01**: flujo de pago QR simulado; no representa una transacción bancaria real.

## Roles

- **Comprador**: se aprueba automáticamente al registrarse.
- **Productor**: queda en estado `pending` hasta aprobación de administrador.
- **Administrador/Transportista**: existen en el proyecto como módulos adicionales, pero el alcance SQA prioritario se centra en Comprador/Productor.

## Notas

- El carrito se mantiene en memoria durante la sesión de navegación.
- El pago QR es una simulación de flujo, no una integración bancaria.
- Si faltan credenciales de Supabase, la app muestra una pantalla de configuración en lugar de fallar.

## Pruebas (SQA)

```bash
npm run test:unit    # Vitest: 34 pruebas unitarias
npm run test:e2e     # Playwright: 14 pruebas E2E con Supabase simulado (no toca producción)
npm run test:smoke   # solo @smoke
npm run verify:f3    # verificación estática de la migración F3
```

Plan de pruebas: `docs/Test_Plan_SQA_AgroStyle_Web_v1.2.pdf` · Evidencias: `evidence/` · Tablero importable: `docs/tablero-qa.csv`.
