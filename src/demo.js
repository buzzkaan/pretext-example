import { segmenter } from './segmenter.js';
import { TEXT_VARIANTS } from './sampleText.js';
import { createBrowserPreparedText, createDualFlowPlan } from './layout.js';
import { DEFAULT_PROFILE } from './profile.js';
import {
  computeForegroundPlacement,
  createForegroundAlphaMask,
  deriveForegroundBounds,
  deriveProfileFromAlpha,
  estimateBackgroundColor,
} from './matte.js';

const PAGE_MAX_WIDTH = 1120;
const PAGE_MIN_HEIGHT = 780;
const PAGE_PADDING = 82;
const ARTICLE_TOP = 74;
const DEFAULT_VIDEO_ASPECT = 0.62;
const TEXT_FONT_SIZE = 19;
const TEXT_LINE_HEIGHT = 31;
const TEXT_FONT = `${TEXT_FONT_SIZE}px "Iowan Old Style", "Palatino Linotype", "Noto Serif SC", serif`;
const COLUMN_GAP = 52;
const WRAP_GUTTER = 9;
const WRAP_MIN_REGION_WIDTH = 240;
const WRAP_OFFSET_DAMPING = 0.58;
const WRAP_PROFILE_INSET = 0.04;
const MATTE_THRESHOLD = 34;
const MATTE_FEATHER = 28;
const MATTE_MIN_ALPHA = 22;
const RENDER_FPS = 12;
const REFERENCE_RESERVE_SPACE = 272;
const MOBILE_BREAKPOINT = 600;
const PAGE_PADDING_MOBILE = 14;
const ARTICLE_TOP_MOBILE = 50;
const WRAP_MIN_REGION_WIDTH_MOBILE = 60;
const COLUMN_GAP_MOBILE = 14;

export const DEMO_WRAP_DEFAULTS = {
  distance: WRAP_GUTTER,
  gutter: WRAP_GUTTER,
  minRegionWidth: WRAP_MIN_REGION_WIDTH,
  follow: WRAP_OFFSET_DAMPING,
  offsetDamping: WRAP_OFFSET_DAMPING,
  profileInset: WRAP_PROFILE_INSET,
};

export function getLineTextAlign(column) {
  return column === 'left' ? 'right' : 'left';
}

const JUSTIFY_MIN_WORDS = 4;
const JUSTIFY_MIN_FILL_RATIO = 0.72;
const JUSTIFY_SKIP_ENDING_RE = /[.!?…:;]$/;

export function getLinePresentation(line) {
  const words = line.text.trim().split(/\s+/).filter(Boolean);
  const fillRatio = line.regionWidth > 0 ? line.width / line.regionWidth : 0;
  const justify =
    words.length >= JUSTIFY_MIN_WORDS &&
    fillRatio >= JUSTIFY_MIN_FILL_RATIO &&
    !JUSTIFY_SKIP_ENDING_RE.test(line.text);

  return {
    align: getLineTextAlign(line.column),
    justify,
    words,
  };
}

const REFERENCE_SYNC_TOLERANCE = 0.08;

export function syncReferenceVideo(source, reference, options = {}) {
  if (source === null || reference === null) {
    return;
  }

  const { forceSeek = false, tolerance = REFERENCE_SYNC_TOLERANCE } = options;
  const sourceTime = Number.isFinite(source.currentTime) ? source.currentTime : 0;
  const referenceTime = Number.isFinite(reference.currentTime) ? reference.currentTime : 0;
  const drift = Math.abs(sourceTime - referenceTime);

  if (forceSeek || drift > tolerance) {
    reference.currentTime = sourceTime;
  }

  if (reference.playbackRate !== source.playbackRate) {
    reference.playbackRate = source.playbackRate;
  }
}

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

