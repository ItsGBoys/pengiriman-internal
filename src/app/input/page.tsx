"use client"

import { useCallback, useMemo, useState } from "react"
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
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { Textarea } from "@/components/ui/textarea"

const TIPE_OPTIONS = [
  "Front Load 7kg",
  "Front Load 9kg",
  "Top Load 7kg",
  "Top Load 9kg",
  "Top Load 12kg",
] as const

type BarisTipe = {
  id: string
  tipe: string
  serials: string[]
  draftSerial: string
}

function newBaris(): BarisTipe {
  return {
    id: crypto.randomUUID(),
    tipe: "",
    serials: [],
    draftSerial: "",
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

export default function InputPengirimanPage() {
  const [tokoTujuan, setTokoTujuan] = useState("")
  const [nomorKendaraan, setNomorKendaraan] = useState("")
  const [catatan, setCatatan] = useState("")
  const [baris, setBaris] = useState<BarisTipe[]>(() => [newBaris()])
  const [formError, setFormError] = useState<string | null>(null)
  const [successMsg, setSuccessMsg] = useState<string | null>(null)
  const [confirmOpen, setConfirmOpen] = useState(false)
  const [saving, setSaving] = useState(false)

  const totalSerial = useMemo(
    () => baris.reduce((acc, b) => acc + b.serials.length, 0),
    [baris]
  )

  const resetForm = useCallback(() => {
    setTokoTujuan("")
    setNomorKendaraan("")
    setCatatan("")
    setBaris([newBaris()])
    setFormError(null)
  }, [])

  function validate(): string | null {
    if (!tokoTujuan.trim()) {
      return "Toko tujuan wajib diisi."
    }
    if (!nomorKendaraan.trim()) {
      return "Nomor kendaraan wajib diisi."
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
      tipe: b.tipe.trim(),
      serials: b.serials.map((s) => s.trim()),
    }))

    const supabase = createClient()
    const { data, error } = await supabase.rpc("submit_pengiriman_staff", {
      p_toko_tujuan: tokoTujuan.trim(),
      p_nomor_kendaraan: nomorKendaraan.trim(),
      p_tanggal_pengiriman: getLocalDateString(new Date()),
      p_catatan: catatan.trim() || null,
      p_details: payload,
    })

    setSaving(false)

    if (error) {
      setFormError(formatRpcError(error.message))
      return
    }

    setConfirmOpen(false)
    setSuccessMsg(
      `Pengiriman berhasil disimpan (ID: ${data ?? "—"}). Form telah dikosongkan untuk entri berikutnya.`
    )
    resetForm()
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
    setFormError(null)
    updateBaris(b.id, {
      serials: [...b.serials, sn],
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
                          {TIPE_OPTIONS.map((opt) => (
                            <SelectItem key={opt} value={opt}>
                              {opt}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>

                    <div className="space-y-2">
                      <Label className="text-xs">Scan nomor seri (manual)</Label>
                      <div className="flex flex-col gap-2 sm:flex-row">
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
                          className="h-10 flex-1"
                          autoComplete="off"
                        />
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
              <li>Kendaraan: {nomorKendaraan.trim() || "—"}</li>
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
