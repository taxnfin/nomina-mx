import { Decimal, d, maximo, minimo, pesos } from "../dinero";
import { CESANTIA_VEJEZ_PATRON_2025, CUOTAS_IMSS, PARAMETROS_2025 } from "./tablas2025";

export interface ConceptoCuota {
  ramo: string;
  base: Decimal;
  porcentaje: Decimal;
  patron: Decimal;
  obrero: Decimal;
}

export interface CuotasImss {
  sbcTopado: Decimal;
  diasCotizados: number;
  conceptos: ConceptoCuota[];
  totalObrero: Decimal;
  totalPatron: Decimal;
  /** Aportación patronal al INFONAVIT (5% del SBC por días cotizados). */
  infonavitPatron: Decimal;
  retiro: Decimal;
  cesantiaVejezPatron: Decimal;
}

export interface ParametrosImss {
  umaDiaria: number;
  primaRiesgoTrabajo: number;
  cuotas?: typeof CUOTAS_IMSS;
  tablaCesantiaVejez?: readonly { hastaUma: number | null; porcentaje: number }[];
}

/** Porcentaje patronal de cesantía y vejez según el SBC expresado en UMA. */
export function porcentajeCesantiaVejezPatron(
  sbc: Decimal.Value,
  umaDiaria: number,
  tabla: readonly { hastaUma: number | null; porcentaje: number }[] = CESANTIA_VEJEZ_PATRON_2025,
): Decimal {
  const veces = d(sbc).div(umaDiaria);
  for (const renglon of tabla) {
    if (renglon.hastaUma === null || veces.lte(renglon.hastaUma)) {
      return d(renglon.porcentaje);
    }
  }
  return d(tabla[tabla.length - 1].porcentaje);
}

/** Tope legal del salario base de cotización: 25 UMA (Art. 28 LSS). */
export function topeSbc(sbc: Decimal.Value, umaDiaria: number): Decimal {
  return minimo(d(sbc), d(umaDiaria).times(CUOTAS_IMSS.TOPE_SBC_UMA));
}

/**
 * Cuotas obrero-patronales del IMSS e INFONAVIT del periodo.
 * Todas las bases se calculan sobre el SBC topado por los días cotizados.
 */
