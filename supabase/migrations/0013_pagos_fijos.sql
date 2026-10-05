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
set search_path = public, pg_temp
as $$
begin
  if not exists (select 1 from public.plan_rubros where id = new.rubro_id and tipo = 'fijo') then
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

-- created_by lo fija el insert; un update no puede reasignarlo a otro usuario.
-- Pasar a null sí se deja: es lo que hace el `on delete set null` de la FK
-- (un UPDATE que dispara este trigger) al borrar el usuario de auth.users.
create or replace function plan_pagos_conservar_created_by()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $$
begin
  if new.created_by is not null then
    new.created_by := old.created_by;
  end if;
  return new;
end;
$$;

create trigger plan_pagos_conservar_created_by
  before update on plan_pagos
  for each row execute function plan_pagos_conservar_created_by();

create trigger plan_pagos_set_updated_at
  before update on plan_pagos
  for each row execute function set_updated_at();

-- 5. RLS: CRUD para miembros de la cuenta, igual que plan_ajustes.
alter table plan_pagos enable row level security;

create policy "plan_pagos_rw" on plan_pagos
  for all using (cuenta_id = mi_cuenta()) with check (cuenta_id = mi_cuenta());

-- 6. Grants explícitos: el default nuevo de Supabase ya no expone tablas nuevas
-- (authenticated recibiría 42501) y el viejo le daba a anon todo, TRUNCATE incluido.
revoke all on table plan_pagos from anon, authenticated;
grant select, insert, update, delete on table plan_pagos to authenticated;
