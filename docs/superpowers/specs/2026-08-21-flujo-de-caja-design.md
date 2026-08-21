# Proyección de flujo de caja — diseño

Fecha: 2026-08-21 (v4 — aislado del módulo de tarjeta, fuente principal PSE)

## Objetivo

Responder una sola pregunta, todos los días, sin abrir un Excel:

> **¿Cuánta plata voy a tener, y cuándo voy a estar más apretado?**

Hoy la app controla el gasto de tarjeta de crédito contra un tope. Eso
resuelve "¿me estoy pasando este ciclo?", pero no "¿me alcanza para el 30?".
Falta el otro lado: ingresos, gastos fijos, deudas, inversiones, y el saldo
real en el banco.

## Principio rector: aislamiento

**El módulo de tarjeta de crédito funciona y no se toca.** Todo lo de flujo
de caja vive en una pestaña nueva, tablas nuevas y archivos nuevos.

Invariante verificable de la migración `0005`:

> **No contiene un solo `alter table` sobre una tabla existente.** Solo
> `create table`. Si aparece un `alter`, el diseño se salió de su carril.

Lo que **no** se toca, ni en esquema ni en código:

- `expenses`, `settings`, `categories`, `cuentas`, `cuenta_miembros`
- `gastos_pendientes`, `gmail_conexiones`
- `confirmar_gasto_pendiente()`, `bloquear_confirmacion_directa()`
- Las pantallas Registro, Pendientes, Historial y Cuenta
- `lib/gmail/*` — el sync de Bancolombia sigue igual

Único archivo existente que se modifica: **`components/NavTabs.tsx`**, para
agregar una entrada al arreglo `TABS`. Una línea.

### El único punto de contacto: lectura

El motor de proyección **lee** `expenses` para calcular el total del ciclo
de tarjeta y convertirlo en un evento de caja. Lee, nunca escribe. Ese es el
seam completo entre los dos mundos:

```
expenses (solo lectura) ──► total del ciclo ──► un evento de caja el día 30
```

Todas las tablas nuevas llevan prefijo `flujo_` para que el aislamiento sea
visible en el esquema.

### Costos que se aceptan a cambio

Aislar tiene precio, y conviene tenerlo escrito:

1. **Un gasto de débito no aparece en Historial ni en el análisis por
   rubro.** Vive en `flujo_movimientos`, no en `expenses`. El análisis de
   categorías sigue siendo "solo tarjeta".
2. **Dos bandejas de revisión**: la de Pendientes (compras con TC) y la de
   Flujo (movimientos de efectivo). Dos sitios donde revisar.
3. **Dos flujos de conexión de Gmail**: el de la TC y el de PSE. El código
   OAuth (`lib/gmail/oauth.ts`) se reusa tal cual — es sin estado —, pero la
   tabla de conexiones y la orquestación del sync se duplican.

Las tres se resuelven el día que se decida converger; ninguna bloquea nada
hoy. La convergencia natural sería mover `expenses` adentro de
`flujo_movimientos` como un tipo más, pero **eso no es parte de este
diseño**.

## La idea central: el puente

> **Un gasto de tarjeta no es una salida de caja el día que ocurre. Es una
> salida de caja el día 30, cuando se paga el ciclo.**

Los N gastos del ciclo `2026-09` que ya se capturan por Gmail colapsan en
**un** evento de caja: "pago TC 2026-09: $4.1M el 30-sep". `cicloPago()` en
`lib/ciclo.ts` ya calcula esa fecha. El módulo de topes no se reemplaza ni
se modifica: se lee.

## Decisiones tomadas (brainstorming con David)

- **Fuente principal de salidas de efectivo: los correos de PSE.** Son los
  que muestran los pagos que salen de la cuenta de ahorros. No las alertas
  del banco.
- **Cuentas**: la tarjeta de crédito es de **Bancolombia** (ya conectada);
  la de ahorros es de **Davibank** (antes Scotiabank Colpatria).
- **Segundo buzón**: David conecta **un segundo Gmail propio** para los
  correos de PSE. No es el de otro miembro.
- **Saldo de caja**: **semilla manual + deltas de PSE + re-anclaje**. Los
  correos describen movimientos, no saldos (confirmado en
  `lib/gmail/parse.ts`), así que la semilla es inevitable — pero es una sola
  vez, y re-anclar es un botón.
