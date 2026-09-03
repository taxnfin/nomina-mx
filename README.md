# Nómina MX

Sistema de nómina mexicana con trazabilidad auditable. Soporta pago **semanal, catorcenal,
quincenal y mensual**, con cálculo de ISR, subsidio para el empleo, cuotas IMSS obrero-patronales,
INFONAVIT, prestaciones de ley, finiquitos/liquidaciones y generación de CFDI 4.0 con complemento
de Nómina 1.2.

## Stack

Next.js 15 (App Router) · TypeScript · Prisma · PostgreSQL · Tailwind · Vitest · decimal.js

## Puesta en marcha

```bash
npm install
cp .env.example .env          # ajusta DATABASE_URL y AUTH_SECRET
npx prisma migrate deploy
npm run db:seed
npm run dev
```

Usuarios de la semilla (cámbialos antes de cualquier uso real): `admin@demo.mx`, `nomina@demo.mx`,
`auditor@demo.mx`, contraseña `Demo1234!`.

## Comandos

| Comando | Descripción |
| --- | --- |
| `npm run dev` | Servidor de desarrollo |
| `npm test` | Pruebas del motor fiscal y de la bitácora |
| `npm run typecheck` | Verificación de tipos |
| `npm run lint` | ESLint |
| `npm run db:migrate` | Aplica migraciones |
| `npm run db:seed` | Empresa, empleados, tarifas y periodos 2025 de demostración |

## Cálculos implementados

- **Percepciones**: sueldo, séptimo día, faltas, incapacidades, permisos sin goce, vacaciones,
  prima vacacional, horas extra dobles y triples (Art. 66-68 LFT), prima dominical (Art. 71),
  días de descanso y festivos trabajados (Art. 73-75), aguinaldo (Art. 87) y PTU (Art. 117-127).
- **Exenciones** del Art. 93 LISR por concepto, medidas en UMA.
- **ISR** con la tarifa del Art. 96 LISR proyectada a cada periodicidad, subsidio para el empleo,
  y retención de pagos extraordinarios por el procedimiento del Art. 174 RLISR.
- **IMSS**: SBC integrado (Art. 27 y 30 LSS) con tope de 25 UMA, cuota fija, excedente de 3 UMA,
  prestaciones en dinero y en especie, invalidez y vida, guarderías, riesgo de trabajo, retiro y
  cesantía y vejez con la tabla progresiva vigente.
- **INFONAVIT**: aportación patronal del 5 % y descuentos por crédito en porcentaje, cuota fija o
  VSM (Art. 29 Ley del INFONAVIT).
- **Separación**: finiquito y liquidación con partes proporcionales, prima de antigüedad
  (Art. 162 LFT), indemnización constitucional y 20 días por año (Art. 48 y 50 LFT).
- **Impuesto sobre nóminas** estatal, parametrizable por empresa.

## Trazabilidad

Cada evento relevante (alta de empleado, incidencia, cálculo, autorización, timbrado, pago,
finiquito, inicio de sesión) se escribe en una bitácora **append-only**: el registro sella con
SHA-256 su contenido canónico y el hash del evento anterior, formando una cadena. Modificar o
borrar cualquier registro rompe la cadena y el verificador lo detecta —disponible en la pantalla
de Trazabilidad y en `GET /api/auditoria/verificar`.

Además, cada corrida guarda un **snapshot inmutable** de los parámetros fiscales usados y no puede
recalcularse una vez autorizada, timbrada o pagada. La autorización está restringida al rol
`ADMIN`, y cada recibo conserva su **memoria de cálculo** con el fundamento legal de cada importe.

## Antes de producción

- Los parámetros fiscales incluidos son una semilla de 2025 y deben cotejarse contra las
  publicaciones vigentes del DOF y del SAT (UMA, salario mínimo, tarifas del Anexo 8, cuotas IMSS).
- Las tarifas periódicas se derivan de la mensual; conviene cargar directamente las tablas
  publicadas para semanal, catorcenal y quincenal en `TarifaIsr`.
- El PAC incluido es un **simulador de desarrollo**: no emite comprobantes fiscales válidos. Hay
  que conectar un PAC real y sellar con el CSD del emisor, además de validar el XML contra los XSD
  y las reglas de validación del SAT.
- Conviene reforzar la bitácora a nivel de base de datos (revocar `UPDATE`/`DELETE` sobre
  `RegistroBitacora`) y respaldar periódicamente el último hash fuera del sistema.
