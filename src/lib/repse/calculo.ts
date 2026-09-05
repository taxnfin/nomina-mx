/**
 * Servicios especializados (REPSE).
 *
 * La reforma de subcontratación (DOF 23/04/2021) prohibió la subcontratación de
 * personal y solo permite los servicios u obras especializadas, que requieren
 * registro ante la STPS. Aquí se calcula el costo del servicio que se factura al
 * beneficiario partiendo de la nómina del periodo, y se determina la vigencia
 * del registro y las informativas cuatrimestrales (ICSOE ante el IMSS y SISUB
 * ante el INFONAVIT).
 */

import { Decimal, d, pesos } from "../dinero";
import { siguienteDiaHabil } from "../obligaciones/calendario";

export const FUNDAMENTO_REPSE = [
  "LFT Art. 12, 13, 14 y 15 — servicios especializados y registro ante la STPS",
  "LSS Art. 15-A — informativa cuatrimestral de contratos (ICSOE)",
  "Ley del INFONAVIT Art. 29 Bis — informativa cuatrimestral (SISUB)",
  "LISR Art. 27 fracción V y LIVA Art. 5 fracción II — requisitos de deducción y acreditamiento",
] as const;

/** El registro dura tres años y debe renovarse dentro de los tres meses previos. */
export const VIGENCIA_REGISTRO_ANIOS = 3;
export const AVISO_RENOVACION_DIAS = 90;

export interface EstadoRegistroRepse {
  vigente: boolean;
  diasParaVencer: number;
  requiereRenovacion: boolean;
  fechaVencimiento: Date;
}

export function estadoRegistro(fechaRegistro: Date, hoy: Date = new Date()): EstadoRegistroRepse {
  const fechaVencimiento = new Date(fechaRegistro.getTime());
  fechaVencimiento.setUTCFullYear(fechaVencimiento.getUTCFullYear() + VIGENCIA_REGISTRO_ANIOS);
  const diasParaVencer = Math.ceil(
    (fechaVencimiento.getTime() - hoy.getTime()) / (1000 * 60 * 60 * 24),
  );

  return {
    vigente: diasParaVencer > 0,
    diasParaVencer,
    requiereRenovacion: diasParaVencer <= AVISO_RENOVACION_DIAS,
    fechaVencimiento,
  };
}

export interface InsumosServicioEspecializado {
  /** Sueldos y demás percepciones del personal asignado al contrato. */
  nomina: Decimal.Value;
  /** Cuotas obrero-patronales a cargo del patrón (IMSS, RCV e INFONAVIT). */
  cuotasPatronales: Decimal.Value;
  impuestoSobreNominas: Decimal.Value;
  /** Provisiones de aguinaldo, vacaciones, prima vacacional y prima de antigüedad. */
  provisiones?: Decimal.Value;
  /** Otros costos directos del servicio (equipo, insumos, viáticos). */
  otrosCostos?: Decimal.Value;
  /** Margen de utilidad sobre el costo total, en tanto por uno. */
  margenUtilidad: Decimal.Value;
  /** IVA trasladado; 0.16 salvo región fronteriza. */
  tasaIva?: Decimal.Value;
  /**
   * Retención del 6% de IVA del Art. 1-A fracción IV LIVA. Aplica cuando se
   * ponen trabajadores a disposición del contratante; en un servicio
   * especializado genuino normalmente no procede.
   */
  retencionIva6?: boolean;
}

export interface CostoServicioEspecializado {
  costoNomina: Decimal;
  cuotasPatronales: Decimal;
  impuestoSobreNominas: Decimal;
  provisiones: Decimal;
  otrosCostos: Decimal;
  costoTotal: Decimal;
  utilidad: Decimal;
  subtotal: Decimal;
  iva: Decimal;
  retencionIva: Decimal;
  total: Decimal;
}

/** Costeo del servicio especializado que se factura al beneficiario. */
export function calcularServicioEspecializado(
  insumos: InsumosServicioEspecializado,
): CostoServicioEspecializado {
  const costoNomina = d(insumos.nomina);
  const cuotasPatronales = d(insumos.cuotasPatronales);
  const impuestoSobreNominas = d(insumos.impuestoSobreNominas);
  const provisiones = d(insumos.provisiones ?? 0);
  const otrosCostos = d(insumos.otrosCostos ?? 0);

  const costoTotal = costoNomina
    .plus(cuotasPatronales)
    .plus(impuestoSobreNominas)
    .plus(provisiones)
    .plus(otrosCostos);
  const utilidad = costoTotal.times(insumos.margenUtilidad);
  const subtotal = costoTotal.plus(utilidad);
  const iva = subtotal.times(insumos.tasaIva ?? 0.16);
  const retencionIva = insumos.retencionIva6 ? subtotal.times(0.06) : d(0);

  return {
    costoNomina: pesos(costoNomina),
    cuotasPatronales: pesos(cuotasPatronales),
    impuestoSobreNominas: pesos(impuestoSobreNominas),
    provisiones: pesos(provisiones),
    otrosCostos: pesos(otrosCostos),
    costoTotal: pesos(costoTotal),
    utilidad: pesos(utilidad),
    subtotal: pesos(subtotal),
    iva: pesos(iva),
    retencionIva: pesos(retencionIva),
    total: pesos(subtotal.plus(iva).minus(retencionIva)),
  };
}

export interface Cuatrimestre {
  numero: 1 | 2 | 3;
  etiqueta: string;
  inicio: Date;
  fin: Date;
  fechaLimite: Date;
}

/** Cuatrimestres que deben informarse en ICSOE y SISUB durante el ejercicio. */
export function cuatrimestresRepse(ejercicio: number): Cuatrimestre[] {
  return [
    {
      numero: 3,
      etiqueta: `Tercer cuatrimestre ${ejercicio - 1} (septiembre-diciembre)`,
      inicio: new Date(Date.UTC(ejercicio - 1, 8, 1)),
      fin: new Date(Date.UTC(ejercicio - 1, 11, 31)),
      fechaLimite: siguienteDiaHabil(new Date(Date.UTC(ejercicio, 0, 17))),
    },
    {
      numero: 1,
      etiqueta: `Primer cuatrimestre ${ejercicio} (enero-abril)`,
      inicio: new Date(Date.UTC(ejercicio, 0, 1)),
      fin: new Date(Date.UTC(ejercicio, 3, 30)),
      fechaLimite: siguienteDiaHabil(new Date(Date.UTC(ejercicio, 4, 17))),
    },
    {
      numero: 2,
      etiqueta: `Segundo cuatrimestre ${ejercicio} (mayo-agosto)`,
      inicio: new Date(Date.UTC(ejercicio, 4, 1)),
      fin: new Date(Date.UTC(ejercicio, 7, 31)),
      fechaLimite: siguienteDiaHabil(new Date(Date.UTC(ejercicio, 8, 17))),
    },
  ];
}
