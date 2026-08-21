# Proyección de flujo de caja — diseño

Fecha: 2026-08-21 (v6 — buzones cerrados, deudas manuales, saldo desde el ancla)

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
- **Cuentas**: la tarjeta de crédito es de **Bancolombia** y está **a nombre
  de la esposa de David** (ya conectada al módulo de gastos); la cuenta de
  ahorros desde la que se paga es de **David**, en **Davibank** (antes
  Scotiabank Colpatria). El titular de la tarjeta y el dueño de la cuenta
  que la paga **no son la misma persona**, y el diseño no puede asumir que
  lo sean.
- **El pago de la tarjeta es manual, por PSE.** No hay débito automático.
  Esto tiene tres consecuencias de diseño (ver sección propia).
- **Las deudas se configuran y se confirman a mano**, igual que el pago de
  la tarjeta al principio. **No se detectan por correo.** El clasificador de
  PSE no necesita reconocer cuotas de crédito, lo que le quita una clase
  entera de encima. La proyección de las cuotas futuras sí es automática —
  sale de la tabla de amortización; lo manual es confirmar que la cuota
  efectivamente salió.
- **El pago de la tarjeta normalmente es total**, pero puede no serlo. El
  pago parcial es un caso borde real: se advierte, no se modela el
  rotativo.
- **Un buzón por módulo, sin solapamiento**: el Gmail conectado hoy es el de
  **la esposa** — le llegan las alertas de compra de su tarjeta de
  Bancolombia. El segundo buzón, por conectar, es el de **David** — le
  llegan los comprobantes de PSE de su cuenta de Davibank. Cada módulo tiene
  su buzón, su banco y su tipo de correo; no compiten por los mismos
  mensajes.

### Mapa de buzones

| | Módulo tarjeta (existe) | Módulo flujo (nuevo) |
|---|---|---|
| Buzón | el de la esposa (conectado) | el de David (por conectar) |
| Banco | Bancolombia | Davibank |
| Instrumento | TC, titular la esposa | ahorros, titular David |
| Correos | alertas de compra | comprobantes de PSE |
| Tabla de conexión | `gmail_conexiones` | `flujo_conexiones` |
| Bandeja | `gastos_pendientes` | `flujo_pendientes` |

La tarjeta es de ella y las alertas llegan a su correo, que es justo el
conectado: **la cobertura de compras de la tarjeta está completa**, no hay
compras invisibles. Y quien paga es David desde su cuenta, así que el
comprobante del pago llega a *su* buzón — el del otro módulo. Las dos
mitades del riesgo #1 (el total del ciclo y su pago) entran por buzones
distintos y se encuentran solo en el motor de proyección.
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

**La buena noticia**: David confirmó que paga la tarjeta por PSE, así que
**siempre va a llegar comprobante**. El caso no depende de una fuente que no
existe — depende de clasificar bien un correo que sí llega.

