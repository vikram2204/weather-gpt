import { NextRequest, NextResponse } from "next/server";

export const dynamic = "force-dynamic";
export const maxDuration = 30;

type DailyRecord = {
  date: string;
  mean: number;
  max: number;
  min: number;
  rain: number;
};

function average(values: number[]) {
  return values.length
    ? values.reduce((sum, value) => sum + value, 0) / values.length
    : 0;
}

function buildResponse(
  latitude: number,
  longitude: number,
  years: number,
  startDate: string,
  endDate: string,
  records: DailyRecord[],
  source: string,
  note: string
) {
  const yearlyMap = new Map<
    number,
    { temperatures: number[]; rainfall: number[] }
  >();

  const monthlyMap = new Map<
    number,
    { mean: number[]; max: number[]; min: number[]; rainfall: number[] }
  >();

  let hottestTemperature = -Infinity;
  let totalRainfall = 0;

  for (const record of records) {
    const year = Number(record.date.slice(0, 4));
    const month = Number(record.date.slice(5, 7));

    if (!yearlyMap.has(year)) {
      yearlyMap.set(year, { temperatures: [], rainfall: [] });
    }

    if (!monthlyMap.has(month)) {
      monthlyMap.set(month, {
        mean: [],
        max: [],
        min: [],
        rainfall: [],
      });
    }

    const yearly = yearlyMap.get(year)!;
    const monthly = monthlyMap.get(month)!;

    if (Number.isFinite(record.mean)) {
      yearly.temperatures.push(record.mean);
      monthly.mean.push(record.mean);
    }

    if (Number.isFinite(record.max)) {
      monthly.max.push(record.max);
      hottestTemperature = Math.max(hottestTemperature, record.max);
    }

    if (Number.isFinite(record.min)) {
      monthly.min.push(record.min);
    }

    if (Number.isFinite(record.rain) && record.rain >= 0) {
      yearly.rainfall.push(record.rain);
      monthly.rainfall.push(record.rain);
      totalRainfall += record.rain;
    }
  }

  const yearly = Array.from(yearlyMap.entries())
    .sort(([a], [b]) => a - b)
    .map(([year, values]) => ({
      year,
      averageTemperature: Number(
        average(values.temperatures).toFixed(1)
      ),
      rainfall: Number(
        values.rainfall
          .reduce((sum, value) => sum + value, 0)
          .toFixed(1)
      ),
    }));

  const monthNames = [
    "January",
    "February",
    "March",
    "April",
    "May",
    "June",
    "July",
    "August",
    "September",
    "October",
    "November",
    "December",
  ];

  const monthly = Array.from({ length: 12 }, (_, index) => {
    const monthNumber = index + 1;

    const values = monthlyMap.get(monthNumber) || {
      mean: [],
      max: [],
      min: [],
      rainfall: [],
    };

    return {
      month: monthNames[index],
      averageTemperature: Number(average(values.mean).toFixed(1)),
      averageMaxTemperature: Number(average(values.max).toFixed(1)),
      averageMinTemperature: Number(average(values.min).toFixed(1)),
      averageRainfall: Number(average(values.rainfall).toFixed(1)),
    };
  });

  const wettest = monthly.reduce(
    (best, item) =>
      item.averageRainfall > best.averageRainfall ? item : best,
    monthly[0]
  );

  return NextResponse.json({
    success: true,
    location: { latitude, longitude },
    period: {
      startDate,
      endDate,
      years,
    },
    yearly,
    monthly,
    summary: {
      averageMaxTemperature: Number(
        average(records.map((record) => record.max).filter(Number.isFinite)).toFixed(1)
      ),
      averageMinTemperature: Number(
        average(records.map((record) => record.min).filter(Number.isFinite)).toFixed(1)
      ),
      totalRainfall: Number(totalRainfall.toFixed(1)),
      hottestTemperature:
        hottestTemperature === -Infinity
          ? null
          : Number(hottestTemperature.toFixed(1)),
      wettestMonth: wettest?.month ?? null,
      wettestMonthRainfall: wettest
        ? Number(wettest.averageRainfall.toFixed(1))
        : null,
    },
    source,
    note,
  });
}

