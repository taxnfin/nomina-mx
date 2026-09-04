import { createHmac, timingSafeEqual } from "node:crypto";
import type { TipoChecada } from "./jornada";

/**
 * Interpretación de los mensajes de WhatsApp del checador y validación de la
 * firma con la que Twilio firma cada webhook.
 */

const PALABRAS: { tipo: TipoChecada; claves: string[] }[] = [
  { tipo: "ENTRADA", claves: ["entrada", "entre", "checo entrada", "llegue", "inicio"] },
  { tipo: "SALIDA", claves: ["salida", "sali", "me voy", "checo salida", "fin"] },
  { tipo: "INICIO_COMIDA", claves: ["comida", "inicio comida", "voy a comer", "lunch"] },
  { tipo: "FIN_COMIDA", claves: ["regreso", "fin comida", "regrese", "vuelvo"] },
];

const AYUDA = ["ayuda", "help", "menu", "opciones"];

export const TEXTO_AYUDA =
  "Checador: responde ENTRADA al llegar, COMIDA y REGRESO en tu descanso, y SALIDA al terminar. " +
  "Puedes adjuntar tu ubicación para dejarla registrada.";

/** Normaliza el mensaje: minúsculas, sin acentos y sin signos. */
export function normalizar(texto: string): string {
  return texto
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9 ]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

export type ComandoChecador =
  | { clase: "CHECADA"; tipo: TipoChecada }
  | { clase: "AYUDA" }
  | { clase: "DESCONOCIDO" };

export function interpretarMensaje(texto: string): ComandoChecador {
  const limpio = normalizar(texto);
  if (limpio === "") return { clase: "DESCONOCIDO" };
  if (AYUDA.includes(limpio)) return { clase: "AYUDA" };

  // Se evalúan las frases más largas primero para que "fin comida" no caiga en "fin".
  const candidatos = PALABRAS.flatMap(({ tipo, claves }) =>
    claves.map((clave) => ({ tipo, clave })),
  ).sort((a, b) => b.clave.length - a.clave.length);

  const coincidencia = candidatos.find(
    ({ clave }) => limpio === clave || limpio.startsWith(`${clave} `) || limpio.endsWith(` ${clave}`),
  );
  return coincidencia ? { clase: "CHECADA", tipo: coincidencia.tipo } : { clase: "DESCONOCIDO" };
}

/** Deja el número en E.164: quita el prefijo `whatsapp:` y los separadores. */
export function normalizarTelefono(numero: string): string {
  const limpio = numero.replace(/^whatsapp:/i, "").replace(/[^\d+]/g, "");
  return limpio.startsWith("+") ? limpio : `+${limpio}`;
}

/**
 * Formas equivalentes de un mismo número mexicano: capturado a 10 dígitos, con
 * lada 52 y con el 1 que WhatsApp conserva para México (+521...).
 */
export function variantesTelefono(numero: string): string[] {
  const digitos = normalizarTelefono(numero).slice(1);
  const variantes = new Set<string>([`+${digitos}`]);

  if (digitos.length === 10) {
    variantes.add(`+52${digitos}`);
    variantes.add(`+521${digitos}`);
  }
  if (digitos.startsWith("521") && digitos.length === 13) {
    variantes.add(`+52${digitos.slice(3)}`);
    variantes.add(`+${digitos.slice(3)}`);
  }
  if (digitos.startsWith("52") && digitos.length === 12) {
    variantes.add(`+521${digitos.slice(2)}`);
    variantes.add(`+${digitos.slice(2)}`);
  }

  return [...variantes];
}

/**
 * Firma de Twilio: HMAC-SHA1 sobre la URL concatenada con los parámetros del
 * cuerpo ordenados alfabéticamente (clave y valor pegados), en base64.
 * https://www.twilio.com/docs/usage/security#validating-requests
 */
export function firmaTwilio(
  authToken: string,
  url: string,
  parametros: Record<string, string>,
): string {
  const contenido = Object.keys(parametros)
    .sort()
    .reduce((acumulado, clave) => acumulado + clave + parametros[clave], url);
  return createHmac("sha1", authToken).update(Buffer.from(contenido, "utf-8")).digest("base64");
}

export function firmaValida(
  authToken: string,
  url: string,
  parametros: Record<string, string>,
  firmaRecibida: string,
): boolean {
  const esperada = Buffer.from(firmaTwilio(authToken, url, parametros));
  const recibida = Buffer.from(firmaRecibida ?? "");
  return esperada.length === recibida.length && timingSafeEqual(esperada, recibida);
}

/** Respuesta TwiML: Twilio la reenvía al empleado como mensaje de WhatsApp. */
export function respuestaTwiml(mensaje: string): string {
  const escapado = mensaje
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
  return `<?xml version="1.0" encoding="UTF-8"?><Response><Message>${escapado}</Message></Response>`;
}
