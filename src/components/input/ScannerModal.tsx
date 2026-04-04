"use client"

import { useCallback, useEffect, useRef, useState } from "react"
import { createWorker, PSM } from "tesseract.js"
import { Loader2 } from "lucide-react"

import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogTitle,
} from "@/components/ui/dialog"
import { cn } from "@/lib/utils"

const OPENCV_CDN = "https://docs.opencv.org/4.8.0/opencv.js"
const SERIAL_PATTERN = /\b25[0-9A-C]\d{7}\b/

export interface ScannerModalProps {
  isOpen: boolean
  onClose: () => void
  onResult: (serialNumber: string) => void
  kategori: "front-load" | "top-load"
}

type CvGlobal = {
  COLOR_RGBA2GRAY: number
  THRESH_BINARY: number
  THRESH_OTSU: number
  CV_32F: number
  CV_8U: number
  INTER_LINEAR: number
  Mat: new () => {
    delete: () => void
    cols: number
    rows: number
  }
  matFromArray: (
    rows: number,
    cols: number,
    type: number,
    array: number[]
  ) => { delete: () => void }
  imread: (source: HTMLCanvasElement) => CvMat
  imshow: (canvas: HTMLCanvasElement, mat: CvMat) => void
  cvtColor: (src: CvMat, dst: CvMat, code: number) => void
  threshold: (
    src: CvMat,
    dst: CvMat,
    thresh: number,
    maxval: number,
    type: number
  ) => void
  filter2D: (
    src: CvMat,
    dst: CvMat,
    ddepth: number,
    kernel: { delete: () => void }
  ) => void
  resize: (
    src: CvMat,
    dst: CvMat,
    dsize: { width: number; height: number },
    fx: number,
    fy: number,
    interpolation: number
  ) => void
  Size: new (w: number, h: number) => { width: number; height: number }
  onRuntimeInitialized?: () => void
}

type CvMat = {
  delete: () => void
  cols: number
  rows: number
}

declare global {
  interface Window {
    cv?: CvGlobal
  }
}

let opencvLoadPromise: Promise<CvGlobal> | null = null

function loadOpenCvFromCdn(): Promise<CvGlobal> {
  if (typeof window === "undefined") {
    return Promise.reject(new Error("OpenCV hanya tersedia di browser."))
  }
  if (window.cv?.Mat) {
    return Promise.resolve(window.cv as CvGlobal)
  }
  if (opencvLoadPromise) {
    return opencvLoadPromise
  }

  opencvLoadPromise = new Promise((resolve, reject) => {
    const existing = document.querySelector(
      `script[src="${OPENCV_CDN}"]`
    ) as HTMLScriptElement | null

    const attachInit = (cv: CvGlobal) => {
      if (cv.Mat) {
        resolve(cv)
        return
      }
      const prev = cv.onRuntimeInitialized
      cv.onRuntimeInitialized = () => {
        prev?.()
        resolve(cv)
      }
    }

    if (existing && window.cv) {
      attachInit(window.cv as CvGlobal)
      return
    }

    const script = document.createElement("script")
    script.src = OPENCV_CDN
    script.async = true
    script.dataset.opencvCdn = "4.8.0"
    script.onload = () => {
      const cv = window.cv
      if (!cv) {
        reject(new Error("OpenCV tidak terdefinisi setelah memuat skrip."))
        return
      }
      attachInit(cv as CvGlobal)
    }
    script.onerror = () => {
      opencvLoadPromise = null
      reject(new Error("Gagal memuat OpenCV dari CDN."))
    }
    document.body.appendChild(script)
  })

  return opencvLoadPromise
}

function getVideoContentRect(video: HTMLVideoElement) {
  const vw = video.videoWidth
  const vh = video.videoHeight
  const cw = video.clientWidth
  const ch = video.clientHeight
  if (!vw || !vh || !cw || !ch) {
    return null
  }
  const vr = vw / vh
  const er = cw / ch
  let contentW: number
  let contentH: number
  let offX: number
  let offY: number
  if (vr > er) {
    contentW = cw
    contentH = cw / vr
    offX = 0
    offY = (ch - contentH) / 2
  } else {
    contentH = ch
    contentW = ch * vr
    offX = (cw - contentW) / 2
    offY = 0
  }
  return { contentW, contentH, offX, offY, vw, vh }
}

function mapRoiToVideoCrop(
  video: HTMLVideoElement,
  roiEl: HTMLElement
): { sx: number; sy: number; sw: number; sh: number } | null {
  const inner = getVideoContentRect(video)
  if (!inner) return null
  const { contentW, contentH, offX, offY, vw, vh } = inner

  const vRect = video.getBoundingClientRect()
  const rRect = roiEl.getBoundingClientRect()

  const scaleX = vw / contentW
  const scaleY = vh / contentH

  const relLeft = rRect.left - vRect.left - offX
  const relTop = rRect.top - vRect.top - offY

  const sx = Math.round(relLeft * scaleX)
  const sy = Math.round(relTop * scaleY)
  const sw = Math.round(rRect.width * scaleX)
  const sh = Math.round(rRect.height * scaleY)

  const sxClamped = Math.max(0, Math.min(sx, vw - 1))
  const syClamped = Math.max(0, Math.min(sy, vh - 1))
  const swClamped = Math.max(1, Math.min(sw, vw - sxClamped))
  const shClamped = Math.max(1, Math.min(sh, vh - syClamped))

  return { sx: sxClamped, sy: syClamped, sw: swClamped, sh: shClamped }
}

