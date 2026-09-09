/**
 * CustomizeScreen: callsign plus pawn tint plus trim/thruster accents.
 * Every change persists immediately through onChange; Back discards
 * nothing because nothing is staged. Embark saves and launches.
 */

import { PAWN_TRIMS, THRUSTER_TINTS } from '@kybernetes/protocol';
import * as stylex from '@stylexjs/stylex';
import type { HarborIdentityState } from './identity';
import { terminal } from './terminalStyles';

const COLOR_PRESETS = [
  '#ffd166',
  '#00e5ff',
  '#00ff66',
  '#ff2244',
  '#ff8800',
  '#b388ff',
  '#e0e8f5',
  '#ff5da2',
] as const;

export interface CustomizeScreenProps {
  readonly draft: HarborIdentityState;
  readonly onChange: (draft: HarborIdentityState) => void;
  readonly onBack: () => void;
  readonly onEmbark: () => void;
}

function PresetRow(props: {
  readonly label: string;
  readonly options: readonly string[];
  readonly active: string;
  readonly onPick: (value: string) => void;
}) {
  return (
    <fieldset style={{ border: 'none', margin: 0, padding: 0 }}>
      <legend {...stylex.props(terminal.sectionLabel)}>{props.label}</legend>
      <div {...stylex.props(terminal.row)}>
        {props.options.map((option) => (
          <button
            key={option}
            type="button"
            aria-label={`${props.label} ${option}`}
            aria-pressed={option === props.active}
            onClick={() => props.onPick(option)}
            style={{
              width: 34,
              height: 26,
              cursor: 'pointer',
              backgroundColor: '#0f141d',
              color: option === props.active ? '#00e5ff' : '#8a9bb5',
              border: option === props.active ? '2px solid #00e5ff' : '1px solid #2e415e',
              fontFamily: 'monospace',
              fontSize: 10,
            }}
          >
            {option}
          </button>
        ))}
      </div>
    </fieldset>
  );
}

function ColorSwatches(props: {
  readonly active: string;
  readonly onPick: (value: string) => void;
}) {
  return (
    <fieldset style={{ border: 'none', margin: 0, padding: 0 }}>
      <legend {...stylex.props(terminal.sectionLabel)}>PAWN TINT</legend>
      <div {...stylex.props(terminal.row)}>
        {COLOR_PRESETS.map((color) => (
          <button
            key={color}
            type="button"
            aria-label={`Pawn tint ${color}`}
            aria-pressed={color === props.active}
            title={color}
            onClick={() => props.onPick(color)}
            style={{
              width: 30,
              height: 30,
              borderRadius: '50%',
              cursor: 'pointer',
              backgroundColor: color,
              border: color === props.active ? '2px solid #00e5ff' : '1px solid #2e415e',
            }}
          />
        ))}
      </div>
    </fieldset>
  );
}

function PawnPreview({ draft }: { readonly draft: HarborIdentityState }) {
  return (
    <div {...stylex.props(terminal.row)} role="img" aria-label="Pawn preview">
      <span
        style={{
          width: 26,
          height: 26,
          borderRadius: '50%',
          backgroundColor: draft.color,
          border: '2px solid #e0e8f5',
          display: 'inline-block',
        }}
      />
      <span style={{ color: '#8a9bb5', fontSize: 12 }}>trim:{draft.trim}</span>
      <span style={{ color: '#8a9bb5', fontSize: 12 }}>drive:{draft.thruster}</span>
    </div>
  );
}

export function CustomizeScreen({ draft, onChange, onBack, onEmbark }: CustomizeScreenProps) {
  return (
    <div {...stylex.props(terminal.screen)}>
      <div {...stylex.props(terminal.panel)} role="dialog" aria-label="Customize character">
        <div {...stylex.props(terminal.kicker)}>HARBOR CONTROL {'//'} IDENTITY</div>
        <div {...stylex.props(terminal.title)}>CUSTOMIZE</div>
        <PawnPreview draft={draft} />
        <div {...stylex.props(terminal.sectionLabel)}>CALLSIGN</div>
        <input
          aria-label="Callsign"
          maxLength={24}
          value={draft.callsign}
          onChange={(event) => onChange({ ...draft, callsign: event.target.value })}
          {...stylex.props(terminal.input)}
        />
        <ColorSwatches active={draft.color} onPick={(color) => onChange({ ...draft, color })} />
        <PresetRow
          label="HULL TRIM"
          options={PAWN_TRIMS}
          active={draft.trim}
          onPick={(trim) => onChange({ ...draft, trim: trim as HarborIdentityState['trim'] })}
        />
        <PresetRow
          label="THRUSTER DRIVE"
          options={THRUSTER_TINTS}
          active={draft.thruster}
          onPick={(thruster) =>
            onChange({ ...draft, thruster: thruster as HarborIdentityState['thruster'] })
          }
        />
        <div {...stylex.props(terminal.sectionLabel)}>READY</div>
        <div {...stylex.props(terminal.buttonCol)}>
          <button
            type="button"
            {...stylex.props(terminal.button, terminal.buttonPrimary)}
            onClick={onEmbark}
          >
            SAVE & EMBARK →
          </button>
          <button type="button" {...stylex.props(terminal.button)} onClick={onBack}>
            ← BACK
          </button>
        </div>
      </div>
    </div>
  );
}
