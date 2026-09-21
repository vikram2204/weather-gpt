# 🌦️ WeatherGPT

### Conversational Weather Intelligence for Forecasts, Alerts & Climate Insights

WeatherGPT is a modern weather intelligence platform that combines real-time weather data, forecast analysis, weather alerts, NWP model comparison, interactive maps, historical climate analysis, multilingual interaction, voice input, and deterministic weather reasoning into a single conversational interface.

🔗 **Live Demo:** https://weather-gpt-nu.vercel.app/

---

## ✨ Features

| Feature | Description |
|---|---|
| 🌤️ Real-Time Weather | Current temperature, humidity, wind, precipitation and conditions |
| 💬 WeatherGPT | Ask natural-language questions about the weather |
| 🚨 Smart Alerts | Detects rain, thunderstorms, fog, heat and strong winds |
| 🧠 Weather Intelligence | Rule-based reasoning for weather questions and decisions |
| 📊 NWP Comparison | Compare forecast information from numerical weather prediction models |
| 🗺️ Interactive Weather Map | Map-based weather visualization with radar and weather layers |
| 📅 7-Day Forecast | Daily forecast with temperature, rain probability and wind |
| ⏱️ Hourly Forecast | Hour-by-hour weather analysis |
| 📈 Climate Analytics | Historical weather analysis and trends |
| 🌍 Multilingual | Weather interaction in multiple Indian languages |
| 🎙️ Voice Input | Ask weather questions using voice |
| 🇮🇳 IMD Integration | Integration with official Indian meteorological warning information |
| 🛡️ Impact Advisory | Weather-based advisory for travel, outdoor activities, agriculture and urban conditions |
| 📉 Forecast Confidence | Estimates confidence using multiple weather signals |

---

# 🏗️ Architecture

```text
                         ┌──────────────────────┐
                         │      WeatherGPT      │
                         │   Next.js Frontend   │
                         └──────────┬───────────┘
                                    │
                                    ▼
                         ┌──────────────────────┐
                         │      API Layer       │
                         │   Next.js API Routes │
                         └──────────┬───────────┘
                                    │
              ┌─────────────────────┼─────────────────────┐
              │                     │                     │
              ▼                     ▼                     ▼
      ┌───────────────┐     ┌───────────────┐     ┌─────────────────┐
      │ Weather Engine│     │   NWP Engine  │     │ Intelligence    │
      │               │     │               │     │ Engine          │
      └───────┬───────┘     └───────┬───────┘     └────────┬────────┘
              │                     │                      │
              ▼                     ▼                      ▼
        Open-Meteo             NWP Data              Rule-Based
                                                      Reasoning
              │                     │                      │
              └─────────────────────┼──────────────────────┘
                                    │
                                    ▼
                         ┌──────────────────────┐
                         │ Weather Intelligence │
                         ├──────────────────────┤
                         │ Alerts               │
                         │ Forecast Analysis    │
                         │ Impact Advisory      │
                         │ Confidence Analysis  │
                         │ Historical Analysis  │
                         └──────────────────────┘
