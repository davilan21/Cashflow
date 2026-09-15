# Plan mensual — plan de implementación

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Una pestaña **Plan** que cruza ingresos y gastos fijos recurrentes con la factura de tarjeta de cada ciclo para mostrar el ahorro de cada mes y el acumulado hacia adelante, con montos editables mes a mes.

**Architecture:** Dos tablas nuevas (`plan_rubros`, `plan_ajustes`) con RLS por `mi_cuenta()`; toda la lógica en funciones puras en `lib/plan/` probadas con Vitest; una pantalla `/plan` server-rendered que delega en `PlanClient` con mutaciones optimistas que se revierten si Supabase falla. El módulo de tarjeta solo se **lee** (`expenses`); ningún `alter table` sobre tablas existentes.

**Tech Stack:** Next.js 15 App Router, React 19, TypeScript, Tailwind, Supabase (Postgres 15+, RLS), Recharts, Vitest.

**Spec:** `docs/superpowers/specs/2026-09-14-plan-mensual-design.md`

## Global Constraints

- Migración **`0011_plan_mensual.sql`**, tablas con prefijo **`plan_`**. Producción ya tiene `flujo_*` (`0005`, `0006`) de otra rama; la numeración se elige para no colisionar.
- **Cero `alter table` sobre tablas existentes** en la migración.
- Archivos existentes que se modifican: `components/NavTabs.tsx` (una entrada), `lib/types.ts` (tipos nuevos), `components/ui/Banner.tsx` (prop `tono`), `app/globals.css` (keyframes de la hoja). Nada más.
- Fechas siempre como strings `YYYY-MM-DD` / `YYYY-MM`; nunca `new Date()` sin zona en lógica pura. Tests con fechas fijas, nunca `hoyISO()`.
- Todo texto de UI en español. Dinero con `pesos()` / `pesosCorto()` de `lib/money.ts`. Cifras con clase `num`.
- Tokens de color existentes (`bg`, `surface`, `ink`, `muted`, `line`, `ok`, `alerta`, `aviso`). Sin paleta nueva.
- Touch targets ≥ 44px, `gap-2` mínimo entre botones, íconos SVG inline (no emojis), `focus-visible:ring-2 ring-ink/40`, `cursor-pointer` en todo lo clickeable.
- Toda mutación: optimista → si `error`, revertir + toast. Ningún `catch` vacío; las queries devuelven `{ data, error }`.
- Commits en Conventional Commits, terminados en `Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>`.
- Supabase prod: ref `jwipheuvrhqlgivmxvur`, PAT en `~/.config/surtijapon/supabase_pat`. El proyecto Free se pausa tras ~7 días; si la API devuelve que está pausado, `POST /v1/projects/{ref}/restore` y esperar `ACTIVE_HEALTHY`.

---

## Mapa de archivos

| Archivo | Responsabilidad |
|---|---|
| `supabase/migrations/0011_plan_mensual.sql` | Tablas, índices, triggers reutilizados, RLS |
| `lib/types.ts` (modificar) | `PlanRubro`, `PlanAjuste`, `NuevoRubro`, entradas en `Database` |
| `lib/plan/formato.ts` | Miles en vivo para el input de plata |
| `lib/plan/etiquetas.ts` | "Septiembre 2026", "sep 26", texto de vigencia, texto de origen |
| `lib/plan/calculo.ts` | Rango, vigencia, ajustes, TC por estado del ciclo, ahorro, acumulado |
| `lib/plan/queries.ts` | CRUD de rubros y ajustes contra Supabase |
| `components/ui/Sheet.tsx` | Hoja desde abajo (primitivo nuevo) |
| `components/ui/Banner.tsx` (modificar) | Variante `tono="info"` |
| `app/(app)/plan/page.tsx` | Carga en servidor → `PlanClient` |
| `components/plan/PlanClient.tsx` | Estado, `calcularPlan`, mutaciones optimistas, toasts |
| `components/plan/SubTabs.tsx` | Segmentado Meses / Rubros |
| `components/plan/ResumenMes.tsx` | Tarjeta del mes en curso |
| `components/plan/GraficaAhorro.tsx` | Barras de ahorro por mes |
| `components/plan/ListaMeses.tsx` + `DetalleMes.tsx` | Acordeón y desglose |
| `components/plan/AjusteSheet.tsx` | Editar un monto en un mes |
| `components/plan/RubrosPanel.tsx` + `RubroSheet.tsx` | Gestión de rubros |
| `components/plan/Iconos.tsx` | Chevron, lápiz, más (SVG) |
| `components/NavTabs.tsx` (modificar) | Entrada `Plan` |

---

### Task 1: Migración `0011_plan_mensual.sql`, aplicada y verificada en producción

**Files:**
- Create: `supabase/migrations/0011_plan_mensual.sql`

**Interfaces:**
- Produces: tablas `plan_rubros(id, cuenta_id, tipo, nombre, monto_default, desde, hasta, orden, created_by, created_at, updated_at)` y `plan_ajustes(id, cuenta_id, mes, rubro_id, monto, updated_at)` con unique `nulls not distinct (cuenta_id, mes, rubro_id)`.

- [ ] **Step 1: Confirmar que no existe nada con prefijo `plan_` en prod y que PG ≥ 15**

```bash
PAT=$(cat ~/.config/surtijapon/supabase_pat)
REF=jwipheuvrhqlgivmxvur
curl -s -X POST "https://api.supabase.com/v1/projects/$REF/database/query" \
  -H "Authorization: Bearer $PAT" -H "Content-Type: application/json" \
  -d '{"query":"select version(); select tablename from pg_tables where schemaname = '"'"'public'"'"' and tablename like '"'"'plan_%'"'"';"}'
```

Expected: `PostgreSQL 15` o mayor; la segunda consulta devuelve `[]`. Si la respuesta es un error de proyecto pausado, correr `curl -s -X POST "https://api.supabase.com/v1/projects/$REF/restore" -H "Authorization: Bearer $PAT"` y consultar `GET /v1/projects/$REF` hasta que `status` sea `ACTIVE_HEALTHY`.

Si aparece alguna tabla `plan_*`, **parar** y reportar: alguien ya ocupó el prefijo.

- [ ] **Step 2: Escribir la migración**

```sql
-- Cashflow: plan mensual — ingresos y gastos fijos recurrentes, ajustes por
-- mes y el estimado de tarjeta editable. Módulo aislado: solo LEE expenses.
--
-- Invariante: esta migración no contiene ningún `alter table` sobre una
-- tabla existente. Solo `create`.

create table plan_rubros (
  id            uuid primary key default gen_random_uuid(),
  cuenta_id     uuid not null references cuentas(id) on delete cascade,
  tipo          text not null check (tipo in ('ingreso', 'fijo')),
  nombre        text not null check (length(trim(nombre)) > 0),
  -- >= 0 (no > 0 como expenses): un rubro puede quedar en cero sin borrarse.
  monto_default bigint not null check (monto_default >= 0),
  -- Vigencia como 'YYYY-MM' (mismo formato que lib/ciclo.ts). Se compara
  -- como texto; el check impide un '2026-9'.
  desde         text not null check (desde ~ '^\d{4}-(0[1-9]|1[0-2])$'),
  hasta         text check (hasta is null or (hasta ~ '^\d{4}-(0[1-9]|1[0-2])$' and hasta >= desde)),
  orden         int not null default 0,
  created_by    uuid references auth.users(id) on delete set null,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);

create index plan_rubros_cuenta_idx on plan_rubros (cuenta_id, tipo, orden);

create table plan_ajustes (
  id         uuid primary key default gen_random_uuid(),
  cuenta_id  uuid not null references cuentas(id) on delete cascade,
  mes        text not null check (mes ~ '^\d{4}-(0[1-9]|1[0-2])$'),
  -- null = el estimado de tarjeta de ese mes.
  rubro_id   uuid references plan_rubros(id) on delete cascade,
  monto      bigint not null check (monto >= 0),
  updated_at timestamptz not null default now(),
  -- Sin `nulls not distinct` Postgres permitiría N filas de TC (rubro_id
  -- null) para el mismo mes. Requiere PG >= 15.
  unique nulls not distinct (cuenta_id, mes, rubro_id)
);

-- Triggers existentes, reutilizados (definidos en 0001 y 0003).
create trigger plan_rubros_set_created_by
  before insert on plan_rubros
  for each row execute function set_created_by();

create trigger plan_rubros_set_updated_at
  before update on plan_rubros
  for each row execute function set_updated_at();

create trigger plan_ajustes_set_updated_at
  before update on plan_ajustes
  for each row execute function set_updated_at();

-- RLS: CRUD completo para miembros de la cuenta, igual que expenses_rw.
alter table plan_rubros  enable row level security;
alter table plan_ajustes enable row level security;

create policy "plan_rubros_rw" on plan_rubros
  for all using (cuenta_id = mi_cuenta()) with check (cuenta_id = mi_cuenta());

create policy "plan_ajustes_rw" on plan_ajustes
  for all using (cuenta_id = mi_cuenta()) with check (cuenta_id = mi_cuenta());
```

- [ ] **Step 3: Verificar el invariante de aislamiento**

```bash
grep -n -i "alter table" supabase/migrations/0011_plan_mensual.sql
```

Expected: solo las dos líneas `alter table plan_... enable row level security`. Ninguna sobre otra tabla.

- [ ] **Step 4: Aplicar en producción**

```bash
PAT=$(cat ~/.config/surtijapon/supabase_pat)
REF=jwipheuvrhqlgivmxvur
python3 -c 'import json,sys; print(json.dumps({"query": open("supabase/migrations/0011_plan_mensual.sql").read()}))' > /tmp/q.json
curl -s -X POST "https://api.supabase.com/v1/projects/$REF/database/query" \
  -H "Authorization: Bearer $PAT" -H "Content-Type: application/json" -d @/tmp/q.json
```

Expected: `[]` (sin error). Si devuelve `{"message": ...}`, leer el mensaje; no reintentar a ciegas.

- [ ] **Step 5: Verificar el EFECTO, no el mensaje**

```bash
curl -s -X POST "https://api.supabase.com/v1/projects/$REF/database/query" \
  -H "Authorization: Bearer $PAT" -H "Content-Type: application/json" \
  -d '{"query":"select table_name, column_name, data_type from information_schema.columns where table_name in ('"'"'plan_rubros'"'"','"'"'plan_ajustes'"'"') order by table_name, ordinal_position; select tablename, policyname, cmd from pg_policies where tablename like '"'"'plan_%'"'"'; select indexdef from pg_indexes where tablename = '"'"'plan_ajustes'"'"'; select tgname from pg_trigger where tgrelid in ('"'"'plan_rubros'"'"'::regclass, '"'"'plan_ajustes'"'"'::regclass) and not tgisinternal;"}'
```

Expected: 11 columnas en `plan_rubros`, 6 en `plan_ajustes`; políticas `plan_rubros_rw` y `plan_ajustes_rw` con `cmd = ALL`; un índice con `NULLS NOT DISTINCT`; tres triggers `plan_*_set_*`.

- [ ] **Step 6: Probar RLS con un caso que DEBE pasar y uno que NO**

Primero obtener un miembro real:

```bash
curl -s -X POST "https://api.supabase.com/v1/projects/$REF/database/query" \
  -H "Authorization: Bearer $PAT" -H "Content-Type: application/json" \
  -d '{"query":"select cuenta_id, user_id from cuenta_miembros limit 1;"}'
```

Caso positivo (reemplazar `<CUENTA>` y `<USER>`; termina en `rollback`, no deja datos):

```sql
begin;
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"<USER>","role":"authenticated"}', true);
insert into plan_rubros (cuenta_id, tipo, nombre, monto_default, desde)
  values ('<CUENTA>', 'ingreso', 'prueba rls', 1, '2026-09') returning id, created_by;
select count(*) from plan_rubros where nombre = 'prueba rls';
rollback;
```

Expected: `returning` devuelve una fila con `created_by = <USER>` (el trigger lo fijó); `count = 1`.

Caso negativo (mismo `<CUENTA>`, `sub` inventado):

```sql
begin;
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-000000000001","role":"authenticated"}', true);
insert into plan_rubros (cuenta_id, tipo, nombre, monto_default, desde)
  values ('<CUENTA>', 'ingreso', 'intruso', 1, '2026-09');
rollback;
```

Expected: error `42501 new row violates row-level security policy`. **Si el insert pasa, la política está mal: parar.**

Unicidad de TC (`rubro_id null`) — dentro de una sola transacción con `rollback`, como rol `postgres`:

```sql
begin;
insert into plan_ajustes (cuenta_id, mes, rubro_id, monto) values ('<CUENTA>', '2026-10', null, 1);
insert into plan_ajustes (cuenta_id, mes, rubro_id, monto) values ('<CUENTA>', '2026-10', null, 2);
rollback;
```

Expected: el segundo insert falla con `23505`.

- [ ] **Step 7: Commit**

```bash
git add supabase/migrations/0011_plan_mensual.sql
git commit -m "feat(db): tablas plan_rubros y plan_ajustes con RLS para el plan mensual

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

### Task 2: Tipos

**Files:**
- Modify: `lib/types.ts`

**Interfaces:**
- Produces: `PlanRubro`, `PlanAjuste`, `NuevoRubro`, `TipoRubro`; `Database.public.Tables.plan_rubros` y `.plan_ajustes`.

- [ ] **Step 1: Agregar los tipos de fila**

Después de `GastoPendiente` en `lib/types.ts`:

```ts
export type TipoRubro = "ingreso" | "fijo";

/** Una fuente de ingreso o un gasto fijo recurrente del plan mensual. */
export interface PlanRubro {
  id: string;
  cuenta_id: string;
  tipo: TipoRubro;
  nombre: string;
  monto_default: number;
  desde: string; // 'YYYY-MM'
  hasta: string | null; // 'YYYY-MM' o null = sin fin
  orden: number;
  created_by: string | null;
  created_at: string;
  updated_at: string;
}

