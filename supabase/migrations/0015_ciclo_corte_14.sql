-- Cashflow: el ciclo de la tarjeta va del 15 al 14, no del 16 al 15.
--
-- El banco corta el 15, pero las compras de ese día se facturan en el extracto
-- siguiente y las del 15 del mes anterior entran en este. Verificado contra el
-- extracto de la VISA "15 sep - 15 oct 2026": sus 111 compras van del 15 de
-- septiembre al 14 de octubre y suman el "Compras del mes" al peso.
--
-- ciclo_de debe seguir siendo la misma regla que lib/ciclo.ts#cicloDe.
create or replace function ciclo_de(fecha date)
returns text
language sql
immutable
as $$
  select case
    when extract(day from fecha) < 15 then to_char(fecha, 'YYYY-MM')
    else to_char(fecha + interval '1 month', 'YYYY-MM')
  end;
$$;

-- expenses_cuenta_ciclo_idx está construido sobre ciclo_de(fecha). Como la
-- función es IMMUTABLE, Postgres no recalcula el índice al reemplazarla: sin
-- esto quedaría con el ciclo viejo y una consulta que lo use daría resultados
-- distintos a los de un recorrido completo de la tabla.
reindex index expenses_cuenta_ciclo_idx;