async function fetchJson(
  url: string,
  timeoutMs = 12000
): Promise<{ ok: boolean; status: number; data: any; text: string }> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const response = await fetch(url, {
      signal: controller.signal,
      cache: "no-store",
      headers: {
        Accept: "application/json",
        "User-Agent": "WeatherGPT/1.0 historical-weather",
      },
    });

    const text = await response.text();

    let data: any = null;
    try {
      data = JSON.parse(text);
    } catch {
      // Keep data null; caller gets the provider text.
    }

    return {
      ok: response.ok,
      status: response.status,
      data,
      text,
    };
  } finally {
    clearTimeout(timeout);
  }
}

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);

  const latitude = Number(searchParams.get("latitude"));
  const longitude = Number(searchParams.get("longitude"));
  const requestedYears = Number(searchParams.get("years") || "1");

  const years = Math.min(
    Math.max(Number.isFinite(requestedYears) ? requestedYears : 1, 1),
    5
  );

  if (
    !Number.isFinite(latitude) ||
    !Number.isFinite(longitude) ||
    latitude < -90 ||
    latitude > 90 ||
    longitude < -180 ||
    longitude > 180
  ) {
    return NextResponse.json(
      { success: false, error: "Valid latitude and longitude are required." },
      { status: 400 }
    );
  }

  // Use a 7-day buffer because NASA POWER near-real-time data can lag
  // by several days.
  const end = new Date();
  end.setUTCDate(end.getUTCDate() - 7);

  const start = new Date(end);
  start.setUTCFullYear(start.getUTCFullYear() - years);

  const isoDate = (date: Date) => date.toISOString().slice(0, 10);

  const startDate = isoDate(start);
  const endDate = isoDate(end);

  /*
   * Provider 1: NASA POWER
   *
   * This is the preferred source because it provides long-term daily
   * meteorological data dating back to 1981.
   */
  const nasaUrl = new URL(
    "https://power.larc.nasa.gov/api/temporal/daily/point"
  );

  nasaUrl.searchParams.set(
    "parameters",
    "T2M,T2M_MAX,T2M_MIN,PRECTOTCORR"
  );
  nasaUrl.searchParams.set("community", "SB");
  nasaUrl.searchParams.set("longitude", longitude.toFixed(4));
  nasaUrl.searchParams.set("latitude", latitude.toFixed(4));
  nasaUrl.searchParams.set("start", startDate.replace(/-/g, ""));
  nasaUrl.searchParams.set("end", endDate.replace(/-/g, ""));
  nasaUrl.searchParams.set("format", "JSON");

  let nasaProviderStatus: number | string = "unavailable";

  try {
    console.log("Historical weather NASA request:", nasaUrl.toString());

    const nasa = await fetchJson(nasaUrl.toString(), 12000);
    nasaProviderStatus = nasa.status;

    if (nasa.ok) {
      const parameters = nasa.data?.properties?.parameter;

      if (parameters?.T2M) {
        const dates = Object.keys(parameters.T2M).sort();

        const records: DailyRecord[] = dates
          .map((dateKey) => ({
            date: `${dateKey.slice(0, 4)}-${dateKey.slice(
              4,
              6
            )}-${dateKey.slice(6, 8)}`,
            mean: Number(parameters.T2M?.[dateKey]),
            max: Number(parameters.T2M_MAX?.[dateKey]),
            min: Number(parameters.T2M_MIN?.[dateKey]),
            rain: Number(parameters.PRECTOTCORR?.[dateKey]),
          }))
          .filter(
            (record) =>
              Number.isFinite(record.mean) ||
              Number.isFinite(record.max) ||
              Number.isFinite(record.min)
          );

        if (records.length) {
          return buildResponse(
            latitude,
            longitude,
            years,
            startDate,
            endDate,
            records,
            "NASA POWER Daily Meteorological Data",
            "Historical climate data is provided for trend analysis and is not an official IMD observation or warning."
          );
        }
      }
    }

    console.warn(
      "NASA POWER unavailable; using Open-Meteo climate fallback.",
      nasa.status,
      nasa.text.slice(0, 500)
    );
  } catch (error) {
    console.warn(
      "NASA POWER request failed; using Open-Meteo climate fallback.",
      error
    );
  }

  /*
   * Provider 2: Open-Meteo Climate API fallback
   *
   * This prevents the History section from failing completely when
   * NASA POWER is temporarily unavailable from a serverless region.
   * The climate API provides daily temperature and precipitation model
   * data and is explicitly intended for long-term climate analysis.
   */
  const climateUrl = new URL(
    "https://climate-api.open-meteo.com/v1/climate"
  );

  climateUrl.searchParams.set("latitude", latitude.toFixed(4));
  climateUrl.searchParams.set("longitude", longitude.toFixed(4));
  climateUrl.searchParams.set("start_date", startDate);
  climateUrl.searchParams.set("end_date", endDate);
  climateUrl.searchParams.set("models", "EC_Earth3P_HR");
  climateUrl.searchParams.set(
    "daily",
    "temperature_2m_mean,temperature_2m_max,temperature_2m_min,precipitation_sum"
  );
  climateUrl.searchParams.set("timezone", "auto");
  climateUrl.searchParams.set("temperature_unit", "celsius");
  climateUrl.searchParams.set("precipitation_unit", "mm");

  try {
    console.log("Historical weather climate fallback:", climateUrl.toString());

    const climate = await fetchJson(climateUrl.toString(), 15000);

    if (!climate.ok) {
      console.error(
        "Open-Meteo climate fallback failed:",
        climate.status,
        climate.text.slice(0, 1500)
      );

      return NextResponse.json(
        {
          success: false,
          error: "Historical weather providers are temporarily unavailable.",
          providers: {
            nasaPower: {
              status: nasaProviderStatus,
            },
            openMeteoClimate: {
              status: climate.status,
              response: climate.text.slice(0, 1000),
            },
          },
          requestedRange: { startDate, endDate, years },
        },
        { status: 502 }
      );
    }

    const daily = climate.data?.daily;

    if (
      !daily?.time ||
      !Array.isArray(daily.time) ||
      !daily.time.length
    ) {
      return NextResponse.json(
        {
          success: false,
          error: "Historical climate provider returned no daily data.",
          requestedRange: { startDate, endDate, years },
        },
        { status: 502 }
      );
    }

    const records: DailyRecord[] = daily.time.map(
      (date: string, index: number) => ({
        date,
        mean: Number(daily.temperature_2m_mean?.[index]),
        max: Number(daily.temperature_2m_max?.[index]),
        min: Number(daily.temperature_2m_min?.[index]),
        rain: Number(daily.precipitation_sum?.[index]),
      })
    );

    return buildResponse(
      latitude,
      longitude,
      years,
      startDate,
      endDate,
      records,
      "Open-Meteo Climate API (EC-Earth3P-HR)",
      "Historical climate data is model-based and provided for trend analysis. It is not an official IMD observation or warning."
    );
  } catch (error: any) {
    console.error("Historical climate fallback error:", error);

    return NextResponse.json(
      {
        success: false,
        error:
          error?.name === "AbortError"
            ? "Historical weather providers timed out."
            : error?.message || "Unable to retrieve historical weather data.",
        errorName: error?.name || "UnknownError",
        requestedRange: { startDate, endDate, years },
      },
      { status: 502 }
    );
  }
}