/** Lo que el usuario define al crear/editar un rubro. */
export interface NuevoRubro {
  tipo: TipoRubro;
  nombre: string;
  monto_default: number;
  desde: string;
  hasta: string | null;
}

/** Un monto sobreescrito para un mes. rubro_id null = el estimado de tarjeta. */
export interface PlanAjuste {
  id: string;
  cuenta_id: string;
  mes: string; // 'YYYY-MM'
  rubro_id: string | null;
  monto: number;
  updated_at: string;
}
```

- [ ] **Step 2: Agregar las tablas a `Database`**

Dentro de `Tables`, después de `gastos_pendientes`:

```ts
      plan_rubros: {
        Row: PlanRubro;
        Insert: {
          id?: string;
          cuenta_id: string;
          tipo: string;
          nombre: string;
          monto_default: number;
          desde: string;
          hasta?: string | null;
          orden?: number;
          created_by?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          tipo?: string;
          nombre?: string;
          monto_default?: number;
          desde?: string;
          hasta?: string | null;
          orden?: number;
          updated_at?: string;
        };
        Relationships: [];
      };
      plan_ajustes: {
        Row: PlanAjuste;
        Insert: {
          id?: string;
          cuenta_id: string;
          mes: string;
          rubro_id?: string | null;
          monto: number;
          updated_at?: string;
        };
        Update: {
          monto?: number;
          updated_at?: string;
        };
        Relationships: [];
      };
```

- [ ] **Step 3: Typecheck**

Run: `npx tsc --noEmit`
Expected: sin errores.

- [ ] **Step 4: Commit**

```bash
git add lib/types.ts
git commit -m "feat(types): PlanRubro, PlanAjuste y tablas plan_* en Database

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

### Task 3: `lib/plan/formato.ts` — miles en vivo

**Files:**
- Create: `lib/plan/formato.ts`, `lib/plan/formato.test.ts`

**Interfaces:**
- Produces: `formatearMiles(texto: string): string`, `parsearMonto(texto: string): number | null`.

- [ ] **Step 1: Test que falla**

```ts
// lib/plan/formato.test.ts
import { describe, it, expect } from "vitest";
import { formatearMiles, parsearMonto } from "./formato";

describe("formatearMiles", () => {
  it("agrupa de a tres con punto", () => {
    expect(formatearMiles("4500000")).toBe("4.500.000");
    expect(formatearMiles("800")).toBe("800");
    expect(formatearMiles("1000")).toBe("1.000");
  });
  it("ignora todo lo que no sea dígito (pegado con $ y puntos)", () => {
    expect(formatearMiles("$4.500.000")).toBe("4.500.000");
    expect(formatearMiles("4 500 000")).toBe("4.500.000");
  });
  it("quita ceros a la izquierda y deja vacío como vacío", () => {
    expect(formatearMiles("0045")).toBe("45");
    expect(formatearMiles("")).toBe("");
    expect(formatearMiles("0")).toBe("0");
  });
});

describe("parsearMonto", () => {
  it("devuelve el entero", () => {
    expect(parsearMonto("4.500.000")).toBe(4_500_000);
    expect(parsearMonto("$ 1.000")).toBe(1000);
    expect(parsearMonto("0")).toBe(0);
  });
  it("vacío o sin dígitos → null", () => {
    expect(parsearMonto("")).toBeNull();
    expect(parsearMonto("abc")).toBeNull();
  });
});
```

- [ ] **Step 2: Correr y ver que falla**

Run: `npx vitest run lib/plan/formato.test.ts`
Expected: FAIL — `Failed to resolve import "./formato"`.

- [ ] **Step 3: Implementar**

```ts
// lib/plan/formato.ts
/** Solo los dígitos de un texto, sin ceros a la izquierda ('0' se conserva). */
function soloDigitos(texto: string): string {
  const d = texto.replace(/\D/g, "");
  const sinCeros = d.replace(/^0+(?=\d)/, "");
  return sinCeros;
}

/** '4500000' | '$4.500.000' → '4.500.000'. Para formatear el input mientras se escribe. */
export function formatearMiles(texto: string): string {
  const d = soloDigitos(texto);
  if (!d) return "";
  return d.replace(/\B(?=(\d{3})+(?!\d))/g, ".");
}

/** '4.500.000' → 4500000. null si no hay ningún dígito. */
export function parsearMonto(texto: string): number | null {
  const d = soloDigitos(texto);
  if (!d) return null;
  return parseInt(d, 10);
}
```

- [ ] **Step 4: Correr y ver que pasa**

Run: `npx vitest run lib/plan/formato.test.ts`
Expected: PASS (5 tests).

- [ ] **Step 5: Commit**

```bash
git add lib/plan/formato.ts lib/plan/formato.test.ts
git commit -m "feat(plan): formato de miles para el input de plata

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

### Task 4: `lib/plan/etiquetas.ts` — textos de mes, vigencia y origen

**Files:**
- Create: `lib/plan/etiquetas.ts`, `lib/plan/etiquetas.test.ts`

**Interfaces:**
- Consumes: `MESES`, `CORTOS` de `lib/labels.ts`; `mesNum` de `lib/ciclo.ts`.
- Produces: `etiquetaMes(ym): string` ("Septiembre 2026"), `etiquetaMesCorta(ym): string` ("sep 26"), `etiquetaVigencia(desde, hasta): string`, `etiquetaOrigenTC(origen): string`.

- [ ] **Step 1: Test que falla**

```ts
// lib/plan/etiquetas.test.ts
import { describe, it, expect } from "vitest";
import { etiquetaMes, etiquetaMesCorta, etiquetaVigencia, etiquetaOrigenTC } from "./etiquetas";

describe("etiquetaMes", () => {
  it("mes largo con mayúscula y año", () => {
    expect(etiquetaMes("2026-09")).toBe("Septiembre 2026");
    expect(etiquetaMes("2027-01")).toBe("Enero 2027");
  });
  it("corta: tres letras y dos dígitos", () => {
    expect(etiquetaMesCorta("2026-09")).toBe("sep 26");
  });
});

describe("etiquetaVigencia", () => {
  it("sin fin", () => expect(etiquetaVigencia("2026-09", null)).toBe("desde sep 26"));
  it("rango", () => expect(etiquetaVigencia("2026-09", "2026-12")).toBe("sep 26 – dic 26"));
  it("puntual", () => expect(etiquetaVigencia("2026-12", "2026-12")).toBe("solo dic 26"));
});

describe("etiquetaOrigenTC", () => {
  it("texto por origen", () => {
    expect(etiquetaOrigenTC("real")).toBe("factura");
    expect(etiquetaOrigenTC("ritmo")).toBe("a este ritmo");
    expect(etiquetaOrigenTC("promedio")).toBe("promedio 3 ciclos");
    expect(etiquetaOrigenTC("manual")).toBe("ajustado");
    expect(etiquetaOrigenTC("sin_datos")).toBe("sin historial");
  });
});
```

- [ ] **Step 2: Correr y ver que falla**

Run: `npx vitest run lib/plan/etiquetas.test.ts`
Expected: FAIL — import sin resolver.

- [ ] **Step 3: Implementar**

```ts
// lib/plan/etiquetas.ts
import { MESES, CORTOS } from "@/lib/labels";
import { mesNum } from "@/lib/ciclo";

export type OrigenTC = "real" | "ritmo" | "promedio" | "manual" | "sin_datos";

/** '2026-09' → 'Septiembre 2026'. */
export function etiquetaMes(ym: string): string {
  const nombre = MESES[mesNum(ym) - 1];
  return `${nombre[0].toUpperCase()}${nombre.slice(1)} ${ym.slice(0, 4)}`;
}

/** '2026-09' → 'sep 26'. */
export function etiquetaMesCorta(ym: string): string {
  return `${CORTOS[mesNum(ym) - 1]} ${ym.slice(2, 4)}`;
}

/** Cómo se lee la vigencia de un rubro en la lista. */
export function etiquetaVigencia(desde: string, hasta: string | null): string {
  if (hasta === null) return `desde ${etiquetaMesCorta(desde)}`;
  if (hasta === desde) return `solo ${etiquetaMesCorta(desde)}`;
  return `${etiquetaMesCorta(desde)} – ${etiquetaMesCorta(hasta)}`;
}

const ORIGEN: Record<OrigenTC, string> = {
  real: "factura",
  ritmo: "a este ritmo",
  promedio: "promedio 3 ciclos",
  manual: "ajustado",
  sin_datos: "sin historial",
};

export function etiquetaOrigenTC(origen: OrigenTC): string {
  return ORIGEN[origen];
}
```

- [ ] **Step 4: Correr y ver que pasa**

Run: `npx vitest run lib/plan/etiquetas.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add lib/plan/etiquetas.ts lib/plan/etiquetas.test.ts
git commit -m "feat(plan): etiquetas de mes, vigencia y origen de la TC

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

### Task 5: `lib/plan/calculo.ts` — rango, vigencia y ajustes de rubros

**Files:**
- Create: `lib/plan/calculo.ts`, `lib/plan/calculo.test.ts`

**Interfaces:**
- Consumes: `desplazarMes`, `mesDe` de `lib/ciclo.ts`; `PlanRubro`, `PlanAjuste`, `TipoRubro` de `lib/types.ts`.
- Produces:
  - `rangoMeses(hoy: string, atras: number, adelante: number): string[]`
  - `rubroAplica(r: PlanRubro, mes: string): boolean`
  - `interface LineaPlan { rubroId: string; nombre: string; monto: number; montoDefault: number; ajustado: boolean }`
  - `lineasDe(rubros: PlanRubro[], ajustes: PlanAjuste[], mes: string, tipo: TipoRubro): LineaPlan[]`

- [ ] **Step 1: Tests que fallan**

```ts
// lib/plan/calculo.test.ts
import { describe, it, expect } from "vitest";
import { rangoMeses, rubroAplica, lineasDe } from "./calculo";
import type { PlanRubro, PlanAjuste } from "@/lib/types";

// Fábricas: solo lo que importa para el cálculo; el resto es relleno fijo.
export function rubro(p: Partial<PlanRubro> & Pick<PlanRubro, "id" | "tipo" | "monto_default" | "desde">): PlanRubro {
  return {
    cuenta_id: "c1",
    nombre: p.id,
    hasta: null,
    orden: 0,
    created_by: null,
    created_at: "",
    updated_at: "",
    ...p,
  };
}

export function ajuste(mes: string, rubro_id: string | null, monto: number): PlanAjuste {
  return { id: `${mes}-${rubro_id ?? "tc"}`, cuenta_id: "c1", mes, rubro_id, monto, updated_at: "" };
}

describe("rangoMeses", () => {
  it("3 atrás + actual + 6 adelante = 10 meses ordenados", () => {
    const r = rangoMeses("2026-09-14", 3, 6);
    expect(r).toHaveLength(10);
    expect(r[0]).toBe("2026-06");
    expect(r[3]).toBe("2026-09");
    expect(r[9]).toBe("2027-03");
  });
  it("cruza el año", () => {
    const r = rangoMeses("2026-11-02", 3, 6);
    expect(r[0]).toBe("2026-08");
    expect(r[9]).toBe("2027-05");
  });
});

describe("rubroAplica", () => {
  it("desde sin hasta: aplica desde ese mes en adelante", () => {
    const r = rubro({ id: "nomina", tipo: "ingreso", monto_default: 1, desde: "2026-09" });
    expect(rubroAplica(r, "2026-08")).toBe(false);
    expect(rubroAplica(r, "2026-09")).toBe(true);
    expect(rubroAplica(r, "2027-03")).toBe(true);
  });
  it("con hasta: incluye el hasta y excluye el siguiente", () => {
    const r = rubro({ id: "curso", tipo: "fijo", monto_default: 1, desde: "2026-09", hasta: "2026-12" });
    expect(rubroAplica(r, "2026-12")).toBe(true);
    expect(rubroAplica(r, "2027-01")).toBe(false);
  });
  it("puntual: exactamente un mes", () => {
    const r = rubro({ id: "prima", tipo: "ingreso", monto_default: 1, desde: "2026-12", hasta: "2026-12" });
    expect(rubroAplica(r, "2026-11")).toBe(false);
    expect(rubroAplica(r, "2026-12")).toBe(true);
    expect(rubroAplica(r, "2027-01")).toBe(false);
  });
});

describe("lineasDe", () => {
  const rubros = [
    rubro({ id: "nomina", tipo: "ingreso", monto_default: 4_500_000, desde: "2026-01", orden: 0 }),
    rubro({ id: "arriendo", tipo: "fijo", monto_default: 2_000_000, desde: "2026-01", orden: 0 }),
    rubro({ id: "prima", tipo: "ingreso", monto_default: 2_000_000, desde: "2026-12", hasta: "2026-12", orden: 1 }),
  ];

  it("filtra por tipo y vigencia, en orden", () => {
    const sep = lineasDe(rubros, [], "2026-09", "ingreso");
    expect(sep.map((l) => l.rubroId)).toEqual(["nomina"]);
    const dic = lineasDe(rubros, [], "2026-12", "ingreso");
    expect(dic.map((l) => l.rubroId)).toEqual(["nomina", "prima"]);
    expect(lineasDe(rubros, [], "2026-09", "fijo").map((l) => l.rubroId)).toEqual(["arriendo"]);
  });

  it("un ajuste reemplaza el default solo en su mes", () => {
    const ajustes = [ajuste("2026-10", "nomina", 5_000_000)];
    const oct = lineasDe(rubros, ajustes, "2026-10", "ingreso")[0];
    expect(oct).toMatchObject({ monto: 5_000_000, montoDefault: 4_500_000, ajustado: true });
    const nov = lineasDe(rubros, ajustes, "2026-11", "ingreso")[0];
    expect(nov).toMatchObject({ monto: 4_500_000, ajustado: false });
  });
});
```

- [ ] **Step 2: Correr y ver que falla**

Run: `npx vitest run lib/plan/calculo.test.ts`
Expected: FAIL — import sin resolver.

- [ ] **Step 3: Implementar**

