export interface CropLegibilityAssessment {
  luminanceRange: number
  midtoneRatio: number
  brightGlareRatio: number
  likelyBackgroundInterference: boolean
}

export const BACKGROUND_INTERFERENCE_HINT =
  'Background interference may be blending with the orange HUD text — bright terrain, the sun, or ship lights behind SCAN RESULTS often cause this. Try a new scan with darker ground or less glare behind the panel.'

const LOW_CONTRAST_RANGE = 90
const HIGH_MIDTONE_RATIO = 0.34
const HIGH_GLARE_RATIO = 0.14
const LOW_OCR_CONFIDENCE = 48

export function assessCropLegibility(canvas: HTMLCanvasElement): CropLegibilityAssessment {
  const ctx = canvas.getContext('2d', { willReadFrequently: true })
  if (!ctx || canvas.width < 1 || canvas.height < 1) {
    return {
      luminanceRange: 255,
      midtoneRatio: 0,
      brightGlareRatio: 0,
      likelyBackgroundInterference: false,
    }
  }

  const { width, height } = canvas
  const imageData = ctx.getImageData(0, 0, width, height)
  const { data } = imageData
  const pixelCount = width * height

  let min = 255
  let max = 0
  let midtone = 0
  let brightGlare = 0

  for (let i = 0; i < data.length; i += 4) {
    const lum = Math.round(data[i] * 0.299 + data[i + 1] * 0.587 + data[i + 2] * 0.114)
    min = Math.min(min, lum)
    max = Math.max(max, lum)
    if (lum >= 95 && lum <= 195) midtone += 1
    if (lum >= 210) brightGlare += 1
  }

  const luminanceRange = max - min
  const midtoneRatio = midtone / pixelCount
  const brightGlareRatio = brightGlare / pixelCount

  const likelyBackgroundInterference =
    luminanceRange < LOW_CONTRAST_RANGE ||
    midtoneRatio > HIGH_MIDTONE_RATIO ||
    brightGlareRatio > HIGH_GLARE_RATIO

  return {
    luminanceRange,
    midtoneRatio,
    brightGlareRatio,
    likelyBackgroundInterference,
  }
}

export function buildOcrFailureHints(options: {
  legibility: CropLegibilityAssessment
  maxOcrConfidence: number
  parseScore: number
  hadReadableText: boolean
}): string[] {
  const { legibility, maxOcrConfidence, parseScore, hadReadableText } = options
  const hints: string[] = []

  if (legibility.likelyBackgroundInterference) {
    hints.push(BACKGROUND_INTERFERENCE_HINT)
  } else if (maxOcrConfidence < LOW_OCR_CONFIDENCE) {
    hints.push(BACKGROUND_INTERFERENCE_HINT)
  }

  if (
    hadReadableText &&
    parseScore <= 20 &&
    !legibility.likelyBackgroundInterference &&
    maxOcrConfidence >= LOW_OCR_CONFIDENCE
  ) {
    hints.push(
      'Some text was read but the RESULTS header or ore name may have garbled — a busy or bright background behind the HUD panel often causes that.'
    )
  }

  return [...new Set(hints)]
}
