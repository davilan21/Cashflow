# Lectura automática de gastos desde Gmail (Bancolombia) — diseño

Fecha: 2026-08-18

## Objetivo

Evitar el registro manual de cada compra con tarjeta de crédito: conectar el
Gmail de David, detectar las notificaciones de compra que envía Bancolombia,
convertirlas en gastos sugeridos y dejarlas en una bandeja de revisión — el
usuario confirma o descarta antes de que cuenten como gasto real.

## Decisiones (brainstorming)

- **Formato de origen**: los correos de Bancolombia son texto/HTML plano
  (sin adjuntos, sin OCR necesario).
- **Bancos**: solo Bancolombia por ahora.
- **Autonomía**: **revisión obligatoria** antes de guardar — nada se escribe
  en `expenses` sin que el usuario confirme. Prioriza evitar que un error de
  parseo (monto mal leído, categoría equivocada) entre directo a los
  números reales.
- **Alcance de conexión**: solo David conecta su Gmail en esta primera
  versión (la cuenta es compartida, pero la conexión de Gmail es individual;
  extender a que otros miembros conecten el suyo queda fuera de alcance).
- **Backfill**: al conectar por primera vez, además de procesar correos
  nuevos, busca los últimos 30 días de notificaciones de Bancolombia para no
  perder gastos del ciclo actual.
- **Mecanismo**: OAuth de Gmail (`gmail.readonly`), no reenvío de correo.
  Es un scope **restringido** de Google: publicar la app en modo
  "Production" exigiría una auditoría de seguridad anual (CASA) de varios
  miles de dólares, inviable para una app personal. Se queda en modo
  **Testing**, lo que implica que el refresh token expira cada **~7 días**
  y hay que reconectar — se acepta ese costo a cambio de no montar
  infraestructura de recepción de correo (dominio propio + servicio de
  reenvío) para una alternativa sin expiración.
- **Sincronización**: el plan gratuito de Vercel limita los cron jobs a
  **1 ejecución/día**, así que el mecanismo principal es un botón manual
  "Sincronizar ahora"; el cron diario es solo un respaldo silencioso.

## Modelo de datos

Migración `0004_gmail_integracion.sql`, dos tablas nuevas.

### `gmail_conexiones`

Una fila por usuario que conecta su Gmail.

| columna | tipo | notas |
|---|---|---|
| `user_id` | uuid, PK | FK a `auth.users` |
| `email_conectado` | text | dirección de Gmail conectada, solo para mostrar en UI |
| `refresh_token` | text | **nunca se expone al cliente**, solo se lee/escribe con service role desde rutas de servidor |
| `estado` | text | `activo` \| `expirado` \| `error` |
| `ultimo_sync_at` | timestamptz, nullable | |
| `ultimo_error` | text, nullable | mensaje corto para mostrar en el banner de error |
| `created_at` | timestamptz | |

RLS: **sin políticas para `authenticated`** — la tabla es invisible al
cliente por completo. El estado de conexión se expone al front vía un
endpoint dedicado (`GET /api/gmail/status`) que usa service role y
devuelve solo `{ conectado, email_conectado, estado, ultimo_sync_at }`
(nunca el token).

### `gastos_pendientes`

Bandeja de revisión.

| columna | tipo | notas |
|---|---|---|
| `id` | uuid, PK | |
| `cuenta_id` | uuid | FK a `cuentas`, igual que `expenses` |
| `creado_por` | uuid | quién conectó el Gmail / dueño de la tarjeta |
| `gmail_message_id` | text | id del mensaje en Gmail, para deduplicar |
| `fecha` | date | fecha de la compra, extraída del correo |
| `monto` | numeric | |
| `categoria` | text | sugerida (heurística de palabras clave), editable en UI |
| `nota` | text | comercio, extraído del correo |
| `estado` | text | `pendiente` \| `confirmado` \| `descartado` |
| `created_at` | timestamptz | |

Constraint único: `(creado_por, gmail_message_id)` — evita reprocesar el
mismo correo en syncs sucesivos.

RLS: los miembros de la cuenta (`cuenta_id = mi_cuenta()`) pueden `select`
y `update` (para confirmar/descartar, cambiando `estado`) las filas de su
cuenta. El `insert` no tiene política para `authenticated` — solo lo hace
el proceso de sync con service role.

