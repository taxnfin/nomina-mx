"use server";

import type { EstadoCorrida, Prisma } from "@prisma/client";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/db";
import {
  actorDeSesion,
  cerrarSesion,
  crearSesion,
  requerirRol,
  requerirSesion,
  verificarCredenciales,
  type Sesion,
} from "@/lib/auth/sesion";
import { registrarEvento } from "@/lib/auditoria/bitacora";
import {
  cambiarEstadoCorrida,
  calcularCorrida,
  parametrosDelEjercicio,
} from "@/lib/nomina/servicio";
import { timbrarCorrida } from "@/lib/cfdi/servicio";
import { calcularFiniquito } from "@/lib/nomina/finiquito";
import { salarioBaseCotizacion } from "@/lib/fiscal/imss";
import { generarPeriodos, type Periodicidad } from "@/lib/fiscal/periodicidad";
import { diasVacacionesPorAntiguedad, PARAMETROS_2025 } from "@/lib/fiscal/tablas2025";
import { generarIncidenciasDelPeriodo, registrarChecada } from "@/lib/checador/servicio";
import { normalizarTelefono } from "@/lib/checador/whatsapp";

export interface EstadoFormulario {
  error?: string;
  mensaje?: string;
}

function texto(datos: FormData, campo: string): string {
  return String(datos.get(campo) ?? "").trim();
}

function numero(datos: FormData, campo: string, porDefecto = 0): number {
  const valor = Number(texto(datos, campo));
  return Number.isFinite(valor) ? valor : porDefecto;
}

function opcional(datos: FormData, campo: string): string | null {
  const valor = texto(datos, campo);
  return valor === "" ? null : valor;
}

/**
 * Verifica el rol sin lanzar: las Server Actions devuelven el mensaje en el
 * formulario en lugar de reventar la petición con un 500.
 */
async function sesionConRol(
  ...roles: string[]
): Promise<{ sesion: Sesion; error?: undefined } | { sesion?: undefined; error: string }> {
  try {
    return { sesion: await requerirRol(...roles) };
  } catch (error) {
    return { error: mensajeError(error) };
  }
}

function fecha(valor: string): Date {
  return new Date(`${valor}T00:00:00.000Z`);
}

export async function accionIniciarSesion(
  _estado: EstadoFormulario,
  datos: FormData,
): Promise<EstadoFormulario> {
  const sesion = await verificarCredenciales(texto(datos, "email"), texto(datos, "password"));
  if (!sesion) return { error: "Credenciales incorrectas." };
  await crearSesion(sesion);
  await registrarEvento({
    empresaId: sesion.empresaId,
    actorId: sesion.usuarioId,
    actorEmail: sesion.email,
    actorRol: sesion.rol,
    accion: "SESION_INICIADA",
    entidad: "Usuario",
    entidadId: sesion.usuarioId,
  });
  redirect("/");
}

export async function accionCerrarSesion() {
  await cerrarSesion();
  redirect("/login");
}

