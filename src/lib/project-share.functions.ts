import { createServerFn } from "@tanstack/react-start";
import { getRequest } from "@tanstack/react-start/server";

/**
 * Resolve a project share token and add the caller as a viewer.
 *
 * NOTE: We intentionally do NOT use the generated `requireSupabaseAuth`
 * middleware here. That middleware validates the bearer token with
 * `supabase.auth.getClaims()`, which performs local JWKS verification and
 * has been observed to reject legitimate sessions with
 * "Unauthorized: Invalid token" on this project. We use `supabase.auth.getUser(token)`
 * instead — it re-validates against Supabase Auth over HTTPS and is the
 * canonical way to identify the caller from a bearer token.
 */
export const joinProjectByShareToken = createServerFn({ method: "POST" })
  .inputValidator((data: { token: string }) => {
    const token = (data?.token ?? "").trim();
    if (!token || token.length > 200) throw new Error("Invalid share token");
    return { token };
  })
  .handler(async ({ data }) => {
    const request = getRequest();
    const authHeader = request?.headers.get("authorization") ?? "";
    if (!authHeader.toLowerCase().startsWith("bearer ")) {
      throw new Error("Please sign in to join this project");
    }
    const bearer = authHeader.slice(7).trim();
    if (!bearer) throw new Error("Please sign in to join this project");

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    const { data: userRes, error: userErr } = await supabaseAdmin.auth.getUser(bearer);
    if (userErr || !userRes?.user?.id) {
      throw new Error("Please sign in to join this project");
    }
    const userId = userRes.user.id;

    const { data: link, error: linkErr } = await supabaseAdmin
      .from("project_share_links")
      .select("project_id, enabled")
      .eq("token", data.token)
      .maybeSingle();
    if (linkErr) throw new Error(linkErr.message);
    if (!link) throw new Error("Invalid share link");
    if (!link.enabled) throw new Error("This project is no longer shared");

    const { data: project, error: projErr } = await supabaseAdmin
      .from("projects")
      .select("id, owner_id")
      .eq("id", link.project_id)
      .maybeSingle();
    if (projErr) throw new Error(projErr.message);
    if (!project) throw new Error("Project not found");

    if (project.owner_id !== userId) {
      const { error: memErr } = await supabaseAdmin
        .from("project_members")
        .insert({ project_id: project.id, user_id: userId, role: "viewer" });
      if (memErr && !/duplicate/i.test(memErr.message)) {
        throw new Error(memErr.message);
      }
    }

    return { projectId: project.id };
  });
