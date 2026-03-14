/**
 * WillChain Bot — Command Handlers
 * Registers all Telegram bot commands and callback queries.
 */

const { InlineKeyboard } = require('grammy');
const { ethers } = require('ethers');
const { deriveVaultStatus, approachingInactivity } = require('../../shared/vault-status');
const db = require('./database');
const { verifyWalletLinkSignature } = require('./eip712');
const { t, getLang } = require('./i18n');
const { log, formatAddress, formatTokenAmount } = require('./utils');

const RATE_LIMIT_MAX = 10; // max 10 commands/minute per user
const LINK_COOLDOWN_MS = 24 * 60 * 60 * 1000; // 24 hours

function isRateLimited(userId) {
  return db.checkAndIncrementRateLimit(userId, RATE_LIMIT_MAX);
}

let bot;
let contract;
let CONFIG;

function init(botInstance, contractInstance, config) {
  bot = botInstance;
  contract = contractInstance;
  CONFIG = config;
}

// ---- Shared renderers (used by both commands and callbacks) ----

async function sendStats(ctx) {
  const lang = getLang(ctx);
  if (!contract) {
    return ctx.reply(t(lang, 'contract_not_configured'));
  }
  try {
    const stats = await contract.getNetworkStatistics();
    const botStats = db.getStats();
    await ctx.reply(
      t(lang, 'stats.title', {
        totalSupply: formatTokenAmount(stats.totalSupply_),
        burned: formatTokenAmount(stats.removedFromCirculation),
        recycled: formatTokenAmount(stats.recycledToNetwork),
        transfers: stats.successfulTransfers.toString(),
        users: botStats.totalUsers,
        notifications: botStats.usersWithNotifications,
      }),
      { parse_mode: 'Markdown' }
    );
  } catch (error) {
    log('ERROR', 'Stats fetch failed', error.message);
    await ctx.reply(t(lang, 'stats.fetch_failed'));
  }
}

async function sendHelp(ctx) {
  const lang = getLang(ctx);
  await ctx.reply(t(lang, 'help.text'), { parse_mode: 'Markdown' });
}

// ---- Command registrations ----

