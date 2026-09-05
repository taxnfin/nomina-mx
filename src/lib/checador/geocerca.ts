/**
 * Geocerca del centro de trabajo: distancia entre la ubicación que el empleado
 * comparte al checar y las coordenadas registradas en su expediente.
 */

export interface Coordenada {
  latitud: number;
  longitud: number;
}

export interface Geocerca {
  centro: Coordenada | null;
  radioMetros: number;
  exigeUbicacion: boolean;
}

export interface EvaluacionUbicacion {
  distanciaMetros: number | null;
  fueraDeRango: boolean;
  faltaUbicacion: boolean;
}

const RADIO_TIERRA_METROS = 6_371_000;

function radianes(grados: number): number {
  return (grados * Math.PI) / 180;
}

/** Distancia ortodrómica (haversine) en metros. */
export function distanciaMetros(origen: Coordenada, destino: Coordenada): number {
  const dLat = radianes(destino.latitud - origen.latitud);
  const dLon = radianes(destino.longitud - origen.longitud);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(radianes(origen.latitud)) *
      Math.cos(radianes(destino.latitud)) *
      Math.sin(dLon / 2) ** 2;
  return Math.round(2 * RADIO_TIERRA_METROS * Math.asin(Math.min(1, Math.sqrt(a))));
}

/**
 * Compara la ubicación recibida contra la geocerca. Sin centro configurado la
 * checada se acepta tal cual: la ubicación queda solo como evidencia.
 */
export function evaluarUbicacion(
  ubicacion: Coordenada | null,
  geocerca: Geocerca,
): EvaluacionUbicacion {
  if (!ubicacion) {
    return {
      distanciaMetros: null,
      fueraDeRango: false,
      faltaUbicacion: geocerca.exigeUbicacion,
    };
  }
  if (!geocerca.centro) {
    return { distanciaMetros: null, fueraDeRango: false, faltaUbicacion: false };
  }

  const metros = distanciaMetros(geocerca.centro, ubicacion);
  return {
    distanciaMetros: metros,
    fueraDeRango: metros > geocerca.radioMetros,
    faltaUbicacion: false,
  };
}
