/**
 * Derivación de incidencias de nómina a partir de las checadas del reloj.
 *
 * Reglas aplicadas:
 * - Art. 66 LFT: la jornada extraordinaria no puede exceder tres horas diarias
 *   ni tres veces por semana; el excedente se paga triple.
 * - Art. 68 LFT: las primeras nueve horas extra de la semana se pagan al doble;
 *   las que exceden ese límite, al triple.
 * - Un día laborable sin checada de entrada se considera falta (Art. 47 LFT),
 *   descontable del periodo.
 */

export type TipoChecada = "ENTRADA" | "SALIDA" | "INICIO_COMIDA" | "FIN_COMIDA";

export interface ChecadaEntrada {
  tipo: TipoChecada;
  ocurridoEn: Date;
}

export interface HorarioEmpleado {
  horaEntrada: string;
  horaSalida: string;
  toleranciaMinutos: number;
  /** Días ISO laborables: 1 = lunes … 7 = domingo. */
  diasLaborables: number[];
}

export interface JornadaDia {
  fecha: string;
  entrada: Date | null;
  salida: Date | null;
  horasTrabajadas: number;
  minutosRetardo: number;
  horasExtra: number;
  esLaborable: boolean;
  falta: boolean;
  incompleta: boolean;
}

export interface ResumenAsistencia {
  dias: JornadaDia[];
  faltas: number;
  retardos: number;
  jornadasIncompletas: number;
  horasExtraDobles: number;
  horasExtraTriples: number;
  domingosLaborados: number;
  diasDescansoTrabajados: number;
}

const MS_HORA = 3_600_000;
const MAXIMO_HORAS_EXTRA_DIARIAS = 3;
const LIMITE_SEMANAL_DOBLES = 9;

export function diasLaborablesDesdeTexto(texto: string): number[] {
  return texto
    .split(",")
    .map((parte) => Number(parte.trim()))
    .filter((dia) => Number.isInteger(dia) && dia >= 1 && dia <= 7);
}

export function fechaIso(fecha: Date): string {
  return fecha.toISOString().slice(0, 10);
}

/** Día ISO de la semana en UTC: 1 = lunes … 7 = domingo. */
export function diaIso(fecha: Date): number {
  return fecha.getUTCDay() === 0 ? 7 : fecha.getUTCDay();
}

function conHora(fecha: Date, hhmm: string): Date {
  const [horas, minutos] = hhmm.split(":").map(Number);
  const resultado = new Date(fecha);
  resultado.setUTCHours(horas, minutos, 0, 0);
  return resultado;
}

function redondearHoras(horas: number): number {
  return Math.round(horas * 100) / 100;
}

/** Lunes de la semana ISO a la que pertenece la fecha, como clave agrupadora. */
function claveSemana(fecha: Date): string {
  const lunes = new Date(fecha);
  lunes.setUTCDate(lunes.getUTCDate() - (diaIso(fecha) - 1));
  return fechaIso(lunes);
}

function fechasDelRango(inicio: Date, fin: Date): Date[] {
  const fechas: Date[] = [];
  const cursor = new Date(`${fechaIso(inicio)}T00:00:00.000Z`);
  const limite = new Date(`${fechaIso(fin)}T00:00:00.000Z`);
  while (cursor.getTime() <= limite.getTime()) {
    fechas.push(new Date(cursor));
    cursor.setUTCDate(cursor.getUTCDate() + 1);
  }
  return fechas;
}

/**
 * Empareja las checadas de cada día y resume la asistencia del rango.
 *
 * El tiempo extra se acumula por semana ISO: se pagan al doble hasta nueve
 * horas y al triple el resto, incluyendo el excedente de las tres horas
 * diarias que permite el Art. 66 LFT.
 */