```ts
// lib/plan/calculo.ts
import { desplazarMes, mesDe } from "@/lib/ciclo";
import type { PlanAjuste, PlanRubro, TipoRubro } from "@/lib/types";

export interface LineaPlan {
  rubroId: string;
  nombre: string;
  monto: number;
  montoDefault: number;
  ajustado: boolean;
}

/** Los meses 'YYYY-MM' desde `atras` antes del mes de `hoy` hasta `adelante` después, ordenados. */
export function rangoMeses(hoy: string, atras: number, adelante: number): string[] {
  const actual = mesDe(hoy);
  const salida: string[] = [];
  for (let d = -atras; d <= adelante; d++) salida.push(desplazarMes(actual, d));
  return salida;
}

/** Vigencia: desde <= mes <= hasta (hasta null = sin fin). Comparación de strings 'YYYY-MM'. */
export function rubroAplica(r: PlanRubro, mes: string): boolean {
  return r.desde <= mes && (r.hasta === null || mes <= r.hasta);
}

/** Las líneas de un tipo vigentes en un mes, con el ajuste del mes aplicado si existe. */
export function lineasDe(rubros: PlanRubro[], ajustes: PlanAjuste[], mes: string, tipo: TipoRubro): LineaPlan[] {
  return rubros
    .filter((r) => r.tipo === tipo && rubroAplica(r, mes))
    .sort((a, b) => a.orden - b.orden || a.created_at.localeCompare(b.created_at))
    .map((r) => {
      const aj = ajustes.find((a) => a.mes === mes && a.rubro_id === r.id);
      return {
        rubroId: r.id,
        nombre: r.nombre,
        monto: aj ? aj.monto : r.monto_default,
        montoDefault: r.monto_default,
        ajustado: Boolean(aj),
      };
    });
}
```

- [ ] **Step 4: Correr y ver que pasa**

Run: `npx vitest run lib/plan/calculo.test.ts`
Expected: PASS (7 tests).

- [ ] **Step 5: Commit**

```bash
git add lib/plan/calculo.ts lib/plan/calculo.test.ts
git commit -m "feat(plan): rango de meses, vigencia de rubros y ajustes por mes

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

### Task 6: `lib/plan/calculo.ts` — la tarjeta según el estado del ciclo

**Files:**
- Modify: `lib/plan/calculo.ts`, `lib/plan/calculo.test.ts`

**Interfaces:**
- Consumes: `cicloDe`, `cicloInicio`, `cicloFin`, `desplazarMes`, `diasEntre`, `diasCorridosEnRango` de `lib/ciclo.ts`; `OrigenTC` de `lib/plan/etiquetas.ts`; `Expense`.
- Produces:
  - `type EstadoCiclo = "cerrado" | "en_curso" | "no_iniciado"`
  - `estadoCiclo(ciclo: string, hoy: string): EstadoCiclo`
  - `totalCiclo(gastos: Expense[], ciclo: string): number`
  - `promedioCiclosCerrados(gastos: Expense[], hoy: string, n?: number): number | null`
  - `interface TCPlan { monto: number; origen: OrigenTC; editable: boolean; ciclo: string; referencia: number; origenReferencia: Exclude<OrigenTC, "manual"> }` — `referencia` es el valor sin ajuste manual (factura, ritmo o promedio) y `origenReferencia` dice cuál de los tres es, para mostrarlo en la hoja de edición.
  - `calcularTC(gastos: Expense[], ajustes: PlanAjuste[], mes: string, hoy: string): TCPlan`

- [ ] **Step 1: Tests que fallan**

Agregar a `lib/plan/calculo.test.ts`:

```ts
import { estadoCiclo, totalCiclo, promedioCiclosCerrados, calcularTC } from "./calculo";
import type { Expense } from "@/lib/types";

function gasto(fecha: string, monto: number): Expense {
  return { id: `${fecha}-${monto}`, cuenta_id: "c1", fecha, monto, categoria: "otros", nota: null, created_by: null, created_at: "", updated_at: "" };
}

describe("estadoCiclo", () => {
  it("hoy 20-sep: sep cerrado, oct en curso, nov no iniciado", () => {
    expect(estadoCiclo("2026-09", "2026-09-20")).toBe("cerrado");
    expect(estadoCiclo("2026-10", "2026-09-20")).toBe("en_curso");
    expect(estadoCiclo("2026-11", "2026-09-20")).toBe("no_iniciado");
  });
  it("hoy 10-sep: sep en curso, oct no iniciado", () => {
    expect(estadoCiclo("2026-09", "2026-09-10")).toBe("en_curso");
    expect(estadoCiclo("2026-10", "2026-09-10")).toBe("no_iniciado");
  });
  it("bordes: el 15 sigue en curso, el 16 arranca el siguiente", () => {
    expect(estadoCiclo("2026-09", "2026-09-15")).toBe("en_curso");
    expect(estadoCiclo("2026-09", "2026-09-16")).toBe("cerrado");
    expect(estadoCiclo("2026-10", "2026-09-16")).toBe("en_curso");
  });
});

describe("totalCiclo", () => {
  it("15-sep entra a septiembre, 16-sep a octubre", () => {
    const g = [gasto("2026-08-16", 100), gasto("2026-09-15", 200), gasto("2026-09-16", 400)];
    expect(totalCiclo(g, "2026-09")).toBe(300);
    expect(totalCiclo(g, "2026-10")).toBe(400);
  });
});

describe("promedioCiclosCerrados", () => {
  it("usa los 3 ciclos cerrados más recientes", () => {
    // ciclos 2026-05..2026-09 cerrados (hoy 20-sep), con totales 1..5 (x1M)
    const g = [1, 2, 3, 4, 5].map((n, i) => gasto(`2026-0${5 + i}-01`, n * 1_000_000));
    expect(promedioCiclosCerrados(g, "2026-09-20")).toBe(4_000_000); // (3+4+5)/3
  });
  it("no cuenta el ciclo en curso", () => {
    const g = [gasto("2026-08-01", 1_000_000), gasto("2026-09-18", 9_000_000)]; // sep-18 es ciclo 2026-10, en curso
    expect(promedioCiclosCerrados(g, "2026-09-20")).toBe(1_000_000);
  });
  it("un ciclo cerrado sin gasto no entra al promedio (no lo arrastra a un tercio)", () => {
    const g = [gasto("2026-06-01", 3_000_000)]; // jul y ago cerrados pero en cero
    expect(promedioCiclosCerrados(g, "2026-09-20")).toBe(3_000_000);
  });
  it("sin ningún ciclo cerrado con datos → null", () => {
    expect(promedioCiclosCerrados([], "2026-09-20")).toBeNull();
    expect(promedioCiclosCerrados([gasto("2026-09-18", 500)], "2026-09-20")).toBeNull();
  });
});

describe("calcularTC", () => {
  const hoy = "2026-09-20";
  const gastos = [
    gasto("2026-06-01", 3_000_000), // ciclo 06
    gasto("2026-07-01", 3_000_000), // ciclo 07
    gasto("2026-08-01", 6_000_000), // ciclo 08
    gasto("2026-08-20", 1_000_000), // ciclo 09
    gasto("2026-09-10", 2_000_000), // ciclo 09
    gasto("2026-09-17", 500_000),   // ciclo 10 (en curso)
  ];

  it("ciclo cerrado: la factura exacta, no editable, y un ajuste se ignora", () => {
    const tc = calcularTC(gastos, [ajuste("2026-09", null, 999)], "2026-09", hoy);
    expect(tc).toMatchObject({ monto: 3_000_000, origen: "real", editable: false, ciclo: "2026-09", referencia: 3_000_000 });
  });

  it("ciclo en curso: real + ritmo sobre el largo del ciclo", () => {
    // ciclo 2026-10: 16-sep..15-oct = 30 días; corridos al 20-sep = 5
    const tc = calcularTC(gastos, [], "2026-10", hoy);
    expect(tc.origen).toBe("ritmo");
    expect(tc.editable).toBe(true);
    expect(tc.monto).toBe(Math.round((500_000 / 5) * 30));
    expect(tc.referencia).toBe(tc.monto);
  });

  it("ciclo en curso con ajuste: manual, y la referencia sigue siendo el ritmo", () => {
    const tc = calcularTC(gastos, [ajuste("2026-10", null, 4_000_000)], "2026-10", hoy);
    expect(tc).toMatchObject({ monto: 4_000_000, origen: "manual", editable: true });
    expect(tc.referencia).toBe(Math.round((500_000 / 5) * 30));
  });

  it("no iniciado: promedio de los 3 cerrados (07, 08, 09)", () => {
    const tc = calcularTC(gastos, [], "2026-11", hoy);
    expect(tc).toMatchObject({ monto: 4_000_000, origen: "promedio", editable: true, referencia: 4_000_000 });
  });

  it("no iniciado con ajuste: manual", () => {
    const tc = calcularTC(gastos, [ajuste("2026-11", null, 5_500_000)], "2026-11", hoy);
    expect(tc).toMatchObject({ monto: 5_500_000, origen: "manual", referencia: 4_000_000 });
  });

  it("sin historial: sin_datos y monto 0", () => {
    const tc = calcularTC([], [], "2026-11", hoy);
    expect(tc).toMatchObject({ monto: 0, origen: "sin_datos", editable: true, referencia: 0 });
  });

  it("origenReferencia dice qué habría sin el ajuste", () => {
    expect(calcularTC(gastos, [], "2026-09", hoy).origenReferencia).toBe("real");
    expect(calcularTC(gastos, [ajuste("2026-10", null, 1)], "2026-10", hoy).origenReferencia).toBe("ritmo");
    expect(calcularTC(gastos, [ajuste("2026-11", null, 1)], "2026-11", hoy).origenReferencia).toBe("promedio");
    expect(calcularTC([], [ajuste("2026-11", null, 1)], "2026-11", hoy).origenReferencia).toBe("sin_datos");
  });
});
```

- [ ] **Step 2: Correr y ver que falla**

Run: `npx vitest run lib/plan/calculo.test.ts`
Expected: FAIL — `estadoCiclo is not a function` (o import inexistente).

- [ ] **Step 3: Implementar**

Agregar a `lib/plan/calculo.ts` (imports arriba del archivo):

```ts
import { cicloDe, cicloFin, cicloInicio, desplazarMes, diasCorridosEnRango, diasEntre, mesDe } from "@/lib/ciclo";
import type { Expense, PlanAjuste, PlanRubro, TipoRubro } from "@/lib/types";
import type { OrigenTC } from "./etiquetas";

export type EstadoCiclo = "cerrado" | "en_curso" | "no_iniciado";

export interface TCPlan {
  monto: number;
  origen: OrigenTC;
  editable: boolean;
  ciclo: string;
  /** El valor sin ajuste manual (factura, ritmo o promedio). */
  referencia: number;
  /** Cuál de los tres es la referencia. Igual a `origen` salvo cuando hay ajuste manual. */
  origenReferencia: Exclude<OrigenTC, "manual">;
}

/** El ciclo del mes M es M: cierra el 15 de M y se paga el 30 de M. */
export function estadoCiclo(ciclo: string, hoy: string): EstadoCiclo {
  if (hoy > cicloFin(ciclo)) return "cerrado";
  if (hoy < cicloInicio(ciclo)) return "no_iniciado";
  return "en_curso";
}

export function totalCiclo(gastos: Expense[], ciclo: string): number {
  return gastos.filter((g) => cicloDe(g.fecha) === ciclo).reduce((s, g) => s + g.monto, 0);
}

/**
 * Promedio de los últimos `n` ciclos cerrados con gasto > 0. Un ciclo cerrado
 * en cero no cuenta (no arrastra el promedio hacia abajo). null si no hay
 * ninguno con datos.
 */
export function promedioCiclosCerrados(gastos: Expense[], hoy: string, n = 3): number | null {
  if (gastos.length === 0) return null;
  const cicloMin = gastos.map((g) => cicloDe(g.fecha)).sort()[0];
  const totales: number[] = [];
  let c = desplazarMes(cicloDe(hoy), -1); // el anterior al que contiene hoy: el primero cerrado
  while (c >= cicloMin && totales.length < n) {
    const t = totalCiclo(gastos, c);
    if (t > 0) totales.push(t);
    c = desplazarMes(c, -1);
  }
  if (totales.length === 0) return null;
  return Math.round(totales.reduce((s, t) => s + t, 0) / totales.length);
}

export function calcularTC(gastos: Expense[], ajustes: PlanAjuste[], mes: string, hoy: string): TCPlan {
  const ciclo = mes;
  const estado = estadoCiclo(ciclo, hoy);
  const real = totalCiclo(gastos, ciclo);

  if (estado === "cerrado") {
    // La factura ya está. Un ajuste guardado antes del cierre se ignora.
    return { monto: real, origen: "real", editable: false, ciclo, referencia: real, origenReferencia: "real" };
  }

  const manual = ajustes.find((a) => a.mes === mes && a.rubro_id === null);

  if (estado === "en_curso") {
    const inicio = cicloInicio(ciclo);
    const fin = cicloFin(ciclo);
    const largo = diasEntre(inicio, fin) + 1;
    const corridos = diasCorridosEnRango(inicio, fin, hoy);
    const ritmo = corridos > 0 ? Math.round((real / corridos) * largo) : 0;
    return manual
      ? { monto: manual.monto, origen: "manual", editable: true, ciclo, referencia: ritmo, origenReferencia: "ritmo" }
      : { monto: ritmo, origen: "ritmo", editable: true, ciclo, referencia: ritmo, origenReferencia: "ritmo" };
  }

  const promedio = promedioCiclosCerrados(gastos, hoy);
  const referencia = promedio ?? 0;
  const origenReferencia = promedio === null ? "sin_datos" : "promedio";
  if (manual) return { monto: manual.monto, origen: "manual", editable: true, ciclo, referencia, origenReferencia };
  if (promedio === null) return { monto: 0, origen: "sin_datos", editable: true, ciclo, referencia: 0, origenReferencia };
  return { monto: promedio, origen: "promedio", editable: true, ciclo, referencia, origenReferencia };
}
```

- [ ] **Step 4: Correr y ver que pasa**

Run: `npx vitest run lib/plan/calculo.test.ts`
Expected: PASS (todos).

- [ ] **Step 5: Commit**

```bash
git add lib/plan/calculo.ts lib/plan/calculo.test.ts
git commit -m "feat(plan): la tarjeta del mes según el estado del ciclo (factura, ritmo, promedio, manual)

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

