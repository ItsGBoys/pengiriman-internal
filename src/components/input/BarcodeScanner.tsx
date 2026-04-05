"use client"

import { useEffect, useRef, useState } from "react"
import { X } from "lucide-react"
import type { Html5Qrcode } from "html5-qrcode"

import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogTitle,
} from "@/components/ui/dialog"
import { cn } from "@/lib/utils"

const scannerId = "barcode-scanner-container"
const SERIAL_PATTERN = /\b\d{2}[0-9OND]\d{7}\b/
const SCAN_COOLDOWN_MS = 1500
const FEEDBACK_CLEAR_MS = 2000

export interface BarcodeScannerProps {
  isOpen: boolean
  onClose: () => void
  onResult: (serialNumbers: string[]) => void
  kategori: "front-load" | "top-load"
}

export default function BarcodeScanner({
  isOpen,
  onClose,
  onResult,
  kategori,
}: BarcodeScannerProps) {
  const scannerRef = useRef<Html5Qrcode | null>(null)
  const scannedListRef = useRef<string[]>([])
  const cooldownUntilRef = useRef(0)
  const feedbackTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  const [cameraError, setCameraError] = useState<string | null>(null)
  const [scannedList, setScannedList] = useState<string[]>([])
  const [scanFeedback, setScanFeedback] = useState<string | null>(null)
  const [showList, setShowList] = useState(false)

  useEffect(() => {
    if (isOpen) {
      setScannedList([])
      scannedListRef.current = []
      setShowList(false)
      setScanFeedback(null)
      cooldownUntilRef.current = 0
      if (feedbackTimeoutRef.current) {
        clearTimeout(feedbackTimeoutRef.current)
        feedbackTimeoutRef.current = null
      }
    }
  }, [isOpen])

  useEffect(() => {
    scannedListRef.current = scannedList
  }, [scannedList])

  useEffect(() => {
    if (!isOpen) {
      scannerRef.current?.stop().catch(() => {})
      scannerRef.current = null
      setCameraError(null)
      return
    }

    let cancelled = false

    const run = async () => {
      try {
        const { Html5Qrcode, Html5QrcodeSupportedFormats } = await import(
          "html5-qrcode"
        )

        await new Promise<void>((resolve) => {
          requestAnimationFrame(() => requestAnimationFrame(() => resolve()))
        })
        if (cancelled) return

        if (!document.getElementById(scannerId)) return

        const html5QrCode = new Html5Qrcode(scannerId, {
          verbose: false,
          formatsToSupport: [
            Html5QrcodeSupportedFormats.CODE_128,
            Html5QrcodeSupportedFormats.EAN_13,
            Html5QrcodeSupportedFormats.EAN_8,
            Html5QrcodeSupportedFormats.UPC_A,
            Html5QrcodeSupportedFormats.QR_CODE,
          ],
        })
        scannerRef.current = html5QrCode

        await html5QrCode.start(
          { facingMode: "environment" },
          {
            fps: 10,
            qrbox:
              kategori === "front-load"
                ? { width: 200, height: 300 }
                : { width: 300, height: 200 },
          },
          (decodedText) => {
            if (cancelled) return
            if (Date.now() < cooldownUntilRef.current) return

            const upper = decodedText.toUpperCase()
            const match = upper.match(SERIAL_PATTERN)
            if (!match) return

            const sn = match[0]
            const key = sn.toLowerCase()
            if (
              scannedListRef.current.some((s) => s.toLowerCase() === key)
            ) {
              return
            }

            const next = [...scannedListRef.current, sn]
            scannedListRef.current = next
            setScannedList(next)
            cooldownUntilRef.current = Date.now() + SCAN_COOLDOWN_MS
            setScanFeedback(`✓ ${sn} ditambahkan`)

            if (feedbackTimeoutRef.current) {
              clearTimeout(feedbackTimeoutRef.current)
            }
            feedbackTimeoutRef.current = setTimeout(() => {
              setScanFeedback(null)
              feedbackTimeoutRef.current = null
            }, FEEDBACK_CLEAR_MS)
          },
          undefined
        )
      } catch {
        if (!cancelled) {
          setCameraError(
            "Tidak dapat mengakses kamera. Periksa izin peramban Anda."
          )
        }
      }
    }

    void run()

    return () => {
      cancelled = true
      if (feedbackTimeoutRef.current) {
        clearTimeout(feedbackTimeoutRef.current)
        feedbackTimeoutRef.current = null
      }
      scannerRef.current?.stop().catch(() => {})
      scannerRef.current = null
    }
  }, [isOpen, kategori])

  const instruction =
    kategori === "front-load"
      ? "Arahkan ke stiker di SAMPING dus"
      : "Arahkan ke stiker di DEPAN dus"

  const handleOpenChange = (open: boolean) => {
    if (!open) {
      scannerRef.current?.stop().catch(() => {})
      scannerRef.current = null
      onClose()
    }
  }

  function removeScannedAt(index: number) {
    setScannedList((prev) => {
      const next = prev.filter((_, i) => i !== index)
      scannedListRef.current = next
      return next
    })
  }

  function handleSelesai() {
    if (scannedList.length === 0) return
    scannerRef.current?.stop().catch(() => {})
    scannerRef.current = null
    onResult([...scannedList])
    onClose()
  }

  const n = scannedList.length

  return (
    <Dialog open={isOpen} onOpenChange={handleOpenChange}>
      <DialogContent
        showClose={false}
        onPointerDownOutside={(e) => e.preventDefault()}
        className={cn(
          "flex max-h-[100dvh] flex-col gap-0 overflow-hidden p-0",
          "top-0 left-0 h-full w-full max-w-full translate-x-0 translate-y-0 rounded-none border-0 shadow-none",
          "sm:top-[50%] sm:left-[50%] sm:h-auto sm:max-h-[90vh] sm:max-w-lg sm:translate-x-[-50%] sm:translate-y-[-50%] sm:rounded-xl sm:border sm:shadow-lg"
        )}
        aria-describedby={undefined}
      >
        <DialogTitle className="sr-only">Pindai barcode nomor seri</DialogTitle>
        <DialogDescription className="sr-only">
          Pindai beberapa nomor seri dalam satu sesi, lalu ketuk Selesai untuk
          menambahkan ke formulir.
        </DialogDescription>

        <div className="relative flex min-h-0 flex-1 flex-col bg-black">
          <Button
            type="button"
            variant="secondary"
            size="sm"
            className="absolute top-2 left-2 z-20 h-8 shrink-0 px-3 text-xs"
            onClick={() => handleOpenChange(false)}
          >
            Batal
          </Button>

          {cameraError ? (
            <div className="text-background flex flex-1 flex-col items-center justify-center gap-3 p-6 text-center text-sm">
              <p>{cameraError}</p>
              <Button type="button" variant="secondary" onClick={onClose}>
                Tutup
              </Button>
            </div>
          ) : (
            <>
              <div
                id={scannerId}
                className="min-h-[min(100dvh,480px)] w-full flex-1"
              />
              <div className="bg-background flex max-h-[45vh] min-h-0 flex-col gap-3 p-4 pb-[max(1rem,env(safe-area-inset-bottom))]">
                <p className="text-muted-foreground text-center text-sm">
                  {instruction}
                </p>
                <p className="text-muted-foreground text-center text-xs">
                  Memindai otomatis… arahkan barcode ke dalam kotak
                </p>
                {scanFeedback ? (
                  <p className="text-center text-sm font-medium text-emerald-600 dark:text-emerald-400">
                    {scanFeedback}
                  </p>
                ) : null}

                <div
                  className={cn(
                    "overflow-hidden transition-[max-height] duration-200 ease-in-out",
                    showList && n > 0 ? "max-h-40" : "max-h-0"
                  )}
                  aria-hidden={!showList || n === 0}
                >
                  <ul className="border-border max-h-40 divide-y overflow-y-auto rounded-md border text-sm">
                    {scannedList.map((sn, i) => (
                      <li
                        key={`${sn}-${i}`}
                        className="flex items-center justify-between gap-2 px-2 py-1.5"
                      >
                        <span className="font-mono text-xs break-all">
                          {sn}
                        </span>
                        <Button
                          type="button"
                          variant="ghost"
                          size="icon"
                          className="text-destructive hover:text-destructive size-8 shrink-0"
                          aria-label={`Hapus ${sn}`}
                          onClick={() => removeScannedAt(i)}
                        >
                          <X className="size-4" />
                        </Button>
                      </li>
                    ))}
                  </ul>
                </div>

                {n > 0 ? (
                  <button
                    type="button"
                    onClick={() => setShowList((v) => !v)}
                    className="bg-emerald-600 hover:bg-emerald-700 dark:bg-emerald-700 dark:hover:bg-emerald-600 w-full rounded-full px-4 py-2 text-center text-sm font-medium text-white transition-colors"
                  >
                    {n} terscan {showList ? "▲" : "▼"}
                  </button>
                ) : null}

                <div className="flex justify-end pt-1">
                  <Button
                    type="button"
                    size="lg"
                    className={cn(
                      "min-w-[10rem]",
                      n > 0 &&
                        "bg-emerald-600 text-white hover:bg-emerald-700 dark:bg-emerald-700 dark:hover:bg-emerald-600"
                    )}
                    disabled={n === 0}
                    onClick={handleSelesai}
                  >
                    {n > 0 ? `Selesai (${n})` : "Selesai"}
                  </Button>
                </div>
              </div>
            </>
          )}
        </div>
      </DialogContent>
    </Dialog>
  )
}
