# Cashflow

Control personal del gasto de tarjeta de crédito, organizado por **ciclo de
facturación** (16 de un mes al 15 del siguiente, se paga el 30) en vez de por
mes calendario. Registro en lenguaje natural ("hoy 200k en almuerzo y 15 en
bus"), topes con proyección, historial por ciclo y exportación/importación.

## Stack

- **Next.js** (App Router) + **TypeScript**
- **Supabase** — Postgres, Auth (magic link), Row Level Security
- **Tailwind CSS**
- **Recharts** para la gráfica de barras del historial
- **Anthropic API** (`@anthropic-ai/sdk`), llamada solo desde `app/api/parse/route.ts` (servidor)
- **Vitest** para pruebas unitarias de `lib/`

## 1. Crear el proyecto en Supabase

1. Crea un proyecto en [supabase.com](https://supabase.com).
2. En **Project Settings → API**, copia:
   - `Project URL` → `NEXT_PUBLIC_SUPABASE_URL`
   - `anon` `public` key → `NEXT_PUBLIC_SUPABASE_ANON_KEY`
   - `service_role` key → `SUPABASE_SERVICE_ROLE_KEY` (no se usa en el código
     actual, pero queda lista para tareas administrativas futuras — nunca la
     expongas al cliente)
3. En **Authentication → Providers**, confirma que **Email** esté activo. En
   **Authentication → URL Configuration**, agrega tu dominio de despliegue
   (y `http://localhost:3000` para desarrollo) a **Redirect URLs**, incluyendo
   la ruta `/auth/callback` (por ejemplo `https://tu-app.vercel.app/auth/callback`).

## 2. Correr las migraciones

Las migraciones viven en `supabase/migrations/` y crean las tablas
`expenses`, `settings`, `categories`, la función `ciclo_de()`, los índices y
las políticas de RLS.

**Opción A — Supabase CLI, contra tu proyecto:**

```bash
npx supabase login
npx supabase link --project-ref <tu-project-ref>
npx supabase db push
```

**Opción B — pegar el SQL a mano:** abre el **SQL Editor** del dashboard de
Supabase y ejecuta, en orden, el contenido de:

1. `supabase/migrations/0001_init.sql`
2. `supabase/migrations/0002_seed_categories.sql`

Verifica que quedaron 9 filas en `categories` y que RLS está habilitado en
las tres tablas (**Database → Tables**, columna *RLS enabled*).

## 3. Variables de entorno

Copia `.env.local.example` a `.env.local` y completa:

```
NEXT_PUBLIC_SUPABASE_URL=https://xxxxxxxxxxxx.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=eyJ...
SUPABASE_SERVICE_ROLE_KEY=eyJ...
ANTHROPIC_API_KEY=sk-ant-...
```

`ANTHROPIC_API_KEY` habilita el registro en lenguaje natural vía Claude. Si
no la configuras, `/api/parse` cae automáticamente al parser local por
regex (`lib/parse-local.ts`) — entiende montos, categoría y fechas simples,
pero no tan bien como Claude.

## 4. Desarrollo local

```bash
npm install
npm run dev       # http://localhost:3000
npm test          # vitest — corre lib/**/*.test.ts
npm run build     # build de producción
```

El primer login es por **magic link**: entra tu correo en `/login`, abre el
enlace que llega, y Supabase crea tu usuario. Un trigger en la base de datos
(`handle_new_user`, en la migración `0001`) le crea automáticamente su fila
de `settings` con los topes por defecto ($4.000.000 por ciclo, $2.000.000
por quincena) — edítalos desde el botón "topes" en la pantalla de Registro.

## 5. Desplegar en Vercel

1. Importa el repositorio en [vercel.com/new](https://vercel.com/new).
2. En **Environment Variables**, agrega las cuatro variables de la sección 3
   (para **Production**, **Preview** y **Development** si vas a usar
   preview deployments).
3. Deploy. Vercel detecta Next.js automáticamente — no hace falta configurar
   build command ni output directory.
4. Verifica que `npm run build` pasa localmente antes de cada deploy
   importante (ya está verificado en este repo con variables de entorno de
   prueba).
5. Vuelve a **Authentication → URL Configuration** en Supabase y confirma que
   la URL de producción de Vercel (y su `/auth/callback`) está en la lista de
   redirects — si no, el magic link fallará silenciosamente en producción.

## Migrar datos de una versión anterior (el prototipo)

En **Historial → Respaldo**, usa **Importar JSON** y pega un archivo con
esta forma exacta (es el formato que exportaba el prototipo original):

```json
{ "tope": 4000000, "topeQ": 2000000,
  "gastos": [{ "monto": 200000, "categoria": "restaurantes",
               "nota": "almuerzo", "fecha": "2026-08-01" }] }
```

También acepta un array de gastos suelto. Puedes elegir **combinar** (evita
duplicados comparando fecha+monto+categoría+nota contra lo que ya tienes) o
**reemplazar** (borra todo lo que hay en la cuenta y carga solo lo
importado — es un cambio drástico y difícil de revertir, así que revisa la
previsualización de cantidad y total antes de confirmar).

## Notas de implementación

- **Ciclo de facturación**: toda la aritmética de fechas vive en
  `lib/ciclo.ts` (con pruebas unitarias) y se refleja en SQL vía la función
  `ciclo_de()` en la migración `0001_init.sql`, para que agrupar por ciclo
  funcione igual en el cliente y en la base de datos.
- **Nunca se sobrescriben datos que no se pudieron leer**: si falla la
  carga inicial (Registro o Historial), la pantalla queda de solo lectura
  con un aviso y un botón de reintentar, en vez de asumir que no hay nada.
- **Escritura optimista con confirmación real**: un gasto nuevo aparece de
  inmediato en la lista; solo se considera guardado cuando Supabase
  confirma el insert, y se revierte si falla (ver `hooks/useGastos.ts`).
- **Cola offline**: si no hay red al guardar, la mutación se encola (con un
  caché opcional en `localStorage`, nunca como fuente de verdad) y se
  reintenta automáticamente al reconectar (`hooks/useOfflineQueue.ts`).
- **Zona horaria**: "hoy" siempre se calcula en `America/Bogota`
  (`lib/ciclo.ts#hoyISO`), sin importar dónde corra el servidor o el
  navegador del usuario.
