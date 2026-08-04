# Cuentas compartidas — diseño

Fecha: 2026-08-03

## Objetivo

Permitir que dos (o más) personas compartan **una misma bolsa de gastos**: ver,
agregar, editar y borrar los mismos datos, con **atribución** de quién registró
cada gasto. Caso de uso: David y su esposa manejan las finanzas juntos.

## Decisiones (brainstorming)

- **Atribución:** sí — cada gasto guarda quién lo registró (`created_by`).
- **Acceso:** flujo de invitación dentro de la app (no lista blanca manual).
- **Permisos:** co-dueños **simétricos** — ambos pueden ver/agregar/editar/borrar
  todo y cambiar los topes. Sin roles.
- **Invitación:** **código corto** (ej. `A7X9K2`) que se comparte por WhatsApp,
  con caducidad de 24h y de un solo uso.
- **Topes:** compartidos por cuenta.

## Modelo de datos

Los datos financieros pertenecen a una **cuenta** (hogar), no a un usuario.

Tablas nuevas:

- `cuentas(id, join_code unique, join_expira, created_at)`
- `cuenta_miembros(cuenta_id, user_id, apodo, joined_at, pk(cuenta_id,user_id))`
  con índice único en `user_id` → un usuario pertenece a **una** cuenta.

Cambios a tablas existentes:

- `expenses`: `user_id` → `cuenta_id` (propiedad) + `created_by` (atribución).
  Índices pasan a `cuenta_id`.
- `settings`: PK `user_id` → PK `cuenta_id` (un set de topes por cuenta).
- `categories`: `user_id` → `cuenta_id` (las 9 por defecto quedan `cuenta_id null`).

## Seguridad (RLS)

Función `mi_cuenta()` (SECURITY DEFINER, evita recursión) devuelve la cuenta del
usuario actual. Políticas:

- `expenses`, `settings`: todo (CRUD) donde `cuenta_id = mi_cuenta()`.
- `categories`: leer `cuenta_id is null or = mi_cuenta()`; escribir solo `= mi_cuenta()`.
- `cuentas`: leer solo la propia (`id = mi_cuenta()`).
- `cuenta_miembros`: leer los de tu cuenta; cada quien edita su propio `apodo`.

Altas/bajas de membresía y códigos se hacen **solo** por funciones controladas
(SECURITY DEFINER), nunca por escritura directa del cliente.

`cuenta_id` en inserts lo pone el cliente (lo conoce del contexto) y RLS
`with check (cuenta_id = mi_cuenta())` impide falsificarlo. `created_by` lo fija
un trigger `BEFORE INSERT` a `auth.uid()` (no falsificable).

## Funciones

- `generar_codigo()` → código corto de alfabeto sin ambiguos, caduca en 24h, único.
- `unirse_a_cuenta(codigo)` → si el código es válido y vigente, mueve al usuario a
  esa cuenta. **Guarda-rail:** rechaza si el que se une ya tiene gastos en su cuenta
  actual (no fusiona). Borra en cascada la cuenta vieja si queda sin miembros.
  El código es de un solo uso (se limpia tras unirse).
- `set_apodo(nombre)` → fija el apodo del usuario en su membresía.
- `handle_new_user` (trigger): al registrarse, crea cuenta + membresía + settings.

Fuera de alcance: fusionar dos cuentas con datos; salir de una cuenta; >2 personas
gestionadas (funciona, pero sin UI específica de administración).

## Cambios de aplicación

- `lib/types.ts`: `Expense` (`cuenta_id`, `created_by`), `Settings` (`cuenta_id`),
  `Category` (`cuenta_id`), tipos `Database` (incluye `Functions`), nuevos
  `Miembro`, `Cuenta`.
- `lib/supabase/queries.ts`: quitar filtros por `user_id` (RLS scopea por cuenta);
  inserts llevan `cuenta_id`; nuevas queries `obtenerMiCuenta`, `listarMiembros`,
  `obtenerCuenta`, y RPCs `generarCodigo`, `unirseACuenta`, `setApodo`.
- `hooks/useGastos.ts`: recibe `cuentaId`; fila optimista con `cuenta_id`+`created_by`.
- Páginas `registro`/`historial`: cargan `cuentaId` y miembros; los pasan al cliente.
- `RegistroClient`/`HistorialClient`: usan `cuentaId`; mapa `created_by → apodo`.
- Atribución en `ItemGasto`/`ListaMovimientos`: badge con apodo (solo si ≥2 miembros).
- Navegación: nueva pestaña **Cuenta** (`/cuenta`) — miembros, tu apodo, generar
  código (con copiar), y unirse con código.

## Migración de datos

Por cada usuario con `settings` hoy: crear cuenta, membresía, y setear
`cuenta_id`/`created_by` en sus filas. (Actualmente 0 usuarios → migración vacía,
pero el script lo maneja genéricamente.)

## Pruebas

- Unit (Vitest) para lógica pura nueva (validación/normalización de código).
- Verificación SQL post-migración: conteos, RLS habilitado, funciones existen,
  `handle_new_user` crea cuenta+settings.
- Verificación en producción tras deploy (endpoints, carga de la pantalla Cuenta).
- Validación con subagente revisor (regresiones, edge cases, RLS) antes de commitear.
