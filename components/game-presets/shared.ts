// プリセット共有の定数・型・ファクトリ。GameMaker.tsx と各プリセット定義が参照する。

export const TILE_SIZE = 32;
export const COLS = 20;
export const ROWS = 15;
export const PLAY_W = COLS * TILE_SIZE;
export const PLAY_H = ROWS * TILE_SIZE;

export type PresetId = 'dq' | 'pokemon' | 'mario' | 'rockman' | 'touhou';
export type EngineKind = 'action' | 'rpg' | 'touhou' | 'pkmn';
export type NpcBehavior = 'still' | 'random' | 'chase' | 'flee' | 'patrolH' | 'patrolV';
export type BulletType = 'none' | 'aimed' | 'spread' | 'spiral';
export type SfxTrigger = 'jump' | 'shot' | 'clear' | 'damage' | 'graze' | 'spellcard';
export type ObjectKind = 'npc' | 'tile' | 'bullet';
export type ObjType = 'enemy' | 'npc' | 'item' | 'warp' | 'event';

/** グローバルスイッチ定義。id は連番。 */
export interface SwitchDef { id: number; name: string; }

/** アイテム定義。id は一意キー（英字推奨）。 */
export interface ItemDef { id: string; name: string; emoji: string; description?: string; }

/** イベントページの発生条件。すべて AND。 */
export interface EventCondition {
  switchId?: number; switchValue?: boolean;
  itemId?: string; hasItem?: boolean;
  selfSwitchId?: string; selfSwitchValue?: boolean;
}

/** イベントコマンド（順次実行）。 */
export type EventCommand =
  | { type: 'message'; text: string }
  | { type: 'choice'; text: string; choices: { label: string; commands: EventCommand[] }[]; cancelIndex?: number }
  | { type: 'ifSwitch'; switchId: number; value: boolean; then: EventCommand[]; else?: EventCommand[] }
  | { type: 'ifItem'; itemId: string; has: boolean; then: EventCommand[]; else?: EventCommand[] }
  | { type: 'setSwitch'; switchId: number; value: boolean }
  | { type: 'setSelfSwitch'; id: string; value: boolean }
  | { type: 'giveItem'; itemId: string; count: number }
  | { type: 'removeItem'; itemId: string; count: number }
  | { type: 'warp'; col: number; row: number }
  | { type: 'wait'; frames: number }
  | { type: 'comment'; text: string }
  | { type: 'label'; name: string }
  | { type: 'jump'; label: string };

export interface EventPage {
  name?: string;
  conditions: EventCondition;
  commands: EventCommand[];
}

export interface TileDef { name: string; color: string; passable: boolean; special?: string; imageRef?: string; imageUrl?: string; }
export interface PlayerDef {
  emoji: string; color: string; speed: number; jumpPower: number; w: number; h: number;
  start: { x: number; y: number }; spriteRef?: string; spriteUrl?: string;
  /** touhou: 初期ボム数（デフォルト 3） */
  bombCount?: number;
  /** touhou: ボム発動時のスペルカード名 */
  bombSpellName?: string;
  /** touhou: ボムカットインのキャラクター名 */
  bombCutinCharName?: string;
  /** touhou: ボムカットインの立ち絵URL */
  bombCutinImageUrl?: string;
  /** touhou: 立ち絵水平オフセット px（設計座標、画面中央基準） */
  bombCutinImageX?: number;
  /** touhou: 立ち絵垂直オフセット px（設計座標、画面中央基準） */
  bombCutinImageY?: number;
  /** touhou: 立ち絵拡大率 */
  bombCutinScale?: number;
}
export interface BgmState { ref: string; src?: string; type?: 'youtube' | 'mml' | 'direct'; }
export interface SfxRef { ref: string; src?: string; type?: 'youtube' | 'mml' | 'direct'; }
export interface WarpTarget { col: number; row: number; }

