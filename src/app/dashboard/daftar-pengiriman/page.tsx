"use client"

import Link from "next/link"
import { useCallback, useEffect, useState } from "react"
import { createClient } from "@/lib/supabase/client"
import {
  formatTanggalPengiriman,
  PengirimanListRow,
  StatusBadge,
  sumDetailJumlah,
} from "@/components/dashboard/pengiriman-display"
import { Button } from "@/components/ui/button"
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"

const FETCH_LIMIT = 500

type StatusFilter = "all" | "dalam_perjalanan" | "sudah_sampai"

function escapeIlikePattern(s: string) {
  return s
    .replace(/\\/g, "\\\\")
    .replace(/%/g, "\\%")
    .replace(/_/g, "\\_")
    .replace(/,/g, "")
}

export default function DaftarPengirimanPage() {
  const [searchInput, setSearchInput] = useState("")
  const [searchDebounced, setSearchDebounced] = useState("")
  const [dateFrom, setDateFrom] = useState("")
  const [dateTo, setDateTo] = useState("")
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("all")

  const [rows, setRows] = useState<PengirimanListRow[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [updatingId, setUpdatingId] = useState<string | null>(null)

  useEffect(() => {
    const t = setTimeout(() => setSearchDebounced(searchInput.trim()), 400)
    return () => clearTimeout(t)
  }, [searchInput])

  const fetchRows = useCallback(async () => {
    setLoading(true)
    setError(null)

    if (dateFrom && dateTo && dateFrom > dateTo) {
      setError(
        'Rentang tanggal tidak valid: "Dari tanggal" harus sebelum atau sama dengan "Sampai tanggal".'
      )
      setLoading(false)
      return
    }

    const supabase = createClient()

    let q = supabase
      .from("pengiriman")
      .select(
        `
        id,
        tanggal_pengiriman,
        toko_tujuan,
        nomor_do,
        nomor_kendaraan,
        nama_supir_vendor,
        status,
        detail_pengiriman ( jumlah )
      `
      )
      .order("tanggal_pengiriman", { ascending: false })
      .order("id", { ascending: false })
      .limit(FETCH_LIMIT)

    if (searchDebounced) {
      const safe = escapeIlikePattern(searchDebounced)
      const pattern = `%${safe}%`
      q = q.or(
        `toko_tujuan.ilike.${pattern},nomor_kendaraan.ilike.${pattern},nama_supir_vendor.ilike.${pattern}`
        + `,nomor_do.ilike.${pattern}`
      )
    }

    if (dateFrom) {
      q = q.gte("tanggal_pengiriman", dateFrom)
    }
    if (dateTo) {
      q = q.lte("tanggal_pengiriman", dateTo)
    }
    if (statusFilter !== "all") {
      q = q.eq("status", statusFilter)
    }

    const { data, error: qErr } = await q

    setLoading(false)
    if (qErr) {
      setError(qErr.message)
      return
    }
    setRows((data ?? []) as PengirimanListRow[])
  }, [searchDebounced, dateFrom, dateTo, statusFilter])

  useEffect(() => {
    void fetchRows()
  }, [fetchRows])

  async function markSudahSampai(id: string) {
    setUpdatingId(id)
    setError(null)
    const supabase = createClient()
    const { error: uErr } = await supabase
      .from("pengiriman")
      .update({ status: "sudah_sampai" })
      .eq("id", id)
      .eq("status", "dalam_perjalanan")

    setUpdatingId(null)
    if (uErr) {
      setError(uErr.message)
      return
    }
    void fetchRows()
  }

  function resetFilters() {
    setSearchInput("")
    setSearchDebounced("")
    setDateFrom("")
    setDateTo("")
    setStatusFilter("all")
  }

  return (
    <div className="mx-auto flex max-w-6xl flex-col gap-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">
          Daftar pengiriman
        </h1>
        <p className="text-muted-foreground mt-1 text-sm">
          Cari, filter, ubah status, atau buka rincian per pengiriman.
        </p>
      </div>

      {error ? (
        <Card className="border-destructive/40 bg-destructive/5">
          <CardContent className="text-destructive pt-6 text-sm" role="alert">
            {error}
          </CardContent>
        </Card>
      ) : null}

      <Card>
        <CardHeader>
          <CardTitle className="text-lg">Filter &amp; pencarian</CardTitle>
          <CardDescription>
            Maks. {FETCH_LIMIT} baris terbaru sesuai filter. Tanggal memakai
            kolom tanggal_pengiriman.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <div className="space-y-2 sm:col-span-2 lg:col-span-2">
              <Label htmlFor="search">Cari toko, DO, kendaraan, atau supir/vendor</Label>
              <Input
                id="search"
                value={searchInput}
                onChange={(e) => setSearchInput(e.target.value)}
                placeholder="Ketik lalu tunggu sebentar…"
                className="h-10"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="dari">Dari tanggal</Label>
              <Input
                id="dari"
                type="date"
                value={dateFrom}
                onChange={(e) => setDateFrom(e.target.value)}
                className="h-10"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="sampai">Sampai tanggal</Label>
              <Input
                id="sampai"
                type="date"
                value={dateTo}
                onChange={(e) => setDateTo(e.target.value)}
                className="h-10"
              />
            </div>
          </div>
          <div className="flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-end">
            <div className="space-y-2 sm:min-w-[200px]">
              <Label>Status</Label>
              <Select
                value={statusFilter}
                onValueChange={(v) => setStatusFilter(v as StatusFilter)}
              >
                <SelectTrigger className="h-10 w-full sm:w-[220px]">
                  <SelectValue placeholder="Status" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Semua</SelectItem>
                  <SelectItem value="dalam_perjalanan">
                    Dalam perjalanan
                  </SelectItem>
                  <SelectItem value="sudah_sampai">Sudah sampai</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <Button
              type="button"
              variant="outline"
              className="h-10 w-full sm:w-auto"
              onClick={resetFilters}
            >
              Reset filter
            </Button>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-lg">Data</CardTitle>
          <CardDescription>
            {loading ? "Memuat…" : `${rows.length} baris`}
          </CardDescription>
        </CardHeader>
        <CardContent className="px-0 sm:px-6">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Tanggal</TableHead>
                <TableHead className="min-w-[120px]">Toko tujuan</TableHead>
                <TableHead>Nomor DO</TableHead>
                <TableHead>Nomor kendaraan</TableHead>
                <TableHead>Supir/Vendor</TableHead>
                <TableHead className="text-right">Total unit</TableHead>
                <TableHead>Status</TableHead>
                <TableHead className="text-right">Aksi</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {loading ? (
                <TableRow>
                  <TableCell
                    colSpan={7}
                    className="text-muted-foreground h-24 text-center"
                  >
                    Memuat…
                  </TableCell>
                </TableRow>
              ) : rows.length === 0 ? (
                <TableRow>
                  <TableCell
                    colSpan={7}
                    className="text-muted-foreground h-24 text-center"
                  >
                    Tidak ada data yang cocok dengan filter.
                  </TableCell>
                </TableRow>
              ) : (
                rows.map((row) => {
                  const busy = updatingId === row.id
                  const canMark =
                    row.status === "dalam_perjalanan" && !busy
                  return (
                    <TableRow key={row.id}>
                      <TableCell className="whitespace-nowrap">
                        {formatTanggalPengiriman(row.tanggal_pengiriman)}
                      </TableCell>
                      <TableCell className="max-w-[180px] truncate font-medium">
                        {row.toko_tujuan ?? "—"}
                      </TableCell>
                      <TableCell className="whitespace-nowrap">
                        {row.nomor_do ?? "—"}
                      </TableCell>
                      <TableCell className="whitespace-nowrap">
                        {row.nomor_kendaraan ?? "—"}
                      </TableCell>
                      <TableCell className="max-w-[180px] truncate">
                        {row.nama_supir_vendor ?? "—"}
                      </TableCell>
                      <TableCell className="text-right tabular-nums">
                        {sumDetailJumlah(row)}
                      </TableCell>
                      <TableCell>
                        <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:gap-2">
                          <StatusBadge
                            status={row.status}
                            title={
                              canMark
                                ? "Klik untuk tandai sudah sampai"
                                : undefined
                            }
                            onClick={
                              canMark
                                ? () => {
                                    void markSudahSampai(row.id)
                                  }
                                : undefined
                            }
                          />
                          {row.status === "dalam_perjalanan" ? (
                            <Button
                              type="button"
                              variant="secondary"
                              size="sm"
                              className="h-8 w-full shrink-0 sm:w-auto"
                              disabled={busy}
                              onClick={() => void markSudahSampai(row.id)}
                            >
                              {busy ? "…" : "Tandai sampai"}
                            </Button>
                          ) : null}
                        </div>
                      </TableCell>
                      <TableCell className="text-right">
                        <Button variant="outline" size="sm" className="h-8" asChild>
                          <Link
                            href={`/dashboard/daftar-pengiriman/${row.id}`}
                          >
                            Detail
                          </Link>
                        </Button>
                      </TableCell>
                    </TableRow>
                  )
                })
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  )
}
