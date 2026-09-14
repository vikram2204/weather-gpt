"use client";

import dynamic from "next/dynamic";
import { useEffect, useState } from "react";

const WeatherMap = dynamic(
  () => import("./components/WeatherMap"),
  {
    ssr: false,
  }
);

type Alert = {
  level: "moderate" | "high" | "extreme";
  title: string;
  message: string;
};

type IMDOfficialData = {
  success: boolean;
  official?: boolean;
  region?: string;
  warningTypes?: string[];
  availableDates?: string[];
  sourceUrl?: string;
  error?: string;
};

type WeatherData = {
  current: {
    temperature_2m: number;
    relative_humidity_2m: number;
    wind_speed_10m: number;
  };

  hourly: {
    time: string[];
    temperature_2m: number[];
    precipitation_probability: number[];
    relative_humidity_2m: number[];
    wind_speed_10m: number[];
  };

  daily: {
    time: string[];
    temperature_2m_max: number[];
    temperature_2m_min: number[];
    precipitation_probability_max: number[];
    weather_code: number[];
    wind_speed_10m_max: number[];
  };

  timezone: string;
};

type HistoricalData = {
  success: boolean;
  location: { latitude: number; longitude: number };
  period: { start: string; end: string; years: number };
  summary: {
    averageMaxTemperature: number;
    averageMinTemperature: number;
    totalRainfall: number;
    hottestTemperature: number;
    wettestMonth: string;
    wettestMonthRainfall: number;
  };
  yearly: { year: number; averageTemperature: number; rainfall: number }[];
  monthly: {
    month: string;
    averageTemperature: number;
    averageMaxTemperature: number;
    averageMinTemperature: number;
    averageRainfall: number;
  }[];
};

