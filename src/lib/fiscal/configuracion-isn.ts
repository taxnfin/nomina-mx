import { ENTIDADES_ISN_2025, entidadIsn, type EntidadIsn } from "./isn";
import { PARAMETROS_2025 } from "./tablas2025";

export interface ConfiguracionEmpresaIsn {
  claveEntidadIsn: string;
  tasaIsn?: string | number | null;
  sobretasaIsn?: string | number | null;
  diaLimiteIsn?: number | null;
}

export interface IsnAplicable {
  clave: string;
  nombre: string;
  tasa: number;
  sobretasa: number;
  diaLimite: number;
  /** La empresa capturó su propia tasa en lugar de tomar la del catálogo. */
  tasaPropia: boolean;
  nota?: string;
}

function valor(dato: string | number | null | undefined): number | null {
  if (dato === null || dato === undefined || dato === "") return null;
  const numero = Number(dato);
  return Number.isFinite(numero) ? numero : null;
}

/**
 * Tasa de ISN que aplica a la empresa: la capturada en su configuración y, en su
 * defecto, la del catálogo estatal. Cada entidad legisla su propia tasa, por lo
 * que la configuración de la empresa siempre gana sobre la semilla del catálogo.
 */
export function isnAplicable(empresa: ConfiguracionEmpresaIsn): IsnAplicable {
  const catalogo: EntidadIsn | null = entidadIsn(empresa.claveEntidadIsn);
  const tasaPropia = valor(empresa.tasaIsn);
  const sobretasaPropia = valor(empresa.sobretasaIsn);

  return {
    clave: empresa.claveEntidadIsn,
    nombre: catalogo?.nombre ?? empresa.claveEntidadIsn,
    tasa: tasaPropia ?? catalogo?.tasa ?? PARAMETROS_2025.IMPUESTO_SOBRE_NOMINAS,
    sobretasa: sobretasaPropia ?? catalogo?.sobretasa ?? 0,
    diaLimite: empresa.diaLimiteIsn ?? catalogo?.diaLimite ?? 17,
    tasaPropia: tasaPropia !== null,
    nota: catalogo?.nota,
  };
}

export const OPCIONES_ENTIDAD_ISN = ENTIDADES_ISN_2025.map((entidad) => ({
  valor: entidad.clave,
  texto: `${entidad.nombre} — ${(entidad.tasa * 100).toFixed(2)}%`,
}));
