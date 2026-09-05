import { accionGuardarRegistroRepse, accionRegistrarContratoRepse } from "@/app/acciones";
import { Formulario } from "@/components/formulario";
import { Campo, Metrica, Tabla, Tarjeta, Vacio } from "@/components/ui";
import { requerirSesion } from "@/lib/auth/sesion";
import { prisma } from "@/lib/db";
import { formatoMxn } from "@/lib/dinero";
import {
  calcularServicioEspecializado,
  cuatrimestresRepse,
  estadoRegistro,
  FUNDAMENTO_REPSE,
} from "@/lib/repse/calculo";

export const dynamic = "force-dynamic";

const fmtFecha = (fecha: Date) => fecha.toISOString().slice(0, 10);
const num = (valor: string | undefined) => (valor === undefined ? 0 : Number(valor) || 0);

export default async function PaginaRepse({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | undefined>>;
}) {
  const sesion = await requerirSesion();
  const filtros = await searchParams;
  const hoy = new Date();

  const [registro, contratos] = await Promise.all([
    prisma.registroRepse.findUnique({ where: { empresaId: sesion.empresaId } }),
    prisma.contratoRepse.findMany({
      where: { empresaId: sesion.empresaId },
      orderBy: { fechaInicio: "desc" },
    }),
  ]);

  const vigencia = registro ? estadoRegistro(registro.fechaRegistro, hoy) : null;
  const cotizacion = filtros.nomina
    ? calcularServicioEspecializado({
        nomina: num(filtros.nomina),
        cuotasPatronales: num(filtros.cuotas),
        impuestoSobreNominas: num(filtros.isn),
        provisiones: num(filtros.provisiones),
        otrosCostos: num(filtros.otros),
        margenUtilidad: num(filtros.margen) / 100,
        tasaIva: num(filtros.iva || "16") / 100,
        retencionIva6: filtros.retencion === "si",
      })
    : null;

  return (
    <>
      <div>
        <h1 className="text-2xl font-semibold">Servicios especializados (REPSE)</h1>
        <p className="text-sm text-slate-500">
          Necesitas REPSE si proporcionas a un tercero servicios u obras especializadas con personal
          propio y esa actividad no forma parte del objeto social ni de la actividad económica
          preponderante del beneficiario. Poner trabajadores a disposición para las actividades
          propias del contratante sigue prohibido.
        </p>
      </div>

      <Tarjeta titulo="Marco legal">
        <ul className="list-disc space-y-1 pl-5 text-sm text-slate-600">
          {FUNDAMENTO_REPSE.map((fundamento) => (
            <li key={fundamento}>{fundamento}</li>
          ))}
        </ul>
        <p className="mt-3 text-xs text-slate-500">
          La app prepara la información; la presentación del registro ante la STPS y de las
          informativas ICSOE y SISUB se hace en los portales oficiales.
        </p>
      </Tarjeta>

      <Tarjeta
        titulo="Registro ante la STPS"
        descripcion="El registro dura tres años y debe renovarse dentro de los tres meses previos a su vencimiento."
      >
        <Formulario
          accion={accionGuardarRegistroRepse}
          textoBoton={registro ? "Actualizar registro" : "Guardar registro"}
          className="grid gap-4 sm:grid-cols-2"
        >
          <Campo
            etiqueta="Número de registro"
            nombre="numeroRegistro"
            requerido
            valorInicial={registro?.numeroRegistro}
          />
          <Campo
            etiqueta="Fecha de registro"
            nombre="fechaRegistro"
            tipo="date"
            requerido
            valorInicial={registro ? fmtFecha(registro.fechaRegistro) : undefined}
          />
          <Campo
            etiqueta="Actividades registradas"
            nombre="actividades"
            requerido
            valorInicial={registro?.actividades}
            ayuda="Sepáralas con punto y coma; deben coincidir con el aviso ante la STPS."
          />
          <Campo etiqueta="Notas" nombre="notas" valorInicial={registro?.notas ?? undefined} />
        </Formulario>

        {vigencia ? (
          <div className="mt-4 grid gap-4 sm:grid-cols-3">
            <Metrica
              etiqueta="Vigencia"
              valor={vigencia.vigente ? "Vigente" : "Vencido"}
              nota={`Hasta ${fmtFecha(vigencia.fechaVencimiento)}`}
            />
            <Metrica
              etiqueta="Días para vencer"
              valor={String(vigencia.diasParaVencer)}
              nota={vigencia.requiereRenovacion ? "Inicia la renovación" : "Sin acción pendiente"}
            />
            <Metrica etiqueta="Contratos" valor={String(contratos.length)} />
          </div>
        ) : null}
      </Tarjeta>

      <Tarjeta
        titulo="Contratos de servicios especializados"
        descripcion="Cada contrato se informa en ICSOE (IMSS) y SISUB (INFONAVIT) con los trabajadores asignados."
      >
        <Formulario
          accion={accionRegistrarContratoRepse}
          textoBoton="Registrar contrato"
          className="grid gap-4 sm:grid-cols-3"
        >
          <Campo etiqueta="Beneficiario" nombre="beneficiario" requerido />
          <Campo etiqueta="RFC del beneficiario" nombre="rfcBeneficiario" requerido />
          <Campo etiqueta="Objeto del contrato" nombre="objeto" requerido />
          <Campo etiqueta="Inicio" nombre="fechaInicio" tipo="date" requerido />
          <Campo etiqueta="Fin" nombre="fechaFin" tipo="date" />
          <Campo etiqueta="Trabajadores asignados" nombre="numeroTrabajadores" tipo="number" />
          <Campo
            etiqueta="Margen de utilidad"
            nombre="margenUtilidad"
            tipo="number"
            paso="0.01"
            valorInicial={0.15}
            ayuda="En tanto por uno (0.15 = 15%)."
          />
          <Campo etiqueta="Otros costos directos" nombre="otrosCostos" tipo="number" paso="0.01" />
        </Formulario>

        <div className="mt-6">
          {contratos.length === 0 ? (
            <Vacio texto="Sin contratos registrados." />
          ) : (
            <Tabla
              encabezados={["Beneficiario", "RFC", "Objeto", "Vigencia", "Trabajadores", "Margen"]}
            >
              {contratos.map((contrato) => (
                <tr key={contrato.id}>
                  <td className="px-3 py-2">{contrato.beneficiario}</td>
                  <td className="px-3 py-2">{contrato.rfcBeneficiario}</td>
                  <td className="px-3 py-2">{contrato.objeto}</td>
                  <td className="px-3 py-2">
                    {fmtFecha(contrato.fechaInicio)} →{" "}
                    {contrato.fechaFin ? fmtFecha(contrato.fechaFin) : "indefinido"}
                  </td>
                  <td className="px-3 py-2">{contrato.numeroTrabajadores}</td>
                  <td className="px-3 py-2">
                    {(Number(contrato.margenUtilidad) * 100).toFixed(2)}%
                  </td>
                </tr>
              ))}
            </Tabla>
          )}
        </div>
      </Tarjeta>

      <Tarjeta
        titulo="Costeo del servicio especializado"
        descripcion="Determina el precio a facturar al beneficiario partiendo del costo laboral del personal asignado."
      >
        <form className="grid gap-4 sm:grid-cols-4" method="get">
          <Campo etiqueta="Nómina del periodo" nombre="nomina" tipo="number" paso="0.01" requerido valorInicial={filtros.nomina} />
          <Campo etiqueta="Cuotas patronales" nombre="cuotas" tipo="number" paso="0.01" valorInicial={filtros.cuotas} />
          <Campo etiqueta="ISN" nombre="isn" tipo="number" paso="0.01" valorInicial={filtros.isn} />
          <Campo etiqueta="Provisiones" nombre="provisiones" tipo="number" paso="0.01" valorInicial={filtros.provisiones} ayuda="Aguinaldo, vacaciones y prima." />
          <Campo etiqueta="Otros costos" nombre="otros" tipo="number" paso="0.01" valorInicial={filtros.otros} />
          <Campo etiqueta="Margen %" nombre="margen" tipo="number" paso="0.01" valorInicial={filtros.margen ?? 15} />
          <Campo etiqueta="IVA %" nombre="iva" tipo="number" paso="0.01" valorInicial={filtros.iva ?? 16} />
          <label className="flex flex-col gap-1 text-sm">
            <span className="font-medium text-slate-700">Retención 6% IVA</span>
            <select
              className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-slate-900"
              name="retencion"
              defaultValue={filtros.retencion ?? "no"}
            >
              <option value="no">No aplica</option>
              <option value="si">Sí (Art. 1-A IV LIVA)</option>
            </select>
          </label>
          <div className="sm:col-span-4">
            <button
              type="submit"
              className="rounded-lg bg-slate-900 px-4 py-2 text-sm font-medium text-white"
            >
              Calcular
            </button>
          </div>
        </form>

        {cotizacion ? (
          <div className="mt-6">
            <Tabla encabezados={["Concepto", "Importe"]}>
              {([
                ["Nómina", cotizacion.costoNomina],
                ["Cuotas patronales", cotizacion.cuotasPatronales],
                ["ISN", cotizacion.impuestoSobreNominas],
                ["Provisiones", cotizacion.provisiones],
                ["Otros costos", cotizacion.otrosCostos],
                ["Costo total", cotizacion.costoTotal],
                ["Utilidad", cotizacion.utilidad],
                ["Subtotal facturable", cotizacion.subtotal],
                ["IVA trasladado", cotizacion.iva],
                ["Retención de IVA", cotizacion.retencionIva],
                ["Total a cobrar", cotizacion.total],
              ] as const).map(([concepto, importe]) => (
                <tr key={concepto}>
                  <td className="px-3 py-2">{concepto}</td>
                  <td className="px-3 py-2">{formatoMxn(importe)}</td>
                </tr>
              ))}
            </Tabla>
          </div>
        ) : null}
      </Tarjeta>

      <Tarjeta
        titulo={`Informativas cuatrimestrales ${hoy.getUTCFullYear()}`}
        descripcion="ICSOE ante el IMSS y SISUB ante el INFONAVIT se presentan dentro de los 17 días naturales siguientes al cuatrimestre."
      >
        <Tabla encabezados={["Cuatrimestre", "Del", "Al", "Fecha límite"]}>
          {cuatrimestresRepse(hoy.getUTCFullYear()).map((cuatrimestre) => (
            <tr key={cuatrimestre.etiqueta}>
              <td className="px-3 py-2">{cuatrimestre.etiqueta}</td>
              <td className="px-3 py-2">{fmtFecha(cuatrimestre.inicio)}</td>
              <td className="px-3 py-2">{fmtFecha(cuatrimestre.fin)}</td>
              <td className="px-3 py-2">{fmtFecha(cuatrimestre.fechaLimite)}</td>
            </tr>
          ))}
        </Tabla>
      </Tarjeta>
    </>
  );
}
