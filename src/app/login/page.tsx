"use client"

import { Suspense, useEffect, useState } from "react"
import { useRouter, useSearchParams } from "next/navigation"
import { createClient } from "@/lib/supabase/client"
import { Button } from "@/components/ui/button"
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"

const PROFILE_ERRORS: Record<string, string> = {
  profile:
    "Profil atau peran akun tidak ditemukan. Pastikan baris di tabel public.profiles sudah dibuat untuk user ini.",
}

function formatAuthError(message: string): string {
  const m = message.toLowerCase()
  if (m.includes("invalid login credentials")) {
    return "Email atau kata sandi salah. Periksa kembali dan coba lagi."
  }
  if (m.includes("email not confirmed")) {
    return "Email belum dikonfirmasi. Cek kotak masuk Anda atau hubungi administrator."
  }
  if (m.includes("too many requests")) {
    return "Terlalu banyak percobaan masuk. Tunggu sebentar lalu coba lagi."
  }
  return message
}

function LoginForm() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const urlError = searchParams.get("error")

  const [email, setEmail] = useState("")
  const [password, setPassword] = useState("")
  const [error, setError] = useState<string | null>(
    urlError && PROFILE_ERRORS[urlError] ? PROFILE_ERRORS[urlError] : null
  )
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    let cancelled = false

    async function redirectIfSession() {
      const supabase = createClient()
      const {
        data: { user },
      } = await supabase.auth.getUser()
      if (!user || cancelled) return

      const { data: row } = await supabase
        .from("profiles")
        .select("role")
        .eq("id", user.id)
        .maybeSingle()

      if (cancelled) return
      if (row?.role === "manager") {
        router.replace("/dashboard")
        return
      }
      if (row?.role === "staff") {
        router.replace("/input")
      }
    }

    void redirectIfSession()
    return () => {
      cancelled = true
    }
  }, [router])

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError(null)
    setLoading(true)

    const supabase = createClient()
    const { data: authData, error: signInError } =
      await supabase.auth.signInWithPassword({
        email,
        password,
      })

    if (signInError) {
      setLoading(false)
      setError(formatAuthError(signInError.message))
      return
    }

    const user = authData.user
    if (!user) {
      setLoading(false)
      setError("Masuk gagal: data pengguna tidak tersedia. Coba lagi.")
      return
    }

    const { data: profile, error: profileError } = await supabase
      .from("profiles")
      .select("role")
      .eq("id", user.id)
      .maybeSingle()

    if (profileError) {
      await supabase.auth.signOut()
      setLoading(false)
      setError(
        `Gagal memuat profil dari database: ${profileError.message}. Pastikan tabel public.profiles ada dan kebijakan RLS mengizinkan pembacaan.`
      )
      return
    }

    if (!profile?.role) {
      await supabase.auth.signOut()
      setLoading(false)
      setError(
        "Akun ini belum memiliki profil atau kolom role kosong. Hubungi administrator untuk menambahkan baris di public.profiles."
      )
      return
    }

    if (profile.role === "manager") {
      setLoading(false)
      router.refresh()
      router.push("/dashboard")
      return
    }

    if (profile.role === "staff") {
      setLoading(false)
      router.refresh()
      router.push("/input")
      return
    }

    await supabase.auth.signOut()
    setLoading(false)
    setError(
      `Peran "${profile.role}" tidak dikenali. Hanya "manager" atau "staff" yang didukung. Hubungi administrator.`
    )
  }

  return (
    <div className="flex min-h-svh w-full items-center justify-center bg-gradient-to-b from-background to-muted/40 p-4 sm:p-6">
      <Card className="w-full max-w-[420px] border-border/80 shadow-md">
        <CardHeader className="space-y-1 text-center sm:text-left">
          <CardTitle className="text-xl sm:text-2xl">Masuk</CardTitle>
          <CardDescription className="text-pretty">
            Masukkan email dan kata sandi untuk mengakses sistem pengiriman
            internal.
          </CardDescription>
        </CardHeader>
        <form onSubmit={handleSubmit} className="contents">
          <CardContent className="space-y-4">
            {error ? (
              <div
                className="rounded-lg border border-destructive/30 bg-destructive/5 px-3 py-2 text-sm text-destructive"
                role="alert"
              >
                {error}
              </div>
            ) : null}
            <div className="space-y-2">
              <Label htmlFor="email">Email</Label>
              <Input
                id="email"
                name="email"
                type="email"
                autoComplete="email"
                required
                placeholder="nama@perusahaan.com"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                disabled={loading}
                className="h-10"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="password">Kata sandi</Label>
              <Input
                id="password"
                name="password"
                type="password"
                autoComplete="current-password"
                required
                placeholder="••••••••"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                disabled={loading}
                className="h-10"
              />
            </div>
          </CardContent>
          <CardFooter className="flex flex-col gap-3 pt-2">
            <Button type="submit" className="h-10 w-full" disabled={loading}>
              {loading ? "Memproses…" : "Masuk"}
            </Button>
          </CardFooter>
        </form>
      </Card>
    </div>
  )
}

export default function LoginPage() {
  return (
    <Suspense
      fallback={
        <div className="flex min-h-svh w-full items-center justify-center bg-muted/30 p-4 text-sm text-muted-foreground">
          Memuat…
        </div>
      }
    >
      <LoginForm />
    </Suspense>
  )
}
