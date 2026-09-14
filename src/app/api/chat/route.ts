import { NextRequest, NextResponse } from "next/server";

type WeatherData = {
  location?: {
    name?: string;
    latitude?: number;
    longitude?: number;
  };
  current?: {
    temperature?: number;
    humidity?: number;
    windSpeed?: number;
  };
  next24Hours?: Array<{
    time?: string;
    temperature?: number;
    rainProbability?: number;
    humidity?: number;
    wind?: number;
  }>;
  sevenDayForecast?: Array<{
    date?: string;
    maxTemperature?: number;
    minTemperature?: number;
    rainProbability?: number;
    weatherCode?: number;
    maxWind?: number;
  }>;
  nwpComparison?: {
    agreement?: string;
    temperatureDifference?: number;
    rainProbabilityDifference?: number;
    windDifference?: number;
    ecmwf?: {
      time?: string[];
      temperature_2m?: number[];
      precipitation_probability?: number[];
      wind_speed_10m?: number[];
    };
    gfs?: {
      time?: string[];
      temperature_2m?: number[];
      precipitation_probability?: number[];
      wind_speed_10m?: number[];
    };
  };
};

function getNumber(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function buildReasoningHints(question: string, weather: WeatherData) {
  const q = question.toLowerCase();

  const hourly = Array.isArray(weather?.next24Hours)
    ? weather.next24Hours
    : [];

  const daily = Array.isArray(weather?.sevenDayForecast)
    ? weather.sevenDayForecast
    : [];

  const rainValues = hourly
    .map((h) => getNumber(h.rainProbability))
    .filter((v): v is number => v !== null);

  const temperatureValues = daily
    .map((d) => getNumber(d.maxTemperature))
    .filter((v): v is number => v !== null);

  const windValues = daily
    .map((d) => getNumber(d.maxWind))
    .filter((v): v is number => v !== null);

  const maxRain24h = rainValues.length ? Math.max(...rainValues) : null;
  const maxTemp7d = temperatureValues.length
    ? Math.max(...temperatureValues)
    : null;
  const maxWind7d = windValues.length ? Math.max(...windValues) : null;

  const thunderstormCodes = daily
    .map((d) => getNumber(d.weatherCode))
    .filter((v): v is number => v !== null)
    .filter((code) => [95, 96, 99].includes(code));

  const hints: string[] = [];

  if (
    q.includes("rain") ||
    q.includes("umbrella") ||
    q.includes("walk") ||
    q.includes("outdoor") ||
    q.includes("cricket")
  ) {
    if (maxRain24h !== null) {
      hints.push(
        `For the next 24 hours, the highest supplied precipitation probability is ${maxRain24h}%.`
      );
    }

    if (maxRain24h !== null && maxRain24h >= 60) {
      hints.push("Rain risk is meaningful, so outdoor plans should be treated cautiously.");
    } else if (maxRain24h !== null) {
      hints.push("The supplied precipitation probability does not indicate a high rain risk.");
    }
  }

  if (
    q.includes("travel") ||
    q.includes("trip") ||
    q.includes("journey") ||
    q.includes("drive")
  ) {
    hints.push(
      "For travel questions, weigh rain, thunderstorms, strong wind, and temperature together rather than using temperature alone."
    );
  }

  if (
    q.includes("wear") ||
    q.includes("clothes") ||
    q.includes("dress")
  ) {
    hints.push(
      "For clothing advice, consider the supplied temperature, humidity, rain probability, and wind."
    );
  }

  if (
    q.includes("hot") ||
    q.includes("heat") ||
    q.includes("temperature")
  ) {
    if (maxTemp7d !== null) {
      hints.push(
        `The highest supplied maximum temperature over the 7-day forecast is ${maxTemp7d}°C.`
      );
    }
  }

  if (
    q.includes("storm") ||
    q.includes("thunder") ||
    q.includes("lightning") ||
    q.includes("safe")
  ) {
    if (thunderstormCodes.length > 0) {
      hints.push(
        "At least one supplied forecast day has a thunderstorm-related WMO weather code (95, 96, or 99)."
      );
    } else {
      hints.push(
        "No thunderstorm-related WMO weather code was found in the supplied 7-day forecast."
      );
    }

    if (maxWind7d !== null) {
      hints.push(
        `The highest supplied maximum wind over the 7-day forecast is ${maxWind7d}.`
      );
    }
  }

  if (
    q.includes("best day") ||
    q.includes("best weather") ||
    q.includes("which day")
  ) {
    const scoredDays = daily
      .map((day) => {
        const rain = getNumber(day.rainProbability);
        const temp = getNumber(day.maxTemperature);
        const wind = getNumber(day.maxWind);
        const code = getNumber(day.weatherCode);

        let score = 100;

        if (rain !== null) score -= rain * 0.55;
        if (wind !== null) score -= Math.min(wind, 60) * 0.35;

        if (temp !== null) {
          if (temp >= 40) score -= 30;
          else if (temp >= 37) score -= 15;
          else if (temp >= 34) score -= 5;
        }

        if (code !== null && [95, 96, 99].includes(code)) {
          score -= 35;
        }

        return {
          date: day.date ?? "unknown date",
          score,
        };
      })
      .sort((a, b) => b.score - a.score);

    if (scoredDays.length > 0) {
      hints.push(
        `Based only on the supplied forecast, the strongest candidate for better weather is ${scoredDays[0].date}. Compare the forecast values before making a recommendation.`
      );
    }
  }

  const nwp = weather?.nwpComparison;

  if (nwp) {
    if (nwp.agreement) {
      hints.push(
        `NWP model agreement is ${nwp.agreement}. Treat this as a model-consistency signal, not a guarantee.`
      );
    }

    if (getNumber(nwp.temperatureDifference) !== null) {
      hints.push(
        `ECMWF and GFS temperature guidance differs by about ${nwp.temperatureDifference}°C on average over the comparison period.`
      );
    }

    if (getNumber(nwp.rainProbabilityDifference) !== null) {
      hints.push(
        `ECMWF and GFS rain-probability guidance differs by about ${nwp.rainProbabilityDifference} percentage points on average.`
      );
    }

    if (getNumber(nwp.windDifference) !== null) {
      hints.push(
        `ECMWF and GFS wind guidance differs by about ${nwp.windDifference} km/h on average.`
      );
    }

    if (
      q.includes("nwp") ||
      q.includes("model") ||
      q.includes("confidence") ||
      q.includes("disagree") ||
      q.includes("forecast confidence")
    ) {
      hints.push(
        "For NWP questions, explain which variable has the largest model disagreement and how that affects confidence. Do not claim that one model is always correct."
      );
    }
  }

  if (hints.length === 0) {
    hints.push(
      "Reason from the supplied current, hourly, daily, and NWP forecast data. Compare relevant variables instead of simply repeating them."
    );
  }

  return hints.join("\n");
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();

    const question = body.question;
    const weather: WeatherData = body.weather;
    const language =
      typeof body.language === "string" && body.language.trim()
        ? body.language.trim()
        : "English";

    if (!question) {
      return NextResponse.json(
        { error: "Question is required" },
        { status: 400 }
      );
    }

    const reasoningHints = buildReasoningHints(question, weather);

    const apiKey = process.env.GEMINI_API_KEY;

    if (!apiKey) {
      return NextResponse.json(
        { error: "GEMINI_API_KEY is not configured on the server." },
        { status: 500 }
      );
    }

    const systemPrompt = `
You are WeatherGPT, an AI weather reasoning assistant.

Your job is to INTERPRET supplied meteorological forecast data and turn it into a concise, practical answer.

IMPORTANT RULES:
- Use only the supplied weather data.
- Never invent temperatures, rain probabilities, wind speeds, dates, locations, or warnings.
- The supplied forecast is meteorological data. You are interpreting it, not predicting weather yourself.
- For decisions such as walking, travelling, outdoor sports, umbrellas, or clothing, reason using the relevant forecast variables.
- Compare hours or days when the user asks "when", "which day", or "best".
- Consider rain probability, temperature, wind, humidity, weather codes, and severe-weather signals when relevant.
- If a dangerous condition appears in the supplied data, advise the user to follow official weather warnings.
- Do not guarantee that conditions will be safe or unsafe.
- If the supplied data is insufficient, clearly say that.
- Do not make up official warnings.
- Give a useful, natural answer of about 60-100 words when the question needs explanation.
- For simple yes/no questions, give the conclusion first, then 2-4 short supporting sentences using the supplied weather data.
- Never answer with only a few words unless the user explicitly asks for a one-word or very short answer.
- Give the conclusion first, then the main reasons.
- Use °C for temperature when temperature is provided.
- Be practical and direct.
- Respond entirely in the requested language: ${language}.
- Keep weather values, dates, place names, and technical terms accurate.
- If the requested language is not available, use simple English rather than inventing a translation.

Reasoning hints generated from the supplied data:
${reasoningHints}
`;

    const userPrompt = `
Requested response language:
${language}

Location:
${weather?.location?.name ?? "Unknown"}

Current weather:
${JSON.stringify(weather?.current ?? {})}

Next 24 hours:
${JSON.stringify(weather?.next24Hours ?? [])}

7-day forecast:
${JSON.stringify(weather?.sevenDayForecast ?? [])}

NWP model comparison:
${JSON.stringify(weather?.nwpComparison ?? {})}

User question:
${question}

Answer the question using the supplied forecast. Reason over the data instead of merely listing it.
`;

    const response = await fetch(
      "https://generativelanguage.googleapis.com/v1beta/models/gemini-3.5-flash:generateContent",
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-goog-api-key": apiKey,
        },
        body: JSON.stringify({
          systemInstruction: {
            parts: [{ text: systemPrompt }],
          },
          contents: [
            {
              role: "user",
              parts: [{ text: userPrompt }],
            },
          ],
          generationConfig: {
            temperature: 0.35,
            maxOutputTokens: 400,
          },
        }),
      }
    );

    if (!response.ok) {
      const errorText = await response.text();
      console.error("Gemini API error:", response.status, errorText);
      return NextResponse.json(
        {
          error: "Gemini API request failed.",
          geminiStatus: response.status,
          geminiResponse: errorText,
        },
        { status: 502 }
      );
    }

    const data = await response.json();
    const answer = data.candidates?.[0]?.content?.parts
      ?.map((part: { text?: string }) => part.text || "")
      .join(" ")
      .trim();

    return NextResponse.json({
      answer: answer || "I couldn't generate a weather answer.",
    });
  } catch (error) {
    console.error("Gemini error:", error);

    return NextResponse.json(
      {
        error: "Cloud AI service failed. Please try again.",
      },
      { status: 500 }
    );
  }
}
