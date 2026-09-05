import { prisma } from "../db";
import { d, pesos, type Decimal } from "../dinero";
import { isnAplicable, type IsnAplicable } from "../fiscal/configuracion-isn";
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

export interface ObligacionesDelMes {
  ejercicio: number;
  mes: number;
  corridas: { id: string; descripcion: string; estado: string; fechaPago: Date }[];
  cedula: CedulaSipare;
  isr: ResumenEntero;
  isn: IsnAplicable;
  baseIsn: Decimal;
  totalIsn: Decimal;
  /**
   * Erogaciones de empleados registrados en otra entidad: se declaran ante ese
   * estado, por lo que quedan fuera de la base de la empresa.
   */
  otrasEntidades: IsnPorEntidad[];
}

export interface IsnPorEntidad {
  clave: string;
  nombre: string;
  tasa: number;
  sobretasa: number;
  baseIsn: Decimal;
  isn: Decimal;
}

/**
 * El ISN lo causa cada entidad por separado, así que las erogaciones de los
 * empleados registrados fuera del estado de la empresa se determinan con la
 * tasa del catálogo de su propia entidad.
 */
export function isnDeOtrasEntidades(
  recibos: { clave: string; baseIsn: Decimal.Value }[],
): IsnPorEntidad[] {
  const porEntidad = new Map<string, Decimal>();
  for (const recibo of recibos) {
    porEntidad.set(recibo.clave, (porEntidad.get(recibo.clave) ?? d(0)).plus(recibo.baseIsn));
  }

  return [...porEntidad.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([clave, base]) => {
      const catalogo = entidadIsn(clave);
      const tasa = catalogo?.tasa ?? PARAMETROS_2025.IMPUESTO_SOBRE_NOMINAS;
      const sobretasa = catalogo?.sobretasa ?? 0;
      const causado = base.times(tasa);
      return {
        clave,
        nombre: catalogo?.nombre ?? clave,
        tasa,
        sobretasa,
        baseIsn: pesos(base),
        isn: pesos(causado.plus(causado.times(sobretasa))),
      };
    });
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

  const ajenos: { clave: string; baseIsn: string }[] = [];
  const importes = corridas.flatMap((corrida) =>
    corrida.recibos.map((recibo) => {
      const propia = recibo.empleado.claveEntidadFederativa === isn.clave;
      if (!propia) {
        ajenos.push({
          clave: recibo.empleado.claveEntidadFederativa,
          baseIsn: recibo.totalPercepciones.toString(),
        });
      }
      return {
        // El ISR es federal: se entera por la totalidad de los recibos.
        isrRetenido: recibo.isrRetenido.toString(),
        subsidioEntregado: recibo.subsidioEntregado.toString(),
        // El ISN grava las erogaciones por el trabajo personal subordinado.
        baseIsn: propia ? recibo.totalPercepciones.toString() : "0",
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
    otrasEntidades: isnDeOtrasEntidades(ajenos),
  };
}
