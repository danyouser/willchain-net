#!/usr/bin/env python3
"""
Phoenix Observer Agent
Monitors a list of wallets and sends Telegram alerts when a vault enters
GRACE or CLAIMABLE status.

This agent:
1. Reads a list of wallet addresses to monitor (from WATCH_ADDRESSES env var)
2. Polls each address for vault status changes via getVaultStatus / getNodeState
3. Sends Telegram notifications when status transitions to GRACE or CLAIMABLE
4. Does NOT call any write functions — monitoring only

Usage:
    pip install web3 python-dotenv requests
    cp .env.example .env
    # Set WATCH_ADDRESSES=0xABC,0xDEF,... and TELEGRAM_BOT_TOKEN + TELEGRAM_CHAT_ID
    python phoenix_observer.py
"""

import os
import time
import logging
from typing import Dict, Optional

import requests
from web3 import Web3
from web3.middleware import ExtraDataToPOAMiddleware
from dotenv import load_dotenv

load_dotenv()

logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(levelname)s - %(message)s'
)
logger = logging.getLogger('PhoenixObserver')

# Configuration
RPC_URL          = os.getenv('RPC_URL', 'https://mainnet.base.org')
CONTRACT_ADDRESS = os.getenv('PHOENIX_CONTRACT_ADDRESS')
CHECK_INTERVAL   = int(os.getenv('CHECK_INTERVAL', '3600'))  # seconds
TELEGRAM_TOKEN   = os.getenv('TELEGRAM_BOT_TOKEN')
TELEGRAM_CHAT_ID = os.getenv('TELEGRAM_CHAT_ID')
WATCH_ADDRESSES  = [
    a.strip() for a in os.getenv('WATCH_ADDRESSES', '').split(',') if a.strip()
]

# VaultStatus enum values (matches WillChain.sol):
# 0=UNREGISTERED, 1=ACTIVE, 2=GRACE, 3=CLAIMABLE, 4=ABANDONED
VAULT_STATUS = {0: 'UNREGISTERED', 1: 'ACTIVE', 2: 'GRACE', 3: 'CLAIMABLE', 4: 'ABANDONED'}

# Minimal ABI — only functions that actually exist in PhoenixLegacy.sol
ABI = [
    {
        "inputs": [{"name": "_node", "type": "address"}],
        "name": "getVaultStatus",
        "outputs": [{"name": "", "type": "uint8"}],
        "stateMutability": "view",
        "type": "function"
    },
    {
        "inputs": [{"name": "node", "type": "address"}],
        "name": "getNodeState",
        "outputs": [
            {"name": "lastActivityTimestamp",    "type": "uint256"},
            {"name": "designatedSuccessor",      "type": "address"},
            {"name": "successorClaimInitiated",  "type": "bool"},
            {"name": "claimInitiationTimestamp", "type": "uint256"},
            {"name": "timeUntilInactive",        "type": "uint256"},
            {"name": "timeUntilAbandoned",       "type": "uint256"},
            {"name": "isActive",                 "type": "bool"},
            {"name": "serviceTier",              "type": "string"},
            {"name": "inactivityPeriod",         "type": "uint256"}
        ],
        "stateMutability": "view",
        "type": "function"
    }
]


def send_telegram(message: str):
    """Send a Telegram notification."""
    if not TELEGRAM_TOKEN or not TELEGRAM_CHAT_ID:
        return
    try:
        url = f'https://api.telegram.org/bot{TELEGRAM_TOKEN}/sendMessage'
        requests.post(url, json={
            'chat_id': TELEGRAM_CHAT_ID,
            'text': message,
            'parse_mode': 'HTML',
        }, timeout=10)
    except Exception as e:
        logger.error(f'Telegram error: {e}')


def monitor():
    if not CONTRACT_ADDRESS:
        logger.error('PHOENIX_CONTRACT_ADDRESS not set')
        return
    if not WATCH_ADDRESSES:
        logger.error('WATCH_ADDRESSES not set — comma-separated list of wallet addresses')
        return

    w3 = Web3(Web3.HTTPProvider(RPC_URL))
    w3.middleware_onion.inject(ExtraDataToPOAMiddleware, layer=0)

    if not w3.is_connected():
        logger.error('Could not connect to RPC')
        return

    contract = w3.eth.contract(
        address=Web3.to_checksum_address(CONTRACT_ADDRESS),
        abi=ABI
    )

    # Track previous status to detect transitions
    prev_status: Dict[str, Optional[int]] = {addr: None for addr in WATCH_ADDRESSES}

    logger.info(f'Observer started. Watching {len(WATCH_ADDRESSES)} addresses.')
    logger.info(f'Contract: {CONTRACT_ADDRESS}')
    logger.info(f'Check interval: {CHECK_INTERVAL // 60} min')
    send_telegram(
        f'🔥 <b>Phoenix Observer Started</b>\n'
        f'Watching {len(WATCH_ADDRESSES)} addresses\n'
        f'Contract: <code>{CONTRACT_ADDRESS[:10]}...</code>'
    )

    while True:
        for addr in WATCH_ADDRESSES:
            try:
                checksum_addr = Web3.to_checksum_address(addr)
                status_code = contract.functions.getVaultStatus(checksum_addr).call()
                status_name = VAULT_STATUS.get(status_code, str(status_code))

                state = contract.functions.getNodeState(checksum_addr).call()
                days_until_abandoned = state[5] // 86400  # timeUntilAbandoned
                successor = state[1]

                short = f'{addr[:8]}...{addr[-4:]}'
                logger.info(f'{short} → {status_name} ({days_until_abandoned}d until abandoned)')

                # Alert on status transition to GRACE or CLAIMABLE
                if prev_status[addr] is not None and status_code != prev_status[addr]:
                    old = VAULT_STATUS.get(prev_status[addr], '?')
                    logger.warning(f'{short}: {old} → {status_name}')

                    if status_code == 2:  # GRACE
                        send_telegram(
                            f'⚠️ <b>Vault entered GRACE period</b>\n\n'
                            f'Address: <code>{addr}</code>\n'
                            f'Days until abandoned: <b>{days_until_abandoned}</b>\n'
                            f'Successor: <code>{successor}</code>\n\n'
                            f'Any outgoing transfer resets the timer.'
                        )
                    elif status_code == 3:  # CLAIMABLE
                        send_telegram(
                            f'🔴 <b>Vault is CLAIMABLE</b>\n\n'
                            f'Address: <code>{addr}</code>\n'
                            f'Successor can now initiate claim!\n'
                            f'Days until abandoned: <b>{days_until_abandoned}</b>'
                        )
                    elif status_code == 4:  # ABANDONED
                        send_telegram(
                            f'💀 <b>Vault ABANDONED</b>\n\n'
                            f'Address: <code>{addr}</code>\n'
                            f'Tokens will be recycled on next call.'
                        )

                prev_status[addr] = status_code

            except Exception as e:
                logger.error(f'Error checking {addr}: {e}')

        time.sleep(CHECK_INTERVAL)


if __name__ == '__main__':
    monitor()
