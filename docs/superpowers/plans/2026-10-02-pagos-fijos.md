# Pagos de fijos — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Pestaña `/pagos` para marcar como pagados los gastos fijos del mes, con monto real que reemplaza al estimado en el Plan.

**Architecture:** Tabla nueva `plan_pagos` (un pago por fijo y mes) + `plan_rubros.dia_pago`. La lógica (vencimientos, estados, agrupación, prioridad pago → ajuste → default) vive en funciones puras en `lib/pagos/` y `lib/plan/calculo.ts`, probadas con Vitest. La UI sigue los patrones de Plan: server page lee, client component muta optimista con cola por clave.

**Tech Stack:** Next.js App Router, TypeScript, Supabase (Postgres + RLS), Tailwind, Vitest.

**Spec:** `docs/superpowers/specs/2026-10-02-pagos-fijos-design.md`

## Global Constraints

- Idioma de UI y código: español, voseo ("Agregá", "Marcá"), como el resto de la app.
- Fechas como strings `'YYYY-MM-DD'`, meses como `'YYYY-MM'`; aritmética con `lib/ciclo.ts`, nunca `Date` local. "Hoy" = `hoyISO()` (America/Bogota).
- Escrituras con `sinTipar(supabase)` (patrón de `lib/plan/queries.ts`); lecturas tipadas.
- Botones táctiles ≥ 44px.
- Ningún `catch` vacío: todo error de escritura revierte la fila y muestra toast.
- Migración `0013_pagos_fijos.sql`. Producción (`jwipheuvrhqlgivmxvur`) no tiene ledger: se aplica con `POST /v1/projects/{ref}/database/query` (PAT en `~/.config/surtijapon/supabase_pat`, usar `curl`) y se verifica el efecto en `information_schema`/`pg_policies`.
- Commits: Conventional Commits, terminando con `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`.
- Gate de cada tarea: `npx vitest run`, `npx tsc --noEmit`, `npx eslint .` en verde.

## Precisiones al spec (decididas al planear)

1. **Mes anterior sin `dia_pago`**: un fijo del mes anterior sin pagar y sin día se trata como vencido al último día de ese mes (el mes ya terminó). "Sin día nunca vencido" aplica solo al mes actual.
2. **Plan → detalle del mes**: un fijo pagado no abre `AjusteSheet` (la línea no es clickeable y dice "pagado el 8 oct"). El monto se corrige en Pagos. Evita editar un estimado que no se ve.
3. **Pagos solo cuentan para `tipo = 'fijo'`** en `lineasDe`, aunque un rubro con pagos se cambie luego a ingreso.
4. **Contador de la pestaña**: si alguna lectura falla en el layout, se registra con `console.error` y no se muestra contador; la página `/pagos` muestra el Banner de error.

## File Structure

| Archivo | Responsabilidad |
|---|---|
| `supabase/migrations/0013_pagos_fijos.sql` (crear) | `dia_pago`, `plan_pagos`, FK compuesta, trigger, RLS |
| `lib/types.ts` (modificar) | `PlanPago`, `dia_pago` en `PlanRubro`/`NuevoRubro`, tabla en `Database` |
| `lib/plan/calculo.ts` (modificar) | `lineasDe`/`calcularPlan` con pagos: `estimado`, `pagado` |
| `lib/pagos/estado.ts` (crear) | `fechaVencimiento`, `estadoPago`, `itemsPagos`, `agruparPagos`, `contadorPagos`, `resumenPagos` |
| `lib/pagos/etiquetas.ts` (crear) | `textoEstadoPago`, `etiquetaFechaCorta` |
| `lib/pagos/queries.ts` (crear) | `listarPagos`, `marcarPago`, `desmarcarPago` |
| `hooks/useToast.ts`, `components/ui/Toast.tsx` (modificar) | acción opcional ("Deshacer") |
| `hooks/useColaPorClave.ts` (crear) | cola + generación por clave (patrón de `PlanClient`) |
| `components/plan/RubroSheet.tsx` (modificar) | campo "Día de pago" |
| `components/plan/DetalleMes.tsx`, `PlanClient.tsx`, `app/(app)/plan/page.tsx` (modificar) | Plan lee pagos y los muestra |
| `app/(app)/pagos/page.tsx` (crear) | lectura server |
| `components/pagos/PagosClient.tsx`, `ResumenPagos.tsx`, `FilaPago.tsx`, `PagoSheet.tsx` (crear) | pantalla |
| `components/NavTabs.tsx`, `app/(app)/layout.tsx` (modificar) | pestaña + contador |

---

### Task 1: Migración y tipos

**Files:**
- Create: `supabase/migrations/0013_pagos_fijos.sql`
- Modify: `lib/types.ts` (interfaces `PlanRubro` ~L93, `NuevoRubro` ~L108, `Database.public.Tables.plan_rubros` ~L350, agregar `plan_pagos`)
- Modify: `lib/plan/calculo.test.ts` (factoría `rubro()`), `README.md` (lista de migraciones)

**Interfaces:**
- Produces: `PlanPago { id; cuenta_id; rubro_id: string; mes: string; monto: number; pagado_el: string; created_by: string | null; created_at: string; updated_at: string }`; `PlanRubro.dia_pago: number | null`; `NuevoRubro.dia_pago: number | null`.

- [ ] **Step 1: Verificar el estado real de la base antes de escribir**

```bash
PAT=$(cat ~/.config/surtijapon/supabase_pat); curl -s -X POST "https://api.supabase.com/v1/projects/jwipheuvrhqlgivmxvur/database/query" -H "Authorization: Bearer $PAT" -H "Content-Type: application/json" -d '{"query":"select (select count(*) from pg_tables where tablename=$$plan_pagos$$) pagos, (select count(*) from information_schema.columns where table_name=$$plan_rubros$$ and column_name=$$dia_pago$$) dia, (select count(*) from information_schema.columns where table_name=$$plan_rubros$$) cols_rubros"}'
```
Expected: `pagos=0, dia=0, cols_rubros=11` (el 11 prueba que la consulta mira la tabla real; si da 0, la consulta está mal, no "todo bien").

- [ ] **Step 2: Escribir la migración**

```sql
-- 0013: pagos de los gastos fijos del Plan.
-- Spec: docs/superpowers/specs/2026-10-02-pagos-fijos-design.md

-- 1. Día del mes en que vence un fijo (null = sin día). Solo fijos.
alter table plan_rubros add column dia_pago int check (dia_pago between 1 and 31);
alter table plan_rubros add constraint plan_rubros_dia_pago_solo_fijos
  check (dia_pago is null or tipo = 'fijo');

-- 2. Destino de la FK compuesta de plan_pagos: (id, cuenta_id) único.
alter table plan_rubros add constraint plan_rubros_id_cuenta_key unique (id, cuenta_id);

-- 3. Un pago por fijo y mes. `mes` es el mes AL QUE corresponde el pago,
-- no el de pagado_el. Desmarcar = borrar la fila.
create table plan_pagos (
  id         uuid primary key default gen_random_uuid(),
  cuenta_id  uuid not null references cuentas(id) on delete cascade,
  rubro_id   uuid not null,
  mes        text not null check (mes ~ '^\d{4}-(0[1-9]|1[0-2])$'),
  monto      bigint not null check (monto >= 0),
  -- current_date es UTC: el cliente siempre manda pagado_el (hoy en Bogotá).
  pagado_el  date not null default current_date,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (cuenta_id, rubro_id, mes),
  -- RLS valida el cuenta_id de la fila escrita, no a quién pertenece el
  -- rubro apuntado (las FK se evalúan después de RLS y sin ella). La FK
  -- compuesta exige que el rubro sea de la MISMA cuenta.
  foreign key (rubro_id, cuenta_id) references plan_rubros (id, cuenta_id) on delete cascade
);

create index plan_pagos_rubro_idx on plan_pagos (rubro_id);

-- 4. Solo se pagan fijos.
create or replace function plan_pagos_solo_fijos()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if not exists (select 1 from plan_rubros where id = new.rubro_id and tipo = 'fijo') then
    raise exception 'plan_pagos: el rubro % no es un gasto fijo', new.rubro_id using errcode = '23514';
  end if;
  return new;
end;
$$;

create trigger plan_pagos_solo_fijos
  before insert or update on plan_pagos
  for each row execute function plan_pagos_solo_fijos();

create trigger plan_pagos_set_created_by
  before insert on plan_pagos
  for each row execute function set_created_by();

create trigger plan_pagos_set_updated_at
  before update on plan_pagos
  for each row execute function set_updated_at();

-- 5. RLS: CRUD para miembros de la cuenta, igual que plan_ajustes.
alter table plan_pagos enable row level security;

create policy "plan_pagos_rw" on plan_pagos
  for all using (cuenta_id = mi_cuenta()) with check (cuenta_id = mi_cuenta());
```

- [ ] **Step 3: Tipos en `lib/types.ts`**

