import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";

const siteUrl = Deno.env.get("PORTAL_SITE_URL");
const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
const supabaseUrl = Deno.env.get("SUPABASE_URL");

const corsHeaders = {
  "Access-Control-Allow-Origin": siteUrl ? new URL(siteUrl).origin : "null",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Content-Type": "application/json"
};

function jsonResponse(status: number, body: Record<string, unknown>) {
  return new Response(JSON.stringify(body), { status, headers: corsHeaders });
}

function cleanText(value: unknown, maxLength: number): string | null {
  if (typeof value !== "string") return null;
  const text = value.trim();
  return text.length <= maxLength ? text : null;
}

function isValidDate(value: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const date = new Date(`${value}T00:00:00.000Z`);
  return !Number.isNaN(date.getTime()) && date.toISOString().slice(0, 10) === value;
}

Deno.serve(async (request: Request) => {
  if (request.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (request.method !== "POST") return jsonResponse(405, { error: "Only POST requests are supported." });
  if (!supabaseUrl || !serviceRoleKey || !siteUrl) {
    console.error("Project invitation function is missing SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, or PORTAL_SITE_URL.");
    return jsonResponse(500, { error: "The project invitation service is not configured." });
  }

  const authorization = request.headers.get("Authorization");
  const accessToken = authorization?.match(/^Bearer\s+(.+)$/i)?.[1];
  if (!accessToken) return jsonResponse(401, { error: "Sign in as a staff member to create a project invitation." });

  let input: Record<string, unknown>;
  try {
    input = await request.json();
  } catch {
    return jsonResponse(400, { error: "The request body must be valid JSON." });
  }
  if (!input || typeof input !== "object" || Array.isArray(input)) {
    return jsonResponse(400, { error: "The project details are invalid." });
  }

  const clientName = cleanText(input.clientName, 120);
  const email = cleanText(input.email, 254)?.toLowerCase() ?? null;
  const title = cleanText(input.title, 160);
  const reference = cleanText(input.reference ?? "", 80);
  const projectNote = cleanText(input.projectNote ?? "", 1200);
  const duration = cleanText(input.duration ?? "", 100);
  const kind = input.kind;
  const status = input.status;
  let startDate: string | null = null;

  if (!clientName || !title || reference === null || projectNote === null || duration === null) {
    return jsonResponse(400, { error: "Enter a customer name and project title, and keep project details within the field limits." });
  }
  if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return jsonResponse(400, { error: "Enter a valid customer email address." });
  }
  if (kind !== "bathroom" && kind !== "kitchen") {
    return jsonResponse(400, { error: "Choose either a bathroom or kitchen project." });
  }
  if (status !== "progress" && status !== "finishing" && status !== "completed") {
    return jsonResponse(400, { error: "Choose a valid project status." });
  }
  if (input.startDate !== undefined && input.startDate !== null && input.startDate !== "") {
    if (typeof input.startDate !== "string" || !isValidDate(input.startDate)) {
      return jsonResponse(400, { error: "Enter a valid project start date." });
    }
    startDate = input.startDate;
  }

  const redirectUrl = new URL("/login.html", siteUrl);
  const supabase = createClient(supabaseUrl, serviceRoleKey, {
    auth: { autoRefreshToken: false, persistSession: false }
  });
  const { data: userData, error: userError } = await supabase.auth.getUser(accessToken);
  if (userError || !userData.user) return jsonResponse(401, { error: "Your session is invalid or has expired. Sign in again." });

  const { data: profile, error: profileError } = await supabase
    .from("profiles")
    .select("role")
    .eq("id", userData.user.id)
    .maybeSingle();
  if (profileError) {
    console.error("Could not verify the staff role:", profileError);
    return jsonResponse(500, { error: "Could not verify staff access." });
  }
  if (profile?.role !== "staff") return jsonResponse(403, { error: "Only staff members can create projects and invite customers." });

  const projectId = crypto.randomUUID();
  const { error: projectError } = await supabase.from("projects").insert({
    id: projectId,
    title,
    client_name: clientName,
    reference: reference || projectId,
    kind,
    status,
    project_note: projectNote,
    start_date: startDate,
    duration
  });
  if (projectError) {
    console.error("Could not create the project record:", projectError);
    return jsonResponse(500, { error: "The project record could not be created." });
  }

  const { data: invitation, error: invitationError } = await supabase.auth.admin.inviteUserByEmail(email, {
    redirectTo: redirectUrl.toString()
  });
  if (invitationError || !invitation?.user) {
    const { error: cleanupError } = await supabase.from("projects").delete().eq("id", projectId);
    if (cleanupError) console.error("Invitation failed and project cleanup also failed:", cleanupError);
    if (invitationError) console.error("Could not invite the customer:", invitationError);
    return jsonResponse(409, {
      error: cleanupError
        ? "The invitation failed and the project could not be removed. Contact an administrator."
        : "The customer invitation could not be sent. Check the email address and whether the customer already has an account."
    });
  }

  const { error: customerProfileError } = await supabase.from("profiles").insert({
    id: invitation.user.id,
    role: "client",
    project_id: projectId
  });
  if (customerProfileError) {
    const { error: userCleanupError } = await supabase.auth.admin.deleteUser(invitation.user.id);
    const { error: projectCleanupError } = await supabase.from("projects").delete().eq("id", projectId);
    if (userCleanupError || projectCleanupError) {
      console.error("Profile creation failed; invitation-user or project cleanup failed:", {
        userCleanupError,
        projectCleanupError
      });
    }
    console.error("Could not create the customer profile:", customerProfileError);
    return jsonResponse(500, {
      error: userCleanupError || projectCleanupError
        ? "Customer setup failed and automatic cleanup was incomplete. Contact an administrator."
        : "The customer profile could not be created; the project and invitation were rolled back."
    });
  }

  return jsonResponse(201, { ok: true, projectId });
});
