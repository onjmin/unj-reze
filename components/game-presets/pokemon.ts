import {
  type PresetData, type PkmnMoveDef, type PkmnSpeciesDef, type PkmnStatusDef,
  TILE_SIZE, COLS, ROWS,
} from './shared';

// ── ポケモン（pkmn エンジン：gomi/games/pokemon.html を移植） ───────────────
// 6体から3体を選んで戦う、タイプ相性・PP・状態異常・交代ありのターン制対戦。
// ポケモン固有のデータ（タイプ相性表・技・図鑑・状態異常）はこのファイルに集約し、
// エンジン（components/PokemonBattle.tsx）が PartyBattleConfig として汎用的に解釈する。

// ── タイプ相性表（attackType -> defType -> 倍率）。未掲載は等倍(1)。 ───────────
const TYPE_CHART: Record<string, Record<string, number>> = {
  fire:    { grass: 2, ice: 2, bug: 2, steel: 2, water: 0.5, rock: 0.5, fire: 0.5, dragon: 0.5 },
  water:   { fire: 2, ground: 2, rock: 2, water: 0.5, grass: 0.5, dragon: 0.5 },
  grass:   { water: 2, ground: 2, rock: 2, fire: 0.5, grass: 0.5, poison: 0.5, flying: 0.5, bug: 0.5, dragon: 0.5, steel: 0.5 },
  electric:{ water: 2, flying: 2, grass: 0.5, electric: 0.5, dragon: 0.5, ground: 0 },
  ice:     { grass: 2, ground: 2, flying: 2, dragon: 2, steel: 0.5, water: 0.5, ice: 0.5, fire: 0.5 },
  fighting:{ normal: 2, ice: 2, rock: 2, dark: 2, steel: 2, poison: 0.5, flying: 0.5, psychic: 0.5, bug: 0.5, fairy: 0.5, ghost: 0 },
  poison:  { grass: 2, fairy: 2, poison: 0.5, ground: 0.5, rock: 0.5, ghost: 0.5, steel: 0 },
  ground:  { fire: 2, electric: 2, poison: 2, rock: 2, steel: 2, grass: 0.5, bug: 0.5, flying: 0 },
  flying:  { grass: 2, fighting: 2, bug: 2, electric: 0.5, rock: 0.5, steel: 0.5 },
  psychic: { fighting: 2, poison: 2, psychic: 0.5, steel: 0.5, dark: 0, ghost: 0 },
  bug:     { grass: 2, psychic: 2, dark: 2, fire: 0.5, fighting: 0.5, poison: 0.5, flying: 0.5, ghost: 0.5, steel: 0.5, fairy: 0.5 },
  rock:    { fire: 2, ice: 2, flying: 2, bug: 2, fighting: 0.5, ground: 0.5, steel: 0.5 },
  ghost:   { psychic: 2, ghost: 2, normal: 0, dark: 0.5 },
  dragon:  { dragon: 2, steel: 0.5, fairy: 0 },
  dark:    { psychic: 2, ghost: 2, fighting: 0.5, dark: 0.5, fairy: 0.5 },
  steel:   { ice: 2, rock: 2, fairy: 2, fire: 0.5, water: 0.5, electric: 0.5, steel: 0.5 },
  fairy:   { fighting: 2, dragon: 2, dark: 2, fire: 0.5, poison: 0.5, steel: 0.5 },
  normal:  {},
};

const TYPE_COLORS: Record<string, string> = {
  fire: '#f08030', water: '#6890f0', grass: '#78c850', electric: '#f8d030',
  ice: '#98d8d8', fighting: '#c03028', poison: '#a040a0', ground: '#e0c068',
  flying: '#a890f0', psychic: '#f85888', bug: '#a8b820', rock: '#b8a038',
  ghost: '#705898', dragon: '#7038f8', dark: '#705848', steel: '#b8b8d0',
  fairy: '#f0b6bc', normal: '#a8a878',
};

