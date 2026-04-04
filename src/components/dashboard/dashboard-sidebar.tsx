"use client"

import Link from "next/link"
import { usePathname, useRouter } from "next/navigation"
import { BarChart3, LayoutDashboard, LogOut, Truck } from "lucide-react"
import { createClient } from "@/lib/supabase/client"
import { Button } from "@/components/ui/button"
import { cn } from "@/lib/utils"

const nav = [
  { href: "/dashboard", label: "Dashboard", icon: LayoutDashboard },
  {
    href: "/dashboard/daftar-pengiriman",
    label: "Daftar Pengiriman",
    icon: Truck,
  },
  { href: "/dashboard/rekap", label: "Rekap & Chart", icon: BarChart3 },
]

export function DashboardSidebar() {
  const pathname = usePathname()
  const router = useRouter()

  async function handleLogout() {
    const supabase = createClient()
    await supabase.auth.signOut()
    router.refresh()
    router.push("/login")
  }

  return (
    <aside className="bg-card border-border flex w-full flex-col border-b md:w-60 md:shrink-0 md:border-r md:border-b-0">
      <div className="border-border hidden border-b px-4 py-4 md:block">
        <p className="text-muted-foreground text-xs font-medium tracking-wide uppercase">
          Menu
        </p>
      </div>
      <nav className="flex gap-1 overflow-x-auto p-2 md:flex-col md:overflow-visible md:p-3">
        {nav.map(({ href, label, icon: Icon }) => {
          const active =
            href === "/dashboard"
              ? pathname === "/dashboard"
              : pathname === href || pathname.startsWith(`${href}/`)
          return (
            <Link
              key={href}
              href={href}
              className={cn(
                "flex items-center gap-2 rounded-lg px-3 py-2 text-sm font-medium whitespace-nowrap transition-colors",
                active
                  ? "bg-primary text-primary-foreground"
                  : "text-muted-foreground hover:bg-muted hover:text-foreground"
              )}
            >
              <Icon className="size-4 shrink-0" aria-hidden />
              {label}
            </Link>
          )
        })}
      </nav>
      <div className="border-border mt-auto border-t p-2 md:p-3">
        <Button
          type="button"
          variant="outline"
          className="w-full justify-start gap-2"
          onClick={handleLogout}
        >
          <LogOut className="size-4" aria-hidden />
          Logout
        </Button>
      </div>
    </aside>
  )
}

type DashboardHeaderProps = {
  userName: string
  roleLabel: string
}

export function DashboardHeader({ userName, roleLabel }: DashboardHeaderProps) {
  return (
    <header className="border-border bg-card/80 supports-[backdrop-filter]:bg-card/60 flex flex-col gap-1 border-b px-4 py-3 backdrop-blur-sm sm:flex-row sm:items-center sm:justify-between sm:px-6">
      <div>
        <p className="text-muted-foreground text-xs sm:text-sm">Selamat datang,</p>
        <p className="truncate text-base font-semibold sm:text-lg">{userName}</p>
      </div>
      <div className="flex items-center gap-2">
        <span className="text-muted-foreground text-xs sm:text-sm">Role</span>
        <span className="bg-secondary text-secondary-foreground rounded-md px-2.5 py-0.5 text-xs font-medium capitalize">
          {roleLabel}
        </span>
      </div>
    </header>
  )
}
