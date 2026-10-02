# Pagos de fijos — design

Fecha: 2026-10-02 · Estado: aprobado en conversación, pendiente de revisión escrita.

## Qué resuelve

Control del día a día de las **cuentas fijas del mes** (arriendo, servicios,
celular…): qué ya se pagó, qué falta y qué está vencido. Marcar un fijo como
pagado guarda el **monto real**, y el Plan de ese mes pasa a usarlo en vez del
estimado.

## Decisiones

| Tema | Decisión | Por qué |
|---|---|---|
| Qué se marca | Los rubros `tipo = 'fijo'` de `plan_rubros` | Una sola lista: no hay doble digitación ni dos listas que no cuadran. |
| Al pagar | Monto real + fecha; el Plan usa ese monto | El ahorro del mes se vuelve exacto a medida que se paga. |
| Dónde se guarda | Tabla nueva `plan_pagos` (no columnas en `plan_ajustes`, no `expenses`) | Separa el hecho (pago) del estimado (ajuste): desmarcar devuelve el ajuste previo intacto. `expenses` es "compras con TC" para toda la app (ciclos, topes, factura). |
| Medio de pago | Todos los fijos salen de la cuenta bancaria, ninguno de la TC | Confirmado por David. Si un fijo pasa a la TC, se saca de Fijos; si no, se cuenta dos veces en el Plan. |
| Ubicación | Pestaña propia `/pagos` con contador | Es control diario: a un toque. Costo aceptado: 6 pestañas en móvil. |
| Fuera de v1 | Pagos parciales, notificaciones push/correo, comprobantes adjuntos, fijos pagados con TC | YAGNI. |

## 1. Datos — migración `0013_pagos_fijos.sql`

Número verificado el 2026-10-02: libre en todas las ramas remotas y sin
`plan_pagos` en producción. Producción no tiene ledger de migraciones; antes de
aplicar, volver a mirar `pg_tables` / `information_schema.columns`, y después
verificar el **efecto** (columnas, constraints, políticas), no el mensaje de éxito.

### `plan_rubros.dia_pago`

```sql
alter table plan_rubros add column dia_pago int
  check (dia_pago between 1 and 31);
alter table plan_rubros add constraint plan_rubros_dia_pago_solo_fijos
  check (dia_pago is null or tipo = 'fijo');
```

Opcional (`null` = sin día). Un día que el mes no tiene vence el último día del
mes (31 en noviembre → 30; 30 en febrero → 28/29).

### `plan_pagos`

```sql
create table plan_pagos (
  id         uuid primary key default gen_random_uuid(),
  cuenta_id  uuid not null references cuentas(id) on delete cascade,
  rubro_id   uuid not null,
  mes        text not null check (mes ~ '^\d{4}-(0[1-9]|1[0-2])$'),
  monto      bigint not null check (monto >= 0),
  pagado_el  date not null default current_date,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (cuenta_id, rubro_id, mes),
  foreign key (rubro_id, cuenta_id) references plan_rubros (id, cuenta_id) on delete cascade
);
```

- `mes` es el mes **al que corresponde** el pago, no el de `pagado_el`: el
  arriendo de noviembre pagado el 30-oct es `mes = '2026-11'`.
- `current_date` del servidor está en UTC: el cliente **siempre** manda
  `pagado_el` con `hoyISO()` (Bogotá); el default es solo red de seguridad.
- Un pago por fijo y mes. Desmarcar = borrar la fila.
- La FK compuesta requiere `unique (id, cuenta_id)` en `plan_rubros`. Cierra el
  hueco que RLS no cubre: la política valida `cuenta_id` de la fila escrita,
  pero no que el rubro apuntado sea de la misma cuenta (las FK se evalúan
  después de RLS y sin ella).
- Trigger `plan_pagos_solo_fijos` (before insert/update): rechaza si el rubro
  no es `tipo = 'fijo'`.
- Triggers existentes reutilizados: `set_created_by`, `set_updated_at`.
- Índice por `rubro_id` para el cascade.

### RLS

```sql
alter table plan_pagos enable row level security;
create policy "plan_pagos_rw" on plan_pagos
  for all using (cuenta_id = mi_cuenta()) with check (cuenta_id = mi_cuenta());
```

### Prueba de seguridad (contra la base, con `SET ROLE authenticated`)

Como `postgres` no prueba nada (se salta RLS). Fuera de un bloque que capture
excepciones (`SET LOCAL ROLE` dentro de él se revierte). Con un control positivo
y negativos:

1. Pago sobre un fijo propio → **pasa**.
2. Pago con `cuenta_id` propio sobre un fijo de otra cuenta → **falla** (FK compuesta).
3. Pago sobre un `ingreso` propio → **falla** (trigger).
4. Leer pagos de otra cuenta → **0 filas**, habiendo comprobado antes como
   superusuario que esa cuenta sí tiene pagos (si no, el 0 no prueba nada).

Todo dentro de una transacción con `rollback`.

