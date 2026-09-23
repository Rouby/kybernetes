/**
 * Plain theme values mirroring tokens.stylex.ts for DOM chrome.
 * StyleX defineVars needs the StyleX compiler; DOM debug surfaces
 * (Soundboard, DebugHud) import these values directly so token adoption
 * does not wait on vite-plugin-stylex. Keep hexes in sync with
 * tokens.stylex.ts — theme.test.ts pins them.
 */

export const hudTheme = {
  bgVoid: '#06080c',
  bgPanel: '#0f141d',
  bgPanelLighter: '#182130',
  borderDim: '#1f2b3e',
  borderBright: '#2e415e',
  borderHighlight: '#00e5ff',
  phosphorGreen: '#00ff66',
  phosphorGreenDim: '#00aa44',
  amberTelemetry: '#ffb000',
  amberDim: '#aa7500',
  cyanTelemetry: '#00e5ff',
  cyanDim: '#008899',
  alertRed: '#ff2244',
  alertRedDim: '#881122',
  textPrimary: '#e0e8f5',
  textSecondary: '#8a9bb5',
  textMuted: '#546379',
} as const;

export const hudFonts = {
  fontMono: '"Courier New", Courier, monospace',
  fontDisplay: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
} as const;

export type HudTheme = typeof hudTheme;