export default function Home() {
  const [weather, setWeather] = useState<WeatherData | null>(null);
  const [alerts, setAlerts] = useState<Alert[]>([]);
  const [imdOfficial, setImdOfficial] =
    useState<IMDOfficialData | null>(null);

  const [location, setLocation] = useState("Hyderabad");
  const [latitude, setLatitude] = useState(17.385);
  const [longitude, setLongitude] = useState(78.4867);

  const [city, setCity] = useState("");

  const [question, setQuestion] = useState("");
  const [answer, setAnswer] = useState("");

  const [selectedLanguage, setSelectedLanguage] = useState("English");

  const [loading, setLoading] = useState(true);
  const [aiLoading, setAiLoading] = useState(false);

  const [searchError, setSearchError] = useState("");
  const [isListening, setIsListening] = useState(false);

  const [nwpLoading, setNwpLoading] = useState(false);
  const [nwpData, setNwpData] = useState<any>(null);
  const [nwpError, setNwpError] = useState("");
  const [nwpInsight, setNwpInsight] = useState("");
  const [nwpInsightLoading, setNwpInsightLoading] = useState(false);
  const [forecastConfidence, setForecastConfidence] = useState<{
    score: number;
    label: string;
    nwpScore: number;
    rainScore: number;
    tempScore: number;
    windScore: number;
    horizonScore: number;
    severeScore: number;
  } | null>(null);

  const [historicalData, setHistoricalData] =
    useState<HistoricalData | null>(null);
  const [historicalYears, setHistoricalYears] = useState(5);
  const [historicalLoading, setHistoricalLoading] = useState(false);
  const [historicalError, setHistoricalError] = useState("");

  const [impactAdvisory, setImpactAdvisory] = useState("");
  const [impactAdvisoryLoading, setImpactAdvisoryLoading] = useState(false);

  useEffect(() => {
    loadWeatherByCoordinates(17.385, 78.4867);
  }, []);

  async function loadHistoricalWeather(
    lat: number,
    lon: number,
    years = historicalYears
  ) {
    try {
      setHistoricalLoading(true);
      setHistoricalError("");

      const response = await fetch(
        `/api/history?latitude=${lat}&longitude=${lon}&years=${years}`
      );

      if (!response.ok) {
        throw new Error("Historical weather request failed");
      }

      const data = await response.json();

      if (!data.success) {
        throw new Error(data.error || "Historical weather unavailable");
      }

      setHistoricalData(data);
    } catch (error) {
      console.error("Historical weather error:", error);
      setHistoricalData(null);
      setHistoricalError("Unable to load historical climate data.");
    } finally {
      setHistoricalLoading(false);
    }
  }

  function changeHistoricalRange(years: number) {
    setHistoricalYears(years);
    loadHistoricalWeather(latitude, longitude, years);
  }

  async function loadIMDOfficialWarning(locationName: string) {
    try {
      const isHyderabad =
        locationName.toLowerCase().includes("hyderabad");

      if (!isHyderabad) {
        setImdOfficial(null);
        return;
      }

      const response = await fetch("/api/imd/official");

      if (!response.ok) {
        setImdOfficial(null);
        return;
      }

      const data = await response.json();

      if (data.success) {
        setImdOfficial(data);
      } else {
        setImdOfficial(null);
      }
    } catch (error) {
      console.error("IMD warning error:", error);
      setImdOfficial(null);
    }
  }

  async function loadWeatherByCoordinates(
    lat: number,
    lon: number
  ) {
    try {
      setLoading(true);
      setSearchError("");

      const response = await fetch(
        `/api/weather?latitude=${lat}&longitude=${lon}`
      );

      if (!response.ok) {
        throw new Error("Weather request failed");
      }

      const data = await response.json();

      setWeather(data.weather);
      setAlerts(data.alerts || []);

      setLatitude(data.location.latitude);
      setLongitude(data.location.longitude);
      setLocation(data.location.name);

      // Show the main weather immediately. Advanced features load in the background
      // so city search is not blocked by NWP, historical data, or local AI.
      void (async () => {
        // Run advanced features independently and in parallel. None of them
        // controls the main loading spinner or blocks the weather screen.
        const imdPromise = loadIMDOfficialWarning(data.location.name).catch(
          (error) => {
            console.error("Background IMD loading error:", error);
          }
        );

        const historyPromise = loadHistoricalWeather(
          data.location.latitude,
          data.location.longitude,
          historicalYears
        ).catch((error) => {
          console.error("Background history loading error:", error);
        });

        const nwpPromise = loadNWPComparison(
          data.location.latitude,
          data.location.longitude,
          data.weather
        );

        const [, , nwpResult] = await Promise.all([
          imdPromise,
          historyPromise,
          nwpPromise,
        ]);

        if (nwpResult) {
          void generateNWPInsight(
            nwpResult,
            data.weather,
            data.location.name
          );
        }

        void generateImpactAdvisory(
          data.weather,
          data.location.name,
          data.alerts || [],
          nwpResult
        );
      })();

    } catch (error) {
      console.error("Weather loading error:", error);
      setSearchError("Unable to load weather data.");
    } finally {
      setLoading(false);
    }
  }

  async function searchCity() {
    const searchValue = city.trim();

    if (!searchValue) {
      setSearchError("Please enter a city name.");
      return;
    }

    try {
      setLoading(true);
      setSearchError("");

      const response = await fetch(
        `/api/weather?city=${encodeURIComponent(searchValue)}`
      );

      if (!response.ok) {
        throw new Error("City search failed");
      }

      const data = await response.json();

      if (!data.location || !data.weather) {
        throw new Error("Invalid weather response");
      }

      setWeather(data.weather);
      setAlerts(data.alerts || []);

      setLatitude(data.location.latitude);
      setLongitude(data.location.longitude);
      setLocation(data.location.name);

      // Show the main weather immediately. Advanced features load in the background
      // so city search is not blocked by NWP, historical data, or local AI.
      void (async () => {
        // Run advanced features independently and in parallel. None of them
        // controls the main loading spinner or blocks the weather screen.
        const imdPromise = loadIMDOfficialWarning(data.location.name).catch(
          (error) => {
            console.error("Background IMD loading error:", error);
          }
        );

        const historyPromise = loadHistoricalWeather(
          data.location.latitude,
          data.location.longitude,
          historicalYears
        ).catch((error) => {
          console.error("Background history loading error:", error);
        });

        const nwpPromise = loadNWPComparison(
          data.location.latitude,
          data.location.longitude,
          data.weather
        );

        const [, , nwpResult] = await Promise.all([
          imdPromise,
          historyPromise,
          nwpPromise,
        ]);

        if (nwpResult) {
          void generateNWPInsight(
            nwpResult,
            data.weather,
            data.location.name
          );
        }

        void generateImpactAdvisory(
          data.weather,
          data.location.name,
          data.alerts || [],
          nwpResult
        );
      })();

      setCity("");
    } catch (error) {
      console.error("City search error:", error);

      setSearchError(
        `Could not find "${searchValue}". Try another city.`
      );
    } finally {
      setLoading(false);
    }
  }

  function handleSearchSubmit(
    event: React.FormEvent<HTMLFormElement>
  ) {
    event.preventDefault();
    searchCity();
  }

  function detectLocation() {
    if (!navigator.geolocation) {
      alert("Geolocation is not supported by your browser.");
      return;
    }

    setLoading(true);
    setSearchError("");

    navigator.geolocation.getCurrentPosition(
      (position) => {
        loadWeatherByCoordinates(
          position.coords.latitude,
          position.coords.longitude
        );
      },
      () => {
        alert(
          "Unable to access your location. Please allow location permission."
        );

        setLoading(false);
      }
    );
  }

  function startVoiceInput() {
    if (typeof window === "undefined") return;

    const SpeechRecognition =
      (window as any).SpeechRecognition ||
      (window as any).webkitSpeechRecognition;

    if (!SpeechRecognition) {
      setSearchError(
        "Voice input is not supported in this browser. Please use Google Chrome or Microsoft Edge."
      );
      return;
    }

    const languageMap: Record<string, string> = {
      English: "en-IN",
      Hindi: "hi-IN",
      Telugu: "te-IN",
      Tamil: "ta-IN",
      Kannada: "kn-IN",
      Marathi: "mr-IN",
      Bengali: "bn-IN",
      Malayalam: "ml-IN",
    };

    const recognition = new SpeechRecognition();

    recognition.lang = languageMap[selectedLanguage] || "en-IN";
    recognition.interimResults = false;
    recognition.continuous = false;

    recognition.onstart = () => {
      setSearchError("");
      setIsListening(true);
    };

    recognition.onresult = (event: any) => {
      const transcript = event.results?.[0]?.[0]?.transcript;

      if (transcript) {
        setQuestion(transcript);
      }
    };

    recognition.onerror = (event: any) => {
      console.error("Speech recognition error:", event.error);
      setIsListening(false);

      if (event.error === "no-speech") {
        setSearchError(
          "I didn't hear anything. Click the microphone and speak immediately."
        );
      } else if (event.error === "not-allowed") {
        setSearchError(
          "Microphone permission was denied. Allow microphone access and try again."
        );
      } else if (event.error === "audio-capture") {
        setSearchError(
          "No microphone was detected. Check your microphone connection and browser settings."
        );
      } else if (event.error === "network") {
        setSearchError(
          "Speech recognition could not connect. Check your internet connection and try again."
        );
      } else {
        setSearchError(
          `Voice input failed (${event.error || "unknown error"}). Please try again.`
        );
      }
    };

    recognition.onend = () => {
      setIsListening(false);
    };

    recognition.start();
  }

  async function generateImpactAdvisory(
    weatherData: WeatherData,
    locationName: string,
    currentAlerts: Alert[],
    nwp?: any
  ) {
    try {
      setImpactAdvisoryLoading(true);
      setImpactAdvisory("");

      const next24Hours = weatherData.hourly.time
        .slice(0, 24)
        .map((time, index) => ({
          time,
          temperature: weatherData.hourly.temperature_2m[index],
          rainProbability:
            weatherData.hourly.precipitation_probability[index],
          humidity:
            weatherData.hourly.relative_humidity_2m[index],
          wind: weatherData.hourly.wind_speed_10m[index],
        }));

      const sevenDayForecast = weatherData.daily.time.map((date, index) => ({
        date,
        maxTemperature: weatherData.daily.temperature_2m_max[index],
        minTemperature: weatherData.daily.temperature_2m_min[index],
        rainProbability:
          weatherData.daily.precipitation_probability_max[index],
        weatherCode: weatherData.daily.weather_code[index],
        maxWind: weatherData.daily.wind_speed_10m_max[index],
      }));

      const response = await fetch("/api/chat", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          question: `Generate an AI impact-based weather advisory for ${locationName}.

Use ONLY the supplied weather data. Do not invent weather values or official warnings.

Return exactly five short sections in this order:
1. PUBLIC SAFETY
2. TRAVEL
3. OUTDOOR ACTIVITY
4. AGRICULTURE
5. URBAN CONDITIONS

For each section, give one practical sentence. If a category has no meaningful weather risk, say "No major weather-related concern expected."

Prioritize rain, thunderstorms, strong wind, extreme heat, fog and other clearly supported hazards. If an official alert is supplied, tell the user to follow it. Keep the response concise and practical.`,
          weather: {
            location: locationName,
            current: {
              temperature: weatherData.current.temperature_2m,
              humidity: weatherData.current.relative_humidity_2m,
              wind: weatherData.current.wind_speed_10m,
            },
            next24Hours,
            sevenDayForecast,
            advisories: currentAlerts,
            nwpComparison: nwp?.comparison
              ? {
                  agreement: nwp.comparison.agreement,
                  temperatureDifference:
                    nwp.comparison.temperatureDifference,
                  rainProbabilityDifference:
                    nwp.comparison.rainProbabilityDifference,
                  windDifference: nwp.comparison.windDifference,
                }
              : undefined,
          },
          language: selectedLanguage,
        }),
      });

      if (!response.ok) {
        throw new Error("Impact advisory request failed");
      }

      const data = await response.json();

      setImpactAdvisory(
        data.answer ||
          "No major weather-related concern is identified from the available forecast data."
      );
    } catch (error) {
      console.error("Impact advisory error:", error);
      setImpactAdvisory(
        "Unable to generate the impact advisory right now. Please check the current forecast and official weather warnings."
      );
    } finally {
      setImpactAdvisoryLoading(false);
    }
  }

  function calculateForecastConfidence(nwp: any, weatherData: WeatherData) {
    const comparison = nwp?.comparison ?? {};

    const tempDiff = Number(comparison.temperatureDifference);
    const rainDiff = Number(comparison.rainProbabilityDifference);
    const windDiff = Number(comparison.windDifference);

    const nwpScore =
      Number.isFinite(tempDiff) &&
      Number.isFinite(rainDiff) &&
      Number.isFinite(windDiff)
        ? Math.max(
            0,
            Math.min(
              100,
              100 -
                tempDiff * 8 -
                rainDiff * 0.55 -
                windDiff * 1.2
            )
          )
        : 50;

    const hourlyRain = weatherData.hourly.precipitation_probability
      .slice(0, 24)
      .filter((value) => Number.isFinite(value));

    const rainRange = hourlyRain.length
      ? Math.max(...hourlyRain) - Math.min(...hourlyRain)
      : 0;

    const rainScore = Math.max(
      0,
      Math.min(100, 100 - rainRange * 0.35)
    );

    const dailyTemps = weatherData.daily.temperature_2m_max.filter(
      (value) => Number.isFinite(value)
    );

    const tempRange = dailyTemps.length
      ? Math.max(...dailyTemps) - Math.min(...dailyTemps)
      : 0;

    const tempScore = Math.max(
      0,
      Math.min(100, 100 - Math.max(0, tempRange - 8) * 4)
    );

    const dailyWinds = weatherData.daily.wind_speed_10m_max.filter(
      (value) => Number.isFinite(value)
    );

    const maxWind = dailyWinds.length ? Math.max(...dailyWinds) : 0;

    const windScore =
      maxWind >= 60
        ? 35
        : maxWind >= 40
          ? 60
          : maxWind >= 30
            ? 80
            : 95;

    const forecastHours = weatherData.hourly.time.length;
    const horizonScore =
      forecastHours >= 120 ? 92 : forecastHours >= 72 ? 96 : 100;

    const severeCodes = weatherData.daily.weather_code.filter((code) =>
      [95, 96, 99].includes(code)
    );

    const severeScore = severeCodes.length > 0 ? 55 : 95;

    const score = Math.round(
      nwpScore * 0.45 +
        rainScore * 0.15 +
        tempScore * 0.1 +
        windScore * 0.1 +
        horizonScore * 0.1 +
        severeScore * 0.1
    );

    const label =
      score >= 85
        ? "HIGH"
        : score >= 70
          ? "MODERATE-HIGH"
          : score >= 50
            ? "MODERATE"
            : "LOW";

    setForecastConfidence({
      score,
      label,
      nwpScore: Math.round(nwpScore),
      rainScore: Math.round(rainScore),
      tempScore: Math.round(tempScore),
      windScore: Math.round(windScore),
      horizonScore: Math.round(horizonScore),
      severeScore: Math.round(severeScore),
    });
  }

  async function generateNWPInsight(
    nwp: any,
    weatherData: WeatherData,
    locationName: string
  ) {
    try {
      setNwpInsightLoading(true);
      setNwpInsight("");

      const nwpWeatherData = {
        location: {
          name: locationName,
          latitude,
          longitude,
        },
        current: {
          temperature: weatherData.current.temperature_2m,
          humidity: weatherData.current.relative_humidity_2m,
          windSpeed: weatherData.current.wind_speed_10m,
        },
        next24Hours: weatherData.hourly.time.slice(0, 12).map(
          (time, index) => ({
            time,
            temperature: weatherData.hourly.temperature_2m[index],
            rainProbability:
              weatherData.hourly.precipitation_probability[index],
            humidity: weatherData.hourly.relative_humidity_2m[index],
            wind: weatherData.hourly.wind_speed_10m[index],
          })
        ),
        sevenDayForecast: weatherData.daily.time.map((date, index) => ({
          date,
          maxTemperature: weatherData.daily.temperature_2m_max[index],
          minTemperature: weatherData.daily.temperature_2m_min[index],
          rainProbability:
            weatherData.daily.precipitation_probability_max[index],
          weatherCode: weatherData.daily.weather_code[index],
          maxWind: weatherData.daily.wind_speed_10m_max[index],
        })),
        nwpComparison: {
          agreement: nwp?.comparison?.agreement,
          temperatureDifference:
            nwp?.comparison?.temperatureDifference,
          rainProbabilityDifference:
            nwp?.comparison?.rainProbabilityDifference,
          windDifference: nwp?.comparison?.windDifference,
          ecmwf: nwp?.models?.ecmwf?.hourly,
          gfs: nwp?.models?.gfs?.hourly,
        },
      };

      const response = await fetch("/api/chat", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          question:
            "Explain the NWP model disagreement for this location. Compare ECMWF and GFS, identify which weather variable disagrees most, explain what that means for forecast confidence, and give one practical takeaway.",
          weather: nwpWeatherData,
          language: selectedLanguage,
        }),
      });

      if (!response.ok) {
        throw new Error("NWP AI request failed");
      }

      const data = await response.json();

      setNwpInsight(
        data.answer ||
          "The models disagree, so forecast confidence is reduced."
      );
    } catch (error) {
      console.error("NWP AI insight error:", error);
      setNwpInsight(
        "The NWP models show some disagreement. Consider the forecast less certain when their rainfall, temperature, or wind guidance differs substantially."
      );
    } finally {
      setNwpInsightLoading(false);
    }
  }

  async function loadNWPComparison(
    lat: number,
    lon: number,
    weatherDataForConfidence?: WeatherData
  ) {
    try {
      setNwpLoading(true);
      setNwpError("");
      setNwpInsight("");

      const response = await fetch(
        `/api/nwp?latitude=${lat}&longitude=${lon}`
      );

      if (!response.ok) {
        throw new Error("NWP request failed");
      }

      const data = await response.json();

      if (!data.success) {
        throw new Error(data.error || "NWP data unavailable");
      }

      setNwpData(data);

      if (weatherDataForConfidence) {
        calculateForecastConfidence(
          data,
          weatherDataForConfidence
        );
      }

      return data;
    } catch (error) {
      console.error("NWP loading error:", error);
      setNwpData(null);
      setNwpError("Unable to load NWP model comparison.");
      return null;
    } finally {
      setNwpLoading(false);
    }
  }

  async function askWeatherGPT(customQuestion?: string) {
    const userQuestion = customQuestion || question;

    if (!userQuestion.trim() || !weather) return;

    try {
      setAiLoading(true);
      setAnswer("");

      const compactWeatherData = {
        location,

        current: {
          temperature: weather.current.temperature_2m,
          humidity: weather.current.relative_humidity_2m,
          wind: weather.current.wind_speed_10m,
        },

        next24Hours: weather.hourly.time
          .slice(0, 12)
          .map((time, index) => ({
            time,
            temperature: weather.hourly.temperature_2m[index],
            rainProbability:
              weather.hourly.precipitation_probability[index],
            humidity:
              weather.hourly.relative_humidity_2m[index],
            wind: weather.hourly.wind_speed_10m[index],
          })),

        sevenDayForecast: weather.daily.time.map(
          (date, index) => ({
            date,
            maxTemperature:
              weather.daily.temperature_2m_max[index],
            minTemperature:
              weather.daily.temperature_2m_min[index],
            rainProbability:
              weather.daily.precipitation_probability_max[index],
            weatherCode:
              weather.daily.weather_code[index],
            maxWind:
              weather.daily.wind_speed_10m_max[index],
          })
        ),

        advisories: alerts,
      };

      const response = await fetch("/api/chat", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          question: userQuestion,
          weather: compactWeatherData,
          language: selectedLanguage,
        }),
      });

      if (!response.ok) {
        throw new Error("AI request failed");
      }

      const data = await response.json();

      setAnswer(
        data.answer ||
          "I couldn't generate an answer right now."
      );
    } catch (error) {
      console.error("AI error:", error);

      setAnswer(
        "Sorry, WeatherGPT could not generate an answer. Make sure Ollama is running."
      );
    } finally {
      setAiLoading(false);
    }
  }

  function getWeatherEmoji(code: number) {
    if (code === 0) return "☀️";
    if (code <= 3) return "🌤️";
    if (code <= 48) return "🌫️";
    if (code <= 67) return "🌧️";
    if (code <= 77) return "❄️";
    if (code <= 82) return "🌦️";
    if (code >= 95) return "⛈️";

    return "🌥️";
  }

  function getCondition(code: number) {
    if (code === 0) return "Clear Sky";
    if (code <= 3) return "Partly Cloudy";
    if (code <= 48) return "Foggy";
    if (code <= 67) return "Rain";
    if (code <= 77) return "Snow";
    if (code <= 82) return "Rain Showers";
    if (code >= 95) return "Thunderstorm";

    return "Cloudy";
  }

  function getAlertEmoji(level: string) {
    if (level === "extreme") return "🚨";
    if (level === "high") return "⚠️";

    return "🌧️";
  }

  function formatDay(date: string) {
    return new Date(date).toLocaleDateString("en-US", {
      weekday: "short",
    });
  }

  function formatHour(time: string) {
    return new Date(time).toLocaleTimeString("en-US", {
      hour: "numeric",
    });
  }

  const currentCode =
    weather?.daily.weather_code?.[0] ?? 0;

  return (
    <main className="min-h-screen overflow-x-hidden bg-[#070b14] text-slate-100">
      {/* SOFT IPHONE-WEATHER BACKGROUND */}
      <div className="pointer-events-none fixed inset-0 -z-10 overflow-hidden">
        <div className="absolute left-[-15%] top-[-10%] h-[420px] w-[420px] rounded-full bg-cyan-400/10 blur-[110px]" />
        <div className="absolute right-[-15%] top-[10%] h-[430px] w-[430px] rounded-full bg-indigo-500/10 blur-[120px]" />
        <div className="absolute bottom-[-15%] left-[25%] h-[450px] w-[450px] rounded-full bg-blue-500/10 blur-[120px]" />
      </div>

      {/* HEADER */}
      <header className="mx-auto flex max-w-5xl items-center justify-between px-4 py-4 sm:px-6 sm:py-6">
        <div className="flex items-center gap-3">
          <div className="flex h-11 w-11 items-center justify-center rounded-[16px] bg-gradient-to-br from-cyan-400/20 to-indigo-500/20 text-xl shadow-lg shadow-cyan-500/10 ring-1 ring-white/10 backdrop-blur-xl">
            ☁️
          </div>
          <div>
            <h1 className="text-lg font-bold tracking-tight text-white">
              WeatherGPT
            </h1>
            <p className="text-[11px] text-slate-500">
              AI Weather Intelligence
            </p>
          </div>
        </div>

        <button
          onClick={detectLocation}
          className="rounded-full bg-white/[0.065] px-4 py-2 text-xs font-semibold text-slate-200 shadow-lg shadow-black/20 ring-1 ring-white/10 backdrop-blur-xl transition hover:bg-white/10"
        >
          📍 My Location
        </button>
      </header>

      <div className="mx-auto max-w-5xl px-4 pb-16 sm:px-6">
        {/* SEARCH */}
        <section className="mb-5">
          <form
            onSubmit={handleSearchSubmit}
            className="rounded-[22px] bg-white/[0.06] p-2 shadow-lg shadow-black/20 ring-1 ring-white/10 backdrop-blur-xl"
          >
            <div className="flex gap-2">
              <div className="flex min-w-0 flex-1 items-center gap-3 px-3">
                <span className="text-slate-500">🔍</span>
                <input
                  value={city}
                  onChange={(e) => {
                    setCity(e.target.value);
                    setSearchError("");
                  }}
                  placeholder="Search city..."
                  className="min-w-0 flex-1 bg-transparent py-2.5 text-sm text-slate-100 outline-none placeholder:text-slate-500"
                  type="text"
                  autoComplete="off"
                />
              </div>

              <button
                type="submit"
                disabled={loading}
                className="rounded-[16px] bg-white px-5 py-2.5 text-sm font-semibold text-slate-950 transition hover:bg-cyan-100 disabled:cursor-not-allowed disabled:opacity-50"
              >
                {loading ? "..." : "Search"}
              </button>
            </div>
          </form>

          {searchError && (
            <p className="mt-2 px-2 text-xs text-red-500">{searchError}</p>
          )}
        </section>

        {/* LOADING */}
        {loading ? (
          <div className="flex min-h-[650px] items-center justify-center">
            <div className="text-center">
              <div className="mx-auto mb-4 h-10 w-10 animate-spin rounded-full border-2 border-white/15 border-t-cyan-400" />
              <p className="text-sm text-slate-500">
                Loading weather intelligence...
              </p>
            </div>
          </div>
        ) : weather ? (
          <>
            {/* ========================================================= */}
            {/* 1. CURRENT WEATHER — FIRST */}
            {/* ========================================================= */}
            <section className="relative isolate overflow-hidden rounded-[34px] border border-white/10 bg-[#071426] p-6 text-white shadow-2xl shadow-blue-950/40 sm:p-8">
              {/* Atmospheric background */}
              <div className="pointer-events-none absolute inset-0 -z-10 overflow-hidden">
                <div className="absolute -right-20 -top-24 h-72 w-72 rounded-full bg-cyan-400/20 blur-3xl" />
                <div className="absolute -left-24 bottom-[-100px] h-80 w-80 rounded-full bg-indigo-600/25 blur-3xl" />
                <div className="absolute right-[16%] top-[12%] h-36 w-36 rounded-full bg-amber-300/20 blur-2xl" />
                <div className="absolute right-[19%] top-[7%] text-[110px] opacity-25 drop-shadow-[0_0_35px_rgba(251,191,36,0.35)] sm:text-[145px]">
                  ☀️
                </div>
                <div className="absolute -left-6 top-[30%] text-[105px] opacity-10 blur-[1px] sm:text-[150px]">
                  ☁️
                </div>
                <div className="absolute right-[-20px] bottom-[-20px] text-[125px] opacity-[0.07] sm:text-[170px]">
                  ☁️
                </div>
                <div className="absolute inset-0 bg-gradient-to-br from-cyan-500/[0.08] via-transparent to-indigo-600/20" />
              </div>

              <div className="relative flex items-start justify-between gap-4">
                <div>
                  <div className="flex items-center gap-2">
                    <span className="text-lg">📍</span>
                    <p className="text-base font-semibold tracking-tight text-white">
                      {location}
                    </p>
                  </div>
                  <p className="mt-1 text-xs text-slate-400">
                    Live weather conditions · Updated just now
                  </p>
                </div>

                <div className="flex items-center gap-2 rounded-full border border-emerald-400/20 bg-emerald-400/10 px-3 py-1.5 text-[10px] font-semibold text-emerald-300 backdrop-blur-xl">
                  <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-emerald-400" />
                  LIVE
                </div>
              </div>

              <div className="relative mt-8 grid gap-8 lg:grid-cols-[1.2fr_0.8fr] lg:items-center">
                <div>
                  <p className="text-xs font-medium uppercase tracking-[0.22em] text-cyan-300/70">
                    Current temperature
                  </p>
                  <div className="mt-2 flex items-end gap-3">
                    <div className="text-[88px] font-semibold leading-[0.82] tracking-[-0.075em] text-white drop-shadow-2xl sm:text-[112px]">
                      {Math.round(weather.current.temperature_2m)}°
                    </div>
                    <div className="mb-2 rounded-2xl border border-white/10 bg-white/[0.06] px-3 py-2 backdrop-blur-xl">
                      <p className="text-[10px] uppercase tracking-wider text-slate-500">
                        Condition
                      </p>
                      <p className="mt-0.5 text-sm font-semibold text-slate-100">
                        {getCondition(currentCode)}
                      </p>
                    </div>
                  </div>

                  <div className="mt-5 flex flex-wrap items-center gap-x-5 gap-y-2 text-sm text-slate-300">
                    <span>H: <b className="text-white">{Math.round(weather.daily.temperature_2m_max[0])}°</b></span>
                    <span>L: <b className="text-white">{Math.round(weather.daily.temperature_2m_min[0])}°</b></span>
                    <span>Rain: <b className="text-cyan-300">{weather.hourly.precipitation_probability[0]}%</b></span>
                  </div>

                  <p className="mt-4 max-w-lg text-sm leading-6 text-slate-400">
                    {weather.hourly.precipitation_probability[0] >= 60
                      ? "Rain may be possible soon. Keep an umbrella handy and watch the alerts below."
                      : weather.current.temperature_2m >= 37
                      ? "It is a hot day. Stay hydrated and limit prolonged outdoor exposure during peak heat."
                      : "Conditions look relatively comfortable right now. Check the hourly forecast for changes through the day."}
                  </p>
                </div>

                <div className="flex items-center justify-center lg:justify-end">
                  <div className="relative flex h-52 w-52 items-center justify-center rounded-full border border-white/10 bg-white/[0.045] shadow-[0_0_80px_rgba(56,189,248,0.12)] backdrop-blur-xl sm:h-60 sm:w-60">
                    <div className="absolute inset-5 rounded-full border border-white/[0.06]" />
                    <div className="text-[100px] drop-shadow-[0_12px_30px_rgba(255,255,255,0.18)] sm:text-[120px]">
                      {getWeatherEmoji(currentCode)}
                    </div>
                  </div>
                </div>
              </div>

              {/* Detailed conditions */}
              <div className="relative mt-8 grid grid-cols-2 gap-2 sm:grid-cols-4">
                <div className="rounded-[22px] border border-white/10 bg-white/[0.055] p-4 backdrop-blur-xl">
                  <p className="text-[10px] uppercase tracking-wider text-slate-500">Humidity</p>
                  <p className="mt-2 text-xl font-semibold text-white">{weather.current.relative_humidity_2m}%</p>
                  <p className="mt-1 text-[10px] text-slate-500">Moisture level</p>
                </div>
                <div className="rounded-[22px] border border-white/10 bg-white/[0.055] p-4 backdrop-blur-xl">
                  <p className="text-[10px] uppercase tracking-wider text-slate-500">Wind</p>
                  <p className="mt-2 text-xl font-semibold text-white">{Math.round(weather.current.wind_speed_10m)} <span className="text-xs font-normal text-slate-500">km/h</span></p>
                  <p className="mt-1 text-[10px] text-slate-500">Current speed</p>
                </div>
                <div className="rounded-[22px] border border-white/10 bg-white/[0.055] p-4 backdrop-blur-xl">
                  <p className="text-[10px] uppercase tracking-wider text-slate-500">Rain chance</p>
                  <p className="mt-2 text-xl font-semibold text-cyan-300">{weather.hourly.precipitation_probability[0]}%</p>
                  <p className="mt-1 text-[10px] text-slate-500">Next available hour</p>
                </div>
                <div className="rounded-[22px] border border-white/10 bg-white/[0.055] p-4 backdrop-blur-xl">
                  <p className="text-[10px] uppercase tracking-wider text-slate-500">Today's range</p>
                  <p className="mt-2 text-xl font-semibold text-white">{Math.round(weather.daily.temperature_2m_min[0])}°–{Math.round(weather.daily.temperature_2m_max[0])}°</p>
                  <p className="mt-1 text-[10px] text-slate-500">Low to high</p>
                </div>
              </div>
            </section>

            {/* 2. 24 HOURS — SECOND */}
            {/* ========================================================= */}
            <section className="mt-5">
              <div className="mb-3 flex items-end justify-between px-1">
                <div>
                  <p className="text-[10px] font-bold uppercase tracking-[0.18em] text-sky-600">
                    Forecast
                  </p>
                  <h2 className="mt-1 text-xl font-bold tracking-tight">
                    Next 24 Hours
                  </h2>
                </div>
                <span className="text-[11px] text-slate-500">
                  Hour by hour
                </span>
              </div>

              <div className="overflow-x-auto rounded-[28px] bg-white/[0.06] p-3 shadow-lg shadow-black/20 ring-1 ring-white/10 backdrop-blur-xl">
                <div className="flex min-w-max gap-2">
                  {weather.hourly.time.slice(0, 24).map((time, index) => (
                    <div
                      key={time}
                      className="w-[82px] rounded-[20px] bg-white/[0.045] px-3 py-4 text-center ring-1 ring-white/10"
                    >
                      <p className="text-[10px] font-medium text-slate-500">
                        {formatHour(time)}
                      </p>

                      <div className="my-3 text-2xl">
                        {getWeatherEmoji(
                          weather.daily.weather_code[
                            Math.min(index, weather.daily.weather_code.length - 1)
                          ] ?? currentCode
                        )}
                      </div>

                      <p className="text-lg font-bold text-slate-100">
                        {Math.round(weather.hourly.temperature_2m[index])}°
                      </p>

                      <p className="mt-2 text-[10px] font-medium text-sky-600">
                        {weather.hourly.precipitation_probability[index]}%
                      </p>
                    </div>
                  ))}
                </div>
              </div>
            </section>

            {/* ========================================================= */}
            {/* 3. 7 DAY FORECAST — THIRD */}
            {/* ========================================================= */}
            <section className="mt-5">
              <div className="mb-4 flex items-end justify-between px-1">
                <div>
                  <p className="text-[10px] font-bold uppercase tracking-[0.22em] text-cyan-400">
                    Extended outlook
                  </p>
                  <h2 className="mt-1 text-xl font-bold tracking-tight text-white">
                    7-Day Forecast
                  </h2>
                </div>
                <span className="text-[11px] text-slate-500">
                  Daily conditions
                </span>
              </div>

              <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4 xl:grid-cols-7">
                {weather.daily.time.map((date, index) => {
                  const rain = weather.daily.precipitation_probability_max[index];
                  const isToday = index === 0;
                  return (
                    <div
                      key={date}
                      className={`group relative overflow-hidden rounded-[26px] border p-4 transition duration-300 hover:-translate-y-1 ${
                        isToday
                          ? "border-cyan-400/30 bg-gradient-to-b from-cyan-400/[0.13] via-blue-500/[0.07] to-white/[0.035] shadow-lg shadow-cyan-950/30"
                          : "border-white/10 bg-white/[0.045] hover:border-white/20 hover:bg-white/[0.07]"
                      }`}
                    >
                      <div className="absolute right-[-25px] top-[-30px] h-24 w-24 rounded-full bg-cyan-400/[0.06] blur-2xl transition group-hover:bg-cyan-400/10" />

                      <div className="relative flex items-center justify-between">
                        <div>
                          <p className="text-sm font-bold text-white">
                            {isToday ? "Today" : formatDay(date)}
                          </p>
                          <p className="mt-0.5 text-[10px] text-slate-500">
                            {date.slice(5)}
                          </p>
                        </div>
                        {isToday && (
                          <span className="rounded-full bg-cyan-400/10 px-2 py-1 text-[9px] font-bold uppercase tracking-wider text-cyan-300">
                            Now
                          </span>
                        )}
                      </div>

                      <div className="relative my-5 flex items-center justify-center">
                        <div className="flex h-20 w-20 items-center justify-center rounded-full bg-white/[0.045] text-[42px] shadow-inner ring-1 ring-white/[0.06]">
                          {getWeatherEmoji(weather.daily.weather_code[index])}
                        </div>
                      </div>

                      <div className="relative text-center">
                        <p className="text-2xl font-bold tracking-tight text-white">
                          {Math.round(weather.daily.temperature_2m_max[index])}°
                        </p>
                        <p className="mt-0.5 text-xs text-slate-500">
                          Low {Math.round(weather.daily.temperature_2m_min[index])}°
                        </p>
                      </div>

                      <div className="relative mt-4 rounded-2xl border border-white/[0.07] bg-black/10 px-3 py-2">
                        <div className="flex items-center justify-between">
                          <span className="text-[10px] text-slate-500">Rain</span>
                          <span className="text-[10px] font-semibold text-cyan-300">{rain}%</span>
                        </div>
                        <div className="mt-2 h-1 overflow-hidden rounded-full bg-white/[0.07]">
                          <div
                            className="h-full rounded-full bg-gradient-to-r from-cyan-400 to-blue-500"
                            style={{ width: `${Math.max(4, rain)}%` }}
                          />
                        </div>
                      </div>

                      <div className="relative mt-3 flex items-center justify-center gap-1.5 text-[10px] text-slate-500">
                        <span>💨</span>
                        <span>{Math.round(weather.daily.wind_speed_10m_max[index])} km/h max wind</span>
                      </div>
                    </div>
                  );
                })}
              </div>
            </section>

            {/* 4. MAP — FOURTH */}
            {/* ========================================================= */}
            <section className="mt-5">
              <div className="mb-3 flex items-end justify-between px-1">
                <div>
                  <p className="text-[10px] font-bold uppercase tracking-[0.18em] text-emerald-600">
                    Location
                  </p>
                  <h2 className="mt-1 text-xl font-bold tracking-tight">
                    Weather Map
                  </h2>
                </div>
                <span className="text-[11px] text-slate-500">
                  Radar & layers
                </span>
              </div>

              <div className="overflow-hidden rounded-[30px] bg-white/[0.06] p-2 shadow-lg shadow-black/20 ring-1 ring-white/10">
                <WeatherMap
                  latitude={latitude}
                  longitude={longitude}
                  locationName={location}
                  temperature={weather.current.temperature_2m}
                  rainProbability={
                    weather.hourly.precipitation_probability[0]
                  }
                  humidity={weather.current.relative_humidity_2m}
                  windSpeed={weather.current.wind_speed_10m}
                />
              </div>
            </section>

            {/* ========================================================= */}
            {/* 5. ALERTS — AFTER PRIMARY WEATHER */}
            {/* ========================================================= */}
            {imdOfficial &&
              imdOfficial.success &&
              imdOfficial.warningTypes &&
              imdOfficial.warningTypes.length > 0 && (
                <section className="mt-8">
                  <div className="mb-3 px-1">
                    <p className="text-[10px] font-bold uppercase tracking-[0.18em] text-red-500">
                      Official
                    </p>
                    <h2 className="mt-1 text-xl font-bold tracking-tight">
                      🚨 IMD Official Warning
                    </h2>
                  </div>

                  <div className="rounded-[28px] border border-red-200 bg-red-400/10/90 p-5 shadow-lg shadow-black/20">
                    <div className="flex gap-4">
                      <div className="text-3xl">🚨</div>
                      <div className="min-w-0">
                        <h3 className="font-bold text-red-900">
                          Official IMD warning detected
                        </h3>

                        <div className="mt-3 flex flex-wrap gap-2">
                          {imdOfficial.warningTypes.map((warning) => (
                            <span
                              key={warning}
                              className="rounded-full bg-red-100 px-3 py-1.5 text-xs font-medium text-red-700"
                            >
                              {warning}
                            </span>
                          ))}
                        </div>

                        <p className="mt-3 text-xs leading-5 text-red-700/70">
                          Follow official India Meteorological Department
                          instructions during severe weather.
                        </p>
                      </div>
                    </div>
                  </div>
                </section>
              )}

            {alerts.length > 0 && (
              <section className="mt-5">
                <div className="mb-3 px-1">
                  <p className="text-[10px] font-bold uppercase tracking-[0.18em] text-orange-500">
                    Weather Advisories
                  </p>
                  <h2 className="mt-1 text-xl font-bold tracking-tight">
                    Conditions to Watch
                  </h2>
                </div>

                <div className="grid gap-3 md:grid-cols-2">
                  {alerts.map((alert, index) => (
                    <div
                      key={index}
                      className="rounded-[24px] border border-orange-100 bg-white/[0.065] p-4 shadow-lg shadow-black/20"
                    >
                      <div className="flex gap-3">
                        <div className="text-2xl">
                          {getAlertEmoji(alert.level)}
                        </div>
                        <div>
                          <h3 className="font-semibold text-white">
                            {alert.title}
                          </h3>
                          <p className="mt-1 text-sm leading-6 text-slate-500">
                            {alert.message}
                          </p>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </section>
            )}

            {/* ========================================================= */}
            {/* 6. AI WEATHERGPT */}
            {/* ========================================================= */}
            <section className="mt-8">
              <div className="mb-3 px-1">
                <p className="text-[10px] font-bold uppercase tracking-[0.18em] text-violet-600">
                  AI Assistant
                </p>
                <h2 className="mt-1 text-xl font-bold tracking-tight">
                  Ask WeatherGPT
                </h2>
              </div>

              <div className="rounded-[30px] bg-white/[0.065] p-5 shadow-lg shadow-black/20 ring-1 ring-white/10 backdrop-blur-xl">
                <div className="mb-4 flex items-center justify-between gap-3">
                  <div>
                    <p className="font-semibold text-white">
                      ✨ Weather Intelligence
                    </p>
                    <p className="mt-1 text-xs text-slate-500">
                      Ask about rain, travel, clothing or forecasts.
                    </p>
                  </div>

                  <select
                    value={selectedLanguage}
                    onChange={(e) => setSelectedLanguage(e.target.value)}
                    className="max-w-[115px] rounded-full border border-white/10 bg-white/[0.045] px-3 py-2 text-xs text-slate-200 outline-none"
                    aria-label="Select response language"
                  >
                    <option value="English">English</option>
                    <option value="Hindi">हिन्दी</option>
                    <option value="Telugu">తెలుగు</option>
                    <option value="Tamil">தமிழ்</option>
                    <option value="Kannada">ಕನ್ನಡ</option>
                    <option value="Marathi">मराठी</option>
                    <option value="Bengali">বাংলা</option>
                    <option value="Malayalam">മലയാളം</option>
                  </select>
                </div>

                <div className="flex gap-2 rounded-[20px] bg-white/[0.06] p-2">
                  <button
                    type="button"
                    onClick={startVoiceInput}
                    aria-label={
                      isListening
                        ? "Listening for your weather question"
                        : "Use voice input"
                    }
                    className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-[15px] transition ${
                      isListening
                        ? "bg-sky-400/100 text-white"
                        : "bg-white text-slate-950 shadow-lg shadow-cyan-500/10"
                    }`}
                  >
                    {isListening ? "🎙️" : "🎤"}
                  </button>

                  <input
                    value={question}
                    onChange={(e) => setQuestion(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") {
                        askWeatherGPT();
                      }
                    }}
                    placeholder="Ask about the weather..."
                    className="min-w-0 flex-1 bg-transparent px-2 text-sm text-slate-100 outline-none placeholder:text-slate-500"
                  />

                  <button
                    type="button"
                    onClick={() => askWeatherGPT()}
                    disabled={aiLoading}
                    className="rounded-[15px] bg-white px-4 text-sm font-semibold text-slate-950 disabled:opacity-50"
                  >
                    {aiLoading ? "..." : "Ask"}
                  </button>
                </div>

                <div className="mt-3 flex flex-wrap gap-2">
                  {[
                    "Will it rain today?",
                    "Can I go for a walk this evening?",
                    "Is tomorrow good for travelling?",
                    "Do I need an umbrella today?",
                    "What should I wear today?",
                    "Which day has the best weather this week?",
                  ].map((prompt) => (
                    <button
                      key={prompt}
                      type="button"
                      onClick={() => {
                        setQuestion(prompt);
                        askWeatherGPT(prompt);
                      }}
                      className="rounded-full bg-white/[0.06] px-3 py-2 text-[11px] text-slate-300 transition hover:bg-white/10"
                    >
                      {prompt}
                    </button>
                  ))}
                </div>

                <div className="mt-4 min-h-[120px] rounded-[22px] bg-white/[0.045] p-4">
                  {aiLoading ? (
                    <div className="flex items-center gap-3 text-sm text-slate-500">
                      <div className="h-4 w-4 animate-spin rounded-full border border-white/15 border-t-cyan-400" />
                      WeatherGPT is thinking...
                    </div>
                  ) : answer ? (
                    <div>
                      <div className="mb-2 text-xs font-semibold text-violet-600">
                        ✨ WeatherGPT
                      </div>
                      <p className="text-sm leading-7 text-slate-200">
                        {answer}
                      </p>
                    </div>
                  ) : (
                    <div className="flex min-h-[88px] items-center justify-center text-center">
                      <p className="max-w-sm text-sm leading-6 text-slate-500">
                        Ask WeatherGPT anything about the forecast.
                      </p>
                    </div>
                  )}
                </div>
              </div>
            </section>

            {/* ========================================================= */}
            {/* 7. AI IMPACT ADVISORY */}
            {/* ========================================================= */}
            <section className="mt-5">
              <div className="mb-3 px-1">
                <p className="text-[10px] font-bold uppercase tracking-[0.18em] text-amber-600">
                  Smart Guidance
                </p>
                <h2 className="mt-1 text-xl font-bold tracking-tight">
                  🎯 AI Impact-Based Advisory
                </h2>
              </div>

              <div className="rounded-[30px] bg-white/[0.065] p-5 shadow-lg shadow-black/20 ring-1 ring-white/10 backdrop-blur-xl">
                <div className="grid grid-cols-2 gap-2 sm:grid-cols-5">
                  {[
                    ["🛡️", "Safety"],
                    ["🚗", "Travel"],
                    ["🚶", "Outdoor"],
                    ["🌾", "Agriculture"],
                    ["🏙️", "Urban"],
                  ].map(([icon, label]) => (
                    <div
                      key={label}
                      className="rounded-[20px] bg-amber-400/10 p-3 text-center"
                    >
                      <div className="text-xl">{icon}</div>
                      <p className="mt-1 text-[10px] font-semibold text-slate-300">
                        {label}
                      </p>
                    </div>
                  ))}
                </div>

                <div className="mt-4 rounded-[22px] bg-white/[0.045] p-4">
                  {impactAdvisoryLoading ? (
                    <p className="text-sm leading-7 text-slate-500">
                      WeatherGPT is analysing weather impacts...
                    </p>
                  ) : impactAdvisory ? (
                    <p className="whitespace-pre-line text-sm leading-7 text-slate-200">
                      {impactAdvisory}
                    </p>
                  ) : (
                    <p className="text-sm text-slate-500">
                      Impact-based guidance will appear after the forecast
                      loads.
                    </p>
                  )}
                </div>

                <p className="mt-3 text-[10px] leading-5 text-slate-500">
                  AI guidance does not replace official IMD warnings,
                  emergency instructions, or professional advice.
                </p>
              </div>
            </section>

            {/* ========================================================= */}
            {/* 8. NWP + FORECAST CONFIDENCE */}
            {/* ========================================================= */}
            <section className="mt-5">
              <div className="mb-3 px-1">
                <p className="text-[10px] font-bold uppercase tracking-[0.18em] text-cyan-600">
                  Advanced Intelligence
                </p>
                <h2 className="mt-1 text-xl font-bold tracking-tight">
                  🛰️ NWP Model Comparison
                </h2>
              </div>

              {nwpLoading ? (
                <div className="rounded-[28px] bg-white/[0.06] p-8 text-center shadow-lg shadow-black/20 ring-1 ring-white/10">
                  <div className="mx-auto h-7 w-7 animate-spin rounded-full border-2 border-white/10 border-t-cyan-400" />
                  <p className="mt-3 text-sm text-slate-500">
                    Loading model guidance...
                  </p>
                </div>
              ) : nwpError ? (
                <div className="rounded-[24px] bg-orange-50 p-4 text-sm text-orange-700">
                  {nwpError}
                </div>
              ) : nwpData?.models ? (
                <div className="space-y-3">
                  <div className="grid gap-3 md:grid-cols-3">
                    {[
                      {
                        key: "ecmwf",
                        icon: "🌍",
                        title:
                          nwpData.models.ecmwf?.model ||
                          "ECMWF IFS HRES",
                        source:
                          nwpData.models.ecmwf?.source ||
                          "ECMWF / Open-Meteo",
                      },
                      {
                        key: "gfs",
                        icon: "🌎",
                        title:
                          nwpData.models.gfs?.model || "NOAA GFS",
                        source:
                          nwpData.models.gfs?.source ||
                          "NOAA / Open-Meteo",
                      },
                    ].map((model) => {
                      const forecast = nwpData.models[model.key];
                      const temperatures =
                        forecast?.hourly?.temperature_2m || [];
                      const rain =
                        forecast?.hourly?.precipitation_probability || [];
                      const wind =
                        forecast?.hourly?.wind_speed_10m || [];

                      const average = (values: number[]) =>
                        values.length
                          ? values
                              .slice(0, 24)
                              .reduce(
                                (sum, value) => sum + (value ?? 0),
                                0
                              ) /
                            Math.min(values.length, 24)
                          : null;

                      const avgTemp = average(temperatures);
                      const avgRain = average(rain);
                      const avgWind = average(wind);

                      return (
                        <div
                          key={model.key}
                          className="rounded-[24px] bg-white/[0.065] p-4 shadow-lg shadow-black/20 ring-1 ring-white/10"
                        >
                          <div className="flex items-start gap-3">
                            <div className="flex h-10 w-10 items-center justify-center rounded-[14px] bg-sky-400/10 text-lg">
                              {model.icon}
                            </div>
                            <div>
                              <h3 className="text-sm font-bold text-slate-100">
                                {model.title}
                              </h3>
                              <p className="mt-1 text-[10px] text-slate-500">
                                {model.source}
                              </p>
                            </div>
                          </div>

                          {forecast?.error ? (
                            <p className="mt-4 text-sm text-orange-600">
                              {forecast.error}
                            </p>
                          ) : (
                            <div className="mt-4 grid grid-cols-3 gap-2">
                              <div className="rounded-[15px] bg-white/[0.045] p-2.5">
                                <p className="text-[9px] text-slate-500">
                                  Temp
                                </p>
                                <p className="mt-1 text-sm font-bold">
                                  {avgTemp !== null
                                    ? `${avgTemp.toFixed(1)}°`
                                    : "—"}
                                </p>
                              </div>
                              <div className="rounded-[15px] bg-white/[0.045] p-2.5">
                                <p className="text-[9px] text-slate-500">
                                  Rain
                                </p>
                                <p className="mt-1 text-sm font-bold">
                                  {avgRain !== null
                                    ? `${Math.round(avgRain)}%`
                                    : "—"}
                                </p>
                              </div>
                              <div className="rounded-[15px] bg-white/[0.045] p-2.5">
                                <p className="text-[9px] text-slate-500">
                                  Wind
                                </p>
                                <p className="mt-1 text-sm font-bold">
                                  {avgWind !== null
                                    ? `${Math.round(avgWind)}`
                                    : "—"}
                                </p>
                              </div>
                            </div>
                          )}
                        </div>
                      );
                    })}

                    <div className="rounded-[24px] bg-gradient-to-br from-cyan-500 to-indigo-600 p-4 text-white shadow-lg shadow-black/20">
                      <p className="text-[10px] font-bold uppercase tracking-wider text-white/70">
                        Forecast Confidence
                      </p>
                      <h3 className="mt-2 text-xl font-bold">
                        {forecastConfidence
                          ? `${forecastConfidence.score}%`
                          : "Calculating..."}
                      </h3>
                      <p className="mt-1 text-xs text-white/70">
                        {forecastConfidence?.label ||
                          nwpData.comparison?.agreement ||
                          "Analysing model agreement"}
                      </p>

                      {forecastConfidence && (
                        <div className="mt-4 h-1.5 overflow-hidden rounded-full bg-white/20">
                          <div
                            className="h-full rounded-full bg-white"
                            style={{
                              width: `${forecastConfidence.score}%`,
                            }}
                          />
                        </div>
                      )}
                    </div>
                  </div>

                  <div className="rounded-[24px] bg-white/[0.065] p-4 shadow-lg shadow-black/20 ring-1 ring-white/10">
                    <div className="flex items-start gap-3">
                      <div className="text-xl">🤖</div>
                      <div>
                        <p className="text-[10px] font-bold uppercase tracking-wider text-violet-600">
                          WeatherGPT NWP Reasoning
                        </p>
                        <h3 className="mt-1 text-sm font-bold">
                          Why do the models disagree?
                        </h3>
                        <p className="mt-2 text-sm leading-6 text-slate-300">
                          {nwpInsightLoading
                            ? "WeatherGPT is analysing the ECMWF and GFS guidance..."
                            : nwpInsight ||
                              "WeatherGPT will analyse the model differences after NWP data loads."}
                        </p>
                      </div>
                    </div>
                  </div>

                  <p className="px-1 text-[10px] leading-5 text-slate-500">
                    NWP model guidance is used for comparison and confidence
                    estimation. It is not an official IMD warning.
                  </p>
                </div>
              ) : (
                <div className="rounded-[24px] bg-white/[0.06] p-5 text-sm text-slate-500 shadow-lg shadow-black/20">
                  NWP model data will appear after the weather forecast loads.
                </div>
              )}
            </section>

            {/* ========================================================= */}
            {/* 9. HISTORICAL CLIMATE */}
            {/* ========================================================= */}
            <section className="mt-5">
              <div className="mb-3 px-1">
                <p className="text-[10px] font-bold uppercase tracking-[0.18em] text-emerald-600">
                  Climate Intelligence
                </p>
                <h2 className="mt-1 text-xl font-bold tracking-tight">
                  Historical Weather & Climate
                </h2>
              </div>

              <div className="rounded-[30px] bg-white/[0.065] p-5 shadow-lg shadow-black/20 ring-1 ring-white/10 backdrop-blur-xl">
                <div className="mb-4 flex flex-wrap gap-2">
                  {[1, 3, 5].map((years) => (
                    <button
                      key={years}
                      type="button"
                      onClick={() => changeHistoricalRange(years)}
                      className={`rounded-full px-4 py-2 text-xs font-semibold transition ${
                        historicalYears === years
                          ? "bg-emerald-400/100 text-white"
                          : "bg-white/[0.06] text-slate-500"
                      }`}
                    >
                      {years}Y
                    </button>
                  ))}
                </div>

                {historicalLoading ? (
                  <div className="py-8 text-center text-sm text-slate-500">
                    Analysing historical weather patterns...
                  </div>
                ) : historicalError ? (
                  <div className="rounded-[20px] bg-orange-50 p-4 text-sm text-orange-700">
                    {historicalError}
                  </div>
                ) : historicalData ? (
                  <div className="space-y-4">
                    <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-5">
                      {[
                        [
                          "Avg Max",
                          `${historicalData.summary.averageMaxTemperature.toFixed(
                            1
                          )}°C`,
                          "🌡️",
                        ],
                        [
                          "Avg Min",
                          `${historicalData.summary.averageMinTemperature.toFixed(
                            1
                          )}°C`,
                          "❄️",
                        ],
                        [
                          "Total Rain",
                          `${Math.round(
                            historicalData.summary.totalRainfall
                          )} mm`,
                          "🌧️",
                        ],
                        [
                          "Hottest",
                          `${historicalData.summary.hottestTemperature.toFixed(
                            1
                          )}°C`,
                          "🔥",
                        ],
                        [
                          "Wettest",
                          `${historicalData.summary.wettestMonth}`,
                          "💧",
                        ],
                      ].map(([label, value, icon]) => (
                        <div
                          key={label}
                          className="rounded-[20px] bg-white/[0.045] p-3"
                        >
                          <div>{icon}</div>
                          <p className="mt-2 text-[9px] uppercase tracking-wider text-slate-500">
                            {label}
                          </p>
                          <p className="mt-1 text-sm font-bold text-slate-100">
                            {value}
                          </p>
                        </div>
                      ))}
                    </div>

                    <div className="grid gap-3 lg:grid-cols-2">
                      <div className="rounded-[22px] bg-white/[0.045] p-4">
                        <p className="text-[10px] font-bold uppercase tracking-wider text-emerald-600">
                          Yearly Trend
                        </p>

                        <div className="mt-4 space-y-3">
                          {historicalData.yearly.map((item) => {
                            const maxRain = Math.max(
                              ...historicalData.yearly.map((x) => x.rainfall),
                              1
                            );

                            return (
                              <div key={item.year}>
                                <div className="flex justify-between text-[10px]">
                                  <span className="font-semibold">
                                    {item.year}
                                  </span>
                                  <span className="text-slate-500">
                                    {item.averageTemperature.toFixed(1)}°C ·{" "}
                                    {Math.round(item.rainfall)} mm
                                  </span>
                                </div>

                                <div className="mt-1.5 h-2 overflow-hidden rounded-full bg-white/[0.08]">
                                  <div
                                    className="h-full rounded-full bg-gradient-to-r from-emerald-400 to-cyan-500"
                                    style={{
                                      width: `${Math.max(
                                        4,
                                        (item.rainfall / maxRain) * 100
                                      )}%`,
                                    }}
                                  />
                                </div>
                              </div>
                            );
                          })}
                        </div>
                      </div>

                      <div className="rounded-[22px] bg-white/[0.045] p-4">
                        <p className="text-[10px] font-bold uppercase tracking-wider text-cyan-600">
                          Monthly Rainfall
                        </p>

                        <div className="mt-4 grid grid-cols-6 gap-2 sm:grid-cols-12">
                          {historicalData.monthly.map((item) => {
                            const maxRain = Math.max(
                              ...historicalData.monthly.map(
                                (x) => x.averageRainfall
                              ),
                              1
                            );

                            return (
                              <div
                                key={item.month}
                                className="flex min-w-0 flex-col items-center"
                              >
                                <div className="flex h-24 w-full items-end rounded-[10px] bg-white/[0.08] p-1">
                                  <div
                                    className="w-full rounded-md bg-gradient-to-t from-cyan-500 to-blue-300"
                                    style={{
                                      height: `${Math.max(
                                        8,
                                        (item.averageRainfall / maxRain) * 100
                                      )}%`,
                                    }}
                                    title={`${item.month}: ${item.averageRainfall.toFixed(
                                      1
                                    )} mm`}
                                  />
                                </div>
                                <p className="mt-1 text-[8px] text-slate-500">
                                  {item.month.slice(0, 3)}
                                </p>
                              </div>
                            );
                          })}
                        </div>
                      </div>
                    </div>

                    <p className="text-[10px] leading-5 text-slate-500">
                      Historical values come from Open-Meteo reanalysis data
                      and are intended for trend analysis, not official IMD
                      observations or warnings.
                    </p>
                  </div>
                ) : (
                  <p className="text-sm text-slate-500">
                    Historical climate analytics will appear after the weather
                    location loads.
                  </p>
                )}
              </div>
            </section>

            {/* ========================================================= */}
            {/* 10. CAPABILITIES */}
            {/* ========================================================= */}
            <section className="mt-8">
              <div className="mb-3 px-1">
                <p className="text-[10px] font-bold uppercase tracking-[0.18em] text-slate-500">
                  WeatherGPT
                </p>
                <h2 className="mt-1 text-xl font-bold tracking-tight">
                  Intelligence built in
                </h2>
              </div>

              <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                {[
                  ["🤖", "AI Weather Chat", "Natural-language weather questions."],
                  ["🗺️", "GIS Intelligence", "Explore weather through the map."],
                  ["⚠️", "Smart Advisories", "Identify important weather risks."],
                  ["🌧️", "Rain Analysis", "Understand precipitation probability."],
                  ["📊", "Forecast Comparison", "Compare forecast conditions."],
                  ["🌍", "Global Weather", "Search locations worldwide."],
                ].map(([icon, title, description]) => (
                  <div
                    key={title}
                    className="rounded-[22px] bg-white/[0.06] p-4 shadow-lg shadow-black/20 ring-1 ring-white/10"
                  >
                    <div className="text-2xl">{icon}</div>
                    <h3 className="mt-3 text-sm font-bold">{title}</h3>
                    <p className="mt-1 text-xs leading-5 text-slate-500">
                      {description}
                    </p>
                  </div>
                ))}
              </div>
            </section>

            {/* FOOTER */}
            <footer className="mt-12 border-t border-white/10 pt-7 text-center">
              <div className="text-sm font-bold text-slate-300">
                ☁️ WeatherGPT
              </div>
              <p className="mx-auto mt-2 max-w-xl text-[10px] leading-5 text-slate-500">
                WeatherGPT uses meteorological data and AI to interpret
                forecasts and provide useful weather insights. It is not a
                replacement for official weather warnings or emergency
                services.
              </p>
            </footer>
          </>
        ) : (
          <div className="flex min-h-[500px] items-center justify-center">
            <div className="rounded-[30px] bg-white/[0.08] p-10 text-center shadow-lg shadow-black/20">
              <div className="text-4xl">🌧️</div>
              <p className="mt-4 text-red-500">Unable to load weather data.</p>
              <button
                type="button"
                onClick={() =>
                  loadWeatherByCoordinates(17.385, 78.4867)
                }
                className="mt-5 rounded-full bg-white px-5 py-2.5 text-sm font-semibold text-white"
              >
                Try Again
              </button>
            </div>
          </div>
        )}
      </div>
    </main>
  );
}
