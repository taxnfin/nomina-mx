import { NextResponse } from "next/server";
import {
  empleadoPorTelefono,
  registrarChecada,
} from "@/lib/checador/servicio";
import {
  TEXTO_AYUDA,
  firmaValida,
  interpretarMensaje,
  normalizarTelefono,
  respuestaTwiml,
} from "@/lib/checador/whatsapp";

const ETIQUETAS: Record<string, string> = {
  ENTRADA: "Entrada",
  SALIDA: "Salida",
  INICIO_COMIDA: "Inicio de comida",
  FIN_COMIDA: "Regreso de comida",
};

function twiml(mensaje: string) {
  return new NextResponse(respuestaTwiml(mensaje), {
    headers: { "content-type": "text/xml; charset=utf-8" },
  });
}

function hora(fecha: Date): string {
  return fecha.toISOString().replace("T", " ").slice(0, 16);
}

/**
 * Webhook de Twilio WhatsApp para el checador.
 *
 * Twilio envía el mensaje como `application/x-www-form-urlencoded` y lo firma
 * con el auth token; la respuesta TwiML se le entrega al empleado como acuse.
 */
export async function POST(peticion: Request) {
  const authToken = process.env.TWILIO_AUTH_TOKEN;
  if (!authToken) {
    return NextResponse.json({ error: "Checador de WhatsApp no configurado." }, { status: 503 });
  }

  const cuerpo = await peticion.text();
  const parametros = Object.fromEntries(new URLSearchParams(cuerpo));
  const url = process.env.TWILIO_WEBHOOK_URL ?? peticion.url;

  if (!firmaValida(authToken, url, parametros, peticion.headers.get("x-twilio-signature") ?? "")) {
    return NextResponse.json({ error: "Firma inválida." }, { status: 403 });
  }

  const telefono = normalizarTelefono(parametros.From ?? "");
  const empleado = await empleadoPorTelefono(telefono);
  if (!empleado) {
    return twiml(
      "Este número no está dado de alta en el checador. Contacta a Recursos Humanos.",
    );
  }

  const comando = interpretarMensaje(parametros.Body ?? "");
  if (comando.clase === "AYUDA") return twiml(TEXTO_AYUDA);
  if (comando.clase === "DESCONOCIDO") {
    return twiml(`No entendí el mensaje. ${TEXTO_AYUDA}`);
  }

  const latitud = parametros.Latitude ? Number(parametros.Latitude) : null;
  const longitud = parametros.Longitude ? Number(parametros.Longitude) : null;

  const checada = await registrarChecada({
    empleadoId: empleado.id,
    tipo: comando.tipo,
    telefono,
    mensajeId: parametros.MessageSid ?? null,
    textoMensaje: parametros.Body ?? null,
    latitud: Number.isFinite(latitud) ? latitud : null,
    longitud: Number.isFinite(longitud) ? longitud : null,
  });

  if (checada.duplicada) {
    return twiml(
      `Ya teníamos registrada tu ${ETIQUETAS[checada.tipo].toLowerCase()} de las ${hora(checada.ocurridoEn)}.`,
    );
  }

  return twiml(
    `${ETIQUETAS[checada.tipo]} registrada a las ${hora(checada.ocurridoEn)}. Gracias, ${empleado.nombre}.`,
  );
}
