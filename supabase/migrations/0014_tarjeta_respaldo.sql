-- Cashflow: tarjeta de respaldo (terminada en 7095, en uso desde 2026-10-15).
--
-- Cada gasto dice a qué tarjeta pertenece. Todo lo existente, lo que llega por
-- Gmail y lo que se registra a mano queda como 'principal' por el default.
-- Los topes no cambian: se comparan contra la suma de ambas tarjetas.
alter table expenses
  add column tarjeta text not null default 'principal'
    check (tarjeta in ('principal', 'respaldo'));

-- Huella de la fila del CSV del banco (ver lib/tarjeta-csv.ts). El índice
-- único hace idempotente la carga del CSV acumulado: reimportar el mismo
-- movimiento choca en vez de duplicarse.
alter table expenses add column ref_import text;

create unique index expenses_cuenta_ref_import_uniq
  on expenses (cuenta_id, ref_import)
  where ref_import is not null;
