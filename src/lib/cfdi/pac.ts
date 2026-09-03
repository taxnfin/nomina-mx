import { createHash } from "node:crypto";

/**
 * Adaptador de timbrado.
 *
 * El timbrado real lo realiza un PAC autorizado por el SAT. Aquí se define el
 * contrato que debe implementar cada integración concreta (Finkok, SW Sapien,
 * Facturama, Edicom, ...). El adaptador local `PacSimulado` permite operar y
 * probar el flujo completo sin credenciales; no genera timbres válidos.
 */

export interface SolicitudTimbrado {
  xml: string;
  referencia: string;
}

export interface RespuestaTimbrado {
  uuid: string;
  fechaTimbrado: string;
  selloCfd: string;
  selloSat: string;
  noCertificadoSat: string;
  xmlTimbrado: string;
  simulado: boolean;
}

export interface Pac {
  readonly nombre: string;
  timbrar(solicitud: SolicitudTimbrado): Promise<RespuestaTimbrado>;
  cancelar(uuid: string, motivo: string, folioSustitucion?: string): Promise<{ acuse: string }>;
}

function uuidDeterminista(semilla: string): string {
  const hash = createHash("sha256").update(semilla).digest("hex");
  return [
    hash.slice(0, 8),
    hash.slice(8, 12),
    hash.slice(12, 16),
    hash.slice(16, 20),
    hash.slice(20, 32),
  ]
    .join("-")
    .toUpperCase();
}

/** PAC de desarrollo: no produce comprobantes fiscalmente válidos. */
export class PacSimulado implements Pac {
  readonly nombre = "SIMULADO";

  async timbrar(solicitud: SolicitudTimbrado): Promise<RespuestaTimbrado> {
    const fechaTimbrado = new Date().toISOString().slice(0, 19);
    const uuid = uuidDeterminista(`${solicitud.referencia}|${solicitud.xml}`);
    const sello = createHash("sha256").update(solicitud.xml).digest("base64");
    const timbre = `<tfd:TimbreFiscalDigital xmlns:tfd="http://www.sat.gob.mx/TimbreFiscalDigital" Version="1.1" UUID="${uuid}" FechaTimbrado="${fechaTimbrado}" SelloCFD="${sello}" NoCertificadoSAT="00000000000000000000" SelloSAT="${sello}" />`;
    return {
      uuid,
      fechaTimbrado,
      selloCfd: sello,
      selloSat: sello,
      noCertificadoSat: "00000000000000000000",
      xmlTimbrado: solicitud.xml.replace(
        "</cfdi:Complemento>",
        `  ${timbre}\n  </cfdi:Complemento>`,
      ),
      simulado: true,
    };
  }

  async cancelar(uuid: string, motivo: string) {
    return { acuse: `CANCELACION_SIMULADA:${uuid}:${motivo}` };
  }
}

let pacActivo: Pac = new PacSimulado();

export function registrarPac(pac: Pac) {
  pacActivo = pac;
}

export function obtenerPac(): Pac {
  return pacActivo;
}