En `PlanRubro`, después de `hasta`:
```ts
  /** Día del mes en que vence (1-31). Solo fijos; null = sin día. */
  dia_pago: number | null;
```
En `NuevoRubro`, después de `hasta`:
```ts
  dia_pago: number | null;
```
Después de `PlanAjuste`:
```ts
/** El pago real de un fijo en un mes. `mes` es el mes al que corresponde, no el de `pagado_el`. */
export interface PlanPago {
  id: string;
  cuenta_id: string;
  rubro_id: string;
  mes: string; // 'YYYY-MM'
  monto: number;
  pagado_el: string; // 'YYYY-MM-DD'
  created_by: string | null;
  created_at: string;
  updated_at: string;
}
```
En `Database.public.Tables.plan_rubros.Insert` y `.Update` agregar `dia_pago?: number | null;`. Después del bloque `plan_ajustes`:
```ts
      plan_pagos: {
        Row: PlanPago;
        Insert: {
          id?: string;
          cuenta_id: string;
          rubro_id: string;
          mes: string;
          monto: number;
          pagado_el?: string;
          created_by?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          monto?: number;
          pagado_el?: string;
          updated_at?: string;
        };
        Relationships: [];
      };
```

- [ ] **Step 4: Arreglar lo que `tsc` rompa**

Run: `npx tsc --noEmit`
Expected: errores en la factoría `rubro()` de `lib/plan/calculo.test.ts` y en `RubroSheet.validar()` (falta `dia_pago`). Arreglos:
- `calculo.test.ts`, factoría `rubro()`: agregar `dia_pago: null,` antes de `...p`.
- `RubroSheet.tsx`, `validar()`: devolver `{ ..., hasta: hastaFinal, dia_pago: inicial?.dia_pago ?? null }` (el campo de UI llega en la Task 6; acá solo se preserva el valor).

Run: `npx tsc --noEmit && npx vitest run`
Expected: PASS.

- [ ] **Step 5: README** — en "Opción B", agregar `7. supabase/migrations/0013_pagos_fijos.sql`.

- [ ] **Step 6: Aplicar a producción** (aditiva: columna nullable + tabla nueva; no rompe el código desplegado)

```bash
PAT=$(cat ~/.config/surtijapon/supabase_pat); jq -Rs '{query: .}' supabase/migrations/0013_pagos_fijos.sql | curl -s -X POST "https://api.supabase.com/v1/projects/jwipheuvrhqlgivmxvur/database/query" -H "Authorization: Bearer $PAT" -H "Content-Type: application/json" -d @-
```
Expected: `[]`.

- [ ] **Step 7: Verificar el efecto (no el mensaje)**

```bash
PAT=$(cat ~/.config/surtijapon/supabase_pat); curl -s -X POST "https://api.supabase.com/v1/projects/jwipheuvrhqlgivmxvur/database/query" -H "Authorization: Bearer $PAT" -H "Content-Type: application/json" -d '{"query":"select (select count(*) from information_schema.columns where table_name=$$plan_pagos$$) cols, (select relrowsecurity from pg_class where relname=$$plan_pagos$$) rls, (select count(*) from pg_policies where tablename=$$plan_pagos$$) politicas, (select count(*) from information_schema.columns where table_name=$$plan_rubros$$ and column_name=$$dia_pago$$) dia, (select count(*) from pg_constraint where conname in ($$plan_rubros_id_cuenta_key$$,$$plan_rubros_dia_pago_solo_fijos$$)) cons, (select count(*) from pg_trigger where tgrelid=$$plan_pagos$$::regclass and not tgisinternal) triggers"}'
```
Expected: `cols=9, rls=true, politicas=1, dia=1, cons=2, triggers=3`.

- [ ] **Step 8: Prueba de RLS con `SET ROLE` — 4 llamadas, cada una su propia transacción con `rollback`**

Preparación común (prefijo de cada query; crea una cuenta B ajena con un fijo y un pago, y elige un usuario real A):
```sql
begin;
insert into cuentas (id) values ('00000000-0000-0000-0000-0000000000b0');
insert into plan_rubros (id, cuenta_id, tipo, nombre, monto_default, desde)
  values ('00000000-0000-0000-0000-0000000000b1', '00000000-0000-0000-0000-0000000000b0', 'fijo', 'ajeno', 1, '2026-01');
insert into plan_pagos (cuenta_id, rubro_id, mes, monto)
  values ('00000000-0000-0000-0000-0000000000b0', '00000000-0000-0000-0000-0000000000b1', '2026-10', 1);
select set_config('request.jwt.claims', json_build_object('sub', (select user_id from cuenta_miembros limit 1), 'role', 'authenticated')::text, true);
```
Y cada caso, al final del prefijo:
1. **Control positivo (debe pasar)** — crea un fijo propio y le cuelga un pago:
   ```sql
   set local role authenticated;
   with r as (insert into plan_rubros (cuenta_id, tipo, nombre, monto_default, desde) values (mi_cuenta(), 'fijo', 'propio', 1, '2026-01') returning id, cuenta_id)
   insert into plan_pagos (cuenta_id, rubro_id, mes, monto) select cuenta_id, id, '2026-10', 1 from r returning id;
   rollback;
   ```
   Expected: devuelve 1 id.
2. **Fijo de otra cuenta (debe fallar)**: `set local role authenticated; insert into plan_pagos (cuenta_id, rubro_id, mes, monto) values (mi_cuenta(), '00000000-0000-0000-0000-0000000000b1', '2026-10', 1); rollback;`
   Expected: error (`23514` del trigger, que no ve el rubro ajeno, o `23503` de la FK).
3. **Ingreso propio (debe fallar)**: `set local role authenticated; with r as (insert into plan_rubros (cuenta_id, tipo, nombre, monto_default, desde) values (mi_cuenta(), 'ingreso', 'x', 1, '2026-01') returning id, cuenta_id) insert into plan_pagos (cuenta_id, rubro_id, mes, monto) select cuenta_id, id, '2026-10', 1 from r; rollback;`
   Expected: error `23514` "no es un gasto fijo".
4. **Lectura ajena (debe dar 0, con control)**: `select count(*) as como_postgres from plan_pagos where cuenta_id = '00000000-0000-0000-0000-0000000000b0'; set local role authenticated; select count(*) as como_usuario from plan_pagos where cuenta_id = '00000000-0000-0000-0000-0000000000b0'; rollback;`
   Expected: `como_postgres = 1` y `como_usuario = 0`. (Si la API devuelve solo el último resultado, correr el conteo como postgres en una llamada separada con el mismo prefijo.)

Después: confirmar que no quedó basura: `select count(*) from cuentas where id = '00000000-0000-0000-0000-0000000000b0'` → 0.

- [ ] **Step 9: Commit**

```bash
git add supabase/migrations/0013_pagos_fijos.sql lib/types.ts lib/plan/calculo.test.ts components/plan/RubroSheet.tsx README.md
git commit -m "feat(pagos): migración 0013 — plan_pagos, dia_pago y RLS"
```

---

### Task 2: Plan usa el pago (pago → ajuste → default)

**Files:**
- Modify: `lib/plan/calculo.ts` (`LineaPlan`, `lineasDe`, `calcularPlan`)
- Test: `lib/plan/calculo.test.ts`

**Interfaces:**
- Consumes: `PlanPago` (Task 1).
- Produces: `LineaPlan.estimado: number`, `LineaPlan.pagado: { monto: number; pagadoEl: string } | null`; `lineasDe(rubros, ajustes, mes, tipo, pagos?: PlanPago[])`; `calcularPlan({ ..., pagos?: PlanPago[] })`.

- [ ] **Step 1: Tests que fallan** — agregar a `calculo.test.ts`:

```ts
function pago(mes: string, rubro_id: string, monto: number, pagado_el = `${mes}-05`): PlanPago {
  return { id: `${mes}-${rubro_id}-p`, cuenta_id: "c1", rubro_id, mes, monto, pagado_el, created_by: null, created_at: "", updated_at: "" };
}

describe("lineasDe con pagos", () => {
  const rubros = [
    rubro({ id: "luz", tipo: "fijo", monto_default: 150_000, desde: "2026-01" }),
    rubro({ id: "nomina", tipo: "ingreso", monto_default: 10_000_000, desde: "2026-01" }),
  ];

  it("prioridad: pago > ajuste > default, y estimado guarda lo que habría sin el pago", () => {
    const ajustes = [ajuste("2026-10", "luz", 170_000)];
    const [l] = lineasDe(rubros, ajustes, "2026-10", "fijo", [pago("2026-10", "luz", 182_000, "2026-10-08")]);
    expect(l).toMatchObject({ monto: 182_000, estimado: 170_000, ajustado: true, pagado: { monto: 182_000, pagadoEl: "2026-10-08" } });
  });

  it("sin pago: monto = estimado y pagado null", () => {
    const [l] = lineasDe(rubros, [], "2026-10", "fijo", []);
    expect(l).toMatchObject({ monto: 150_000, estimado: 150_000, pagado: null });
  });

  it("un pago de otro mes no aplica", () => {
    const [l] = lineasDe(rubros, [], "2026-11", "fijo", [pago("2026-10", "luz", 182_000)]);
    expect(l.pagado).toBeNull();
  });

  it("un pago colgado de un ingreso se ignora", () => {
    const [l] = lineasDe(rubros, [], "2026-10", "ingreso", [pago("2026-10", "nomina", 1)]);
    expect(l).toMatchObject({ monto: 10_000_000, pagado: null });
  });
});

describe("calcularPlan con pagos", () => {
  it("el ahorro usa el monto pagado; desmarcar (sin pago) vuelve al estimado", () => {
    const rubros = [
      rubro({ id: "nomina", tipo: "ingreso", monto_default: 10_000_000, desde: "2026-01" }),
      rubro({ id: "luz", tipo: "fijo", monto_default: 150_000, desde: "2026-01" }),
    ];
    const hoy = "2026-10-10";
    const con = calcularPlan({ rubros, ajustes: [], gastos: [], hoy, pagos: [pago("2026-10", "luz", 200_000)] });
    const sin = calcularPlan({ rubros, ajustes: [], gastos: [], hoy, pagos: [] });
    const oct = (p: typeof con) => p.find((m) => m.mes === "2026-10")!;
    expect(oct(con).totalFijos).toBe(200_000);
    expect(oct(sin).totalFijos).toBe(150_000);
    expect(oct(con).ahorro! - oct(sin).ahorro!).toBe(-50_000);
  });
});
```
Importar `PlanPago` en el `import type` del test.

