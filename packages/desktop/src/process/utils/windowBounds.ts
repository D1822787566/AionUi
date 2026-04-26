/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 *
 * Main-window bounds persistence: restore the last-known size and position
 * when the app re-opens, and write back the user's adjustments as they
 * resize or move the window.
 *
 * Mirrors the shape of process/utils/zoom.ts so there is one
 * load-at-startup + attach-per-window pattern per persisted window property.
 */

import { screen } from 'electron';
import type { BrowserWindow } from 'electron';
import { trackPersistedWrite } from './persistOnQuit';

export type WindowBounds = {
  x?: number;
  y?: number;
  width: number;
  height: number;
};

export const MIN_WINDOW_WIDTH = 400;
export const MIN_WINDOW_HEIGHT = 600;

// Default window fills 80% of the primary display horizontally and 95%
// vertically. The tall aspect ratio favors chat / long-form content and
// avoids the cramped strip shape that a square would have on ultrawide
// monitors.
const DEFAULT_WIDTH_RATIO = 0.8;
const DEFAULT_HEIGHT_RATIO = 0.95;

// Disk writes are debounced so dragging the window doesn't trigger dozens
// of ProcessConfig.set calls per second.
const PERSIST_DEBOUNCE_MS = 300;

let cachedBounds: WindowBounds | undefined;

/** Load persisted bounds once at startup. Safe to call even if config is empty. */
export const loadSavedWindowBounds = (saved: WindowBounds | undefined): void => {
  cachedBounds = saved;
};

/** Compute the bounds to apply to a new BrowserWindow. */
export const resolveInitialBounds = (): WindowBounds => {
  const primary = screen.getPrimaryDisplay();
  const { width: screenWidth, height: screenHeight } = primary.workAreaSize;
  const defaults: WindowBounds = {
    width: Math.floor(screenWidth * DEFAULT_WIDTH_RATIO),
    height: Math.floor(screenHeight * DEFAULT_HEIGHT_RATIO),
  };

  if (!cachedBounds) return defaults;
  if (cachedBounds.width < MIN_WINDOW_WIDTH || cachedBounds.height < MIN_WINDOW_HEIGHT) return defaults;
  if (!boundsOverlapAnyDisplay(cachedBounds)) return defaults;
  return clampBoundsToWorkArea(cachedBounds);
};

/**
 * Bounding box that covers every connected display's work area.
 *
 * Saved bounds are stored in DIP coordinates captured on whatever screens were
 * attached at the time. Opening the app on a smaller display, at a different
 * DPI scale factor, or after unplugging the monitor that hosted the window
 * leaves the rectangle hanging off the right/bottom edge — the window then
 * opens partially off-screen and looks stuck in a corner. Electron does not
 * correct this on its own.
 *
 * A rectangle that still fits inside this union is left exactly as saved, so
 * users who deliberately straddle a window across two monitors keep it there.
 * Only rectangles hanging off the edge get pulled back.
 */
const workAreaUnion = (): { x: number; y: number; width: number; height: number } => {
  const all = screen.getAllDisplays();
  if (all.length === 0) return screen.getPrimaryDisplay().workArea;
  let x1 = Number.POSITIVE_INFINITY;
  let y1 = Number.POSITIVE_INFINITY;
  let x2 = Number.NEGATIVE_INFINITY;
  let y2 = Number.NEGATIVE_INFINITY;
  for (const d of all) {
    const wa = d.workArea;
    x1 = Math.min(x1, wa.x);
    y1 = Math.min(y1, wa.y);
    x2 = Math.max(x2, wa.x + wa.width);
    y2 = Math.max(y2, wa.y + wa.height);
  }
  return { x: x1, y: y1, width: x2 - x1, height: y2 - y1 };
};

/**
 * Pull a saved rectangle back inside the work area of the display it mostly
 * belongs to, shrinking it first if it is larger than that display.
 *
 * The clamped result is what gets written back on the next resize/close, so a
 * bad value stored by an older build heals itself after one launch.
 *
 * Note this runs only when the rectangle overlaps a display at all — a window
 * saved entirely off-screen still falls back to centered defaults, which is a
 * friendlier result than snapping it into a corner.
 */
