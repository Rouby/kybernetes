/**
 * Pure SVG snapshot renderer for visibility / LoS scenarios.
 * Zero-DOM, deterministic string building only: tests and debug views
 * share this so screenshots and assertions can never drift apart.
 * World units map 1:1 to SVG units (Y-down, like the viewport).
 */

import type { WallSegment } from '@kybernetes/protocol';
import type { Point2D } from './collision';

export interface SvgProbe {
  readonly x: number;
  readonly y: number;
  readonly visible: boolean;
  readonly label?: string;
}

export interface SvgBreach {
  readonly x1: number;
  readonly y1: number;
  readonly x2: number;
  readonly y2: number;
  readonly sizeClass: 'puncture' | 'breach';
}

export interface SvgViewport {
  readonly x: number;
  readonly y: number;
  readonly w: number;
  readonly h: number;
}

export interface VisibilitySnapshot {
  readonly title: string;
  /** Pre-carve walls (dim dashed underlay: gaps show through here). */
  readonly walls: readonly WallSegment[];
  /** Post-carve rendered walls (solid overlay). Defaults to walls. */
  readonly carvedWalls?: readonly WallSegment[];
  readonly breaches: readonly SvgBreach[];
  readonly origin: Point2D;
  readonly facing?: number;
  readonly polygon: readonly Point2D[];
  readonly probes: readonly SvgProbe[];
  readonly viewport: SvgViewport;
}

/** Shoelace area (absolute px^2) for polygon-size assertions. */
export function polygonArea(poly: readonly Point2D[]): number {
  if (poly.length < 3) return 0;
  let sum = 0;
  for (let i = 0; i < poly.length; i += 1) {
    const a = poly[i];
    const b = poly[(i + 1) % poly.length];
    if (a === undefined || b === undefined) continue;
    sum += a.x * b.y - b.x * a.y;
  }
  return Math.abs(sum) / 2;
}

function escapeXml(text: string): string {
  return text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

function pointsOf(poly: readonly Point2D[]): string {
  return poly.map((p) => `${round1(p.x)},${round1(p.y)}`).join(' ');
}

function round1(value: number): number {
  return Math.round(value * 10) / 10;
}

function wallLines(walls: readonly WallSegment[], style: string, width: number): string {
  return walls
    .map(
      (w) =>
        `<line x1="${round1(w.x1)}" y1="${round1(w.y1)}" x2="${round1(w.x2)}" y2="${round1(w.y2)}" style="${style}" stroke-width="${width}" stroke-linecap="round"/>`
    )
    .join('');
}

function breachLines(breaches: readonly SvgBreach[]): string {
  return breaches
    .map((b) => {
      const style =
        b.sizeClass === 'breach'
          ? 'stroke:#fb923c;stroke-dasharray:none;opacity:0.95'
          : 'stroke:#f87171;stroke-dasharray:5 3;opacity:0.9';
      const width = b.sizeClass === 'breach' ? 5 : 3;
      return `<line x1="${round1(b.x1)}" y1="${round1(b.y1)}" x2="${round1(b.x2)}" y2="${round1(b.y2)}" style="${style}" stroke-width="${width}" stroke-linecap="round"/>`;
    })
    .join('');
}

function probeDots(origin: Point2D, probes: readonly SvgProbe[]): string {
  return probes
    .map((p, i) => {
      const color = p.visible ? '#4ade80' : '#f87171';
      const label = escapeXml(p.label ?? `P${i + 1}`);
      return (
        `<line x1="${round1(origin.x)}" y1="${round1(origin.y)}" x2="${round1(p.x)}" y2="${round1(p.y)}" style="stroke:${color};stroke-width:1;opacity:0.55"/>` +
        `<circle cx="${round1(p.x)}" cy="${round1(p.y)}" r="4" style="fill:${color};opacity:0.95"/>` +
        `<text x="${round1(p.x + 7)}" y="${round1(p.y - 6)}" style="fill:${color};font-size:10px;font-family:monospace">${label}</text>`
      );
    })
    .join('');
}

function originMark(origin: Point2D, facing: number | undefined): string {
  const tick =
    facing === undefined
      ? ''
      : `<line x1="${round1(origin.x)}" y1="${round1(origin.y)}" x2="${round1(origin.x + Math.cos(facing) * 14)}" y2="${round1(origin.y + Math.sin(facing) * 14)}" style="stroke:#22d3ee;stroke-width:2"/>`;
  return (
    `<circle cx="${round1(origin.x)}" cy="${round1(origin.y)}" r="5.5" style="fill:#22d3ee;stroke:#0e7490;stroke-width:1.5"/>` +
    tick
  );
}

/**
 * Render one scenario snapshot. Intact walls draw dim dashed underneath
 * the carved solid overlay, so an unexpected carve gap reads as a
 * dashed segment with no solid cover (the reported shooting-walls bug).
 */
export function renderVisibilitySvg(snap: VisibilitySnapshot): string {
  const carved = snap.carvedWalls ?? snap.walls;
  const view = snap.viewport;
  const poly =
    snap.polygon.length >= 3
      ? `<polygon points="${pointsOf(snap.polygon)}" style="fill:rgba(255,210,120,0.22);stroke:#ffd27f;stroke-width:1.2"/>`
      : '';
  return (
    `<svg xmlns="http://www.w3.org/2000/svg" width="${view.w}" height="${view.h}" viewBox="${view.x} ${view.y} ${view.w} ${view.h}">` +
    `<rect x="${view.x}" y="${view.y}" width="${view.w}" height="${view.h}" style="fill:#0b1020"/>` +
    poly +
    wallLines(snap.walls, 'stroke:#475569;stroke-dasharray:6 4;opacity:0.8', 5) +
    wallLines(carved, 'stroke:#cbd5e1;opacity:0.95', 2.6) +
    breachLines(snap.breaches) +
    probeDots(snap.origin, snap.probes) +
    originMark(snap.origin, snap.facing) +
    `<text x="${view.x + 10}" y="${view.y + 20}" style="fill:#e2e8f0;font-size:13px;font-family:monospace">${escapeXml(snap.title)}</text>` +
    `</svg>`
  );
}
