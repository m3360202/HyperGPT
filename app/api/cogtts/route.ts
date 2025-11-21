import { NextRequest, NextResponse } from "next/server";

export async function POST(req: NextRequest) {
  try {
    const { text } = await req.json();

    if (!text) {
      return NextResponse.json({ error: "Text is required" }, { status: 400 });
    }

    const apiKey = process.env.NEXT_PUBLIC_GLM_APP_KEY;
    if (!apiKey) {
      return NextResponse.json(
        { error: "API Key not configured" },
        { status: 500 },
      );
    }

    const response = await fetch(
      "https://open.bigmodel.cn/api/paas/v4/audio/speech",
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${apiKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          model: "cogtts",
          input: text,
          voice: "female",
          response_format: "pcm",
          encode_format: "base64",
          stream: true,
          speed: 1.0,
          volume: 1.0,
        }),
      },
    );

    if (!response.ok || !response.body) {
      const errorText = await response.text();
      console.error("CogTTS Error:", response.status, errorText);
      return NextResponse.json(
        { error: `CogTTS API Error: ${response.status}` },
        { status: response.status },
      );
    }

    const stream = new ReadableStream({
      async start(controller) {
        const reader = response.body!.getReader();
        const decoder = new TextDecoder();

        try {
          while (true) {
            const { done, value } = await reader.read();
            if (done) break;

            const chunk = decoder.decode(value, { stream: true });
            controller.enqueue(new TextEncoder().encode(chunk));
          }
        } catch (err) {
          console.error("Stream reading error", err);
          controller.error(err);
        } finally {
          controller.close();
        }
      },
    });

    return new NextResponse(stream, {
      headers: {
        "Content-Type": "text/event-stream",
        "Cache-Control": "no-cache",
        Connection: "keep-alive",
      },
    });
  } catch (e) {
    console.error(e);
    return NextResponse.json(
      { error: "Internal Server Error" },
      { status: 500 },
    );
  }
}
