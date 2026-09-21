/**
 * WeatherGPT Intelligence Engine
 * --------------------------------
 * Deterministic weather reasoning layer.
 *
 * This module does NOT predict weather.
 * It interprets supplied forecast data and produces:
 * - time-aware hazards
 * - alerts
 * - weather scores
 * - best time/day
 * - activity recommendations
 * - simple question intent detection
 * - rule-based natural-language answers
 *
 * No LLM, API key, or token is required.
 */

export type WeatherCode = number;

export type HourlyWeatherPoint = {
  time: string;
  temperature: number;
  rainProbability: number;
  humidity: number;
  wind: number;
  weatherCode?: number;
};

export type DailyWeatherPoint = {
  date: string;
  maxTemperature: number;
  minTemperature: number;
  rainProbability: number;
  weatherCode: number;
  maxWind: number;
};

export type IntelligenceWeatherData = {
  current: {
    temperature: number;
    humidity: number;
    wind: number;
    weatherCode?: number;
  };
  hourly: HourlyWeatherPoint[];
  daily: DailyWeatherPoint[];
};

export type HazardType =
  | "rain"
  | "thunderstorm"
  | "heat"
  | "wind"
  | "fog"
  | "snow"
  | "multiple";

export type HazardSeverity = "low" | "moderate" | "high" | "extreme";

export type WeatherHazard = {
  type: HazardType;
  severity: HazardSeverity;
  title: string;
  message: string;
  startTime?: string;
  endTime?: string;
  hoursAffected: number;
  score: number;
};

export type WeatherAlert = {
  level: HazardSeverity;
  title: string;
  message: string;
  startTime?: string;
  endTime?: string;
  source: "WeatherGPT Intelligence Engine";
  hazard: HazardType;
};

export type WeatherScore = {
  score: number;
  label: "Poor" | "Fair" | "Good" | "Excellent";
  factors: {
    rain: number;
    temperature: number;
    wind: number;
    storm: number;
    humidity: number;
  };
};

export type WeatherIntent =
  | "rain"
  | "umbrella"
  | "walk"
  | "outdoor"
  | "travel"
  | "clothing"
  | "temperature"
  | "wind"
  | "storm"
  | "best_time"
  | "best_day"
  | "forecast"
  | "alerts"
  | "general";

const THUNDERSTORM_CODES = new Set([95, 96, 99]);
const FOG_CODES = new Set([45, 48]);
const SNOW_CODES = new Set([71, 73, 75, 77, 85, 86]);
const RAIN_CODES = new Set([51, 53, 55, 56, 57, 61, 63, 65, 66, 67]);
const SHOWER_CODES = new Set([80, 81, 82]);

function clamp(value: number, min = 0, max = 100) {
  return Math.max(min, Math.min(max, value));
}

function safeNumber(value: unknown, fallback = 0) {
  return Number.isFinite(Number(value)) ? Number(value) : fallback;
}

function formatTime(time?: string) {
  if (!time) return "";
  const date = new Date(time);
  if (Number.isNaN(date.getTime())) return time;

  return date.toLocaleTimeString("en-US", {
    hour: "numeric",
    minute: "2-digit",
  });
}

function getCondition(code: number) {
  if (code === 0) return "Clear sky";
  if (code <= 3) return "Partly cloudy";
  if (code <= 48) return "Foggy";
  if (code <= 67) return "Rain";
  if (code <= 77) return "Snow";
  if (code <= 82) return "Rain showers";
  if (code >= 95) return "Thunderstorm";
  return "Cloudy";
}

/**
 * Returns the weather condition for the actual current forecast hour.
 * This intentionally does NOT use daily.weather_code[0].
 */
export function getCurrentWeatherCode(data: IntelligenceWeatherData) {
  if (Number.isFinite(data.current.weatherCode)) {
    return Number(data.current.weatherCode);
  }

  return Number.isFinite(data.hourly?.[0]?.weatherCode)
    ? Number(data.hourly[0].weatherCode)
    : 0;
}

export function getCurrentCondition(data: IntelligenceWeatherData) {
  return getCondition(getCurrentWeatherCode(data));
}