const clampBoundsToWorkArea = (bounds: WindowBounds): WindowBounds => {
  if (bounds.x === undefined || bounds.y === undefined) return bounds;

  const union = workAreaUnion();
  const insideUnion =
    bounds.x >= union.x &&
    bounds.y >= union.y &&
    bounds.x + bounds.width <= union.x + union.width &&
    bounds.y + bounds.height <= union.y + union.height;
  if (insideUnion) return bounds;

  const wa = screen.getDisplayMatching({
    x: bounds.x,
    y: bounds.y,
    width: bounds.width,
    height: bounds.height,
  }).workArea;

  const width = Math.min(bounds.width, wa.width);
  const height = Math.min(bounds.height, wa.height);
  // Math.max(wa.x, …) guards the degenerate case where the work area itself is
  // narrower than the minimum window size.
  const maxX = Math.max(wa.x, wa.x + wa.width - width);
  const maxY = Math.max(wa.y, wa.y + wa.height - height);
  const x = Math.min(Math.max(bounds.x, wa.x), maxX);
  const y = Math.min(Math.max(bounds.y, wa.y), maxY);
  return { x, y, width, height };
};

/**
 * Returns true if at least part of the rectangle overlaps a currently-connected
 * display, ensuring the window is reachable for the user. More permissive than
 * requiring full containment (windows legitimately straddle displays).
 */
const boundsOverlapAnyDisplay = (bounds: WindowBounds): boolean => {
  if (bounds.x === undefined || bounds.y === undefined) return true;
  const x1 = bounds.x;
  const y1 = bounds.y;
  const x2 = bounds.x + bounds.width;
  const y2 = bounds.y + bounds.height;
  return screen.getAllDisplays().some((d) => {
    const wa = d.workArea;
    const ox1 = wa.x;
    const oy1 = wa.y;
    const ox2 = wa.x + wa.width;
    const oy2 = wa.y + wa.height;
    return x1 < ox2 && x2 > ox1 && y1 < oy2 && y2 > oy1;
  });
};

/**
 * Wire up resize/move/close listeners on a window so its size and position
 * round-trip through ProcessConfig. Skips persisting while the window is
 * maximized, fullscreen, or minimized — those are transient states whose
 * bounds would misrepresent the user's preferred "normal" size.
 *
 * Each write is registered with persistOnQuit so a resize immediately
 * followed by ⌘Q still flushes to disk before the app exits — otherwise the
 * window would reset to the default size on next launch.
 */
export const attachWindowBoundsPersistence = (
  win: BrowserWindow,
  persist: (bounds: WindowBounds) => void | Promise<unknown>
): void => {
  let saveTimer: NodeJS.Timeout | null = null;

  const fireWrite = (bounds: WindowBounds): void => {
    // Update the in-memory cache synchronously so a subsequent
    // resolveInitialBounds() (e.g. user closes the window then reopens it
    // without quitting the app) sees the latest bounds rather than the
    // boot-time snapshot.
    cachedBounds = bounds;
    const op = Promise.resolve(persist(bounds)).catch((error) => {
      console.error('[AionUi] Failed to persist window bounds:', error);
    });
    trackPersistedWrite(op);
  };

  const saveNow = (): void => {
    if (win.isDestroyed()) return;
    if (win.isMaximized() || win.isFullScreen() || win.isMinimized()) return;
    fireWrite(win.getNormalBounds());
  };

  const scheduleSave = () => {
    if (saveTimer) clearTimeout(saveTimer);
    saveTimer = setTimeout(saveNow, PERSIST_DEBOUNCE_MS);
  };

  win.on('resize', scheduleSave);
  win.on('move', scheduleSave);
  win.on('close', () => {
    if (saveTimer) {
      clearTimeout(saveTimer);
      saveTimer = null;
    }
    saveNow();
  });
};
