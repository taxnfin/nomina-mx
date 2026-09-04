import type { OrigenChecada, TipoChecada, TipoIncidencia } from "@prisma/client";
import { registrarEvento } from "../auditoria/bitacora";
import { prisma } from "../db";
import type { Actor } from "../nomina/servicio";
import { evaluarUbicacion, type EvaluacionUbicacion } from "./geocerca";
import { diasLaborablesDesdeTexto, resumirAsistencia, type ResumenAsistencia } from "./jornada";
import { variantesTelefono } from "./whatsapp";

export const ORIGEN_CHECADOR = "CHECADOR";

export interface ChecadaRegistrada {
  empleado: { id: string; nombre: string };
  tipo: TipoChecada;
  ocurridoEn: Date;
  duplicada: boolean;
  ubicacion: EvaluacionUbicacion;
}

/** La geocerca está configurada y el empleado no mandó su ubicación. */
export class UbicacionRequeridaError extends Error {
  constructor() {
    super("El checador exige compartir la ubicación.");
    this.name = "UbicacionRequeridaError";
  }
}

/** Registra una checada; los reintentos del webhook se descartan por `mensajeId`. */
export async function registrarChecada(entrada: {
  empleadoId: string;
  tipo: TipoChecada;
  ocurridoEn?: Date;
  origen?: OrigenChecada;
  telefono?: string | null;
  mensajeId?: string | null;
  textoMensaje?: string | null;
  latitud?: number | null;
  longitud?: number | null;
  actor?: Actor;
}): Promise<ChecadaRegistrada> {
  const empleado = await prisma.empleado.findUniqueOrThrow({
    where: { id: entrada.empleadoId },
    select: {
      id: true,
      empresaId: true,
      nombre: true,
      apellidoPaterno: true,
      latitudCentro: true,
      longitudCentro: true,
      radioMetros: true,
      exigeUbicacion: true,
    },
  });

  const ubicacion =
    entrada.latitud != null && entrada.longitud != null
      ? { latitud: entrada.latitud, longitud: entrada.longitud }
      : null;
  const evaluacion = evaluarUbicacion(ubicacion, {
    centro:
      empleado.latitudCentro && empleado.longitudCentro
        ? {
            latitud: Number(empleado.latitudCentro),
            longitud: Number(empleado.longitudCentro),
          }
        : null,
    radioMetros: empleado.radioMetros,
    exigeUbicacion: empleado.exigeUbicacion,
  });

  if (entrada.mensajeId) {
    const previa = await prisma.checada.findUnique({ where: { mensajeId: entrada.mensajeId } });
    if (previa) {
      return {
        empleado: { id: empleado.id, nombre: empleado.nombre },
        tipo: previa.tipo,
        ocurridoEn: previa.ocurridoEn,
        duplicada: true,
        ubicacion: evaluacion,
      };
    }
  }

  if (evaluacion.faltaUbicacion) throw new UbicacionRequeridaError();

  const ocurridoEn = entrada.ocurridoEn ?? new Date();
  const checada = await prisma.checada.create({
    data: {
      empleadoId: empleado.id,
      tipo: entrada.tipo,
      ocurridoEn,
      origen: entrada.origen ?? "WHATSAPP",
      telefono: entrada.telefono ?? null,
      mensajeId: entrada.mensajeId ?? null,
      textoMensaje: entrada.textoMensaje ?? null,
      latitud: entrada.latitud?.toFixed(6) ?? null,
      longitud: entrada.longitud?.toFixed(6) ?? null,
      distanciaMetros: evaluacion.distanciaMetros,
      fueraDeRango: evaluacion.fueraDeRango,
    },
  });

  await registrarEvento({
    empresaId: empleado.empresaId,
    actorId: entrada.actor?.id,
    actorEmail: entrada.actor?.email ?? entrada.telefono ?? null,
    actorRol: entrada.actor?.rol ?? "EMPLEADO",
    accion: "CHECADA_REGISTRADA",
    entidad: "Checada",
    entidadId: checada.id,
    datosDespues: {
      empleadoId: empleado.id,
      tipo: checada.tipo,
      origen: checada.origen,
      ocurridoEn: checada.ocurridoEn.toISOString(),
      distanciaMetros: checada.distanciaMetros,
      fueraDeRango: checada.fueraDeRango,
    },
  });

  return {
    empleado: { id: empleado.id, nombre: `${empleado.nombre} ${empleado.apellidoPaterno}` },
    tipo: checada.tipo,
    ocurridoEn: checada.ocurridoEn,
    duplicada: false,
    ubicacion: evaluacion,
  };
}

