import Link from "next/link";
import { accionCalcularCorrida, accionGenerarCalendario } from "@/app/acciones";
import { Formulario } from "@/components/formulario";
import { Campo, Etiqueta, Seleccion, Tabla, Tarjeta, Vacio } from "@/components/ui";
import { requerirSesion } from "@/lib/auth/sesion";
import { prisma } from "@/lib/db";
import { formatoMxn } from "@/lib/dinero";
import { PERIODICIDADES, type Periodicidad } from "@/lib/fiscal/periodicidad";

export const dynamic = "force-dynamic";

const fmt = (fecha: Date) => fecha.toISOString().slice(0, 10);

export default async function PaginaNomina({
  searchParams,
}: {
  searchParams: Promise<{ periodicidad?: string; ejercicio?: string }>;
}) {
  const sesion = await requerirSesion();
  const filtros = await searchParams;
  const periodicidad = (
    PERIODICIDADES.includes(filtros.periodicidad as Periodicidad)
      ? filtros.periodicidad
      : "QUINCENAL"
  ) as Periodicidad;
  const ejercicio = Number(filtros.ejercicio) || new Date().getUTCFullYear();

  const periodos = await prisma.periodoNomina.findMany({
    where: { ejercicio, periodicidad },
    orderBy: { numero: "asc" },
    include: {
      corridas: {
        where: { empresaId: sesion.empresaId },
        include: { _count: { select: { recibos: true } } },
      },
    },
  });

  return (
    <>
      <div>
        <h1 className="text-2xl font-semibold">Corridas de nómina</h1>
        <p className="text-sm text-slate-500">
          Cada corrida guarda un snapshot inmutable de los parámetros fiscales usados y no puede
          recalcularse una vez autorizada.
        </p>
      </div>

      <Tarjeta titulo="Calendario fiscal">
        <div className="flex flex-wrap items-end gap-6">
          <form className="flex flex-wrap items-end gap-3" method="get">
            <Seleccion
              etiqueta="Periodicidad"
              nombre="periodicidad"
              valorInicial={periodicidad}
              opciones={PERIODICIDADES.map((p) => ({ valor: p, texto: p }))}
            />
            <Campo etiqueta="Ejercicio" nombre="ejercicio" tipo="number" valorInicial={ejercicio} />
            <button
              type="submit"
              className="rounded-lg border border-slate-300 bg-white px-4 py-2 text-sm font-medium hover:bg-slate-50"
            >
              Ver
            </button>
          </form>

          <Formulario
            accion={accionGenerarCalendario}
            textoBoton="Generar calendario"
            variante="secundario"
            className="flex flex-wrap items-end gap-3"
          >
            <input type="hidden" name="periodicidad" value={periodicidad} />
            <input type="hidden" name="ejercicio" value={ejercicio} />
          </Formulario>
        </div>
      </Tarjeta>

      <Tarjeta titulo={`Periodos ${periodicidad.toLowerCase()} ${ejercicio}`}>
        {periodos.length === 0 ? (
          <Vacio texto="No hay periodos generados para esta periodicidad y ejercicio." />
        ) : (
          <Tabla
            encabezados={["#", "Del", "Al", "Pago", "Días", "Recibos", "Neto", "Estado", ""]}
          >
            {periodos.map((periodo) => {
              const corrida = periodo.corridas[0];
              return (
                <tr key={periodo.id}>
                  <td className="px-3 py-2">{periodo.numero}</td>
                  <td className="px-3 py-2">{fmt(periodo.fechaInicio)}</td>
                  <td className="px-3 py-2">{fmt(periodo.fechaFin)}</td>
                  <td className="px-3 py-2">{fmt(periodo.fechaPago)}</td>
                  <td className="px-3 py-2">{periodo.diasPeriodo}</td>
                  <td className="px-3 py-2">{corrida?._count.recibos ?? "—"}</td>
                  <td className="px-3 py-2">
                    {corrida ? formatoMxn(corrida.totalNeto.toString()) : "—"}
                  </td>
                  <td className="px-3 py-2">
                    {corrida ? <Etiqueta valor={corrida.estado} /> : <Etiqueta valor="SIN CALCULAR" />}
                  </td>
                  <td className="px-3 py-2">
                    <div className="flex items-center gap-3">
                      {corrida ? (
                        <Link className="text-sm underline" href={`/nomina/${corrida.id}`}>
                          Ver
                        </Link>
                      ) : null}
                      {!corrida || corrida.estado === "CALCULADA" || corrida.estado === "BORRADOR" ? (
                        <Formulario
                          accion={accionCalcularCorrida}
                          textoBoton={corrida ? "Recalcular" : "Calcular"}
                          variante="secundario"
                          className="flex items-center gap-2"
                        >
                          <input type="hidden" name="periodoId" value={periodo.id} />
                        </Formulario>
                      ) : null}
                    </div>
                  </td>
                </tr>
              );
            })}
          </Tabla>
        )}
      </Tarjeta>
    </>
  );
}
