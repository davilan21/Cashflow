# Proyección de flujo de caja — diseño

Fecha: 2026-08-21

## Objetivo

Responder una sola pregunta, todos los días, sin abrir un Excel:

> **¿Cuánta plata voy a tener, y cuándo voy a estar más apretado?**

Hoy la app controla el gasto de tarjeta de crédito contra un tope. Eso
resuelve "¿me estoy pasando este ciclo?", pero no "¿me alcanza para el 30?".
Falta el otro lado del balance: ingresos, gastos fijos, deudas, inversiones,
y el saldo real en el banco.

## La idea central: el puente entre lo que hay y lo que falta

> **Un gasto de tarjeta no es una salida de caja el día que ocurre. Es una
> salida de caja el día 30, cuando se paga el ciclo.**

Los N gastos del ciclo `2026-09` que ya se capturan por Gmail colapsan en
**un** evento de caja: "pago TC 2026-09: $4.1M el 30-sep". `cicloPago()` en
`lib/ciclo.ts` ya calcula esa fecha. La app de topes no se reemplaza: se
convierte en el alimentador principal de la proyección.

## Decisiones tomadas (brainstorming con David)

- **Saldo de caja**: se mantiene **automáticamente desde Gmail**, parseando
  las alertas de débito, transferencia y abono de nómina de Bancolombia.
  **Restricción técnica**: las alertas describen *movimientos*, no saldos
  (confirmado en `lib/gmail/parse.ts`). Por lo tanto el modelo es
  **semilla + deltas + re-anclaje**: David ingresa su saldo una vez, Gmail
  lo mantiene al día sumando/restando movimientos, y puede re-anclarlo
  cuando quiera si se desvía.
- **Granularidad**: **día a día, horizonte de 90 días**. La curva fina es
  lo que muestra los apretones *dentro* del mes — entre el pago de la TC
  el 30 y la siguiente quincena — que es justo donde duele y que una vista
  mensual esconde.
- **Alcance v1**: ingresos + gastos fijos + pago de TC + **deudas con
  amortización**. Fuera de v1: diferidos de TC (compras a cuotas) e
  inversiones.
- **Inversiones**: el aporte recurrente es una salida de caja; además se
  marca cuáles son **líquidas**, para que cuando la proyección toque el
  piso la app diga "tienes $X liquidables para cubrirlo" en vez de solo
  alarmar. Sin rentabilidad ni valorización — eso es otra app.
- **Cuenta compartida**: reglas, deudas e inversiones pertenecen a la
  `cuenta` (el hogar), no al usuario. Se guarda `created_by` para
  atribución, igual que `expenses`.

## El riesgo #1: doble conteo

Es el error que arruina cualquier proyección de este tipo, y hay que
resolverlo en el esquema, no en la UI.

Netflix es gasto fijo **y** llega a la tarjeta. Si se modela mal se cuenta
dos veces — como salida fija en su fecha y otra vez dentro del pago del
ciclo — y la proyección queda sistemáticamente pesimista.

La solución es **`medio_pago` en cada gasto y en cada regla recurrente**:

- `medio_pago = 'debito'` o `'efectivo'` → evento de caja en su fecha.
- `medio_pago = 'tc'` → **no toca caja**; suma al total esperado del ciclo,
  y toca caja el día del pago del ciclo.

Corolarios finos, los tres necesarios:

1. Cuando Gmail ingesta el cargo real de Netflix del ciclo, la expectativa
   de esa regla para ese ciclo queda **consumida**, no se suma encima. Por
   eso `expenses` gana `regla_id`: emparejar por id explícito, nunca por
   heurística de monto o nombre.
2. La proyección "a este ritmo" (run-rate) corre solo sobre el gasto
   **discrecional** — es decir, excluye los `expenses` con `regla_id` no
   nulo. Si no, los fijos se cuentan dos veces dentro del mismo ciclo.
3. Un gasto de débito registrado en `expenses` ya afecta el saldo; no debe
   además existir como fila en `movimientos_caja`. Ver "Quién es dueño de
   qué" abajo.

## Modelo de datos

Migración `0005_flujo_de_caja.sql`.

### Cambios a tablas existentes

