import Decimal from "decimal.js";

Decimal.set({ precision: 28, rounding: Decimal.ROUND_HALF_UP });

export type Numerico = Decimal.Value;

export function d(valor: Numerico | null | undefined): Decimal {
  if (valor === null || valor === undefined || valor === "") return new Decimal(0);
  return new Decimal(valor as Decimal.Value);
}

/** Redondea a centavos con ROUND_HALF_UP (criterio del Anexo 20 del CFF). */
export function pesos(valor: Numerico): Decimal {
  return d(valor).toDecimalPlaces(2, Decimal.ROUND_HALF_UP);
}

export function suma(...valores: Numerico[]): Decimal {
  return valores.reduce<Decimal>((acc, v) => acc.plus(d(v)), new Decimal(0));
}

export function maximo(a: Numerico, b: Numerico): Decimal {
  return Decimal.max(d(a), d(b));
}

export function minimo(a: Numerico, b: Numerico): Decimal {
  return Decimal.min(d(a), d(b));
}

export function numero(valor: Numerico): number {
  return d(valor).toNumber();
}

const formateador = new Intl.NumberFormat("es-MX", {
  style: "currency",
  currency: "MXN",
});

export function formatoMxn(valor: Numerico): string {
  return formateador.format(numero(valor));
}

export { Decimal };
