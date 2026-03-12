import { StrictMode, Suspense } from 'react'
import { createRoot } from 'react-dom/client'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { WagmiProvider } from 'wagmi'
import { RainbowKitProvider, darkTheme } from '@rainbow-me/rainbowkit'
import { config } from './config/wagmi'
import App from './App'
import { CustomAvatar } from './components/CustomAvatar'
import './i18n'

import '@rainbow-me/rainbowkit/styles.css'
import './styles/index.css'

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 30_000, // blockchain data doesn't change every second
    },
  },
})

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <Suspense fallback={null}>
      <WagmiProvider config={config}>
        <QueryClientProvider client={queryClient}>
          <RainbowKitProvider
            avatar={CustomAvatar}
            theme={darkTheme({
              accentColor: '#ff6400',
              accentColorForeground: 'white',
              borderRadius: 'medium',
            })}
          >
            <App />
          </RainbowKitProvider>
        </QueryClientProvider>
      </WagmiProvider>
    </Suspense>
  </StrictMode>,
)
