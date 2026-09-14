import { NextResponse } from "next/server";

export async function GET() {
  try {
    const apiKey = process.env.GEMINI_API_KEY;

    if (!apiKey) {
      return NextResponse.json(
        {
          success: false,
          error: "GEMINI_API_KEY is not configured.",
        },
        { status: 500 }
      );
    }

    const response = await fetch(
      "https://generativelanguage.googleapis.com/v1beta/models/gemini-3.5-flash:generateContent",
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-goog-api-key": apiKey,
        },
        body: JSON.stringify({
          contents: [
            {
              role: "user",
              parts: [
                {
                  text: "Reply with exactly: Gemini is working",
                },
              ],
            },
          ],
          generationConfig: {
            temperature: 0,
            maxOutputTokens: 20,
          },
        }),
      }
    );

    const responseText = await response.text();

    if (!response.ok) {
      console.error(
        "Gemini test failed:",
        response.status,
        responseText
      );

      return NextResponse.json(
        {
          success: false,
          geminiStatus: response.status,
          geminiResponse: responseText,
        },
        { status: 502 }
      );
    }

    let data;

    try {
      data = JSON.parse(responseText);
    } catch {
      return NextResponse.json({
        success: false,
        error: "Gemini returned invalid JSON.",
        rawResponse: responseText,
      });
    }

    const answer =
      data.candidates?.[0]?.content?.parts
        ?.map((part: { text?: string }) => part.text || "")
        .join(" ")
        .trim();

    return NextResponse.json({
      success: true,
      answer: answer || null,
      model: "gemini-3.5-flash",
    });
  } catch (error) {
    console.error("Gemini test error:", error);

    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : String(error),
      },
      { status: 500 }
    );
  }
}