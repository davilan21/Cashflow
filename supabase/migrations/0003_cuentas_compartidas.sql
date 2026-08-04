-- Cashflow: cuentas compartidas — co-propiedad simétrica entre miembros,
-- atribución (created_by) e invitación por código. Reemplaza el modelo
-- "un usuario dueño de sus filas" por "una cuenta (hogar) con N miembros".

-- 1. Tablas nuevas -----------------------------------------------------------

create table cuentas (
  id          uuid primary key default gen_random_uuid(),
  join_code   text unique,
  join_expira timestamptz,
  created_at  timestamptz not null default now()
);

create table cuenta_miembros (
  cuenta_id uuid not null references cuentas(id) on delete cascade,
  user_id   uuid not null references auth.users(id) on delete cascade,
  apodo     text,
  joined_at timestamptz not null default now(),
  primary key (cuenta_id, user_id)
);

-- Un usuario pertenece a UNA sola cuenta a la vez (scope de esta app).
create unique index cuenta_miembros_user_unico on cuenta_miembros (user_id);

-- mi_cuenta(): la cuenta del usuario actual. SECURITY DEFINER para que, al
-- consultarse dentro de las políticas RLS de cuenta_miembros, no dispare
-- recursión de políticas.
create or replace function mi_cuenta()
returns uuid
language sql
stable
security definer
set search_path = public
as $$
  select cuenta_id from cuenta_miembros where user_id = auth.uid() limit 1;
$$;

-- 2. Columnas nuevas en tablas existentes ------------------------------------

alter table expenses   add column cuenta_id uuid references cuentas(id) on delete cascade;
alter table expenses   add column created_by uuid references auth.users(id) on delete set null;
alter table settings   add column cuenta_id uuid references cuentas(id) on delete cascade;
alter table categories add column cuenta_id uuid references cuentas(id) on delete cascade;

-- 3. Backfill: una cuenta por cada usuario que hoy tiene settings ------------
--    (hoy 0 usuarios; el bloque lo maneja genéricamente por si hubiera datos)

do $$
declare
  r record;
  nueva uuid;
begin
  -- Unión de todos los usuarios con datos (no solo settings) para que ningún
  -- expense/category quede con cuenta_id NULL y falle el SET NOT NULL de abajo.
  for r in
    select user_id from settings
    union select user_id from expenses
    union select user_id from categories where user_id is not null
  loop
    insert into cuentas default values returning id into nueva;
    insert into cuenta_miembros (cuenta_id, user_id) values (nueva, r.user_id);
    update settings   set cuenta_id = nueva where user_id = r.user_id;
    update expenses   set cuenta_id = nueva, created_by = user_id where user_id = r.user_id;
    update categories set cuenta_id = nueva where user_id = r.user_id;
  end loop;
end $$;

-- 4. Quitar las políticas RLS viejas (referencian user_id) -------------------

drop policy if exists "expenses_select_own"   on expenses;
drop policy if exists "expenses_insert_own"   on expenses;
drop policy if exists "expenses_update_own"   on expenses;
drop policy if exists "expenses_delete_own"   on expenses;
drop policy if exists "settings_select_own"   on settings;
drop policy if exists "settings_insert_own"   on settings;
drop policy if exists "settings_update_own"   on settings;
drop policy if exists "categories_select"     on categories;
drop policy if exists "categories_insert_own" on categories;
drop policy if exists "categories_update_own" on categories;
drop policy if exists "categories_delete_own" on categories;

-- 5. Cambiar llaves/índices y eliminar user_id -------------------------------

-- settings: PK user_id -> PK cuenta_id
alter table settings drop constraint settings_pkey;
alter table settings alter column cuenta_id set not null;
alter table settings add primary key (cuenta_id);
alter table settings drop column user_id;

-- expenses: índices por cuenta y quitar user_id
drop index if exists expenses_user_fecha_idx;
drop index if exists expenses_user_ciclo_idx;
alter table expenses alter column cuenta_id set not null;
alter table expenses drop column user_id;
create index expenses_cuenta_fecha_idx on expenses (cuenta_id, fecha);
create index expenses_cuenta_ciclo_idx on expenses (cuenta_id, (ciclo_de(fecha)));

-- categories: quitar user_id (las por defecto quedan cuenta_id null)
alter table categories drop column user_id;

-- 6. Atribución: created_by = auth.uid() al insertar (no falsificable) --------

create or replace function set_created_by()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  new.created_by := auth.uid();
  return new;
end;
$$;

create trigger expenses_set_created_by
  before insert on expenses
  for each row execute function set_created_by();

