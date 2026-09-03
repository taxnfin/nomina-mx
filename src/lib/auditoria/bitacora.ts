import { createHash } from "node:crypto";
import type { Prisma } from "@prisma/client";
import { prisma } from "../db";

/**
 * Bitácora de trazabilidad append-only.
 *
 * Cada registro guarda el hash del registro anterior, de modo que la bitácora
 * forma una cadena verificable: alterar o borrar un evento rompe la cadena y el
 * verificador lo detecta. Los registros nunca se actualizan ni se eliminan.
 */

export const HASH_GENESIS = "0".repeat(64);

export interface EventoBitacora {
  empresaId?: string | null;
  actorId?: string | null;
  actorEmail?: string | null;
  actorRol?: string | null;
  accion: string;
  entidad: string;
  entidadId?: string | null;
  datosAntes?: Prisma.InputJsonValue;
  datosDespues?: Prisma.InputJsonValue;
  ip?: string | null;
  userAgent?: string | null;
}

/** Serialización canónica: llaves ordenadas para que el hash sea reproducible. */
export function serializarCanonico(valor: unknown): string {
  if (valor === null || valor === undefined) return "null";
  if (typeof valor === "number" || typeof valor === "boolean") return JSON.stringify(valor);
  if (typeof valor === "string") return JSON.stringify(valor);
  if (valor instanceof Date) return JSON.stringify(valor.toISOString());
  if (Array.isArray(valor)) return `[${valor.map(serializarCanonico).join(",")}]`;
  if (typeof valor === "object") {
    const entradas = Object.entries(valor as Record<string, unknown>)
      .filter(([, v]) => v !== undefined)
      .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
      .map(([k, v]) => `${JSON.stringify(k)}:${serializarCanonico(v)}`);
    return `{${entradas.join(",")}}`;
  }
  return JSON.stringify(String(valor));
}

export function calcularHash(hashPrevio: string, contenido: unknown): string {
  return createHash("sha256")
    .update(`${hashPrevio}|${serializarCanonico(contenido)}`)
    .digest("hex");
}

/** Registra un evento encadenándolo al último de la bitácora. */
export async function registrarEvento(evento: EventoBitacora) {
  return prisma.$transaction(async (tx) => {
    const ultimo = await tx.registroBitacora.findFirst({
      orderBy: { secuencia: "desc" },
      select: { hash: true },
    });
    const hashPrevio = ultimo?.hash ?? HASH_GENESIS;
    const ocurridoEn = new Date();
    const contenido = {
      accion: evento.accion,
      actorEmail: evento.actorEmail ?? null,
      actorId: evento.actorId ?? null,
      actorRol: evento.actorRol ?? null,
      datosAntes: evento.datosAntes ?? null,
      datosDespues: evento.datosDespues ?? null,
      empresaId: evento.empresaId ?? null,
      entidad: evento.entidad,
      entidadId: evento.entidadId ?? null,
      ip: evento.ip ?? null,
      ocurridoEn: ocurridoEn.toISOString(),
      userAgent: evento.userAgent ?? null,
    };
    return tx.registroBitacora.create({
      data: {
        empresaId: evento.empresaId ?? null,
        actorId: evento.actorId ?? null,
        actorEmail: evento.actorEmail ?? null,
        actorRol: evento.actorRol ?? null,
        accion: evento.accion,
        entidad: evento.entidad,
        entidadId: evento.entidadId ?? null,
        datosAntes: evento.datosAntes,
        datosDespues: evento.datosDespues,
        ip: evento.ip ?? null,
        userAgent: evento.userAgent ?? null,
        ocurridoEn,
        hashPrevio,
        hash: calcularHash(hashPrevio, contenido),
      },
    });
  }, { isolationLevel: "Serializable" });
}

export interface ResultadoVerificacion {
  integra: boolean;
  registrosVerificados: number;
  primerRegistroInvalido: {
    id: string;
    secuencia: number;
    motivo: string;
  } | null;
}

/** Recalcula toda la cadena de hashes y detecta cualquier alteración. */
export async function verificarCadena(): Promise<ResultadoVerificacion> {
  const registros = await prisma.registroBitacora.findMany({
    orderBy: { secuencia: "asc" },
  });

  let hashEsperado = HASH_GENESIS;
  let verificados = 0;

  for (const registro of registros) {
    if (registro.hashPrevio !== hashEsperado) {
      return {
        integra: false,
        registrosVerificados: verificados,
        primerRegistroInvalido: {
          id: registro.id,
          secuencia: registro.secuencia,
          motivo: "El hash previo no corresponde al registro anterior (falta o se alteró un evento).",
        },
      };
    }
    const contenido = {
      accion: registro.accion,
      actorEmail: registro.actorEmail,
      actorId: registro.actorId,
      actorRol: registro.actorRol,
      datosAntes: registro.datosAntes ?? null,
      datosDespues: registro.datosDespues ?? null,
      empresaId: registro.empresaId,
      entidad: registro.entidad,
      entidadId: registro.entidadId,
      ip: registro.ip,
      ocurridoEn: registro.ocurridoEn.toISOString(),
      userAgent: registro.userAgent,
    };
    const hash = calcularHash(registro.hashPrevio, contenido);
    if (hash !== registro.hash) {
      return {
        integra: false,
        registrosVerificados: verificados,
        primerRegistroInvalido: {
          id: registro.id,
          secuencia: registro.secuencia,
          motivo: "El contenido del evento no corresponde a su hash (registro modificado).",
        },
      };
    }
    hashEsperado = registro.hash;
    verificados += 1;
  }

  return { integra: true, registrosVerificados: verificados, primerRegistroInvalido: null };
}
