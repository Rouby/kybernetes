import { generateBeaconCode, isValidBeaconCode } from '@kybernetes/sim-core';
import { hudColors } from '@kybernetes/ui-tokens/tokens.stylex';
import * as stylex from '@stylexjs/stylex';
import { Compass, Flame, Radio, RefreshCw, Rocket, Users } from 'lucide-react';
import type React from 'react';
import { useState } from 'react';

const styles = stylex.create({
  container: {
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: '100vh',
    width: '100vw',
    backgroundColor: hudColors.bgVoid,
    color: hudColors.textPrimary,
    padding: '24px 16px',
    boxSizing: 'border-box',
    overflowY: 'auto',
  },
  innerWrapper: {
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    width: '100%',
    maxWidth: 760,
    gap: 28,
  },
  headerGroup: {
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    textAlign: 'center',
    gap: 8,
  },
  logoRow: {
    display: 'flex',
    alignItems: 'center',
    gap: 12,
  },
  mainTitle: {
    fontSize: 32,
    fontWeight: 900,
    letterSpacing: 4,
    color: hudColors.cyanTelemetry,
    margin: 0,
    textShadow: '0 0 20px rgba(0, 229, 255, 0.4)',
  },
  subtitle: {
    fontSize: 12,
    letterSpacing: 2,
    color: hudColors.textSecondary,
    fontFamily: 'monospace',
    margin: 0,
  },
  actionCardsGrid: {
    display: 'grid',
    gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))',
    gap: 20,
    width: '100%',
  },
  actionCard: {
    backgroundColor: hudColors.bgPanel,
    borderWidth: 1,
    borderStyle: 'solid',
    borderColor: hudColors.borderDim,
    borderRadius: 6,
    padding: 24,
    display: 'flex',
    flexDirection: 'column',
    justifyContent: 'space-between',
    gap: 20,
    boxShadow: '0 8px 32px rgba(0, 0, 0, 0.5)',
  },
  actionCardHeader: {
    display: 'flex',
    flexDirection: 'column',
    gap: 8,
  },
  actionTitle: {
    fontSize: 16,
    fontWeight: 700,
    letterSpacing: 1.5,
    color: hudColors.textPrimary,
    margin: 0,
    display: 'flex',
    alignItems: 'center',
    gap: 10,
  },
  actionDesc: {
    fontSize: 12,
    color: hudColors.textSecondary,
    lineHeight: 1.6,
    margin: 0,
  },
  startBtn: {
    padding: '14px 20px',
    backgroundColor: 'rgba(0, 255, 102, 0.15)',
    borderWidth: 1,
    borderStyle: 'solid',
    borderColor: hudColors.phosphorGreen,
    borderRadius: 3,
    color: hudColors.phosphorGreen,
    fontSize: 12,
    fontWeight: 700,
    letterSpacing: 2,
    cursor: 'pointer',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 10,
    textTransform: 'uppercase',
  },
  joinBtn: {
    padding: '14px 20px',
    backgroundColor: 'rgba(0, 229, 255, 0.15)',
    borderWidth: 1,
    borderStyle: 'solid',
    borderColor: hudColors.cyanTelemetry,
    borderRadius: 3,
    color: hudColors.cyanTelemetry,
    fontSize: 12,
    fontWeight: 700,
    letterSpacing: 2,
    cursor: 'pointer',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 10,
    textTransform: 'uppercase',
  },
  beaconInputRow: {
    display: 'flex',
    gap: 8,
  },
  beaconInput: {
    flex: 1,
    padding: '10px 14px',
    backgroundColor: hudColors.bgPanelLighter,
    borderWidth: 1,
    borderStyle: 'solid',
    borderColor: hudColors.borderDim,
    borderRadius: 3,
    color: hudColors.cyanTelemetry,
    fontSize: 15,
    fontFamily: 'monospace',
    letterSpacing: 2,
    outline: 'none',
  },
  randomBtn: {
    padding: '10px 14px',
    backgroundColor: 'rgba(255, 176, 0, 0.1)',
    borderWidth: 1,
    borderStyle: 'solid',
    borderColor: hudColors.amberTelemetry,
    borderRadius: 3,
    color: hudColors.amberTelemetry,
    cursor: 'pointer',
    display: 'flex',
    alignItems: 'center',
    gap: 6,
    fontSize: 11,
    fontWeight: 700,
  },
  quickBoardCard: {
    width: '100%',
    display: 'flex',
    justifyContent: 'center',
    marginTop: 4,
  },
  quickBoardBtn: {
    padding: '12px 24px',
    backgroundColor: 'rgba(255, 176, 0, 0.12)',
    borderWidth: 1,
    borderStyle: 'solid',
    borderColor: hudColors.amberTelemetry,
    borderRadius: 3,
    color: hudColors.amberTelemetry,
    fontSize: 11,
    fontWeight: 700,
    letterSpacing: 2,
    cursor: 'pointer',
    display: 'flex',
    alignItems: 'center',
    gap: 8,
  },
  errorText: {
    color: hudColors.alertRed,
    fontSize: 11,
    margin: 0,
  },
  footer: {
    fontSize: 10,
    color: hudColors.textMuted,
    fontFamily: 'monospace',
    letterSpacing: 1,
  },
});

