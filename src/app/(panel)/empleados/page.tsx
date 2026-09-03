import { accionCrearEmpleado } from "@/app/acciones";
import { Formulario } from "@/components/formulario";
import { Campo, Etiqueta, Seleccion, Tabla, Tarjeta, Vacio } from "@/components/ui";
import { requerirSesion } from "@/lib/auth/sesion";
import { prisma } from "@/lib/db";
import { formatoMxn } from "@/lib/dinero";
import { PERIODICIDADES } from "@/lib/fiscal/periodicidad";

export const dynamic = "force-dynamic";

const REGIMENES = [
  "SUELDOS_SALARIOS",
  "ASIMILADOS_MIEMBROS_SOCIEDADES",
  "ASIMILADOS_COMISIONISTAS",
  "ASIMILADOS_HONORARIOS",
  "ASIMILADOS_ACCIONES",
  "ASIMILADOS_OTROS",
  "JUBILADOS",
];
const CONTRATOS = [
  "INDETERMINADO",
  "OBRA_DETERMINADA",
  "TIEMPO_DETERMINADO",
  "CAPACITACION_INICIAL",
  "PRUEBA",
];
const JORNADAS = ["DIURNA", "NOCTURNA", "MIXTA", "POR_HORA", "REDUCIDA", "CONTINUADA"];

const opciones = (valores: readonly string[]) =>
  valores.map((valor) => ({ valor, texto: valor.replaceAll("_", " ") }));

export default async function PaginaEmpleados() {
  const sesion = await requerirSesion();
  const empleados = await prisma.empleado.findMany({
    where: { empresaId: sesion.empresaId },
    orderBy: { numeroEmpleado: "asc" },
  });

  return (
    <>
      <div>
        <h1 className="text-2xl font-semibold">Empleados</h1>
        <p className="text-sm text-slate-500">
          El salario base de cotización se integra automáticamente (Art. 27 LSS) con los días de
          aguinaldo, las vacaciones de ley y la prima vacacional.
        </p>
      </div>

      <Tarjeta titulo="Plantilla">
        {empleados.length === 0 ? (
          <Vacio texto="Sin empleados." />
        ) : (
          <Tabla
            encabezados={[
              "Núm.",
              "Nombre",
              "Puesto",
              "Periodicidad",
              "Salario diario",
              "SBC",
              "Estado",
            ]}
          >
            {empleados.map((empleado) => (
              <tr key={empleado.id}>
                <td className="px-3 py-2">{empleado.numeroEmpleado}</td>
                <td className="px-3 py-2">
                  {empleado.nombre} {empleado.apellidoPaterno} {empleado.apellidoMaterno ?? ""}
                  <span className="block text-xs text-slate-500">{empleado.rfc}</span>
                </td>
                <td className="px-3 py-2">{empleado.puesto}</td>
                <td className="px-3 py-2">{empleado.periodicidad}</td>
                <td className="px-3 py-2">{formatoMxn(empleado.salarioDiario.toString())}</td>
                <td className="px-3 py-2">
                  {formatoMxn(empleado.salarioBaseCotizacion.toString())}
                </td>
                <td className="px-3 py-2">
                  <Etiqueta valor={empleado.estado} />
                </td>
              </tr>
            ))}
          </Tabla>
        )}
      </Tarjeta>

      <Tarjeta titulo="Alta de empleado">
        <Formulario accion={accionCrearEmpleado} textoBoton="Dar de alta">
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            <Campo etiqueta="Número de empleado" nombre="numeroEmpleado" requerido />
            <Campo etiqueta="Nombre(s)" nombre="nombre" requerido />
            <Campo etiqueta="Apellido paterno" nombre="apellidoPaterno" requerido />
            <Campo etiqueta="Apellido materno" nombre="apellidoMaterno" />
            <Campo etiqueta="RFC" nombre="rfc" requerido />
            <Campo etiqueta="CURP" nombre="curp" requerido />
            <Campo etiqueta="NSS" nombre="nss" />
            <Campo etiqueta="Fecha de ingreso" nombre="fechaIngreso" tipo="date" requerido />
            <Campo etiqueta="Puesto" nombre="puesto" requerido />
            <Campo etiqueta="Departamento" nombre="departamento" />
            <Seleccion
              etiqueta="Periodicidad de pago"
              nombre="periodicidad"
              opciones={opciones(PERIODICIDADES)}
              valorInicial="QUINCENAL"
            />
            <Seleccion
              etiqueta="Régimen de contratación"
              nombre="regimen"
              opciones={opciones(REGIMENES)}
            />
            <Seleccion etiqueta="Tipo de contrato" nombre="tipoContrato" opciones={opciones(CONTRATOS)} />
            <Seleccion etiqueta="Tipo de jornada" nombre="tipoJornada" opciones={opciones(JORNADAS)} />
            <Campo
              etiqueta="Salario diario"
              nombre="salarioDiario"
              tipo="number"
              paso="0.0001"
              requerido
            />
            <Campo etiqueta="Días de aguinaldo" nombre="diasAguinaldo" tipo="number" valorInicial={15} />
            <Campo
              etiqueta="Prima vacacional"
              nombre="primaVacacionalPct"
              tipo="number"
              paso="0.01"
              valorInicial={0.25}
              ayuda="Mínimo legal 0.25 (Art. 80 LFT)."
            />
            <Seleccion
              etiqueta="Descuento INFONAVIT"
              nombre="descuentoInfonavitTipo"
              opciones={[
                { valor: "", texto: "Sin crédito" },
                { valor: "PORCENTAJE", texto: "Porcentaje del SBC" },
                { valor: "CUOTA_FIJA", texto: "Cuota fija" },
                { valor: "VSM", texto: "Veces salario mínimo (UMA)" },
              ]}
            />
            <Campo etiqueta="Valor INFONAVIT" nombre="descuentoInfonavitValor" tipo="number" paso="0.0001" />
            <Seleccion
              etiqueta="Pensión alimenticia"
              nombre="pensionAlimenticiaTipo"
              opciones={[
                { valor: "", texto: "No aplica" },
                { valor: "PORCENTAJE", texto: "Porcentaje del neto" },
                { valor: "CUOTA_FIJA", texto: "Cuota fija" },
              ]}
            />
            <Campo
              etiqueta="Valor pensión"
              nombre="pensionAlimenticiaValor"
              tipo="number"
              paso="0.0001"
            />
            <Campo
              etiqueta="WhatsApp del checador"
              nombre="telefonoWhatsapp"
              ayuda="E.164, p. ej. +5215512345678. Al capturarlo se activa el checador."
            />
            <Campo etiqueta="Hora de entrada" nombre="horaEntrada" tipo="time" valorInicial="09:00" />
            <Campo etiqueta="Hora de salida" nombre="horaSalida" tipo="time" valorInicial="18:00" />
            <Campo
              etiqueta="Tolerancia (minutos)"
              nombre="toleranciaMinutos"
              tipo="number"
              valorInicial={15}
            />
            <Campo
              etiqueta="Días laborables"
              nombre="diasLaborables"
              valorInicial="1,2,3,4,5"
              ayuda="1=lunes … 7=domingo."
            />
          </div>
        </Formulario>
      </Tarjeta>
    </>
  );
}