export async function accionCrearEmpleado(
  _estado: EstadoFormulario,
  datos: FormData,
): Promise<EstadoFormulario> {
  const { sesion, error: sinPermiso } = await sesionConRol("ADMIN", "NOMINISTA");
  if (!sesion) return { error: sinPermiso };
  const salarioDiario = numero(datos, "salarioDiario");
  if (salarioDiario <= 0) return { error: "El salario diario debe ser mayor a cero." };

  const diasAguinaldo = numero(datos, "diasAguinaldo", 15);
  const primaVacacionalPct = numero(datos, "primaVacacionalPct", 0.25);
  const sbc = salarioBaseCotizacion(
    salarioDiario,
    diasAguinaldo,
    diasVacacionesPorAntiguedad(1),
    primaVacacionalPct,
    PARAMETROS_2025.UMA_DIARIA,
  );

  const telefonoRaw = opcional(datos, "telefonoWhatsapp");
  const telefonoWhatsapp = telefonoRaw === null ? null : normalizarTelefono(telefonoRaw);

  try {
    const empleado = await prisma.empleado.create({
      data: {
        empresaId: sesion.empresaId,
        numeroEmpleado: texto(datos, "numeroEmpleado"),
        nombre: texto(datos, "nombre"),
        apellidoPaterno: texto(datos, "apellidoPaterno"),
        apellidoMaterno: opcional(datos, "apellidoMaterno"),
        rfc: texto(datos, "rfc").toUpperCase(),
        curp: texto(datos, "curp").toUpperCase(),
        nss: opcional(datos, "nss"),
        fechaIngreso: fecha(texto(datos, "fechaIngreso")),
        puesto: texto(datos, "puesto"),
        departamento: opcional(datos, "departamento"),
        periodicidad: texto(datos, "periodicidad") as Periodicidad,
        regimen: texto(datos, "regimen") as "SUELDOS_SALARIOS",
        tipoContrato: texto(datos, "tipoContrato") as "INDETERMINADO",
        tipoJornada: texto(datos, "tipoJornada") as "DIURNA",
        salarioDiario: salarioDiario.toFixed(4),
        salarioBaseCotizacion: sbc.toFixed(4),
        diasAguinaldo,
        primaVacacionalPct: primaVacacionalPct.toFixed(4),
        descuentoInfonavitTipo: opcional(datos, "descuentoInfonavitTipo"),
        descuentoInfonavitValor: opcional(datos, "descuentoInfonavitValor"),
        pensionAlimenticiaTipo: opcional(datos, "pensionAlimenticiaTipo"),
        pensionAlimenticiaValor: opcional(datos, "pensionAlimenticiaValor"),
        telefonoWhatsapp: telefonoWhatsapp,
        checadorActivo: telefonoWhatsapp !== null,
        horaEntrada: texto(datos, "horaEntrada") || "09:00",
        horaSalida: texto(datos, "horaSalida") || "18:00",
        toleranciaMinutos: numero(datos, "toleranciaMinutos", 15),
        diasLaborables: texto(datos, "diasLaborables") || "1,2,3,4,5",
        latitudCentro: opcional(datos, "latitudCentro"),
        longitudCentro: opcional(datos, "longitudCentro"),
        radioMetros: numero(datos, "radioMetros", 200),
        exigeUbicacion: texto(datos, "exigeUbicacion") === "SI",
      },
    });

    await registrarEvento({
      empresaId: sesion.empresaId,
      actorId: sesion.usuarioId,
      actorEmail: sesion.email,
      actorRol: sesion.rol,
      accion: "EMPLEADO_ALTA",
      entidad: "Empleado",
      entidadId: empleado.id,
      datosDespues: {
        numeroEmpleado: empleado.numeroEmpleado,
        nombre: `${empleado.nombre} ${empleado.apellidoPaterno}`,
        periodicidad: empleado.periodicidad,
        salarioDiario: empleado.salarioDiario.toString(),
        salarioBaseCotizacion: empleado.salarioBaseCotizacion.toString(),
      },
    });
  } catch (error) {
    return { error: mensajeError(error) };
  }

  revalidatePath("/empleados");
  return { mensaje: "Empleado dado de alta." };
}

export async function accionRegistrarIncidencia(
  _estado: EstadoFormulario,
  datos: FormData,
): Promise<EstadoFormulario> {
  const { sesion, error: sinPermiso } = await sesionConRol("ADMIN", "NOMINISTA");
  if (!sesion) return { error: sinPermiso };
  try {
    const incidencia = await prisma.incidencia.create({
      data: {
        empleadoId: texto(datos, "empleadoId"),
        tipo: texto(datos, "tipo") as "FALTA",
        fechaInicio: fecha(texto(datos, "fechaInicio")),
        fechaFin: fecha(texto(datos, "fechaFin")),
        cantidad: numero(datos, "cantidad", 1).toFixed(4),
        comentario: opcional(datos, "comentario"),
        origen: "MANUAL",
      },
    });
    await registrarEvento({
      empresaId: sesion.empresaId,
      actorId: sesion.usuarioId,
      actorEmail: sesion.email,
      actorRol: sesion.rol,
      accion: "INCIDENCIA_REGISTRADA",
      entidad: "Incidencia",
      entidadId: incidencia.id,
      datosDespues: {
        empleadoId: incidencia.empleadoId,
        tipo: incidencia.tipo,
        cantidad: incidencia.cantidad.toString(),
      },
    });
  } catch (error) {
    return { error: mensajeError(error) };
  }
  revalidatePath("/incidencias");
  return { mensaje: "Incidencia registrada." };
}

