# Plan mensual — ingresos, gastos y ahorro proyectado

Fecha: 2026-09-14

## Objetivo

Responder, mes a mes y hacia adelante:

> **¿Cuánto entra, cuánto sale (tarjeta + fijos) y cuánto queda?**

Hoy la app controla el gasto de tarjeta de crédito contra un tope. Este
módulo agrega el otro lado —los ingresos y los gastos fijos que no pasan por
la tarjeta— y cruza ambos para proyectar el ahorro de los próximos meses.

## Relación con la rama `claude/cash-flow-projection-viiyq6` (Flujo)

Existe una rama sin mergear con una pestaña **Flujo** mucho más ambiciosa
(saldo bancario, PSE, deudas con amortización, curva diaria a 90 días,
migraciones `0005`–`0010`). **Decisión de David (2026-09-14): empezar de cero
con un módulo más simple.** Esa rama queda como está; este diseño no depende
de ella ni la reemplaza.

Consecuencias prácticas:

- Producción ya tiene aplicadas `0005_flujo_de_caja` y `0006_confirmar_cuota`
  (tablas `flujo_*`). La migración de este módulo se numera **`0011`** y las
  tablas llevan prefijo **`plan_`**, para que no colisione en ningún orden de
  merge posible.
- El estado real de las migraciones se verifica contra `pg_tables` /
  `information_schema` de producción, no contra el `ls` del repositorio.

## Principio: aislamiento, igual que Gmail y Flujo

**El módulo de tarjeta no se toca.** Ni `expenses`, ni `settings`, ni
`categories`, ni `lib/ciclo.ts` (salvo agregar una función pura si faltara),
ni las pantallas existentes.

Invariante verificable de la migración `0011`: **no contiene un solo
`alter table` sobre una tabla existente.**

El único punto de contacto con el módulo de tarjeta es **lectura** de
`expenses` para calcular la factura de cada ciclo. Único archivo existente
que se modifica: `components/NavTabs.tsx` (una entrada en `TABS`) y
`lib/types.ts` (tipos nuevos).

## Decisiones tomadas (brainstorming con David)

| Pregunta | Decisión |
|---|---|
| Unidad de tiempo | **Mes calendario** para ingresos y fijos; la tarjeta del mes M es **el ciclo M−1** (16 de M−2 → 15 de M−1), que se paga a comienzos de M. Corregido el 2026-10-02: el diseño original asumía pago el 30 de M, pero el ciclo que cierra el 15-sep se paga el 2-oct. |
| Qué se resta | Tarjeta **+ gastos fijos fuera de TC** (arriendo, servicios…). Solo TC daría un ahorro inflado. |
| Cómo se registran ingresos y fijos | **Rubros recurrentes con monto por defecto**, sobreescribibles mes a mes. Un extra puntual (prima) es un rubro de un solo mes. |
| TC de meses futuros | **Promedio de los últimos 3 ciclos cerrados con gasto > 0, editable por mes.** |
| Ahorro | **Del mes + acumulado hacia adelante**, sin meta. |
| Modelo de datos | **Dos tablas** (`plan_rubros`, `plan_ajustes`) + lógica pura en `lib/plan/`. Se descartó JSONB en `settings` (pisadas en cuenta compartida) y filas materializadas por mes (regenerar overrides). |
| Cuenta compartida | Los rubros son **de la cuenta**, no de la persona. Quién aporta va en el nombre ("Nómina David"). |

## El cálculo — `lib/plan/calculo.ts`

Función pura, sin Supabase, sin `Date` del sistema, con fechas como strings:

```ts
calcularPlan({
  rubros: PlanRubro[],
  ajustes: PlanAjuste[],
  gastos: Expense[],
  hoy: string,          // 'YYYY-MM-DD'
  mesesAtras: 3,
  mesesAdelante: 6,
}): MesPlan[]
```

```ts
interface LineaPlan {
  rubroId: string;
  nombre: string;
  monto: number;
  ajustado: boolean;     // hay un plan_ajustes para este rubro y mes
}

type OrigenTC = "real" | "ritmo" | "promedio" | "manual" | "sin_datos";

interface MesPlan {
  mes: string;           // 'YYYY-MM'
  esActual: boolean;
  ingresos: LineaPlan[];
  fijos: LineaPlan[];
  totalIngresos: number;
  totalFijos: number;
  tc: { monto: number; origen: OrigenTC; editable: boolean; ciclo: string };
  ahorro: number | null; // null si no hay ningún rubro de ingreso
  acumulado: number | null; // null en meses pasados
}
```