### Task 7: `lib/plan/calculo.ts` — `calcularPlan`: ahorro y acumulado

**Files:**
- Modify: `lib/plan/calculo.ts`, `lib/plan/calculo.test.ts`

**Interfaces:**
- Produces:
  ```ts
  interface MesPlan {
    mes: string; esActual: boolean;
    ingresos: LineaPlan[]; fijos: LineaPlan[];
    totalIngresos: number; totalFijos: number;
    tc: TCPlan;
    ahorro: number | null;     // null si no hay ningún rubro de ingreso vigente
    acumulado: number | null;  // null en meses pasados
  }
  calcularPlan(opts: { rubros: PlanRubro[]; ajustes: PlanAjuste[]; gastos: Expense[]; hoy: string; mesesAtras?: number; mesesAdelante?: number }): MesPlan[]
  ```

- [ ] **Step 1: Tests que fallan**

Agregar a `lib/plan/calculo.test.ts`:

```ts
import { calcularPlan } from "./calculo";

describe("calcularPlan", () => {
  const hoy = "2026-09-20";
  const rubros = [
    rubro({ id: "nomina", tipo: "ingreso", monto_default: 10_000_000, desde: "2026-01" }),
    rubro({ id: "arriendo", tipo: "fijo", monto_default: 2_000_000, desde: "2026-01" }),
  ];
  // Un solo ciclo cerrado con datos: promedio = 3M para todo futuro.
  const gastos = [gasto("2026-08-01", 3_000_000)];

  it("10 meses, el actual marcado", () => {
    const plan = calcularPlan({ rubros, ajustes: [], gastos, hoy });
    expect(plan).toHaveLength(10);
    expect(plan.filter((m) => m.esActual).map((m) => m.mes)).toEqual(["2026-09"]);
  });

  it("ahorro = ingresos − fijos − tc, negativo permitido", () => {
    const plan = calcularPlan({ rubros, ajustes: [], gastos, hoy });
    const nov = plan.find((m) => m.mes === "2026-11")!;
    expect(nov.totalIngresos).toBe(10_000_000);
    expect(nov.totalFijos).toBe(2_000_000);
    expect(nov.tc.monto).toBe(3_000_000);
    expect(nov.ahorro).toBe(5_000_000);

    const caro = calcularPlan({ rubros, ajustes: [ajuste("2026-11", null, 20_000_000)], gastos, hoy });
    expect(caro.find((m) => m.mes === "2026-11")!.ahorro).toBe(-12_000_000);
  });

  it("acumulado: null en pasados, = ahorro en el actual, suma hacia adelante", () => {
    const plan = calcularPlan({ rubros, ajustes: [], gastos, hoy });
    const [jun, jul, ago, sep, oct] = plan;
    expect(jun.acumulado).toBeNull();
    expect(jul.acumulado).toBeNull();
    expect(ago.acumulado).toBeNull();
    expect(sep.acumulado).toBe(sep.ahorro);
    expect(oct.acumulado).toBe(sep.ahorro! + oct.ahorro!);
  });

  it("sin rubros de ingreso: ahorro null, acumulado null", () => {
    const plan = calcularPlan({ rubros: [rubros[1]], ajustes: [], gastos, hoy });
    expect(plan.every((m) => m.ahorro === null)).toBe(true);
    expect(plan.every((m) => m.acumulado === null)).toBe(true);
  });

  it("un ingreso que arranca en el futuro: los meses anteriores quedan en null y el acumulado arranca ahí", () => {
    const tardio = [rubro({ id: "nomina", tipo: "ingreso", monto_default: 10_000_000, desde: "2026-11" })];
    const plan = calcularPlan({ rubros: tardio, ajustes: [], gastos, hoy });
    const sep = plan.find((m) => m.mes === "2026-09")!;
    const nov = plan.find((m) => m.mes === "2026-11")!;
    expect(sep.ahorro).toBeNull();
    expect(sep.acumulado).toBeNull();
    expect(nov.ahorro).toBe(7_000_000);
    expect(nov.acumulado).toBe(7_000_000);
  });
});
```

- [ ] **Step 2: Correr y ver que falla**

Run: `npx vitest run lib/plan/calculo.test.ts`
Expected: FAIL — `calcularPlan` no exportada.

- [ ] **Step 3: Implementar**

Agregar a `lib/plan/calculo.ts`:

```ts
export interface MesPlan {
  mes: string;
  esActual: boolean;
  ingresos: LineaPlan[];
  fijos: LineaPlan[];
  totalIngresos: number;
  totalFijos: number;
  tc: TCPlan;
  /** null si no hay ningún rubro de ingreso vigente: la UI muestra "—". */
  ahorro: number | null;
  /** Suma de ahorros desde el mes actual (incluido). null en meses pasados. */
  acumulado: number | null;
}

const suma = (lineas: LineaPlan[]) => lineas.reduce((s, l) => s + l.monto, 0);

export function calcularPlan(opts: {
  rubros: PlanRubro[];
  ajustes: PlanAjuste[];
  gastos: Expense[];
  hoy: string;
  mesesAtras?: number;
  mesesAdelante?: number;
}): MesPlan[] {
  const { rubros, ajustes, gastos, hoy, mesesAtras = 3, mesesAdelante = 6 } = opts;
  const mesActual = mesDe(hoy);
  let acumulado: number | null = null;

  return rangoMeses(hoy, mesesAtras, mesesAdelante).map((mes) => {
    const ingresos = lineasDe(rubros, ajustes, mes, "ingreso");
    const fijos = lineasDe(rubros, ajustes, mes, "fijo");
    const totalIngresos = suma(ingresos);
    const totalFijos = suma(fijos);
    const tc = calcularTC(gastos, ajustes, mes, hoy);
    const ahorro = ingresos.length === 0 ? null : totalIngresos - totalFijos - tc.monto;

    const esActual = mes === mesActual;
    if (mes >= mesActual && ahorro !== null) acumulado = (acumulado ?? 0) + ahorro;

    return {
      mes,
      esActual,
      ingresos,
      fijos,
      totalIngresos,
      totalFijos,
      tc,
      ahorro,
      acumulado: mes < mesActual ? null : acumulado,
    };
  });
}
```

- [ ] **Step 4: Correr y ver que pasa**

Run: `npx vitest run lib/plan/calculo.test.ts`
Expected: PASS.

- [ ] **Step 5: Correr toda la suite y typecheck**

Run: `npm test && npx tsc --noEmit`
Expected: todo en verde.

- [ ] **Step 6: Commit**

```bash
git add lib/plan/calculo.ts lib/plan/calculo.test.ts
git commit -m "feat(plan): calcularPlan con ahorro por mes y acumulado hacia adelante

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

### Task 8: `lib/plan/queries.ts`

**Files:**
- Create: `lib/plan/queries.ts`, `lib/plan/queries.test.ts`

**Interfaces:**
- Consumes: `sinTipar` de `lib/supabase/queries.ts`; tipos de `lib/types.ts`.
- Produces (todas `async`, todas con `supabase: SupabaseClient<Database>` como primer argumento):
  - `listarRubros(supabase): Promise<Resultado<PlanRubro[]>>`
  - `crearRubro(supabase, cuentaId: string, datos: NuevoRubro): Promise<Resultado<PlanRubro>>`
  - `actualizarRubro(supabase, id: string, cambios: Partial<NuevoRubro>): Promise<Resultado<PlanRubro>>`
  - `eliminarRubro(supabase, id: string): Promise<{ error: PostgrestError | null }>`
  - `listarAjustes(supabase): Promise<Resultado<PlanAjuste[]>>`
  - `guardarAjuste(supabase, cuentaId: string, mes: string, rubroId: string | null, monto: number): Promise<Resultado<PlanAjuste>>`
  - `quitarAjuste(supabase, cuentaId: string, mes: string, rubroId: string | null): Promise<{ error: PostgrestError | null }>`

- [ ] **Step 1: Tests que fallan**

Las pruebas miran la petición que viaja a PostgREST (URL, método, cabeceras, cuerpo) y también lo que vuelve — sin la segunda mitad pasarían igual con un 400.

```ts
// lib/plan/queries.test.ts
import { describe, it, expect } from "vitest";
import { createClient } from "@supabase/supabase-js";
import { listarRubros, guardarAjuste, quitarAjuste, eliminarRubro } from "./queries";

function clienteQueCaptura(respuesta: unknown, status = 200) {
  const peticiones: { url: string; metodo: string; cuerpo: string | null; headers: Headers }[] = [];
  const supabase = createClient("https://ejemplo.supabase.co", "llave-de-prueba", {
    auth: { persistSession: false, autoRefreshToken: false },
    global: {
      fetch: (async (input: RequestInfo | URL, init?: RequestInit) => {
        peticiones.push({
          url: decodeURIComponent(typeof input === "string" ? input : input.toString()),
          metodo: init?.method ?? "GET",
          cuerpo: typeof init?.body === "string" ? init.body : null,
          headers: new Headers(init?.headers),
        });
        return new Response(JSON.stringify(respuesta), {
          status,
          headers: { "Content-Type": "application/json" },
        });
      }) as typeof fetch,
    },
  });
  return { supabase, peticiones };
}

describe("listarRubros", () => {
  it("ordena por tipo, orden y created_at para que la lista no baile entre recargas", async () => {
    const { supabase, peticiones } = clienteQueCaptura([]);
    const { error } = await listarRubros(supabase);
    expect(error).toBeNull();
    const orden = peticiones[0].url.match(/order=([^&]+)/)?.[1];
    expect(orden).toBe("tipo.asc,orden.asc,created_at.asc");
  });
});

describe("guardarAjuste", () => {
  it("hace upsert sobre (cuenta_id, mes, rubro_id) y devuelve la fila", async () => {
    const fila = { id: "a1", cuenta_id: "c1", mes: "2026-10", rubro_id: null, monto: 4_000_000, updated_at: "" };
    const { supabase, peticiones } = clienteQueCaptura([fila]);
    const { data, error } = await guardarAjuste(supabase, "c1", "2026-10", null, 4_000_000);

    expect(peticiones[0].metodo).toBe("POST");
    expect(peticiones[0].url).toContain("on_conflict=cuenta_id,mes,rubro_id");
    expect(peticiones[0].headers.get("Prefer")).toContain("resolution=merge-duplicates");
    expect(JSON.parse(peticiones[0].cuerpo!)).toMatchObject({ cuenta_id: "c1", mes: "2026-10", rubro_id: null, monto: 4_000_000 });
    expect(error).toBeNull();
    expect(data).toEqual(fila);
  });

  it("devuelve el error de Supabase, no lo traga", async () => {
    const { supabase } = clienteQueCaptura({ message: "new row violates row-level security policy", code: "42501" }, 403);
    const { data, error } = await guardarAjuste(supabase, "c1", "2026-10", null, 1);
    expect(data).toBeNull();
    expect(error?.code).toBe("42501");
  });
});

describe("quitarAjuste", () => {
  it("borra por la clave; con rubro_id null usa `is.null`", async () => {
    const { supabase, peticiones } = clienteQueCaptura([]);
    const { error } = await quitarAjuste(supabase, "c1", "2026-10", null);
    expect(error).toBeNull();
    expect(peticiones[0].metodo).toBe("DELETE");
    expect(peticiones[0].url).toContain("cuenta_id=eq.c1");
    expect(peticiones[0].url).toContain("mes=eq.2026-10");
    expect(peticiones[0].url).toContain("rubro_id=is.null");
  });
  it("con rubro_id usa `eq`", async () => {
    const { supabase, peticiones } = clienteQueCaptura([]);
    await quitarAjuste(supabase, "c1", "2026-10", "r1");
    expect(peticiones[0].url).toContain("rubro_id=eq.r1");
  });
});

describe("eliminarRubro", () => {
  it("borra por id", async () => {
    const { supabase, peticiones } = clienteQueCaptura([]);
    const { error } = await eliminarRubro(supabase, "r1");
    expect(error).toBeNull();
    expect(peticiones[0].metodo).toBe("DELETE");
    expect(peticiones[0].url).toContain("id=eq.r1");
  });
});
```

- [ ] **Step 2: Correr y ver que falla**

Run: `npx vitest run lib/plan/queries.test.ts`
Expected: FAIL — import sin resolver.

- [ ] **Step 3: Implementar**

```ts
// lib/plan/queries.ts
import type { PostgrestError, SupabaseClient } from "@supabase/supabase-js";
import type { Database, NuevoRubro, PlanAjuste, PlanRubro } from "@/lib/types";
import { sinTipar } from "@/lib/supabase/queries";

type Cliente = SupabaseClient<Database>;
type Resultado<T> = { data: T | null; error: PostgrestError | null };

// Lectura: RLS ya limita a la cuenta del usuario; no se filtra por cuenta acá.
// El orden incluye created_at para que dos rubros con el mismo `orden` no
// bailen entre recargas.
export async function listarRubros(supabase: Cliente): Promise<Resultado<PlanRubro[]>> {
  const { data, error } = await supabase
    .from("plan_rubros")
    .select("*")
    .order("tipo", { ascending: true })
    .order("orden", { ascending: true })
    .order("created_at", { ascending: true });
  return { data: data as PlanRubro[] | null, error };
}

export async function crearRubro(supabase: Cliente, cuentaId: string, datos: NuevoRubro): Promise<Resultado<PlanRubro>> {
  const { data, error } = await sinTipar(supabase)
    .from("plan_rubros")
    .insert({ ...datos, cuenta_id: cuentaId })
    .select()
    .single();
  return { data: data as PlanRubro | null, error };
}

