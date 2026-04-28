export type NomorSeriRow = { nomor_seri: string | null }

export type DetailAggRow = {
  id: string
  tipe_mesin: string | null
  jumlah: number | null
  nomor_seri: NomorSeriRow[] | null
}

export type PengirimanAggRow = {
  id: string
  tanggal_pengiriman: string
  toko_tujuan: string | null
  nomor_do: string | null
  nomor_kendaraan: string | null
  nama_supir_vendor: string | null
  catatan: string | null
  status: string | null
  detail_pengiriman: DetailAggRow[] | null
}

export function sumUnits(p: PengirimanAggRow): number {
  const details = p.detail_pengiriman
  if (!details?.length) return 0
  return details.reduce((acc, d) => acc + (Number(d.jumlah) || 0), 0)
}

export function normalizeDateKey(raw: string): string {
  if (!raw) return ""
  if (/^\d{4}-\d{2}-\d{2}$/.test(raw)) return raw
  const d = new Date(raw.includes("T") ? raw : `${raw}T12:00:00`)
  if (Number.isNaN(d.getTime())) return raw.slice(0, 10)
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, "0")
  const day = String(d.getDate()).padStart(2, "0")
  return `${y}-${m}-${day}`
}

export function firstDayOfMonth(year: number, month1: number) {
  return new Date(year, month1 - 1, 1)
}

export function lastDayOfMonth(year: number, month1: number) {
  return new Date(year, month1, 0)
}

export function toYmd(d: Date) {
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, "0")
  const day = String(d.getDate()).padStart(2, "0")
  return `${y}-${m}-${day}`
}

/** Senin minggu ISO untuk tanggal YYYY-MM-DD (lokal). */
export function mondayWeekKey(dateKey: string): string {
  const d = new Date(`${dateKey}T12:00:00`)
  const day = d.getDay()
  const diff = d.getDate() - day + (day === 0 ? -6 : 1)
  const mon = new Date(d.setDate(diff))
  return toYmd(mon)
}

/** Minggu ke-1..5 dalam bulan: blok 1–7, 8–14, dst. */
export function weekChunkInMonth(dateKey: string): number {
  const d = new Date(`${dateKey}T12:00:00`)
  const day = d.getDate()
  return Math.min(5, Math.ceil(day / 7))
}

export function monthNameId(month1: number) {
  return [
    "",
    "Januari",
    "Februari",
    "Maret",
    "April",
    "Mei",
    "Juni",
    "Juli",
    "Agustus",
    "September",
    "Oktober",
    "November",
    "Desember",
  ][month1]
}

export function filterByRange(
  rows: PengirimanAggRow[],
  fromYmd: string,
  toYmd: string
) {
  return rows.filter((r) => {
    const k = normalizeDateKey(r.tanggal_pengiriman)
    return k >= fromYmd && k <= toYmd
  })
}