function register() {
  // /start
  bot.command('start', async (ctx) => {
    const lang = getLang(ctx);
    log('INFO', `User ${ctx.from.id} started bot`);
    const keyboard = new InlineKeyboard()
      .text(t(lang, 'start.btn_link'), 'link_wallet')
      .row()
      .text(t(lang, 'start.btn_stats'), 'stats')
      .text(t(lang, 'start.btn_help'), 'help');

    await ctx.reply(t(lang, 'start.welcome'), { parse_mode: 'Markdown', reply_markup: keyboard });
  });

  // /link <address>
  bot.command('link', async (ctx) => {
    const userId = ctx.from.id;
    const lang = getLang(ctx);
    if (isRateLimited(userId)) return ctx.reply(t(lang, 'rate_limited'));

    const address = ctx.match?.trim();
    if (!address) {
      return ctx.reply(t(lang, 'link.provide_address'), { parse_mode: 'Markdown' });
    }
    if (!ethers.isAddress(address)) {
      return ctx.reply(t(lang, 'link.invalid_address'));
    }

    const existingUser = db.getUser(userId);
    if (existingUser && existingUser.walletAddress.toLowerCase() !== address.toLowerCase()) {
      const linkedAt = new Date(existingUser.linkedAt).getTime();
      if (Date.now() - linkedAt < LINK_COOLDOWN_MS) {
        const hoursLeft = Math.ceil((LINK_COOLDOWN_MS - (Date.now() - linkedAt)) / 3600000);
        return ctx.reply(t(lang, 'link.cooldown', { hours: hoursLeft }));
      }
    }

    const nonce = ethers.hexlify(ethers.randomBytes(32));
    db.saveChallenge(userId, address, nonce);
    log('INFO', `User ${userId} requested link challenge for ${address}`);

    const linkUrl = `${CONFIG.frontendUrl}?tgid=${userId}&addr=${address}&nonce=${nonce}`;
    await ctx.reply(t(lang, 'link.challenge', { url: linkUrl }), { parse_mode: 'Markdown' });
  });

  // /verify <signature>
  bot.command('verify', async (ctx) => {
    const userId = ctx.from.id;
    const lang = getLang(ctx);
    if (isRateLimited(userId)) return ctx.reply(t(lang, 'rate_limited'));

    const sig = ctx.match?.trim();
    if (!sig) return ctx.reply(t(lang, 'verify.provide_signature'), { parse_mode: 'Markdown' });

    const challenge = db.getChallenge(userId);
    if (!challenge) {
      return ctx.reply(t(lang, 'verify.no_challenge'), { parse_mode: 'Markdown' });
    }

    const { walletAddress, nonce } = challenge;
    const result = verifyWalletLinkSignature(walletAddress, userId, nonce, sig);
    if (!result.ok) {
      if (result.reason === 'address_mismatch') {
        log('WARN', `User ${userId} failed ownership proof for ${walletAddress}`);
        return ctx.reply(t(lang, 'verify.address_mismatch'), { parse_mode: 'Markdown' });
      }
      return ctx.reply(t(lang, 'verify.invalid_signature'));
    }

    db.deleteChallenge(userId);
    db.saveUser(userId, walletAddress, true, lang);
    log('SUCCESS', `User ${userId} verified ownership and linked wallet ${walletAddress}`);

    await ctx.reply(
      t(lang, 'verify.success', { address: formatAddress(walletAddress) }),
      { parse_mode: 'Markdown' }
    );
  });

  // /status
  bot.command('status', async (ctx) => {
    const userId = ctx.from.id;
    const lang = getLang(ctx);
    if (isRateLimited(userId)) return ctx.reply(t(lang, 'rate_limited'));

    const userData = db.getUser(userId);
    if (!userData) return ctx.reply(t(lang, 'status.not_linked'), { parse_mode: 'Markdown' });
    if (!contract) return ctx.reply(t(lang, 'contract_not_configured'));

    try {
      const state = await contract.getNodeState(userData.walletAddress);
      const daysUntilInactive  = Math.floor(Number(state.timeUntilInactive)  / 86400);
      const successor = state.designatedSuccessor;
      const hasSuccessor = successor !== ethers.ZeroAddress;
      const inactivityPeriodDays = Math.floor(Number(state.inactivityPeriod) / 86400);
      const vaultStatus = deriveVaultStatus(state);

      let statusEmoji = '🟢';
      let statusText = t(lang, 'status.active');
      let urgency = '';

      if (vaultStatus.isUnregistered) {
        statusEmoji = '⚪️';
        statusText = t(lang, 'status.not_registered');
        urgency = t(lang, 'status.unregistered_hint');
      } else if (vaultStatus.isAbandoned || vaultStatus.inGrace) {
        statusEmoji = '🔴';
        statusText = vaultStatus.inGrace ? t(lang, 'status.grace_period') : t(lang, 'status.abandoned');
        urgency = t(lang, 'status.urgent_hint');
      } else if (approachingInactivity(state, 7)) {
        statusEmoji = '🟡';
        statusText = t(lang, 'status.warning');
        urgency = t(lang, 'status.warning_hint');
      }

      const explorerLink = `${CONFIG.explorerUrl}/address/${userData.walletAddress}`;
      const keyboard = new InlineKeyboard()
        .url(t(lang, 'status.btn_confirm'), CONFIG.frontendUrl)
        .row()
        .url(t(lang, 'status.btn_explorer'), explorerLink);

      const daysText = state.lastActivityTimestamp === 0n
        ? '*—*'
        : `*${t(lang, 'status.days', { days: daysUntilInactive })}*`;

      await ctx.reply(
        t(lang, 'status.body', {
          emoji: statusEmoji,
          status: statusText,
          address: formatAddress(userData.walletAddress),
          daysInactive: daysText,
          periodDays: inactivityPeriodDays,
          successor: hasSuccessor ? `\`${formatAddress(successor)}\`` : t(lang, 'status.not_set'),
          tier: state.serviceTier,
        }) + urgency,
        { parse_mode: 'Markdown', reply_markup: keyboard }
      );

    } catch (error) {
      log('ERROR', `Status check failed for user ${userId}`, error.message);
      await ctx.reply(t(lang, 'status.fetch_failed'));
    }
  });

  // /stats
  bot.command('stats', async (ctx) => {
    const lang = getLang(ctx);
    if (isRateLimited(ctx.from.id)) return ctx.reply(t(lang, 'rate_limited'));
    await sendStats(ctx);
  });

  // /notifications
  bot.command('notifications', async (ctx) => {
    const userId = ctx.from.id;
    const lang = getLang(ctx);
    if (isRateLimited(userId)) return ctx.reply(t(lang, 'rate_limited'));
    const userData = db.getUser(userId);
    if (!userData) return ctx.reply(t(lang, 'status.not_linked'));
    const newValue = db.toggleNotifications(userId);
    const status = newValue ? t(lang, 'notifications.enabled') : t(lang, 'notifications.disabled');
    log('INFO', `User ${userId} toggled notifications: ${status}`);
    await ctx.reply(t(lang, 'notifications.toggled', { status }));
  });

  // /unlink
  bot.command('unlink', async (ctx) => {
    const userId = ctx.from.id;
    const lang = getLang(ctx);
    if (isRateLimited(userId)) return ctx.reply(t(lang, 'rate_limited'));
    if (!db.getUser(userId)) return ctx.reply(t(lang, 'unlink.no_wallet'));
    db.deleteUser(userId);
    log('INFO', `User ${userId} unlinked wallet`);
    await ctx.reply(t(lang, 'unlink.success'));
  });

  // /email [address|remove]
  bot.command('email', async (ctx) => {
    const userId = ctx.from.id;
    const lang = getLang(ctx);
    if (isRateLimited(userId)) return ctx.reply(t(lang, 'rate_limited'));
    const userData = db.getUser(userId);
    if (!userData) return ctx.reply(t(lang, 'status.not_linked'));

    const emailAddr = ctx.match?.trim();
    if (!emailAddr) {
      const current = userData.email
        ? t(lang, 'email.current', { email: userData.email })
        : t(lang, 'email.not_set');
      return ctx.reply(t(lang, 'email.info', { current }), { parse_mode: 'Markdown' });
    }
    if (emailAddr === 'remove') {
      db.setUserEmail(userId, null);
      return ctx.reply(t(lang, 'email.removed'));
    }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(emailAddr)) {
      return ctx.reply(t(lang, 'email.invalid'));
    }
    db.setUserEmail(userId, emailAddr);
    log('SUCCESS', `User ${userId} set email`);
    await ctx.reply(t(lang, 'email.saved', { email: emailAddr }), { parse_mode: 'Markdown' });
  });

  // /help
  bot.command('help', sendHelp);

  // ---- Callback queries ----

  bot.callbackQuery('link_wallet', async (ctx) => {
    const lang = getLang(ctx);
    await ctx.answerCallbackQuery();
    await ctx.reply(t(lang, 'callback.link_wallet'), { parse_mode: 'Markdown' });
  });

  bot.callbackQuery('stats', async (ctx) => {
    await ctx.answerCallbackQuery();
    await sendStats(ctx);
  });

  bot.callbackQuery('help', async (ctx) => {
    await ctx.answerCallbackQuery();
    await sendHelp(ctx);
  });
}

module.exports = { init, register };
