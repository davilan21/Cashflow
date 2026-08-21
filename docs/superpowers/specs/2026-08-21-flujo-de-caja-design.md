# Proyección de flujo de caja — diseño

Fecha: 2026-08-21 (v2 — incorpora lectura de débito/PSE y multi-buzón)

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

- **Saldo de caja**: se mantiene **automáticamente desde Gmail**, leyendo no
  solo las notificaciones de tarjeta de crédito sino los movimientos de la
  **cuenta de ahorros: PSE, transferencias, retiros y abonos de nómina**.
  **Restricción técnica**: las alertas describen *movimientos*, no saldos
  (confirmado en `lib/gmail/parse.ts`). El modelo es **semilla + deltas +
  re-anclaje**: David ingresa su saldo una vez, Gmail lo mantiene al día, y
  puede re-anclarlo cuando se desvíe.
- **Multi-buzón**: hay que poder conectar **más de una cuenta de Gmail**
  (la de la pareja, y/o un segundo buzón propio). El esquema actual
  (`gmail_conexiones` con `user_id` como PK) no lo permite.
- **Granularidad**: **día a día, horizonte de 90 días**. La curva fina es lo
  que muestra los apretones *dentro* del mes — entre el pago de la TC el 30
  y la siguiente quincena — que es donde duele y que una vista mensual
  esconde.
- **Alcance v1**: ingresos + gastos fijos + pago de TC + **deudas con
  amortización**. Fuera de v1: diferidos de TC (compras a cuotas) e
  inversiones.
- **Ingresos variables**: hay **nómina y otros ingresos**, y no todos son de
  monto fijo. Una regla de ingreso declara si su monto es `fijo` o
  `estimado`; los estimados se dibujan distinto en la curva y el valor real
  los reemplaza cuando llega por Gmail.
- **Colchón**: **monto fijo configurable** en `settings` (no calculado como
  N meses de gastos).
- **Cuenta compartida**: **una sola curva** que suma los ingresos y gastos
  de ambos miembros. Reglas, deudas e inversiones pertenecen a la `cuenta`
  (el hogar); se guarda `created_by` para atribución, igual que `expenses`.
- **Inversiones**: el aporte recurrente es una salida de caja; además se
  marca cuáles son **líquidas**, para que cuando la proyección toque el piso
  la app diga "tienes $X liquidables" en vez de solo alarmar. Sin
  rentabilidad ni valorización — eso es otra app.

## El riesgo #1: doble conteo

Es el error que arruina cualquier proyección de este tipo, y hay que
resolverlo en el esquema, no en la UI. Aparece en **cuatro** formas
distintas, y las cuatro necesitan solución explícita.

La base es **`medio_pago` en cada gasto y en cada regla recurrente**:

- `medio_pago = 'debito'` o `'efectivo'` → evento de caja en su fecha.
- `medio_pago = 'tc'` → **no toca caja**; suma al total esperado del ciclo,
  y toca caja el día del pago del ciclo.

### 1. El fijo que llega a la tarjeta

Netflix es gasto fijo **y** llega a la TC. Si se cuenta como salida fija en
su fecha *y* otra vez dentro del pago del ciclo, la proyección queda
sistemáticamente pesimista. Cuando Gmail ingesta el cargo real del ciclo, la
expectativa de esa regla queda **consumida**. Por eso `expenses` gana
`regla_id`: emparejar por id explícito, nunca por heurística de monto o
nombre.

### 2. El run-rate que se traga los fijos

La proyección "a este ritmo" corre solo sobre el gasto **discrecional** —
excluye los `expenses` con `regla_id` no nulo. Si no, los fijos del ciclo se
cuentan dos veces dentro del mismo ciclo.

### 3. El gasto de débito en dos libros

Un gasto de débito registrado en `expenses` ya afecta el saldo; no debe
además existir como fila en `movimientos_caja`. Ver "Quién es dueño de qué".

### 4. El pago de la tarjeta visto desde la cuenta de ahorros ⚠️

