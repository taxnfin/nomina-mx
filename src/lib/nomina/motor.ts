import { Decimal, d, maximo, pesos, suma } from "../dinero";
import {
  calcularIsrPeriodo,
  impuestoSegunTarifa,
  tarifaPorPeriodicidad,
  type RenglonTarifa,
} from "../fiscal/isr";
import {
  calcularCuotasImss,
  descuentoInfonavit,
  type CuotasImss,
} from "../fiscal/imss";
import {
  DIAS_POR_PERIODICIDAD,
  factorPeriodicidad,
  type Periodicidad,
} from "../fiscal/periodicidad";
import {
  CUOTAS_IMSS,
  PARAMETROS_2025,
  TARIFA_ISR_MENSUAL_2025,
} from "../fiscal/tablas2025";
import { DEDUCCION, OTRO_PAGO, PERCEPCION } from "./catalogos";
import {
  exencionAguinaldo,
  exencionHorasExtra,
  exencionPrimaDominical,
  exencionPrimaVacacional,
  exencionPtu,
  partida,
  type Partida,
} from "./exenciones";

export interface ParametrosCalculo {
  ejercicio: number;
  umaDiaria: number;
  umaMensual: number;
  salarioMinimo: number;
  primaRiesgoTrabajo: number;
  impuestoSobreNominas: number;
  subsidio: {
    porcentajeUma: number;
    ingresoTopeMensual: number;
  };
  tarifaMensual: readonly RenglonTarifa[];
}

export const PARAMETROS_POR_DEFECTO: ParametrosCalculo = {
  ejercicio: 2025,
  umaDiaria: PARAMETROS_2025.UMA_DIARIA,
  umaMensual: PARAMETROS_2025.UMA_MENSUAL,
  salarioMinimo: PARAMETROS_2025.SALARIO_MINIMO_GENERAL,
  primaRiesgoTrabajo: 0.005,
  impuestoSobreNominas: PARAMETROS_2025.IMPUESTO_SOBRE_NOMINAS,
  subsidio: {
    porcentajeUma: PARAMETROS_2025.SUBSIDIO_PORCENTAJE_UMA,
    ingresoTopeMensual: PARAMETROS_2025.SUBSIDIO_INGRESO_TOPE_MENSUAL,
  },
  tarifaMensual: TARIFA_ISR_MENSUAL_2025,
};

export interface EmpleadoCalculo {
  id: string;
  nombre: string;
  periodicidad: Periodicidad;
  salarioDiario: Decimal.Value;
  salarioBaseCotizacion: Decimal.Value;
  primaVacacionalPct?: Decimal.Value;
  horasJornada?: number;
  aplicaSubsidio?: boolean;
  /** Los asimilados a salarios no causan cuotas obrero-patronales. */
  causaImss?: boolean;
  descuentoInfonavitTipo?: "PORCENTAJE" | "CUOTA_FIJA" | "VSM" | null;
  descuentoInfonavitValor?: Decimal.Value | null;
  pensionAlimenticiaTipo?: "PORCENTAJE" | "CUOTA_FIJA" | null;
  pensionAlimenticiaValor?: Decimal.Value | null;
}

export interface ConceptoAdicional {
  claveSat: string;
  concepto: string;
  gravado?: Decimal.Value;
  exento?: Decimal.Value;
  importe?: Decimal.Value;
}

export interface EntradaPeriodo {
  diasPago: number;
  diasNaturales: number;
  faltas?: number;
  diasIncapacidad?: number;
  diasPermisoSinGoce?: number;
  diasVacaciones?: number;
  horasExtraDobles?: number;
  horasExtraTriples?: number;
  domingosLaborados?: number;
  diasDescansoTrabajados?: number;
  diasFestivosTrabajados?: number;
  aguinaldo?: Decimal.Value;
  ptu?: Decimal.Value;
  percepcionesAdicionales?: ConceptoAdicional[];
  deduccionesAdicionales?: ConceptoAdicional[];
  /** Aplica el procedimiento del Art. 174 RLISR a los pagos extraordinarios. */
  aplicarArt174?: boolean;
}

export interface ConceptoCalculado {
  tipo: "PERCEPCION" | "DEDUCCION" | "OTRO_PAGO";
  claveSat: string;
  clave: string;
  concepto: string;
  gravado: Decimal;
  exento: Decimal;
  importe: Decimal;
}

