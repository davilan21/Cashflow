-- Cashflow: esquema inicial — categorías, settings, expenses, RLS.

create extension if not exists pgcrypto;

-- ciclo_de: misma regla que lib/ciclo.ts#cicloDe, para poder agrupar
-- gastos por ciclo directamente en SQL (índices, vistas, agregados).
create or replace function ciclo_de(fecha date)
returns text
language sql
immutable
as $$
  select case
    when extract(day from fecha) <= 15 then to_char(fecha, 'YYYY-MM')
    else to_char(fecha + interval '1 month', 'YYYY-MM')
  end;
$$;

create table categories (
  id      text primary key,
  nombre  text not null,
  color   text not null,
  orden   int not null,
  user_id uuid references auth.users(id) on delete cascade
);

create table settings (
  user_id       uuid primary key references auth.users(id) on delete cascade,
  tope_ciclo    bigint not null default 4000000,
  tope_quincena bigint not null default 2000000,
  dia_corte     int not null default 15,
  dia_pago      int not null default 30,
  updated_at    timestamptz not null default now()
);

create table expenses (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null references auth.users(id) on delete cascade,
  fecha      date not null,
  monto      bigint not null check (monto > 0),
  categoria  text not null references categories(id),
  nota       text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index expenses_user_fecha_idx on expenses (user_id, fecha);
create index expenses_user_ciclo_idx on expenses (user_id, (ciclo_de(fecha)));

create or replace function set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create trigger expenses_set_updated_at
  before update on expenses
  for each row execute function set_updated_at();

create trigger settings_set_updated_at
  before update on settings
  for each row execute function set_updated_at();

-- Row Level Security: cada usuario solo ve y escribe sus propias filas.
alter table expenses enable row level security;
alter table settings enable row level security;
alter table categories enable row level security;

create policy "expenses_select_own" on expenses
  for select using (auth.uid() = user_id);
create policy "expenses_insert_own" on expenses
  for insert with check (auth.uid() = user_id);
create policy "expenses_update_own" on expenses
  for update using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "expenses_delete_own" on expenses
  for delete using (auth.uid() = user_id);

create policy "settings_select_own" on settings
  for select using (auth.uid() = user_id);
create policy "settings_insert_own" on settings
  for insert with check (auth.uid() = user_id);
create policy "settings_update_own" on settings
  for update using (auth.uid() = user_id) with check (auth.uid() = user_id);

-- Categorías: las por defecto (user_id null) las ve todo el mundo;
-- las propias solo su dueño. No hay policy de insert/update/delete
-- sobre filas con user_id null: nadie puede tocar las categorías base.
create policy "categories_select" on categories
  for select using (user_id is null or auth.uid() = user_id);
create policy "categories_insert_own" on categories
  for insert with check (auth.uid() = user_id);
create policy "categories_update_own" on categories
  for update using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "categories_delete_own" on categories
  for delete using (auth.uid() = user_id);

-- Al crear una cuenta (magic link), le crea su fila de settings con los
-- topes por defecto para que la app nunca tenga que "adivinar" que no
-- existen todavía.
create or replace function handle_new_user()
returns trigger
language plpgsql
security definer set search_path = public
as $$
begin
  insert into public.settings (user_id) values (new.id)
  on conflict (user_id) do nothing;
  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function handle_new_user();
