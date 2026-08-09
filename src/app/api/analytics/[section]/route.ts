import { NextRequest, NextResponse } from "next/server";
import { getAuthUser } from "@/lib/auth";
import { getAnalyticsSection } from "@/lib/analytics/sections";
import { ANALYTICS_BUILDERS, userCanViewSection } from "@/lib/analytics/registry";
import { resolveAnalyticsScope } from "@/lib/analytics/scope";

export async function GET(req: NextRequest, ctx: { params: Promise<{ section: string }> }) {
  try {
    const auth = await getAuthUser(req);
    if (!auth) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const section = getAnalyticsSection((await ctx.params).section);
    if (!section) return NextResponse.json({ error: "Unknown analytics section" }, { status: 404 });

    if (!(await userCanViewSection(auth.userId, section))) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const { searchParams } = new URL(req.url);
    const scopeResult = await resolveAnalyticsScope(searchParams, auth.userId);
    if (!scopeResult.ok) {
      return NextResponse.json({ error: scopeResult.error }, { status: scopeResult.status });
    }

    const report = await ANALYTICS_BUILDERS[section.key](scopeResult.scope);
    return NextResponse.json(report);
  } catch (e) {
    console.error(e);
    return NextResponse.json({ error: "Failed to build the analytics report" }, { status: 500 });
  }
}
