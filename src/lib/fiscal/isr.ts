import { Decimal, d, pesos } from "../dinero";
import {
  DIAS_POR_PERIODICIDAD,
  factorPeriodicidad,
  type Periodicidad,
} from "./periodicidad";
import {
  PARAMETROS_2025,
  TARIFA_ISR_ANUAL_2025,
  TARIFA_ISR_MENSUAL_2025,
} from "./tablas2025";

export interface RenglonTarifa {
  limiteInferior: number;
  limiteSuperior: number | null;
  cuotaFija: number;
  porcentaje: number;
}

export interface DetalleIsr {
  baseGravable: Decimal;
  limiteInferior: Decimal;
  excedente: Decimal;
  porcentaje: Decimal;
  impuestoMarginal: Decimal;
  cuotaFija: Decimal;
  impuestoDeterminado: Decimal;
  subsidioCausado: Decimal;
  /** Positivo = ISR a retener. */
  isrACargo: Decimal;
  /** Positivo = subsidio a entregar en efectivo al trabajador. */
  subsidioAEntregar: Decimal;
}

/**
 * Escala la tarifa mensual del Art. 96 LISR a la periodicidad indicada.
 *
 * Se replica el criterio con el que el SAT construye el Anexo 8: primero se
 * obtiene la tarifa diaria dividiendo entre 30.4 y redondeando a dos decimales,
 * y después se multiplica por los días que ampara el periodo. Hacerlo en un solo
 * paso produce diferencias de centavos contra las tablas publicadas.
 */
export function tarifaPorPeriodicidad(
  periodicidad: Periodicidad,
  tarifaMensual: readonly RenglonTarifa[] = TARIFA_ISR_MENSUAL_2025,
): RenglonTarifa[] {
  if (periodicidad === "MENSUAL") return tarifaMensual.map((r) => ({ ...r }));
  const dias = DIAS_POR_PERIODICIDAD[periodicidad];
  const aPeriodo = (valor: number) =>
    pesos(pesos(d(valor).div(PARAMETROS_2025.DIAS_MES_FISCAL)).times(dias)).toNumber();

  return tarifaMensual.map((renglon, indice) => ({
    limiteInferior: indice === 0 ? 0.01 : aPeriodo(renglon.limiteInferior),
    limiteSuperior: renglon.limiteSuperior === null ? null : aPeriodo(renglon.limiteSuperior),
    cuotaFija: aPeriodo(renglon.cuotaFija),
    porcentaje: renglon.porcentaje,
  }));
}

export function ubicarRenglon(
  base: Decimal.Value,
  tarifa: readonly RenglonTarifa[],
): RenglonTarifa {
  const valor = d(base);
  const renglon = tarifa.find(
    (r) =>
      valor.gte(r.limiteInferior) &&
      (r.limiteSuperior === null || valor.lte(r.limiteSuperior)),
  );
  return renglon ?? tarifa[tarifa.length - 1];
}

/** Aplica una tarifa del Art. 96/152 LISR sobre una base gravable. */
export function impuestoSegunTarifa(
  base: Decimal.Value,
  tarifa: readonly RenglonTarifa[],
): { renglon: RenglonTarifa; excedente: Decimal; marginal: Decimal; impuesto: Decimal } {
  const valor = d(base);
  if (valor.lte(0)) {
    const primero = tarifa[0];
    return {
      renglon: primero,
      excedente: d(0),
      marginal: d(0),
      impuesto: d(0),
    };
  }
  const renglon = ubicarRenglon(valor, tarifa);
  const excedente = valor.minus(renglon.limiteInferior);
  const marginal = pesos(excedente.times(renglon.porcentaje));
  const impuesto = pesos(marginal.plus(renglon.cuotaFija));
  return { renglon, excedente, marginal, impuesto };
}

export interface OpcionesSubsidio {
  /** Porcentaje de la UMA mensual que corresponde de subsidio. */
  porcentajeUma: number;
  umaMensual: number;
  /** Ingreso mensual máximo con derecho al subsidio. */
  ingresoTopeMensual: number;
}

/**
 * Subsidio para el empleo bajo el esquema vigente (importe fijo mensual
 * equivalente a un porcentaje de la UMA, proporcional a la periodicidad de pago).
 */
