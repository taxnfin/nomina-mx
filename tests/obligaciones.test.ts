import { describe, expect, it } from "vitest";
import {
  calendarioDeObligaciones,
  esDiaHabil,
  fechaLimiteMesSiguiente,
  siguienteDiaHabil,
} from "../src/lib/obligaciones/calendario";
import { construirCedulaSipare, resumenEnteros } from "../src/lib/obligaciones/sipare";
import { ENTIDADES_ISN_2025, entidadIsn } from "../src/lib/fiscal/isn";
import { isnAplicable } from "../src/lib/fiscal/configuracion-isn";
import {
  calcularServicioEspecializado,
  cuatrimestresRepse,
  estadoRegistro,
} from "../src/lib/repse/calculo";

const iso = (fecha: Date) => fecha.toISOString().slice(0, 10);

describe("calendario de obligaciones", () => {
  it("recorre las fechas límite en fin de semana al siguiente día hábil", () => {
    // 17 de mayo de 2025 es sábado.
    expect(iso(fechaLimiteMesSiguiente(2025, 3, 17))).toBe("2025-05-19");
  });

  it("no considera hábiles los descansos obligatorios del Art. 74 LFT", () => {
    expect(esDiaHabil(new Date("2025-05-01T00:00:00Z"))).toBe(false);
    expect(iso(siguienteDiaHabil(new Date("2025-12-25T00:00:00Z")))).toBe("2025-12-26");
  });

  it("genera ISR e IMSS mensuales y RCV bimestral", () => {
    const calendario = calendarioDeObligaciones(2025);
    expect(calendario.filter((o) => o.clave === "ISR_RETENCIONES")).toHaveLength(12);
    expect(calendario.filter((o) => o.clave === "IMSS_MENSUAL")).toHaveLength(12);
    expect(calendario.filter((o) => o.clave === "RCV_INFONAVIT")).toHaveLength(6);
    expect(calendario.some((o) => o.clave === "ICSOE")).toBe(false);
  });

  it("agrega ISN e informativas cuando hay entidad y REPSE", () => {
    const calendario = calendarioDeObligaciones(2025, {
      entidad: { nombre: "Nuevo León", diaLimite: 17 },
      tieneRepse: true,
    });
    expect(calendario.filter((o) => o.clave === "ISN")).toHaveLength(12);
    expect(calendario.filter((o) => o.clave === "ICSOE")).toHaveLength(3);
    expect(calendario.filter((o) => o.clave === "SISUB")).toHaveLength(3);
  });

  it("entrega las obligaciones ordenadas por fecha límite", () => {
    const calendario = calendarioDeObligaciones(2025, { tieneRepse: true });
    const fechas = calendario.map((o) => o.fechaLimite.getTime());
    expect([...fechas].sort((a, b) => a - b)).toEqual(fechas);
  });
});

describe("cédula SIPARE", () => {
  const recibos = [
    {
      empleadoId: "e1",
      diasCotizados: 15,
      conceptos: [
        { ramo: "Enfermedades y maternidad — cuota fija", base: 1697.1, patron: 340.7, obrero: 0 },
        { ramo: "Retiro", base: 4500, patron: 90, obrero: 0 },
        { ramo: "Cesantía en edad avanzada y vejez", base: 4500, patron: 143.9, obrero: 51.1 },
        { ramo: "INFONAVIT — aportación patronal", base: 4500, patron: 225, obrero: 0 },
      ],
      amortizacionInfonavit: 500,
    },
    {
      empleadoId: "e2",
      diasCotizados: 15,
      conceptos: [
        { ramo: "Enfermedades y maternidad — cuota fija", base: 1697.1, patron: 340.7, obrero: 0 },
        { ramo: "Retiro", base: 3000, patron: 60, obrero: 0 },
      ],
    },
  ];

  it("separa los ramos mensuales de los bimestrales", () => {
    const cedula = construirCedulaSipare(recibos);
    expect(cedula.mensual.map((r) => r.ramo)).toEqual([
      "Enfermedades y maternidad — cuota fija",
    ]);
    expect(cedula.bimestral.map((r) => r.ramo)).toContain("Retiro");
    expect(cedula.bimestral.map((r) => r.ramo)).toContain("INFONAVIT — amortización de créditos");
  });

  it("acumula por ramo y cuadra los totales", () => {
    const cedula = construirCedulaSipare(recibos);
    expect(cedula.trabajadores).toBe(2);
    expect(cedula.diasCotizados).toBe(30);
    expect(cedula.totalMensual.toFixed(2)).toBe("681.40");
    // 90 + 60 + 143.9 + 51.1 + 225 + 500 de amortización.
    expect(cedula.totalBimestral.toFixed(2)).toBe("1070.00");
    expect(cedula.totalPatron.plus(cedula.totalObrero).toFixed(2)).toBe("1751.40");
  });
});

