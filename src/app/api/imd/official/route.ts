import { NextResponse } from "next/server";

export async function GET() {
  try {
    const response = await fetch(
      "https://mausam.imd.gov.in/imd_latest/contents/districtwise-warning_mc.php?id=1",
      {
        headers: {
          "User-Agent": "WeatherGPT/1.0",
        },
        cache: "no-store",
      }
    );

    if (!response.ok) {
      throw new Error(
        `IMD request failed: ${response.status}`
      );
    }

    const html = await response.text();

    // --------------------------------------------------
    // EXTRACT DATE OPTIONS
    // --------------------------------------------------

    const dates = [
      ...html.matchAll(
        /September\s+\d{1,2},\s+2026/gi
      ),
    ].map((match) => match[0]);

    const uniqueDates = Array.from(
      new Set(dates)
    );

    // --------------------------------------------------
    // BASIC WARNING EXTRACTION
    // --------------------------------------------------

    const warningKeywords = [
      "Heavy Rain",
      "Very Heavy Rain",
      "Extremely Heavy Rain",
      "Thunderstorm",
      "Lightning",
      "Squall",
      "Hailstorm",
      "Strong Surface Winds",
      "Heat Wave",
      "Hot Day",
      "Cold Wave",
      "Cold Day",
      "Fog",
      "Dust Storm",
    ];

    const detectedWarnings =
      warningKeywords.filter((keyword) =>
        html
          .toLowerCase()
          .includes(keyword.toLowerCase())
      );

    // --------------------------------------------------
    // RESPONSE
    // --------------------------------------------------

    return NextResponse.json({
      success: true,

      source: {
        name: "India Meteorological Department",
        organization:
          "Ministry of Earth Sciences, Government of India",
        location: "Met Centre Hyderabad",
      },

      official: true,

      region: "Hyderabad / Telangana",

      warningTypes: detectedWarnings,

      availableDates: uniqueDates,

      sourceUrl:
        "https://mausam.imd.gov.in/imd_latest/contents/districtwise-warning_mc.php?id=1",

      fetchedAt: new Date().toISOString(),
    });
  } catch (error) {
    console.error(
      "Official IMD warning error:",
      error
    );

    return NextResponse.json(
      {
        success: false,

        official: true,

        source:
          "India Meteorological Department",

        error:
          "Unable to retrieve the official IMD warning page.",
      },
      {
        status: 502,
      }
    );
  }
}