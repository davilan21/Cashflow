# Lectura automática de gastos desde Gmail (Bancolombia) — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Conectar el Gmail de David vía OAuth, detectar notificaciones de
Bancolombia por correo, convertirlas en gastos sugeridos en una bandeja de
revisión, y dejar que el usuario confirme o descarte antes de que cuenten
como gasto real.

**Architecture:** Dos tablas nuevas (`gmail_conexiones`, `gastos_pendientes`)
protegidas por RLS/service-role. Rutas de servidor en `app/api/gmail/*`
manejan el flujo OAuth (fetch directo a los endpoints REST de Google, sin
SDK `googleapis`) y la sincronización (Gmail REST API → parseo con Claude
o regex de respaldo → insert en `gastos_pendientes`). Dos pantallas nuevas
en la UI: sección "Gmail" en Cuenta (conectar) y pestaña "Pendientes"
(sincronizar, revisar, confirmar/descartar).

**Tech Stack:** Next.js App Router, TypeScript, Supabase (Postgres + RLS +
service role), `@anthropic-ai/sdk` (ya en el proyecto), `fetch` nativo para
Google OAuth2 y Gmail API (sin dependencias nuevas), Vitest.

## Global Constraints

- Español para todo texto de UI, commits y comentarios (rasgo del proyecto).
- Sin dependencias npm nuevas — todo con `fetch` nativo (Node 20+, runtime
  `nodejs` en las rutas).
- Todas las mutaciones vía Supabase (`insert`/`update`/`upsert`) sobre el
  cliente tipado deben pasar por el escape hatch `sinTipar()` de
  `lib/supabase/queries.ts` — la inferencia de tipos de `@supabase/postgrest-js`
  colapsa a `never` con más de una tabla en `Database` (ver comentario en
  ese archivo).
- Nunca exponer `refresh_token` al cliente. Nunca guardar el correo
  completo — solo monto/fecha/comercio extraídos.
- Revisión obligatoria: ninguna ruta escribe directo en `expenses` sin pasar
  por `confirmar_gasto_pendiente()`.
- El remitente real de las notificaciones (confirmado por David) es
  `alertasynotificaciones@bancolombia.com.co`, asunto `Alertas y
  Notificaciones`. El único correo de ejemplo real disponible es una
  notificación de "pago Factura Programada" — el regex de respaldo solo
  está calibrado contra esa estructura confirmada (ver Tarea 5).

---

### Tarea 1: Prerrequisito — credenciales de Google Cloud + variables de entorno

Esta tarea no es código ejecutable por un agente: **requiere que David haga
un setup manual en Google Cloud Console** antes de que las tareas de OAuth
(6, 10) puedan probarse de punta a punta. Los tests automatizados de las
tareas 6-9 usan `fetch` mockeado y no necesitan credenciales reales.

**Files:**
- Modify: `.env.local.example`
- Modify: `README.md`

**Interfaces:**
- Produces: variables de entorno `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`,
  `CRON_SECRET` que las tareas 6, 10, 11 leen de `process.env`.

- [ ] **Paso 1: Documentar el setup manual en el README**

Agregar una sección nueva después de "## 5. Desplegar en Vercel" (antes de
"## Migrar datos de una versión anterior"):

```markdown
## 6. Conectar Gmail (lectura automática de gastos)

1. Crea un proyecto en [Google Cloud Console](https://console.cloud.google.com/).
2. **APIs y servicios → Biblioteca**: activa la **Gmail API**.
3. **APIs y servicios → Pantalla de consentimiento OAuth**:
   - Tipo de usuario: **Externo**.
   - Deja el estado en **Pruebas** (no publiques la app: el scope de Gmail
     es "restringido" y publicar exigiría una auditoría de seguridad
     anual de pago, inconveniente para una app personal).
   - En **Usuarios de prueba**, agrega tu correo de Gmail (hasta 100).
   - Nota: en modo Pruebas, el token de acceso expira cada ~7 días — la
     app te avisará con un botón de "Reconectar" cuando pase.
4. **APIs y servicios → Credenciales → Crear credenciales → ID de cliente
   de OAuth**:
   - Tipo de aplicación: **Aplicación web**.
   - **URI de redireccionamiento autorizados**: agrega
     `http://localhost:3000/api/gmail/oauth/callback` y
     `https://tu-app.vercel.app/api/gmail/oauth/callback` (tu dominio de
     producción).
   - Copia el **ID de cliente** y el **Secreto de cliente**.
5. En tus variables de entorno (`.env.local` y en Vercel para producción):

```
GOOGLE_CLIENT_ID=xxxxx.apps.googleusercontent.com
GOOGLE_CLIENT_SECRET=GOCSPX-xxxxx
CRON_SECRET=una-cadena-aleatoria-larga
```

`CRON_SECRET` la generas tú (por ejemplo `openssl rand -hex 32`) — protege
la ruta que dispara la sincronización diaria para que solo Vercel Cron
pueda llamarla.
```

- [ ] **Paso 2: Agregar los placeholders a `.env.local.example`**

```
# Google OAuth — lectura de gastos desde Gmail (ver README sección 6)
GOOGLE_CLIENT_ID=xxxxx.apps.googleusercontent.com
GOOGLE_CLIENT_SECRET=GOCSPX-xxxxx
CRON_SECRET=una-cadena-aleatoria-larga
```

- [ ] **Paso 3: Verificar**

Lee `README.md` de corrido y confirma que la sección nueva menciona ambas
URIs de redirección (localhost y producción) y explica el porqué del modo
Pruebas. Confirma que `.env.local.example` tiene las tres variables nuevas.

- [ ] **Paso 4: Commit**

```bash
git add README.md .env.local.example
git commit -m "docs: setup de Google Cloud para conectar Gmail"
```

---

### Tarea 2: Migración SQL — tablas y RLS

**Files:**
- Create: `supabase/migrations/0004_gmail_integracion.sql`

**Interfaces:**
- Produces: tablas `gmail_conexiones`, `gastos_pendientes`; función
  `confirmar_gasto_pendiente(p_id uuid, p_monto bigint, p_categoria text,
  p_nota text, p_fecha date) returns uuid`. Las tareas 3, 4, 9 dependen de
  estos nombres exactos.

- [ ] **Paso 1: Escribir la migración**

```sql
-- Cashflow: lectura automática de gastos desde Gmail (Bancolombia).

create table gmail_conexiones (
  user_id         uuid primary key references auth.users(id) on delete cascade,
  email_conectado text not null,
  refresh_token   text not null,
  estado          text not null default 'activo' check (estado in ('activo', 'expirado', 'error')),
  ultimo_sync_at  timestamptz,
  ultimo_error    text,
  created_at      timestamptz not null default now()
);

alter table gmail_conexiones enable row level security;
-- Sin políticas para authenticated/anon a propósito: la tabla queda
-- invisible al cliente por completo. Solo se toca con la service role
-- desde rutas de servidor (ver lib/supabase/admin.ts).

create table gastos_pendientes (
  id               uuid primary key default gen_random_uuid(),
  cuenta_id        uuid not null references cuentas(id) on delete cascade,
  creado_por       uuid not null references auth.users(id) on delete cascade,
  gmail_message_id text not null,
  fecha            date not null,
  monto            bigint not null check (monto > 0),
  categoria        text not null references categories(id),
  nota             text not null,
  estado           text not null default 'pendiente' check (estado in ('pendiente', 'confirmado', 'descartado')),
  created_at       timestamptz not null default now(),
  unique (creado_por, gmail_message_id)
);

create index gastos_pendientes_cuenta_idx on gastos_pendientes (cuenta_id, estado);

alter table gastos_pendientes enable row level security;

create policy "gastos_pendientes_select" on gastos_pendientes
  for select using (cuenta_id = mi_cuenta());

create policy "gastos_pendientes_update" on gastos_pendientes
  for update using (cuenta_id = mi_cuenta()) with check (cuenta_id = mi_cuenta());

-- Sin política de insert para authenticated: solo la escribe el proceso de
-- sync, vía service role (bypassa RLS por diseño de Supabase).

