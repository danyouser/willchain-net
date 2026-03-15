import { connectorsForWallets } from '@rainbow-me/rainbowkit'
import {
  metaMaskWallet,
  walletConnectWallet,
  braveWallet,
  coinbaseWallet,
  rainbowWallet,
  ledgerWallet,
} from '@rainbow-me/rainbowkit/wallets'
import { createConfig, createStorage, http } from 'wagmi'
import { baseSepolia } from 'wagmi/chains'

export { CONTRACT_ADDRESS } from './contract'

const WALLETCONNECT_PROJECT_ID = import.meta.env.VITE_WALLETCONNECT_PROJECT_ID as string

const connectors = connectorsForWallets(
  [
    {
      groupName: 'Popular',
      wallets: [
        walletConnectWallet,
        metaMaskWallet,
        coinbaseWallet,
        ledgerWallet,
        braveWallet,
        rainbowWallet,
      ],
    },
  ],
  {
    appName: 'WillChain',
    projectId: WALLETCONNECT_PROJECT_ID,
  }
)

export const config = createConfig({
  connectors,
  chains: [baseSepolia],
  transports: {
    [baseSepolia.id]: http(),
  },
  storage: createStorage({ storage: localStorage }),
  ssr: false,
})

export const CHAIN_ID = baseSepolia.id