export function subsidioParaElEmpleo(
  baseGravable: Decimal.Value,
  periodicidad: Periodicidad,
  opciones: OpcionesSubsidio = {
    porcentajeUma: PARAMETROS_2025.SUBSIDIO_PORCENTAJE_UMA,
    umaMensual: PARAMETROS_2025.UMA_MENSUAL,
    ingresoTopeMensual: PARAMETROS_2025.SUBSIDIO_INGRESO_TOPE_MENSUAL,
  },
): Decimal {
  const factor = factorPeriodicidad(periodicidad);
  const topePeriodo = pesos(d(opciones.ingresoTopeMensual).times(factor));
  if (d(baseGravable).gt(topePeriodo)) return d(0);
  return pesos(d(opciones.umaMensual).times(opciones.porcentajeUma).times(factor));
}

export interface CalculoIsrParams {
  baseGravable: Decimal.Value;
  periodicidad: Periodicidad;
  tarifaMensual?: readonly RenglonTarifa[];
  aplicaSubsidio?: boolean;
  opcionesSubsidio?: OpcionesSubsidio;
}

/** ISR a retener del periodo, neto del subsidio para el empleo. */
export function calcularIsrPeriodo({
  baseGravable,
  periodicidad,
  tarifaMensual = TARIFA_ISR_MENSUAL_2025,
  aplicaSubsidio = true,
  opcionesSubsidio,
}: CalculoIsrParams): DetalleIsr {
  const tarifa = tarifaPorPeriodicidad(periodicidad, tarifaMensual);
  const base = pesos(baseGravable);
  const { renglon, excedente, marginal, impuesto } = impuestoSegunTarifa(base, tarifa);
  const subsidio = aplicaSubsidio
    ? subsidioParaElEmpleo(base, periodicidad, opcionesSubsidio)
    : d(0);
  const diferencia = impuesto.minus(subsidio);

  return {
    baseGravable: base,
    limiteInferior: d(renglon.limiteInferior),
    excedente,
    porcentaje: d(renglon.porcentaje),
    impuestoMarginal: marginal,
    cuotaFija: d(renglon.cuotaFija),
    impuestoDeterminado: impuesto,
    subsidioCausado: subsidio,
    isrACargo: diferencia.gt(0) ? pesos(diferencia) : d(0),
    subsidioAEntregar: diferencia.lt(0) ? pesos(diferencia.negated()) : d(0),
  };
}

/**
 * ISR de pagos por separación (Art. 96 penúltimo párrafo LISR y Art. 174 RLISR):
 * se aplica la tasa efectiva del último sueldo mensual ordinario a la parte
 * gravada de la indemnización que exceda del último sueldo mensual ordinario.
 */
export function isrPorSeparacion(
  totalGravado: Decimal.Value,
  ultimoSueldoMensualOrdinario: Decimal.Value,
  tarifaMensual: readonly RenglonTarifa[] = TARIFA_ISR_MENSUAL_2025,
): { tasaEfectiva: Decimal; isr: Decimal; isrUltimoSueldo: Decimal } {
  const sueldo = pesos(ultimoSueldoMensualOrdinario);
  const gravado = pesos(totalGravado);
  if (sueldo.lte(0) || gravado.lte(0)) {
    return { tasaEfectiva: d(0), isr: d(0), isrUltimoSueldo: d(0) };
  }
  const isrUltimoSueldo = impuestoSegunTarifa(sueldo, tarifaMensual).impuesto;
  const tasaEfectiva = isrUltimoSueldo.div(sueldo);
  const excedente = gravado.gt(sueldo) ? gravado.minus(sueldo) : d(0);
  const isrSobreSueldo = gravado.gte(sueldo)
    ? isrUltimoSueldo
    : impuestoSegunTarifa(gravado, tarifaMensual).impuesto;
  return {
    tasaEfectiva,
    isrUltimoSueldo,
    isr: pesos(isrSobreSueldo.plus(excedente.times(tasaEfectiva))),
  };
}

export const TARIFA_ANUAL = TARIFA_ISR_ANUAL_2025;
