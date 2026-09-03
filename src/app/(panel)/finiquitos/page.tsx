import { accionCalcularFiniquito } from "@/app/acciones";
import { Formulario } from "@/components/formulario";
import { Campo, Seleccion, Tabla, Tarjeta, Vacio } from "@/components/ui";
import { requerirSesion } from "@/lib/auth/sesion";
import { prisma } from "@/lib/db";
import { formatoMxn } from "@/lib/dinero";

export const dynamic = "force-dynamic";

const SEPARACIONES = [
  "RENUNCIA",
  "DESPIDO_INJUSTIFICADO",
  "DESPIDO_JUSTIFICADO",
  "TERMINO_CONTRATO",
  "MUTUO_ACUERDO",
  "DEFUNCION",
];

export default async function PaginaFiniquitos() {
  const sesion = await requerirSesion();
  const [empleados, finiquitos] = await Promise.all([
    prisma.empleado.findMany({
      where: { empresaId: sesion.empresaId, estado: { not: "BAJA" } },
      orderBy: { numeroEmpleado: "asc" },
    }),
    prisma.finiquito.findMany({
      where: { empleado: { empresaId: sesion.empresaId } },
      include: { empleado: true },
      orderBy: { creadoEn: "desc" },
    }),
  ]);

  return (
    <>
      <div>
        <h1 className="text-2xl font-semibold">Finiquitos y liquidaciones</h1>
        <p className="text-sm text-slate-500">
          Partes proporcionales, prima de antigüedad (Art. 162 LFT) e indemnizaciones (Art. 48 y 50
          LFT), con la exención de 90 UMA por año de servicio y la retención del Art. 174 RLISR.
        </p>
      </div>

      <Tarjeta titulo="Calcular separación">
        <Formulario accion={accionCalcularFiniquito} textoBoton="Calcular y dar de baja">
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
              etiqueta="Motivo de separación"
              nombre="tipoSeparacion"
              opciones={SEPARACIONES.map((s) => ({ valor: s, texto: s.replaceAll("_", " ") }))}
            />
            <Campo etiqueta="Fecha de baja" nombre="fechaBaja" tipo="date" requerido />
            <Campo
              etiqueta="Días pendientes de pago"
              nombre="diasPendientesDePago"
              tipo="number"
              paso="0.01"
              valorInicial={0}
            />
            <Campo
              etiqueta="Días de vacaciones ya disfrutados"
              nombre="diasVacacionesDisfrutados"
              tipo="number"
              paso="0.01"
              valorInicial={0}
            />
            <label className="flex items-center gap-2 self-end text-sm">
              <input type="checkbox" name="incluyeVeinteDiasPorAnio" className="h-4 w-4" />
              <span>Incluir 20 días por año (Art. 50-II LFT)</span>
            </label>
          </div>
        </Formulario>
      </Tarjeta>

      <Tarjeta titulo="Historial">
        {finiquitos.length === 0 ? (
          <Vacio texto="Sin finiquitos calculados." />
        ) : (
          <Tabla encabezados={["Empleado", "Motivo", "Fecha baja", "Percepciones", "Deducciones", "Neto"]}>
            {finiquitos.map((finiquito) => (
              <tr key={finiquito.id}>
                <td className="px-3 py-2">
                  {finiquito.empleado.nombre} {finiquito.empleado.apellidoPaterno}
                </td>
                <td className="px-3 py-2">{finiquito.tipoSeparacion.replaceAll("_", " ")}</td>
                <td className="px-3 py-2">{finiquito.fechaBaja.toISOString().slice(0, 10)}</td>
                <td className="px-3 py-2">{formatoMxn(finiquito.totalPercepciones.toString())}</td>
                <td className="px-3 py-2">{formatoMxn(finiquito.totalDeducciones.toString())}</td>
                <td className="px-3 py-2 font-medium">{formatoMxn(finiquito.neto.toString())}</td>
              </tr>
            ))}
          </Tabla>
        )}
      </Tarjeta>
    </>
  );
}
