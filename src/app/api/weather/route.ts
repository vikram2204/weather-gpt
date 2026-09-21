import { NextRequest, NextResponse } from "next/server";

import {
  buildWeatherAlerts,
  getCurrentWeatherCode,
} from "@/weatherIntelligence";

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);

    const latitude = searchParams.get("latitude");
    const longitude = searchParams.get("longitude");
    const city = searchParams.get("city");

    let lat: number | null = latitude
      ? Number(latitude)
      : null;

    let lon: number | null = longitude
      ? Number(longitude)
      : null;

    let locationName = "Selected location";

    /*
     * CITY SEARCH
     */
    if (city) {
      const geocodingResponse = await fetch(
        `https://geocoding-api.open-meteo.com/v1/search?name=${encodeURIComponent(
          city
        )}&count=1&language=en&format=json`,
        {
          cache: "no-store",
        }
      );

      if (!geocodingResponse.ok) {
        throw new Error("City geocoding failed");
      }

      const geocodingData =
        await geocodingResponse.json();

      const result = geocodingData.results?.[0];

      if (!result) {
        return NextResponse.json(
          {
            error: `Could not find city "${city}"`,
          },
          { status: 404 }
        );
      }

      lat = Number(result.latitude);
      lon = Number(result.longitude);

      locationName =
        result.name ||
        result.admin1 ||
        city;
    }

    if (
      lat === null ||
      lon === null ||
      !Number.isFinite(lat) ||
      !Number.isFinite(lon)
    ) {
      return NextResponse.json(
        {
          error:
            "Provide valid latitude and longitude or a city name.",
        },
        { status: 400 }
      );
    }

    /*
     * OPEN-METEO WEATHER REQUEST
     */
    const weatherUrl =
      "https://api.open-meteo.com/v1/forecast" +
      `?latitude=${lat}` +
      `&longitude=${lon}` +
      "&current=temperature_2m,relative_humidity_2m,wind_speed_10m" +
      "&hourly=temperature_2m,precipitation_probability,relative_humidity_2m,wind_speed_10m,weather_code" +
      "&daily=temperature_2m_max,temperature_2m_min,precipitation_probability_max,weather_code,wind_speed_10m_max" +
      "&timezone=auto" +
      "&forecast_days=7";

    const weatherResponse = await fetch(
      weatherUrl,
      {
        cache: "no-store",
      }
    );

    if (!weatherResponse.ok) {
      throw new Error(
        `Weather API failed: ${weatherResponse.status}`
      );
    }

    const weatherData =
      await weatherResponse.json();

    /*
     * WEATHERGPT INTELLIGENCE ENGINE
     *
     * The forecast provider supplies meteorological data.
     * Our local intelligence engine interprets it into
     * time-aware hazards and user-facing advisories.
     */
    const intelligenceData = {
      current: {
        temperature: Number(weatherData.current?.temperature_2m ?? 0),
        humidity: Number(weatherData.current?.relative_humidity_2m ?? 0),
        wind: Number(weatherData.current?.wind_speed_10m ?? 0),
        weatherCode: Number(weatherData.hourly?.weather_code?.[0] ?? 0),
      },
      hourly: (weatherData.hourly?.time ?? []).map(
        (time: string, index: number) => ({
          time,
          temperature: Number(
            weatherData.hourly.temperature_2m?.[index] ?? 0
          ),
          rainProbability: Number(
            weatherData.hourly.precipitation_probability?.[index] ?? 0
          ),
          humidity: Number(
            weatherData.hourly.relative_humidity_2m?.[index] ?? 0
          ),
          wind: Number(
            weatherData.hourly.wind_speed_10m?.[index] ?? 0
          ),
          weatherCode: Number(
            weatherData.hourly.weather_code?.[index] ?? 0
          ),
        })
      ),
      daily: (weatherData.daily?.time ?? []).map(
        (date: string, index: number) => ({
          date,
          maxTemperature: Number(
            weatherData.daily.temperature_2m_max?.[index] ?? 0
          ),
          minTemperature: Number(
            weatherData.daily.temperature_2m_min?.[index] ?? 0
          ),
          rainProbability: Number(
            weatherData.daily.precipitation_probability_max?.[index] ?? 0
          ),
          weatherCode: Number(
            weatherData.daily.weather_code?.[index] ?? 0
          ),
          maxWind: Number(
            weatherData.daily.wind_speed_10m_max?.[index] ?? 0
          ),
        })
      ),
    };

    const alerts = buildWeatherAlerts(intelligenceData);

    const highestRisk =
      alerts.length > 0
        ? alerts.reduce((highest, alert) => {
            const rank = { low: 0, moderate: 1, high: 2, extreme: 3 };
            return rank[alert.level] > rank[highest]
              ? alert.level
              : highest;
          }, "low" as "low" | "moderate" | "high" | "extreme")
        : "low";

    const alertSummary = {
      highestRisk,
      total: alerts.length,
      hasSevereRisk: alerts.some(
        (alert) =>
          alert.level === "high" || alert.level === "extreme"
      ),
    };

    const currentWeatherCode = getCurrentWeatherCode(intelligenceData);

    return NextResponse.json({
      location: {
        name: locationName,
        latitude: lat,
        longitude: lon,
      },
      weather: weatherData,
      alerts,
      alertSummary,
    });
  } catch (error) {
    console.error("Weather API error:", error);

    return NextResponse.json(
      {
        error:
          "Unable to fetch weather data right now.",
      },
      { status: 500 }
    );
  }
}