- **Granularidad**: **día a día, horizonte de 90 días**. La curva fina
  muestra los apretones *dentro* del mes — entre el pago de la TC el 30 y la
  siguiente quincena — que es donde duele y que una vista mensual esconde.
- **Alcance v1**: ingresos + gastos fijos + pago de TC + **deudas con
  amortización**. Fuera de v1: diferidos de TC e inversiones.
- **Ingresos variables**: hay **nómina y otros**, no todos de monto fijo.
  Una regla declara si su monto es `fijo` o `estimado`; los estimados se
  dibujan punteados.
- **Colchón**: **monto fijo configurable**.
- **Cuenta compartida**: **una sola curva** que suma a los dos miembros.

## Qué cubre PSE, y qué no

Esto define la precisión que se puede esperar, así que va explícito.

**Cubre**: pagos de servicios y facturas, pagos a comercios por PSE,
**el pago de la tarjeta de crédito** si se hace por PSE.

**No cubre**: compras con tarjeta débito presencial, retiros en cajero,
transferencias entre cuentas, **abonos de nómina**, ingresos en general.

Consecuencias directas en el diseño:

1. **Los ingresos no llegan solos.** Vienen de las reglas recurrentes
   (nómina como regla), no del correo. Por eso las reglas de ingreso son
   parte de la v1 y no un adorno.
2. **El re-anclaje del saldo importa más, no menos.** Como la cobertura de
   salidas es parcial, el saldo real se va a desviar del proyectado. La app
   debe **pedir el re-anclaje activamente** (por ejemplo cada 15 días) y
   mostrar la deriva: *"proyectado $2.1M, real $1.9M — $200k en 12 días"*.
   Esa deriva es información útil, no un error: dice cuánto se escapa por
   fuera de PSE.
3. **Un ajuste de saldo es de primera clase**, no una función de
   emergencia: es parte del ciclo normal de uso.

## El riesgo #1: doble conteo

Es el error que arruina cualquier proyección de este tipo. El aislamiento
elimina dos de las cuatro formas en que aparecía; quedan dos.

### ⚠️ 1. El pago de la tarjeta visto desde PSE

**El más peligroso.** El pago mensual de la TC va a llegar como un
comprobante de PSE de $4.1M. Si se clasifica como un gasto más, el ciclo se
cuenta **dos veces**: una como la suma de sus compras (leída de `expenses`)
y otra como el pago.

Tiene que clasificarse `pago_tc`, y al existir el pago real el evento
proyectado de ese ciclo se **reemplaza**, no se suma.

**Y cruza bancos**: la TC es de Bancolombia y el pago sale de Davibank. El
destino en un comprobante PSE **no** es un `*NNNN` — es un nombre de
beneficiario ("Bancolombia Tarjeta de Crédito" o similar). No hay dígitos
que comparar. La detección combina tres señales:

1. El beneficiario calza con algún `alias_pago` de un instrumento `tipo = 'tc'`.
2. El monto coincide (o casi) con el total de un ciclo cerrado sin pagar.
3. La fecha cae cerca de `cicloPago()` de ese ciclo.

Con las tres, la app **propone** `clase = 'pago_tc'` con el ciclo
preseleccionado. Con menos, cae a la bandeja sin clasificar. **Nunca se
autoconfirma**: equivocarse aquí *es* el doble conteo.

### 2. El fijo que llega a la tarjeta

Netflix es gasto fijo **y** llega a la TC. Una regla con
`medio_pago = 'tc'` **no** genera evento de caja propio: alimenta el total
esperado del ciclo, y toca caja el día del pago.

Cuando el cargo real ya está en `expenses`, la expectativa de esa regla para
ese ciclo queda **consumida**. Como no se puede tocar `expenses` para
guardarle un `regla_id`, el emparejamiento vive en una tabla lateral
`flujo_reglas_expenses (regla_id, expense_id)`. Mismo efecto, cero
alteración.

El run-rate ("a este ritmo") corre solo sobre el gasto **discrecional**: los
`expenses` que **no** aparecen en esa tabla lateral. Si no, los fijos del
ciclo se cuentan dos veces dentro del mismo ciclo.

## Modelo de datos

Migración `0005_flujo_de_caja.sql`. **Solo `create table`.** RLS en todas
con el patrón de `0003`: `using (cuenta_id = mi_cuenta())`.