- [ ] **Step 2: Correr y ver que falla**

Run: `npx vitest run lib/plan/calculo.test.ts`
Expected: FAIL (`estimado` undefined, pagos ignorados).

- [ ] **Step 3: Implementar** en `lib/plan/calculo.ts`:

```ts
export interface LineaPlan {
  rubroId: string;
  nombre: string;
  /** Lo que cuenta en el Plan: el pago si existe; si no, el estimado. */
  monto: number;
  montoDefault: number;
  ajustado: boolean;
  /** Ajuste del mes o default: lo que habría sin el pago. */
  estimado: number;
  pagado: { monto: number; pagadoEl: string } | null;
}

/** Las líneas de un tipo vigentes en un mes. Monto: pago → ajuste → default. Los pagos solo cuentan para fijos. */
export function lineasDe(rubros: PlanRubro[], ajustes: PlanAjuste[], mes: string, tipo: TipoRubro, pagos: PlanPago[] = []): LineaPlan[] {
  return rubros
    .filter((r) => r.tipo === tipo && rubroAplica(r, mes))
    .sort((a, b) => a.orden - b.orden || a.created_at.localeCompare(b.created_at))
    .map((r) => {
      const aj = ajustes.find((a) => a.mes === mes && a.rubro_id === r.id);
      const p = tipo === "fijo" ? pagos.find((x) => x.mes === mes && x.rubro_id === r.id) : undefined;
      const estimado = aj ? aj.monto : r.monto_default;
      return {
        rubroId: r.id,
        nombre: r.nombre,
        monto: p ? p.monto : estimado,
        montoDefault: r.monto_default,
        ajustado: Boolean(aj),
        estimado,
        pagado: p ? { monto: p.monto, pagadoEl: p.pagado_el } : null,
      };
    });
}
```
Import: `import type { Expense, PlanAjuste, PlanPago, PlanRubro, TipoRubro } from "@/lib/types";`. En `calcularPlan`: agregar `pagos?: PlanPago[];` a `opts`, desestructurar `pagos = []`, y `const fijos = lineasDe(rubros, ajustes, mes, "fijo", pagos);`.

- [ ] **Step 4: Correr todo**

Run: `npx vitest run && npx tsc --noEmit`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add lib/plan/calculo.ts lib/plan/calculo.test.ts
git commit -m "feat(plan): un fijo pagado usa el monto real (pago → ajuste → default)"
```

---

### Task 3: Estado de los pagos (`lib/pagos/estado.ts`, `lib/pagos/etiquetas.ts`)

**Files:**
- Create: `lib/pagos/estado.ts`, `lib/pagos/estado.test.ts`, `lib/pagos/etiquetas.ts`, `lib/pagos/etiquetas.test.ts`

**Interfaces:**
- Consumes: `lineasDe` (Task 2), `PlanPago`, `PlanRubro.dia_pago` (Task 1), `desplazarMes`, `diasEnMes`, `diasEntre`, `mesDe`, `diaDe`, `mesNum` de `lib/ciclo.ts`, `CORTOS` de `lib/labels.ts`.
- Produces:
  ```ts
  export type EstadoPago = "pagado" | "vencido" | "vence_pronto" | "pendiente" | "sin_dia";
  export interface ItemPago { rubroId: string; nombre: string; mes: string; vence: string | null; montoSugerido: number; pago: { monto: number; pagadoEl: string } | null; estado: EstadoPago }
  export const DIAS_PRONTO = 3;
  export function fechaVencimiento(mes: string, diaPago: number | null): string | null
  export function estadoPago(vence: string | null, pagado: boolean, hoy: string): EstadoPago
  export function itemsPagos(rubros: PlanRubro[], ajustes: PlanAjuste[], pagos: PlanPago[], hoy: string): ItemPago[]
  export interface GruposPagos { vencidos: ItemPago[]; pronto: ItemPago[]; pendientes: ItemPago[]; sinDia: ItemPago[]; pagados: ItemPago[] }
  export function agruparPagos(items: ItemPago[]): GruposPagos
  export function contadorPagos(items: ItemPago[]): number
  export function resumenPagos(items: ItemPago[], mes: string): { pagado: number; total: number; faltan: number }
  // etiquetas.ts
  export function etiquetaFechaCorta(fecha: string): string   // '2026-10-08' → '8 oct'
  export function textoEstadoPago(item: ItemPago, hoy: string): string
  ```

- [ ] **Step 1: Tests que fallan — `lib/pagos/estado.test.ts`**

```ts
import { describe, it, expect } from "vitest";
import { fechaVencimiento, estadoPago, itemsPagos, agruparPagos, contadorPagos, resumenPagos } from "./estado";
import type { PlanPago, PlanRubro } from "@/lib/types";

function fijo(id: string, dia_pago: number | null, monto = 100, p: Partial<PlanRubro> = {}): PlanRubro {
  return { id, cuenta_id: "c1", tipo: "fijo", nombre: id, monto_default: monto, desde: "2026-01", hasta: null, dia_pago, orden: 0, created_by: null, created_at: id, updated_at: "", ...p };
}
function pago(mes: string, rubro_id: string, monto: number, pagado_el = `${mes}-05`): PlanPago {
  return { id: `${mes}-${rubro_id}`, cuenta_id: "c1", rubro_id, mes, monto, pagado_el, created_by: null, created_at: "", updated_at: "" };
}

describe("fechaVencimiento", () => {
  it("día normal", () => expect(fechaVencimiento("2026-10", 10)).toBe("2026-10-10"));
  it("31 en noviembre vence el 30", () => expect(fechaVencimiento("2026-11", 31)).toBe("2026-11-30"));
  it("30 en febrero vence el 28, y el 29 en bisiesto", () => {
    expect(fechaVencimiento("2026-02", 30)).toBe("2026-02-28");
    expect(fechaVencimiento("2028-02", 30)).toBe("2028-02-29");
  });
  it("sin día → null", () => expect(fechaVencimiento("2026-10", null)).toBeNull());
});

describe("estadoPago", () => {
  it("pagado gana siempre", () => expect(estadoPago("2026-09-01", true, "2026-10-02")).toBe("pagado"));
  it("el día del vencimiento no es vencido", () => expect(estadoPago("2026-10-02", false, "2026-10-02")).toBe("vence_pronto"));
  it("un día después sí", () => expect(estadoPago("2026-10-01", false, "2026-10-02")).toBe("vencido"));
  it("borde de pronto: +3 cuenta, +4 no", () => {
    expect(estadoPago("2026-10-05", false, "2026-10-02")).toBe("vence_pronto");
    expect(estadoPago("2026-10-06", false, "2026-10-02")).toBe("pendiente");
  });
  it("sin día → sin_dia", () => expect(estadoPago(null, false, "2026-10-02")).toBe("sin_dia"));
});

describe("itemsPagos", () => {
  const hoy = "2026-10-02";

  it("mes actual completo, con monto sugerido del Plan", () => {
    const items = itemsPagos([fijo("luz", 10, 150_000)], [], [], hoy);
    expect(items.find((i) => i.mes === "2026-10")).toEqual({ rubroId: "luz", nombre: "luz", mes: "2026-10", vence: "2026-10-10", montoSugerido: 150_000, pago: null, estado: "pendiente" });
    // la luz de septiembre sin pagar aparece, vencida
    expect(items.find((i) => i.mes === "2026-09")).toMatchObject({ estado: "vencido", vence: "2026-09-10" });
  });

  it("el mes anterior pagado no aparece", () => {
    const items = itemsPagos([fijo("luz", 10)], [], [pago("2026-09", "luz", 100)], hoy);
    expect(items.map((i) => i.mes)).toEqual(["2026-10"]);
  });

  it("hace dos meses no aparece aunque no se haya pagado", () => {
    const items = itemsPagos([fijo("luz", 10)], [], [], hoy);
    expect(items.some((i) => i.mes === "2026-08")).toBe(false);
  });

  it("mes anterior sin día: vencido al último día de ese mes", () => {
    const items = itemsPagos([fijo("cel", null)], [], [], hoy);
    expect(items.find((i) => i.mes === "2026-09")).toMatchObject({ estado: "vencido", vence: "2026-09-30" });
    expect(items.find((i) => i.mes === "2026-10")).toMatchObject({ estado: "sin_dia", vence: null });
  });

  it("fuera de vigencia no aparece", () => {
    const items = itemsPagos([fijo("curso", 10, 100, { desde: "2026-11" })], [], [], hoy);
    expect(items).toEqual([]);
  });

  it("solo fijos: los ingresos no aparecen", () => {
    const items = itemsPagos([fijo("nomina", null, 100, { tipo: "ingreso" })], [], [], hoy);
    expect(items).toEqual([]);
  });

  it("un pago trae su monto y el sugerido sigue siendo el estimado", () => {
    const items = itemsPagos([fijo("luz", 10, 150_000)], [], [pago("2026-10", "luz", 182_000, "2026-10-01")], hoy);
    expect(items.find((i) => i.mes === "2026-10")).toMatchObject({ estado: "pagado", montoSugerido: 150_000, pago: { monto: 182_000, pagadoEl: "2026-10-01" } });
  });
});

