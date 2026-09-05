import { prisma } from "../db";
import { d, pesos, type Decimal } from "../dinero";
import { entidadIsn } from "../fiscal/isn";
import { PARAMETROS_2025 } from "../fiscal/tablas2025";
import {
  construirCedulaSipare,
  resumenEnteros,
  type CedulaSipare,
  type ConceptoCuotaRecibo,
  type ResumenEntero,
} from "./sipare";

/** Forma de la memoria de cálculo que guarda el motor para las cuotas del IMSS. */
interface MemoriaImss {
  imss?: {
    diasCotizados?: number;
    conceptos?: { ramo: string; base: string; patron: string; obrero: string }[];
  } | null;
}

export interface EnteroPorEntidad extends ResumenEntero {
  clave: string;
  nombre: string;
  tasa: number;
}

export interface ObligacionesDelMes {
  ejercicio: number;
  mes: number;
  corridas: { id: string; descripcion: string; estado: string; fechaPago: Date }[];
  cedula: CedulaSipare;
  isr: ResumenEntero;
  entidades: EnteroPorEntidad[];
  totalIsn: Decimal;
}

function rangoDelMes(ejercicio: number, mes: number): { desde: Date; hasta: Date } {
  return {
    desde: new Date(Date.UTC(ejercicio, mes, 1)),
    hasta: new Date(Date.UTC(ejercicio, mes + 1, 1)),
  };
}

/**
 * Obligaciones del mes calendario: la cédula se arma con las corridas cuya fecha
 * de pago cae en el mes, que es el criterio con el que se causan el ISR retenido
 * y el ISN.
 */
export async function obligacionesDelMes(
  empresaId: string,
  ejercicio: number,
  mes: number,
): Promise<ObligacionesDelMes> {
  const { desde, hasta } = rangoDelMes(ejercicio, mes);

  const corridas = await prisma.corridaNomina.findMany({
    where: {
      empresaId,
      estado: { not: "CANCELADA" },
      periodo: { fechaPago: { gte: desde, lt: hasta } },
    },
    include: {
      periodo: true,
      recibos: {
        include: {
          empleado: { select: { id: true, claveEntidadFederativa: true } },
          conceptos: { where: { clave: "D010" } },
        },
      },
    },
    orderBy: { creadaEn: "asc" },
  });

  const recibosSipare = corridas.flatMap((corrida) =>
    corrida.recibos.map((recibo) => {
      const memoria = recibo.memoriaCalculo as MemoriaImss | null;
      const conceptos: ConceptoCuotaRecibo[] = (memoria?.imss?.conceptos ?? []).map((concepto) => ({
        ramo: concepto.ramo,
        base: concepto.base,
        patron: concepto.patron,
        obrero: concepto.obrero,
      }));
      return {
        empleadoId: recibo.empleadoId,
        diasCotizados: memoria?.imss?.diasCotizados ?? 0,
        conceptos,
        amortizacionInfonavit: recibo.conceptos.reduce(
          (acc, concepto) => acc.plus(concepto.importe.toString()),
          d(0),
        ),
      };
    }),
  );

  const porEntidad = new Map<
    string,
    { isrRetenido: string; subsidioEntregado: string; baseIsn: string }[]
  >();
  for (const corrida of corridas) {
    for (const recibo of corrida.recibos) {
      const clave = recibo.empleado.claveEntidadFederativa;
      const lista = porEntidad.get(clave) ?? [];
      lista.push({
        isrRetenido: recibo.isrRetenido.toString(),
        subsidioEntregado: recibo.subsidioEntregado.toString(),
        // El ISN grava las erogaciones por el trabajo personal subordinado.
        baseIsn: recibo.totalPercepciones.toString(),
      });
      porEntidad.set(clave, lista);
    }
  }

  const entidades: EnteroPorEntidad[] = [...porEntidad.entries()].map(([clave, recibos]) => {
    const entidad = entidadIsn(clave);
    const tasa = entidad?.tasa ?? PARAMETROS_2025.IMPUESTO_SOBRE_NOMINAS;
    return {
      clave,
      nombre: entidad?.nombre ?? clave,
      tasa,
      ...resumenEnteros(recibos, tasa, entidad?.sobretasa ?? 0),
    };
  });

  const todos = [...porEntidad.values()].flat();

  return {
    ejercicio,
    mes,
    corridas: corridas.map((corrida) => ({
      id: corrida.id,
      descripcion:
        corrida.descripcion ??
        `${corrida.periodo.periodicidad} #${corrida.periodo.numero}`,
      estado: corrida.estado,
      fechaPago: corrida.periodo.fechaPago,
    })),
    cedula: construirCedulaSipare(recibosSipare),
    isr: resumenEnteros(todos, 0),
    entidades,
    totalIsn: pesos(entidades.reduce((acc, entidad) => acc.plus(entidad.isn), d(0))),
  };
}

/** Entidad donde cotiza la mayoría de la plantilla; define el ISN del calendario. */
export async function entidadPrincipal(empresaId: string): Promise<string | null> {
  const agrupado = await prisma.empleado.groupBy({
    by: ["claveEntidadFederativa"],
    where: { empresaId, estado: "ACTIVO" },
    _count: { _all: true },
    orderBy: { _count: { claveEntidadFederativa: "desc" } },
    take: 1,
  });
  return agrupado[0]?.claveEntidadFederativa ?? null;
}
