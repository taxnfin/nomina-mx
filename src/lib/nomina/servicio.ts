import type {
  Empleado,
  EstadoCorrida,
  Incidencia,
  PeriodoNomina,
  Prisma,
} from "@prisma/client";
import { registrarEvento } from "../auditoria/bitacora";
import { prisma } from "../db";
import { Decimal, d, pesos } from "../dinero";
import type { Periodicidad } from "../fiscal/periodicidad";
import { PARAMETROS_2025, TARIFA_ISR_MENSUAL_2025 } from "../fiscal/tablas2025";
import {
  calcularRecibo,
  type EntradaPeriodo,
  type ParametrosCalculo,
  type ReciboCalculado,
} from "./motor";

export interface Actor {
  id?: string;
  email?: string;
  rol?: string;
  ip?: string | null;
  userAgent?: string | null;
}

/** Lee los parámetros fiscales del ejercicio; si no hay, usa la semilla del código. */
export async function parametrosDelEjercicio(
  ejercicio: number,
  empresaId: string,
): Promise<ParametrosCalculo> {
  const [registros, empresa, tarifa] = await Promise.all([
    prisma.parametroFiscal.findMany({
      where: { ejercicio, OR: [{ empresaId }, { empresaId: null }] },
    }),
    prisma.empresa.findUnique({ where: { id: empresaId } }),
    prisma.tarifaIsr.findMany({
      where: { ejercicio, periodicidad: "MENSUAL" },
      orderBy: { limiteInferior: "asc" },
    }),
  ]);

  const valor = (clave: string, porDefecto: number) => {
    const especifico = registros.find((r) => r.clave === clave && r.empresaId === empresaId);
    const general = registros.find((r) => r.clave === clave);
    return Number((especifico ?? general)?.valor ?? porDefecto);
  };

  return {
    ejercicio,
    umaDiaria: valor("UMA_DIARIA", PARAMETROS_2025.UMA_DIARIA),
    umaMensual: valor("UMA_MENSUAL", PARAMETROS_2025.UMA_MENSUAL),
    salarioMinimo: valor("SALARIO_MINIMO_GENERAL", PARAMETROS_2025.SALARIO_MINIMO_GENERAL),
    primaRiesgoTrabajo: Number(empresa?.primaRiesgoTrabajo ?? 0.005),
    impuestoSobreNominas: valor(
      "IMPUESTO_SOBRE_NOMINAS",
      PARAMETROS_2025.IMPUESTO_SOBRE_NOMINAS,
    ),
    subsidio: {
      porcentajeUma: valor("SUBSIDIO_PORCENTAJE_UMA", PARAMETROS_2025.SUBSIDIO_PORCENTAJE_UMA),
      ingresoTopeMensual: valor(
        "SUBSIDIO_INGRESO_TOPE_MENSUAL",
        PARAMETROS_2025.SUBSIDIO_INGRESO_TOPE_MENSUAL,
      ),
    },
    tarifaMensual:
      tarifa.length > 0
        ? tarifa.map((r) => ({
            limiteInferior: Number(r.limiteInferior),
            limiteSuperior: r.limiteSuperior === null ? null : Number(r.limiteSuperior),
            cuotaFija: Number(r.cuotaFija),
            porcentaje: Number(r.porcentaje),
          }))
        : TARIFA_ISR_MENSUAL_2025,
  };
}

const TIPOS_INCAPACIDAD = new Set([
  "INCAPACIDAD_ENFERMEDAD",
  "INCAPACIDAD_RIESGO",
  "INCAPACIDAD_MATERNIDAD",
]);

export function entradaDesdeIncidencias(
  periodo: PeriodoNomina,
  incidencias: Incidencia[],
): EntradaPeriodo {
  const total = (tipo: string) =>
    incidencias
      .filter((i) => i.tipo === tipo)
      .reduce((acc, i) => acc + Number(i.cantidad), 0);

  return {
    diasPago: periodo.diasPeriodo,
    diasNaturales: Math.round(
      (periodo.fechaFin.getTime() - periodo.fechaInicio.getTime()) / 86400000 + 1,
    ),
    faltas: total("FALTA"),
    diasIncapacidad: incidencias
      .filter((i) => TIPOS_INCAPACIDAD.has(i.tipo))
      .reduce((acc, i) => acc + Number(i.cantidad), 0),
    diasPermisoSinGoce: total("PERMISO_SIN_GOCE"),
    diasVacaciones: total("VACACIONES"),
    horasExtraDobles: total("HORAS_EXTRA_DOBLES"),
    horasExtraTriples: total("HORAS_EXTRA_TRIPLES"),
    domingosLaborados: total("PRIMA_DOMINICAL"),
    diasDescansoTrabajados: total("DIA_DESCANSO_TRABAJADO"),
    diasFestivosTrabajados: total("DIA_FESTIVO_TRABAJADO"),
  };
}

const REGIMENES_SIN_IMSS = new Set([
  "ASIMILADOS_MIEMBROS_SOCIEDADES",
  "ASIMILADOS_COMISIONISTAS",
  "ASIMILADOS_HONORARIOS",
  "ASIMILADOS_ACCIONES",
  "ASIMILADOS_OTROS",
]);

