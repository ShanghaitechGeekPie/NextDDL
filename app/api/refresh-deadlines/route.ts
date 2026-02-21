import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { refreshUserDeadlinesDetailed } from "@/lib/deadlines";

export async function GET() {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const result = await refreshUserDeadlinesDetailed(user.id);
    return NextResponse.json({
      ok: true,
      count: result.items.length,
      expiredPlatforms: result.expiredPlatforms,
    });
  } catch (error) {
    console.error(error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Unknown error" },
      { status: 500 }
    );
  }
}