### `flujo_config`

Una fila por cuenta. `cuenta_id` (PK), `colchon` bigint, `horizonte_dias`
int default 90, `dias_recordatorio_saldo` int default 15.

Va aparte y no como columnas de `settings`, por el invariante de la
migración.

### `flujo_instrumentos`

De dónde sale y a dónde entra la plata.

| columna | tipo | notas |
|---|---|---|
| `id` | uuid, PK | |
| `cuenta_id` | uuid | |
| `nombre` | text | "Ahorros Davibank", "TC Bancolombia" |
| `banco` | text | `bancolombia` \| `davibank` \| `otro` |
| `tipo` | text | `ahorros` \| `corriente` \| `tc` \| `efectivo` |
| `ultimos4` | text, null | si el correo los trae |
| `alias_pago` | text[], null | cómo aparece este instrumento **como destino** en un comprobante PSE |
| `principal` | bool | la cuenta por defecto cuando el correo no dice de dónde salió |
| `titular` | uuid, null | |
| `activo` | bool | |

**La llave de ruteo es `(banco, ultimos4)`, no los cuatro dígitos solos** —
un `*1234` de cada banco son instrumentos distintos. Pero un comprobante PSE
muchas veces **no dice la cuenta de origen**; en ese caso se asume el
instrumento `principal` y queda editable en la bandeja.

### `flujo_saldos` — el ancla

`id`, `cuenta_id`, `instrumento_id` (null = consolidado), `fecha`, `monto`,
`origen` (`manual` \| `correo`), `created_by`, `created_at`.

Re-anclar es insertar un snapshot nuevo, nunca editar el viejo: así queda el
historial de la deriva entre anclas.

### `flujo_movimientos` — el libro de caja

| columna | tipo | notas |
|---|---|---|
| `id` | uuid, PK | |
| `cuenta_id` | uuid | |
| `fecha` | date | |
| `monto` | bigint | **con signo**: + entrada, − salida |
| `tipo` | text | `ingreso` \| `gasto` \| `pago_tc` \| `cuota_deuda` \| `aporte` \| `transferencia` \| `otro` |
| `etiqueta` | text | |
| `categoria` | text, null | FK a `categories` — se reusa el catálogo existente (lectura) |
| `origen` | text | `manual` \| `correo` |
| `instrumento_id` | uuid, null | |
| `ref_ciclo` | text, null | para `pago_tc`: qué ciclo se pagó |
| `ref_id` | uuid, null | regla o deuda que lo originó |
| `created_by`, `created_at` | | |

Aquí viven también los gastos de débito (`tipo = 'gasto'`, monto negativo).
No van a `expenses` — ese sigue siendo el libro exclusivo de la tarjeta.

### `flujo_reglas` — los compromisos recurrentes

| columna | tipo | notas |
|---|---|---|
| `id` | uuid, PK | |
| `cuenta_id` | uuid | |
| `tipo` | text | `ingreso` \| `gasto_fijo` \| `aporte_inversion` |
| `nombre` | text | "Nómina David", "Arriendo", "Netflix" |
| `monto` | bigint | fijo, o el estimado |
| `monto_tipo` | text | `fijo` \| `estimado` |
| `frecuencia` | text | `quincenal` \| `mensual` \| `bimestral` \| `anual` \| `unica` |
| `dia_1` | int | día del mes (1–31) |
| `dia_2` | int, null | solo `quincenal` |
| `mes` | int, null | solo `anual` (prima = 6 y 12, cesantías = 2) |
| `medio_pago` | text | `debito` \| `efectivo` \| `tc` — solo `gasto_fijo` |
| `instrumento_id` | uuid, null | |
| `categoria` | text, null | |
| `desde` / `hasta` | date / date null | |
| `activa` | bool | |

**Día 30 en febrero**: se recorta al último día del mes. `diasEnMes()` en
`lib/ciclo.ts` ya lo hace para `cicloPago()`; se reusa (lectura de una
función pura, no toca nada).

### `flujo_reglas_expenses` — el emparejamiento lateral

`regla_id`, `expense_id` (PK compuesta), `ciclo`, `created_at`.

Resuelve el riesgo #2 sin agregarle una columna a `expenses`. La app
**sugiere** el emparejamiento (regla con `medio_pago = 'tc'` + monto y fecha
compatibles) y David confirma desde la bandeja — consistente con el
principio de revisión obligatoria del proyecto.

