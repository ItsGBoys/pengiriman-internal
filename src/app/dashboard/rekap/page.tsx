"use client"

import { useCallback, useEffect, useMemo, useState } from "react"
import { jsPDF } from "jspdf"
import * as XLSX from "xlsx"
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Legend,
  Line,
  LineChart,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts"
import { createClient } from "@/lib/supabase/client"
import { Button } from "@/components/ui/button"
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
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
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import {
  filterByRange,
  lastDayOfMonth,
  monthNameId,
  mondayWeekKey,
  normalizeDateKey,
  PengirimanAggRow,
  sumUnits,
  toYmd,
  weekChunkInMonth,
} from "@/lib/rekap-aggregates"
import { Download, FileSpreadsheet } from "lucide-react"

const FETCH_LIMIT = 8000

const PIE_COLORS = ["#171717", "#16a34a", "#ca8a04", "#7c3aed", "#0284c7"]

const BAR_FILL = "#171717"
const LINE_STROKE = "#0284c7"

function ymdBoundsForMonth(year: number, month: number) {
  const start = toYmd(new Date(year, month - 1, 1))
  const end = toYmd(lastDayOfMonth(year, month))
  return { start, end }
}

function threeMonthWindowStart(year: number, month: number) {
  const d = new Date(year, month - 1 - 2, 1)
  return toYmd(d)
}

