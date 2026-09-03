import { describe, expect, it } from "vitest";
import {
  aniosDeServicio,
  calcularAguinaldo,
  calcularPrimaAntiguedad,
  calcularVacaciones,
  repartirPtu,
} from "../src/lib/nomina/prestaciones";
import { calcularFiniquito } from "../src/lib/nomina/finiquito";
import { diasVacacionesPorAntiguedad, PARAMETROS_2025 } from "../src/lib/fiscal/tablas2025";

const UMA = PARAMETROS_2025.UMA_DIARIA;

describe("vacaciones dignas (Art. 76 LFT)", () => {
  it("otorga 12 días el primer año y sube hasta 32", () => {
    expect(diasVacacionesPorAntiguedad(1)).toBe(12);
    expect(diasVacacionesPorAntiguedad(2)).toBe(14);
    expect(diasVacacionesPorAntiguedad(5)).toBe(20);
    expect(diasVacacionesPorAntiguedad(6)).toBe(22);
    expect(diasVacacionesPorAntiguedad(10)).toBe(22);
    expect(diasVacacionesPorAntiguedad(11)).toBe(24);
    expect(diasVacacionesPorAntiguedad(35)).toBe(32);
  });

  it("calcula proporcional y prima vacacional del 25% (Art. 80 LFT)", () => {
    const resultado = calcularVacaciones({
      salarioDiario: 500,
      fechaIngreso: new Date("2020-01-01"),
      fechaCorte: new Date("2025-07-01"),
      primaVacacionalPct: 0.25,
    });
    expect(resultado.aniosCumplidos).toBe(5);
    expect(resultado.diasPorLey).toBe(22);
    expect(resultado.importePrima.toFixed(2)).toBe(
      resultado.importeVacaciones.times(0.25).toDecimalPlaces(2).toFixed(2),
    );
  });
});

describe("aguinaldo (Art. 87 LFT)", () => {
  it("paga 15 días completos con un año trabajado", () => {
    const resultado = calcularAguinaldo({
      salarioDiario: 500,
      diasAguinaldo: 15,
      fechaIngreso: new Date("2020-01-01"),
      fechaCorte: new Date("2025-12-31"),
      ejercicio: 2025,
    });
    expect(resultado.diasProporcionales.toFixed(2)).toBe("15.00");
    expect(resultado.importe.toFixed(2)).toBe("7500.00");
  });

  it("prorratea el ingreso a mitad del ejercicio", () => {
    const resultado = calcularAguinaldo({
      salarioDiario: 500,
      diasAguinaldo: 15,
      fechaIngreso: new Date("2025-07-01"),
      fechaCorte: new Date("2025-12-31"),
      ejercicio: 2025,
    });
    expect(resultado.diasProporcionales.toNumber()).toBeGreaterThan(7);
    expect(resultado.diasProporcionales.toNumber()).toBeLessThan(8);
  });

  it("descuenta las faltas del periodo (Art. 87 LFT)", () => {
    const conFaltas = calcularAguinaldo({
      salarioDiario: 500,
      diasAguinaldo: 15,
      fechaIngreso: new Date("2020-01-01"),
      fechaCorte: new Date("2025-12-31"),
      ejercicio: 2025,
      diasFaltas: 10,
    });
    expect(conFaltas.importe.toNumber()).toBeLessThan(7500);
  });
});

describe("PTU (Arts. 117-127 LFT)", () => {
  const trabajadores = [
    { empleadoId: "a", diasTrabajados: 365, salariosDevengados: 146000, salarioDiario: 400 },
    { empleadoId: "b", diasTrabajados: 180, salariosDevengados: 108000, salarioDiario: 600 },
    { empleadoId: "c", diasTrabajados: 365, salariosDevengados: 365000, salarioDiario: 1000 },
  ];

  it("reparte mitad por días y mitad por salarios sin perder importe", () => {
    const resultado = repartirPtu(300000, trabajadores);
    const total = resultado.reduce((acc, r) => acc + r.total.toNumber(), 0);
    expect(total).toBeCloseTo(300000, 1);
  });

  it("topa el reparto a tres meses de salario (Art. 127 fracc. VIII)", () => {
    const resultado = repartirPtu(5000000, trabajadores);
    const primero = resultado[0];
    expect(primero.total.toNumber()).toBeGreaterThan(400 * 90);
    expect(primero.importePagable.toFixed(2)).toBe((400 * 90).toFixed(2));
    expect(primero.excedenteNoPagado.toNumber()).toBeGreaterThan(0);
  });
});

