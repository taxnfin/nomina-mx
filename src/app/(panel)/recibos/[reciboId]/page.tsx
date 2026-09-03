import Link from "next/link";
import { notFound } from "next/navigation";
import { Etiqueta, Metrica, Tabla, Tarjeta } from "@/components/ui";
import { requerirSesion } from "@/lib/auth/sesion";
import { prisma } from "@/lib/db";
import { formatoMxn } from "@/lib/dinero";

export const dynamic = "force-dynamic";

export default async function PaginaRecibo({
  params,
}: {
  params: Promise<{ reciboId: string }>;
}) {
  const sesion = await requerirSesion();
  const { reciboId } = await params;

  const recibo = await prisma.recibo.findFirst({
    where: { id: reciboId, corrida: { empresaId: sesion.empresaId } },
    include: {
      empleado: true,
      conceptos: { orderBy: { orden: "asc" } },
      corrida: { include: { periodo: true } },
    },
  });
  if (!recibo) notFound();

  const porTipo = (tipo: string) => recibo.conceptos.filter((c) => c.tipo === tipo);

  return (
    <>
      <div className="flex flex-wrap items-center gap-3">
        <div>
          <h1 className="text-2xl font-semibold">
            {recibo.empleado.nombre} {recibo.empleado.apellidoPaterno}
          </h1>
          <p className="text-sm text-slate-500">
            {recibo.corrida.periodo.periodicidad.toLowerCase()} #{recibo.corrida.periodo.numero} ·{" "}
            {recibo.corrida.periodo.ejercicio} · {Number(recibo.diasPagados)} días pagados
          </p>
        </div>
        <div className="ml-auto flex items-center gap-3">
          <Etiqueta valor={recibo.corrida.estado} />
          <Link className="text-sm underline" href={`/api/recibos/${recibo.id}/xml`}>
            Descargar XML CFDI
          </Link>
        </div>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Metrica etiqueta="Gravado" valor={formatoMxn(recibo.totalGravado.toString())} />
        <Metrica etiqueta="Exento" valor={formatoMxn(recibo.totalExento.toString())} />
        <Metrica etiqueta="ISR retenido" valor={formatoMxn(recibo.isrRetenido.toString())} />
        <Metrica etiqueta="Neto" valor={formatoMxn(recibo.neto.toString())} />
      </div>

      {[
        { tipo: "PERCEPCION", titulo: "Percepciones" },
        { tipo: "DEDUCCION", titulo: "Deducciones" },
        { tipo: "OTRO_PAGO", titulo: "Otros pagos" },
      ].map(({ tipo, titulo }) =>
        porTipo(tipo).length === 0 ? null : (
          <Tarjeta key={tipo} titulo={titulo}>
            <Tabla encabezados={["Clave SAT", "Concepto", "Gravado", "Exento", "Importe"]}>
              {porTipo(tipo).map((concepto) => (
                <tr key={concepto.id}>
                  <td className="px-3 py-2 font-mono text-xs">{concepto.claveSat}</td>
                  <td className="px-3 py-2">{concepto.concepto}</td>
                  <td className="px-3 py-2">{formatoMxn(concepto.importeGravado.toString())}</td>
                  <td className="px-3 py-2">{formatoMxn(concepto.importeExento.toString())}</td>
                  <td className="px-3 py-2 font-medium">
                    {formatoMxn(concepto.importe.toString())}
                  </td>
                </tr>
              ))}
            </Tabla>
          </Tarjeta>
        ),
      )}

      <Tarjeta
        titulo="Memoria de cálculo"
        descripcion="Desglose auditable con el fundamento legal aplicado a cada importe."
      >
        <pre className="max-h-[32rem] overflow-auto rounded-lg bg-slate-900 p-4 text-xs text-slate-100">
          {JSON.stringify(recibo.memoriaCalculo, null, 2)}
        </pre>
      </Tarjeta>
    </>
  );
}