**Este es el nuevo, y es el más peligroso.** Al empezar a leer los
movimientos de la cuenta de ahorros, el pago mensual de la tarjeta va a
llegar por Gmail como un débito PSE de $4.1M. Si se clasifica como "gasto",
el ciclo se cuenta **dos veces**: una como la suma de sus compras, y otra
como el pago.

Solución: el clasificador debe reconocer que el destino es la propia tarjeta
y marcarlo `clase = 'pago_tc'`, que va a `movimientos_caja` con `ref_ciclo`,
**nunca a `expenses`**. Y al existir el pago real, el evento proyectado de
ese ciclo se reemplaza, no se suma.

## Modelo de datos

Migración `0005_flujo_de_caja.sql`.

### Cambios a tablas existentes

```sql
alter table expenses add column medio_pago text not null default 'tc'
  check (medio_pago in ('tc', 'debito', 'efectivo'));
alter table expenses add column regla_id uuid references reglas(id) on delete set null;
alter table expenses add column instrumento_id uuid references instrumentos(id) on delete set null;

alter table settings add column colchon bigint not null default 0;
```

El default `'tc'` es correcto para todo lo histórico: hasta hoy la app solo
registra gastos de tarjeta.

#### `gmail_conexiones`: de una conexión por usuario a N

Hoy `user_id` es la PK, y `sincronizarGmail()` / `obtenerEstadoConexion()`
hacen `.eq("user_id", userId).maybeSingle()`. Pasa a:

```sql
-- id propio; un usuario puede tener varios buzones, pero no el mismo dos veces
alter table gmail_conexiones drop constraint gmail_conexiones_pkey;
alter table gmail_conexiones add column id uuid primary key default gen_random_uuid();
create unique index gmail_conexiones_user_email on gmail_conexiones (user_id, email_conectado);
```

Impacto en código: `sincronizarGmail(admin, conexionId)` en vez de `userId`;
`obtenerEstadoConexion()` devuelve una **lista**; la sección Gmail de Cuenta
lista conexiones con su estado y un botón de conectar otra. El cron
(`sync-cron/route.ts`) ya itera todas las conexiones activas, así que solo
cambia el identificador que le pasa a cada una.

#### `gastos_pendientes` → `movimientos_pendientes`

La bandeja deja de recibir solo gastos: ahora también ingresos, pagos de TC
y transferencias. Mantener el nombre `gastos_pendientes` con ingresos
adentro es confusión garantizada a seis meses.

```sql
alter table gastos_pendientes rename to movimientos_pendientes;
alter table movimientos_pendientes add column clase text not null default 'gasto'
  check (clase in ('gasto', 'ingreso', 'pago_tc', 'transferencia', 'interna'));
alter table movimientos_pendientes add column medio_pago text not null default 'tc'
  check (medio_pago in ('tc', 'debito', 'efectivo'));
alter table movimientos_pendientes add column instrumento_id uuid references instrumentos(id);
alter table movimientos_pendientes add column conexion_id uuid references gmail_conexiones(id);
alter table movimientos_pendientes alter column categoria drop not null;  -- un ingreso no tiene categoría
```

**Costo del rename**: las políticas RLS, los índices y el trigger
`bloquear_confirmacion_directa` siguen a la tabla automáticamente. Lo que
**sí** hay que recrear es la función `confirmar_gasto_pendiente()`, porque
su cuerpo nombra la tabla — y de todas formas hay que reescribirla (abajo).
En el código de la app son ~8 archivos.

#### `confirmar_gasto_pendiente()` → `confirmar_movimiento_pendiente()`

Ya no siempre escribe en `expenses`. Enruta según `clase`:

| `clase` | destino |
|---|---|
| `gasto` | `expenses` (con `medio_pago`, `regla_id` si se emparejó) |
| `ingreso` | `movimientos_caja` (+) |
| `pago_tc` | `movimientos_caja` (−) con `ref_ciclo` |
| `transferencia` | `movimientos_caja` (signo según dirección) |
| `interna` | nada — se marca confirmado y no afecta caja |

Se mantiene la garantía actual: nada entra a los libros reales sin pasar por
esta función, y el trigger sigue bloqueando la confirmación directa.

### `instrumentos` — la llave de ruteo

