/**
 * English and Turkish texts. Pure module: a message is a key plus parameters, and
 * a parameter may itself be a message, so sentences can be composed without
 * string concatenation in the UI code. The Turkish texts use the board-game names
 * players know: pul (checker), zar (dice), kırma (hit) and mars (gammon).
 */

/** Supported languages; the first one is the default. */
export const LANGUAGES = Object.freeze(['en', 'tr']);

/**
 * @typedef {Object} Message
 * @property {string} key - a key of STRINGS.en
 * @property {Object<string, string|number|Message>} [params] - values for the {placeholders}
 */

/** Every text shown on the page, per language. Both tables have the same keys. */
export const STRINGS = Object.freeze({
  en: Object.freeze({
    newGame: 'New game',
    langButton: 'TR',
    langButtonLabel: 'TR: Switch to Turkish',
    boardLabel: 'Tavla board',
    playersLabel: 'Players',
    footerSource: 'Source on GitHub',
    you: 'You',
    computer: 'Computer',
    white: 'White',
    black: 'Black',
    pipCount: '{pips} pips',
    playerLabel: '{name}: {pips} pips to bear off',
    easy: 'Easy',
    normal: 'Normal',
    undo: 'Undo',
    roll: 'Roll',
    confirm: 'Confirm',
    pass: 'Pass',
    playAgain: 'Play again',
    opponent: 'Opponent',
    twoPlayers: '2 players',
    level: 'Level',
    start: 'Start',
    cancel: 'Cancel',
    keysTitle: 'Keyboard',
    keyHints: 'Arrows pick a checker, then a target. Enter plays, Esc cancels, 1–6 moves by that die. R rolls, U undoes, N starts a new game.',
    rollPrompt: 'Roll the dice',
    movePrompt: 'Play {dice}',
    enterPrompt: 'Enter from the bar first: {dice}',
    confirmPrompt: 'Done? Confirm or undo',
    noMoves: 'No legal move with {dice}: pass',
    named: '{name}: {text}',
    hitPrefix: 'Hit! {text}',
    openingYou: 'You start with {dice}',
    openingComputer: 'Computer starts with {dice}',
    openingPlayer: '{name} starts with {dice}',
    aiRolling: 'Computer is rolling…',
    aiPlaying: 'Computer plays {dice}…',
    aiNoMoves: 'Computer cannot move with {dice}',
    aiPlayed: 'Computer played {dice}. {text}',
    aiPassed: 'Computer could not move with {dice}. {text}',
    aiHit: 'Computer hit your checker! {text}',
    winYou: 'You win!',
    winComputer: 'Computer wins',
    winPlayer: '{name} wins!',
    resultMars: 'Mars (gammon)! Double win: 2 points',
    resultSingle: 'Single win: 1 point',
    gameOver: '{title} {detail}',
  }),
  tr: Object.freeze({
    newGame: 'Yeni oyun',
    langButton: 'EN',
    langButtonLabel: 'EN: İngilizceye geç',
    boardLabel: 'Tavla tahtası',
    playersLabel: 'Oyuncular',
    footerSource: 'Kaynak kodu GitHub’da',
    you: 'Sen',
    computer: 'Bilgisayar',
    white: 'Beyaz',
    black: 'Siyah',
    pipCount: '{pips} pip',
    playerLabel: '{name}: toplamaya {pips} pip',
    easy: 'Kolay',
    normal: 'Normal',
    undo: 'Geri al',
    roll: 'Zar at',
    confirm: 'Onayla',
    pass: 'Pas geç',
    playAgain: 'Tekrar oyna',
    opponent: 'Rakip',
    twoPlayers: '2 oyuncu',
    level: 'Seviye',
    start: 'Başla',
    cancel: 'Vazgeç',
    keysTitle: 'Klavye',
    keyHints: 'Oklarla önce pulu, sonra hedefi seç. Enter oynar, Esc vazgeçer, 1–6 o zarla oynar. R zar atar, U geri alır, N yeni oyun başlatır.',
    rollPrompt: 'Zarı at',
    movePrompt: '{dice} oyna',
    enterPrompt: 'Önce bardaki pulu oyuna sok: {dice}',
    confirmPrompt: 'Bitti mi? Onayla ya da geri al',
    noMoves: '{dice} ile oynanacak hamle yok: pas geç',
    named: '{name}: {text}',
    hitPrefix: 'Kırma! {text}',
    openingYou: '{dice} ile sen başlıyorsun',
    openingComputer: 'Bilgisayar {dice} ile başlıyor',
    openingPlayer: '{name} {dice} ile başlıyor',
    aiRolling: 'Bilgisayar zar atıyor…',
    aiPlaying: 'Bilgisayar {dice} oynuyor…',
    aiNoMoves: 'Bilgisayar {dice} ile oynayamıyor',
    aiPlayed: 'Bilgisayar {dice} oynadı. {text}',
    aiPassed: 'Bilgisayar {dice} ile oynayamadı. {text}',
    aiHit: 'Bilgisayar pulunu kırdı! {text}',
    winYou: 'Kazandın!',
    winComputer: 'Bilgisayar kazandı',
    winPlayer: '{name} kazandı!',
    resultMars: 'Mars! Çifte galibiyet: 2 puan',
    resultSingle: 'Tek oyun: 1 puan',
    gameOver: '{title} {detail}',
  }),
});

/**
 * True for a supported language code.
 * @param {unknown} value
 * @returns {boolean}
 */
export function isLanguage(value) {
  return LANGUAGES.includes(value);
}

/**
 * Turns a message into text. Unknown languages fall back to English; an unknown
 * key is returned as it is, so a missing text is visible instead of silent.
 * @param {string} lang - 'en' or 'tr'
 * @param {Message} message
 * @returns {string}
 */
export function translate(lang, message) {
  const table = STRINGS[lang] ?? STRINGS.en;
  const template = table[message.key] ?? STRINGS.en[message.key];
  if (template === undefined) return message.key;
  return template.replace(/\{(\w+)\}/g, (placeholder, name) => {
    const value = message.params?.[name];
    if (value === undefined) return placeholder;
    return typeof value === 'object' ? translate(lang, value) : String(value);
  });
}
