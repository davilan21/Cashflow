# Ahorros — portafolio de instrumentos, aportes y monitoreo

Fecha: 2026-09-15

## Objetivo

Responder, de un vistazo:

> **¿Cuánto tengo ahorrado, dónde, cuánto rindió, y estoy aportando lo que
> me propuse?**

Hoy Plan dice cuánto *debería* sobrar cada mes. Falta el otro lado: dónde
está la plata (CDTs, acciones, fondos), cuánto vale hoy, y si los aportes
reales van al ritmo del plan.

## Relación con Plan: solo lectura

Plan **no se toca**. Su `ahorro` del mes es la **meta** de aporte. Ahorros
llama a `calcularPlan()` (ya existe en `lib/plan/calculo.ts`) para obtener
esa meta y la compara con lo aportado. Ningún dato de Ahorros entra a Plan.

Se descartó modelar los aportes como rubros `fijo` de Plan: el "ahorro" de
Plan pasaría a ser "sobrante" y perdería su significado.

## Principio: aislamiento

Tablas nuevas con prefijo **`ahorro_`**, migración **`0012_ahorros.sql`**
(los números `0005`–`0010` siguen reservados por la rama Flujo). **Cero
`alter table` sobre tablas existentes.** El módulo lee `expenses` solo a
través de `calcularPlan()`.

Archivos existentes que se modifican, y por qué:

| Archivo | Cambio |
|---|---|
| `app/(app)/layout.tsx` | contenedor `max-w-xl lg:max-w-4xl` |
| `app/(app)/{registro,pendientes,historial,plan,cuenta}/page.tsx` | envuelven su `Client` en `<div className="max-w-xl mx-auto">` para no estirarse en PC |
| `components/NavTabs.tsx` | sexta entrada; en móvil Cuenta pasa a ícono |
| `components/ui/Sheet.tsx` | en `lg` se centra como modal |
| `lib/types.ts` | tipos nuevos |

## Decisiones tomadas (brainstorming con David)

| Pregunta | Decisión |
|---|---|
| Cómo se sabe cuánto vale un ahorro | **Movimientos (aportes/retiros) + valoraciones manuales.** Rendimiento = valor − aportado. Sin APIs de precios. |
| Cruce con Plan | **Plan vs. real, solo lectura:** la meta es el `ahorro` de Plan; Ahorros muestra cuánto aportaste contra ella. |
| Monitoreo | Total y desglose por instrumento; evolución mensual (aportado vs. valor); vencimientos de CDT; aporte del mes vs. meta. |
| Moneda | **COP y USD.** Cada instrumento tiene moneda; el total consolida en COP con una TRM. |
| TRM | **Automática desde datos.gov.co (Banco de la República, API abierta), editable a mano.** Nunca se inventa un valor. |
| Titular | **Cada instrumento tiene titular** (miembro de la cuenta o "hogar"); total consolidado con filtro por persona. |
| Modelo de datos | **Cuatro tablas** (`instrumentos`, `movimientos`, `valoraciones`, `trm`). Se descartó una sola tabla de movimientos con tipo `valoracion` (mezcla plata puesta con valor) y JSON (pisadas, sin historia). |
| Responsive | **Mobile-first + breakpoint `lg` (≥1024px)** con dos columnas en Ahorros. Las pantallas viejas mantienen su columna de 576px centrada; adaptarlas a PC es trabajo posterior, una por una. |

## El cálculo — `lib/ahorros/calculo.ts`

Funciones puras, sin Supabase ni `Date` del sistema. Entradas: instrumentos,
movimientos, valoraciones, filas de TRM, `hoy` (`'YYYY-MM-DD'`) y los
`MesPlan[]` de `calcularPlan()`.

### Por instrumento → `ResumenInstrumento`

| Campo | Regla |
|---|---|
| `aportado` | Σ aportes − Σ retiros con `fecha <= hoy`, en la **moneda del instrumento** |
| `valor` | la valoración más reciente con `fecha <= hoy`; si no hay, `= aportado` |
| `origenValor` | `{ tipo: 'valoracion', fecha }` o `{ tipo: 'aportado' }` — la UI lo dice en texto |
| `rendimiento` | `valor − aportado` |
| `rendimientoPct` | `rendimiento / aportado × 100`; **`null` si `aportado <= 0`** |
| `aportadoCOP`, `valorCOP`, `rendimientoCOP` | si `moneda = 'USD'`: × TRM vigente (la fila más reciente con `fecha <= hoy`); si no hay TRM → **`null`** (nunca 0); si `moneda = 'COP'`: iguales a los de arriba |
| `cdt` | solo si `tipo = 'cdt'` y hay `vencimiento`: `{ diasAlVencimiento, estado }` con `estado` = `vigente` (> 30 días) / `por_vencer` (0–30) / `vencido` (< 0). Si no, `null` |

