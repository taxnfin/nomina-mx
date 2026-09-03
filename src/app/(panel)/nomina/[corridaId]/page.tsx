import Link from "next/link";
import { notFound } from "next/navigation";
import { accionCambiarEstado } from "@/app/acciones";
import { Formulario } from "@/components/formulario";
import { Etiqueta, Metrica, Tabla, Tarjeta, Vacio } from "@/components/ui";
import { requerirSesion } from "@/lib/auth/sesion";
import { prisma } from "@/lib/db";
import { formatoMxn } from "@/lib/dinero";

export const dynamic = "force-dynamic";

const SIGUIENTES: Record<string, { estado: string; texto: string }[]> = {
  BORRADOR: [{ estado: "CANCELADA", texto: "Cancelar" }],
  CALCULADA: [
    { estado: "AUTORIZADA", texto: "Autorizar" },
    { estado: "CANCELADA", texto: "Cancelar" },
  ],
  AUTORIZADA: [
    { estado: "TIMBRADA", texto: "Timbrar CFDI" },
    { estado: "PAGADA", texto: "Marcar pagada" },
  ],
  TIMBRADA: [{ estado: "PAGADA", texto: "Marcar pagada" }],
  PAGADA: [],
  CANCELADA: [],
};

export default async function PaginaCorrida({
  params,
}: {
  params: Promise<{ corridaId: string }>;
}) {
  const sesion = await requerirSesion();
  const { corridaId } = await params;

  const corrida = await prisma.corridaNomina.findFirst({
    where: { id: corridaId, empresaId: sesion.empresaId },
    include: {
      periodo: true,
      autorizadaPor: true,
      recibos: { include: { empleado: true }, orderBy: { empleado: { numeroEmpleado: "asc" } } },
    },
  });
  if (!corrida) notFound();

  const eventos = await prisma.registroBitacora.findMany({
    where: { entidad: "CorridaNomina", entidadId: corrida.id },
    orderBy: { secuencia: "asc" },
  });

  const acciones = SIGUIENTES[corrida.estado] ?? [];

  return (
    <>
      <div className="flex flex-wrap items-center gap-3">
        <div>
          <h1 className="text-2xl font-semibold">
            Corrida {corrida.periodo.periodicidad.toLowerCase()} #{corrida.periodo.numero} ·{" "}
            {corrida.periodo.ejercicio}
          </h1>
          <p className="text-sm text-slate-500">
            {corrida.periodo.fechaInicio.toISOString().slice(0, 10)} al{" "}
            {corrida.periodo.fechaFin.toISOString().slice(0, 10)} · pago{" "}
            {corrida.periodo.fechaPago.toISOString().slice(0, 10)}
          </p>
        </div>
        <div className="ml-auto flex items-center gap-3">
          <Etiqueta valor={corrida.estado} />
          {acciones.map((accion) => (
            <Formulario
              key={accion.estado}
              accion={accionCambiarEstado}
              textoBoton={accion.texto}
              variante={accion.estado === "CANCELADA" ? "peligro" : "primario"}
              className="flex items-center gap-2"
            >
              <input type="hidden" name="corridaId" value={corrida.id} />
              <input type="hidden" name="estado" value={accion.estado} />
            </Formulario>
          ))}
        </div>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Metrica etiqueta="Percepciones" valor={formatoMxn(corrida.totalPercepciones.toString())} />
        <Metrica etiqueta="Deducciones" valor={formatoMxn(corrida.totalDeducciones.toString())} />
        <Metrica etiqueta="Neto a pagar" valor={formatoMxn(corrida.totalNeto.toString())} />
        <Metrica
          etiqueta="Costo patronal IMSS"
          valor={formatoMxn(corrida.totalCuotasPatron.toString())}
          nota={
            corrida.autorizadaPor ? `Autorizó ${corrida.autorizadaPor.nombre}` : "Sin autorizar"
          }
        />
      </div>

      <Tarjeta titulo="Recibos">
        {corrida.recibos.length === 0 ? (
          <Vacio texto="La corrida no generó recibos." />
        ) : (
          <Tabla
            encabezados={[
              "Empleado",
              "Días",
              "Percepciones",
              "ISR",
              "IMSS obrero",
              "Neto",
              "UUID",
              "",
            ]}
          >
            {corrida.recibos.map((recibo) => (
              <tr key={recibo.id}>
                <td className="px-3 py-2">
                  {recibo.empleado.nombre} {recibo.empleado.apellidoPaterno}
                  <span className="block text-xs text-slate-500">
                    {recibo.empleado.numeroEmpleado}
                  </span>
                </td>
                <td className="px-3 py-2">{Number(recibo.diasPagados)}</td>
                <td className="px-3 py-2">{formatoMxn(recibo.totalPercepciones.toString())}</td>
                <td className="px-3 py-2">{formatoMxn(recibo.isrRetenido.toString())}</td>
                <td className="px-3 py-2">{formatoMxn(recibo.imssObrero.toString())}</td>
                <td className="px-3 py-2 font-medium">{formatoMxn(recibo.neto.toString())}</td>
                <td className="px-3 py-2 text-xs text-slate-500">{recibo.uuidCfdi ?? "—"}</td>
                <td className="px-3 py-2">
                  <Link className="text-sm underline" href={`/recibos/${recibo.id}`}>
                    Memoria
                  </Link>
                </td>
              </tr>
            ))}
          </Tabla>
        )}
      </Tarjeta>

      <Tarjeta
        titulo="Trazabilidad de la corrida"
        descripcion="Eventos encadenados por hash; cada uno referencia el hash del anterior."
      >
        <Tabla encabezados={["#", "Fecha", "Acción", "Actor", "Hash"]}>
          {eventos.map((evento) => (
            <tr key={evento.id}>
              <td className="px-3 py-2">{evento.secuencia}</td>
              <td className="px-3 py-2">{evento.ocurridoEn.toISOString().replace("T", " ").slice(0, 19)}</td>
              <td className="px-3 py-2">{evento.accion}</td>
              <td className="px-3 py-2">{evento.actorEmail ?? "sistema"}</td>
              <td className="px-3 py-2 font-mono text-xs text-slate-500">
                {evento.hash.slice(0, 16)}…
              </td>
            </tr>
          ))}
        </Tabla>
      </Tarjeta>

      <Tarjeta
        titulo="Parámetros fiscales usados"
        descripcion="Snapshot congelado al momento del cálculo."
      >
        <pre className="max-h-72 overflow-auto rounded-lg bg-slate-900 p-4 text-xs text-slate-100">
          {JSON.stringify(corrida.parametrosSnapshot, null, 2)}
        </pre>
      </Tarjeta>
    </>
  );
}
