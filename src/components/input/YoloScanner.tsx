'use client'

import { useEffect, useId, useRef, useState } from "react"
import { X } from "lucide-react"
import type { Html5Qrcode } from "html5-qrcode"
import type { InferenceSession } from "onnxruntime-common"

import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogTitle,
} from "@/components/ui/dialog"
import { cn } from "@/lib/utils"

const MODEL_URL = "/models/barcode-detector.onnx"
const SERIAL_PATTERN = /\b\d{2}[0-9OND]\d{7}\b/
const SCAN_COOLDOWN_MS = 1500
const FEEDBACK_CLEAR_MS = 2000
const YOLO_CONF_THRESHOLD = 0.5
const DECODE_INTERVAL_MS = 280
const NMS_IOU = 0.45
const CROP_PADDING_FRAC = 0.2
const DECODE_MIN_EDGE_PX = 300

export interface YoloScannerProps {
  isOpen: boolean
  onClose: () => void
  onResult: (serialNumbers: string[]) => void
  kategori: "front-load" | "top-load"
}

type Detection = {
  x1: number
  y1: number
  x2: number
  y2: number
  score: number
}

let yoloSessionPromise: Promise<InferenceSession> | null = null
let cachedInputSize: number | null = null

function getSquareInputSize(session: InferenceSession): number {
  const name = session.inputNames[0]
  const meta = session.inputMetadata.find((m) => m.name === name)
  if (!meta || !meta.isTensor) return 512
  const sh = meta.shape
  if (sh.length >= 4) {
    const h = sh[2]
    const w = sh[3]
    if (typeof h === "number" && typeof w === "number" && h === w) return h
  }
  return 512
}

async function getYoloSession(): Promise<InferenceSession> {
  if (!yoloSessionPromise) {
    yoloSessionPromise = (async () => {
      const ort = await import("onnxruntime-web")
      ort.env.wasm.wasmPaths =
        "https://cdn.jsdelivr.net/npm/onnxruntime-web@1.24.3/dist/"
      const session = await ort.InferenceSession.create(MODEL_URL, {
        executionProviders: ["wasm"],
        graphOptimizationLevel: "all",
      })
      cachedInputSize = getSquareInputSize(session)
      return session
    })()
  }
  const session = await yoloSessionPromise
  if (cachedInputSize === null) {
    cachedInputSize = getSquareInputSize(session)
  }
  return session
}

function sigmoid(x: number): number {
  if (x >= 0) {
    const z = Math.exp(-x)
    return 1 / (1 + z)
  }
  const z = Math.exp(x)
  return z / (1 + z)
}

function iou(a: Detection, b: Detection): number {
  const ix1 = Math.max(a.x1, b.x1)
  const iy1 = Math.max(a.y1, b.y1)
  const ix2 = Math.min(a.x2, b.x2)
  const iy2 = Math.min(a.y2, b.y2)
  const iw = Math.max(0, ix2 - ix1)
  const ih = Math.max(0, iy2 - iy1)
  const inter = iw * ih
  const areaA = Math.max(0, a.x2 - a.x1) * Math.max(0, a.y2 - a.y1)
  const areaB = Math.max(0, b.x2 - b.x1) * Math.max(0, b.y2 - b.y1)
  const union = areaA + areaB - inter
  return union <= 0 ? 0 : inter / union
}

function nms(dets: Detection[], iouThresh: number): Detection[] {
  const sorted = [...dets].sort((p, q) => q.score - p.score)
  const out: Detection[] = []
  for (const d of sorted) {
    if (out.some((k) => iou(d, k) > iouThresh)) continue
    out.push(d)
  }
  return out
}

function parseEnd2EndNms(
  data: Float32Array,
  rows: number,
  inputSize: number,
  confThreshold: number
): Detection[] {
  const dets: Detection[] = []
  for (let i = 0; i < rows; i++) {
    const o = i * 6
    const x1 = data[o]
    const y1 = data[o + 1]
    const x2 = data[o + 2]
    const y2 = data[o + 3]
    let score = data[o + 4]
    if (score > 1 || score < 0) score = sigmoid(score)
    if (score < confThreshold) continue
    const norm = Math.max(x1, y1, x2, y2) <= 1.5
    if (norm) {
      dets.push({
        x1: x1 * inputSize,
        y1: y1 * inputSize,
        x2: x2 * inputSize,
        y2: y2 * inputSize,
        score,
      })
    } else {
      dets.push({ x1, y1, x2, y2, score })
    }
  }
  return nms(dets, NMS_IOU)
}