Un retiro mayor a lo aportado deja `aportado` negativo: se permite (retirar
rendimiento es legítimo) y `rendimientoPct` queda `null`.

Movimientos y valoraciones con fecha **posterior a `hoy`** se ignoran.

### Portafolio → `ResumenPortafolio`

- `totalAportadoCOP`, `totalValorCOP`, `rendimientoCOP`, `rendimientoPct`
  (misma regla del `null`), sumando **solo** instrumentos con COP calculable.
- `usdSinConvertir`: Σ `valor` de instrumentos USD sin TRM (0 si hay TRM).
- `trm`: `{ valor, fecha, fuente }` usada, o `null`.
- `porTitular`, `porTipo`: `{ clave, valorCOP, pct }`; titular `null` se
  agrupa como `'hogar'`.
- Filtro por titular: se aplica a la lista de instrumentos **antes** del
  cálculo; el consolidado es sin filtro.
- Inactivos (`activo = false`) cuentan en el total — es plata que existe —
  salvo que se pida `soloActivos`.

### Evolución → `serieMensual(): PuntoSerie[]`

Un punto por mes calendario desde el mes del primer movimiento hasta el mes
de `hoy`, sin huecos:

- `aportadoCOP(mes)` = Σ movimientos con `fecha <= finDeMes`, convertidos.
- `valorCOP(mes)` = Σ por instrumento de la última valoración `<= finDeMes`
  (o su aportado a esa fecha si no hay), convertidos.
- Conversión USD con la última TRM `<= finDeMes`. Si el mes es anterior a
  la primera TRM conocida, se usa la primera conocida y el punto lleva
  `trmAproximada: true`.
- `metaPlan(mes)`: `MesPlan.ahorro` si el mes está en el rango de Plan;
  si no, `null`.

### Plan vs. real → `aporteVsMeta()`

- `meta` = `MesPlan.ahorro` del mes actual (`null` si Plan no tiene ingresos).
- `aportadoCOP` = Σ aportes − Σ retiros con `fecha` en el mes actual,
  convertidos con la TRM vigente.
- `pct` = `aportadoCOP / meta × 100` si `meta > 0`, si no `null`.
- `faltante` = `max(0, meta − aportadoCOP)`, o `null` si `meta` es `null`.

### Dinero — `lib/ahorros/formato.ts`

- COP: `pesos()` existente. Entrada con `formatearMiles`/`parsearMonto` de
  `lib/plan/formato.ts` (se reutilizan).
- USD: `dolares(n)` → `US$1.234,56`; negativos con `−` delante. Entrada con
  `formatearDecimal` (miles con punto, dos decimales con coma) y
  `parsearDecimal` (→ `number | null`).
- Los USD se guardan con 2 decimales; los COP enteros.

### Fuera del cálculo, a propósito

Proyección del CDT a vencimiento (necesita fecha de apertura y convención
de tasa), precios automáticos, impuestos/retenciones.

## Datos — `supabase/migrations/0012_ahorros.sql`

```sql
create table ahorro_instrumentos (
  id          uuid primary key default gen_random_uuid(),
  cuenta_id   uuid not null references cuentas(id) on delete cascade,
  nombre      text not null check (length(trim(nombre)) > 0),
  tipo        text not null check (tipo in ('cdt', 'acciones', 'fondo', 'cuenta', 'otro')),
  moneda      text not null check (moneda in ('COP', 'USD')),
  titular     uuid references auth.users(id) on delete set null,  -- null = del hogar
  entidad     text,
  tasa_ea     numeric(6,3) check (tasa_ea is null or tasa_ea >= 0),
  vencimiento date,
  activo      boolean not null default true,
  created_by  uuid references auth.users(id) on delete set null,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  check (tipo = 'cdt' or (tasa_ea is null and vencimiento is null))
);
create index ahorro_instrumentos_cuenta_idx on ahorro_instrumentos (cuenta_id, activo);

create table ahorro_movimientos (
  id             uuid primary key default gen_random_uuid(),
  cuenta_id      uuid not null references cuentas(id) on delete cascade,
  instrumento_id uuid not null references ahorro_instrumentos(id) on delete cascade,
  fecha          date not null,
  tipo           text not null check (tipo in ('aporte', 'retiro')),
  monto          numeric(16,2) not null check (monto > 0),
  nota           text,
  created_by     uuid references auth.users(id) on delete set null,
  created_at     timestamptz not null default now()
);
create index ahorro_movimientos_instrumento_idx on ahorro_movimientos (instrumento_id, fecha);

create table ahorro_valoraciones (
  id             uuid primary key default gen_random_uuid(),
  cuenta_id      uuid not null references cuentas(id) on delete cascade,
  instrumento_id uuid not null references ahorro_instrumentos(id) on delete cascade,
  fecha          date not null,
  valor          numeric(16,2) not null check (valor >= 0),
  nota           text,
  created_by     uuid references auth.users(id) on delete set null,
  created_at     timestamptz not null default now(),
  unique (instrumento_id, fecha)
);

create table ahorro_trm (
  cuenta_id  uuid not null references cuentas(id) on delete cascade,
  fecha      date not null,
  valor      numeric(12,4) not null check (valor > 0),
  fuente     text not null check (fuente in ('datos.gov.co', 'manual')),
  created_at timestamptz not null default now(),
  primary key (cuenta_id, fecha)
);
```

