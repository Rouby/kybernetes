import type { CaptainJobOfferBroadcast, HireableJob } from '@kybernetes/protocol';
import { hudColors } from '@kybernetes/ui-tokens/tokens.stylex';
import * as stylex from '@stylexjs/stylex';

const styles = stylex.create({
  overlay: {
    position: 'fixed',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 1000,
  },
  modal: {
    position: 'relative',
    zIndex: 1,
    width: 560,
    maxWidth: '92vw',
    backgroundColor: hudColors.bgPanel,
    borderWidth: 1,
    borderStyle: 'solid',
    borderColor: hudColors.borderBright,
    borderRadius: 4,
    padding: 24,
    display: 'flex',
    flexDirection: 'column',
    gap: 16,
  },
  title: {
    fontSize: 16,
    fontWeight: 700,
    letterSpacing: 1.5,
    color: hudColors.cyanTelemetry,
  },
  subtitle: {
    fontSize: 12,
    color: hudColors.textSecondary,
    lineHeight: 1.4,
  },
  cards: {
    display: 'flex',
    gap: 12,
  },
  card: {
    flex: 1,
    padding: 12,
    backgroundColor: hudColors.bgPanelLighter,
    borderWidth: 1,
    borderStyle: 'solid',
    borderColor: hudColors.borderDim,
    borderRadius: 4,
    display: 'flex',
    flexDirection: 'column',
    gap: 8,
  },
  cardTitle: {
    fontSize: 14,
    fontWeight: 700,
    color: hudColors.textPrimary,
  },
  cardDept: {
    fontSize: 11,
    color: hudColors.textSecondary,
  },
  cardDesc: {
    fontSize: 12,
    color: hudColors.textSecondary,
    lineHeight: 1.4,
  },
  acceptButton: {
    marginTop: 4,
    paddingTop: 8,
    paddingBottom: 8,
    backgroundColor: hudColors.phosphorGreenDim,
    color: hudColors.textPrimary,
    borderWidth: 1,
    borderStyle: 'solid',
    borderColor: hudColors.phosphorGreen,
    borderRadius: 4,
    cursor: 'pointer',
    fontSize: 13,
    fontWeight: 700,
  },
});

interface IntroHireModalProps {
  offer: CaptainJobOfferBroadcast;
  onAccept: (job: HireableJob) => void;
}

export function IntroHireModal({ offer, onAccept }: IntroHireModalProps) {
  return (
    <div {...stylex.props(styles.overlay)} role="dialog" aria-label="Captain job offer">
      <div {...stylex.props(styles.modal)}>
        <div {...stylex.props(styles.title)}>{offer.captainName}: PICK YOUR DUTY</div>
        <div {...stylex.props(styles.subtitle)}>
          The ship departs once you sign on. Choose one of the two open billets.
        </div>
        <div {...stylex.props(styles.cards)}>
          {offer.jobs.map((job) => (
            <div key={job.job} {...stylex.props(styles.card)}>
              <div {...stylex.props(styles.cardTitle)}>{job.title}</div>
              <div {...stylex.props(styles.cardDept)}>
                {job.department} [{job.badge}]
              </div>
              <div {...stylex.props(styles.cardDesc)}>{job.description}</div>
              <button
                {...stylex.props(styles.acceptButton)}
                type="button"
                aria-label={'Sign on as ' + job.title}
                onClick={() => onAccept(job.job)}
              >
                SIGN ON
              </button>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