function preprocessWithOpenCv(
  sourceCanvas: HTMLCanvasElement,
  cv: CvGlobal
): HTMLCanvasElement {
  const src = cv.imread(sourceCanvas)
  const gray = new cv.Mat()
  const binary = new cv.Mat()
  const sharpened = new cv.Mat()
  const resized = new cv.Mat()

  try {
    cv.cvtColor(src, gray, cv.COLOR_RGBA2GRAY)
    cv.threshold(
      gray,
      binary,
      0,
      255,
      cv.THRESH_BINARY + cv.THRESH_OTSU
    )
    const kernel = cv.matFromArray(3, 3, cv.CV_32F, [
      0, -1, 0, -1, 5, -1, 0, -1, 0,
    ])
    try {
      cv.filter2D(binary, sharpened, cv.CV_8U, kernel)
    } finally {
      kernel.delete()
    }

    const dsize = new cv.Size(sharpened.cols * 2, sharpened.rows * 2)
    cv.resize(sharpened, resized, dsize, 0, 0, cv.INTER_LINEAR)

    const out = document.createElement("canvas")
    out.width = resized.cols
    out.height = resized.rows
    cv.imshow(out, resized)
    return out
  } finally {
    src.delete()
    gray.delete()
    binary.delete()
    sharpened.delete()
    resized.delete()
  }
}

