import { redirect } from "next/navigation"
import { createClient } from "@/lib/supabase/server"
import { fetchProfileRole } from "@/lib/supabase/profile-role"

export const dynamic = "force-dynamic"

export default async function Home() {
  const supabase = createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) {
    redirect("/login")
  }

  const profile = await fetchProfileRole(supabase, user.id)

  if (!profile.ok) {
    redirect("/login?error=profile")
  }

  if (profile.role === "manager") {
    redirect("/dashboard")
  }

  redirect("/input")
}
