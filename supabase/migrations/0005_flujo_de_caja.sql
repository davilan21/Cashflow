-- Cashflow: proyección de flujo de caja.
--
-- INVARIANTE DE ESTA MIGRACIÓN: no contiene un solo `alter table` sobre una
-- tabla existente. Solo `create table` (más sus índices, políticas y
-- triggers) sobre objetos nuevos. El módulo de tarjeta de crédito
-- —expenses, settings, categories, gastos_pendientes, gmail_conexiones y
-- sus funciones— queda intacto.
--
-- El único punto de contacto entre los dos mundos es de LECTURA: el motor
-- de proyección lee `expenses` para convertir el total de un ciclo en un
-- evento de caja el día del pago. Nunca escribe ahí.
--
-- Todas las tablas llevan prefijo `flujo_` para que el aislamiento sea
-- visible en el esquema. Se reusan, sin modificarlas, las funciones
-- mi_cuenta() (0003), set_updated_at() (0001) y set_created_by() (0003).

-- 1. Configuración -----------------------------------------------------------

create table flujo_config (
  cuenta_id               uuid primary key references cuentas(id) on delete cascade,
  -- Saldo mínimo que se quiere conservar. La curva marca cuándo se cruza.
  colchon                 bigint not null default 0 check (colchon >= 0),
  horizonte_dias          int not null default 90 check (horizonte_dias between 7 and 365),
  -- Cada cuántos días pedir un re-anclaje del saldo. La cobertura de correos
  -- es parcial (PSE no trae nómina ni compras con débito presencial), así que
  -- el saldo real se desvía y re-anclar es parte del uso normal.
  dias_recordatorio_saldo int not null default 15 check (dias_recordatorio_saldo > 0),
  updated_at              timestamptz not null default now()
);

-- 2. Instrumentos: de dónde sale y a dónde entra la plata ---------------------

create table flujo_instrumentos (
  id         uuid primary key default gen_random_uuid(),
  cuenta_id  uuid not null references cuentas(id) on delete cascade,
  nombre     text not null,
  banco      text not null check (banco in ('bancolombia', 'davibank', 'otro')),
  tipo       text not null check (tipo in ('ahorros', 'corriente', 'tc', 'efectivo')),
  -- Los cuatro dígitos que trae la alerta. La llave de ruteo es
  -- (banco, ultimos4), NO ultimos4 solo: un *1234 de Bancolombia y uno de
  -- Davibank son instrumentos distintos.
  ultimos4   text check (ultimos4 ~ '^[0-9]{4}$'),
  -- Cómo aparece este instrumento COMO DESTINO en un comprobante de otro
  -- banco. Un PSE identifica al beneficiario por nombre, no por dígitos, así
  -- que esta es la única forma de reconocer el pago de la tarjeta.
  alias_pago text[],
  -- El instrumento que se asume cuando el correo no dice de dónde salió.
  principal  bool not null default false,
  titular    uuid references auth.users(id) on delete set null,
  activo     bool not null default true,
  created_at timestamptz not null default now()
);

create index flujo_instrumentos_cuenta_idx on flujo_instrumentos (cuenta_id) where activo;
create unique index flujo_instrumentos_ruteo on flujo_instrumentos (cuenta_id, banco, ultimos4)
  where ultimos4 is not null;
-- Un solo instrumento principal por cuenta.
create unique index flujo_instrumentos_principal on flujo_instrumentos (cuenta_id) where principal;

-- 3. Anclas de saldo ---------------------------------------------------------

-- El saldo del banco a una fecha. Re-anclar es insertar una fila nueva, nunca
-- editar la anterior: así queda el historial de la deriva entre anclas, que
-- es lo que dice qué tan buenos son los supuestos de la proyección.
create table flujo_saldos (
  id             uuid primary key default gen_random_uuid(),
  cuenta_id      uuid not null references cuentas(id) on delete cascade,
  instrumento_id uuid references flujo_instrumentos(id) on delete cascade,
  fecha          date not null,
  -- Saldo al CIERRE de `fecha`: los movimientos con fecha > esta se suman.
  monto          bigint not null,
  origen         text not null default 'manual' check (origen in ('manual', 'correo')),
  created_by     uuid references auth.users(id) on delete set null,
  created_at     timestamptz not null default now()
);

create index flujo_saldos_cuenta_fecha_idx on flujo_saldos (cuenta_id, fecha desc);

-- 4. Reglas recurrentes ------------------------------------------------------

