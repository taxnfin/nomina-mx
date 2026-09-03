import { Decimal, d, maximo, minimo, pesos } from "../dinero";
import { diasVacacionesPorAntiguedad } from "../fiscal/tablas2025";

const MS_DIA = 86400000;

export function diasEntreFechas(inicio: Date, fin: Date): number {
  return Math.max(Math.round((fin.getTime() - inicio.getTime()) / MS_DIA), 0);
}

export function aniosDeServicio(fechaIngreso: Date, fechaCorte: Date): number {
  let anios = fechaCorte.getUTCFullYear() - fechaIngreso.getUTCFullYear();
  const aniversario = new Date(
    Date.UTC(fechaCorte.getUTCFullYear(), fechaIngreso.getUTCMonth(), fechaIngreso.getUTCDate()),
  );
  if (fechaCorte < aniversario) anios -= 1;
  return Math.max(anios, 0);
}

/** Años de servicio contando como año completo la fracción mayor a seis meses. */
export function aniosParaExencion(fechaIngreso: Date, fechaCorte: Date): number {
  const cumplidos = aniosDeServicio(fechaIngreso, fechaCorte);
  const aniversario = new Date(
    Date.UTC(
      fechaIngreso.getUTCFullYear() + cumplidos,
      fechaIngreso.getUTCMonth(),
      fechaIngreso.getUTCDate(),
    ),
  );
  const fraccionDias = diasEntreFechas(aniversario, fechaCorte);
  return fraccionDias > 182 ? cumplidos + 1 : Math.max(cumplidos, 1);
}

/**
 * Aguinaldo (Art. 87 LFT): mínimo 15 días de salario, proporcional a los días
 * trabajados en el ejercicio.
 */
export function calcularAguinaldo(params: {
  salarioDiario: Decimal.Value;
  diasAguinaldo: number;
  fechaIngreso: Date;
  fechaCorte: Date;
  ejercicio: number;
  diasFaltas?: number;
}): { diasProporcionales: Decimal; importe: Decimal; diasTrabajados: number } {
  const inicioEjercicio = new Date(Date.UTC(params.ejercicio, 0, 1));
  const desde = params.fechaIngreso > inicioEjercicio ? params.fechaIngreso : inicioEjercicio;
  const diasTrabajados = Math.max(
    diasEntreFechas(desde, params.fechaCorte) + 1 - (params.diasFaltas ?? 0),
    0,
  );
  const diasProporcionales = d(params.diasAguinaldo).times(diasTrabajados).div(365);
  return {
    diasTrabajados,
    diasProporcionales,
    importe: pesos(diasProporcionales.times(params.salarioDiario)),
  };
}

/** Vacaciones y prima vacacional proporcionales (Art. 76, 79 y 80 LFT). */
export function calcularVacaciones(params: {
  salarioDiario: Decimal.Value;
  fechaIngreso: Date;
  fechaCorte: Date;
  diasExtraPorContrato?: number;
  primaVacacionalPct?: Decimal.Value;
  diasYaDisfrutados?: number;
}): {
  aniosCumplidos: number;
  diasPorLey: number;
  diasProporcionales: Decimal;
  diasPendientes: Decimal;
  importeVacaciones: Decimal;
  importePrima: Decimal;
} {
  const aniosCumplidos = aniosDeServicio(params.fechaIngreso, params.fechaCorte);
  const diasPorLey =
    diasVacacionesPorAntiguedad(aniosCumplidos + 1) + (params.diasExtraPorContrato ?? 0);
  const aniversario = new Date(
    Date.UTC(
      params.fechaIngreso.getUTCFullYear() + aniosCumplidos,
      params.fechaIngreso.getUTCMonth(),
      params.fechaIngreso.getUTCDate(),
    ),
  );
  const diasFraccion = diasEntreFechas(aniversario, params.fechaCorte);
  const diasProporcionales = d(diasPorLey).times(diasFraccion).div(365);
  const diasPendientes = maximo(diasProporcionales.minus(params.diasYaDisfrutados ?? 0), 0);
  const importeVacaciones = pesos(diasPendientes.times(params.salarioDiario));
  const importePrima = pesos(
    importeVacaciones.times(d(params.primaVacacionalPct ?? 0.25)),
  );
  return {
    aniosCumplidos,
    diasPorLey,
    diasProporcionales,
    diasPendientes,
    importeVacaciones,
    importePrima,
  };
}

/**
 * PTU individual (Art. 117-127 LFT): 50% se reparte por días trabajados y 50%
 * por salarios devengados. El tope individual es el mayor entre tres meses de
 * salario y el promedio de la PTU de los últimos tres años (Art. 127-VIII).
 */
export interface TrabajadorPtu {
  empleadoId: string;
  diasTrabajados: number;
  salariosDevengados: Decimal.Value;
  salarioDiario: Decimal.Value;
  promedioPtuTresAnios?: Decimal.Value;
}

export function repartirPtu(
  utilidadRepartible: Decimal.Value,
  trabajadores: TrabajadorPtu[],
): {
  empleadoId: string;
  porDias: Decimal;
  porSalarios: Decimal;
  total: Decimal;
  tope: Decimal;
  importePagable: Decimal;
  excedenteNoPagado: Decimal;
}[] {
  const mitad = d(utilidadRepartible).div(2);
  const totalDias = trabajadores.reduce((acc, t) => acc.plus(t.diasTrabajados), d(0));
  const totalSalarios = trabajadores.reduce((acc, t) => acc.plus(d(t.salariosDevengados)), d(0));

  return trabajadores.map((t) => {
    const porDias = totalDias.gt(0)
      ? pesos(mitad.times(t.diasTrabajados).div(totalDias))
      : d(0);
    const porSalarios = totalSalarios.gt(0)
      ? pesos(mitad.times(d(t.salariosDevengados)).div(totalSalarios))
      : d(0);
    const total = pesos(porDias.plus(porSalarios));
    const tresMeses = d(t.salarioDiario).times(90);
    const tope = pesos(maximo(tresMeses, d(t.promedioPtuTresAnios ?? 0)));
    const importePagable = pesos(minimo(total, tope));
    return {
      empleadoId: t.empleadoId,
      porDias,
      porSalarios,
      total,
      tope,
      importePagable,
      excedenteNoPagado: pesos(total.minus(importePagable)),
    };
  });
}

/** Prima de antigüedad (Art. 162 LFT): 12 días por año, con salario topado a 2 salarios mínimos. */
export function calcularPrimaAntiguedad(params: {
  salarioDiario: Decimal.Value;
  salarioMinimo: Decimal.Value;
  fechaIngreso: Date;
  fechaBaja: Date;
}): { salarioTopado: Decimal; anios: Decimal; importe: Decimal } {
  const tope = d(params.salarioMinimo).times(2);
  const salarioTopado = minimo(d(params.salarioDiario), tope);
  const dias = diasEntreFechas(params.fechaIngreso, params.fechaBaja);
  const anios = d(dias).div(365);
  return {
    salarioTopado,
    anios,
    importe: pesos(salarioTopado.times(12).times(anios)),
  };
}

export { diasVacacionesPorAntiguedad };
