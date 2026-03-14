/**
 * WillChain Bot — Event Notifications
 * Sends Telegram + email alerts when on-chain events occur.
 * All handlers are idempotent via db.isEventProcessed / db.markEventProcessed.
 */

const { InlineKeyboard } = require('grammy');
const { ethers } = require('ethers');
const db = require('./database');
const email = require('./email');
const { t } = require('./i18n');
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
    const lang = userData.lang || 'en';
    try {
      await bot.api.sendMessage(userData.telegramId,
        t(lang, 'notify.claim_initiated', {
          owner: formatAddress(node),
          successor: formatAddress(successor),
          time: new Date(Number(timestamp) * 1000).toUTCString(),
        }),
        {
          parse_mode: 'Markdown',
          reply_markup: new InlineKeyboard().url(t(lang, 'notify.btn_veto'), CONFIG.frontendUrl),
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
    const lang = userData.lang || 'en';
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
        t(lang, 'notify.activity_confirmed', {
          periodDays,
          nextDeadline: nextDeadline.toLocaleDateString(),
        }),
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
    const lang = oldOwner.lang || 'en';
    try {
      await bot.api.sendMessage(oldOwner.telegramId,
        t(lang, 'notify.vault_transferred_from', {
          from: formatAddress(fromNode),
          to: formatAddress(toNode),
          amount: formatTokenAmount(accessUnits),
        }),
        { parse_mode: 'Markdown' }
      );
    } catch (error) {
      log('ERROR', `Failed to notify ${oldOwner.telegramId}`, error.message);
    }
  }

  const newOwner = db.getUserByWallet(toNode);
  if (newOwner) {
    const lang = newOwner.lang || 'en';
    try {
      await bot.api.sendMessage(newOwner.telegramId,
        t(lang, 'notify.vault_transferred_to', {
          from: formatAddress(fromNode),
          amount: formatTokenAmount(accessUnits),
        }),
        {
          parse_mode: 'Markdown',
          reply_markup: new InlineKeyboard().url(t(lang, 'notify.btn_confirm_activity'), CONFIG.frontendUrl),
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
    const lang = userData.lang || 'en';
    try {
      await bot.api.sendMessage(userData.telegramId,
        t(lang, 'notify.successor_updated', {
          successor: formatAddress(successor),
          periodDays,
        }),
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
    const lang = successorData.lang || 'en';
    try {
      await bot.api.sendMessage(successorData.telegramId,
        t(lang, 'notify.successor_named', { owner: formatAddress(node) }),
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
    const lang = userData.lang || 'en';
    try {
      await bot.api.sendMessage(userData.telegramId,
        t(lang, 'notify.vault_registered', { address: formatAddress(node) }),
        {
          parse_mode: 'Markdown',
          reply_markup: new InlineKeyboard().url(t(lang, 'notify.btn_dashboard'), CONFIG.frontendUrl),
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
