import { PARAMETROS_2025 } from "./tablas2025";

export type Periodicidad = "SEMANAL" | "CATORCENAL" | "QUINCENAL" | "MENSUAL";

export const PERIODICIDADES: Periodicidad[] = [
  "SEMANAL",
  "CATORCENAL",
  "QUINCENAL",
  "MENSUAL",
];

/** Días de salario que ampara cada periodicidad (base de pago). */
export const DIAS_POR_PERIODICIDAD: Record<Periodicidad, number> = {
  SEMANAL: 7,
  CATORCENAL: 14,
  QUINCENAL: 15,
  MENSUAL: 30,
};

/** Número de periodos en el ejercicio. */
export const PERIODOS_POR_EJERCICIO: Record<Periodicidad, number> = {
  SEMANAL: 52,
  CATORCENAL: 26,
  QUINCENAL: 24,
  MENSUAL: 12,
};

/** Clave del catálogo c_PeriodicidadPago del CFDI de nómina 1.2. */
export const CLAVE_SAT_PERIODICIDAD: Record<Periodicidad, string> = {
  SEMANAL: "02",
  CATORCENAL: "03",
  QUINCENAL: "04",
  MENSUAL: "05",
};

/**
 * Factor con el que se escala la tarifa mensual del Art. 96 LISR para obtener la
 * tarifa de la periodicidad. Es el mismo criterio con el que el SAT construye las
 * tarifas del Anexo 8 (días del periodo entre 30.4).
 */
export function factorPeriodicidad(periodicidad: Periodicidad): number {
  if (periodicidad === "MENSUAL") return 1;
  return DIAS_POR_PERIODICIDAD[periodicidad] / PARAMETROS_2025.DIAS_MES_FISCAL;
}

export interface PeriodoCalendario {
  numero: number;
  fechaInicio: Date;
  fechaFin: Date;
  fechaPago: Date;
  /** Días naturales reales del periodo (base de cotización IMSS). */
  diasNaturales: number;
  /** Días de salario que se pagan en el periodo. */
  diasPago: number;
}

function utc(anio: number, mes: number, dia: number): Date {
  return new Date(Date.UTC(anio, mes, dia));
}

function diasEntre(inicio: Date, fin: Date): number {
  return Math.round((fin.getTime() - inicio.getTime()) / 86400000) + 1;
}

function sumarDias(fecha: Date, dias: number): Date {
  return new Date(fecha.getTime() + dias * 86400000);
}

/**
 * Genera el calendario de periodos del ejercicio.
 *
 * - Quincenal: del 1 al 15 y del 16 al fin de mes; se pagan 15 días fijos, pero la
 *   segunda quincena cotiza ante el IMSS los días naturales reales del mes.
 * - Mensual: mes natural; se pagan 30 días fijos y cotizan los días naturales.
 * - Semanal y catorcenal: bloques corridos de 7 y 14 días a partir del primer
 *   `diaInicioSemana` del ejercicio (0 = domingo).
 */
export function generarPeriodos(
  ejercicio: number,
  periodicidad: Periodicidad,
  opciones: { diaInicioSemana?: number } = {},
): PeriodoCalendario[] {
  if (periodicidad === "QUINCENAL") {
    const periodos: PeriodoCalendario[] = [];
    for (let mes = 0; mes < 12; mes++) {
      const ultimoDia = new Date(Date.UTC(ejercicio, mes + 1, 0)).getUTCDate();
      const primera = { inicio: utc(ejercicio, mes, 1), fin: utc(ejercicio, mes, 15) };
      const segunda = { inicio: utc(ejercicio, mes, 16), fin: utc(ejercicio, mes, ultimoDia) };
      periodos.push({
        numero: mes * 2 + 1,
        fechaInicio: primera.inicio,
        fechaFin: primera.fin,
        fechaPago: primera.fin,
        diasNaturales: 15,
        diasPago: 15,
      });
      periodos.push({
        numero: mes * 2 + 2,
        fechaInicio: segunda.inicio,
        fechaFin: segunda.fin,
        fechaPago: segunda.fin,
        diasNaturales: ultimoDia - 15,
        diasPago: 15,
      });
    }
    return periodos;
  }

  if (periodicidad === "MENSUAL") {
    return Array.from({ length: 12 }, (_, mes) => {
      const ultimoDia = new Date(Date.UTC(ejercicio, mes + 1, 0)).getUTCDate();
      return {
        numero: mes + 1,
        fechaInicio: utc(ejercicio, mes, 1),
        fechaFin: utc(ejercicio, mes, ultimoDia),
        fechaPago: utc(ejercicio, mes, ultimoDia),
        diasNaturales: ultimoDia,
        diasPago: 30,
      };
    });
  }

  const largo = DIAS_POR_PERIODICIDAD[periodicidad];
  const diaInicioSemana = opciones.diaInicioSemana ?? 1;
  let cursor = utc(ejercicio, 0, 1);
  while (cursor.getUTCDay() !== diaInicioSemana) {
    cursor = sumarDias(cursor, 1);
  }
  const periodos: PeriodoCalendario[] = [];
  let numero = 1;
  while (cursor.getUTCFullYear() === ejercicio) {
    const fin = sumarDias(cursor, largo - 1);
    periodos.push({
      numero,
      fechaInicio: cursor,
      fechaFin: fin,
      fechaPago: sumarDias(fin, 0),
      diasNaturales: diasEntre(cursor, fin),
      diasPago: largo,
    });
    cursor = sumarDias(fin, 1);
    numero += 1;
  }
  return periodos;
}
