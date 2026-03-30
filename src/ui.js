import { segmenter } from './segmenter.js';

const panel = document.getElementById('settings-panel');
const tab = document.getElementById('panel-tab');
const panelContent = document.getElementById('panel-content');
const app = document.getElementById('app');

/* ── helpers ─────────────────────────────────────────────────────── */
function fmt(v) {
  const n = parseFloat(v);
  if (Number.isNaN(n)) return v;
  return Number.isInteger(n) ? String(n) : n.toFixed(2).replace(/\.?0+$/, '');
}

function fmtTime(v) {
  const n = parseFloat(v);
  if (Number.isNaN(n)) return v;
  return n.toFixed(1) + 's';
}

function section(title) {
  const el = document.createElement('div');
  el.className = 'ps-section';
  el.innerHTML = `<div class="ps-section-title">${title}</div>`;
  return el;
}

function row(labelText, inputEl, formatter) {
  const el = document.createElement('div');
  el.className = 'ps-row';

  if (labelText) {
    const lbl = document.createElement('span');
    lbl.className = 'ps-label';
    lbl.textContent = labelText;
    el.appendChild(lbl);
  }

  const wrap = document.createElement('div');
  wrap.className = 'ps-control';
  wrap.appendChild(inputEl);

  if (inputEl.type === 'range') {
    const badge = document.createElement('span');
    badge.className = 'ps-val';
    const fn = formatter ?? fmt;
    badge.textContent = fn(inputEl.value);
    inputEl.addEventListener('input', () => { badge.textContent = fn(inputEl.value); });
    wrap.appendChild(badge);
  }

  el.appendChild(wrap);
  return el;
}

function statusRow(spanEl, dim = false) {
  const el = document.createElement('div');
  el.className = 'ps-status' + (dim ? ' ps-status--dim' : '');
  el.appendChild(spanEl);
  return el;
}

const EXAMPLE_VIDEOS = [
  { url: './examplevideos/dance.mp4',       name: 'dance.mp4',       label: 'Dance' },
  { url: './examplevideos/manifest.mp4',    name: 'manifest.mp4',    label: 'Manifest' },
  { url: './examplevideos/pocoyodance.mp4', name: 'pocoyodance.mp4', label: 'Pocoyo Dance' },
];