describe("agruparPagos / contadorPagos / resumenPagos", () => {
  const hoy = "2026-10-02";
  const rubros = [fijo("a", 1, 100), fijo("b", 4, 200), fijo("c", 20, 300), fijo("d", null, 400), fijo("e", 25, 500)];
  const pagos = [pago("2026-09", "a", 100), pago("2026-09", "b", 200), pago("2026-09", "c", 300), pago("2026-09", "d", 400), pago("2026-09", "e", 500), pago("2026-10", "e", 550)];
  const items = itemsPagos(rubros, [], pagos, hoy);

  it("agrupa por estado, ordenado por vencimiento", () => {
    const g = agruparPagos(items);
    expect(g.vencidos.map((i) => i.rubroId)).toEqual(["a"]);
    expect(g.pronto.map((i) => i.rubroId)).toEqual(["b"]);
    expect(g.pendientes.map((i) => i.rubroId)).toEqual(["c"]);
    expect(g.sinDia.map((i) => i.rubroId)).toEqual(["d"]);
    expect(g.pagados.map((i) => i.rubroId)).toEqual(["e"]);
  });

  it("contador = vencidos + pronto", () => expect(contadorPagos(items)).toBe(2));

  it("resumen del mes: pagado real, total con pagos reales, faltan", () => {
    expect(resumenPagos(items, "2026-10")).toEqual({ pagado: 550, total: 100 + 200 + 300 + 400 + 550, faltan: 4 });
  });
});
```


- [ ] **Step 2: Correr y ver que falla**

Run: `npx vitest run lib/pagos`
Expected: FAIL ("Cannot find module './estado'").

- [ ] **Step 3: Implementar `lib/pagos/estado.ts`**

```ts
import { desplazarMes, diasEnMes, diasEntre, mesDe } from "@/lib/ciclo";
import { lineasDe } from "@/lib/plan/calculo";
import type { PlanAjuste, PlanPago, PlanRubro } from "@/lib/types";

export type EstadoPago = "pagado" | "vencido" | "vence_pronto" | "pendiente" | "sin_dia";

export interface ItemPago {
  rubroId: string;
  nombre: string;
  mes: string;
  /** 'YYYY-MM-DD', o null si el fijo no tiene día de pago (solo en el mes actual). */
  vence: string | null;
  /** El estimado del Plan para ese mes (ajuste o default). */
  montoSugerido: number;
  pago: { monto: number; pagadoEl: string } | null;
  estado: EstadoPago;
}

/** Cuántos días antes del vencimiento un fijo pasa a "vence pronto". */
export const DIAS_PRONTO = 3;

/** El día de pago en ese mes; si el mes no tiene ese día, el último día del mes. */
export function fechaVencimiento(mes: string, diaPago: number | null): string | null {
  if (diaPago === null) return null;
  return `${mes}-${String(Math.min(diaPago, diasEnMes(mes))).padStart(2, "0")}`;
}

export function estadoPago(vence: string | null, pagado: boolean, hoy: string): EstadoPago {
  if (pagado) return "pagado";
  if (vence === null) return "sin_dia";
  const faltan = diasEntre(hoy, vence);
  if (faltan < 0) return "vencido";
  if (faltan <= DIAS_PRONTO) return "vence_pronto";
  return "pendiente";
}

function itemsDelMes(rubros: PlanRubro[], ajustes: PlanAjuste[], pagos: PlanPago[], mes: string, hoy: string, mesCerrado: boolean): ItemPago[] {
  const diaDe = new Map(rubros.map((r) => [r.id, r.dia_pago]));
  return lineasDe(rubros, ajustes, mes, "fijo", pagos).map((l) => {
    // Un mes que ya terminó vence a más tardar su último día, tenga o no día de pago.
    const vence = fechaVencimiento(mes, diaDe.get(l.rubroId) ?? (mesCerrado ? 31 : null));
    return {
      rubroId: l.rubroId,
      nombre: l.nombre,
      mes,
      vence,
      montoSugerido: l.estimado,
      pago: l.pagado,
      estado: estadoPago(vence, l.pagado !== null, hoy),
    };
  });
}

/**
 * El mes actual completo más lo que quedó sin pagar del mes anterior. Nada más
 * atrás: si no, aparecerían vencidos todos los meses previos a que existiera el módulo.
 */
export function itemsPagos(rubros: PlanRubro[], ajustes: PlanAjuste[], pagos: PlanPago[], hoy: string): ItemPago[] {
  const mes = mesDe(hoy);
  const anteriores = itemsDelMes(rubros, ajustes, pagos, desplazarMes(mes, -1), hoy, true).filter((i) => i.estado !== "pagado");
  return [...anteriores, ...itemsDelMes(rubros, ajustes, pagos, mes, hoy, false)];
}

export interface GruposPagos {
  vencidos: ItemPago[];
  pronto: ItemPago[];
  pendientes: ItemPago[];
  sinDia: ItemPago[];
  pagados: ItemPago[];
}

const porVencimiento = (a: ItemPago, b: ItemPago) =>
  (a.vence ?? "9999").localeCompare(b.vence ?? "9999") || a.nombre.localeCompare(b.nombre);

export function agruparPagos(items: ItemPago[]): GruposPagos {
  const de = (e: ItemPago["estado"]) => items.filter((i) => i.estado === e).sort(porVencimiento);
  return { vencidos: de("vencido"), pronto: de("vence_pronto"), pendientes: de("pendiente"), sinDia: de("sin_dia"), pagados: de("pagado") };
}

/** Lo que necesita atención: vencidos (incluido el mes anterior) + los que vencen pronto. */
export function contadorPagos(items: ItemPago[]): number {
  return items.filter((i) => i.estado === "vencido" || i.estado === "vence_pronto").length;
}

/** Totales del mes `mes` (el actual): lo pagado real, el total con pagos reales y los que faltan. */
export function resumenPagos(items: ItemPago[], mes: string): { pagado: number; total: number; faltan: number } {
  const delMes = items.filter((i) => i.mes === mes);
  return {
    pagado: delMes.reduce((s, i) => s + (i.pago?.monto ?? 0), 0),
    total: delMes.reduce((s, i) => s + (i.pago?.monto ?? i.montoSugerido), 0),
    faltan: delMes.filter((i) => i.pago === null).length,
  };
}
```

- [ ] **Step 4: Tests de etiquetas — `lib/pagos/etiquetas.test.ts`**

```ts
import { describe, it, expect } from "vitest";
import { etiquetaFechaCorta, textoEstadoPago } from "./etiquetas";
import type { ItemPago } from "./estado";

const item = (p: Partial<ItemPago>): ItemPago => ({ rubroId: "x", nombre: "x", mes: "2026-10", vence: null, montoSugerido: 0, pago: null, estado: "sin_dia", ...p });
const hoy = "2026-10-02";

describe("etiquetaFechaCorta", () => {
  it("'2026-10-08' → '8 oct'", () => expect(etiquetaFechaCorta("2026-10-08")).toBe("8 oct"));
});

describe("textoEstadoPago", () => {
  it("pagado", () => expect(textoEstadoPago(item({ estado: "pagado", pago: { monto: 1, pagadoEl: "2026-10-08" } }), hoy)).toBe("pagado el 8 oct"));
  it("vencido ayer / hace n días", () => {
    expect(textoEstadoPago(item({ estado: "vencido", vence: "2026-10-01" }), hoy)).toBe("venció ayer");
    expect(textoEstadoPago(item({ estado: "vencido", vence: "2026-09-10" }), hoy)).toBe("venció hace 22 días");
  });
  it("vence hoy / mañana / en n días", () => {
    expect(textoEstadoPago(item({ estado: "vence_pronto", vence: "2026-10-02" }), hoy)).toBe("vence hoy");
    expect(textoEstadoPago(item({ estado: "vence_pronto", vence: "2026-10-03" }), hoy)).toBe("vence mañana");
    expect(textoEstadoPago(item({ estado: "vence_pronto", vence: "2026-10-05" }), hoy)).toBe("vence en 3 días");
  });
  it("pendiente", () => expect(textoEstadoPago(item({ estado: "pendiente", vence: "2026-10-20" }), hoy)).toBe("vence el 20 oct"));
  it("sin día", () => expect(textoEstadoPago(item({ estado: "sin_dia" }), hoy)).toBe("sin día de pago"));
});
```

- [ ] **Step 5: Implementar `lib/pagos/etiquetas.ts`**

```ts
import { diaDe, diasEntre, mesNum } from "@/lib/ciclo";
import { CORTOS } from "@/lib/labels";
import type { ItemPago } from "./estado";

/** '2026-10-08' → '8 oct'. */
export function etiquetaFechaCorta(fecha: string): string {
  return `${diaDe(fecha)} ${CORTOS[mesNum(fecha) - 1]}`;
}

