/**
 * Nominatim no tolera direcciones como las escribe RH ("Col.", número exterior,
 * abreviaturas), así que la búsqueda se reintenta con versiones cada vez más
 * simples de la misma dirección.
 */

const ABREVIATURAS = /\b(col\.?|colonia|no\.?|núm\.?|num\.?|int\.?|ext\.?|c\.?p\.?)\b/gi;

function limpiar(texto: string): string {
  return texto.replace(/[.,#]+/g, " ").replace(/\s+/g, " ").trim();
}

export function variantesDeBusqueda(direccion: string): string[] {
  const original = direccion.trim();
  const sinAbreviaturas = limpiar(original.replace(ABREVIATURAS, " "));
  const sinNumeros = limpiar(sinAbreviaturas.replace(/\b\d+\b/g, " "));

  return [...new Set([original, sinAbreviaturas, sinNumeros])].filter(
    (variante) => variante !== "",
  );
}