function createInitialState() {
  return {
    fileName: '',
    objectUrl: null,
    isPlaying: false,
    scale: 1.22,
    offsetX: 0,
    offsetY: 0,
    wrapDistance: WRAP_GUTTER,
    wrapFollow: WRAP_OFFSET_DAMPING,
    wrapStrength: 1.35,
    volume: 1,
    startTime: 0,
    endTime: 0,
    cameraActive: false,
    cameraStream: null,
    layoutMode: 'wrap',
    maskStyle: 'clean',
    textVariant: 0,
    theme: 'dark',
    matteThreshold: MATTE_THRESHOLD,
    matteFeather: MATTE_FEATHER,
    status: 'Load a local video to start the layout. Plain backgrounds work best.',
    engineLabel: 'Loading layout engine…',
  };
}

export function buildAppHtml() {
    return `
    <div class="app-shell">
      <header class="toolbar">
        <div class="toolbar-group">
          <label class="file-picker">
            <span>Choose video</span>
            <input data-role="file-input" type="file" accept="video/*" />
          </label>
          <button data-role="play-toggle" type="button">Play</button>
          <button data-role="camera-toggle" type="button">Camera</button>
        </div>
        <div class="toolbar-group toolbar-group--sliders">
          <label>Scale <input data-role="scale" type="range" min="0.9" max="2.2" step="0.01" value="1.22" /></label>
          <label>Horizontal <input data-role="offset-x" type="range" min="-180" max="180" step="1" value="0" /></label>
          <label>Vertical <input data-role="offset-y" type="range" min="-120" max="120" step="1" value="0" /></label>
          <label>Wrap distance <input data-role="wrap-distance" type="range" min="4" max="24" step="1" value="${WRAP_GUTTER}" /></label>
          <label>Wrap follow <input data-role="wrap-follow" type="range" min="0.35" max="0.9" step="0.01" value="${WRAP_OFFSET_DAMPING}" /></label>
          <label>Wrap strength <input data-role="wrap-strength" type="range" min="0.7" max="1.8" step="0.01" value="1.35" /></label>
          <label>Cut threshold <input data-role="matte-threshold" type="range" min="8" max="96" step="1" value="34" /></label>
          <label>Soft edge <input data-role="matte-feather" type="range" min="4" max="80" step="1" value="28" /></label>
          <label>Volume <input data-role="volume" type="range" min="0" max="1" step="0.01" value="1" /></label>
          <label>Start time <input data-role="start-time" type="range" min="0" max="3600" step="0.1" value="0" /></label>
          <label>End time <input data-role="end-time" type="range" min="0" max="3600" step="0.1" value="0" /></label>
          <label>Layout <select data-role="layout-mode"><option value="wrap">Wrap</option><option value="overlay">Overlay</option><option value="full">Full text</option></select></label>
          <label>Theme <select data-role="theme"><option value="dark">Dark</option><option value="light">Light</option></select></label>
          <label>Mask <select data-role="mask-style"><option value="clean">Clean</option><option value="silhouette">Silhouette</option><option value="glow">Glow</option><option value="mono">Monochrome</option><option value="sepia">Sepia</option></select></label>
          <label>Text <select data-role="text-variant"><option value="0">Afternoon Light</option><option value="1">The City</option><option value="2">The Cosmos</option></select></label>
        </div>
      </header>

        <div class="status-bar">
        <span data-role="status">Load a local video to start the layout. Plain backgrounds work best.</span>
        <span data-role="engine">Loading layout engine…</span>
      </div>

        <main class="paper-frame">
            <section class="paper" data-role="paper">
              <div class="drop-cap" data-role="drop-cap">${TEXT_VARIANTS[0].dropCap}</div>
              <div class="text-layer" data-role="text-layer"></div>
              <div class="video-stage" data-role="video-stage">
              <canvas data-role="stage-canvas"></canvas>
              <video data-role="video" playsinline preload="metadata"></video>
              </div>
              <section class="reference-panel" data-role="reference-panel" hidden>
                <div class="reference-panel__header">
                  <span class="reference-panel__eyebrow">Reference</span>
                  <span class="reference-panel__title">Original video</span>
                </div>
                <video
                  class="reference-panel__video"
                  data-role="reference-video"
                  playsinline
                  preload="metadata"
                  muted
                ></video>
              </section>
            </section>
          </main>
    </div>
  `;
}

