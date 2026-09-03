import { describe, expect, it } from "vitest";
import {
  calcularCuotasImss,
  descuentoInfonavit,
  factorIntegracion,
  porcentajeCesantiaVejezPatron,
  salarioBaseCotizacion,
  topeSbc,
} from "../src/lib/fiscal/imss";
import { PARAMETROS_2025 } from "../src/lib/fiscal/tablas2025";

const UMA = PARAMETROS_2025.UMA_DIARIA;

describe("salario base de cotización", () => {
  it("integra aguinaldo y prima vacacional (Art. 27 LSS)", () => {
    // (365 + 15 + 12 × 0.25) / 365 = 1.0493
    expect(factorIntegracion(15, 12, 0.25).toFixed(4)).toBe("1.0493");
    expect(salarioBaseCotizacion(500, 15, 12, 0.25).toFixed(2)).toBe("524.66");
  });

  it("topa el SBC a 25 UMA (Art. 28 LSS)", () => {
    expect(topeSbc(10000, UMA).toFixed(2)).toBe((UMA * 25).toFixed(2));
  });
});

describe("cuotas obrero-patronales", () => {
  const cuotas = calcularCuotasImss(522.6, 15, {
    umaDiaria: UMA,
    primaRiesgoTrabajo: 0.005,
  });

  it("cobra la cuota fija patronal sobre la UMA, no sobre el SBC", () => {
    const cuotaFija = cuotas.conceptos[0];
    expect(cuotaFija.base.toFixed(2)).toBe((UMA * 15).toFixed(2));
    expect(cuotaFija.obrero.toNumber()).toBe(0);
  });

  it("exenta las primeras 3 UMA en el ramo de excedente", () => {
    const excedente = cuotas.conceptos[1];
    expect(excedente.base.toFixed(2)).toBe(((522.6 - UMA * 3) * 15).toFixed(2));
  });

  it("la cuota patronal supera con mucho a la obrera", () => {
    expect(cuotas.totalPatron.toNumber()).toBeGreaterThan(cuotas.totalObrero.toNumber());
    expect(cuotas.totalObrero.toNumber()).toBeGreaterThan(0);
  });

  it("aporta 5% al INFONAVIT sobre el SBC por días cotizados", () => {
    expect(cuotas.infonavitPatron.toFixed(2)).toBe((522.6 * 15 * 0.05).toFixed(2));
  });

  it("no cobra cuotas cuando no hay días cotizados", () => {
    const sinDias = calcularCuotasImss(522.6, 0, { umaDiaria: UMA, primaRiesgoTrabajo: 0.005 });
    expect(sinDias.totalObrero.toNumber()).toBe(0);
    expect(sinDias.totalPatron.toNumber()).toBe(0);
  });
});

describe("cesantía y vejez patronal", () => {
  it("usa la cuota mínima para salarios de una UMA", () => {
    expect(porcentajeCesantiaVejezPatron(UMA, UMA).toNumber()).toBeCloseTo(0.0315, 6);
  });

  it("crece con el salario base de cotización", () => {
    const bajo = porcentajeCesantiaVejezPatron(UMA * 2, UMA);
    const alto = porcentajeCesantiaVejezPatron(UMA * 10, UMA);
    expect(alto.toNumber()).toBeGreaterThan(bajo.toNumber());
  });
});

describe("descuento INFONAVIT", () => {
  const opciones = { salarioBaseCotizacion: 522.6, diasPeriodo: 15, umaDiaria: UMA };

  it("porcentaje sobre el SBC del periodo", () => {
    expect(descuentoInfonavit("PORCENTAJE", 0.2, opciones).toFixed(2)).toBe(
      (522.6 * 15 * 0.2).toFixed(2),
    );
  });

  it("cuota fija se aplica tal cual", () => {
    expect(descuentoInfonavit("CUOTA_FIJA", 1450, opciones).toFixed(2)).toBe("1450.00");
  });

  it("sin crédito no hay descuento", () => {
    expect(descuentoInfonavit(null, null, opciones).toNumber()).toBe(0);
  });
});
