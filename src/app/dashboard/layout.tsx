import { redirect } from "next/navigation"
import { createClient } from "@/lib/supabase/server"
import {
  DashboardHeader,
  DashboardSidebar,
} from "@/components/dashboard/dashboard-sidebar"

export const dynamic = "force-dynamic"

export default async function DashboardLayout({
  children,
}: {
  children: React.ReactNode
}) {
  const supabase = createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) {
    redirect("/login")
  }

  const { data: profile } = await supabase
    .from("profiles")
    .select("role")
    .eq("id", user.id)
    .maybeSingle()

  const meta = user.user_metadata as Record<string, unknown> | undefined
  const fromMeta =
    typeof meta?.full_name === "string"
      ? meta.full_name
      : typeof meta?.name === "string"
        ? meta.name
        : null

  const userName =
    fromMeta ||
    (typeof user.email === "string" ? user.email.split("@")[0] : null) ||
    "Pengguna"

  const roleLabel =
    profile?.role === "manager" || profile?.role === "staff"
      ? profile.role
      : "manager"

  return (
    <div className="bg-background flex min-h-svh w-full flex-col md:flex-row">
      <DashboardSidebar />
      <div className="flex min-w-0 flex-1 flex-col">
        <DashboardHeader userName={userName} roleLabel={roleLabel} />
        <div className="flex-1 overflow-auto p-4 sm:p-6">{children}</div>
      </div>
    </div>
  )
}
