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
  const simulationError = extractRevertReason(simError)

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

/**
 * Extracts a short human-readable revert reason from a wagmi/viem error.
 * Returns null if there is no error.
 */
function extractRevertReason(error: Error | null | undefined): string | null {
  if (!error) return null

  const msg = error.message ?? String(error)

  // ContractFunctionRevertedError: look for "reason: ..." or quoted string
  const reasonMatch = msg.match(/reason:\s*"([^"]+)"/) ??
    msg.match(/reverted with the following reason:\s*\n\s*(.+)/) ??
    msg.match(/Error: ([^\n(]+)/)
  if (reasonMatch) return reasonMatch[1].trim()

  // Fallback: first line
  return msg.split('\n')[0].trim().slice(0, 120)
}