-- confirmar_gasto_pendiente(): mueve un pendiente a expenses de forma
-- atómica y marca el pendiente como confirmado. SECURITY DEFINER porque
-- valida pertenencia con mi_cuenta() y hace dos escrituras relacionadas;
-- auth.uid() sigue siendo el del llamador (no cambia con SECURITY DEFINER),
-- así que created_by en expenses lo sigue fijando el trigger existente
-- set_created_by().
create or replace function confirmar_gasto_pendiente(
  p_id uuid, p_monto bigint, p_categoria text, p_nota text, p_fecha date
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_cuenta uuid;
  v_estado text;
  v_nuevo_id uuid;
begin
  select cuenta_id, estado into v_cuenta, v_estado from gastos_pendientes where id = p_id;
  if v_cuenta is null or v_cuenta <> mi_cuenta() then
    raise exception 'No autorizado';
  end if;
  if v_estado <> 'pendiente' then
    raise exception 'Este pendiente ya fue procesado';
  end if;

  insert into expenses (cuenta_id, fecha, monto, categoria, nota)
    values (v_cuenta, p_fecha, p_monto, p_categoria, p_nota)
    returning id into v_nuevo_id;

  update gastos_pendientes set estado = 'confirmado' where id = p_id;

  return v_nuevo_id;
end;
$$;
```

- [ ] **Paso 2: Aplicar la migración**

Sigue el mismo proceso que las migraciones anteriores (README sección 2):

```bash
npx supabase db push
```

o pega el SQL a mano en el SQL Editor de Supabase si no tienes el proyecto
linkeado localmente.

- [ ] **Paso 3: Verificar contra la base real**

En el SQL Editor de Supabase, corre y confirma:

```sql
select tablename, rowsecurity from pg_tables
  where tablename in ('gmail_conexiones', 'gastos_pendientes');
-- ambas con rowsecurity = true

select policyname from pg_policies where tablename = 'gastos_pendientes';
-- gastos_pendientes_select, gastos_pendientes_update (ninguna de insert)

select policyname from pg_policies where tablename = 'gmail_conexiones';
-- 0 filas

select proname from pg_proc where proname = 'confirmar_gasto_pendiente';
-- 1 fila
```

- [ ] **Paso 4: Commit**

```bash
git add supabase/migrations/0004_gmail_integracion.sql
git commit -m "feat(db): tablas y RLS para lectura de gastos desde Gmail"
```

---

### Tarea 3: Tipos TypeScript

**Files:**
- Modify: `lib/types.ts`

**Interfaces:**
- Consumes: nombres de tabla/función de la Tarea 2.
- Produces: `GmailConexion`, `GastoPendiente` (usados por las Tareas 8, 9,
  12, 13, 14); `Database["public"]["Tables"]["gmail_conexiones"|"gastos_pendientes"]`
  y `Database["public"]["Functions"]["confirmar_gasto_pendiente"]` (usados
  por la Tarea 4 en adelante para tipar el cliente de Supabase).

- [ ] **Paso 1: Agregar las interfaces**, después de la interfaz `Miembro`:

```typescript
/** Conexión de Gmail de un usuario (solo accesible con service role). */
export interface GmailConexion {
  user_id: string;
  email_conectado: string;
  refresh_token: string;
  estado: "activo" | "expirado" | "error";
  ultimo_sync_at: string | null;
  ultimo_error: string | null;
  created_at: string;
}

/** Un gasto detectado en Gmail, pendiente de revisión. */
export interface GastoPendiente {
  id: string;
  cuenta_id: string;
  creado_por: string;
  gmail_message_id: string;
  fecha: string;
  monto: number;
  categoria: string;
  nota: string;
  estado: "pendiente" | "confirmado" | "descartado";
  created_at: string;
}
```

- [ ] **Paso 2: Agregar las tablas al `Database.public.Tables`**, después de
`cuenta_miembros`:

```typescript
      gmail_conexiones: {
        Row: GmailConexion;
        Insert: {
          user_id: string;
          email_conectado: string;
          refresh_token: string;
          estado?: string;
          ultimo_sync_at?: string | null;
          ultimo_error?: string | null;
          created_at?: string;
        };
        Update: {
          email_conectado?: string;
          refresh_token?: string;
          estado?: string;
          ultimo_sync_at?: string | null;
          ultimo_error?: string | null;
        };
        Relationships: [];
      };
      gastos_pendientes: {
        Row: GastoPendiente;
        Insert: {
          id?: string;
          cuenta_id: string;
          creado_por: string;
          gmail_message_id: string;
          fecha: string;
          monto: number;
          categoria: string;
          nota: string;
          estado?: string;
          created_at?: string;
        };
        Update: {
          estado?: string;
          monto?: number;
          categoria?: string;
          nota?: string;
          fecha?: string;
        };
        Relationships: [];
      };
```

- [ ] **Paso 3: Agregar la función al `Database.public.Functions`**:

```typescript
      confirmar_gasto_pendiente: {
        Args: { p_id: string; p_monto: number; p_categoria: string; p_nota: string; p_fecha: string };
        Returns: string;
      };
```

- [ ] **Paso 4: Verificar**

```bash
npx tsc --noEmit
```

Expected: sin errores (el archivo compila; nada más lo consume todavía).

- [ ] **Paso 5: Commit**

```bash
git add lib/types.ts
git commit -m "feat(types): tipos para conexión de Gmail y gastos pendientes"
```

---

### Tarea 4: Cliente admin de Supabase + escape hatch compartido

**Files:**
- Create: `lib/supabase/admin.ts`
- Modify: `lib/supabase/queries.ts:17` (exportar `sinTipar`)

**Interfaces:**
- Consumes: `Database` de la Tarea 3.
- Produces: `createAdminClient(): SupabaseClient<Database>` (usado por las
  Tareas 8, 10, 11, 12); `sinTipar` exportado (usado por las Tareas 8, 9).

- [ ] **Paso 1: Crear el cliente admin**

```typescript
import { createClient as createSupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/types";

/**
 * Cliente con la service role key — bypassa RLS por completo. Solo para
 * rutas de servidor que necesitan leer/escribir across cuentas (sync de
 * Gmail, cron). Nunca exponer al cliente ni usar en un Server Component
 * que renderiza datos específicos de un usuario sin filtrar manualmente.
 */
export function createAdminClient() {
  return createSupabaseClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } }
  );
}
```

- [ ] **Paso 2: Exportar `sinTipar`**

En `lib/supabase/queries.ts:17`, cambiar:

```typescript
function sinTipar(supabase: Cliente): SupabaseClient {
```

por:

```typescript
export function sinTipar(supabase: Cliente): SupabaseClient {
```

- [ ] **Paso 3: Verificar**

```bash
npx tsc --noEmit && npm test
```

Expected: sin errores, los tests existentes (`lib/**/*.test.ts`) siguen
pasando igual que antes.

- [ ] **Paso 4: Commit**

```bash
git add lib/supabase/admin.ts lib/supabase/queries.ts
git commit -m "feat: cliente admin de Supabase (service role) para tareas de servidor"
```

---

### Tarea 5: Parseo de notificaciones — parser local (TDD) + parser Claude

**Files:**
- Create: `lib/gmail/parse.ts`
- Test: `lib/gmail/parse.test.ts`

**Interfaces:**
- Consumes: `CategoryId` de `lib/types.ts`.
- Produces: `GastoDetectado` (`{monto: number; fecha: string; nota: string;
  categoria: CategoryId}`), `extraerTextoPlano(payload)`,
  `parsearNotificacionLocal(texto): GastoDetectado | null`,
  `parsearNotificacionConClaude(texto): Promise<GastoDetectado | null>`.
  Usado por la Tarea 8 (`sync.ts`).

- [ ] **Paso 1: Escribir los tests del parser local (fallan primero)**

```typescript
import { describe, it, expect } from "vitest";
import { extraerTextoPlano, parsearNotificacionLocal } from "./parse";

function base64Url(texto: string): string {
  return Buffer.from(texto, "utf-8").toString("base64").replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

// Correo real compartido por David (remitente alertasynotificaciones@bancolombia.com.co).
const TEXTO_NOTIFICACION =
  "Bancolombia informa pago Factura Programada CLARO SOLUCIONE Ref 14152207 por $172.860,00 desde TC*0459. 17/08/2026. Inquietudes 6045109095/018000931987.";

describe("extraerTextoPlano", () => {
  it("decodifica la parte text/plain", () => {
    const payload = { mimeType: "text/plain", body: { data: base64Url(TEXTO_NOTIFICACION) } };
    expect(extraerTextoPlano(payload)).toBe(TEXTO_NOTIFICACION);
  });

  it("en multipart, prefiere text/plain sobre text/html", () => {
    const payload = {
      mimeType: "multipart/alternative",
      parts: [
        { mimeType: "text/html", body: { data: base64Url("<p>otra cosa</p>") } },
        { mimeType: "text/plain", body: { data: base64Url(TEXTO_NOTIFICACION) } },
      ],
    };
    expect(extraerTextoPlano(payload)).toBe(TEXTO_NOTIFICACION);
  });

  it("si solo hay html, le quita las etiquetas y normaliza espacios", () => {
    const html = "<html><body><p>Bancolombia informa</p><p>Compra por $50.000,00 desde TC*1234.</p><p>17/08/2026.</p></body></html>";
    const payload = { mimeType: "text/html", body: { data: base64Url(html) } };
    expect(extraerTextoPlano(payload)).toContain("Bancolombia informa Compra por $50.000,00 desde TC*1234. 17/08/2026.");
  });

  it("sin payload devuelve cadena vacía", () => {
    expect(extraerTextoPlano(undefined)).toBe("");
  });
});

describe("parsearNotificacionLocal", () => {
  it("extrae monto, fecha y descripción del correo real de Bancolombia", () => {
    expect(parsearNotificacionLocal(TEXTO_NOTIFICACION)).toEqual({
      monto: 172860,
      fecha: "2026-08-17",
      nota: "pago Factura Programada CLARO SOLUCIONE",
      categoria: "otros",
    });
  });

  it("generaliza a otro monto/fecha/comercio con la misma estructura", () => {
    const texto =
      "Bancolombia informa Compra Programada NETFLIX Ref 998877 por $45.900,00 desde TC*0459. 05/01/2026. Inquietudes 6045109095/018000931987.";
    expect(parsearNotificacionLocal(texto)).toEqual({
      monto: 45900,
      fecha: "2026-01-05",
      nota: "Compra Programada NETFLIX",
      categoria: "otros",
    });
  });

  it("devuelve null si el texto no matchea el formato esperado", () => {
    expect(parsearNotificacionLocal("Un correo cualquiera sin el formato de Bancolombia")).toBeNull();
  });
});
```

- [ ] **Paso 2: Correr los tests y verificar que fallan**

Run: `npx vitest run lib/gmail/parse.test.ts`
Expected: FAIL — `./parse` no existe todavía.

- [ ] **Paso 3: Implementar `extraerTextoPlano` y `parsearNotificacionLocal`**

```typescript
import Anthropic from "@anthropic-ai/sdk";
import { hoyISO } from "@/lib/ciclo";
import type { CategoryId } from "@/lib/types";

export interface GastoDetectado {
  monto: number;
  fecha: string; // YYYY-MM-DD
  nota: string;
  categoria: CategoryId;
}

interface ParteGmail {
  mimeType?: string;
  body?: { data?: string };
  parts?: ParteGmail[];
}

function decodificarBase64Url(data: string): string {
  const normal = data.replace(/-/g, "+").replace(/_/g, "/");
  return Buffer.from(normal, "base64").toString("utf-8");
}

function quitarHtml(html: string): string {
  return html
    .replace(/<style[\s\S]*?<\/style>/gi, "")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/\s+/g, " ")
    .trim();
}

function buscarParte(p: ParteGmail, tipo: string): string | null {
  if (p.mimeType === tipo && p.body?.data) return decodificarBase64Url(p.body.data);
  for (const parte of p.parts ?? []) {
    const encontrado = buscarParte(parte, tipo);
    if (encontrado) return encontrado;
  }
  return null;
}

/** Texto plano de un mensaje de Gmail: prefiere text/plain, si no hay le quita las etiquetas al text/html. */
export function extraerTextoPlano(payload: ParteGmail | undefined): string {
  if (!payload) return "";
  const plano = buscarParte(payload, "text/plain");
  if (plano) return plano.replace(/\s+/g, " ").trim();
  const html = buscarParte(payload, "text/html");
  if (html) return quitarHtml(html);
  if (payload.body?.data) return decodificarBase64Url(payload.body.data).replace(/\s+/g, " ").trim();
  return "";
}

// Calibrado contra el único formato de notificación confirmado por David:
// "Bancolombia informa <descripción> por $<monto> desde TC*<4 dígitos>. <fecha>."
// Si Bancolombia usa una estructura distinta para otro tipo de movimiento
// (ej. "Compra" con el comercio después del monto), este regex no la
// reconocerá y esa notificación no producirá un pendiente — parsearNotificacionConClaude,
// el parser primario, es más tolerante a variaciones de formato.
const REGEX_NOTIFICACION = /Bancolombia informa (.+?) por \$([\d.,]+) desde TC\*\d{4}\.\s*(\d{2})\/(\d{2})\/(\d{4})/;

function limpiarMonto(texto: string): number {
  return Math.round(parseFloat(texto.replace(/\./g, "").replace(",", ".")));
}

function limpiarDescripcion(desc: string): string {
  return desc.replace(/\s*Ref\s+\d+\s*$/i, "").trim().slice(0, 60);
}

export function parsearNotificacionLocal(texto: string): GastoDetectado | null {
  const match = REGEX_NOTIFICACION.exec(texto);
  if (!match) return null;
  const [, descripcion, montoTexto, dd, mm, yyyy] = match;
  const monto = limpiarMonto(montoTexto);
  if (!(monto > 0)) return null;
  return { monto, fecha: `${yyyy}-${mm}-${dd}`, nota: limpiarDescripcion(descripcion), categoria: "otros" };
}
```

- [ ] **Paso 4: Correr los tests y verificar que pasan**

Run: `npx vitest run lib/gmail/parse.test.ts`
Expected: PASS (todos los `describe` de este archivo).

- [ ] **Paso 5: Agregar el parser con Claude (mismo archivo, sin test automatizado)**

Mismo patrón que `parsearConClaude` en `app/api/parse/route.ts`, pero para
un solo gasto y con contexto de notificación bancaria. No tiene test
automatizado por la misma razón que su equivalente en `/api/parse` no lo
tiene: llama a una API externa real; se verifica manualmente en el Paso 6.

```typescript
const CATEGORIAS_VALIDAS = [
  "mercado", "restaurantes", "transporte", "vivienda", "salud", "ocio", "compras", "suscripciones", "otros",
] as const;

const HERRAMIENTA: Anthropic.Tool = {
  name: "registrar_gasto_bancario",
  description: "Registra el gasto extraído de una notificación de Bancolombia.",
  input_schema: {
    type: "object",
    properties: {
      monto: { type: "number", description: "Monto en pesos colombianos, sin decimales" },
      comercio: { type: "string", description: "Comercio o concepto del pago, corto y limpio, sin 'Ref' ni números de referencia" },
      fecha: { type: "string", description: "Fecha en formato YYYY-MM-DD" },
      categoria: { type: "string", enum: CATEGORIAS_VALIDAS as unknown as string[] },
    },
    required: ["monto", "comercio", "fecha", "categoria"],
  },
};

export async function parsearNotificacionConClaude(texto: string): Promise<GastoDetectado | null> {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) return null;

  try {
    const anthropic = new Anthropic({ apiKey });
    const respuesta = await anthropic.messages.create({
      model: "claude-haiku-4-5-20251001",
      max_tokens: 512,
      system:
        "Extraes el gasto de una notificación de Bancolombia (compra, pago de factura, etc.) y siempre respondes llamando a la herramienta registrar_gasto_bancario. fecha en YYYY-MM-DD. comercio: nombre corto y limpio del establecimiento o concepto. categoria debe ser uno de los ids permitidos; si no calza con ninguno, usa 'otros'.",
      tools: [HERRAMIENTA],
      tool_choice: { type: "tool", name: "registrar_gasto_bancario" },
      messages: [{ role: "user", content: texto }],
    });

    const bloque = respuesta.content.find((b) => b.type === "tool_use");
    if (!bloque || bloque.type !== "tool_use") return null;
    const input = bloque.input as { monto?: number; comercio?: string; fecha?: string; categoria?: string };
    if (!(Number(input.monto) > 0)) return null;

    return {
      monto: Math.round(Number(input.monto)),
      nota: String(input.comercio ?? "").slice(0, 60),
      fecha: /^\d{4}-\d{2}-\d{2}$/.test(String(input.fecha)) ? String(input.fecha) : hoyISO(),
      categoria: (CATEGORIAS_VALIDAS as readonly string[]).includes(input.categoria ?? "")
        ? (input.categoria as CategoryId)
        : "otros",
    };
  } catch {
    return null;
  }
}
```

- [ ] **Paso 6: Verificar manualmente**

```bash
npx tsc --noEmit
```

Si **no** tienes `ANTHROPIC_API_KEY` configurada todavía (caso normal en
este punto del desarrollo), confirma el comportamiento seguro por defecto
con un script rápido:

```bash
node -e "
require('dotenv').config({ path: '.env.local' });
delete process.env.ANTHROPIC_API_KEY;
require('tsx/cjs');
const { parsearNotificacionConClaude } = require('./lib/gmail/parse.ts');
parsearNotificacionConClaude('cualquier texto').then(r => console.log('resultado:', r));
"
```

Expected: `resultado: null` (cae al parser local, igual que `/api/parse`).
Si ya tienes `ANTHROPIC_API_KEY` configurada, puedes correrlo sin el
`delete` y confirmar que devuelve `{monto, fecha, nota, categoria}` con
datos razonables para el texto de ejemplo de la Tarea 5, Paso 1.

- [ ] **Paso 7: Commit**

```bash
git add lib/gmail/parse.ts lib/gmail/parse.test.ts
git commit -m "feat: parseo de notificaciones de Bancolombia (Claude + regex de respaldo)"
```

---

### Tarea 6: OAuth de Google (TDD con `fetch` mockeado)

**Files:**
- Create: `lib/gmail/oauth.ts`
- Test: `lib/gmail/oauth.test.ts`

**Interfaces:**
- Consumes: `process.env.GOOGLE_CLIENT_ID`, `process.env.GOOGLE_CLIENT_SECRET`
  (Tarea 1).
- Produces: `construirUrlAutorizacion(redirectUri, state): string`,
  `intercambiarCodigo(code, redirectUri): Promise<{access_token: string;
  refresh_token?: string; expires_in: number}>`,
  `refrescarToken(refreshToken): Promise<{access_token: string; expires_in:
  number}>`, `obtenerEmailConectado(accessToken): Promise<string>`. Usado
  por las Tareas 8, 10.

- [ ] **Paso 1: Escribir los tests (fallan primero)**

```typescript
import { describe, it, expect, vi, afterEach } from "vitest";
import { construirUrlAutorizacion, intercambiarCodigo, refrescarToken, obtenerEmailConectado } from "./oauth";

afterEach(() => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
});

