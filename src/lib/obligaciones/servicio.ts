import { prisma } from "../db";
import { d, type Decimal } from "../dinero";
import { isnAplicable, type IsnAplicable } from "../fiscal/configuracion-isn";
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

export interface ObligacionesDelMes {
  ejercicio: number;
  mes: number;
  corridas: { id: string; descripcion: string; estado: string; fechaPago: Date }[];
  cedula: CedulaSipare;
  isr: ResumenEntero;
  isn: IsnAplicable;
  baseIsn: Decimal;
  totalIsn: Decimal;
  /** Entidades de los empleados distintas a la configurada para el ISN. */
  entidadesAjenas: string[];
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

  const empresa = await prisma.empresa.findUniqueOrThrow({ where: { id: empresaId } });
  const isn = isnAplicable({
    claveEntidadIsn: empresa.claveEntidadIsn,
    tasaIsn: empresa.tasaIsn?.toString() ?? null,
    sobretasaIsn: empresa.sobretasaIsn?.toString() ?? null,
    diaLimiteIsn: empresa.diaLimiteIsn,
  });

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

  const entidadesAjenas = new Set<string>();
  const importes = corridas.flatMap((corrida) =>
    corrida.recibos.map((recibo) => {
      if (recibo.empleado.claveEntidadFederativa !== isn.clave) {
        entidadesAjenas.add(recibo.empleado.claveEntidadFederativa);
      }
      return {
        isrRetenido: recibo.isrRetenido.toString(),
        subsidioEntregado: recibo.subsidioEntregado.toString(),
        // El ISN grava las erogaciones por el trabajo personal subordinado.
        baseIsn: recibo.totalPercepciones.toString(),
      };
    }),
  );

  const resumen = resumenEnteros(importes, isn.tasa, isn.sobretasa);

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
    isr: resumen,
    isn,
    baseIsn: resumen.baseIsn,
    totalIsn: resumen.isn,
    entidadesAjenas: [...entidadesAjenas],
  };
}
