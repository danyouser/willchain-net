import { useReadContract } from 'wagmi'
import { CONTRACT_ADDRESS, WILLCHAIN_ABI } from '../config/contract'
import { CHAIN_ID } from '../config/wagmi'

export function useNodeState(address: `0x${string}` | undefined) {
  const { data, isLoading, isError, error, refetch } = useReadContract({
    address: CONTRACT_ADDRESS,
    abi: WILLCHAIN_ABI,
    functionName: 'getNodeState',
    chainId: CHAIN_ID,
    args: address ? [address] : undefined,
    query: {
      enabled: !!address,
      refetchInterval: 30_000, // poll every 30 seconds so UI stays fresh without page reload
    },
  })

  if (!data) {
    return {
      nodeState: null,
      isLoading,
      isError,
      error,
      refetch,
    }
  }

  const [
    lastActivityTimestamp,
    designatedSuccessor,
    successorClaimInitiated,
    claimInitiationTimestamp,
    timeUntilInactive,
    timeUntilAbandoned,
    isActive,
    serviceTier,
    inactivityPeriod,
  ] = data

  return {
    nodeState: {
      lastActivityTimestamp: Number(lastActivityTimestamp),
      designatedSuccessor,
      successorClaimInitiated,
      claimInitiationTimestamp: Number(claimInitiationTimestamp),
      timeUntilInactive: Number(timeUntilInactive),
      timeUntilAbandoned: Number(timeUntilAbandoned),
      isActive,
      serviceTier,        // already a string from contract
      inactivityPeriod: Number(inactivityPeriod),
    },
    isLoading,
    isError,
    error,
    refetch,
  }
}