export function textoEstadoPago(item: ItemPago, hoy: string): string {
  switch (item.estado) {
    case "pagado":
      return `pagado el ${etiquetaFechaCorta(item.pago!.pagadoEl)}`;
    case "vencido": {
      const n = diasEntre(item.vence!, hoy);
      return n === 1 ? "venció ayer" : `venció hace ${n} días`;
    }
    case "vence_pronto": {
      const n = diasEntre(hoy, item.vence!);
      return n === 0 ? "vence hoy" : n === 1 ? "vence mañana" : `vence en ${n} días`;
    }
    case "pendiente":
      return `vence el ${etiquetaFechaCorta(item.vence!)}`;
    case "sin_dia":
      return "sin día de pago";
  }
}
```

- [ ] **Step 6: Correr**

Run: `npx vitest run && npx tsc --noEmit && npx eslint lib`
Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add lib/pagos
git commit -m "feat(pagos): estados, vencimientos y agrupación de los fijos del mes"
```

---

### Task 4: Queries de pagos

**Files:**
- Create: `lib/pagos/queries.ts`, `lib/pagos/queries.test.ts`
- Modify: `lib/plan/queries.ts` (nada: `crearRubro`/`actualizarRubro` ya envían `NuevoRubro` completo, que ahora trae `dia_pago`)

**Interfaces:**
- Produces:
  ```ts
  listarPagos(supabase): Promise<{ data: PlanPago[] | null; error: PostgrestError | null }>
  marcarPago(supabase, cuentaId: string, rubroId: string, mes: string, monto: number, pagadoEl: string): Promise<{ data: PlanPago | null; error }>
  desmarcarPago(supabase, cuentaId: string, rubroId: string, mes: string): Promise<{ error }>
  ```

- [ ] **Step 1: Tests** — `lib/pagos/queries.test.ts` (copiar `clienteQueCaptura` de `lib/plan/queries.test.ts` tal cual):

```ts
import { describe, it, expect } from "vitest";
import { createClient } from "@supabase/supabase-js";
import { listarPagos, marcarPago, desmarcarPago } from "./queries";

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
        return new Response(JSON.stringify(respuesta), { status, headers: { "Content-Type": "application/json" } });
      }) as typeof fetch,
    },
  });
  return { supabase, peticiones };
}

describe("listarPagos", () => {
  it("ordena por columnas que juntas son únicas, para que no baile entre recargas", async () => {
    const { supabase, peticiones } = clienteQueCaptura([]);
    await listarPagos(supabase);
    expect(peticiones[0].url).toContain("/plan_pagos?");
    expect(peticiones[0].url.match(/order=([^&]+)/)?.[1]).toBe("mes.asc,rubro_id.asc");
  });
});

describe("marcarPago", () => {
  it("upsert sobre (cuenta_id, rubro_id, mes) mandando pagado_el explícito", async () => {
    const fila = { id: "p1", cuenta_id: "c1", rubro_id: "luz", mes: "2026-10", monto: 182_000, pagado_el: "2026-10-02" };
    const { supabase, peticiones } = clienteQueCaptura(fila);
    const { data, error } = await marcarPago(supabase, "c1", "luz", "2026-10", 182_000, "2026-10-02");
    expect(peticiones[0].metodo).toBe("POST");
    expect(peticiones[0].url).toContain("on_conflict=cuenta_id,rubro_id,mes");
    expect(peticiones[0].headers.get("Prefer")).toContain("resolution=merge-duplicates");
    expect(JSON.parse(peticiones[0].cuerpo!)).toEqual({ cuenta_id: "c1", rubro_id: "luz", mes: "2026-10", monto: 182_000, pagado_el: "2026-10-02" });
    expect(error).toBeNull();
    expect(data).toEqual(fila);
  });

  it("propaga el error de la base", async () => {
    const { supabase } = clienteQueCaptura({ code: "23514", message: "no es un gasto fijo" }, 400);
    const { data, error } = await marcarPago(supabase, "c1", "nomina", "2026-10", 1, "2026-10-02");
    expect(data).toBeNull();
    expect(error?.code).toBe("23514");
  });
});

describe("desmarcarPago", () => {
  it("borra filtrando por cuenta, rubro y mes", async () => {
    const { supabase, peticiones } = clienteQueCaptura(null, 204);
    const { error } = await desmarcarPago(supabase, "c1", "luz", "2026-10");
    expect(error).toBeNull();
    expect(peticiones[0].metodo).toBe("DELETE");
    expect(peticiones[0].url).toContain("cuenta_id=eq.c1");
    expect(peticiones[0].url).toContain("rubro_id=eq.luz");
    expect(peticiones[0].url).toContain("mes=eq.2026-10");
  });
});
```

- [ ] **Step 2: Correr y ver que falla** — `npx vitest run lib/pagos/queries.test.ts` → FAIL (módulo no existe).

- [ ] **Step 3: Implementar `lib/pagos/queries.ts`**

```ts
import type { PostgrestError, SupabaseClient } from "@supabase/supabase-js";
import type { Database, PlanPago } from "@/lib/types";
import { sinTipar } from "@/lib/supabase/queries";

type Cliente = SupabaseClient<Database>;
type Resultado<T> = { data: T | null; error: PostgrestError | null };

// RLS ya limita a la cuenta. (mes, rubro_id) es único dentro de una cuenta: el orden no baila.
export async function listarPagos(supabase: Cliente): Promise<Resultado<PlanPago[]>> {
  const { data, error } = await supabase
    .from("plan_pagos")
    .select("*")
    .order("mes", { ascending: true })
    .order("rubro_id", { ascending: true });
  return { data: data as PlanPago[] | null, error };
}

/** Marca (o corrige) el pago de un fijo en un mes. `pagadoEl` siempre explícito: el default de la base es UTC. */
export async function marcarPago(
  supabase: Cliente,
  cuentaId: string,
  rubroId: string,
  mes: string,
  monto: number,
  pagadoEl: string
): Promise<Resultado<PlanPago>> {
  const { data, error } = await sinTipar(supabase)
    .from("plan_pagos")
    .upsert({ cuenta_id: cuentaId, rubro_id: rubroId, mes, monto, pagado_el: pagadoEl }, { onConflict: "cuenta_id,rubro_id,mes" })
    .select()
    .single();
  return { data: data as PlanPago | null, error };
}

/** Desmarcar = borrar el pago; el Plan vuelve solo al estimado. */
export async function desmarcarPago(
  supabase: Cliente,
  cuentaId: string,
  rubroId: string,
  mes: string
): Promise<{ error: PostgrestError | null }> {
  const { error } = await sinTipar(supabase)
    .from("plan_pagos")
    .delete()
    .eq("cuenta_id", cuentaId)
    .eq("rubro_id", rubroId)
    .eq("mes", mes);
  return { error };
}
```

- [ ] **Step 4: Correr** — `npx vitest run && npx tsc --noEmit` → PASS.

- [ ] **Step 5: Commit**

```bash
git add lib/pagos/queries.ts lib/pagos/queries.test.ts
git commit -m "feat(pagos): queries para listar, marcar y desmarcar pagos"
```

---

### Task 5: Toast con acción y cola por clave

**Files:**
- Modify: `hooks/useToast.ts`, `components/ui/Toast.tsx`
- Create: `hooks/useColaPorClave.ts`

**Interfaces:**
- Produces:
  ```ts
  export interface AccionToast { etiqueta: string; onClick: () => void }
  useToast(): { mensaje: string; accion: AccionToast | null; mostrar: (texto: string, accion?: AccionToast) => void }
  Toast({ mensaje, accion }: { mensaje: string; accion?: AccionToast | null })
  useColaPorClave(): { encolar: (clave: string, tarea: () => Promise<void>) => Promise<void>; nuevaGeneracion: (clave: string) => () => boolean }
  ```
  `nuevaGeneracion(clave)` sube el número de generación de la clave y devuelve `esUltima()`.

- [ ] **Step 1: `hooks/useToast.ts`** (compatible: los consumidores actuales solo usan `mensaje` y `mostrar(texto)`)

```ts
"use client";

import { useCallback, useEffect, useState } from "react";

export interface AccionToast {
  etiqueta: string;
  onClick: () => void;
}

export function useToast() {
  const [mensaje, setMensaje] = useState("");
  const [accion, setAccion] = useState<AccionToast | null>(null);

  useEffect(() => {
    if (!mensaje) return;
    // Con acción dura más: tiene que dar tiempo a tocar "Deshacer".
    const t = setTimeout(() => {
      setMensaje("");
      setAccion(null);
    }, accion ? 5000 : 2200);
    return () => clearTimeout(t);
  }, [mensaje, accion]);

  const mostrar = useCallback((texto: string, nuevaAccion?: AccionToast) => {
    setMensaje(texto);
    setAccion(nuevaAccion ?? null);
  }, []);

  return { mensaje, accion, mostrar };
}
```

- [ ] **Step 2: `components/ui/Toast.tsx`**

```tsx
"use client";

import type { AccionToast } from "@/hooks/useToast";

export function Toast({ mensaje, accion }: { mensaje: string; accion?: AccionToast | null }) {
  if (!mensaje) return null;
  return (
    <div className="fixed left-1/2 bottom-6 -translate-x-1/2 bg-ink text-white pl-4 pr-2 py-1.5 rounded-xl text-sm z-[60] flex items-center gap-3 min-h-[44px]">
      <span className={accion ? "" : "pr-2"}>{mensaje}</span>
      {accion && (
        <button type="button" onClick={accion.onClick} className="min-h-[36px] px-2.5 rounded-lg font-semibold underline underline-offset-2 cursor-pointer">
          {accion.etiqueta}
        </button>
      )}
    </div>
  );
}
```

