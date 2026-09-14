"use client";

import { useEffect, useState } from "react";
import {
  Circle,
  CircleMarker,
  MapContainer,
  Popup,
  TileLayer,
  useMap,
} from "react-leaflet";
import "leaflet/dist/leaflet.css";

type WeatherMapProps = {
  latitude: number;
  longitude: number;
  locationName: string;
  temperature?: number;
  rainProbability?: number;
  humidity?: number;
  windSpeed?: number;
};

type RainViewerFrame = {
  time: number;
  path: string;
};

type RainViewerResponse = {
  host?: string;
  radar?: {
    past?: RainViewerFrame[];
  };
};

function MapUpdater({
  latitude,
  longitude,
}: {
  latitude: number;
  longitude: number;
}) {
  const map = useMap();

  useEffect(() => {
    let cancelled = false;

    // Leaflet can still have a queued animation while React is
    // mounting/unmounting the map. Calling setView during that moment
    // can cause the "_leaflet_pos" error.
    const frame = window.requestAnimationFrame(() => {
      if (cancelled) return;

      try {
        const container = map.getContainer();

        if (!container || !container.isConnected) {
          return;
        }

        // Leaflet's internal map pane must still exist.
        if (!(map as any)._mapPane) {
          return;
        }

        map.setView(
          [latitude, longitude],
          map.getZoom(),
          {
            animate: false,
          }
        );
      } catch (error) {
        console.warn("Leaflet map update skipped:", error);
      }
    });

    return () => {
      cancelled = true;
      window.cancelAnimationFrame(frame);
    };
  }, [latitude, longitude, map]);

  return null;
}

function getAlertSeverity(
  temperature?: number,
  rainProbability?: number,
  windSpeed?: number
) {
  const severe =
    (temperature ?? 0) >= 40 ||
    (rainProbability ?? 0) >= 80 ||
    (windSpeed ?? 0) >= 60;

  if (severe) {
    return {
      level: "RED",
      label: "Severe Weather Alert",
      color: "#ef4444",
      fill: "#ef4444",
      description: "High-risk weather conditions detected from the supplied forecast.",
    };
  }

  const moderate =
    (temperature ?? 0) >= 37 ||
    (rainProbability ?? 0) >= 60 ||
    (windSpeed ?? 0) >= 40;

  if (moderate) {
    return {
      level: "ORANGE",
      label: "Weather Alert",
      color: "#f97316",
      fill: "#f97316",
      description: "Weather conditions need attention.",
    };
  }

  return null;
}

function getRisk(
  temperature?: number,
  rainProbability?: number,
  windSpeed?: number
) {
  if (
    (temperature ?? 0) >= 40 ||
    (rainProbability ?? 0) >= 80 ||
    (windSpeed ?? 0) >= 60
  ) {
    return {
      label: "HIGH",
      description: "Severe weather conditions possible.",
    };
  }

  if (
    (temperature ?? 0) >= 37 ||
    (rainProbability ?? 0) >= 60 ||
    (windSpeed ?? 0) >= 40
  ) {
    return {
      label: "MODERATE",
      description: "Weather conditions need attention.",
    };
  }

  return {
    label: "LOW",
    description: "No major weather risk detected.",
  };
}