export async function actualizarRubro(
  supabase: Cliente,
  id: string,
  cambios: Partial<NuevoRubro>
): Promise<Resultado<PlanRubro>> {
  const { data, error } = await sinTipar(supabase).from("plan_rubros").update(cambios).eq("id", id).select().single();
  return { data: data as PlanRubro | null, error };
}

export async function eliminarRubro(supabase: Cliente, id: string): Promise<{ error: PostgrestError | null }> {
  const { error } = await sinTipar(supabase).from("plan_rubros").delete().eq("id", id);
  return { error };
}

export async function listarAjustes(supabase: Cliente): Promise<Resultado<PlanAjuste[]>> {
  const { data, error } = await supabase.from("plan_ajustes").select("*").order("mes", { ascending: true });
  return { data: data as PlanAjuste[] | null, error };
}

/** Upsert sobre la clave única (cuenta_id, mes, rubro_id). rubroId null = estimado de TC. */
export async function guardarAjuste(
  supabase: Cliente,
  cuentaId: string,
  mes: string,
  rubroId: string | null,
  monto: number
): Promise<Resultado<PlanAjuste>> {
  const { data, error } = await sinTipar(supabase)
    .from("plan_ajustes")
    .upsert({ cuenta_id: cuentaId, mes, rubro_id: rubroId, monto }, { onConflict: "cuenta_id,mes,rubro_id" })
    .select()
    .single();
  return { data: data as PlanAjuste | null, error };
}

/** Quitar el ajuste = volver al default (rubro) o al ritmo/promedio (TC). */
export async function quitarAjuste(
  supabase: Cliente,
  cuentaId: string,
  mes: string,
  rubroId: string | null
): Promise<{ error: PostgrestError | null }> {
  let q = sinTipar(supabase).from("plan_ajustes").delete().eq("cuenta_id", cuentaId).eq("mes", mes);
  q = rubroId === null ? q.is("rubro_id", null) : q.eq("rubro_id", rubroId);
  const { error } = await q;
  return { error };
}
```

- [ ] **Step 4: Correr y ver que pasa**

Run: `npx vitest run lib/plan/queries.test.ts`
Expected: PASS. Si el test de `Prefer` falla porque la cabecera exacta difiere, imprimir `peticiones[0].headers.get("Prefer")` y ajustar el `toContain` al valor real de esta versión de supabase-js — lo que importa es que el upsert vaya con resolución de duplicados.

- [ ] **Step 5: Commit**

```bash
git add lib/plan/queries.ts lib/plan/queries.test.ts
git commit -m "feat(plan): queries de rubros y ajustes (upsert por clave única)

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

### Task 9: Primitivos de UI — `Sheet`, `Banner tono="info"`, íconos

**Files:**
- Create: `components/ui/Sheet.tsx`, `components/plan/Iconos.tsx`
- Modify: `components/ui/Banner.tsx`, `app/globals.css`

**Interfaces:**
- Produces: `<Sheet titulo onClose>{children}</Sheet>`; `<Banner tono="info" | "alerta">`; `IconoChevron`, `IconoLapiz`, `IconoMas`, `IconoCerrar` (todos `({ className?: string })`).

- [ ] **Step 1: Keyframes de la hoja**

Agregar al final de `app/globals.css` (antes del bloque `prefers-reduced-motion`, que ya anula toda animación):

```css
@keyframes sheet-subir {
  from { transform: translateY(100%); }
  to { transform: translateY(0); }
}
.sheet-entrar {
  animation: sheet-subir 220ms ease-out;
}
```

- [ ] **Step 2: `Sheet`**

```tsx
// components/ui/Sheet.tsx
"use client";

import { useEffect, useId } from "react";

/**
 * Hoja que sube desde abajo. En móvil el teclado no la tapa, a diferencia del
 * Modal centrado. Cierra con tap afuera o Escape.
 */
export function Sheet({
  titulo,
  onClose,
  children,
}: {
  titulo: string;
  onClose: () => void;
  children: React.ReactNode;
}) {
  const tituloId = useId();

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  return (
    <div
      className="fixed inset-0 z-50 bg-ink/45 flex items-end justify-center"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby={tituloId}
        className="sheet-entrar w-full max-w-xl bg-surface rounded-t-2xl px-5 pt-3 pb-[max(1.25rem,env(safe-area-inset-bottom))] max-h-[90vh] overflow-y-auto"
      >
        <div className="mx-auto w-10 h-1 rounded-full bg-line mb-3" aria-hidden="true" />
        <h3 id={tituloId} className="text-[17px] font-semibold text-ink">
          {titulo}
        </h3>
        {children}
      </div>
    </div>
  );
}
```

- [ ] **Step 3: `Banner` con `tono`**

Reemplazar `components/ui/Banner.tsx`:

```tsx
const TONOS = {
  alerta: { caja: "bg-[#FBEEED] text-[#8E3733]", boton: "border-[#E0BDBA] text-[#8E3733]" },
  info: { caja: "bg-[#EAF0F7] text-[#2F4A6B]", boton: "border-[#BFD0E4] text-[#2F4A6B]" },
} as const;

export function Banner({
  children,
  accion,
  tono = "alerta",
}: {
  children: React.ReactNode;
  accion?: { etiqueta: string; onClick: () => void };
  tono?: keyof typeof TONOS;
}) {
  const t = TONOS[tono];
  return (
    <div className={`flex items-center gap-2.5 ${t.caja} rounded-xl px-3 py-2.5 text-[13px] leading-relaxed mb-3.5`}>
      <span className="flex-1">{children}</span>
      {accion && (
        <button
          onClick={accion.onClick}
          className={`shrink-0 min-h-[36px] border bg-white ${t.boton} rounded-lg px-2.5 py-1.5 text-xs cursor-pointer`}
        >
          {accion.etiqueta}
        </button>
      )}
    </div>
  );
}
```

(Los usos existentes no pasan `tono`, así que siguen en rojo.)

- [ ] **Step 4: Íconos SVG**

```tsx
// components/plan/Iconos.tsx
// Íconos de trazo, 20px, estilo Lucide. SVG inline: sin emojis como íconos.
type Props = { className?: string };

const base = {
  width: 20,
  height: 20,
  viewBox: "0 0 24 24",
  fill: "none",
  stroke: "currentColor",
  strokeWidth: 2,
  strokeLinecap: "round" as const,
  strokeLinejoin: "round" as const,
  "aria-hidden": true,
};

export function IconoChevron({ className = "" }: Props) {
  return (
    <svg {...base} className={className}>
      <path d="m6 9 6 6 6-6" />
    </svg>
  );
}

export function IconoLapiz({ className = "" }: Props) {
  return (
    <svg {...base} className={className}>
      <path d="M12 20h9" />
      <path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4Z" />
    </svg>
  );
}

export function IconoMas({ className = "" }: Props) {
  return (
    <svg {...base} className={className}>
      <path d="M12 5v14" />
      <path d="M5 12h14" />
    </svg>
  );
}

export function IconoCerrar({ className = "" }: Props) {
  return (
    <svg {...base} className={className}>
      <path d="M18 6 6 18" />
      <path d="m6 6 12 12" />
    </svg>
  );
}
```

- [ ] **Step 5: Typecheck y lint**

Run: `npx tsc --noEmit && npm run lint`
Expected: sin errores.

- [ ] **Step 6: Commit**

```bash
git add components/ui/Sheet.tsx components/ui/Banner.tsx components/plan/Iconos.tsx app/globals.css
git commit -m "feat(ui): Sheet desde abajo, Banner con tono info e íconos SVG del plan

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

### Task 10: Pantalla `/plan` en modo lectura — página, `PlanClient`, `SubTabs`, `ResumenMes`, `ListaMeses`, `DetalleMes`, `NavTabs`

**Files:**
- Create: `app/(app)/plan/page.tsx`, `components/plan/PlanClient.tsx`, `components/plan/SubTabs.tsx`, `components/plan/ResumenMes.tsx`, `components/plan/ListaMeses.tsx`, `components/plan/DetalleMes.tsx`
- Modify: `components/NavTabs.tsx`

**Interfaces:**
- Consumes: `calcularPlan`, `MesPlan`, `LineaPlan` (`lib/plan/calculo.ts`); `listarRubros`, `listarAjustes` (`lib/plan/queries.ts`); `listarGastos`, `obtenerMiCuenta` (`lib/supabase/queries.ts`); `etiquetaMes`, `etiquetaOrigenTC` (`lib/plan/etiquetas.ts`); `pesos`, `pesosCorto`; `hoyISO`; `Banner`, `Toast`, `useToast`; `IconoChevron`, `IconoLapiz`.
- Produces: `PlanClient` con props `{ cuentaId, rubrosIniciales, ajustesIniciales, gastos, lecturaFallida }`. `ListaMeses` recibe `onEditar(mes: string, rubroId: string | null)` que en esta tarea no hace nada visible (lo conecta la Task 11). `DetalleMes` expone `onEditar` igual.

- [ ] **Step 1: Página de servidor**

```tsx
// app/(app)/plan/page.tsx
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { listarGastos, obtenerMiCuenta } from "@/lib/supabase/queries";
import { listarAjustes, listarRubros } from "@/lib/plan/queries";
import { PlanClient } from "@/components/plan/PlanClient";

export default async function PlanPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const [cuentaRes, rubrosRes, ajustesRes, gastosRes] = await Promise.all([
    obtenerMiCuenta(supabase, user.id),
    listarRubros(supabase),
    listarAjustes(supabase),
    listarGastos(supabase),
  ]);

  const cuentaId = cuentaRes.data;
  const lecturaFallida = Boolean(cuentaRes.error || !cuentaId || rubrosRes.error || ajustesRes.error || gastosRes.error);

  return (
    <PlanClient
      cuentaId={cuentaId ?? ""}
      rubrosIniciales={lecturaFallida ? [] : rubrosRes.data ?? []}
      ajustesIniciales={lecturaFallida ? [] : ajustesRes.data ?? []}
      gastos={lecturaFallida ? [] : gastosRes.data ?? []}
      lecturaFallida={lecturaFallida}
    />
  );
}
```

- [ ] **Step 2: `SubTabs`**

```tsx
// components/plan/SubTabs.tsx
"use client";

export type VistaPlan = "meses" | "rubros";

export function SubTabs({ vista, onCambiar }: { vista: VistaPlan; onCambiar: (v: VistaPlan) => void }) {
  const opciones: { id: VistaPlan; etiqueta: string }[] = [
    { id: "meses", etiqueta: "Meses" },
    { id: "rubros", etiqueta: "Ingresos y fijos" },
  ];
  return (
    <div role="tablist" className="flex gap-1.5 mb-4">
      {opciones.map((o) => {
        const activo = vista === o.id;
        return (
          <button
            key={o.id}
            role="tab"
            aria-selected={activo}
            onClick={() => onCambiar(o.id)}
            className={`flex-1 min-h-[44px] px-2 rounded-xl border text-sm cursor-pointer transition-colors duration-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ink/40 ${
              activo ? "border-ink bg-ink text-white font-medium" : "border-line bg-surface text-muted"
            }`}
          >
            {o.etiqueta}
          </button>
        );
      })}
    </div>
  );
}
```

- [ ] **Step 3: `ResumenMes`**

```tsx
// components/plan/ResumenMes.tsx
import { pesos } from "@/lib/money";
import { etiquetaMes, etiquetaOrigenTC } from "@/lib/plan/etiquetas";
import type { MesPlan } from "@/lib/plan/calculo";

export function textoAhorro(ahorro: number | null): string {
  if (ahorro === null) return "—";
  return `${ahorro < 0 ? "−" : "+"}${pesos(Math.abs(ahorro))}`;
}

export function colorAhorro(ahorro: number | null): string {
  if (ahorro === null) return "text-muted";
  return ahorro < 0 ? "text-alerta" : "text-ok";
}

export function ResumenMes({ mes, ultimo }: { mes: MesPlan; ultimo: MesPlan }) {
  const gastos = mes.totalFijos + mes.tc.monto;
  return (
    <div className="bg-surface border border-line rounded-2xl p-4 mb-3.5">
      <div className="text-[11px] tracking-wider uppercase text-muted font-semibold mb-1">{etiquetaMes(mes.mes)}</div>
      <div className={`text-[32px] font-semibold leading-none num ${colorAhorro(mes.ahorro)}`}>{textoAhorro(mes.ahorro)}</div>
      <div className="text-xs text-muted mt-1">ahorro del mes</div>

      <div className="grid grid-cols-2 gap-3 mt-4 text-[13px]">
        <div>
          <div className="text-muted">Ingresos</div>
          <div className="num text-ink font-medium">{pesos(mes.totalIngresos)}</div>
        </div>
        <div>
          <div className="text-muted">
            Gastos <span className="text-[11px]">· TC {etiquetaOrigenTC(mes.tc.origen)}</span>
          </div>
          <div className="num text-ink font-medium">{pesos(gastos)}</div>
        </div>
      </div>

      {ultimo.acumulado !== null && (
        <div className="mt-3.5 px-2.5 py-2 rounded-lg text-[13px] leading-relaxed bg-[#EEF4EF] text-[#3A6644]">
          A este ritmo, en {etiquetaMes(ultimo.mes).toLowerCase()} acumulás {textoAhorro(ultimo.acumulado)}.
        </div>
      )}
    </div>
  );
}
```

- [ ] **Step 4: `DetalleMes`**

```tsx
// components/plan/DetalleMes.tsx
"use client";

import { pesos } from "@/lib/money";
import { etiquetaOrigenTC } from "@/lib/plan/etiquetas";
import type { LineaPlan, MesPlan } from "@/lib/plan/calculo";
import { IconoLapiz } from "./Iconos";
import { textoAhorro, colorAhorro } from "./ResumenMes";

