import { useNotification } from '../../context/NotificationContext'
import { useModalA11y } from '../../hooks/useModalA11y'

export function NotificationModal() {
  const { notification, hideNotification } = useNotification()
  const modalRef = useModalA11y(!!notification, hideNotification)

  if (!notification) return null

  const iconContent = {
    success: (
      <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
        <polyline points="20 6 9 17 4 12" />
      </svg>
    ),
    error: (
      <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
        <line x1="18" y1="6" x2="6" y2="18" />
        <line x1="6" y1="6" x2="18" y2="18" />
      </svg>
    ),
    warning: (
      <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
        <path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z" />
        <line x1="12" y1="9" x2="12" y2="13" />
        <line x1="12" y1="17" x2="12.01" y2="17" />
      </svg>
    ),
  }

  return (
    <div className="modal" ref={modalRef} role="dialog" aria-modal="true" aria-labelledby="notification-modal-title">
      <div className="modal-overlay" onClick={hideNotification} aria-hidden="true" />
      <div className="modal-content modal-notification">
        <div className={`notification-icon ${notification.type}`} aria-hidden="true">
          {iconContent[notification.type]}
        </div>
        <h3 id="notification-modal-title">{notification.title}</h3>
        <p>{notification.message}</p>
        {notification.tip && <p className="notification-tip">{notification.tip}</p>}
        <button className="btn btn-primary" onClick={hideNotification}>
          OK
        </button>
      </div>
    </div>
  )
}