```sql
alter table expenses add column medio_pago text not null default 'tc'
  check (medio_pago in ('tc', 'debito', 'efectivo'));
alter table expenses add column regla_id uuid references reglas(id) on delete set null;
alter table gastos_pendientes add column medio_pago text not null default 'tc'
  check (medio_pago in ('tc', 'debito', 'efectivo'));
```

El default `'tc'` es correcto para todo lo histórico: hasta hoy la app solo
registra gastos de tarjeta.

### `saldo_snapshots` — el ancla

| columna | tipo | notas |
|---|---|---|
| `id` | uuid, PK | |
| `cuenta_id` | uuid | FK a `cuentas` |
| `fecha` | date | a qué fecha corresponde el saldo |
| `monto` | bigint | saldo en el banco; puede ser 0 |
| `origen` | text | `manual` \| `gmail` |
| `created_by` | uuid | |
| `created_at` | timestamptz | |

El snapshot más reciente es el punto desde el que se acumula. Re-anclar es
insertar uno nuevo, no editar el viejo — así queda el historial de qué tan
buena fue la proyección entre anclas.

### `movimientos_caja` — el libro de caja no-gasto

| columna | tipo | notas |
|---|---|---|
| `id` | uuid, PK | |
| `cuenta_id` | uuid | |
| `fecha` | date | |
| `monto` | bigint | **con signo**: + entrada, − salida |
| `tipo` | text | `ingreso` \| `pago_tc` \| `cuota_deuda` \| `aporte` \| `transferencia` \| `otro` |
| `etiqueta` | text | descripción corta |
| `origen` | text | `manual` \| `gmail` |
| `ref_ciclo` | text, null | para `pago_tc`: qué ciclo se pagó |
| `ref_id` | uuid, null | regla o deuda que originó el movimiento |
| `created_by`, `created_at` | | |

#### Quién es dueño de qué (evitar el doble conteo #3)

- `expenses` sigue siendo el libro de **gastos categorizados** (de TC o de
  débito, según `medio_pago`).
- `movimientos_caja` cubre lo que **no es un gasto**: ingresos, el pago de
  la TC, cuotas de deuda, aportes, transferencias.
- Nunca la misma plata en las dos tablas.

Por lo tanto:

```
saldo hoy = último snapshot
          + Σ movimientos_caja con fecha > snapshot
          − Σ expenses con medio_pago ≠ 'tc' y fecha > snapshot
```

### `reglas` — los compromisos recurrentes

| columna | tipo | notas |
|---|---|---|
| `id` | uuid, PK | |
| `cuenta_id` | uuid | |
| `tipo` | text | `ingreso` \| `gasto_fijo` \| `aporte_inversion` |
| `nombre` | text | "Nómina", "Arriendo", "Netflix" |
| `monto` | bigint | |
| `frecuencia` | text | `quincenal` \| `mensual` \| `bimestral` \| `anual` \| `unica` |
| `dia_1` | int | día del mes (1–31) |
| `dia_2` | int, null | segundo día, solo para `quincenal` |
| `mes` | int, null | solo para `anual` (prima = 6 y 12, cesantías = 2) |
| `medio_pago` | text | `debito` \| `efectivo` \| `tc` — solo aplica a `gasto_fijo` |
| `categoria` | text, null | FK a `categories`, para fijos que van a la TC |
| `inversion_id` | uuid, null | solo para `aporte_inversion` (fase 6) |
| `desde` | date | |
| `hasta` | date, null | null = indefinida |
| `activa` | bool | |
| `created_by`, `created_at` | | |

**Día 30 en febrero**: se recorta al último día del mes. `diasEnMes()` en
`lib/ciclo.ts` ya hace exactamente eso para `cicloPago()`; se reusa.

### `deudas`

| columna | tipo | notas |
|---|---|---|
| `id` | uuid, PK | |
| `cuenta_id` | uuid | |
| `nombre` | text | |
| `tipo` | text | `credito` \| `libranza` \| `hipoteca` \| `vehiculo` \| `otro` |
| `saldo_actual` | bigint | saldo a la fecha de anclaje |
| `saldo_a_fecha` | date | cuándo se midió ese saldo |
| `tasa_mensual` | numeric(8,6) | efectiva mensual en decimal (0.0175 = 1.75% EM) |
| `cuota` | bigint, null | si es null, se calcula por amortización francesa |
| `n_cuotas` | int | total de cuotas del crédito |
| `cuotas_pagadas` | int | |
| `dia_pago` | int | día del mes |
| `medio_pago` | text | normalmente `debito` |
| `activa` | bool | |

