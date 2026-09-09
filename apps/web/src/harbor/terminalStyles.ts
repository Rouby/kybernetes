/**
 * Shared ship-terminal styling for menu, customization, pause, and death
 * screens. Static StyleX only; runtime colors ride the `style` prop.
 */

import { hudColors, hudTypography } from '@kybernetes/ui-tokens/tokens.stylex';
import * as stylex from '@stylexjs/stylex';

export const terminal = stylex.create({
  screen: {
    position: 'absolute',
    inset: 0,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(4, 6, 10, 0.72)',
    zIndex: 20,
    fontFamily: hudTypography.fontMono,
  },
  backdrop: {
    position: 'absolute',
    inset: 0,
    width: '100%',
    height: '100%',
    display: 'block',
  },
  panel: {
    position: 'relative',
    backgroundColor: hudColors.bgPanel,
    borderColor: hudColors.borderBright,
    borderWidth: 1,
    borderStyle: 'solid',
    padding: 28,
    minWidth: 340,
    maxWidth: 520,
    boxShadow: '0 0 32px rgba(0, 229, 255, 0.12)',
  },
  kicker: {
    color: hudColors.cyanDim,
    fontSize: 11,
    letterSpacing: 3,
    marginBottom: 8,
  },
  title: {
    color: hudColors.cyanTelemetry,
    fontSize: 26,
    letterSpacing: 2,
    marginBottom: 4,
  },
  subtitle: {
    color: hudColors.textSecondary,
    fontSize: 12,
    marginBottom: 20,
  },
  dangerTitle: {
    color: hudColors.alertRed,
    fontSize: 24,
    letterSpacing: 2,
    marginBottom: 4,
  },
  buttonCol: {
    display: 'flex',
    flexDirection: 'column',
    gap: 10,
  },
  button: {
    backgroundColor: 'transparent',
    borderColor: hudColors.borderBright,
    borderWidth: 1,
    borderStyle: 'solid',
    color: hudColors.textPrimary,
    fontFamily: hudTypography.fontMono,
    fontSize: 14,
    letterSpacing: 1,
    padding: '10px 16px',
    cursor: 'pointer',
    textAlign: 'left',
  },
  buttonPrimary: {
    borderColor: hudColors.borderHighlight,
    color: hudColors.cyanTelemetry,
  },
  buttonDanger: {
    borderColor: hudColors.alertRedDim,
    color: hudColors.alertRed,
  },
  sectionLabel: {
    color: hudColors.textMuted,
    fontSize: 11,
    letterSpacing: 2,
    marginTop: 16,
    marginBottom: 8,
  },
  row: {
    display: 'flex',
    alignItems: 'center',
    gap: 8,
    flexWrap: 'wrap',
  },
  input: {
    backgroundColor: hudColors.bgVoid,
    borderColor: hudColors.borderDim,
    borderWidth: 1,
    borderStyle: 'solid',
    color: hudColors.textPrimary,
    fontFamily: hudTypography.fontMono,
    fontSize: 14,
    padding: '8px 12px',
    width: '100%',
    boxSizing: 'border-box',
  },
  hint: {
    color: hudColors.textMuted,
    fontSize: 11,
    marginTop: 12,
  },
  sliderRow: {
    display: 'flex',
    alignItems: 'center',
    gap: 12,
  },
  slider: {
    flexGrow: 1,
  },
  sliderValue: {
    color: hudColors.amberTelemetry,
    fontSize: 12,
    minWidth: 44,
    textAlign: 'right',
  },
});
