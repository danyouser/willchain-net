/**
 * Tests for EIP-712 wallet link signature verification.
 *
 * Uses verifyWalletLinkSignature from bot/src/eip712.js directly.
 * Uses a real ethers wallet to produce valid EIP-712 typed data signatures.
 */
const { test, describe } = require('node:test');
const assert = require('node:assert/strict');
const { ethers } = require('ethers');
const { verifyWalletLinkSignature, EIP712_DOMAIN, EIP712_TYPES, CHAIN_ID } = require('../src/eip712');

// ── Fixed test wallet (deterministic — no randomness needed) ──
const WALLET = new ethers.Wallet('0x' + '1'.repeat(64));
const TELEGRAM_ID = 123456789n;

async function sign(wallet, address, telegramId, nonce) {
  const domain = { ...EIP712_DOMAIN, chainId: CHAIN_ID };
  return wallet.signTypedData(domain, EIP712_TYPES, {
    wallet: address,
    telegramId,
    nonce,
  });
}

describe('/verify — signature verification logic', () => {
  test('valid signature from correct wallet passes', async () => {
    const nonce = ethers.hexlify(ethers.randomBytes(32));
    const sig = await sign(WALLET, WALLET.address, TELEGRAM_ID, nonce);

    const result = verifyWalletLinkSignature(WALLET.address, TELEGRAM_ID, nonce, sig);
    assert.equal(result.ok, true);
  });

  test('valid signature but wrong address fails with address_mismatch', async () => {
    const nonce = ethers.hexlify(ethers.randomBytes(32));
    const sig = await sign(WALLET, WALLET.address, TELEGRAM_ID, nonce);

    const otherWallet = new ethers.Wallet('0x' + '2'.repeat(64));
    const result = verifyWalletLinkSignature(otherWallet.address, TELEGRAM_ID, nonce, sig);
    assert.equal(result.ok, false);
    assert.equal(result.reason, 'address_mismatch');
  });

  test('signature for wrong message fails', async () => {
    const nonce = ethers.hexlify(ethers.randomBytes(32));
    const wrongNonce = ethers.hexlify(ethers.randomBytes(32));
    const sig = await sign(WALLET, WALLET.address, TELEGRAM_ID, wrongNonce);

    const result = verifyWalletLinkSignature(WALLET.address, TELEGRAM_ID, nonce, sig);
    assert.equal(result.ok, false);
    assert.equal(result.reason, 'address_mismatch');
  });

  test('garbage signature returns invalid_signature_format', () => {
    const nonce = ethers.hexlify(ethers.randomBytes(32));
    const result = verifyWalletLinkSignature(WALLET.address, TELEGRAM_ID, nonce, 'not-a-signature');
    assert.equal(result.ok, false);
    assert.equal(result.reason, 'invalid_signature_format');
  });

  test('empty signature returns invalid_signature_format', () => {
    const nonce = ethers.hexlify(ethers.randomBytes(32));
    const result = verifyWalletLinkSignature(WALLET.address, TELEGRAM_ID, nonce, '');
    assert.equal(result.ok, false);
    assert.equal(result.reason, 'invalid_signature_format');
  });

  test('address comparison is case-insensitive (recovered vs stored)', async () => {
    const nonce = ethers.hexlify(ethers.randomBytes(32));
    const sig = await sign(WALLET, WALLET.address, TELEGRAM_ID, nonce);

    // Pass lowercase address — should still pass
    const result = verifyWalletLinkSignature(WALLET.address.toLowerCase(), TELEGRAM_ID, nonce, sig);
    assert.equal(result.ok, true);
  });

  test('message format is exact — different telegramId fails with address_mismatch', async () => {
    const nonce = ethers.hexlify(ethers.randomBytes(32));
    const sig = await sign(WALLET, WALLET.address, TELEGRAM_ID, nonce);

    // Try to use the same sig for a different Telegram user
    const otherTgId = 999999999n;
    const result = verifyWalletLinkSignature(WALLET.address, otherTgId, nonce, sig);
    assert.equal(result.ok, false);
    assert.equal(result.reason, 'address_mismatch');
  });

  test('replay attack: signature for one nonce cannot be used for another', async () => {
    const nonce1 = ethers.hexlify(ethers.randomBytes(32));
    const nonce2 = ethers.hexlify(ethers.randomBytes(32));
    const sig = await sign(WALLET, WALLET.address, TELEGRAM_ID, nonce1);

    const result = verifyWalletLinkSignature(WALLET.address, TELEGRAM_ID, nonce2, sig);
    assert.equal(result.ok, false);
    assert.equal(result.reason, 'address_mismatch');
  });
});