/**
 * Detect hazards hour-by-hour.
 * This is deliberately time-aware: a storm at 6 PM does not become
 * a "current thunderstorm" alert at 2 PM.
 */
export function detectHazards(data: IntelligenceWeatherData): WeatherHazard[] {
  const hazards: WeatherHazard[] = [];

  const hourly = Array.isArray(data.hourly) ? data.hourly : [];

  let rainStart: string | undefined;
  let rainEnd: string | undefined;
  let rainHours = 0;
  let maxRain = 0;

  let stormStart: string | undefined;
  let stormEnd: string | undefined;
  let stormHours = 0;

  let fogStart: string | undefined;
  let fogEnd: string | undefined;
  let fogHours = 0;

  let snowStart: string | undefined;
  let snowEnd: string | undefined;
  let snowHours = 0;

  let maxWind = 0;
  let maxWindTime: string | undefined;
  let maxTemperature = data.current.temperature;
  let maxTemperatureTime: string | undefined;

  for (const point of hourly) {
    const code = safeNumber(point.weatherCode);
    const rain = safeNumber(point.rainProbability);
    const wind = safeNumber(point.wind);
    const temperature = safeNumber(point.temperature);

    if (rain >= 60 || RAIN_CODES.has(code) || SHOWER_CODES.has(code)) {
      rainHours += 1;
      maxRain = Math.max(maxRain, rain);
      if (!rainStart) rainStart = point.time;
      rainEnd = point.time;
    }

    if (THUNDERSTORM_CODES.has(code)) {
      stormHours += 1;
      if (!stormStart) stormStart = point.time;
      stormEnd = point.time;
    }

    if (FOG_CODES.has(code)) {
      fogHours += 1;
      if (!fogStart) fogStart = point.time;
      fogEnd = point.time;
    }

    if (SNOW_CODES.has(code)) {
      snowHours += 1;
      if (!snowStart) snowStart = point.time;
      snowEnd = point.time;
    }

    if (wind > maxWind) {
      maxWind = wind;
      maxWindTime = point.time;
    }

    if (temperature > maxTemperature) {
      maxTemperature = temperature;
      maxTemperatureTime = point.time;
    }
  }

  if (rainHours > 0) {
    const severity: HazardSeverity =
      maxRain >= 90 ? "high" : maxRain >= 75 ? "moderate" : "low";

    hazards.push({
      type: "rain",
      severity,
      title: maxRain >= 75 ? "Rain expected" : "Chance of rain",
      message:
        `Rain risk reaches ${Math.round(maxRain)}%` +
        (rainStart ? ` around ${formatTime(rainStart)}` : "."),
      startTime: rainStart,
      endTime: rainEnd,
      hoursAffected: rainHours,
      score: clamp(maxRain),
    });
  }

  if (stormHours > 0) {
    hazards.push({
      type: "thunderstorm",
      severity: stormHours >= 3 ? "high" : "moderate",
      title: "Thunderstorm expected",
      message:
        "Thunderstorm conditions are present in the forecast" +
        (stormStart ? ` around ${formatTime(stormStart)}` : "."),
      startTime: stormStart,
      endTime: stormEnd,
      hoursAffected: stormHours,
      score: clamp(75 + stormHours * 5),
    });
  }

  if (fogHours > 0) {
    hazards.push({
      type: "fog",
      severity: fogHours >= 3 ? "moderate" : "low",
      title: "Fog expected",
      message: "Foggy conditions may reduce visibility.",
      startTime: fogStart,
      endTime: fogEnd,
      hoursAffected: fogHours,
      score: clamp(50 + fogHours * 8),
    });
  }

  if (snowHours > 0) {
    hazards.push({
      type: "snow",
      severity: "moderate",
      title: "Snow expected",
      message: "Snow is present in the supplied hourly forecast.",
      startTime: snowStart,
      endTime: snowEnd,
      hoursAffected: snowHours,
      score: clamp(60 + snowHours * 5),
    });
  }

  if (maxTemperature >= 40) {
    hazards.push({
      type: "heat",
      severity: "extreme",
      title: "Extreme heat",
      message:
        `Temperature may reach ${Math.round(maxTemperature)}°C` +
        (maxTemperatureTime ? ` around ${formatTime(maxTemperatureTime)}.` : "."),
      startTime: maxTemperatureTime,
      hoursAffected: 1,
      score: 100,
    });
  } else if (maxTemperature >= 37) {
    hazards.push({
      type: "heat",
      severity: "high",
      title: "High heat",
      message:
        `Temperature may reach ${Math.round(maxTemperature)}°C` +
        (maxTemperatureTime ? ` around ${formatTime(maxTemperatureTime)}.` : "."),
      startTime: maxTemperatureTime,
      hoursAffected: 1,
      score: 80,
    });
  }

  if (maxWind >= 60) {
    hazards.push({
      type: "wind",
      severity: "extreme",
      title: "Very strong winds",
      message:
        `Wind may reach ${Math.round(maxWind)} km/h` +
        (maxWindTime ? ` around ${formatTime(maxWindTime)}.` : "."),
      startTime: maxWindTime,
      hoursAffected: 1,
      score: 100,
    });
  } else if (maxWind >= 40) {
    hazards.push({
      type: "wind",
      severity: "high",
      title: "Strong winds",
      message:
        `Wind may reach ${Math.round(maxWind)} km/h` +
        (maxWindTime ? ` around ${formatTime(maxWindTime)}.` : "."),
      startTime: maxWindTime,
      hoursAffected: 1,
      score: 75,
    });
  }

  return hazards.sort((a, b) => b.score - a.score);
}

