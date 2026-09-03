import Link from "next/link";
import { requerirSesion } from "@/lib/auth/sesion";
import { prisma } from "@/lib/db";
import { formatoMxn } from "@/lib/dinero";
import { verificarCadena } from "@/lib/auditoria/bitacora";
import { Etiqueta, Metrica, Tabla, Tarjeta, Vacio } from "@/components/ui";

export const dynamic = "force-dynamic";

export default async function Tablero() {
  const sesion = await requerirSesion();
  const [empleados, corridas, ultimas, eventos, integridad] = await Promise.all([
    prisma.empleado.groupBy({
      by: ["periodicidad"],
      where: { empresaId: sesion.empresaId, estado: { not: "BAJA" } },
      _count: true,
      _sum: { salarioDiario: true },
    }),
    prisma.corridaNomina.aggregate({
      where: { empresaId: sesion.empresaId, estado: { in: ["AUTORIZADA", "TIMBRADA", "PAGADA"] } },
      _sum: { totalNeto: true, totalCuotasPatron: true },
    }),
    prisma.corridaNomina.findMany({
      where: { empresaId: sesion.empresaId },
      include: { periodo: true, _count: { select: { recibos: true } } },
      orderBy: { creadaEn: "desc" },
      take: 5,
    }),
    prisma.registroBitacora.count({ where: { empresaId: sesion.empresaId } }),
    verificarCadena(),
  ]);

  const totalEmpleados = empleados.reduce((acc, e) => acc + e._count, 0);

  return (
    <>
      <div>
        <h1 className="text-2xl font-semibold">Tablero</h1>
        <p className="text-sm text-slate-500">
          Nómina semanal, catorcenal, quincenal y mensual con bitácora encadenada por hash.
        </p>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Metrica etiqueta="Empleados activos" valor={String(totalEmpleados)} />
        <Metrica
          etiqueta="Neto pagado / autorizado"
          valor={formatoMxn(corridas._sum.totalNeto?.toString() ?? 0)}
        />
        <Metrica
          etiqueta="Cuotas patronales"
          valor={formatoMxn(corridas._sum.totalCuotasPatron?.toString() ?? 0)}
        />
        <Metrica
          etiqueta="Eventos en bitácora"
          valor={String(eventos)}
          nota={
            integridad.integra
              ? "Cadena íntegra"
              : `Cadena rota en #${integridad.primerRegistroInvalido?.secuencia}`
          }
        />
      </div>

      <Tarjeta titulo="Plantilla por periodicidad">
        {empleados.length === 0 ? (
          <Vacio texto="Aún no hay empleados dados de alta." />
        ) : (
          <Tabla encabezados={["Periodicidad", "Empleados", "Suma de salarios diarios"]}>
            {empleados.map((fila) => (
              <tr key={fila.periodicidad}>
                <td className="px-3 py-2">{fila.periodicidad}</td>
                <td className="px-3 py-2">{fila._count}</td>
                <td className="px-3 py-2">
                  {formatoMxn(fila._sum.salarioDiario?.toString() ?? 0)}
                </td>
              </tr>
            ))}
          </Tabla>
        )}
      </Tarjeta>

      <Tarjeta titulo="Últimas corridas">
        {ultimas.length === 0 ? (
          <Vacio texto="No hay corridas calculadas todavía." />
        ) : (
          <Tabla encabezados={["Periodo", "Periodicidad", "Recibos", "Neto", "Estado", ""]}>
            {ultimas.map((corrida) => (
              <tr key={corrida.id}>
                <td className="px-3 py-2">
                  {corrida.periodo.ejercicio} · #{corrida.periodo.numero}
                </td>
                <td className="px-3 py-2">{corrida.periodo.periodicidad}</td>
                <td className="px-3 py-2">{corrida._count.recibos}</td>
                <td className="px-3 py-2">{formatoMxn(corrida.totalNeto.toString())}</td>
                <td className="px-3 py-2">
                  <Etiqueta valor={corrida.estado} />
                </td>
                <td className="px-3 py-2">
                  <Link className="text-sm underline" href={`/nomina/${corrida.id}`}>
                    Ver
                  </Link>
                </td>
              </tr>
            ))}
          </Tabla>
        )}
      </Tarjeta>
    </>
  );
}
