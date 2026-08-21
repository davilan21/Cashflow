-- Cashflow: confirmar el pago de una cuota de deuda.
--
-- Las deudas se confirman a mano (no se detectan por correo), y confirmar una
-- cuota son DOS escrituras: el movimiento en el libro de caja y el avance de
-- la deuda (saldo, fecha de anclaje, cuotas pagadas). Hacerlas por separado
-- desde el cliente deja la puerta abierta a que una falle y la otra no: o un
-- movimiento sin avance —y la cuota se vuelve a proyectar, contándose dos
-- veces— o un avance sin movimiento, que descuadra el saldo. Van juntas acá.
--
-- Sigue el invariante del módulo: solo objetos nuevos, ningún alter sobre
-- tablas existentes.

create or replace function confirmar_cuota_deuda(
  p_deuda_id      uuid,
  p_fecha         date,
  p_monto         bigint,
  p_saldo_despues bigint
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_cuenta         uuid;
  v_nombre         text;
  v_cuotas_pagadas int;
  v_n_cuotas       int;
  v_instrumento    uuid;
  v_nuevo_id       uuid;
begin
  if p_monto <= 0 then
    raise exception 'El monto de la cuota debe ser positivo';
  end if;
  if p_saldo_despues < 0 then
    raise exception 'El saldo después de la cuota no puede ser negativo';
  end if;

  -- "for update" bloquea la deuda hasta el commit: sin esto, dos
  -- confirmaciones concurrentes leerían el mismo cuotas_pagadas y la deuda
  -- avanzaría una sola vez habiendo registrado dos movimientos.
  select cuenta_id, nombre, cuotas_pagadas, n_cuotas, instrumento_id
    into v_cuenta, v_nombre, v_cuotas_pagadas, v_n_cuotas, v_instrumento
    from flujo_deudas where id = p_deuda_id for update;

  if v_cuenta is null or mi_cuenta() is null or v_cuenta is distinct from mi_cuenta() then
    raise exception 'No autorizado';
  end if;
  if v_cuotas_pagadas >= v_n_cuotas then
    raise exception 'Esta deuda ya está pagada';
  end if;

  -- ref_id + ref_periodo es lo que impide que el motor vuelva a proyectar
  -- esta cuota. El índice único sobre (cuenta, ref_id, ref_periodo) hace que
  -- confirmar dos veces la misma cuota falle en vez de duplicarla.
  insert into flujo_movimientos
    (cuenta_id, fecha, monto, tipo, etiqueta, origen, instrumento_id, ref_id, ref_periodo)
    values (v_cuenta, p_fecha, -p_monto, 'cuota_deuda',
            v_nombre || ' · cuota ' || (v_cuotas_pagadas + 1),
            'manual', v_instrumento, p_deuda_id, p_fecha::text)
    returning id into v_nuevo_id;

  update flujo_deudas
    set saldo_actual   = p_saldo_despues,
        saldo_a_fecha  = p_fecha,
        cuotas_pagadas = v_cuotas_pagadas + 1
    where id = p_deuda_id;

  return v_nuevo_id;
end;
$$;
