-- ============================================================
--  Esquema de base de datos para la app de Gift Cards
--  Ejecutar en Supabase: SQL Editor -> New query -> pegar -> Run
-- ============================================================

-- ---------- Perfiles de usuario (rol) ----------
-- Cada usuario de Supabase Auth tiene un perfil con su rol.
create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  email text,
  nombre text,
  role text not null default 'cajero' check (role in ('admin', 'cajero')),
  created_at timestamptz not null default now()
);

-- ---------- Empresas ----------
create table if not exists public.empresas (
  id uuid primary key default gen_random_uuid(),
  nombre text not null,
  cuit text,
  contacto text,
  comercio text,        -- comercio donde se usa la gift card
  logo_url text,        -- URL pública del logo (Supabase Storage)
  activo boolean not null default true,
  created_at timestamptz not null default now()
);

-- ---------- Clientes ----------
create table if not exists public.clientes (
  id uuid primary key default gen_random_uuid(),
  nombre text not null,
  dni text not null unique,
  email text,
  created_at timestamptz not null default now()
);

-- ---------- Gift Cards ----------
create table if not exists public.giftcards (
  id uuid primary key default gen_random_uuid(),
  codigo text not null unique check (char_length(codigo) = 8 and codigo ~ '^[A-Z0-9]{8}$'),
  empresa_id uuid not null references public.empresas(id) on delete restrict,
  cliente_id uuid references public.clientes(id) on delete set null,
  monto_max numeric(12,2) not null check (monto_max > 0),
  saldo numeric(12,2) not null check (saldo >= 0),
  estado text not null default 'activa' check (estado in ('activa', 'agotada', 'anulada')),
  fecha_vencimiento date,            -- null = sin vencimiento
  created_at timestamptz not null default now()
);

-- ---------- Transacciones (usos) ----------
create table if not exists public.transacciones (
  id uuid primary key default gen_random_uuid(),
  giftcard_id uuid not null references public.giftcards(id) on delete cascade,
  monto numeric(12,2) not null check (monto > 0),
  saldo_resultante numeric(12,2) not null,
  cajero_id uuid references auth.users(id),
  cajero_email text,
  created_at timestamptz not null default now()
);

-- ============================================================
--  Trigger: crear perfil automáticamente al registrarse
-- ============================================================
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer set search_path = public
as $$
begin
  insert into public.profiles (id, email, role)
  values (new.id, new.email, coalesce(new.raw_user_meta_data->>'role', 'cajero'))
  on conflict (id) do nothing;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute procedure public.handle_new_user();

-- ============================================================
--  Función RPC: registrar un uso de Gift Card de forma atómica
--  Valida saldo, descuenta, registra transacción y marca agotada.
-- ============================================================
create or replace function public.usar_giftcard(p_codigo text, p_monto numeric)
returns json
language plpgsql
security definer set search_path = public
as $$
declare
  v_card public.giftcards%rowtype;
  v_nuevo_saldo numeric(12,2);
  v_tx public.transacciones%rowtype;
begin
  -- Bloquea la fila para evitar usos concurrentes
  select * into v_card from public.giftcards
    where codigo = upper(p_codigo) for update;

  if not found then
    raise exception 'Gift Card no encontrada';
  end if;

  if v_card.estado <> 'activa' then
    raise exception 'La Gift Card no está activa (estado: %)', v_card.estado;
  end if;

  if v_card.cliente_id is null then
    raise exception 'La Gift Card no tiene un cliente asignado';
  end if;

  if v_card.fecha_vencimiento is not null and v_card.fecha_vencimiento < current_date then
    raise exception 'La Gift Card está vencida (venció el %)', v_card.fecha_vencimiento;
  end if;

  if p_monto <= 0 then
    raise exception 'El monto debe ser mayor a cero';
  end if;

  if p_monto > v_card.saldo then
    raise exception 'El monto supera el saldo disponible (% )', v_card.saldo;
  end if;

  v_nuevo_saldo := v_card.saldo - p_monto;

  update public.giftcards
    set saldo = v_nuevo_saldo,
        estado = case when v_nuevo_saldo = 0 then 'agotada' else 'activa' end
    where id = v_card.id;

  insert into public.transacciones (giftcard_id, monto, saldo_resultante, cajero_id, cajero_email)
  values (v_card.id, p_monto, v_nuevo_saldo, auth.uid(),
          (select email from public.profiles where id = auth.uid()))
  returning * into v_tx;

  return json_build_object(
    'transaccion_id', v_tx.id,
    'codigo', v_card.codigo,
    'monto_usado', p_monto,
    'saldo_resultante', v_nuevo_saldo,
    'estado', case when v_nuevo_saldo = 0 then 'agotada' else 'activa' end
  );
end;
$$;