describe("construirUrlAutorizacion", () => {
  it("incluye client_id, redirect_uri, state y el scope de gmail.readonly", () => {
    vi.stubEnv("GOOGLE_CLIENT_ID", "cliente-123");
    const url = new URL(construirUrlAutorizacion("https://app.test/callback", "estado-abc"));
    expect(url.origin + url.pathname).toBe("https://accounts.google.com/o/oauth2/v2/auth");
    expect(url.searchParams.get("client_id")).toBe("cliente-123");
    expect(url.searchParams.get("redirect_uri")).toBe("https://app.test/callback");
    expect(url.searchParams.get("state")).toBe("estado-abc");
    expect(url.searchParams.get("scope")).toContain("gmail.readonly");
    expect(url.searchParams.get("access_type")).toBe("offline");
    expect(url.searchParams.get("prompt")).toBe("consent");
  });
});

describe("intercambiarCodigo", () => {
  it("hace POST al token endpoint con grant_type=authorization_code", async () => {
    vi.stubEnv("GOOGLE_CLIENT_ID", "cliente-123");
    vi.stubEnv("GOOGLE_CLIENT_SECRET", "secreto-456");
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ access_token: "acc", refresh_token: "ref", expires_in: 3600 }),
    });
    vi.stubGlobal("fetch", fetchMock);

    const tokens = await intercambiarCodigo("codigo-xyz", "https://app.test/callback");

    expect(tokens).toEqual({ access_token: "acc", refresh_token: "ref", expires_in: 3600 });
    expect(fetchMock.mock.calls[0][0]).toBe("https://oauth2.googleapis.com/token");
    const body = new URLSearchParams(fetchMock.mock.calls[0][1].body);
    expect(body.get("code")).toBe("codigo-xyz");
    expect(body.get("grant_type")).toBe("authorization_code");
    expect(body.get("redirect_uri")).toBe("https://app.test/callback");
  });

  it("lanza error si Google responde con fallo", async () => {
    vi.stubEnv("GOOGLE_CLIENT_ID", "x");
    vi.stubEnv("GOOGLE_CLIENT_SECRET", "y");
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: false, status: 400 }));
    await expect(intercambiarCodigo("bad", "https://app.test/callback")).rejects.toThrow();
  });
});

