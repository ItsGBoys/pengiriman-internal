"use client"

import { useEffect, useRef, useState } from "react"
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

export interface BarcodeScannerProps {
  isOpen: boolean
  onClose: () => void
  onResult: (serialNumber: string) => void
  kategori: "front-load" | "top-load"
}

export default function BarcodeScanner({
  isOpen,
  onClose,
  onResult,
  kategori,
}: BarcodeScannerProps) {
  const scannerRef = useRef<Html5Qrcode | null>(null)
  const onResultRef = useRef(onResult)
  const onCloseRef = useRef(onClose)
  const [cameraError, setCameraError] = useState<string | null>(null)

  onResultRef.current = onResult
  onCloseRef.current = onClose

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
            const upper = decodedText.toUpperCase()
            const match = upper.match(SERIAL_PATTERN)
            if (match) {
              html5QrCode
                .stop()
                .then(() => {
                  scannerRef.current = null
                  onResultRef.current(match[0])
                  onCloseRef.current()
                })
                .catch(() => {})
            }
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
          Arahkan kamera ke barcode pada stiker produk hingga nomor terbaca otomatis.
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
              <div className="bg-background p-4 pb-[max(1rem,env(safe-area-inset-bottom))]">
                <p className="text-muted-foreground text-center text-sm">
                  {instruction}
                </p>
                <p className="text-muted-foreground mt-2 text-center text-xs">
                  Memindai otomatis… arahkan barcode ke dalam kotak
                </p>
              </div>
            </>
          )}
        </div>
      </DialogContent>
    </Dialog>
  )
}
