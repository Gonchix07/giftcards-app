-- ============================================================
--  Migración: comercio asignado al cajero
--   - Columna profiles.comercio
--   - usar_giftcard valida que el cajero solo canjee gift cards de su comercio
--  Ejecutar en Supabase -> SQL Editor -> Run.
-- ============================================================

alter table public.profiles add column if not exists comercio text;

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
