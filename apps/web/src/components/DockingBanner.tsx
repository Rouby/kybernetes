import type {
  CaptainJobOfferBroadcast,
  HireableJob,
  JobAssignedBroadcast,
  ShipDockingUpdateBroadcast,
  TransitUpdateBroadcast,
} from '@kybernetes/protocol';
import { hudColors } from '@kybernetes/ui-tokens/tokens.stylex';
import * as stylex from '@stylexjs/stylex';
import { IntroHireModal } from './IntroHireModal';

const styles = stylex.create({
  introBanner: {
    position: 'absolute',
    pointerEvents: 'none',
    top: 215,
    left: 72,
    display: 'flex',
    alignItems: 'center',
    gap: 12,
    paddingTop: 8,
    paddingBottom: 8,
    paddingLeft: 16,
    paddingRight: 16,
    backgroundColor: hudColors.bgPanel,
    borderWidth: 1,
    borderStyle: 'solid',
    borderColor: hudColors.borderBright,
    borderRadius: 4,
    zIndex: 500,
    fontSize: 12,
    color: hudColors.textPrimary,
  },
  introButton: {
    pointerEvents: 'auto',
    paddingTop: 6,
    paddingBottom: 6,
    paddingLeft: 12,
    paddingRight: 12,
    backgroundColor: hudColors.cyanDim,
    color: hudColors.textPrimary,
    borderWidth: 1,
    borderStyle: 'solid',
    borderColor: hudColors.cyanTelemetry,
    borderRadius: 4,
    cursor: 'pointer',
    fontSize: 12,
    fontWeight: 700,
  },
});

interface DockingBannerProps {
  docking: ShipDockingUpdateBroadcast | null;
  jobOffer: CaptainJobOfferBroadcast | null;
  jobAssigned: JobAssignedBroadcast | null;
  transit: TransitUpdateBroadcast | null;
  onTalkToCaptain: () => void;
  onAcceptJob: (offerId: string, job: HireableJob) => void;
}

export function DockingBanner({
  docking,
  jobOffer,
  jobAssigned,
  transit,
  onTalkToCaptain,
  onAcceptJob,
}: DockingBannerProps) {
  return (
    <>
      {docking && (
        <div {...stylex.props(styles.introBanner)} data-testid="docking-banner">
          <span>
            {docking.shipName} [{docking.phase.toUpperCase()}]{' '}
            {docking.phase === 'inbound'
              ? 'ETA ' + Math.ceil(docking.etaSeconds) + 's'
              : '-> ' + docking.destination}
            {jobAssigned ? ' | Signed on: ' + jobAssigned.title : ''}
            {transit ? ' | Transit ' + Math.floor(transit.progressPercent) + '%' : ''}
          </span>
          {docking.phase === 'docked' && !jobOffer && !jobAssigned && (
            <button {...stylex.props(styles.introButton)} type="button" onClick={onTalkToCaptain}>
              TALK TO CAPTAIN (E)
            </button>
          )}
        </div>
      )}
      {jobOffer && (
        <IntroHireModal offer={jobOffer} onAccept={(job) => onAcceptJob(jobOffer.offerId, job)} />
      )}
    </>
  );
}