export function ScannerModal({
  isOpen,
  onClose,
  onResult,
  kategori,
}: ScannerModalProps) {
  const videoRef = useRef<HTMLVideoElement>(null)
  const roiRef = useRef<HTMLDivElement>(null)
  const streamRef = useRef<MediaStream | null>(null)
  const workerRef = useRef<Awaited<ReturnType<typeof createWorker>> | null>(
    null
  )
  const cancelledRef = useRef(false)
  const isOpenRef = useRef(isOpen)
  isOpenRef.current = isOpen

  const [opencvReady, setOpencvReady] = useState(false)
  const [opencvLoading, setOpencvLoading] = useState(false)
  const [opencvError, setOpencvError] = useState<string | null>(null)
  const [cameraError, setCameraError] = useState<string | null>(null)
  const [processing, setProcessing] = useState(false)
  const [scanError, setScanError] = useState<string | null>(null)

  const stopCamera = useCallback(() => {
    streamRef.current?.getTracks().forEach((t) => t.stop())
    streamRef.current = null
    const v = videoRef.current
    if (v) {
      v.srcObject = null
    }
  }, [])

  useEffect(() => {
    let active = true
    setOpencvError(null)
    setOpencvLoading(true)
    setOpencvReady(false)

    loadOpenCvFromCdn()
      .then(() => {
        if (!active) return
        setOpencvReady(true)
        setOpencvLoading(false)
      })
      .catch((e: Error) => {
        if (!active) return
        setOpencvError(e.message ?? "Gagal memuat OpenCV.")
        setOpencvLoading(false)
      })

    return () => {
      active = false
    }
  }, [])

  useEffect(() => {
    if (!isOpen) return
    cancelledRef.current = false
    setScanError(null)
    setCameraError(null)
    setProcessing(false)
  }, [isOpen])

  useEffect(() => {
    if (!isOpen) {
      stopCamera()
      return
    }

    let alive = true
    ;(async () => {
      try {
        const stream = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: { ideal: "environment" } },
          audio: false,
        })
        if (!alive) {
          stream.getTracks().forEach((t) => t.stop())
          return
        }
        streamRef.current = stream
        const v = videoRef.current
        if (v) {
          v.srcObject = stream
          await v.play().catch(() => {})
        }
        setCameraError(null)
      } catch {
        if (alive) {
          setCameraError(
            "Tidak dapat mengakses kamera. Periksa izin peramban Anda."
          )
        }
      }
    })()

    return () => {
      alive = false
      stopCamera()
    }
  }, [isOpen, stopCamera])

  useEffect(() => {
    return () => {
      void workerRef.current?.terminate()
      workerRef.current = null
    }
  }, [])

  const handleOpenChange = (open: boolean) => {
    if (!open) {
      cancelledRef.current = true
      void workerRef.current?.terminate()
      workerRef.current = null
      stopCamera()
      onClose()
    }
  }

  const handleCobaLagi = () => {
    setScanError(null)
  }

  const captureAndProcess = async () => {
    const video = videoRef.current
    const roi = roiRef.current
    const cv = window.cv as CvGlobal | undefined
    if (!video || !roi || !cv?.Mat) {
      setScanError("Kamera atau OpenCV belum siap. Coba lagi.")
      return
    }
    const crop = mapRoiToVideoCrop(video, roi)
    if (!crop || crop.sw < 2 || crop.sh < 2) {
      setScanError("Area pemindaian tidak valid. Coba lagi.")
      return
    }

    setProcessing(true)
    setScanError(null)
    cancelledRef.current = false

    try {
      const { sx, sy, sw, sh } = crop
      const cap = document.createElement("canvas")
      cap.width = sw
      cap.height = sh
      const ctx = cap.getContext("2d")
      if (!ctx) {
        throw new Error("Canvas tidak tersedia.")
      }
      ctx.drawImage(video, sx, sy, sw, sh, 0, 0, sw, sh)

      const processed = preprocessWithOpenCv(cap, cv)

      if (!workerRef.current) {
        workerRef.current = await createWorker("eng")
        await workerRef.current.setParameters({
          tessedit_char_whitelist: "0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ",
          tessedit_pageseg_mode: PSM.SINGLE_BLOCK,
        })
      }

      if (cancelledRef.current || !isOpenRef.current) return

      const {
        data: { text },
      } = await workerRef.current.recognize(processed)

      if (cancelledRef.current || !isOpenRef.current) return

      const upper = text.toUpperCase()
      const match = upper.match(SERIAL_PATTERN)
      if (match) {
        void workerRef.current?.terminate()
        workerRef.current = null
        onResult(match[0])
        onClose()
        return
      }

      setScanError("Nomor seri tidak terdeteksi, coba lagi")
    } catch (e) {
      if (!cancelledRef.current) {
        setScanError(
          e instanceof Error
            ? e.message
            : "Terjadi kesalahan saat memproses gambar."
        )
      }
    } finally {
      if (!cancelledRef.current) {
        setProcessing(false)
      }
    }
  }

  const showOpencvWait = opencvLoading || (!opencvReady && !opencvError)
  const instruction =
    kategori === "front-load"
      ? "Arahkan ke stiker di SAMPING dus"
      : "Arahkan ke stiker di DEPAN dus"

  const roiPortrait = kategori === "front-load"

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
        <DialogTitle className="sr-only">Pindai nomor seri</DialogTitle>
        <DialogDescription className="sr-only">
          Gunakan kamera untuk membaca nomor seri pada stiker produk.
        </DialogDescription>

        <div className="relative flex min-h-0 flex-1 flex-col bg-black">
          <Button
            type="button"
            variant="secondary"
            size="sm"
            className="absolute top-2 left-2 z-20 h-8 shrink-0 px-3 text-xs"
            disabled={processing}
            onClick={() => handleOpenChange(false)}
          >
            Batal
          </Button>

          {opencvError ? (
            <div className="text-background flex flex-1 flex-col items-center justify-center gap-3 p-6 text-center text-sm">
              <p>Gagal memuat OpenCV: {opencvError}</p>
              <Button type="button" variant="secondary" onClick={onClose}>
                Tutup
              </Button>
            </div>
          ) : cameraError ? (
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
                  className="absolute inset-0 h-full w-full object-contain"
                  playsInline
                  muted
                  autoPlay
                />

                {showOpencvWait ? (
                  <div className="absolute inset-0 z-10 flex flex-col items-center justify-center gap-2 bg-black/80 text-white">
                    <Loader2 className="size-8 animate-spin" />
                    <p className="text-sm">Memuat OpenCV…</p>
                  </div>
                ) : null}

                {!showOpencvWait && !processing ? (
                  <div className="pointer-events-none absolute inset-0 flex items-center justify-center p-4">
                    <div
                      ref={roiRef}
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
                ) : null}

                {processing ? (
                  <div className="absolute inset-0 z-10 flex flex-col items-center justify-center gap-3 bg-black/75 text-white">
                    <Loader2 className="size-10 animate-spin" />
                    <p className="text-sm font-medium">Memproses gambar…</p>
                  </div>
                ) : null}
              </div>

              <div className="bg-background space-y-3 p-4 pb-[max(1rem,env(safe-area-inset-bottom))]">
                {scanError ? (
                  <div className="space-y-2 text-center">
                    <p className="text-destructive text-sm">{scanError}</p>
                    <Button
                      type="button"
                      variant="secondary"
                      className="w-full"
                      onClick={handleCobaLagi}
                    >
                      Coba Lagi
                    </Button>
                  </div>
                ) : (
                  <>
                    <p className="text-muted-foreground text-center text-sm">
                      {instruction}
                    </p>
                    <Button
                      type="button"
                      size="lg"
                      className="h-12 w-full text-base"
                      disabled={
                        showOpencvWait || Boolean(cameraError) || processing
                      }
                      onClick={() => void captureAndProcess()}
                    >
                      Ambil Foto
                    </Button>
                  </>
                )}
              </div>
            </>
          )}
        </div>
      </DialogContent>
    </Dialog>
  )
}
