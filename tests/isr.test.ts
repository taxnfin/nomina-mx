import { describe, expect, it } from "vitest";
import {
  calcularIsrPeriodo,
  impuestoSegunTarifa,
  isrPorSeparacion,
  subsidioParaElEmpleo,
  tarifaPorPeriodicidad,
} from "../src/lib/fiscal/isr";
import { TARIFA_ISR_MENSUAL_2025 } from "../src/lib/fiscal/tablas2025";

describe("tarifas por periodicidad", () => {
  it("reproduce la tarifa quincenal del Anexo 8", () => {
    const quincenal = tarifaPorPeriodicidad("QUINCENAL");
    expect(quincenal[0].limiteSuperior).toBe(368.1);
    expect(quincenal[1].limiteInferior).toBe(368.1);
    expect(quincenal[1].cuotaFija).toBe(7.05);
    expect(quincenal[2].cuotaFija).toBe(183.45);
  });

  it("reproduce la tarifa semanal del Anexo 8", () => {
    const semanal = tarifaPorPeriodicidad("SEMANAL");
    expect(semanal[0].limiteSuperior).toBe(171.78);
    expect(semanal[1].cuotaFija).toBe(3.29);
  });

  it("deriva la tarifa catorcenal aunque el SAT no la publique", () => {
    const catorcenal = tarifaPorPeriodicidad("CATORCENAL");
    const semanal = tarifaPorPeriodicidad("SEMANAL");
    expect(catorcenal[3].limiteInferior).toBeCloseTo(semanal[3].limiteInferior * 2, 2);
  });

  it("deja intacta la tarifa mensual", () => {
    expect(tarifaPorPeriodicidad("MENSUAL")).toEqual(
      TARIFA_ISR_MENSUAL_2025.map((r) => ({ ...r })),
    );
  });
});

describe("impuesto del Art. 96 LISR", () => {
  it("aplica límite inferior, excedente, porcentaje y cuota fija", () => {
    const { impuesto, renglon } = impuestoSegunTarifa(18000, TARIFA_ISR_MENSUAL_2025);
    expect(renglon.limiteInferior).toBe(15487.72);
    // (18,000 - 15,487.72) × 21.36% + 1,640.18
    expect(impuesto.toFixed(2)).toBe("2176.80");
  });

  it("no genera impuesto con base cero", () => {
    expect(impuestoSegunTarifa(0, TARIFA_ISR_MENSUAL_2025).impuesto.toNumber()).toBe(0);
  });
});

describe("subsidio para el empleo", () => {
  it("se otorga proporcional a la periodicidad cuando el ingreso está bajo el tope", () => {
    const semanal = subsidioParaElEmpleo(1500, "SEMANAL");
    expect(semanal.toNumber()).toBeGreaterThan(0);
    expect(semanal.toFixed(2)).toBe("93.61");
  });

  it("no se otorga cuando el ingreso rebasa el tope", () => {
    expect(subsidioParaElEmpleo(9000, "QUINCENAL").toNumber()).toBe(0);
  });
});

describe("retención del periodo", () => {
  it("resta el subsidio causado del impuesto determinado", () => {
    const detalle = calcularIsrPeriodo({ baseGravable: 3000, periodicidad: "QUINCENAL" });
    expect(detalle.subsidioCausado.toNumber()).toBeGreaterThan(0);
    expect(detalle.isrACargo.plus(detalle.subsidioAEntregar).toNumber()).toBeGreaterThanOrEqual(0);
    expect(
      detalle.impuestoDeterminado.minus(detalle.subsidioCausado).toFixed(2),
    ).toBe(detalle.isrACargo.minus(detalle.subsidioAEntregar).toFixed(2));
  });

  it("entrega subsidio en efectivo cuando supera al impuesto", () => {
    const detalle = calcularIsrPeriodo({ baseGravable: 900, periodicidad: "SEMANAL" });
    expect(detalle.isrACargo.toNumber()).toBe(0);
    expect(detalle.subsidioAEntregar.toNumber()).toBeGreaterThan(0);
  });

  it("un salario alto quincenal retiene ISR sin subsidio", () => {
    const detalle = calcularIsrPeriodo({ baseGravable: 18000, periodicidad: "QUINCENAL" });
    expect(detalle.subsidioCausado.toNumber()).toBe(0);
    expect(detalle.isrACargo.toNumber()).toBeGreaterThan(2000);
  });
});

describe("pagos por separación", () => {
  it("aplica la tasa efectiva del último sueldo mensual ordinario al excedente", () => {
    const resultado = isrPorSeparacion(200000, 30000, TARIFA_ISR_MENSUAL_2025);
    const isrSueldo = impuestoSegunTarifa(30000, TARIFA_ISR_MENSUAL_2025).impuesto;
    const esperado = isrSueldo.plus(
      isrSueldo.div(30000).times(170000),
    );
    expect(resultado.isr.toFixed(2)).toBe(esperado.toDecimalPlaces(2).toFixed(2));
  });
});
