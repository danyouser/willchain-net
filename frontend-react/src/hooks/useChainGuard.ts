import { useChainId, useSwitchChain } from 'wagmi'
import { CHAIN_ID } from '../config/wagmi'

/**
 * Returns a guard function that checks the current chain before executing a write.
 * If wrong chain — prompts switch and aborts. Prevents mainnet tx on a testnet-only dApp.
 */
export function useChainGuard() {
  const chainId = useChainId()
  const { switchChain } = useSwitchChain()

  function assertCorrectChain(): boolean {
    if (chainId !== CHAIN_ID) {
      switchChain({ chainId: CHAIN_ID })
      return false
    }
    return true
  }

  return { assertCorrectChain, isCorrectChain: chainId === CHAIN_ID }
}
