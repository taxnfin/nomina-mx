"use client";

import "leaflet/dist/leaflet.css";
import type { Circle, Map as MapaLeaflet, Marker } from "leaflet";
import { useEffect, useRef, useState } from "react";

const CENTRO_INICIAL: [number, number] = [19.4326, -99.1332];

interface Resultado {
  nombre: string;
  latitud: number;
  longitud: number;
}

/**
 * Selector del centro de trabajo sobre OpenStreetMap: busca la dirección con
 * Nominatim, deja mover el marcador y escribe las coordenadas y el radio en los
 * campos que consume la Server Action de la geocerca.
 */
export function SelectorUbicacion({
  latitudInicial,
  longitudInicial,
  radioInicial = 200,
}: {
  latitudInicial?: number | null;
  longitudInicial?: number | null;
  radioInicial?: number;
}) {
  const contenedor = useRef<HTMLDivElement>(null);
  const mapa = useRef<MapaLeaflet | null>(null);
  const marcador = useRef<Marker | null>(null);
  const circulo = useRef<Circle | null>(null);

  const [punto, setPunto] = useState<{ latitud: number; longitud: number } | null>(
    latitudInicial != null && longitudInicial != null
      ? { latitud: latitudInicial, longitud: longitudInicial }
      : null,
  );
  const [radio, setRadio] = useState(radioInicial);
  const [busqueda, setBusqueda] = useState("");
  const [resultados, setResultados] = useState<Resultado[]>([]);
  const [buscando, setBuscando] = useState(false);
  const [aviso, setAviso] = useState<string | null>(null);

  useEffect(() => {
    let cancelado = false;

    void (async () => {
      const L = await import("leaflet");
      if (cancelado || !contenedor.current || mapa.current) return;

      const inicial: [number, number] = punto
        ? [punto.latitud, punto.longitud]
        : CENTRO_INICIAL;
      const instancia = L.map(contenedor.current).setView(inicial, punto ? 16 : 5);
      L.tileLayer("https://tile.openstreetmap.org/{z}/{x}/{y}.png", {
        attribution: "&copy; OpenStreetMap",
        maxZoom: 19,
      }).addTo(instancia);

      const icono = L.icon({
        iconUrl: "https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon.png",
        iconRetinaUrl: "https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon-2x.png",
        shadowUrl: "https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png",
        iconSize: [25, 41],
        iconAnchor: [12, 41],
      });

      marcador.current = L.marker(inicial, { draggable: true, icon: icono }).addTo(instancia);
      circulo.current = L.circle(inicial, { radius: radio, color: "#0f172a", weight: 1 }).addTo(
        instancia,
      );
      if (!punto) {
        marcador.current.setOpacity(0);
        circulo.current.setStyle({ opacity: 0, fillOpacity: 0 });
      }

      marcador.current.on("dragend", () => {
        const posicion = marcador.current!.getLatLng();
        setPunto({ latitud: posicion.lat, longitud: posicion.lng });
      });
      instancia.on("click", (evento) => {
        setPunto({ latitud: evento.latlng.lat, longitud: evento.latlng.lng });
      });

      mapa.current = instancia;
    })();

    return () => {
      cancelado = true;
      mapa.current?.remove();
      mapa.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (!punto || !mapa.current) return;
    const posicion: [number, number] = [punto.latitud, punto.longitud];
    marcador.current?.setLatLng(posicion).setOpacity(1);
    circulo.current?.setLatLng(posicion).setStyle({ opacity: 1, fillOpacity: 0.15 });
  }, [punto]);

  useEffect(() => {
    circulo.current?.setRadius(radio);
  }, [radio]);

  async function buscar() {
    const consulta = busqueda.trim();
    if (consulta === "") return;
    setBuscando(true);
    setAviso(null);
    try {
      const url = new URL("https://nominatim.openstreetmap.org/search");
      url.searchParams.set("q", consulta);
      url.searchParams.set("format", "jsonv2");
      url.searchParams.set("limit", "5");
      const respuesta = await fetch(url, { headers: { "Accept-Language": "es" } });
      const datos: Array<{ display_name: string; lat: string; lon: string }> =
        await respuesta.json();
      const encontrados = datos.map((d) => ({
        nombre: d.display_name,
        latitud: Number(d.lat),
        longitud: Number(d.lon),
      }));
      setResultados(encontrados);
      if (encontrados.length === 0) setAviso("Sin resultados; marca el punto en el mapa.");
    } catch {
      setAviso("No se pudo buscar la dirección; marca el punto en el mapa.");
    } finally {
      setBuscando(false);
    }
  }

  function elegir(resultado: Resultado) {
    setPunto({ latitud: resultado.latitud, longitud: resultado.longitud });
    setResultados([]);
    setBusqueda(resultado.nombre);
    mapa.current?.setView([resultado.latitud, resultado.longitud], 17);
  }

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-end gap-3">
        <label className="flex flex-1 flex-col gap-1 text-sm">
          <span className="font-medium text-slate-700">Buscar el negocio</span>
          <input
            className="rounded-lg border border-slate-300 px-3 py-2 text-slate-900 outline-none focus:border-slate-900"
            value={busqueda}
            onChange={(evento) => setBusqueda(evento.target.value)}
            onKeyDown={(evento) => {
              if (evento.key === "Enter") {
                evento.preventDefault();
                void buscar();
              }
            }}
            placeholder="Calle, número, ciudad"
          />
        </label>
        <button
          type="button"
          onClick={() => void buscar()}
          disabled={buscando}
          className="rounded-lg border border-slate-300 bg-white px-4 py-2 text-sm font-medium hover:bg-slate-50 disabled:opacity-50"
        >
          {buscando ? "Buscando…" : "Buscar"}
        </button>
        <label className="flex flex-col gap-1 text-sm">
          <span className="font-medium text-slate-700">Radio permitido (m)</span>
          <input
            className="w-36 rounded-lg border border-slate-300 px-3 py-2 text-slate-900 outline-none focus:border-slate-900"
            name="radioMetros"
            type="number"
            min={10}
            value={radio}
            onChange={(evento) => setRadio(Number(evento.target.value) || 0)}
          />
        </label>
      </div>

      {resultados.length > 0 ? (
        <ul className="divide-y divide-slate-200 rounded-lg border border-slate-200 bg-white text-sm">
          {resultados.map((resultado) => (
            <li key={`${resultado.latitud},${resultado.longitud}`}>
              <button
                type="button"
                onClick={() => elegir(resultado)}
                className="block w-full px-3 py-2 text-left hover:bg-slate-50"
              >
                {resultado.nombre}
              </button>
            </li>
          ))}
        </ul>
      ) : null}

      <div
        ref={contenedor}
        className="h-72 w-full rounded-lg border border-slate-200"
        aria-label="Mapa del centro de trabajo"
      />

      <p className="text-xs text-slate-500">
        {punto
          ? `Centro de trabajo: ${punto.latitud.toFixed(6)}, ${punto.longitud.toFixed(6)} · radio ${radio} m`
          : "Busca la dirección o da clic en el mapa para marcar el centro de trabajo."}
        {aviso ? ` · ${aviso}` : ""}
      </p>

      <input type="hidden" name="latitudCentro" value={punto ? punto.latitud.toFixed(6) : ""} />
      <input type="hidden" name="longitudCentro" value={punto ? punto.longitud.toFixed(6) : ""} />
    </div>
  );
}
