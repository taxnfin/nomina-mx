import { accionGuardarConfiguracionIsn } from "@/app/acciones";
import { Formulario } from "@/components/formulario";
import { Campo, Etiqueta, Metrica, Seleccion, Tabla, Tarjeta, Vacio } from "@/components/ui";
import { requerirSesion } from "@/lib/auth/sesion";
import { prisma } from "@/lib/db";
import { formatoMxn } from "@/lib/dinero";
import { OPCIONES_ENTIDAD_ISN } from "@/lib/fiscal/configuracion-isn";
import { calendarioDeObligaciones } from "@/lib/obligaciones/calendario";
import { obligacionesDelMes } from "@/lib/obligaciones/servicio";

export const dynamic = "force-dynamic";

const MESES = [
  "Enero",
  "Febrero",
  "Marzo",
  "Abril",
  "Mayo",
  "Junio",
  "Julio",
  "Agosto",
  "Septiembre",
  "Octubre",
  "Noviembre",
  "Diciembre",
];

const fmtFecha = (fecha: Date) => fecha.toISOString().slice(0, 10);
const pct = (tasa: number) => `${(tasa * 100).toFixed(2)}%`;

export default async function PaginaObligaciones({
  searchParams,
}: {
  searchParams: Promise<{ ejercicio?: string; mes?: string }>;
}) {
  const sesion = await requerirSesion();
  const filtros = await searchParams;
  const hoy = new Date();
  const ejercicio = Number(filtros.ejercicio) || hoy.getUTCFullYear();
  const mes = filtros.mes !== undefined ? Number(filtros.mes) : hoy.getUTCMonth();

  const [datos, empresa, repse] = await Promise.all([
    obligacionesDelMes(sesion.empresaId, ejercicio, mes),
    prisma.empresa.findUniqueOrThrow({ where: { id: sesion.empresaId } }),
    prisma.registroRepse.findUnique({ where: { empresaId: sesion.empresaId } }),
  ]);

  const isn = datos.isn;
  const calendario = calendarioDeObligaciones(ejercicio, {
    entidad: { nombre: isn.nombre, diaLimite: isn.diaLimite },
    tieneRepse: repse !== null,
  });

  return (
    <>
      <div>
        <h1 className="text-2xl font-semibold">Obligaciones y pagos</h1>
        <p className="text-sm text-slate-500">
          Concentrado de ISR retenido, cuotas para SIPARE e ISN de las corridas cuya fecha de pago
          cae en el mes seleccionado. Las cifras se toman de la memoria de cálculo de cada recibo;
          concilia contra la emisión (EMA/EBA) del IMSS antes de pagar.
        </p>
      </div>

      <Tarjeta titulo="Periodo">
        <form className="flex flex-wrap items-end gap-3" method="get">
          <Campo etiqueta="Ejercicio" nombre="ejercicio" tipo="number" valorInicial={ejercicio} />
          <label className="flex flex-col gap-1 text-sm">
            <span className="font-medium text-slate-700">Mes</span>
            <select
              className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-slate-900"
              name="mes"
              defaultValue={String(mes)}
            >
              {MESES.map((nombre, indice) => (
                <option key={nombre} value={indice}>
                  {nombre}
                </option>
              ))}
            </select>
          </label>
          <button
            type="submit"
            className="rounded-lg border border-slate-300 bg-white px-4 py-2 text-sm font-medium hover:bg-slate-50"
          >
            Ver
          </button>
        </form>
      </Tarjeta>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Metrica
          etiqueta="ISR a enterar"
          valor={formatoMxn(datos.isr.isrAEnterar)}
          nota={`Retenido ${formatoMxn(datos.isr.isrRetenido)} · subsidio ${formatoMxn(datos.isr.subsidioEntregado)}`}
        />
        <Metrica
          etiqueta="SIPARE mensual"
          valor={formatoMxn(datos.cedula.totalMensual)}
          nota="EyM, riesgos, invalidez y guarderías"
        />
        <Metrica
          etiqueta="SIPARE bimestral"
          valor={formatoMxn(datos.cedula.totalBimestral)}
          nota="Retiro, cesantía, INFONAVIT y amortizaciones"
        />
        <Metrica
          etiqueta="ISN del mes"
          valor={formatoMxn(datos.totalIsn)}
          nota={`${isn.nombre} · ${pct(isn.tasa)}`}
        />
      </div>

      <Tarjeta
        titulo="Impuesto sobre nóminas de la empresa"
        descripcion={`Cada entidad legisla su propia tasa y fecha de pago. Si dejas la tasa vacía se usa la del catálogo (${isn.nombre}: ${pct(isn.tasa)}, día ${isn.diaLimite} del mes siguiente).${isn.nota ? ` ${isn.nota}` : ""}`}
      >
        {sesion.rol === "ADMIN" ? (
          <Formulario accion={accionGuardarConfiguracionIsn} textoBoton="Guardar ISN">
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
              <Seleccion
                etiqueta="Entidad federativa"
                nombre="claveEntidadIsn"
                opciones={OPCIONES_ENTIDAD_ISN}
                valorInicial={empresa.claveEntidadIsn}
                requerido
              />
              <Campo
                etiqueta="Tasa (%)"
                nombre="tasaIsn"
                tipo="number"
                paso="0.0001"
                valorInicial={empresa.tasaIsn ? Number(empresa.tasaIsn) * 100 : ""}
                ayuda="Vacío = tasa del catálogo estatal"
              />
              <Campo
                etiqueta="Sobretasa (%)"
                nombre="sobretasaIsn"
                tipo="number"
                paso="0.0001"
                valorInicial={empresa.sobretasaIsn ? Number(empresa.sobretasaIsn) * 100 : ""}
                ayuda="Adicionales estatales, si aplican"
              />
              <Campo
                etiqueta="Día límite"
                nombre="diaLimiteIsn"
                tipo="number"
                valorInicial={empresa.diaLimiteIsn ?? ""}
                ayuda="Día del mes siguiente"
              />
            </div>
          </Formulario>
        ) : (
          <p className="text-sm text-slate-600">
            {isn.nombre} · {pct(isn.tasa)}
            {isn.sobretasa ? ` + ${pct(isn.sobretasa)} de sobretasa` : ""} · vence el día{" "}
            {isn.diaLimite} del mes siguiente. Solo el rol ADMIN puede modificarlo.
          </p>
        )}
      </Tarjeta>

      <Tarjeta
        titulo={`Cédula SIPARE — ${MESES[mes]} ${ejercicio}`}
        descripcion={`${datos.cedula.trabajadores} trabajadores · ${datos.cedula.diasCotizados} días cotizados. La línea de captura la emite el portal del IMSS con la emisión oficial; esta cédula es la determinación propia del patrón.`}
      >
        {datos.cedula.mensual.length === 0 && datos.cedula.bimestral.length === 0 ? (
          <Vacio texto="No hay corridas con fecha de pago en este mes." />
        ) : (
          <div className="space-y-6">
            {[
              { titulo: "Cuotas mensuales (IMSS)", renglones: datos.cedula.mensual },
              { titulo: "Cuotas bimestrales (RCV e INFONAVIT)", renglones: datos.cedula.bimestral },
            ].map((bloque) => (
              <div key={bloque.titulo}>
                <h3 className="mb-2 text-sm font-semibold text-slate-700">{bloque.titulo}</h3>
                {bloque.renglones.length === 0 ? (
                  <Vacio texto="Sin importes en el periodo." />
                ) : (
                  <Tabla encabezados={["Ramo", "Base", "Patrón", "Obrero", "Total"]}>
                    {bloque.renglones.map((renglon) => (
                      <tr key={renglon.ramo}>
                        <td className="px-3 py-2">{renglon.ramo}</td>
                        <td className="px-3 py-2">{formatoMxn(renglon.base)}</td>
                        <td className="px-3 py-2">{formatoMxn(renglon.patron)}</td>
                        <td className="px-3 py-2">{formatoMxn(renglon.obrero)}</td>
                        <td className="px-3 py-2 font-medium">{formatoMxn(renglon.total)}</td>
                      </tr>
                    ))}
                  </Tabla>
                )}
              </div>
            ))}
            <p className="text-xs text-slate-500">
              Total a cargo del patrón {formatoMxn(datos.cedula.totalPatron)} · retenido a los
              trabajadores {formatoMxn(datos.cedula.totalObrero)} (LSS Art. 38 y 39).
            </p>
          </div>
        )}
      </Tarjeta>

      <Tarjeta
        titulo="Determinación del ISN"
        descripcion={`Tasa ${isn.tasaPropia ? "capturada por la empresa" : "tomada del catálogo estatal"}; verifica la ley de hacienda vigente porque varias entidades aplican sobretasas, exclusiones o tarifas progresivas.`}
      >
        <Tabla encabezados={["Entidad", "Tasa", "Base gravada", "ISN", "Día límite"]}>
          <tr>
            <td className="px-3 py-2">{isn.nombre}</td>
            <td className="px-3 py-2">
              {pct(isn.tasa)}
              {isn.sobretasa ? ` + ${pct(isn.sobretasa)} sobretasa` : ""}
            </td>
            <td className="px-3 py-2">{formatoMxn(datos.baseIsn)}</td>
            <td className="px-3 py-2 font-medium">{formatoMxn(datos.totalIsn)}</td>
            <td className="px-3 py-2">día {isn.diaLimite} del mes siguiente</td>
          </tr>
        </Tabla>
        {datos.entidadesAjenas.length > 0 ? (
          <p className="mt-3 text-xs text-amber-700">
            Hay empleados registrados en {datos.entidadesAjenas.join(", ")}. Si prestan servicios en
            otra entidad, esas erogaciones se declaran por separado ante cada estado.
          </p>
        ) : null}
      </Tarjeta>

      <Tarjeta
        titulo="Corridas incluidas"
        descripcion="El ISR y el ISN se causan con la fecha de pago, sin importar la periodicidad de la corrida."
      >
        {datos.corridas.length === 0 ? (
          <Vacio texto="Ninguna corrida tiene fecha de pago en el mes." />
        ) : (
          <Tabla encabezados={["Corrida", "Fecha de pago", "Estado"]}>
            {datos.corridas.map((corrida) => (
              <tr key={corrida.id}>
                <td className="px-3 py-2">{corrida.descripcion}</td>
                <td className="px-3 py-2">{fmtFecha(corrida.fechaPago)}</td>
                <td className="px-3 py-2">
                  <Etiqueta valor={corrida.estado} />
                </td>
              </tr>
            ))}
          </Tabla>
        )}
      </Tarjeta>

      <Tarjeta
        titulo={`Calendario de pagos ${ejercicio}`}
        descripcion="Las fechas que caen en sábado, domingo o descanso obligatorio se recorren al siguiente día hábil (Art. 12 CFF). No incluye los días adicionales por sexto dígito del RFC ni los inhábiles estatales."
      >
        <Tabla encabezados={["Fecha límite", "Obligación", "Periodo", "Autoridad", "Fundamento"]}>
          {calendario.map((obligacion) => {
            const vencida = obligacion.fechaLimite < hoy;
            return (
              <tr
                key={`${obligacion.clave}-${obligacion.periodo}`}
                className={vencida ? "text-slate-400" : undefined}
              >
                <td className="px-3 py-2">{fmtFecha(obligacion.fechaLimite)}</td>
                <td className="px-3 py-2">{obligacion.concepto}</td>
                <td className="px-3 py-2">{obligacion.periodo}</td>
                <td className="px-3 py-2">{obligacion.autoridad}</td>
                <td className="px-3 py-2 text-xs text-slate-500">{obligacion.fundamento}</td>
              </tr>
            );
          })}
        </Tabla>
      </Tarjeta>
    </>
  );
}