### Rango

`mesesAtras` meses antes del mes de `hoy`, el mes actual, y `mesesAdelante`
después: 10 meses, ordenados, cruzando año sin problema (`desplazarMes`).

### Ingresos y fijos

Un rubro aplica al mes si `desde <= mes && (hasta == null || mes <= hasta)`
(comparación de strings `YYYY-MM`). Su monto es el de `plan_ajustes` para
`(rubro_id, mes)` si existe; si no, `monto_default`.

### Tarjeta: depende del estado del ciclo, no del mes

> **Corregido el 2026-10-02.** El mes M paga el ciclo **M−1**
> (`cicloQuePagaEn(M)`), no el ciclo M: la factura que cierra el 15 de M−1 sale
> de la caja a comienzos de M. La tabla de abajo sigue hablando del "ciclo";
> leé "ciclo M" como "el ciclo que paga el mes", es decir M−1. Consecuencia: el
> mes actual siempre tiene factura exacta, el siguiente va "a este ritmo" y del
> tercero en adelante, promedio. Los ajustes manuales de TC se guardan por mes
> de pago.

El ciclo del mes M es `M` mismo (`cicloDe` ya define que las fechas 16 de
M−1 a 15 de M pertenecen al ciclo `M`).

| Estado del ciclo M | Monto | `origen` | `editable` |
|---|---|---|---|
| **Cerrado** — `hoy > cicloFin(M)` | suma real de `expenses` con `cicloDe(fecha) === M` (es la factura) | `real` | no — un ajuste existente se **ignora** |
| **En curso** — `cicloInicio(M) <= hoy <= cicloFin(M)` | ajuste si existe; si no `real + (real / díasCorridos) × largoDelCiclo`, con `diasCorridosEnRango` y el largo del **ciclo**, no del mes | `manual` / `ritmo` | sí |
| **No iniciado** — `hoy < cicloInicio(M)` | ajuste si existe; si no, promedio de los últimos 3 ciclos **cerrados con gasto > 0** (menos si no hay 3) | `manual` / `promedio` | sí |
| No iniciado sin ningún ciclo cerrado con datos | 0 | `sin_datos` | sí |

Consecuencia que hay que aceptar: el 20 de septiembre, **septiembre ya tiene
factura exacta** (cerró el 15) y **octubre ya está "a este ritmo"** (el ciclo
`2026-10` arrancó el 16-sep). Siempre hay un mes cerrado y uno en ritmo; del
tercero en adelante, promedio. Es fiel a cómo funciona la tarjeta.

El ritmo los primeros días del ciclo es hipersensible, igual que hoy en
Registro. Se acepta sin suavizado en v1.

### Ahorro y acumulado

- `ahorro = totalIngresos − totalFijos − tc.monto`. Puede ser negativo.
- Si no hay **ningún rubro de tipo `ingreso`** vigente en el mes, `ahorro` es
  `null` — la UI muestra "—". Sin esto, `−TC` se leería como un bug.
- `acumulado` arranca en el mes actual (incluido) y suma hacia adelante. En
  meses pasados es `null`. Si el `ahorro` es `null`, ese mes aporta 0 al
  acumulado pero el acumulado sigue siendo `null` hasta que haya un ahorro
  real que sumar.

## Datos — `supabase/migrations/0011_plan_mensual.sql`

```sql
create table plan_rubros (
  id            uuid primary key default gen_random_uuid(),
  cuenta_id     uuid not null references cuentas(id) on delete cascade,
  tipo          text not null check (tipo in ('ingreso', 'fijo')),
  nombre        text not null check (length(trim(nombre)) > 0),
  monto_default bigint not null check (monto_default >= 0),
  desde         text not null check (desde ~ '^\d{4}-(0[1-9]|1[0-2])$'),
  hasta         text check (hasta is null or (hasta ~ '^\d{4}-(0[1-9]|1[0-2])$' and hasta >= desde)),
  orden         int not null default 0,
  created_by    uuid references auth.users(id) on delete set null,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);

create table plan_ajustes (
  id         uuid primary key default gen_random_uuid(),
  cuenta_id  uuid not null references cuentas(id) on delete cascade,
  mes        text not null check (mes ~ '^\d{4}-(0[1-9]|1[0-2])$'),
  rubro_id   uuid references plan_rubros(id) on delete cascade,  -- null = estimado de TC
  monto      bigint not null check (monto >= 0),
  updated_at timestamptz not null default now(),
  unique nulls not distinct (cuenta_id, mes, rubro_id)
);

create index plan_rubros_cuenta_idx on plan_rubros (cuenta_id, tipo, orden);
```

