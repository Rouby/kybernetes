/**
 * Ship console panels: reactor two-dial tune + restart, engine spool + tune.
 * Opened with [E] at a console fixture; numbers come from SHIP_SYSTEMS,
 * buttons send tune intents. All branching lives in shipConsoleModel.
 */

import type {
  NavStateBroadcast,
  ShipStatusBroadcast,
  ShipSystemsBroadcast,
} from '@kybernetes/protocol';
import * as stylex from '@stylexjs/stylex';
import { ShipAudioEngine } from '../audio/ShipAudioEngine';
import { type NavViewModel, navViewModel } from './navConsoleModel';
import type { ConsoleKind } from './sessionActions';
import {
  engineViewModel,
  type ReactorBandStatus,
  type ReactorViewModel,
  reactorViewModel,
} from './shipConsoleModel';
import { terminal } from './terminalStyles';
import type { useHarborSocket } from './useHarborSocket';

type SendIntent = ReturnType<typeof useHarborSocket>['sendIntent'];

export interface ShipConsolePanelProps {
  readonly kind: ConsoleKind;
  readonly systems: ShipSystemsBroadcast;
  readonly sendIntent: SendIntent;
  readonly onClose: () => void;
  readonly navState?: NavStateBroadcast | null;
  readonly shipStatus?: ShipStatusBroadcast | null;
}

const bars = stylex.create({
  track: {
    width: '100%',
    height: 10,
    backgroundColor: '#1a2230',
    borderRadius: 5,
    overflow: 'hidden',
  },
  fill: { height: '100%', transition: 'width 0.2s ease' },
});

const STATUS_COLORS: Record<ReactorBandStatus, string> = {
  cold: '#7db8ff',
  nominal: '#7ee787',
  warning: '#ffd166',
  critical: '#ff6b6b',
  scrammed: '#ff6b6b',
};

const CONSOLE_TITLES: Record<ConsoleKind, string> = {
  reactor_console: 'Reactor console',
  engine_console: 'Engine console',
  nav_console: 'Nav console',
};

export function ShipConsolePanel({
  kind,
  systems,
  sendIntent,
  onClose,
  navState = null,
  shipStatus = null,
}: ShipConsolePanelProps) {
  return (
    <div {...stylex.props(terminal.screen)}>
      <div {...stylex.props(terminal.panel)} role="dialog" aria-label={CONSOLE_TITLES[kind]}>
        <ConsoleBody
          kind={kind}
          systems={systems}
          sendIntent={sendIntent}
          navState={navState}
          shipStatus={shipStatus}
        />
        <div {...stylex.props(terminal.buttonCol)}>
          <button type="button" {...stylex.props(terminal.button)} onClick={onClose}>
            CLOSE [E]
          </button>
        </div>
      </div>
    </div>
  );
}

function ConsoleBody({
  kind,
  systems,
  sendIntent,
  navState,
  shipStatus,
}: {
  readonly kind: ConsoleKind;
  readonly systems: ShipSystemsBroadcast;
  readonly sendIntent: SendIntent;
  readonly navState: NavStateBroadcast | null;
  readonly shipStatus: ShipStatusBroadcast | null;
}) {
  if (kind === 'nav_console') {
    return (
      <NavConsole
        navState={navState}
        systems={systems}
        shipStatus={shipStatus}
        sendIntent={sendIntent}
      />
    );
  }
  if (kind === 'engine_console') {
    return <EngineConsole systems={systems} sendIntent={sendIntent} />;
  }
  return <ReactorConsole systems={systems} sendIntent={sendIntent} />;
}

function Bar({ pct, color }: { readonly pct: number; readonly color: string }) {
  return (
    <div {...stylex.props(bars.track)}>
      <div {...stylex.props(bars.fill)} style={{ width: `${pct}%`, backgroundColor: color }} />
    </div>
  );
}

