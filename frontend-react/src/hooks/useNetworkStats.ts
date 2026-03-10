import { useReadContract } from 'wagmi'
import { CONTRACT_ADDRESS, WILLCHAIN_ABI } from '../config/contract'
import { CHAIN_ID } from '../config/wagmi'

export function useNetworkStats() {
  const { data, isLoading, refetch } = useReadContract({
    address: CONTRACT_ADDRESS,
    abi: WILLCHAIN_ABI,
    functionName: 'getNetworkStatistics',
    chainId: CHAIN_ID,
  })

  if (!data) {
    return {
      stats: null,
      isLoading,
      refetch,
    }
  }

  const [
    totalSupply_,
    recycledToNetwork,
    removedFromCirculation,
    successfulTransfers,
    totalProtocolFees_,
    dividendPool_,
  ] = data

  return {
    stats: {
      totalSupply: totalSupply_,
      recycledToNetwork,
      removedFromCirculation,
      successfulTransfers,
      totalProtocolFees: totalProtocolFees_,
      dividendPool: dividendPool_,
    },
    isLoading,
    refetch,
  }
}
