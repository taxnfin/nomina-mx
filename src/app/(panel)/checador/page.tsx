import {
  accionConfigurarGeocerca,
  accionGenerarIncidenciasChecador,
  accionRegistrarChecada,
} from "@/app/acciones";
import { Formulario } from "@/components/formulario";
import { SelectorUbicacion } from "@/components/selector-ubicacion";
import { Campo, Etiqueta, Metrica, Seleccion, Tabla, Tarjeta, Vacio } from "@/components/ui";
import { requerirSesion } from "@/lib/auth/sesion";
import { diasLaborablesDesdeTexto, resumirAsistencia } from "@/lib/checador/jornada";
import { prisma } from "@/lib/db";
import { PERIODICIDADES, type Periodicidad } from "@/lib/fiscal/periodicidad";

export const dynamic = "force-dynamic";

const TIPOS = ["ENTRADA", "SALIDA", "INICIO_COMIDA", "FIN_COMIDA"];

const momento = (fecha: Date) => fecha.toISOString().replace("T", " ").slice(0, 16);

const mapa = (latitud: string, longitud: string) =>
  `https://www.google.com/maps?q=${latitud},${longitud}`;

export default async function PaginaChecador({
  searchParams,
}: {
  searchParams: Promise<{ periodicidad?: string; ejercicio?: string; periodoId?: string }>;
}) {
  const sesion = await requerirSesion();
  const filtros = await searchParams;
  const periodicidad = (
    PERIODICIDADES.includes(filtros.periodicidad as Periodicidad)
      ? filtros.periodicidad
      : "QUINCENAL"
  ) as Periodicidad;
  const ejercicio = Number(filtros.ejercicio) || new Date().getUTCFullYear();

  const [empleados, periodos, checadas] = await Promise.all([
    prisma.empleado.findMany({
      where: { empresaId: sesion.empresaId, estado: { not: "BAJA" } },
      orderBy: { numeroEmpleado: "asc" },
    }),
    prisma.periodoNomina.findMany({
      where: { ejercicio, periodicidad },
      orderBy: { numero: "asc" },
    }),
    prisma.checada.findMany({
      where: { empleado: { empresaId: sesion.empresaId } },
      include: { empleado: true },
      orderBy: { ocurridoEn: "desc" },
      take: 50,
    }),
  ]);

  const conChecador = empleados.filter((e) => e.checadorActivo);
  const periodoSeleccionado =
    periodos.find((p) => p.id === filtros.periodoId) ??
    periodos.find(
      (p) => p.fechaInicio <= new Date() && p.fechaFin >= new Date(),
    ) ??
    periodos[0];

  const previsualizacion = periodoSeleccionado
    ? await Promise.all(
        conChecador
          .filter((empleado) => empleado.periodicidad === periodicidad)
          .map(async (empleado) => {
            const inicio = new Date(
              `${periodoSeleccionado.fechaInicio.toISOString().slice(0, 10)}T00:00:00.000Z`,
            );
            const fin = new Date(
              `${periodoSeleccionado.fechaFin.toISOString().slice(0, 10)}T23:59:59.999Z`,
            );
            const delPeriodo = await prisma.checada.findMany({
              where: { empleadoId: empleado.id, ocurridoEn: { gte: inicio, lte: fin } },
              orderBy: { ocurridoEn: "asc" },
            });
            return {
              empleado,
              resumen: resumirAsistencia(
                delPeriodo.map((c) => ({ tipo: c.tipo, ocurridoEn: c.ocurridoEn })),
                {
                  horaEntrada: empleado.horaEntrada,
                  horaSalida: empleado.horaSalida,
                  toleranciaMinutos: empleado.toleranciaMinutos,
                  diasLaborables: diasLaborablesDesdeTexto(empleado.diasLaborables),
                },
                { inicio, fin },
              ),
            };
          }),
      )
    : [];

  return (
    <>
      <div>
        <h1 className="text-2xl font-semibold">Checador por WhatsApp</h1>
        <p className="text-sm text-slate-500">
          El empleado manda ENTRADA, COMIDA, REGRESO o SALIDA al número de la empresa. Las checadas
          se convierten en faltas y horas extra (nueve al doble por semana y el resto al triple,
          Art. 66 y 68 LFT) que entran directo a la corrida del periodo.
        </p>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Metrica etiqueta="Empleados con checador" valor={String(conChecador.length)} />
        <Metrica etiqueta="Checadas registradas" valor={String(checadas.length)} nota="Últimas 50" />
        <Metrica
          etiqueta="Faltas del periodo"
          valor={String(previsualizacion.reduce((t, p) => t + p.resumen.faltas, 0))}
        />
        <Metrica
          etiqueta="Horas extra del periodo"
          valor={previsualizacion
            .reduce((t, p) => t + p.resumen.horasExtraDobles + p.resumen.horasExtraTriples, 0)
            .toFixed(2)}
        />
      </div>

      <Tarjeta
        titulo="Aplicar asistencia a la nómina"
        descripcion="Regenera las incidencias derivadas del checador del periodo; las capturadas a mano no se tocan."
      >
        <form className="mb-4 flex flex-wrap items-end gap-3" method="get">
          <Seleccion
            etiqueta="Periodicidad"
            nombre="periodicidad"
            valorInicial={periodicidad}
            opciones={PERIODICIDADES.map((p) => ({ valor: p, texto: p }))}
          />
          <Campo etiqueta="Ejercicio" nombre="ejercicio" tipo="number" valorInicial={ejercicio} />
          <Seleccion
            etiqueta="Periodo"
            nombre="periodoId"
            valorInicial={periodoSeleccionado?.id}
            opciones={periodos.map((p) => ({
              valor: p.id,
              texto: `#${p.numero} · ${p.fechaInicio.toISOString().slice(0, 10)} al ${p.fechaFin
                .toISOString()
                .slice(0, 10)}`,
            }))}
          />
          <button
            type="submit"
            className="rounded-lg border border-slate-300 bg-white px-4 py-2 text-sm font-medium hover:bg-slate-50"
          >
            Ver
          </button>
        </form>

        {previsualizacion.length === 0 ? (
          <Vacio texto="No hay empleados con checador activo en esta periodicidad." />
        ) : (
          <>
            <Tabla
              encabezados={[
                "Empleado",
                "Días con checada",
                "Faltas",
                "Retardos",
                "Extra dobles",
                "Extra triples",
                "Descanso trabajado",
              ]}
            >
              {previsualizacion.map(({ empleado, resumen }) => (
                <tr key={empleado.id}>
                  <td className="px-3 py-2">
                    {empleado.nombre} {empleado.apellidoPaterno}
                    <span className="block text-xs text-slate-500">
                      {empleado.telefonoWhatsapp} · {empleado.horaEntrada}-{empleado.horaSalida}
                    </span>
                  </td>
                  <td className="px-3 py-2">
                    {resumen.dias.filter((d) => d.entrada !== null).length}
                  </td>
                  <td className="px-3 py-2">{resumen.faltas}</td>
                  <td className="px-3 py-2">{resumen.retardos}</td>
                  <td className="px-3 py-2">{resumen.horasExtraDobles.toFixed(2)}</td>
                  <td className="px-3 py-2">{resumen.horasExtraTriples.toFixed(2)}</td>
                  <td className="px-3 py-2">{resumen.diasDescansoTrabajados}</td>
                </tr>
              ))}
            </Tabla>

            {periodoSeleccionado ? (
              <Formulario
                accion={accionGenerarIncidenciasChecador}
                textoBoton="Aplicar a la nómina"
                className="mt-4 flex items-center gap-3"
              >
                <input type="hidden" name="periodoId" value={periodoSeleccionado.id} />
              </Formulario>
            ) : null}
          </>
        )}
      </Tarjeta>

      <Tarjeta
        titulo="Centro de trabajo y geocerca"
        descripcion="Las checadas con ubicación se comparan contra estas coordenadas; fuera del radio quedan marcadas para revisión."
      >
        <Formulario accion={accionConfigurarGeocerca} textoBoton="Guardar geocerca">
          <div className="grid gap-4 sm:grid-cols-2">
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
              etiqueta="Exigir ubicación"
              nombre="exigeUbicacion"
              opciones={[
                { valor: "NO", texto: "No, opcional" },
                { valor: "SI", texto: "Sí, rechazar sin ubicación" },
              ]}
            />
          </div>
          <SelectorUbicacion />
        </Formulario>

        {conChecador.length === 0 ? null : (
          <div className="mt-4">
            <Tabla encabezados={["Empleado", "Centro de trabajo", "Radio", "Ubicación"]}>
              {conChecador.map((empleado) => (
                <tr key={empleado.id}>
                  <td className="px-3 py-2">
                    {empleado.numeroEmpleado} · {empleado.nombre} {empleado.apellidoPaterno}
                  </td>
                  <td className="px-3 py-2 text-xs text-slate-500">
                    {empleado.latitudCentro && empleado.longitudCentro ? (
                      <a
                        className="underline"
                        href={mapa(
                          empleado.latitudCentro.toString(),
                          empleado.longitudCentro.toString(),
                        )}
                        target="_blank"
                        rel="noreferrer"
                      >
                        {empleado.latitudCentro.toString()}, {empleado.longitudCentro.toString()}
                      </a>
                    ) : (
                      "Sin geocerca"
                    )}
                  </td>
                  <td className="px-3 py-2">{empleado.radioMetros} m</td>
                  <td className="px-3 py-2">
                    <Etiqueta valor={empleado.exigeUbicacion ? "OBLIGATORIA" : "OPCIONAL"} />
                  </td>
                </tr>
              ))}
            </Tabla>
          </div>
        )}
      </Tarjeta>

      <Tarjeta
        titulo="Checada manual"
        descripcion="Para correcciones: queda marcada como MANUAL y también se sella en la bitácora."
      >
        <Formulario accion={accionRegistrarChecada} textoBoton="Registrar checada">
          <div className="grid gap-4 sm:grid-cols-3">
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
            <Campo etiqueta="Fecha y hora" nombre="ocurridoEn" tipo="datetime-local" requerido />
          </div>
        </Formulario>
      </Tarjeta>

      <Tarjeta titulo="Últimas checadas">
        {checadas.length === 0 ? (
          <Vacio texto="Sin checadas registradas." />
        ) : (
          <Tabla
            encabezados={[
              "Empleado",
              "Tipo",
              "Momento",
              "Origen",
              "Teléfono",
              "Ubicación",
              "Distancia",
            ]}
          >
            {checadas.map((checada) => (
              <tr key={checada.id}>
                <td className="px-3 py-2">
                  {checada.empleado.nombre} {checada.empleado.apellidoPaterno}
                </td>
                <td className="px-3 py-2">{checada.tipo.replaceAll("_", " ")}</td>
                <td className="px-3 py-2">{momento(checada.ocurridoEn)}</td>
                <td className="px-3 py-2">
                  <Etiqueta valor={checada.origen} />
                </td>
                <td className="px-3 py-2 text-xs text-slate-500">{checada.telefono ?? "—"}</td>
                <td className="px-3 py-2 text-xs text-slate-500">
                  {checada.latitud && checada.longitud ? (
                    <a
                      className="underline"
                      href={mapa(checada.latitud.toString(), checada.longitud.toString())}
                      target="_blank"
                      rel="noreferrer"
                    >
                      Ver mapa
                    </a>
                  ) : (
                    "Sin ubicación"
                  )}
                </td>
                <td className="px-3 py-2 text-xs">
                  {checada.distanciaMetros === null ? (
                    <span className="text-slate-500">—</span>
                  ) : (
                    <span className={checada.fueraDeRango ? "font-medium text-red-600" : ""}>
                      {checada.distanciaMetros} m{checada.fueraDeRango ? " · fuera de rango" : ""}
                    </span>
                  )}
                </td>
              </tr>
            ))}
          </Tabla>
        )}
      </Tarjeta>
    </>
  );
}