function Stepper({
  label,
  value,
  onDown,
  onUp,
}: {
  readonly label: string;
  readonly value: string;
  readonly onDown: () => void;
  readonly onUp: () => void;
}) {
  return (
    <div {...stylex.props(terminal.sliderRow)}>
      <button type="button" {...stylex.props(terminal.button)} onClick={onDown}>
        −
      </button>
      <span {...stylex.props(terminal.sliderValue)}>
        {label} {value}
      </span>
      <button type="button" {...stylex.props(terminal.button)} onClick={onUp}>
        +
      </button>
    </div>
  );
}

function click(): void {
  ShipAudioEngine.getInstance().playUiClick();
}

function ReactorConsole({
  systems,
  sendIntent,
}: {
  readonly systems: ShipSystemsBroadcast;
  readonly sendIntent: SendIntent;
}) {
  const vm = reactorViewModel(systems);
  const tune = (rodsDelta: number, coolantDelta: number): void => {
    sendIntent({ type: 'REACTOR_TUNE', seq: 0, rodsDelta, coolantDelta });
    click();
  };
  const restart = (): void => {
    sendIntent({ type: 'REACTOR_RESTART', seq: 0 });
    click();
  };
  return (
    <div>
      <ReactorReadout vm={vm} />
      <div {...stylex.props(terminal.sectionLabel)}>CONTROL RODS</div>
      <Stepper
        label="RODS"
        value={`${vm.rodsPct}%`}
        onDown={() => tune(-0.1, 0)}
        onUp={() => tune(0.1, 0)}
      />
      <div {...stylex.props(terminal.sectionLabel)}>COOLANT FLOW</div>
      <Stepper
        label="COOLANT"
        value={`${vm.coolantPct}%`}
        onDown={() => tune(0, -0.1)}
        onUp={() => tune(0, 0.1)}
      />
      <div {...stylex.props(terminal.buttonCol)}>
        <button
          type="button"
          {...stylex.props(terminal.button, terminal.buttonPrimary)}
          disabled={!vm.restartEnabled}
          onClick={restart}
        >
          {vm.restartLabel}
        </button>
      </div>
    </div>
  );
}

function ReactorReadout({ vm }: { readonly vm: ReactorViewModel }) {
  const { status } = vm;
  return (
    <div>
      <div {...stylex.props(terminal.kicker)}>
        REACTOR {'//'} {status.toUpperCase()}
      </div>
      <div {...stylex.props(terminal.title)}>{vm.tempK} K</div>
      <div {...stylex.props(terminal.subtitle)}>
        BAND {vm.bandLo}–{vm.bandHi} K · OUT {vm.outputMW} MW / LOAD {vm.demandMW} MW
      </div>
      <Bar pct={vm.tempPct} color={STATUS_COLORS[status]} />
      {status === 'scrammed' && <div {...stylex.props(terminal.dangerTitle)}>SCRAM — BLACKOUT</div>}
      {!vm.powerOk && status !== 'scrammed' && (
        <div {...stylex.props(terminal.hint)}>OUTPUT BELOW LOAD — BROWNOUT RISK</div>
      )}
    </div>
  );
}