function parseYoloRaw(
  data: Float32Array,
  dims: readonly number[],
  inputSize: number,
  confThreshold: number
): Detection[] {
  if (dims.length !== 3 || dims[0] !== 1) return []
  const a = dims[1] as number
  const b = dims[2] as number
  if (b === 6 && a > 0 && a <= 4096) {
    return parseEnd2EndNms(data, a, inputSize, confThreshold)
  }
  let c: number
  let n: number
  let channelFirst: boolean
  if (a <= 128 && b > a) {
    c = a
    n = b
    channelFirst = true
  } else if (b <= 128 && a > b) {
    n = a
    c = b
    channelFirst = false
  } else {
    return []
  }
  if (c < 5) return []
  const numClasses = c - 4
  const dets: Detection[] = []
  const get = (ch: number, i: number) =>
    channelFirst ? data[ch * n + i] : data[i * c + ch]

  for (let i = 0; i < n; i++) {
    const cx = get(0, i)
    const cy = get(1, i)
    const bw = get(2, i)
    const bh = get(3, i)
    let best = -Infinity
    for (let cl = 0; cl < numClasses; cl++) {
      const v = get(4 + cl, i)
      const p = v >= 0 && v <= 1 ? v : sigmoid(v)
      if (p > best) best = p
    }
    if (best < confThreshold) continue

    const normHint =
      cx >= 0 &&
      cy >= 0 &&
      bw > 0 &&
      bh > 0 &&
      cx <= 1.5 &&
      cy <= 1.5 &&
      bw <= 1.2 &&
      bh <= 1.2

    let x1: number
    let y1: number
    let x2: number
    let y2: number
    if (normHint) {
      x1 = (cx - bw / 2) * inputSize
      y1 = (cy - bh / 2) * inputSize
      x2 = (cx + bw / 2) * inputSize
      y2 = (cy + bh / 2) * inputSize
    } else {
      x1 = cx - bw / 2
      y1 = cy - bh / 2
      x2 = cx + bw / 2
      y2 = cy + bh / 2
    }
    x1 = Math.max(0, Math.min(inputSize, x1))
    y1 = Math.max(0, Math.min(inputSize, y1))
    x2 = Math.max(0, Math.min(inputSize, x2))
    y2 = Math.max(0, Math.min(inputSize, y2))
    if (x2 <= x1 || y2 <= y1) continue
    dets.push({ x1, y1, x2, y2, score: best })
  }
  return nms(dets, NMS_IOU)
}

function modelToVideoRect(
  d: Detection,
  inputSize: number,
  vw: number,
  vh: number
): Detection {
  const sx = vw / inputSize
  const sy = vh / inputSize
  return {
    x1: d.x1 * sx,
    y1: d.y1 * sy,
    x2: d.x2 * sx,
    y2: d.y2 * sy,
    score: d.score,
  }
}

function expandBox(
  d: Detection,
  vw: number,
  vh: number,
  padFrac: number
): Detection {
  const w = d.x2 - d.x1
  const h = d.y2 - d.y1
  const px = w * padFrac
  const py = h * padFrac
  return {
    x1: Math.max(0, d.x1 - px),
    y1: Math.max(0, d.y1 - py),
    x2: Math.min(vw, d.x2 + px),
    y2: Math.min(vh, d.y2 + py),
    score: d.score,
  }
}

function videoRectToDisplay(
  vx1: number,
  vy1: number,
  vx2: number,
  vy2: number,
  vw: number,
  vh: number,
  dispW: number,
  dispH: number
) {
  const scale = Math.max(dispW / vw, dispH / vh)
  const ox = (dispW - vw * scale) / 2
  const oy = (dispH - vh * scale) / 2
  return {
    x1: vx1 * scale + ox,
    y1: vy1 * scale + oy,
    x2: vx2 * scale + ox,
    y2: vy2 * scale + oy,
  }
}

