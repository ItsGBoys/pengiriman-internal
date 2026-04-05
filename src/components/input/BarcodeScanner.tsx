"use client"

import { useEffect, useRef, useState } from "react"

import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogTitle,
} from "@/components/ui/dialog"
import { cn } from "@/lib/utils"

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
  const videoRef = useRef<HTMLVideoElement>(null)
  const readerRef = useRef<{
    reset: () => void
  } | null>(null)
  const isScanningRef = useRef(false)
  const onResultRef = useRef(onResult)
  const onCloseRef = useRef(onClose)
  const [cameraError, setCameraError] = useState<string | null>(null)

  onResultRef.current = onResult
  onCloseRef.current = onClose

  useEffect(() => {
    if (!isOpen) {
      isScanningRef.current = false
      readerRef.current?.reset()
      readerRef.current = null
      setCameraError(null)
      return
    }

    if (isScanningRef.current) return
    isScanningRef.current = true

    let cancelled = false
    let restorePlay: (() => void) | null = null

    const start = async () => {
      await new Promise<void>((resolve) => {
        requestAnimationFrame(() => requestAnimationFrame(() => resolve()))
      })
      if (cancelled) return

      const video = videoRef.current
      if (!video) {
        isScanningRef.current = false
        return
      }

      try {
        const {
          BrowserMultiFormatReader,
          DecodeHintType,
          NotFoundException,
        } = await import("@zxing/library")

        if (cancelled) {
          isScanningRef.current = false
          return
        }

        const origPlay = video.play.bind(video)
        video.play = () => {
          return (async () => {
            try {
              if (video.paused) await origPlay()
            } catch (_) {}
          })()
        }
        restorePlay = () => {
          video.play = origPlay
          restorePlay = null
        }

        // Kamera belakang: deviceId null → ZXing memakai facingMode "environment"
        // (setara prefer kamera depan = false)
        const hints = new Map()
        hints.set(DecodeHintType.TRY_HARDER, true)

        const codeReader = new BrowserMultiFormatReader(hints, 200)
        readerRef.current = codeReader

        await codeReader.decodeFromVideoDevice(null, video, (result, err) => {
          if (cancelled) return
          if (err) {
            if (err instanceof NotFoundException) return
            return
          }
          if (!result) return
          console.log('Raw scan result:', result.getText())
          const upper = result.getText().toUpperCase()
          const match = upper.match(SERIAL_PATTERN)
          if (match) {
            cancelled = true
            codeReader.reset()
            readerRef.current = null
            isScanningRef.current = false
            restorePlay?.()
            restorePlay = null
            onResultRef.current(match[0])
            onCloseRef.current()
          }
        })
      } catch {
        restorePlay?.()
        restorePlay = null
        if (!cancelled) {
          setCameraError(
            "Tidak dapat mengakses kamera. Periksa izin peramban Anda."
          )
        }
        isScanningRef.current = false
      }
    }

    void start()

    return () => {
      cancelled = true
      isScanningRef.current = false
      restorePlay?.()
      readerRef.current?.reset()
      readerRef.current = null
    }
  }, [isOpen])

  const instruction =
    kategori === "front-load"
      ? "Arahkan ke stiker di SAMPING dus"
      : "Arahkan ke stiker di DEPAN dus"

  const roiPortrait = kategori === "front-load"

  const handleOpenChange = (open: boolean) => {
    if (!open) {
      isScanningRef.current = false
      readerRef.current?.reset()
      readerRef.current = null
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
              <div className="relative min-h-0 flex-1 w-full">
                <video
                  ref={videoRef}
                  className="absolute inset-0 h-full w-full object-cover"
                  playsInline
                  muted
                />
                <div className="pointer-events-none absolute inset-0 flex items-center justify-center p-4">
                  <div
                    className={cn(
                      "relative border-2 border-white shadow-[0_0_0_9999px_rgba(0,0,0,0.45)]",
                      roiPortrait
                        ? "aspect-[3/5] w-[38%] max-w-[220px]"
                        : "aspect-[5/3] w-[78%] max-w-md"
                    )}
                  >
                    <span className="absolute -top-0.5 -left-0.5 h-5 w-5 border-t-4 border-l-4 border-white" />
                    <span className="absolute -top-0.5 -right-0.5 h-5 w-5 border-t-4 border-r-4 border-white" />
                    <span className="absolute -bottom-0.5 -left-0.5 h-5 w-5 border-b-4 border-l-4 border-white" />
                    <span className="absolute -right-0.5 -bottom-0.5 h-5 w-5 border-b-4 border-r-4 border-white" />
                  </div>
                </div>
              </div>

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