// ── セリフ・カットシーン ──────────────────────────────────────────────
export interface DialogueLine {
  speaker: string;
  emoji?: string;
  side?: 'left' | 'right';  // 画面上のキャラ位置（デフォルト left）
  text: string;
  /** 立ち絵画像URL（省略時はemojiにフォールバック） */
  imageSrc?: string;
  /** side 基準の水平オフセット px（デフォルト 10） */
  imageX?: number;
  /** 下端からの垂直オフセット px（デフォルト 85） */
  imageY?: number;
  /** 拡大率（ドット絵は pixelated 補間で拡大） */
  imageScale?: number;
}

/** ステージのフェーズ定義。phases 配列の順に進行する。 */
export interface StagePhase {
  id: string;
  kind: 'wave' | 'boss';   // wave=雑魚戦、boss=ボス（HP バー表示）
  label?: string;           // HUD 表示名
  /** このフェーズ開始前に流すセリフ */
  dialogue?: DialogueLine[];
  /** このフェーズクリア後に流すセリフ（ボス撃破後など） */
  outroDialogue?: DialogueLine[];
  /** このフェーズクリア時のスコアボーナス */
  scoreBonus?: number;
  /** true のとき、kind=boss でもボス戦BGMに切り替えない（道中ボス用） */
  noBossBgm?: boolean;
}

// ── 弾幕スクリプト（SpellBlock） ──────────────────────────────────────
/** touhou.html の弾幕パターンをビジュアルブロックで表現。 */
export type SpellBlockKind = 'wait' | 'nway' | 'aimed' | 'spiral' | 'repeat';

/** 全フィールドを持つ（未使用フィールドはデフォルト値で埋める）。JSON シリアライズ可能。 */
export interface SpellBlock {
  id: string;
  kind: SpellBlockKind;
  frames: number;     // wait: 待機フレーム数
  ways: number;       // nway: 方向数 / spiral: 腕数 / repeat: 繰返し回数に使う
  speed: number;      // 弾速 (px/frame)
  color: number;      // SPELL_PALETTE インデックス 0-8
  spread: number;     // nway: 拡散角度 (度)
  jitter: number;     // aimed: ランダムブレ (度)
  rotSpeed: number;   // spiral: 1フレームあたり回転角 (度)
  angle: number;      // nway: 基準角度 (度, 0=右, 90=下)
  times: number;      // repeat: 繰返し回数
  body: SpellBlock[]; // repeat: 子ブロック
}

/** touhou.html の弾色パレット（9色） */
export const SPELL_PALETTE = [
  '#f7f7f7', '#ff5c5c', '#c76bff', '#4f63ff',
  '#6ed2ff', '#61e294', '#ffd84d', '#ff9940', '#ff88ff',
] as const;

/** SpellBlock のファクトリ（デフォルト値 + 上書き）。 */
export const mkSpell = (kind: SpellBlockKind, over: Partial<SpellBlock> = {}): SpellBlock => ({
  id: uid(), kind,
  frames: 30, ways: 6, speed: 2.5, color: 4, spread: 360,
  jitter: 10, rotSpeed: 5, angle: 90, times: 3, body: [],
  ...over,
});

export interface ObjectDef {
  id: string; kind: ObjectKind;
  emoji: string; spriteRef?: string; spriteUrl?: string;
  col: number; row: number; hp: number; speed: number;
  behavior: NpcBehavior; bullet: BulletType; bulletSpeed: number; bulletColor: string; fireRate: number;
  hazard: boolean; message: string;
  /** オブジェクト種別（エディタで表示項目を切り替え）。未指定=enemy。 */
  objType?: ObjType;
  /** ターン制戦闘用ステータス（rpg + battle のとき使用。未指定なら hp から自動算出）。 */
  name?: string; atk?: number; def?: number; exp?: number;
  /** 敵の攻撃パターン（呪文/特技）。 */
  moves?: EnemyMove[];
  /** シンボルエンカウントのボス。倒すまでゴールでクリアにならない。 */
  isBoss?: boolean;
  /** ボス撃破後に流すセリフ（isBoss=true のとき使用）。 */
  outroDialogue?: DialogueLine[];
  /** スペルカード定義（touhou エンジン・isBoss=true のとき使用）。 */
  spellCards?: SpellCardDef[];
  /** 撃破時にボムをドロップする確率 0〜1（touhou エンジン）。 */
  bombDrop?: number;
  /** ワープ先。objType=warp のとき使用。 */
  warpTarget?: WarpTarget;
  /** アイテムID。objType=item のとき、プレイヤー接触でこのアイテムを入手。未指定なら name をID扱い。 */
  itemId?: string;
  /** イベントページ。持つ場合は objType によらずイベントとして動作。 */
  pages?: EventPage[];
  /** 弾幕スクリプト（touhou エンジン・旧ビジュアルブロック方式、後方互換用）。 */
  spellScript?: SpellBlock[];
  /** MiniScript（touhou エンジン）。wave 敵の動き全般・ボスの弾幕パターンを記述する。 */
  miniScript?: string;
  /** 所属フェーズ番号（touhou エンジン、phases 使用時）。未指定=0。 */
  phase?: number;
}

