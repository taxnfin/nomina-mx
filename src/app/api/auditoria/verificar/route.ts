import { NextResponse } from "next/server";
import { verificarCadena } from "@/lib/auditoria/bitacora";
import { sesionActual } from "@/lib/auth/sesion";

export async function GET() {
  const sesion = await sesionActual();
  if (!sesion) return NextResponse.json({ error: "No autenticado." }, { status: 401 });
  return NextResponse.json(await verificarCadena());
}
