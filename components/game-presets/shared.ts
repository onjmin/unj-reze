// プリセット共有の定数・型・ファクトリ。GameMaker.tsx と各プリセット定義が参照する。

export const TILE_SIZE = 32;
export const COLS = 20;
export const ROWS = 15;
export const PLAY_W = COLS * TILE_SIZE;
export const PLAY_H = ROWS * TILE_SIZE;
/** 東方など画面固定エンジン用のビューポート（15列×11行）。 */
export const VIEW_COLS = 15;
export const VIEW_ROWS = 11;
export const VIEW_W = VIEW_COLS * TILE_SIZE;  // 480 px
export const VIEW_H = VIEW_ROWS * TILE_SIZE;  // 352 px

export type PresetId = 'dq' | 'mario' | 'rockman' | 'touhou' | 'onjReze';
export type EngineKind = 'action' | 'rpg' | 'touhou' | 'onjReze';
export type NpcBehavior = 'still' | 'random' | 'chase' | 'flee' | 'patrolH' | 'patrolV' | 'walker';
export type BulletType = 'none' | 'aimed' | 'spread' | 'spiral';
export type SfxTrigger = 'jump' | 'shot' | 'clear' | 'damage' | 'graze' | 'spellcard' | 'levelup' | 'purchase' | 'inn' | 'coin';
export type ObjectKind = 'npc' | 'tile' | 'bullet';
export type ObjType = 'enemy' | 'npc' | 'item' | 'warp' | 'event' | 'platform';

/** グローバルスイッチ定義。id は連番。 */
export interface SwitchDef { id: number; name: string; }

/** アイテム定義。id は一意キー（英字推奨）。 */
export interface ItemDef { id: string; name: string; emoji: string; description?: string; atkBonus?: number; defBonus?: number; category?: 'consumable' | 'weapon' | 'armor' | 'key'; }

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
  | { type: 'ifGold'; amount: number; then: EventCommand[]; else?: EventCommand[] }
  | { type: 'setSwitch'; switchId: number; value: boolean }
  | { type: 'setSelfSwitch'; id: string; value: boolean }
  | { type: 'giveItem'; itemId: string; count: number }
  | { type: 'removeItem'; itemId: string; count: number }
  | { type: 'changeGold'; amount: number }
  | { type: 'restoreHp'; amount?: number }
  | { type: 'restoreMp'; amount?: number }
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

