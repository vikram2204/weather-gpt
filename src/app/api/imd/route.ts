import { NextRequest, NextResponse } from "next/server";
import axios from "axios";

type IMDWarningResponse = {
  Obj_id?: string | number;
  Date?: string;
  UTC?: string;
  District?: string;
  Day_1?: string;
  Day_2?: string;
  Day_3?: string;
  Day_4?: string;
  Day_5?: string;
  Day1_Color?: string | number;
  Day2_Color?: string | number;
  Day3_Color?: string | number;
  Day4_Color?: string | number;
  Day5_Color?: string | number;
  [key: string]: unknown;
};

const WARNING_CODES: Record<string, string> = {
  "1": "No Warning",
  "2": "Heavy Rain",
  "3": "Heavy Snow",
  "4": "Thunderstorm & Lightning / Squall",
  "5": "Hailstorm",
  "6": "Dust Storm",
  "7": "Dust Raising Winds",
  "8": "Strong Surface Winds",
  "9": "Heat Wave",
  "10": "Hot Day",
  "11": "Warm Night",
  "12": "Cold Wave",
  "13": "Cold Day",
  "14": "Ground Frost",
  "15": "Fog",
  "16": "Very Heavy Rain",
  "17": "Extremely Heavy Rain",
};

const COLOR_LEVELS: Record<
  string,
  {
    severity: "normal" | "moderate" | "high" | "extreme";
    name: string;
  }
> = {
  "1": {
    severity: "extreme",
    name: "Red",
  },
  "2": {
    severity: "high",
    name: "Orange",
  },
  "3": {
    severity: "moderate",
    name: "Yellow",
  },
  "4": {
    severity: "normal",
    name: "Green",
  },
};

function parseWarningCodes(value: unknown) {
  if (!value) return [];

  return String(value)
    .split(",")
    .map((code) => code.trim())
    .filter(Boolean)
    .map((code) => ({
      code,
      description:
        WARNING_CODES[code] || "Weather Warning",
    }));
}

function getSeverity(color: unknown) {
  if (!color) return "normal";

  return (
    COLOR_LEVELS[String(color)]?.severity ||
    "normal"
  );
}

function getColorName(color: unknown) {
  if (!color) return "Unknown";

  return (
    COLOR_LEVELS[String(color)]?.name ||
    "Unknown"
  );
}

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);

    const districtId = searchParams.get("districtId");

    // --------------------------------------------------
    // VALIDATE DISTRICT ID
    // --------------------------------------------------

    if (!districtId) {
      return NextResponse.json(
        {
          success: false,

          source: "India Meteorological Department",

          message:
            "No official IMD district ID was supplied.",

          note:
            "IMD requires the official obj_id of the district. Do not use a guessed district ID.",
        },
        {
          status: 400,
        }
      );
    }

    // --------------------------------------------------
    // OFFICIAL IMD API
    // --------------------------------------------------

    const response = await axios.get<IMDWarningResponse>(
      "https://mausam.imd.gov.in/api/warnings_district_api.php",
      {
        params: {
          id: districtId,
        },

        timeout: 10000,
      }
    );

    const data = response.data;

    // --------------------------------------------------
    // EXTRACT DAILY WARNINGS
    // --------------------------------------------------

    const days = [
      {
        day: 1,
        warning: data.Day_1,
        color: data.Day1_Color,
      },
      {
        day: 2,
        warning: data.Day_2,
        color: data.Day2_Color,
      },
      {
        day: 3,
        warning: data.Day_3,
        color: data.Day3_Color,
      },
      {
        day: 4,
        warning: data.Day_4,
        color: data.Day4_Color,
      },
      {
        day: 5,
        warning: data.Day_5,
        color: data.Day5_Color,
      },
    ];

    const warnings = days
      .map((item) => {
        const warningCodes = parseWarningCodes(
          item.warning
        );

        return {
          day: item.day,

          warningCodes,

          warningDescriptions:
            warningCodes.map(
              (warning) => warning.description
            ),

          color: item.color,

          colorName: getColorName(item.color),

          severity: getSeverity(item.color),
        };
      })
      .filter(
        (item) =>
          item.warningCodes.length > 0 &&
          !(
            item.warningCodes.length === 1 &&
            item.warningCodes[0].code === "1"
          )
      );

    // --------------------------------------------------
    // HIGHEST SEVERITY
    // --------------------------------------------------

    const severityRank = {
      normal: 0,
      moderate: 1,
      high: 2,
      extreme: 3,
    };

    let highestSeverity:
      | "normal"
      | "moderate"
      | "high"
      | "extreme" = "normal";

    for (const warning of warnings) {
      if (
        severityRank[warning.severity] >
        severityRank[highestSeverity]
      ) {
        highestSeverity = warning.severity;
      }
    }

    // --------------------------------------------------
    // RESPONSE
    // --------------------------------------------------

    return NextResponse.json({
      success: true,

      source: {
        name: "India Meteorological Department",

        organization:
          "Ministry of Earth Sciences, Government of India",

        type: "Official District Weather Warning",
      },

      district: {
        id: districtId,

        name: data.District || "Unknown District",
      },

      issued: {
        date: data.Date || null,

        utc: data.UTC || null,
      },

      warnings,

      summary: {
        totalWarningDays: warnings.length,

        highestSeverity,
      },

      raw: data,

      fetchedAt: new Date().toISOString(),
    });
  } catch (error) {
    console.error("IMD warning API error:", error);

    if (axios.isAxiosError(error)) {
      return NextResponse.json(
        {
          success: false,

          source:
            "India Meteorological Department",

          error:
            error.response?.data ||
            error.message ||
            "Unable to fetch official IMD warnings.",
        },
        {
          status:
            error.response?.status || 502,
        }
      );
    }

    return NextResponse.json(
      {
        success: false,

        source:
          "India Meteorological Department",

        error:
          "Unable to fetch official IMD warnings.",
      },
      {
        status: 500,
      }
    );
  }
}