const TYPE_LABELS: Record<string, string> = {
  fire: 'ほのお', water: 'みず', grass: 'くさ', electric: 'でんき',
  ice: 'こおり', fighting: 'かくとう', poison: 'どく', ground: 'じめん',
  flying: 'ひこう', psychic: 'エスパー', bug: 'むし', rock: 'いわ',
  ghost: 'ゴースト', dragon: 'ドラゴン', dark: 'あく', steel: 'はがね',
  fairy: 'フェアリー', normal: 'ノーマル',
};

// ── 状態異常 ──────────────────────────────────────────────────────────────
const STATUSES: PkmnStatusDef[] = [
  { key: 'burn',   label: '🔥やけど', badgeColor: 'rgba(240,128,48,0.8)' },
  { key: 'poison', label: '🟣どく',   badgeColor: 'rgba(160,64,160,0.8)' },
  { key: 'para',   label: '⚡まひ',   badgeColor: 'rgba(248,208,48,0.8)' },
  { key: 'sleep',  label: '💤ねむり', badgeColor: 'rgba(104,144,160,0.8)' },
  { key: 'freeze', label: '🧊こおり', badgeColor: 'rgba(152,216,216,0.8)' },
];

// ── 技データベース ────────────────────────────────────────────────────────
const MOVES: PkmnMoveDef[] = [
  // ほのお
  { id: 'flamethrower', name: 'かえんほうしゃ', type: 'fire', cat: 'sp', power: 90, acc: 100, pp: 15, effect: null },
  { id: 'fireBlast',    name: 'だいもんじ',     type: 'fire', cat: 'sp', power: 110, acc: 85, pp: 5,  effect: { chance: 10, status: 'burn' } },
  { id: 'ember',        name: 'ひのこ',         type: 'fire', cat: 'sp', power: 40,  acc: 100, pp: 25, effect: { chance: 10, status: 'burn' } },
  { id: 'willOWisp',    name: 'おにび',         type: 'fire', cat: 'st', power: 0,   acc: 85,  pp: 15, effect: { status: 'burn', always: true } },
  // みず
  { id: 'waterGun',     name: 'みずでっぽう',   type: 'water', cat: 'sp', power: 40,  acc: 100, pp: 25, effect: null },
  { id: 'surf',         name: 'なみのり',       type: 'water', cat: 'sp', power: 90,  acc: 100, pp: 15, effect: null },
  { id: 'hydropump',    name: 'ハイドロポンプ', type: 'water', cat: 'sp', power: 110, acc: 80,  pp: 5,  effect: null },
  { id: 'aquaTail',     name: 'アクアテール',   type: 'water', cat: 'ph', power: 90,  acc: 90,  pp: 10, effect: null },
  // くさ
  { id: 'razorLeaf',    name: 'はっぱカッター', type: 'grass', cat: 'ph', power: 55,  acc: 95,  pp: 25, effect: null },
  { id: 'solarBeam',    name: 'ソーラービーム', type: 'grass', cat: 'sp', power: 120, acc: 100, pp: 10, effect: null },
  { id: 'leafBlade',    name: 'リーフブレード', type: 'grass', cat: 'ph', power: 90,  acc: 100, pp: 15, effect: null },
  { id: 'spore',        name: 'キノコのほうし', type: 'grass', cat: 'st', power: 0,   acc: 100, pp: 15, effect: { status: 'sleep', always: true } },
  // でんき
  { id: 'thunderbolt',  name: '10まんボルト',   type: 'electric', cat: 'sp', power: 90,  acc: 100, pp: 15, effect: { chance: 10, status: 'para' } },
  { id: 'thunder',      name: 'かみなり',       type: 'electric', cat: 'sp', power: 110, acc: 70,  pp: 10, effect: { chance: 30, status: 'para' } },
  { id: 'spark',        name: 'スパーク',       type: 'electric', cat: 'ph', power: 65,  acc: 100, pp: 20, effect: { chance: 30, status: 'para' } },
  { id: 'thunderwave',  name: 'でんじは',       type: 'electric', cat: 'st', power: 0,   acc: 90,  pp: 20, effect: { status: 'para', always: true } },
  // こおり
  { id: 'iceBeam',      name: 'れいとうビーム', type: 'ice', cat: 'sp', power: 90,  acc: 100, pp: 10, effect: { chance: 10, status: 'freeze' } },
  { id: 'blizzard',     name: 'ふぶき',         type: 'ice', cat: 'sp', power: 110, acc: 70,  pp: 5,  effect: { chance: 10, status: 'freeze' } },
  { id: 'icicle',       name: 'つららばり',     type: 'ice', cat: 'ph', power: 50,  acc: 100, pp: 30, effect: null },
  // かくとう
  { id: 'closeCombat',  name: 'インファイト',   type: 'fighting', cat: 'ph', power: 120, acc: 100, pp: 5,  effect: null },
  { id: 'brickBreak',   name: 'かわらわり',     type: 'fighting', cat: 'ph', power: 75,  acc: 100, pp: 15, effect: null },
  // エスパー
  { id: 'psychic',      name: 'サイコキネシス', type: 'psychic', cat: 'sp', power: 90,  acc: 100, pp: 10, effect: null },
  { id: 'confusion',    name: 'ねんりき',       type: 'psychic', cat: 'sp', power: 50,  acc: 100, pp: 25, effect: null },
  // ドラゴン
  { id: 'dragonClaw',   name: 'ドラゴンクロー', type: 'dragon', cat: 'ph', power: 80,  acc: 100, pp: 15, effect: null },
  { id: 'dragonPulse',  name: 'りゅうのはどう', type: 'dragon', cat: 'sp', power: 85,  acc: 100, pp: 10, effect: null },
  // ノーマル
  { id: 'tackle',       name: 'たいあたり',     type: 'normal', cat: 'ph', power: 40,  acc: 100, pp: 35, effect: null },
  { id: 'hyperBeam',    name: 'はかいこうせん', type: 'normal', cat: 'sp', power: 150, acc: 90,  pp: 5,  effect: null },
  { id: 'bodySlam',     name: 'のしかかり',     type: 'normal', cat: 'ph', power: 85,  acc: 100, pp: 15, effect: { chance: 30, status: 'para' } },
  // ゴースト
  { id: 'shadowBall',   name: 'シャドーボール', type: 'ghost', cat: 'sp', power: 80,  acc: 100, pp: 15, effect: null },
  // どく
  { id: 'sludgeBomb',   name: 'ヘドロばくだん', type: 'poison', cat: 'sp', power: 90,  acc: 100, pp: 10, effect: { chance: 30, status: 'poison' } },
  // いわ
  { id: 'rockSlide',    name: 'いわなだれ',     type: 'rock', cat: 'ph', power: 75,  acc: 90,  pp: 10, effect: null },
  // じめん
  { id: 'earthquake',   name: 'じしん',         type: 'ground', cat: 'ph', power: 100, acc: 100, pp: 10, effect: null },
  // はがね
  { id: 'flashCannon',  name: 'ラスターカノン', type: 'steel', cat: 'sp', power: 80,  acc: 100, pp: 10, effect: null },
  // フェアリー
  { id: 'moonblast',    name: 'ムーンフォース', type: 'fairy', cat: 'sp', power: 95,  acc: 100, pp: 15, effect: null },
  // あく
  { id: 'darkPulse',    name: 'あくのはどう',   type: 'dark', cat: 'sp', power: 80,  acc: 100, pp: 15, effect: null },
  { id: 'crunch',       name: 'かみくだく',     type: 'dark', cat: 'ph', power: 80,  acc: 100, pp: 15, effect: null },
  // むし
  { id: 'bugBuzz',      name: 'むしのさざめき', type: 'bug', cat: 'sp', power: 90,  acc: 100, pp: 10, effect: null },
  // ひこう
  { id: 'airSlash',     name: 'エアスラッシュ', type: 'flying', cat: 'sp', power: 75,  acc: 95,  pp: 15, effect: null },
  { id: 'bravebird',    name: 'ブレイブバード', type: 'flying', cat: 'ph', power: 120, acc: 100, pp: 15, effect: { recoil: 3 } },
];