describe("prima de antigüedad (Art. 162 LFT)", () => {
  it("paga 12 días por año con salario topado a dos salarios mínimos", () => {
    const resultado = calcularPrimaAntiguedad({
      salarioDiario: 5000,
      fechaIngreso: new Date("2015-01-01"),
      fechaBaja: new Date("2025-01-01"),
      salarioMinimo: PARAMETROS_2025.SALARIO_MINIMO_GENERAL,
    });
    expect(resultado.salarioTopado.toNumber()).toBe(
      PARAMETROS_2025.SALARIO_MINIMO_GENERAL * 2,
    );
    expect(resultado.anios.toNumber()).toBeCloseTo(10, 1);
  });
});

describe("finiquito y liquidación", () => {
  const comun = {
    empleadoId: "emp-1",
    nombre: "Juan Pérez",
    salarioDiario: 800,
    salarioDiarioIntegrado: 850,
    fechaIngreso: new Date("2018-03-01"),
    fechaBaja: new Date("2025-08-31"),
    diasPendientesDePago: 10,
    diasAguinaldo: 15,
    primaVacacionalPct: 0.25,
  };

  it("el finiquito por renuncia no incluye indemnización constitucional", () => {
    const resultado = calcularFiniquito(
      { ...comun, tipoSeparacion: "RENUNCIA" },
      { umaDiaria: UMA, salarioMinimo: PARAMETROS_2025.SALARIO_MINIMO_GENERAL },
    );
    const claves = resultado.conceptos.map((c) => c.concepto);
    expect(claves).not.toContain("Indemnización constitucional (3 meses)");
    expect(resultado.esLiquidacion).toBe(false);
    expect(resultado.neto.toNumber()).toBeGreaterThan(0);
  });

  it("la liquidación por despido injustificado agrega 90 días y 12 por año", () => {
    const resultado = calcularFiniquito(
      { ...comun, tipoSeparacion: "DESPIDO_INJUSTIFICADO", incluyeVeinteDiasPorAnio: true },
      { umaDiaria: UMA, salarioMinimo: PARAMETROS_2025.SALARIO_MINIMO_GENERAL },
    );
    const conceptos = resultado.conceptos.map((c) => c.concepto);
    expect(conceptos).toContain("Indemnización constitucional (3 meses)");
    expect(conceptos).toContain("Indemnización 20 días por año");
    expect(conceptos).toContain("Prima de antigüedad");
  });

  it("la liquidación supera al finiquito por renuncia", () => {
    const renuncia = calcularFiniquito(
      { ...comun, tipoSeparacion: "RENUNCIA" },
      { umaDiaria: UMA, salarioMinimo: PARAMETROS_2025.SALARIO_MINIMO_GENERAL },
    );
    const despido = calcularFiniquito(
      { ...comun, tipoSeparacion: "DESPIDO_INJUSTIFICADO" },
      { umaDiaria: UMA, salarioMinimo: PARAMETROS_2025.SALARIO_MINIMO_GENERAL },
    );
    expect(despido.neto.toNumber()).toBeGreaterThan(renuncia.neto.toNumber());
  });

  it("exenta 90 UMA por año de servicio en los pagos por separación", () => {
    const resultado = calcularFiniquito(
      { ...comun, tipoSeparacion: "DESPIDO_INJUSTIFICADO" },
      { umaDiaria: UMA, salarioMinimo: PARAMETROS_2025.SALARIO_MINIMO_GENERAL },
    );
    const anios = aniosDeServicio(comun.fechaIngreso, comun.fechaBaja);
    expect(resultado.aniosServicio).toBeGreaterThanOrEqual(anios);
    expect(resultado.totalExento.toNumber()).toBeGreaterThan(0);
    expect(resultado.totalExento.toNumber()).toBeLessThanOrEqual(
      UMA * 90 * resultado.aniosServicio + UMA * 45,
    );
  });

  it("cuadra total = percepciones - deducciones y deja memoria", () => {
    const resultado = calcularFiniquito(
      { ...comun, tipoSeparacion: "DESPIDO_INJUSTIFICADO" },
      { umaDiaria: UMA, salarioMinimo: PARAMETROS_2025.SALARIO_MINIMO_GENERAL },
    );
    expect(resultado.neto.toFixed(2)).toBe(
      resultado.totalPercepciones.minus(resultado.totalDeducciones).toFixed(2),
    );
    expect(Array.isArray((resultado.memoria as { fundamento?: unknown }).fundamento)).toBe(true);
  });
});
