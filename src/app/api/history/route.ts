import { NextRequest, NextResponse } from "next/server";

export const dynamic = "force-dynamic";
export const maxDuration = 30;

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

  /*
   * NASA POWER daily meteorological data is near-real-time rather than
   * guaranteed to contain yesterday's data. NASA documents a typical
   * near-real-time delay of roughly 3-7 days.
   *
   * Therefore, intentionally end the historical range 7 days before today.
   * This avoids production failures caused by requesting dates that have
   * not yet been published by NASA POWER.
   */
  const end = new Date();
  end.setUTCDate(end.getUTCDate() - 7);

  const start = new Date(end);
  start.setUTCFullYear(start.getUTCFullYear() - years);

  const formatDate = (date: Date) =>
    date.toISOString().slice(0, 10).replace(/-/g, "");

  const startDate = formatDate(start);
  const endDate = formatDate(end);

  const apiUrl = new URL(
    "https://power.larc.nasa.gov/api/temporal/daily/point"
  );

  apiUrl.searchParams.set(
    "parameters",
    "T2M,T2M_MAX,T2M_MIN,PRECTOTCORR"
  );
  apiUrl.searchParams.set("community", "SB");
  apiUrl.searchParams.set("longitude", longitude.toFixed(4));
  apiUrl.searchParams.set("latitude", latitude.toFixed(4));
  apiUrl.searchParams.set("start", startDate);
  apiUrl.searchParams.set("end", endDate);
  apiUrl.searchParams.set("format", "JSON");

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 20000);

  try {
    console.log("NASA POWER history request:", apiUrl.toString());

    const response = await fetch(apiUrl.toString(), {
      signal: controller.signal,
      cache: "no-store",
    });

    const responseText = await response.text();

    if (!response.ok) {
      console.error(
        "NASA POWER history error:",
        response.status,
        responseText.slice(0, 2000)
      );

      return NextResponse.json(
        {
          success: false,
          error: "Historical weather provider returned an error.",
          providerStatus: response.status,
          providerResponse: responseText.slice(0, 2000),
          requestedRange: { startDate, endDate, years },
        },
        { status: 502 }
      );
    }

    let data: any;

    try {
      data = JSON.parse(responseText);
    } catch {
      return NextResponse.json(
        {
          success: false,
          error: "Historical weather provider returned invalid JSON.",
          providerResponse: responseText.slice(0, 2000),
          requestedRange: { startDate, endDate, years },
        },
        { status: 502 }
      );
    }

    const parameters = data?.properties?.parameter;

    if (!parameters?.T2M) {
      return NextResponse.json(
        {
          success: false,
          error: "NASA POWER returned no temperature data.",
          providerResponse: data,
          requestedRange: { startDate, endDate, years },
        },
        { status: 502 }
      );
    }

    const dates = Object.keys(parameters.T2M).sort();

    if (!dates.length) {
      return NextResponse.json(
        {
          success: false,
          error: "NASA POWER returned no daily historical data.",
          requestedRange: { startDate, endDate, years },
        },
        { status: 502 }
      );
    }

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

    const average = (values: number[]) =>
      values.length
        ? values.reduce((sum, value) => sum + value, 0) / values.length
        : 0;

    for (const dateKey of dates) {
      const year = Number(dateKey.slice(0, 4));
      const month = Number(dateKey.slice(4, 6));

      const mean = Number(parameters.T2M?.[dateKey]);
      const max = Number(parameters.T2M_MAX?.[dateKey]);
      const min = Number(parameters.T2M_MIN?.[dateKey]);
      const rain = Number(parameters.PRECTOTCORR?.[dateKey]);

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

      if (Number.isFinite(mean)) {
        yearly.temperatures.push(mean);
        monthly.mean.push(mean);
      }

      if (Number.isFinite(max)) {
        monthly.max.push(max);
        hottestTemperature = Math.max(hottestTemperature, max);
      }

      if (Number.isFinite(min)) {
        monthly.min.push(min);
      }

      if (Number.isFinite(rain) && rain >= 0) {
        yearly.rainfall.push(rain);
        monthly.rainfall.push(rain);
        totalRainfall += rain;
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

    const averageMaxTemperature = average(
      dates
        .map((date) => Number(parameters.T2M_MAX?.[date]))
        .filter(Number.isFinite)
    );

    const averageMinTemperature = average(
      dates
        .map((date) => Number(parameters.T2M_MIN?.[date]))
        .filter(Number.isFinite)
    );

    return NextResponse.json({
      success: true,
      location: { latitude, longitude },
      period: {
        startDate: `${startDate.slice(0, 4)}-${startDate.slice(4, 6)}-${startDate.slice(6, 8)}`,
        endDate: `${endDate.slice(0, 4)}-${endDate.slice(4, 6)}-${endDate.slice(6, 8)}`,
        years,
      },
      yearly,
      monthly,
      summary: {
        averageMaxTemperature: Number(averageMaxTemperature.toFixed(1)),
        averageMinTemperature: Number(averageMinTemperature.toFixed(1)),
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
      source: "NASA POWER Daily Meteorological Data",
      note: "Historical climate data is provided for trend analysis and is not an official IMD observation or warning.",
    });
  } catch (error: any) {
    console.error("NASA POWER historical weather error:", error);

    return NextResponse.json(
      {
        success: false,
        error:
          error?.name === "AbortError"
            ? "Historical weather provider timed out."
            : error?.message || "Unable to retrieve historical weather data.",
        errorName: error?.name || "UnknownError",
        requestedRange: { startDate, endDate, years },
      },
      { status: 500 }
    );
  } finally {
    clearTimeout(timeout);
  }
}
