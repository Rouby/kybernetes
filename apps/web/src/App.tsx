import type { TelemetryDeltaBroadcast } from '@kybernetes/protocol';
import { createInitialPlayerVitals, createInitialVesselState } from '@kybernetes/sim-core';
import { hudColors } from '@kybernetes/ui-tokens/tokens.stylex';
import * as stylex from '@stylexjs/stylex';
import { Coffee, Flame, Moon, Radio, Shield, Utensils, Wind } from 'lucide-react';
import type React from 'react';
import { useState } from 'react';

const styles = stylex.create({
  container: {
    display: 'flex',
    flexDirection: 'column',
    width: '100vw',
    height: '100vh',
    backgroundColor: hudColors.bgVoid,
    color: hudColors.textPrimary,
  },
  header: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: '8px 16px',
    backgroundColor: hudColors.bgPanel,
    borderBottomWidth: 1,
    borderBottomStyle: 'solid',
    borderBottomColor: hudColors.borderDim,
  },
  logoGroup: {
    display: 'flex',
    alignItems: 'center',
    gap: 12,
  },
  title: {
    fontSize: 16,
    fontWeight: 700,
    letterSpacing: 2,
    color: hudColors.cyanTelemetry,
  },
  badge: {
    fontSize: 11,
    padding: '2px 6px',
    borderRadius: 2,
    backgroundColor: hudColors.borderDim,
    color: hudColors.amberTelemetry,
    borderWidth: 1,
    borderStyle: 'solid',
    borderColor: hudColors.amberDim,
  },
  mainLayout: {
    display: 'flex',
    flex: 1,
    overflow: 'hidden',
  },
  leftPanel: {
    width: 280,
    backgroundColor: hudColors.bgPanel,
    borderRightWidth: 1,
    borderRightStyle: 'solid',
    borderRightColor: hudColors.borderDim,
    padding: 16,
    display: 'flex',
    flexDirection: 'column',
    gap: 16,
  },
  centerViewport: {
    flex: 1,
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    justifyContent: 'center',
    position: 'relative',
    backgroundColor: '#040609',
  },
  rightPanel: {
    width: 320,
    backgroundColor: hudColors.bgPanel,
    borderLeftWidth: 1,
    borderLeftStyle: 'solid',
    borderLeftColor: hudColors.borderDim,
    padding: 16,
    display: 'flex',
    flexDirection: 'column',
    gap: 16,
  },
  panelTitle: {
    fontSize: 12,
    letterSpacing: 1.5,
    textTransform: 'uppercase',
    color: hudColors.textSecondary,
    borderBottomWidth: 1,
    borderBottomStyle: 'solid',
    borderBottomColor: hudColors.borderDim,
    paddingBottom: 4,
    marginBottom: 8,
  },
  statRow: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 8,
    fontSize: 13,
  },
  progressBarBg: {
    width: '100%',
    height: 6,
    backgroundColor: hudColors.borderDim,
    borderRadius: 3,
    overflow: 'hidden',
    marginTop: 4,
  },
  progressBarFill: {
    height: '100%',
    borderRadius: 3,
    transition: 'width 0.2s ease',
  },
  button: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    padding: '8px 12px',
    backgroundColor: hudColors.bgPanelLighter,
    color: hudColors.textPrimary,
    borderWidth: 1,
    borderStyle: 'solid',
    borderColor: hudColors.borderBright,
    borderRadius: 2,
    fontSize: 12,
    cursor: 'pointer',
    marginTop: 6,
    ':hover': {
      borderColor: hudColors.cyanTelemetry,
      color: hudColors.cyanTelemetry,
    },
  },
  canvasPlaceholder: {
    width: '90%',
    height: '90%',
    borderWidth: 1,
    borderStyle: 'dashed',
    borderColor: hudColors.borderBright,
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 16,
  },
  footer: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: '6px 16px',
    backgroundColor: hudColors.bgPanel,
    borderTopWidth: 1,
    borderTopStyle: 'solid',
    borderTopColor: hudColors.borderDim,
    fontSize: 11,
    color: hudColors.textMuted,
  },
  onlineIndicator: {
    display: 'inline-block',
    width: 8,
    height: 8,
    borderRadius: '50%',
    backgroundColor: hudColors.phosphorGreen,
    marginRight: 6,
  },
});