export interface MainMenuProps {
  onCommissionVessel: (beacon: string) => void;
  onBoardVessel: (beacon: string) => void;
  onQuickBoard?: (beacon: string) => void;
  initialBeacon?: string;
  isE2E?: boolean;
}

export const MainMenu: React.FC<MainMenuProps> = ({
  onCommissionVessel,
  onBoardVessel,
  onQuickBoard,
  initialBeacon = 'HESP01',
  isE2E = false,
}) => {
  const [beacon, setBeacon] = useState(initialBeacon);
  const [error, setError] = useState<string | null>(null);

  const handleStartShip = () => {
    const newCode = generateBeaconCode();
    onCommissionVessel(newCode);
  };

  const handleJoinShip = () => {
    const cleanBeacon = beacon.trim().toUpperCase();
    if (!isValidBeaconCode(cleanBeacon)) {
      setError('Subspace Beacon must be 6 alphanumeric characters (e.g. HESP01)');
      return;
    }
    setError(null);
    onBoardVessel(cleanBeacon);
  };

  const handleQuickBoard = () => {
    if (onQuickBoard) {
      onQuickBoard('HESP01');
    } else {
      onBoardVessel('HESP01');
    }
  };

  return (
    <div {...stylex.props(styles.container)} data-testid="main-menu">
      <div {...stylex.props(styles.innerWrapper)}>
        {/* Header */}
        <div {...stylex.props(styles.headerGroup)}>
          <div {...stylex.props(styles.logoRow)}>
            <Rocket size={32} color={hudColors.cyanTelemetry} />
            <h1 {...stylex.props(styles.mainTitle)}>KYBERNETES</h1>
          </div>
          <p {...stylex.props(styles.subtitle)}>
            AUTHORITATIVE MULTI-CREW VESSEL SIMULATION • FLEET PROTOCOL
          </p>
        </div>

        {/* Action Cards: Start Ship vs Join Existing */}
        <div {...stylex.props(styles.actionCardsGrid)}>
          {/* Option 1: Start New Ship */}
          <div {...stylex.props(styles.actionCard)}>
            <div {...stylex.props(styles.actionCardHeader)}>
              <h3 {...stylex.props(styles.actionTitle)}>
                <Flame size={20} color={hudColors.phosphorGreen} />
                <span>START NEW SHIP</span>
              </h3>
              <p {...stylex.props(styles.actionDesc)}>
                Commission an authoritative vessel instance with a fresh subspace beacon code and
                proceed to operator dossier specification.
              </p>
            </div>

            <button
              type="button"
              {...stylex.props(styles.startBtn)}
              data-testid="start-ship-btn"
              onClick={handleStartShip}
            >
              <Rocket size={16} />
              <span>COMMISSION NEW VESSEL</span>
            </button>
          </div>

          {/* Option 2: Join Existing Ship */}
          <div {...stylex.props(styles.actionCard)}>
            <div {...stylex.props(styles.actionCardHeader)}>
              <h3 {...stylex.props(styles.actionTitle)}>
                <Compass size={20} color={hudColors.cyanTelemetry} />
                <span>JOIN EXISTING SHIP</span>
              </h3>
              <p {...stylex.props(styles.actionDesc)}>
                Tune translocator to an active 6-character Subspace Beacon code to board a vessel
                with connected crewmates.
              </p>
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              <div {...stylex.props(styles.beaconInputRow)}>
                <input
                  {...stylex.props(styles.beaconInput)}
                  data-testid="menu-beacon-input"
                  value={beacon}
                  onChange={(e) => {
                    setBeacon(e.target.value.toUpperCase());
                    setError(null);
                  }}
                  maxLength={6}
                  placeholder="HESP01"
                />
                <button
                  type="button"
                  {...stylex.props(styles.randomBtn)}
                  onClick={() => setBeacon(generateBeaconCode())}
                  title="Generate new frequency"
                >
                  <RefreshCw size={13} />
                  <span>RANDOM</span>
                </button>
              </div>

              {error && <p {...stylex.props(styles.errorText)}>{error}</p>}

              <button
                type="button"
                {...stylex.props(styles.joinBtn)}
                data-testid="join-ship-btn"
                onClick={handleJoinShip}
              >
                <Users size={16} />
                <span>BOARD VESSEL</span>
              </button>
            </div>
          </div>
        </div>

        {/* Option 3: Quick Fleet Board (Only displayed in E2E tests per requirements) */}
        {isE2E && (
          <div {...stylex.props(styles.quickBoardCard)}>
            <button
              type="button"
              {...stylex.props(styles.quickBoardBtn)}
              data-testid="quick-board-btn"
              onClick={handleQuickBoard}
            >
              <Radio size={14} />
              <span>QUICK BOARD [CSS HESPERIA — HESP01]</span>
            </button>
          </div>
        )}

        <footer {...stylex.props(styles.footer)}>
          TURBOREPO • REACT 19 • NODE 24 • WEBSOCKET DAEMON • STYLEX
        </footer>
      </div>
    </div>
  );
};