export function buildWeatherAlerts(
  data: IntelligenceWeatherData
): WeatherAlert[] {
  const hazards = detectHazards(data);

  return hazards.map((hazard) => {
    const timing =
      hazard.startTime && hazard.endTime
        ? `${formatTime(hazard.startTime)}–${formatTime(hazard.endTime)}`
        : hazard.startTime
          ? `around ${formatTime(hazard.startTime)}`
          : "";

    const message = timing
      ? `${hazard.message} Forecast window: ${timing}.`
      : hazard.message;

    return {
      level: hazard.severity,
      title: hazard.title,
      message,
      startTime: hazard.startTime,
      endTime: hazard.endTime,
      source: "WeatherGPT Intelligence Engine",
      hazard: hazard.type,
    };
  });
}

/**
 * Score a single hour for general outdoor activity.
 */
export function scoreHour(point: HourlyWeatherPoint): WeatherScore {
  const temperature = safeNumber(point.temperature);
  const rain = safeNumber(point.rainProbability);
  const wind = safeNumber(point.wind);
  const humidity = safeNumber(point.humidity);
  const code = safeNumber(point.weatherCode);

  const rainScore = clamp(100 - rain);

  let temperatureScore = 100;
  if (temperature < 10) temperatureScore = clamp(temperature * 5);
  else if (temperature <= 30) temperatureScore = 100;
  else if (temperature <= 34) temperatureScore = 85;
  else if (temperature <= 37) temperatureScore = 65;
  else if (temperature <= 40) temperatureScore = 40;
  else temperatureScore = 10;

  const windScore =
    wind >= 60 ? 10 : wind >= 40 ? 35 : wind >= 30 ? 65 : 95;

  const stormScore = THUNDERSTORM_CODES.has(code) ? 0 : 100;

  let humidityScore = 100;
  if (humidity >= 90) humidityScore = 45;
  else if (humidity >= 80) humidityScore = 65;
  else if (humidity >= 70) humidityScore = 80;

  const score = Math.round(
    rainScore * 0.35 +
      temperatureScore * 0.25 +
      windScore * 0.15 +
      stormScore * 0.15 +
      humidityScore * 0.1
  );

  const label =
    score >= 85
      ? "Excellent"
      : score >= 70
        ? "Good"
        : score >= 50
          ? "Fair"
          : "Poor";

  return {
    score,
    label,
    factors: {
      rain: Math.round(rainScore),
      temperature: Math.round(temperatureScore),
      wind: Math.round(windScore),
      storm: Math.round(stormScore),
      humidity: Math.round(humidityScore),
    },
  };
}

