import { describe, expect, it } from "vitest";
import { calcularRecibo, PARAMETROS_POR_DEFECTO, type EmpleadoCalculo } from "../src/lib/nomina/motor";
import { PARAMETROS_2025 } from "../src/lib/fiscal/tablas2025";
import { generarPeriodos } from "../src/lib/fiscal/periodicidad";

const UMA = PARAMETROS_2025.UMA_DIARIA;

const base: EmpleadoCalculo = {
  id: "emp-1",
  nombre: "María López",
  periodicidad: "QUINCENAL",
  salarioDiario: 1200,
  salarioBaseCotizacion: 1254.25,
};

describe("recibo ordinario", () => {
  const recibo = calcularRecibo(base, { diasPago: 15, diasNaturales: 15 });

  it("paga el sueldo del periodo incluyendo séptimo día", () => {
    const sueldo = recibo.conceptos.find((c) => c.claveSat === "001");
    expect(sueldo?.importe.toFixed(2)).toBe("18000.00");
  });

  it("cuadra neto = percepciones + otros pagos - deducciones", () => {
    expect(recibo.neto.toFixed(2)).toBe(
      recibo.totalPercepciones
        .plus(recibo.totalOtrosPagos)
        .minus(recibo.totalDeducciones)
        .toFixed(2),
    );
  });

  it("retiene ISR y cuotas obrero del IMSS", () => {
    expect(recibo.isrRetenido.toNumber()).toBeGreaterThan(0);
    expect(recibo.imssObrero.toNumber()).toBeGreaterThan(0);
  });

  it("deja memoria de cálculo auditable con el fundamento legal", () => {
    const memoria = recibo.memoria as Record<string, unknown>;
    expect(memoria.isr).toBeTruthy();
    expect(Array.isArray(memoria.fundamento)).toBe(true);
  });
});

describe("periodicidades", () => {
  const periodicidades = [
    { periodicidad: "SEMANAL" as const, dias: 7 },
    { periodicidad: "CATORCENAL" as const, dias: 14 },
    { periodicidad: "QUINCENAL" as const, dias: 15 },
    { periodicidad: "MENSUAL" as const, dias: 30 },
  ];

  it("el ISR anualizado es equivalente entre periodicidades", () => {
    const anuales = periodicidades.map(({ periodicidad, dias }) => {
      const recibo = calcularRecibo(
        { ...base, periodicidad },
        { diasPago: dias, diasNaturales: dias },
      );
      return recibo.isrRetenido.div(dias).times(365).toNumber();
    });
    const referencia = anuales[3];
    for (const valor of anuales) {
      expect(Math.abs(valor - referencia) / referencia).toBeLessThan(0.01);
    }
  });

  it("el neto crece con la duración del periodo", () => {
    const netos = periodicidades.map(({ periodicidad, dias }) =>
      calcularRecibo({ ...base, periodicidad }, { diasPago: dias, diasNaturales: dias }).neto.toNumber(),
    );
    expect(netos).toEqual([...netos].sort((a, b) => a - b));
  });
});

describe("incidencias", () => {
  it("las faltas reducen días pagados y días cotizados", () => {
    const recibo = calcularRecibo(base, { diasPago: 15, diasNaturales: 15, faltas: 2 });
    expect(recibo.diasPagados.toNumber()).toBe(13);
    expect(recibo.diasCotizados).toBe(13);
  });

  it("exenta una UMA por domingo laborado en la prima dominical", () => {
    const recibo = calcularRecibo(
      { ...base, salarioDiario: 400 },
      { diasPago: 7, diasNaturales: 7, domingosLaborados: 1 },
    );
    const prima = recibo.conceptos.find((c) => c.claveSat === "020");
    expect(prima?.importe.toFixed(2)).toBe("100.00");
    expect(prima?.exento.toFixed(2)).toBe("100.00");
    expect(prima?.gravado.toFixed(2)).toBe("0.00");
  });

  it("grava el 50% de las horas extra de un salario superior al mínimo", () => {
    const recibo = calcularRecibo(
      { ...base, salarioDiario: 800, periodicidad: "SEMANAL" },
      { diasPago: 7, diasNaturales: 7, horasExtraDobles: 6 },
    );
    const horas = recibo.conceptos.find((c) => c.claveSat === "019");
    // 6 horas × (800 / 8) × 2 = 1,200; exención = 50% topada a 5 UMA semanales
    expect(horas?.importe.toFixed(2)).toBe("1200.00");
    expect(horas?.exento.toFixed(2)).toBe((UMA * 5).toFixed(2));
  });

  it("exenta al 100% las horas extra de un trabajador de salario mínimo", () => {
    const recibo = calcularRecibo(
      { ...base, salarioDiario: PARAMETROS_2025.SALARIO_MINIMO_GENERAL, periodicidad: "SEMANAL" },
      { diasPago: 7, diasNaturales: 7, horasExtraDobles: 4 },
    );
    const horas = recibo.conceptos.find((c) => c.claveSat === "019");
    expect(horas?.gravado.toFixed(2)).toBe("0.00");
  });

  it("paga doble el día de descanso trabajado", () => {
    const recibo = calcularRecibo(base, {
      diasPago: 15,
      diasNaturales: 15,
      diasDescansoTrabajados: 1,
    });
    const concepto = recibo.conceptos.find((c) => c.concepto === "Día de descanso trabajado");
    expect(concepto?.importe.toFixed(2)).toBe("2400.00");
  });
});