## Flujo de conexión y sincronización

1. **Conectar**: botón "Conectar Gmail" en la pantalla Cuenta → OAuth de
   Google (scope `gmail.readonly` + `openid email` para mostrar la
   dirección conectada) → callback guarda el `refresh_token` (service
   role) → dispara un primer sync con backfill de 30 días.
2. **Sincronizar**:
   - Botón "Sincronizar ahora" en la pantalla Pendientes: request
     autenticado con la sesión del usuario, corre el sync solo para su
     conexión.
   - Cron diario (`vercel.json` o `crons` en config) que golpea una ruta
     protegida por `CRON_SECRET` (header que Vercel añade automáticamente)
     y corre el sync para todas las conexiones `activo` con service role.
3. **Proceso de sync** (función compartida entre ambos triggers): usa la
   Gmail API (`users.messages.list` filtrado por remitente de Bancolombia,
   luego `users.messages.get` por cada mensaje nuevo) para traer correos
   desde `ultimo_sync_at` (o los últimos 30 días si es la primera vez),
   parsea cada uno, inserta en `gastos_pendientes` ignorando duplicados por
   `gmail_message_id`, actualiza `ultimo_sync_at`.
4. **Expiración del token**: si el refresh falla (esperable cada ~7 días
   en modo Testing), el sync marca `estado = 'expirado'` y guarda el error;
   la UI muestra un banner "Reconecta tu Gmail" que relanza el OAuth.

## Parseo del correo

Mismo patrón que `app/api/parse/route.ts`: se le pasa el texto del correo
(asunto + cuerpo, limpiado de HTML) a Claude con una tool de extracción
(`monto`, `comercio` → `nota`, `fecha`), reutilizando la heurística de
categoría por palabras clave de `lib/parse-local.ts`
(`PALABRAS_CATEGORIA`) aplicada al nombre del comercio. Si Claude no está
disponible (sin `ANTHROPIC_API_KEY`) o falla, cae a un parser
determinístico por regex calibrado al formato fijo de la notificación de
Bancolombia (monto y comercio siguen un patrón predecible: "Compra por $X
en Y con tarjeta...").

**Pendiente para la fase de implementación**: necesitamos un correo real
de ejemplo de Bancolombia (remitente exacto, asunto, cuerpo) para calibrar
el filtro de búsqueda en Gmail y el regex de respaldo. David lo debe
proveer (reenviarlo o pegar el texto) al empezar la implementación.

## Pantalla "Pendientes"

Nueva pestaña en `NavTabs` (junto a Registro / Historial / Cuenta), con
badge mostrando la cantidad de `pendiente`. Contenido:

- Estado de conexión arriba (conectado como `email_conectado` / banner de
  reconexión si `expirado`) + botón "Sincronizar ahora" + hora de la
  última sincronización.
- Lista de tarjetas por cada `gasto_pendiente`: comercio, monto, fecha,
  selector de categoría (mismo componente que usa Registro) — botones
  **Confirmar** (inserta en `expenses` con `created_by = creado_por`,
  marca `estado = 'confirmado'`) y **Descartar** (`estado = 'descartado'`,
  no se vuelve a mostrar).

## Seguridad / privacidad

- Scope mínimo posible (`gmail.readonly`, de solo lectura — la app nunca
  envía ni borra correo).
- No se guarda el correo completo, solo los campos extraídos (comercio,
  monto, fecha) necesarios para la revisión.
- `refresh_token` solo vive en `gmail_conexiones`, sin política RLS para
  clientes, y solo se lee desde rutas de servidor con service role.
- Setup en Google Cloud Console (proyecto OAuth, consent screen en modo
  Testing, agregar a David como test user, redirect URI de producción y
  de `localhost`) es manual y se hace junto con la implementación.

## Fuera de alcance

- Otros bancos.
- Que otros miembros de la cuenta compartida conecten su propio Gmail.
- Auto-confirmar gastos sin revisión.
- Adjuntos/imágenes con OCR.
- Reenvío de correo sin OAuth (alternativa considerada y descartada por
  requerir dominio propio + servicio de recepción de correo).
