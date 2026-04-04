import type { SupabaseClient } from "@supabase/supabase-js"

export type AppRole = "manager" | "staff"

export async function fetchProfileRole(
  supabase: SupabaseClient,
  userId: string
): Promise<
  | { ok: true; role: AppRole }
  | { ok: false; reason: "missing" | "invalid" | "error"; message?: string }
> {
  const { data, error } = await supabase
    .from("profiles")
    .select("role")
    .eq("id", userId)
    .maybeSingle()

  if (error) {
    return { ok: false, reason: "error", message: error.message }
  }

  const role = data?.role
  if (role == null || role === "") {
    return { ok: false, reason: "missing" }
  }

  if (role === "manager" || role === "staff") {
    return { ok: true, role }
  }

  return { ok: false, reason: "invalid", message: String(role) }
}
