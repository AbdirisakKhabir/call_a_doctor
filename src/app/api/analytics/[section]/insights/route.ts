import { NextRequest, NextResponse } from "next/server";
import { getAuthUser } from "@/lib/auth";
import { getAnalyticsSection } from "@/lib/analytics/sections";
import { ANALYTICS_BUILDERS, userCanViewSection } from "@/lib/analytics/registry";
import { resolveAnalyticsScope } from "@/lib/analytics/scope";
import { ANALYTICS_INSIGHT_SYSTEM_PROMPT, summariseReportForPrompt } from "@/lib/analytics/insight-prompt";
import { chatComplete, isOpenAiConfigured, openAiModel, OpenAiRequestError } from "@/lib/openai";

/** Reports the browser can render but the model cannot yet interpret, so the UI can hide the button. */
export async function GET(req: NextRequest, ctx: { params: Promise<{ section: string }> }) {
  const auth = await getAuthUser(req);
  if (!auth) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const section = getAnalyticsSection((await ctx.params).section);
  if (!section) return NextResponse.json({ error: "Unknown analytics section" }, { status: 404 });

  return NextResponse.json({ configured: isOpenAiConfigured(), model: isOpenAiConfigured() ? openAiModel() : null });
}

/**
 * The report is rebuilt server-side rather than trusting figures posted by the browser, so the
 * model only ever sees data the signed-in user is allowed to view.
 */
export async function POST(req: NextRequest, ctx: { params: Promise<{ section: string }> }) {
  try {
    const auth = await getAuthUser(req);
    if (!auth) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const section = getAnalyticsSection((await ctx.params).section);
    if (!section) return NextResponse.json({ error: "Unknown analytics section" }, { status: 404 });

    if (!(await userCanViewSection(auth.userId, section))) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    if (!isOpenAiConfigured()) {
      return NextResponse.json(
        {
          error:
            "AI insights are not configured. Add OPENAI_API_KEY to your .env file and restart the server to enable them.",
          configured: false,
        },
        { status: 503 }
      );
    }

    const { searchParams } = new URL(req.url);
    const scopeResult = await resolveAnalyticsScope(searchParams, auth.userId);
    if (!scopeResult.ok) {
      return NextResponse.json({ error: scopeResult.error }, { status: scopeResult.status });
    }

    const report = await ANALYTICS_BUILDERS[section.key](scopeResult.scope);
    const insight = await chatComplete({
      system: ANALYTICS_INSIGHT_SYSTEM_PROMPT,
      user: summariseReportForPrompt(report),
    });

    return NextResponse.json({
      configured: true,
      section: section.key,
      model: openAiModel(),
      generatedAt: new Date().toISOString(),
      range: report.range,
      branchLabel: report.branchLabel,
      insight,
    });
  } catch (e) {
    if (e instanceof OpenAiRequestError) {
      return NextResponse.json({ error: e.message, configured: true }, { status: e.status >= 500 ? 502 : 400 });
    }
    console.error(e);
    return NextResponse.json({ error: "Failed to generate AI insights" }, { status: 500 });
  }
}
