import { Tabla, Tarjeta, Vacio } from "@/components/ui";
import { verificarCadena } from "@/lib/auditoria/bitacora";
import { requerirSesion } from "@/lib/auth/sesion";
import { prisma } from "@/lib/db";

export const dynamic = "force-dynamic";

export default async function PaginaAuditoria({
  searchParams,
}: {
  searchParams: Promise<{ entidad?: string }>;
}) {
  const sesion = await requerirSesion();
  const { entidad } = await searchParams;

  const [registros, verificacion] = await Promise.all([
    prisma.registroBitacora.findMany({
      where: { empresaId: sesion.empresaId, ...(entidad ? { entidad } : {}) },
      orderBy: { secuencia: "desc" },
      take: 100,
    }),
    verificarCadena(),
  ]);

  return (
    <>
      <div>
        <h1 className="text-2xl font-semibold">Trazabilidad</h1>
        <p className="text-sm text-slate-500">
          Bitácora append-only: cada evento sella con SHA-256 su contenido y el hash del evento
          anterior, de modo que borrar o modificar un registro rompe la cadena.
        </p>
      </div>

      <div
        className={`rounded-xl border p-4 text-sm ${
          verificacion.integra
            ? "border-emerald-200 bg-emerald-50 text-emerald-800"
            : "border-rose-200 bg-rose-50 text-rose-800"
        }`}
      >
        {verificacion.integra ? (
          <>
            Cadena íntegra: {verificacion.registrosVerificados} eventos verificados de extremo a
            extremo.
          </>
        ) : (
          <>
            Cadena comprometida en el evento #{verificacion.primerRegistroInvalido?.secuencia}:{" "}
            {verificacion.primerRegistroInvalido?.motivo}
          </>
        )}
      </div>

      <Tarjeta titulo="Eventos recientes">
        {registros.length === 0 ? (
          <Vacio texto="Sin eventos registrados." />
        ) : (
          <Tabla encabezados={["#", "Fecha", "Acción", "Entidad", "Actor", "IP", "Hash"]}>
            {registros.map((registro) => (
              <tr key={registro.id}>
                <td className="px-3 py-2">{registro.secuencia}</td>
                <td className="px-3 py-2 whitespace-nowrap">
                  {registro.ocurridoEn.toISOString().replace("T", " ").slice(0, 19)}
                </td>
                <td className="px-3 py-2">{registro.accion}</td>
                <td className="px-3 py-2">
                  {registro.entidad}
                  <span className="block font-mono text-xs text-slate-400">
                    {registro.entidadId ?? "—"}
                  </span>
                </td>
                <td className="px-3 py-2">
                  {registro.actorEmail ?? "sistema"}
                  <span className="block text-xs text-slate-500">{registro.actorRol ?? ""}</span>
                </td>
                <td className="px-3 py-2 text-xs text-slate-500">{registro.ip ?? "—"}</td>
                <td className="px-3 py-2 font-mono text-xs text-slate-500">
                  {registro.hash.slice(0, 12)}…
                  <span className="block text-slate-400">← {registro.hashPrevio.slice(0, 12)}…</span>
                </td>
              </tr>
            ))}
          </Tabla>
        )}
      </Tarjeta>
    </>
  );
}
