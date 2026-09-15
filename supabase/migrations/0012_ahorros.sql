-- Cashflow: ahorros — instrumentos (CDT, acciones, fondos…), aportes/retiros,
-- valoraciones manuales y TRM. Módulo aislado: Plan se lee, nunca se escribe.
--
-- Invariante: esta migración no contiene ningún `alter table` sobre una
-- tabla existente. Solo `create`.

create table ahorro_instrumentos (
  id          uuid primary key default gen_random_uuid(),
  cuenta_id   uuid not null references cuentas(id) on delete cascade,
  nombre      text not null check (length(trim(nombre)) > 0),
  tipo        text not null check (tipo in ('cdt', 'acciones', 'fondo', 'cuenta', 'otro')),
  moneda      text not null check (moneda in ('COP', 'USD')),
  -- null = del hogar. El apodo sale de cuenta_miembros.
  titular     uuid references auth.users(id) on delete set null,
  entidad     text,
  -- % efectivo anual y vencimiento, solo para CDT (ver check de coherencia).
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
  -- El signo lo da el tipo: monto siempre positivo.
  tipo           text not null check (tipo in ('aporte', 'retiro')),
  monto          numeric(16,2) not null check (monto > 0),   -- en la moneda del instrumento
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
  valor          numeric(16,2) not null check (valor >= 0),  -- en la moneda del instrumento
  nota           text,
  created_by     uuid references auth.users(id) on delete set null,
  created_at     timestamptz not null default now(),
  -- Una valoración por instrumento y día: repetir el día es corregirla (upsert).
  unique (instrumento_id, fecha)
);

-- TRM por cuenta aunque el dato sea público: el override manual de una cuenta
-- no le cambia el total a otra, y la RLS es la misma de siempre.
create table ahorro_trm (
  cuenta_id  uuid not null references cuentas(id) on delete cascade,
  fecha      date not null,
  valor      numeric(12,4) not null check (valor > 0),
  fuente     text not null check (fuente in ('datos.gov.co', 'manual')),
  created_at timestamptz not null default now(),
  primary key (cuenta_id, fecha)
);

-- Triggers existentes, reutilizados (0001 y 0003).
create trigger ahorro_instrumentos_set_created_by
  before insert on ahorro_instrumentos for each row execute function set_created_by();
create trigger ahorro_instrumentos_set_updated_at
  before update on ahorro_instrumentos for each row execute function set_updated_at();
create trigger ahorro_movimientos_set_created_by
  before insert on ahorro_movimientos for each row execute function set_created_by();
create trigger ahorro_valoraciones_set_created_by
  before insert on ahorro_valoraciones for each row execute function set_created_by();

-- RLS: CRUD completo para miembros de la cuenta, como expenses_rw y plan_*_rw.
alter table ahorro_instrumentos enable row level security;
alter table ahorro_movimientos  enable row level security;
alter table ahorro_valoraciones enable row level security;
alter table ahorro_trm          enable row level security;

create policy "ahorro_instrumentos_rw" on ahorro_instrumentos
  for all using (cuenta_id = mi_cuenta()) with check (cuenta_id = mi_cuenta());
create policy "ahorro_movimientos_rw" on ahorro_movimientos
  for all using (cuenta_id = mi_cuenta()) with check (cuenta_id = mi_cuenta());
create policy "ahorro_valoraciones_rw" on ahorro_valoraciones
  for all using (cuenta_id = mi_cuenta()) with check (cuenta_id = mi_cuenta());
create policy "ahorro_trm_rw" on ahorro_trm
  for all using (cuenta_id = mi_cuenta()) with check (cuenta_id = mi_cuenta());