export const App: React.FC = () => {
  const [telemetry] = useState<TelemetryDeltaBroadcast>(() => ({
    type: 'TELEMETRY_DELTA',
    timestamp: Date.now(),
    ...createInitialVesselState(),
  }));

  const [vitals, setVitals] = useState(createInitialPlayerVitals);

  return (
    <div {...stylex.props(styles.container)}>
      {/* Top Header */}
      <header {...stylex.props(styles.header)}>
        <div {...stylex.props(styles.logoGroup)}>
          <span {...stylex.props(styles.title)}>KYBERNETES</span>
          <span {...stylex.props(styles.badge)}>VESSEL: {telemetry.shipName}</span>
          <span {...stylex.props(styles.badge)}>RANK: WIPER (GRADE 3)</span>
        </div>
        <div {...stylex.props(styles.logoGroup)}>
          <span {...stylex.props(styles.badge)}>CLEARANCE: LVL 1</span>
          <span {...stylex.props(styles.badge)}>CREDITS: 120 ¢</span>
        </div>
      </header>

      {/* Main Viewport */}
      <main {...stylex.props(styles.mainLayout)}>
        {/* Left Rail: Vitals & Survival */}
        <aside {...stylex.props(styles.leftPanel)}>
          <div {...stylex.props(styles.panelTitle)}>Crew Vitals</div>

          <div>
            <div {...stylex.props(styles.statRow)}>
              <span>
                <Utensils size={14} style={{ verticalAlign: 'middle', marginRight: 4 }} /> Nutrition
              </span>
              <span>{Math.round(vitals.hunger)}%</span>
            </div>
            <div {...stylex.props(styles.progressBarBg)}>
              <div
                {...stylex.props(styles.progressBarFill)}
                style={{ width: `${vitals.hunger}%`, backgroundColor: '#ffb000' }}
              />
            </div>
            <button
              {...stylex.props(styles.button)}
              onClick={() => setVitals((v) => ({ ...v, hunger: Math.min(100, v.hunger + 25) }))}
            >
              Consume Paste (+25%)
            </button>
          </div>

          <div>
            <div {...stylex.props(styles.statRow)}>
              <span>
                <Coffee size={14} style={{ verticalAlign: 'middle', marginRight: 4 }} /> Hydration
              </span>
              <span>{Math.round(vitals.thirst)}%</span>
            </div>
            <div {...stylex.props(styles.progressBarBg)}>
              <div
                {...stylex.props(styles.progressBarFill)}
                style={{ width: `${vitals.thirst}%`, backgroundColor: '#00e5ff' }}
              />
            </div>
            <button
              {...stylex.props(styles.button)}
              onClick={() => setVitals((v) => ({ ...v, thirst: Math.min(100, v.thirst + 30) }))}
            >
              Drink Water (+30%)
            </button>
          </div>

          <div>
            <div {...stylex.props(styles.statRow)}>
              <span>
                <Moon size={14} style={{ verticalAlign: 'middle', marginRight: 4 }} /> Fatigue
              </span>
              <span>{Math.round(vitals.fatigue)}%</span>
            </div>
            <div {...stylex.props(styles.progressBarBg)}>
              <div
                {...stylex.props(styles.progressBarFill)}
                style={{ width: `${vitals.fatigue}%`, backgroundColor: '#ff2244' }}
              />
            </div>
            <button
              {...stylex.props(styles.button)}
              onClick={() => setVitals((v) => ({ ...v, fatigue: Math.max(0, v.fatigue - 40) }))}
            >
              Rest in Bunk (-40%)
            </button>
          </div>
        </aside>

        {/* Center: 2D Canvas Viewport */}
        <section {...stylex.props(styles.centerViewport)}>
          <div {...stylex.props(styles.canvasPlaceholder)}>
            <Radio size={36} color="#00e5ff" />
            <div style={{ textAlign: 'center' }}>
              <p style={{ fontWeight: 600, letterSpacing: 1 }}>2D TOP-DOWN VESSEL VIEWPORT</p>
              <p style={{ fontSize: 12, color: '#8a9bb5', marginTop: 4 }}>
                WASD controls active • Use [E] to dock at consoles • Dynamic LoS & Fog of War
              </p>
            </div>
          </div>
        </section>

        {/* Right Rail: Subsystem Telemetry */}
        <aside {...stylex.props(styles.rightPanel)}>
          <div {...stylex.props(styles.panelTitle)}>Telemetry & Subsystems</div>

          <div>
            <div {...stylex.props(styles.statRow)}>
              <span>
                <Flame size={14} style={{ verticalAlign: 'middle', marginRight: 4 }} /> Reactor
                Thermal
              </span>
              <span>{telemetry.reactorTemp} K</span>
            </div>
            <div {...stylex.props(styles.progressBarBg)}>
              <div
                {...stylex.props(styles.progressBarFill)}
                style={{
                  width: `${(telemetry.reactorTemp / telemetry.reactorMaxTemp) * 100}%`,
                  backgroundColor: '#ffb000',
                }}
              />
            </div>
          </div>

          <div>
            <div {...stylex.props(styles.statRow)}>
              <span>
                <Wind size={14} style={{ verticalAlign: 'middle', marginRight: 4 }} /> Atmosphere O2
              </span>
              <span>{telemetry.oxygenLevelPercent}%</span>
            </div>
            <div {...stylex.props(styles.progressBarBg)}>
              <div
                {...stylex.props(styles.progressBarFill)}
                style={{
                  width: `${telemetry.oxygenLevelPercent}%`,
                  backgroundColor: '#00ff66',
                }}
              />
            </div>
          </div>

          <div>
            <div {...stylex.props(styles.statRow)}>
              <span>
                <Shield size={14} style={{ verticalAlign: 'middle', marginRight: 4 }} /> Hull
                Plating
              </span>
              <span>{telemetry.hullIntegrityPercent}%</span>
            </div>
            <div {...stylex.props(styles.progressBarBg)}>
              <div
                {...stylex.props(styles.progressBarFill)}
                style={{
                  width: `${telemetry.hullIntegrityPercent}%`,
                  backgroundColor: '#00e5ff',
                }}
              />
            </div>
          </div>
        </aside>
      </main>

      {/* Footer */}
      <footer {...stylex.props(styles.footer)}>
        <div>
          <span {...stylex.props(styles.onlineIndicator)} />
          <span>VESSEL DAEMON: SYNCED (10 Hz)</span>
        </div>
        <div>
          <span>TURBOREPO MONOREPO • REACT 19 • STYLEX • TS 7 • VITE 8</span>
        </div>
      </footer>
    </div>
  );
};