function EngineConsole({
  systems,
  sendIntent,
}: {
  readonly systems: ShipSystemsBroadcast;
  readonly sendIntent: SendIntent;
}) {
  const vm = engineViewModel(systems);
  const spool = (spoolCmd: 0 | 1): void => {
    sendIntent({ type: 'ENGINE_TUNE', seq: 0, spoolCmd });
    click();
  };
  const stepTune = (delta: number): void => {
    const next = Math.min(1, Math.max(0, Math.round((systems.tune + delta) * 10) / 10));
    sendIntent({
      type: 'ENGINE_TUNE',
      seq: 0,
      spoolCmd: systems.spool > 0.5 ? 1 : 0,
      tuneSet: next,
    });
    click();
  };
  return (
    <div>
      <div {...stylex.props(terminal.kicker)}>
        ENGINE {'//'} TUNE {vm.tunePct}%
      </div>
      <div {...stylex.props(terminal.title)}>SPOOL {vm.spoolPct}%</div>
      <Bar pct={vm.spoolPct} color={vm.brownout ? '#ff6b6b' : '#7ee787'} />
      {vm.brownout && <div {...stylex.props(terminal.dangerTitle)}>BROWNOUT — SPOOL STALLED</div>}
      <div {...stylex.props(terminal.sectionLabel)}>TUNE</div>
      <Stepper
        label="TUNE"
        value={`${vm.tunePct}%`}
        onDown={() => stepTune(-0.1)}
        onUp={() => stepTune(0.1)}
      />
      <div {...stylex.props(terminal.subtitle)}>WEAR {vm.wearPct}% — SERVICED DOCKED</div>
      <div {...stylex.props(terminal.buttonCol)}>
        <button
          type="button"
          {...stylex.props(terminal.button, terminal.buttonPrimary)}
          onClick={() => spool(systems.spool > 0.5 ? 0 : 1)}
        >
          {vm.spoolLabel}
        </button>
      </div>
    </div>
  );
}

function NavConsole({
  navState,
  systems,
  shipStatus,
  sendIntent,
}: {
  readonly navState: NavStateBroadcast | null;
  readonly systems: ShipSystemsBroadcast;
  readonly shipStatus: ShipStatusBroadcast | null;
  readonly sendIntent: SendIntent;
}) {
  const vm = navViewModel(navState, systems, shipStatus);
  return (
    <div>
      <NavStatus vm={vm} />
      <div {...stylex.props(terminal.sectionLabel)}>DESTINATION</div>
      <div {...stylex.props(terminal.subtitle)}>
        {vm.otherHubLabel} · ETA {vm.etaS}S
      </div>
      <NavActions vm={vm} sendIntent={sendIntent} />
    </div>
  );
}

function NavStatus({ vm }: { readonly vm: NavViewModel }) {
  return (
    <div>
      <div {...stylex.props(terminal.kicker)}>
        NAV {'//'} {vm.phase.toUpperCase()}
      </div>
      <div {...stylex.props(terminal.title)}>{vm.destLabel}</div>
      <div {...stylex.props(terminal.subtitle)}>
        AT {vm.portLabel} · FUEL {vm.fuelCells} CELL{vm.fuelCells === 1 ? '' : 'S'}
      </div>
      {isUnderwayPhase(vm.phase) && (
        <div {...stylex.props(terminal.subtitle)}>T-MINUS {vm.countdownS}S</div>
      )}
      {vm.flameout && <div {...stylex.props(terminal.dangerTitle)}>FLAMEOUT — CALL DISTRESS</div>}
    </div>
  );
}

function isUnderwayPhase(phase: string): boolean {
  return phase === 'in_transit' || phase === 'spooling' || phase === 'docking';
}

function NavActions({
  vm,
  sendIntent,
}: {
  readonly vm: NavViewModel;
  readonly sendIntent: SendIntent;
}) {
  const plot = (): void => {
    sendIntent({ type: 'NAV_PLOT', seq: 0, destHubId: vm.otherHubId });
    click();
  };
  const cancel = (): void => {
    sendIntent({ type: 'NAV_CANCEL', seq: 0 });
    click();
  };
  const distress = (): void => {
    sendIntent({ type: 'DISTRESS', seq: 0 });
    click();
  };
  return (
    <div {...stylex.props(terminal.buttonCol)}>
      <button
        type="button"
        {...stylex.props(terminal.button, terminal.buttonPrimary)}
        disabled={!vm.canPlot}
        onClick={plot}
      >
        PLOT COURSE
      </button>
      <button
        type="button"
        {...stylex.props(terminal.button)}
        disabled={!vm.canCancel}
        onClick={cancel}
      >
        CANCEL LEG
      </button>
      <button
        type="button"
        {...stylex.props(terminal.button, terminal.buttonDanger)}
        disabled={!vm.canDistress}
        onClick={distress}
      >
        DISTRESS
      </button>
    </div>
  );
}
