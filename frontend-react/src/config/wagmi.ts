import { getDefaultConfig } from '@rainbow-me/rainbowkit'
import { baseSepolia } from 'wagmi/chains'

export { CONTRACT_ADDRESS } from './contract'

const WALLETCONNECT_PROJECT_ID = import.meta.env.VITE_WALLETCONNECT_PROJECT_ID as string

export const config = getDefaultConfig({
  appName: 'WillChain.net - Dead Man\'s Switch on Base',
  projectId: WALLETCONNECT_PROJECT_ID,
  chains: [baseSepolia],
  ssr: false,
})

export const CHAIN_ID = baseSepolia.id
