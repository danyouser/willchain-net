/**
 * WillChain Bot — Command Handlers
 * Registers all Telegram bot commands and callback queries.
 */

const { InlineKeyboard } = require('grammy');
const { ethers } = require('ethers');
const { deriveVaultStatus, approachingInactivity } = require('../../shared/vault-status');
const db = require('./database');
const { verifyWalletLinkSignature } = require('./eip712');
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
  if (!contract) {
    return ctx.reply('⚠️ Contract not configured. Please wait for mainnet launch.');
  }
  try {
    const stats = await contract.getNetworkStatistics();
    const botStats = db.getStats();
    await ctx.reply(
      `📊 *WillChain Network Statistics*\n\n` +
      `💰 Total Supply: ${formatTokenAmount(stats.totalSupply_)} WILL\n` +
      `🔥 Burned: ${formatTokenAmount(stats.removedFromCirculation)} WILL\n` +
      `♻️ Recycled: ${formatTokenAmount(stats.recycledToNetwork)} WILL\n` +
      `✅ Successful Transfers: ${stats.successfulTransfers.toString()}\n\n` +
      `🤖 *Bot Statistics*\n` +
      `• Registered users: ${botStats.totalUsers}\n` +
      `• Active notifications: ${botStats.usersWithNotifications}`,
      { parse_mode: 'Markdown' }
    );
  } catch (error) {
    log('ERROR', 'Stats fetch failed', error.message);
    await ctx.reply('❌ Failed to fetch statistics. Please try again later.');
  }
}

async function sendHelp(ctx) {
  await ctx.reply(
    `❓ *How WillChain Works*\n\n` +
    `*Proof of Activity:*\n` +
    `• Any on-chain activity (transfers, swaps, mints) automatically confirms you're alive\n` +
    `• Manual check-in only needed if your wallet is completely dormant\n` +
    `• Choose your inactivity period: 30, 90, 180, or 365 days\n\n` +
    `*Timeline after your period expires:*\n` +
    `1️⃣ Grace Period (30 days) - Warnings sent\n` +
    `2️⃣ Claim Period (30 days) - Successor can claim\n` +
    `3️⃣ Only if unclaimed - Assets recycled\n\n` +
    `*What happens to recycled assets:*\n` +
    `🔥 47% burned permanently\n` +
    `👥 47% distributed to active holders\n` +
    `🏛 5% protocol treasury\n` +
    `🦅 1% to whoever triggered recycling\n\n` +
    `*Bot Commands:*\n` +
    `/link <address> - Start wallet link (issues a sign challenge)\n` +
    `/verify <sig> - Complete wallet link (submit signature)\n` +
    `/unlink - Remove wallet link\n` +
    `/email <address> - Set email notifications\n` +
    `/status - Check vault status\n` +
    `/stats - Network statistics\n` +
    `/notifications - Toggle reminders\n\n` +
    `Stay active, stay protected! 🔒`,
    { parse_mode: 'Markdown' }
  );
}

// ---- Command registrations ----