describe("percepciones extraordinarias", () => {
  it("exenta 30 UMA del aguinaldo", () => {
    const recibo = calcularRecibo(base, {
      diasPago: 15,
      diasNaturales: 15,
      aguinaldo: 18000,
    });
    const aguinaldo = recibo.conceptos.find((c) => c.claveSat === "002");
    expect(aguinaldo?.exento.toFixed(2)).toBe((UMA * 30).toFixed(2));
  });

  it("el Art. 174 RLISR reduce la retención frente al método acumulado", () => {
    const acumulado = calcularRecibo(base, {
      diasPago: 15,
      diasNaturales: 15,
      aguinaldo: 18000,
    });
    const art174 = calcularRecibo(base, {
      diasPago: 15,
      diasNaturales: 15,
      aguinaldo: 18000,
      aplicarArt174: true,
    });
    expect(art174.isrRetenido.toNumber()).toBeLessThan(acumulado.isrRetenido.toNumber());
  });
});

describe("subsidio y regímenes", () => {
  it("entrega subsidio en efectivo a un salario bajo", () => {
    const recibo = calcularRecibo(
      { ...base, salarioDiario: 200, periodicidad: "SEMANAL" },
      { diasPago: 7, diasNaturales: 7 },
    );
    expect(recibo.subsidioEntregado.toNumber()).toBeGreaterThan(0);
    expect(recibo.isrRetenido.toNumber()).toBe(0);
  });

  it("los asimilados a salarios no causan cuotas del IMSS ni subsidio", () => {
    const recibo = calcularRecibo(
      { ...base, causaImss: false, aplicaSubsidio: false },
      { diasPago: 15, diasNaturales: 15 },
    );
    expect(recibo.imssObrero.toNumber()).toBe(0);
    expect(recibo.subsidioCausado.toNumber()).toBe(0);
  });
});

describe("descuentos", () => {
  it("calcula la pensión alimenticia sobre el neto disponible", () => {
    const recibo = calcularRecibo(
      { ...base, pensionAlimenticiaTipo: "PORCENTAJE", pensionAlimenticiaValor: 0.15 },
      { diasPago: 15, diasNaturales: 15 },
    );
    const pension = recibo.conceptos.find((c) => c.claveSat === "007");
    expect(pension?.importe.toNumber()).toBeGreaterThan(0);
    expect(recibo.neto.toNumber()).toBeLessThan(18000);
  });
});

describe("calendario de periodos", () => {
  it("genera el número de periodos esperado por periodicidad", () => {
    expect(generarPeriodos(2025, "MENSUAL")).toHaveLength(12);
    expect(generarPeriodos(2025, "QUINCENAL")).toHaveLength(24);
    expect(generarPeriodos(2025, "SEMANAL").length).toBeGreaterThanOrEqual(52);
    expect(generarPeriodos(2025, "CATORCENAL").length).toBeGreaterThanOrEqual(26);
  });

  it("la segunda quincena de febrero cotiza 13 días ante el IMSS", () => {
    const febrero = generarPeriodos(2025, "QUINCENAL")[3];
    expect(febrero.diasNaturales).toBe(13);
    expect(febrero.diasPago).toBe(15);
  });
});

describe("parámetros", () => {
  it("usa la semilla del ejercicio 2025 por defecto", () => {
    expect(PARAMETROS_POR_DEFECTO.umaDiaria).toBe(PARAMETROS_2025.UMA_DIARIA);
  });
});
