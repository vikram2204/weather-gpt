import { NextRequest, NextResponse } from "next/server";

import {
  answerWeatherQuestion,
  detectIntent,
  buildWeatherAlerts,
  findBestTime,
  findBestDay,
} from "@/weatherIntelligence";

function toNumber(value: unknown, fallback = 0): number {
  const number = Number(value);
  return Number.isFinite(number) ? number : fallback;
}

function mapWeatherToIntelligence(weather: any) {
  const current = weather?.current ?? {};
  const hourly = Array.isArray(weather?.next24Hours)
    ? weather.next24Hours
    : Array.isArray(weather?.hourly)
      ? weather.hourly
      : [];
  const daily = Array.isArray(weather?.sevenDayForecast)
    ? weather.sevenDayForecast
    : Array.isArray(weather?.daily)
      ? weather.daily
      : [];

  return {
    current: {
      temperature: toNumber(
        current.temperature ?? current.temperature_2m
      ),
      humidity: toNumber(
        current.humidity ?? current.relative_humidity_2m
      ),
      wind: toNumber(current.wind ?? current.wind_speed_10m),
      weatherCode: toNumber(
        current.weatherCode ?? current.weather_code
      ),
    },

    hourly: hourly.map((item: any) => ({
      time: item.time,
      temperature: toNumber(
        item.temperature ?? item.temperature_2m
      ),
      rainProbability: toNumber(
        item.rainProbability ??
          item.precipitationProbability ??
          item.precipitation_probability
      ),
      humidity: toNumber(
        item.humidity ?? item.relative_humidity_2m
      ),
      wind: toNumber(
        item.wind ?? item.windSpeed ?? item.wind_speed_10m
      ),
      weatherCode: toNumber(
        item.weatherCode ?? item.weather_code
      ),
    })),

    daily: daily.map((item: any) => ({
      date: item.date ?? item.time,
      maxTemperature: toNumber(
        item.maxTemperature ?? item.temperature_2m_max
      ),
      minTemperature: toNumber(
        item.minTemperature ?? item.temperature_2m_min
      ),
      rainProbability: toNumber(
        item.rainProbability ??
          item.precipitationProbability ??
          item.precipitation_probability_max
      ),
      weatherCode: toNumber(
        item.weatherCode ?? item.weather_code
      ),
      maxWind: toNumber(
        item.maxWind ??
          item.windSpeed ??
          item.wind_speed_10m_max
      ),
    })),
  };
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();

    const question =
      typeof body.question === "string"
        ? body.question.trim()
        : "";

    const weather = body.weather;

    if (!question) {
      return NextResponse.json(
        { error: "Question is required" },
        { status: 400 }
      );
    }

    if (!weather) {
      return NextResponse.json(
        { error: "Weather data is required" },
        { status: 400 }
      );
    }

    const intelligenceData = mapWeatherToIntelligence(weather);

    const answer = answerWeatherQuestion(
      question,
      intelligenceData
    );

    const intent = detectIntent(question);
    const alerts = buildWeatherAlerts(intelligenceData);
    const bestTime = findBestTime(intelligenceData);
    const bestDay = findBestDay(intelligenceData);

    return NextResponse.json({
      answer,
      source: "WeatherGPT Intelligence Engine",
      intent,
      alerts,
      bestTime,
      bestDay,
      ai: false,
    });
  } catch (error) {
    console.error("WeatherGPT Intelligence error:", error);

    return NextResponse.json(
      {
        error: "Weather intelligence engine failed.",
      },
      { status: 500 }
    );
  }
}
