import { redirect } from "next/navigation";
import { accionIniciarSesion } from "@/app/acciones";
import { Formulario } from "@/components/formulario";
import { Campo } from "@/components/ui";
import { sesionActual } from "@/lib/auth/sesion";

export default async function PaginaLogin() {
  if (await sesionActual()) redirect("/");

  return (
    <main className="flex min-h-screen items-center justify-center p-6">
      <div className="w-full max-w-sm rounded-2xl border border-slate-200 bg-white p-8 shadow-sm">
        <h1 className="text-xl font-semibold">Nómina MX</h1>
        <p className="mt-1 text-sm text-slate-500">
          Nómina mexicana con trazabilidad auditable.
        </p>
        <div className="mt-6">
          <Formulario accion={accionIniciarSesion} textoBoton="Entrar">
            <Campo etiqueta="Correo" nombre="email" tipo="email" requerido />
            <Campo etiqueta="Contraseña" nombre="password" tipo="password" requerido />
          </Formulario>
        </div>
      </div>
    </main>
  );
}
