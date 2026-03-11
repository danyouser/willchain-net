/**
 * WillChain Bot - Email Notifications via Resend
 */

const FROM = process.env.EMAIL_FROM || 'WillChain <notifications@willchain.net>';
const FRONTEND_URL = process.env.FRONTEND_URL || 'https://willchain.net';

let _resend;
function getResend() {
  if (!_resend) {
    const { Resend } = require('resend');
    _resend = new Resend(process.env.RESEND_API_KEY);
  }
  return _resend;
}

function isConfigured() {
  return !!process.env.RESEND_API_KEY;
}

async function send(to, subject, html) {
  if (!isConfigured()) return;
  try {
    await getResend().emails.send({ from: FROM, to, subject, html });
  } catch (error) {
    console.error(`[EMAIL] Failed to send to ${to}:`, error.message);
  }
}

function addr(address) {
  return `${address.slice(0, 6)}...${address.slice(-4)}`;
}

// ── Email templates ──────────────────────────────────────────────

async function sendSuccessorDesignated(email, { ownerAddress, successorAddress, periodDays }) {
  await send(
    email,
    '✅ Your successor has been set — WillChain',
    `<p>Your WillChain vault is now active.</p>
<ul>
  <li><strong>Your wallet:</strong> ${addr(ownerAddress)}</li>
  <li><strong>Successor:</strong> ${addr(successorAddress)}</li>
  <li><strong>Inactivity period:</strong> ${periodDays} days</li>
</ul>
<p>If you stop confirming activity, your successor will be able to claim your vault after ${periodDays} days + 30-day grace period.</p>
<p><a href="${FRONTEND_URL}">Open WillChain Dashboard</a></p>`
  );
}

async function sendSuccessorNotified(email, { ownerAddress }) {
  await send(
    email,
    '📋 You\'ve been named as a successor — WillChain',
    `<p>Wallet <strong>${addr(ownerAddress)}</strong> has designated you as their successor on WillChain.</p>
<p><strong>What this means:</strong></p>
<ul>
  <li>If they become inactive, you'll be able to claim their vault</li>
  <li>You'll receive notifications when a claim becomes available</li>
</ul>
<p>No action required from you right now.</p>
<p><a href="${FRONTEND_URL}">Learn more about WillChain</a></p>`
  );
}

async function sendClaimInitiated(email, { ownerAddress, successorAddress }) {
  await send(
    email,
    '🚨 URGENT: Someone is claiming your vault — WillChain',
    `<p><strong>A successor claim has been initiated on your vault!</strong></p>
<ul>
  <li><strong>Your wallet:</strong> ${addr(ownerAddress)}</li>
  <li><strong>Claimant:</strong> ${addr(successorAddress)}</li>
</ul>
<p>You have <strong>30 days to veto this claim</strong> by confirming your activity.</p>
<p><a href="${FRONTEND_URL}" style="background:#3b82f6;color:#fff;padding:10px 20px;border-radius:6px;text-decoration:none">🆘 CONFIRM ACTIVITY NOW</a></p>`
  );
}

async function sendGracePeriodAlert(email, { ownerAddress, daysUntilAbandoned }) {
  await send(
    email,
    `⚠️ Your vault is in grace period — ${daysUntilAbandoned} days left`,
    `<p><strong>Your WillChain vault has entered the grace period.</strong></p>
<ul>
  <li><strong>Wallet:</strong> ${addr(ownerAddress)}</li>
  <li><strong>Days remaining:</strong> ${daysUntilAbandoned} days</li>
</ul>
<p>Confirm your activity now to prevent your successor from claiming your vault.</p>
<p><a href="${FRONTEND_URL}" style="background:#ef4444;color:#fff;padding:10px 20px;border-radius:6px;text-decoration:none">🆘 CONFIRM ACTIVITY NOW</a></p>`
  );
}

async function sendVaultTransferred(email, { fromAddress, toAddress, amount }) {
  await send(
    email,
    '🎉 You received a vault transfer — WillChain',
    `<p>A vault has been transferred to you as the designated successor.</p>
<ul>
  <li><strong>From:</strong> ${addr(fromAddress)}</li>
  <li><strong>To:</strong> ${addr(toAddress)}</li>
  <li><strong>Amount:</strong> ${amount} WILL</li>
</ul>
<p>Remember to confirm activity regularly to keep your vault active.</p>
<p><a href="${FRONTEND_URL}">Open WillChain Dashboard</a></p>`
  );
}

module.exports = {
  isConfigured,
  sendSuccessorDesignated,
  sendSuccessorNotified,
  sendClaimInitiated,
  sendGracePeriodAlert,
  sendVaultTransferred,
};
