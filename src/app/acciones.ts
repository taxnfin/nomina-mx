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
  const sesion = await requerirRol("ADMIN", "NOMINISTA");
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
  const sesion = await requerirRol("ADMIN", "NOMINISTA");
  try {
    const incidencia = await prisma.incidencia.create({
      data: {
        empleadoId: texto(datos, "empleadoId"),
        tipo: texto(datos, "tipo") as "FALTA",
        fechaInicio: fecha(texto(datos, "fechaInicio")),
        fechaFin: fecha(texto(datos, "fechaFin")),
        cantidad: numero(datos, "cantidad", 1).toFixed(4),
        comentario: opcional(datos, "comentario"),
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

export async function accionGenerarCalendario(
  _estado: EstadoFormulario,
  datos: FormData,
): Promise<EstadoFormulario> {
  await requerirRol("ADMIN", "NOMINISTA");
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
  const sesion = await requerirRol("ADMIN", "NOMINISTA");
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
  const sesion = await requerirRol("ADMIN", "NOMINISTA");
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

function mensajeError(error: unknown): string {
  if (error instanceof Error) return error.message;
  return "Ocurrió un error inesperado.";
}
