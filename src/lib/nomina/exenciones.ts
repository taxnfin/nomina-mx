import { Decimal, d, maximo, minimo, pesos } from "../dinero";

/**
 * Exenciones del Art. 93 LISR expresadas en UMA.
 * El sistema separa siempre importe gravado e importe exento por concepto,
 * porque el CFDI de nómina 1.2 exige ese desglose.
 */
export const LIMITES_EXENCION_UMA = {
  AGUINALDO: 30,
  PRIMA_VACACIONAL: 15,
  PTU: 15,
  PRIMA_DOMINICAL_POR_DOMINGO: 1,
  /** Tope semanal de la exención de horas extra. */
  HORAS_EXTRA_SEMANAL: 5,
  /** Exención por año de servicio en pagos por separación. */
  SEPARACION_POR_ANIO: 90,
  PRIMA_ANTIGUEDAD_POR_ANIO: 90,
} as const;

export interface Partida {
  gravado: Decimal;
  exento: Decimal;
  total: Decimal;
}

export function partida(total: Decimal.Value, exento: Decimal.Value = 0): Partida {
  const importe = pesos(total);
  const parteExenta = minimo(pesos(exento), importe);
  return {
    total: importe,
    exento: parteExenta,
    gravado: pesos(importe.minus(parteExenta)),
  };
}

export function exencionPorUma(
  importe: Decimal.Value,
  vecesUma: number,
  umaDiaria: Decimal.Value,
): Partida {
  return partida(importe, d(umaDiaria).times(vecesUma));
}

export function exencionAguinaldo(importe: Decimal.Value, umaDiaria: Decimal.Value): Partida {
  return exencionPorUma(importe, LIMITES_EXENCION_UMA.AGUINALDO, umaDiaria);
}

export function exencionPrimaVacacional(
  importe: Decimal.Value,
  umaDiaria: Decimal.Value,
): Partida {
  return exencionPorUma(importe, LIMITES_EXENCION_UMA.PRIMA_VACACIONAL, umaDiaria);
}

export function exencionPtu(importe: Decimal.Value, umaDiaria: Decimal.Value): Partida {
  return exencionPorUma(importe, LIMITES_EXENCION_UMA.PTU, umaDiaria);
}

export function exencionPrimaDominical(
  importe: Decimal.Value,
  domingosLaborados: number,
  umaDiaria: Decimal.Value,
): Partida {
  return partida(
    importe,
    d(umaDiaria)
      .times(LIMITES_EXENCION_UMA.PRIMA_DOMINICAL_POR_DOMINGO)
      .times(domingosLaborados),
  );
}

/**
 * Exención de horas extra (Art. 93-I LISR):
 * - Trabajadores de salario mínimo: 100% exento dentro del límite legal del Art. 66 LFT.
 * - Los demás: 50% exento, con tope de 5 UMA por semana.
 */
export function exencionHorasExtra(
  importe: Decimal.Value,
  opciones: {
    umaDiaria: Decimal.Value;
    semanasDelPeriodo: number;
    esSalarioMinimo: boolean;
  },
): Partida {
  const total = pesos(importe);
  if (opciones.esSalarioMinimo) return partida(total, total);
  const tope = d(opciones.umaDiaria)
    .times(LIMITES_EXENCION_UMA.HORAS_EXTRA_SEMANAL)
    .times(opciones.semanasDelPeriodo);
  return partida(total, minimo(total.times(0.5), tope));
}

/**
 * Exención de pagos por separación (Art. 93-XIII LISR): 90 UMA por cada año de
 * servicio; las fracciones mayores a seis meses cuentan como año completo.
 */
export function exencionSeparacion(
  importe: Decimal.Value,
  aniosServicio: Decimal.Value,
  umaDiaria: Decimal.Value,
): Partida {
  const anios = maximo(d(aniosServicio), 1);
  return partida(
    importe,
    d(umaDiaria).times(LIMITES_EXENCION_UMA.SEPARACION_POR_ANIO).times(anios),
  );
}
