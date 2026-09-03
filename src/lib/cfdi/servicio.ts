import { registrarEvento } from "../auditoria/bitacora";
import { prisma } from "../db";
import type { Periodicidad } from "../fiscal/periodicidad";
import type { Actor } from "../nomina/servicio";
import { generarXmlNomina } from "./nomina12";
import { obtenerPac } from "./pac";

function fecha(valor: Date): string {
  return valor.toISOString().slice(0, 10);
}

/** Construye el XML del recibo a partir de los datos ya calculados y guardados. */
export async function generarXmlDeRecibo(reciboId: string): Promise<string> {
  const recibo = await prisma.recibo.findUniqueOrThrow({
    where: { id: reciboId },
    include: {
      conceptos: { orderBy: { orden: "asc" } },
      empleado: { include: { empresa: true } },
      corrida: { include: { periodo: true } },
    },
  });
  const { empleado, corrida } = recibo;
  const empresa = empleado.empresa;
  const antiguedadSemanas = Math.floor(
    (corrida.periodo.fechaFin.getTime() - empleado.fechaIngreso.getTime()) /
      (86400000 * 7),
  );

  return generarXmlNomina(
    {
      rfc: empresa.rfc,
      nombre: empresa.razonSocial,
      regimenFiscal: empresa.regimenFiscal,
      codigoPostal: empresa.codigoPostal,
      registroPatronal: empresa.registroPatronal,
    },
    {
      rfc: empleado.rfc,
      nombre: [empleado.nombre, empleado.apellidoPaterno, empleado.apellidoMaterno]
        .filter(Boolean)
        .join(" "),
      curp: empleado.curp,
      numSeguridadSocial: empleado.nss,
      fechaInicioRelLaboral: fecha(empleado.fechaIngreso),
      antiguedad: `P${Math.max(antiguedadSemanas, 0)}W`,
      tipoContrato: empleado.tipoContrato,
      tipoJornada: empleado.tipoJornada,
      tipoRegimen: empleado.regimen,
      numEmpleado: empleado.numeroEmpleado,
      departamento: empleado.departamento,
      puesto: empleado.puesto,
      periodicidadPago: empleado.periodicidad as Periodicidad,
      salarioBaseCotApor: recibo.salarioBaseCotizacion.toFixed(2),
      salarioDiarioIntegrado: recibo.salarioBaseCotizacion.toFixed(2),
      claveEntFed: empleado.claveEntidadFederativa,
      domicilioFiscalReceptor: empresa.codigoPostal,
      regimenFiscalReceptor: "605",
    },
    {
      folio: recibo.id.slice(-8).toUpperCase(),
      fecha: new Date().toISOString().slice(0, 19),
      lugarExpedicion: empresa.codigoPostal,
      fechaPago: fecha(corrida.periodo.fechaPago),
      fechaInicialPago: fecha(corrida.periodo.fechaInicio),
      fechaFinalPago: fecha(corrida.periodo.fechaFin),
      numDiasPagados: recibo.diasPagados.toFixed(3),
      totalPercepciones: recibo.totalPercepciones.toFixed(2),
      totalDeducciones: recibo.totalDeducciones.toFixed(2),
      totalOtrosPagos: recibo.totalOtrosPagos.toFixed(2),
      totalGravado: recibo.totalGravado.toFixed(2),
      totalExento: recibo.totalExento.toFixed(2),
      subsidioCausado: recibo.subsidioCausado.toFixed(2),
      subsidioEntregado: recibo.subsidioEntregado.toFixed(2),
      conceptos: recibo.conceptos.map((c) => ({
        tipo: c.tipo,
        claveSat: c.claveSat,
        clave: c.clave,
        concepto: c.concepto,
        gravado: c.importeGravado.toFixed(2),
        exento: c.importeExento.toFixed(2),
        importe: c.importe.toFixed(2),
      })),
    },
  );
}

/** Timbra todos los recibos de una corrida autorizada a través del PAC configurado. */
export async function timbrarCorrida(corridaId: string, actor: Actor) {
  const corrida = await prisma.corridaNomina.findUniqueOrThrow({
    where: { id: corridaId },
    include: { recibos: { select: { id: true, uuidCfdi: true } } },
  });
  if (corrida.estado !== "AUTORIZADA") {
    throw new Error("Solo se puede timbrar una corrida autorizada.");
  }

  const pac = obtenerPac();
  const timbrados: { reciboId: string; uuid: string }[] = [];

  for (const recibo of corrida.recibos) {
    if (recibo.uuidCfdi) continue;
    const xml = await generarXmlDeRecibo(recibo.id);
    const respuesta = await pac.timbrar({ xml, referencia: recibo.id });
    await prisma.recibo.update({
      where: { id: recibo.id },
      data: {
        uuidCfdi: respuesta.uuid,
        fechaTimbrado: new Date(respuesta.fechaTimbrado),
        xmlCfdi: respuesta.xmlTimbrado,
      },
    });
    timbrados.push({ reciboId: recibo.id, uuid: respuesta.uuid });
  }

  await prisma.corridaNomina.update({
    where: { id: corridaId },
    data: { estado: "TIMBRADA" },
  });

  await registrarEvento({
    empresaId: corrida.empresaId,
    actorId: actor.id,
    actorEmail: actor.email,
    actorRol: actor.rol,
    accion: "CORRIDA_TIMBRADA",
    entidad: "CorridaNomina",
    entidadId: corridaId,
    datosDespues: { pac: pac.nombre, timbrados },
    ip: actor.ip,
    userAgent: actor.userAgent,
  });

  return timbrados;
}