export function findBestTime(
  data: IntelligenceWeatherData,
  fromIndex = 0,
  toIndex = 24
) {
  const candidates = data.hourly
    .slice(fromIndex, Math.min(toIndex, data.hourly.length))
    .map((point, offset) => ({
      ...point,
      originalIndex: fromIndex + offset,
      result: scoreHour(point),
    }))
    .sort((a, b) => b.result.score - a.result.score);

  return candidates[0] ?? null;
}

export function scoreDay(day: DailyWeatherPoint) {
  const rainScore = clamp(100 - safeNumber(day.rainProbability));

  const temperature = safeNumber(day.maxTemperature);
  const temperatureScore =
    temperature >= 40
      ? 10
      : temperature >= 37
        ? 40
        : temperature >= 34
          ? 70
          : temperature >= 18 && temperature <= 32
            ? 100
            : 80;

  const wind = safeNumber(day.maxWind);
  const windScore =
    wind >= 60 ? 10 : wind >= 40 ? 35 : wind >= 30 ? 65 : 95;

  const stormScore = THUNDERSTORM_CODES.has(day.weatherCode) ? 0 : 100;

  const score = Math.round(
    rainScore * 0.4 +
      temperatureScore * 0.3 +
      windScore * 0.15 +
      stormScore * 0.15
  );

  return {
    score,
    label:
      score >= 85
        ? "Excellent"
        : score >= 70
          ? "Good"
          : score >= 50
            ? "Fair"
            : "Poor",
  };
}

export function findBestDay(data: IntelligenceWeatherData) {
  return data.daily
    .map((day) => ({
      ...day,
      result: scoreDay(day),
    }))
    .sort((a, b) => b.result.score - a.result.score)[0] ?? null;
}

export function detectIntent(question: string): WeatherIntent {
  const q = question.toLowerCase();

  if (
    q.includes("best time") ||
    q.includes("best hour") ||
    q.includes("when should")
  )
    return "best_time";

  if (
    q.includes("best day") ||
    q.includes("which day") ||
    q.includes("best weather")
  )
    return "best_day";

  if (q.includes("umbrella")) return "umbrella";

  if (
    q.includes("rain") ||
    q.includes("raining") ||
    q.includes("precip")
  )
    return "rain";

  if (
    q.includes("walk") ||
    q.includes("outdoor") ||
    q.includes("cricket") ||
    q.includes("run") ||
    q.includes("exercise")
  )
    return "outdoor";

  if (
    q.includes("travel") ||
    q.includes("trip") ||
    q.includes("journey") ||
    q.includes("drive")
  )
    return "travel";

  if (
    q.includes("wear") ||
    q.includes("clothes") ||
    q.includes("dress")
  )
    return "clothing";

  if (
    q.includes("storm") ||
    q.includes("thunder") ||
    q.includes("lightning")
  )
    return "storm";

  if (q.includes("wind")) return "wind";

  if (
    q.includes("temperature") ||
    q.includes("hot") ||
    q.includes("cold")
  )
    return "temperature";

  if (
    q.includes("alert") ||
    q.includes("warning") ||
    q.includes("danger")
  )
    return "alerts";

  if (
    q.includes("forecast") ||
    q.includes("weather")
  )
    return "forecast";

  return "general";
}

/**
 * Generates a useful answer without an LLM.
 * The wording is intentionally conservative: it only claims what
 * the supplied weather data supports.
 */
