import { Badge } from "@/components/ui/badge"
import { cn } from "@/lib/utils"

export type DetailJumlahRow = { jumlah: number | null }

export type PengirimanListRow = {
  id: string
  tanggal_pengiriman: string
  toko_tujuan: string | null
  nomor_do: string | null
  nomor_kendaraan: string | null
  nama_supir_vendor: string | null
  status: string | null
  detail_pengiriman: DetailJumlahRow[] | null
}

export function formatTanggalPengiriman(isoOrDate: string) {
  const d = new Date(
    isoOrDate.includes("T") ? isoOrDate : `${isoOrDate}T12:00:00`
  )
  if (Number.isNaN(d.getTime())) return isoOrDate
  return d.toLocaleDateString("id-ID", {
    day: "numeric",
    month: "short",
    year: "numeric",
  })
}

export function statusLabel(status: string | null) {
  if (status === "dalam_perjalanan") return "Dalam perjalanan"
  if (status === "sudah_sampai") return "Sudah sampai"
  return status?.replace(/_/g, " ") ?? "—"
}

export function sumDetailJumlah(row: PengirimanListRow) {
  const details = row.detail_pengiriman
  if (!details?.length) return 0
  return details.reduce((acc, d) => acc + (Number(d.jumlah) || 0), 0)
}

export function StatusBadge({
  status,
  className,
  onClick,
  title,
}: {
  status: string | null
  className?: string
  onClick?: () => void
  title?: string
}) {
  const interactive = onClick ? "cursor-pointer hover:opacity-90" : ""

  if (status === "dalam_perjalanan") {
    return (
      <Badge
        variant="outline"
        title={title}
        onClick={onClick}
        className={cn(
          "border-amber-300 bg-amber-50 text-amber-900 dark:border-amber-700 dark:bg-amber-950/80 dark:text-amber-100",
          interactive,
          className
        )}
      >
        {statusLabel(status)}
      </Badge>
    )
  }
  if (status === "sudah_sampai") {
    return (
      <Badge
        variant="outline"
        title={title}
        onClick={onClick}
        className={cn(
          "border-emerald-300 bg-emerald-50 text-emerald-900 dark:border-emerald-700 dark:bg-emerald-950/80 dark:text-emerald-100",
          interactive,
          className
        )}
      >
        {statusLabel(status)}
      </Badge>
    )
  }
  return (
    <Badge
      variant="secondary"
      className={cn("capitalize", interactive, className)}
      title={title}
      onClick={onClick}
    >
      {statusLabel(status)}
    </Badge>
  )
}