- [ ] **Step 3: `hooks/useColaPorClave.ts`** (mismo mecanismo que `PlanClient`, extraído para Pagos; `PlanClient` no se toca en este plan)

```ts
"use client";

import { useCallback, useRef } from "react";

/**
 * Dos mutaciones seguidas sobre la misma fila pueden resolver desordenadas y
 * pisar el estado nuevo con el viejo. `encolar` serializa por clave (la
 * siguiente corre aunque la anterior falle) y `nuevaGeneracion` marca cuál
 * escritura es la más nueva: solo esa decide el estado final de la fila.
 */
export function useColaPorClave() {
  const cola = useRef(new Map<string, Promise<void>>());
  const generacion = useRef(new Map<string, number>());

  const encolar = useCallback((clave: string, tarea: () => Promise<void>): Promise<void> => {
    const previa = cola.current.get(clave) ?? Promise.resolve();
    const siguiente = previa.then(tarea, tarea);
    cola.current.set(clave, siguiente);
    return siguiente;
  }, []);

  const nuevaGeneracion = useCallback((clave: string) => {
    const mia = (generacion.current.get(clave) ?? 0) + 1;
    generacion.current.set(clave, mia);
    return () => generacion.current.get(clave) === mia;
  }, []);

  return { encolar, nuevaGeneracion };
}
```

- [ ] **Step 4: Gate** — `npx tsc --noEmit && npx eslint hooks components/ui && npx vitest run` → PASS (los consumidores de `Toast` siguen compilando sin cambios).

- [ ] **Step 5: Commit**

```bash
git add hooks/useToast.ts hooks/useColaPorClave.ts components/ui/Toast.tsx
git commit -m "feat(ui): toast con acción opcional y cola por clave reutilizable"
```

---

### Task 6: Plan — día de pago y fijos pagados

**Files:**
- Modify: `components/plan/RubroSheet.tsx`, `components/plan/DetalleMes.tsx`, `components/plan/PlanClient.tsx`, `app/(app)/plan/page.tsx`

**Interfaces:**
- Consumes: `listarPagos` (Task 4), `calcularPlan({ pagos })`, `LineaPlan.pagado/estimado` (Task 2), `etiquetaFechaCorta` (Task 3).

- [ ] **Step 1: `RubroSheet` — campo "Día de pago"**

Estado nuevo junto a los otros:
```ts
const [diaPago, setDiaPago] = useState(inicial?.dia_pago ? String(inicial.dia_pago) : "");
```
En `validar()`, antes de `setError(null)`:
```ts
    const dia = diaPago.trim() === "" ? null : Number(diaPago);
    if (tipo === "fijo" && dia !== null && !(Number.isInteger(dia) && dia >= 1 && dia <= 31)) {
      setError("El día de pago va de 1 a 31.");
      return null;
    }
```
y el `return` final (reemplaza el `dia_pago: inicial?.dia_pago ?? null` de la Task 1):
```ts
    // La base exige dia_pago null en ingresos (plan_rubros_dia_pago_solo_fijos).
    return { tipo, nombre: nombre.trim(), monto_default: n, desde, hasta: hastaFinal, dia_pago: tipo === "fijo" ? dia : null };
```
JSX, después del input de monto:
```tsx
      {tipo === "fijo" && (
        <>
          <label htmlFor="rubro-dia" className={etiqueta}>Día de pago (opcional)</label>
          <input id="rubro-dia" inputMode="numeric" value={diaPago} onChange={(e) => setDiaPago(e.target.value.replace(/\D/g, "").slice(0, 2))} placeholder="10" className={campo} />
        </>
      )}
```

- [ ] **Step 2: `app/(app)/plan/page.tsx`** — agregar `listarPagos(supabase)` al `Promise.all` como `pagosRes`; sumar `|| pagosRes.error` a `lecturaFallida`; pasar `pagos={lecturaFallida ? [] : pagosRes.data ?? []}` a `PlanClient`. Import: `import { listarPagos } from "@/lib/pagos/queries";`.

- [ ] **Step 3: `PlanClient`** — prop nueva `pagos: PlanPago[]` (solo lectura en Plan) y `calcularPlan({ rubros, ajustes, gastos, hoy, pagos })` con `pagos` en las dependencias del `useMemo`. Import `PlanPago` en el `import type`.

- [ ] **Step 4: `DetalleMes`** — en `Bloque`, la línea de un fijo pagado no es clickeable y muestra fecha y estimado:

```tsx
      {lineas.map((l) =>
        l.pagado ? (
          <Linea
            key={l.rubroId}
            nombre={`✓ ${l.nombre}`}
            detalle={`pagado el ${etiquetaFechaCorta(l.pagado.pagadoEl)}${l.monto !== l.estimado ? ` · estimado ${pesos(l.estimado)}` : ""}`}
            monto={l.monto}
            ajustado={false}
          />
        ) : (
          <Linea key={l.rubroId} nombre={l.nombre} monto={l.monto} ajustado={l.ajustado} onClick={() => onEditar(l.rubroId)} />
        )
      )}
```
Import: `import { etiquetaFechaCorta } from "@/lib/pagos/etiquetas";`.

- [ ] **Step 5: Gate** — `npx tsc --noEmit && npx eslint components app && npx vitest run` → PASS.

- [ ] **Step 6: Commit**

```bash
git add components/plan app/\(app\)/plan/page.tsx
git commit -m "feat(plan): día de pago en los fijos y fijos pagados con monto real"
```

---

### Task 7: Pestaña Pagos

**Files:**
- Create: `app/(app)/pagos/page.tsx`, `components/pagos/PagosClient.tsx`, `components/pagos/ResumenPagos.tsx`, `components/pagos/FilaPago.tsx`, `components/pagos/PagoSheet.tsx`
- Modify: `components/NavTabs.tsx`, `app/(app)/layout.tsx`

**Interfaces:**
- Consumes: `itemsPagos`, `agruparPagos`, `contadorPagos`, `resumenPagos`, `ItemPago` (Task 3); `textoEstadoPago`, `etiquetaFechaCorta` (Task 3); `listarPagos`, `marcarPago`, `desmarcarPago` (Task 4); `useToast` con acción, `Toast`, `useColaPorClave` (Task 5); `listarRubros`, `listarAjustes` de `lib/plan/queries`; `obtenerMiCuenta` de `lib/supabase/queries`; `etiquetaMes` de `lib/plan/etiquetas`; `formatearMiles`, `parsearMonto` de `lib/plan/formato`; `Sheet`, `Button`, `Banner`.

- [ ] **Step 1: `app/(app)/pagos/page.tsx`**

```tsx
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { obtenerMiCuenta } from "@/lib/supabase/queries";
import { listarAjustes, listarRubros } from "@/lib/plan/queries";
import { listarPagos } from "@/lib/pagos/queries";
import { PagosClient } from "@/components/pagos/PagosClient";

export default async function PagosPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const [cuentaRes, rubrosRes, ajustesRes, pagosRes] = await Promise.all([
    obtenerMiCuenta(supabase, user.id),
    listarRubros(supabase),
    listarAjustes(supabase),
    listarPagos(supabase),
  ]);

  const cuentaId = cuentaRes.data;
  const lecturaFallida = Boolean(cuentaRes.error || !cuentaId || rubrosRes.error || ajustesRes.error || pagosRes.error);

  return (
    <div className="max-w-xl mx-auto">
      <PagosClient
        cuentaId={cuentaId ?? ""}
        rubros={lecturaFallida ? [] : rubrosRes.data ?? []}
        ajustes={lecturaFallida ? [] : ajustesRes.data ?? []}
        pagosIniciales={lecturaFallida ? [] : pagosRes.data ?? []}
        lecturaFallida={lecturaFallida}
      />
    </div>
  );
}
```

- [ ] **Step 2: `components/pagos/ResumenPagos.tsx`**

```tsx
import { pesos } from "@/lib/money";
import { etiquetaMes } from "@/lib/plan/etiquetas";

export function ResumenPagos({ mes, pagado, total, faltan }: { mes: string; pagado: number; total: number; faltan: number }) {
  const pct = total > 0 ? Math.min(100, Math.round((pagado / total) * 100)) : 0;
  return (
    <div className="bg-surface border border-line rounded-2xl p-4 mb-3.5">
      <div className="text-[11px] tracking-wider uppercase text-muted font-semibold mb-1">{etiquetaMes(mes)}</div>
      <div className="text-[15px] text-ink">
        pagado <span className="num font-semibold">{pesos(pagado)}</span> de <span className="num">{pesos(total)}</span>
      </div>
      <div className="h-2 bg-bg rounded-full mt-2.5 overflow-hidden" role="progressbar" aria-valuenow={pct} aria-valuemin={0} aria-valuemax={100}>
        <div className="h-full bg-ok rounded-full" style={{ width: `${pct}%` }} />
      </div>
      <div className="text-xs text-muted mt-1.5">{faltan === 0 ? "todo pagado" : faltan === 1 ? "falta 1" : `faltan ${faltan}`}</div>
    </div>
  );
}
```

- [ ] **Step 3: `components/pagos/FilaPago.tsx`**

