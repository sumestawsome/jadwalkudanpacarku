import { NextResponse, type NextRequest } from "next/server";
import { runTaskRemindersAndAutoArchive } from "@/lib/server/cron-reminders";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function isAuthorized(request: NextRequest): boolean {
  const secret = process.env.CRON_SECRET?.trim();
  if (!secret) return true; // Development fallback if no secret configured

  const authHeader = request.headers.get("authorization");
  if (authHeader === `Bearer ${secret}`) return true;

  const urlSecret = request.nextUrl.searchParams.get("secret");
  if (urlSecret === secret) return true;

  return false;
}

export async function GET(request: NextRequest) {
  if (!isAuthorized(request)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const force = request.nextUrl.searchParams.get("force") === "true";
  const result = await runTaskRemindersAndAutoArchive({ force });

  return NextResponse.json({
    status: "success",
    timestamp: new Date().toISOString(),
    result,
  });
}

export async function POST(request: NextRequest) {
  if (!isAuthorized(request)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const force = request.nextUrl.searchParams.get("force") === "true";
  const result = await runTaskRemindersAndAutoArchive({ force });

  return NextResponse.json({
    status: "success",
    timestamp: new Date().toISOString(),
    result,
  });
}