/** スペルカード定義（touhou ボス用）。HP が triggerHp 以下になったとき発動する。 */
export interface SpellCardDef {
  /** スペルカード名（カットイン・HUDに表示） */
  name: string;
  /** この値以下の HP になったとき発動（絶対値）。複数ある場合は降順に並べる。 */
  triggerHp: number;
  /** 発動時の弾幕スクリプト（MiniScript 形式） */
  miniScript: string;
  /** カットインのキャラクター名 */
  cutinCharName?: string;
  /** カットインの立ち絵URL */
  cutinImageUrl?: string;
  /** 立ち絵水平オフセット px（設計座標、画面中央基準） */
  cutinImageX?: number;
  /** 立ち絵垂直オフセット px（設計座標、画面中央基準） */
  cutinImageY?: number;
  /** 立ち絵拡大率 */
  cutinScale?: number;
  /** カットイン前に流す会話（立ち絵＋セリフ、クリックで進む） */
  dialogue?: DialogueLine[];
}

/** スクロール設定。worldCols/worldRows が画面（COLS/ROWS）より大きいとカメラが追従する。
 *  action は横（worldCols）、rpg は上下左右（worldCols+worldRows）に使う。
 *  プリセット固有パラメータはこの形で各ファイルに記述し、エディタは該当時だけ UI を出す。 */
export interface ScrollConfig { worldCols: number; worldRows?: number; }

/** ターン制戦闘の技/呪文。heal=true のとき power 分だけ自分のHPを回復。 */
export interface BattleMove { name: string; cost: number; power: number; heal?: boolean; }

/** 敵の特技/呪文（攻撃パターン）。heal=true なら自分のHPを power 回復、それ以外は power ダメージ。 */
export interface EnemyMove { name: string; power: number; heal?: boolean; }

/** ランダムエンカウント／ボスで出現する敵。 */
export interface EncounterEnemy { name: string; emoji: string; hp: number; atk: number; def: number; exp: number; moves?: EnemyMove[]; }

/** ターン制戦闘設定（rpg エンジン：ドラクエ/ポケモン）。
 *  フィールド上の敵に接触（シンボルエンカウント）でコマンド戦闘に入る。 */
export interface BattleConfig {
  playerName: string;
  maxHp: number; maxMp: number; atk: number; def: number;
  moves: BattleMove[];
  /** コマンドの表示名（テーマ差し替え）。 */
  labels: { attack: string; move: string; flee: string };
  /** ゴール（城/ジム）到達時に戦うボス。倒すとクリア。 */
  boss?: EncounterEnemy;
  /** ゴールボス撃破後に流すセリフ。 */
  outroDialogue?: DialogueLine[];
}

// ── パーティバトル（pkmn エンジン：gomi/games/pokemon.html 相当） ───────────
// 6体から teamSize 体を選んで対戦するタイプ相性バトル。ポケモン固有のデータ
// （図鑑・技・タイプ相性表）はプリセット側（pokemon.ts）に PartyBattleConfig として持たせ、
// エンジン（PokemonBattle.tsx）はそれを汎用的に解釈する。