Decisiones:

- **`mes` como texto `YYYY-MM`**, no `date`: es lo que usa todo `lib/ciclo.ts`,
  se compara como string y no depende de zona horaria. El `check` impide un
  `2026-9`.
- **`monto_default >= 0`**: un rubro puede quedar en cero un mes sin borrarlo.
- **Vigencia**: un rubro que terminó no se borra, se le pone `hasta`; así los
  meses pasados conservan su historia. Borrar existe y cascadea ajustes.
- **`unique nulls not distinct`**: sin eso Postgres permitiría N filas de TC
  (`rubro_id null`) para el mismo mes. Requiere PG ≥ 15 — se confirma con
  `select version()` antes de aplicar.
- **Ajustes por `upsert`** sobre esa clave; **quitar un ajuste = `delete`** y
  el mes vuelve al default/promedio.
- **Triggers reutilizados**: `set_created_by()` en `plan_rubros` (insert) y
  `set_updated_at()` en ambas tablas (update). No se duplican funciones.
- **RLS**: `enable row level security` en ambas y una política
  `for all using (cuenta_id = mi_cuenta()) with check (cuenta_id = mi_cuenta())`
  por tabla, idéntica a `expenses_rw`.

### Tipos y queries

- `lib/types.ts`: `PlanRubro`, `PlanAjuste`, y las entradas `plan_rubros` /
  `plan_ajustes` en `Database` con `Insert`/`Update` como literales inline
  (ver la nota del archivo sobre postgrest-js).
- `lib/plan/queries.ts` (no en `lib/supabase/queries.ts`, para que el módulo
  sea autocontenido como `lib/gmail/`): `listarRubros`, `crearRubro`,
  `actualizarRubro`, `eliminarRubro`, `listarAjustes`, `guardarAjuste`
  (upsert), `quitarAjuste`. Todas devuelven `{ data, error }` — el error se
  devuelve, nunca se traga.

### Verificación de la migración (obligatoria)

1. `select version()` → PG ≥ 15.
2. Aplicar por Management API (`POST /v1/projects/{ref}/database/query`).
3. Verificar el **efecto**: `information_schema.columns` para las dos tablas,
   `pg_policies` para las políticas, `pg_indexes` para la unique, `pg_trigger`
   para los triggers.
4. RLS con `set role authenticated` + `request.jwt.claims`: con el `sub` de un
   miembro de la cuenta inserta y lee; con un `sub` inventado el `select`
   devuelve 0 filas **y** el `insert` falla por `with check`. Los dos casos.
5. Dos ajustes de TC (`rubro_id null`) el mismo mes → `23505`.

## UI — pestaña **Plan** (`/plan`)

### Sistema visual: el que ya existe

Se corrió `ui-ux-pro-max`. Su regla de mayor prioridad es consistencia entre
pantallas, y la app ya tiene un sistema coherente: fondo `bg` `#EFECF4`,
`surface`, `ink`, `muted`, `line`, `ok`/`alerta`/`aviso`; Bricolage para
títulos, IBM Plex Sans para texto, Plex Mono con `tabular-nums` (`.num`)
para cifras. **Plan usa esos tokens, sin paleta nueva.** Del skill se toman
las reglas de interacción móvil (abajo).

### Archivos

```
app/(app)/plan/page.tsx            servidor: rubros, ajustes, gastos, cuentaId → PlanClient
components/plan/PlanClient.tsx     estado, calcularPlan(), mutaciones optimistas, toasts
components/plan/SubTabs.tsx        segmentado Meses | Rubros
components/plan/ResumenMes.tsx     tarjeta del mes en curso
components/plan/GraficaAhorro.tsx  barras de ahorro por mes (Recharts, calcada de GraficaCiclos)
components/plan/ListaMeses.tsx     acordeón de meses
components/plan/DetalleMes.tsx     desglose de un mes abierto
components/plan/AjusteSheet.tsx    editar un monto en un mes
components/plan/RubrosPanel.tsx    listas de ingresos y fijos
components/plan/RubroSheet.tsx     crear / editar / eliminar rubro
components/ui/Sheet.tsx            hoja que sube desde abajo (nuevo primitivo)
lib/plan/calculo.ts + .test.ts
lib/plan/queries.ts + .test.ts
lib/plan/formato.ts + .test.ts     miles en vivo para el input de plata
```

