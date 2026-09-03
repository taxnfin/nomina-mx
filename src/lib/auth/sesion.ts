import { cookies, headers } from "next/headers";
import { SignJWT, jwtVerify } from "jose";
import bcrypt from "bcryptjs";
import { prisma } from "../db";
import type { Actor } from "../nomina/servicio";

const NOMBRE_COOKIE = "nomina_sesion";
const DURACION = "8h";

function llave(): Uint8Array {
  const secreto = process.env.AUTH_SECRET;
  if (!secreto) throw new Error("Falta la variable de entorno AUTH_SECRET.");
  return new TextEncoder().encode(secreto);
}

export interface Sesion {
  usuarioId: string;
  email: string;
  nombre: string;
  rol: string;
  empresaId: string;
}

export async function verificarCredenciales(
  email: string,
  password: string,
): Promise<Sesion | null> {
  const usuario = await prisma.usuario.findUnique({ where: { email } });
  if (!usuario || !usuario.activo) return null;
  if (!(await bcrypt.compare(password, usuario.hashPassword))) return null;
  return {
    usuarioId: usuario.id,
    email: usuario.email,
    nombre: usuario.nombre,
    rol: usuario.rol,
    empresaId: usuario.empresaId,
  };
}

export async function crearSesion(sesion: Sesion) {
  const token = await new SignJWT({ ...sesion })
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime(DURACION)
    .sign(llave());
  const almacen = await cookies();
  almacen.set(NOMBRE_COOKIE, token, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: 60 * 60 * 8,
  });
}

export async function cerrarSesion() {
  const almacen = await cookies();
  almacen.delete(NOMBRE_COOKIE);
}

export async function sesionActual(): Promise<Sesion | null> {
  const almacen = await cookies();
  const token = almacen.get(NOMBRE_COOKIE)?.value;
  if (!token) return null;
  try {
    const { payload } = await jwtVerify(token, llave());
    return {
      usuarioId: String(payload.usuarioId),
      email: String(payload.email),
      nombre: String(payload.nombre),
      rol: String(payload.rol),
      empresaId: String(payload.empresaId),
    };
  } catch {
    return null;
  }
}

export async function requerirSesion(): Promise<Sesion> {
  const sesion = await sesionActual();
  if (!sesion) throw new Error("Sesión no válida o expirada.");
  return sesion;
}

export async function requerirRol(...roles: string[]): Promise<Sesion> {
  const sesion = await requerirSesion();
  if (!roles.includes(sesion.rol)) {
    throw new Error(`Se requiere uno de los roles: ${roles.join(", ")}.`);
  }
  return sesion;
}

/** Actor de bitácora con la huella de la petición (IP y user agent). */
export async function actorDeSesion(sesion: Sesion): Promise<Actor> {
  const cabeceras = await headers();
  return {
    id: sesion.usuarioId,
    email: sesion.email,
    rol: sesion.rol,
    ip: cabeceras.get("x-forwarded-for")?.split(",")[0]?.trim() ?? null,
    userAgent: cabeceras.get("user-agent"),
  };
}

export async function hashPassword(password: string): Promise<string> {
  return bcrypt.hash(password, 12);
}
