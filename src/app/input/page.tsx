"use client"

import dynamic from "next/dynamic"
import { useCallback, useEffect, useMemo, useRef, useState } from "react"
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
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectLabel,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { Textarea } from "@/components/ui/textarea"

const YoloScanner = dynamic(
  () => import("@/components/input/BarcodeScanner"),
  { ssr: false }
)

const TIPE_MESIN = [
  { kode: "NA-F10JSZ1", kategori: "front-load" as const },
  { kode: "NA-F70JSZ1", kategori: "front-load" as const },
  { kode: "NA-F80JSZ1", kategori: "front-load" as const },
  { kode: "NA-F90JSZ1", kategori: "front-load" as const },
  { kode: "NA-W110BBZ3A", kategori: "top-load" as const },
  { kode: "NA-W130FCV3A", kategori: "top-load" as const },
  { kode: "NA-W150FCV3A", kategori: "top-load" as const },
  { kode: "NA-W76BBZ2H", kategori: "top-load" as const },
  { kode: "NA-W76BBZ4H", kategori: "top-load" as const },
  { kode: "NA-W78BCV1V", kategori: "top-load" as const },
  { kode: "NA-W80BBZ3A", kategori: "top-load" as const },
  { kode: "NA-W80BBZ4H", kategori: "top-load" as const },
  { kode: "NA-W80FCU3A", kategori: "top-load" as const },
  { kode: "NA-W80FCV3A", kategori: "top-load" as const },
  { kode: "NA-W90BBZ3A", kategori: "top-load" as const },
  { kode: "NA-W90FCU3A", kategori: "top-load" as const },
  { kode: "NA-W90FCV3A", kategori: "top-load" as const },
  { kode: "NA-W96BBZ2H", kategori: "top-load" as const },
]

const TIPE_MESIN_FRONT_LOAD = TIPE_MESIN.filter((t) =>
  t.kode.startsWith("NA-F")
)
const TIPE_MESIN_TOP_LOAD = TIPE_MESIN.filter((t) =>
  t.kode.startsWith("NA-W")
)

const getKategori = (kodeTipe: string): "front-load" | "top-load" => {
  return kodeTipe.startsWith("NA-F") ? "front-load" : "top-load"
}

type BarisTipe = {
  id: string
  tipe: string
  serials: string[]
  draftSerial: string
  maxSerial: string
}

function newBaris(): BarisTipe {
  return {
    id: crypto.randomUUID(),
    tipe: "",
    serials: [],
    draftSerial: "",
    maxSerial: "",
  }
}

function getLocalDateString(d: Date) {
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, "0")
  const day = String(d.getDate()).padStart(2, "0")
  return `${y}-${m}-${day}`
}

function formatRpcError(message: string) {
  const marker = "INVALID_INPUT:"
  const idx = message.indexOf(marker)
  if (idx !== -1) {
    return message.slice(idx + marker.length).trim()
  }
  return message
}

function normalizeUpper(value: string) {
  return value.trim().toUpperCase()
}

const BACKUP_KEY = "pending-pengiriman-submit-v1"

type PendingSubmitPayload = {
  toko_tujuan: string
  nomor_do: string
  nomor_kendaraan: string
  nama_supir_vendor: string
  tanggal_pengiriman: string
  catatan: string | null
  details: Array<{
    tipe: string
    serials: string[]
  }>
}