export function calcularCuotasImss(
  sbc: Decimal.Value,
  diasCotizados: number,
  parametros: ParametrosImss,
): CuotasImss {
  const cuotas = parametros.cuotas ?? CUOTAS_IMSS;
  const uma = d(parametros.umaDiaria);
  const sbcTopado = topeSbc(sbc, parametros.umaDiaria);
  const dias = d(diasCotizados);
  const baseTotal = sbcTopado.times(dias);
  const conceptos: ConceptoCuota[] = [];

  const agregar = (
    ramo: string,
    base: Decimal,
    porcentajePatron: Decimal.Value,
    porcentajeObrero: Decimal.Value,
  ) => {
    conceptos.push({
      ramo,
      base: pesos(base),
      porcentaje: d(porcentajePatron).plus(porcentajeObrero),
      patron: pesos(base.times(porcentajePatron)),
      obrero: pesos(base.times(porcentajeObrero)),
    });
  };

  // Enfermedades y maternidad, prestaciones en especie: cuota fija sobre UMA.
  agregar(
    "Enfermedades y maternidad — cuota fija",
    uma.times(dias),
    cuotas.ENFERMEDAD_MATERNIDAD_CUOTA_FIJA,
    0,
  );

  // Excedente de 3 UMA del SBC.
  const excedente = maximo(sbcTopado.minus(uma.times(cuotas.UMA_EXENTAS_EXCEDENTE)), 0).times(dias);
  agregar(
    "Enfermedades y maternidad — excedente 3 UMA",
    excedente,
    cuotas.ENFERMEDAD_MATERNIDAD_EXCEDENTE_PATRON,
    cuotas.ENFERMEDAD_MATERNIDAD_EXCEDENTE_OBRERO,
  );

  agregar(
    "Enfermedades y maternidad — prestaciones en dinero",
    baseTotal,
    cuotas.PRESTACIONES_DINERO_PATRON,
    cuotas.PRESTACIONES_DINERO_OBRERO,
  );

  agregar(
    "Gastos médicos para pensionados",
    baseTotal,
    cuotas.GASTOS_MEDICOS_PENSIONADOS_PATRON,
    cuotas.GASTOS_MEDICOS_PENSIONADOS_OBRERO,
  );

  agregar("Riesgos de trabajo", baseTotal, parametros.primaRiesgoTrabajo, 0);

  agregar(
    "Invalidez y vida",
    baseTotal,
    cuotas.INVALIDEZ_VIDA_PATRON,
    cuotas.INVALIDEZ_VIDA_OBRERO,
  );

  agregar("Guarderías y prestaciones sociales", baseTotal, cuotas.GUARDERIAS_PATRON, 0);

  agregar("Retiro", baseTotal, cuotas.RETIRO_PATRON, 0);

  const porcentajeCv = porcentajeCesantiaVejezPatron(
    sbcTopado,
    parametros.umaDiaria,
    parametros.tablaCesantiaVejez,
  );
  agregar("Cesantía en edad avanzada y vejez", baseTotal, porcentajeCv, cuotas.CESANTIA_VEJEZ_OBRERO);

  agregar("INFONAVIT — aportación patronal", baseTotal, cuotas.INFONAVIT_PATRON, 0);

  const totalObrero = conceptos.reduce((acc, c) => acc.plus(c.obrero), d(0));
  const totalPatron = conceptos.reduce((acc, c) => acc.plus(c.patron), d(0));

  return {
    sbcTopado,
    diasCotizados,
    conceptos,
    totalObrero: pesos(totalObrero),
    totalPatron: pesos(totalPatron),
    infonavitPatron: pesos(baseTotal.times(cuotas.INFONAVIT_PATRON)),
    retiro: pesos(baseTotal.times(cuotas.RETIRO_PATRON)),
    cesantiaVejezPatron: pesos(baseTotal.times(porcentajeCv)),
  };
}

/**
 * Salario base de cotización integrado (Art. 27 y 30 LSS) para salario fijo.
 * Factor de integración = (365 + aguinaldo + vacaciones × prima) / 365.
 */
export function factorIntegracion(
  diasAguinaldo: number,
  diasVacaciones: number,
  primaVacacional: number,
): Decimal {
  return d(365)
    .plus(diasAguinaldo)
    .plus(d(diasVacaciones).times(primaVacacional))
    .div(365);
}

export function salarioBaseCotizacion(
  salarioDiario: Decimal.Value,
  diasAguinaldo: number,
  diasVacaciones: number,
  primaVacacional: number,
  umaDiaria: number = PARAMETROS_2025.UMA_DIARIA,
): Decimal {
  const integrado = d(salarioDiario).times(
    factorIntegracion(diasAguinaldo, diasVacaciones, primaVacacional),
  );
  return pesos(topeSbc(integrado, umaDiaria));
}

/** Descuento INFONAVIT del periodo según el tipo de crédito. */
export function descuentoInfonavit(
  tipo: "PORCENTAJE" | "CUOTA_FIJA" | "VSM" | null | undefined,
  valor: Decimal.Value | null | undefined,
  opciones: {
    salarioBaseCotizacion: Decimal.Value;
    diasPeriodo: number;
    umaDiaria: number;
    /** Bimestre completo: el descuento en VSM se prorratea a días. */
  },
): Decimal {
  if (!tipo || valor === null || valor === undefined) return d(0);
  const monto = d(valor);
  switch (tipo) {
    case "PORCENTAJE":
      return pesos(d(opciones.salarioBaseCotizacion).times(opciones.diasPeriodo).times(monto));
    case "CUOTA_FIJA":
      return pesos(monto);
    case "VSM":
      // Veces la UMA mensual, prorrateada a los días del periodo.
      return pesos(monto.times(opciones.umaDiaria).times(opciones.diasPeriodo));
    default:
      return d(0);
  }
}
