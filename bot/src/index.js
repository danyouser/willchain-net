/**
 * WillChain Telegram Bot — Entry Point
 *
 * Orchestrates all modules:
 *   commands.js     — Telegram command & callback handlers
 *   notifications.js — On-chain event → Telegram/email alerts
 *   events.js       — Historical catch-up + real-time listeners
 *   cron.js         — Scheduled jobs (weekly reminder, daily critical check)
 *   utils.js        — Logging, formatters
 */

require('dotenv').config();
const { Bot } = require('grammy');
const { ethers } = require('ethers');
const { startApi, reportContractStatus, reportProvider } = require('./api');
const db = require('./database');
const { log } = require('./utils');
const commands = require('./commands');
const notifications = require('./notifications');
const events = require('./events');
const cron = require('./cron');
const recycle = require('./recycle');

// ============ Configuration ============

const CONFIG = {
  botToken: process.env.TELEGRAM_BOT_TOKEN,
  contractAddress: process.env.CONTRACT_ADDRESS,
  rpcUrl: process.env.RPC_URL || 'https://sepolia.base.org',
  frontendUrl: process.env.FRONTEND_URL || 'https://willchain.net',
  explorerUrl: process.env.EXPLORER_URL || 'https://sepolia.basescan.org',
  deploymentBlock: parseInt(process.env.DEPLOYMENT_BLOCK || '0'),
  eventCatchupBlocks: parseInt(process.env.EVENT_CATCHUP_BLOCKS || '10000'),
  privateKey: process.env.PRIVATE_KEY || '',
  recycleEnabled: process.env.RECYCLE_ENABLED === 'true',
};

// Contract ABI — WillChain
const CONTRACT_ABI = [
  'function getNodeState(address node) view returns (uint256 lastActivityTimestamp, address designatedSuccessor, bool successorClaimInitiated, uint256 claimInitiationTimestamp, uint256 timeUntilInactive, uint256 timeUntilAbandoned, bool isActive, string serviceTier, uint256 inactivityPeriod)',
  'function getVaultStatus(address _node) view returns (uint8)',
  'function getInactivityPeriod(address node) view returns (uint256)',
  'function getTotalTimeout(address node) view returns (uint256)',
  'function getNetworkStatistics() view returns (uint256 totalSupply_, uint256 recycledToNetwork, uint256 removedFromCirculation, uint256 successfulTransfers, uint256 totalProtocolFees_, uint256 dividendPool_)',
  'function pendingDividends(address _node) view returns (uint256)',
  'function dividendPool() view returns (uint256)',
  'function getProtocolFeeInfo() view returns (address treasury, uint256 feeBps, uint256 totalCollected)',
  'event ActivityConfirmed(address indexed node, uint256 timestamp)',
  'event UserActivityConfirmed(address indexed node, uint256 timestamp)',
  'event SuccessorDesignated(address indexed node, address indexed successor)',
  'event SuccessorClaimInitiated(address indexed node, address indexed successor, uint256 timestamp)',
  'event SuccessorClaimCancelled(address indexed node)',
  'event VaultAccessTransferred(address indexed fromNode, address indexed toNode, uint256 amount)',
  'event InactiveNodeRecycled(address indexed node, uint256 removedFromCirculation, uint256 recycledToNetwork, address indexed maintainer, uint256 maintainerReward)',
  'event RecycleCommitted(address indexed committer, bytes32 commitHash, uint256 commitBlock)',
  'function commitRecycle(bytes32 _commitHash)',
  'function executeRecycle(address _abandonedNode, bytes32 _salt)',
  'function recycleInactiveNode(address _inactiveNode)',
  'function balanceOf(address account) view returns (uint256)',
  'event InactivityPeriodChanged(address indexed node, uint256 newPeriod)',
  'event DividendsClaimed(address indexed node, uint256 amount)',
  'event DividendsDistributed(uint256 amount, uint256 newDividendPerToken)',
  'event ProtocolFeeCollected(address indexed from, uint256 amount)',
  'event NodeRegistered(address indexed node, uint256 timestamp)',
];

// ============ Bootstrap ============

const bot = new Bot(CONFIG.botToken);
let provider;
let contract;

function initializeContract() {
  if (CONFIG.contractAddress) {
    provider = new ethers.JsonRpcProvider(CONFIG.rpcUrl);
    contract = new ethers.Contract(CONFIG.contractAddress, CONTRACT_ABI, provider);
    log('INFO', `Contract initialized at ${CONFIG.contractAddress}`);
    reportProvider(provider);
    provider.getBlockNumber()
      .then(block => reportContractStatus(true, block))
      .catch(() => reportContractStatus(false, 0));
  } else {
    log('WARN', 'CONTRACT_ADDRESS not set - running without blockchain connection');
    reportContractStatus(false, 0);
  }
}

