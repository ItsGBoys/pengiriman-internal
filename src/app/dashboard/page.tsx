"use client"

import { useCallback, useEffect, useState } from "react"
import { createClient } from "@/lib/supabase/client"
import {
  formatTanggalPengiriman,
  PengirimanListRow,
  StatusBadge,
  sumDetailJumlah,
} from "@/components/dashboard/pengiriman-display"
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"

function getLocalDateString(d: Date) {
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, "0")
  const day = String(d.getDate()).padStart(2, "0")
  return `${y}-${m}-${day}`
}

export default function DashboardPage() {
  const [rows, setRows] = useState<PengirimanListRow[]>([])
  const [totalHariIni, setTotalHariIni] = useState(0)
  const [totalUnitHariIni, setTotalUnitHariIni] = useState(0)
  const [tokoHariIni, setTokoHariIni] = useState(0)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)

  const refresh = useCallback(async () => {
    const supabase = createClient()
    const todayStr = getLocalDateString(new Date())
    setLoadError(null)

    const latestRes = await supabase
      .from("pengiriman")
      .select(
        `
        id,
        tanggal_pengiriman,
        toko_tujuan,
        nomor_kendaraan,
        status,
        detail_pengiriman ( jumlah )
      `
      )
      .order("tanggal_pengiriman", { ascending: false })
      .order("id", { ascending: false })
      .limit(10)

    if (latestRes.error) {
      setLoadError(latestRes.error.message)
      setLoading(false)
      return
    }

    const todayRes = await supabase
      .from("pengiriman")
      .select(
        `
        id,
        toko_tujuan,
        detail_pengiriman ( jumlah )
      `
      )
      .eq("tanggal_pengiriman", todayStr)

    if (todayRes.error) {
      setLoadError(todayRes.error.message)
      setLoading(false)
      return
    }

    const todayData = (todayRes.data ?? []) as PengirimanListRow[]

    setTotalHariIni(todayData.length)
    setTotalUnitHariIni(
      todayData.reduce((acc, row) => acc + sumDetailJumlah(row), 0)
    )
    const tokoUnik = new Set(
      todayData
        .map((r) => r.toko_tujuan?.trim())
        .filter((t): t is string => Boolean(t && t.length > 0))
    )
    setTokoHariIni(tokoUnik.size)
    setRows((latestRes.data ?? []) as PengirimanListRow[])
    setLoading(false)
  }, [])

  useEffect(() => {
    void refresh()
  }, [refresh])

  useEffect(() => {
    const supabase = createClient()
    const channel = supabase
      .channel("dashboard-pengiriman")
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "pengiriman" },
        () => {
          void refresh()
        }
      )
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "detail_pengiriman" },
        () => {
          void refresh()
        }
      )
      .subscribe()

    return () => {
      void supabase.removeChannel(channel)
    }
  }, [refresh])

  return (
    <div className="mx-auto flex max-w-6xl flex-col gap-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Dashboard</h1>
        <p className="text-muted-foreground mt-1 text-sm">
          Ringkasan pengiriman hari ini dan data terbaru.
        </p>
      </div>

      {loadError ? (
        <Card className="border-destructive/40 bg-destructive/5">
          <CardHeader className="pb-2">
            <CardTitle className="text-destructive text-base">
              Gagal memuat data
            </CardTitle>
            <CardDescription className="text-destructive/90">
              {loadError}. Periksa nama tabel/kolom di Supabase (public.pengiriman,
              public.detail_pengiriman), relasi FK, RLS, dan Realtime yang aktif
              untuk kedua tabel.
            </CardDescription>
          </CardHeader>
        </Card>
      ) : null}

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        <Card>
          <CardHeader className="pb-2">
            <CardDescription>Total pengiriman hari ini</CardDescription>
            <CardTitle className="text-3xl tabular-nums">
              {loading ? "…" : totalHariIni}
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-muted-foreground text-xs">
              Berdasarkan kolom tanggal sama dengan hari ini (zona waktu browser).
            </p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardDescription>Total unit mesin cuci dikirim hari ini</CardDescription>
            <CardTitle className="text-3xl tabular-nums">
              {loading ? "…" : totalUnitHariIni}
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-muted-foreground text-xs">
              Jumlah dari penjumlahan kolom jumlah pada detail_pengiriman untuk
              pengiriman hari ini.
            </p>
          </CardContent>
        </Card>
        <Card className="sm:col-span-2 lg:col-span-1">
          <CardHeader className="pb-2">
            <CardDescription>Jumlah toko dilayani hari ini</CardDescription>
            <CardTitle className="text-3xl tabular-nums">
              {loading ? "…" : tokoHariIni}
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-muted-foreground text-xs">
              Toko unik (toko_tujuan) pada pengiriman dengan tanggal hari ini.
            </p>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Pengiriman terbaru</CardTitle>
          <CardDescription>10 entri terakhir, diurutkan tanggal &amp; id.</CardDescription>
        </CardHeader>
        <CardContent className="px-0 sm:px-6">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Tanggal</TableHead>
                <TableHead className="min-w-[140px]">Toko tujuan</TableHead>
                <TableHead>Nomor kendaraan</TableHead>
                <TableHead className="text-right">Total unit</TableHead>
                <TableHead>Status</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {loading ? (
                <TableRow>
                  <TableCell colSpan={5} className="text-muted-foreground h-24 text-center">
                    Memuat…
                  </TableCell>
                </TableRow>
              ) : rows.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={5} className="text-muted-foreground h-24 text-center">
                    Belum ada data pengiriman.
                  </TableCell>
                </TableRow>
              ) : (
                rows.map((row) => (
                  <TableRow key={row.id}>
                    <TableCell className="whitespace-nowrap">
                      {formatTanggalPengiriman(row.tanggal_pengiriman)}
                    </TableCell>
                    <TableCell className="max-w-[200px] truncate font-medium">
                      {row.toko_tujuan ?? "—"}
                    </TableCell>
                    <TableCell>{row.nomor_kendaraan ?? "—"}</TableCell>
                    <TableCell className="text-right tabular-nums">
                      {sumDetailJumlah(row)}
                    </TableCell>
                    <TableCell>
                      <StatusBadge status={row.status} />
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  )
}