// ── 図鑑（選択候補） ──────────────────────────────────────────────────────
const POKEDEX: PkmnSpeciesDef[] = [
  { id: 6,   name: 'リザードン',   sprite: '🦎', types: ['fire', 'flying'],
    hp: 78, atk: 84, def: 78, spa: 109, spd: 85, spe: 100,
    moves: ['flamethrower', 'fireBlast', 'airSlash', 'dragonClaw'], desc: 'ほのお・ひこう' },
  { id: 9,   name: 'カメックス',   sprite: '🐢', types: ['water'],
    hp: 79, atk: 83, def: 100, spa: 85, spd: 105, spe: 78,
    moves: ['hydropump', 'surf', 'aquaTail', 'flashCannon'], desc: 'みず' },
  { id: 3,   name: 'フシギバナ',   sprite: '🌿', types: ['grass', 'poison'],
    hp: 80, atk: 82, def: 83, spa: 100, spd: 100, spe: 80,
    moves: ['solarBeam', 'leafBlade', 'sludgeBomb', 'spore'], desc: 'くさ・どく' },
  { id: 25,  name: 'ピカチュウ',   sprite: '⚡', types: ['electric'],
    hp: 60, atk: 55, def: 40, spa: 50, spd: 50, spe: 110,
    moves: ['thunderbolt', 'thunder', 'spark', 'thunderwave'], desc: 'でんき' },
  { id: 149, name: 'カイリュー',   sprite: '🐲', types: ['dragon', 'flying'],
    hp: 91, atk: 134, def: 95, spa: 100, spd: 100, spe: 80,
    moves: ['dragonPulse', 'dragonClaw', 'hyperBeam', 'bodySlam'], desc: 'ドラゴン・ひこう' },
  { id: 130, name: 'ギャラドス',   sprite: '🌊', types: ['water', 'flying'],
    hp: 95, atk: 125, def: 79, spa: 60, spd: 100, spe: 81,
    moves: ['aquaTail', 'crunch', 'waterGun', 'tackle'], desc: 'みず・ひこう' },
  { id: 65,  name: 'フーディン',   sprite: '🔮', types: ['psychic'],
    hp: 55, atk: 50, def: 45, spa: 135, spd: 95, spe: 120,
    moves: ['psychic', 'confusion', 'shadowBall', 'thunderwave'], desc: 'エスパー' },
  { id: 94,  name: 'ゲンガー',     sprite: '👻', types: ['ghost', 'poison'],
    hp: 60, atk: 65, def: 60, spa: 130, spd: 75, spe: 110,
    moves: ['shadowBall', 'sludgeBomb', 'darkPulse', 'willOWisp'], desc: 'ゴースト・どく' },
  { id: 143, name: 'カビゴン',     sprite: '🍖', types: ['normal'],
    hp: 160, atk: 110, def: 65, spa: 65, spd: 110, spe: 30,
    moves: ['bodySlam', 'earthquake', 'hyperBeam', 'tackle'], desc: 'ノーマル' },
  { id: 248, name: 'バンギラス',   sprite: '🦕', types: ['rock', 'dark'],
    hp: 100, atk: 134, def: 110, spa: 95, spd: 100, spe: 61,
    moves: ['rockSlide', 'crunch', 'earthquake', 'darkPulse'], desc: 'いわ・あく' },
  { id: 257, name: 'バシャーモ',   sprite: '🔥', types: ['fire', 'fighting'],
    hp: 80, atk: 120, def: 70, spa: 110, spd: 70, spe: 80,
    moves: ['closeCombat', 'flamethrower', 'brickBreak', 'rockSlide'], desc: 'ほのお・かくとう' },
  { id: 282, name: 'サーナイト',   sprite: '🧚', types: ['psychic', 'fairy'],
    hp: 68, atk: 65, def: 65, spa: 125, spd: 115, spe: 80,
    moves: ['moonblast', 'psychic', 'shadowBall', 'confusion'], desc: 'エスパー・フェアリー' },
  { id: 373, name: 'ボーマンダ',   sprite: '🐉', types: ['dragon', 'flying'],
    hp: 95, atk: 135, def: 80, spa: 110, spd: 80, spe: 100,
    moves: ['dragonClaw', 'dragonPulse', 'airSlash', 'fireBlast'], desc: 'ドラゴン・ひこう' },
  { id: 445, name: 'ガブリアス',   sprite: '🦷', types: ['dragon', 'ground'],
    hp: 108, atk: 130, def: 95, spa: 80, spd: 85, spe: 102,
    moves: ['earthquake', 'dragonClaw', 'rockSlide', 'crunch'], desc: 'ドラゴン・じめん' },
  { id: 484, name: 'パルキア',     sprite: '🌀', types: ['water', 'dragon'],
    hp: 90, atk: 120, def: 100, spa: 150, spd: 120, spe: 100,
    moves: ['hydropump', 'dragonPulse', 'hyperBeam', 'aquaTail'], desc: 'みず・ドラゴン' },
  { id: 196, name: 'エーフィ',     sprite: '🔮', types: ['psychic'],
    hp: 65, atk: 65, def: 60, spa: 130, spd: 95, spe: 110,
    moves: ['psychic', 'moonblast', 'shadowBall', 'confusion'], desc: 'エスパー' },
  { id: 260, name: 'ラグラージ',   sprite: '💧', types: ['water', 'ground'],
    hp: 100, atk: 110, def: 90, spa: 85, spd: 90, spe: 60,
    moves: ['earthquake', 'surf', 'aquaTail', 'rockSlide'], desc: 'みず・じめん' },
  { id: 385, name: 'ジラーチ',     sprite: '⭐', types: ['steel', 'psychic'],
    hp: 100, atk: 100, def: 100, spa: 100, spd: 100, spe: 100,
    moves: ['flashCannon', 'psychic', 'moonblast', 'bodySlam'], desc: 'はがね・エスパー' },
];

