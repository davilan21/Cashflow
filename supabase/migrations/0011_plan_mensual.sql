-- Cashflow: plan mensual — ingresos y gastos fijos recurrentes, ajustes por
-- mes y el estimado de tarjeta editable. Módulo aislado: solo LEE expenses.
--
-- Invariante: esta migración no contiene ningún `alter table` sobre una
-- tabla existente. Solo `create`.

create table plan_rubros (
  id            uuid primary key default gen_random_uuid(),
  cuenta_id     uuid not null references cuentas(id) on delete cascade,
  tipo          text not null check (tipo in ('ingreso', 'fijo')),
  nombre        text not null check (length(trim(nombre)) > 0),
  -- >= 0 (no > 0 como expenses): un rubro puede quedar en cero sin borrarse.
  monto_default bigint not null check (monto_default >= 0),
  -- Vigencia como 'YYYY-MM' (mismo formato que lib/ciclo.ts). Se compara
  -- como texto; el check impide un '2026-9'.
  desde         text not null check (desde ~ '^\d{4}-(0[1-9]|1[0-2])$'),
  hasta         text check (hasta is null or (hasta ~ '^\d{4}-(0[1-9]|1[0-2])$' and hasta >= desde)),
  orden         int not null default 0,
  created_by    uuid references auth.users(id) on delete set null,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);

create index plan_rubros_cuenta_idx on plan_rubros (cuenta_id, tipo, orden);

create table plan_ajustes (
  id         uuid primary key default gen_random_uuid(),
  cuenta_id  uuid not null references cuentas(id) on delete cascade,
  mes        text not null check (mes ~ '^\d{4}-(0[1-9]|1[0-2])$'),
  -- null = el estimado de tarjeta de ese mes.
  rubro_id   uuid references plan_rubros(id) on delete cascade,
  monto      bigint not null check (monto >= 0),
  updated_at timestamptz not null default now(),
  -- Sin `nulls not distinct` Postgres permitiría N filas de TC (rubro_id
  -- null) para el mismo mes. Requiere PG >= 15.
  unique nulls not distinct (cuenta_id, mes, rubro_id)
);

-- Triggers existentes, reutilizados (definidos en 0001 y 0003).
create trigger plan_rubros_set_created_by
  before insert on plan_rubros
  for each row execute function set_created_by();

create trigger plan_rubros_set_updated_at
  before update on plan_rubros
  for each row execute function set_updated_at();

create trigger plan_ajustes_set_updated_at
  before update on plan_ajustes
  for each row execute function set_updated_at();

-- RLS: CRUD completo para miembros de la cuenta, igual que expenses_rw.
alter table plan_rubros  enable row level security;
alter table plan_ajustes enable row level security;

create policy "plan_rubros_rw" on plan_rubros
  for all using (cuenta_id = mi_cuenta()) with check (cuenta_id = mi_cuenta());

create policy "plan_ajustes_rw" on plan_ajustes
  for all using (cuenta_id = mi_cuenta()) with check (cuenta_id = mi_cuenta());