```tsx
"use client";

import { pesos } from "@/lib/money";
import { etiquetaMes } from "@/lib/plan/etiquetas";
import { textoEstadoPago } from "@/lib/pagos/etiquetas";
import type { ItemPago } from "@/lib/pagos/estado";

const COLOR: Record<ItemPago["estado"], string> = {
  vencido: "text-alerta",
  vence_pronto: "text-[#9A6A12]",
  pendiente: "text-muted",
  sin_dia: "text-muted",
  pagado: "text-ok",
};

export function FilaPago({
  item,
  hoy,
  mostrarMes,
  onCheck,
  onAbrir,
}: {
  item: ItemPago;
  hoy: string;
  mostrarMes: boolean;
  onCheck: () => void;
  onAbrir: () => void;
}) {
  const pagado = item.estado === "pagado";
  return (
    <div className="flex items-center gap-2 bg-surface border border-line rounded-xl pl-3 pr-1.5 mb-1.5 min-h-[56px]">
      <button type="button" onClick={onAbrir} className="flex-1 min-w-0 text-left py-2 cursor-pointer">
        <span className={`block text-sm ${pagado ? "text-muted line-through" : "text-ink"}`}>
          {item.nombre}
          {mostrarMes && <span className="ml-1.5 text-[11px] text-muted no-underline">{etiquetaMes(item.mes).toLowerCase()}</span>}
        </span>
        <span className={`block text-[11px] mt-0.5 ${COLOR[item.estado]}`}>{textoEstadoPago(item, hoy)}</span>
      </button>
      <span className="num text-[14px] text-ink">{pesos(item.pago?.monto ?? item.montoSugerido)}</span>
      <button
        type="button"
        onClick={onCheck}
        aria-label={pagado ? `Desmarcar ${item.nombre}` : `Marcar ${item.nombre} como pagado`}
        aria-pressed={pagado}
        className={`w-11 h-11 shrink-0 rounded-full border-2 flex items-center justify-center cursor-pointer transition-colors duration-150 ${
          pagado ? "bg-ok border-ok text-white" : "border-line text-transparent hover:border-ink"
        }`}
        style={{ touchAction: "manipulation" }}
      >
        ✓
      </button>
    </div>
  );
}
```
(Tocar el check de un pagado lo desmarca, con su propio "Deshacer".)

- [ ] **Step 4: `components/pagos/PagoSheet.tsx`**

```tsx
"use client";

import { useState } from "react";
import { Sheet } from "@/components/ui/Sheet";
import { Button } from "@/components/ui/Button";
import { pesos } from "@/lib/money";
import { formatearMiles, parsearMonto } from "@/lib/plan/formato";
import type { ItemPago } from "@/lib/pagos/estado";

const FECHA_RE = /^\d{4}-\d{2}-\d{2}$/;

export function PagoSheet({
  item,
  hoy,
  onGuardar,
  onDesmarcar,
  onCerrar,
}: {
  item: ItemPago;
  hoy: string;
  onGuardar: (monto: number, pagadoEl: string) => void;
  onDesmarcar: () => void;
  onCerrar: () => void;
}) {
  const [texto, setTexto] = useState(formatearMiles(String(item.pago?.monto ?? item.montoSugerido)));
  const [fecha, setFecha] = useState(item.pago?.pagadoEl ?? hoy);
  const [error, setError] = useState<string | null>(null);
  const [enviando, setEnviando] = useState(false);

  const guardar = () => {
    const n = parsearMonto(texto);
    if (n === null) return setError("Escribí un monto (puede ser 0).");
    if (!FECHA_RE.test(fecha)) return setError("Elegí la fecha del pago.");
    if (fecha > hoy) return setError("La fecha del pago no puede ser futura.");
    setError(null);
    setEnviando(true);
    onGuardar(n, fecha);
  };

  return (
    <Sheet titulo={item.nombre} onClose={onCerrar}>
      <label htmlFor="pago-monto" className="block text-[11px] tracking-wider uppercase text-muted font-semibold mt-3.5">Monto pagado</label>
      <div className="relative mt-1.5">
        <span className="absolute left-3 top-1/2 -translate-y-1/2 text-muted text-[20px] num">$</span>
        <input
          id="pago-monto"
          autoFocus
          inputMode="numeric"
          value={texto}
          onChange={(e) => setTexto(formatearMiles(e.target.value))}
          onKeyDown={(e) => e.key === "Enter" && guardar()}
          aria-invalid={Boolean(error)}
          className={`w-full border-[1.5px] rounded-lg pl-8 pr-3 py-3 num text-[24px] text-ink ${error ? "border-alerta" : "border-line"}`}
        />
      </div>
      <div className="text-[13px] text-muted mt-2">
        Estimado: <span className="num">{pesos(item.montoSugerido)}</span>
      </div>

      <label htmlFor="pago-fecha" className="block text-[11px] tracking-wider uppercase text-muted font-semibold mt-3.5">Fecha del pago</label>
      <input id="pago-fecha" type="date" max={hoy} value={fecha} onChange={(e) => setFecha(e.target.value)} className="w-full border-[1.5px] border-line rounded-lg px-3 py-3 text-[15px] text-ink mt-1.5 bg-surface" />

      {error && <div className="text-[12px] text-alerta mt-2">{error}</div>}

      <div className="flex flex-col gap-2 mt-5">
        <Button variant="primary" onClick={guardar} disabled={enviando}>
          {enviando ? "Guardando…" : item.pago ? "Guardar" : "Marcar pagado"}
        </Button>
        {item.pago && (
          <Button onClick={onDesmarcar} disabled={enviando}>
            Desmarcar
          </Button>
        )}
      </div>
    </Sheet>
  );
}
```

- [ ] **Step 5: `components/pagos/PagosClient.tsx`**