Triggers reutilizados: `set_created_by()` (insert en instrumentos,
movimientos, valoraciones), `set_updated_at()` (update en instrumentos).
RLS: `enable row level security` en las cuatro y una política
`for all using (cuenta_id = mi_cuenta()) with check (cuenta_id = mi_cuenta())`
por tabla.

Decisiones:

- **`numeric`, no `bigint`**: USD con centavos y TRM con decimales. PostgREST
  los devuelve como `string`; las queries los convierten con `Number()` en el
  borde, una vez.
- **Signo por `tipo`**: `monto > 0` siempre; `retiro` resta en el cálculo.
- **`titular` → `auth.users`**: el apodo sale de `cuenta_miembros.apodo`.
- **`check` de coherencia CDT**: `tasa_ea` y `vencimiento` solo si
  `tipo = 'cdt'`.
- **Una valoración por instrumento y día**: repetir el día es corregir →
  `upsert` con `onConflict: 'instrumento_id,fecha'`.
- **TRM por cuenta** aunque el dato sea público: el override manual de una
  cuenta no afecta a otra y la RLS no necesita excepciones. Clave
  `(cuenta_id, fecha)`; `upsert` con `onConflict: 'cuenta_id,fecha'`.
- **Borrar instrumento** cascadea; la UI advierte con conteos. `activo = false`
  es la alternativa suave.

### La ruta de TRM — `app/api/trm/route.ts` + `lib/ahorros/trm.ts`

`GET /api/trm`, con la sesión del usuario (RLS normal; sin service role):

