import { describe, expect, it } from "vitest";
import { variantesDeBusqueda } from "../src/lib/checador/busqueda-direccion";

describe("variantesDeBusqueda", () => {
  it("simplifica una dirección con abreviaturas y número exterior", () => {
    expect(
      variantesDeBusqueda("Presidencia Municipal Sur 5501 Col. Nueva Estanzuela Monterrey"),
    ).toEqual([
      "Presidencia Municipal Sur 5501 Col. Nueva Estanzuela Monterrey",
      "Presidencia Municipal Sur 5501 Nueva Estanzuela Monterrey",
      "Presidencia Municipal Sur Nueva Estanzuela Monterrey",
    ]);
  });

  it("no repite variantes cuando la dirección ya es simple", () => {
    expect(variantesDeBusqueda("Monterrey")).toEqual(["Monterrey"]);
  });

  it("descarta la cadena vacía", () => {
    expect(variantesDeBusqueda("  ")).toEqual([]);
  });
});