export function answerWeatherQuestion(
  question: string,
  data: IntelligenceWeatherData
) {
  const intent = detectIntent(question);
  const alerts = buildWeatherAlerts(data);

  switch (intent) {
    case "rain": {
      const best = data.hourly
        .slice(0, 24)
        .reduce(
          (max, point) =>
            safeNumber(point.rainProbability) >
            safeNumber(max?.rainProbability)
              ? point
              : max,
          data.hourly[0]
        );

      if (!best) return "I don't have enough hourly forecast data.";

      const rain = Math.round(best.rainProbability);
      if (rain >= 80)
        return `Rain risk is high, reaching about ${rain}% around ${formatTime(best.time)}.`;
      if (rain >= 60)
        return `There is a meaningful chance of rain, reaching about ${rain}% around ${formatTime(best.time)}.`;
      return `Rain risk looks relatively low over the next 24 hours, with the highest supplied chance around ${rain}%.`;
    }

    case "umbrella": {
      const rain = Math.max(
        ...data.hourly.slice(0, 24).map((p) => safeNumber(p.rainProbability))
      );
      return rain >= 60
        ? `An umbrella would be sensible today because rain probability reaches ${Math.round(rain)}% in the next 24 hours.`
        : `An umbrella does not look essential based on the supplied forecast; the highest rain probability is about ${Math.round(rain)}%.`;
    }

    case "outdoor": {
      const best = findBestTime(data);
      if (!best) return "I don't have enough hourly forecast data.";

      return `The most favorable available time for an outdoor activity is around ${formatTime(best.time)}, with an outdoor score of ${best.result.score}/100 (${best.result.label}).`;
    }

    case "travel": {
      const severe = alerts.filter((a) =>
        ["high", "extreme"].includes(a.level)
      );

      if (severe.length > 0)
        return `Travel conditions need caution because the forecast includes ${severe[0].title.toLowerCase()}. Check the timing above before travelling.`;

      const best = findBestTime(data);
      return best
        ? `No major weather hazard is detected in the supplied forecast. A relatively favorable period is around ${formatTime(best.time)}.`
        : "No major weather hazard is detected, but I need more hourly data to suggest a time.";
    }

    case "clothing": {
      const temperature = Math.round(data.current.temperature);
      if (temperature >= 37)
        return `It's around ${temperature}°C now. Lightweight, breathable clothing is more suitable, and staying hydrated is important.`;
      if (temperature <= 18)
        return `It's around ${temperature}°C now. Light warm clothing would be more comfortable.`;
      return `It's around ${temperature}°C now. Light, comfortable clothing should be suitable based on the current conditions.`;
    }

    case "storm": {
      const storm = alerts.find((a) => a.hazard === "thunderstorm");
      return storm
        ? `${storm.title}: ${storm.message}`
        : "No thunderstorm-related condition is detected in the supplied hourly forecast.";
    }

    case "wind":
      return `Current wind is about ${Math.round(data.current.wind)} km/h. The strongest supplied hourly wind is ${Math.round(
        Math.max(...data.hourly.map((p) => safeNumber(p.wind)))
      )} km/h.`;

    case "temperature":
      return `The current temperature is around ${Math.round(data.current.temperature)}°C. Today's forecast range is ${Math.round(
        data.daily[0]?.minTemperature ?? data.current.temperature
      )}°C to ${Math.round(
        data.daily[0]?.maxTemperature ?? data.current.temperature
      )}°C.`;

    case "best_time": {
      const best = findBestTime(data);
      return best
        ? `${formatTime(best.time)} currently scores best for general outdoor conditions at ${best.result.score}/100 (${best.result.label}).`
        : "I don't have enough hourly data to calculate the best time.";
    }

    case "best_day": {
      const best = findBestDay(data);
      return best
        ? `${best.date} has the highest general weather score at ${best.result.score}/100 (${best.result.label}) based on rain, temperature, wind and thunderstorm risk.`
        : "I don't have enough daily forecast data.";
    }

    case "alerts":
      return alerts.length
        ? alerts
            .slice(0, 3)
            .map((a) => `• ${a.title}: ${a.message}`)
            .join("\n")
        : "No significant weather hazards were detected in the supplied forecast.";

    case "forecast":
      return `${getCurrentCondition(data)} currently at about ${Math.round(
        data.current.temperature
      )}°C. The forecast engine is also checking rain, storms, wind, heat and fog across the upcoming hours.`;

    default:
      return `${getCurrentCondition(data)} currently at about ${Math.round(
        data.current.temperature
      )}°C. Ask me about rain, travel, outdoor activities, clothing, alerts, the best time, or the best day.`;
  }
}
