import { CLAVE_SAT_PERIODICIDAD, type Periodicidad } from "../fiscal/periodicidad";
import {
  CLAVE_REGIMEN,
  CLAVE_TIPO_CONTRATO,
  CLAVE_TIPO_JORNADA,
  TIPO_NOMINA,
} from "../nomina/catalogos";

/**
 * Generación del CFDI 4.0 con complemento de nómina 1.2.
 *
 * El XML se emite sin sellar: el sellado con el CSD y el timbrado corresponden al
 * PAC. El adaptador de `pac.ts` recibe este XML y devuelve el timbre fiscal digital.
 */

export interface DatosEmisor {
  rfc: string;
  nombre: string;
  regimenFiscal: string;
  codigoPostal: string;
  registroPatronal?: string | null;
}

export interface DatosReceptor {
  rfc: string;
  nombre: string;
  curp: string;
  numSeguridadSocial?: string | null;
  fechaInicioRelLaboral: string;
  antiguedad: string;
  tipoContrato: string;
  tipoJornada: string;
  tipoRegimen: string;
  numEmpleado: string;
  departamento?: string | null;
  puesto?: string | null;
  riesgoPuesto?: string | null;
  periodicidadPago: Periodicidad;
  salarioBaseCotApor: string;
  salarioDiarioIntegrado: string;
  claveEntFed: string;
  domicilioFiscalReceptor: string;
  regimenFiscalReceptor: string;
}

export interface ConceptoCfdi {
  tipo: "PERCEPCION" | "DEDUCCION" | "OTRO_PAGO";
  claveSat: string;
  clave: string;
  concepto: string;
  gravado: string;
  exento: string;
  importe: string;
}

export interface DatosNomina {
  serie?: string;
  folio: string;
  fecha: string;
  lugarExpedicion: string;
  fechaPago: string;
  fechaInicialPago: string;
  fechaFinalPago: string;
  numDiasPagados: string;
  totalPercepciones: string;
  totalDeducciones: string;
  totalOtrosPagos: string;
  totalGravado: string;
  totalExento: string;
  subsidioCausado: string;
  subsidioEntregado: string;
  conceptos: ConceptoCfdi[];
  incapacidades?: { diasIncapacidad: string; tipoIncapacidad: string; importeMonetario: string }[];
}