create table flujo_reglas (
  id             uuid primary key default gen_random_uuid(),
  cuenta_id      uuid not null references cuentas(id) on delete cascade,
  tipo           text not null check (tipo in ('ingreso', 'gasto_fijo', 'aporte_inversion')),
  nombre         text not null,
  monto          bigint not null check (monto > 0),
  -- 'estimado' se dibuja punteado en la curva y el valor real lo reemplaza.
  monto_tipo     text not null default 'fijo' check (monto_tipo in ('fijo', 'estimado')),
  frecuencia     text not null check (frecuencia in ('quincenal', 'mensual', 'bimestral', 'anual', 'unica')),
  dia_1          int not null check (dia_1 between 1 and 31),
  dia_2          int check (dia_2 between 1 and 31),
  mes            int check (mes between 1 and 12),
  -- Solo aplica a gasto_fijo. Un fijo con medio_pago = 'tc' NO genera evento
  -- de caja propio: alimenta el total esperado del ciclo y toca caja el día
  -- que se paga la tarjeta. Contarlo en su fecha sería doble conteo.
  medio_pago     text check (medio_pago in ('tc', 'debito', 'efectivo')),
  instrumento_id uuid references flujo_instrumentos(id) on delete set null,
  categoria      text references categories(id),
  desde          date not null,
  hasta          date,
  activa         bool not null default true,
  created_by     uuid references auth.users(id) on delete set null,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now(),

  constraint flujo_reglas_quincenal_dos_dias check (frecuencia <> 'quincenal' or dia_2 is not null),
  constraint flujo_reglas_anual_mes          check (frecuencia <> 'anual' or mes is not null),
  constraint flujo_reglas_fijo_medio         check (tipo <> 'gasto_fijo' or medio_pago is not null),
  constraint flujo_reglas_vigencia           check (hasta is null or hasta >= desde)
);

create index flujo_reglas_cuenta_idx on flujo_reglas (cuenta_id) where activa;

create trigger flujo_reglas_set_updated_at
  before update on flujo_reglas
  for each row execute function set_updated_at();

create trigger flujo_reglas_set_created_by
  before insert on flujo_reglas
  for each row execute function set_created_by();

-- 5. Emparejamiento lateral regla <-> gasto real de tarjeta ------------------

-- Un gasto fijo que va a la tarjeta (Netflix) se espera cada ciclo. Cuando el
-- cargo real ya está en `expenses`, esa expectativa queda CONSUMIDA y no se
-- vuelve a proyectar. Como `expenses` no se toca, el vínculo vive acá.
--
-- Sirve además para el run-rate: la proyección "a este ritmo" corre solo
-- sobre el gasto discrecional, o sea los `expenses` que NO están en esta
-- tabla. Sin eso, los fijos del ciclo se contarían dos veces.
create table flujo_reglas_expenses (
  regla_id   uuid not null references flujo_reglas(id) on delete cascade,
  expense_id uuid not null references expenses(id) on delete cascade,
  cuenta_id  uuid not null references cuentas(id) on delete cascade,
  ciclo      text not null,
  created_at timestamptz not null default now(),
  primary key (regla_id, expense_id)
);

-- Un gasto real no puede emparejarse con dos reglas.
create unique index flujo_reglas_expenses_expense on flujo_reglas_expenses (expense_id);
-- Una regla se consume una sola vez por ciclo.
create unique index flujo_reglas_expenses_ciclo on flujo_reglas_expenses (regla_id, ciclo);

-- 6. Deudas ------------------------------------------------------------------

-- Se configuran y se confirman a mano: no se detectan por correo. Lo
-- automático es la proyección de las cuotas futuras, que sale de la tabla
-- de amortización (lib/flujo/deuda.ts).
create table flujo_deudas (
  id             uuid primary key default gen_random_uuid(),
  cuenta_id      uuid not null references cuentas(id) on delete cascade,
  nombre         text not null,
  tipo           text not null default 'credito'
                 check (tipo in ('credito', 'libranza', 'hipoteca', 'vehiculo', 'otro')),
  saldo_actual   bigint not null check (saldo_actual >= 0),
  saldo_a_fecha  date not null,
  -- Efectiva mensual en decimal: 0.0175 = 1.75% EM. Cero es válido
  -- (créditos sin intereses); la amortización lo trata como caso aparte.
  tasa_mensual   numeric(8,6) not null default 0 check (tasa_mensual >= 0 and tasa_mensual < 1),
  -- Null = calcular por amortización francesa. Con valor, se usa esa cuota y
  -- se deriva el saldo mes a mes: hay créditos cuya cuota real no calza con
  -- la fórmula.
  cuota          bigint check (cuota is null or cuota > 0),
  n_cuotas       int not null check (n_cuotas > 0),
  cuotas_pagadas int not null default 0 check (cuotas_pagadas >= 0),
  dia_pago       int not null check (dia_pago between 1 and 31),
  medio_pago     text not null default 'debito' check (medio_pago in ('tc', 'debito', 'efectivo')),
  instrumento_id uuid references flujo_instrumentos(id) on delete set null,
  activa         bool not null default true,
  created_by     uuid references auth.users(id) on delete set null,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now(),

  constraint flujo_deudas_cuotas_coherentes check (cuotas_pagadas <= n_cuotas)
);