/** Minimal DECODE_MIN_EDGE_PX pada kedua sisi kanvas (setara ≥300×300 setelah upscale). */
function dimensionsForDecodeCanvas(sourceW: number, sourceH: number) {
  const cw = Math.max(1, sourceW)
  const ch = Math.max(1, sourceH)
  const scale = Math.max(
    DECODE_MIN_EDGE_PX / cw,
    DECODE_MIN_EDGE_PX / ch,
    1
  )
  return {
    dw: Math.round(cw * scale),
    dh: Math.round(ch * scale),
  }
}

export default function YoloScanner({
  isOpen,
  onClose,
  onResult,
  kategori,
}: YoloScannerProps) {
  const rawId = useId()
  const decodeHostId = `yolo-decode-${rawId.replace(/:/g, "")}`

  const videoRef = useRef<HTMLVideoElement>(null)
  const overlayRef = useRef<HTMLCanvasElement>(null)
  const wrapRef = useRef<HTMLDivElement>(null)
  const preCanvasRef = useRef<HTMLCanvasElement>(null)
  const cropCanvasRef = useRef<HTMLCanvasElement>(null)

  const sessionRef = useRef<InferenceSession | null>(null)
  const inputSizeRef = useRef(512)
  const decoderRef = useRef<Html5Qrcode | null>(null)
  const streamRef = useRef<MediaStream | null>(null)
  const activeLoopRef = useRef(false)

  const scannedListRef = useRef<string[]>([])
  const cooldownUntilRef = useRef(0)
  const feedbackTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const lastDecodeAttemptRef = useRef(0)
  const decodingRef = useRef(false)
  const loadModelTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  const [cameraError, setCameraError] = useState<string | null>(null)
  const [modelError, setModelError] = useState<string | null>(null)
  const [cameraReady, setCameraReady] = useState(false)
  const [modelReady, setModelReady] = useState(false)
  const [modelLoading, setModelLoading] = useState(false)
  const [scannedList, setScannedList] = useState<string[]>([])
  const [scanFeedback, setScanFeedback] = useState<string | null>(null)
  const [showList, setShowList] = useState(false)
  const [debugMsg, setDebugMsg] = useState("")

  const badgePopupWrapRef = useRef<HTMLDivElement>(null)
  const popupPanelRef = useRef<HTMLDivElement>(null)

  const loadModel = async (cancelledRef: { cancelled: boolean }) => {
    if (modelReady || modelLoading) return
    setModelLoading(true)
    setModelError(null)
    try {
      const session = await getYoloSession()
      if (cancelledRef.cancelled) return
      sessionRef.current = session
      inputSizeRef.current = cachedInputSize ?? 512
      setModelReady(true)
      setModelLoading(false)
      setDebugMsg((prev) =>
        prev === "Kamera siap, memuat model..." ? "Siap scan!" : prev
      )
    } catch {
      if (cancelledRef.cancelled) return
      setModelError(
        "Gagal memuat model deteksi. Periksa jaringan atau muat ulang halaman."
      )
      setModelReady(false)
      setModelLoading(false)
      setDebugMsg("Error: gagal memuat model")
    }
  }

  useEffect(() => {
    if (!isOpen) {
      setShowList(false)
      return
    }
    setScannedList([])
    scannedListRef.current = []
    setShowList(false)
    setScanFeedback(null)
    setDebugMsg("")
    setCameraReady(false)
    setModelLoading(false)
    cooldownUntilRef.current = 0
    lastDecodeAttemptRef.current = 0
    if (feedbackTimeoutRef.current) {
      clearTimeout(feedbackTimeoutRef.current)
      feedbackTimeoutRef.current = null
    }
  }, [isOpen])

  useEffect(() => {
    scannedListRef.current = scannedList
  }, [scannedList])

  useEffect(() => {
    if (scannedList.length === 0) {
      setShowList(false)
    }
  }, [scannedList.length])

  useEffect(() => {
    if (!showList) return

    function handlePointerDown(e: PointerEvent) {
      const t = e.target as Node
      if (popupPanelRef.current?.contains(t)) return
      if (badgePopupWrapRef.current?.contains(t)) return
      setShowList(false)
    }

    document.addEventListener("pointerdown", handlePointerDown)
    return () => document.removeEventListener("pointerdown", handlePointerDown)
  }, [showList])

  useEffect(() => {
    if (!isOpen) {
      // cleanup ditangani oleh effect masing-masing (kamera/model/loop)
      return
    }
  }, [isOpen])

  // Kamera: start segera saat modal dibuka (tanpa menunggu model).
  useEffect(() => {
    if (!isOpen) return

    let cancelled = false
    setCameraError(null)
    setCameraReady(false)
    setDebugMsg("Memulai kamera...")

    const waitForVideoEl = () =>
      new Promise<HTMLVideoElement>((resolve, reject) => {
        let tries = 0
        const tick = () => {
          if (cancelled) return reject(new Error("cancelled"))
          const el = videoRef.current
          if (el) return resolve(el)
          tries++
          if (tries > 90) return reject(new Error("video element tidak siap"))
          requestAnimationFrame(tick)
        }
        requestAnimationFrame(tick)
      })

    const startCamera = async () => {
      try {
        const videoEl = await waitForVideoEl()
        const stream = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: "environment" },
          audio: false,
        })
        if (cancelled) {
          stream.getTracks().forEach((t) => t.stop())
          return
        }
        streamRef.current = stream

        videoEl.srcObject = stream
        videoEl.setAttribute("playsinline", "true")
        // beberapa perangkat lebih stabil memakai property juga
        ;(videoEl as HTMLVideoElement).playsInline = true
        videoEl.muted = true
        const markReady = () => {
          if (cancelled) return
          setCameraReady(true)
          const track = stream.getVideoTracks()[0]
          const settings = track?.getSettings?.()
          const w = settings?.width ?? videoEl.videoWidth
          const h = settings?.height ?? videoEl.videoHeight
          setDebugMsg(`Kamera siap, memuat model... (${w}x${h})`)
        }
        videoEl.addEventListener("loadedmetadata", markReady, { once: true })
        videoEl.addEventListener("playing", markReady, { once: true })

        await videoEl.play().catch(() => {
          // Pada beberapa perangkat, play() bisa tertahan; loadedmetadata/playing tetap akan memicu saat siap.
        })
        if (cancelled) return

        if (loadModelTimeoutRef.current) {
          clearTimeout(loadModelTimeoutRef.current)
          loadModelTimeoutRef.current = null
        }
        const c = { cancelled: false }
        loadModelTimeoutRef.current = setTimeout(() => {
          void loadModel(c)
        }, 1000)

        // pastikan dibatalkan saat cleanup effect kamera
        return () => {
          c.cancelled = true
        }
      } catch (e: unknown) {
        if (!cancelled) {
          setCameraError(
            "Tidak dapat mengakses kamera. Periksa izin peramban Anda."
          )
          setDebugMsg(
            `Error: ${
              e instanceof Error ? e.message : String(e)
            }`
          )
        }
      }
    }

    let cancelModelLoadCleanup: (() => void) | undefined
    void startCamera().then((cleanup) => {
      cancelModelLoadCleanup = cleanup
    })

    return () => {
      cancelled = true
      cancelModelLoadCleanup?.()
      if (loadModelTimeoutRef.current) {
        clearTimeout(loadModelTimeoutRef.current)
        loadModelTimeoutRef.current = null
      }
      activeLoopRef.current = false
      streamRef.current?.getTracks().forEach((t) => t.stop())
      streamRef.current = null
      decoderRef.current?.clear()
      decoderRef.current = null
      const v = videoRef.current
      if (v) v.srcObject = null
    }
  }, [isOpen])

  // Inference loop: hanya jalan setelah kamera dan model siap.
  useEffect(() => {
    if (!isOpen) return
    if (!cameraReady) return
    if (!modelReady || modelError) return

    let cancelled = false
    setDebugMsg("Siap scan!")

    const videoEl = videoRef.current

    const start = async () => {
      try {
        await new Promise<void>((resolve) => {
          requestAnimationFrame(() => requestAnimationFrame(() => resolve()))
        })
        if (cancelled) return

        const session = sessionRef.current
        if (!session) return

        const { Html5QrcodeSupportedFormats } = await import("html5-qrcode")
        const { ZXingHtml5QrcodeDecoder } = await import(
          "html5-qrcode/esm/zxing-html5-qrcode-decoder"
        )
        if (!document.getElementById(decodeHostId)) return
        if (cancelled) return

        const requestedFormats = [
          Html5QrcodeSupportedFormats.CODE_128,
          Html5QrcodeSupportedFormats.EAN_13,
          Html5QrcodeSupportedFormats.EAN_8,
          Html5QrcodeSupportedFormats.UPC_A,
          Html5QrcodeSupportedFormats.QR_CODE,
        ]

        const zxingDecoder = new ZXingHtml5QrcodeDecoder(requestedFormats, false, {
          log() {},
          warn() {},
          logError() {},
          logErrors() {},
        })

        const ort = await import("onnxruntime-web")
        const inputSize = inputSizeRef.current
        const pre = preCanvasRef.current
        if (!pre) return
        pre.width = inputSize
        pre.height = inputSize
        const preCtx = pre.getContext("2d", { willReadFrequently: true })
        if (!preCtx) return

        const floatBuf = new Float32Array(1 * 3 * inputSize * inputSize)

        const waitRaf = () =>
          new Promise<void>((resolve) => requestAnimationFrame(() => resolve()))

        const inferenceLoop = async () => {
          if (!videoEl) return
          while (activeLoopRef.current && !cancelled) {
            await waitRaf()
            if (!activeLoopRef.current || cancelled) break

            const vw = videoEl.videoWidth
            const vh = videoEl.videoHeight
            const overlay = overlayRef.current
            const wrap = wrapRef.current
            const cropCanvas = cropCanvasRef.current

            if (
              vw <= 0 ||
              vh <= 0 ||
              videoEl.readyState < HTMLMediaElement.HAVE_CURRENT_DATA ||
              !overlay ||
              !wrap
            ) {
              continue
            }

            try {
              preCtx.drawImage(videoEl, 0, 0, inputSize, inputSize)
              const img = preCtx.getImageData(0, 0, inputSize, inputSize)
              const p = img.data
              const area = inputSize * inputSize
              for (let i = 0; i < area; i++) {
                const j = i * 4
                floatBuf[i] = p[j] / 255
                floatBuf[area + i] = p[j + 1] / 255
                floatBuf[2 * area + i] = p[j + 2] / 255
              }

              const inputName = session.inputNames[0]
              const tensor = new ort.Tensor("float32", floatBuf, [
                1,
                3,
                inputSize,
                inputSize,
              ])
              const out = await session.run({ [inputName]: tensor })
              const outName = session.outputNames[0]
              const outTensor = out[outName]
              if (
                !outTensor ||
                typeof outTensor === "string" ||
                !("data" in outTensor)
              ) {
                continue
              }
              const data = outTensor.data as Float32Array
              const dims = outTensor.dims
              const raw = parseYoloRaw(
                data,
                dims,
                inputSize,
                YOLO_CONF_THRESHOLD
              )
              const inVideo = raw.map((d) =>
                modelToVideoRect(d, inputSize, vw, vh)
              )
              const ow = wrap.clientWidth
              const oh = wrap.clientHeight
              if (overlay.width !== ow || overlay.height !== oh) {
                overlay.width = ow
                overlay.height = oh
              }
              const ctx = overlay.getContext("2d")
              if (ctx) {
                ctx.clearRect(0, 0, ow, oh)
                for (const det of inVideo) {
                  const r = videoRectToDisplay(
                    det.x1,
                    det.y1,
                    det.x2,
                    det.y2,
                    vw,
                    vh,
                    ow,
                    oh
                  )
                  ctx.strokeStyle = "#22c55e"
                  ctx.lineWidth = 2
                  ctx.strokeRect(r.x1, r.y1, r.x2 - r.x1, r.y2 - r.y1)
                  const label = `${(det.score * 100).toFixed(0)}%`
                  ctx.font = "12px system-ui, sans-serif"
                  const tw = ctx.measureText(label).width
                  const labelH = 18
                  let ly = r.y1 - labelH
                  if (ly < 2) ly = r.y2 + 4
                  ctx.fillStyle = "rgba(0,0,0,0.65)"
                  ctx.fillRect(r.x1, ly, tw + 8, labelH - 2)
                  ctx.fillStyle = "#ffffff"
                  ctx.fillText(label, r.x1 + 4, ly + 13)
                }
              }

              const now = performance.now()
              if (
                inVideo.length > 0 &&
                now - lastDecodeAttemptRef.current >= DECODE_INTERVAL_MS &&
                !decodingRef.current &&
                cropCanvas &&
                Date.now() >= cooldownUntilRef.current
              ) {
                lastDecodeAttemptRef.current = now
                const best = inVideo.reduce((a, b) =>
                  a.score >= b.score ? a : b
                )

                const pad = expandBox(best, vw, vh, CROP_PADDING_FRAC)
                const x1 = Math.max(0, Math.floor(pad.x1))
                const y1 = Math.max(0, Math.floor(pad.y1))
                const x2 = Math.min(vw, Math.ceil(pad.x2))
                const y2 = Math.min(vh, Math.ceil(pad.y2))
                const cw = Math.max(1, x2 - x1)
                const ch = Math.max(1, y2 - y1)

                decodingRef.current = true
                try {
                  const cctx = cropCanvas.getContext("2d")
                  if (cctx) {
                    const { dw, dh } = dimensionsForDecodeCanvas(cw, ch)
                    cropCanvas.width = dw
                    cropCanvas.height = dh
                    cctx.imageSmoothingEnabled = false
                    cctx.drawImage(videoEl, x1, y1, cw, ch, 0, 0, dw, dh)

                    setDebugMsg(`Crop: ${cropCanvas.width}x${cropCanvas.height}`)

                    let match: RegExpMatchArray | null = null

                    try {
                      const res = await zxingDecoder.decodeAsync(cropCanvas)
                      setDebugMsg(`OK: ${res.text}`)
                      match = res.text.toUpperCase().match(SERIAL_PATTERN)
                    } catch (cropErr: unknown) {
                      setDebugMsg(
                        `Err: ${
                          cropErr instanceof Error
                            ? cropErr.message
                            : String(cropErr)
                        }`
                      )
                    }

                    if (!match) {
                      try {
                        const { dw: fw, dh: fh } = dimensionsForDecodeCanvas(
                          vw,
                          vh
                        )
                        cropCanvas.width = fw
                        cropCanvas.height = fh
                        cctx.imageSmoothingEnabled = false
                        cctx.drawImage(videoEl, 0, 0, vw, vh, 0, 0, fw, fh)
                        const resFull = await zxingDecoder.decodeAsync(cropCanvas)
                        setDebugMsg(`OK: ${resFull.text}`)
                        match = resFull.text.toUpperCase().match(SERIAL_PATTERN)
                      } catch (fullErr: unknown) {
                        setDebugMsg(
                          `FB: ${
                            fullErr instanceof Error
                              ? fullErr.message
                              : String(fullErr)
                          }`
                        )
                      }
                    }

                    if (match && !cancelled) {
                      const sn = match[0]
                      const key = sn.toLowerCase()
                      if (
                        !scannedListRef.current.some(
                          (s) => s.toLowerCase() === key
                        )
                      ) {
                        const next = [...scannedListRef.current, sn]
                        scannedListRef.current = next
                        setScannedList(next)
                        cooldownUntilRef.current =
                          Date.now() + SCAN_COOLDOWN_MS
                        setScanFeedback(`✓ ${sn} ditambahkan`)
                        if (feedbackTimeoutRef.current) {
                          clearTimeout(feedbackTimeoutRef.current)
                        }
                        feedbackTimeoutRef.current = setTimeout(() => {
                          setScanFeedback(null)
                          feedbackTimeoutRef.current = null
                        }, FEEDBACK_CLEAR_MS)
                      }
                    }
                  }
                } finally {
                  decodingRef.current = false
                }
              }
            } catch {
              /* lewati frame jika inferensi / decode gagal */
            }
          }
        }

        activeLoopRef.current = true
        void inferenceLoop()
      } catch {
        if (!cancelled) {
          setCameraError(
            "Tidak dapat mengakses kamera. Periksa izin peramban Anda."
          )
          setDebugMsg("Error: inisialisasi scanner gagal")
        }
      }
    }

    void start()

    return () => {
      cancelled = true
      activeLoopRef.current = false
      decodingRef.current = false
      decoderRef.current?.clear()
      decoderRef.current = null
    }
  }, [isOpen, cameraReady, modelReady, modelError, decodeHostId])

  const instruction =
    kategori === "front-load"
      ? "Arahkan ke stiker di SAMPING dus"
      : "Arahkan ke stiker di DEPAN dus"

  const handleOpenChange = (open: boolean) => {
    if (!open) {
      setShowList(false)
      setDebugMsg("")
      streamRef.current?.getTracks().forEach((t) => t.stop())
      streamRef.current = null
      activeLoopRef.current = false
      decoderRef.current?.clear()
      decoderRef.current = null
      const v = videoRef.current
      if (v) v.srcObject = null
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
    streamRef.current?.getTracks().forEach((t) => t.stop())
    streamRef.current = null
    activeLoopRef.current = false
    decoderRef.current?.clear()
    decoderRef.current = null
    const v = videoRef.current
    if (v) v.srcObject = null
    onResult([...scannedList])
    onClose()
  }

  const n = scannedList.length
  const showModelOverlay = modelLoading || !!modelError

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

        <div
          id={decodeHostId}
          className="pointer-events-none fixed -left-[9999px] top-0 h-[300px] w-[300px] overflow-hidden opacity-0"
          aria-hidden
        />

        <canvas ref={preCanvasRef} className="hidden" aria-hidden />
        <canvas ref={cropCanvasRef} className="hidden" aria-hidden />

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
                ref={wrapRef}
                className="relative min-h-[min(100dvh,480px)] w-full flex-1 overflow-hidden"
              >
                <video
                  ref={videoRef}
                  className="absolute inset-0 h-full w-full"
                  autoPlay
                  playsInline
                  muted
                  style={{ width: "100%", height: "100%", objectFit: "cover" }}
                />
                <canvas
                  ref={overlayRef}
                  className="pointer-events-none absolute inset-0 h-full w-full"
                  aria-hidden
                />
                {showModelOverlay && isOpen ? (
                  <div className="absolute inset-0 z-10 flex flex-col items-center justify-center gap-2 bg-black/70 px-4 text-center">
                    {modelError ? (
                      <p className="text-sm text-white">{modelError}</p>
                    ) : (
                      <p className="text-sm text-white">Memuat model…</p>
                    )}
                  </div>
                ) : null}
              </div>
              <div className="bg-background flex max-h-[45vh] min-h-0 flex-col gap-3 p-4 pb-[max(1rem,env(safe-area-inset-bottom))]">
                <p className="text-muted-foreground text-center text-sm">
                  {instruction}
                </p>
                <p className="text-muted-foreground text-center text-xs">
                  Deteksi YOLO + pemindaian barcode… arahkan stiker ke kamera
                </p>
                {scanFeedback ? (
                  <p className="text-center text-sm font-medium text-emerald-600 dark:text-emerald-400">
                    {scanFeedback}
                  </p>
                ) : null}

                {n > 0 ? (
                  <div ref={badgePopupWrapRef} className="relative z-30 w-full">
                    {showList ? (
                      <div
                        ref={popupPanelRef}
                        className={cn(
                          "border-border bg-background absolute bottom-full left-1/2 z-30 mb-2 w-[260px] max-h-[220px] -translate-x-1/2 overflow-y-auto rounded-lg border p-3 shadow-lg"
                        )}
                        role="dialog"
                        aria-label="Daftar nomor seri terscan"
                      >
                        <p className="text-muted-foreground mb-2 text-xs font-medium">
                          Nomor seri terscan
                        </p>
                        <div className="flex flex-col gap-1">
                          {scannedList.map((sn, i) => (
                            <div
                              key={`${sn}-${i}`}
                              className="flex items-center justify-between gap-2"
                            >
                              <span className="font-mono text-sm break-all">
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
                            </div>
                          ))}
                        </div>
                      </div>
                    ) : null}
                    <button
                      type="button"
                      onClick={() => setShowList((v) => !v)}
                      className="bg-emerald-600 hover:bg-emerald-700 dark:bg-emerald-700 dark:hover:bg-emerald-600 w-full rounded-full px-4 py-2 text-center text-sm font-medium text-white transition-colors"
                    >
                      {n} terscan {showList ? "▲" : "▼"}
                    </button>
                  </div>
                ) : null}

                <p
                  style={{
                    color: "yellow",
                    fontSize: "11px",
                    textAlign: "center",
                    padding: "4px",
                    background: "rgba(0,0,0,0.7)",
                  }}
                >
                  {debugMsg}
                </p>

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