function register() {
  // /start
  bot.command('start', async (ctx) => {
    log('INFO', `User ${ctx.from.id} started bot`);
    const keyboard = new InlineKeyboard()
      .text('🔗 Link Wallet', 'link_wallet')
      .row()
      .text('📊 Network Stats', 'stats')
      .text('❓ How it Works', 'help');

    await ctx.reply(
      `🔒 *Welcome to WillChain Bot*\n\n` +
      `I'll monitor your wallet activity and keep your vault protected.\n\n` +
      `*What I do:*\n` +
      `• Automatic Proof of Activity tracking\n` +
      `• Status alerts when you enter grace period\n` +
      `• Network statistics updates\n\n` +
      `*Note:* If you're actively using your wallet, activity is tracked automatically. Manual check-in is only needed for dormant wallets.\n\n` +
      `Link your wallet to get started!`,
      { parse_mode: 'Markdown', reply_markup: keyboard }
    );
  });

  // /link <address>
  bot.command('link', async (ctx) => {
    const userId = ctx.from.id;
    if (isRateLimited(userId)) return ctx.reply('⏳ Too many requests. Please wait a minute and try again.');

    const address = ctx.match?.trim();
    if (!address) {
      return ctx.reply(
        '⚠️ Please provide your wallet address:\n\n`/link 0x1234...abcd`',
        { parse_mode: 'Markdown' }
      );
    }
    if (!ethers.isAddress(address)) {
      return ctx.reply('❌ Invalid Ethereum address. Please check and try again.');
    }

    const existingUser = db.getUser(userId);
    if (existingUser && existingUser.walletAddress.toLowerCase() !== address.toLowerCase()) {
      const linkedAt = new Date(existingUser.linkedAt).getTime();
      if (Date.now() - linkedAt < LINK_COOLDOWN_MS) {
        const hoursLeft = Math.ceil((LINK_COOLDOWN_MS - (Date.now() - linkedAt)) / 3600000);
        return ctx.reply(`⏳ You can change your linked wallet in ${hoursLeft}h. This prevents address hijacking.`);
      }
    }

    const nonce = ethers.hexlify(ethers.randomBytes(32));
    db.saveChallenge(userId, address, nonce);
    log('INFO', `User ${userId} requested link challenge for ${address}`);

    const linkUrl = `${CONFIG.frontendUrl}?tgid=${userId}&addr=${address}&nonce=${nonce}`;
    await ctx.reply(
      `🔐 *Підтвердіть право власності на гаманець*\n\n` +
      `Відкрийте посилання у браузері та підпишіть запит своїм гаманцем:\n\n` +
      `${linkUrl}\n\n` +
      `_Посилання дійсне 5 хвилин._`,
      { parse_mode: 'Markdown' }
    );
  });

  // /verify <signature>
  bot.command('verify', async (ctx) => {
    const userId = ctx.from.id;
    if (isRateLimited(userId)) return ctx.reply('⏳ Too many requests. Please wait a minute and try again.');

    const sig = ctx.match?.trim();
    if (!sig) return ctx.reply('⚠️ Please provide the signature:\n\n`/verify 0x...`', { parse_mode: 'Markdown' });

    const challenge = db.getChallenge(userId);
    if (!challenge) {
      return ctx.reply(
        '❌ No pending challenge found or it has expired.\n\nStart again with `/link 0xYourAddress`',
        { parse_mode: 'Markdown' }
      );
    }

    const { walletAddress, nonce } = challenge;
    const result = verifyWalletLinkSignature(walletAddress, userId, nonce, sig);
    if (!result.ok) {
      if (result.reason === 'address_mismatch') {
        log('WARN', `User ${userId} failed ownership proof for ${walletAddress}`);
        return ctx.reply(
          '❌ Signature does not match the requested address.\n\n' +
          'Make sure you signed with the correct wallet and try `/link` again.',
          { parse_mode: 'Markdown' }
        );
      }
      return ctx.reply('❌ Invalid signature format. Please try again.');
    }

    db.deleteChallenge(userId);
    db.saveUser(userId, walletAddress, true);
    log('SUCCESS', `User ${userId} verified ownership and linked wallet ${walletAddress}`);

    await ctx.reply(
      `✅ *Wallet Linked Successfully*\n\n` +
      `Address: \`${formatAddress(walletAddress)}\`\n\n` +
      `You'll now receive:\n` +
      `• Weekly activity reminders\n` +
      `• Grace period alerts\n` +
      `• Status updates\n\n` +
      `Use /status to check your vault status anytime.`,
      { parse_mode: 'Markdown' }
    );
  });

  // /status
  bot.command('status', async (ctx) => {
    const userId = ctx.from.id;
    if (isRateLimited(userId)) return ctx.reply('⏳ Too many requests. Please wait a minute.');

    const userData = db.getUser(userId);
    if (!userData) return ctx.reply('⚠️ No wallet linked. Use /link <address> first.', { parse_mode: 'Markdown' });
    if (!contract) return ctx.reply('⚠️ Contract not configured. Please wait for mainnet launch.');

    try {
      const state = await contract.getNodeState(userData.walletAddress);
      const daysUntilInactive  = Math.floor(Number(state.timeUntilInactive)  / 86400);
      const daysUntilAbandoned = Math.floor(Number(state.timeUntilAbandoned) / 86400);
      const successor = state.designatedSuccessor;
      const hasSuccessor = successor !== ethers.ZeroAddress;
      const inactivityPeriodDays = Math.floor(Number(state.inactivityPeriod) / 86400);
      const vaultStatus = deriveVaultStatus(state);

      let statusEmoji = '🟢';
      let statusText = 'Active';
      let urgency = '';

      if (vaultStatus.isUnregistered) {
        statusEmoji = '⚪️';
        statusText = 'Not registered';
        urgency = '\n\nℹ️ *Your wallet is not registered yet. Call confirmActivity() on the dApp to activate your vault.*';
      } else if (vaultStatus.isAbandoned || vaultStatus.inGrace) {
        statusEmoji = '🔴';
        statusText = vaultStatus.inGrace ? 'Grace Period' : 'Abandoned';
        urgency = '\n\n⚠️ *URGENT: Confirm activity NOW to prevent asset loss!*';
      } else if (approachingInactivity(state, 7)) {
        statusEmoji = '🟡';
        statusText = 'Warning';
        urgency = '\n\n⚠️ *Activity confirmation needed within 7 days!*';
      }

      const explorerLink = `${CONFIG.explorerUrl}/address/${userData.walletAddress}`;
      const keyboard = new InlineKeyboard()
        .url('✅ Confirm Activity', CONFIG.frontendUrl)
        .row()
        .url('🔍 View on Explorer', explorerLink);

      await ctx.reply(
        `${statusEmoji} *Vault Status: ${statusText}*\n\n` +
        `📍 Address: \`${formatAddress(userData.walletAddress)}\`\n` +
        (state.lastActivityTimestamp === 0n
          ? `⏱ Time until inactive: *—*\n`
          : `⏱ Time until inactive: *${daysUntilInactive} days*\n`) +
        `📅 Inactivity period: *${inactivityPeriodDays} days*\n` +
        `👤 Successor: ${hasSuccessor ? `\`${formatAddress(successor)}\`` : 'Not set'}\n` +
        `🏷 Tier: ${state.serviceTier}\n\n` +
        `_Tip: Any on-chain activity auto-confirms your presence._` +
        urgency,
        { parse_mode: 'Markdown', reply_markup: keyboard }
      );

    } catch (error) {
      log('ERROR', `Status check failed for user ${userId}`, error.message);
      await ctx.reply('❌ Failed to fetch status. Please try again later.');
    }
  });

  // /stats
  bot.command('stats', async (ctx) => {
    if (isRateLimited(ctx.from.id)) return ctx.reply('⏳ Too many requests. Please wait a minute.');
    await sendStats(ctx);
  });

  // /notifications
  bot.command('notifications', async (ctx) => {
    const userId = ctx.from.id;
    if (isRateLimited(userId)) return ctx.reply('⏳ Too many requests. Please wait a minute.');
    const userData = db.getUser(userId);
    if (!userData) return ctx.reply('⚠️ No wallet linked. Use /link <address> first.');
    const newValue = db.toggleNotifications(userId);
    const status = newValue ? 'enabled ✅' : 'disabled ❌';
    log('INFO', `User ${userId} toggled notifications: ${status}`);
    await ctx.reply(`🔔 Notifications ${status}`);
  });

  // /unlink
  bot.command('unlink', async (ctx) => {
    const userId = ctx.from.id;
    if (isRateLimited(userId)) return ctx.reply('⏳ Too many requests. Please wait a minute.');
    if (!db.getUser(userId)) return ctx.reply('⚠️ No wallet linked.');
    db.deleteUser(userId);
    log('INFO', `User ${userId} unlinked wallet`);
    await ctx.reply('✅ Wallet unlinked. You will no longer receive notifications.');
  });

  // /email [address|remove]
  bot.command('email', async (ctx) => {
    const userId = ctx.from.id;
    if (isRateLimited(userId)) return ctx.reply('⏳ Too many requests. Please wait a minute.');
    const userData = db.getUser(userId);
    if (!userData) return ctx.reply('⚠️ No wallet linked. Use /link <address> first.');

    const emailAddr = ctx.match?.trim();
    if (!emailAddr) {
      const current = userData.email ? `Current: \`${userData.email}\`` : 'No email set yet.';
      return ctx.reply(
        `📧 *Email Notifications*\n\n${current}\n\nTo set or update your email:\n\`/email your@email.com\`\n\nYou'll receive alerts for:\n• Successor designated\n• Claim initiated\n• Grace period warnings`,
        { parse_mode: 'Markdown' }
      );
    }
    if (emailAddr === 'remove') {
      db.setUserEmail(userId, null);
      return ctx.reply('✅ Email notifications removed.');
    }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(emailAddr)) {
      return ctx.reply('❌ Invalid email address. Please check and try again.');
    }
    db.setUserEmail(userId, emailAddr);
    log('SUCCESS', `User ${userId} set email`);
    await ctx.reply(
      `✅ *Email saved*\n\nYou'll receive notifications at: \`${emailAddr}\`\n\nTo remove email notifications, use \`/email remove\`.`,
      { parse_mode: 'Markdown' }
    );
  });

  // /help
  bot.command('help', sendHelp);

  // ---- Callback queries ----

  bot.callbackQuery('link_wallet', async (ctx) => {
    await ctx.answerCallbackQuery();
    await ctx.reply(
      '🔗 *Link Your Wallet*\n\n' +
      'Step 1 — request a sign challenge:\n' +
      '`/link 0xYourWalletAddress`\n\n' +
      'Step 2 — sign the message shown and submit:\n' +
      '`/verify 0xSignature`',
      { parse_mode: 'Markdown' }
    );
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
