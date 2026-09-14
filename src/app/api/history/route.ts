import { NextRequest, NextResponse } from "next/server";

const MONTH_NAMES = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
];

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const latitude = Number(searchParams.get("latitude"));
    const longitude = Number(searchParams.get("longitude"));
    const requestedYears = Number(searchParams.get("years") || "5");

    if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) {
      return NextResponse.json(
        { success: false, error: "Valid latitude and longitude are required." },
        { status: 400 }
      );
    }

    const years = Math.min(5, Math.max(1, Math.round(requestedYears)));
    // ERA5/ERA5-Land historical data has about a 5-day availability delay.
    // Keep the requested range fully inside the available archive window.
    const end = new Date();
    end.setUTCDate(end.getUTCDate() - 5);
    const start = new Date(end);
    start.setUTCFullYear(start.getUTCFullYear() - years);

    const formatDate = (date: Date) => date.toISOString().slice(0, 10);
    const startDate = formatDate(start);
    const endDate = formatDate(end);

    const params = new URLSearchParams({
      latitude: latitude.toString(),
      longitude: longitude.toString(),
      start_date: startDate,
      end_date: endDate,
      daily: [
        "temperature_2m_mean",
        "temperature_2m_max",
        "temperature_2m_min",
        "precipitation_sum",
      ].join(","),
      timezone: "auto",
      temperature_unit: "celsius",
      precipitation_unit: "mm",
    });

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 8000);

    let response: Response;
    try {
      response = await fetch(
        `https://archive-api.open-meteo.com/v1/archive?${params.toString()}`,
        {
          next: { revalidate: 21600 },
          signal: controller.signal,
        }
      );
    } finally {
      clearTimeout(timeout);
    }

    if (!response.ok) {
      throw new Error(`Historical API returned ${response.status}`);
    }

    const data = await response.json();
    const times: string[] = data.daily?.time || [];
    const meanTemps: number[] = data.daily?.temperature_2m_mean || [];
    const maxTemps: number[] = data.daily?.temperature_2m_max || [];
    const minTemps: number[] = data.daily?.temperature_2m_min || [];
    const precipitation: number[] = data.daily?.precipitation_sum || [];

    if (!times.length) {
      throw new Error("No historical weather data returned.");
    }

    const valid = times.map((date, index) => ({
      date,
      mean: meanTemps[index],
      max: maxTemps[index],
      min: minTemps[index],
      rain: precipitation[index],
    })).filter((item) =>
      [item.mean, item.max, item.min, item.rain].some(Number.isFinite)
    );

    const average = (values: number[]) => {
      const clean = values.filter(Number.isFinite);
      return clean.length
        ? clean.reduce((sum, value) => sum + value, 0) / clean.length
        : 0;
    };

    const totalRainfall = valid.reduce(
      (sum, item) => sum + (Number.isFinite(item.rain) ? item.rain : 0),
      0
    );

    const averageMaxTemperature = average(valid.map((item) => item.max));
    const averageMinTemperature = average(valid.map((item) => item.min));
    const hottestTemperature = Math.max(
      ...valid.map((item) => item.max).filter(Number.isFinite)
    );

    const yearlyMap = new Map<number, { temps: number[]; rain: number }>();
    const monthlyMap = new Map<number, { temps: number[]; max: number[]; min: number[]; rain: number[] }>();

    valid.forEach((item) => {
      const date = new Date(`${item.date}T12:00:00`);
      const year = date.getFullYear();
      const month = date.getMonth();

      if (!yearlyMap.has(year)) {
        yearlyMap.set(year, { temps: [], rain: 0 });
      }
      const yearly = yearlyMap.get(year)!;
      if (Number.isFinite(item.mean)) yearly.temps.push(item.mean);
      if (Number.isFinite(item.rain)) yearly.rain += item.rain;

      if (!monthlyMap.has(month)) {
        monthlyMap.set(month, { temps: [], max: [], min: [], rain: [] });
      }
      const monthly = monthlyMap.get(month)!;
      if (Number.isFinite(item.mean)) monthly.temps.push(item.mean);
      if (Number.isFinite(item.max)) monthly.max.push(item.max);
      if (Number.isFinite(item.min)) monthly.min.push(item.min);
      if (Number.isFinite(item.rain)) monthly.rain.push(item.rain);
    });

    const yearly = Array.from(yearlyMap.entries())
      .sort(([a], [b]) => a - b)
      .map(([year, value]) => ({
        year,
        averageTemperature: average(value.temps),
        rainfall: value.rain,
      }));

    const monthly = Array.from({ length: 12 }, (_, month) => {
      const value = monthlyMap.get(month);
      const rainfallValues = value?.rain || [];
      const numberOfYears = Math.max(1, yearly.length);
      return {
        month: MONTH_NAMES[month],
        averageTemperature: average(value?.temps || []),
        averageMaxTemperature: average(value?.max || []),
        averageMinTemperature: average(value?.min || []),
        averageRainfall: rainfallValues.reduce((sum, rain) => sum + rain, 0) / numberOfYears,
      };
    });

    const wettest = monthly.reduce(
      (best, item) => item.averageRainfall > best.averageRainfall ? item : best,
      monthly[0]
    );

    return NextResponse.json({
      success: true,
      location: { latitude: data.latitude, longitude: data.longitude },
      period: { start: startDate, end: endDate, years },
      summary: {
        averageMaxTemperature,
        averageMinTemperature,
        totalRainfall,
        hottestTemperature,
        wettestMonth: wettest.month,
        wettestMonthRainfall: wettest.averageRainfall,
      },
      yearly,
      monthly,
      source: "Open-Meteo Historical Weather API / ERA5 reanalysis",
      note: "Historical reanalysis is intended for climate and trend analysis, not as an official IMD observation or warning.",
    });
  } catch (error) {
    console.error("Historical weather API error:", error);
    return NextResponse.json(
      { success: false, error: "Unable to retrieve historical weather data." },
      { status: 500 }
    );
  }
}
