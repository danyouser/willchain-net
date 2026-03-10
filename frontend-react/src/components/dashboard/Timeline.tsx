import { useTranslation } from 'react-i18next'
import { GRACE_PERIOD_SECONDS, CLAIM_PERIOD_SECONDS } from '../../config/contract'

interface TimelineProps {
  lastActivity: number
  inactivityPeriod: number
  timeUntilInactive: number
  timeUntilAbandoned: number
  embedded?: boolean
}

export function Timeline({
  lastActivity,
  inactivityPeriod,
  timeUntilInactive,
  timeUntilAbandoned,
  embedded = false,
}: TimelineProps) {
  const { t } = useTranslation()

  const formatDate = (timestamp: number) => {
    if (timestamp === 0) return t('timeline.never')
    return new Date(timestamp * 1000).toLocaleDateString()
  }

  const formatDays = (seconds: number) => Math.floor(seconds / 86400)

  // eslint-disable-next-line react-hooks/purity
  const now = Math.floor(Date.now() / 1000)
  const inactiveDate = lastActivity + inactivityPeriod
  const graceEndDate = inactiveDate + GRACE_PERIOD_SECONDS
  const claimEndDate = graceEndDate + CLAIM_PERIOD_SECONDS

  // Which step is the current "active" phase (0-based)
  // 0 = ACTIVE (timer running), 1 = GRACE, 2 = CLAIMABLE, 3 = ABANDONED
  const currentPhase =
    now >= claimEndDate ? 3
    : now >= graceEndDate ? 2
    : now >= inactiveDate ? 1
    : 0

  const steps = [
    {
      label: t('timeline.last_activity'),
      sub: formatDate(lastActivity),
      color: 'blue',
      icon: <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><polyline points="20 6 9 17 4 12"/></svg>,
    },
    {
      label: t('timeline.inactive'),
      sub: currentPhase === 0
        ? t('timeline.in_days', { days: formatDays(timeUntilInactive) })
        : formatDate(inactiveDate),
      color: 'amber',
      icon: <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>,
    },
    {
      label: t('timeline.grace_ends'),
      sub: formatDate(graceEndDate),
      color: 'amber',
      icon: <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/></svg>,
    },
    {
      label: t('timeline.abandoned'),
      sub: timeUntilAbandoned > 0
        ? t('timeline.in_days', { days: formatDays(timeUntilAbandoned) })
        : formatDate(claimEndDate),
      color: 'red',
      icon: <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><circle cx="12" cy="12" r="10"/><line x1="4.93" y1="4.93" x2="19.07" y2="19.07"/></svg>,
    },
  ]

  const inner = (
    <div className="tl-track">
      {/* background line */}
      <div className="tl-line-bg" />
      {/* filled line: width proportional to currentPhase */}
      <div
        className="tl-line-fill"
        style={{ width: `${(currentPhase / (steps.length - 1)) * 100}%` }}
      />
      <div className="tl-steps">
        {steps.map((step, i) => {
          const isDone    = i < currentPhase
          const isCurrent = i === currentPhase
          const isFuture  = i > currentPhase
          return (
            <div key={i} className={`tl-step${isFuture ? ' tl-step--future' : ''}`}>
              <div className={[
                'tl-dot2',
                isDone    ? 'tl-dot2--done'    : '',
                isCurrent ? `tl-dot2--current tl-dot2--${step.color}` : '',
                isFuture  ? 'tl-dot2--future'  : '',
              ].filter(Boolean).join(' ')}>
                {step.icon}
              </div>
              <div className="tl-label2">
                <strong>{step.label}</strong>
                <span>{step.sub}</span>
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )

  if (embedded) return inner

  return (
    <div className="card card-wide">
      <h3>{t('timeline.dashboard_title')}</h3>
      {inner}
    </div>
  )
}
