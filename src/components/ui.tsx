import type { ReactNode } from "react";

export function Tarjeta({
  titulo,
  descripcion,
  children,
}: {
  titulo?: string;
  descripcion?: string;
  children: ReactNode;
}) {
  return (
    <section className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
      {titulo ? <h2 className="text-base font-semibold text-slate-900">{titulo}</h2> : null}
      {descripcion ? <p className="mt-1 text-sm text-slate-500">{descripcion}</p> : null}
      <div className={titulo ? "mt-4" : undefined}>{children}</div>
    </section>
  );
}

export function Metrica({ etiqueta, valor, nota }: { etiqueta: string; valor: string; nota?: string }) {
  return (
    <div className="rounded-xl border border-slate-200 bg-white p-4">
      <p className="text-xs uppercase tracking-wide text-slate-500">{etiqueta}</p>
      <p className="mt-1 text-2xl font-semibold text-slate-900">{valor}</p>
      {nota ? <p className="mt-1 text-xs text-slate-500">{nota}</p> : null}
    </div>
  );
}

const COLOR_ESTADO: Record<string, string> = {
  BORRADOR: "bg-slate-100 text-slate-700",
  CALCULADA: "bg-blue-100 text-blue-800",
  AUTORIZADA: "bg-amber-100 text-amber-800",
  TIMBRADA: "bg-violet-100 text-violet-800",
  PAGADA: "bg-emerald-100 text-emerald-800",
  CANCELADA: "bg-rose-100 text-rose-800",
  ACTIVO: "bg-emerald-100 text-emerald-800",
  BAJA: "bg-rose-100 text-rose-800",
};

export function Etiqueta({ valor }: { valor: string }) {
  return (
    <span
      className={`inline-flex rounded-full px-2 py-0.5 text-xs font-medium ${
        COLOR_ESTADO[valor] ?? "bg-slate-100 text-slate-700"
      }`}
    >
      {valor}
    </span>
  );
}

export function Campo({
  etiqueta,
  nombre,
  tipo = "text",
  requerido,
  valorInicial,
  paso,
  minimo,
  maximo,
  modoEntrada,
  ayuda,
}: {
  etiqueta: string;
  nombre: string;
  tipo?: string;
  requerido?: boolean;
  valorInicial?: string | number;
  paso?: string;
  minimo?: number;
  maximo?: number;
  modoEntrada?: "decimal" | "numeric";
  ayuda?: string;
}) {
  return (
    <label className="flex flex-col gap-1 text-sm">
      <span className="font-medium text-slate-700">{etiqueta}</span>
      <input
        className="rounded-lg border border-slate-300 px-3 py-2 text-slate-900 outline-none focus:border-slate-900"
        name={nombre}
        type={tipo}
        step={paso}
        min={minimo}
        max={maximo}
        inputMode={modoEntrada}
        required={requerido}
        defaultValue={valorInicial}
      />
      {ayuda ? <span className="text-xs text-slate-500">{ayuda}</span> : null}
    </label>
  );
}

export function Seleccion({
  etiqueta,
  nombre,
  opciones,
  valorInicial,
  requerido,
}: {
  etiqueta: string;
  nombre: string;
  opciones: { valor: string; texto: string }[];
  valorInicial?: string;
  requerido?: boolean;
}) {
  return (
    <label className="flex flex-col gap-1 text-sm">
      <span className="font-medium text-slate-700">{etiqueta}</span>
      <select
        className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-slate-900 outline-none focus:border-slate-900"
        name={nombre}
        defaultValue={valorInicial}
        required={requerido}
      >
        {opciones.map((o) => (
          <option key={o.valor} value={o.valor}>
            {o.texto}
          </option>
        ))}
      </select>
    </label>
  );
}

export function Tabla({ encabezados, children }: { encabezados: string[]; children: ReactNode }) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[640px] text-sm">
        <thead>
          <tr className="border-b border-slate-200 text-left text-xs uppercase tracking-wide text-slate-500">
            {encabezados.map((e) => (
              <th key={e} className="px-3 py-2 font-medium">
                {e}
              </th>
            ))}
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-100">{children}</tbody>
      </table>
    </div>
  );
}

export function Vacio({ texto }: { texto: string }) {
  return <p className="rounded-lg bg-slate-50 px-3 py-6 text-center text-sm text-slate-500">{texto}</p>;
}