export function resumirAsistencia(
  checadas: ChecadaEntrada[],
  horario: HorarioEmpleado,
  rango: { inicio: Date; fin: Date },
): ResumenAsistencia {
  const porDia = new Map<string, ChecadaEntrada[]>();
  for (const checada of checadas) {
    if (checada.ocurridoEn < rango.inicio || checada.ocurridoEn > rango.fin) continue;
    const clave = fechaIso(checada.ocurridoEn);
    const lista = porDia.get(clave);
    if (lista) lista.push(checada);
    else porDia.set(clave, [checada]);
  }

  const jornadaContractual =
    (conHora(new Date(0), horario.horaSalida).getTime() -
      conHora(new Date(0), horario.horaEntrada).getTime()) /
    MS_HORA;

  const dias: JornadaDia[] = [];
  const extrasPorSemana = new Map<string, number>();

  for (const fecha of fechasDelRango(rango.inicio, rango.fin)) {
    const clave = fechaIso(fecha);
    const delDia = (porDia.get(clave) ?? []).sort(
      (a, b) => a.ocurridoEn.getTime() - b.ocurridoEn.getTime(),
    );
    const esLaborable = horario.diasLaborables.includes(diaIso(fecha));

    const entrada = delDia.find((c) => c.tipo === "ENTRADA")?.ocurridoEn ?? null;
    const salida = [...delDia].reverse().find((c) => c.tipo === "SALIDA")?.ocurridoEn ?? null;

    const inicioComida = delDia.find((c) => c.tipo === "INICIO_COMIDA")?.ocurridoEn ?? null;
    const finComida = delDia.find((c) => c.tipo === "FIN_COMIDA")?.ocurridoEn ?? null;
    const comida =
      inicioComida && finComida && finComida > inicioComida
        ? (finComida.getTime() - inicioComida.getTime()) / MS_HORA
        : 0;

    const horasTrabajadas =
      entrada && salida && salida > entrada
        ? redondearHoras((salida.getTime() - entrada.getTime()) / MS_HORA - comida)
        : 0;

    const entradaEsperada = conHora(fecha, horario.horaEntrada);
    const minutosRetardo =
      esLaborable && entrada
        ? Math.max(
            0,
            Math.round((entrada.getTime() - entradaEsperada.getTime()) / 60000) -
              horario.toleranciaMinutos,
          )
        : 0;

    const extraDia =
      horasTrabajadas > jornadaContractual
        ? redondearHoras(horasTrabajadas - jornadaContractual)
        : 0;

    if (extraDia > 0) {
      const semana = claveSemana(fecha);
      extrasPorSemana.set(semana, (extrasPorSemana.get(semana) ?? 0) + extraDia);
    }

    dias.push({
      fecha: clave,
      entrada,
      salida,
      horasTrabajadas,
      minutosRetardo,
      horasExtra: extraDia,
      esLaborable,
      falta: esLaborable && entrada === null,
      incompleta: entrada !== null && salida === null,
    });
  }

  let dobles = 0;
  let triples = 0;
  for (const fecha of fechasDelRango(rango.inicio, rango.fin)) {
    const dia = dias.find((d) => d.fecha === fechaIso(fecha));
    if (!dia || dia.horasExtra === 0) continue;
    const semana = claveSemana(fecha);
    const acumuladasAntes = dias
      .filter((d) => d.fecha < dia.fecha && claveSemana(new Date(`${d.fecha}T00:00:00.000Z`)) === semana)
      .reduce((total, d) => total + d.horasExtra, 0);

    // El excedente de tres horas diarias (Art. 66 LFT) siempre se paga triple.
    const dentroDelTope = Math.min(dia.horasExtra, MAXIMO_HORAS_EXTRA_DIARIAS);
    const excedenteDiario = redondearHoras(dia.horasExtra - dentroDelTope);
    const cupoDoble = Math.max(0, LIMITE_SEMANAL_DOBLES - acumuladasAntes);
    const aDoble = Math.min(dentroDelTope, cupoDoble);

    dobles += aDoble;
    triples += redondearHoras(dentroDelTope - aDoble) + excedenteDiario;
  }

  const trabajados = dias.filter((d) => d.horasTrabajadas > 0 || d.entrada !== null);

  return {
    dias,
    faltas: dias.filter((d) => d.falta).length,
    retardos: dias.filter((d) => d.minutosRetardo > 0).length,
    jornadasIncompletas: dias.filter((d) => d.incompleta).length,
    horasExtraDobles: redondearHoras(dobles),
    horasExtraTriples: redondearHoras(triples),
    domingosLaborados: trabajados.filter(
      (d) => diaIso(new Date(`${d.fecha}T00:00:00.000Z`)) === 7,
    ).length,
    diasDescansoTrabajados: trabajados.filter((d) => !d.esLaborable).length,
  };
}
