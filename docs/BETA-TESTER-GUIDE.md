# WillChain Beta — Tester Guide

Thanks for helping us test WillChain! This guide will walk you through everything step by step.

**What is WillChain?** A "Dead Man's Switch" for crypto. You hold WILL tokens and check in periodically to prove you're active. If you stop checking in, your designated successor can claim your tokens. It's like a digital will for your crypto wallet.

**This is a testnet beta** — no real money is involved. All tokens are on Base Sepolia (a test network).

---

## Step 1: Install MetaMask

If you don't have MetaMask yet:

1. Go to [metamask.io](https://metamask.io/download/)
2. Install the browser extension (Chrome, Firefox, or Brave)
3. Create a new wallet and save your recovery phrase

---

## Step 2: Add Base Sepolia Network

1. Open MetaMask → click the network dropdown (top left)
2. Click **Add network** → **Add a network manually**
3. Enter these details:

| Field | Value |
|-------|-------|
| Network name | Base Sepolia |
| RPC URL | `https://sepolia.base.org` |
| Chain ID | `84532` |
| Currency symbol | `ETH` |
| Block explorer | `https://sepolia.basescan.org` |

4. Click **Save** and switch to Base Sepolia

---

## Step 3: Get Testnet ETH

You need a small amount of test ETH for gas fees (it's free):

1. Go to [Chainlink Faucet](https://faucets.chain.link/base-sepolia)
2. Connect your MetaMask wallet
3. Request testnet ETH
4. Wait ~30 seconds for it to arrive

---

## Step 4: Get WILL Tokens

Ask the project owner to send you WILL tokens. Share your wallet address (copy from MetaMask).

You'll receive test WILL tokens — they have no real value.

---

## Step 5: Open WillChain

1. Go to [willchain.net](https://willchain.net)
2. Click **Connect Wallet** (top right)
3. Select MetaMask and approve the connection
4. You should see the Dashboard with your WILL balance

---

## Step 6: Set Up Your Vault

Complete these 3 steps (in this order):

### 6.1 Confirm Activity (Check In)

Click **Confirm Activity** — this registers you as an active user and starts your activity timer.

### 6.2 Designate Successor

Click **Designate Successor** and enter the wallet address of the person who should inherit your tokens if you become inactive.

> You can use another tester's address, or create a second MetaMask wallet for testing.

### 6.3 Set Inactivity Period

Click **Set Inactivity Period** — choose how long you can be inactive before your vault enters the grace period (minimum 90 days on mainnet, may be shorter on testnet for testing).

---

## Step 7: Connect Telegram Bot

1. Open Telegram and find the bot: **@WillChainBot** (ask the project owner for the exact username)
2. Send `/start`
3. Send `/link` — the bot will give you a link
4. Click the link — it opens WillChain in your browser
5. MetaMask will ask you to sign a message — this proves you own the wallet
6. After signing, the bot confirms the link

Now the bot will alert you via Telegram when:
- Your vault enters the grace period (you need to check in!)
- Someone initiates a successor claim on your vault
- Your vault transfer completes

---

## What to Test

Please try these scenarios and let us know if anything is confusing or broken:

### Basic Flow
- [ ] Connect wallet and see your balance
- [ ] Confirm activity (check in)
- [ ] Designate a successor
- [ ] Set inactivity period
- [ ] Link your Telegram account
- [ ] Check that bot sends you a welcome message

### Things to Watch For
- **Confusing text?** — If any button, label, or message doesn't make sense, tell us
- **Transaction errors?** — If MetaMask shows an error or a transaction fails, screenshot it
- **Bot issues?** — If the bot doesn't respond or sends wrong information, let us know
- **Loading problems?** — If pages are slow or don't load, note which page

### Advanced (if you have time)
- [ ] Try switching languages (bottom of page)
- [ ] Try on mobile (MetaMask mobile browser)
- [ ] Try transferring WILL tokens to another address
- [ ] Check your vault status after some time passes

---

## How to Report Issues

Send a message with:

1. **What you did** — "I clicked Designate Successor and entered an address"
2. **What happened** — "MetaMask showed an error: 'execution reverted'"
3. **What you expected** — "The transaction should have succeeded"
4. **Screenshot** — if possible

Send reports to the project owner via Telegram or your preferred channel.

---

## FAQ

**Q: Can I lose real money?**
A: No. Everything is on a test network. Tokens have no value.

**Q: What if I mess something up?**
A: Nothing bad happens. We can always send you more test tokens.

**Q: Do I need to keep checking in?**
A: During beta testing, you don't need to worry about the inactivity timer. Just test the features and tell us what's confusing.

**Q: How long does beta testing last?**
A: A few weeks. We'll let you know when it's done.

---

*Thank you for helping make WillChain better!*