`NavTabs.tsx`: `{ href: "/plan", label: "Plan" }` entre Historial y Cuenta.
Quedan cinco pestañas; con label corto entra a 375px. Si se ve apretado se
ajusta el tamaño de fuente del nav, no se quita nada.

### Estructura: dos sub-vistas, un solo scroll vertical

Control segmentado **Meses | Rubros** arriba, con la anatomía del `Tabs` de
Registro. Sin swipe horizontal: el gesto principal es scroll vertical y el
swipe choca con el "atrás" del sistema.

### Vista Meses

**Tarjeta del mes en curso** (`ResumenMes`, anatomía de `TopeCard`):
"Septiembre" en `font-display`; ingresos y gastos en `num`; el **ahorro** a
32px en `text-ok` o `text-alerta`, **siempre con signo** (el color no es el
único indicador). Debajo: *"A este ritmo, en marzo 2027 acumulás $X"* (último
mes del rango). Si `ahorro` es `null`, muestra "—".

**Gráfica** (`GraficaAhorro`): una barra por mes con el ahorro, `ok`/`alerta`
según signo, relleno punteado en meses con TC estimada (`ritmo`, `promedio`,
`manual`, `sin_datos`), valor encima de cada barra. Tocar una barra abre ese
mes en la lista y hace scroll suave hasta él. 150px de alto fijos: espacio
reservado, sin salto al montar.

**Lista de meses** (`ListaMeses`): 10 filas, cada una un `<button>` de
`min-h-[56px]` con `aria-expanded`, `cursor-pointer`,
`touch-action: manipulation` y `focus-visible:ring-2 ring-ink/40`. Cerrada:
mes · ahorro con signo · chevron SVG. Una abierta a la vez; la del mes actual
arranca abierta. Expandir con `grid-template-rows: 0fr → 1fr` + opacidad,
200ms `ease-out`; el `prefers-reduced-motion` global ya lo anula.

**Detalle** (`DetalleMes`): tres bloques — **Ingresos**, **Fijos**,
**Tarjeta**. Cada línea es un botón de 44px: nombre a la izquierda, monto
`num` a la derecha; si tiene ajuste, subrayado punteado + lápiz SVG de 20px.
La TC lleva un chip de origen **en texto**: `factura` / `a este ritmo` /
`promedio 3 ciclos` / `ajustado` / `sin historial`. Un ciclo cerrado se
renderiza como texto, no como botón. Al pie: totales, ahorro del mes y
acumulado si aplica.

### Editar un monto: `Sheet`, no modal centrado

`components/ui/Sheet.tsx`: hoja que sube desde abajo (`translateY`, 220ms
ease-out), asa arriba, cierra con tap afuera o Escape, `role="dialog"` con
`aria-labelledby`. En móvil el teclado no la tapa, a diferencia del `Modal`
centrado. El `Modal` existente se queda para lo que ya lo usa.

`AjusteSheet`: título ("Nómina David · octubre"); input `inputMode="numeric"`
a 24px con separadores de miles en vivo (`formatearMiles` / `parsearMonto`) y
autofocus; debajo, el valor de referencia ("Por defecto: $4.500.000" o "Promedio
3 ciclos: $6.180.000"); dos botones de 44px con `gap-2`: **Guardar**
(primario; Enter también guarda) y **Volver al valor por defecto** (solo si
hay ajuste). Validación en blur: vacío o inválido muestra el mensaje debajo
del input, no en toast.

**Optimista con reversión**: al guardar, el monto cambia en pantalla y la
hoja se cierra; si Supabase devuelve error, vuelve el valor anterior y sale el
toast con el mensaje. Mientras la petición está en vuelo el botón queda
`disabled`.

### Vista Rubros

Dos listas, **Ingresos** y **Fijos**. Fila de 56px: nombre, monto por defecto
en `num`, vigencia en `text-muted` ("desde sep 2026" / "sep – dic 2026" /
"solo dic 2026"). Tocar abre `RubroSheet` en modo edición; fila final
"+ Agregar ingreso" / "+ Agregar fijo".

`RubroSheet`: tipo como segmentado, nombre, monto (mismo input de miles),
`desde` (default: mes actual, selector de mes), toggle **"Puntual (un solo
mes)"** que oculta `hasta` y lo iguala a `desde`; si no es puntual, `hasta`
opcional. Eliminar en dos pasos dentro de la hoja: "¿Eliminar? Se pierden N
ajustes" → botón `alerta`. Mismo patrón optimista con reversión.

