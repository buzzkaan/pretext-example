import { sampleProfileBand } from './profile.js';

export function computeWrapRegions({
  y,
  lineHeight,
  articleLeft,
  articleWidth,
  stageTop,
  stageHeight,
  stageCenterX,
  stageWidth,
  profile,
  wrapStrength,
  gutter,
  minRegionWidth = 0,
  offsetDamping = 1,
  profileInset = 0,
}) {
  const lineMid = y + lineHeight / 2;
  const stageBottom = stageTop + stageHeight;

  if (lineMid < stageTop || lineMid > stageBottom) {
    return [{ x: articleLeft, width: articleWidth }];
  }

  const normalizedY = (lineMid - stageTop) / stageHeight;
  const band = sampleProfileBand(profile, normalizedY);
  const actualCenterX = stageCenterX + band.offset * stageWidth;
  const effectiveCenterX = stageCenterX + band.offset * stageWidth * offsetDamping;
  const effectiveBandWidth = Math.max(0.06, band.width - profileInset);
  const centerDrift = Math.abs(actualCenterX - effectiveCenterX);
  const halfWidth = (stageWidth * effectiveBandWidth * wrapStrength) / 2 + centerDrift;
  let exclusionLeft = effectiveCenterX - halfWidth - gutter;
  let exclusionRight = effectiveCenterX + halfWidth + gutter;
  const articleRight = articleLeft + articleWidth;

  if (minRegionWidth > 0) {
    exclusionLeft = Math.max(articleLeft + minRegionWidth, exclusionLeft);
    exclusionRight = Math.min(articleRight - minRegionWidth, exclusionRight);

    if (exclusionLeft >= exclusionRight) {
      exclusionLeft = articleLeft + minRegionWidth;
      exclusionRight = articleRight - minRegionWidth;
    }
  }

  const leftRegion = {
    x: articleLeft,
    width: Math.max(0, exclusionLeft - articleLeft),
  };
  const rightRegion = {
    x: Math.min(articleRight, exclusionRight),
    width: Math.max(0, articleRight - exclusionRight),
  };

  return [leftRegion, rightRegion].filter(region => region.width > 24);
}

export function createFlowPlan({
  prepared,
  articleLeft,
  articleTop,
  articleWidth,
  articleHeight,
  lineHeight,
  stageTop,
  stageHeight,
  stageCenterX,
  stageWidth,
  profile,
  wrapStrength,
  gutter,
  minRegionWidth = 0,
  offsetDamping = 1,
  profileInset = 0,
}) {
  if (typeof prepared.nextLine === 'function') {
    const lines = [];
    let cursor = prepared.startCursor;
    let y = articleTop;
    const maxY = articleTop + articleHeight;

    while (y + lineHeight <= maxY) {
      const regions = computeWrapRegions({
        y,
        lineHeight,
        articleLeft,
        articleWidth,
        stageTop,
        stageHeight,
        stageCenterX,
        stageWidth,
        profile,
        wrapStrength,
          gutter,
          minRegionWidth,
          offsetDamping,
          profileInset,
        });
      let placedAny = false;

      for (const region of regions) {
        const line = prepared.nextLine(cursor, region.width);

        if (line === null) {
          return {
            height: Math.max(0, y - articleTop),
            lines,
          };
        }

        lines.push({
          text: line.text,
          x: region.x,
          y,
          width: Math.min(region.width, line.width),
          regionWidth: region.width,
        });
        cursor = line.end;
        placedAny = true;
      }

      if (!placedAny) {
        break;
      }

      y += lineHeight;
    }

    return {
      height: Math.max(0, y - articleTop),
      lines,
    };
  }

  const lines = [];
  const measuredLines = typeof prepared.measure === 'function' ? prepared.measure(articleWidth) : [];
  let cursor = 0;
  let y = articleTop;
  const maxY = articleTop + articleHeight;

  while (cursor < measuredLines.length && y + lineHeight <= maxY) {
    const regions = computeWrapRegions({
      y,
      lineHeight,
      articleLeft,
      articleWidth,
      stageTop,
      stageHeight,
      stageCenterX,
      stageWidth,
      profile,
      wrapStrength,
        gutter,
        minRegionWidth,
        offsetDamping,
        profileInset,
      });

    for (const region of regions) {
      if (cursor >= measuredLines.length) {
        break;
      }

      const measured = measuredLines[cursor];
      lines.push({
        text: measured.text,
        x: region.x,
        y,
        width: Math.min(region.width, measured.width),
        regionWidth: region.width,
      });
      cursor += 1;
    }

    y += lineHeight;
  }

  return {
    height: Math.max(0, y - articleTop),
    lines,
  };
}

