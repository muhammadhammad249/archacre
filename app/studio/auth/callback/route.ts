import { type NextRequest, NextResponse } from "next/server";
import { getStudioClient, getStudioMember, studioConfigured } from "../../../../lib/studio-auth";
import { studioOrigin } from "../../../../lib/studio-auth-config";

export async function GET(request: NextRequest) {
  const origin = studioOrigin();
  if (!origin || !studioConfigured()) {
    return new NextResponse("Password recovery is unavailable.", { status: 503 });
  }

  const code = request.nextUrl.searchParams.get("code");
  if (code && code.length <= 512) {
    const supabase = await getStudioClient();
    const flowId = request.nextUrl.searchParams.get("sb_flow_id");
    const { data, error } = await supabase.auth.exchangeCodeForSession(code, flowId ? { flowId } : undefined);
    if (!error && data.session && await getStudioMember(supabase)) {
      return NextResponse.redirect(new URL("/studio/reset", origin));
    }
    if (!error && data.session) await supabase.auth.signOut({ scope: "local" });
  }

  return NextResponse.redirect(new URL("/studio/forgot?expired=1", origin));
}