export async function accionRegistrarChecada(
  _estado: EstadoFormulario,
  datos: FormData,
): Promise<EstadoFormulario> {
  const { sesion, error: sinPermiso } = await sesionConRol("ADMIN", "NOMINISTA");
  if (!sesion) return { error: sinPermiso };
  const momento = texto(datos, "ocurridoEn");
  if (momento === "") return { error: "Indica la fecha y hora de la checada." };

  try {
    const checada = await registrarChecada({
      empleadoId: texto(datos, "empleadoId"),
      tipo: texto(datos, "tipo") as "ENTRADA",
      ocurridoEn: new Date(`${momento}:00.000Z`),
      origen: "MANUAL",
      actor: await actorDeSesion(sesion),
    });
    revalidatePath("/checador");
    return { mensaje: `Checada de ${checada.empleado.nombre} registrada.` };
  } catch (error) {
    return { error: mensajeError(error) };
  }
}

/** Centro de trabajo y radio permitido para las checadas de un empleado. */
export async function accionConfigurarGeocerca(
  _estado: EstadoFormulario,
  datos: FormData,
): Promise<EstadoFormulario> {
  const { sesion, error: sinPermiso } = await sesionConRol("ADMIN", "NOMINISTA");
  if (!sesion) return { error: sinPermiso };
  const empleadoId = texto(datos, "empleadoId");
  const latitud = opcional(datos, "latitudCentro");
  const longitud = opcional(datos, "longitudCentro");
  const exigeUbicacion = texto(datos, "exigeUbicacion") === "SI";

  if ((latitud === null) !== (longitud === null)) {
    return { error: "Captura latitud y longitud juntas." };
  }
  if (latitud === null && exigeUbicacion) {
    return { error: "Para exigir ubicación primero define el centro de trabajo." };
  }

  const radioMetros = numero(datos, "radioMetros", 200);
  if (radioMetros <= 0) return { error: "El radio debe ser mayor a cero." };

  try {
    const previo = await prisma.empleado.findFirstOrThrow({
      where: { id: empleadoId, empresaId: sesion.empresaId },
    });
    const empleado = await prisma.empleado.update({
      where: { id: previo.id },
      data: {
        latitudCentro: latitud,
        longitudCentro: longitud,
        radioMetros,
        exigeUbicacion,
      },
    });

    await registrarEvento({
      empresaId: sesion.empresaId,
      actorId: sesion.usuarioId,
      actorEmail: sesion.email,
      actorRol: sesion.rol,
      accion: "GEOCERCA_ACTUALIZADA",
      entidad: "Empleado",
      entidadId: empleado.id,
      datosAntes: {
        latitudCentro: previo.latitudCentro?.toString() ?? null,
        longitudCentro: previo.longitudCentro?.toString() ?? null,
        radioMetros: previo.radioMetros,
        exigeUbicacion: previo.exigeUbicacion,
      },
      datosDespues: {
        latitudCentro: empleado.latitudCentro?.toString() ?? null,
        longitudCentro: empleado.longitudCentro?.toString() ?? null,
        radioMetros: empleado.radioMetros,
        exigeUbicacion: empleado.exigeUbicacion,
      },
    });
  } catch (error) {
    return { error: mensajeError(error) };
  }

  revalidatePath("/checador");
  return { mensaje: "Geocerca actualizada." };
}

export async function accionGenerarIncidenciasChecador(
  _estado: EstadoFormulario,
  datos: FormData,
): Promise<EstadoFormulario> {
  const { sesion, error: sinPermiso } = await sesionConRol("ADMIN", "NOMINISTA");
  if (!sesion) return { error: sinPermiso };
  try {
    const resultados = await generarIncidenciasDelPeriodo(
      sesion.empresaId,
      texto(datos, "periodoId"),
      await actorDeSesion(sesion),
    );
    const incidencias = resultados.reduce((total, r) => total + r.incidencias.length, 0);
    revalidatePath("/checador");
    revalidatePath("/incidencias");
    revalidatePath("/nomina");
    return {
      mensaje: `${incidencias} incidencias derivadas de ${resultados.length} empleados.`,
    };
  } catch (error) {
    return { error: mensajeError(error) };
  }
}

export async function accionGenerarCalendario(
  _estado: EstadoFormulario,
  datos: FormData,
): Promise<EstadoFormulario> {
  const { error: sinPermiso } = await sesionConRol("ADMIN", "NOMINISTA");
  if (sinPermiso) return { error: sinPermiso };
  const ejercicio = numero(datos, "ejercicio", new Date().getUTCFullYear());
  const periodicidad = texto(datos, "periodicidad") as Periodicidad;
  const periodos = generarPeriodos(ejercicio, periodicidad);

  await prisma.periodoNomina.createMany({
    data: periodos.map((p) => ({
      ejercicio,
      periodicidad,
      numero: p.numero,
      fechaInicio: p.fechaInicio,
      fechaFin: p.fechaFin,
      fechaPago: p.fechaPago,
      diasPeriodo: p.diasPago,
    })),
    skipDuplicates: true,
  });

  revalidatePath("/nomina");
  return { mensaje: `Calendario ${periodicidad} ${ejercicio}: ${periodos.length} periodos.` };
}