function splitRegionIntoColumns(region, columnGap) {
  const gap = Math.min(columnGap, Math.max(24, region.width * 0.14));
  const width = Math.max(40, (region.width - gap) / 2);

  return {
    left: { x: region.x, width },
    right: { x: region.x + region.width - width, width },
  };
}

function resolveColumnRegions({
  y,
  lineHeight,
  articleLeft,
  articleWidth,
  columnGap,
  stageTop,
  stageHeight,
  stageCenterX,
  stageWidth,
  profile,
  wrapStrength,
  gutter,
  minRegionWidth = 0,
  offsetDamping = 1,
  profileInset = 0,
}) {
  const baselineColumns = splitRegionIntoColumns(
    { x: articleLeft, width: articleWidth },
    columnGap,
  );
  const regions = computeWrapRegions({
    y,
    lineHeight,
    articleLeft,
    articleWidth,
    stageTop,
    stageHeight,
    stageCenterX,
    stageWidth,
    profile,
    wrapStrength,
    gutter,
    minRegionWidth,
    offsetDamping,
    profileInset,
  });

  if (regions.length >= 2) {
    const rightEdge = baselineColumns.right.x + baselineColumns.right.width;
    const leftWidth = Math.min(baselineColumns.left.width, regions[0].width);
    const rightWidth = Math.min(baselineColumns.right.width, regions[regions.length - 1].width);

    return {
      left: {
        x: baselineColumns.left.x,
        width: leftWidth,
      },
      right: {
        x: rightEdge - rightWidth,
        width: rightWidth,
      },
    };
  }

  return baselineColumns;
}

export function createDualFlowPlan({
  leftPrepared,
  rightPrepared,
  articleLeft,
  articleTop,
  articleWidth,
  articleHeight,
  lineHeight,
  columnGap,
  stageTop,
  stageHeight,
  stageCenterX,
  stageWidth,
  profile,
  wrapStrength,
  gutter,
  minRegionWidth = 0,
  offsetDamping = 1,
  profileInset = 0,
}) {
  const lines = [];
  let leftCursor = leftPrepared.startCursor;
  let rightCursor = rightPrepared.startCursor;
  let leftDone = false;
  let rightDone = false;
  let y = articleTop;
  const maxY = articleTop + articleHeight;

  while (y + lineHeight <= maxY && (!leftDone || !rightDone)) {
    const columns = resolveColumnRegions({
      y,
      lineHeight,
      articleLeft,
      articleWidth,
      columnGap,
      stageTop,
      stageHeight,
      stageCenterX,
      stageWidth,
      profile,
      wrapStrength,
      gutter,
      minRegionWidth,
      offsetDamping,
      profileInset,
    });

    if (!leftDone) {
      const line = leftPrepared.nextLine(leftCursor, columns.left.width);
      if (line === null) {
        leftDone = true;
      } else {
        lines.push({
          column: 'left',
          text: line.text,
          x: columns.left.x,
          y,
          width: Math.min(columns.left.width, line.width),
          regionWidth: columns.left.width,
        });
        leftCursor = line.end;
      }
    }

    if (!rightDone) {
      const line = rightPrepared.nextLine(rightCursor, columns.right.width);
      if (line === null) {
        rightDone = true;
      } else {
        lines.push({
          column: 'right',
          text: line.text,
          x: columns.right.x,
          y,
          width: Math.min(columns.right.width, line.width),
          regionWidth: columns.right.width,
        });
        rightCursor = line.end;
      }
    }

    y += lineHeight;
  }

  return {
    height: Math.max(0, y - articleTop),
    lines,
  };
}

