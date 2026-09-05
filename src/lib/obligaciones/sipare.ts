/**
 * Cédula de determinación de cuotas para pagar en SIPARE.
 *
 * El SIPARE (Sistema de Pago Referenciado del IMSS) recibe dos cédulas
 * distintas: la mensual con los seguros del IMSS y la bimestral con retiro,
 * cesantía y vejez, la aportación del 5% al INFONAVIT y la amortización de los
 * créditos de vivienda. Aquí se agregan las cuotas ya calculadas en cada recibo
 * (memoria de cálculo) para conciliar contra la emisión del IMSS antes de pagar;
 * la línea de captura la emite el propio SIPARE con la EMA/EBA.
 */

import { Decimal, d, pesos } from "../dinero";

/** Ramos que se enteran en la cédula bimestral y no en la mensual. */
const RAMOS_BIMESTRALES = [
  "Retiro",
  "Cesantía en edad avanzada y vejez",
  "INFONAVIT — aportación patronal",
];

export interface ConceptoCuotaRecibo {
  ramo: string;
  base: Decimal.Value;
  patron: Decimal.Value;
  obrero: Decimal.Value;
}

export interface ReciboSipare {
  empleadoId: string;
  diasCotizados: number;
  conceptos: ConceptoCuotaRecibo[];
  /** Amortización del crédito de vivienda retenida al trabajador. */
  amortizacionInfonavit?: Decimal.Value;
}

export interface RenglonCedula {
  ramo: string;
  base: Decimal;
  patron: Decimal;
  obrero: Decimal;
  total: Decimal;
}

export interface CedulaSipare {
  /** Cuotas del mes: enfermedades y maternidad, riesgos, invalidez y vida, guarderías. */
  mensual: RenglonCedula[];
  /** Cuotas del bimestre: retiro, cesantía y vejez, INFONAVIT y amortizaciones. */
  bimestral: RenglonCedula[];
  totalMensual: Decimal;
  totalBimestral: Decimal;
  totalPatron: Decimal;
  totalObrero: Decimal;
  trabajadores: number;
  diasCotizados: number;
}

function acumular(mapa: Map<string, RenglonCedula>, concepto: ConceptoCuotaRecibo): void {
  const renglon = mapa.get(concepto.ramo) ?? {
    ramo: concepto.ramo,
    base: d(0),
    patron: d(0),
    obrero: d(0),
    total: d(0),
  };
  renglon.base = renglon.base.plus(concepto.base);
  renglon.patron = renglon.patron.plus(concepto.patron);
  renglon.obrero = renglon.obrero.plus(concepto.obrero);
  renglon.total = renglon.patron.plus(renglon.obrero);
  mapa.set(concepto.ramo, renglon);
}

function redondear(renglones: Map<string, RenglonCedula>): RenglonCedula[] {
  return [...renglones.values()].map((renglon) => ({
    ramo: renglon.ramo,
    base: pesos(renglon.base),
    patron: pesos(renglon.patron),
    obrero: pesos(renglon.obrero),
    total: pesos(renglon.total),
  }));
}

export function construirCedulaSipare(recibos: ReciboSipare[]): CedulaSipare {
  const mensual = new Map<string, RenglonCedula>();
  const bimestral = new Map<string, RenglonCedula>();
  const empleados = new Set<string>();
  let diasCotizados = 0;
  let amortizaciones = d(0);

  for (const recibo of recibos) {
    empleados.add(recibo.empleadoId);
    diasCotizados += recibo.diasCotizados;
    amortizaciones = amortizaciones.plus(recibo.amortizacionInfonavit ?? 0);
    for (const concepto of recibo.conceptos) {
      acumular(RAMOS_BIMESTRALES.includes(concepto.ramo) ? bimestral : mensual, concepto);
    }
  }

  if (amortizaciones.gt(0)) {
    acumular(bimestral, {
      ramo: "INFONAVIT — amortización de créditos",
      base: 0,
      patron: 0,
      obrero: amortizaciones,
    });
  }

  const renglonesMensuales = redondear(mensual);
  const renglonesBimestrales = redondear(bimestral);
  const sumar = (renglones: RenglonCedula[], campo: "total" | "patron" | "obrero") =>
    renglones.reduce((acc, renglon) => acc.plus(renglon[campo]), d(0));

  return {
    mensual: renglonesMensuales,
    bimestral: renglonesBimestrales,
    totalMensual: pesos(sumar(renglonesMensuales, "total")),
    totalBimestral: pesos(sumar(renglonesBimestrales, "total")),
    totalPatron: pesos(
      sumar(renglonesMensuales, "patron").plus(sumar(renglonesBimestrales, "patron")),
    ),
    totalObrero: pesos(
      sumar(renglonesMensuales, "obrero").plus(sumar(renglonesBimestrales, "obrero")),
    ),
    trabajadores: empleados.size,
    diasCotizados,
  };
}

export interface ResumenEntero {
  isrRetenido: Decimal;
  subsidioEntregado: Decimal;
  /** Diferencia a enterar al SAT: retenciones menos subsidio entregado en efectivo. */
  isrAEnterar: Decimal;
  baseIsn: Decimal;
  isn: Decimal;
}

/** Concentrado del ISR a enterar y del ISN causado en el periodo. */
export function resumenEnteros(
  recibos: { isrRetenido: Decimal.Value; subsidioEntregado: Decimal.Value; baseIsn: Decimal.Value }[],
  tasaIsn: Decimal.Value,
  sobretasaIsn: Decimal.Value = 0,
): ResumenEntero {
  const isrRetenido = recibos.reduce((acc, r) => acc.plus(r.isrRetenido), d(0));
  const subsidioEntregado = recibos.reduce((acc, r) => acc.plus(r.subsidioEntregado), d(0));
  const baseIsn = recibos.reduce((acc, r) => acc.plus(r.baseIsn), d(0));
  const causado = baseIsn.times(tasaIsn);

  return {
    isrRetenido: pesos(isrRetenido),
    subsidioEntregado: pesos(subsidioEntregado),
    isrAEnterar: pesos(Decimal.max(isrRetenido.minus(subsidioEntregado), 0)),
    baseIsn: pesos(baseIsn),
    isn: pesos(causado.plus(causado.times(sobretasaIsn))),
  };
}
