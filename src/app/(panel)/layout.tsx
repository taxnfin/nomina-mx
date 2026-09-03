import Link from "next/link";
import { redirect } from "next/navigation";
import { accionCerrarSesion } from "@/app/acciones";
import { sesionActual } from "@/lib/auth/sesion";

const ENLACES = [
  { href: "/", texto: "Tablero" },
  { href: "/empleados", texto: "Empleados" },
  { href: "/incidencias", texto: "Incidencias" },
  { href: "/checador", texto: "Checador" },
  { href: "/nomina", texto: "Nómina" },
  { href: "/finiquitos", texto: "Finiquitos" },
  { href: "/auditoria", texto: "Trazabilidad" },
];

export default async function LayoutPanel({ children }: { children: React.ReactNode }) {
  const sesion = await sesionActual();
  if (!sesion) redirect("/login");

  return (
    <div className="min-h-screen">
      <header className="border-b border-slate-200 bg-white">
        <div className="mx-auto flex max-w-6xl flex-wrap items-center gap-4 px-6 py-3">
          <Link href="/" className="text-sm font-semibold">
            Nómina MX
          </Link>
          <nav className="flex flex-wrap gap-3 text-sm text-slate-600">
            {ENLACES.map((enlace) => (
              <Link key={enlace.href} href={enlace.href} className="hover:text-slate-900">
                {enlace.texto}
              </Link>
            ))}
          </nav>
          <form action={accionCerrarSesion} className="ml-auto flex items-center gap-3">
            <span className="text-xs text-slate-500">
              {sesion.nombre} · {sesion.rol}
            </span>
            <button type="submit" className="text-sm text-slate-600 hover:text-slate-900">
              Salir
            </button>
          </form>
        </div>
      </header>
      <main className="mx-auto max-w-6xl space-y-6 px-6 py-8">{children}</main>
    </div>
  );
}