export interface ReciboCalculado {
  empleadoId: string;
  diasPagados: Decimal;
  diasCotizados: number;
  conceptos: ConceptoCalculado[];
  totalPercepciones: Decimal;
  totalOtrosPagos: Decimal;
  totalDeducciones: Decimal;
  totalGravado: Decimal;
  totalExento: Decimal;
  isrRetenido: Decimal;
  subsidioCausado: Decimal;
  subsidioEntregado: Decimal;
  imssObrero: Decimal;
  imssPatron: Decimal;
  infonavitPatron: Decimal;
  retiroCesantiaVejez: Decimal;
  impuestoEstatalNomina: Decimal;
  neto: Decimal;
  cuotas: CuotasImss | null;
  memoria: Record<string, unknown>;
}

function valorHora(salarioDiario: Decimal.Value, horasJornada: number): Decimal {
  return d(salarioDiario).div(horasJornada);
}

/**
 * Procedimiento opcional del Art. 174 RLISR para pagos extraordinarios
 * (aguinaldo, PTU, primas): se mensualiza el pago, se obtiene la tasa efectiva
 * del incremento de impuesto y se aplica al ingreso extraordinario gravado.
 */
export function isrArt174(
  gravadoExtraordinario: Decimal.Value,
  gravadoOrdinarioMensual: Decimal.Value,
  tarifaMensual: readonly RenglonTarifa[],
): { tasa: Decimal; isr: Decimal } {
  const extraordinario = pesos(gravadoExtraordinario);
  if (extraordinario.lte(0)) return { tasa: d(0), isr: d(0) };
  const promedioMensual = pesos(extraordinario.div(365).times(30.4));
  const ordinario = pesos(gravadoOrdinarioMensual);
  const isrConPago = impuestoSegunTarifa(ordinario.plus(promedioMensual), tarifaMensual).impuesto;
  const isrSinPago = impuestoSegunTarifa(ordinario, tarifaMensual).impuesto;
  const diferencia = maximo(isrConPago.minus(isrSinPago), 0);
  const tasa = promedioMensual.gt(0) ? diferencia.div(promedioMensual) : d(0);
  return { tasa, isr: pesos(extraordinario.times(tasa)) };
}