/** 技カテゴリ：物理 / 特殊 / 変化 */
export type PkmnMoveCat = 'ph' | 'sp' | 'st';

/** 技の追加効果。 */
export interface PkmnMoveEffect {
  /** 命中時にこの % で status を付与（2次効果）。 */
  chance?: number;
  /** 付与する状態異常キー（statuses[].key）。 */
  status?: string;
  /** 変化技：必中で status を付与する。 */
  always?: boolean;
  /** 与ダメージの 1/recoil を反動で受ける。 */
  recoil?: number;
}

/** 技定義。 */
export interface PkmnMoveDef {
  /** 一意キー（pokedex の moves から参照）。 */
  id: string;
  name: string;
  /** タイプ（typeChart / typeColors のキー）。 */
  type: string;
  cat: PkmnMoveCat;
  power: number;
  /** 命中率（100=必中）。 */
  acc: number;
  pp: number;
  effect?: PkmnMoveEffect | null;
}

/** 図鑑エントリ（種族データ）。 */
export interface PkmnSpeciesDef {
  id: number;
  name: string;
  /** 表示スプライト（emoji）。 */
  sprite: string;
  types: string[];
  /** 種族値。 */
  hp: number; atk: number; def: number; spa: number; spd: number; spe: number;
  /** 覚えている技（PkmnMoveDef.id、最大4）。 */
  moves: string[];
  desc?: string;
}

/** 状態異常定義。 */
export interface PkmnStatusDef {
  /** キー（move.effect.status から参照）。 */
  key: string;
  /** 表示ラベル（例 '🔥やけど'）。 */
  label: string;
  /** バッジ背景色。 */
  badgeColor: string;
}

/** パーティバトル設定。pokemon.ts に図鑑・技・タイプ相性を持たせる。 */
export interface PartyBattleConfig {
  /** タイトルロゴ（改行可）。 */
  title: string;
  subtitle?: string;
  /** 選出数（pokemon.html=3）。 */
  teamSize: number;
  /** 固定レベル（pokemon.html=50）。 */
  level: number;
  /** タイプ相性表 attackType -> (defType -> 倍率)。未掲載は等倍(1)。 */
  typeChart: Record<string, Record<string, number>>;
  /** タイプ別の色（技ボタン/バッジ）。 */
  typeColors: Record<string, string>;
  /** タイプの表示名（省略時はキーの大文字）。 */
  typeLabels?: Record<string, string>;
  /** 全技定義。 */
  moves: PkmnMoveDef[];
  /** 図鑑（選択候補）。 */
  pokedex: PkmnSpeciesDef[];
  /** 状態異常定義。 */
  statuses: PkmnStatusDef[];
}

export interface PresetData {
  id: PresetId; name: string; engine: EngineKind; gravity: number; friction: number;
  player: PlayerDef; tiles: Record<number, TileDef>; map: number[][];
  objects: ObjectDef[]; bgm?: BgmState; battleBgm?: BgmState; bossBgm?: BgmState; sfx: Partial<Record<SfxTrigger, SfxRef>>;
  /** 未指定なら 1 画面固定（worldCols = COLS）。 */
  scroll?: ScrollConfig;
  /** 指定すると rpg エンジンで敵接触時にターン制戦闘になる。 */
  battle?: BattleConfig;
  /** パーティバトル設定（pkmn エンジン）。指定すると 6体選出→タイプ相性対戦になる。 */
  partyBattle?: PartyBattleConfig;
  switches?: SwitchDef[];
  items?: ItemDef[];
  /** フェーズ定義（touhou エンジン）。定義するとフェーズ順に進行する。 */
  phases?: StagePhase[];
}

export const uid = () => `o${Math.random().toString(36).slice(2, 9)}`;

export const newObject = (over: Partial<ObjectDef> = {}): ObjectDef => ({
  id: uid(), kind: 'npc', emoji: '👾', col: 5, row: 5, hp: 8, speed: 1.5,
  behavior: 'random', bullet: 'none', bulletSpeed: 3, bulletColor: '#00ffff', fireRate: 60,
  hazard: true, message: '', ...over,
});
