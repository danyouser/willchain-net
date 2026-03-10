/**
 * EIP-712 typed data definitions and verification for WillChain wallet linking.
 */

const { ethers } = require('ethers');

const CHAIN_ID = parseInt(process.env.CHAIN_ID || '84532'); // Base Sepolia by default

const EIP712_DOMAIN = { name: 'WillChain', version: '1' };
const EIP712_TYPES = {
  WalletLink: [
    { name: 'wallet',     type: 'address' },
    { name: 'telegramId', type: 'uint256' },
    { name: 'nonce',      type: 'bytes32' },
  ],
};

/**
 * Verifies an EIP-712 WalletLink signature.
 * Returns { ok: true } or { ok: false, reason: 'address_mismatch' | 'invalid_signature_format' }
 */
function verifyWalletLinkSignature(address, telegramId, nonce, sig) {
  try {
    const domain = { ...EIP712_DOMAIN, chainId: CHAIN_ID };
    const value = { wallet: address, telegramId: BigInt(telegramId), nonce };
    const recovered = ethers.verifyTypedData(domain, EIP712_TYPES, value, sig);
    if (recovered.toLowerCase() !== address.toLowerCase()) {
      return { ok: false, reason: 'address_mismatch' };
    }
    return { ok: true };
  } catch {
    return { ok: false, reason: 'invalid_signature_format' };
  }
}

module.exports = { verifyWalletLinkSignature, EIP712_DOMAIN, EIP712_TYPES, CHAIN_ID };
