import { PrismaClient, type Periodicidad } from "@prisma/client";
import bcrypt from "bcryptjs";
import { generarPeriodos, PERIODICIDADES } from "../src/lib/fiscal/periodicidad";
import {
  PARAMETROS_2025,
  TARIFA_ISR_MENSUAL_2025,
  diasVacacionesPorAntiguedad,
} from "../src/lib/fiscal/tablas2025";
import { salarioBaseCotizacion } from "../src/lib/fiscal/imss";

const prisma = new PrismaClient();
const EJERCICIO = 2025;

async function main() {
  const empresa = await prisma.empresa.upsert({
    where: { rfc: "DEM240101AB1" },
    update: {},
    create: {
      razonSocial: "Demostración Nómina MX, S.A. de C.V.",
      rfc: "DEM240101AB1",
      regimenFiscal: "601",
      codigoPostal: "01000",
      registroPatronal: "B5510768108",
      primaRiesgoTrabajo: 0.0054355,
    },
  });

  const vigenciaIsn = new Date(Date.UTC(2025, 0, 1));
  await prisma.configuracionIsn.upsert({
    where: { empresaId_vigenteDesde: { empresaId: empresa.id, vigenteDesde: vigenciaIsn } },
    update: {},
    create: { empresaId: empresa.id, vigenteDesde: vigenciaIsn, claveEntidadIsn: "NLE" },
  });

  const usuarios = [
    { nombre: "Ana Administradora", email: "admin@demo.mx", rol: "ADMIN" as const },
    { nombre: "Noé Nominista", email: "nomina@demo.mx", rol: "NOMINISTA" as const },
    { nombre: "Aurora Auditora", email: "auditor@demo.mx", rol: "AUDITOR" as const },
  ];
  const hash = await bcrypt.hash("Demo1234!", 12);
  for (const usuario of usuarios) {
    await prisma.usuario.upsert({
      where: { email: usuario.email },
      update: { rol: usuario.rol },
      create: { ...usuario, empresaId: empresa.id, hashPassword: hash },
    });
  }

  const parametros: [string, number, string][] = [
    ["UMA_DIARIA", PARAMETROS_2025.UMA_DIARIA, "Unidad de Medida y Actualización diaria"],
    ["UMA_MENSUAL", PARAMETROS_2025.UMA_MENSUAL, "UMA elevada al mes"],
    ["UMA_ANUAL", PARAMETROS_2025.UMA_ANUAL, "UMA elevada al año"],
    ["SALARIO_MINIMO_GENERAL", PARAMETROS_2025.SALARIO_MINIMO_GENERAL, "Salario mínimo general"],
    ["SALARIO_MINIMO_ZLFN", PARAMETROS_2025.SALARIO_MINIMO_ZLFN, "Salario mínimo ZLFN"],
    [
      "SUBSIDIO_PORCENTAJE_UMA",
      PARAMETROS_2025.SUBSIDIO_PORCENTAJE_UMA,
      "Subsidio para el empleo como % de la UMA mensual",
    ],
    [
      "SUBSIDIO_INGRESO_TOPE_MENSUAL",
      PARAMETROS_2025.SUBSIDIO_INGRESO_TOPE_MENSUAL,
      "Ingreso mensual máximo con derecho a subsidio",
    ],
    [
      "IMPUESTO_SOBRE_NOMINAS",
      PARAMETROS_2025.IMPUESTO_SOBRE_NOMINAS,
      "Tasa del impuesto estatal sobre nóminas",
    ],
  ];
  for (const [clave, valor, descripcion] of parametros) {
    const existente = await prisma.parametroFiscal.findFirst({
      where: { ejercicio: EJERCICIO, clave, empresaId: null },
    });
    if (existente) {
      await prisma.parametroFiscal.update({
        where: { id: existente.id },
        data: { valor, descripcion },
      });
    } else {
      await prisma.parametroFiscal.create({
        data: {
          ejercicio: EJERCICIO,
          clave,
          valor,
          descripcion,
          vigenteDesde: new Date(Date.UTC(EJERCICIO, 0, 1)),
        },
      });
    }
  }

  await prisma.tarifaIsr.deleteMany({ where: { ejercicio: EJERCICIO, periodicidad: "MENSUAL" } });
  await prisma.tarifaIsr.createMany({
    data: TARIFA_ISR_MENSUAL_2025.map((renglon) => ({
      ejercicio: EJERCICIO,
      periodicidad: "MENSUAL" as Periodicidad,
      limiteInferior: renglon.limiteInferior,
      limiteSuperior: renglon.limiteSuperior,
      cuotaFija: renglon.cuotaFija,
      porcentaje: renglon.porcentaje,
    })),
  });

  for (const periodicidad of PERIODICIDADES) {
    for (const periodo of generarPeriodos(EJERCICIO, periodicidad)) {
      await prisma.periodoNomina.upsert({
        where: {
          ejercicio_periodicidad_numero: {
            ejercicio: EJERCICIO,
            periodicidad: periodicidad as Periodicidad,
            numero: periodo.numero,
          },
        },
        update: {},
        create: {
          ejercicio: EJERCICIO,
          periodicidad: periodicidad as Periodicidad,
          numero: periodo.numero,
          fechaInicio: periodo.fechaInicio,
          fechaFin: periodo.fechaFin,
          fechaPago: periodo.fechaPago,
          diasPeriodo: periodo.diasPago,
        },
      });
    }
  }

  const plantilla: {
    numeroEmpleado: string;
    nombre: string;
    apellidoPaterno: string;
    apellidoMaterno: string;
    rfc: string;
    curp: string;
    nss: string;
    puesto: string;
    departamento: string;
    periodicidad: Periodicidad;
    salarioDiario: number;
    fechaIngreso: string;
    infonavit?: { tipo: string; valor: number };
    pension?: { tipo: string; valor: number };
  }[] = [
    {
      numeroEmpleado: "0001",
      nombre: "María",
      apellidoPaterno: "López",
      apellidoMaterno: "Hernández",
      rfc: "LOHM900112AB1",
      curp: "LOHM900112MDFPRR01",
      nss: "12345678901",
      puesto: "Gerente de operaciones",
      departamento: "Operaciones",
      periodicidad: "QUINCENAL",
      salarioDiario: 1200,
      fechaIngreso: "2018-03-01",
    },
    {
      numeroEmpleado: "0002",
      nombre: "Juan",
      apellidoPaterno: "Martínez",
      apellidoMaterno: "Ruiz",
      rfc: "MARJ850420XX2",
      curp: "MARJ850420HDFRZN02",
      nss: "12345678902",
      puesto: "Operador de producción",
      departamento: "Producción",
      periodicidad: "SEMANAL",
      salarioDiario: 320,
      fechaIngreso: "2021-07-15",
      infonavit: { tipo: "PORCENTAJE", valor: 0.2 },
    },
    {
      numeroEmpleado: "0003",
      nombre: "Rosa",
      apellidoPaterno: "García",
      apellidoMaterno: "Sánchez",
      rfc: "GASR920815YY3",
      curp: "GASR920815MDFRNS03",
      nss: "12345678903",
      puesto: "Auxiliar administrativo",
      departamento: "Administración",
      periodicidad: "CATORCENAL",
      salarioDiario: 420,
      fechaIngreso: "2023-01-09",
      pension: { tipo: "PORCENTAJE", valor: 0.15 },
    },
    {
      numeroEmpleado: "0004",
      nombre: "Carlos",
      apellidoPaterno: "Ramírez",
      apellidoMaterno: "Torres",
      rfc: "RATC800505ZZ4",
      curp: "RATC800505HDFMRR04",
      nss: "12345678904",
      puesto: "Director de finanzas",
      departamento: "Dirección",
      periodicidad: "MENSUAL",
      salarioDiario: 3200,
      fechaIngreso: "2015-11-02",
    },
    {
      numeroEmpleado: "0005",
      nombre: "Luisa",
      apellidoPaterno: "Flores",
      apellidoMaterno: "Díaz",
      rfc: "FODL990330WW5",
      curp: "FODL990330MDFLZS05",
      nss: "12345678905",
      puesto: "Almacenista",
      departamento: "Almacén",
      periodicidad: "SEMANAL",
      salarioDiario: 278.8,
      fechaIngreso: "2024-02-19",
    },
    {
      numeroEmpleado: "0006",
      nombre: "Pedro",
      apellidoPaterno: "Núñez",
      apellidoMaterno: "Vega",
      rfc: "NUVP870909VV6",
      curp: "NUVP870909HDFXGD06",
      nss: "12345678906",
      puesto: "Analista de sistemas",
      departamento: "Tecnología",
      periodicidad: "QUINCENAL",
      salarioDiario: 780,
      fechaIngreso: "2022-05-16",
      infonavit: { tipo: "CUOTA_FIJA", valor: 1450 },
    },
  ];

  for (const persona of plantilla) {
    const fechaIngreso = new Date(`${persona.fechaIngreso}T00:00:00.000Z`);
    const anios = Math.max(
      new Date(Date.UTC(EJERCICIO, 5, 30)).getUTCFullYear() - fechaIngreso.getUTCFullYear(),
      1,
    );
    const sbc = salarioBaseCotizacion(
      persona.salarioDiario,
      15,
      diasVacacionesPorAntiguedad(anios),
      0.25,
    );
    await prisma.empleado.upsert({
      where: {
        empresaId_numeroEmpleado: {
          empresaId: empresa.id,
          numeroEmpleado: persona.numeroEmpleado,
        },
      },
      update: {},
      create: {
        empresaId: empresa.id,
        numeroEmpleado: persona.numeroEmpleado,
        nombre: persona.nombre,
        apellidoPaterno: persona.apellidoPaterno,
        apellidoMaterno: persona.apellidoMaterno,
        rfc: persona.rfc,
        curp: persona.curp,
        nss: persona.nss,
        fechaIngreso,
        puesto: persona.puesto,
        departamento: persona.departamento,
        registroPatronal: empresa.registroPatronal,
        periodicidad: persona.periodicidad,
        salarioDiario: persona.salarioDiario,
        salarioBaseCotizacion: sbc.toFixed(4),
        descuentoInfonavitTipo: persona.infonavit?.tipo ?? null,
        descuentoInfonavitValor: persona.infonavit?.valor ?? null,
        pensionAlimenticiaTipo: persona.pension?.tipo ?? null,
        pensionAlimenticiaValor: persona.pension?.valor ?? null,
      },
    });
  }

  const operador = await prisma.empleado.findUnique({
    where: { empresaId_numeroEmpleado: { empresaId: empresa.id, numeroEmpleado: "0002" } },
  });
  if (operador) {
    const yaTiene = await prisma.incidencia.count({ where: { empleadoId: operador.id } });
    if (yaTiene === 0) {
      await prisma.incidencia.createMany({
        data: [
          {
            empleadoId: operador.id,
            tipo: "HORAS_EXTRA_DOBLES",
            fechaInicio: new Date(Date.UTC(EJERCICIO, 0, 6)),
            fechaFin: new Date(Date.UTC(EJERCICIO, 0, 12)),
            cantidad: 6,
            comentario: "Cierre de producción",
          },
          {
            empleadoId: operador.id,
            tipo: "PRIMA_DOMINICAL",
            fechaInicio: new Date(Date.UTC(EJERCICIO, 0, 12)),
            fechaFin: new Date(Date.UTC(EJERCICIO, 0, 12)),
            cantidad: 1,
          },
        ],
      });
    }
  }

  const analista = await prisma.empleado.findUnique({
    where: { empresaId_numeroEmpleado: { empresaId: empresa.id, numeroEmpleado: "0006" } },
  });
  if (analista) {
    await prisma.empleado.update({
      where: { id: analista.id },
      data: { telefonoWhatsapp: "+5215500000006", checadorActivo: true },
    });

    if ((await prisma.checada.count({ where: { empleadoId: analista.id } })) === 0) {
      // Primera quincena de enero: una falta el día 8 y dos horas extra el día 9.
      const jornadas: { dia: number; entrada: string; salida: string }[] = [
        { dia: 6, entrada: "09:05", salida: "18:02" },
        { dia: 7, entrada: "09:31", salida: "18:10" },
        { dia: 9, entrada: "08:58", salida: "20:00" },
        { dia: 10, entrada: "09:03", salida: "18:05" },
        { dia: 13, entrada: "09:00", salida: "18:00" },
        { dia: 14, entrada: "09:12", salida: "18:30" },
        { dia: 15, entrada: "09:00", salida: "18:00" },
      ];
      await prisma.checada.createMany({
        data: jornadas.flatMap(({ dia, entrada, salida }) =>
          [
            { tipo: "ENTRADA" as const, hora: entrada },
            { tipo: "SALIDA" as const, hora: salida },
          ].map(({ tipo, hora }) => ({
            empleadoId: analista.id,
            tipo,
            ocurridoEn: new Date(`${EJERCICIO}-01-${String(dia).padStart(2, "0")}T${hora}:00.000Z`),
            origen: "WHATSAPP" as const,
            telefono: "+5215500000006",
            mensajeId: `SEED-${dia}-${tipo}`,
            textoMensaje: tipo === "ENTRADA" ? "entrada" : "salida",
          })),
        ),
      });
    }
  }

  console.log("Semilla aplicada:", {
    empresa: empresa.razonSocial,
    usuarios: usuarios.map((u) => u.email),
    password: "Demo1234!",
  });
}

main()
  .catch((error) => {
    console.error(error);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
