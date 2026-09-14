import { NextRequest, NextResponse } from "next/server";

type ModelForecast = {
  model: string;
  source: string;
  hourly?: {
    time?: string[];
    temperature_2m?: number[];
    precipitation?: number[];
    precipitation_probability?: number[];
    wind_speed_10m?: number[];
  };
  error?: string;
};

async function fetchModel(
  endpoint: string,
  model: string,
  source: string,
  latitude: number,
  longitude: number
): Promise<ModelForecast> {
  const params = new URLSearchParams({
    latitude: String(latitude),
    longitude: String(longitude),
    hourly:
      "temperature_2m,precipitation,precipitation_probability,wind_speed_10m",
    timezone: "auto",
    forecast_days: "7",
  });

  try {
    const response = await fetch(
      `https://api.open-meteo.com/v1/${endpoint}?${params.toString()}`,
      {
        next: { revalidate: 900 },
      }
    );

    if (!response.ok) {
      throw new Error(`HTTP ${response.status}`);
    }

    const data = await response.json();

    return {
      model,
      source,
      hourly: data.hourly,
    };
  } catch (error) {
    console.error(`${model} request failed:`, error);

    return {
      model,
      source,
      error: `Unable to load ${model} forecast.`,
    };
  }
}

function calculateComparison(
  ecmwf: ModelForecast,
  gfs: ModelForecast
) {
  const eTemp = ecmwf.hourly?.temperature_2m ?? [];
  const gTemp = gfs.hourly?.temperature_2m ?? [];

  const eRain = ecmwf.hourly?.precipitation_probability ?? [];
  const gRain = gfs.hourly?.precipitation_probability ?? [];

  const eWind = ecmwf.hourly?.wind_speed_10m ?? [];
  const gWind = gfs.hourly?.wind_speed_10m ?? [];

  const count = Math.min(
    eTemp.length,
    gTemp.length,
    eRain.length,
    gRain.length,
    eWind.length,
    gWind.length,
    24
  );

  if (!count) {
    return {
      hoursCompared: 0,
      temperatureDifference: null,
      rainProbabilityDifference: null,
      windDifference: null,
      agreement: "insufficient-data",
    };
  }

  const average = (values: number[]) =>
    values.reduce((sum, value) => sum + value, 0) / values.length;

  const tempDifference = average(
    Array.from({ length: count }, (_, i) =>
      Math.abs((eTemp[i] ?? 0) - (gTemp[i] ?? 0))
    )
  );

  const rainDifference = average(
    Array.from({ length: count }, (_, i) =>
      Math.abs((eRain[i] ?? 0) - (gRain[i] ?? 0))
    )
  );

  const windDifference = average(
    Array.from({ length: count }, (_, i) =>
      Math.abs((eWind[i] ?? 0) - (gWind[i] ?? 0))
    )
  );

  let agreement = "high";

  if (tempDifference > 3 || rainDifference > 30 || windDifference > 15) {
    agreement = "low";
  } else if (
    tempDifference > 1.5 ||
    rainDifference > 15 ||
    windDifference > 8
  ) {
    agreement = "moderate";
  }

  return {
    hoursCompared: count,
    temperatureDifference: Number(tempDifference.toFixed(1)),
    rainProbabilityDifference: Number(rainDifference.toFixed(1)),
    windDifference: Number(windDifference.toFixed(1)),
    agreement,
  };
}

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);

    const latitude = Number(searchParams.get("latitude"));
    const longitude = Number(searchParams.get("longitude"));

    if (
      !Number.isFinite(latitude) ||
      !Number.isFinite(longitude) ||
      latitude < -90 ||
      latitude > 90 ||
      longitude < -180 ||
      longitude > 180
    ) {
      return NextResponse.json(
        { error: "Valid latitude and longitude are required." },
        { status: 400 }
      );
    }

    const [ecmwf, gfs] = await Promise.all([
      fetchModel(
        "ecmwf",
        "ECMWF IFS HRES",
        "ECMWF / Open-Meteo",
        latitude,
        longitude
      ),
      fetchModel(
        "gfs",
        "NOAA GFS",
        "NOAA / Open-Meteo",
        latitude,
        longitude
      ),
    ]);

    const comparison = calculateComparison(ecmwf, gfs);

    return NextResponse.json({
      success: true,
      location: {
        latitude,
        longitude,
      },
      models: {
        ecmwf,
        gfs,
      },
      comparison,
      generatedAt: new Date().toISOString(),
      note:
        "This is a numerical weather prediction model comparison. It is not an official IMD warning or forecast.",
    });
  } catch (error) {
    console.error("NWP comparison error:", error);

    return NextResponse.json(
      {
        success: false,
        error: "Unable to load NWP model data.",
      },
      { status: 500 }
    );
  }
}