export async function accionCalcularCorrida(
  _estado: EstadoFormulario,
  datos: FormData,
): Promise<EstadoFormulario> {
  const { sesion, error: sinPermiso } = await sesionConRol("ADMIN", "NOMINISTA");
  if (!sesion) return { error: sinPermiso };
  try {
    const resultado = await calcularCorrida(
      sesion.empresaId,
      texto(datos, "periodoId"),
      await actorDeSesion(sesion),
    );
    revalidatePath("/nomina");
    return {
      mensaje: `Corrida calculada: ${resultado.recibos} recibos, neto ${resultado.totalNeto.toFixed(2)}.`,
    };
  } catch (error) {
    return { error: mensajeError(error) };
  }
}

export async function accionCambiarEstado(
  _estado: EstadoFormulario,
  datos: FormData,
): Promise<EstadoFormulario> {
  const sesion = await requerirSesion();
  const corridaId = texto(datos, "corridaId");
  const nuevoEstado = texto(datos, "estado");
  try {
    if (nuevoEstado === "TIMBRADA") {
      const timbrados = await timbrarCorrida(corridaId, await actorDeSesion(sesion));
      revalidatePath(`/nomina/${corridaId}`);
      revalidatePath("/nomina");
      return { mensaje: `Timbrados ${timbrados.length} recibos.` };
    }
    await cambiarEstadoCorrida(
      corridaId,
      nuevoEstado as EstadoCorrida,
      await actorDeSesion(sesion),
    );
    revalidatePath(`/nomina/${corridaId}`);
    revalidatePath("/nomina");
    return { mensaje: `Corrida ${nuevoEstado.toLowerCase()}.` };
  } catch (error) {
    return { error: mensajeError(error) };
  }
}

export async function accionCalcularFiniquito(
  _estado: EstadoFormulario,
  datos: FormData,
): Promise<EstadoFormulario> {
  const { sesion, error: sinPermiso } = await sesionConRol("ADMIN", "NOMINISTA");
  if (!sesion) return { error: sinPermiso };
  try {
    const empleado = await prisma.empleado.findFirstOrThrow({
      where: { id: texto(datos, "empleadoId"), empresaId: sesion.empresaId },
    });
    const fechaBaja = fecha(texto(datos, "fechaBaja"));
    const parametros = await parametrosDelEjercicio(
      fechaBaja.getUTCFullYear(),
      sesion.empresaId,
    );
    const tipoSeparacion = texto(datos, "tipoSeparacion") as "RENUNCIA";

    const resultado = calcularFiniquito(
      {
        salarioDiario: empleado.salarioDiario.toString(),
        salarioDiarioIntegrado: empleado.salarioBaseCotizacion.toString(),
        fechaIngreso: empleado.fechaIngreso,
        fechaBaja,
        tipoSeparacion,
        diasAguinaldo: empleado.diasAguinaldo,
        primaVacacionalPct: empleado.primaVacacionalPct.toString(),
        diasPendientesDePago: numero(datos, "diasPendientesDePago"),
        diasVacacionesDisfrutados: numero(datos, "diasVacacionesDisfrutados"),
        incluyeVeinteDiasPorAnio: texto(datos, "incluyeVeinteDiasPorAnio") === "on",
      },
      {
        umaDiaria: parametros.umaDiaria,
        salarioMinimo: parametros.salarioMinimo,
        tarifaMensual: parametros.tarifaMensual,
      },
    );

    const finiquito = await prisma.finiquito.create({
      data: {
        empleadoId: empleado.id,
        tipoSeparacion,
        fechaBaja,
        incluyeIndemnizacion: resultado.esLiquidacion,
        totalPercepciones: resultado.totalPercepciones.toFixed(2),
        totalDeducciones: resultado.totalDeducciones.toFixed(2),
        neto: resultado.neto.toFixed(2),
        memoriaCalculo: JSON.parse(
          JSON.stringify({
            conceptos: resultado.conceptos.map((c) => ({
              concepto: c.concepto,
              claveSat: c.claveSat,
              base: c.base,
              importe: c.importe.toFixed(2),
              gravado: c.gravado.toFixed(2),
              exento: c.exento.toFixed(2),
            })),
            isrOrdinario: resultado.isrOrdinario.toFixed(2),
            isrSeparacion: resultado.isrSeparacion.toFixed(2),
            detalle: resultado.memoria,
          }),
        ) as Prisma.InputJsonValue,
      },
    });

    await prisma.empleado.update({
      where: { id: empleado.id },
      data: { estado: "BAJA", fechaBaja, motivoBaja: tipoSeparacion },
    });

    await registrarEvento({
      empresaId: sesion.empresaId,
      actorId: sesion.usuarioId,
      actorEmail: sesion.email,
      actorRol: sesion.rol,
      accion: "FINIQUITO_CALCULADO",
      entidad: "Finiquito",
      entidadId: finiquito.id,
      datosDespues: {
        empleadoId: empleado.id,
        tipoSeparacion,
        neto: resultado.neto.toFixed(2),
      },
    });

    revalidatePath("/finiquitos");
    return { mensaje: `Finiquito calculado: neto ${resultado.neto.toFixed(2)}.` };
  } catch (error) {
    return { error: mensajeError(error) };
  }
}