function aEmpleadoCalculo(empleado: Empleado) {
  return {
    id: empleado.id,
    nombre: `${empleado.nombre} ${empleado.apellidoPaterno}`,
    periodicidad: empleado.periodicidad as Periodicidad,
    salarioDiario: empleado.salarioDiario.toString(),
    salarioBaseCotizacion: empleado.salarioBaseCotizacion.toString(),
    primaVacacionalPct: empleado.primaVacacionalPct.toString(),
    causaImss: !REGIMENES_SIN_IMSS.has(empleado.regimen),
    aplicaSubsidio: empleado.regimen === "SUELDOS_SALARIOS",
    descuentoInfonavitTipo: empleado.descuentoInfonavitTipo as
      | "PORCENTAJE"
      | "CUOTA_FIJA"
      | "VSM"
      | null,
    descuentoInfonavitValor: empleado.descuentoInfonavitValor?.toString() ?? null,
    pensionAlimenticiaTipo: empleado.pensionAlimenticiaTipo as
      | "PORCENTAJE"
      | "CUOTA_FIJA"
      | null,
    pensionAlimenticiaValor: empleado.pensionAlimenticiaValor?.toString() ?? null,
  };
}

export interface ResultadoCorrida {
  corridaId: string;
  recibos: number;
  totalNeto: Decimal;
}

/**
 * Calcula (o recalcula) la corrida de nómina de un periodo.
 * Una corrida autorizada, timbrada o pagada no se puede recalcular.
 */
export async function calcularCorrida(
  empresaId: string,
  periodoId: string,
  actor: Actor,
): Promise<ResultadoCorrida> {
  const periodo = await prisma.periodoNomina.findUniqueOrThrow({ where: { id: periodoId } });
  const parametros = await parametrosDelEjercicio(periodo.ejercicio, empresaId);

  const existente = await prisma.corridaNomina.findUnique({
    where: { empresaId_periodoId: { empresaId, periodoId } },
  });
  if (existente && existente.estado !== "BORRADOR" && existente.estado !== "CALCULADA") {
    throw new Error(
      `La corrida está en estado ${existente.estado} y ya no puede recalcularse.`,
    );
  }

  const empleados = await prisma.empleado.findMany({
    where: {
      empresaId,
      periodicidad: periodo.periodicidad,
      estado: { in: ["ACTIVO", "INCAPACIDAD", "PERMISO"] },
      fechaIngreso: { lte: periodo.fechaFin },
      OR: [{ fechaBaja: null }, { fechaBaja: { gte: periodo.fechaInicio } }],
    },
    include: {
      incidencias: {
        where: {
          fechaInicio: { lte: periodo.fechaFin },
          fechaFin: { gte: periodo.fechaInicio },
        },
      },
    },
  });

  const calculados: { empleado: Empleado; recibo: ReciboCalculado }[] = empleados.map(
    (empleado) => ({
      empleado,
      recibo: calcularRecibo(
        aEmpleadoCalculo(empleado),
        entradaDesdeIncidencias(periodo, empleado.incidencias),
        parametros,
      ),
    }),
  );

  const totales = calculados.reduce(
    (acc, { recibo }) => ({
      percepciones: acc.percepciones.plus(recibo.totalPercepciones),
      deducciones: acc.deducciones.plus(recibo.totalDeducciones),
      otrosPagos: acc.otrosPagos.plus(recibo.totalOtrosPagos),
      neto: acc.neto.plus(recibo.neto),
      cuotasPatron: acc.cuotasPatron.plus(recibo.imssPatron),
    }),
    {
      percepciones: d(0),
      deducciones: d(0),
      otrosPagos: d(0),
      neto: d(0),
      cuotasPatron: d(0),
    },
  );

  const corridaId = await prisma.$transaction(async (tx) => {
    const corrida = await tx.corridaNomina.upsert({
      where: { empresaId_periodoId: { empresaId, periodoId } },
      create: {
        empresaId,
        periodoId,
        estado: "CALCULADA",
        creadaPorId: actor.id ?? null,
        totalPercepciones: pesos(totales.percepciones).toFixed(2),
        totalDeducciones: pesos(totales.deducciones).toFixed(2),
        totalOtrosPagos: pesos(totales.otrosPagos).toFixed(2),
        totalNeto: pesos(totales.neto).toFixed(2),
        totalCuotasPatron: pesos(totales.cuotasPatron).toFixed(2),
        parametrosSnapshot: JSON.parse(JSON.stringify(parametros)) as Prisma.InputJsonValue,
      },
      update: {
        estado: "CALCULADA",
        totalPercepciones: pesos(totales.percepciones).toFixed(2),
        totalDeducciones: pesos(totales.deducciones).toFixed(2),
        totalOtrosPagos: pesos(totales.otrosPagos).toFixed(2),
        totalNeto: pesos(totales.neto).toFixed(2),
        totalCuotasPatron: pesos(totales.cuotasPatron).toFixed(2),
        parametrosSnapshot: JSON.parse(JSON.stringify(parametros)) as Prisma.InputJsonValue,
      },
    });

    await tx.recibo.deleteMany({ where: { corridaId: corrida.id } });

    for (const { empleado, recibo } of calculados) {
      await tx.recibo.create({
        data: {
          corridaId: corrida.id,
          empleadoId: empleado.id,
          diasPagados: recibo.diasPagados.toFixed(4),
          salarioDiario: empleado.salarioDiario,
          salarioBaseCotizacion: empleado.salarioBaseCotizacion,
          totalPercepciones: recibo.totalPercepciones.toFixed(2),
          totalDeducciones: recibo.totalDeducciones.toFixed(2),
          totalOtrosPagos: recibo.totalOtrosPagos.toFixed(2),
          totalGravado: recibo.totalGravado.toFixed(2),
          totalExento: recibo.totalExento.toFixed(2),
          isrRetenido: recibo.isrRetenido.toFixed(2),
          subsidioCausado: recibo.subsidioCausado.toFixed(2),
          subsidioEntregado: recibo.subsidioEntregado.toFixed(2),
          imssObrero: recibo.imssObrero.toFixed(2),
          imssPatron: recibo.imssPatron.toFixed(2),
          infonavitPatron: recibo.infonavitPatron.toFixed(2),
          retiroCesantiaVejez: recibo.retiroCesantiaVejez.toFixed(2),
          impuestoEstatalNomina: recibo.impuestoEstatalNomina.toFixed(2),
          neto: recibo.neto.toFixed(2),
          memoriaCalculo: recibo.memoria as Prisma.InputJsonValue,
          conceptos: {
            create: recibo.conceptos.map((concepto, orden) => ({
              tipo: concepto.tipo,
              claveSat: concepto.claveSat,
              clave: concepto.clave,
              concepto: concepto.concepto,
              importeGravado: concepto.gravado.toFixed(2),
              importeExento: concepto.exento.toFixed(2),
              importe: concepto.importe.toFixed(2),
              orden,
            })),
          },
        },
      });
    }

    return corrida.id;
  });

  await registrarEvento({
    empresaId,
    actorId: actor.id,
    actorEmail: actor.email,
    actorRol: actor.rol,
    accion: "CORRIDA_CALCULADA",
    entidad: "CorridaNomina",
    entidadId: corridaId,
    datosDespues: {
      periodoId,
      ejercicio: periodo.ejercicio,
      periodicidad: periodo.periodicidad,
      numero: periodo.numero,
      recibos: calculados.length,
      totalNeto: pesos(totales.neto).toFixed(2),
      totalPercepciones: pesos(totales.percepciones).toFixed(2),
      totalDeducciones: pesos(totales.deducciones).toFixed(2),
    },
    ip: actor.ip,
    userAgent: actor.userAgent,
  });

  return { corridaId, recibos: calculados.length, totalNeto: pesos(totales.neto) };
}