export default function RekapPage() {
  const [year, setYear] = useState(new Date().getFullYear())
  const [month, setMonth] = useState(new Date().getMonth() + 1)

  const [rows, setRows] = useState<PengirimanAggRow[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const { start: monthStart, end: monthEnd } = useMemo(
    () => ymdBoundsForMonth(year, month),
    [year, month]
  )

  const windowFrom = useMemo(
    () => threeMonthWindowStart(year, month),
    [year, month]
  )
  const windowTo = monthEnd

  const load = useCallback(async () => {
    setLoading(true)
    setError(null)
    const supabase = createClient()
    const { data, error: qErr } = await supabase
      .from("pengiriman")
      .select(
        `
        id,
        tanggal_pengiriman,
        toko_tujuan,
        nomor_do,
        nomor_kendaraan,
        nama_supir_vendor,
        catatan,
        status,
        detail_pengiriman (
          id,
          tipe_mesin,
          jumlah,
          nomor_seri ( nomor_seri )
        )
      `
      )
      .gte("tanggal_pengiriman", windowFrom)
      .lte("tanggal_pengiriman", windowTo)
      .order("tanggal_pengiriman", { ascending: true })
      .limit(FETCH_LIMIT)

    setLoading(false)
    if (qErr) {
      setError(qErr.message)
      setRows([])
      return
    }
    setRows((data ?? []) as PengirimanAggRow[])
  }, [windowFrom, windowTo])

  useEffect(() => {
    void load()
  }, [load])

  const monthRows = useMemo(
    () => filterByRange(rows, monthStart, monthEnd),
    [rows, monthStart, monthEnd]
  )

  const windowRows = useMemo(
    () => filterByRange(rows, windowFrom, windowTo),
    [rows, windowFrom, windowTo]
  )

  const truncated = rows.length >= FETCH_LIMIT

  const summary = useMemo(() => {
    const totalPengiriman = monthRows.length
    const totalUnit = monthRows.reduce((a, r) => a + sumUnits(r), 0)
    const tokoSet = new Set(
      monthRows
        .map((r) => r.toko_tujuan?.trim())
        .filter((t): t is string => Boolean(t))
    )
    const avg =
      totalPengiriman > 0 ? Math.round((totalUnit / totalPengiriman) * 100) / 100 : 0
    return {
      totalPengiriman,
      totalUnit,
      totalToko: tokoSet.size,
      avg,
    }
  }, [monthRows])

  const barData = useMemo(() => {
    const last = lastDayOfMonth(year, month).getDate()
    const out: { label: string; tanggal: string; unit: number }[] = []
    for (let d = 1; d <= last; d++) {
      const key = `${year}-${String(month).padStart(2, "0")}-${String(d).padStart(2, "0")}`
      const trips = monthRows.filter(
        (r) => normalizeDateKey(r.tanggal_pengiriman) === key
      )
      const unit = trips.reduce((a, r) => a + sumUnits(r), 0)
      out.push({ label: String(d), tanggal: key, unit })
    }
    return out
  }, [monthRows, year, month])

  const lineData = useMemo(() => {
    const map = new Map<string, number>()
    for (const r of windowRows) {
      const k = normalizeDateKey(r.tanggal_pengiriman)
      const wk = mondayWeekKey(k)
      map.set(wk, (map.get(wk) ?? 0) + 1)
    }
    return Array.from(map.entries())
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([monday, trips]) => ({
        weekKey: monday,
        weekLabel: new Date(`${monday}T12:00:00`).toLocaleDateString("id-ID", {
          day: "numeric",
          month: "short",
        }),
        pengiriman: trips,
      }))
  }, [windowRows])

  const pieData = useMemo(() => {
    const m = new Map<string, number>()
    for (const r of monthRows) {
      const t = r.toko_tujuan?.trim() || "(Tanpa nama)"
      m.set(t, (m.get(t) ?? 0) + 1)
    }
    const sorted = Array.from(m.entries()).sort((a, b) => b[1] - a[1])
    const top = sorted.slice(0, 5)
    return top.map(([name, value]) => ({ name, value }))
  }, [monthRows])

  const rekapHarian = useMemo(() => {
    const map = new Map<
      string,
      { trips: number; units: number; toko: Set<string> }
    >()
    for (const r of monthRows) {
      const k = normalizeDateKey(r.tanggal_pengiriman)
      if (!map.has(k)) {
        map.set(k, { trips: 0, units: 0, toko: new Set() })
      }
      const e = map.get(k)!
      e.trips += 1
      e.units += sumUnits(r)
      const t = r.toko_tujuan?.trim()
      if (t) e.toko.add(t)
    }
    return Array.from(map.entries())
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([tanggal, v]) => ({
        tanggal,
        jumlahTrip: v.trips,
        totalUnit: v.units,
        tokoDilayani: v.toko.size,
      }))
  }, [monthRows])

  const rekapMingguan = useMemo(() => {
    const map = new Map<
      number,
      { trips: number; units: number; toko: Set<string> }
    >()
    for (const r of monthRows) {
      const k = normalizeDateKey(r.tanggal_pengiriman)
      const w = weekChunkInMonth(k)
      if (!map.has(w)) {
        map.set(w, { trips: 0, units: 0, toko: new Set() })
      }
      const e = map.get(w)!
      e.trips += 1
      e.units += sumUnits(r)
      const t = r.toko_tujuan?.trim()
      if (t) e.toko.add(t)
    }
    return Array.from(map.entries())
      .sort(([a], [b]) => a - b)
      .map(([minggu, v]) => ({
        minggu,
        jumlahTrip: v.trips,
        totalUnit: v.units,
        tokoUnik: v.toko.size,
      }))
  }, [monthRows])

  const yearOptions = useMemo(() => {
    const y = new Date().getFullYear()
    return [y - 2, y - 1, y, y + 1]
  }, [])

  function exportExcel() {
    const wb = XLSX.utils.book_new()
    const groups = new Map<string, PengirimanAggRow[]>()
    for (const row of monthRows) {
      const dateKey = normalizeDateKey(row.tanggal_pengiriman)
      const existing = groups.get(dateKey) ?? []
      existing.push(row)
      groups.set(dateKey, existing)
    }
    const sortedDates = Array.from(groups.keys()).sort((a, b) => a.localeCompare(b))

    for (const dateKey of sortedDates) {
      const rowsForDate = groups.get(dateKey) ?? []
      const sheetRows: Array<Record<string, string | number>> = []
      for (const p of rowsForDate) {
        const details = p.detail_pengiriman ?? []
        if (details.length === 0) {
          sheetRows.push({
            Tanggal: dateKey,
            "ID Pengiriman": p.id,
            "Toko Tujuan": p.toko_tujuan ?? "",
            "Nomor DO": p.nomor_do ?? "",
            "Nomor Kendaraan": p.nomor_kendaraan ?? "",
            "Supir/Vendor": p.nama_supir_vendor ?? "",
            Status: p.status ?? "",
            "Tipe Barang": "",
            "Jumlah Unit Detail": 0,
            "Total Unit Pengiriman": sumUnits(p),
          })
          continue
        }
        for (const d of details) {
          sheetRows.push({
            Tanggal: dateKey,
            "ID Pengiriman": p.id,
            "Toko Tujuan": p.toko_tujuan ?? "",
            "Nomor DO": p.nomor_do ?? "",
            "Nomor Kendaraan": p.nomor_kendaraan ?? "",
            "Supir/Vendor": p.nama_supir_vendor ?? "",
            Status: p.status ?? "",
            "Tipe Barang": d.tipe_mesin ?? "",
            "Jumlah Unit Detail": Number(d.jumlah) || 0,
            "Total Unit Pengiriman": sumUnits(p),
          })
        }
      }
      const ws = XLSX.utils.json_to_sheet(sheetRows)
      const sheetName = dateKey.replace(/-/g, "")
      XLSX.utils.book_append_sheet(wb, ws, sheetName.slice(0, 31))
    }
    XLSX.writeFile(
      wb,
      `rekap-pengiriman-${year}-${String(month).padStart(2, "0")}.xlsx`
    )
  }

  function exportPdf() {
    const doc = new jsPDF()
    let yPos = 16
    const lineH = 7
    const margin = 14

    doc.setFontSize(16)
    doc.text("Rekap pengiriman", margin, yPos)
    yPos += lineH + 4

    doc.setFontSize(11)
    doc.text(
      `Periode: ${monthNameId(month)} ${year}`,
      margin,
      yPos
    )
    yPos += lineH + 2

    doc.setFontSize(10)
    const lines = [
      `Total pengiriman: ${summary.totalPengiriman}`,
      `Total unit dikirim: ${summary.totalUnit}`,
      `Total toko dilayani: ${summary.totalToko}`,
      `Rata-rata unit per pengiriman: ${summary.avg}`,
    ]
    for (const line of lines) {
      doc.text(line, margin, yPos)
      yPos += lineH
    }

    yPos += 4
    doc.setFontSize(11)
    doc.text("Data pengiriman (tanpa nomor seri)", margin, yPos)
    yPos += lineH + 2

    const colDefs = [
      { title: "Tanggal", width: 22 },
      { title: "Toko", width: 28 },
      { title: "DO", width: 20 },
      { title: "Kendaraan", width: 20 },
      { title: "Supir/Vendor", width: 28 },
      { title: "Unit", width: 10 },
      { title: "Status", width: 16 },
      { title: "Catatan", width: 24 },
    ]
    const tableW = colDefs.reduce((acc, c) => acc + c.width, 0)
    const drawRow = (values: string[], isHeader = false) => {
      const rowHeight = 7
      if (yPos + rowHeight > 285) {
        doc.addPage()
        yPos = 16
      }
      let x = margin
      if (isHeader) {
        doc.setFillColor(245, 245, 245)
        doc.rect(x, yPos - 5, tableW, rowHeight, "F")
        doc.setFont("helvetica", "bold")
      } else {
        doc.setFont("helvetica", "normal")
      }
      doc.setFontSize(8)
      for (let i = 0; i < colDefs.length; i++) {
        const col = colDefs[i]
        doc.rect(x, yPos - 5, col.width, rowHeight)
        const txt = (values[i] ?? "").slice(0, 24)
        doc.text(txt, x + 1.5, yPos - 1)
        x += col.width
      }
      yPos += rowHeight
    }

    drawRow(colDefs.map((c) => c.title), true)
    for (const p of monthRows) {
      const row = [
        normalizeDateKey(p.tanggal_pengiriman),
        p.toko_tujuan ?? "",
        p.nomor_do ?? "",
        p.nomor_kendaraan ?? "",
        p.nama_supir_vendor ?? "",
        String(sumUnits(p)),
        p.status ?? "",
        p.catatan ?? "",
      ]
      drawRow(row)
    }

    doc.save(`rekap-ringkasan-${year}-${String(month).padStart(2, "0")}.pdf`)
  }

  return (
    <div className="mx-auto flex max-w-6xl flex-col gap-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">
            Rekap &amp; chart
          </h1>
          <p className="text-muted-foreground mt-1 text-sm">
            Ringkasan bulanan, grafik, dan ekspor data.
          </p>
        </div>
        <div className="flex flex-col gap-2 sm:flex-row sm:items-end">
          <div className="grid grid-cols-2 gap-2">
            <div className="space-y-1.5">
              <Label className="text-xs">Bulan</Label>
              <Select
                value={String(month)}
                onValueChange={(v) => setMonth(Number(v))}
              >
                <SelectTrigger className="h-9 w-[140px]">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {Array.from({ length: 12 }, (_, i) => i + 1).map((m) => (
                    <SelectItem key={m} value={String(m)}>
                      {monthNameId(m)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">Tahun</Label>
              <Select
                value={String(year)}
                onValueChange={(v) => setYear(Number(v))}
              >
                <SelectTrigger className="h-9 w-[100px]">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {yearOptions.map((y) => (
                    <SelectItem key={y} value={String(y)}>
                      {y}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
          <div className="flex flex-wrap gap-2">
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="gap-1.5"
              onClick={exportExcel}
              disabled={loading || monthRows.length === 0}
            >
              <FileSpreadsheet className="size-4" aria-hidden />
              Export Excel
            </Button>
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="gap-1.5"
              onClick={exportPdf}
              disabled={loading}
            >
              <Download className="size-4" aria-hidden />
              Export PDF
            </Button>
          </div>
        </div>
      </div>

      {truncated ? (
        <Card className="border-amber-300/60 bg-amber-50/50 dark:bg-amber-950/20">
          <CardContent className="text-amber-950 dark:text-amber-100 pt-6 text-sm">
            Data dibatasi {FETCH_LIMIT} baris. Persempit rentang atau tambah
            filter di Supabase jika angka terlihat tidak lengkap.
          </CardContent>
        </Card>
      ) : null}

      {error ? (
        <Card className="border-destructive/40 bg-destructive/5">
          <CardContent className="text-destructive pt-6 text-sm">
            {error}
          </CardContent>
        </Card>
      ) : null}

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Card>
          <CardHeader className="pb-2">
            <CardDescription>Total pengiriman (bulan ini)</CardDescription>
            <CardTitle className="text-2xl tabular-nums">
              {loading ? "…" : summary.totalPengiriman}
            </CardTitle>
          </CardHeader>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardDescription>Total unit dikirim</CardDescription>
            <CardTitle className="text-2xl tabular-nums">
              {loading ? "…" : summary.totalUnit}
            </CardTitle>
          </CardHeader>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardDescription>Toko dilayani</CardDescription>
            <CardTitle className="text-2xl tabular-nums">
              {loading ? "…" : summary.totalToko}
            </CardTitle>
          </CardHeader>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardDescription>Rata-rata unit / pengiriman</CardDescription>
            <CardTitle className="text-2xl tabular-nums">
              {loading ? "…" : summary.avg}
            </CardTitle>
          </CardHeader>
        </Card>
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card className="lg:col-span-2">
          <CardHeader>
            <CardTitle className="text-lg">Unit per hari</CardTitle>
            <CardDescription>
              Bulan {monthNameId(month)} {year} (jumlah unit).
            </CardDescription>
          </CardHeader>
          <CardContent className="h-[300px] w-full pl-0">
            {loading ? (
              <p className="text-muted-foreground text-sm">Memuat…</p>
            ) : (
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={barData} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" className="stroke-border" />
                  <XAxis dataKey="label" tick={{ fontSize: 11 }} />
                  <YAxis tick={{ fontSize: 11 }} allowDecimals={false} />
                  <Tooltip contentStyle={{ borderRadius: 8 }} />
                  <Bar dataKey="unit" name="Unit" fill={BAR_FILL} radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-lg">Trend pengiriman per minggu</CardTitle>
            <CardDescription>
              3 bulan terakhir hingga akhir bulan terpilih (jumlah trip per
              minggu, mulai Senin).
            </CardDescription>
          </CardHeader>
          <CardContent className="h-[280px] w-full">
            {loading ? (
              <p className="text-muted-foreground text-sm">Memuat…</p>
            ) : (
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={lineData} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" className="stroke-border" />
                  <XAxis dataKey="weekLabel" tick={{ fontSize: 10 }} />
                  <YAxis tick={{ fontSize: 11 }} allowDecimals={false} />
                  <Tooltip />
                  <Line
                    type="monotone"
                    dataKey="pengiriman"
                    name="Trip"
                    stroke={LINE_STROKE}
                    strokeWidth={2}
                    dot={{ r: 3 }}
                  />
                </LineChart>
              </ResponsiveContainer>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-lg">Top 5 toko</CardTitle>
            <CardDescription>
              Distribusi jumlah trip per toko (bulan ini).
            </CardDescription>
          </CardHeader>
          <CardContent className="h-[280px] w-full">
            {loading ? (
              <p className="text-muted-foreground text-sm">Memuat…</p>
            ) : pieData.length === 0 ? (
              <p className="text-muted-foreground text-sm">Tidak ada data.</p>
            ) : (
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie
                    data={pieData}
                    dataKey="value"
                    nameKey="name"
                    cx="50%"
                    cy="50%"
                    outerRadius={90}
                    label={(props) => {
                      const n = String(props.name ?? "")
                      const pct = Number(props.percent ?? 0)
                      return `${n.slice(0, 12)}${n.length > 12 ? "…" : ""} ${(pct * 100).toFixed(0)}%`
                    }}
                  >
                    {pieData.map((_, i) => (
                      <Cell
                        key={i}
                        fill={PIE_COLORS[i % PIE_COLORS.length]}
                      />
                    ))}
                  </Pie>
                  <Tooltip />
                  <Legend wrapperStyle={{ fontSize: 11 }} />
                </PieChart>
              </ResponsiveContainer>
            )}
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-lg">Tabel rekap</CardTitle>
          <CardDescription>
            Agregasi untuk bulan {monthNameId(month)} {year}.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Tabs defaultValue="harian">
            <TabsList className="mb-4">
              <TabsTrigger value="harian">Rekap harian</TabsTrigger>
              <TabsTrigger value="mingguan">Rekap mingguan</TabsTrigger>
            </TabsList>
            <TabsContent value="harian">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Tanggal</TableHead>
                    <TableHead className="text-right">Jumlah trip</TableHead>
                    <TableHead className="text-right">Total unit</TableHead>
                    <TableHead className="text-right">Toko dilayani</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {loading ? (
                    <TableRow>
                      <TableCell colSpan={4} className="text-center">
                        Memuat…
                      </TableCell>
                    </TableRow>
                  ) : rekapHarian.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={4} className="text-center">
                        Tidak ada data.
                      </TableCell>
                    </TableRow>
                  ) : (
                    rekapHarian.map((r) => (
                      <TableRow key={r.tanggal}>
                        <TableCell>
                          {new Date(`${r.tanggal}T12:00:00`).toLocaleDateString(
                            "id-ID",
                            {
                              weekday: "short",
                              day: "numeric",
                              month: "short",
                              year: "numeric",
                            }
                          )}
                        </TableCell>
                        <TableCell className="text-right tabular-nums">
                          {r.jumlahTrip}
                        </TableCell>
                        <TableCell className="text-right tabular-nums">
                          {r.totalUnit}
                        </TableCell>
                        <TableCell className="text-right tabular-nums">
                          {r.tokoDilayani}
                        </TableCell>
                      </TableRow>
                    ))
                  )}
                </TableBody>
              </Table>
            </TabsContent>
            <TabsContent value="mingguan">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Minggu ke-</TableHead>
                    <TableHead className="text-right">Jumlah trip</TableHead>
                    <TableHead className="text-right">Total unit</TableHead>
                    <TableHead className="text-right">Toko unik</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {loading ? (
                    <TableRow>
                      <TableCell colSpan={4} className="text-center">
                        Memuat…
                      </TableCell>
                    </TableRow>
                  ) : rekapMingguan.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={4} className="text-center">
                        Tidak ada data.
                      </TableCell>
                    </TableRow>
                  ) : (
                    rekapMingguan.map((r) => (
                      <TableRow key={r.minggu}>
                        <TableCell>
                          {r.minggu}{" "}
                          <span className="text-muted-foreground text-xs">
                            (hari {r.minggu === 1 ? "1–7" : r.minggu === 2 ? "8–14" : r.minggu === 3 ? "15–21" : r.minggu === 4 ? "22–28" : "29–31"}
                            )
                          </span>
                        </TableCell>
                        <TableCell className="text-right tabular-nums">
                          {r.jumlahTrip}
                        </TableCell>
                        <TableCell className="text-right tabular-nums">
                          {r.totalUnit}
                        </TableCell>
                        <TableCell className="text-right tabular-nums">
                          {r.tokoUnik}
                        </TableCell>
                      </TableRow>
                    ))
                  )}
                </TableBody>
              </Table>
            </TabsContent>
          </Tabs>
        </CardContent>
      </Card>
    </div>
  )
}