function getElements(root) {
  return {
    fileInput: root.querySelector('[data-role="file-input"]'),
    playToggle: root.querySelector('[data-role="play-toggle"]'),
    scale: root.querySelector('[data-role="scale"]'),
    offsetX: root.querySelector('[data-role="offset-x"]'),
    offsetY: root.querySelector('[data-role="offset-y"]'),
    wrapDistance: root.querySelector('[data-role="wrap-distance"]'),
    wrapFollow: root.querySelector('[data-role="wrap-follow"]'),
    wrapStrength: root.querySelector('[data-role="wrap-strength"]'),
    matteThreshold: root.querySelector('[data-role="matte-threshold"]'),
    matteFeather: root.querySelector('[data-role="matte-feather"]'),
    volume: root.querySelector('[data-role="volume"]'),
    startTime: root.querySelector('[data-role="start-time"]'),
    endTime: root.querySelector('[data-role="end-time"]'),
    cameraToggle: root.querySelector('[data-role="camera-toggle"]'),
    layoutMode: root.querySelector('[data-role="layout-mode"]'),
    theme: root.querySelector('[data-role="theme"]'),
    maskStyle: root.querySelector('[data-role="mask-style"]'),
    textVariant: root.querySelector('[data-role="text-variant"]'),
    dropCap: root.querySelector('[data-role="drop-cap"]'),
    status: root.querySelector('[data-role="status"]'),
    engine: root.querySelector('[data-role="engine"]'),
    paper: root.querySelector('[data-role="paper"]'),
    textLayer: root.querySelector('[data-role="text-layer"]'),
    videoStage: root.querySelector('[data-role="video-stage"]'),
    stageCanvas: root.querySelector('[data-role="stage-canvas"]'),
    video: root.querySelector('[data-role="video"]'),
    referencePanel: root.querySelector('[data-role="reference-panel"]'),
    referenceVideo: root.querySelector('[data-role="reference-video"]'),
  };
}

function createTextCanvasContext() {
  const canvas = document.createElement('canvas');
  const context = canvas.getContext('2d');

  if (context === null) {
    throw new Error('Canvas 2D context is unavailable in this browser.');
  }

  return context;
}

function getPageMetrics(paper, state, video) {
  const viewportWidth = window.innerWidth;
  const viewportHeight = window.innerHeight;
  const isMobile = viewportWidth < MOBILE_BREAKPOINT;
  const isFull = state.layoutMode === 'full';
  const padding = isMobile ? PAGE_PADDING_MOBILE : PAGE_PADDING;
  const pageWidth = isFull
    ? viewportWidth
    : Math.min(PAGE_MAX_WIDTH, viewportWidth - (isMobile ? 16 : 48));
  const pageHeight = isFull
    ? viewportHeight
    : isMobile
      ? viewportHeight
      : Math.max(PAGE_MIN_HEIGHT, viewportHeight - 140);
  const articleLeft = padding;
  const articleWidth = pageWidth - padding * 2;
  const articleTop = isMobile ? ARTICLE_TOP_MOBILE : ARTICLE_TOP;
  const articleBottomPadding =
    state.objectUrl === null || isFull || isMobile ? 60 : REFERENCE_RESERVE_SPACE;
  const articleHeight = pageHeight - articleTop - articleBottomPadding;
  const videoAspect =
    video.videoWidth > 0 && video.videoHeight > 0
      ? video.videoWidth / video.videoHeight
      : DEFAULT_VIDEO_ASPECT;
  const stageBaseSize = isMobile ? 190 : 280;
  const stageHeight = clamp(stageBaseSize * state.scale, isMobile ? 150 : 220, isMobile ? 260 : 430);
  const stageWidth = stageHeight * videoAspect;
  const stageCenterX = articleLeft + articleWidth / 2 + state.offsetX;
  const stageTop = articleTop + (isMobile ? 60 : 96) + state.offsetY;

  paper.style.width = `${pageWidth}px`;
  paper.style.minHeight = `${pageHeight}px`;

  return {
    pageWidth,
    pageHeight,
    articleLeft,
    articleWidth,
    articleTop,
    articleHeight,
    stageHeight,
    stageWidth,
    stageCenterX,
    stageTop,
    isMobile,
    minRegionWidth: isMobile ? WRAP_MIN_REGION_WIDTH_MOBILE : WRAP_MIN_REGION_WIDTH,
    columnGap: isMobile ? COLUMN_GAP_MOBILE : COLUMN_GAP,
  };
}

