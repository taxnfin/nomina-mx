import { Decimal, d, pesos } from "../dinero";
import { isrPorSeparacion, impuestoSegunTarifa, type RenglonTarifa } from "../fiscal/isr";
import { TARIFA_ISR_MENSUAL_2025 } from "../fiscal/tablas2025";
import { PERCEPCION } from "./catalogos";
import { exencionAguinaldo, exencionPrimaVacacional, exencionSeparacion, partida } from "./exenciones";
import {
  aniosParaExencion,
  calcularAguinaldo,
  calcularPrimaAntiguedad,
  calcularVacaciones,
  diasEntreFechas,
} from "./prestaciones";

export type TipoSeparacion =
  | "RENUNCIA"
  | "DESPIDO_JUSTIFICADO"
  | "DESPIDO_INJUSTIFICADO"
  | "TERMINO_CONTRATO"
  | "MUTUO_ACUERDO"
  | "DEFUNCION";

export interface ParametrosFiniquito {
  umaDiaria: number;
  salarioMinimo: number;
  tarifaMensual?: readonly RenglonTarifa[];
}

export interface EntradaFiniquito {
  salarioDiario: Decimal.Value;
  /** Salario diario integrado del Art. 89 LFT, base de la indemnización. */
  salarioDiarioIntegrado?: Decimal.Value;
  fechaIngreso: Date;
  fechaBaja: Date;
  tipoSeparacion: TipoSeparacion;
  diasAguinaldo?: number;
  primaVacacionalPct?: Decimal.Value;
  diasVacacionesDisfrutados?: number;
  diasExtraVacaciones?: number;
  /** Días del último periodo aún no pagados. */
  diasPendientesDePago?: number;
  /** Indemnización de 20 días por año (Art. 50-II LFT). */
  incluyeVeinteDiasPorAnio?: boolean;
  otrasDeducciones?: { concepto: string; importe: Decimal.Value }[];
}

export interface ConceptoFiniquito {
  concepto: string;
  claveSat: string;
  base: string;
  importe: Decimal;
  gravado: Decimal;
  exento: Decimal;
}

export interface ResultadoFiniquito {
  tipoSeparacion: TipoSeparacion;
  esLiquidacion: boolean;
  aniosServicio: number;
  conceptos: ConceptoFiniquito[];
  totalPercepciones: Decimal;
  totalGravado: Decimal;
  totalExento: Decimal;
  isrOrdinario: Decimal;
  isrSeparacion: Decimal;
  totalDeducciones: Decimal;
  neto: Decimal;
  memoria: Record<string, unknown>;
}

/**
 * Finiquito y, cuando procede, liquidación (Art. 48, 50, 84, 87, 89 y 162 LFT).
 * El despido injustificado genera además 3 meses de salario integrado y,
 * opcionalmente, 20 días por año de servicio.
 */
