import { NextRequest, NextResponse } from "next/server";
import { grokAuth } from "../../auth";
import { prettyObject } from "@/app/utils/format";
import { Grok, ModelProvider } from "@/app/constant";

import { requestGrok } from "../../common";

const ALLOWD_PATH = new Set(Object.values(Grok));

async function handle(
  req: NextRequest,
  { params }: { params: { path: string[] } },
) {
  if (req.method === "OPTIONS") {
    return NextResponse.json({ body: "OK" }, { status: 200 });
  }

  const subpath = params.path.join("/");

  if (!ALLOWD_PATH.has(subpath)) {
    console.log("[ChatGrok Route] forbidden path ", subpath);
    return NextResponse.json(
      {
        error: true,
        msg: "you are not allowed to request " + subpath,
      },
      {
        status: 403,
      },
    );
  }
  // 防抖函数
  const authResult = await grokAuth(req, ModelProvider.Grok);
  if (authResult.error) {
    return NextResponse.json(authResult, {
      status: 401,
    });
  }

  try {
    const response = await requestGrok(req);

    return response;
  } catch (e) {
    console.error("[ChatGrok] ", e);
    return NextResponse.json(prettyObject(e));
  }
}

export const GET = handle;
export const POST = handle;

export const runtime = "edge";
export const preferredRegion = [
  "arn1",
  "bom1",
  "cdg1",
  "cle1",
  "cpt1",
  "dub1",
  "fra1",
  "gru1",
  "hnd1",
  "iad1",
  "icn1",
  "kix1",
  "lhr1",
  "pdx1",
  "sfo1",
  "sin1",
  "syd1",
];