function escapar(valor: string): string {
  return valor
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

function atributos(pares: Record<string, string | null | undefined>): string {
  return Object.entries(pares)
    .filter(([, v]) => v !== null && v !== undefined && v !== "")
    .map(([k, v]) => `${k}="${escapar(String(v))}"`)
    .join(" ");
}

/** Construye el XML del CFDI de nómina listo para enviarse al PAC. */
export function generarXmlNomina(
  emisor: DatosEmisor,
  receptor: DatosReceptor,
  nomina: DatosNomina,
): string {
  const percepciones = nomina.conceptos.filter((c) => c.tipo === "PERCEPCION");
  const deducciones = nomina.conceptos.filter((c) => c.tipo === "DEDUCCION");
  const otrosPagos = nomina.conceptos.filter((c) => c.tipo === "OTRO_PAGO");

  const totalSueldos = percepciones
    .reduce((acc, c) => acc + Number(c.importe), 0)
    .toFixed(2);

  const bloquePercepciones = percepciones.length
    ? `<nomina12:Percepciones ${atributos({
        TotalSueldos: totalSueldos,
        TotalGravado: nomina.totalGravado,
        TotalExento: nomina.totalExento,
      })}>
${percepciones
  .map(
    (c) =>
      `      <nomina12:Percepcion ${atributos({
        TipoPercepcion: c.claveSat,
        Clave: c.clave,
        Concepto: c.concepto,
        ImporteGravado: c.gravado,
        ImporteExento: c.exento,
      })} />`,
  )
  .join("\n")}
    </nomina12:Percepciones>`
    : "";

  const bloqueDeducciones = deducciones.length
    ? `<nomina12:Deducciones ${atributos({
        TotalOtrasDeducciones: deducciones
          .filter((c) => c.claveSat !== "002")
          .reduce((acc, c) => acc + Number(c.importe), 0)
          .toFixed(2),
        TotalImpuestosRetenidos: deducciones
          .filter((c) => c.claveSat === "002")
          .reduce((acc, c) => acc + Number(c.importe), 0)
          .toFixed(2),
      })}>
${deducciones
  .map(
    (c) =>
      `      <nomina12:Deduccion ${atributos({
        TipoDeduccion: c.claveSat,
        Clave: c.clave,
        Concepto: c.concepto,
        Importe: c.importe,
      })} />`,
  )
  .join("\n")}
    </nomina12:Deducciones>`
    : "";

  const bloqueOtrosPagos = otrosPagos.length
    ? `<nomina12:OtrosPagos>
${otrosPagos
  .map(
    (c) =>
      `      <nomina12:OtroPago ${atributos({
        TipoOtroPago: c.claveSat,
        Clave: c.clave,
        Concepto: c.concepto,
        Importe: c.importe,
      })}>${
        c.claveSat === "002"
          ? `\n        <nomina12:SubsidioAlEmpleo ${atributos({
              SubsidioCausado: nomina.subsidioCausado,
            })} />\n      `
          : ""
      }</nomina12:OtroPago>`,
  )
  .join("\n")}
    </nomina12:OtrosPagos>`
    : "";

  const bloqueIncapacidades = nomina.incapacidades?.length
    ? `<nomina12:Incapacidades>
${nomina.incapacidades
  .map(
    (i) =>
      `      <nomina12:Incapacidad ${atributos({
        DiasIncapacidad: i.diasIncapacidad,
        TipoIncapacidad: i.tipoIncapacidad,
        ImporteMonetario: i.importeMonetario,
      })} />`,
  )
  .join("\n")}
    </nomina12:Incapacidades>`
    : "";

  const total = (Number(nomina.totalPercepciones) + Number(nomina.totalOtrosPagos)).toFixed(2);
  const descuento = nomina.totalDeducciones;

  return `<?xml version="1.0" encoding="UTF-8"?>
<cfdi:Comprobante xmlns:cfdi="http://www.sat.gob.mx/cfd/4" xmlns:nomina12="http://www.sat.gob.mx/nomina12" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance" xsi:schemaLocation="http://www.sat.gob.mx/cfd/4 http://www.sat.gob.mx/sitio_internet/cfd/4/cfdv40.xsd http://www.sat.gob.mx/nomina12 http://www.sat.gob.mx/sitio_internet/cfd/nomina/nomina12.xsd" ${atributos(
    {
      Version: "4.0",
      Serie: nomina.serie,
      Folio: nomina.folio,
      Fecha: nomina.fecha,
      Moneda: "MXN",
      TipoDeComprobante: "N",
      Exportacion: "01",
      LugarExpedicion: nomina.lugarExpedicion,
      SubTotal: nomina.totalPercepciones,
      Descuento: descuento,
      Total: (Number(total) - Number(descuento)).toFixed(2),
    },
  )}>
  <cfdi:Emisor ${atributos({
    Rfc: emisor.rfc,
    Nombre: emisor.nombre,
    RegimenFiscal: emisor.regimenFiscal,
  })} />
  <cfdi:Receptor ${atributos({
    Rfc: receptor.rfc,
    Nombre: receptor.nombre,
    DomicilioFiscalReceptor: receptor.domicilioFiscalReceptor,
    RegimenFiscalReceptor: receptor.regimenFiscalReceptor,
    UsoCFDI: "CN01",
  })} />
  <cfdi:Conceptos>
    <cfdi:Concepto ${atributos({
      ClaveProdServ: "84111505",
      Cantidad: "1",
      ClaveUnidad: "ACT",
      Descripcion: "Pago de nómina",
      ValorUnitario: nomina.totalPercepciones,
      Importe: nomina.totalPercepciones,
      Descuento: descuento,
      ObjetoImp: "01",
    })} />
  </cfdi:Conceptos>
  <cfdi:Complemento>
    <nomina12:Nomina ${atributos({
      Version: "1.2",
      TipoNomina: TIPO_NOMINA.ORDINARIA,
      FechaPago: nomina.fechaPago,
      FechaInicialPago: nomina.fechaInicialPago,
      FechaFinalPago: nomina.fechaFinalPago,
      NumDiasPagados: nomina.numDiasPagados,
      TotalPercepciones: nomina.totalPercepciones,
      TotalDeducciones: nomina.totalDeducciones,
      TotalOtrosPagos: nomina.totalOtrosPagos,
    })}>
    <nomina12:Emisor ${atributos({ RegistroPatronal: emisor.registroPatronal })} />
    <nomina12:Receptor ${atributos({
      Curp: receptor.curp,
      NumSeguridadSocial: receptor.numSeguridadSocial,
      FechaInicioRelLaboral: receptor.fechaInicioRelLaboral,
      Antigüedad: receptor.antiguedad,
      TipoContrato: CLAVE_TIPO_CONTRATO[receptor.tipoContrato] ?? receptor.tipoContrato,
      TipoJornada: CLAVE_TIPO_JORNADA[receptor.tipoJornada] ?? receptor.tipoJornada,
      TipoRegimen: CLAVE_REGIMEN[receptor.tipoRegimen] ?? receptor.tipoRegimen,
      NumEmpleado: receptor.numEmpleado,
      Departamento: receptor.departamento,
      Puesto: receptor.puesto,
      PeriodicidadPago: CLAVE_SAT_PERIODICIDAD[receptor.periodicidadPago],
      SalarioBaseCotApor: receptor.salarioBaseCotApor,
      SalarioDiarioIntegrado: receptor.salarioDiarioIntegrado,
      ClaveEntFed: receptor.claveEntFed,
    })} />
    ${bloquePercepciones}
    ${bloqueDeducciones}
    ${bloqueOtrosPagos}
    ${bloqueIncapacidades}
    </nomina12:Nomina>
  </cfdi:Complemento>
</cfdi:Comprobante>`;
}
