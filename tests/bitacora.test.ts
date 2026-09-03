import { describe, expect, it } from "vitest";
import { calcularHash, HASH_GENESIS, serializarCanonico } from "../src/lib/auditoria/bitacora";

describe("serialización canónica", () => {
  it("es independiente del orden de las propiedades", () => {
    expect(serializarCanonico({ a: 1, b: { c: 2, d: 3 } })).toBe(
      serializarCanonico({ b: { d: 3, c: 2 }, a: 1 }),
    );
  });

  it("distingue valores distintos", () => {
    expect(serializarCanonico({ a: 1 })).not.toBe(serializarCanonico({ a: 2 }));
  });
});

describe("cadena de hashes", () => {
  it("es determinista", () => {
    const contenido = { accion: "CALCULAR", entidad: "CorridaNomina", entidadId: "abc" };
    expect(calcularHash(HASH_GENESIS, contenido)).toBe(calcularHash(HASH_GENESIS, contenido));
  });

  it("cambia si se altera el contenido", () => {
    const original = calcularHash(HASH_GENESIS, { total: 1000 });
    const alterado = calcularHash(HASH_GENESIS, { total: 1000.01 });
    expect(original).not.toBe(alterado);
  });

  it("cambia si se altera el eslabón previo", () => {
    const contenido = { total: 1000 };
    expect(calcularHash(HASH_GENESIS, contenido)).not.toBe(
      calcularHash("a".repeat(64), contenido),
    );
  });

  it("produce un SHA-256 hexadecimal", () => {
    expect(calcularHash(HASH_GENESIS, { x: 1 })).toMatch(/^[0-9a-f]{64}$/);
  });

  it("romper un eslabón invalida todos los posteriores", () => {
    const eventos = [{ n: 1 }, { n: 2 }, { n: 3 }];
    const encadenar = (inicial: string, lista: object[]) =>
      lista.reduce<string[]>((acc, evento) => {
        acc.push(calcularHash(acc.at(-1) ?? inicial, evento));
        return acc;
      }, []);

    const original = encadenar(HASH_GENESIS, eventos);
    const manipulado = encadenar(HASH_GENESIS, [{ n: 1 }, { n: 99 }, { n: 3 }]);
    expect(manipulado[0]).toBe(original[0]);
    expect(manipulado[1]).not.toBe(original[1]);
    expect(manipulado[2]).not.toBe(original[2]);
  });
});