export async function empleadoPorTelefono(telefono: string) {
  return prisma.empleado.findFirst({
    where: {
      telefonoWhatsapp: { in: variantesTelefono(telefono) },
      checadorActivo: true,
      estado: { not: "BAJA" },
    },
  });
}

export interface ResumenGeneracion {
  empleadoId: string;
  empleado: string;
  resumen: ResumenAsistencia;
  incidencias: { tipo: TipoIncidencia; cantidad: number }[];
}

/**
 * Convierte las checadas del periodo en incidencias de nómina.
 *
 * Las incidencias derivadas se marcan con `origen = CHECADOR` y se reemplazan
 * en cada generación, de modo que las capturadas a mano nunca se pisan. Solo se
 * permite mientras la corrida del periodo no esté autorizada.
 */
export async function generarIncidenciasDelPeriodo(
  empresaId: string,
  periodoId: string,
  actor: Actor,
): Promise<ResumenGeneracion[]> {
  const periodo = await prisma.periodoNomina.findUniqueOrThrow({ where: { id: periodoId } });

  const corrida = await prisma.corridaNomina.findUnique({
    where: { empresaId_periodoId: { empresaId, periodoId } },
  });
  if (corrida && !["BORRADOR", "CALCULADA"].includes(corrida.estado)) {
    throw new Error(
      `La corrida del periodo está ${corrida.estado.toLowerCase()}; no se pueden regenerar incidencias.`,
    );
  }

  const empleados = await prisma.empleado.findMany({
    where: {
      empresaId,
      periodicidad: periodo.periodicidad,
      checadorActivo: true,
      estado: { not: "BAJA" },
    },
  });

  const inicio = new Date(`${periodo.fechaInicio.toISOString().slice(0, 10)}T00:00:00.000Z`);
  const fin = new Date(`${periodo.fechaFin.toISOString().slice(0, 10)}T23:59:59.999Z`);
  const resultados: ResumenGeneracion[] = [];

  for (const empleado of empleados) {
    const checadas = await prisma.checada.findMany({
      where: { empleadoId: empleado.id, ocurridoEn: { gte: inicio, lte: fin } },
      orderBy: { ocurridoEn: "asc" },
    });

    const resumen = resumirAsistencia(
      checadas.map((c) => ({ tipo: c.tipo, ocurridoEn: c.ocurridoEn })),
      {
        horaEntrada: empleado.horaEntrada,
        horaSalida: empleado.horaSalida,
        toleranciaMinutos: empleado.toleranciaMinutos,
        diasLaborables: diasLaborablesDesdeTexto(empleado.diasLaborables),
      },
      { inicio, fin },
    );

    const candidatas: { tipo: TipoIncidencia; cantidad: number }[] = [
      { tipo: "FALTA", cantidad: resumen.faltas },
      { tipo: "HORAS_EXTRA_DOBLES", cantidad: resumen.horasExtraDobles },
      { tipo: "HORAS_EXTRA_TRIPLES", cantidad: resumen.horasExtraTriples },
      { tipo: "PRIMA_DOMINICAL", cantidad: resumen.domingosLaborados },
      { tipo: "DIA_DESCANSO_TRABAJADO", cantidad: resumen.diasDescansoTrabajados },
    ];
    const derivadas = candidatas.filter((incidencia) => incidencia.cantidad > 0);

    await prisma.$transaction([
      prisma.incidencia.deleteMany({
        where: {
          empleadoId: empleado.id,
          origen: ORIGEN_CHECADOR,
          fechaInicio: { gte: inicio },
          fechaFin: { lte: fin },
        },
      }),
      prisma.incidencia.createMany({
        data: derivadas.map((incidencia) => ({
          empleadoId: empleado.id,
          tipo: incidencia.tipo,
          fechaInicio: periodo.fechaInicio,
          fechaFin: periodo.fechaFin,
          cantidad: incidencia.cantidad.toFixed(4),
          origen: ORIGEN_CHECADOR,
          comentario: `Derivada del checador (${checadas.length} checadas del periodo).`,
        })),
      }),
    ]);

    resultados.push({
      empleadoId: empleado.id,
      empleado: `${empleado.nombre} ${empleado.apellidoPaterno}`,
      resumen,
      incidencias: derivadas,
    });
  }

  await registrarEvento({
    empresaId,
    actorId: actor.id,
    actorEmail: actor.email,
    actorRol: actor.rol,
    ip: actor.ip,
    userAgent: actor.userAgent,
    accion: "INCIDENCIAS_DERIVADAS_DEL_CHECADOR",
    entidad: "PeriodoNomina",
    entidadId: periodoId,
    datosDespues: {
      empleados: resultados.length,
      incidencias: resultados.reduce((total, r) => total + r.incidencias.length, 0),
    },
  });

  return resultados;
}