create index flujo_deudas_cuenta_idx on flujo_deudas (cuenta_id) where activa;

create trigger flujo_deudas_set_updated_at
  before update on flujo_deudas
  for each row execute function set_updated_at();

create trigger flujo_deudas_set_created_by
  before insert on flujo_deudas
  for each row execute function set_created_by();

-- 7. Libro de caja -----------------------------------------------------------

create table flujo_movimientos (
  id             uuid primary key default gen_random_uuid(),
  cuenta_id      uuid not null references cuentas(id) on delete cascade,
  fecha          date not null,
  -- CON SIGNO: positivo entra, negativo sale. Distinto de expenses.monto,
  -- que siempre es positivo porque allá todo es gasto.
  monto          bigint not null check (monto <> 0),
  tipo           text not null check (tipo in ('ingreso', 'gasto', 'pago_tc', 'cuota_deuda', 'aporte', 'transferencia', 'otro')),
  etiqueta       text not null,
  categoria      text references categories(id),
  origen         text not null default 'manual' check (origen in ('manual', 'correo')),
  instrumento_id uuid references flujo_instrumentos(id) on delete set null,
  -- Para tipo = 'pago_tc': qué ciclo se pagó ('2026-09'). El motor empareja
  -- el pago real con el proyectado POR ESTE CAMPO, nunca por fecha — un pago
  -- hecho el 2 del mes siguiente quedaría, si no, como un gasto nuevo además
  -- del proyectado del 30.
  ref_ciclo      text,
  -- Para cuotas y fijos confirmados: qué regla/deuda lo originó y de qué
  -- ocurrencia se trata (la fecha programada, en ISO). El motor lo usa para
  -- no volver a proyectar algo que ya se confirmó.
  ref_id         uuid,
  ref_periodo    text,
  created_by     uuid references auth.users(id) on delete set null,
  created_at     timestamptz not null default now(),

  constraint flujo_movimientos_signo check (
    (tipo = 'ingreso'                             and monto > 0) or
    (tipo in ('gasto', 'pago_tc', 'cuota_deuda', 'aporte') and monto < 0) or
    (tipo in ('transferencia', 'otro'))
  ),
  constraint flujo_movimientos_pago_tc_ciclo check (tipo <> 'pago_tc' or ref_ciclo is not null)
);

create index flujo_movimientos_cuenta_fecha_idx on flujo_movimientos (cuenta_id, fecha);
-- Un ciclo se paga una sola vez. Si hubo pago parcial y luego otro abono, el
-- segundo va como 'otro' y se explica en la etiqueta: el motor solo reemplaza
-- el evento proyectado con UN movimiento por ciclo.
create unique index flujo_movimientos_pago_tc_unico on flujo_movimientos (cuenta_id, ref_ciclo)
  where tipo = 'pago_tc';
-- Una ocurrencia de una regla o deuda se confirma una sola vez.
create unique index flujo_movimientos_ref_unico on flujo_movimientos (cuenta_id, ref_id, ref_periodo)
  where ref_id is not null and ref_periodo is not null;

create trigger flujo_movimientos_set_created_by
  before insert on flujo_movimientos
  for each row execute function set_created_by();

-- 8. Conexión del segundo buzón (comprobantes de PSE) ------------------------

-- Tabla propia: `gmail_conexiones` no se toca. Mismas garantías que aquella:
-- sin políticas para authenticated, invisible al cliente, el refresh token
-- solo se lee y escribe con service role desde rutas de servidor.
--
-- A diferencia de gmail_conexiones (PK user_id, una conexión por usuario),
-- acá la PK es propia: un usuario puede tener varios buzones.
create table flujo_conexiones (
  id              uuid primary key default gen_random_uuid(),
  user_id         uuid not null references auth.users(id) on delete cascade,
  email_conectado text not null,
  refresh_token   text not null,
  estado          text not null default 'activo' check (estado in ('activo', 'expirado', 'error')),
  ultimo_sync_at  timestamptz,
  ultimo_error    text,
  created_at      timestamptz not null default now(),
  unique (user_id, email_conectado)
);