-- 7. RLS con el nuevo modelo -------------------------------------------------

alter table cuentas         enable row level security;
alter table cuenta_miembros enable row level security;

-- expenses / settings: CRUD completo para miembros de la cuenta (simétrico)
create policy "expenses_rw" on expenses
  for all using (cuenta_id = mi_cuenta()) with check (cuenta_id = mi_cuenta());
create policy "settings_rw" on settings
  for all using (cuenta_id = mi_cuenta()) with check (cuenta_id = mi_cuenta());

-- categories: leer las por defecto (cuenta_id null) o las de tu cuenta;
-- crear/editar/borrar solo las de tu cuenta.
create policy "categories_select" on categories
  for select using (cuenta_id is null or cuenta_id = mi_cuenta());
create policy "categories_insert_own" on categories
  for insert with check (cuenta_id = mi_cuenta());
create policy "categories_update_own" on categories
  for update using (cuenta_id = mi_cuenta()) with check (cuenta_id = mi_cuenta());
create policy "categories_delete_own" on categories
  for delete using (cuenta_id = mi_cuenta());

-- cuentas: solo ves la tuya (para leer el código de invitación).
create policy "cuentas_select" on cuentas
  for select using (id = mi_cuenta());

-- cuenta_miembros: ves a los miembros de tu cuenta. NO hay política de UPDATE
-- directo: el apodo se cambia solo por la RPC set_apodo() (SECURITY DEFINER).
-- Una política UPDATE aquí sería peligrosa: Postgres no restringe columnas, así
-- que permitiría cambiarse el propio cuenta_id a otra cuenta, saltándose
-- unirse_a_cuenta() (código válido/vigente, un solo uso, guard-rail anti-fusión).
create policy "miembros_select" on cuenta_miembros
  for select using (cuenta_id = mi_cuenta());

-- 8. Funciones de membresía --------------------------------------------------

-- generar_codigo(): código corto sin caracteres ambiguos, único, caduca en 24h.
create or replace function generar_codigo()
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  alfabeto text := 'ABCDEFGHJKMNPQRSTUVWXYZ23456789'; -- sin I,O,0,1,L
  c text;
  i int;
  mi uuid;
begin
  mi := mi_cuenta();
  if mi is null then
    raise exception 'No perteneces a ninguna cuenta';
  end if;
  loop
    c := '';
    for i in 1..6 loop
      c := c || substr(alfabeto, 1 + floor(random() * length(alfabeto))::int, 1);
    end loop;
    exit when not exists (select 1 from cuentas where join_code = c);
  end loop;
  update cuentas set join_code = c, join_expira = now() + interval '24 hours' where id = mi;
  return c;
end;
$$;

-- unirse_a_cuenta(codigo): mueve al usuario a la cuenta del código si es válido.
create or replace function unirse_a_cuenta(codigo text)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  objetivo uuid;
  actual uuid;
  ngastos int;
begin
  select id into objetivo from cuentas
    where join_code = upper(trim(codigo)) and join_expira > now();
  if objetivo is null then
    raise exception 'Código inválido o vencido';
  end if;

  actual := mi_cuenta();
  if actual = objetivo then
    return objetivo; -- ya eres miembro
  end if;

  select count(*) into ngastos from expenses where cuenta_id = actual;
  if ngastos > 0 then
    raise exception 'Tu cuenta ya tiene gastos registrados; no puedo fusionarlas';
  end if;

  delete from cuenta_miembros where user_id = auth.uid();
  if actual is not null and not exists (select 1 from cuenta_miembros where cuenta_id = actual) then
    delete from cuentas where id = actual; -- cascada borra settings/categorías vacías
  end if;
  insert into cuenta_miembros (cuenta_id, user_id) values (objetivo, auth.uid());

  -- el código es de un solo uso
  update cuentas set join_code = null, join_expira = null where id = objetivo;
  return objetivo;
end;
$$;

-- set_apodo(nombre): fija el apodo del usuario para la atribución.
create or replace function set_apodo(nombre text)
returns void
language sql
security definer
set search_path = public
as $$
  update cuenta_miembros set apodo = nullif(trim(nombre), '') where user_id = auth.uid();
$$;

-- 9. handle_new_user: al registrarse, crea cuenta + membresía + settings ------

create or replace function handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  nueva uuid;
begin
  insert into cuentas default values returning id into nueva;
  insert into cuenta_miembros (cuenta_id, user_id) values (nueva, new.id);
  insert into settings (cuenta_id) values (nueva) on conflict do nothing;
  return new;
end;
$$;
