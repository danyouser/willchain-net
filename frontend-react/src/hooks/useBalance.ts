import { useReadContract } from 'wagmi'
import { CONTRACT_ADDRESS, WILLCHAIN_ABI } from '../config/contract'
import { CHAIN_ID } from '../config/wagmi'

export function useBalance(address: `0x${string}` | undefined) {
  const { data: balance, isLoading, refetch } = useReadContract({
    address: CONTRACT_ADDRESS,
    abi: WILLCHAIN_ABI,
    functionName: 'balanceOf',
    chainId: CHAIN_ID,
    args: address ? [address] : undefined,
    query: {
      enabled: !!address,
    },
  })

  return {
    balance: balance ?? 0n,
    isLoading,
    refetch,
  }
}

export function formatTokenAmount(amount: bigint): string {
  const whole = amount / 10n ** 18n
  return whole.toLocaleString('en-US')
}
