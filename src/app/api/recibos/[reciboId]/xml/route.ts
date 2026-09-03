import { NextResponse } from "next/server";
import { generarXmlDeRecibo } from "@/lib/cfdi/servicio";
import { sesionActual } from "@/lib/auth/sesion";
import { prisma } from "@/lib/db";

export async function GET(
  _peticion: Request,
  { params }: { params: Promise<{ reciboId: string }> },
) {
  const sesion = await sesionActual();
  if (!sesion) return NextResponse.json({ error: "No autenticado." }, { status: 401 });

  const { reciboId } = await params;
  const recibo = await prisma.recibo.findFirst({
    where: { id: reciboId, corrida: { empresaId: sesion.empresaId } },
    select: { id: true, xmlCfdi: true, uuidCfdi: true },
  });
  if (!recibo) return NextResponse.json({ error: "Recibo no encontrado." }, { status: 404 });

  const xml = recibo.xmlCfdi ?? (await generarXmlDeRecibo(recibo.id));
  return new NextResponse(xml, {
    headers: {
      "content-type": "application/xml; charset=utf-8",
      "content-disposition": `attachment; filename="${recibo.uuidCfdi ?? recibo.id}.xml"`,
    },
  });
}