const TRANSICIONES: Record<EstadoCorrida, EstadoCorrida[]> = {
  BORRADOR: ["CALCULADA", "CANCELADA"],
  CALCULADA: ["AUTORIZADA", "BORRADOR", "CANCELADA"],
  AUTORIZADA: ["TIMBRADA", "PAGADA", "CANCELADA"],
  TIMBRADA: ["PAGADA", "CANCELADA"],
  PAGADA: [],
  CANCELADA: [],
};

/** Cambia el estado de la corrida validando la máquina de estados y deja rastro. */
export async function cambiarEstadoCorrida(
  corridaId: string,
  nuevoEstado: EstadoCorrida,
  actor: Actor,
) {
  const corrida = await prisma.corridaNomina.findUniqueOrThrow({ where: { id: corridaId } });
  const permitidos = TRANSICIONES[corrida.estado] ?? [];
  if (!permitidos.includes(nuevoEstado)) {
    throw new Error(`Transición no permitida: ${corrida.estado} → ${nuevoEstado}.`);
  }
  if (nuevoEstado === "AUTORIZADA" && actor.rol !== "ADMIN") {
    throw new Error("Solo un usuario con rol ADMIN puede autorizar la nómina.");
  }

  const actualizada = await prisma.corridaNomina.update({
    where: { id: corridaId },
    data: {
      estado: nuevoEstado,
      autorizadaPorId: nuevoEstado === "AUTORIZADA" ? actor.id ?? null : corrida.autorizadaPorId,
      autorizadaEn: nuevoEstado === "AUTORIZADA" ? new Date() : corrida.autorizadaEn,
      pagadaEn: nuevoEstado === "PAGADA" ? new Date() : corrida.pagadaEn,
    },
  });

  await registrarEvento({
    empresaId: corrida.empresaId,
    actorId: actor.id,
    actorEmail: actor.email,
    actorRol: actor.rol,
    accion: `CORRIDA_${nuevoEstado}`,
    entidad: "CorridaNomina",
    entidadId: corridaId,
    datosAntes: { estado: corrida.estado },
    datosDespues: { estado: nuevoEstado },
    ip: actor.ip,
    userAgent: actor.userAgent,
  });

  return actualizada;
}