```tsx
"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { useToast } from "@/hooks/useToast";
import { useColaPorClave } from "@/hooks/useColaPorClave";
import { hoyISO, mesDe } from "@/lib/ciclo";
import { agruparPagos, itemsPagos, resumenPagos, type ItemPago } from "@/lib/pagos/estado";
import { desmarcarPago, marcarPago } from "@/lib/pagos/queries";
import type { PlanAjuste, PlanPago, PlanRubro } from "@/lib/types";
import { Banner } from "@/components/ui/Banner";
import { Toast } from "@/components/ui/Toast";
import { ResumenPagos } from "./ResumenPagos";
import { FilaPago } from "./FilaPago";
import { PagoSheet } from "./PagoSheet";

const clave = (rubroId: string, mes: string) => `${rubroId}|${mes}`;
const mismo = (p: PlanPago, rubroId: string, mes: string) => p.rubro_id === rubroId && p.mes === mes;

export function PagosClient({
  cuentaId,
  rubros,
  ajustes,
  pagosIniciales,
  lecturaFallida,
}: {
  cuentaId: string;
  rubros: PlanRubro[];
  ajustes: PlanAjuste[];
  pagosIniciales: PlanPago[];
  lecturaFallida: boolean;
}) {
  const supabase = useMemo(() => createClient(), []);
  const router = useRouter();
  const { mensaje, accion, mostrar } = useToast();
  const { encolar, nuevaGeneracion } = useColaPorClave();
  const [pagos, setPagos] = useState(pagosIniciales);
  const [abierto, setAbierto] = useState<ItemPago | null>(null);
  const [verPagados, setVerPagados] = useState(false);
  const hoy = hoyISO();
  const mesActual = mesDe(hoy);

  const items = useMemo(() => itemsPagos(rubros, ajustes, pagos, hoy), [rubros, ajustes, pagos, hoy]);
  const grupos = useMemo(() => agruparPagos(items), [items]);
  const resumen = resumenPagos(items, mesActual);
  const hayFijos = rubros.some((r) => r.tipo === "fijo");
  const sinDia = rubros.filter((r) => r.tipo === "fijo" && r.dia_pago === null).length;

  // Escritura optimista de una fila (rubro, mes). `previo` es la fila antes del cambio
  // (o undefined): si la escritura falla y sigue siendo la más nueva, se restaura.
  const escribir = (rubroId: string, mes: string, nuevo: PlanPago | null, previo: PlanPago | undefined, tarea: () => Promise<{ fila?: PlanPago | null; error: unknown }>, textoError: string) => {
    const k = clave(rubroId, mes);
    const esUltima = nuevaGeneracion(k);
    setPagos((prev) => [...prev.filter((p) => !mismo(p, rubroId, mes)), ...(nuevo ? [nuevo] : [])]);
    encolar(k, async () => {
      const { fila, error } = await tarea();
      if (error) {
        if (esUltima()) setPagos((prev) => [...prev.filter((p) => !mismo(p, rubroId, mes)), ...(previo ? [previo] : [])]);
        mostrar(textoError);
        return;
      }
      if (fila && esUltima()) setPagos((prev) => prev.map((p) => (mismo(p, rubroId, mes) ? fila : p)));
      router.refresh(); // actualiza el contador de la pestaña (layout de servidor)
    }).catch((e: unknown) => {
      console.error("pagos: falló la cola", e);
      mostrar("Falló una operación de pagos; recargá la página");
    });
  };

  const marcar = (item: ItemPago, monto: number, pagadoEl: string) => {
    const previo = pagos.find((p) => mismo(p, item.rubroId, item.mes));
    const provisional: PlanPago = previo
      ? { ...previo, monto, pagado_el: pagadoEl }
      : { id: `tmp-${clave(item.rubroId, item.mes)}`, cuenta_id: cuentaId, rubro_id: item.rubroId, mes: item.mes, monto, pagado_el: pagadoEl, created_by: null, created_at: "", updated_at: "" };
    escribir(item.rubroId, item.mes, provisional, previo, async () => {
      const { data, error } = await marcarPago(supabase, cuentaId, item.rubroId, item.mes, monto, pagadoEl);
      return { fila: data, error: error ?? (data ? null : "sin fila") };
    }, `No se pudo marcar ${item.nombre}`);
    return previo;
  };

  const desmarcar = (item: ItemPago) => {
    const previo = pagos.find((p) => mismo(p, item.rubroId, item.mes));
    escribir(item.rubroId, item.mes, null, previo, async () => {
      const { error } = await desmarcarPago(supabase, cuentaId, item.rubroId, item.mes);
      return { error };
    }, `No se pudo desmarcar ${item.nombre}`);
    return previo;
  };

  // Deshacer vuelve exactamente a la fila previa (o a "sin pago").
  const restaurar = (item: ItemPago, previo: PlanPago | undefined) => {
    if (previo) marcar(item, previo.monto, previo.pagado_el);
    else desmarcar(item);
  };

  const check = (item: ItemPago) => {
    if (item.pago) {
      const previo = desmarcar(item);
      mostrar(`${item.nombre} desmarcado`, { etiqueta: "Deshacer", onClick: () => restaurar(item, previo) });
    } else {
      const previo = marcar(item, item.montoSugerido, hoy);
      mostrar(`${item.nombre} pagado`, { etiqueta: "Deshacer", onClick: () => restaurar(item, previo) });
    }
  };

  const grupo = (titulo: string, lista: ItemPago[]) =>
    lista.length > 0 && (
      <section className="mt-4">
        <h2 className="text-[11px] tracking-wider uppercase text-muted font-semibold mb-1.5">{titulo}</h2>
        {lista.map((i) => (
          <FilaPago key={clave(i.rubroId, i.mes)} item={i} hoy={hoy} mostrarMes={i.mes !== mesActual} onCheck={() => check(i)} onAbrir={() => setAbierto(i)} />
        ))}
      </section>
    );

  return (
    <>
      {lecturaFallida && <Banner>No se pudieron cargar los pagos. Recargá la página.</Banner>}

      {!lecturaFallida && !hayFijos && (
        <Banner tono="info" accion={{ etiqueta: "Ir a Plan", onClick: () => router.push("/plan") }}>
          Agregá tus gastos fijos en Plan para controlar sus pagos.
        </Banner>
      )}

      {hayFijos && (
        <>
          <ResumenPagos mes={mesActual} {...resumen} />
          {sinDia > 0 && (
            <div className="text-[12px] text-muted mb-2">
              {sinDia === 1 ? "1 fijo sin día de pago" : `${sinDia} fijos sin día de pago`}: agregalo en{" "}
              <Link href="/plan" className="underline">Plan</Link> para ver cuándo vencen.
            </div>
          )}
          {grupo("Vencidos", grupos.vencidos)}
          {grupo("Vencen pronto", grupos.pronto)}
          {grupo("Pendientes", grupos.pendientes)}
          {grupo("Sin día", grupos.sinDia)}
          {grupos.pagados.length > 0 && (
            <section className="mt-4">
              <button type="button" onClick={() => setVerPagados((v) => !v)} className="text-[11px] tracking-wider uppercase text-muted font-semibold mb-1.5 min-h-[44px] cursor-pointer" aria-expanded={verPagados}>
                Pagados ({grupos.pagados.length}) {verPagados ? "▴" : "▾"}
              </button>
              {verPagados &&
                grupos.pagados.map((i) => (
                  <FilaPago key={clave(i.rubroId, i.mes)} item={i} hoy={hoy} mostrarMes={false} onCheck={() => check(i)} onAbrir={() => setAbierto(i)} />
                ))}
            </section>
          )}
        </>
      )}

      {abierto && (
        <PagoSheet
          item={abierto}
          hoy={hoy}
          onGuardar={(monto, fecha) => {
            marcar(abierto, monto, fecha);
            setAbierto(null);
          }}
          onDesmarcar={() => {
            const previo = desmarcar(abierto);
            const item = abierto;
            mostrar(`${item.nombre} desmarcado`, { etiqueta: "Deshacer", onClick: () => restaurar(item, previo) });
            setAbierto(null);
          }}
          onCerrar={() => setAbierto(null)}
        />
      )}

      <Toast mensaje={mensaje} accion={accion} />
    </>
  );
}
```
Antes de escribir, verificar con `sed -n 1,40p components/ui/Banner.tsx` que `Banner` acepta `tono="info"` y `accion={{ etiqueta, onClick }}` (así lo usa `PlanClient`); si la firma difiere, adaptar a la real.

- [ ] **Step 6: `NavTabs`** — agregar `{ href: "/pagos", label: "Pagos" }` entre Pendientes e Historial; prop `pagosCount = 0`; badge igual al de Pendientes para `t.href === "/pagos" && pagosCount > 0`.

- [ ] **Step 7: `app/(app)/layout.tsx`** — calcular el contador:

```tsx
import { NavTabs } from "@/components/NavTabs";
import { createClient } from "@/lib/supabase/server";
import { listarGastosPendientes } from "@/lib/supabase/queries";
import { listarAjustes, listarRubros } from "@/lib/plan/queries";
import { listarPagos } from "@/lib/pagos/queries";
import { contadorPagos, itemsPagos } from "@/lib/pagos/estado";
import { hoyISO } from "@/lib/ciclo";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  let pendientesCount = 0;
  let pagosCount = 0;
  if (user) {
    const [pend, rubros, ajustes, pagos] = await Promise.all([
      listarGastosPendientes(supabase),
      listarRubros(supabase),
      listarAjustes(supabase),
      listarPagos(supabase),
    ]);
    pendientesCount = pend.data?.length ?? 0;
    if (rubros.error || ajustes.error || pagos.error) {
      // Sin contador antes que uno falso; /pagos muestra el error con Banner.
      console.error("layout: no se pudo calcular el contador de pagos", rubros.error ?? ajustes.error ?? pagos.error);
    } else {
      pagosCount = contadorPagos(itemsPagos(rubros.data ?? [], ajustes.data ?? [], pagos.data ?? [], hoyISO()));
    }
  }

  return (
    <main className="min-h-screen">
      <div className="max-w-xl lg:max-w-4xl mx-auto px-4 pt-4 pb-24">
        <NavTabs pendientesCount={pendientesCount} pagosCount={pagosCount} />
        {children}
      </div>
    </main>
  );
}
```

- [ ] **Step 8: Gate** — `npx vitest run && npx tsc --noEmit && npx eslint .` → PASS.

- [ ] **Step 9: Commit**

```bash
git add app/\(app\)/pagos components/pagos components/NavTabs.tsx app/\(app\)/layout.tsx
git commit -m "feat(pagos): pestaña Pagos con checklist del mes, deshacer y contador"
```

---

### Task 8: Verificación end-to-end y entrega

**Files:** ninguno nuevo (arreglos que salgan, cada uno con su test si es lógica).

- [ ] **Step 1: Correr la app en local.** `.env.local` del repo solo trae `VERCEL_OIDC_TOKEN`: sacar las llaves con `GET /v1/projects/jwipheuvrhqlgivmxvur/api-keys?reveal=true` (tipo `legacy`: `anon`) y escribir `NEXT_PUBLIC_SUPABASE_URL` / `NEXT_PUBLIC_SUPABASE_ANON_KEY` en `.env.local` (no se commitea). Levantar con `preview_start` (`.claude/launch.json`: `npm run dev`, puerto 3000).

- [ ] **Step 2: Pedirle a David que inicie sesión en el navegador integrado** (Claude no ingresa contraseñas).

- [ ] **Step 3: Recorrido, verificando el efecto en la base después de cada paso** (consulta a `plan_pagos` por la Management API):
  1. Plan → Rubros → editar un fijo: poner día de pago 5. `plan_rubros.dia_pago = 5`.
  2. Pagos: aparece con su estado correcto; el contador de la pestaña coincide con vencidos + pronto.
  3. Tocar el check: fila pasa a Pagados, existe la fila en `plan_pagos` con `pagado_el` = hoy (Bogotá).
  4. "Deshacer": la fila desaparece de `plan_pagos`.
  5. Abrir la hoja, cambiar monto y fecha, guardar: la fila tiene esos valores. Plan → mes actual: ✓, monto real y "estimado $X".
  6. Desmarcar desde la hoja: la fila se borra; Plan vuelve al estimado.
  7. Ancho 375px (`resize_window` preset mobile): las 6 pestañas caben sin desbordar; si no, acortar etiquetas y repetir.
  8. Dejar la base como estaba (borrar pagos de prueba, restaurar `dia_pago` si David no lo quería).

- [ ] **Step 4: Gate final** — `npx vitest run && npx tsc --noEmit && npx eslint .` → PASS.

- [ ] **Step 5: Revisión por dimensiones distintas** (L2): `agent-teams:team-review` con security (RLS/FK/trigger de la migración), architecture (límites `lib/pagos` ↔ `lib/plan`) y testing (cobertura de bordes). Corregir lo confirmado.

- [ ] **Step 6: PR** — push de `claude/pagos-fijos`, `gh pr create` con resumen, verificación hecha y nota de que la migración **ya está aplicada** en producción (aditiva). Merge solo cuando David lo pida; después del deploy, verificar el bundle servido y el `/pagos` con su sesión.
