---
name: testing-nomina-mx
description: Cómo probar end-to-end la app de nómina mexicana (Next.js 15 + Prisma + Postgres) — arranque del entorno, credenciales por rol, geocerca del checador con mapa Leaflet, corridas de nómina, finiquitos y verificación de la bitácora.
---

# Pruebas end-to-end de nomina-mx

## Arranque del entorno
- `sudo service postgresql start` y luego `npm run dev` (puerto 3000). Si el lead ya lo levantó, el log suele estar en `~/next.log` o `/tmp/dev.log`; si no sabes dónde, resuélvelo con `ls -l /proc/<pid>/fd/1` del proceso `next dev`.
- Al terminar, busca errores de servidor con `grep -n " 500 \|Error:" ~/next.log`.
- Consultas a la base: `PGPASSWORD=postgres psql -h localhost -U postgres -d nomina -c "..."`. Usar el `DATABASE_URL` como URI falla con `invalid URI query parameter: "schema"`.

## Credenciales demo
`admin@demo.mx` (ADMIN), `nomina@demo.mx` (NOMINISTA), `auditor@demo.mx` (AUDITOR); contraseña `Demo1234!`.
Ojo: navegar a `/login` con sesión activa NO cierra la sesión anterior; para cambiar de rol pulsa primero "Salir" en el encabezado.

## Geocerca del checador (`/checador`, componente `src/components/selector-ubicacion.tsx`)
- El mapa es Leaflet con tiles de `tile.openstreetmap.org` y búsqueda contra `nominatim.openstreetmap.org`; requiere red. Nominatim puede devolver 403 desde el shell aunque funcione en el navegador, así que valida siempre desde la UI.
- El campo "Buscar el negocio" acepta también coordenadas pegadas (`25.6866, -100.3161`), que se marcan sin llamar a Nominatim: es la ruta más confiable si la red bloquea la búsqueda.
- La latitud/longitud viven en inputs ocultos; la leyenda "Centro de trabajo: LAT, LON · radio N m" es la fuente de verdad visible.
- El radio tiene `min=10` nativo, así que un radio 0 lo bloquea el navegador antes de llegar al servidor (el mensaje "El radio debe ser mayor a cero." es del servidor y puede no aparecer).
- Con geocerca OBLIGATORIA, la checada manual del panel se rechaza con "El checador exige compartir la ubicación." porque el formulario manual no envía coordenadas. Para probar el flujo manual + "Aplicar a la nómina", deja al empleado con ubicación OPCIONAL.
- "Aplicar a la nómina" solo borra/regenera incidencias con `origen=CHECADOR`; las MANUAL deben sobrevivir (verifícalo en `/incidencias`).

## Corridas y transiciones
- Estados: CALCULADA → AUTORIZADA → TIMBRADA → PAGADA. Tras autorizar desaparece "Recalcular"; para probar el bloqueo adversarial deja abierta una pestaña previa en `/nomina?periodicidad=...&ejercicio=...` y pulsa "Recalcular" ahí: debe responder "La corrida está en estado AUTORIZADA y ya no puede recalcularse.".

## Bitácora (`/auditoria`)
- Para el escenario adversarial: `UPDATE "RegistroBitacora" SET accion='HACKEADO' WHERE secuencia=2;` rompe la cadena y tanto la UI como `/api/auditoria/verificar` señalan la secuencia. **Anota el valor original antes** y restáuralo al terminar.
- `/api/auditoria/verificar` sin cookie de sesión devuelve `{"error":"No autenticado."}`; verifícalo desde el navegador ya autenticado.

## Control de rol
- Autorizar como AUDITOR devuelve un mensaje amigable, pero el alta de empleado como AUDITOR puede terminar en una excepción de servidor sin manejar (`POST /empleados 500`, `requerirRol` lanza `Error`). Verifica siempre en la base que el registro NO se haya creado y repórtalo como bug de manejo de errores si vuelve a ocurrir.

## Webhook de WhatsApp
Exige firma de Twilio (`TWILIO_AUTH_TOKEN`, `TWILIO_WEBHOOK_URL`); no se puede probar desde el navegador. Usa un helper que firme la petición (p. ej. `~/checada.sh <From> <Body> <MessageSid> [Lat] [Lon]`).

## Devin Secrets Needed
Ninguno para el flujo web local; solo `TWILIO_AUTH_TOKEN` si se prueba el webhook firmado.
