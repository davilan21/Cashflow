-- Cashflow: lectura automática de gastos desde Gmail (Bancolombia).

create table gmail_conexiones (
  user_id         uuid primary key references auth.users(id) on delete cascade,
  email_conectado text not null,
  refresh_token   text not null,
  estado          text not null default 'activo' check (estado in ('activo', 'expirado', 'error')),
  ultimo_sync_at  timestamptz,
  ultimo_error    text,
  created_at      timestamptz not null default now()
);

alter table gmail_conexiones enable row level security;
-- Sin políticas para authenticated/anon a propósito: la tabla queda
-- invisible al cliente por completo. Solo se toca con la service role
-- desde rutas de servidor (ver lib/supabase/admin.ts).

create table gastos_pendientes (
  id               uuid primary key default gen_random_uuid(),
  cuenta_id        uuid not null references cuentas(id) on delete cascade,
  creado_por       uuid not null references auth.users(id) on delete cascade,
  gmail_message_id text not null,
  fecha            date not null,
  monto            bigint not null check (monto > 0),
  categoria        text not null references categories(id),
  nota             text not null,
  estado           text not null default 'pendiente' check (estado in ('pendiente', 'confirmado', 'descartado')),
  created_at       timestamptz not null default now(),
  unique (creado_por, gmail_message_id)
);

create index gastos_pendientes_cuenta_idx on gastos_pendientes (cuenta_id, estado);

alter table gastos_pendientes enable row level security;

create policy "gastos_pendientes_select" on gastos_pendientes
  for select using (cuenta_id = mi_cuenta());

create policy "gastos_pendientes_update" on gastos_pendientes
  for update using (cuenta_id = mi_cuenta()) with check (cuenta_id = mi_cuenta());

-- Sin política de insert para authenticated: solo la escribe el proceso de
-- sync, vía service role (bypassa RLS por diseño de Supabase).

-- bloquear_confirmacion_directa(): RLS solo restringe qué filas puede tocar
-- un UPDATE, no qué valores puede escribir. Sin este trigger, un cliente
-- podría hacer `update gastos_pendientes set estado = 'confirmado'`
-- directamente y saltarse por completo confirmar_gasto_pendiente(), rompiendo
-- la garantía de que estado = 'confirmado' implica que existe una fila real
-- en expenses. El trigger bloquea cualquier transición hacia 'confirmado'
-- que no venga de la función RPC, la cual se identifica dejando una variable
-- de sesión local a la transacción justo antes de su propio UPDATE.
create or replace function bloquear_confirmacion_directa()
returns trigger
language plpgsql
as $$
begin
  if new.estado = 'confirmado' and old.estado <> 'confirmado'
     and nullif(current_setting('cashflow.confirmando_pendiente', true), '') is distinct from 'true' then
    raise exception 'No permitido: use confirmar_gasto_pendiente()';
  end if;
  return new;
end;
$$;

create trigger gastos_pendientes_bloquear_confirmacion
  before update on gastos_pendientes
  for each row execute function bloquear_confirmacion_directa();

-- confirmar_gasto_pendiente(): mueve un pendiente a expenses de forma
-- atómica y marca el pendiente como confirmado. SECURITY DEFINER porque
-- valida pertenencia con mi_cuenta() y hace dos escrituras relacionadas;
-- auth.uid() sigue siendo el del llamador (no cambia con SECURITY DEFINER),
-- así que created_by en expenses lo sigue fijando el trigger existente
-- set_created_by().
create or replace function confirmar_gasto_pendiente(
  p_id uuid, p_monto bigint, p_categoria text, p_nota text, p_fecha date
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_cuenta uuid;
  v_estado text;
  v_nuevo_id uuid;
begin
  -- "for update" bloquea la fila hasta el commit: evita que dos llamadas
  -- concurrentes con el mismo p_id lean ambas estado = 'pendiente' antes de
  -- que cualquiera confirme, lo que duplicaría el gasto en expenses.
  select cuenta_id, estado into v_cuenta, v_estado from gastos_pendientes where id = p_id for update;
  -- "is distinct from" es NULL-safe: si el llamador no tiene fila en
  -- cuenta_miembros, mi_cuenta() es NULL y "v_cuenta <> mi_cuenta()" daría
  -- NULL (que PL/pgSQL trata como false en un IF), dejando pasar la
  -- operación sin autorización real. Se valida explícitamente el NULL de
  -- mi_cuenta() y se usa "is distinct from" para la comparación.
  if v_cuenta is null or mi_cuenta() is null or v_cuenta is distinct from mi_cuenta() then
    raise exception 'No autorizado';
  end if;
  if v_estado <> 'pendiente' then
    raise exception 'Este pendiente ya fue procesado';
  end if;

  insert into expenses (cuenta_id, fecha, monto, categoria, nota)
    values (v_cuenta, p_fecha, p_monto, p_categoria, p_nota)
    returning id into v_nuevo_id;

  -- Variable de sesión local a la transacción (is_local = true): le indica
  -- al trigger bloquear_confirmacion_directa() que esta transición a
  -- 'confirmado' viene de la función RPC y debe permitirse. Se revierte
  -- sola al terminar la transacción, no requiere reset explícito.
  perform set_config('cashflow.confirmando_pendiente', 'true', true);
  update gastos_pendientes set estado = 'confirmado' where id = p_id;

  return v_nuevo_id;
end;
$$;