export function calcularFiniquito(
  entrada: EntradaFiniquito,
  parametros: ParametrosFiniquito,
): ResultadoFiniquito {
  const tarifa = parametros.tarifaMensual ?? TARIFA_ISR_MENSUAL_2025;
  const salarioDiario = d(entrada.salarioDiario);
  const integrado = d(entrada.salarioDiarioIntegrado ?? entrada.salarioDiario);
  const esLiquidacion = entrada.tipoSeparacion === "DESPIDO_INJUSTIFICADO";
  const aniosExencion = aniosParaExencion(entrada.fechaIngreso, entrada.fechaBaja);
  const diasServicio = diasEntreFechas(entrada.fechaIngreso, entrada.fechaBaja);

  const conceptos: ConceptoFiniquito[] = [];
  const agregar = (
    concepto: string,
    claveSat: string,
    base: string,
    p: { total: Decimal; gravado: Decimal; exento: Decimal },
  ) => {
    if (p.total.lte(0)) return;
    conceptos.push({
      concepto,
      claveSat,
      base,
      importe: p.total,
      gravado: p.gravado,
      exento: p.exento,
    });
  };

  // Días pendientes del último periodo.
  const diasPendientes = d(entrada.diasPendientesDePago ?? 0);
  agregar(
    "Días trabajados no pagados",
    PERCEPCION.SUELDOS,
    `${diasPendientes.toFixed(2)} días × ${salarioDiario.toFixed(2)}`,
    partida(salarioDiario.times(diasPendientes)),
  );

  // Aguinaldo proporcional.
  const aguinaldo = calcularAguinaldo({
    salarioDiario,
    diasAguinaldo: entrada.diasAguinaldo ?? 15,
    fechaIngreso: entrada.fechaIngreso,
    fechaCorte: entrada.fechaBaja,
    ejercicio: entrada.fechaBaja.getUTCFullYear(),
  });
  agregar(
    "Aguinaldo proporcional",
    PERCEPCION.GRATIFICACION_ANUAL,
    `${aguinaldo.diasProporcionales.toFixed(4)} días × ${salarioDiario.toFixed(2)}`,
    exencionAguinaldo(aguinaldo.importe, parametros.umaDiaria),
  );

  // Vacaciones y prima vacacional proporcionales.
  const vacaciones = calcularVacaciones({
    salarioDiario,
    fechaIngreso: entrada.fechaIngreso,
    fechaCorte: entrada.fechaBaja,
    diasExtraPorContrato: entrada.diasExtraVacaciones,
    primaVacacionalPct: entrada.primaVacacionalPct,
    diasYaDisfrutados: entrada.diasVacacionesDisfrutados,
  });
  agregar(
    "Vacaciones proporcionales pendientes",
    PERCEPCION.VACACIONES_NO_DISFRUTADAS,
    `${vacaciones.diasPendientes.toFixed(4)} días × ${salarioDiario.toFixed(2)}`,
    partida(vacaciones.importeVacaciones),
  );
  agregar(
    "Prima vacacional proporcional",
    PERCEPCION.PRIMA_VACACIONAL,
    `${(entrada.primaVacacionalPct ?? 0.25).toString()} × vacaciones proporcionales`,
    exencionPrimaVacacional(vacaciones.importePrima, parametros.umaDiaria),
  );

  // Prima de antigüedad: obligatoria en despido y con 15 años o más en renuncia.
  const antiguedadAnios = d(diasServicio).div(365);
  const procedePrimaAntiguedad =
    entrada.tipoSeparacion === "DESPIDO_INJUSTIFICADO" ||
    entrada.tipoSeparacion === "DESPIDO_JUSTIFICADO" ||
    entrada.tipoSeparacion === "DEFUNCION" ||
    antiguedadAnios.gte(15);
  const primaAntiguedad = calcularPrimaAntiguedad({
    salarioDiario,
    salarioMinimo: parametros.salarioMinimo,
    fechaIngreso: entrada.fechaIngreso,
    fechaBaja: entrada.fechaBaja,
  });

  const conceptosSeparacion: { concepto: string; importe: Decimal; base: string }[] = [];
  if (procedePrimaAntiguedad) {
    conceptosSeparacion.push({
      concepto: "Prima de antigüedad",
      base: `12 días × ${antiguedadAnios.toFixed(4)} años × ${primaAntiguedad.salarioTopado.toFixed(2)} (tope 2 SMG)`,
      importe: primaAntiguedad.importe,
    });
  }
  if (esLiquidacion) {
    conceptosSeparacion.push({
      concepto: "Indemnización constitucional (3 meses)",
      base: `90 días × ${integrado.toFixed(2)} (salario integrado Art. 89 LFT)`,
      importe: pesos(integrado.times(90)),
    });
    if (entrada.incluyeVeinteDiasPorAnio) {
      conceptosSeparacion.push({
        concepto: "Indemnización 20 días por año",
        base: `20 días × ${antiguedadAnios.toFixed(4)} años × ${integrado.toFixed(2)}`,
        importe: pesos(integrado.times(20).times(antiguedadAnios)),
      });
    }
  }

  const totalSeparacion = conceptosSeparacion.reduce((acc, c) => acc.plus(c.importe), d(0));
  const separacionPartida = exencionSeparacion(
    totalSeparacion,
    aniosExencion,
    parametros.umaDiaria,
  );
  // La exención de 90 UMA por año se prorratea entre los conceptos de separación.
  for (const c of conceptosSeparacion) {
    const proporcion = totalSeparacion.gt(0) ? c.importe.div(totalSeparacion) : d(0);
    const exento = pesos(separacionPartida.exento.times(proporcion));
    agregar(c.concepto, PERCEPCION.PAGOS_SEPARACION, c.base, partida(c.importe, exento));
  }

  const totalPercepciones = conceptos.reduce((acc, c) => acc.plus(c.importe), d(0));
  const totalExento = conceptos.reduce((acc, c) => acc.plus(c.exento), d(0));
  const totalGravado = conceptos.reduce((acc, c) => acc.plus(c.gravado), d(0));

  const gravadoSeparacion = conceptos
    .filter((c) => c.claveSat === PERCEPCION.PAGOS_SEPARACION)
    .reduce((acc, c) => acc.plus(c.gravado), d(0));
  const gravadoOrdinario = pesos(totalGravado.minus(gravadoSeparacion));

  const ultimoSueldoMensual = pesos(salarioDiario.times(30.4));
  const isrOrdinario = impuestoSegunTarifa(gravadoOrdinario, tarifa).impuesto;
  const detalleSeparacion = isrPorSeparacion(gravadoSeparacion, ultimoSueldoMensual, tarifa);

  const otras = (entrada.otrasDeducciones ?? []).reduce((acc, o) => acc.plus(d(o.importe)), d(0));
  const totalDeducciones = pesos(isrOrdinario.plus(detalleSeparacion.isr).plus(otras));
  const neto = pesos(totalPercepciones.minus(totalDeducciones));

  return {
    tipoSeparacion: entrada.tipoSeparacion,
    esLiquidacion,
    aniosServicio: aniosExencion,
    conceptos,
    totalPercepciones: pesos(totalPercepciones),
    totalGravado: pesos(totalGravado),
    totalExento: pesos(totalExento),
    isrOrdinario: pesos(isrOrdinario),
    isrSeparacion: detalleSeparacion.isr,
    totalDeducciones,
    neto,
    memoria: {
      diasServicio,
      aniosParaExencion: aniosExencion,
      exencionSeparacion: separacionPartida.exento.toFixed(2),
      tasaEfectivaSeparacion: detalleSeparacion.tasaEfectiva.toFixed(6),
      ultimoSueldoMensualOrdinario: ultimoSueldoMensual.toFixed(2),
      procedePrimaAntiguedad,
      fundamento: [
        "LFT Art. 48 y 50 — indemnización por despido injustificado",
        "LFT Art. 84 y 89 — salario integrado para indemnizaciones",
        "LFT Art. 87 — aguinaldo proporcional",
        "LFT Art. 76, 79 y 80 — vacaciones y prima vacacional proporcionales",
        "LFT Art. 162 — prima de antigüedad",
        "LISR Art. 93-XIII — exención de 90 UMA por año de servicio",
        "RLISR Art. 174 — retención sobre pagos por separación",
      ],
    },
  };
}
