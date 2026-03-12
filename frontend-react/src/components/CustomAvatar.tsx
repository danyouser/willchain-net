import type { AvatarComponent } from '@rainbow-me/rainbowkit'

export const CustomAvatar: AvatarComponent = ({ size }) => (
  <img
    src="/assets/icon.svg"
    width={size}
    height={size}
    alt="WillChain"
    style={{ borderRadius: '50%' }}
  />
)
