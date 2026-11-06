import type { Insets } from '../components/map/markers';
import { remScale } from '../../lib/platform';

type Size = { w: number; h: number };

export const SHEET_MAX_HEIGHT = 'max(0px, calc(100% - max(48px, env(safe-area-inset-top)) - 68px))';
let safeAreaProbe: HTMLDivElement | undefined;
export function sheetTopLimit() {
  if (!safeAreaProbe) {
    safeAreaProbe = document.createElement('div');
    safeAreaProbe.style.cssText = 'position:fixed;visibility:hidden;pointer-events:none;padding-top:env(safe-area-inset-top)';
    document.body.appendChild(safeAreaProbe);
  }
  return Math.max(48, parseFloat(getComputedStyle(safeAreaProbe).paddingTop) || 0) + 56 * remScale() + 12;
}
export const maxSheetHeight = ({ h }: Size) => Math.max(0, h - sheetTopLimit());

/** On-the-way sheet height; the map shows above it. */
// Short phones (≤700px tall) keep a smaller map strip so the sheet's content and buttons still fit.
export const otwSheetHeight = (size: Size) => Math.max(0, Math.round(Math.min(maxSheetHeight(size), size.h - (size.h <= 700 ? 190 : 250), Math.max(450 * remScale(), size.h * 0.56))));
/** Select sheet heights per mode. */
export const selectSheetHeight = (size: Size, mode: 'list' | 'search' | 'detail') =>
  mode !== 'list' ? maxSheetHeight(size) : Math.max(0, Math.round(Math.min(maxSheetHeight(size), size.h - 170, Math.max(540 * remScale(), size.h * 0.64))));

/** Top safe area + the black back pill (top 48 + 56px high) and a small gap. */
export const TOP_OVERLAY = 116;
/** Side margin kept free on every map screen. */
export const SIDE_MARGIN = 40;
/**
 * Map insets for a bottom sheet of `sheetHeight`: everything the sheet covers plus the top overlay
 * (back button) and side margins. `extra` = UI sticking out above the sheet (e.g. the timer pill).
 */
export const sheetInsets = (sheetHeight: number, extra = 0): Insets => {
  const bottom = Math.max(0, sheetHeight + extra);
  const frameHeight = document.getElementById('app-frame')?.clientHeight ?? window.innerHeight;
  // At EXPANDED the remaining map is shorter than the back-pill inset; avoid
  // fitting below the sheet by reserving that inset only when there is room.
  const top = Math.min(sheetTopLimit(), Math.max(0, frameHeight - bottom - 120));
  return { top, left: SIDE_MARGIN, right: SIDE_MARGIN, bottom };
};
/** On-the-way: the timer pill sticks out 24px above the sheet. */
export const otwInsets = (size: Size, height = otwSheetHeight(size)): Insets => sheetInsets(height, 28);