describe("refrescarToken", () => {
  it("hace POST con grant_type=refresh_token", async () => {
    vi.stubEnv("GOOGLE_CLIENT_ID", "cliente-123");
    vi.stubEnv("GOOGLE_CLIENT_SECRET", "secreto-456");
    const fetchMock = vi.fn().mockResolvedValue({ ok: true, json: async () => ({ access_token: "acc-nuevo", expires_in: 3600 }) });
    vi.stubGlobal("fetch", fetchMock);

    const tokens = await refrescarToken("ref-existente");

    expect(tokens.access_token).toBe("acc-nuevo");
    const body = new URLSearchParams(fetchMock.mock.calls[0][1].body);
    expect(body.get("grant_type")).toBe("refresh_token");
    expect(body.get("refresh_token")).toBe("ref-existente");
  });

  it("lanza error si el refresh falla (token expirado/revocado)", async () => {
    vi.stubEnv("GOOGLE_CLIENT_ID", "x");
    vi.stubEnv("GOOGLE_CLIENT_SECRET", "y");
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: false, status: 400 }));
    await expect(refrescarToken("ref-vencido")).rejects.toThrow();
  });
});

describe("obtenerEmailConectado", () => {
  it("devuelve el email del endpoint de userinfo", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: true, json: async () => ({ email: "david@gmail.com" }) }));
    expect(await obtenerEmailConectado("token-abc")).toBe("david@gmail.com");
  });
});
```

- [ ] **Paso 2: Correr y verificar que fallan**

Run: `npx vitest run lib/gmail/oauth.test.ts`
Expected: FAIL — `./oauth` no existe.

- [ ] **Paso 3: Implementar**

```typescript
const AUTH_URL = "https://accounts.google.com/o/oauth2/v2/auth";
const TOKEN_URL = "https://oauth2.googleapis.com/token";
const USERINFO_URL = "https://openidconnect.googleapis.com/v1/userinfo";
const SCOPES = ["https://www.googleapis.com/auth/gmail.readonly", "openid", "email"];

export function construirUrlAutorizacion(redirectUri: string, state: string): string {
  const params = new URLSearchParams({
    client_id: process.env.GOOGLE_CLIENT_ID!,
    redirect_uri: redirectUri,
    response_type: "code",
    access_type: "offline",
    prompt: "consent", // fuerza a que Google reemita refresh_token en cada reconexión
    scope: SCOPES.join(" "),
    state,
  });
  return `${AUTH_URL}?${params.toString()}`;
}

interface TokensGoogle {
  access_token: string;
  refresh_token?: string;
  expires_in: number;
}

async function pedirToken(body: URLSearchParams, contexto: string): Promise<TokensGoogle> {
  const res = await fetch(TOKEN_URL, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body,
  });
  if (!res.ok) throw new Error(`Google ${contexto} falló: ${res.status}`);
  return res.json();
}

export async function intercambiarCodigo(code: string, redirectUri: string): Promise<TokensGoogle> {
  return pedirToken(
    new URLSearchParams({
      code,
      client_id: process.env.GOOGLE_CLIENT_ID!,
      client_secret: process.env.GOOGLE_CLIENT_SECRET!,
      redirect_uri: redirectUri,
      grant_type: "authorization_code",
    }),
    "token exchange"
  );
}

export async function refrescarToken(refreshToken: string): Promise<{ access_token: string; expires_in: number }> {
  return pedirToken(
    new URLSearchParams({
      refresh_token: refreshToken,
      client_id: process.env.GOOGLE_CLIENT_ID!,
      client_secret: process.env.GOOGLE_CLIENT_SECRET!,
      grant_type: "refresh_token",
    }),
    "token refresh"
  );
}

export async function obtenerEmailConectado(accessToken: string): Promise<string> {
  const res = await fetch(USERINFO_URL, { headers: { Authorization: `Bearer ${accessToken}` } });
  if (!res.ok) throw new Error(`Google userinfo falló: ${res.status}`);
  const data = await res.json();
  return data.email as string;
}
```

- [ ] **Paso 4: Correr y verificar que pasan**

Run: `npx vitest run lib/gmail/oauth.test.ts`
Expected: PASS.

- [ ] **Paso 5: Commit**

```bash
git add lib/gmail/oauth.ts lib/gmail/oauth.test.ts
git commit -m "feat: OAuth de Google (authorize/exchange/refresh) sin SDK externo"
```

---

### Tarea 7: Gmail REST API (TDD con `fetch` mockeado)

**Files:**
- Create: `lib/gmail/gmailApi.ts`
- Test: `lib/gmail/gmailApi.test.ts`

**Interfaces:**
- Produces: `listarIdsMensajes(accessToken, query): Promise<string[]>`,
  `obtenerMensaje(accessToken, id): Promise<{id: string; payload?:
  ParteGmail}>`. Usado por la Tarea 8.

- [ ] **Paso 1: Escribir los tests (fallan primero)**

```typescript
import { describe, it, expect, vi, afterEach } from "vitest";
import { listarIdsMensajes, obtenerMensaje } from "./gmailApi";

afterEach(() => vi.unstubAllGlobals());

describe("listarIdsMensajes", () => {
  it("junta ids a través de varias páginas", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce({ ok: true, json: async () => ({ messages: [{ id: "a" }, { id: "b" }], nextPageToken: "p2" }) })
      .mockResolvedValueOnce({ ok: true, json: async () => ({ messages: [{ id: "c" }] }) });
    vi.stubGlobal("fetch", fetchMock);

    const ids = await listarIdsMensajes("token", "from:bancolombia");

    expect(ids).toEqual(["a", "b", "c"]);
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(String(fetchMock.mock.calls[1][0])).toContain("pageToken=p2");
  });

  it("devuelve lista vacía si no hay mensajes", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: true, json: async () => ({}) }));
    expect(await listarIdsMensajes("token", "q")).toEqual([]);
  });

  it("lanza error si Gmail responde con fallo", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: false, status: 401 }));
    await expect(listarIdsMensajes("token", "q")).rejects.toThrow();
  });
});

describe("obtenerMensaje", () => {
  it("pide el mensaje en formato full con Bearer token", async () => {
    const fetchMock = vi.fn().mockResolvedValue({ ok: true, json: async () => ({ id: "m1", payload: {} }) });
    vi.stubGlobal("fetch", fetchMock);

    const mensaje = await obtenerMensaje("token-xyz", "m1");

    expect(mensaje.id).toBe("m1");
    expect(String(fetchMock.mock.calls[0][0])).toContain("/messages/m1?format=full");
    expect(fetchMock.mock.calls[0][1].headers.Authorization).toBe("Bearer token-xyz");
  });
});
```

- [ ] **Paso 2: Correr y verificar que fallan**

Run: `npx vitest run lib/gmail/gmailApi.test.ts`
Expected: FAIL — `./gmailApi` no existe.

- [ ] **Paso 3: Implementar**

```typescript
const BASE = "https://gmail.googleapis.com/gmail/v1/users/me";

interface ParteGmail {
  mimeType?: string;
  body?: { data?: string };
  parts?: ParteGmail[];
}