function Linea({
  nombre,
  monto,
  ajustado,
  detalle,
  onClick,
}: {
  nombre: string;
  monto: number;
  ajustado: boolean;
  detalle?: string;
  onClick?: () => void;
}) {
  const contenido = (
    <>
      <span className="flex-1 text-left text-ink">
        {nombre}
        {detalle && <span className="ml-1.5 text-[11px] text-muted">{detalle}</span>}
      </span>
      <span className={`num text-ink ${ajustado ? "underline decoration-dotted underline-offset-[3px]" : ""}`}>{pesos(monto)}</span>
      {onClick && <IconoLapiz className="w-5 h-5 text-muted shrink-0" />}
    </>
  );
  if (!onClick) return <div className="flex items-center gap-2 min-h-[44px] text-[13px]">{contenido}</div>;
  return (
    <button
      type="button"
      onClick={onClick}
      className="w-full flex items-center gap-2 min-h-[44px] text-[13px] rounded-lg px-1 -mx-1 cursor-pointer hover:bg-bg transition-colors duration-150 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ink/40"
      style={{ touchAction: "manipulation" }}
    >
      {contenido}
    </button>
  );
}

function Bloque({ titulo, lineas, total, onEditar }: { titulo: string; lineas: LineaPlan[]; total: number; onEditar: (rubroId: string) => void }) {
  return (
    <div className="mt-3">
      <div className="flex justify-between text-[11px] tracking-wider uppercase text-muted font-semibold">
        <span>{titulo}</span>
        <span className="num">{pesos(total)}</span>
      </div>
      {lineas.length === 0 && <div className="text-[13px] text-muted py-2.5">Sin {titulo.toLowerCase()} este mes.</div>}
      {lineas.map((l) => (
        <Linea key={l.rubroId} nombre={l.nombre} monto={l.monto} ajustado={l.ajustado} onClick={() => onEditar(l.rubroId)} />
      ))}
    </div>
  );
}

export function DetalleMes({ mes, onEditar }: { mes: MesPlan; onEditar: (rubroId: string | null) => void }) {
  return (
    <div className="px-4 pb-4">
      <Bloque titulo="Ingresos" lineas={mes.ingresos} total={mes.totalIngresos} onEditar={onEditar} />
      <Bloque titulo="Fijos" lineas={mes.fijos} total={mes.totalFijos} onEditar={onEditar} />

      <div className="mt-3">
        <div className="text-[11px] tracking-wider uppercase text-muted font-semibold">Tarjeta</div>
        <Linea
          nombre="Factura del ciclo"
          detalle={etiquetaOrigenTC(mes.tc.origen)}
          monto={mes.tc.monto}
          ajustado={mes.tc.origen === "manual"}
          onClick={mes.tc.editable ? () => onEditar(null) : undefined}
        />
        {mes.tc.origen === "sin_datos" && <div className="text-[12px] text-muted">Sin ciclos cerrados con gasto: ajustá el estimado a mano.</div>}
      </div>

      <div className="mt-3 pt-3 border-t border-line flex justify-between text-[13px]">
        <span className="text-muted">Ahorro del mes</span>
        <span className={`num font-semibold ${colorAhorro(mes.ahorro)}`}>{textoAhorro(mes.ahorro)}</span>
      </div>
      {mes.acumulado !== null && (
        <div className="flex justify-between text-[13px] mt-1">
          <span className="text-muted">Acumulado</span>
          <span className={`num ${colorAhorro(mes.acumulado)}`}>{textoAhorro(mes.acumulado)}</span>
        </div>
      )}
    </div>
  );
}
```

- [ ] **Step 5: `ListaMeses`**

```tsx
// components/plan/ListaMeses.tsx
"use client";

import { etiquetaMes } from "@/lib/plan/etiquetas";
import type { MesPlan } from "@/lib/plan/calculo";
import { IconoChevron } from "./Iconos";
import { DetalleMes } from "./DetalleMes";
import { textoAhorro, colorAhorro } from "./ResumenMes";

export function ListaMeses({
  plan,
  abierto,
  onAbrir,
  onEditar,
}: {
  plan: MesPlan[];
  abierto: string | null;
  onAbrir: (mes: string | null) => void;
  onEditar: (mes: string, rubroId: string | null) => void;
}) {
  return (
    <div className="bg-surface border border-line rounded-2xl divide-y divide-line">
      {plan.map((m) => {
        const estaAbierto = abierto === m.mes;
        return (
          <div key={m.mes} id={`mes-${m.mes}`} className={m.esActual ? "bg-[#F7F5FA]" : ""}>
            <button
              type="button"
              aria-expanded={estaAbierto}
              aria-controls={`detalle-${m.mes}`}
              onClick={() => onAbrir(estaAbierto ? null : m.mes)}
              className="w-full flex items-center gap-3 min-h-[56px] px-4 text-left cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ink/40 rounded-2xl"
              style={{ touchAction: "manipulation" }}
            >
              <span className={`flex-1 text-[15px] ${m.esActual ? "font-semibold text-ink" : "text-ink"}`}>
                {etiquetaMes(m.mes)}
                {m.esActual && <span className="ml-2 text-[11px] text-muted font-normal">hoy</span>}
              </span>
              <span className={`num text-[15px] font-medium ${colorAhorro(m.ahorro)}`}>{textoAhorro(m.ahorro)}</span>
              <IconoChevron className={`w-5 h-5 text-muted transition-transform duration-200 ${estaAbierto ? "rotate-180" : ""}`} />
            </button>
            <div
              id={`detalle-${m.mes}`}
              className="grid transition-[grid-template-rows,opacity] duration-200 ease-out"
              style={{ gridTemplateRows: estaAbierto ? "1fr" : "0fr", opacity: estaAbierto ? 1 : 0 }}
            >
              <div className="overflow-hidden">{estaAbierto && <DetalleMes mes={m} onEditar={(rubroId) => onEditar(m.mes, rubroId)} />}</div>
            </div>
          </div>
        );
      })}
    </div>
  );
}
```

- [ ] **Step 6: `PlanClient` (lectura)**

```tsx
// components/plan/PlanClient.tsx
"use client";