// pkmn エンジンはフィールドを使わないが、PresetData が要求するため最小限のダミーを置く。
const W = COLS, H = ROWS;

export const pokemon: PresetData = {
  id: 'pokemon', name: 'ポケモン対戦', engine: 'pkmn', gravity: 0, friction: 0,
  player: { emoji: '⚡', color: '#f8d030', speed: 3, jumpPower: 0, w: 24, h: 24, start: { x: TILE_SIZE * 2, y: TILE_SIZE * 2 } },
  tiles: {
    0: { name: '草地', color: '#5fbf5f', passable: true },
    1: { name: '木',   color: '#1f6b2f', passable: false },
  },
  map: Array.from({ length: H }, (_, y) =>
    Array.from({ length: W }, (_, x) => (x === 0 || x === W - 1 || y === 0 || y === H - 1) ? 1 : 0)
  ),
  objects: [],
  partyBattle: {
    title: 'ポケモン\n対戦',
    subtitle: '6体から3体を選んで戦え！',
    teamSize: 3,
    level: 50,
    typeChart: TYPE_CHART,
    typeColors: TYPE_COLORS,
    typeLabels: TYPE_LABELS,
    moves: MOVES,
    pokedex: POKEDEX,
    statuses: STATUSES,
  },
  sfx: {},
};