export interface MensajeGmail {
  id: string;
  payload?: ParteGmail;
}

export async function listarIdsMensajes(accessToken: string, query: string): Promise<string[]> {
  const ids: string[] = [];
  let pageToken: string | undefined;
  do {
    const params = new URLSearchParams({ q: query, maxResults: "50" });
    if (pageToken) params.set("pageToken", pageToken);
    const res = await fetch(`${BASE}/messages?${params.toString()}`, {
      headers: { Authorization: `Bearer ${accessToken}` },
    });
    if (!res.ok) throw new Error(`Gmail list falló: ${res.status}`);
    const data: { messages?: { id: string }[]; nextPageToken?: string } = await res.json();
    for (const m of data.messages ?? []) ids.push(m.id);
    pageToken = data.nextPageToken;
  } while (pageToken);
  return ids;
}

export async function obtenerMensaje(accessToken: string, id: string): Promise<MensajeGmail> {
  const res = await fetch(`${BASE}/messages/${id}?format=full`, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  if (!res.ok) throw new Error(`Gmail get falló: ${res.status}`);
  return res.json();
}
```

- [ ] **Paso 4: Correr y verificar que pasan**

Run: `npx vitest run lib/gmail/gmailApi.test.ts`
Expected: PASS.

- [ ] **Paso 5: Commit**

```bash
git add lib/gmail/gmailApi.ts lib/gmail/gmailApi.test.ts
git commit -m "feat: cliente REST de Gmail (listar/obtener mensajes)"
```

---

### Tarea 8: Estado de conexión + orquestación del sync

**Files:**
- Create: `lib/gmail/status.ts`
- Create: `lib/gmail/sync.ts`
- Test: `lib/gmail/sync.test.ts` (solo para la función pura `calcularDesde`)

**Interfaces:**
- Consumes: `createAdminClient` (Tarea 4), `sinTipar` (Tarea 4),
  `refrescarToken` (Tarea 6), `listarIdsMensajes`/`obtenerMensaje` (Tarea 7),
  `extraerTextoPlano`/`parsearNotificacionLocal`/`parsearNotificacionConClaude`
  (Tarea 5).
- Produces: `EstadoConexionGmail` (`{conectado: boolean; emailConectado:
  string | null; estado: "activo"|"expirado"|"error"|null; ultimoSyncAt:
  string | null; ultimoError: string | null}`),
  `obtenerEstadoConexion(admin, userId): Promise<EstadoConexionGmail>`,
  `sincronizarGmail(admin, userId): Promise<{nuevos: number} | {error:
  string}>`. Usado por las Tareas 11, 12, 14.

- [ ] **Paso 1: `lib/gmail/status.ts`**

```typescript
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/types";

export interface EstadoConexionGmail {
  conectado: boolean;
  emailConectado: string | null;
  estado: "activo" | "expirado" | "error" | null;
  ultimoSyncAt: string | null;
  ultimoError: string | null;
}

export async function obtenerEstadoConexion(
  admin: SupabaseClient<Database>,
  userId: string
): Promise<EstadoConexionGmail> {
  const { data } = await admin
    .from("gmail_conexiones")
    .select("email_conectado, estado, ultimo_sync_at, ultimo_error")
    .eq("user_id", userId)
    .maybeSingle();

  if (!data) return { conectado: false, emailConectado: null, estado: null, ultimoSyncAt: null, ultimoError: null };

  return {
    conectado: true,
    emailConectado: data.email_conectado,
    estado: data.estado as EstadoConexionGmail["estado"],
    ultimoSyncAt: data.ultimo_sync_at,
    ultimoError: data.ultimo_error,
  };
}
```

- [ ] **Paso 2: Test de `calcularDesde` (función pura, fallan primero)**

```typescript
import { describe, it, expect } from "vitest";
import { calcularDesde } from "./sync";

describe("calcularDesde", () => {
  it("sin sync previo, resta los días de backfill desde ahora", () => {
    const ahora = new Date("2026-08-18T12:00:00.000Z");
    expect(calcularDesde(null, 30, ahora).toISOString()).toBe("2026-07-19T12:00:00.000Z");
  });

  it("con sync previo, usa esa fecha tal cual (ignora backfill)", () => {
    const ahora = new Date("2026-08-18T12:00:00.000Z");
    expect(calcularDesde("2026-08-10T08:00:00.000Z", 30, ahora).toISOString()).toBe("2026-08-10T08:00:00.000Z");
  });
});
```

Run: `npx vitest run lib/gmail/sync.test.ts`
Expected: FAIL — `./sync` no existe.

- [ ] **Paso 3: Implementar `lib/gmail/sync.ts`**

```typescript
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/types";
import { sinTipar } from "@/lib/supabase/queries";
import { refrescarToken } from "./oauth";
import { listarIdsMensajes, obtenerMensaje } from "./gmailApi";
import { extraerTextoPlano, parsearNotificacionConClaude, parsearNotificacionLocal } from "./parse";

const REMITENTE_BANCOLOMBIA = "alertasynotificaciones@bancolombia.com.co";
const DIAS_BACKFILL = 30;

/** Punto de corte para buscar correos: la última sync, o N días atrás si nunca ha sincronizado. */
export function calcularDesde(ultimoSyncAt: string | null, diasBackfill: number, ahora: Date = new Date()): Date {
  if (!ultimoSyncAt) return new Date(ahora.getTime() - diasBackfill * 24 * 60 * 60 * 1000);
  return new Date(ultimoSyncAt);
}

async function parsearNotificacion(texto: string) {
  return (await parsearNotificacionConClaude(texto)) ?? parsearNotificacionLocal(texto);
}

export async function sincronizarGmail(
  admin: SupabaseClient<Database>,
  userId: string
): Promise<{ nuevos: number } | { error: string }> {
  const { data: conexion } = await admin.from("gmail_conexiones").select("*").eq("user_id", userId).maybeSingle();
  if (!conexion) return { error: "sin_conexion" };

  let accessToken: string;
  try {
    accessToken = (await refrescarToken(conexion.refresh_token)).access_token;
  } catch {
    await sinTipar(admin)
      .from("gmail_conexiones")
      .update({ estado: "expirado", ultimo_error: "Token expirado, reconecta Gmail" })
      .eq("user_id", userId);
    return { error: "expirado" };
  }

  const { data: miembro } = await admin.from("cuenta_miembros").select("cuenta_id").eq("user_id", userId).maybeSingle();
  if (!miembro) return { error: "sin_cuenta" };

  const desde = calcularDesde(conexion.ultimo_sync_at, DIAS_BACKFILL);
  const query = `from:${REMITENTE_BANCOLOMBIA} after:${Math.floor(desde.getTime() / 1000)}`;

  try {
    const ids = await listarIdsMensajes(accessToken, query);
    let nuevos = 0;

    for (const id of ids) {
      const mensaje = await obtenerMensaje(accessToken, id);
      const texto = extraerTextoPlano(mensaje.payload);
      const detectado = await parsearNotificacion(texto);
      if (!detectado) continue;

      const { error } = await sinTipar(admin).from("gastos_pendientes").insert({
        cuenta_id: miembro.cuenta_id,
        creado_por: userId,
        gmail_message_id: id,
        fecha: detectado.fecha,
        monto: detectado.monto,
        categoria: detectado.categoria,
        nota: detectado.nota,
      });
      if (!error) nuevos++;
      // error.code === "23505" (unique(creado_por, gmail_message_id)) significa que ya
      // se había procesado este correo; cualquier otro error también se ignora para no
      // abortar el resto del sync por un solo mensaje problemático.
    }

    await sinTipar(admin)
      .from("gmail_conexiones")
      .update({ estado: "activo", ultimo_sync_at: new Date().toISOString(), ultimo_error: null })
      .eq("user_id", userId);

    return { nuevos };
  } catch (e) {
    await sinTipar(admin)
      .from("gmail_conexiones")
      .update({ estado: "error", ultimo_error: e instanceof Error ? e.message : "Error desconocido" })
      .eq("user_id", userId);
    return { error: "sync_fallo" };
  }
}
```

- [ ] **Paso 4: Correr y verificar que el test de `calcularDesde` pasa**

Run: `npx vitest run lib/gmail/sync.test.ts`
Expected: PASS.

El resto de `sincronizarGmail` (orquestación de red + base de datos) se
verifica manualmente en la Tarea 15 — no tiene test automatizado, igual
que `hooks/useGastos.ts` y `app/api/parse/route.ts` en el resto del
proyecto (glue code, no lógica pura).

- [ ] **Paso 5: Verificar tipos**

```bash
npx tsc --noEmit
```

- [ ] **Paso 6: Commit**

```bash
git add lib/gmail/status.ts lib/gmail/sync.ts lib/gmail/sync.test.ts
git commit -m "feat: orquestación de sincronización con Gmail"
```

---

### Tarea 9: Queries de Supabase para pendientes

**Files:**
- Modify: `lib/supabase/queries.ts`

**Interfaces:**
- Consumes: `GastoPendiente` (Tarea 3), `sinTipar` (Tarea 4),
  `confirmar_gasto_pendiente` (Tarea 2).
- Produces: `listarGastosPendientes(supabase)`,
  `actualizarGastoPendiente(supabase, id, {estado: "descartado"})`,
  `confirmarGastoPendiente(supabase, id, cambios)`. Usado por la Tarea 14.

- [ ] **Paso 1: Agregar al final del archivo**

```typescript
export async function listarGastosPendientes(supabase: Cliente): Promise<Resultado<GastoPendiente[]>> {
  const { data, error } = await supabase
    .from("gastos_pendientes")
    .select("*")
    .eq("estado", "pendiente")
    .order("fecha", { ascending: false });
  return { data: data as GastoPendiente[] | null, error };
}

export async function actualizarGastoPendiente(
  supabase: Cliente,
  id: string,
  cambios: { estado: "descartado" }
): Promise<{ error: PostgrestError | null }> {
  const { error } = await sinTipar(supabase).from("gastos_pendientes").update(cambios).eq("id", id);
  return { error };
}

export async function confirmarGastoPendiente(
  supabase: Cliente,
  id: string,
  cambios: { monto: number; categoria: string; nota: string; fecha: string }
): Promise<{ error: PostgrestError | null }> {
  const { error } = await sinTipar(supabase).rpc("confirmar_gasto_pendiente", {
    p_id: id,
    p_monto: cambios.monto,
    p_categoria: cambios.categoria,
    p_nota: cambios.nota,
    p_fecha: cambios.fecha,
  });
  return { error };
}
```

Y agregar `GastoPendiente` al import de tipos en la línea 2 del archivo.

- [ ] **Paso 2: Verificar**

```bash
npx tsc --noEmit
```

- [ ] **Paso 3: Commit**

```bash
git add lib/supabase/queries.ts
git commit -m "feat: queries para listar/confirmar/descartar gastos pendientes"
```

---

### Tarea 10: Rutas OAuth — conectar y callback

**Files:**
- Create: `app/api/gmail/oauth/start/route.ts`
- Create: `app/api/gmail/oauth/callback/route.ts`

**Interfaces:**
- Consumes: `createClient` (server, sesión del usuario),
  `construirUrlAutorizacion`/`intercambiarCodigo`/`obtenerEmailConectado`
  (Tarea 6), `createAdminClient`/`sinTipar` (Tarea 4), `sincronizarGmail`
  (Tarea 8).
- Produces: `GET /api/gmail/oauth/start` (redirige a Google),
  `GET /api/gmail/oauth/callback` (redirige a `/cuenta?gmail=conectado|error`).
  Usado por la Tarea 12 (botón "Conectar Gmail").

- [ ] **Paso 1: `app/api/gmail/oauth/start/route.ts`**

```typescript
import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { construirUrlAutorizacion } from "@/lib/gmail/oauth";

export const runtime = "nodejs";

export async function GET(request: Request) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.redirect(new URL("/login", request.url));

  const state = crypto.randomUUID();
  const redirectUri = new URL("/api/gmail/oauth/callback", request.url).toString();
  const response = NextResponse.redirect(construirUrlAutorizacion(redirectUri, state));
  response.cookies.set("gmail_oauth_state", state, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    maxAge: 600,
    path: "/",
  });
  return response;
}
```

- [ ] **Paso 2: `app/api/gmail/oauth/callback/route.ts`**

```typescript
import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { sinTipar } from "@/lib/supabase/queries";
import { intercambiarCodigo, obtenerEmailConectado } from "@/lib/gmail/oauth";
import { sincronizarGmail } from "@/lib/gmail/sync";

