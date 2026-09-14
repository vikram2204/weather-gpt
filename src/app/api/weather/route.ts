import { NextRequest, NextResponse } from "next/server";

type AlertLevel = "moderate" | "high" | "extreme";

type WeatherAlert = {
  level: AlertLevel;
  title: string;
  message: string;
  day?: string;
  value?: number;
};

function levelRank(level: AlertLevel) {
  return {
    moderate: 1,
    high: 2,
    extreme: 3,
  }[level];
}

function addAlert(
  alerts: WeatherAlert[],
  alert: WeatherAlert
) {
  const alreadyExists = alerts.some(
    (item) => item.title === alert.title
  );

  if (!alreadyExists) {
    alerts.push(alert);
  }
}

function buildAlerts(weather: any): WeatherAlert[] {
  const alerts: WeatherAlert[] = [];

  const currentTemperature = Number(
    weather.current?.temperature_2m ?? 0
  );
  const currentWind = Number(
    weather.current?.wind_speed_10m ?? 0
  );

  const daily = weather.daily ?? {};

  const dates: string[] = daily.time ?? [];
  const maxTemperatures: number[] =
    daily.temperature_2m_max ?? [];
  const rainProbabilities: number[] =
    daily.precipitation_probability_max ?? [];
  const weatherCodes: number[] =
    daily.weather_code ?? [];
  const maxWinds: number[] =
    daily.wind_speed_10m_max ?? [];

  /*
   * WMO weather codes used by Open-Meteo:
   * 61/63/65 = rain
   * 80/81/82 = rain showers
   * 95/96/99 = thunderstorm
   * 45/48 = fog
   */
  const isHeavyRainCode = (code: number) =>
    code === 65 || code === 82;

  const isThunderstormCode = (code: number) =>
    code >= 95;

  let severeConditions = 0;

  dates.forEach((date, index) => {
    const maxTemp = Number(maxTemperatures[index] ?? 0);
    const rainProbability = Number(
      rainProbabilities[index] ?? 0
    );
    const weatherCode = Number(
      weatherCodes[index] ?? 0
    );
    const maxWind = Number(maxWinds[index] ?? 0);

    const isToday = index === 0;

    /*
     * EXTREME HEAT
     */
    if (maxTemp >= 40) {
      severeConditions++;

      addAlert(alerts, {
        level: "extreme",
        title: "Extreme Heat Risk",
        message:
          `Maximum temperature may reach ${Math.round(
            maxTemp
          )}°C. Avoid prolonged outdoor exposure, stay hydrated, and follow official heat warnings.`,
        day: date,
        value: maxTemp,
      });
    } else if (maxTemp >= 37) {
      severeConditions++;

      addAlert(alerts, {
        level: "high",
        title: "High Heat Risk",
        message:
          `Maximum temperature may reach ${Math.round(
            maxTemp
          )}°C. Reduce strenuous outdoor activity and stay hydrated.`,
        day: date,
        value: maxTemp,
      });
    }

    /*
     * HEAVY RAIN
     */
    if (rainProbability >= 80 || isHeavyRainCode(weatherCode)) {
      severeConditions++;

      addAlert(alerts, {
        level: rainProbability >= 80 ? "high" : "moderate",
        title: "Heavy Rain Possible",
        message:
          `Rain probability is ${Math.round(
            rainProbability
          )}%. Heavy rainfall conditions are possible; allow extra travel time and watch for local flooding.`,
        day: date,
        value: rainProbability,
      });
    } else if (rainProbability >= 60) {
      addAlert(alerts, {
        level: "moderate",
        title: "Rain Likely",
        message:
          `Rain probability is ${Math.round(
            rainProbability
          )}%. Consider carrying an umbrella and plan outdoor activities accordingly.`,
        day: date,
        value: rainProbability,
      });
    }

    /*
     * THUNDERSTORM
     */
    if (isThunderstormCode(weatherCode)) {
      severeConditions++;

      addAlert(alerts, {
        level: weatherCode >= 96 ? "extreme" : "high",
        title: "Thunderstorm Risk",
        message:
          "Thunderstorm activity is indicated in the forecast. Avoid exposed outdoor areas and follow official warnings.",
        day: date,
        value: weatherCode,
      });
    }

    /*
     * STRONG WIND
     */
    if (maxWind >= 60) {
      severeConditions++;

      addAlert(alerts, {
        level: "extreme",
        title: "Extreme Wind Risk",
        message:
          `Maximum wind speed may reach ${Math.round(
            maxWind
          )} km/h. Secure loose objects and avoid exposed areas.`,
        day: date,
        value: maxWind,
      });
    } else if (maxWind >= 40) {
      severeConditions++;

      addAlert(alerts, {
        level: "high",
        title: "Strong Wind",
        message:
          `Maximum wind speed may reach ${Math.round(
            maxWind
          )} km/h. Use caution around trees, structures, and open areas.`,
        day: date,
        value: maxWind,
      });
    }

    /*
     * FOG
     */
    if (weatherCode === 45 || weatherCode === 48) {
      addAlert(alerts, {
        level: "moderate",
        title: "Reduced Visibility",
        message:
          "Fog may reduce visibility. Use extra caution while driving and allow additional travel time.",
        day: date,
        value: weatherCode,
      });
    }

    /*
     * HIGH-RISK COMBINATION
     *
     * If multiple independent severe signals appear on the same
     * day, add a combined advisory. This is not a meteorological
     * warning by itself; it is WeatherGPT's impact-oriented signal.
     */
    const severeSignals = [
      maxTemp >= 37,
      rainProbability >= 60,
      isThunderstormCode(weatherCode),
      maxWind >= 40,
    ].filter(Boolean).length;

    if (severeSignals >= 2) {
      addAlert(alerts, {
        level:
          severeSignals >= 3 || maxTemp >= 40
            ? "extreme"
            : "high",
        title: "Multiple Weather Hazards",
        message:
          "More than one significant weather factor is present in the forecast. Outdoor activities and travel should be planned carefully, with official warnings taking priority.",
        day: date,
      });
    }

    /*
     * Today's immediate severe signal.
     */
    if (
      isToday &&
      (currentTemperature >= 40 || currentWind >= 60)
    ) {
      addAlert(alerts, {
        level: "extreme",
        title: "Immediate Weather Risk",
        message:
          "Current conditions are already at a severe threshold. Follow local official weather guidance and avoid unnecessary exposure.",
      });
    }
  });

  alerts.sort(
    (a, b) =>
      levelRank(b.level) - levelRank(a.level)
  );

  return alerts;
}

function buildAlertSummary(alerts: WeatherAlert[]) {
  const highestRisk =
    alerts.length > 0
      ? alerts[0].level
      : "low";

  return {
    highestRisk,
    total: alerts.length,
    hasSevereRisk: alerts.some(
      (alert) =>
        alert.level === "high" ||
        alert.level === "extreme"
    ),
  };
}

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
     * ADVANCED ALERT ENGINE
     */
    const alerts = buildAlerts(weatherData);
    const alertSummary =
      buildAlertSummary(alerts);

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