### `inversiones` (fase 6)

`id`, `cuenta_id`, `nombre`, `tipo`, **`liquida` bool** (cuenta como
colchón), `saldo_actual`, `saldo_a_fecha`, `activa`.

### RLS

Todas las tablas nuevas siguen el patrón ya establecido en
`0003_cuentas_compartidas.sql`: `using (cuenta_id = mi_cuenta())` para
select/insert/update/delete. Sin excepciones ni service-role.

## El motor: `lib/flujo.ts`

Función **pura**, sin Supabase ni React, con tests, exactamente como
`lib/ciclo.ts`. Es la pieza que hay que hacer bien; la UI es decoración
encima.

```ts
interface EventoCaja {
  fecha: string;         // YYYY-MM-DD
  monto: number;         // + entrada, − salida
  tipo: 'ingreso' | 'gasto_fijo' | 'gasto_debito' | 'pago_tc'
      | 'cuota_deuda' | 'aporte' | 'otro';
  etiqueta: string;
  origen: 'real' | 'proyectado';
  refId?: string;
}

interface PuntoSaldo { fecha: string; saldo: number; }

interface Proyeccion {
  eventos: EventoCaja[];
  serie: PuntoSaldo[];              // un punto por día, 90 días
  minimo: { fecha: string; saldo: number };
  saldoHoy: number;
}

export function proyectar(entrada: EntradaProyeccion): Proyeccion;
```

### Algoritmo

1. **Saldo de arranque**: último snapshot + movimientos reales posteriores
   (fórmula de arriba).
2. **Expandir reglas** activas a eventos entre hoy y hoy+90, recortando el
   día al último del mes cuando aplique. Los `gasto_fijo` con
   `medio_pago = 'tc'` **no** generan evento: alimentan el paso 4.
3. **Expandir deudas** a cuotas mensuales. La tabla de amortización vive en
   `lib/deuda.ts` (ver abajo).
4. **Calcular el pago de TC de cada ciclo** que cae en el horizonte:
   - **Ciclo cerrado y no pagado** → total real de `expenses`, evento en
     `cicloPago(ciclo)`, origen `real`.
   - **Ciclo en curso** → real hasta hoy
     + fijos-TC del ciclo aún no cobrados (regla sin `expense` emparejado)
     + run-rate discrecional × días restantes.
     El run-rate discrecional = gasto del ciclo con `regla_id` nulo ÷ días
     corridos. `diasCorridosEnRango()` ya existe en `lib/ciclo.ts`.
   - **Ciclos futuros** → fijos-TC del ciclo
     + promedio discrecional de los últimos 3 ciclos.
5. **Ordenar por fecha, acumular**, generar un punto de saldo por día.
6. **Encontrar el mínimo** de la serie y su fecha.

Un evento `proyectado` se reemplaza por el `real` en cuanto existe el
movimiento correspondiente — no se suman.

### `lib/deuda.ts`

```ts
export function cuotaFrancesa(saldo: number, tasaMensual: number, n: number): number;
export function tablaAmortizacion(deuda: Deuda): CuotaProyectada[];
```

`cuota = P·i / (1 − (1+i)^−n)`. Si la deuda ya trae `cuota`, se usa esa y
se deriva el saldo mes a mes (`interés = saldo × i`, `abono = cuota −
interés`); sirve para créditos cuya cuota real no calza exactamente con la
fórmula. Casos borde con test: `tasa = 0` (crédito sin intereses, cuota =
saldo/n), última cuota que no cuadra por redondeo, deuda ya terminada.

## UI

### Pestaña nueva: **Flujo**

- **Header**: saldo de hoy, y debajo el número estrella —
  *"Tu punto más apretado: $340.000 el 28 de septiembre"*.
- **Gráfica de línea** (Recharts, ya está en el proyecto por
  `GraficaCiclos`): saldo día a día, 90 días, con línea de cero marcada y
  los eventos grandes señalados.
