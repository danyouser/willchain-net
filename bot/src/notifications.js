/**
 * WillChain Bot — Event Notifications
 * Sends Telegram + email alerts when on-chain events occur.
 * All handlers are idempotent via db.isEventProcessed / db.markEventProcessed.
 */

const { InlineKeyboard } = require('grammy');
const { ethers } = require('ethers');
const db = require('./database');
const email = require('./email');
const { log, formatAddress, formatTokenAmount } = require('./utils');

let bot;
let contract;
let CONFIG;

function init(botInstance, contractInstance, config) {
  bot = botInstance;
  contract = contractInstance;
  CONFIG = config;
}

async function notifySuccessorClaimInitiated(node, successor, timestamp, txHash, logIndex) {
  if (db.isEventProcessed(txHash, logIndex)) {
    log('INFO', `Skipping already processed event: SuccessorClaimInitiated ${txHash}:${logIndex}`);
    return;
  }

  log('EVENT', `SuccessorClaimInitiated: ${node} by ${successor}`);

  const userData = db.getUserByWallet(node);
  if (userData) {
    try {
      await bot.api.sendMessage(userData.telegramId,
        `🚨 *CRITICAL ALERT: Successor Claim Initiated!*\n\n` +
        `Someone is trying to claim your vault!\n\n` +
        `📍 Your wallet: \`${formatAddress(node)}\`\n` +
        `👤 Claimant: \`${formatAddress(successor)}\`\n` +
        `⏱ Time: ${new Date(Number(timestamp) * 1000).toUTCString()}\n\n` +
        `*You have 30 days to veto this claim!*\n` +
        `Confirm your activity NOW to cancel the claim.`,
        {
          parse_mode: 'Markdown',
          reply_markup: new InlineKeyboard().url('🆘 VETO CLAIM NOW', CONFIG.frontendUrl),
        }
      );
      log('SUCCESS', `Notified user ${userData.telegramId} about successor claim`);
    } catch (error) {
      log('ERROR', `Failed to notify ${userData.telegramId}`, error.message);
    }

    if (userData.email) {
      await email.sendClaimInitiated(userData.email, {
        ownerAddress: node,
        successorAddress: successor,
      });
    }
  }

  db.markEventProcessed(txHash, logIndex, 'SuccessorClaimInitiated');
}

async function notifyActivityConfirmed(node, timestamp, txHash, logIndex) {
  if (db.isEventProcessed(txHash, logIndex)) return;

  log('EVENT', `ActivityConfirmed: ${node}`);

  const userData = db.getUserByWallet(node);
  if (userData) {
    try {
      let periodDays = 90; // default
      if (contract) {
        try {
          const period = await contract.getInactivityPeriod(node);
          periodDays = Math.floor(Number(period) / 86400);
        } catch (e) { /* use default */ }
      }

      const nextDeadline = new Date(Number(timestamp) * 1000 + periodDays * 24 * 60 * 60 * 1000);

      await bot.api.sendMessage(userData.telegramId,
        `✅ *Activity Confirmed!*\n\n` +
        `Your vault timer has been reset.\n` +
        `Inactivity period: ${periodDays} days\n` +
        `Next deadline: ${nextDeadline.toLocaleDateString()}\n\n` +
        `_Tip: Any on-chain activity will auto-confirm your presence._`,
        { parse_mode: 'Markdown' }
      );
    } catch (error) {
      log('ERROR', `Failed to notify ${userData.telegramId}`, error.message);
    }
  }

  db.markEventProcessed(txHash, logIndex, 'ActivityConfirmed');
}

async function notifyVaultAccessTransferred(fromNode, toNode, accessUnits, txHash, logIndex) {
  if (db.isEventProcessed(txHash, logIndex)) return;

  log('EVENT', `VaultAccessTransferred: ${fromNode} → ${toNode}`);

  const oldOwner = db.getUserByWallet(fromNode);
  if (oldOwner) {
    try {
      await bot.api.sendMessage(oldOwner.telegramId,
        `⚠️ *Vault Transfer Completed*\n\n` +
        `Your vault access has been transferred to your designated successor.\n\n` +
        `From: \`${formatAddress(fromNode)}\`\n` +
        `To: \`${formatAddress(toNode)}\`\n` +
        `Amount: ${formatTokenAmount(accessUnits)} WILL`,
        { parse_mode: 'Markdown' }
      );
    } catch (error) {
      log('ERROR', `Failed to notify ${oldOwner.telegramId}`, error.message);
    }
  }

  const newOwner = db.getUserByWallet(toNode);
  if (newOwner) {
    try {
      await bot.api.sendMessage(newOwner.telegramId,
        `🎉 *You Received Vault Access!*\n\n` +
        `A vault has been transferred to you as designated successor.\n\n` +
        `From: \`${formatAddress(fromNode)}\`\n` +
        `Amount: ${formatTokenAmount(accessUnits)} WILL\n\n` +
        `Remember to confirm activity monthly to keep your vault active!`,
        {
          parse_mode: 'Markdown',
          reply_markup: new InlineKeyboard().url('✅ Confirm Activity', CONFIG.frontendUrl),
        }
      );
    } catch (error) {
      log('ERROR', `Failed to notify ${newOwner.telegramId}`, error.message);
    }

    if (newOwner.email) {
      await email.sendVaultTransferred(newOwner.email, {
        fromAddress: fromNode,
        toAddress: toNode,
        amount: formatTokenAmount(accessUnits),
      });
    }
  }

  db.markEventProcessed(txHash, logIndex, 'VaultAccessTransferred');
}

