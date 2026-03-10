#!/usr/bin/env python3
"""
Personal Phoenix Observer - Simple version for individual users
Monitors YOUR wallet and calls confirmActivity() when you're active.

Usage:
    pip install web3 python-dotenv
    cp .env.example .env
    # Edit .env with your settings
    python personal_observer.py
"""

import time
import os
from web3 import Web3
from dotenv import load_dotenv

load_dotenv()

# Configuration
RPC_URL = os.getenv("RPC_URL", "https://mainnet.base.org")
PRIVATE_KEY = os.getenv("PRIVATE_KEY")
WALLET_ADDRESS = os.getenv("WALLET_ADDRESS")
CONTRACT_ADDRESS = os.getenv("PHOENIX_CONTRACT_ADDRESS")
CHECK_INTERVAL = int(os.getenv("CHECK_INTERVAL", "3600"))

# Minimal ABI
ABI = [
    {
        "inputs": [],
        "name": "confirmActivity",
        "outputs": [],
        "stateMutability": "nonpayable",
        "type": "function"
    },
    {
        "inputs": [{"name": "node", "type": "address"}],
        "name": "getNodeState",
        "outputs": [
            {"name": "lastActivityTimestamp", "type": "uint256"},
            {"name": "designatedSuccessor", "type": "address"},
            {"name": "successorClaimInitiated", "type": "bool"},
            {"name": "claimInitiationTimestamp", "type": "uint256"},
            {"name": "timeUntilInactive", "type": "uint256"},
            {"name": "timeUntilAbandoned", "type": "uint256"},
            {"name": "isActive", "type": "bool"},
            {"name": "serviceTier", "type": "string"},
            {"name": "inactivityPeriod", "type": "uint256"}
        ],
        "stateMutability": "view",
        "type": "function"
    }
]


def log(message):
    print(f"[{time.strftime('%Y-%m-%d %H:%M:%S')}] {message}")


def monitor_and_confirm():
    """Main monitoring loop"""

    # Validate configuration
    if not PRIVATE_KEY:
        log("❌ Error: PRIVATE_KEY not set in .env")
        return
    if not WALLET_ADDRESS:
        log("❌ Error: WALLET_ADDRESS not set in .env")
        return
    if not CONTRACT_ADDRESS:
        log("❌ Error: PHOENIX_CONTRACT_ADDRESS not set in .env")
        return

    # Connect to blockchain
    w3 = Web3(Web3.HTTPProvider(RPC_URL))

    if not w3.is_connected():
        log("❌ Error: Could not connect to Base network")
        return

    log(f"🔥 Phoenix Personal Observer started")
    log(f"📍 Wallet: {WALLET_ADDRESS}")
    log(f"📋 Contract: {CONTRACT_ADDRESS}")
    log(f"⏰ Check interval: {CHECK_INTERVAL // 60} minutes")

    contract = w3.eth.contract(
        address=Web3.to_checksum_address(CONTRACT_ADDRESS),
        abi=ABI
    )
    account = w3.eth.account.from_key(PRIVATE_KEY)

    # Safety check: PRIVATE_KEY must correspond to WALLET_ADDRESS
    if account.address.lower() != WALLET_ADDRESS.lower():
        log(f"❌ PRIVATE_KEY address ({account.address}) does not match WALLET_ADDRESS ({WALLET_ADDRESS})")
        log("   The script would confirm activity for the wrong wallet. Aborting.")
        return

    # Get initial nonce
    last_nonce = w3.eth.get_transaction_count(WALLET_ADDRESS)
    log(f"📊 Initial nonce: {last_nonce}")

    while True:
        try:
            current_nonce = w3.eth.get_transaction_count(WALLET_ADDRESS)

            if current_nonce > last_nonce:
                log(f"✅ Activity detected! Nonce: {last_nonce} → {current_nonce}")

                # Get current status
                state = contract.functions.getNodeState(WALLET_ADDRESS).call()
                days_until_inactive = state[4] // 86400
                inactivity_period_days = state[8] // 86400

                log(f"📊 Current status: {days_until_inactive} days until inactive (period: {inactivity_period_days} days)")

                # Only confirm if we're getting close to deadline (within 25% of period)
                threshold = inactivity_period_days * 0.75
                if days_until_inactive < threshold:
                    log(f"⚡ Confirming activity on-chain...")

                    # Build transaction
                    tx = contract.functions.confirmActivity().build_transaction({
                        'from': account.address,
                        'nonce': w3.eth.get_transaction_count(account.address),
                        'gas': 100000,
                        'maxFeePerGas': w3.eth.gas_price * 2,
                        'maxPriorityFeePerGas': w3.to_wei(0.001, 'gwei'),
                    })

                    # Sign and send
                    signed_tx = account.sign_transaction(tx)
                    tx_hash = w3.eth.send_raw_transaction(signed_tx.raw_transaction)

                    # Wait for confirmation
                    receipt = w3.eth.wait_for_transaction_receipt(tx_hash, timeout=120)

                    if receipt['status'] == 1:
                        log(f"🎉 Activity confirmed! TX: {tx_hash.hex()}")
                        log(f"⛽ Gas used: {receipt['gasUsed']}")
                    else:
                        log(f"❌ Transaction failed: {tx_hash.hex()}")
                else:
                    log(f"⏳ Still have {days_until_inactive} days - skipping on-chain confirmation")

                # Update last known nonce
                last_nonce = w3.eth.get_transaction_count(WALLET_ADDRESS)
            else:
                # Check status periodically
                state = contract.functions.getNodeState(WALLET_ADDRESS).call()
                days_until_inactive = state[4] // 86400
                is_active = state[6]

                status = "🟢 Active" if is_active else "🔴 Inactive"
                log(f"{status} | Days remaining: {days_until_inactive} | No new activity")

        except Exception as e:
            log(f"❌ Error: {e}")

        time.sleep(CHECK_INTERVAL)


if __name__ == "__main__":
    monitor_and_confirm()
