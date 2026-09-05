/**
 * Calendario de obligaciones de nómina: fechas límite de entero de ISR retenido,
 * cuotas IMSS mensuales, RCV/INFONAVIT bimestrales, ISN estatal, prestaciones de
 * LFT e informativas de REPSE.
 *
 * Las fechas límite se recorren al siguiente día hábil (Art. 12 CFF) usando los
 * días de descanso obligatorio del Art. 74 LFT. No contempla los días
 * adicionales por sexto dígito del RFC ni los inhábiles publicados por cada
 * autoridad estatal.
 */

export type Autoridad = "SAT" | "IMSS" | "INFONAVIT" | "ESTATAL" | "LFT" | "STPS";

export interface Obligacion {
  clave: string;
  concepto: string;
  /** Periodo que se está pagando o informando. */
  periodo: string;
  fechaLimite: Date;
  autoridad: Autoridad;
  fundamento: string;
}

const MESES = [
  "enero",
  "febrero",
  "marzo",
  "abril",
  "mayo",
  "junio",
  "julio",
  "agosto",
  "septiembre",
  "octubre",
  "noviembre",
  "diciembre",
];

function fechaUtc(anio: number, mes: number, dia: number): Date {
  return new Date(Date.UTC(anio, mes, dia));
}

/** Enésimo lunes del mes (para los descansos móviles del Art. 74 LFT). */
function lunesDelMes(anio: number, mes: number, ocurrencia: number): Date {
  const primero = fechaUtc(anio, mes, 1);
  const desplazamiento = (8 - primero.getUTCDay()) % 7;
  return fechaUtc(anio, mes, 1 + desplazamiento + (ocurrencia - 1) * 7);
}

/** Días de descanso obligatorio del Art. 74 LFT (sin la transmisión del Poder Ejecutivo). */
export function descansosObligatorios(anio: number): Date[] {
  return [
    fechaUtc(anio, 0, 1),
    lunesDelMes(anio, 1, 1),
    lunesDelMes(anio, 2, 3),
    fechaUtc(anio, 4, 1),
    fechaUtc(anio, 8, 16),
    lunesDelMes(anio, 10, 3),
    fechaUtc(anio, 11, 25),
  ];
}

export function esDiaHabil(fecha: Date): boolean {
  const dia = fecha.getUTCDay();
  if (dia === 0 || dia === 6) return false;
  return !descansosObligatorios(fecha.getUTCFullYear()).some(
    (inhabil) => inhabil.getTime() === fecha.getTime(),
  );
}

/** Recorre la fecha al siguiente día hábil cuando cae en sábado, domingo o inhábil. */
export function siguienteDiaHabil(fecha: Date): Date {
  const resultado = new Date(fecha.getTime());
  while (!esDiaHabil(resultado)) {
    resultado.setUTCDate(resultado.getUTCDate() + 1);
  }
  return resultado;
}

/** Fecha límite en el mes siguiente al periodo, recorrida a día hábil. */
export function fechaLimiteMesSiguiente(anio: number, mes: number, dia: number): Date {
  return siguienteDiaHabil(fechaUtc(anio, mes + 1, dia));
}

export interface OpcionesCalendario {
  /** Clave c_Estado de la entidad donde se causa el ISN. */
  entidad?: { nombre: string; diaLimite: number } | null;
  /** Incluye las informativas cuatrimestrales de servicios especializados. */
  tieneRepse?: boolean;
  /** Persona moral: la PTU vence el 30 de mayo; persona física, el 29 de junio. */
  personaMoral?: boolean;
}