import { useMemo, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { useToast } from "@/hooks/useToast";
import { hoyISO } from "@/lib/ciclo";
import { calcularPlan } from "@/lib/plan/calculo";
import type { Expense, PlanAjuste, PlanRubro } from "@/lib/types";
import { Banner } from "@/components/ui/Banner";
import { Toast } from "@/components/ui/Toast";
import { SubTabs, type VistaPlan } from "./SubTabs";
import { ResumenMes } from "./ResumenMes";
import { ListaMeses } from "./ListaMeses";

export function PlanClient({
  cuentaId,
  rubrosIniciales,
  ajustesIniciales,
  gastos,
  lecturaFallida,
}: {
  cuentaId: string;
  rubrosIniciales: PlanRubro[];
  ajustesIniciales: PlanAjuste[];
  gastos: Expense[];
  lecturaFallida: boolean;
}) {
  const supabase = useMemo(() => createClient(), []);
  const { mensaje: toast, mostrar } = useToast();

  const [rubros, setRubros] = useState(rubrosIniciales);
  const [ajustes, setAjustes] = useState(ajustesIniciales);
  const [vista, setVista] = useState<VistaPlan>("meses");
  const hoy = hoyISO();
  const [abierto, setAbierto] = useState<string | null>(hoy.slice(0, 7));

  const plan = useMemo(() => calcularPlan({ rubros, ajustes, gastos, hoy }), [rubros, ajustes, gastos, hoy]);
  const actual = plan.find((m) => m.esActual) ?? plan[0];
  const ultimo = plan[plan.length - 1];
  const hayIngresos = rubros.some((r) => r.tipo === "ingreso");

  // supabase, cuentaId, setRubros, setAjustes y mostrar se usan en las Tasks 11 y 12.
  void supabase;
  void cuentaId;
  void setRubros;
  void setAjustes;
  void mostrar;

  return (
    <>
      {lecturaFallida && <Banner>No se pudo cargar el plan. Recargá la página.</Banner>}

      <SubTabs vista={vista} onCambiar={setVista} />

      {vista === "meses" && (
        <>
          {!lecturaFallida && !hayIngresos && (
            <Banner tono="info" accion={{ etiqueta: "Agregar", onClick: () => setVista("rubros") }}>
              Agregá tus ingresos y gastos fijos para ver el ahorro.
            </Banner>
          )}
          <ResumenMes mes={actual} ultimo={ultimo} />
          <ListaMeses plan={plan} abierto={abierto} onAbrir={setAbierto} onEditar={() => {}} />
        </>
      )}

      {vista === "rubros" && <div className="text-[13px] text-muted">Próximamente.</div>}

      <Toast mensaje={toast} />
    </>
  );
}
```

- [ ] **Step 7: `NavTabs`**

En `components/NavTabs.tsx`, dentro de `TABS`, después de Historial:

```ts
  { href: "/plan", label: "Plan" },
```

- [ ] **Step 8: Typecheck, lint, build**

Run: `npx tsc --noEmit && npm run lint && npm run build`
Expected: sin errores. Si `void` de variables sin usar dispara una regla de lint, dejar las variables sin declarar en esta tarea y agregarlas en la 11 — no desactivar la regla.

- [ ] **Step 9: Verificación visual**

Levantar la app (`npm run dev` vía el navegador integrado; si `.env.local` no tiene las llaves de Supabase, sacarlas del Management API: `GET /v1/projects/jwipheuvrhqlgivmxvur/api-keys?reveal=true`, tipo `legacy`). A 375px de ancho:

- La pestaña **Plan** aparece en el nav y las cinco pestañas caben sin cortar texto.
- Sin rubros: banner azul, tarjeta con "—", lista de 10 meses; el mes actual está abierto y muestra la Tarjeta con su chip de origen; los meses cerrados muestran `factura`.
- Expandir/colapsar es suave; el chevron rota.
- No hay scroll horizontal.

- [ ] **Step 10: Commit**

```bash
git add "app/(app)/plan/page.tsx" components/plan/PlanClient.tsx components/plan/SubTabs.tsx components/plan/ResumenMes.tsx components/plan/ListaMeses.tsx components/plan/DetalleMes.tsx components/NavTabs.tsx
git commit -m "feat(plan): pestaña Plan en modo lectura — resumen del mes y acordeón de meses

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

### Task 11: `AjusteSheet` y mutaciones optimistas de ajustes

**Files:**
- Create: `components/plan/AjusteSheet.tsx`
- Modify: `components/plan/PlanClient.tsx`

**Interfaces:**
- Consumes: `Sheet`, `Button`, `formatearMiles`, `parsearMonto`, `guardarAjuste`, `quitarAjuste`, `etiquetaMes`, `etiquetaOrigenTC`, `pesos`, `MesPlan`, `LineaPlan`.
- Produces: `AjusteSheet` con props `{ titulo, montoActual, referencia: { etiqueta: string; monto: number }, tieneAjuste, onGuardar(monto), onQuitar(), onCerrar }`.

- [ ] **Step 1: `AjusteSheet`**

```tsx
// components/plan/AjusteSheet.tsx
"use client";

import { useState } from "react";
import { Sheet } from "@/components/ui/Sheet";
import { Button } from "@/components/ui/Button";
import { pesos } from "@/lib/money";
import { formatearMiles, parsearMonto } from "@/lib/plan/formato";

export function AjusteSheet({
  titulo,
  montoActual,
  referencia,
  tieneAjuste,
  onGuardar,
  onQuitar,
  onCerrar,
}: {
  titulo: string;
  montoActual: number;
  referencia: { etiqueta: string; monto: number };
  tieneAjuste: boolean;
  onGuardar: (monto: number) => void;
  onQuitar: () => void;
  onCerrar: () => void;
}) {
  const [texto, setTexto] = useState(formatearMiles(String(montoActual)));
  const [error, setError] = useState<string | null>(null);
  const [enviando, setEnviando] = useState(false);

  const validar = (): number | null => {
    const n = parsearMonto(texto);
    if (n === null) {
      setError("Escribí un monto (puede ser 0).");
      return null;
    }
    setError(null);
    return n;
  };

  const guardar = () => {
    const n = validar();
    if (n === null) return;
    setEnviando(true);
    onGuardar(n);
  };

  return (
    <Sheet titulo={titulo} onClose={onCerrar}>
      <label htmlFor="ajuste-monto" className="block text-[11px] tracking-wider uppercase text-muted font-semibold mt-3.5">
        Monto de este mes
      </label>
      <div className="relative mt-1.5">
        <span className="absolute left-3 top-1/2 -translate-y-1/2 text-muted text-[20px] num">$</span>
        <input
          id="ajuste-monto"
          autoFocus
          inputMode="numeric"
          value={texto}
          onChange={(e) => setTexto(formatearMiles(e.target.value))}
          onBlur={validar}
          onKeyDown={(e) => e.key === "Enter" && guardar()}
          aria-invalid={Boolean(error)}
          aria-describedby={error ? "ajuste-error" : undefined}
          className={`w-full border-[1.5px] rounded-lg pl-8 pr-3 py-3 num text-[24px] text-ink ${error ? "border-alerta" : "border-line"}`}
        />
      </div>
      {error && (
        <div id="ajuste-error" className="text-[12px] text-alerta mt-1.5">
          {error}
        </div>
      )}
      <div className="text-[13px] text-muted mt-2">
        {referencia.etiqueta}: <span className="num">{pesos(referencia.monto)}</span>
      </div>

      <div className="flex flex-col gap-2 mt-5">
        <Button variant="primary" onClick={guardar} disabled={enviando}>
          {enviando ? "Guardando…" : "Guardar"}
        </Button>
        {tieneAjuste && (
          <Button onClick={onQuitar} disabled={enviando}>
            Volver a {referencia.etiqueta.toLowerCase()}
          </Button>
        )}
      </div>
    </Sheet>
  );
}
```

- [ ] **Step 2: Conectar en `PlanClient`**

Reemplazar el bloque de `void` y el `onEditar={() => {}}` por esto. Imports nuevos:

```tsx
import { guardarAjuste, quitarAjuste } from "@/lib/plan/queries";
import { etiquetaMes, etiquetaOrigenTC } from "@/lib/plan/etiquetas";
import { AjusteSheet } from "./AjusteSheet";
```

Estado y lógica (dentro del componente, después de `plan`):

```tsx
  const [editando, setEditando] = useState<{ mes: string; rubroId: string | null } | null>(null);

  const mismoAjuste = (a: PlanAjuste, mes: string, rubroId: string | null) => a.mes === mes && a.rubro_id === rubroId;

  const guardar = async (mes: string, rubroId: string | null, monto: number) => {
    const anterior = ajustes;
    const existente = ajustes.find((a) => mismoAjuste(a, mes, rubroId));
    const provisional: PlanAjuste = existente
      ? { ...existente, monto }
      : { id: `tmp-${mes}-${rubroId ?? "tc"}`, cuenta_id: cuentaId, mes, rubro_id: rubroId, monto, updated_at: "" };
    // Optimista: se ve el cambio ya; si falla, vuelve lo anterior.
    setAjustes((prev) => [...prev.filter((a) => !mismoAjuste(a, mes, rubroId)), provisional]);
    setEditando(null);
    const { data, error } = await guardarAjuste(supabase, cuentaId, mes, rubroId, monto);
    if (error || !data) {
      setAjustes(anterior);
      mostrar("No se pudo guardar el ajuste");
      return;
    }
    setAjustes((prev) => prev.map((a) => (a.id === provisional.id ? data : a)));
  };

  const quitar = async (mes: string, rubroId: string | null) => {
    const anterior = ajustes;
    setAjustes((prev) => prev.filter((a) => !mismoAjuste(a, mes, rubroId)));
    setEditando(null);
    const { error } = await quitarAjuste(supabase, cuentaId, mes, rubroId);
    if (error) {
      setAjustes(anterior);
      mostrar("No se pudo quitar el ajuste");
    }
  };

  // Datos que la hoja necesita para el ajuste abierto.
  const hoja = (() => {
    if (!editando) return null;
    const m = plan.find((x) => x.mes === editando.mes);
    if (!m) return null;
    if (editando.rubroId === null) {
      return {
        titulo: `Tarjeta · ${etiquetaMes(m.mes).toLowerCase()}`,
        montoActual: m.tc.monto,
        referencia: { etiqueta: capitalizar(etiquetaOrigenTC(m.tc.origenReferencia)), monto: m.tc.referencia },
        tieneAjuste: m.tc.origen === "manual",
      };
    }
    const linea = [...m.ingresos, ...m.fijos].find((l) => l.rubroId === editando.rubroId);
    if (!linea) return null;
    return {
      titulo: `${linea.nombre} · ${etiquetaMes(m.mes).toLowerCase()}`,
      montoActual: linea.monto,
      referencia: { etiqueta: "Por defecto", monto: linea.montoDefault },
      tieneAjuste: linea.ajustado,
    };
  })();
```

Helper a nivel de módulo (fuera del componente):

```tsx
const capitalizar = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);
```

Render (antes de `<Toast>`), y pasar `onEditar`:

```tsx
          <ListaMeses plan={plan} abierto={abierto} onAbrir={setAbierto} onEditar={(mes, rubroId) => setEditando({ mes, rubroId })} />
```

```tsx
      {editando && hoja && (
        <AjusteSheet
          {...hoja}
          onGuardar={(monto) => guardar(editando.mes, editando.rubroId, monto)}
          onQuitar={() => quitar(editando.mes, editando.rubroId)}
          onCerrar={() => setEditando(null)}
        />
      )}
```

- [ ] **Step 3: Typecheck, lint, tests**

Run: `npx tsc --noEmit && npm run lint && npm test`
Expected: verde.

- [ ] **Step 4: Verificación visual (375px)**

- Abrir un mes futuro → tocar "Factura del ciclo" → sube la hoja, el input tiene foco, se ven puntos de miles al escribir.
- Guardar → la hoja cierra, el monto cambia al instante, aparece el subrayado punteado y el chip dice `ajustado`; el ahorro y el acumulado se recalculan.
- Volver a abrir → "Volver a promedio 3 ciclos" → el monto vuelve.
- Un mes cerrado: "Factura del ciclo" no es botón (no hay lápiz, no abre nada).
- **Reversión**: en DevTools poner la red en Offline, guardar un ajuste → el monto cambia, luego vuelve, y sale el toast "No se pudo guardar el ajuste".
- Escape cierra la hoja; tap afuera cierra la hoja.

- [ ] **Step 5: Commit**

```bash
git add components/plan/AjusteSheet.tsx components/plan/PlanClient.tsx
git commit -m "feat(plan): editar montos por mes con hoja inferior y guardado optimista

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

### Task 12: Vista Rubros — `RubrosPanel`, `RubroSheet` y sus mutaciones

**Files:**
- Create: `components/plan/RubrosPanel.tsx`, `components/plan/RubroSheet.tsx`
- Modify: `components/plan/PlanClient.tsx`

**Interfaces:**
- Consumes: `crearRubro`, `actualizarRubro`, `eliminarRubro`; `etiquetaVigencia`; `formatearMiles`, `parsearMonto`; `Sheet`, `Button`; `IconoMas`, `IconoLapiz`; `PlanRubro`, `NuevoRubro`, `TipoRubro`.
- Produces: `RubrosPanel({ rubros, onNuevo(tipo), onEditar(rubro) })`; `RubroSheet({ inicial: PlanRubro | null, tipoInicial, mesActual, ajustesDelRubro: number, onGuardar(datos: NuevoRubro), onEliminar(), onCerrar })`.

- [ ] **Step 1: `RubrosPanel`**

```tsx
// components/plan/RubrosPanel.tsx
"use client";

import { pesos } from "@/lib/money";
import { etiquetaVigencia } from "@/lib/plan/etiquetas";
import type { PlanRubro, TipoRubro } from "@/lib/types";
import { IconoLapiz, IconoMas } from "./Iconos";

function Lista({
  titulo,
  tipo,
  rubros,
  onNuevo,
  onEditar,
}: {
  titulo: string;
  tipo: TipoRubro;
  rubros: PlanRubro[];
  onNuevo: (tipo: TipoRubro) => void;
  onEditar: (r: PlanRubro) => void;
}) {
  return (
    <div className="bg-surface border border-line rounded-2xl mb-3.5">
      <div className="px-4 pt-3.5 pb-1 text-[11px] tracking-wider uppercase text-muted font-semibold">{titulo}</div>
      <div className="divide-y divide-line">
        {rubros.length === 0 && <div className="px-4 py-3 text-[13px] text-muted">Todavía no hay {titulo.toLowerCase()}.</div>}
        {rubros.map((r) => (
          <button
            key={r.id}
            type="button"
            onClick={() => onEditar(r)}
            className="w-full flex items-center gap-3 min-h-[56px] px-4 text-left cursor-pointer hover:bg-bg transition-colors duration-150 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ink/40"
            style={{ touchAction: "manipulation" }}
          >
            <span className="flex-1">
              <span className="block text-[15px] text-ink">{r.nombre}</span>
              <span className="block text-[12px] text-muted">{etiquetaVigencia(r.desde, r.hasta)}</span>
            </span>
            <span className="num text-[15px] text-ink">{pesos(r.monto_default)}</span>
            <IconoLapiz className="w-5 h-5 text-muted shrink-0" />
          </button>
        ))}
        <button
          type="button"
          onClick={() => onNuevo(tipo)}
          className="w-full flex items-center gap-2 min-h-[48px] px-4 text-[13px] text-ink font-medium cursor-pointer hover:bg-bg transition-colors duration-150 rounded-b-2xl focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ink/40"
        >
          <IconoMas className="w-5 h-5" />
          Agregar {tipo === "ingreso" ? "ingreso" : "fijo"}
        </button>
      </div>
    </div>
  );
}

export function RubrosPanel({
  rubros,
  onNuevo,
  onEditar,
}: {
  rubros: PlanRubro[];
  onNuevo: (tipo: TipoRubro) => void;
  onEditar: (r: PlanRubro) => void;
}) {
  return (
    <>
      <Lista titulo="Ingresos" tipo="ingreso" rubros={rubros.filter((r) => r.tipo === "ingreso")} onNuevo={onNuevo} onEditar={onEditar} />
      <Lista titulo="Fijos" tipo="fijo" rubros={rubros.filter((r) => r.tipo === "fijo")} onNuevo={onNuevo} onEditar={onEditar} />
    </>
  );
}
```

- [ ] **Step 2: `RubroSheet`**

```tsx
// components/plan/RubroSheet.tsx
"use client";

import { useState } from "react";
import { Sheet } from "@/components/ui/Sheet";
import { Button } from "@/components/ui/Button";
import { formatearMiles, parsearMonto } from "@/lib/plan/formato";
import type { NuevoRubro, PlanRubro, TipoRubro } from "@/lib/types";

const campo = "w-full border-[1.5px] border-line rounded-lg px-3 py-3 text-[15px] text-ink mt-1.5 bg-surface";
const etiqueta = "block text-[11px] tracking-wider uppercase text-muted font-semibold mt-3.5";

export function RubroSheet({
  inicial,
  tipoInicial,
  mesActual,
  ajustesDelRubro,
  onGuardar,
  onEliminar,
  onCerrar,
}: {
  inicial: PlanRubro | null;
  tipoInicial: TipoRubro;
  mesActual: string;
  ajustesDelRubro: number;
  onGuardar: (datos: NuevoRubro) => void;
  onEliminar: () => void;
  onCerrar: () => void;
}) {
  const [tipo, setTipo] = useState<TipoRubro>(inicial?.tipo ?? tipoInicial);
  const [nombre, setNombre] = useState(inicial?.nombre ?? "");
  const [monto, setMonto] = useState(inicial ? formatearMiles(String(inicial.monto_default)) : "");
  const [desde, setDesde] = useState(inicial?.desde ?? mesActual);
  const [puntual, setPuntual] = useState(Boolean(inicial && inicial.hasta === inicial.desde));
  const [hasta, setHasta] = useState(inicial?.hasta && inicial.hasta !== inicial.desde ? inicial.hasta : "");
  const [error, setError] = useState<string | null>(null);
  const [confirmandoBorrar, setConfirmandoBorrar] = useState(false);
  const [enviando, setEnviando] = useState(false);

  const validar = (): NuevoRubro | null => {
    const n = parsearMonto(monto);
    if (!nombre.trim()) return setError("Ponele un nombre."), null;
    if (n === null) return setError("Escribí un monto (puede ser 0)."), null;
    if (!/^\d{4}-\d{2}$/.test(desde)) return setError("Elegí el mes desde el que aplica."), null;
    const hastaFinal = puntual ? desde : hasta || null;
    if (hastaFinal !== null && hastaFinal < desde) return setError("El mes final no puede ser antes del inicial."), null;
    setError(null);
    return { tipo, nombre: nombre.trim(), monto_default: n, desde, hasta: hastaFinal };
  };

  const guardar = () => {
    const datos = validar();
    if (!datos) return;
    setEnviando(true);
    onGuardar(datos);
  };

  return (
    <Sheet titulo={inicial ? "Editar rubro" : tipoInicial === "ingreso" ? "Nuevo ingreso" : "Nuevo gasto fijo"} onClose={onCerrar}>
      <div role="radiogroup" aria-label="Tipo" className="flex gap-1.5 mt-3.5">
        {(["ingreso", "fijo"] as TipoRubro[]).map((t) => (
          <button
            key={t}
            type="button"
            role="radio"
            aria-checked={tipo === t}
            onClick={() => setTipo(t)}
            className={`flex-1 min-h-[44px] rounded-xl border text-sm cursor-pointer transition-colors duration-200 ${
              tipo === t ? "border-ink bg-ink text-white font-medium" : "border-line bg-surface text-muted"
            }`}
          >
            {t === "ingreso" ? "Ingreso" : "Gasto fijo"}
          </button>
        ))}
      </div>

      <label htmlFor="rubro-nombre" className={etiqueta}>Nombre</label>
      <input id="rubro-nombre" autoFocus value={nombre} onChange={(e) => setNombre(e.target.value)} placeholder={tipo === "ingreso" ? "Nómina David" : "Arriendo"} className={campo} />

      <label htmlFor="rubro-monto" className={etiqueta}>Monto por mes</label>
      <input id="rubro-monto" inputMode="numeric" value={monto} onChange={(e) => setMonto(formatearMiles(e.target.value))} onKeyDown={(e) => e.key === "Enter" && guardar()} className={`${campo} num text-[20px]`} />

      <label htmlFor="rubro-desde" className={etiqueta}>Desde</label>
      <input id="rubro-desde" type="month" value={desde} onChange={(e) => setDesde(e.target.value)} className={campo} />

      <label className="flex items-center gap-2.5 min-h-[44px] mt-2 text-[13px] text-ink cursor-pointer">
        <input type="checkbox" checked={puntual} onChange={(e) => setPuntual(e.target.checked)} className="w-5 h-5 accent-ink" />
        Puntual (un solo mes)
      </label>

      {!puntual && (
        <>
          <label htmlFor="rubro-hasta" className={etiqueta}>Hasta (opcional)</label>
          <input id="rubro-hasta" type="month" value={hasta} onChange={(e) => setHasta(e.target.value)} className={campo} />
        </>
      )}

      {error && <div className="text-[12px] text-alerta mt-2">{error}</div>}

      <div className="flex flex-col gap-2 mt-5">
        <Button variant="primary" onClick={guardar} disabled={enviando}>
          {enviando ? "Guardando…" : "Guardar"}
        </Button>
        {inicial && !confirmandoBorrar && (
          <Button onClick={() => setConfirmandoBorrar(true)} disabled={enviando}>
            Eliminar
          </Button>
        )}
        {inicial && confirmandoBorrar && (
          <Button onClick={onEliminar} disabled={enviando} className="border-alerta text-alerta">
            {ajustesDelRubro > 0 ? `Sí, eliminar (se pierden ${ajustesDelRubro} ajustes)` : "Sí, eliminar"}
          </Button>
        )}
      </div>
    </Sheet>
  );
}
```

- [ ] **Step 3: Conectar en `PlanClient`**

Imports nuevos:

```tsx
import { crearRubro, actualizarRubro, eliminarRubro } from "@/lib/plan/queries";
import type { NuevoRubro, TipoRubro } from "@/lib/types";
import { RubrosPanel } from "./RubrosPanel";
import { RubroSheet } from "./RubroSheet";
```

Estado y mutaciones:

```tsx
  const [hojaRubro, setHojaRubro] = useState<{ rubro: PlanRubro | null; tipo: TipoRubro } | null>(null);

  const guardarRubro = async (datos: NuevoRubro) => {
    if (!hojaRubro) return;
    const anterioresR = rubros;
    setHojaRubro(null);
    if (hojaRubro.rubro) {
      const id = hojaRubro.rubro.id;
      setRubros((prev) => prev.map((r) => (r.id === id ? { ...r, ...datos } : r)));
      const { data, error } = await actualizarRubro(supabase, id, datos);
      if (error || !data) {
        setRubros(anterioresR);
        mostrar("No se pudo guardar el rubro");
        return;
      }
      setRubros((prev) => prev.map((r) => (r.id === id ? data : r)));
      return;
    }
    const idTmp = `tmp-${Date.now()}`;
    const provisional: PlanRubro = { id: idTmp, cuenta_id: cuentaId, orden: 0, created_by: null, created_at: new Date().toISOString(), updated_at: "", ...datos };
    setRubros((prev) => [...prev, provisional]);
    const { data, error } = await crearRubro(supabase, cuentaId, datos);
    if (error || !data) {
      setRubros(anterioresR);
      mostrar("No se pudo crear el rubro");
      return;
    }
    setRubros((prev) => prev.map((r) => (r.id === idTmp ? data : r)));
  };

  const borrarRubro = async () => {
    if (!hojaRubro?.rubro) return;
    const id = hojaRubro.rubro.id;
    const anterioresR = rubros;
    const anterioresA = ajustes;
    setHojaRubro(null);
    setRubros((prev) => prev.filter((r) => r.id !== id));
    setAjustes((prev) => prev.filter((a) => a.rubro_id !== id)); // la base cascadea; el estado también
    const { error } = await eliminarRubro(supabase, id);
    if (error) {
      setRubros(anterioresR);
      setAjustes(anterioresA);
      mostrar("No se pudo eliminar el rubro");
    }
  };
```

Reemplazar el `Próximamente` por:

```tsx
      {vista === "rubros" && (
        <RubrosPanel
          rubros={rubros}
          onNuevo={(tipo) => setHojaRubro({ rubro: null, tipo })}
          onEditar={(rubro) => setHojaRubro({ rubro, tipo: rubro.tipo })}
        />
      )}
```

Y el banner de estado vacío debe abrir la hoja directamente:

```tsx
            <Banner tono="info" accion={{ etiqueta: "Agregar", onClick: () => { setVista("rubros"); setHojaRubro({ rubro: null, tipo: "ingreso" }); } }}>
```

Render de la hoja (junto a `AjusteSheet`):

```tsx
      {hojaRubro && (
        <RubroSheet
          inicial={hojaRubro.rubro}
          tipoInicial={hojaRubro.tipo}
          mesActual={hoy.slice(0, 7)}
          ajustesDelRubro={hojaRubro.rubro ? ajustes.filter((a) => a.rubro_id === hojaRubro.rubro!.id).length : 0}
          onGuardar={guardarRubro}
          onEliminar={borrarRubro}
          onCerrar={() => setHojaRubro(null)}
        />
      )}
```

- [ ] **Step 4: Typecheck, lint, tests, build**

Run: `npx tsc --noEmit && npm run lint && npm test && npm run build`
Expected: verde.

- [ ] **Step 5: Verificación visual (375px)**

- Banner "Agregar" → cambia a Rubros y abre la hoja de nuevo ingreso con el foco en Nombre.
- Crear "Nómina David" $10.000.000 desde el mes actual → aparece en la lista; volver a Meses → el banner desaparece, la tarjeta muestra el ahorro con signo, el acumulado se llena.
- Crear un fijo puntual (checkbox) → vigencia dice "solo <mes>"; en Meses aparece solo en ese mes.
- Editar el rubro → cambiar el monto → la lista y los meses se actualizan.
- Eliminar → primer tap muestra "Sí, eliminar (se pierden N ajustes)" en rojo; segundo tap borra.
- Reversión con red Offline: crear un rubro → aparece y desaparece con toast.

- [ ] **Step 6: Commit**

```bash
git add components/plan/RubrosPanel.tsx components/plan/RubroSheet.tsx components/plan/PlanClient.tsx
git commit -m "feat(plan): gestión de ingresos y fijos recurrentes con vigencia y guardado optimista

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

### Task 13: `GraficaAhorro`

**Files:**
- Create: `components/plan/GraficaAhorro.tsx`
- Modify: `components/plan/PlanClient.tsx`

**Interfaces:**
- Consumes: Recharts (`BarChart`, `Bar`, `Cell`, `XAxis`, `Tooltip`, `LabelList`, `ReferenceLine`, `ResponsiveContainer`); `etiquetaMesCorta`, `etiquetaMes`; `pesos`, `pesosCorto`; `MesPlan`.
- Produces: `GraficaAhorro({ plan, onSeleccionar(mes) })`.

- [ ] **Step 1: Componente**

```tsx
// components/plan/GraficaAhorro.tsx
"use client";

import { Bar, BarChart, Cell, LabelList, ReferenceLine, ResponsiveContainer, Tooltip, XAxis } from "recharts";
import { etiquetaMes, etiquetaMesCorta } from "@/lib/plan/etiquetas";
import { pesos, pesosCorto } from "@/lib/money";
import type { MesPlan } from "@/lib/plan/calculo";

const OK = "#4E8C5A";
const ALERTA = "#C4544F";

function TooltipAhorro({ active, payload }: { active?: boolean; payload?: { payload: MesPlan }[] }) {
  if (!active || !payload?.length) return null;
  const m = payload[0].payload;
  return (
    <div className="bg-ink text-white text-xs rounded-lg px-2.5 py-1.5">
      <div className="font-semibold">{etiquetaMes(m.mes)}</div>
      <div className="num">{m.ahorro === null ? "—" : pesos(m.ahorro)}</div>
    </div>
  );
}

export function GraficaAhorro({ plan, onSeleccionar }: { plan: MesPlan[]; onSeleccionar: (mes: string) => void }) {
  const datos = plan.map((m) => ({ ...m, valor: m.ahorro ?? 0 }));
  return (
    <div className="bg-surface border border-line rounded-2xl px-1 pt-4 pb-2.5 mb-3.5" style={{ height: 170 }}>
      <ResponsiveContainer width="100%" height={150}>
        <BarChart data={datos} margin={{ top: 18, right: 12, left: 12, bottom: 0 }} barCategoryGap="22%">
          <XAxis dataKey="mes" tickFormatter={etiquetaMesCorta} tick={{ fontSize: 10, fill: "#6E6879" }} axisLine={false} tickLine={false} />
          <ReferenceLine y={0} stroke="#211D2B" strokeOpacity={0.25} />
          <Tooltip cursor={{ fill: "rgba(33,29,43,0.06)" }} content={<TooltipAhorro />} />
          <Bar dataKey="valor" radius={[5, 5, 2, 2]} onClick={(d: MesPlan) => onSeleccionar(d.mes)} cursor="pointer" isAnimationActive={false}>
            {/* Estimados (todo lo que no es factura) van translúcidos, como GraficaCiclos hace con el ciclo en curso. */}
            {datos.map((m) => (
              <Cell key={m.mes} fill={m.valor < 0 ? ALERTA : OK} fillOpacity={m.tc.origen === "real" ? 1 : 0.55} />
            ))}
            <LabelList dataKey="valor" position="top" formatter={(v: number) => (v === 0 ? "" : pesosCorto(v))} style={{ fontSize: 10, fill: "#6E6879" }} />
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}
```

- [ ] **Step 2: Conectar en `PlanClient`**

Import y render entre `ResumenMes` y `ListaMeses`:

```tsx
import { GraficaAhorro } from "./GraficaAhorro";
```

```tsx
          <GraficaAhorro
            plan={plan}
            onSeleccionar={(mes) => {
              setAbierto(mes);
              document.getElementById(`mes-${mes}`)?.scrollIntoView({ behavior: "smooth", block: "center" });
            }}
          />
```

- [ ] **Step 3: Typecheck, lint, build**

Run: `npx tsc --noEmit && npm run lint && npm run build`
Expected: verde.

- [ ] **Step 4: Verificación visual (375px)**

- Barras verdes/rojas según signo, translúcidas en meses estimados, con valor encima.
- Tocar una barra abre ese mes y la lista hace scroll hasta él.
- La altura está reservada: nada salta al cargar.
- Sin scroll horizontal.

- [ ] **Step 5: Commit**

```bash
git add components/plan/GraficaAhorro.tsx components/plan/PlanClient.tsx
git commit -m "feat(plan): gráfica de ahorro por mes que abre el mes al tocarlo

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

### Task 14: Cierre — verificación completa, review por dimensiones y PR

**Files:**
- Ninguno nuevo (posibles fixes de review).

- [ ] **Step 1: Gate determinista**

Run: `npm test && npx tsc --noEmit && npm run lint && npm run build`
Expected: todo en verde. Anotar el número total de tests.

- [ ] **Step 2: Invariantes del spec**

```bash
grep -c "alter table" supabase/migrations/0011_plan_mensual.sql        # esperado: 2 (los enable RLS)
git diff --stat main -- lib/ciclo.ts lib/supabase/queries.ts components/registro components/historial components/pendientes  # esperado: vacío
git diff --stat main -- components/NavTabs.tsx                          # esperado: 1 línea
grep -rn "catch" components/plan lib/plan                               # esperado: nada (los errores viajan en { error })
```

- [ ] **Step 3: Verificación visual final (375px y 768px)**

Recorrido completo con datos reales de la cuenta: estado vacío → crear ingreso y fijo → ver ahorro → ajustar TC de un mes futuro → quitar ajuste → mes cerrado no editable → gráfica → eliminar rubro. Sin scroll horizontal, sin texto cortado en el nav.

- [ ] **Step 4: Review por dimensiones distintas (L2)**

Invocar `agent-teams:team-review` sobre `git diff main...HEAD` con **tres** revisores, uno por dimensión:

- **Seguridad**: RLS de `plan_*` (positivo y negativo), que ningún input del cliente decida `cuenta_id` distinto al propio, que `created_by` no sea falsificable, sanidad de `type="month"`.
- **Arquitectura**: aislamiento (solo lectura de `expenses`, ningún cambio a módulos existentes fuera de los cuatro archivos permitidos), que `calcularPlan` no dependa de React ni de Supabase, que `lib/plan/` sea autocontenido.
- **Testing**: que los bordes del spec (15/16, ciclo cerrado ignora ajuste, cero no entra al promedio, `ahorro null`, acumulado desde hoy) tengan test, y que ningún test dependa de la fecha real.

Corregir hallazgos reales con commits `fix(plan): …`. Un "se ve bien" no es evidencia; un test nuevo que falla y después pasa sí.

- [ ] **Step 5: Push y PR**

```bash
git push -u origin claude/monthly-income-module-1d6478
gh pr create --base main --title "feat: plan mensual — ingresos, fijos, TC por ciclo y ahorro proyectado" --body "$(cat <<'EOF'
## Qué hace
Pestaña **Plan**: ingresos y gastos fijos recurrentes (con vigencia y ajustes por mes) cruzados con la factura de tarjeta de cada ciclo, para ver el ahorro de cada mes y el acumulado a 6 meses.

## Decisiones
- Meses calendario para ingresos/fijos; la TC del mes M es el ciclo M (cierra el 15, se paga el 30).
- TC: factura exacta si el ciclo cerró; ritmo diario si está en curso; promedio de 3 ciclos cerrados si no empezó. Editable salvo cerrado.
- Módulo aislado: tablas `plan_*` (migración `0011`), solo lectura de `expenses`, ningún `alter table`.

Spec: `docs/superpowers/specs/2026-09-14-plan-mensual-design.md`

## Verificación
- Vitest / tsc / lint / build en verde.
- Migración aplicada en prod y verificada por efecto (columnas, políticas, índice, triggers) + RLS con caso positivo y negativo.
- Recorrido visual a 375px con reversión optimista forzada.

🤖 Generated with [Claude Code](https://claude.com/claude-code)
EOF
)"
```

---

## Self-review del plan

**Cobertura del spec:** rango/vigencia/ajustes (T5), TC por estado del ciclo incl. ajuste ignorado en cerrado y cero fuera del promedio (T6), ahorro/acumulado/`null` (T7), tablas + RLS + verificación por efecto y con SET ROLE (T1), tipos (T2), queries con upsert y errores devueltos (T8), `Sheet`/`Banner info`/íconos SVG (T9), página + acordeón + resumen + NavTabs + estado vacío + `lecturaFallida` (T10), edición optimista con reversión y ciclo cerrado no editable (T11), rubros con puntual/vigencia/eliminar en dos pasos (T12), gráfica con tap → mes (T13), gate + review por dimensiones + PR (T14). Fuera de v1 sigue fuera.

**Desvío consciente respecto al spec:** la gráfica marca los meses estimados con opacidad 0.55 (como `GraficaCiclos` con el ciclo en curso) en vez de un relleno punteado — mismo significado, sin `<pattern>` a mano en Recharts.

**Consistencia de tipos:** `LineaPlan{rubroId,nombre,monto,montoDefault,ajustado}`, `TCPlan{monto,origen,editable,ciclo,referencia,origenReferencia}`, `MesPlan`, `OrigenTC` (definido en `etiquetas.ts`, importado por `calculo.ts`), `guardarAjuste(supabase, cuentaId, mes, rubroId, monto)`, `quitarAjuste(supabase, cuentaId, mes, rubroId)` — mismos nombres en T6/T7/T8/T10/T11/T12/T13.
