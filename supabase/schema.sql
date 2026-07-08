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
  role text not null default 'cajero' check (role in ('admin', 'cajero', 'atencion', 'tesoreria')),
  comercio text,   -- comercio asignado al cajero (null = sin restricción)
  created_at timestamptz not null default now()
);

-- ---------- Comercios (donde se usan las gift cards) ----------
create table if not exists public.comercios (
  id uuid primary key default gen_random_uuid(),
  nombre text not null unique,
  logo_url text,
  color text not null default '#1e3a8a',   -- color de fondo de la tarjeta
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

-- ---------- Grupos de clientes ----------
create table if not exists public.grupos (
  id uuid primary key default gen_random_uuid(),
  nombre text not null unique,
  created_at timestamptz not null default now()
);

-- ---------- Clientes ----------
create table if not exists public.clientes (
  id uuid primary key default gen_random_uuid(),
  nombre text not null,
  dni text not null unique,
  email text,
  telefono text,
  codigo_cliente text unique check (codigo_cliente is null or codigo_cliente ~ '^[A-Za-z0-9]{5}$'),
  grupo_id uuid references public.grupos(id) on delete set null,
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
  uso_parcial boolean not null default true,   -- true = admite usos parciales; false = solo uso total
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

-- ---------- Configuración del email (plantilla única) ----------
create table if not exists public.config_email (
  id int primary key default 1,
  asunto text not null default 'Tu Gift Card {codigo}',
  titulo text not null default '🎁 Tu Gift Card de {empresa}',
  intro text not null default 'Hola {nombre}, te enviamos tu Gift Card.',
  instrucciones text not null default 'Presentá este código o el QR adjunto en la caja para usar tu saldo (podés usarlo en compras parciales).',
  updated_at timestamptz not null default now(),
  constraint config_email_unica check (id = 1)
);
insert into public.config_email (id) values (1) on conflict (id) do nothing;

-- ---------- Auditoría de movimientos ----------
-- Sin referencias a otras tablas: los movimientos quedan siempre reflejados,
-- aunque se elimine la gift card. No se permite eliminar registros (RLS).
create table if not exists public.auditoria (
  id uuid primary key default gen_random_uuid(),
  fecha timestamptz not null default now(),
  usuario_email text,
  usuario_rol text,
  accion text not null,          -- creacion | modificacion | asignacion | uso | anulacion | eliminacion
  giftcard_codigo text,
  empresa text,
  cliente text,
  detalle text
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
  v_cajero_comercio text;
  v_emp_comercio text;
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

  -- El cajero solo puede canjear gift cards de su comercio asignado
  select comercio into v_cajero_comercio from public.profiles where id = auth.uid();
  select comercio into v_emp_comercio from public.empresas where id = v_card.empresa_id;
  if v_cajero_comercio is not null and v_emp_comercio is distinct from v_cajero_comercio then
    raise exception 'La Gift Card no pertenece al comercio emitido (pertenece a %)', coalesce(v_emp_comercio, 'sin comercio');
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

  if v_card.uso_parcial = false and p_monto <> v_card.saldo then
    raise exception 'Esta Gift Card es de uso total: debe usarse el saldo completo (%)', v_card.saldo;
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
--  Trigger de auditoría: registra creación, modificación,
--  asignación, uso, anulación y eliminación de gift cards.
-- ============================================================
create or replace function public.registrar_auditoria()
returns trigger
language plpgsql
security definer set search_path = public
as $$
declare
  v_email text;
  v_rol text;
  v_accion text;
  v_codigo text;
  v_empresa text;
  v_cliente text;
  v_detalle text;
begin
  select email, role into v_email, v_rol from public.profiles where id = auth.uid();

  if (tg_op = 'INSERT') then
    -- Las altas por API (service role, sin auth.uid) registran su propia
    -- auditoría con la atribución del admin llamante. Evitamos el duplicado.
    if auth.uid() is null then
      return new;
    end if;
    v_codigo := new.codigo;
    v_accion := 'creacion';
    v_detalle := 'Monto máximo ' || new.monto_max ||
                 case when new.cliente_id is not null then ' (asignada al crear)' else '' end;
    select nombre into v_empresa from public.empresas where id = new.empresa_id;
    if new.cliente_id is not null then
      select nombre into v_cliente from public.clientes where id = new.cliente_id;
    end if;

  elsif (tg_op = 'UPDATE') then
    v_codigo := new.codigo;
    select nombre into v_empresa from public.empresas where id = new.empresa_id;
    if new.cliente_id is not null then
      select nombre into v_cliente from public.clientes where id = new.cliente_id;
    end if;

    if (new.cliente_id is distinct from old.cliente_id and old.cliente_id is null) then
      v_accion := 'asignacion';
      v_detalle := 'Cliente asignado: ' || coalesce(v_cliente, '');
    elsif (new.estado = 'anulada' and old.estado <> 'anulada') then
      v_accion := 'anulacion';
      v_detalle := 'Gift card anulada';
    elsif (new.saldo is distinct from old.saldo) then
      v_accion := 'uso';
      v_detalle := 'Saldo ' || old.saldo || ' -> ' || new.saldo;
    else
      v_accion := 'modificacion';
      v_detalle := 'Modificación de datos';
    end if;

  elsif (tg_op = 'DELETE') then
    v_codigo := old.codigo;
    v_accion := 'eliminacion';
    v_detalle := 'Gift card eliminada';
    select nombre into v_empresa from public.empresas where id = old.empresa_id;
  end if;

  insert into public.auditoria (usuario_email, usuario_rol, accion, giftcard_codigo, empresa, cliente, detalle)
  values (v_email, v_rol, v_accion, v_codigo, v_empresa, v_cliente, v_detalle);

  if (tg_op = 'DELETE') then return old; end if;
  return new;
end;
$$;

drop trigger if exists trg_auditoria_giftcards on public.giftcards;
create trigger trg_auditoria_giftcards
  after insert or update or delete on public.giftcards
  for each row execute procedure public.registrar_auditoria();

-- ============================================================
--  Trigger de auditoría: cambios de rol de usuarios
-- ============================================================
create or replace function public.auditar_cambio_rol()
returns trigger
language plpgsql
security definer set search_path = public
as $$
declare
  v_email text;
  v_rol text;
begin
  if new.role is distinct from old.role then
    select email, role into v_email, v_rol from public.profiles where id = auth.uid();
    insert into public.auditoria (usuario_email, usuario_rol, accion, detalle)
    values (v_email, v_rol, 'rol_cambiado',
            'Usuario ' || coalesce(new.email, '') || ': ' || old.role || ' -> ' || new.role);
  end if;
  return new;
end;
$$;

drop trigger if exists trg_auditar_cambio_rol on public.profiles;
create trigger trg_auditar_cambio_rol
  after update of role on public.profiles
  for each row execute procedure public.auditar_cambio_rol();

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
alter table public.comercios      enable row level security;
alter table public.grupos         enable row level security;
alter table public.clientes       enable row level security;
alter table public.giftcards      enable row level security;
alter table public.transacciones  enable row level security;
alter table public.auditoria      enable row level security;
alter table public.config_email   enable row level security;

-- profiles: cada uno ve su perfil; admin ve todos
drop policy if exists "perfil propio" on public.profiles;
create policy "perfil propio" on public.profiles
  for select using (id = auth.uid() or public.is_admin());

-- profiles: el admin puede cambiar el rol de cualquier usuario
drop policy if exists "perfiles admin update" on public.profiles;
create policy "perfiles admin update" on public.profiles
  for update to authenticated using (public.is_admin()) with check (public.is_admin());

-- empresas: lectura para usuarios autenticados, escritura solo admin
drop policy if exists "empresas select" on public.empresas;
create policy "empresas select" on public.empresas
  for select to authenticated using (true);
drop policy if exists "empresas admin" on public.empresas;
create policy "empresas admin" on public.empresas
  for all to authenticated using (public.is_admin()) with check (public.is_admin());

-- comercios: lectura para autenticados, escritura solo admin
drop policy if exists "comercios select" on public.comercios;
create policy "comercios select" on public.comercios
  for select to authenticated using (true);
drop policy if exists "comercios admin" on public.comercios;
create policy "comercios admin" on public.comercios
  for all to authenticated using (public.is_admin()) with check (public.is_admin());

-- grupos: lectura para autenticados, escritura solo admin
drop policy if exists "grupos select" on public.grupos;
create policy "grupos select" on public.grupos
  for select to authenticated using (true);
drop policy if exists "grupos admin" on public.grupos;
create policy "grupos admin" on public.grupos
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

-- auditoría: lectura para autenticados; inserción permitida (la hacen los triggers).
-- NO se definen políticas de update/delete: por RLS quedan prohibidas para todos.
drop policy if exists "auditoria select" on public.auditoria;
create policy "auditoria select" on public.auditoria
  for select to authenticated using (true);
drop policy if exists "auditoria insert" on public.auditoria;
create policy "auditoria insert" on public.auditoria
  for insert to authenticated with check (true);

-- config_email: lectura para todos (la usa la función de envío); escritura solo admin
drop policy if exists "config_email select" on public.config_email;
create policy "config_email select" on public.config_email
  for select using (true);
drop policy if exists "config_email admin" on public.config_email;
create policy "config_email admin" on public.config_email
  for all to authenticated using (public.is_admin()) with check (public.is_admin());
