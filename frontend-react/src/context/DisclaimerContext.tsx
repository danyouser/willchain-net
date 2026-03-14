/* eslint-disable react-refresh/only-export-components */
import { createContext, useContext, useState, useCallback, type ReactNode } from 'react'

interface DisclaimerContextType {
  hasAccepted: boolean
  showModal: boolean
  pendingAction: (() => void) | null
  acceptDisclaimer: () => void
  declineDisclaimer: () => void
  requireDisclaimer: (action: () => void) => void
  closeModal: () => void
}

const DisclaimerContext = createContext<DisclaimerContextType | undefined>(undefined)

const STORAGE_KEY = 'phoenix_disclaimer_accepted'

export function DisclaimerProvider({ children }: { children: ReactNode }) {
  const [hasAccepted, setHasAccepted] = useState(() => {
    try { return localStorage.getItem(STORAGE_KEY) === 'true' } catch { return false }
  })
  const [showModal, setShowModal] = useState(false)
  const [pendingAction, setPendingAction] = useState<(() => void) | null>(null)

  const acceptDisclaimer = useCallback(() => {
    try { localStorage.setItem(STORAGE_KEY, 'true') } catch { /* private browsing */ }
    setHasAccepted(true)
    setShowModal(false)
    if (pendingAction) {
      pendingAction()
      setPendingAction(null)
    }
  }, [pendingAction])

  const declineDisclaimer = useCallback(() => {
    setShowModal(false)
    setPendingAction(null)
  }, [])

  const requireDisclaimer = useCallback((action: () => void) => {
    if (hasAccepted) {
      action()
    } else {
      setPendingAction(() => action)
      setShowModal(true)
    }
  }, [hasAccepted])

  const closeModal = useCallback(() => {
    setShowModal(false)
    setPendingAction(null)
  }, [])

  return (
    <DisclaimerContext.Provider
      value={{
        hasAccepted,
        showModal,
        pendingAction,
        acceptDisclaimer,
        declineDisclaimer,
        requireDisclaimer,
        closeModal,
      }}
    >
      {children}
    </DisclaimerContext.Provider>
  )
}

export function useDisclaimer() {
  const context = useContext(DisclaimerContext)
  if (context === undefined) {
    throw new Error('useDisclaimer must be used within a DisclaimerProvider')
  }
  return context
}