### `flujo_deudas`

`id`, `cuenta_id`, `nombre`, `tipo`, `saldo_actual`, `saldo_a_fecha`,
`tasa_mensual` numeric(8,6) (efectiva mensual en decimal), `cuota` (null =
calcular por amortización francesa), `n_cuotas`, `cuotas_pagadas`,
`dia_pago`, `medio_pago`, `activa`.

### `flujo_conexiones` — el buzón de PSE

Tabla propia, **`gmail_conexiones` no se toca**. Mismas garantías: RLS sin
políticas para `authenticated` (invisible al cliente), refresh token solo
por service role.

`id` (PK), `user_id`, `email_conectado`, `refresh_token`, `estado`,
`ultimo_sync_at`, `ultimo_error`, `created_at`.
Unique en `(user_id, email_conectado)` — un usuario, varios buzones.

### `flujo_pendientes` — la bandeja de revisión

| columna | tipo | notas |
|---|---|---|
| `id` | uuid, PK | |
| `cuenta_id`, `creado_por` | uuid | |
| `conexion_id` | uuid | FK a `flujo_conexiones` |
| `mensaje_id` | text | id del correo |
| `clase` | text | `gasto` \| `ingreso` \| `pago_tc` \| `transferencia` \| `interna` \| `sin_clasificar` |
| `fecha`, `monto` | date, bigint | |
| `etiqueta` | text | beneficiario / comercio |
| `categoria` | text, null | sugerida, solo para `gasto` |
| `instrumento_id` | uuid, null | |
| `ref_ciclo` | text, null | ciclo propuesto si `clase = 'pago_tc'` |
| `posible_duplicado_de` | uuid, null | |
| `estado` | text | `pendiente` \| `confirmado` \| `descartado` |

Unique en **`(conexion_id, mensaje_id)`** — no `(creado_por, mensaje_id)`.
Los ids de mensaje de Gmail solo son únicos *dentro* de un buzón, y como los
dos buzones son del mismo usuario, esa llave descartaría en silencio un
movimiento real ante una colisión.

**Dedupe difuso** adicional: si ya existe un movimiento con mismo `monto`,
misma `fecha` y mismo destino, el nuevo se marca `posible_duplicado_de` y la
bandeja los muestra juntos. No se descarta solo — dos pagos idénticos el
mismo día existen.

### `confirmar_flujo_pendiente()`

Función nueva, hermana de la existente, con el mismo patrón probado:
`security definer`, `select ... for update` para evitar la doble
confirmación concurrente, validación `mi_cuenta()` NULL-safe con
`is distinct from`, y un trigger que bloquea la confirmación directa por
UPDATE. Enruta según `clase`:

| `clase` | destino |
|---|---|
| `gasto` | `flujo_movimientos` (−) con categoría |
| `ingreso` | `flujo_movimientos` (+) |
| `pago_tc` | `flujo_movimientos` (−) con `ref_ciclo` |
| `transferencia` | `flujo_movimientos`, signo según dirección |
| `interna` | nada: se marca confirmado, no afecta caja |

**Nunca escribe en `expenses`.**

## El motor: `lib/flujo/proyeccion.ts`

Función **pura**, sin Supabase ni React, con tests, como `lib/ciclo.ts`. Es
la pieza que hay que hacer bien; la UI es decoración encima.

```ts
interface EventoCaja {
  fecha: string;         // YYYY-MM-DD
  monto: number;         // + entrada, − salida
  tipo: 'ingreso' | 'gasto_fijo' | 'gasto' | 'pago_tc'
      | 'cuota_deuda' | 'aporte' | 'otro';
  etiqueta: string;
  origen: 'real' | 'proyectado' | 'estimado';
  refId?: string;
}

interface Proyeccion {
  eventos: EventoCaja[];
  serie: { fecha: string; saldo: number }[];   // un punto por día
  minimo: { fecha: string; saldo: number };
  saldoHoy: number;
  bajoColchon: { fecha: string; saldo: number } | null;
  derivaDesdeAncla: number | null;
}
```

### Algoritmo