Toda alerta de Bancolombia trae los últimos 4 dígitos (`T.Cred *1234`,
`T.Deb *5678`). Esa es la única forma confiable de saber *de dónde salió* la
plata — sin esto no se puede distinguir un débito de la cuenta de David de
uno de la de su pareja, ni una compra de crédito de una de débito.

| columna | tipo | notas |
|---|---|---|
| `id` | uuid, PK | |
| `cuenta_id` | uuid | |
| `nombre` | text | "Ahorros Bancolombia", "TC Visa David" |
| `tipo` | text | `ahorros` \| `corriente` \| `tc` \| `efectivo` |
| `ultimos4` | text, null | llave de ruteo desde las alertas |
| `titular` | uuid, null | qué miembro es el titular |
| `activo` | bool | |

`medio_pago` se deriva del `tipo` del instrumento cuando hay uno; se queda
como campo propio para que todo funcione sin configurar instrumentos (un
gasto manual no necesita instrumento). Un `*NNNN` desconocido no se adivina:
el movimiento cae en la bandeja pidiendo que se le asigne instrumento.

### `saldo_snapshots` — el ancla

| columna | tipo | notas |
|---|---|---|
| `id` | uuid, PK | |
| `cuenta_id` | uuid | |
| `instrumento_id` | uuid, null | null = saldo consolidado |
| `fecha` | date | |
| `monto` | bigint | |
| `origen` | text | `manual` \| `gmail` |
| `created_by`, `created_at` | | |

Re-anclar es insertar un snapshot nuevo, no editar el viejo — así queda el
historial de qué tan buena fue la proyección entre anclas.

### `movimientos_caja` — el libro de caja no-gasto

| columna | tipo | notas |
|---|---|---|
| `id` | uuid, PK | |
| `cuenta_id` | uuid | |
| `fecha` | date | |
| `monto` | bigint | **con signo**: + entrada, − salida |
| `tipo` | text | `ingreso` \| `pago_tc` \| `cuota_deuda` \| `aporte` \| `transferencia` \| `otro` |
| `etiqueta` | text | |
| `origen` | text | `manual` \| `gmail` |
| `instrumento_id` | uuid, null | |
| `ref_ciclo` | text, null | para `pago_tc`: qué ciclo se pagó |
| `ref_id` | uuid, null | regla o deuda que lo originó |
| `created_by`, `created_at` | | |

#### Quién es dueño de qué

- `expenses` = libro de **gastos categorizados** (de TC o de débito, según
  `medio_pago`).
- `movimientos_caja` = lo que **no es un gasto**: ingresos, pago de la TC,
  cuotas de deuda, aportes, transferencias.
- Nunca la misma plata en las dos tablas.

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
| `nombre` | text | "Nómina David", "Arriendo", "Netflix" |
| `monto` | bigint | monto fijo, o el estimado si `monto_tipo = 'estimado'` |
| `monto_tipo` | text | `fijo` \| `estimado` |
| `frecuencia` | text | `quincenal` \| `mensual` \| `bimestral` \| `anual` \| `unica` |
| `dia_1` | int | día del mes (1–31) |
| `dia_2` | int, null | segundo día, solo para `quincenal` |
| `mes` | int, null | solo para `anual` (prima = 6 y 12, cesantías = 2) |
| `medio_pago` | text | solo aplica a `gasto_fijo` |
| `instrumento_id` | uuid, null | a qué cuenta entra/de cuál sale |
| `categoria` | text, null | para fijos que van a la TC |
| `inversion_id` | uuid, null | solo `aporte_inversion` (fase 6) |
| `desde` | date | |
| `hasta` | date, null | null = indefinida |
| `activa` | bool | |
| `created_by`, `created_at` | | |

**Día 30 en febrero**: se recorta al último día del mes. `diasEnMes()` en
`lib/ciclo.ts` ya hace eso para `cicloPago()`; se reusa.

**Ingresos estimados**: la curva los dibuja punteados. Cuando llega el abono
real por Gmail, reemplaza al proyectado de esa fecha (emparejando por regla
+ ventana de días), y la app puede sugerir actualizar el estimado si la
diferencia es consistente.