/* ── build panel ─────────────────────────────────────────────────── */
function buildPanel() {
  const q = sel => app.querySelector(sel);

  const filePicker    = q('.file-picker');
  const playToggle    = q('[data-role="play-toggle"]');
  const cameraToggle  = q('[data-role="camera-toggle"]');
  const layoutMode    = q('[data-role="layout-mode"]');
  const theme         = q('[data-role="theme"]');
  const maskStyle     = q('[data-role="mask-style"]');
  const textVariant   = q('[data-role="text-variant"]');
  const startTime     = q('[data-role="start-time"]');
  const endTime       = q('[data-role="end-time"]');
  const scale         = q('[data-role="scale"]');
  const offsetX       = q('[data-role="offset-x"]');
  const offsetY       = q('[data-role="offset-y"]');
  const wrapDist      = q('[data-role="wrap-distance"]');
  const wrapFollow    = q('[data-role="wrap-follow"]');
  const wrapStrength  = q('[data-role="wrap-strength"]');
  const matteThresh   = q('[data-role="matte-threshold"]');
  const matteFeather  = q('[data-role="matte-feather"]');
  const volume        = q('[data-role="volume"]');
  const statusEl      = q('[data-role="status"]');
  const engineEl      = q('[data-role="engine"]');

  const sec = (title, rows) => {
    const s = section(title);
    rows.forEach(r => r && s.appendChild(r));
    return s;
  };

  panelContent.appendChild(sec('layout', [
    layoutMode  && row('mode',    layoutMode),
    theme       && row('theme',   theme),
    textVariant && row('text',    textVariant),
    maskStyle   && row('mask',    maskStyle),
  ]));

  panelContent.appendChild(sec('video', [
    filePicker    && row(null, filePicker),
    playToggle    && row(null, playToggle),
    cameraToggle  && row(null, cameraToggle),
    startTime     && row('start', startTime, fmtTime),
    endTime       && row('end',   endTime,   fmtTime),
  ]));

  const examplesSec = section('examples');
  for (const vid of EXAMPLE_VIDEOS) {
    const btn = document.createElement('button');
    btn.className = 'ps-example-btn';
    btn.textContent = vid.label;
    btn.addEventListener('click', () => {
      document.dispatchEvent(new CustomEvent('load-example-video', {
        detail: { url: vid.url, name: vid.name },
      }));
    });
    const btnRow = document.createElement('div');
    btnRow.className = 'ps-row';
    const btnWrap = document.createElement('div');
    btnWrap.className = 'ps-control';
    btnWrap.appendChild(btn);
    btnRow.appendChild(btnWrap);
    examplesSec.appendChild(btnRow);
  }
  panelContent.appendChild(examplesSec);

  panelContent.appendChild(sec('transform', [
    scale   && row('scale',    scale),
    offsetX && row('offset x', offsetX),
    offsetY && row('offset y', offsetY),
  ]));

  panelContent.appendChild(sec('text wrap', [
    wrapDist     && row('distance', wrapDist),
    wrapFollow   && row('follow',   wrapFollow),
    wrapStrength && row('strength', wrapStrength),
  ]));

  panelContent.appendChild(sec('matte', [
    matteThresh  && row('threshold', matteThresh),
    matteFeather && row('soft edge', matteFeather),
  ]));

  panelContent.appendChild(sec('audio', [
    volume && row('volume', volume),
  ]));

  const statusSec = section('status');
  if (statusEl) statusSec.appendChild(statusRow(statusEl));
  if (engineEl) statusSec.appendChild(statusRow(engineEl, true));
  panelContent.appendChild(statusSec);

  // move reference panel from paper into the settings panel
  const refPanel = q('[data-role="reference-panel"]');
  if (refPanel) {
    const refSec = section('reference');
    refPanel.classList.add('ps-ref-panel');
    refSec.appendChild(refPanel);
    panelContent.appendChild(refSec);
  }

  // hide original toolbar / status-bar wrappers
  const toolbar   = app.querySelector('.toolbar');
  const statusBar = app.querySelector('.status-bar');
  if (toolbar)   toolbar.style.display   = 'none';
  if (statusBar) statusBar.style.display = 'none';

  /* ── ML segmentation section ─────────────────────────────────────── */
  const mlSec = section('segmentation');

  const mlStatusEl = document.createElement('div');
  mlStatusEl.className = 'ps-status';
  mlStatusEl.textContent = 'Color-distance (classic)';

  const mlBtn = document.createElement('button');
  mlBtn.className = 'ps-ml-btn';
  mlBtn.textContent = 'Enable ML';

  mlBtn.addEventListener('click', async () => {
    if (segmenter.enabled) {
      segmenter.enabled = false;
      mlBtn.textContent = 'Enable ML';
      mlBtn.classList.remove('ps-ml-btn--on');
      mlStatusEl.textContent = 'Color-distance (classic)';
      return;
    }

    if (segmenter.ready) {
      segmenter.enabled = true;
      mlBtn.textContent = 'Disable ML';
      mlBtn.classList.add('ps-ml-btn--on');
      mlStatusEl.textContent = '✓ ML segmentation active';
      return;
    }

    mlBtn.disabled = true;
    try {
      await segmenter.load(msg => { mlStatusEl.textContent = msg; });
      mlBtn.textContent = 'Disable ML';
      mlBtn.classList.add('ps-ml-btn--on');
    } catch {
      mlBtn.textContent = 'Retry';
    } finally {
      mlBtn.disabled = false;
    }
  });

  const btnRow = document.createElement('div');
  btnRow.className = 'ps-row';
  const btnWrap = document.createElement('div');
  btnWrap.className = 'ps-control';
  btnWrap.appendChild(mlBtn);
  btnRow.appendChild(btnWrap);

  mlSec.appendChild(btnRow);
  mlSec.appendChild(mlStatusEl);
  panelContent.insertBefore(mlSec, panelContent.querySelector('.ps-section:last-child'));
}

buildPanel();

/* ── collapse / expand ───────────────────────────────────────────── */
tab.addEventListener('click', () => panel.classList.toggle('collapsed'));
