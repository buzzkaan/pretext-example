function average(samples) {
  const total = samples.reduce((sum, value) => sum + value, 0);
  return Math.round(total / samples.length);
}

function pixelOffset(width, x, y) {
  return (y * width + x) * 4;
}

export function estimateBackgroundColor(pixels, width, height) {
  const red = [];
  const green = [];
  const blue = [];
  const seen = new Set();

  const sample = (x, y) => {
    const key = `${x}:${y}`;
    if (seen.has(key)) {
      return;
    }

    seen.add(key);
    const offset = pixelOffset(width, x, y);
    red.push(pixels[offset]);
    green.push(pixels[offset + 1]);
    blue.push(pixels[offset + 2]);
  };

  for (let x = 0; x < width; x += 1) {
    sample(x, 0);
    sample(x, height - 1);
  }

  for (let y = 0; y < height; y += 1) {
    sample(0, y);
    sample(width - 1, y);
  }

  return {
    r: average(red),
    g: average(green),
    b: average(blue),
  };
}

function colorDistance(pixelR, pixelG, pixelB, background) {
  return Math.sqrt(
    (pixelR - background.r) ** 2 +
      (pixelG - background.g) ** 2 +
      (pixelB - background.b) ** 2,
  );
}

export function createForegroundAlphaMask(
  pixels,
  width,
  height,
  {
    background = estimateBackgroundColor(pixels, width, height),
    threshold = 42,
    feather = 26,
  } = {},
) {
  const alpha = new Uint8ClampedArray(width * height);

  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const offset = pixelOffset(width, x, y);
      const distance = colorDistance(
        pixels[offset],
        pixels[offset + 1],
        pixels[offset + 2],
        background,
      );
      const normalized = (distance - threshold) / Math.max(1, feather);
      const opacity = Math.round(Math.max(0, Math.min(1, normalized)) * 255);
      alpha[y * width + x] = opacity;
    }
  }

  return alpha;
}

function smoothProfile(profile) {
  return profile.map((band, index) => {
    const previous = profile[index - 1] ?? band;
    const next = profile[index + 1] ?? band;
    return {
      width: (previous.width + band.width + next.width) / 3,
      offset: (previous.offset + band.offset + next.offset) / 3,
    };
  });
}

export function deriveProfileFromAlpha(
  alpha,
  width,
  height,
  {
    bands = 10,
    minAlpha = 24,
    minWidth = 0.1,
  } = {},
) {
  const profile = [];

  for (let bandIndex = 0; bandIndex < bands; bandIndex += 1) {
    const startY = Math.floor((bandIndex / bands) * height);
    const endY = Math.max(startY + 1, Math.floor(((bandIndex + 1) / bands) * height));
    let left = width;
    let right = -1;

    for (let y = startY; y < endY; y += 1) {
      for (let x = 0; x < width; x += 1) {
        if (alpha[y * width + x] < minAlpha) {
          continue;
        }

        left = Math.min(left, x);
        right = Math.max(right, x);
      }
    }

    if (right === -1) {
      profile.push({ width: minWidth, offset: 0 });
      continue;
    }

    const bandWidth = Math.max(minWidth, (right - left + 1) / width);
    const center = (left + right + 1) / 2 / width;
    profile.push({
      width: bandWidth,
      offset: center - 0.5,
    });
  }

  return smoothProfile(profile);
}

export function deriveForegroundBounds(
  alpha,
  width,
  height,
  {
    minAlpha = 24,
    padding = 0,
  } = {},
) {
  let left = width;
  let right = -1;
  let top = height;
  let bottom = -1;

  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      if (alpha[y * width + x] < minAlpha) {
        continue;
      }

      left = Math.min(left, x);
      right = Math.max(right, x);
      top = Math.min(top, y);
      bottom = Math.max(bottom, y);
    }
  }

  if (right === -1) {
    return null;
  }

  return {
    left: Math.max(0, left - padding),
    top: Math.max(0, top - padding),
    right: Math.min(width - 1, right + padding),
    bottom: Math.min(height - 1, bottom + padding),
  };
}

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

export function computeForegroundPlacement({
  bounds,
  sourceWidth,
  sourceHeight,
  targetWidth,
  targetHeight,
}) {
  const sourceCropWidth = bounds.right - bounds.left + 1;
  const sourceCropHeight = bounds.bottom - bounds.top + 1;
  const fit = Math.min(targetWidth / sourceCropWidth, targetHeight / sourceCropHeight);
  const drawWidth = sourceCropWidth * fit;
  const drawHeight = sourceCropHeight * fit;
  const sourceCenterX = (bounds.left + bounds.right + 1) / 2;
  const sourceCenterY = (bounds.top + bounds.bottom + 1) / 2;
  const targetCenterX = (sourceCenterX / sourceWidth) * targetWidth;
  const targetCenterY = (sourceCenterY / sourceHeight) * targetHeight;
  const unclampedX = targetCenterX - drawWidth / 2;
  const unclampedY = targetCenterY - drawHeight / 2;

  return {
    drawX: clamp(unclampedX, 0, Math.max(0, targetWidth - drawWidth)),
    drawY: clamp(unclampedY, 0, Math.max(0, targetHeight - drawHeight)),
    drawWidth,
    drawHeight,
  };
}