function renderLines(container, plan) {
  container.innerHTML = '';

  for (const line of plan.lines) {
    const presentation = getLinePresentation(line);
    const node = document.createElement('div');
    node.className = 'line';
    node.lang = 'en';
    node.style.left = `${line.x}px`;
    node.style.top = `${line.y}px`;
    node.style.width = `${line.regionWidth}px`;
    node.style.textAlign = presentation.align;

    if (presentation.justify) {
      node.classList.add('line--justify');
      for (const word of presentation.words) {
        const wordNode = document.createElement('span');
        wordNode.className = 'line__word';
        wordNode.textContent = word;
        node.append(wordNode);
      }
    } else {
      node.textContent = line.text;
    }

    container.append(node);
  }
}

function renderStage(elements, metrics, state) {
  const { videoStage, video, stageCanvas } = elements;
  videoStage.style.left = `${metrics.stageCenterX - metrics.stageWidth / 2}px`;
  videoStage.style.top = `${metrics.stageTop}px`;
  videoStage.style.width = `${metrics.stageWidth}px`;
  videoStage.style.height = `${metrics.stageHeight}px`;
  video.hidden = true;
  stageCanvas.hidden = state.objectUrl === null && !state.cameraActive;
  videoStage.style.zIndex = state.layoutMode === 'overlay' ? '2' : '';
}

function createMatteContexts() {
  const bufferCanvas = document.createElement('canvas');
  const bufferContext = bufferCanvas.getContext('2d', { willReadFrequently: true });

  if (bufferContext === null) {
    throw new Error('Canvas 2D buffer context is unavailable in this browser.');
  }

  return {
    bufferCanvas,
    bufferContext,
  };
}

function ensureStageCanvasSize(stageCanvas, metrics) {
  const width = Math.max(96, Math.round(metrics.stageWidth));
  const height = Math.max(120, Math.round(metrics.stageHeight));

  if (stageCanvas.width !== width) {
    stageCanvas.width = width;
  }

  if (stageCanvas.height !== height) {
    stageCanvas.height = height;
  }

  return { width, height };
}

function isMeaningfulProfile(profile) {
  return profile.some(band => band.width > 0.18 || Math.abs(band.offset) > 0.03);
}