### Estado vacío

Sin rubros, la vista Meses muestra igual la TC (es dato real), el ahorro como
"—", y arriba un `Banner` en variante nueva `tono="info"` (azulado, no el rojo
actual): *"Agregá tus ingresos y gastos fijos para ver el ahorro"* con acción
"Agregar" que cambia a Rubros con `RubroSheet` abierta.

### Errores

- `lecturaFallida` en el servidor → `Banner` rojo como en Historial, no una
  pantalla vacía silenciosa.
- Toda mutación fallida → reversión + toast. Ningún `catch` vacío.

### Reglas transversales

- Touch targets ≥ 44px; `gap-2` mínimo entre botones adyacentes.
- Sin emojis como íconos: chevron, lápiz, más, cerrar como SVG inline
  `w-5 h-5` con `aria-label` cuando van solos.
- Texto de cifras no baja de 13px; body 14px como el resto de la app.
- Sin scroll horizontal a 375px.

### Fuera de v1, a propósito

Meta de ahorro, reordenar rubros con drag, exportar el plan, suavizado del
ritmo los primeros días, rubros por persona.

## Pruebas y verificación

El gate es lo ejecutable: Vitest, `tsc --noEmit`, lint, build, y la
verificación de la migración contra producción. Los agentes de review van
después, solo si queda duda real.

### `lib/plan/calculo.test.ts` — TDD, fechas fijas, nunca `hoyISO()`

**Vigencia**
- `desde: '2026-09'` no aparece en `2026-08`; sí en `2026-09` y `2027-03`.
- `hasta: '2026-12'` aparece en diciembre, no en enero.
- Puntual (`desde === hasta`) aparece en exactamente un mes.

**Ajustes**
- Ajuste sobre un rubro reemplaza el default solo ese mes; el siguiente
  vuelve al default.
- Ajuste de TC (`rubro_id null`) reemplaza solo si el ciclo no está cerrado;
  sobre un ciclo cerrado se ignora y `origen` sigue `real`.

**Estado del ciclo**
- `hoy = '2026-09-20'`: septiembre `real` con la suma exacta del 16-ago al
  15-sep; octubre `ritmo` con `real + (real/díasCorridos)×largo` usando el
  largo del ciclo; noviembre `promedio`.
- `hoy = '2026-09-10'`: septiembre `ritmo`; octubre `promedio`.
- Promedio con 5 ciclos cerrados usa los 3 más recientes.
- Un ciclo cerrado con $0 no entra al promedio (control: dos en cero y uno
  con datos → el promedio es el de datos, no un tercio).
- Sin ciclo cerrado con datos → `sin_datos`, monto 0.
- Gasto del 15-sep cae en septiembre; del 16-sep en octubre.

**Ahorro y acumulado**
- `ahorro = ingresos − fijos − tc`, negativo permitido.
- Pasados: `acumulado null`. Actual: `acumulado === ahorro`. Siguiente: suma.
- Sin rubros de ingreso: `ahorro null`.

**Rango**
- 10 meses ordenados; `hoy` en noviembre llega hasta mayo del año siguiente.

### `lib/plan/queries.test.ts`

Cliente Supabase falso, estilo `lib/gmail/sync.test.ts`. `guardarAjuste` hace
`upsert` con `onConflict: 'cuenta_id,mes,rubro_id'`; `quitarAjuste` borra por
esa clave; un error de Supabase se devuelve en `{ error }`, no se traga.

### `lib/plan/formato.test.ts`

`formatearMiles('4500000') → '4.500.000'`; `parsearMonto('4.500.000') →
4500000`; vacío → `null`; ceros a la izquierda; pegado con `$`.

### Cierre de la rama

1. `npm test`, `npx tsc --noEmit`, `npm run lint`, `npm run build` en verde.
2. Migración aplicada y verificada según la sección de datos.
3. Verificación visual en el navegador integrado a 375px: expandir/colapsar,
   editar un ajuste y ver la reversión forzando un error, estado vacío, sin
   scroll horizontal.
4. `agent-teams:team-review` con tres dimensiones distintas: **seguridad**
   (RLS, inputs), **arquitectura** (aislamiento, ningún `alter` a tablas
   viejas), **testing** (los bordes de arriba). Nunca dos revisores
   genéricos sobre el mismo diff.
5. PR a `main`.