export const runtime = "nodejs";
export const maxDuration = 120;

function irACuenta(request: Request, estado: string) {
  const destino = new URL("/cuenta", request.url);
  destino.searchParams.set("gmail", estado);
  const respuesta = NextResponse.redirect(destino);
  respuesta.cookies.delete("gmail_oauth_state");
  return respuesta;
}

export async function GET(request: Request) {
  const url = new URL(request.url);
  const code = url.searchParams.get("code");
  const state = url.searchParams.get("state");

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.redirect(new URL("/login", request.url));

  const cookieGuardado = request.headers
    .get("cookie")
    ?.split(";")
    .map((c) => c.trim())
    .find((c) => c.startsWith("gmail_oauth_state="))
    ?.split("=")[1];

  if (!code || !state || !cookieGuardado || state !== cookieGuardado) return irACuenta(request, "error");

  try {
    const redirectUri = new URL("/api/gmail/oauth/callback", request.url).toString();
    const tokens = await intercambiarCodigo(code, redirectUri);
    if (!tokens.refresh_token) return irACuenta(request, "error");

    const email = await obtenerEmailConectado(tokens.access_token);
    const admin = createAdminClient();
    await sinTipar(admin)
      .from("gmail_conexiones")
      .upsert(
        { user_id: user.id, email_conectado: email, refresh_token: tokens.refresh_token, estado: "activo", ultimo_error: null },
        { onConflict: "user_id" }
      );

    await sincronizarGmail(admin, user.id);
    return irACuenta(request, "conectado");
  } catch {
    return irACuenta(request, "error");
  }
}
```

- [ ] **Paso 3: Verificar**

```bash
npx tsc --noEmit
```

La verificación funcional completa (contra Google real) se hace en la
Tarea 15, una vez existan las credenciales de la Tarea 1 y la sección de
Cuenta (Tarea 12) tenga el botón que apunta a `/api/gmail/oauth/start`.

- [ ] **Paso 4: Commit**

```bash
git add app/api/gmail/oauth
git commit -m "feat: rutas OAuth de Gmail (start/callback)"
```

---

### Tarea 11: Rutas de estado, sync manual y cron

**Files:**
- Create: `app/api/gmail/status/route.ts`
- Create: `app/api/gmail/sync/route.ts`
- Create: `app/api/gmail/sync-cron/route.ts`
- Create: `vercel.json`
- Modify: `.env.local.example` (nota: `CRON_SECRET` ya agregado en Tarea 1)

**Interfaces:**
- Consumes: `obtenerEstadoConexion` (Tarea 8), `sincronizarGmail` (Tarea 8),
  `createAdminClient` (Tarea 4).
- Produces: `GET /api/gmail/status`, `POST /api/gmail/sync`,
  `GET /api/gmail/sync-cron` (protegida por `CRON_SECRET`). Usado por las
  Tareas 13, 14 y por Vercel Cron en producción.

- [ ] **Paso 1: `app/api/gmail/status/route.ts`**

```typescript
import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { obtenerEstadoConexion } from "@/lib/gmail/status";

export const runtime = "nodejs";

export async function GET() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "No autenticado" }, { status: 401 });

  const estado = await obtenerEstadoConexion(createAdminClient(), user.id);
  return NextResponse.json(estado);
}
```

- [ ] **Paso 2: `app/api/gmail/sync/route.ts`**

```typescript
import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { sincronizarGmail } from "@/lib/gmail/sync";

export const runtime = "nodejs";
export const maxDuration = 120;

export async function POST() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "No autenticado" }, { status: 401 });

  const resultado = await sincronizarGmail(createAdminClient(), user.id);
  if ("error" in resultado) return NextResponse.json(resultado, { status: 400 });
  return NextResponse.json(resultado);
}
```

- [ ] **Paso 3: `app/api/gmail/sync-cron/route.ts`**

```typescript
import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { sincronizarGmail } from "@/lib/gmail/sync";

export const runtime = "nodejs";
export const maxDuration = 300;

export async function GET(request: Request) {
  const auth = request.headers.get("authorization");
  if (auth !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: "No autorizado" }, { status: 401 });
  }

  const admin = createAdminClient();
  const { data: conexiones } = await admin.from("gmail_conexiones").select("user_id").eq("estado", "activo");

  const resultados = await Promise.all((conexiones ?? []).map((c) => sincronizarGmail(admin, c.user_id)));
  return NextResponse.json({ procesadas: resultados.length });
}
```

- [ ] **Paso 4: `vercel.json`** (nuevo archivo en la raíz)

```json
{
  "crons": [{ "path": "/api/gmail/sync-cron", "schedule": "0 11 * * *" }]
}
```

11:00 UTC ≈ 6:00 a.m. en Bogotá (UTC-5) — corre una vez al día como
respaldo silencioso; el mecanismo principal es el botón "Sincronizar
ahora" (ver Tarea 14). El plan gratuito de Vercel solo permite 1
ejecución/día, así que no tiene sentido pedir más frecuencia aquí.

- [ ] **Paso 5: Verificar**

```bash
npx tsc --noEmit
```

Confirma manualmente que `vercel.json` es JSON válido:

```bash
node -e "JSON.parse(require('fs').readFileSync('vercel.json', 'utf-8')); console.log('ok')"
```

Expected: `ok`.

- [ ] **Paso 6: Commit**

```bash
git add app/api/gmail/status app/api/gmail/sync app/api/gmail/sync-cron vercel.json
git commit -m "feat: rutas de estado, sync manual y cron diario de Gmail"
```

---

### Tarea 12: Pantalla Cuenta — sección Gmail

**Files:**
- Modify: `app/(app)/cuenta/page.tsx`
- Modify: `components/cuenta/CuentaClient.tsx`

**Interfaces:**
- Consumes: `obtenerEstadoConexion` (Tarea 8), `createAdminClient` (Tarea
  4), `EstadoConexionGmail` (Tarea 8).

- [ ] **Paso 1: `app/(app)/cuenta/page.tsx`** — agregar el fetch de estado

```typescript
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { listarMiembros, obtenerCuenta } from "@/lib/supabase/queries";
import { obtenerEstadoConexion } from "@/lib/gmail/status";
import { CuentaClient } from "@/components/cuenta/CuentaClient";