## 2. Cálculo — funciones puras

### Plan (`lib/plan/calculo.ts`)

`lineasDe` recibe `pagos` y resuelve el monto en orden **pago → ajuste →
default**. `LineaPlan` gana:

- `pagado: { monto: number; pagadoEl: string } | null`
- `estimado: number` — ajuste o default, lo que habría sin el pago.

`ajustado` sigue significando "hay ajuste". Ahorro, acumulado y gráfica no
cambian: consumen `monto`.

### Pagos (`lib/pagos/estado.ts`)

```ts
type EstadoPago = "pagado" | "vencido" | "vence_pronto" | "pendiente" | "sin_dia";

interface ItemPago {
  rubroId: string; nombre: string; mes: string;
  vence: string | null;      // 'YYYY-MM-DD' o null sin dia_pago
  montoSugerido: number;     // estimado del Plan para ese mes
  pago: { monto: number; pagadoEl: string } | null;
  estado: EstadoPago;
}
```

- `fechaVencimiento(mes, diaPago)` → `min(diaPago, diasEnMes(mes))`.
- Estado sin pago: `hoy > vence` → `vencido`; `vence − hoy` entre 0 y 3 días
  → `vence_pronto` (el mismo día dice "vence hoy", no vencido); más adelante →
  `pendiente`; sin `dia_pago` → `sin_dia` (nunca vencido).
- Solo fijos vigentes en el mes (`rubroAplica`).
- `itemsPagos(rubros, ajustes, pagos, hoy)` devuelve el **mes actual completo**
  más los **no pagados del mes anterior**. Nada más atrás: si no, el primer día
  aparecerían vencidos todos los meses previos a que existiera el módulo.
- `contadorPagos(items)` = vencidos + vence_pronto (incluye mes anterior).

### Tests mínimos

Prioridad pago > ajuste > default; desmarcar devuelve el estimado; día 31 en
noviembre vence el 30 y en febrero el 28/29; borde de vence_pronto (hoy y +3
cuentan, +4 no); el día del vencimiento no es vencido; un vencido del mes
anterior aparece y uno de hace dos meses no; un pagado del mes anterior no
aparece; fijo fuera de vigencia no aparece; sin día nunca vencido; contador.

## 3. Pantalla

### `/pagos` (entre Pendientes e Historial)

- **Resumen**: "Octubre · pagado $3,2M de $4,1M · faltan 3" + barra de progreso.
  El total es la suma de `montoSugerido` (o del pago si existe) del mes actual.
- **Lista por grupos**, en orden: Vencidos (con el mes cuando es del anterior) →
  Vencen pronto → Pendientes → Sin día → Pagados (plegado).
- **Fila**: nombre, texto de estado ("venció hace 2 días", "vence hoy",
  "vence el 20", "pagado el 8 oct"), monto, botón check circular de 44px.

### Interacción

- **Check** → pagado al instante con `montoSugerido` y `pagado_el = hoy`
  (optimista). Toast "Luz pagada · Deshacer" ~5s; Deshacer borra el pago.
  `Toast`/`useToast` hoy no tienen acción: se extienden con una acción opcional
  sin romper a los consumidores actuales.
- **Fila** → hoja (patrón `AjusteSheet`): monto, fecha, referencia
  "Estimado: $X", botones Guardar y Desmarcar.
- **Errores**: optimista con reversión de esa fila y toast. Cola por clave
  `(rubro, mes)` + número de generación, igual que `PlanClient`, para que dos
  toques seguidos no lleguen desordenados ni se pisen. Ningún `catch` vacío.

### Cambios en lo existente

- `RubroSheet`: campo "Día de pago (opcional)" solo para fijos.
- `DetalleMes`: fijo pagado muestra ✓ y monto real; si difiere del estimado,
  el estimado tachado/gris al lado.
- `NavTabs`: pestaña "Pagos" con contador (calculado en `app/(app)/layout.tsx`
  como el de Pendientes). Verificar que 6 pestañas quepan a 375px; si no,
  acortar etiquetas.
- `app/(app)/plan/page.tsx`: también lee `plan_pagos` y se los pasa al cálculo.

### Estados vacíos

- Sin fijos → "Agregá tus gastos fijos en Plan" con enlace a Plan → Rubros.
- Fijos sin día → aviso: "N fijos sin día de pago: agregalo para ver cuándo vencen".

## Verificación antes de declarar terminado

1. `vitest`, `tsc --noEmit`, `eslint` en verde.
2. Migración aplicada y efecto comprobado en `information_schema` / `pg_policies`.
3. Prueba de RLS de la sección 1 con sus cuatro casos.
4. En el navegador integrado contra local (requiere que David inicie sesión):
   marcar, deshacer, editar monto, desmarcar, Plan refleja el monto real,
   contador de la pestaña, ancho 375px.
5. Deploy: migración **antes** del merge (primero lo que amplía capacidad,
   después lo que la consume).