async function main() {
  log('INFO', '🔒 WillChain Bot starting...');

  const stats = db.getStats();
  log('INFO', `Database: ${stats.totalUsers} users, last block: ${stats.lastProcessedBlock || 'none'}`);

  initializeContract();

  if (!CONFIG.botToken) {
    log('ERROR', 'TELEGRAM_BOT_TOKEN not set in .env');
    process.exit(1);
  }

  // Initialize modules
  commands.init(bot, contract, CONFIG);
  commands.register();

  notifications.init(bot, contract, CONFIG);
  events.init(contract, provider, CONFIG);
  cron.init(bot, contract, CONFIG);

  // Auto-recycle module (requires PRIVATE_KEY + RECYCLE_ENABLED=true)
  if (CONFIG.recycleEnabled) {
    recycle.init(contract, provider, CONFIG);
  }

  // Start HTTP API
  startApi(bot);

  // Catch up on missed events before real-time listeners
  await events.catchUpMissedEvents();

  // Real-time blockchain event polling
  events.startEventPolling();

  // Scheduled jobs
  cron.startAll();

  // Set bot command menus — localized for all 11 supported languages
  // Keys: start, link, status, stats, notifications, email, unlink, help
  const menuDescriptions = {
    en: ['Start the bot', 'Link your wallet', 'Check your will status', 'Network statistics', 'Toggle reminders', 'Email notifications', 'Unlink wallet', 'How it works'],
    uk: ['Запустити бота', 'Підключити гаманець', 'Перевірити статус заповіту', 'Статистика мережі', 'Увімкнути/вимкнути нагадування', 'Email-сповіщення', 'Відключити гаманець', 'Як це працює'],
    ru: ['Запустить бота', 'Подключить кошелёк', 'Проверить статус завещания', 'Статистика сети', 'Вкл/выкл напоминания', 'Email-уведомления', 'Отключить кошелёк', 'Как это работает'],
    de: ['Bot starten', 'Wallet verbinden', 'Testament-Status prüfen', 'Netzwerkstatistik', 'Erinnerungen ein/aus', 'E-Mail-Benachrichtigungen', 'Wallet trennen', 'So funktioniert es'],
    fr: ['Démarrer le bot', 'Lier le portefeuille', 'Vérifier le statut du testament', 'Statistiques du réseau', 'Activer/désactiver les rappels', 'Notifications par e-mail', 'Délier le portefeuille', 'Comment ça marche'],
    es: ['Iniciar el bot', 'Vincular billetera', 'Ver estado del testamento', 'Estadísticas de la red', 'Activar/desactivar avisos', 'Notificaciones por email', 'Desvincular billetera', 'Cómo funciona'],
    pt: ['Iniciar o bot', 'Vincular carteira', 'Ver estado do testamento', 'Estatísticas da rede', 'Ativar/desativar lembretes', 'Notificações por email', 'Desvincular carteira', 'Como funciona'],
    pl: ['Uruchom bota', 'Podłącz portfel', 'Sprawdź status testamentu', 'Statystyki sieci', 'Włącz/wyłącz przypomnienia', 'Powiadomienia email', 'Odłącz portfel', 'Jak to działa'],
    it: ['Avvia il bot', 'Collega il portafoglio', 'Controlla stato del testamento', 'Statistiche della rete', 'Attiva/disattiva promemoria', 'Notifiche email', 'Scollega il portafoglio', 'Come funziona'],
    nl: ['Start de bot', 'Koppel portemonnee', 'Controleer testamentstatus', 'Netwerkstatistieken', 'Herinneringen aan/uit', 'E-mailmeldingen', 'Ontkoppel portemonnee', 'Hoe het werkt'],
    tr: ['Botu başlat', 'Cüzdan bağla', 'Vasiyet durumunu kontrol et', 'Ağ istatistikleri', 'Hatırlatıcıları aç/kapat', 'E-posta bildirimleri', 'Cüzdan bağlantısını kes', 'Nasıl çalışır'],
  };
  const cmdNames = ['start', 'link', 'status', 'stats', 'notifications', 'email', 'unlink', 'help'];
  const buildCommands = (lang) => cmdNames.map((c, i) => ({ command: c, description: menuDescriptions[lang][i] }));

  await bot.start({
    onStart: async (botInfo) => {
      log('SUCCESS', `Bot @${botInfo.username} is running!`);
      log('INFO', `Contract: ${CONFIG.contractAddress || 'Not configured'}`);
      log('INFO', `RPC: ${CONFIG.rpcUrl}`);

      // Register command menus with Telegram
      try {
        await bot.api.setMyCommands(buildCommands('en')); // default
        const locales = ['uk', 'ru', 'de', 'fr', 'es', 'pt', 'pl', 'it', 'nl', 'tr'];
        for (const lang of locales) {
          await bot.api.setMyCommands(buildCommands(lang), { language_code: lang });
        }
        // Set bot description (About) — localized
        const descriptions = {
          en: 'WillChain — protect your crypto assets with a blockchain will. Activity tracking, successor alerts, network stats.',
          uk: 'WillChain — захистіть ваші крипто-активи цифровим заповітом. Відстеження активності, сповіщення про спадкоємця, статистика мережі.',
          ru: 'WillChain — защитите ваши крипто-активы цифровым завещанием. Отслеживание активности, уведомления о наследнике, статистика сети.',
          de: 'WillChain — schützen Sie Ihre Krypto-Assets mit einem Blockchain-Testament. Aktivitätsverfolgung, Nachfolger-Benachrichtigungen, Netzwerkstatistik.',
          fr: 'WillChain — protégez vos crypto-actifs avec un testament blockchain. Suivi d\'activité, alertes successeur, statistiques réseau.',
          es: 'WillChain — proteja sus cripto-activos con un testamento blockchain. Seguimiento de actividad, alertas de sucesor, estadísticas de red.',
          pt: 'WillChain — proteja seus cripto-ativos com um testamento blockchain. Rastreamento de atividade, alertas de sucessor, estatísticas de rede.',
          pl: 'WillChain — chroń swoje krypto-aktywa testamentem na blockchainie. Śledzenie aktywności, powiadomienia o spadkobiercy, statystyki sieci.',
          it: 'WillChain — proteggi i tuoi cripto-asset con un testamento blockchain. Monitoraggio attività, avvisi successore, statistiche rete.',
          nl: 'WillChain — bescherm uw crypto-assets met een blockchain-testament. Activiteitstracking, opvolgermeldingen, netwerkstatistieken.',
          tr: 'WillChain — kripto varlıklarınızı blockchain vasiyetiyle koruyun. Aktivite takibi, halef uyarıları, ağ istatistikleri.',
        };
        await bot.api.setMyDescription(descriptions.en);
        for (const lang of locales) {
          await bot.api.setMyDescription(descriptions[lang], { language_code: lang });
        }

        // Set bot short description (profile card) — localized
        const shortDescriptions = {
          en: 'WillChain notifications — check-in reminders, successor alerts, vault status updates.',
          uk: 'WillChain сповіщення — нагадування про активність, повідомлення спадкоємцю, статус заповіту.',
          ru: 'WillChain уведомления — напоминания об активности, оповещения наследнику, статус завещания.',
          de: 'WillChain Benachrichtigungen — Aktivitätserinnerungen, Nachfolger-Warnungen, Testament-Status.',
          fr: 'WillChain notifications — rappels d\'activité, alertes successeur, statut du testament.',
          es: 'WillChain notificaciones — recordatorios de actividad, alertas de sucesor, estado del testamento.',
          pt: 'WillChain notificações — lembretes de atividade, alertas de sucessor, status do testamento.',
          pl: 'WillChain powiadomienia — przypomnienia o aktywności, alerty spadkobiercy, status testamentu.',
          it: 'WillChain notifiche — promemoria attività, avvisi successore, stato del testamento.',
          nl: 'WillChain meldingen — activiteitsherinneringen, opvolgerwaarschuwingen, testamentstatus.',
          tr: 'WillChain bildirimler — aktivite hatırlatıcıları, halef uyarıları, vasiyet durumu.',
        };
        await bot.api.setMyShortDescription(shortDescriptions.en);
        for (const lang of locales) {
          await bot.api.setMyShortDescription(shortDescriptions[lang], { language_code: lang });
        }

        log('INFO', 'Bot command menus and descriptions registered (11 languages)');
      } catch (err) {
        log('WARN', 'Failed to set bot commands/description', err.message);
      }
    },
  });
}

// ============ Graceful Shutdown ============

async function gracefulShutdown(signal) {
  log('INFO', `${signal} received — shutting down gracefully...`);

  // 1. Stop accepting new Telegram updates
  try { bot.stop(); } catch { /* already stopped */ }

  // 2. Stop blockchain event polling
  events.stopEventPolling();

  // 3. Close HTTP API server
  const { server } = require('./api');
  if (server?.listening) {
    await new Promise(resolve => server.close(resolve));
    log('INFO', 'HTTP server closed');
  }

  // 4. Close SQLite database (flush WAL)
  try { db.db.close(); log('INFO', 'Database closed'); } catch { /* ignore */ }

  log('SUCCESS', 'Clean shutdown complete');
  process.exit(0);
}

process.on('SIGINT', () => gracefulShutdown('SIGINT'));
process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));

main().catch((error) => {
  log('ERROR', 'Fatal error', error);
  process.exit(1);
});