function drawProcessedStage(elements, metrics, matte, state) {
  const { stageCanvas, video } = elements;

  if (
    video.videoWidth === 0 ||
    video.videoHeight === 0 ||
    video.readyState < HTMLMediaElement.HAVE_CURRENT_DATA
  ) {
    const stageContext = stageCanvas.getContext('2d');
    if (stageContext !== null) {
      stageContext.clearRect(0, 0, stageCanvas.width, stageCanvas.height);
    }
    return DEFAULT_PROFILE;
  }

  const { width, height } = ensureStageCanvasSize(stageCanvas, metrics);
  const stageContext = stageCanvas.getContext('2d');

  if (stageContext === null) {
    return DEFAULT_PROFILE;
  }

  matte.bufferCanvas.width = width;
  matte.bufferCanvas.height = height;
  matte.bufferContext.clearRect(0, 0, width, height);
  matte.bufferContext.drawImage(video, 0, 0, width, height);

  const imageData = matte.bufferContext.getImageData(0, 0, width, height);

  // Use ML segmentation when active, otherwise fall back to color-distance
  let alpha = (segmenter.enabled && segmenter.ready)
    ? segmenter.segmentSync(video, width, height)
    : null;

  if (!alpha) {
    const background = estimateBackgroundColor(imageData.data, width, height);
    alpha = createForegroundAlphaMask(imageData.data, width, height, {
      background,
      threshold: state.matteThreshold,
      feather: state.matteFeather,
    });
  }

  const bounds = deriveForegroundBounds(alpha, width, height, {
    minAlpha: MATTE_MIN_ALPHA,
    padding: Math.round(Math.min(width, height) * 0.06),
  });

  for (let index = 0; index < alpha.length; index += 1) {
    if (state.maskStyle === 'silhouette' && alpha[index] > 20) {
      imageData.data[index * 4]     = 15;
      imageData.data[index * 4 + 1] = 12;
      imageData.data[index * 4 + 2] = 20;
    }
    imageData.data[index * 4 + 3] = alpha[index];
  }

  matte.bufferContext.putImageData(imageData, 0, 0);
  stageContext.clearRect(0, 0, width, height);

  if (state.maskStyle === 'glow') {
    stageContext.shadowColor = 'rgba(255, 240, 200, 0.85)';
    stageContext.shadowBlur = 28;
  } else if (state.maskStyle === 'mono') {
    stageContext.filter = 'grayscale(1) contrast(1.05)';
  } else if (state.maskStyle === 'sepia') {
    stageContext.filter = 'sepia(0.8) contrast(1.1)';
  }

  if (bounds !== null) {
    const sourceWidth = bounds.right - bounds.left + 1;
    const sourceHeight = bounds.bottom - bounds.top + 1;
    const placement = computeForegroundPlacement({
      bounds,
      sourceWidth: width,
      sourceHeight: height,
      targetWidth: width,
      targetHeight: height,
    });

    stageContext.drawImage(
      matte.bufferCanvas,
      bounds.left,
      bounds.top,
      sourceWidth,
      sourceHeight,
      placement.drawX,
      placement.drawY,
      placement.drawWidth,
      placement.drawHeight,
    );
  } else {
    stageContext.drawImage(matte.bufferCanvas, 0, 0, width, height);
  }

  stageContext.shadowBlur = 0;
  stageContext.shadowColor = 'transparent';
  stageContext.filter = 'none';

  const stageImageData = stageContext.getImageData(0, 0, width, height);
  const stageAlpha = new Uint8ClampedArray(width * height);
  for (let index = 0; index < stageAlpha.length; index += 1) {
    stageAlpha[index] = stageImageData.data[index * 4 + 3];
  }

  const profile = deriveProfileFromAlpha(stageAlpha, width, height, {
    bands: DEFAULT_PROFILE.length,
    minAlpha: MATTE_MIN_ALPHA,
    minWidth: 0.1,
  });

  return isMeaningfulProfile(profile) ? profile : DEFAULT_PROFILE;
}

async function ensurePreparedText(cache, context, variantIndex) {
  if (
    cache.leftPrepared !== null &&
    cache.rightPrepared !== null &&
    cache.textVariant === variantIndex
  ) {
    return cache;
  }

  const variant = TEXT_VARIANTS[variantIndex] ?? TEXT_VARIANTS[0];
  cache.textVariant = variantIndex;
  cache.leftPrepared = await createBrowserPreparedText({
    text: variant.left,
    font: TEXT_FONT,
    context,
  });
  cache.rightPrepared = await createBrowserPreparedText({
    text: variant.right,
    font: TEXT_FONT,
    context,
  });
  return cache;
}