1. **Saldo de arranque**: último snapshot + `flujo_movimientos` posteriores.
2. **Expandir reglas** activas entre hoy y hoy+90, recortando al último día
   del mes cuando aplique. Los `gasto_fijo` con `medio_pago = 'tc'` **no**
   generan evento: alimentan el paso 4. Los ingresos `estimado` salen con
   `origen: 'estimado'`.
3. **Expandir deudas** a cuotas (`lib/flujo/deuda.ts`).
4. **Calcular el pago de TC de cada ciclo** del horizonte, leyendo
   `expenses`:
   - **Ciclo cerrado y no pagado** → total real, evento en `cicloPago()`,
     origen `real`.
   - **Ciclo en curso** → real hasta hoy + fijos-TC del ciclo aún no
     cobrados + run-rate discrecional × días restantes. El run-rate
     discrecional excluye los `expenses` emparejados en
     `flujo_reglas_expenses`. `diasCorridosEnRango()` ya existe.
   - **Ciclos futuros** → fijos-TC + promedio discrecional de los últimos 3
     ciclos.
   - **Si ya existe un `flujo_movimientos` con `tipo='pago_tc'` y ese
     `ref_ciclo`** → el evento proyectado se **reemplaza**, no se suma.
5. **Ordenar, acumular**, un punto de saldo por día.
6. **Mínimo** de la serie y primer cruce bajo el colchón.

### `lib/flujo/deuda.ts`

```ts
export function cuotaFrancesa(saldo: number, tasaMensual: number, n: number): number;
export function tablaAmortizacion(deuda: Deuda): CuotaProyectada[];
```

`cuota = P·i / (1 − (1+i)^−n)`. Si la deuda trae `cuota`, se usa esa y se
deriva el saldo mes a mes (`interés = saldo × i`, `abono = cuota − interés`),
para créditos cuya cuota real no calza con la fórmula. Casos borde con test:
`tasa = 0`, última cuota descuadrada por redondeo, deuda terminada.

### `lib/flujo/clasificar.ts`

El parser de correos de PSE devuelve una unión discriminada:

```ts
interface MovimientoDetectado {
  clase: 'gasto' | 'ingreso' | 'pago_tc' | 'transferencia' | 'interna' | 'sin_clasificar';
  monto: number;
  fecha: string;
  etiqueta: string;          // beneficiario
  ultimos4: string | null;
  refCiclo: string | null;   // propuesto, si clase = 'pago_tc'
  categoria: CategoryId | null;
}
```

Claude como parser primario (tolerante al formato), regex local de respaldo.
La clasificación de `pago_tc` usa las tres señales descritas arriba y
`sin_clasificar` es una salida legítima: mejor preguntar que adivinar.

### ⚠️ Prerrequisito: correos de muestra

`lib/gmail/parse.ts` está calibrado contra dos formatos, ambos de compras
con TC de Bancolombia. **No hay una sola muestra de un comprobante PSE.**
Antes de escribir `clasificar.ts`, David tiene que aportar correos reales
(con datos tapados si quiere):

- Un comprobante de pago PSE de un servicio.
- **El comprobante del pago de la tarjeta de crédito** — es el que decide si
  las tres señales del riesgo #1 son detectables o hay que pedirlo a mano.
- Si existen: transferencia enviada y abono de nómina.

Sin eso cualquier regex es adivinanza — el mismo prerrequisito que ya se
documentó en el plan de Gmail original. Además hay que confirmar **de quién
llegan**: un comprobante PSE puede venir del comercio, de ACH Colombia o del
banco, y de ahí sale la lista de remitentes del query de Gmail.

## UI: la pestaña Flujo

Una entrada nueva en `TABS` de `components/NavTabs.tsx`, y todo lo demás en
`app/(app)/flujo/` y `components/flujo/`. Adentro, tres sub-vistas:

### Proyección (la vista por defecto)

- **Header**: saldo de hoy, y el número estrella —
  *"Tu punto más apretado: $340.000 el 28 de septiembre"*.
- **Gráfica de línea** (Recharts, ya está por `GraficaCiclos`): saldo día a
  día, 90 días, con la línea del colchón marcada. Tramos estimados con trazo
  distinto de los reales.
- **Lista por semana**, expandible a los eventos del día.
- **Banner** si el mínimo cruza el colchón.
- **Ajuste de saldo**: botón siempre visible; se vuelve un recordatorio
  activo pasados los días configurados, mostrando la deriva contra el ancla.