export interface TileDef {
  name: string; color: string; passable: boolean; special?: string; imageRef?: string; imageUrl?: string;
  /** true: 長方形素材を正方形に潰さず、セル幅基準でアスペクト比を保ち下端固定で上方向へはみ出して描く
   *  （1マスに置く単独の縦長素材＝ゴール旗など）。既定は cell-fill（マスいっぱい）で、土管トップ＋ボディのように
   *  欠片を縦に積んでも継ぎ目が出ない。 */
  imageOverflowTop?: boolean;
  /** true: SMC素材の本来のサイズ（2倍比率）を崩さずに描画する。
   *  土管の頭（Cap）や胴（Body）のように横幅が32pxを超える場合に、アスペクト比を保ったまま横にはみ出して描画する。 */
  imageScale2x?: boolean;
}
export interface PlayerDef {
  emoji: string; color: string; speed: number; jumpPower: number; w: number; h: number;
  start: { x: number; y: number }; spriteRef?: string; spriteUrl?: string;
  /** onjReze: 初期ハート数（1ハート=2HP）。デフォルト 3 */
  hearts?: number;
  /** touhou: 初期ボム数（デフォルト 3） */
  bombCount?: number;
  /** touhou: ボム発動時のスペルカード名 */
  bombSpellName?: string;
  /** touhou: ボムカットインのキャラクター名 */
  bombCutinCharName?: string;
  /** action: 武器スロット（武器IDの配列） */
  weapons?: string[];
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
  /** wave 出現スクリプト（touhou・kind=wave）。spawn(敵名, x, y) と wait() で
   *  雑魚の数・タイミング・配置を記述する（ゼビウス風）。未指定なら全敵を一斉配置。 */
  spawnScript?: string;
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
  w?: number; h?: number;
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
  /** ワープ先（同一シーン内）。objType=warp のとき使用。 */
  warpTarget?: WarpTarget;
  /** シーン間ワープ。触れるとフェード遷移で別シーンへ移動。土管・扉などに使用。 */
  warpSceneId?: string;
  /** シーン間ワープの入場位置（省略時はシーン開始位置）。 */
  warpEntryCol?: number;
  warpEntryRow?: number;
  /** アイテムID。objType=item のとき、プレイヤー接触でこのアイテムを入手。未指定なら name をID扱い。 */
  itemId?: string;
  /** ショップ販売リスト。持つ場合、話しかけるとショップUIを開く。 */
  shopItems?: ShopItem[];
  /** イベントページ。持つ場合は objType によらずイベントとして動作。 */
  pages?: EventPage[];
  /** 弾幕の弾形状（touhou エンジン）。未指定は circle。 */
  bulletShape?: 'circle' | 'diamond' | 'oval' | 'arrow';
  /** 弾幕スクリプト（touhou エンジン・旧ビジュアルブロック方式、後方互換用）。 */
  spellScript?: SpellBlock[];
  /** MiniScript（touhou エンジン）。wave 敵の動き全般・ボスの弾幕パターンを記述する。 */
  miniScript?: string;
  /** 所属フェーズ番号（touhou エンジン、phases 使用時）。未指定=0。 */
  phase?: number;
  /** action（マリオ系）: 上から踏むと倒せる敵（クリボー型）。SMC core 準拠。
   *  未指定/false の敵は上に乗ってもダメージを受ける（テレサ・プクプク等）。 */
  stompable?: boolean;
  /** action（マリオ系）: 踏むと甲羅化する敵（ノコノコ型）。shell=true は stompable を含意。
   *  甲羅は静止→蹴ると滑走して他の敵を巻き込み、横から触れるとプレイヤーがダメージを受ける。 */
  shell?: boolean;
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

// ── タイトル画面／エンディング画面 ──────────────────────────────────────
/** タイトル画面のメニュー項目。
 *  newGame=はじめから、continue=つづきから（現状はスタブ＝はじめからと同じ挙動）、
 *  nameInput=名前入力欄（入力した名前をゲーム内で使用）。 */
export type ScreenMenuKind = 'newGame' | 'continue' | 'nameInput';
export interface ScreenMenuItem { kind: ScreenMenuKind; label: string; }

/** タイトル画面設定（東方以外のエンジンで使用）。enabled=true でプレイ開始前に表示。 */
export interface TitleScreenConfig {
  enabled: boolean;
  heading: string;        // 大見出し（ゲームタイトル）
  subtitle?: string;      // 小見出し
  bgRef?: string; bgUrl?: string;  // 背景画像（asset-ref / 解決済みURL）
  bgmRef?: string;        // BGM 参照
  textColor?: string;     // 文字色
  menu: ScreenMenuItem[]; // 表示するメニュー項目（順番通り）
}

/** エンディング画面設定。enabled=true でクリア時に表示。 */
export interface EndingScreenConfig {
  enabled: boolean;
  heading: string;        // 大見出し（例: THE END）
  message?: string;       // 本文
  bgRef?: string; bgUrl?: string;
  bgmRef?: string;
  textColor?: string;
}

/** レベルアップ時のステータス成長テーブル。exp 以上になったとき適用。 */
export interface LevelEntry { level: number; exp: number; maxHp?: number; maxMp?: number; atk?: number; def?: number; }

/** ショップ販売アイテム定義。 */
export interface ShopItem { itemId: string; price: number; }

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
  /** 初期所持金。 */
  gold?: number;
  /** レベルアップテーブル。exp 到達時に対応ステータスへ上書き。 */
  levelTable?: LevelEntry[];
  /** ゴール（城/ジム）到達時に戦うボス。倒すとクリア。 */
  boss?: EncounterEnemy;
  /** ゴールボス撃破後に流すセリフ。 */
  outroDialogue?: DialogueLine[];
}