export function calendarioDeObligaciones(
  ejercicio: number,
  opciones: OpcionesCalendario = {},
): Obligacion[] {
  const obligaciones: Obligacion[] = [];

  for (let mes = 0; mes < 12; mes += 1) {
    const periodo = `${MESES[mes]} ${ejercicio}`;

    obligaciones.push({
      clave: "ISR_RETENCIONES",
      concepto: "Entero de ISR retenido por salarios y asimilados",
      periodo,
      fechaLimite: fechaLimiteMesSiguiente(ejercicio, mes, 17),
      autoridad: "SAT",
      fundamento: "LISR Art. 96 y CFF Art. 12",
    });

    obligaciones.push({
      clave: "IMSS_MENSUAL",
      concepto: "Cuotas IMSS del mes (EyM, RT, IV, GMP y guarderías)",
      periodo,
      fechaLimite: fechaLimiteMesSiguiente(ejercicio, mes, 17),
      autoridad: "IMSS",
      fundamento: "LSS Art. 39",
    });

    if (opciones.entidad) {
      obligaciones.push({
        clave: "ISN",
        concepto: `Impuesto sobre nóminas — ${opciones.entidad.nombre}`,
        periodo,
        fechaLimite: fechaLimiteMesSiguiente(ejercicio, mes, opciones.entidad.diaLimite),
        autoridad: "ESTATAL",
        fundamento: "Ley de hacienda de la entidad",
      });
    }

    // Los bimestres cierran en meses pares (febrero, abril, …) y se pagan al mes siguiente.
    if (mes % 2 === 1) {
      obligaciones.push({
        clave: "RCV_INFONAVIT",
        concepto: "Retiro, cesantía y vejez e INFONAVIT del bimestre",
        periodo: `${MESES[mes - 1]}-${MESES[mes]} ${ejercicio}`,
        fechaLimite: fechaLimiteMesSiguiente(ejercicio, mes, 17),
        autoridad: "INFONAVIT",
        fundamento: "LSS Art. 39 y Ley del INFONAVIT Art. 35",
      });
    }
  }

  obligaciones.push({
    clave: "AGUINALDO",
    concepto: "Pago de aguinaldo (mínimo 15 días de salario)",
    periodo: `${ejercicio}`,
    fechaLimite: fechaUtc(ejercicio, 11, 20),
    autoridad: "LFT",
    fundamento: "LFT Art. 87",
  });

  obligaciones.push({
    clave: "PTU",
    concepto: "Reparto de utilidades del ejercicio anterior",
    periodo: `${ejercicio - 1}`,
    fechaLimite: siguienteDiaHabil(
      opciones.personaMoral === false ? fechaUtc(ejercicio, 5, 29) : fechaUtc(ejercicio, 4, 30),
    ),
    autoridad: "LFT",
    fundamento: "LFT Art. 122",
  });

  if (opciones.tieneRepse) {
    const cuatrimestres: { periodo: string; anio: number; mes: number }[] = [
      { periodo: `septiembre-diciembre ${ejercicio - 1}`, anio: ejercicio, mes: 0 },
      { periodo: `enero-abril ${ejercicio}`, anio: ejercicio, mes: 4 },
      { periodo: `mayo-agosto ${ejercicio}`, anio: ejercicio, mes: 8 },
    ];
    for (const cuatrimestre of cuatrimestres) {
      obligaciones.push({
        clave: "ICSOE",
        concepto: "Informativa de contratos de servicios especializados (ICSOE)",
        periodo: cuatrimestre.periodo,
        fechaLimite: siguienteDiaHabil(fechaUtc(cuatrimestre.anio, cuatrimestre.mes, 17)),
        autoridad: "IMSS",
        fundamento: "LSS Art. 15-A",
      });
      obligaciones.push({
        clave: "SISUB",
        concepto: "Informativa de subcontratación (SISUB)",
        periodo: cuatrimestre.periodo,
        fechaLimite: siguienteDiaHabil(fechaUtc(cuatrimestre.anio, cuatrimestre.mes, 17)),
        autoridad: "INFONAVIT",
        fundamento: "Ley del INFONAVIT Art. 29 Bis",
      });
    }
  }

  return obligaciones.sort((a, b) => a.fechaLimite.getTime() - b.fechaLimite.getTime());
}