/** Calcula el recibo de nómina de un empleado para un periodo. */
export function calcularRecibo(
  empleado: EmpleadoCalculo,
  entrada: EntradaPeriodo,
  parametros: ParametrosCalculo = PARAMETROS_POR_DEFECTO,
): ReciboCalculado {
  const salarioDiario = d(empleado.salarioDiario);
  const horasJornada = empleado.horasJornada ?? 8;
  const faltas = d(entrada.faltas ?? 0);
  const incapacidad = d(entrada.diasIncapacidad ?? 0);
  const permiso = d(entrada.diasPermisoSinGoce ?? 0);
  const ausencias = faltas.plus(incapacidad).plus(permiso);
  const diasPagados = maximo(d(entrada.diasPago).minus(ausencias), 0);
  const diasCotizados = Math.max(
    Math.round(d(entrada.diasNaturales).minus(faltas).minus(incapacidad).toNumber()),
    0,
  );
  const semanasDelPeriodo = d(entrada.diasPago).div(7).toNumber();
  const esSalarioMinimo = salarioDiario.lte(parametros.salarioMinimo);

  const conceptos: ConceptoCalculado[] = [];
  const agregarPercepcion = (
    claveSat: string,
    clave: string,
    concepto: string,
    p: Partida,
  ) => {
    if (p.total.lte(0)) return;
    conceptos.push({
      tipo: "PERCEPCION",
      claveSat,
      clave,
      concepto,
      gravado: p.gravado,
      exento: p.exento,
      importe: p.total,
    });
  };
  const agregarDeduccion = (
    claveSat: string,
    clave: string,
    concepto: string,
    importe: Decimal,
  ) => {
    if (importe.lte(0)) return;
    conceptos.push({
      tipo: "DEDUCCION",
      claveSat,
      clave,
      concepto,
      gravado: d(0),
      exento: d(0),
      importe: pesos(importe),
    });
  };

  // --- Percepciones ordinarias ---
  const sueldo = pesos(salarioDiario.times(diasPagados));
  agregarPercepcion(PERCEPCION.SUELDOS, "P001", "Sueldos, salarios y séptimo día", partida(sueldo));

  const hora = valorHora(salarioDiario, horasJornada);
  const horasDobles = d(entrada.horasExtraDobles ?? 0);
  const horasTriples = d(entrada.horasExtraTriples ?? 0);
  const importeHorasExtra = pesos(
    hora.times(2).times(horasDobles).plus(hora.times(3).times(horasTriples)),
  );
  if (importeHorasExtra.gt(0)) {
    agregarPercepcion(
      PERCEPCION.HORAS_EXTRA,
      "P019",
      "Horas extra",
      exencionHorasExtra(importeHorasExtra, {
        umaDiaria: parametros.umaDiaria,
        semanasDelPeriodo,
        esSalarioMinimo,
      }),
    );
  }

  const domingos = d(entrada.domingosLaborados ?? 0);
  const primaDominical = pesos(salarioDiario.times(0.25).times(domingos));
  if (primaDominical.gt(0)) {
    agregarPercepcion(
      PERCEPCION.PRIMA_DOMINICAL,
      "P020",
      "Prima dominical",
      exencionPrimaDominical(primaDominical, domingos.toNumber(), parametros.umaDiaria),
    );
  }

  // Art. 73 y 75 LFT: pago adicional doble por descanso o festivo laborado.
  const descansoTrabajado = pesos(
    salarioDiario.times(2).times(d(entrada.diasDescansoTrabajados ?? 0)),
  );
  agregarPercepcion(
    PERCEPCION.OTROS_INGRESOS_SALARIOS,
    "P038",
    "Día de descanso trabajado",
    partida(descansoTrabajado),
  );

  const festivoTrabajado = pesos(
    salarioDiario.times(2).times(d(entrada.diasFestivosTrabajados ?? 0)),
  );
  agregarPercepcion(
    PERCEPCION.OTROS_INGRESOS_SALARIOS,
    "P038",
    "Día festivo trabajado",
    partida(festivoTrabajado),
  );

  const diasVacaciones = d(entrada.diasVacaciones ?? 0);
  const primaVacacional = pesos(
    salarioDiario.times(diasVacaciones).times(d(empleado.primaVacacionalPct ?? 0.25)),
  );
  if (primaVacacional.gt(0)) {
    agregarPercepcion(
      PERCEPCION.PRIMA_VACACIONAL,
      "P021",
      "Prima vacacional",
      exencionPrimaVacacional(primaVacacional, parametros.umaDiaria),
    );
  }

  // --- Percepciones extraordinarias ---
  const aguinaldo = entrada.aguinaldo
    ? exencionAguinaldo(entrada.aguinaldo, parametros.umaDiaria)
    : null;
  if (aguinaldo) {
    agregarPercepcion(PERCEPCION.GRATIFICACION_ANUAL, "P002", "Aguinaldo", aguinaldo);
  }
  const ptu = entrada.ptu ? exencionPtu(entrada.ptu, parametros.umaDiaria) : null;
  if (ptu) {
    agregarPercepcion(
      PERCEPCION.PARTICIPACION_UTILIDADES,
      "P003",
      "Participación de los trabajadores en las utilidades",
      ptu,
    );
  }

  for (const extra of entrada.percepcionesAdicionales ?? []) {
    agregarPercepcion(
      extra.claveSat,
      `P${extra.claveSat}`,
      extra.concepto,
      partida(extra.importe ?? suma(extra.gravado ?? 0, extra.exento ?? 0), extra.exento ?? 0),
    );
  }

  const percepciones = conceptos.filter((c) => c.tipo === "PERCEPCION");
  const totalPercepciones = percepciones.reduce((acc, c) => acc.plus(c.importe), d(0));
  const totalExento = percepciones.reduce((acc, c) => acc.plus(c.exento), d(0));
  const totalGravado = percepciones.reduce((acc, c) => acc.plus(c.gravado), d(0));

  // --- ISR ---
  const gravadoExtraordinario = suma(
    aguinaldo?.gravado ?? 0,
    ptu?.gravado ?? 0,
  );
  const usaArt174 = Boolean(entrada.aplicarArt174) && d(gravadoExtraordinario).gt(0);
  const gravadoOrdinario = pesos(d(totalGravado).minus(gravadoExtraordinario));

  const detalleIsr = calcularIsrPeriodo({
    baseGravable: usaArt174 ? gravadoOrdinario : totalGravado,
    periodicidad: empleado.periodicidad,
    tarifaMensual: parametros.tarifaMensual,
    aplicaSubsidio: empleado.aplicaSubsidio ?? true,
    opcionesSubsidio: {
      porcentajeUma: parametros.subsidio.porcentajeUma,
      umaMensual: parametros.umaMensual,
      ingresoTopeMensual: parametros.subsidio.ingresoTopeMensual,
    },
  });

  const art174 = usaArt174
    ? isrArt174(
        gravadoExtraordinario,
        gravadoOrdinario.div(factorPeriodicidad(empleado.periodicidad)),
        parametros.tarifaMensual,
      )
    : null;

  const isrRetenido = pesos(detalleIsr.isrACargo.plus(art174?.isr ?? 0));
  agregarDeduccion(DEDUCCION.ISR, "D002", "ISR retenido", isrRetenido);

  // --- Seguridad social ---
  const causaImss = empleado.causaImss ?? true;
  const cuotas = causaImss
    ? calcularCuotasImss(empleado.salarioBaseCotizacion, diasCotizados, {
        umaDiaria: parametros.umaDiaria,
        primaRiesgoTrabajo: parametros.primaRiesgoTrabajo,
      })
    : null;
  if (cuotas) {
    agregarDeduccion(
      DEDUCCION.SEGURIDAD_SOCIAL,
      "D001",
      "Cuotas obrero IMSS",
      cuotas.totalObrero,
    );
  }

  const infonavit = descuentoInfonavit(
    empleado.descuentoInfonavitTipo,
    empleado.descuentoInfonavitValor,
    {
      salarioBaseCotizacion: empleado.salarioBaseCotizacion,
      diasPeriodo: diasCotizados,
      umaDiaria: parametros.umaDiaria,
    },
  );
  agregarDeduccion(DEDUCCION.CREDITO_INFONAVIT, "D010", "Crédito INFONAVIT", infonavit);

  // La pensión alimenticia se calcula sobre la percepción neta disponible.
  const netoAntesPension = pesos(
    d(totalPercepciones).minus(isrRetenido).minus(cuotas?.totalObrero ?? 0).minus(infonavit),
  );
  let pension = d(0);
  if (empleado.pensionAlimenticiaTipo === "PORCENTAJE") {
    pension = pesos(netoAntesPension.times(d(empleado.pensionAlimenticiaValor ?? 0)));
  } else if (empleado.pensionAlimenticiaTipo === "CUOTA_FIJA") {
    pension = pesos(d(empleado.pensionAlimenticiaValor ?? 0));
  }
  agregarDeduccion(DEDUCCION.PENSION_ALIMENTICIA, "D007", "Pensión alimenticia", pension);

  for (const extra of entrada.deduccionesAdicionales ?? []) {
    agregarDeduccion(extra.claveSat, `D${extra.claveSat}`, extra.concepto, d(extra.importe ?? 0));
  }

  // --- Otros pagos ---
  if (detalleIsr.subsidioAEntregar.gt(0)) {
    conceptos.push({
      tipo: "OTRO_PAGO",
      claveSat: OTRO_PAGO.SUBSIDIO_EMPLEO,
      clave: "O002",
      concepto: "Subsidio para el empleo (efectivamente entregado)",
      gravado: d(0),
      exento: d(0),
      importe: detalleIsr.subsidioAEntregar,
    });
  }

  const totalDeducciones = conceptos
    .filter((c) => c.tipo === "DEDUCCION")
    .reduce((acc, c) => acc.plus(c.importe), d(0));
  const totalOtrosPagos = conceptos
    .filter((c) => c.tipo === "OTRO_PAGO")
    .reduce((acc, c) => acc.plus(c.importe), d(0));

  const neto = pesos(d(totalPercepciones).plus(totalOtrosPagos).minus(totalDeducciones));
  const impuestoEstatalNomina = pesos(
    d(totalPercepciones).times(parametros.impuestoSobreNominas),
  );

  const memoria = {
    parametros: {
      ejercicio: parametros.ejercicio,
      umaDiaria: parametros.umaDiaria,
      salarioMinimo: parametros.salarioMinimo,
      primaRiesgoTrabajo: parametros.primaRiesgoTrabajo,
      subsidio: parametros.subsidio,
      impuestoSobreNominas: parametros.impuestoSobreNominas,
    },
    periodo: {
      periodicidad: empleado.periodicidad,
      diasPago: entrada.diasPago,
      diasNaturales: entrada.diasNaturales,
      ausencias: {
        faltas: faltas.toNumber(),
        incapacidad: incapacidad.toNumber(),
        permisoSinGoce: permiso.toNumber(),
      },
      diasPagados: diasPagados.toNumber(),
      diasCotizados,
    },
    isr: {
      metodo: usaArt174 ? "ART_96_LISR + ART_174_RLISR" : "ART_96_LISR",
      tarifa: `Tarifa mensual escalada por factor ${factorPeriodicidad(empleado.periodicidad).toFixed(6)}`,
      baseGravable: detalleIsr.baseGravable.toFixed(2),
      limiteInferior: detalleIsr.limiteInferior.toFixed(2),
      excedente: detalleIsr.excedente.toFixed(2),
      porcentaje: detalleIsr.porcentaje.toFixed(6),
      impuestoMarginal: detalleIsr.impuestoMarginal.toFixed(2),
      cuotaFija: detalleIsr.cuotaFija.toFixed(2),
      impuestoDeterminado: detalleIsr.impuestoDeterminado.toFixed(2),
      subsidioCausado: detalleIsr.subsidioCausado.toFixed(2),
      isrACargo: detalleIsr.isrACargo.toFixed(2),
      subsidioAEntregar: detalleIsr.subsidioAEntregar.toFixed(2),
      art174: art174
        ? { tasaEfectiva: art174.tasa.toFixed(6), isr: art174.isr.toFixed(2) }
        : null,
    },
    imss: cuotas
      ? {
          sbcTopado: cuotas.sbcTopado.toFixed(2),
          diasCotizados: cuotas.diasCotizados,
          conceptos: cuotas.conceptos.map((c) => ({
            ramo: c.ramo,
            base: c.base.toFixed(2),
            porcentaje: c.porcentaje.toFixed(6),
            patron: c.patron.toFixed(2),
            obrero: c.obrero.toFixed(2),
          })),
          totalObrero: cuotas.totalObrero.toFixed(2),
          totalPatron: cuotas.totalPatron.toFixed(2),
        }
      : null,
    fundamento: [
      "LISR Art. 96 y 152 — retención de ISR por salarios",
      "RLISR Art. 174 — pagos extraordinarios (opcional)",
      "LISR Art. 93 — ingresos exentos (aguinaldo, prima vacacional, PTU, prima dominical, horas extra)",
      "LSS Art. 25, 28, 106, 107, 147, 168 y 211 — cuotas obrero-patronales",
      "Ley del INFONAVIT Art. 29 — aportación patronal y descuento por crédito",
      "LFT Art. 66-68, 73, 75, 76, 80, 87 — horas extra, descansos, vacaciones, prima vacacional y aguinaldo",
    ],
  };

  return {
    empleadoId: empleado.id,
    diasPagados,
    diasCotizados,
    conceptos,
    totalPercepciones: pesos(totalPercepciones),
    totalOtrosPagos: pesos(totalOtrosPagos),
    totalDeducciones: pesos(totalDeducciones),
    totalGravado: pesos(totalGravado),
    totalExento: pesos(totalExento),
    isrRetenido,
    subsidioCausado: detalleIsr.subsidioCausado,
    subsidioEntregado: detalleIsr.subsidioAEntregar,
    imssObrero: cuotas?.totalObrero ?? d(0),
    imssPatron: cuotas?.totalPatron ?? d(0),
    infonavitPatron: cuotas?.infonavitPatron ?? d(0),
    retiroCesantiaVejez: cuotas ? pesos(cuotas.retiro.plus(cuotas.cesantiaVejezPatron)) : d(0),
    impuestoEstatalNomina,
    neto,
    cuotas,
    memoria,
  };
}

export const DIAS_PERIODICIDAD = DIAS_POR_PERIODICIDAD;
export const TOPE_SBC_UMA = CUOTAS_IMSS.TOPE_SBC_UMA;
export { tarifaPorPeriodicidad };