async function render(root, elements, state, cache, context, matte) {
  const metrics = getPageMetrics(elements.paper, state, elements.video);
  const prepared = await ensurePreparedText(cache, context, state.textVariant);
  state.engineLabel =
    prepared.leftPrepared.engine === 'pretext'
      ? 'Layout engine: Pretext'
      : 'Layout engine: Canvas fallback';

  renderStage(elements, metrics, state);
  const profile = drawProcessedStage(elements, metrics, matte, state);

  const plan = createDualFlowPlan({
    leftPrepared: prepared.leftPrepared,
    rightPrepared: prepared.rightPrepared,
    articleLeft: metrics.articleLeft,
    articleTop: metrics.articleTop,
    articleWidth: metrics.articleWidth,
    articleHeight: metrics.articleHeight,
    lineHeight: TEXT_LINE_HEIGHT,
    columnGap: metrics.columnGap,
    stageTop: metrics.stageTop,
    stageHeight: state.layoutMode === 'overlay' ? 0 : metrics.stageHeight,
    stageCenterX: metrics.stageCenterX,
    stageWidth: state.layoutMode === 'overlay' ? 0 : metrics.stageWidth,
    profile,
    wrapStrength: state.wrapStrength,
    gutter: state.wrapDistance,
    minRegionWidth: metrics.minRegionWidth,
    offsetDamping: state.wrapFollow,
    profileInset: WRAP_PROFILE_INSET,
  });

  renderLines(elements.textLayer, plan);
  elements.referencePanel.hidden = state.objectUrl === null || state.cameraActive || state.layoutMode !== 'wrap' || metrics.isMobile;
  elements.status.textContent = state.status;
  elements.engine.textContent = state.engineLabel;
  root.style.setProperty('--page-width', `${metrics.pageWidth}px`);
}

function updatePlaybackLabel(button, isPlaying) {
  button.textContent = isPlaying ? 'Pause' : 'Play';
}

function bindRange(input, onValue) {
  input.addEventListener('input', event => {
    const target = event.currentTarget;
    onValue(Number(target.value));
  });
}

