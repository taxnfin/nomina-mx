"use client";

import { useActionState } from "react";
import { useFormStatus } from "react-dom";
import type { ReactNode } from "react";
import type { EstadoFormulario } from "@/app/acciones";

function Enviar({ texto, variante = "primario" }: { texto: string; variante?: "primario" | "secundario" | "peligro" }) {
  const { pending } = useFormStatus();
  const estilos = {
    primario: "bg-slate-900 text-white hover:bg-slate-700",
    secundario: "border border-slate-300 bg-white text-slate-800 hover:bg-slate-50",
    peligro: "bg-rose-600 text-white hover:bg-rose-500",
  }[variante];
  return (
    <button
      type="submit"
      disabled={pending}
      className={`rounded-lg px-4 py-2 text-sm font-medium transition disabled:opacity-50 ${estilos}`}
    >
      {pending ? "Procesando…" : texto}
    </button>
  );
}

export function Formulario({
  accion,
  textoBoton,
  variante,
  children,
  className,
}: {
  accion: (estado: EstadoFormulario, datos: FormData) => Promise<EstadoFormulario>;
  textoBoton: string;
  variante?: "primario" | "secundario" | "peligro";
  children?: ReactNode;
  className?: string;
}) {
  const [estado, ejecutar] = useActionState(accion, {});
  return (
    <form action={ejecutar} className={className ?? "space-y-4"}>
      {children}
      <div className="flex items-center gap-3">
        <Enviar texto={textoBoton} variante={variante} />
        {estado.error ? <p className="text-sm text-rose-600">{estado.error}</p> : null}
        {estado.mensaje ? <p className="text-sm text-emerald-700">{estado.mensaje}</p> : null}
      </div>
    </form>
  );
}