### `deudas`

| columna | tipo | notas |
|---|---|---|
| `id` | uuid, PK | |
| `cuenta_id` | uuid | |
| `nombre` | text | |
| `tipo` | text | `credito` \| `libranza` \| `hipoteca` \| `vehiculo` \| `otro` |
| `saldo_actual` | bigint | saldo a la fecha de anclaje |
| `saldo_a_fecha` | date | |
| `tasa_mensual` | numeric(8,6) | efectiva mensual en decimal (0.0175 = 1.75% EM) |
| `cuota` | bigint, null | si es null, se calcula por amortización francesa |
| `n_cuotas` | int | |
| `cuotas_pagadas` | int | |
| `dia_pago` | int | |
| `medio_pago` | text | normalmente `debito` |
| `activa` | bool | |

### `inversiones` (fase 6)

`id`, `cuenta_id`, `nombre`, `tipo`, **`liquida` bool** (cuenta como
colchón), `saldo_actual`, `saldo_a_fecha`, `activa`.

### RLS

Todas las tablas nuevas siguen el patrón de `0003_cuentas_compartidas.sql`:
`using (cuenta_id = mi_cuenta())`. Excepción: `gmail_conexiones` sigue sin
políticas para `authenticated` — invisible al cliente, solo service role,
porque guarda refresh tokens.

## Clasificación de movimientos de Gmail

Hoy `parsearNotificacion()` devuelve un `GastoDetectado` y todo va a la
bandeja como gasto. Pasa a devolver una unión discriminada:

```ts
type MovimientoDetectado = {
  clase: 'gasto' | 'ingreso' | 'pago_tc' | 'transferencia' | 'interna';
  monto: number;
  fecha: string;
  nota: string;
  ultimos4: string | null;
  medio_pago: 'tc' | 'debito' | 'efectivo';
  categoria: CategoryId | null;   // solo para clase 'gasto'
};
```

Mapa de tipos de alerta de Bancolombia a clases:

| Alerta | `clase` | `medio_pago` | Destino al confirmar |
|---|---|---|---|
| Compra con `T.Cred *NNNN` | `gasto` | `tc` | `expenses` |
| Compra con `T.Deb *NNNN` | `gasto` | `debito` | `expenses` |
| Pago PSE a un comercio | `gasto` | `debito` | `expenses` |
| **Pago PSE a la propia TC** | **`pago_tc`** | `debito` | **`movimientos_caja`** |
| Abono de nómina | `ingreso` | — | `movimientos_caja` |
| Transferencia recibida | `ingreso` | — | `movimientos_caja` |
| Transferencia enviada a tercero | `transferencia` | `debito` | `movimientos_caja` |
| Transferencia entre cuentas propias | `interna` | — | nada (neutra) |
| Retiro en cajero | `gasto` | `efectivo` | `expenses` |

Las dos filas que hay que acertar sí o sí son **pago a la propia TC**
(riesgo #4) y **transferencia entre cuentas propias** (contarla infla el
gasto y desinfla el saldo a la vez). Ambas se detectan comparando el
`ultimos4` de destino contra `instrumentos` — por eso esa tabla no es
opcional.

### ⚠️ Prerrequisito: correos de muestra

`lib/gmail/parse.ts` hoy solo tiene regex calibrados contra **dos** formatos
reales confirmados, ambos de tarjeta de crédito. **No hay muestras de las
alertas de PSE, transferencia, nómina ni retiro.** Antes de escribir el
parser, David tiene que aportar un correo real de cada tipo (con datos
tapados si quiere). Sin eso, cualquier regex es adivinanza — el mismo
problema que ya se documentó en el plan de Gmail original.

El parser primario sigue siendo Claude (más tolerante a variaciones de
formato) con el regex local de respaldo.

## Multi-buzón: el dedupe cruzado

El unique actual es `(creado_por, gmail_message_id)` — deduplica *dentro* de
un buzón. Con dos buzones conectados a la misma cuenta bancaria compartida,
**el mismo movimiento llega como dos correos distintos con ids distintos** y
pasa el unique sin problema. Resultado: cada gasto contado dos veces.