describe("concentrado de ISR e ISN", () => {
  const recibos = [
    { isrRetenido: 1200.55, subsidioEntregado: 0, baseIsn: 10000 },
    { isrRetenido: 0, subsidioEntregado: 320.45, baseIsn: 5000 },
  ];

  it("resta el subsidio entregado del ISR a enterar", () => {
    const resumen = resumenEnteros(recibos, 0.03);
    expect(resumen.isrRetenido.toFixed(2)).toBe("1200.55");
    expect(resumen.isrAEnterar.toFixed(2)).toBe("880.10");
    expect(resumen.isn.toFixed(2)).toBe("450.00");
  });

  it("nunca entera un ISR negativo", () => {
    const resumen = resumenEnteros([{ isrRetenido: 0, subsidioEntregado: 500, baseIsn: 0 }], 0.03);
    expect(resumen.isrAEnterar.toFixed(2)).toBe("0.00");
  });

  it("suma la sobretasa estatal sobre el impuesto causado", () => {
    const resumen = resumenEnteros([{ isrRetenido: 0, subsidioEntregado: 0, baseIsn: 100000 }], 0.02, 0.06);
    expect(resumen.isn.toFixed(2)).toBe("2120.00");
  });
});

describe("catálogo de ISN", () => {
  it("cubre las 32 entidades con tasa y día límite", () => {
    expect(ENTIDADES_ISN_2025).toHaveLength(32);
    for (const entidad of ENTIDADES_ISN_2025) {
      expect(entidad.tasa).toBeGreaterThan(0);
      expect(entidad.diaLimite).toBeGreaterThanOrEqual(1);
      expect(entidad.diaLimite).toBeLessThanOrEqual(31);
    }
  });

  it("devuelve null para claves desconocidas", () => {
    expect(entidadIsn("NLE")?.tasa).toBe(0.03);
    expect(entidadIsn("XXX")).toBeNull();
  });
});

describe("configuración de ISN por empresa", () => {
  it("usa la tasa del catálogo cuando la empresa no captura una propia", () => {
    const isn = isnAplicable({ claveEntidadIsn: "NLE" });
    expect(isn.nombre).toBe("Nuevo León");
    expect(isn.tasa).toBe(0.03);
    expect(isn.tasaPropia).toBe(false);
    expect(isn.diaLimite).toBe(entidadIsn("NLE")?.diaLimite);
  });

  it("respeta la tasa, sobretasa y día límite capturados por la empresa", () => {
    const isn = isnAplicable({
      claveEntidadIsn: "NLE",
      tasaIsn: "0.035000",
      sobretasaIsn: "0.100000",
      diaLimiteIsn: 20,
    });
    expect(isn.tasa).toBe(0.035);
    expect(isn.sobretasa).toBe(0.1);
    expect(isn.diaLimite).toBe(20);
    expect(isn.tasaPropia).toBe(true);
  });

  it("tolera una entidad fuera del catálogo apoyándose en lo capturado", () => {
    const isn = isnAplicable({ claveEntidadIsn: "XXX", tasaIsn: 0.025, diaLimiteIsn: 15 });
    expect(isn.tasa).toBe(0.025);
    expect(isn.diaLimite).toBe(15);
  });
});

describe("servicios especializados", () => {
  it("costea el servicio con margen, IVA y retención", () => {
    const costo = calcularServicioEspecializado({
      nomina: 100000,
      cuotasPatronales: 25000,
      impuestoSobreNominas: 3000,
      provisiones: 12000,
      margenUtilidad: 0.15,
      retencionIva6: true,
    });
    expect(costo.costoTotal.toFixed(2)).toBe("140000.00");
    expect(costo.utilidad.toFixed(2)).toBe("21000.00");
    expect(costo.iva.toFixed(2)).toBe("25760.00");
    expect(costo.retencionIva.toFixed(2)).toBe("9660.00");
    expect(costo.total.toFixed(2)).toBe("177100.00");
  });

  it("avisa la renovación tres meses antes del vencimiento", () => {
    const registro = new Date("2023-03-01T00:00:00Z");
    expect(estadoRegistro(registro, new Date("2025-06-01T00:00:00Z")).requiereRenovacion).toBe(false);
    const porVencer = estadoRegistro(registro, new Date("2026-01-15T00:00:00Z"));
    expect(porVencer.vigente).toBe(true);
    expect(porVencer.requiereRenovacion).toBe(true);
    expect(estadoRegistro(registro, new Date("2026-06-01T00:00:00Z")).vigente).toBe(false);
  });

  it("informa los tres cuatrimestres con corte al 17 recorrido a día hábil", () => {
    const cuatrimestres = cuatrimestresRepse(2025);
    // El 17 de mayo de 2025 es sábado.
    expect(cuatrimestres.map((c) => iso(c.fechaLimite))).toEqual([
      "2025-01-17",
      "2025-05-19",
      "2025-09-17",
    ]);
  });

  it("coincide con las fechas del calendario anual de ICSOE y SISUB", () => {
    const calendario = calendarioDeObligaciones(2025, { tieneRepse: true });
    const icsoe = calendario.filter((o) => o.clave === "ICSOE").map((o) => iso(o.fechaLimite));
    expect(cuatrimestresRepse(2025).map((c) => iso(c.fechaLimite))).toEqual(icsoe);
  });
});
