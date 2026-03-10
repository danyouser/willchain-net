import { usePublicClient } from 'wagmi'
import { useEffect, useState } from 'react'
import { CHAIN_ID } from '../config/wagmi'

/**
 * Checks if the connected address is a smart wallet (Safe, AA, Gnosis).
 * Used to show informational UI — the contract supports smart wallets fully.
 */
export function useIsSmartWallet(address: `0x${string}` | undefined): boolean {
  const client = usePublicClient({ chainId: CHAIN_ID })
  const [isSmart, setIsSmart] = useState(false)

  useEffect(() => {
    let cancelled = false
    const check = address && client
      ? client.getBytecode({ address }).then(code => code !== undefined && code !== '0x' && code.length > 2)
      : Promise.resolve(false)
    check.then(result => { if (!cancelled) setIsSmart(result) }).catch(() => { if (!cancelled) setIsSmart(false) })
    return () => { cancelled = true }
  }, [address, client])

  return isSmart
}
