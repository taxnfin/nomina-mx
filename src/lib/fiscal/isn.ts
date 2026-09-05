/**
 * Impuesto sobre nóminas (ISN) estatal.
 *
 * Cada entidad tiene su propia ley de hacienda, tasa y fecha límite de pago. La
 * tabla es la semilla del sistema: la tasa efectiva de la empresa puede
 * sobreescribirse con el parámetro fiscal `IMPUESTO_SOBRE_NOMINAS`. Las tasas
 * deben cotejarse contra la ley de hacienda y la ley de ingresos vigentes de
 * cada estado antes de operar en producción; varias entidades aplican además
 * sobretasas o adicionales para asistencia social y educación.
 */

export interface EntidadIsn {
  /** Clave del catálogo c_Estado del SAT. */
  clave: string;
  nombre: string;
  tasa: number;
  /** Día del mes siguiente en que vence el pago. */
  diaLimite: number;
  /** Sobretasa o adicional estatal expresado sobre el impuesto causado. */
  sobretasa?: number;
  nota?: string;
}

export const ENTIDADES_ISN_2025: readonly EntidadIsn[] = [
  { clave: "AGU", nombre: "Aguascalientes", tasa: 0.025, diaLimite: 17 },
  { clave: "BCN", nombre: "Baja California", tasa: 0.0425, diaLimite: 25 },
  { clave: "BCS", nombre: "Baja California Sur", tasa: 0.025, diaLimite: 20 },
  { clave: "CAM", nombre: "Campeche", tasa: 0.03, diaLimite: 17 },
  {
    clave: "CHP",
    nombre: "Chiapas",
    tasa: 0.02,
    diaLimite: 17,
    sobretasa: 0.06,
    nota: "2% más 6% de sobretasa sobre el impuesto causado.",
  },
  { clave: "CHH", nombre: "Chihuahua", tasa: 0.03, diaLimite: 20 },
  { clave: "COA", nombre: "Coahuila", tasa: 0.03, diaLimite: 17 },
  { clave: "COL", nombre: "Colima", tasa: 0.02, diaLimite: 17 },
  {
    clave: "CMX",
    nombre: "Ciudad de México",
    tasa: 0.04,
    diaLimite: 17,
    nota: "Subió de 3% a 4% en 2025 (Código Fiscal de la CDMX).",
  },
  { clave: "DUR", nombre: "Durango", tasa: 0.03, diaLimite: 17 },
  { clave: "GUA", nombre: "Guanajuato", tasa: 0.03, diaLimite: 22 },
  { clave: "GRO", nombre: "Guerrero", tasa: 0.03, diaLimite: 17, nota: "Subió de 2% a 3% en 2025." },
  { clave: "HID", nombre: "Hidalgo", tasa: 0.03, diaLimite: 17 },
  { clave: "JAL", nombre: "Jalisco", tasa: 0.03, diaLimite: 12 },
  { clave: "MEX", nombre: "Estado de México", tasa: 0.03, diaLimite: 10 },
  { clave: "MIC", nombre: "Michoacán", tasa: 0.03, diaLimite: 17 },
  { clave: "MOR", nombre: "Morelos", tasa: 0.025, diaLimite: 17 },
  { clave: "NAY", nombre: "Nayarit", tasa: 0.03, diaLimite: 17 },
  { clave: "NLE", nombre: "Nuevo León", tasa: 0.03, diaLimite: 17 },
  { clave: "OAX", nombre: "Oaxaca", tasa: 0.03, diaLimite: 17 },
  { clave: "PUE", nombre: "Puebla", tasa: 0.03, diaLimite: 17 },
  { clave: "QUE", nombre: "Querétaro", tasa: 0.03, diaLimite: 22 },
  { clave: "ROO", nombre: "Quintana Roo", tasa: 0.04, diaLimite: 17 },
  { clave: "SLP", nombre: "San Luis Potosí", tasa: 0.03, diaLimite: 17 },
  {
    clave: "SIN",
    nombre: "Sinaloa",
    tasa: 0.03,
    diaLimite: 15,
    nota: "Tarifa progresiva de 2.4% a 3% según el monto de las erogaciones.",
  },
  {
    clave: "SON",
    nombre: "Sonora",
    tasa: 0.03,
    diaLimite: 20,
    sobretasa: 0.01,
    nota: "3% más adicional para el fomento de la educación.",
  },
  {
    clave: "TAB",
    nombre: "Tabasco",
    tasa: 0.035,
    diaLimite: 17,
    nota: "De 3% a 3.5% según el monto de las erogaciones.",
  },
  { clave: "TAM", nombre: "Tamaulipas", tasa: 0.03, diaLimite: 17 },
  { clave: "TLA", nombre: "Tlaxcala", tasa: 0.03, diaLimite: 17 },
  { clave: "VER", nombre: "Veracruz", tasa: 0.03, diaLimite: 17 },
  { clave: "YUC", nombre: "Yucatán", tasa: 0.03, diaLimite: 10 },
  { clave: "ZAC", nombre: "Zacatecas", tasa: 0.035, diaLimite: 17, nota: "Subió de 3% a 3.5% en 2025." },
] as const;

export function entidadIsn(clave: string): EntidadIsn | null {
  return ENTIDADES_ISN_2025.find((entidad) => entidad.clave === clave) ?? null;
}