export default async function CuentaPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const [miembrosRes, cuentaRes, estadoConexionGmail] = await Promise.all([
    listarMiembros(supabase),
    obtenerCuenta(supabase),
    obtenerEstadoConexion(createAdminClient(), user.id),
  ]);

  const lecturaFallida = Boolean(miembrosRes.error || cuentaRes.error);

  return (
    <CuentaClient
      userId={user.id}
      miembros={lecturaFallida ? [] : miembrosRes.data ?? []}
      cuenta={lecturaFallida ? null : cuentaRes.data}
      lecturaFallida={lecturaFallida}
      estadoConexionGmail={estadoConexionGmail}
    />
  );
}
```

- [ ] **Paso 2: `components/cuenta/CuentaClient.tsx`** — nueva prop, toast
por query param, y sección "Gmail"

Agregar el import de `EstadoConexionGmail`, `useEffect` y `useSearchParams`:

```typescript
import { useEffect, useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
```

y `import type { EstadoConexionGmail } from "@/lib/gmail/status";` junto a
los demás imports de tipos.

Cambiar la firma de la función a:

```typescript
export function CuentaClient({
  userId,
  miembros,
  cuenta,
  lecturaFallida,
  estadoConexionGmail,
}: {
  userId: string;
  miembros: Miembro[];
  cuenta: Cuenta | null;
  lecturaFallida: boolean;
  estadoConexionGmail: EstadoConexionGmail;
}) {
```

Dentro del cuerpo, después de `const { mensaje, mostrar } = useToast();`,
agregar:

```typescript
  const searchParams = useSearchParams();
  useEffect(() => {
    const gmail = searchParams.get("gmail");
    if (gmail === "conectado") mostrar("Gmail conectado");
    if (gmail === "error") mostrar("No se pudo conectar Gmail, intenta de nuevo");
  }, [searchParams, mostrar]);
```

Y agregar esta sección nueva justo antes de la sección "Unirse" (antes del
`{/* Unirse */}`):

```tsx
      {/* Gmail */}
      <section className="bg-surface border border-line rounded-2xl px-4 py-4 mb-3">
        <div className="text-[11px] tracking-wider uppercase text-muted font-semibold mb-2">Gmail</div>
        {estadoConexionGmail.conectado ? (
          <>
            <p className="text-[13px] text-ink mb-1">
              Conectado como <strong>{estadoConexionGmail.emailConectado}</strong>
            </p>
            {estadoConexionGmail.estado === "expirado" ? (
              <p className="text-[13px] text-alerta mb-2.5">Tu conexión expiró, reconéctala.</p>
            ) : (
              <p className="text-[13px] text-muted mb-2.5">Revisa los gastos detectados en la pestaña Pendientes.</p>
            )}
            <a href="/api/gmail/oauth/start">
              <Button className="!flex-none px-4">
                {estadoConexionGmail.estado === "expirado" ? "Reconectar Gmail" : "Reconectar"}
              </Button>
            </a>
          </>
        ) : (
          <>
            <p className="text-[13px] text-muted mb-2.5 leading-relaxed">
              Conecta tu Gmail para detectar automáticamente tus compras con tarjeta de crédito de Bancolombia. Los
              gastos detectados quedan en una bandeja de revisión — nada se guarda sin que lo confirmes.
            </p>
            <a href="/api/gmail/oauth/start">
              <Button variant="primary" className="!flex-none px-4">
                Conectar Gmail
              </Button>
            </a>
          </>
        )}
      </section>
```

- [ ] **Paso 3: Verificar**

```bash
npx tsc --noEmit
```

- [ ] **Paso 4: Commit**

```bash
git add "app/(app)/cuenta/page.tsx" components/cuenta/CuentaClient.tsx
git commit -m "feat: sección Gmail en la pantalla Cuenta"
```

---

### Tarea 13: Pestaña "Pendientes" con badge

**Files:**
- Modify: `components/NavTabs.tsx`
- Modify: `app/(app)/layout.tsx`

**Interfaces:**
- Consumes: `listarGastosPendientes` (Tarea 9).
- Produces: `NavTabs({pendientesCount})`, link a `/pendientes`.

- [ ] **Paso 1: `components/NavTabs.tsx`**

```typescript
"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const TABS = [
  { href: "/registro", label: "Registro" },
  { href: "/pendientes", label: "Pendientes" },
  { href: "/historial", label: "Historial" },
  { href: "/cuenta", label: "Cuenta" },
] as const;

export function NavTabs({ pendientesCount = 0 }: { pendientesCount?: number }) {
  const pathname = usePathname();

  return (
    <div className="flex items-center gap-2 mb-4">
      <div className="flex gap-1 bg-[#E4DFEC] p-[3px] rounded-xl flex-1">
        {TABS.map((t) => {
          const activo = pathname.startsWith(t.href);
          return (
            <Link
              key={t.href}
              href={t.href}
              className={`flex-1 text-center py-2 rounded-lg text-sm ${
                activo ? "bg-surface text-ink font-semibold shadow-sm" : "text-muted"
              }`}
            >
              {t.label}
              {t.href === "/pendientes" && pendientesCount > 0 && (
                <span className="ml-1 inline-block bg-alerta text-white text-[10px] rounded-full px-1.5 leading-4 align-middle">
                  {pendientesCount}
                </span>
              )}
            </Link>
          );
        })}
      </div>
      <form action="/auth/signout" method="post">
        <button
          type="submit"
          className="w-9 h-9 rounded-lg border border-line bg-surface text-muted text-sm"
          aria-label="Cerrar sesión"
          title="Cerrar sesión"
        >
          ⏻
        </button>
      </form>
    </div>
  );
}
```

- [ ] **Paso 2: `app/(app)/layout.tsx`** — layout async que cuenta pendientes

```typescript
import { NavTabs } from "@/components/NavTabs";
import { createClient } from "@/lib/supabase/server";
import { listarGastosPendientes } from "@/lib/supabase/queries";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const pendientesCount = user ? (await listarGastosPendientes(supabase)).data?.length ?? 0 : 0;

  return (
    <main className="min-h-screen">
      <div className="max-w-xl mx-auto px-4 pt-4 pb-24">
        <NavTabs pendientesCount={pendientesCount} />
        {children}
      </div>
    </main>
  );
}
```

- [ ] **Paso 3: Verificar**

```bash
npx tsc --noEmit
```

- [ ] **Paso 4: Commit**

```bash
git add components/NavTabs.tsx "app/(app)/layout.tsx"
git commit -m "feat: pestaña Pendientes con badge de conteo"
```

---

### Tarea 14: Pantalla Pendientes

**Files:**
- Create: `app/(app)/pendientes/page.tsx`
- Create: `components/pendientes/PendientesClient.tsx`
- Create: `components/pendientes/TarjetaPendiente.tsx`

**Interfaces:**
- Consumes: `listarGastosPendientes`, `actualizarGastoPendiente`,
  `confirmarGastoPendiente` (Tarea 9), `obtenerEstadoConexion` (Tarea 8),
  `listarCategorias` (existente).

- [ ] **Paso 1: `app/(app)/pendientes/page.tsx`**

```typescript
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { listarGastosPendientes, listarCategorias } from "@/lib/supabase/queries";
import { obtenerEstadoConexion } from "@/lib/gmail/status";
import { PendientesClient } from "@/components/pendientes/PendientesClient";

export default async function PendientesPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const [pendientesRes, categoriasRes, estadoConexion] = await Promise.all([
    listarGastosPendientes(supabase),
    listarCategorias(supabase),
    obtenerEstadoConexion(createAdminClient(), user.id),
  ]);

  const lecturaFallida = Boolean(pendientesRes.error || categoriasRes.error);

  return (
    <PendientesClient
      pendientesIniciales={lecturaFallida ? [] : pendientesRes.data ?? []}
      categorias={lecturaFallida ? [] : categoriasRes.data ?? []}
      estadoConexion={estadoConexion}
      lecturaFallida={lecturaFallida}
    />
  );
}
```

- [ ] **Paso 2: `components/pendientes/TarjetaPendiente.tsx`**

```tsx
"use client";

import { useState } from "react";
import { Button } from "@/components/ui/Button";
import type { Category, GastoPendiente } from "@/lib/types";