Solución: además del unique por mensaje, un **dedupe difuso** al insertar —
si ya existe un movimiento (pendiente o confirmado) con el mismo `monto`,
misma `fecha` y mismo `ultimos4`, el nuevo se marca `posible_duplicado` y la
bandeja lo muestra agrupado con su gemelo para descartar uno. No se descarta
solo: dos compras idénticas el mismo día en el mismo sitio existen.

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
  origen: 'real' | 'proyectado' | 'estimado';
  refId?: string;
}

interface Proyeccion {
  eventos: EventoCaja[];
  serie: { fecha: string; saldo: number }[];   // un punto por día, 90 días
  minimo: { fecha: string; saldo: number };
  saldoHoy: number;
  bajoColchon: { fecha: string; saldo: number } | null;
}

export function proyectar(entrada: EntradaProyeccion): Proyeccion;
```

### Algoritmo

1. **Saldo de arranque**: último snapshot + movimientos reales posteriores
   (fórmula de arriba).
2. **Expandir reglas** activas a eventos entre hoy y hoy+90, recortando el
   día al último del mes cuando aplique. Los `gasto_fijo` con
   `medio_pago = 'tc'` **no** generan evento: alimentan el paso 4. Los
   ingresos con `monto_tipo = 'estimado'` salen con `origen: 'estimado'`.
3. **Expandir deudas** a cuotas mensuales (`lib/deuda.ts`).
4. **Calcular el pago de TC de cada ciclo** del horizonte:
   - **Ciclo cerrado y no pagado** → total real de `expenses`, evento en
     `cicloPago(ciclo)`, origen `real`.
   - **Ciclo en curso** → real hasta hoy + fijos-TC del ciclo aún no
     cobrados + run-rate discrecional × días restantes. El run-rate
     discrecional = gasto del ciclo con `regla_id` nulo ÷ días corridos
     (`diasCorridosEnRango()` ya existe).
   - **Ciclos futuros** → fijos-TC del ciclo + promedio discrecional de los
     últimos 3 ciclos.
   - **Si ya existe un `movimiento_caja` con `tipo='pago_tc'` y ese
     `ref_ciclo`** → el evento proyectado se **reemplaza**, no se suma.
5. **Ordenar por fecha, acumular**, un punto de saldo por día.
6. **Encontrar el mínimo** y el primer cruce bajo el colchón.

### `lib/deuda.ts`

```ts
export function cuotaFrancesa(saldo: number, tasaMensual: number, n: number): number;
export function tablaAmortizacion(deuda: Deuda): CuotaProyectada[];
```

`cuota = P·i / (1 − (1+i)^−n)`. Si la deuda trae `cuota`, se usa esa y se
deriva el saldo mes a mes (`interés = saldo × i`, `abono = cuota − interés`),
para créditos cuya cuota real no calza con la fórmula. Casos borde con test:
`tasa = 0`, última cuota descuadrada por redondeo, deuda ya terminada.

## UI

### Pestaña nueva: **Flujo**

- **Header**: saldo de hoy, y debajo el número estrella —
  *"Tu punto más apretado: $340.000 el 28 de septiembre"*.
- **Gráfica de línea** (Recharts, ya está por `GraficaCiclos`): saldo día a
  día, 90 días, con la línea del colchón marcada y los eventos grandes
  señalados. Tramos estimados con trazo distinto.
- **Lista por semana**, expandible a los eventos de cada día, con los
  proyectados visualmente distintos de los reales.
- **Banner de alerta** si el mínimo cruza el colchón. Con fase 6, añade
  *"tienes $X liquidables para cubrirlo"*.

### Pantalla nueva: **Compromisos**

CRUD de reglas, deudas e inversiones. Pantalla propia, no dentro de Cuenta:
son datos que se consultan y ajustan, no configuración que se toca una vez.

### Cambios a pantallas existentes

- **Cuenta → Gmail**: lista de conexiones (N buzones) con estado y
  "conectar otra cuenta".
- **Cuenta → Instrumentos**: CRUD de cuentas y tarjetas con sus últimos 4.
- **Pendientes**: agrupa por clase (gastos / ingresos / pagos), permite
  cambiar la clase de un movimiento mal clasificado, y marca los posibles
  duplicados entre buzones.
- **Registro**: al crear un gasto manual, elegir medio de pago.

## El payoff: cerrar el círculo

- **Tope derivado, no inventado**:
  `tope sugerido = ingresos del ciclo − fijos − cuotas de deuda − aportes − colchón`.
  El tope deja de ser $4M porque sí.
- **Alertas cruzadas**: *"vas proyectado en $4.8M de TC y la quincena del 30
  solo te deja $3.2M libres"* — accionable hoy, no a fin de mes.
- **Simulador de compra** (futuro): *"¿puedo comprar esto de $3M a 12
  cuotas?"* → recalcula la curva y dice qué tan cerca del piso queda.

## Fases

| # | Fase | Contenido |
|---|---|---|
| 1 | **Cimientos** | Migración `0005`: `medio_pago`, `regla_id`, `colchon`, `instrumentos`, `saldo_snapshots`, `movimientos_caja`, `reglas`, `deudas`. Motor `lib/flujo.ts` + `lib/deuda.ts` con tests. Sin UI. |
| 2 | **Compromisos** | CRUD de reglas (ingresos fijos y estimados + gastos fijos) e instrumentos. |
| 3 | **Deudas** | CRUD de deudas + tabla de amortización visible. |
| 4 | **Flujo** | Curva de 90 días, saldo mínimo, colchón, lista por semana, ajuste manual de saldo. **Aquí ya es útil.** |
| 5 | **Multi-buzón** | `gmail_conexiones` con id propio, sync por conexión, UI de N buzones, dedupe difuso cruzado. |
| 6 | **Débito y PSE** | Muestras reales → clasificador de movimientos, rename a `movimientos_pendientes`, `confirmar_movimiento_pendiente()` con ruteo, bandeja por clase. **Aquí el saldo se mantiene solo.** |
| 7 | **Círculo cerrado** | Inversiones + colchón liquidable, tope sugerido, alertas cruzadas. |

**Orden 4 → 5 → 6**: el saldo semilla manual es técnicamente obligatorio de
todas formas (Gmail da movimientos, no saldos), y con solo la semilla la
curva ya sirve. La fase 6 es la que la vuelve automática, y depende de tener
muestras de correo que hoy no existen. Las fases 5 y 6 se pueden adelantar
antes de la 4 si mantener el saldo a mano resulta molesto — no rompen nada
de 1–3, solo retrasan la primera curva.

## Restricciones heredadas del proyecto

- Español en toda la UI, commits y comentarios.
- Sin dependencias npm nuevas (Recharts y el SDK de Anthropic ya están).
- Toda mutación por Supabase pasa por `sinTipar()` de
  `lib/supabase/queries.ts`.
- Aritmética de fechas siempre en `lib/ciclo.ts` con strings `YYYY-MM-DD` y
  enteros, nunca con `Date` local. "Hoy" siempre en `America/Bogota`.
- Nunca sobrescribir datos que no se pudieron leer: si falla la carga, la
  pantalla queda de solo lectura con aviso y reintento.
- Revisión obligatoria: nada entra a `expenses` ni a `movimientos_caja` sin
  pasar por la función de confirmación.

## Preguntas abiertas

1. **Emparejar fijos-TC con gastos reales** (quedó pendiente): la propuesta
   por defecto es que la app **sugiera** el emparejamiento y David confirme
   desde la bandeja — consistente con el principio de revisión obligatoria
   del proyecto. Se asume esto salvo indicación contraria.
2. **El segundo buzón**: ¿es el de la pareja (otro miembro de la cuenta,
   cada quien conecta el suyo) o un segundo buzón del propio David? El
   diseño soporta ambos, pero cambia la UI: en el primer caso cada miembro
   conecta desde su sesión; en el segundo, un usuario administra varios.
3. **Bancos**: ¿la cuenta de ahorros es también Bancolombia, o hay otro
   banco cuyas alertas habría que parsear aparte?
