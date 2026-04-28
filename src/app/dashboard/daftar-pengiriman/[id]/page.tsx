"use client"

import Link from "next/link"
import { useParams } from "next/navigation"
import { useCallback, useEffect, useState } from "react"
import { createClient } from "@/lib/supabase/client"
import {
  formatTanggalPengiriman,
  StatusBadge,
  statusLabel,
} from "@/components/dashboard/pengiriman-display"
import { Button } from "@/components/ui/button"
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
import { ArrowLeft } from "lucide-react"

type NomorSeriRow = { nomor_seri: string | null }

type DetailBarangRow = {
  id: string
  tipe_mesin: string | null
  jumlah: number | null
  nomor_seri: NomorSeriRow[] | null
}

type PengirimanDetail = {
  id: string
  tanggal_pengiriman: string
  toko_tujuan: string | null
  nomor_kendaraan: string | null
  nama_supir_vendor: string | null
  status: string | null
  catatan: string | null
  detail_pengiriman: DetailBarangRow[] | null
}

export default function DetailPengirimanPage() {
  const params = useParams()
  const id = typeof params.id === "string" ? params.id : params.id?.[0] ?? ""

  const [data, setData] = useState<PengirimanDetail | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [updating, setUpdating] = useState(false)

  const load = useCallback(async () => {
    if (!id) {
      setLoading(false)
      setError("ID tidak valid.")
      return
    }
    setLoading(true)
    setError(null)
    const supabase = createClient()
    const { data: row, error: qErr } = await supabase
      .from("pengiriman")
      .select(
        `
        id,
        tanggal_pengiriman,
        toko_tujuan,
        nomor_kendaraan,
        nama_supir_vendor,
        status,
        catatan,
        detail_pengiriman (
          id,
          tipe_mesin,
          jumlah,
          nomor_seri ( nomor_seri )
        )
      `
      )
      .eq("id", id)
      .maybeSingle()

    setLoading(false)
    if (qErr) {
      setError(qErr.message)
      setData(null)
      return
    }
    if (!row) {
      setError("Pengiriman tidak ditemukan.")
      setData(null)
      return
    }
    setData(row as PengirimanDetail)
  }, [id])

  useEffect(() => {
    void load()
  }, [load])

  async function markSudahSampai() {
    if (!id || !data || data.status !== "dalam_perjalanan") return
    setUpdating(true)
    setError(null)
    const supabase = createClient()
    const { error: uErr } = await supabase
      .from("pengiriman")
      .update({ status: "sudah_sampai" })
      .eq("id", id)
      .eq("status", "dalam_perjalanan")

    setUpdating(false)
    if (uErr) {
      setError(uErr.message)
      return
    }
    void load()
  }

  if (loading) {
    return (
      <div className="mx-auto max-w-4xl py-10 text-center text-sm text-muted-foreground">
        Memuat…
      </div>
    )
  }

  if (error && !data) {
    return (
      <div className="mx-auto flex max-w-4xl flex-col gap-4">
        <Button variant="outline" size="sm" className="w-fit gap-2" asChild>
          <Link href="/dashboard/daftar-pengiriman">
            <ArrowLeft className="size-4" aria-hidden />
            Kembali ke daftar
          </Link>
        </Button>
        <Card className="border-destructive/40 bg-destructive/5">
          <CardContent className="text-destructive pt-6 text-sm">
            {error}
          </CardContent>
        </Card>
      </div>
    )
  }

  if (!data) return null

  const details = data.detail_pengiriman ?? []

  return (
    <div className="mx-auto flex max-w-4xl flex-col gap-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <Button variant="outline" size="sm" className="w-fit gap-2" asChild>
          <Link href="/dashboard/daftar-pengiriman">
            <ArrowLeft className="size-4" aria-hidden />
            Kembali ke daftar
          </Link>
        </Button>
        {data.status === "dalam_perjalanan" ? (
          <Button
            type="button"
            disabled={updating}
            onClick={() => void markSudahSampai()}
          >
            {updating ? "Memperbarui…" : "Update status ke sudah sampai"}
          </Button>
        ) : null}
      </div>

      {error ? (
        <Card className="border-destructive/40 bg-destructive/5">
          <CardContent className="text-destructive pt-6 text-sm">
            {error}
          </CardContent>
        </Card>
      ) : null}

      <Card>
        <CardHeader>
          <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
            <div>
              <CardTitle>Rincian pengiriman</CardTitle>
              <CardDescription>ID: {data.id}</CardDescription>
            </div>
            <StatusBadge status={data.status} />
          </div>
        </CardHeader>
        <CardContent className="grid gap-4 sm:grid-cols-2">
          <div>
            <p className="text-muted-foreground text-xs font-medium uppercase">
              Tanggal pengiriman
            </p>
            <p className="mt-0.5 font-medium">
              {formatTanggalPengiriman(data.tanggal_pengiriman)}
            </p>
          </div>
          <div>
            <p className="text-muted-foreground text-xs font-medium uppercase">
              Status
            </p>
            <p className="mt-0.5 font-medium">{statusLabel(data.status)}</p>
          </div>
          <div className="sm:col-span-2">
            <p className="text-muted-foreground text-xs font-medium uppercase">
              Toko tujuan
            </p>
            <p className="mt-0.5 font-medium">{data.toko_tujuan ?? "—"}</p>
          </div>
          <div>
            <p className="text-muted-foreground text-xs font-medium uppercase">
              Nomor kendaraan
            </p>
            <p className="mt-0.5 font-medium">{data.nomor_kendaraan ?? "—"}</p>
          </div>
          <div>
            <p className="text-muted-foreground text-xs font-medium uppercase">
              Supir / Vendor
            </p>
            <p className="mt-0.5 font-medium">{data.nama_supir_vendor ?? "—"}</p>
          </div>
          <div className="sm:col-span-2">
            <p className="text-muted-foreground text-xs font-medium uppercase">
              Catatan
            </p>
            <p className="text-foreground mt-0.5 whitespace-pre-wrap text-sm">
              {data.catatan?.trim() ? data.catatan : "—"}
            </p>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-lg">Detail barang per tipe</CardTitle>
          <CardDescription>
            Mesin cuci dan nomor seri dari detail_pengiriman &amp; nomor_seri.
          </CardDescription>
        </CardHeader>
        <CardContent className="px-0 sm:px-6">
          {details.length === 0 ? (
            <p className="text-muted-foreground px-6 text-sm sm:px-0">
              Tidak ada detail barang.
            </p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Tipe mesin</TableHead>
                  <TableHead className="text-right">Jumlah</TableHead>
                  <TableHead className="min-w-[200px]">Nomor seri</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {details.map((d) => {
                  const serials = (d.nomor_seri ?? [])
                    .map((n) => n.nomor_seri)
                    .filter((s): s is string => Boolean(s && s.trim()))
                  return (
                    <TableRow key={d.id}>
                      <TableCell className="align-top font-medium">
                        {d.tipe_mesin ?? "—"}
                      </TableCell>
                      <TableCell className="text-right tabular-nums align-top">
                        {d.jumlah ?? serials.length}
                      </TableCell>
                      <TableCell className="align-top">
                        {serials.length === 0 ? (
                          <span className="text-muted-foreground text-sm">—</span>
                        ) : (
                          <ul className="max-h-40 list-inside list-disc overflow-y-auto text-sm">
                            {serials.map((sn, i) => (
                              <li
                                key={`${d.id}-${i}-${sn}`}
                                className="font-mono text-xs break-all"
                              >
                                {sn}
                              </li>
                            ))}
                          </ul>
                        )}
                      </TableCell>
                    </TableRow>
                  )
                })}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