export async function accionGuardarRegistroRepse(
  _estado: EstadoFormulario,
  datos: FormData,
): Promise<EstadoFormulario> {
  const { sesion, error: sinPermiso } = await sesionConRol("ADMIN");
  if (!sesion) return { error: sinPermiso };

  const numeroRegistro = texto(datos, "numeroRegistro");
  const actividades = texto(datos, "actividades");
  if (!numeroRegistro || !actividades) {
    return { error: "Captura el número de registro y al menos una actividad." };
  }

  try {
    const valores = {
      numeroRegistro,
      fechaRegistro: fecha(texto(datos, "fechaRegistro")),
      actividades,
      notas: opcional(datos, "notas"),
    };
    const registro = await prisma.registroRepse.upsert({
      where: { empresaId: sesion.empresaId },
      create: { empresaId: sesion.empresaId, ...valores },
      update: valores,
    });

    await registrarEvento({
      empresaId: sesion.empresaId,
      actorId: sesion.usuarioId,
      actorEmail: sesion.email,
      actorRol: sesion.rol,
      accion: "REPSE_REGISTRO_ACTUALIZADO",
      entidad: "RegistroRepse",
      entidadId: registro.id,
      datosDespues: { numeroRegistro, fechaRegistro: valores.fechaRegistro.toISOString() },
    });

    revalidatePath("/repse");
    return { mensaje: "Registro REPSE guardado." };
  } catch (error) {
    return { error: mensajeError(error) };
  }
}

export async function accionRegistrarContratoRepse(
  _estado: EstadoFormulario,
  datos: FormData,
): Promise<EstadoFormulario> {
  const { sesion, error: sinPermiso } = await sesionConRol("ADMIN", "NOMINISTA");
  if (!sesion) return { error: sinPermiso };

  const fechaFinTexto = opcional(datos, "fechaFin");

  try {
    const contrato = await prisma.contratoRepse.create({
      data: {
        empresaId: sesion.empresaId,
        beneficiario: texto(datos, "beneficiario"),
        rfcBeneficiario: texto(datos, "rfcBeneficiario").toUpperCase(),
        objeto: texto(datos, "objeto"),
        fechaInicio: fecha(texto(datos, "fechaInicio")),
        fechaFin: fechaFinTexto ? fecha(fechaFinTexto) : null,
        numeroTrabajadores: numero(datos, "numeroTrabajadores"),
        margenUtilidad: numero(datos, "margenUtilidad", 0.15).toFixed(6),
        otrosCostos: numero(datos, "otrosCostos").toFixed(2),
      },
    });

    await registrarEvento({
      empresaId: sesion.empresaId,
      actorId: sesion.usuarioId,
      actorEmail: sesion.email,
      actorRol: sesion.rol,
      accion: "REPSE_CONTRATO_REGISTRADO",
      entidad: "ContratoRepse",
      entidadId: contrato.id,
      datosDespues: {
        beneficiario: contrato.beneficiario,
        rfcBeneficiario: contrato.rfcBeneficiario,
        numeroTrabajadores: contrato.numeroTrabajadores,
      },
    });

    revalidatePath("/repse");
    return { mensaje: `Contrato con ${contrato.beneficiario} registrado.` };
  } catch (error) {
    return { error: mensajeError(error) };
  }
}

function mensajeError(error: unknown): string {
  if (error instanceof Error) return error.message;
  return "Ocurrió un error inesperado.";
}
