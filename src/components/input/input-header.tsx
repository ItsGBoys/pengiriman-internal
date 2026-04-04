"use client"

import { useRouter } from "next/navigation"
import { LogOut } from "lucide-react"
import { createClient } from "@/lib/supabase/client"
import { Button } from "@/components/ui/button"

export function InputHeader() {
  const router = useRouter()

  async function handleLogout() {
    const supabase = createClient()
    await supabase.auth.signOut()
    router.refresh()
    router.push("/login")
  }

  return (
    <header className="border-border bg-card sticky top-0 z-40 flex items-center justify-between gap-3 border-b px-4 py-3 sm:px-6">
      <div>
        <h1 className="text-base font-semibold tracking-tight sm:text-lg">
          Input pengiriman
        </h1>
        <p className="text-muted-foreground text-xs sm:text-sm">Staff</p>
      </div>
      <Button
        type="button"
        variant="outline"
        size="sm"
        className="gap-2"
        onClick={handleLogout}
      >
        <LogOut className="size-4" aria-hidden />
        Logout
      </Button>
    </header>
  )
}
