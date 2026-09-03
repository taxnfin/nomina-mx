/**
 * Parámetros y tarifas fiscales del ejercicio 2025.
 *
 * IMPORTANTE: estos valores son la semilla inicial del sistema. Todas las cifras
 * viven además en base de datos (ParametroFiscal, TarifaIsr, TablaSubsidio) y la
 * corrida de nómina guarda un snapshot inmutable de los parámetros que usó, por lo
 * que pueden actualizarse cada ejercicio sin tocar el código. Antes de operar en
 * producción deben cotejarse contra el DOF vigente (Anexo 8 de la RMF, LSS y
 * decretos de subsidio para el empleo).
 */

export const EJERCICIO_SEMILLA = 2025;

export const PARAMETROS_2025 = {
  UMA_DIARIA: 113.14,
  UMA_MENSUAL: 3439.46,
  UMA_ANUAL: 41273.52,
  SALARIO_MINIMO_GENERAL: 278.8,
  SALARIO_MINIMO_ZLFN: 419.88,
  /** Factor oficial que SAT usa para derivar tarifas por periodicidad. */
  DIAS_MES_FISCAL: 30.4,
  /** Subsidio para el empleo: % de la UMA mensual (Decreto DOF 01/05/2024). */
  SUBSIDIO_PORCENTAJE_UMA: 0.1182,
  /** Tope de ingreso mensual para tener derecho al subsidio para el empleo. */
  SUBSIDIO_INGRESO_TOPE_MENSUAL: 9081.0,
  /** Impuesto sobre nóminas estatal (varía por entidad; CDMX 3%). */
  IMPUESTO_SOBRE_NOMINAS: 0.03,
} as const;

/** Tarifa mensual del Art. 96 LISR (Anexo 8 RMF). */
export const TARIFA_ISR_MENSUAL_2025 = [
  { limiteInferior: 0.01, limiteSuperior: 746.04, cuotaFija: 0.0, porcentaje: 0.0192 },
  { limiteInferior: 746.05, limiteSuperior: 6332.05, cuotaFija: 14.32, porcentaje: 0.064 },
  { limiteInferior: 6332.06, limiteSuperior: 11128.01, cuotaFija: 371.83, porcentaje: 0.1088 },
  { limiteInferior: 11128.02, limiteSuperior: 12935.82, cuotaFija: 893.63, porcentaje: 0.16 },
  { limiteInferior: 12935.83, limiteSuperior: 15487.71, cuotaFija: 1182.88, porcentaje: 0.1792 },
  { limiteInferior: 15487.72, limiteSuperior: 31236.49, cuotaFija: 1640.18, porcentaje: 0.2136 },
  { limiteInferior: 31236.5, limiteSuperior: 49233.0, cuotaFija: 5004.12, porcentaje: 0.2352 },
  { limiteInferior: 49233.01, limiteSuperior: 93993.9, cuotaFija: 9236.89, porcentaje: 0.3 },
  { limiteInferior: 93993.91, limiteSuperior: 125325.2, cuotaFija: 22665.17, porcentaje: 0.32 },
  { limiteInferior: 125325.21, limiteSuperior: 375975.61, cuotaFija: 32691.18, porcentaje: 0.34 },
  { limiteInferior: 375975.62, limiteSuperior: null, cuotaFija: 117912.32, porcentaje: 0.35 },
] as const;

/** Tarifa anual del Art. 152 LISR, usada en el cálculo anual y en finiquitos. */
export const TARIFA_ISR_ANUAL_2025 = TARIFA_ISR_MENSUAL_2025.map((renglon) => ({
  limiteInferior: renglon.limiteInferior === 0.01 ? 0.01 : redondear(renglon.limiteInferior * 12),
  limiteSuperior:
    renglon.limiteSuperior === null ? null : redondear(renglon.limiteSuperior * 12),
  cuotaFija: redondear(renglon.cuotaFija * 12),
  porcentaje: renglon.porcentaje,
}));

/**
 * Cuotas obrero-patronales del IMSS (Ley del Seguro Social).
 * Las bases están indicadas por ramo de aseguramiento.
 */
export const CUOTAS_IMSS = {
  /** Cuota fija patronal por día cotizado: % de la UMA diaria (Art. 106-I). */
  ENFERMEDAD_MATERNIDAD_CUOTA_FIJA: 0.204,
  /** Excedente sobre 3 UMA del SBC (Art. 106-II). */
  ENFERMEDAD_MATERNIDAD_EXCEDENTE_PATRON: 0.011,
  ENFERMEDAD_MATERNIDAD_EXCEDENTE_OBRERO: 0.004,
  /** Prestaciones en dinero (Art. 107). */
  PRESTACIONES_DINERO_PATRON: 0.007,
  PRESTACIONES_DINERO_OBRERO: 0.0025,
  /** Gastos médicos para pensionados (Art. 25). */
  GASTOS_MEDICOS_PENSIONADOS_PATRON: 0.0105,
  GASTOS_MEDICOS_PENSIONADOS_OBRERO: 0.00375,
  /** Invalidez y vida (Art. 147). */
  INVALIDEZ_VIDA_PATRON: 0.0175,
  INVALIDEZ_VIDA_OBRERO: 0.00625,
  /** Guarderías y prestaciones sociales (Art. 211). */
  GUARDERIAS_PATRON: 0.01,
  /** Retiro (Art. 168-I). */
  RETIRO_PATRON: 0.02,
  /** Cesantía y vejez a cargo del trabajador (Art. 168-II). */
  CESANTIA_VEJEZ_OBRERO: 0.01125,
  /** Aportación patronal al INFONAVIT (Art. 29-II Ley del INFONAVIT). */
  INFONAVIT_PATRON: 0.05,
  /** Tope del SBC en veces la UMA (Art. 28 LSS). */
  TOPE_SBC_UMA: 25,
  /** Excedente exento del ramo de enfermedad y maternidad, en UMA. */
  UMA_EXENTAS_EXCEDENTE: 3,
} as const;

/**
 * Cuota patronal de cesantía en edad avanzada y vejez: tabla progresiva por SBC
 * expresado en UMA, conforme a la reforma de pensiones (DOF 16/12/2020),
 * etapa correspondiente a 2025.
 */
export const CESANTIA_VEJEZ_PATRON_2025 = [
  { hastaUma: 1.0, porcentaje: 0.0315 },
  { hastaUma: 1.5, porcentaje: 0.04202 },
  { hastaUma: 2.0, porcentaje: 0.04612 },
  { hastaUma: 2.5, porcentaje: 0.05024 },
  { hastaUma: 3.0, porcentaje: 0.05437 },
  { hastaUma: 3.5, porcentaje: 0.05849 },
  { hastaUma: 4.0, porcentaje: 0.06261 },
  { hastaUma: null, porcentaje: 0.06673 },
] as const;

/** Días de vacaciones por año de antigüedad (Art. 76 LFT, reforma 2023). */
export function diasVacacionesPorAntiguedad(aniosCumplidos: number): number {
  if (aniosCumplidos < 1) return 0;
  if (aniosCumplidos === 1) return 12;
  if (aniosCumplidos === 2) return 14;
  if (aniosCumplidos === 3) return 16;
  if (aniosCumplidos === 4) return 18;
  if (aniosCumplidos === 5) return 20;
  // A partir del sexto año se suman dos días por cada bloque de cinco años.
  const bloques = Math.floor((aniosCumplidos - 6) / 5) + 1;
  return 20 + bloques * 2;
}

function redondear(valor: number): number {
  return Math.round(valor * 100) / 100;
}
