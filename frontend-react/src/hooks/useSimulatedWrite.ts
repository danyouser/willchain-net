import { useTranslation } from 'react-i18next'
import { useSimulateContract, useWriteContract, useWaitForTransactionReceipt } from 'wagmi'

type UseSimulatedWriteParams = {
  address: `0x${string}`
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  abi: any
  functionName: string
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  args?: readonly any[]
  chainId?: number
  /** Set to false to skip simulation (e.g. when args are incomplete / address not entered yet) */
  enabled?: boolean
}

/**
 * Fail-closed write hook: runs eth_call simulation before every write.
 *
 * If simulation reverts:
 *   - `simulationError` contains the revert reason string
 *   - `canWrite` is false — button should be disabled
 *
 * If simulation passes:
 *   - `canWrite` is true
 *   - `write()` sends the actual transaction
 *
 * Why: eliminates the entire class of "UI thinks the action is valid but contract reverts"
 * errors. The user sees a human-readable error message before the wallet prompt appears.
 */
export function useSimulatedWrite(params: UseSimulatedWriteParams) {
  const { address, abi, functionName, args, chainId, enabled = true } = params
  const { t } = useTranslation()

  const {
    error: simError,
    isLoading: isSimulating,
  } = useSimulateContract({
    address,
    abi,
    functionName,
    args,
    chainId,
    query: { enabled },
  })

  const {
    writeContract,
    data: hash,
    isPending,
    reset,
  } = useWriteContract()

  const { isLoading: isConfirming, isSuccess } = useWaitForTransactionReceipt({ hash })

  // Extract human-readable revert message from wagmi/viem error
  const rawError = extractRevertReason(simError)
  // Translate known contract errors via i18n (fallback to raw label)
  const simulationError = rawError
    ? t(`contract_error.${rawError}`, rawError)
    : null

  const canWrite = enabled && !simError && !isSimulating

  function write() {
    writeContract({
      address,
      abi,
      functionName,
      args,
      chainId,
    })
  }

  return {
    write,
    hash,
    isPending,
    isConfirming,
    isSuccess,
    reset,
    isSimulating,
    simulationError,
    canWrite,
  }
}

// Map custom error 4-byte selectors to human-readable labels.
// Generated via: cast sig "ErrorName()"
const CUSTOM_ERROR_LABELS: Record<string, string> = {
  '0x0a16c847': 'NotDesignatedSuccessor',
  '0x99e97a97': 'InvalidSuccessorAddress',
  '0x6b844c93': 'CannotDesignateSelf',
  '0x5f234cb1': 'CannotDesignateContract',
  '0x6b5a84ae': 'CircularSuccessorChain',
  '0x306a9155': 'InvalidInactivityPeriod',
  '0xcf458f24': 'DataHashCannotBeZero',
  '0xc86f4ee8': 'NodeStillActive',
  '0x35b2486f': 'NodeAlreadyAbandoned',
  '0x5e120986': 'ClaimAlreadyInitiated',
  '0x542e5b94': 'NoActiveClaimToCancel',
  '0xccf67655': 'ClaimNotInitiated',
  '0xb62b15c7': 'VetoPeriodNotEnded',
  '0x82a49d9e': 'ClaimExpired',
  '0x3b9d1df4': 'NoTokensToTransfer',
  '0x784e9f02': 'FlashloanPrevention',
  '0x8eb843b7': 'NodeNotAbandoned',
  '0x0c3de3ed': 'NoTokensToRecycle',
  '0xaba47339': 'NotRegistered',
  '0x6089d401': 'NoDividendsToClaim',
  '0x82b42900': 'Unauthorized',
  '0xc8cddb24': 'OwnershipRenouncementDisabled',
}

/**
 * Extracts a short human-readable revert reason from a wagmi/viem error.
 * Returns null if there is no error.
 */
function extractRevertReason(error: Error | null | undefined): string | null {
  if (!error) return null

  const msg = error.message ?? String(error)

  // Custom error selectors: "reverted with the following signature: 0xb898ff52"
  const sigMatch = msg.match(/following signature:\s*(0x[0-9a-fA-F]{8})/)
  if (sigMatch) {
    const label = CUSTOM_ERROR_LABELS[sigMatch[1].toLowerCase()]
    if (label) return label
  }

  // ContractFunctionRevertedError: look for "reason: ..." or quoted string
  const reasonMatch = msg.match(/reason:\s*"([^"]+)"/) ??
    msg.match(/reverted with the following reason:\s*\n\s*(.+)/) ??
    msg.match(/Error: ([^\n(]+)/)
  if (reasonMatch) return reasonMatch[1].trim()

  // Fallback: first line
  return msg.split('\n')[0].trim().slice(0, 120)
}