function normalizeText(text) {
  return text.replace(/\s+/g, ' ').trim();
}

function normalizeCanvasCursor(cursor) {
  if (typeof cursor === 'number') {
    return { wordIndex: cursor, carry: '' };
  }

  if (cursor && typeof cursor === 'object') {
    return {
      wordIndex: cursor.wordIndex ?? 0,
      carry: cursor.carry ?? '',
    };
  }

  return { wordIndex: 0, carry: '' };
}

export function fitWordSegment(word, maxWidth, measureWidth) {
  let candidate = '';

  for (const char of Array.from(word)) {
    const next = candidate + char;
    if (candidate.length > 0 && measureWidth(next) > maxWidth) {
      break;
    }
    candidate = next;
  }

  return candidate || word[0] || '';
}

export function splitWordForLine(word, maxWidth, measureWidth) {
  const characters = Array.from(word);

  if (characters.length <= 6) {
    return {
      head: fitWordSegment(word, maxWidth, measureWidth),
      tail: '',
    };
  }

  let bestHead = '';
  let bestTail = '';

  for (let index = 3; index <= characters.length - 3; index += 1) {
    const head = `${characters.slice(0, index).join('')}-`;
    const tail = characters.slice(index).join('');

    if (measureWidth(head) <= maxWidth) {
      bestHead = head;
      bestTail = tail;
    } else {
      break;
    }
  }

  if (bestHead.length > 0) {
    return {
      head: bestHead,
      tail: bestTail,
    };
  }

  return {
    head: fitWordSegment(word, maxWidth, measureWidth),
    tail: '',
  };
}

export function createCanvasPreparedText({ text, font, context }) {
  const words = normalizeText(text).split(' ');

  context.font = font;

  return {
    startCursor: { wordIndex: 0, carry: '' },
    nextLine(startCursor, maxWidth) {
      const cursor = normalizeCanvasCursor(startCursor);

      if (cursor.wordIndex >= words.length && cursor.carry.length === 0) {
        return null;
      }

      let index = cursor.wordIndex;
      let carry = cursor.carry;
      let textSoFar = '';

      while (index < words.length || carry.length > 0) {
        const word = carry || words[index];
        const candidate = textSoFar.length === 0 ? word : `${textSoFar} ${word}`;

        if (context.measureText(candidate).width <= maxWidth) {
          textSoFar = candidate;
          if (carry.length > 0) {
            carry = '';
            index += 1;
          } else {
            index += 1;
          }
          continue;
        }

        if (textSoFar.length === 0) {
          const segment = splitWordForLine(
            word,
            maxWidth,
            sample => context.measureText(sample).width,
          );
          return {
            text: segment.head,
            width: context.measureText(segment.head).width,
            end: segment.tail.length > 0
              ? { wordIndex: index, carry: segment.tail }
              : { wordIndex: index + 1, carry: '' },
          };
        }

        break;
      }

      return {
        text: textSoFar,
        width: context.measureText(textSoFar).width,
        end: { wordIndex: index, carry },
      };
    },
  };
}

let pretextModulePromise;

async function loadPretextModule() {
  if (pretextModulePromise === undefined) {
    pretextModulePromise = import('https://esm.sh/@chenglou/pretext').catch(() => null);
  }

  return pretextModulePromise;
}

export async function createBrowserPreparedText({ text, font, context }) {
  const module = await loadPretextModule();

  if (module !== null) {
    const prepared = module.prepareWithSegments(text, font);
    return {
      engine: 'pretext',
      startCursor: { segmentIndex: 0, graphemeIndex: 0 },
      nextLine(startCursor, maxWidth) {
        return module.layoutNextLine(prepared, startCursor, maxWidth);
      },
    };
  }

  return {
    engine: 'canvas',
    ...createCanvasPreparedText({ text, font, context }),
  };
}