export async function mountDemo(root) {
  root.innerHTML = buildAppHtml();

  const elements = getElements(root);
  const state = createInitialState();
  const cache = { leftPrepared: null, rightPrepared: null, textVariant: -1 };
  const context = createTextCanvasContext();
  const matte = createMatteContexts();
  let renderPromise = Promise.resolve();
  let frameHandle = 0;
  let lastFrameAt = 0;
  const syncPreview = options => syncReferenceVideo(elements.video, elements.referenceVideo, options);

  const rerender = () => {
    renderPromise = renderPromise.then(() => render(root, elements, state, cache, context, matte));
    return renderPromise;
  };

  const stopLoop = () => {
    if (frameHandle !== 0) {
      cancelAnimationFrame(frameHandle);
      frameHandle = 0;
    }
  };

  const tick = timestamp => {
    if (!state.isPlaying && !state.cameraActive) {
      stopLoop();
      return;
    }

    if (state.cameraActive || timestamp - lastFrameAt >= 1000 / RENDER_FPS) {
      lastFrameAt = timestamp;
      void rerender();
    }

    frameHandle = requestAnimationFrame(tick);
  };

  const startLoop = () => {
    if (frameHandle !== 0) {
      return;
    }

    lastFrameAt = 0;
    frameHandle = requestAnimationFrame(tick);
  };

  bindRange(elements.scale, value => {
    state.scale = value;
    void rerender();
  });
  bindRange(elements.offsetX, value => {
    state.offsetX = value;
    void rerender();
  });
  bindRange(elements.offsetY, value => {
    state.offsetY = value;
    void rerender();
  });
  bindRange(elements.wrapDistance, value => {
    state.wrapDistance = value;
    void rerender();
  });
  bindRange(elements.wrapFollow, value => {
    state.wrapFollow = value;
    void rerender();
  });
  bindRange(elements.wrapStrength, value => {
    state.wrapStrength = value;
    void rerender();
  });
  bindRange(elements.matteThreshold, value => {
    state.matteThreshold = value;
    void rerender();
  });
  bindRange(elements.matteFeather, value => {
    state.matteFeather = value;
    void rerender();
  });
  bindRange(elements.volume, value => {
    state.volume = value;
    elements.video.volume = value;
  });
  bindRange(elements.startTime, value => {
    state.startTime = value;
    if (!state.isPlaying) {
      elements.video.currentTime = value;
      syncPreview({ forceSeek: true });
    }
  });
  bindRange(elements.endTime, value => {
    state.endTime = value;
  });

  document.body.dataset.theme = state.theme;
  document.body.dataset.layout = state.layoutMode;

  elements.layoutMode.addEventListener('change', () => {
    state.layoutMode = elements.layoutMode.value;
    document.body.dataset.layout = state.layoutMode;
    void rerender();
  });
  elements.theme.addEventListener('change', () => {
    state.theme = elements.theme.value;
    document.body.dataset.theme = state.theme;
  });
  elements.maskStyle.addEventListener('change', () => {
    state.maskStyle = elements.maskStyle.value;
    void rerender();
  });
  elements.textVariant.addEventListener('change', () => {
    state.textVariant = Number(elements.textVariant.value);
    elements.dropCap.textContent = TEXT_VARIANTS[state.textVariant].dropCap;
    void rerender();
  });

  elements.video.volume = state.volume;
  elements.video.muted = false;
  elements.referenceVideo.muted = true;

  elements.playToggle.addEventListener('click', async () => {
    if (state.objectUrl === null) {
      state.status = 'Choose a video file first.';
      await rerender();
      return;
    }

    if (elements.video.paused) {
      await elements.video.play();
      syncPreview({ forceSeek: true });
      await elements.referenceVideo.play().catch(() => null);
      state.isPlaying = true;
      state.status = `Playing ${state.fileName}`;
      startLoop();
    } else {
      elements.video.pause();
      elements.referenceVideo.pause();
      state.isPlaying = false;
      state.status = `Paused ${state.fileName}`;
      stopLoop();
    }

    updatePlaybackLabel(elements.playToggle, state.isPlaying);
    await rerender();
  });

  elements.cameraToggle.addEventListener('click', async () => {
    if (state.cameraActive) {
      state.cameraStream?.getTracks().forEach(t => t.stop());
      state.cameraStream = null;
      elements.video.srcObject = null;
      if (state.objectUrl) {
        elements.video.src = state.objectUrl;
        elements.video.volume = state.volume;
        elements.video.muted = false;
        elements.video.load();
      }
      state.cameraActive = false;
      state.isPlaying = false;
      state.status = state.objectUrl
        ? `Loaded ${state.fileName}.`
        : 'Load a video file or enable camera.';
      elements.cameraToggle.textContent = 'Camera';
      elements.cameraToggle.classList.remove('active');
      stopLoop();
      await rerender();
      return;
    }

    try {
      const onMobile = window.innerWidth < MOBILE_BREAKPOINT;
      const stream = await navigator.mediaDevices.getUserMedia({
        video: onMobile
          ? { facingMode: { ideal: 'user' }, width: { ideal: 720 }, height: { ideal: 1280 } }
          : { width: { ideal: 1280 }, height: { ideal: 720 } },
        audio: false,
      });
      state.cameraStream = stream;
      elements.video.pause();
      elements.video.srcObject = stream;
      elements.video.muted = true;
      await elements.video.play();
      state.cameraActive = true;
      state.status = 'Camera active. Position yourself in the frame.';
      elements.cameraToggle.textContent = 'Stop camera';
      elements.cameraToggle.classList.add('active');
      startLoop();
      await rerender();
    } catch (err) {
      state.status = `Camera error: ${err.message}`;
      await rerender();
    }
  });

  elements.fileInput.addEventListener('change', async event => {
    const target = event.currentTarget;
    const [file] = target.files ?? [];

    if (file === undefined) {
      return;
    }

    if (state.cameraActive) {
      state.cameraStream?.getTracks().forEach(t => t.stop());
      state.cameraStream = null;
      elements.video.srcObject = null;
      state.cameraActive = false;
      elements.cameraToggle.textContent = 'Camera';
      elements.cameraToggle.classList.remove('active');
    }

    if (state.objectUrl !== null) {
      URL.revokeObjectURL(state.objectUrl);
    }

    state.objectUrl = URL.createObjectURL(file);
    state.fileName = file.name;
    state.startTime = 0;
    state.endTime = 0;
    elements.startTime.value = 0;
    elements.startTime.dispatchEvent(new Event('input'));
    elements.endTime.value = 0;
    elements.endTime.dispatchEvent(new Event('input'));
    state.status = `Loaded ${file.name}. Trying automatic background cut.`;
    elements.video.src = state.objectUrl;
    elements.referenceVideo.src = state.objectUrl;
    elements.video.volume = state.volume;
    elements.video.muted = false;
    elements.referenceVideo.currentTime = 0;
    elements.referenceVideo.pause();
    elements.video.load();
    elements.referenceVideo.load();
    elements.video.pause();
    state.isPlaying = false;
    stopLoop();
    updatePlaybackLabel(elements.playToggle, state.isPlaying);
    await rerender();
  });

  elements.video.addEventListener('loadedmetadata', () => {
    if (state.cameraActive) {
      state.status = 'Camera active. Position yourself in the frame.';
      void rerender();
      return;
    }
    const dur = Number.isFinite(elements.video.duration) ? elements.video.duration : 3600;
    elements.startTime.max = dur.toFixed(1);
    elements.endTime.max = dur.toFixed(1);
    state.endTime = dur;
    elements.endTime.value = dur.toFixed(1);
    elements.endTime.dispatchEvent(new Event('input'));
    elements.video.currentTime = state.startTime;
    syncPreview({ forceSeek: true });
    state.status = `Ready: ${state.fileName}. If the background is simple, the subject should separate from the page.`;
    void rerender();
  });

  elements.video.addEventListener('play', () => {
    syncPreview({ forceSeek: true });
    void elements.referenceVideo.play().catch(() => null);
    state.isPlaying = true;
    updatePlaybackLabel(elements.playToggle, true);
    startLoop();
  });

  elements.video.addEventListener('pause', () => {
    syncPreview({ forceSeek: true });
    elements.referenceVideo.pause();
    state.isPlaying = false;
    updatePlaybackLabel(elements.playToggle, false);
    stopLoop();
    void rerender();
  });

  elements.video.addEventListener('timeupdate', () => {
    if (
      state.endTime > 0 &&
      state.endTime > state.startTime &&
      elements.video.currentTime >= state.endTime
    ) {
      elements.video.currentTime = state.startTime;
      syncPreview({ forceSeek: true });
    } else {
      syncPreview();
    }
  });

  elements.video.addEventListener('ended', async () => {
    if (state.isPlaying) {
      elements.video.currentTime = state.startTime;
      await elements.video.play();
      syncPreview({ forceSeek: true });
      await elements.referenceVideo.play().catch(() => null);
    }
  });

  elements.video.addEventListener('seeked', () => {
    syncPreview({ forceSeek: true });
    void rerender();
  });

  elements.video.addEventListener('ratechange', () => {
    syncPreview({ forceSeek: true });
  });

  document.addEventListener('load-example-video', async event => {
    const { url, name } = event.detail;

    if (state.cameraActive) {
      state.cameraStream?.getTracks().forEach(t => t.stop());
      state.cameraStream = null;
      elements.video.srcObject = null;
      state.cameraActive = false;
      elements.cameraToggle.textContent = 'Camera';
      elements.cameraToggle.classList.remove('active');
    }

    if (state.objectUrl !== null && state.objectUrl.startsWith('blob:')) {
      URL.revokeObjectURL(state.objectUrl);
    }

    state.objectUrl = url;
    state.fileName = name;
    state.startTime = 0;
    state.endTime = 0;
    elements.startTime.value = 0;
    elements.startTime.dispatchEvent(new Event('input'));
    elements.endTime.value = 0;
    elements.endTime.dispatchEvent(new Event('input'));
    state.status = `Loading example: ${name}`;
    elements.video.src = url;
    elements.referenceVideo.src = url;
    elements.video.volume = state.volume;
    elements.video.muted = false;
    elements.referenceVideo.currentTime = 0;
    elements.referenceVideo.pause();
    elements.video.load();
    elements.referenceVideo.load();
    elements.video.pause();
    state.isPlaying = false;
    stopLoop();
    updatePlaybackLabel(elements.playToggle, state.isPlaying);
    await rerender();
  });

  window.addEventListener('resize', () => {
    void rerender();
  });

  await rerender();
}