// ── シーン切り替え（ロックマン型・部屋遷移） ────────────────────────────────
/** 各辺の出口先シーン ID。省略した辺はマップ端で止まる。 */
export interface SceneExit {
  right?: string;
  left?: string;
  up?: string;
  down?: string;
}

/** 1シーン = 画面1枚分（COLS×ROWS 推奨）のマップ＋オブジェクト。 */
export interface SceneDef {
  id: string;
  name?: string;
  map: number[][];
  objects: ObjectDef[];
  exits?: SceneExit;
  /** このシーン専用 BGM。省略時はゲーム共通 BGM を継続。 */
  bgm?: BgmState;
  /** ランダムエンカウント敵テーブル（rpg エンジン）。フィールド歩行中に抽選して戦闘に入る。 */
  randomEncounters?: EncounterEnemy[];
  /** ランダムエンカウント発生ステップ数（デフォルト 16）。 */
  encounterRate?: number;
}

export interface PresetData {
  id: PresetId; name: string; engine: EngineKind; gravity: number; friction: number;
  player: PlayerDef; tiles: Record<number, TileDef>; map: number[][];
  objects: ObjectDef[]; bgm?: BgmState; battleBgm?: BgmState; bossBgm?: BgmState; sfx: Partial<Record<SfxTrigger, SfxRef>>;
  /** シーン切り替えモード。定義されていればマップ/オブジェクトは scenes[0] を初期シーンとして使う。 */
  scenes?: SceneDef[];
  /** マップ背景画像（静止画/GIF）。参照キーと解決済みURL。 */
  mapBgRef?: string; mapBgUrl?: string;
  /** 未指定なら 1 画面固定（worldCols = COLS）。 */
  scroll?: ScrollConfig;
  /** 指定すると rpg エンジンで敵接触時にターン制戦闘になる。 */
  battle?: BattleConfig;
  switches?: SwitchDef[];
  items?: ItemDef[];
  /** フェーズ定義（touhou エンジン）。定義するとフェーズ順に進行する。 */
  phases?: StagePhase[];
/** タイトル画面（東方以外）。enabled=true でプレイ開始前に表示。 */
  titleScreen?: TitleScreenConfig;
  /** エンディング画面（東方以外）。enabled=true でクリア時に表示。 */
  ending?: EndingScreenConfig;
}

/** タイトル画面のデフォルト設定（エディタで「有効化」したとき生成）。 */
export const defaultTitleScreen = (name: string): TitleScreenConfig => ({
  enabled: true,
  heading: name,
  subtitle: '',
  textColor: '#ffffff',
  menu: [{ kind: 'newGame', label: 'はじめから' }],
});

/** エンディング画面のデフォルト設定。 */
export const defaultEndingScreen = (): EndingScreenConfig => ({
  enabled: true,
  heading: 'THE END',
  message: 'クリアおめでとう！',
  textColor: '#ffffff',
});

/** メニュー項目の種別ラベル。 */
export const SCREEN_MENU_LABELS: Record<ScreenMenuKind, string> = {
  newGame: 'はじめから', continue: 'つづきから', nameInput: '名前入力欄',
};

export const uid = () => `o${Math.random().toString(36).slice(2, 9)}`;

export const newObject = (over: Partial<ObjectDef> = {}): ObjectDef => ({
  id: uid(), kind: 'npc', emoji: '👾', col: 5, row: 5, hp: 8, speed: 1.5,
  behavior: 'random', bullet: 'none', bulletSpeed: 3, bulletColor: '#00ffff', fireRate: 60,
  hazard: true, message: '', ...over,
});
