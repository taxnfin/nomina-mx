import { describe, expect, it } from "vitest";
import { distanciaMetros, evaluarUbicacion } from "../src/lib/checador/geocerca";

const OFICINA = { latitud: 25.6866, longitud: -100.3161 };

describe("distanciaMetros", () => {
  it("mide cero contra el mismo punto", () => {
    expect(distanciaMetros(OFICINA, OFICINA)).toBe(0);
  });

  it("mide la distancia entre Monterrey y CDMX", () => {
    const cdmx = { latitud: 19.4326, longitud: -99.1332 };
    const metros = distanciaMetros(OFICINA, cdmx);
    expect(metros).toBeGreaterThan(700_000);
    expect(metros).toBeLessThan(720_000);
  });
});

describe("evaluarUbicacion", () => {
  const geocerca = { centro: OFICINA, radioMetros: 200, exigeUbicacion: false };

  it("acepta una checada dentro del radio", () => {
    const resultado = evaluarUbicacion({ latitud: 25.6870, longitud: -100.3163 }, geocerca);
    expect(resultado.fueraDeRango).toBe(false);
    expect(resultado.distanciaMetros).toBeLessThanOrEqual(200);
  });

  it("marca fuera de rango una checada lejana", () => {
    const resultado = evaluarUbicacion({ latitud: 25.7000, longitud: -100.3161 }, geocerca);
    expect(resultado.fueraDeRango).toBe(true);
    expect(resultado.distanciaMetros).toBeGreaterThan(200);
  });

  it("sin centro configurado guarda la ubicación sin validarla", () => {
    const resultado = evaluarUbicacion(
      { latitud: 19.4326, longitud: -99.1332 },
      { centro: null, radioMetros: 200, exigeUbicacion: false },
    );
    expect(resultado).toEqual({
      distanciaMetros: null,
      fueraDeRango: false,
      faltaUbicacion: false,
    });
  });

  it("señala la falta de ubicación solo cuando es obligatoria", () => {
    expect(evaluarUbicacion(null, geocerca).faltaUbicacion).toBe(false);
    expect(
      evaluarUbicacion(null, { ...geocerca, exigeUbicacion: true }).faltaUbicacion,
    ).toBe(true);
  });
});