export default function WeatherMap({
  latitude,
  longitude,
  locationName,
  temperature,
  rainProbability,
  humidity,
  windSpeed,
}: WeatherMapProps) {
  const [showIntelligence, setShowIntelligence] = useState(true);
  const [showRadar, setShowRadar] = useState(false);
  const [showCoverage, setShowCoverage] = useState(false);
  const [showRainProbability, setShowRainProbability] = useState(false);
  const [showAlertsLayer, setShowAlertsLayer] = useState(false);
  const [showTemperature, setShowTemperature] = useState(false);

  // Radar metadata is loaded here instead of inside LayersControl.
  // This keeps the actual TileLayer mounted directly inside the overlay,
  // which is more reliable with React-Leaflet.
  const [radarFrames, setRadarFrames] = useState<RainViewerFrame[]>([]);
  const [radarHost, setRadarHost] = useState<string | null>(null);
  const [radarIndex, setRadarIndex] = useState(-1);
  const [radarPlaying, setRadarPlaying] = useState(false);
  const [radarError, setRadarError] = useState(false);

  useEffect(() => {
    let cancelled = false;

    async function loadRadar() {
      try {
        setRadarError(false);

        const response = await fetch(
          "https://api.rainviewer.com/public/weather-maps.json",
          {
            cache: "no-store",
          }
        );

        if (!response.ok) {
          throw new Error(`RainViewer API failed: ${response.status}`);
        }

        const data: RainViewerResponse = await response.json();
        const pastFrames = data.radar?.past ?? [];

        if (!data.host || pastFrames.length === 0) {
          throw new Error("No RainViewer radar frames available.");
        }

        // The API returns chronological past frames.
        // Use the newest available frame.
        if (!cancelled) {
          setRadarHost(data.host);
          setRadarFrames(pastFrames);
          setRadarIndex(pastFrames.length - 1);
          setRadarError(false);
        }
      } catch (error) {
        console.error("RainViewer radar error:", error);

        if (!cancelled) {
          setRadarError(true);
        }
      }
    }

    loadRadar();

    // Refresh radar metadata every 10 minutes.
    const interval = window.setInterval(
      loadRadar,
      10 * 60 * 1000
    );

    return () => {
      cancelled = true;
      window.clearInterval(interval);
    };
  }, []);

  const currentRadarFrame =
    radarIndex >= 0 && radarFrames[radarIndex]
      ? radarFrames[radarIndex]
      : null;

  const radarUrl =
    radarHost && currentRadarFrame
      ? `${radarHost}${currentRadarFrame.path}/256/{z}/{x}/{y}/2/1_1.png`
      : null;

  const radarTime = currentRadarFrame?.time ?? null;

  const radarFrameCount = radarFrames.length;

  useEffect(() => {
    if (!radarPlaying || radarFrameCount < 2) {
      return;
    }

    const timer = window.setInterval(() => {
      setRadarIndex((current) => {
        if (current < 0) return radarFrameCount - 1;
        return current >= radarFrameCount - 1 ? 0 : current + 1;
      });
    }, 700);

    return () => window.clearInterval(timer);
  }, [radarPlaying, radarFrameCount]);

  const risk = getRisk(
    temperature,
    rainProbability,
    windSpeed
  );

  const alert = getAlertSeverity(
    temperature,
    rainProbability,
    windSpeed
  );

  // Lightweight GIS visualization layers.
  // These intentionally use the existing location and weather props only.
  const rainRadius = Math.max(
    1200,
    Math.min(8000, (rainProbability ?? 0) * 80)
  );

  const heatRadius = Math.max(
    1200,
    Math.min(
      7000,
      Math.max(0, (temperature ?? 0) - 25) * 350
    )
  );

  return (
    <div className="relative h-[500px] w-full overflow-hidden rounded-[1.5rem]">
      <MapContainer
        center={[latitude, longitude]}
        zoom={10}
        scrollWheelZoom={true}
        zoomAnimation={false}
        fadeAnimation={false}
        markerZoomAnimation={false}
        className="h-full w-full"
      >
        <MapUpdater
          latitude={latitude}
          longitude={longitude}
        />

        <TileLayer
          attribution='&copy; <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noreferrer">OpenStreetMap</a> contributors'
          url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
          maxZoom={19}
        />

        {/*
          Custom layer controls are used instead of React-Leaflet's LayersControl. Next.js + React 19 Fast Refresh can sometimes
          make Leaflet's LayersControl try to append a DOM node that has
          already been removed, producing:
          "Cannot read properties of undefined (reading 'appendChild')".

          Keeping the layers as normal React children and toggling them
          with state avoids that DOM reconciliation problem while keeping
          all existing map layers.
        */}
        {showRadar && radarUrl && (
          <TileLayer
            key={radarUrl}
            url={radarUrl}
            opacity={0.9}
            zIndex={500}
            maxNativeZoom={7}
            maxZoom={19}
            updateWhenIdle={false}
            keepBuffer={4}
            attribution='Weather radar © <a href="https://www.rainviewer.com/" target="_blank" rel="noreferrer">RainViewer</a>'
          />
        )}

        {showCoverage && (
          <TileLayer
            url="https://tilecache.rainviewer.com/v2/coverage/0/256/{z}/{x}/{y}/0/0_0.png"
            opacity={0.22}
            zIndex={450}
            maxNativeZoom={7}
            maxZoom={19}
            attribution='Radar coverage © <a href="https://www.rainviewer.com/" target="_blank" rel="noreferrer">RainViewer</a>'
          />
        )}

        {showRainProbability && (
          <Circle
            center={[latitude, longitude]}
            radius={rainRadius}
            pathOptions={{
              color: "#38bdf8",
              fillColor: "#38bdf8",
              fillOpacity: Math.min(
                0.28,
                Math.max(0.06, (rainProbability ?? 0) / 350)
              ),
              weight: 2,
            }}
          />
        )}

        {showAlertsLayer && alert && (
          <>
            <Circle
              center={[latitude, longitude]}
              radius={Math.max(
                1800,
                Math.min(
                  5000,
                  (rainProbability ?? 0) * 45 +
                    Math.max(0, (temperature ?? 0) - 35) * 120
                )
              )}
              pathOptions={{
                color: alert.color,
                fillColor: alert.fill,
                fillOpacity: 0.12,
                weight: 3,
                dashArray: "8 8",
              }}
            />

            <CircleMarker
              center={[latitude, longitude]}
              radius={18}
              pathOptions={{
                color: alert.color,
                fillColor: alert.fill,
                fillOpacity: 0.22,
                weight: 3,
              }}
            >
              <Popup>
                <div className="min-w-[210px]">
                  <div className="flex items-center gap-2">
                    <span
                      style={{
                        width: 9,
                        height: 9,
                        borderRadius: "9999px",
                        background: alert.color,
                        display: "inline-block",
                      }}
                    />
                    <strong>{alert.label}</strong>
                  </div>

                  <p className="mt-2 text-sm">
                    <strong>{locationName}</strong>
                  </p>

                  <p className="mt-1 text-xs">{alert.description}</p>

                  <div className="mt-3 space-y-1 text-xs">
                    {temperature !== undefined && (
                      <div>
                        Temperature: <strong>{Math.round(temperature)}°C</strong>
                      </div>
                    )}
                    {rainProbability !== undefined && (
                      <div>
                        Rain probability: <strong>{rainProbability}%</strong>
                      </div>
                    )}
                    {windSpeed !== undefined && (
                      <div>
                        Wind: <strong>{Math.round(windSpeed)} km/h</strong>
                      </div>
                    )}
                  </div>

                  <p className="mt-3 text-[10px] leading-4 text-slate-500">
                    Follow official meteorological warnings for safety-critical decisions.
                  </p>
                </div>
              </Popup>
            </CircleMarker>
          </>
        )}

        {showTemperature && (
          <Circle
            center={[latitude, longitude]}
            radius={heatRadius}
            pathOptions={{
              color: "#fb923c",
              fillColor: "#fb923c",
              fillOpacity: Math.min(
                0.24,
                Math.max(
                  0.05,
                  Math.max(0, (temperature ?? 0) - 25) / 100
                )
              ),
              weight: 2,
            }}
          />
        )}

        <CircleMarker
          center={[latitude, longitude]}
          radius={12}
          pathOptions={{
            color: "#22d3ee",
            fillColor: "#06b6d4",
            fillOpacity: 0.75,
            weight: 3,
          }}
        >
          <Popup>
            <div className="min-w-[180px]">
              <strong>{locationName}</strong>

              <div className="mt-2 space-y-1 text-sm">
                {temperature !== undefined && (
                  <div>
                    Temperature:{" "}
                    <strong>{Math.round(temperature)}°C</strong>
                  </div>
                )}

                {rainProbability !== undefined && (
                  <div>
                    Rain chance:{" "}
                    <strong>{rainProbability}%</strong>
                  </div>
                )}

                {humidity !== undefined && (
                  <div>
                    Humidity: <strong>{humidity}%</strong>
                  </div>
                )}

                {windSpeed !== undefined && (
                  <div>
                    Wind:{" "}
                    <strong>{Math.round(windSpeed)} km/h</strong>
                  </div>
                )}
              </div>
            </div>
          </Popup>
        </CircleMarker>
      </MapContainer>
      <div className="absolute right-4 top-4 z-[1000]" style={{ pointerEvents: "auto" }}>
          <div className="leaflet-control rounded-xl border border-slate-200 bg-white/95 p-2 shadow-lg backdrop-blur">
            <div className="mb-1 px-2 text-[10px] font-bold uppercase tracking-wide text-slate-500">
              Map Layers
            </div>
            <div className="space-y-1">
              {[
                ["🌧️ Rain Radar", showRadar, setShowRadar, !radarUrl],
                ["📡 Radar Coverage", showCoverage, setShowCoverage, false],
                ["🌧️ Rain Probability", showRainProbability, setShowRainProbability, false],
                ["⚠️ Weather Alerts", showAlertsLayer, setShowAlertsLayer, !alert],
                ["🌡️ Temperature Zone", showTemperature, setShowTemperature, false],
              ].map(([label, checked, setter, disabled]) => (
                <button
                  key={label as string}
                  type="button"
                  disabled={disabled as boolean}
                  onClick={() => (setter as React.Dispatch<React.SetStateAction<boolean>>)(!checked)}
                  className={`flex w-full items-center gap-2 rounded-lg px-2 py-1.5 text-left text-[11px] transition ${
                    checked
                      ? "bg-sky-100 text-sky-800"
                      : "text-slate-600 hover:bg-slate-100"
                  } ${disabled ? "cursor-not-allowed opacity-40" : ""}`}
                >
                  <span className={`h-2.5 w-2.5 rounded-full border ${
                    checked ? "border-sky-500 bg-sky-500" : "border-slate-300 bg-white"
                  }`} />
                  {label as string}
                </button>
              ))}
            </div>
          </div>
        </div>


      {/* Radar status - intentionally small so the existing map UI is unchanged. */}
      <div className="absolute right-4 bottom-4 z-[1000] rounded-xl border border-white/10 bg-[#07111f]/90 px-3 py-2 text-[10px] text-slate-300 shadow-xl backdrop-blur-xl">
        <div className="flex items-center gap-2">
          <span
            className={`h-2 w-2 rounded-full ${
              radarUrl && !radarError
                ? "bg-emerald-400"
                : "bg-red-400"
            }`}
          />
          <span>
            {radarUrl && !radarError
              ? "Radar ready"
              : "Radar unavailable"}
          </span>
        </div>

        {radarTime && (
          <p className="mt-1 text-[9px] text-slate-500">
            Latest frame:{" "}
            {new Date(radarTime * 1000).toLocaleTimeString([], {
              hour: "2-digit",
              minute: "2-digit",
            })}
          </p>
        )}

        {radarUrl && (
          <p className="mt-1 max-w-[190px] text-[9px] leading-3 text-slate-500">
            If the radar is clear, no colored pixels means no detectable precipitation in that area.
          </p>
        )}
      </div>

      {showIntelligence ? (
        <div className="absolute bottom-4 left-4 z-[1000] w-[260px] rounded-2xl border border-white/10 bg-[#07111f]/90 p-4 text-white shadow-2xl backdrop-blur-xl">
          <div className="flex items-start justify-between gap-3">
            <div>
              <p className="text-[10px] font-medium uppercase tracking-[0.18em] text-cyan-300">
                Weather Intelligence
              </p>

              <p className="mt-1 text-sm font-semibold">
                {locationName}
              </p>
            </div>

            <button
              type="button"
              onClick={() => setShowIntelligence(false)}
              className="rounded-lg px-2 py-1 text-xs text-slate-400 transition hover:bg-white/10 hover:text-white"
              aria-label="Close weather intelligence"
            >
              ✕
            </button>
          </div>

          <div className="mt-4 grid grid-cols-2 gap-2">
            <div className="rounded-xl border border-white/10 bg-white/5 p-3">
              <p className="text-[10px] text-slate-500">
                Temperature
              </p>
              <p className="mt-1 text-sm font-semibold">
                {temperature !== undefined
                  ? `${Math.round(temperature)}°C`
                  : "--"}
              </p>
            </div>

            <div className="rounded-xl border border-white/10 bg-white/5 p-3">
              <p className="text-[10px] text-slate-500">
                Rain Chance
              </p>
              <p className="mt-1 text-sm font-semibold">
                {rainProbability !== undefined
                  ? `${rainProbability}%`
                  : "--"}
              </p>
            </div>

            <div className="rounded-xl border border-white/10 bg-white/5 p-3">
              <p className="text-[10px] text-slate-500">
                Humidity
              </p>
              <p className="mt-1 text-sm font-semibold">
                {humidity !== undefined
                  ? `${humidity}%`
                  : "--"}
              </p>
            </div>

            <div className="rounded-xl border border-white/10 bg-white/5 p-3">
              <p className="text-[10px] text-slate-500">
                Wind
              </p>
              <p className="mt-1 text-sm font-semibold">
                {windSpeed !== undefined
                  ? `${Math.round(windSpeed)} km/h`
                  : "--"}
              </p>
            </div>
          </div>

          <div className="mt-3 rounded-xl border border-white/10 bg-white/5 p-3">
            <div className="flex items-center justify-between">
              <span className="text-xs text-slate-400">
                Risk Level
              </span>

              <span className="text-xs font-bold text-cyan-300">
                {risk.label}
              </span>
            </div>

            <p className="mt-1 text-[11px] leading-5 text-slate-500">
              {risk.description}
            </p>
          </div>

          {alert && (
            <div
              className="mt-3 rounded-xl border p-3"
              style={{
                borderColor: `${alert.color}55`,
                backgroundColor: `${alert.color}12`,
              }}
            >
              <div className="flex items-center justify-between gap-2">
                <span className="text-xs font-semibold text-white">
                  ⚠️ {alert.label}
                </span>
                <span
                  className="text-[10px] font-bold"
                  style={{ color: alert.color }}
                >
                  {alert.level}
                </span>
              </div>
              <p className="mt-1 text-[10px] leading-4 text-slate-400">
                Open Layers → Weather Alerts to view the alert zone.
              </p>
            </div>
          )}

          <p className="mt-3 text-[10px] leading-4 text-slate-600">
            Rain Radar uses RainViewer precipitation frames. Use
            the timeline to replay recent rain movement.
          </p>
        </div>
      ) : (
        <button
          type="button"
          onClick={() => setShowIntelligence(true)}
          className="absolute bottom-4 left-4 z-[1000] rounded-xl border border-white/10 bg-[#07111f]/90 px-3 py-2 text-xs text-white shadow-xl backdrop-blur-xl transition hover:bg-[#0b1728]"
        >
          ☁️ Weather Intelligence
        </button>
      )}
    </div>
  );
}