alter table flujo_conexiones enable row level security;

-- 9. Bandeja de revisión -----------------------------------------------------

create table flujo_pendientes (
  id                    uuid primary key default gen_random_uuid(),
  cuenta_id             uuid not null references cuentas(id) on delete cascade,
  creado_por            uuid not null references auth.users(id) on delete cascade,
  -- Null cuando el movimiento se agrega a mano (fase 5, antes de que exista
  -- el sync de correos).
  conexion_id           uuid references flujo_conexiones(id) on delete cascade,
  mensaje_id            text,
  clase                 text not null default 'sin_clasificar'
                        check (clase in ('gasto', 'ingreso', 'pago_tc', 'transferencia', 'interna', 'sin_clasificar')),
  fecha                 date not null,
  monto                 bigint not null check (monto > 0),
  etiqueta              text not null,
  categoria             text references categories(id),
  instrumento_id        uuid references flujo_instrumentos(id) on delete set null,
  ref_ciclo             text,
  posible_duplicado_de  uuid references flujo_pendientes(id) on delete set null,
  estado                text not null default 'pendiente'
                        check (estado in ('pendiente', 'confirmado', 'descartado')),
  created_at            timestamptz not null default now()
);

-- La llave es (conexion_id, mensaje_id), NO (creado_por, mensaje_id): los ids
-- de mensaje de Gmail solo son únicos DENTRO de un buzón, y como los dos
-- buzones pueden ser del mismo usuario, esa llave descartaría en silencio un
-- movimiento real ante una colisión.
create unique index flujo_pendientes_mensaje_unico on flujo_pendientes (conexion_id, mensaje_id)
  where conexion_id is not null and mensaje_id is not null;

create index flujo_pendientes_cuenta_idx on flujo_pendientes (cuenta_id, estado);

-- 10. RLS --------------------------------------------------------------------

alter table flujo_config           enable row level security;
alter table flujo_instrumentos     enable row level security;
alter table flujo_saldos           enable row level security;
alter table flujo_reglas           enable row level security;
alter table flujo_reglas_expenses  enable row level security;
alter table flujo_deudas           enable row level security;
alter table flujo_movimientos      enable row level security;
alter table flujo_pendientes       enable row level security;

create policy "flujo_config_rw" on flujo_config
  for all using (cuenta_id = mi_cuenta()) with check (cuenta_id = mi_cuenta());
create policy "flujo_instrumentos_rw" on flujo_instrumentos
  for all using (cuenta_id = mi_cuenta()) with check (cuenta_id = mi_cuenta());
create policy "flujo_saldos_rw" on flujo_saldos
  for all using (cuenta_id = mi_cuenta()) with check (cuenta_id = mi_cuenta());
create policy "flujo_reglas_rw" on flujo_reglas
  for all using (cuenta_id = mi_cuenta()) with check (cuenta_id = mi_cuenta());
create policy "flujo_reglas_expenses_rw" on flujo_reglas_expenses
  for all using (cuenta_id = mi_cuenta()) with check (cuenta_id = mi_cuenta());
create policy "flujo_deudas_rw" on flujo_deudas
  for all using (cuenta_id = mi_cuenta()) with check (cuenta_id = mi_cuenta());
create policy "flujo_movimientos_rw" on flujo_movimientos
  for all using (cuenta_id = mi_cuenta()) with check (cuenta_id = mi_cuenta());

-- Pendientes: se leen y se editan (corregir clase, categoría, instrumento
-- antes de confirmar) y se pueden crear a mano. Lo que NO se puede es marcar
-- uno como 'confirmado' por UPDATE directo — ver el trigger de abajo.
create policy "flujo_pendientes_rw" on flujo_pendientes
  for all using (cuenta_id = mi_cuenta()) with check (cuenta_id = mi_cuenta());

-- 11. Confirmación ------------------------------------------------------------

-- Mismo patrón que bloquear_confirmacion_directa() en 0004: RLS restringe qué
-- filas se pueden tocar, no qué valores se pueden escribir. Sin este trigger
-- un cliente podría hacer `update flujo_pendientes set estado = 'confirmado'`
-- y saltarse la función, rompiendo la garantía de que un pendiente confirmado
-- tiene una fila real en flujo_movimientos.
create or replace function bloquear_confirmacion_flujo()
returns trigger
language plpgsql
as $$
begin
  if new.estado = 'confirmado' and old.estado <> 'confirmado'
     and nullif(current_setting('cashflow.confirmando_flujo', true), '') is distinct from 'true' then
    raise exception 'No permitido: use confirmar_flujo_pendiente()';
  end if;
  return new;