-- ============================================================
--  Trigger: una vez asignado el cliente, no se puede cambiar
-- ============================================================
create or replace function public.bloquear_cambio_cliente()
returns trigger
language plpgsql
as $$
begin
  if old.cliente_id is not null and new.cliente_id is distinct from old.cliente_id then
    raise exception 'El cliente de la Gift Card ya fue asignado y no se puede cambiar';
  end if;
  return new;
end;
$$;

drop trigger if exists trg_bloquear_cambio_cliente on public.giftcards;
create trigger trg_bloquear_cambio_cliente
  before update of cliente_id on public.giftcards
  for each row execute procedure public.bloquear_cambio_cliente();

-- ============================================================
--  Trigger: solo se puede eliminar una Gift Card sin uso
--  (las no asignadas nunca tienen uso, así que quedan habilitadas)
-- ============================================================
create or replace function public.prevenir_borrado_giftcard()
returns trigger
language plpgsql
as $$
begin
  if exists (select 1 from public.transacciones where giftcard_id = old.id) then
    raise exception 'No se puede eliminar una Gift Card que tiene usos registrados';
  end if;
  return old;
end;
$$;

drop trigger if exists trg_prevenir_borrado_giftcard on public.giftcards;
create trigger trg_prevenir_borrado_giftcard
  before delete on public.giftcards
  for each row execute procedure public.prevenir_borrado_giftcard();

-- ============================================================
--  Trigger: no se puede eliminar una empresa con gift cards
-- ============================================================
create or replace function public.prevenir_borrado_empresa()
returns trigger
language plpgsql
as $$
begin
  if exists (select 1 from public.giftcards where empresa_id = old.id) then
    raise exception 'No se puede eliminar una empresa que tiene gift cards asignadas';
  end if;
  return old;
end;
$$;

drop trigger if exists trg_prevenir_borrado_empresa on public.empresas;
create trigger trg_prevenir_borrado_empresa
  before delete on public.empresas
  for each row execute procedure public.prevenir_borrado_empresa();

-- ============================================================
--  Trigger: no se puede eliminar un cliente con gift cards
-- ============================================================
create or replace function public.prevenir_borrado_cliente()
returns trigger
language plpgsql
as $$
begin
  if exists (select 1 from public.giftcards where cliente_id = old.id) then
    raise exception 'No se puede eliminar un cliente que tiene gift cards asignadas';
  end if;
  return old;
end;
$$;

drop trigger if exists trg_prevenir_borrado_cliente on public.clientes;
create trigger trg_prevenir_borrado_cliente
  before delete on public.clientes
  for each row execute procedure public.prevenir_borrado_cliente();

-- ============================================================
--  Helper: ¿el usuario actual es admin?
-- ============================================================
create or replace function public.is_admin()
returns boolean
language sql
security definer set search_path = public
as $$
  select exists (select 1 from public.profiles where id = auth.uid() and role = 'admin');
$$;

-- ============================================================
--  Row Level Security
-- ============================================================
alter table public.profiles      enable row level security;
alter table public.empresas       enable row level security;
alter table public.clientes       enable row level security;
alter table public.giftcards      enable row level security;
alter table public.transacciones  enable row level security;

-- profiles: cada uno ve su perfil; admin ve todos
drop policy if exists "perfil propio" on public.profiles;
create policy "perfil propio" on public.profiles
  for select using (id = auth.uid() or public.is_admin());

-- empresas: lectura para usuarios autenticados, escritura solo admin
drop policy if exists "empresas select" on public.empresas;
create policy "empresas select" on public.empresas
  for select to authenticated using (true);
drop policy if exists "empresas admin" on public.empresas;
create policy "empresas admin" on public.empresas
  for all to authenticated using (public.is_admin()) with check (public.is_admin());

-- clientes: igual que empresas
drop policy if exists "clientes select" on public.clientes;
create policy "clientes select" on public.clientes
  for select to authenticated using (true);
drop policy if exists "clientes admin" on public.clientes;
create policy "clientes admin" on public.clientes
  for all to authenticated using (public.is_admin()) with check (public.is_admin());

-- giftcards: lectura para autenticados (cajero necesita consultar saldo),
-- escritura directa solo admin (el cajero usa la función RPC usar_giftcard)
drop policy if exists "giftcards select" on public.giftcards;
create policy "giftcards select" on public.giftcards
  for select to authenticated using (true);
drop policy if exists "giftcards admin" on public.giftcards;
create policy "giftcards admin" on public.giftcards
  for all to authenticated using (public.is_admin()) with check (public.is_admin());

-- transacciones: lectura para autenticados; inserción solo vía RPC (security definer)
drop policy if exists "transacciones select" on public.transacciones;
create policy "transacciones select" on public.transacciones
  for select to authenticated using (true);