export function TarjetaPendiente({
  pendiente,
  categorias,
  onConfirmar,
  onDescartar,
}: {
  pendiente: GastoPendiente;
  categorias: Category[];
  onConfirmar: (cambios: { monto: number; categoria: string; nota: string; fecha: string }) => void;
  onDescartar: () => void;
}) {
  const [monto, setMonto] = useState(String(pendiente.monto));
  const [categoria, setCategoria] = useState(pendiente.categoria);
  const [nota, setNota] = useState(pendiente.nota);
  const [fecha, setFecha] = useState(pendiente.fecha);

  const confirmar = () => {
    const m = parseInt(monto.replace(/\D/g, ""), 10);
    if (!(m > 0)) return;
    onConfirmar({ monto: m, categoria, nota: nota.trim(), fecha });
  };

  return (
    <div className="bg-surface border border-line rounded-2xl px-4 py-3.5 mb-2.5">
      <div className="flex gap-2 mb-2">
        <input
          value={nota}
          onChange={(e) => setNota(e.target.value)}
          className="flex-1 min-w-0 border border-line rounded-lg px-2.5 py-2 text-sm text-ink"
        />
        <input
          inputMode="numeric"
          value={monto}
          onChange={(e) => setMonto(e.target.value.replace(/\D/g, ""))}
          className="w-28 border border-line rounded-lg px-2.5 py-2 text-sm num text-ink"
        />
      </div>
      <div className="flex gap-2 mb-2.5">
        <select
          value={categoria}
          onChange={(e) => setCategoria(e.target.value)}
          className="flex-1 border border-line rounded-lg px-2.5 py-2 text-sm text-ink bg-surface"
        >
          {categorias.map((c) => (
            <option key={c.id} value={c.id}>
              {c.nombre}
            </option>
          ))}
        </select>
        <input
          type="date"
          value={fecha}
          onChange={(e) => setFecha(e.target.value)}
          className="border border-line rounded-lg px-2.5 py-2 text-sm text-ink"
        />
      </div>
      <div className="flex gap-2">
        <Button onClick={onDescartar}>Descartar</Button>
        <Button variant="primary" onClick={confirmar}>
          Confirmar
        </Button>
      </div>
    </div>
  );
}
```

- [ ] **Paso 3: `components/pendientes/PendientesClient.tsx`**

```tsx
"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { actualizarGastoPendiente, confirmarGastoPendiente } from "@/lib/supabase/queries";
import { useToast } from "@/hooks/useToast";
import { Button } from "@/components/ui/Button";
import { Banner } from "@/components/ui/Banner";
import { Toast } from "@/components/ui/Toast";
import { TarjetaPendiente } from "./TarjetaPendiente";
import type { Category, GastoPendiente } from "@/lib/types";
import type { EstadoConexionGmail } from "@/lib/gmail/status";

export function PendientesClient({
  pendientesIniciales,
  categorias,
  estadoConexion,
  lecturaFallida,
}: {
  pendientesIniciales: GastoPendiente[];
  categorias: Category[];
  estadoConexion: EstadoConexionGmail;
  lecturaFallida: boolean;
}) {
  const supabase = useMemo(() => createClient(), []);
  const router = useRouter();
  const { mensaje, mostrar } = useToast();
  const [pendientes, setPendientes] = useState(pendientesIniciales);
  const [sincronizando, setSincronizando] = useState(false);

  const sincronizar = async () => {
    if (sincronizando) return;
    setSincronizando(true);
    try {
      const res = await fetch("/api/gmail/sync", { method: "POST" });
      if (!res.ok) throw new Error();
      const data: { nuevos: number } = await res.json();
      mostrar(data.nuevos > 0 ? `${data.nuevos} gasto(s) nuevo(s)` : "Sin novedades");
      router.refresh();
    } catch {
      mostrar("No se pudo sincronizar");
    } finally {
      setSincronizando(false);
    }
  };

  const confirmar = async (p: GastoPendiente, cambios: { monto: number; categoria: string; nota: string; fecha: string }) => {
    setPendientes((prev) => prev.filter((x) => x.id !== p.id));
    const { error } = await confirmarGastoPendiente(supabase, p.id, cambios);
    if (error) {
      setPendientes((prev) => [p, ...prev]);
      mostrar("No se pudo confirmar");
      return;
    }
    mostrar("Gasto confirmado");
    router.refresh();
  };

  const descartar = async (p: GastoPendiente) => {
    setPendientes((prev) => prev.filter((x) => x.id !== p.id));
    const { error } = await actualizarGastoPendiente(supabase, p.id, { estado: "descartado" });
    if (error) {
      setPendientes((prev) => [p, ...prev]);
      mostrar("No se pudo descartar");
    }
  };

  if (lecturaFallida) {
    return (
      <Banner accion={{ etiqueta: "Reintentar", onClick: () => router.refresh() }}>
        No pude leer los pendientes. Intenta de nuevo.
      </Banner>
    );
  }

  return (
    <>
      <div className="mb-4">
        <div className="text-[11px] tracking-wider uppercase text-muted font-semibold">Gmail</div>
        <h1 className="text-2xl font-extrabold text-ink">Pendientes</h1>
        <p className="text-xs text-muted mt-0.5">Gastos detectados en tu correo — revisa y confirma.</p>
      </div>

      {!estadoConexion.conectado && <Banner>Todavía no conectas tu Gmail. Ve a Cuenta para conectarlo.</Banner>}

      {estadoConexion.conectado && estadoConexion.estado === "expirado" && (
        <Banner accion={{ etiqueta: "Reconectar", onClick: () => (window.location.href = "/api/gmail/oauth/start") }}>
          Tu conexión a Gmail expiró. Reconéctala para seguir detectando gastos.
        </Banner>
      )}

      {estadoConexion.conectado && (
        <div className="flex items-center justify-between gap-2 bg-surface border border-line rounded-2xl px-4 py-3 mb-3">
          <div className="text-[13px] text-muted">
            {estadoConexion.emailConectado}
            <br />
            {estadoConexion.ultimoSyncAt
              ? `Última sync: ${new Date(estadoConexion.ultimoSyncAt).toLocaleString("es-CO")}`
              : "Todavía no sincroniza"}
          </div>
          <Button className="!flex-none px-4" onClick={sincronizar} disabled={sincronizando}>
            {sincronizando ? "…" : "Sincronizar ahora"}
          </Button>
        </div>
      )}

      {pendientes.length === 0 ? (
        <div className="bg-surface border border-dashed border-line rounded-2xl px-4.5 py-6.5 text-center text-muted text-sm leading-relaxed">
          Nada pendiente por revisar.
        </div>
      ) : (
        pendientes.map((p) => (
          <TarjetaPendiente
            key={p.id}
            pendiente={p}
            categorias={categorias}
            onConfirmar={(cambios) => confirmar(p, cambios)}
            onDescartar={() => descartar(p)}
          />
        ))
      )}

      <Toast mensaje={mensaje} />
    </>
  );
}
```

- [ ] **Paso 4: Verificar**

```bash
npx tsc --noEmit && npm run lint
```

- [ ] **Paso 5: Commit**

```bash
git add "app/(app)/pendientes" components/pendientes
git commit -m "feat: pantalla Pendientes — revisar y confirmar gastos de Gmail"
```

---

### Tarea 15: Verificación end-to-end manual + build

**Files:** ninguno (solo verificación)

**Interfaces:** ninguna nueva — ejercita todo lo construido en las Tareas
1-14.

- [ ] **Paso 1: Build completo**

```bash
npm run build && npm test
```

Expected: build sin errores, todos los tests (`lib/**/*.test.ts`,
incluyendo los nuevos de `lib/gmail/`) en verde.

- [ ] **Paso 2: Checklist manual en el navegador** (requiere que la Tarea 1
esté completa: `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, `CRON_SECRET` en
`.env.local`)

```bash
npm run dev
```

1. Inicia sesión, ve a `/cuenta`, click **Conectar Gmail** → completa el
   consentimiento de Google (tu correo debe estar en la lista de usuarios
   de prueba) → deberías volver a `/cuenta` con el toast "Gmail conectado"
   y ver tu email conectado en la sección Gmail.
2. Ve a `/pendientes` → click **Sincronizar ahora** → confirma que
   aparece al menos la notificación de "Factura Programada CLARO" (o
   cualquier otra de los últimos 30 días) como tarjeta editable.
3. Edita la categoría de una tarjeta y click **Confirmar** → ve a
   `/registro` y confirma que el gasto aparece ahí con el monto/fecha
   correctos.
4. En otra tarjeta, click **Descartar** → confirma que desaparece de
   `/pendientes` y que **no** aparece en `/registro`.
5. Confirma que el badge de la pestaña "Pendientes" en `NavTabs` refleja
   el conteo correcto tras refrescar la página.

- [ ] **Paso 3: Deploy**

Sigue el flujo normal del proyecto (push a la rama, Vercel auto-despliega
por estar git-connected). Antes de mergear a `main`:

- Agrega `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, `CRON_SECRET` como
  variables de entorno en Vercel (Production/Preview/Development).
- Confirma en Google Cloud Console que la URI de redirección de
  producción (`https://<tu-dominio>.vercel.app/api/gmail/oauth/callback`)
  está en la lista de URIs autorizadas.
- Después del deploy, en el dashboard de Vercel → pestaña **Cron Jobs**,
  confirma que `/api/gmail/sync-cron` aparece registrado con el schedule
  `0 11 * * *`.

- [ ] **Paso 4: Commit final (si hubo ajustes durante la verificación)**

```bash
git add -A
git commit -m "chore: ajustes de verificación end-to-end de la integración con Gmail"
```
