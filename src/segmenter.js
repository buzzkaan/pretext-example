/**
 * ML-based person segmentation — MediaPipe Tasks Vision
 * Exported as a singleton; demo.js and ui.js share the same instance.
 */

// 0.10.3 = documented stable release referenced in MediaPipe examples
const VISION_CDNS = [
  'https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.3',
  'https://unpkg.com/@mediapipe/tasks-vision@0.10.3',
];
const MODEL_URL =
  'https://storage.googleapis.com/mediapipe-models/image_segmenter/' +
  'selfie_multiclass_256x256/float32/latest/selfie_multiclass_256x256.tflite';

class Segmenter {
  constructor() {
    this.ready   = false;
    this.enabled = false;

    this._impl    = null;
    this._loading = false;

    // Two small canvases for mask scaling
    this._maskCanvas  = document.createElement('canvas');
    this._maskCtx     = this._maskCanvas.getContext('2d', { willReadFrequently: true });
    this._scaleCanvas = document.createElement('canvas');
    this._scaleCtx    = this._scaleCanvas.getContext('2d', { willReadFrequently: true });
  }

  /**
   * Download and initialise the model.
   * @param {(msg: string) => void} onStatus  — status text callback
   */
  async load(onStatus) {
    if (this.ready || this._loading) return;
    this._loading = true;

    onStatus?.('Downloading model (~8 MB)…');

    let ImageSegmenter, FilesetResolver, visionCdn;
    const cdnErrors = [];
    for (const cdn of VISION_CDNS) {
      for (const bundle of ['vision_bundle.mjs', 'vision_bundle.js']) {
        try {
          onStatus?.(`Trying: ${new URL(cdn).hostname} / ${bundle}…`);
          ({ ImageSegmenter, FilesetResolver } = await import(`${cdn}/${bundle}`));
          visionCdn = cdn;
          break;
        } catch (e) {
          cdnErrors.push(`${cdn}/${bundle}: ${e.message}`);
        }
      }
      if (visionCdn) break;
    }
    if (!ImageSegmenter) {
      this._loading = false;
      console.error('[Segmenter] CDN errors:', cdnErrors);
      const err = new Error('All CDNs failed. See console for details.');
      onStatus?.('⚠ ' + err.message);
      throw err;
    }

    onStatus?.('Initialising WASM…');
    let vision;
    try {
      vision = await FilesetResolver.forVisionTasks(`${visionCdn}/wasm`);
    } catch (err) {
      this._loading = false;
      onStatus?.('⚠ WASM error: ' + err.message);
      throw err;
    }

    onStatus?.('Compiling model…');
    // Try GPU first, fall back to CPU
    for (const delegate of ['GPU', 'CPU']) {
      try {
        this._impl = await ImageSegmenter.createFromOptions(vision, {
          baseOptions: { modelAssetPath: MODEL_URL, delegate },
          runningMode: 'VIDEO',
          outputCategoryMask: true,
          outputConfidenceMasks: false,
        });
        break;
      } catch (err) {
        if (delegate === 'CPU') {
          this._loading = false;
          onStatus?.('⚠ Model init failed: ' + err.message);
          throw err;
        }
      }
    }

    this.ready   = true;
    this.enabled = true;
    onStatus?.('✓ ML segmentation active');
  }

  /**
   * Process a single frame synchronously (runs in WASM thread, non-blocking).
   * @returns {Uint8ClampedArray|null}  alpha channel (each pixel 0–255)
   */
  segmentSync(videoEl, width, height) {
    if (!this.ready || !this._impl) return null;

    let result;
    try {
      result = this._impl.segmentForVideo(videoEl, performance.now());
    } catch {
      return null;
    }

    const cat = result?.categoryMask;
    if (!cat) return null;

    const mw  = cat.width;
    const mh  = cat.height;
    const raw = cat.getAsUint8Array(); // 0 = background, 1-5 = body parts
    cat.close();

    /* Raw mask → RGBA canvas (white = foreground) */
    if (this._maskCanvas.width !== mw || this._maskCanvas.height !== mh) {
      this._maskCanvas.width  = mw;
      this._maskCanvas.height = mh;
    }
    const img = new ImageData(mw, mh);
    for (let i = 0; i < raw.length; i++) {
      const v = raw[i] === 0 ? 0 : 255;
      img.data[i * 4]     = v;
      img.data[i * 4 + 1] = v;
      img.data[i * 4 + 2] = v;
      img.data[i * 4 + 3] = 255;
    }
    this._maskCtx.putImageData(img, 0, 0);

    /* Scale to target size (browser bilinear interpolation → smooth edges) */
    if (this._scaleCanvas.width !== width || this._scaleCanvas.height !== height) {
      this._scaleCanvas.width  = width;
      this._scaleCanvas.height = height;
    }
    this._scaleCtx.drawImage(this._maskCanvas, 0, 0, width, height);
    const scaled = this._scaleCtx.getImageData(0, 0, width, height).data;

    const alpha = new Uint8ClampedArray(width * height);
    for (let i = 0; i < alpha.length; i++) {
      alpha[i] = scaled[i * 4]; // red channel = alpha value
    }
    return alpha;
  }
}

export const segmenter = new Segmenter();
