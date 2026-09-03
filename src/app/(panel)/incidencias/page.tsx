import { accionRegistrarIncidencia } from "@/app/acciones";
import { Formulario } from "@/components/formulario";
import { Campo, Seleccion, Tabla, Tarjeta, Vacio } from "@/components/ui";
import { requerirSesion } from "@/lib/auth/sesion";
import { prisma } from "@/lib/db";

export const dynamic = "force-dynamic";

const TIPOS = [
  "FALTA",
  "INCAPACIDAD_ENFERMEDAD",
  "INCAPACIDAD_RIESGO",
  "INCAPACIDAD_MATERNIDAD",
  "PERMISO_SIN_GOCE",
  "PERMISO_CON_GOCE",
  "VACACIONES",
  "HORAS_EXTRA_DOBLES",
  "HORAS_EXTRA_TRIPLES",
  "DIA_DESCANSO_TRABAJADO",
  "PRIMA_DOMINICAL",
  "DIA_FESTIVO_TRABAJADO",
];

const fmt = (fecha: Date) => fecha.toISOString().slice(0, 10);

export default async function PaginaIncidencias() {
  const sesion = await requerirSesion();
  const [empleados, incidencias] = await Promise.all([
    prisma.empleado.findMany({
      where: { empresaId: sesion.empresaId, estado: { not: "BAJA" } },
      orderBy: { numeroEmpleado: "asc" },
    }),
    prisma.incidencia.findMany({
      where: { empleado: { empresaId: sesion.empresaId } },
      include: { empleado: true },
      orderBy: { fechaInicio: "desc" },
      take: 50,
    }),
  ]);

  return (
    <>
      <div>
        <h1 className="text-2xl font-semibold">Incidencias</h1>
        <p className="text-sm text-slate-500">
          Faltas, incapacidades, vacaciones, horas extra (Art. 66-68 LFT), prima dominical y días
          festivos. Se aplican automáticamente a la corrida del periodo que las contiene.
        </p>
      </div>

      <Tarjeta titulo="Registrar incidencia">
        <Formulario accion={accionRegistrarIncidencia} textoBoton="Registrar">
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            <Seleccion
              etiqueta="Empleado"
              nombre="empleadoId"
              requerido
              opciones={empleados.map((e) => ({
                valor: e.id,
                texto: `${e.numeroEmpleado} · ${e.nombre} ${e.apellidoPaterno}`,
              }))}
            />
            <Seleccion
              etiqueta="Tipo"
              nombre="tipo"
              opciones={TIPOS.map((t) => ({ valor: t, texto: t.replaceAll("_", " ") }))}
            />
            <Campo
              etiqueta="Cantidad"
              nombre="cantidad"
              tipo="number"
              paso="0.01"
              valorInicial={1}
              ayuda="Días, u horas en el caso de tiempo extraordinario."
            />
            <Campo etiqueta="Fecha inicio" nombre="fechaInicio" tipo="date" requerido />
            <Campo etiqueta="Fecha fin" nombre="fechaFin" tipo="date" requerido />
            <Campo etiqueta="Comentario" nombre="comentario" />
          </div>
        </Formulario>
      </Tarjeta>

      <Tarjeta titulo="Últimas incidencias">
        {incidencias.length === 0 ? (
          <Vacio texto="Sin incidencias registradas." />
        ) : (
          <Tabla encabezados={["Empleado", "Tipo", "Del", "Al", "Cantidad", "Comentario"]}>
            {incidencias.map((incidencia) => (
              <tr key={incidencia.id}>
                <td className="px-3 py-2">
                  {incidencia.empleado.nombre} {incidencia.empleado.apellidoPaterno}
                </td>
                <td className="px-3 py-2">{incidencia.tipo.replaceAll("_", " ")}</td>
                <td className="px-3 py-2">{fmt(incidencia.fechaInicio)}</td>
                <td className="px-3 py-2">{fmt(incidencia.fechaFin)}</td>
                <td className="px-3 py-2">{Number(incidencia.cantidad)}</td>
                <td className="px-3 py-2 text-slate-500">{incidencia.comentario ?? "—"}</td>
              </tr>
            ))}
          </Tabla>
        )}
      </Tarjeta>
    </>
  );
}