### Movimientos (la bandeja)

Los pendientes de PSE, agrupados por clase, con los posibles duplicados
juntos. Se puede cambiar la clase de uno mal clasificado antes de confirmar.
Aquí también vive el botón de conectar el segundo Gmail y su estado —
**no** en la pantalla Cuenta, que no se toca. El aviso de reconectar es por
conexión: el modo Testing de Google caduca el token cada ~7 días y cada
buzón expira por su lado.

### Compromisos

CRUD de reglas, deudas e instrumentos.

## El payoff: cerrar el círculo

- **Tope derivado, no inventado**:
  `tope sugerido = ingresos del ciclo − fijos − cuotas − aportes − colchón`.
  El tope deja de ser $4M porque sí. (Se **muestra** como sugerencia en
  Flujo; escribirlo en `settings` es decisión de David, no automática.)
- **Alertas cruzadas**: *"vas proyectado en $4.8M de TC y la quincena del 30
  solo te deja $3.2M libres"* — accionable hoy, no a fin de mes.
- **Simulador de compra** (futuro): *"¿puedo comprar esto de $3M a 12
  cuotas?"* → recalcula la curva y dice qué tan cerca del piso queda.

## Fases

| # | Fase | Contenido |
|---|---|---|
| 1 | **Cimientos** | Migración `0005` (solo `create table`) + `lib/flujo/proyeccion.ts` y `lib/flujo/deuda.ts` con tests. Sin UI. |
| 2 | **Compromisos** | Pestaña Flujo con el CRUD de reglas e instrumentos. |
| 3 | **Deudas** | CRUD de deudas + amortización visible. |
| 4 | **Proyección** | Curva de 90 días, mínimo, colchón, lista por semana, semilla y ajuste de saldo. **Aquí ya es útil, sin PSE.** |
| 5 | **Bandeja manual** | `flujo_pendientes` + `confirmar_flujo_pendiente()` + UI, alimentada **a mano**. Prueba el ruteo por clase y el reemplazo del pago de TC sin depender de ningún correo. |
| 6 | **PSE** | Depende de las muestras. `flujo_conexiones`, OAuth del segundo buzón, `clasificar.ts`, sync, dedupe difuso. **Aquí el saldo se mantiene casi solo.** |
| 7 | **Círculo cerrado** | Inversiones + colchón liquidable, tope sugerido, alertas cruzadas. |

**Por qué la 5 va antes que la 6**: la parte difícil y riesgosa del PSE no
es el parseo, es el **ruteo por clase y el reemplazo del pago de TC**
(riesgo #1). Eso se construye y se prueba con la bandeja alimentada a mano,
sin bloquearse esperando muestras. Cuando lleguen los correos, la fase 6 es
solo conectar el parser a una tubería ya probada.

## Restricciones heredadas del proyecto

- **El invariante de aislamiento de arriba manda sobre todo lo demás.**
- Español en toda la UI, commits y comentarios.
- Sin dependencias npm nuevas (Recharts y el SDK de Anthropic ya están).
- Toda mutación por Supabase pasa por `sinTipar()` de
  `lib/supabase/queries.ts`.
- Aritmética de fechas siempre en `lib/ciclo.ts` con strings `YYYY-MM-DD` y
  enteros, nunca con `Date` local. "Hoy" siempre en `America/Bogota`.
- Nunca sobrescribir datos que no se pudieron leer: si falla la carga, la
  pantalla queda de solo lectura con aviso y reintento.
- Revisión obligatoria: nada entra a `flujo_movimientos` sin pasar por
  `confirmar_flujo_pendiente()`.

## Preguntas abiertas

1. **¿Quién manda los comprobantes de PSE?** ¿El comercio, ACH Colombia, o
   Davibank? De ahí sale la lista de remitentes del query de Gmail, y es lo
   primero que hay que mirar en el buzón.
2. **¿Pagas la tarjeta de Bancolombia por PSE?** Si sí, llega comprobante y
   el riesgo #1 se detecta automático. Si es por débito automático o desde
   la app de Bancolombia, ese pago **no genera correo** y hay que
   registrarlo a mano cada mes — lo cual está bien, pero hay que saberlo y
   ponerle un recordatorio.
3. **¿A qué cuenta te llega la nómina?** Define el instrumento por defecto de
   la regla de ingreso.