export default function InputPengirimanPage() {
  const [tokoTujuan, setTokoTujuan] = useState("")
  const [nomorDo, setNomorDo] = useState("")
  const [nomorKendaraan, setNomorKendaraan] = useState("")
  const [namaSupirVendor, setNamaSupirVendor] = useState("")
  const [catatan, setCatatan] = useState("")
  const [baris, setBaris] = useState<BarisTipe[]>(() => [newBaris()])
  const [formError, setFormError] = useState<string | null>(null)
  const [successMsg, setSuccessMsg] = useState<string | null>(null)
  const [confirmOpen, setConfirmOpen] = useState(false)
  const [saving, setSaving] = useState(false)
  const [backupPending, setBackupPending] = useState(false)
  const [retryingBackup, setRetryingBackup] = useState(false)
  const [scannerState, setScannerState] = useState<{
    open: boolean
    lineId: string
    kategori: "front-load" | "top-load"
  } | null>(null)

  const barisRef = useRef(baris)
  const scannerStateRef = useRef(scannerState)
  useEffect(() => {
    barisRef.current = baris
  }, [baris])
  useEffect(() => {
    scannerStateRef.current = scannerState
  }, [scannerState])

  const totalSerial = useMemo(
    () => baris.reduce((acc, b) => acc + b.serials.length, 0),
    [baris]
  )

  const resetForm = useCallback(() => {
    setTokoTujuan("")
    setNomorDo("")
    setNomorKendaraan("")
    setNamaSupirVendor("")
    setCatatan("")
    setBaris([newBaris()])
    setFormError(null)
  }, [])

  const saveBackupToLocal = useCallback((payload: PendingSubmitPayload) => {
    if (typeof window === "undefined") return
    localStorage.setItem(BACKUP_KEY, JSON.stringify(payload))
    setBackupPending(true)
  }, [])

  const clearBackupLocal = useCallback(() => {
    if (typeof window === "undefined") return
    localStorage.removeItem(BACKUP_KEY)
    setBackupPending(false)
  }, [])

  const readBackupLocal = useCallback((): PendingSubmitPayload | null => {
    if (typeof window === "undefined") return null
    const raw = localStorage.getItem(BACKUP_KEY)
    if (!raw) return null
    try {
      return JSON.parse(raw) as PendingSubmitPayload
    } catch {
      return null
    }
  }, [])

  useEffect(() => {
    setBackupPending(Boolean(readBackupLocal()))
  }, [readBackupLocal])

  function validate(): string | null {
    if (!tokoTujuan.trim()) {
      return "Toko tujuan wajib diisi."
    }
    if (!nomorKendaraan.trim()) {
      return "Nomor kendaraan wajib diisi."
    }
    if (!nomorDo.trim()) {
      return "Nomor DO wajib diisi."
    }
    if (!namaSupirVendor.trim()) {
      return "Nama supir/vendor wajib diisi."
    }
    if (baris.length === 0) {
      return "Minimal ada satu tipe barang."
    }
    for (let i = 0; i < baris.length; i++) {
      const b = baris[i]
      if (!b.tipe.trim()) {
        return `Baris ${i + 1}: pilih tipe mesin cuci.`
      }
      if (b.serials.length < 1) {
        return `Tipe "${b.tipe}": minimal tambahkan satu nomor seri.`
      }
      if (b.maxSerial.trim()) {
        const parsed = Number(b.maxSerial)
        if (!Number.isInteger(parsed) || parsed < 1) {
          return `Tipe "${b.tipe}": maksimal nomor seri harus bilangan bulat minimal 1.`
        }
        if (b.serials.length > parsed) {
          return `Tipe "${b.tipe}": jumlah serial (${b.serials.length}) melebihi batas maksimal (${parsed}).`
        }
      }
    }
    const seen = new Map<string, string>()
    for (const b of baris) {
      for (const raw of b.serials) {
        const sn = raw.trim()
        if (!sn) {
          return "Nomor seri tidak boleh kosong."
        }
        const key = sn.toLowerCase()
        if (seen.has(key)) {
          return `Nomor seri "${sn}" duplikat (juga muncul pada tipe "${seen.get(key)}"). Satu pengiriman tidak boleh memuat nomor seri yang sama.`
        }
        seen.set(key, b.tipe)
      }
    }
    return null
  }

  function handleOpenConfirm() {
    setSuccessMsg(null)
    const err = validate()
    if (err) {
      setFormError(err)
      return
    }
    setFormError(null)
    setConfirmOpen(true)
  }

  async function handleConfirmSave() {
    const err = validate()
    if (err) {
      setFormError(err)
      setConfirmOpen(false)
      return
    }

    setSaving(true)
    setFormError(null)

    const payload = baris.map((b) => ({
      tipe: normalizeUpper(b.tipe),
      serials: b.serials.map((s) => normalizeUpper(s)),
    }))
    const requestPayload: PendingSubmitPayload = {
      toko_tujuan: normalizeUpper(tokoTujuan),
      nomor_do: normalizeUpper(nomorDo),
      nomor_kendaraan: normalizeUpper(nomorKendaraan),
      nama_supir_vendor: normalizeUpper(namaSupirVendor),
      tanggal_pengiriman: getLocalDateString(new Date()),
      catatan: catatan.trim() ? normalizeUpper(catatan) : null,
      details: payload,
    }

    const supabase = createClient()
    const { data, error } = await supabase.rpc("submit_pengiriman_staff", {
      p_toko_tujuan: requestPayload.toko_tujuan,
      p_nomor_do: requestPayload.nomor_do,
      p_nomor_kendaraan: requestPayload.nomor_kendaraan,
      p_nama_supir_vendor: requestPayload.nama_supir_vendor,
      p_tanggal_pengiriman: requestPayload.tanggal_pengiriman,
      p_catatan: requestPayload.catatan,
      p_details: requestPayload.details,
    })

    setSaving(false)

    if (error) {
      saveBackupToLocal(requestPayload)
      setFormError(formatRpcError(error.message))
      return
    }

    clearBackupLocal()
    setConfirmOpen(false)
    setSuccessMsg(
      `Pengiriman berhasil disimpan (ID: ${data ?? "—"}). Form telah dikosongkan untuk entri berikutnya.`
    )
    resetForm()
  }

  async function retryBackupSubmission() {
    const backup = readBackupLocal()
    if (!backup) {
      setBackupPending(false)
      return
    }
    setRetryingBackup(true)
    setFormError(null)
    const supabase = createClient()
    const { data, error } = await supabase.rpc("submit_pengiriman_staff", {
      p_toko_tujuan: backup.toko_tujuan,
      p_nomor_do: backup.nomor_do,
      p_nomor_kendaraan: backup.nomor_kendaraan,
      p_nama_supir_vendor: backup.nama_supir_vendor,
      p_tanggal_pengiriman: backup.tanggal_pengiriman,
      p_catatan: backup.catatan,
      p_details: backup.details,
    })
    setRetryingBackup(false)
    if (error) {
      setFormError(
        `Retry gagal: ${formatRpcError(error.message)}. Backup tetap tersimpan dan bisa dicoba lagi.`
      )
      return
    }
    clearBackupLocal()
    setSuccessMsg(`Backup pengiriman berhasil dikirim ulang (ID: ${data ?? "—"}).`)
  }

  function updateBaris(id: string, patch: Partial<BarisTipe>) {
    setBaris((prev) =>
      prev.map((b) => (b.id === id ? { ...b, ...patch } : b))
    )
  }

  function tambahTipe() {
    setBaris((prev) => [...prev, newBaris()])
  }

  function hapusTipe(id: string) {
    setBaris((prev) => {
      if (prev.length <= 1) return prev
      return prev.filter((b) => b.id !== id)
    })
  }

  function tambahSerial(b: BarisTipe) {
    const sn = b.draftSerial.trim()
    if (!sn) {
      setFormError("Masukkan nomor seri sebelum menambah.")
      return
    }
    if (b.maxSerial.trim()) {
      const max = Number(b.maxSerial)
      if (Number.isInteger(max) && max > 0 && b.serials.length >= max) {
        setFormError(
          `Tipe "${b.tipe || "tanpa tipe"}" sudah mencapai batas maksimal ${max} serial.`
        )
        return
      }
    }
    const duplicate = barisRef.current.some((row) =>
      row.serials.some((serial) => serial.trim().toLowerCase() === sn.toLowerCase())
    )
    if (duplicate) {
      setFormError(`Nomor seri "${sn}" sudah terdaftar di pengiriman ini.`)
      return
    }
    setFormError(null)
    updateBaris(b.id, {
      serials: [...b.serials, normalizeUpper(sn)],
      draftSerial: "",
    })
  }

  function hapusSerial(barisId: string, index: number) {
    setBaris((prev) =>
      prev.map((b) =>
        b.id === barisId
          ? { ...b, serials: b.serials.filter((_, i) => i !== index) }
          : b
      )
    )
  }

  function handleBarcodeResult(serialNumbers: string[]) {
    const st = scannerStateRef.current
    if (!st?.open) return
    const lineId = st.lineId
    const prev = barisRef.current

    const seen = new Map<string, string>()
    for (const b of prev) {
      for (const raw of b.serials) {
        seen.set(raw.trim().toLowerCase(), b.tipe)
      }
    }

    const toAdd: string[] = []
    const skipped: string[] = []
    const maxLimited: string[] = []
    const selectedRow = prev.find((b) => b.id === lineId)
    const max = selectedRow?.maxSerial.trim()
      ? Number(selectedRow.maxSerial)
      : null
    let remaining =
      max && Number.isInteger(max) && max > 0
        ? Math.max(0, max - (selectedRow?.serials.length ?? 0))
        : Number.POSITIVE_INFINITY

    for (const raw of serialNumbers) {
      const sn = normalizeUpper(raw)
      if (!sn) continue
      if (remaining <= 0) {
        maxLimited.push(sn)
        continue
      }
      const key = sn.toLowerCase()
      if (seen.has(key)) {
        skipped.push(sn)
        continue
      }
      const lineTipe = prev.find((b) => b.id === lineId)?.tipe ?? ""
      seen.set(key, lineTipe)
      toAdd.push(sn)
      remaining -= 1
    }

    if (toAdd.length > 0) {
      const row = prev.find((b) => b.id === lineId)
      updateBaris(lineId, {
        serials: [...(row?.serials ?? []), ...toAdd],
      })
      setSuccessMsg(
        `${toAdd.length} nomor seri berhasil ditambahkan.`
      )
    } else {
      setSuccessMsg(null)
    }

    if (skipped.length > 0) {
      const dupDetail = skipped
        .map((sn) => {
          const t = seen.get(sn.toLowerCase())
          return `"${sn}" (tipe "${t ?? "—"}")`
        })
        .join(", ")
      const totalInput = serialNumbers.filter((s) => s.trim()).length
      setFormError(
        toAdd.length === 0 && skipped.length === totalInput
          ? `Nomor seri berikut sudah terdaftar: ${dupDetail}.`
          : `Nomor duplikat dilewati: ${dupDetail}.`
      )
    } else if (toAdd.length > 0) {
      setFormError(null)
    }
    if (maxLimited.length > 0) {
      const limit = max && Number.isInteger(max) && max > 0 ? max : 0
      setFormError(
        `Batas maksimal serial untuk tipe ini (${limit}) sudah tercapai. ${maxLimited.length} serial tidak ditambahkan.`
      )
    }
  }

  return (
    <div className="mx-auto flex w-full max-w-3xl flex-col gap-4 p-4 pb-10 sm:p-6">
      {successMsg ? (
        <Card className="border-emerald-300 bg-emerald-50 dark:border-emerald-800 dark:bg-emerald-950/40">
          <CardContent className="text-emerald-900 dark:text-emerald-100 pt-6 text-sm">
            {successMsg}
          </CardContent>
        </Card>
      ) : null}

      {formError ? (
        <Card className="border-destructive/40 bg-destructive/5">
          <CardContent className="text-destructive pt-6 text-sm" role="alert">
            {formError}
          </CardContent>
        </Card>
      ) : null}
      {backupPending ? (
        <Card className="border-amber-300 bg-amber-50 dark:border-amber-800 dark:bg-amber-950/40">
          <CardContent className="pt-6 text-sm text-amber-900 dark:text-amber-100">
            Pengiriman sebelumnya gagal terkirim ke database dan sudah dibackup di perangkat ini.
            <div className="mt-3">
              <Button
                type="button"
                variant="secondary"
                onClick={() => void retryBackupSubmission()}
                disabled={retryingBackup}
              >
                {retryingBackup ? "Mengirim ulang…" : "Kirim ulang backup"}
              </Button>
            </div>
          </CardContent>
        </Card>
      ) : null}

      <Card>
        <CardHeader>
          <CardTitle>Data pengiriman</CardTitle>
          <CardDescription>
            Isi toko, kendaraan, lalu tambah tipe mesin cuci dan nomor seri per
            tipe.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2 sm:col-span-2">
              <Label htmlFor="toko">Toko tujuan</Label>
              <Input
                id="toko"
                value={tokoTujuan}
                onChange={(e) => setTokoTujuan(e.target.value)}
                placeholder="Nama toko / cabang"
                className="h-10"
                autoComplete="organization"
              />
            </div>
            <div className="space-y-2 sm:col-span-2">
              <Label htmlFor="nomor-do">Nomor DO</Label>
              <Input
                id="nomor-do"
                value={nomorDo}
                onChange={(e) => setNomorDo(e.target.value)}
                placeholder="Contoh: DO-0426-001"
                className="h-10"
                autoComplete="off"
              />
            </div>
            <div className="space-y-2 sm:col-span-2">
              <Label htmlFor="kendaraan">Nomor kendaraan</Label>
              <Input
                id="kendaraan"
                value={nomorKendaraan}
                onChange={(e) => setNomorKendaraan(e.target.value)}
                placeholder="B 1234 XYZ"
                className="h-10"
                autoComplete="off"
              />
            </div>
            <div className="space-y-2 sm:col-span-2">
              <Label htmlFor="supir-vendor">Nama supir / vendor</Label>
              <Input
                id="supir-vendor"
                value={namaSupirVendor}
                onChange={(e) => setNamaSupirVendor(e.target.value)}
                placeholder="Nama supir atau vendor"
                className="h-10"
                autoComplete="off"
              />
            </div>
          </div>

          <div className="space-y-3">
            <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
              <Label className="text-base">Detail barang</Label>
              <Button
                type="button"
                variant="secondary"
                size="sm"
                onClick={tambahTipe}
              >
                Tambah tipe barang
              </Button>
            </div>

            <div className="space-y-4">
              {baris.map((b, idx) => (
                <Card
                  key={b.id}
                  className="border-border/80 bg-muted/20 shadow-none"
                >
                  <CardHeader className="flex flex-row items-start justify-between gap-2 space-y-0 pb-2">
                    <CardTitle className="text-sm font-medium">
                      Tipe #{idx + 1}
                    </CardTitle>
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      className="text-destructive hover:text-destructive h-8 shrink-0"
                      disabled={baris.length <= 1}
                      onClick={() => hapusTipe(b.id)}
                    >
                      Hapus tipe
                    </Button>
                  </CardHeader>
                  <CardContent className="space-y-4">
                    <div className="space-y-2">
                      <Label className="text-xs">Tipe mesin cuci</Label>
                      <Select
                        value={b.tipe || undefined}
                        onValueChange={(v) =>
                          updateBaris(b.id, { tipe: v })
                        }
                      >
                        <SelectTrigger className="h-10 w-full">
                          <SelectValue placeholder="Pilih tipe" />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectGroup>
                            <SelectLabel>Front Load (1 Tabung)</SelectLabel>
                            {TIPE_MESIN_FRONT_LOAD.map((t) => (
                              <SelectItem key={t.kode} value={t.kode}>
                                {t.kode}
                              </SelectItem>
                            ))}
                          </SelectGroup>
                          <SelectGroup>
                            <SelectLabel>Top Load (2 Tabung)</SelectLabel>
                            {TIPE_MESIN_TOP_LOAD.map((t) => (
                              <SelectItem key={t.kode} value={t.kode}>
                                {t.kode}
                              </SelectItem>
                            ))}
                          </SelectGroup>
                        </SelectContent>
                      </Select>
                    </div>

                    <div className="space-y-2">
                      <Label className="text-xs">
                        Maksimal nomor seri untuk tipe ini (opsional)
                      </Label>
                      <Input
                        value={b.maxSerial}
                        onChange={(e) =>
                          updateBaris(b.id, {
                            maxSerial: e.target.value.replace(/[^\d]/g, ""),
                          })
                        }
                        placeholder="Contoh: 10"
                        className="h-10"
                        inputMode="numeric"
                      />
                    </div>

                    <div className="space-y-2">
                      <Label className="text-xs">Scan nomor seri (manual)</Label>
                      <div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap">
                        <Input
                          value={b.draftSerial}
                          onChange={(e) =>
                            updateBaris(b.id, {
                              draftSerial: e.target.value,
                            })
                          }
                          onKeyDown={(e) => {
                            if (e.key === "Enter") {
                              e.preventDefault()
                              tambahSerial(b)
                            }
                          }}
                          placeholder="Ketik nomor seri"
                          className="h-10 min-w-0 flex-1"
                          autoComplete="off"
                        />
                        {b.tipe.trim() ? (
                          <Button
                            type="button"
                            variant="secondary"
                            className="h-10 shrink-0 sm:w-auto"
                            onClick={() =>
                              setScannerState({
                                open: true,
                                lineId: b.id,
                                kategori: getKategori(b.tipe),
                              })
                            }
                          >
                            Scan Serial Number
                          </Button>
                        ) : null}
                        <Button
                          type="button"
                          variant="outline"
                          className="h-10 shrink-0 sm:w-auto"
                          onClick={() => tambahSerial(b)}
                        >
                          Tambah
                        </Button>
                      </div>
                      <p className="text-muted-foreground text-xs">
                        Jumlah unit otomatis:{" "}
                        <span className="text-foreground font-medium">
                          {b.serials.length}
                        </span>
                      </p>
                    </div>

                    {b.serials.length > 0 ? (
                      <ul className="border-border divide-border max-h-48 divide-y overflow-y-auto rounded-lg border">
                        {b.serials.map((sn, i) => (
                          <li
                            key={`${b.id}-${i}-${sn}`}
                            className="flex items-center justify-between gap-2 px-3 py-2 text-sm"
                          >
                            <span className="font-mono text-xs break-all">
                              {sn}
                            </span>
                            <Button
                              type="button"
                              variant="ghost"
                              size="sm"
                              className="text-destructive hover:text-destructive h-8 shrink-0"
                              onClick={() => hapusSerial(b.id, i)}
                            >
                              Hapus
                            </Button>
                          </li>
                        ))}
                      </ul>
                    ) : (
                      <p className="text-muted-foreground text-xs">
                        Belum ada nomor seri untuk tipe ini.
                      </p>
                    )}
                  </CardContent>
                </Card>
              ))}
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="catatan">Catatan / keterangan (opsional)</Label>
            <Textarea
              id="catatan"
              value={catatan}
              onChange={(e) => setCatatan(e.target.value)}
              placeholder="Contoh: kirim pagi, hubungi penerima …"
              rows={3}
            />
          </div>
        </CardContent>
        <CardFooter className="flex flex-col gap-3 border-t pt-6 sm:flex-row sm:justify-between">
          <p className="text-muted-foreground text-xs sm:order-2">
            Total nomor seri:{" "}
            <span className="text-foreground font-medium">{totalSerial}</span>
          </p>
          <Button
            type="button"
            className="w-full sm:order-1 sm:w-auto"
            onClick={handleOpenConfirm}
          >
            Simpan pengiriman
          </Button>
        </CardFooter>
      </Card>

      <YoloScanner
        isOpen={Boolean(scannerState?.open)}
        kategori={scannerState?.kategori ?? "front-load"}
        onClose={() => setScannerState(null)}
        onResult={handleBarcodeResult}
      />

      <Dialog open={confirmOpen} onOpenChange={setConfirmOpen}>
        <DialogContent showClose={!saving}>
          <DialogHeader>
            <DialogTitle>Simpan pengiriman?</DialogTitle>
            <DialogDescription>
              Data akan disimpan ke database. Pastikan semua nomor seri sudah
              benar.
            </DialogDescription>
            <ul className="text-foreground mt-3 list-inside list-disc text-left text-sm">
              <li>Toko: {tokoTujuan.trim() || "—"}</li>
              <li>Nomor DO: {nomorDo.trim() || "—"}</li>
              <li>Kendaraan: {nomorKendaraan.trim() || "—"}</li>
              <li>Supir/Vendor: {namaSupirVendor.trim() || "—"}</li>
              <li>
                {baris.length} tipe, {totalSerial} nomor seri
              </li>
            </ul>
          </DialogHeader>
          <DialogFooter className="gap-2 sm:gap-0">
            <Button
              type="button"
              variant="outline"
              disabled={saving}
              onClick={() => setConfirmOpen(false)}
            >
              Batal
            </Button>
            <Button type="button" disabled={saving} onClick={handleConfirmSave}>
              {saving ? "Menyimpan…" : "Ya, simpan"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
