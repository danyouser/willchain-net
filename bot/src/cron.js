/**
 * WillChain Bot — Scheduled Jobs
 * Weekly reminders and daily critical status checks.
 */

const { InlineKeyboard } = require('grammy');
const cron = require('node-cron');
const db = require('./database');
const email = require('./email');
const { deriveVaultStatus, needsCriticalAlert, approachingInactivity } = require('../../shared/vault-status');
const { log } = require('./utils');

let bot;
let contract;
let CONFIG;

function init(botInstance, contractInstance, config) {
  bot = botInstance;
  contract = contractInstance;
  CONFIG = config;
}

// Weekly reminder — every Monday at 10:00 AM UTC
function scheduleWeeklyReminder() {
  cron.schedule('0 10 * * 1', async () => {
    log('INFO', 'Running weekly reminder job...');

    if (!contract) {
      log('WARN', 'Contract not configured, skipping reminders');
      return;
    }

    const users = db.getAllUsersWithNotifications();
    log('INFO', `Processing ${users.length} users for weekly reminders`);

    for (const userData of users) {
      try {
        const state = await contract.getNodeState(userData.walletAddress);

        if (state.lastActivityTimestamp === 0n) continue; // Skip unregistered

        const daysUntilInactive = Math.floor(Number(state.timeUntilInactive) / 86400);
        const inactivityPeriodDays = Math.floor(Number(state.inactivityPeriod) / 86400);
        const urgentThreshold = Math.min(7, inactivityPeriodDays / 4);

        let message = '';
        const keyboard = new InlineKeyboard().url('✅ Check In Now', CONFIG.frontendUrl);

        if (daysUntilInactive <= urgentThreshold) {
          message =
            `🚨 *URGENT: ${daysUntilInactive} days until inactive!*\n\n` +
            `Your WillChain vault needs attention.\n` +
            `Period: ${inactivityPeriodDays} days\n\n` +
            `_Tip: Any on-chain activity will auto-confirm._\n` +
            `Or click below for manual check-in.`;
        } else if (daysUntilInactive <= 14) {
          message =
            `⚠️ *Reminder: ${daysUntilInactive} days remaining*\n\n` +
            `Your vault is active.\n` +
            `Period setting: ${inactivityPeriodDays} days\n\n` +
            `_If you're actively using your wallet, no action needed!_`;
        } else {
          if (inactivityPeriodDays >= 180) {
            log('INFO', `Skipping weekly reminder for ${userData.telegramId} (${inactivityPeriodDays} day period)`);
            continue;
          }
          message =
            `👋 *Weekly Status Update*\n\n` +
            `Your vault: Active ✅\n` +
            `Days remaining: ${daysUntilInactive}\n` +
            `Period: ${inactivityPeriodDays} days\n\n` +
            `_Using your wallet? Activity is tracked automatically._`;
        }

        await bot.api.sendMessage(userData.telegramId, message, {
          parse_mode: 'Markdown',
          reply_markup: keyboard,
        });

        db.updateLastReminder(userData.telegramId);
        log('SUCCESS', `Sent weekly reminder to user ${userData.telegramId}`);

      } catch (error) {
        log('ERROR', `Failed to send reminder to ${userData.telegramId}`, error.message);
      }

      // Prevent RPC rate limiting for large user bases
      await new Promise(resolve => setTimeout(resolve, 300));
    }

    log('INFO', 'Weekly reminder job completed');
  });
}

// Daily critical status check — every day at 9:00 AM UTC
function scheduleDailyCriticalCheck() {
  cron.schedule('0 9 * * *', async () => {
    log('INFO', 'Running daily critical status check...');

    if (!contract) return;

    const users = db.getAllUsersWithNotifications();

    for (const userData of users) {
      try {
        const state = await contract.getNodeState(userData.walletAddress);

        if (state.lastActivityTimestamp === 0n) continue;

        const inactivityPeriodDays = Math.floor(Number(state.inactivityPeriod) / 86400);

        if (needsCriticalAlert(state)) {
          const daysUntilAbandoned = Math.floor(Number(state.timeUntilAbandoned) / 86400);
          const totalTimeoutDays = inactivityPeriodDays + 30 + 30; // inactivity + grace + claim

          await bot.api.sendMessage(userData.telegramId,
            `🔴 *CRITICAL: Your vault has entered GRACE PERIOD!*\n\n` +
            `You have *${daysUntilAbandoned} days* before your successor can claim your assets.\n\n` +
            `Your settings: ${inactivityPeriodDays} day inactivity period\n` +
            `Total timeout: ${totalTimeoutDays} days\n\n` +
            `If unclaimed, assets will be recycled:\n` +
            `• 47% burned\n` +
            `• 47% to active holders\n` +
            `• 5% protocol treasury\n` +
            `• 1% to recycler\n\n` +
            `*ACT NOW to save your vault!*\n` +
            `_Any transaction from your wallet will auto-confirm activity._`,
            {
              parse_mode: 'Markdown',
              reply_markup: new InlineKeyboard().url('🆘 CONFIRM ACTIVITY NOW', CONFIG.frontendUrl),
            }
          );

          if (userData.email) {
            await email.sendGracePeriodAlert(userData.email, {
              ownerAddress: userData.walletAddress,
              daysUntilAbandoned,
            });
          }

          log('WARN', `Sent grace period alert to user ${userData.telegramId}`);
        }

      } catch (error) {
        log('ERROR', `Critical check failed for ${userData.telegramId}`, error.message);
      }

      // Prevent RPC rate limiting
      await new Promise(resolve => setTimeout(resolve, 300));
    }

    log('INFO', 'Daily critical status check completed');
  });
}

// Recycle pending commits — every 30 seconds (phase 2 execution)
function scheduleRecycleCommitProcessor() {
  if (!CONFIG.recycleEnabled) return;

  setInterval(async () => {
    try {
      await recycle.processPendingCommits();
    } catch (error) {
      log('ERROR', '[Recycle] Commit processor failed', error.message);
    }
  }, 30_000);

  log('INFO', '[Recycle] Commit processor scheduled (every 30s)');
}

function startAll() {
  scheduleWeeklyReminder();
  scheduleDailyCriticalCheck();
  scheduleRecycleCommitProcessor();
  log('INFO', 'Scheduled jobs started (weekly reminder + daily critical check + recycle processor)');
}

module.exports = { init, startAll };