end;
$$;

create trigger flujo_pendientes_bloquear_confirmacion
  before update on flujo_pendientes
  for each row execute function bloquear_confirmacion_flujo();

-- confirmar_flujo_pendiente(): mueve un pendiente al libro de caja de forma
-- atómica y lo marca confirmado. El signo lo pone la función a partir de la
-- clase: quien llama manda siempre una magnitud positiva, igual que en el
-- módulo de gastos, y así no hay forma de guardar un ingreso negativo.
--
-- NUNCA escribe en `expenses`. Ese sigue siendo el libro exclusivo de la
-- tarjeta de crédito.
create or replace function confirmar_flujo_pendiente(
  p_id             uuid,
  p_clase          text,
  p_monto          bigint,
  p_fecha          date,
  p_etiqueta       text,
  p_categoria      text default null,
  p_instrumento_id uuid default null,
  p_ref_ciclo      text default null
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_cuenta     uuid;
  v_estado     text;
  v_creado_por uuid;
  v_tipo       text;
  v_monto      bigint;
  v_nuevo_id   uuid;
begin
  if p_monto <= 0 then
    raise exception 'El monto debe ser positivo: el signo lo define la clase';
  end if;

  -- "for update" bloquea la fila hasta el commit: sin esto, dos llamadas
  -- concurrentes con el mismo p_id leerían ambas estado = 'pendiente' antes
  -- de que cualquiera confirme, y el movimiento quedaría duplicado.
  select cuenta_id, estado, creado_por
    into v_cuenta, v_estado, v_creado_por
    from flujo_pendientes where id = p_id for update;

  -- "is distinct from" es NULL-safe: si el llamador no tiene fila en
  -- cuenta_miembros, mi_cuenta() es NULL y "v_cuenta <> mi_cuenta()" daría
  -- NULL, que PL/pgSQL trata como false en un IF y dejaría pasar la
  -- operación sin autorización real.
  if v_cuenta is null or mi_cuenta() is null or v_cuenta is distinct from mi_cuenta() then
    raise exception 'No autorizado';
  end if;
  if v_estado <> 'pendiente' then
    raise exception 'Este pendiente ya fue procesado';
  end if;

  if p_clase = 'sin_clasificar' then
    raise exception 'Clasifica el movimiento antes de confirmarlo';
  end if;

  -- 'interna' es una transferencia entre cuentas propias: no es ingreso ni
  -- gasto y no mueve la caja consolidada. Se marca confirmada y no genera
  -- movimiento — contarla inflaría el gasto y desinflaría el saldo a la vez.
  if p_clase <> 'interna' then
    v_tipo := case p_clase
      when 'gasto'         then 'gasto'
      when 'ingreso'       then 'ingreso'
      when 'pago_tc'       then 'pago_tc'
      when 'transferencia' then 'transferencia'
      else null
    end;
    if v_tipo is null then
      raise exception 'Clase desconocida: %', p_clase;
    end if;
    if v_tipo = 'pago_tc' and p_ref_ciclo is null then
      raise exception 'Un pago de tarjeta necesita saber qué ciclo paga';
    end if;

    v_monto := case when v_tipo = 'ingreso' then p_monto else -p_monto end;

    insert into flujo_movimientos
      (cuenta_id, fecha, monto, tipo, etiqueta, categoria, origen, instrumento_id, ref_ciclo)
      values (v_cuenta, p_fecha, v_monto, v_tipo, p_etiqueta, p_categoria, 'correo', p_instrumento_id, p_ref_ciclo)
      returning id into v_nuevo_id;

    -- El trigger set_created_by fija created_by = auth.uid() (quien confirma);
    -- se corrige para atribuirlo a quien conectó el buzón de donde salió el
    -- movimiento, igual que hace confirmar_gasto_pendiente() en 0004.
    update flujo_movimientos set created_by = v_creado_por where id = v_nuevo_id;
  end if;

  -- Variable de sesión local a la transacción: le indica al trigger que esta
  -- transición viene de la función. Se revierte sola al terminar.
  perform set_config('cashflow.confirmando_flujo', 'true', true);
  update flujo_pendientes
    set estado = 'confirmado', clase = p_clase, monto = p_monto, fecha = p_fecha,
        etiqueta = p_etiqueta, categoria = p_categoria,
        instrumento_id = p_instrumento_id, ref_ciclo = p_ref_ciclo
    where id = p_id;

  return v_nuevo_id;
end;
$$;