- **Lista por semana**, expandible a los eventos de cada día, con los
  proyectados visualmente distintos de los reales.
- **Banner de alerta** si el mínimo cae por debajo del colchón deseado. Si
  hay inversiones líquidas (fase 6): *"tienes $X liquidables para
  cubrirlo"*.

### Pantalla nueva: **Compromisos**

CRUD de reglas, deudas e inversiones. Va como pantalla propia (no dentro
de Cuenta): son datos que se consultan y ajustan, no configuración que se
toca una vez.

### Ajuste al saldo

Botón "actualizar saldo" en Flujo → inserta un `saldo_snapshot` manual.
Cuando exista la fase 5, muestra además la deriva:
*"proyectado $2.1M, real $1.9M — diferencia de $200k en 12 días"*.

## El payoff: cerrar el círculo

Cuando las dos mitades conviven aparece lo que ninguna da por separado:

- **Tope derivado, no inventado**:
  `tope sugerido = ingresos del ciclo − fijos − cuotas de deuda − aportes − colchón`.
  El tope deja de ser $4M porque sí.
- **Alertas cruzadas**: *"vas proyectado en $4.8M de TC y la quincena del
  30 solo te deja $3.2M libres"* — accionable hoy, no a fin de mes.
- **Simulador de compra** (futuro): *"¿puedo comprar esto de $3M a 12
  cuotas?"* → recalcula la curva y dice qué tan cerca del piso queda.

## Fases

| # | Fase | Contenido |
|---|---|---|
| 1 | **Cimientos** | Migración `0005`: `medio_pago`, `regla_id`, `saldo_snapshots`, `movimientos_caja`, `reglas`, `deudas`. Motor `lib/flujo.ts` + `lib/deuda.ts` con tests. Sin UI. |
| 2 | **Compromisos** | CRUD de reglas (ingresos + gastos fijos). Pantalla nueva. |
| 3 | **Deudas** | CRUD de deudas + tabla de amortización visible. |
| 4 | **Flujo** | Pantalla de proyección: curva de 90 días, saldo mínimo, lista por semana, ajuste de saldo manual. **Aquí ya es útil.** |
| 5 | **Saldo por Gmail** | Extender el parser a alertas de débito, transferencia y abono de nómina → `movimientos_caja`, con revisión previa igual que `gastos_pendientes`. Deriva y re-anclaje. |
| 6 | **Inversiones y círculo cerrado** | Inversiones + colchón liquidable, tope sugerido, alertas cruzadas. |

**Por qué la fase 5 va después de la 4**: el saldo semilla manual es
técnicamente obligatorio de todas formas (Gmail da movimientos, no
saldos), y con solo la semilla la proyección ya sirve. Poner Gmail antes
retrasaría meses la primera curva útil. Si mantener el saldo a mano resulta
molesto en la práctica, la fase 5 se puede adelantar sin romper nada de lo
anterior.

## Restricciones heredadas del proyecto

- Español en toda la UI, commits y comentarios.
- Sin dependencias npm nuevas (Recharts y el SDK de Anthropic ya están).
- Toda mutación por Supabase pasa por `sinTipar()` de
  `lib/supabase/queries.ts` — la inferencia de tipos de `postgrest-js`
  colapsa a `never` con varias tablas.
- Aritmética de fechas siempre en `lib/ciclo.ts` con strings `YYYY-MM-DD`
  y enteros, nunca con `Date` local. "Hoy" siempre en `America/Bogota`.
- Nunca sobrescribir datos que no se pudieron leer: si falla la carga, la
  pantalla queda de solo lectura con aviso y reintento.

## Preguntas abiertas para antes de implementar

1. **Colchón**: ¿un monto fijo configurable (ej. $2M), o N meses de gastos
   fijos calculado?
2. **Emparejar fijos-TC con gastos reales**: al confirmar un pendiente que
   corresponde a una regla, ¿la app sugiere el emparejamiento y David
   confirma, o se hace 100% manual al principio?
3. **Ingresos variables**: ¿la nómina es monto fijo, o hay que soportar un
   rango / promedio de los últimos meses?
4. **Cuenta compartida**: ¿la proyección suma los ingresos de ambos
   miembros en una sola curva, o se quieren ver separados?