1. Si hay fila en `ahorro_trm` para `hoy` (Bogotá) → la devuelve sin llamar afuera.
2. Si no: `GET https://www.datos.gov.co/resource/32sa-8pi3.json?$order=vigenciadesde DESC&$limit=1`
   con timeout de 5 s. Valida: array no vacío, `valor` numérico en
   `[1000, 20000]`, `vigenciadesde` parseable a `YYYY-MM-DD`. `upsert` con
   `fuente = 'datos.gov.co'` en la fecha de **`hoy`** — no en `vigenciadesde`.
   Colombia suele publicar la TRM el día hábil anterior al que rige, así que
   `vigenciadesde` puede ser mañana; toda la app (el propio chequeo de "¿ya
   hay fila de hoy?", y `trmVigente()` en `lib/ahorros/calculo.ts`) lee y
   filtra por "el día en cuestión", nunca por la fecha de vigencia externa —
   usar `vigenciadesde` como llave de guardado dejaría dos filas por un
   mismo fetch cuando difieren de `hoy`. Devuelve `{ valor, fecha: hoy,
   fuente }`.
3. Cualquier fallo → `{ error: <causa legible> }`. La pantalla usa la última
   TRM guardada y dice "TRM del DD/MM (no se pudo actualizar)". **Nunca se
   inventa un valor.**

La lógica (parseo, validación, decisión de llamar o no) vive en
`lib/ahorros/trm.ts` con `fetch` inyectable, para poder testearla sin red.

Override manual: `upsert` desde el cliente con `fuente = 'manual'` para la
fecha de hoy; pisa la automática del día.

### Tipos y queries

`lib/types.ts`: `AhorroInstrumento`, `AhorroMovimiento`, `AhorroValoracion`,
`Trm`, `TipoInstrumento`, `Moneda`, y las cuatro tablas en `Database`
(Insert/Update inline, como el resto del archivo).

`lib/ahorros/queries.ts`, todas `{ data, error }`: `listarInstrumentos`,
`crearInstrumento`, `actualizarInstrumento`, `eliminarInstrumento`,
`listarMovimientos` (orden `fecha desc, created_at desc`), `crearMovimiento`,
`eliminarMovimiento`, `listarValoraciones`, `guardarValoracion` (upsert),
`eliminarValoracion`, `listarTrm`, `guardarTrm` (upsert). Los `numeric`
salen como `number`.

## UI — pestaña **Ahorros** (`/ahorros`)

Mismo sistema visual y primitivos que Plan. Mobile-first; en `lg` dos
columnas.

### Base compartida

- `app/(app)/layout.tsx`: `max-w-xl lg:max-w-4xl`.
- Páginas existentes: `<div className="max-w-xl mx-auto">` alrededor de su
  `Client`. Siguen viéndose exactamente igual.
- `NavTabs`: seis entradas. En `lg`, todas con texto. En móvil, Cuenta se
  oculta del segmentado y aparece como ícono de engranaje (36×36, como el de
  salir) al lado de cerrar sesión; el segmentado queda con cinco.
- `Sheet`: en `lg`, `items-center`, `rounded-2xl`, `max-w-md`, sin animación
  de subida. Misma API.

### Estructura

```
móvil (1 columna)                    lg (grid 5/7)
ResumenPortafolio                    ResumenPortafolio │ ListaInstrumentos
AporteVsMeta                         AporteVsMeta      │
GraficaEvolucion                     GraficaEvolucion  │
ListaInstrumentos                                      │
```

**Filtro por titular** arriba: segmentado `Todos · <apodo> · <apodo>`
(apodos de `cuenta_miembros`; sin apodo → "Miembro"). Afecta resumen,
gráfica y lista.

**`ResumenPortafolio`**: valor total COP a 32px; "aportado $X · rendimiento
**+$Y (+Z%)**" con signo y color (`ok`/`alerta`). Si hay USD: "de los cuales
US$N" y el **chip de TRM** `TRM $4.123 · 15 sep · automática|manual`, que
abre `TrmSheet`. Sin TRM con USD: total COP solo de instrumentos en pesos,
"US$N sin convertir — sin TRM" en `aviso`, chip "Cargar TRM".

**`AporteVsMeta`**: "Septiembre: aportaste $1,5M de $2M" + `BarraTope`
(verde ≥ 100%, `aviso` 50–100, `alerta` < 50) + "faltan $500k". Sin meta:
"Definí ingresos en Plan para tener una meta" con link a `/plan`.

**`GraficaEvolucion`**: Recharts `ComposedChart`, 180px, `aria-hidden`:
área **valor** (`ok`, opacidad 0.25) y línea **aportado** (`ink` punteada).
Tooltip: mes, aportado, valor, rendimiento. Puntos con `trmAproximada`
huecos. Sin animación.

**`ListaInstrumentos`**: tarjeta-botón por instrumento (≥ 64px): nombre +
chip de tipo + entidad en `muted`; a la derecha valor en su moneda y, si
USD, el COP debajo en `muted`; rendimiento con signo y color; línea de
origen `valorado 3 sep` / `= aportado (sin valorar)`. CDT: chip `vence en N
días` (`aviso` si ≤ 30), `vencido` (`alerta`), o `vence DD mes`. Orden por
`valorCOP` desc; inactivos al final, atenuados, bajo "Liquidados". Fila
final "+ Agregar ahorro" (48px).

### Detalle y acciones

**`DetalleInstrumentoSheet`** (90vh móvil / modal lg): cabecera (nombre,
valor, aportado, rendimiento); tres botones 44px en fila: **Aportar**,
**Retirar**, **Actualizar valor**; listas plegables *Movimientos* (fecha,
tipo, monto, quién, papelera con confirmación de dos pasos) y
*Valoraciones* (fecha, valor, papelera); abajo **Editar** y **Eliminar**
(dos pasos, "se pierden N movimientos y M valoraciones").

Hojas de captura, todas optimistas con reversión y toast:

- **`InstrumentoSheet`**: nombre, tipo (segmentado 5), moneda (COP/USD),
  titular (segmentado apodos + "Hogar"), entidad; si CDT: tasa EA (%) y
  vencimiento (`type="date"`). Validación inline espejo de los `check`.
- **`MovimientoSheet`** (aporte o retiro): monto en la moneda del
  instrumento (COP: `formatearMiles`; USD: `formatearDecimal`), fecha
  default hoy, nota opcional. Enter guarda.
- **`ValoracionSheet`**: valor, fecha default hoy; referencia "Aportado a la
  fecha: …". Mismo día = corregir.
- **`TrmSheet`**: valor actual con fuente y fecha; botón **Actualizar de
  datos.gov.co** (llama `/api/trm`, muestra resultado o el error textual);
  campo para fijar una manual.

### Estados

- **Vacío**: `Banner tono="info"` "Agregá tu primer ahorro para ver el
  portafolio" → `InstrumentoSheet`. Resumen y gráfica no se renderizan sin
  instrumentos.
- **`lecturaFallida`**: `Banner` rojo y **mutaciones deshabilitadas**.
- **TRM**: al montar, si hay USD y no hay fila de hoy, un `useEffect` llama
  `/api/trm` una vez; el chip dice "actualizando…"; si falla, queda la última
  conocida con el aviso.

### Reglas transversales

44px, `gap-2`, SVG, `cursor-pointer`, `touch-action: manipulation`,
`focus-visible:ring-2 ring-ink/40`, signo explícito, cifras `num`, español,
`prefers-reduced-motion`. Sin scroll horizontal a 375px; sin columna
estirada a 1280px en pantallas viejas.

### Fuera de v1

Precios automáticos, metas por instrumento, exportar, gráfica por
instrumento, reordenar, adaptar Registro/Historial/Plan a dos columnas.

## Pruebas y verificación

Gate: Vitest + `tsc --noEmit` + lint + build + migración verificada por
efecto. Fechas fijas siempre.

### `lib/ahorros/calculo.test.ts`

**Instrumento**: aportado resta retiros e ignora fecha futura; valor toma la
valoración más reciente `<= hoy` e ignora futuras; sin valoración →
`origenValor.tipo === 'aportado'`; `rendimientoPct` `null` con aportado ≤ 0
(control: 1.000.000 → 1.100.000 = 10); retiro > aportado no lanza; USD sin
TRM → COP `null` (no 0); TRM futura no se usa; CDT `vigente`/`por_vencer` a
30 y a 1/`vencido` a −1; sin vencimiento → `cdt: null`.

**Portafolio**: suma solo COP calculable; `usdSinConvertir` y `trm: null`
cuando falta TRM; `porTitular`/`porTipo` suman 100 ± 0.01 y `null` →
`'hogar'`; filtro no altera el consolidado; inactivos cuentan salvo
`soloActivos`.

**Serie**: sin huecos desde el primer movimiento hasta `hoy`; una valoración
de marzo se mantiene en abril y mayo; `trmAproximada` `true` antes de la
primera TRM y `false` con TRM propia; `metaPlan` `null` fuera del rango.

**Plan vs. real**: meta `null` → pct/faltante `null`; 2M/1,5M → 75 y 500k;
aportado > meta → pct > 100 y faltante 0; un retiro del mes resta.

### `lib/ahorros/formato.test.ts`

`dolares(1234.5) → "US$1.234,50"`; negativo con `−`; `formatearDecimal`
("1234,567" → "1.234,56"); `parsearDecimal` ("1.234,56" → 1234.56; "" → null).

### `lib/ahorros/queries.test.ts` (cliente falso que captura la petición)

`guardarValoracion`: `on_conflict=instrumento_id,fecha` + `Prefer:
resolution=merge-duplicates`, mock con objeto pelado para `.single()`;
`guardarTrm`: `on_conflict=cuenta_id,fecha`; `crearMovimiento` envía `tipo`
y `monto > 0`, y un 403 vuelve como `error.code === '42501'`;
`listarMovimientos` ordena `fecha.desc,created_at.desc`; `"1234.56"` →
`1234.56`.

### `lib/ahorros/trm.test.ts` (sin red, `fetch` inyectado)

Respuesta válida → `{ valor: 4123.45, fecha: '2026-09-15', fuente:
'datos.gov.co' }`; valor fuera de rango, array vacío, JSON inválido y
timeout → `{ error }` distinto en cada caso, nunca un número; con fila de
hoy en la base, `fetch` no se llama (contador = 0).

### Migración `0012`, contra producción

`information_schema` (4 tablas), `pg_policies` (4 `ALL`), `pg_indexes`,
`pg_trigger`; RLS positivo y negativo con `SET ROLE` y control en la misma
respuesta; `acciones` con `tasa_ea` → falla el `check`; dos valoraciones
mismo instrumento y día → `23505`. Todo con `rollback`.

### Visual

375px y 1280px: nav (5 + engranaje / 6 con texto); pantallas viejas
centradas a 1280px; vacío → alta; aporte USD con decimales; actualizar
valor; chip de TRM y actualización desde datos.gov.co (y el error forzando
Offline); CDT por vencer en `aviso`; reversión optimista forzando error.

### Cierre

Gate en verde → review por tarea + review final de rama (seguridad /
arquitectura / testing) → PR → merge → `ƒ /ahorros` en el build log del
deployment → prueba en prod.