async function notifySuccessorDesignated(node, successor, txHash, logIndex) {
  if (db.isEventProcessed(txHash, logIndex)) return;

  log('EVENT', `SuccessorDesignated: ${node} → ${successor}`);

  // Persist relationship for API queries
  db.upsertSuccessor(node, successor);

  let periodDays = 90;
  if (contract) {
    try {
      const period = await contract.getInactivityPeriod(node);
      periodDays = Math.floor(Number(period) / 86400);
    } catch (e) { /* use default */ }
  }

  const userData = db.getUserByWallet(node);
  if (userData) {
    try {
      await bot.api.sendMessage(userData.telegramId,
        `✅ *Successor Updated*\n\n` +
        `Your designated successor has been set to:\n` +
        `\`${formatAddress(successor)}\`\n\n` +
        `They can claim your vault after ${periodDays} days of inactivity + 30 day grace period.`,
        { parse_mode: 'Markdown' }
      );
    } catch (error) {
      log('ERROR', `Failed to notify ${userData.telegramId}`, error.message);
    }

    if (userData.email) {
      await email.sendSuccessorDesignated(userData.email, {
        ownerAddress: node,
        successorAddress: successor,
        periodDays,
      });
    }
  }

  // Notify the successor (if they have the bot linked)
  const successorData = db.getUserByWallet(successor);
  if (successorData) {
    try {
      await bot.api.sendMessage(successorData.telegramId,
        `📋 *You've Been Named as a Successor*\n\n` +
        `Wallet \`${formatAddress(node)}\` has designated you as their successor.\n\n` +
        `*What this means:*\n` +
        `• If they become inactive, you'll be able to claim their vault\n` +
        `• You'll receive notifications when a claim becomes available\n\n` +
        `_No action required from you right now._`,
        { parse_mode: 'Markdown' }
      );
      log('SUCCESS', `Notified successor ${successorData.telegramId} about designation`);
    } catch (error) {
      log('ERROR', `Failed to notify successor ${successorData.telegramId}`, error.message);
    }

    if (successorData.email) {
      await email.sendSuccessorNotified(successorData.email, { ownerAddress: node });
    }
  }

  db.markEventProcessed(txHash, logIndex, 'SuccessorDesignated');
}

async function notifyNodeRegistered(node, timestamp, txHash, logIndex) {
  if (db.isEventProcessed(txHash, logIndex)) return;

  log('EVENT', `NodeRegistered: ${node}`);

  const userData = db.getUserByWallet(node);
  if (userData) {
    try {
      await bot.api.sendMessage(userData.telegramId,
        `🎉 *Vault Registered!*\n\n` +
        `Your wallet has been registered in the WillChain protocol.\n\n` +
        `📍 Address: \`${formatAddress(node)}\`\n\n` +
        `*What's next:*\n` +
        `• Use /status to see your vault state\n` +
        `• Designate a successor in the dashboard\n` +
        `• Any outgoing transfer will auto-confirm your activity`,
        {
          parse_mode: 'Markdown',
          reply_markup: new InlineKeyboard().url('📊 Open Dashboard', CONFIG.frontendUrl),
        }
      );
      log('SUCCESS', `Sent registration welcome to ${userData.telegramId}`);
    } catch (error) {
      log('ERROR', `Failed to notify ${userData.telegramId}`, error.message);
    }
  }

  db.markEventProcessed(txHash, logIndex, 'NodeRegistered');
}

module.exports = {
  init,
  notifySuccessorClaimInitiated,
  notifyActivityConfirmed,
  notifyVaultAccessTransferred,
  notifySuccessorDesignated,
  notifyNodeRegistered,
};