**Y cruza bancos**: la TC es de Bancolombia (a nombre de la esposa) y el
pago sale de Davibank (cuenta de David). El destino en un comprobante PSE
**no** es un `*NNNN` propio — es un nombre de beneficiario ("Bancolombia
Tarjeta de Crédito" o similar), y la referencia, si trae uno, sería el
número de **la tarjeta de la esposa**. La detección combina tres señales:

1. El beneficiario calza con algún `alias_pago` de un instrumento `tipo = 'tc'`.
2. La fecha cae cerca de `cicloPago()` de un ciclo cerrado sin pagar.
3. El monto coincide con el total de ese ciclo.

Con las tres, la app **propone** `clase = 'pago_tc'` con el ciclo
preseleccionado. Con las dos primeras pero **no** la tercera, igual lo
propone — marcándolo como **pago parcial o con ajuste** (ver abajo). Con
menos, cae a la bandeja sin clasificar. **Nunca se autoconfirma**:
equivocarse aquí *es* el doble conteo.

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

## El pago es manual: tres consecuencias

No hay débito automático — David paga la tarjeta a mano, por PSE, todos los
meses. Eso no es un detalle operativo: cambia tres cosas del modelo.

### 1. La fecha real no es necesariamente el 30

`cicloPago()` da el día 30 (o el último del mes). Eso sirve como
**estimación** mientras el pago no ha ocurrido. Cuando llega el comprobante,
el movimiento real entra con **su fecha real** y reemplaza al proyectado —
no se ancla al 30. Pagar el 27 o el 2 del mes siguiente mueve el punto más
apretado de la curva, que es justo lo que la pantalla debe mostrar.

Implicación en el paso 4 del algoritmo: el reemplazo se busca por
`ref_ciclo`, **nunca por fecha**. Si se emparejara por fecha, un pago hecho
el 2 del mes siguiente quedaría como un gasto nuevo *además* del proyectado
del 30 — doble conteo otra vez, por la puerta de atrás.

### 2. El monto puede no ser el total del ciclo

Un pago manual puede ser parcial (pago mínimo), o traer un ajuste. Si el
monto del comprobante difiere del total del ciclo, la app **no asume nada**:
marca el movimiento como pago parcial, lo registra por su monto real, y
avisa que quedó un saldo sin pagar en ese ciclo. Ese remanente **no** se
proyecta como deuda con intereses en v1 — se muestra como una advertencia y
David decide. Modelar el rotativo de la tarjeta es otro alcance.

### 3. Se puede olvidar — y eso la app sí lo puede vigilar

Sin débito automático, no pagar es una posibilidad real. Como la app sabe
cuándo cerró cada ciclo y no ha visto su comprobante, puede avisar:

> *"El ciclo 2026-09 cerró el 15-sep y se paga el 30-sep. Todavía no
> registro el pago."*

Es de las alertas más útiles del módulo y sale gratis del modelo: un ciclo
cerrado sin `flujo_movimientos` con ese `ref_ciclo`. Va en la fase 4, no
espera a PSE — con la bandeja manual ya funciona.

## Modelo de datos

Migración `0005_flujo_de_caja.sql`. **Solo `create table`.** RLS en todas
con el patrón de `0003`: `using (cuenta_id = mi_cuenta())`.

### `flujo_config`

Una fila por cuenta. `cuenta_id` (PK), `colchon` bigint, `horizonte_dias`
int default 90, `dias_recordatorio_saldo` int default 15.

Va aparte y no como columnas de `settings`, por el invariante de la
migración.

### `flujo_instrumentos`

De dónde sale y a dónde entra la plata. Ojo: `titular` es informativo y
**no** implica quién paga — la TC tiene de titular a la esposa y la paga la
cuenta de David. Ninguna vista debe derivar "quién paga" del titular.

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
| `ref_periodo` | text, null | de qué ocurrencia se trata (la fecha programada, en ISO). Con `ref_id` forma la llave que impide reproyectar algo ya confirmado |
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

El riesgo real de duplicado **no** es que un movimiento llegue a los dos
buzones: los buzones no se solapan (ver el mapa arriba). Es que **un mismo
pago PSE genere dos correos dentro del mismo buzón** — típicamente uno del
comercio y otro de ACH Colombia o del banco. Distinto remitente, distinto
`mensaje_id`, mismo dinero. El unique por `(conexion_id, mensaje_id)` no lo
atrapa; el dedupe difuso sí.

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

1. **Saldo de arranque**: se calcula **desde el ancla, no desde hoy**. Es el
   último snapshot, más los `flujo_movimientos` reales posteriores, **más
   los eventos proyectados de reglas y deudas que caen entre el ancla y hoy
   y no tienen movimiento real emparejado**.

   Este último término es el que hace que el modelo funcione con
   confirmación manual. El arriendo del 5 y la cuota del crédito del 10 casi
   seguro salieron, aunque nadie los haya confirmado en la app; ignorarlos
   inflaría el saldo de hoy mes a mes. El emparejamiento es por
   `(ref_id, periodo)` — nunca por monto o fecha sueltos — para no contar
   dos veces la cuota que sí se confirmó.

   El re-anclaje periódico corrige lo que se acumule de error, y **la
   deriva contra el ancla es el número que dice qué tan buenos son los
   supuestos**.
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
     `ref_ciclo`** → el evento proyectado se **reemplaza**, no se suma, y el
     evento real va con **su fecha real**, no con `cicloPago()`. El
     emparejamiento es por `ref_ciclo`, **nunca por fecha**.
   - **Ciclo cerrado, pasada la fecha de pago, sin movimiento `pago_tc`** →
     el evento sigue en la curva y se levanta la alerta de "pago sin
     registrar".
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

**No hay clase `cuota_deuda` aquí**: las cuotas se confirman a mano. Un
comprobante de PSE que resulte ser el pago de un crédito entra como `gasto`
o `sin_clasificar` y David lo reclasifica desde la bandeja, donde puede
apuntarlo a la deuda correspondiente.

### ⚠️ Prerrequisito: correos de muestra

`lib/gmail/parse.ts` está calibrado contra dos formatos, ambos de compras
con TC de Bancolombia. **No hay una sola muestra de un comprobante PSE.**
Antes de escribir `clasificar.ts`, David tiene que aportar correos reales
(con datos tapados si quiere):

- Un comprobante de pago PSE de un servicio.
- **El comprobante del pago de la tarjeta de crédito** — el más importante.
  Hay que ver exactamente cómo aparece el beneficiario (para `alias_pago`) y
  si trae la referencia de la tarjeta. Ojo: la tarjeta es de la esposa, así
  que la referencia podría ser un número que no está en ningún otro correo
  de los que la app ya lee.
- Si existen: transferencia enviada y abono de nómina.

Sin eso cualquier regex es adivinanza — el mismo prerrequisito que ya se
documentó en el plan de Gmail original. Además hay que confirmar dos cosas
mirando el buzón:

- **De quién llegan**: un comprobante PSE puede venir del comercio, de ACH
  Colombia o del banco. De ahí sale la lista de remitentes del query.
- **Cuántos correos genera un solo pago**: si son dos (comercio + ACH), el
  dedupe difuso deja de ser una salvaguarda teórica y pasa a ser el camino
  normal, todos los días. Cambia cuánto trabajo hay que ponerle.

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
- **Aviso de pago de tarjeta sin registrar** cuando un ciclo cerrado pasa su
  fecha de pago sin un movimiento `pago_tc`. Como no hay débito automático,
  este aviso es de los más útiles del módulo.
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
| 1 | **Cimientos** ✅ | Migración `0005` (solo `create table`) + `lib/flujo/tipos.ts`, `deuda.ts` y `proyeccion.ts` con 52 pruebas. Sin UI. **Hecha.** |
| 2 | **Compromisos** ✅ | Pestaña Flujo con el CRUD de reglas e instrumentos, validación espejo de los CHECK y 13 pruebas. **Hecha.** |
| 3 | **Deudas** | CRUD de deudas + amortización visible + confirmación manual de cuotas. Sin detección por correo, ni ahora ni en la fase 6. |
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
- Revisión obligatoria para lo que viene de un correo: nada detectado en un
  buzón entra a `flujo_movimientos` sin pasar por
  `confirmar_flujo_pendiente()`. Los registros a mano (confirmar una cuota,
  anotar el pago de la tarjeta) sí insertan directo — RLS los limita a la
  cuenta, igual que hace `expenses` hoy. Lo que el trigger garantiza es que
  un pendiente **nunca** pase a `confirmado` sin haber creado su movimiento.

## Preguntas abiertas

1. **¿Quién manda los comprobantes de PSE?** ¿El comercio, ACH Colombia, o
   Davibank? De ahí sale la lista de remitentes del query de Gmail, y es lo
   primero que hay que mirar en el buzón.
2. **¿Un pago PSE genera uno o dos correos?** Si el comercio y ACH mandan
   cada uno el suyo, el dedupe difuso pasa de salvaguarda a mecanismo de
   uso diario.
3. **¿A qué cuenta te llega la nómina?** Define el instrumento por defecto de
   la regla de ingreso.
### Cerradas

- ~~*¿Las alertas de compra de la tarjeta llegan todas al correo
  conectado?*~~ **Sí.** La tarjeta es de la esposa y el buzón conectado es
  el de ella: la cobertura está completa, no hay compras invisibles.
- ~~*¿Alguna vez pagas menos del total de la tarjeta?*~~ **Normalmente se
  paga el total, pero puede pasar que no.** Se queda como caso borde: se
  advierte el remanente y no se modela el rotativo con intereses.
- ~~*¿Las cuotas de deuda se detectan por correo?*~~ **No, se configuran y
  confirman a mano.**
