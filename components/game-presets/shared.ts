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

export type PresetId = 'dq' | 'mario' | 'rockman' | 'touhou' | 'onjReze' | 'undertale' | 'deltarune' | 'yume';
export type EngineKind = 'action' | 'rpg' | 'touhou' | 'onjReze' | 'yume25d';
export type NpcBehavior = 'still' | 'random' | 'chase' | 'flee' | 'patrolH' | 'patrolV' | 'walker' | 'randomDash' | 'randomHop';
export type BulletType = 'none' | 'aimed' | 'spread' | 'spiral';
export type SfxTrigger = 'jump' | 'shot' | 'clear' | 'damage' | 'graze' | 'spellcard' | 'levelup' | 'purchase' | 'inn' | 'coin' | 'save';
export type ObjectKind = 'npc' | 'tile' | 'bullet';
export type ObjType = 'enemy' | 'npc' | 'item' | 'warp' | 'event' | 'platform';

/** グローバルスイッチ定義。id は連番。 */
export interface SwitchDef { id: number; name: string; }

/** アイテム定義。id は一意キー（英字推奨）。
 *  healHp/healMp があると rpg エンジンで「どうぐ」として使用可能（戦闘中・フィールド両方）。
 *  consumable: 使用時に消費される（デフォルト: healHp/healMp がある場合は true、それ以外は false）。
 *  discardable: すてることができる（デフォルト: true）。
 *  useMessage: 使用時に表示するメッセージ（未指定時は自動生成）。 */
export interface ItemDef {
  id: string; name: string; emoji: string; description?: string; atkBonus?: number; defBonus?: number; healHp?: number; healMp?: number; category?: 'consumable' | 'weapon' | 'armor' | 'key'; consumable?: boolean; discardable?: boolean; useMessage?: string;
  /** アイテム使用時の対象。省略時は 'self'（フィールド使用時の既定）／パーティ制バトルでは
   *  従来どおり使用時に1人選択（'chooseAlly' 相当）。'allAllies'=味方全員、'enemy'=戦闘中の敵1体選択、
   *  'allEnemies'=敵全体。enemy 系は damage フィールドと組み合わせて攻撃アイテム（爆弾等）に使う。 */
  targetType?: 'self' | 'chooseAlly' | 'allAllies' | 'enemy' | 'allEnemies';
  /** 敵に対して使うと power 分のダメージを与える（爆弾などの攻撃アイテム用）。 */
  damage?: number;
  /** 特定キャラに使ったときだけ効果を上書きする（例: 特定の同行者にだけ通常と違うHP回復量にする）。
   *  memberId は PartyMember.id、主人公は party[0] の id または 'self'。 */
  overrides?: { memberId: string; healHp?: number; healMp?: number; damage?: number }[];
}

/** 装備品（武器/防具）に共通のフィールド。restrictTo で装備可能キャラを制限できる。 */
export interface EquipmentDef {
  id: string; name: string; emoji: string; description?: string;
  atkBonus?: number; defBonus?: number;
  /** 装備可能なキャラのID一覧（PartyMember.id、主人公は party[0] の id、または party未使用時は 'self'）。
   *  省略/空配列＝誰でも装備可能。 */
  restrictTo?: string[];
  price?: number;
}

/** イベントページの発生条件。すべて AND。 */
export interface EventCondition {
  switchId?: number; switchValue?: boolean;
  switch2Id?: number; switch2Value?: boolean;
  itemId?: string; hasItem?: boolean;
  selfSwitchId?: string; selfSwitchValue?: boolean;
  /** このページを有効にする最低所持金（gold >= minGold）。RPGEN の gold 条件の変換先。 */
  minGold?: number;
}

/** イベントコマンド（順次実行）。 */
export type EventCommand =
  | { type: 'message'; text: string }
  | {
      type: 'choice'; text: string; choices: { label: string; commands: EventCommand[] }[]; cancelIndex?: number;
      /** RPGEN #SEL の x/y 省略時の挙動。true のとき選択肢UIを出さず、ランダムに1つ選んで即実行する。 */
      random?: boolean;
      /** RPGEN #SEL の c フラグ。true(c:1)なら直前のメッセージウィンドウを表示したままにする。
       *  false(c:0/省略)なら選択肢を出す前にメッセージウィンドウを閉じる。 */
      keepMessage?: boolean;
      /** RPGEN #SEL の x/y（表示位置）。ゲーム画面（キャンバス）の左上を原点とするピクセル座標で、
       *  ワールド座標／自機座標ではない。カメラがどこを向いていても必ず画面内へ収まるように使う。 */
      posX?: number; posY?: number;
    }
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
  | { type: 'warp'; col: number; row: number; mapId?: string }
  /** 指定時間だけ次のコマンドを待つ（RPGEN の #WAT）。単位はミリ秒。
   *  frames は旧データ互換のためだけに残してあり、ms が未指定のときのみ 1フレーム=16.67ms として使う。 */
  | { type: 'wait'; ms?: number; frames?: number }
  | { type: 'comment'; text: string }
  | { type: 'label'; name: string }
  | { type: 'jump'; label: string }
  /** プレイヤー頭上に一時的なメッセージを表示する（メッセージウィンドウは開かない）。 */
  | { type: 'overheadMessage'; text: string }
  /** 効果音を1回再生する（直リンクmp3のURL）。 */
  | { type: 'playSound'; src: string }
  | { type: 'changeSprite'; spriteRef: string; spriteUrl?: string; objId: string }
  | { type: 'changeBackground'; bgRef: string; bgUrl?: string }
  /** BGM を差し替える（RPGEN の #CH_YB）。bgmRef が空文字なら停止（#ST_YB）。 */
  | { type: 'changeBgm'; bgmRef: string }
  /** 向きを変える（RPGEN の #CH_PD / #CH_ND）。objId='player' で主人公。 */
  | { type: 'changeDirection'; objId: string; dir: Dir4Name }
  /** NPC の動き方を変える（RPGEN の #CH_MT）。moveChance は1マス移動の確率(0〜100)。 */
  | { type: 'changeNpcMovement'; objId: string; behavior: NpcBehavior; moveChance?: number }
  | { 
      type: 'showImage'; 
      imgId: string; 
      url: string; 
      x: number; 
      y: number; 
      w?: number; 
      h?: number; 
      opacity?: number; 
      isPercent?: boolean;
      m?: boolean;
      c?: boolean;
      sxp?: boolean;
      swp?: boolean;
      xp?: boolean;
      wp?: boolean;
      lp?: boolean;
      ms?: number;
      /** #DW_IMG（画像）か #DW_IMA（アニメ）か。#ST_IMG / #ST_IMA の消去対象を絞るために保持する。 */
      kind?: 'image' | 'anim';
      frames?: {
        url: string;
        sx: number; sy: number;
        sw: number; sh: number;
        ox: number; oy: number;
        r: number;
        a: number;
      }[];
    }
  /** 表示中の画像を消す（RPGEN の #ST_IMG / #ST_IMA）。
   *  RPGEN の消去コマンドは管理番号を取らず「表示中のものをすべて終了」する。imgId 未指定（空文字含む）が
   *  その全消去にあたり、kind で画像(#DW_IMG)／アニメ(#DW_IMA)のどちらを消すかを絞り込む（未指定は両方）。
   *  followImages=true（#ST_IMG の bf:1）なら追随画像（#DW_FL）も併せて消す。 */
  | { type: 'hideImage'; imgId?: string; kind?: 'image' | 'anim'; followImages?: boolean }
  | { 
      type: 'followImage';
      imgId: string;
      targetObjId: string; // 'player' or 'obj-human-X-Y'
      directions: Record<'U' | 'D' | 'L' | 'R', {
        url: string; x: number; y: number; w?: number; h?: number; opacity?: number;
        m?: boolean; c?: boolean; sxp?: boolean; swp?: boolean; xp?: boolean; wp?: boolean;
        sx?: number; sy?: number; sw?: number; sh?: number; ox?: number; oy?: number; r?: number;
      } | undefined>;
    }
  | { type: 'pauseImage'; imgId?: string; layer?: number }
  | { type: 'resumeImage'; imgId?: string; layer?: number }
  | { type: 'resetCamera'; duration: number; easing?: number }
  | { type: 'moveCamera'; tx?: number; ty?: number; duration: number; dx?: number; dy?: number; easing?: number; blocking?: boolean }
  | { type: 'moveNpc'; objId?: string; tx?: number; ty?: number; dx?: number; dy?: number; duration?: number; stepMs?: number; allowDiagonal?: boolean }
  | { type: 'clearScreenEffect' }
  | { type: 'screenEffect'; effects: { type: 'solid' | 'gradient'; color: string; c1: string; c2: string; pos: string; stops: string }[] }
  /** イベントページ（フェーズ）を切り替える（RPGEN の #CH_PH）。
   *  phaseIndex は GUI の表示と揃えた 1 始まり（1 = 「ページ1」= pages[0]）。
   *  tx/ty を指定すると、そのマス（列/行）にある別イベントのフェーズを切り替える（未指定なら自分自身）。 */
  | { type: 'changePhase'; phaseIndex: number; tx?: number; ty?: number }
  /** エフェクトアニメーション（EffectPreset）を再生する。target='self' はこのイベント自身の位置、'player' はプレイヤーの現在位置。
   *  wait=true のとき、アニメーション1周分の時間だけコマンド進行をブロックする。 */
  | { type: 'playEffect'; effectId: string; target: 'self' | 'player'; wait?: boolean }
  | { type: 'showGold'; visible: boolean }
  | { type: 'changeFont'; font: string; googleFont?: string }
  | { type: 'finishEvent' }
  | { type: 'removeEvent'; objId?: string }
  | { type: 'saveData'; switches?: boolean; gold?: boolean; party?: boolean; npc?: boolean }
  | { type: 'loadData'; switches?: boolean; gold?: boolean; party?: boolean; npc?: boolean }
  | { type: 'stopSound' }
  | { type: 'changeSpriteColor'; target: 'materials' | 'human' | 'sprite' | 'animation' | 'wallpaper'; id?: number; h?: number; s?: number; l?: number }
  | { type: 'resetSpriteColor'; target: 'materials' | 'human' | 'sprite' | 'animation' | 'wallpaper'; id?: number }
  | { type: 'seekBgm'; seconds: number; relative?: boolean }
  | { type: 'rateBgm'; rate: number };

export interface EventPage {
  /** ページ名（管理用） */
  name?: string;
  /** イベントの起動条件（トリガー）: デフォルトは 'action' */
  trigger?: 'action' | 'playerTouch' | 'eventTouch' | 'autorun';
  /** イベントの実行優先度（自動実行や同時トリガー時の優先順位。数値が大きいほど優先） */
  executionPriority?: number;
  conditions: EventCondition;
  commands: EventCommand[];
}

export interface TileDef {
  name: string; color: string; passable: boolean; special?: string; imageRef?: string; imageUrl?: string;
  /** special='warp'（シーン切替床）のワープ先。シーン間ワープ床のみ使用。 */
  warpSceneId?: string; warpEntryCol?: number; warpEntryRow?: number;
  /** special='damage'（どく沼/ダメージ床）の被ダメージ量。未指定時は3。 */
  damageAmount?: number;
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
  start: { x: number; y: number }; spriteRef?: string; spriteUrl?: string; minecraftSkin?: string;
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
  /** セルフスイッチ A が true のとき spriteRef/spriteUrl の代わりに使う見た目（宝箱の開扉後など）。 */
  altSpriteRef?: string; altSpriteUrl?: string;
  col: number; row: number; hp: number; speed: number;
  behavior: NpcBehavior; bullet: BulletType; bulletSpeed: number; bulletColor: string; fireRate: number;
  hazard: boolean; message: string;
  w?: number; h?: number;
  unplaced?: boolean; // If true, the event/object is treated as not physically on the map.
  /** エディタ時のみ表示するスプライト（システム用ポイントの半透明表示など） */
  editorSprite?: string;
  /** オブジェクト種別（エディタで表示項目を切り替え）。未指定=enemy。 */
  objType?: ObjType;
  /** ターン制戦闘用ステータス（rpg + battle のとき使用。未指定なら hp から自動算出）。 */
  name?: string; atk?: number; def?: number; exp?: number;
  /** 撃破時に得るゴールド（rpg）。未指定なら exp から自動算出。 */
  gold?: number;
  /** 敵の攻撃パターン（呪文/特技）。 */
  moves?: EnemyMove[];
  /** シンボルエンカウントのボス。倒すまでゴールでクリアにならない。 */
  isBoss?: boolean;
  /** undertale/deltarune 戦闘：1回のエンカウントで現れる同種の敵の最大数（1〜3、省略時3）。
   *  実際の出現数は 1〜この値のランダム。ストーリー上の一体キャラは 1 を指定する（ボスは常に1体）。 */
  encounterMax?: number;
  /** ボス撃破後に流すセリフ（isBoss=true のとき使用）。 */
  outroDialogue?: DialogueLine[];
  /** スペルカード定義（touhou エンジン・isBoss=true のとき使用）。 */
  spellCards?: SpellCardDef[];
  /** 撃破時にボムをドロップする確率 0〜1（touhou エンジン）。 */
  bombDrop?: number;
  /** ワープ先（同一シーン内）。objType=warp のとき使用。 */
  warpTarget?: WarpTarget;
  /** 発動する入力方向。指定すると「この向きを押しながら重なったとき」だけワープする。
   *  出口側に逆向きを設定しておくと、転送直後に押している向き（＝出る向き）では再発動せず、
   *  往復ループを防げる。未指定なら従来どおり触れた時点で発動。 */
  warpEnterDir?: 'up' | 'down' | 'left' | 'right';
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
  /** UNDERTALE移動モード（rpg エンジン・battle.style==='undertale'）。攻撃（弾幕よけ）中のプレイヤー移動の制約。未指定は 'red'。 */
  undertaleMode?: UndertaleMode;
  /** undertale 戦闘：この敵の通常攻撃の予告セリフ候補（moves[].dialogue が優先）。HP割合／直前のこうどう技名で出し分け。 */
  dialogue?: (string | EnemyDialogueLine)[];
  /** 戦闘オーバーレイで絵文字の代わりに描くスプライト（undertale/deltarune 戦闘）。 */
  battleSprite?: EnemyBattleSprite;
  /** 所属フェーズ番号（touhou エンジン、phases 使用時）。未指定=0。 */
  phase?: number;
  /** action（マリオ系）: 上から踏むと倒せる敵（クリボー型）。SMC core 準拠。
   *  未指定/false の敵は上に乗ってもダメージを受ける（テレサ・プクプク等）。 */
  stompable?: boolean;
  /** action（マリオ系）: 踏むと甲羅化する敵（ノコノコ型）。shell=true は stompable を含意。
   *  甲羅は静止→蹴ると滑走して他の敵を巻き込み、横から触れるとプレイヤーがダメージを受ける。 */
  shell?: boolean;
  /** true のとき、この NPC/敵は壁・オブジェクトの衝突判定を無視してすり抜ける。
   *  未指定/false は従来どおり壁に接触して反転・停止する。 */
  through?: boolean;
  /** 見下ろし型エンジンでの初期の向き（歩行グラのどの行を出すか）。未指定は 'down'（正面）。
   *  移動を始めると実際の移動方向で上書きされる。 */
  dir?: Dir4Name;
  /** DQ風の1マス移動。0〜100 の移動確率(%)。設定すると連続移動をやめ、
   *  NPC_STEP_INTERVAL フレームごとに判定して当たったときだけ behavior に応じた向きへ1マス歩く。
   *  behavior は 1マス移動時に次の意味になる:
   *   still=移動せず向きだけ変える / random=4方向ランダム / patrolH=左右ランダム /
   *   patrolV=上下ランダム / chase=プレイヤーへ1歩 / flee=プレイヤーから1歩。
   *  未指定なら従来どおり毎フレーム連続移動する。 */
  moveChance?: number;
}

/** 見下ろし型エンジンの4方向（ObjectDef.dir / RPGENの人物の向き）。2.5Dの数値 Dir4 とは別物。 */
export type Dir4Name = 'up' | 'down' | 'left' | 'right';

/** DQ風1マス移動（ObjectDef.moveChance）の判定間隔（フレーム）。
 *  速度 1.5px/frame で 1マス(32px)を歩き切るのに約22フレームかかるため、
 *  歩き終わってから少し間が空く程度の値にしている。 */
export const NPC_STEP_INTERVAL = 30;

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
/** タイトル画面のメニュー項目。newGame=はじめる（唯一の開始操作）。 */
export type ScreenMenuKind = 'newGame';
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

/** 死亡画面スタイル。minecraft=Minecraft風（背景赤暗化＋見出し＋ボタン）。gameOver=汎用ゲームオーバー。none=従来通り（フェード復帰のみ）。 */
export type DeathScreenStyle = 'minecraft' | 'gameOver' | 'none';

/** 死亡画面設定（yume25d エンジン専用）。プレイヤーのHPが0になったとき表示する画面の種別と文言をカスタマイズする。 */
export interface DeathScreenConfig {
  style: DeathScreenStyle;
  heading: string;        // 大見出し（例: 「死んでしまった！」「You Died」）
  retryLabel: string;     // リスポーンボタンの文言
  exitLabel: string;      // タイトル/終了ボタンの文言
  textColor?: string;     // 文字色（Minecraft風スタイル時の見出し）
}

/** レベルアップ時のステータス成長テーブル。exp 以上になったとき適用。
 *  levelTable に該当レベルの行が無いとき、growthType/growth（下記）による自動計算にフォールバックする。 */
export interface LevelEntry { level: number; exp: number; maxHp?: number; maxMp?: number; atk?: number; def?: number; }

/** 経験値カーブの成長タイプ。早熟＝序盤ほど少ない経験値でレベルが上がる、晩成＝逆に必要経験値が急激に増えていく。 */
export type GrowthType = 'early' | 'standard' | 'late';

/** レベルアップ1回ごとのステータス増分（levelTable に該当レベルの行が無いときに使う自動成長）。 */
export interface StatGrowth { hp: number; mp: number; atk: number; def: number; }

const GROWTH_EXP_PARAMS: Record<GrowthType, { base: number; pow: number }> = {
  early: { base: 8, pow: 1.8 },
  standard: { base: 10, pow: 2 },
  late: { base: 13, pow: 2.3 },
};

/** growthType に応じた「現在のレベルから次のレベルに上がるまでに必要な経験値」を返す。 */
export function expToNextLevel(level: number, growthType: GrowthType = 'standard'): number {
  const { base, pow } = GROWTH_EXP_PARAMS[growthType];
  return Math.max(1, Math.round(base * Math.pow(Math.max(1, level), pow)));
}

/** ショップ販売アイテム定義。 */
export interface ShopItem { itemId: string; price: number; }

/** ターン制戦闘の技/呪文。heal=true のとき power 分だけ自分のHPを回復。
 *  mercy を指定すると「こうどう」技になる：ダメージを与えず敵の敵意ゲージ（0〜100）を mercy 分下げる。
 *  ゲージが満タン（または敵HPが2割以下）になると「みのがす」で戦闘を終了できる（labels.mercy 参照）。 */
/** learnLevel を指定すると、主人公（レベル管理される操作キャラ）のレベルがそれ以上になるまで戦闘コマンドに出現しない。省略時は最初から使える。 */
export interface BattleMove { name: string; cost: number; power: number; heal?: boolean; mercy?: number; learnLevel?: number; effectId?: string; }

/** UNDERTALEの移動モード（battle.style==='undertale' の弾幕よけ中）。
 *  red=自由移動 / blue=重力+ジャンプ / green=シールド（移動不可・方向キーでその方向の矢弾を防ぐ）
 *  / purple=3本の横線をUp/Downで切替・Left/Rightで移動 / yellow=自由移動+Z/Enterで前方に弾を撃てる。 */
export type UndertaleMode = 'red' | 'blue' | 'green' | 'purple' | 'yellow';

/** undertale/deltarune 戦闘の攻撃前セリフ（敵スプライト横のフキダシに1文字ずつ表示される）。
 *  条件フィールドは複数指定でき、指定した条件を すべて満たす（AND）行だけが候補になる。
 *  候補のうち条件数が最も多い（＝最も具体的な）行が選ばれ、同率のときは hpBelowPct が
 *  小さい（より切迫した）行を優先、なお同率ならランダムに1つ。全フィールド省略＝無条件セリフ。 */
export interface EnemyDialogueLine {
  text: string;
  /** 直前のプレイヤーターンで この名前の「こうどう」が使われたとき */
  actUsed?: string;
  /** 敵の残りHPが この%以下のとき */
  hpBelowPct?: number;
  /** 敵の残りHPが この%より上のとき（まだ元気なうちだけのセリフ） */
  hpAbovePct?: number;
  /** 敵意（mercy）ゲージが この%以上のとき */
  mercyAbovePct?: number;
}

/** 敵の特技/呪文（攻撃パターン）。heal=true なら自分のHPを power 回復、それ以外は power ダメージ。
 *  undertaleMode を指定すると、この技の弾幕よけ中だけ UNDERTALE の移動モードを上書きする（未指定は敵本体/デフォルトの 'red'）。
 *  dialogue を指定すると、この技を予告するとき敵本体の dialogue より優先して使われる。 */
export interface EnemyMove { name: string; power: number; heal?: boolean; miniScript?: string; undertaleMode?: UndertaleMode; dialogue?: (string | EnemyDialogueLine)[]; effectId?: string; }

/** ランダムエンカウント／ボスで出現する敵。gold 未指定時は exp から自動算出。
 *  dialogue＝通常攻撃（moves 抽選に外れたとき）の予告セリフ候補。
 *  battleSprite＝戦闘オーバーレイで絵文字の代わりに描くスプライト。 */
export interface EncounterEnemy { name: string; emoji: string; hp: number; atk: number; def: number; exp: number; gold?: number; moves?: EnemyMove[]; miniScript?: string; undertaleMode?: UndertaleMode; dialogue?: (string | EnemyDialogueLine)[]; battleSprite?: EnemyBattleSprite; }

/** ランダムエンカウントのグループ（例：「森」「洞窟」）。weight（省略時1）で抽選比重をつける。
 *  scene.encounterGroups が1件以上あるときはこちらが優先され、scene.randomEncounters は無視される。 */
export interface EncounterGroup { id: string; name?: string; weight: number; enemies: EncounterEnemy[]; }

/** battle.style==='deltarune' の呪文。TPを消費する（MPとは別のバトル専用リソース。戦闘開始時0にリセットされ、
 *  グレイズ／まもる で溜まる）。heal=true なら power の値だけパーティを回復、それ以外は power ダメージ
 *  （タイミングバー無しの確定ダメージ）。 */
export interface PartySpell {
  name: string; tpCost: number; power: number; heal?: boolean;
  /** 詠唱時・命中時の専用SE（省略時は共通の spellCast／enemyDamage）。ルードバスター等の固有演出用 */
  castSfxUrl?: string; hitSfxUrl?: string;
  /** 主人公（party先頭・レベル管理される操作キャラ）のレベルがそれ以上になるまで出現しない。
   *  同行者（party[1]以降）は個別のレベルを持たないため、この欄を指定しても常に使用可能のまま。 */
  learnLevel?: number;
  /** 再生するエフェクトアニメーション（EffectPreset.id）。省略時は演出なし。 */
  effectId?: string;
}

/** 汎用エフェクトアニメーション。1枚の画像を横に frameCount 等分してスライド再生する
 *  （例: 横一列に並んだ魔法/爆発エフェクトのスプライトシート）。フィールドイベントの
 *  playEffect コマンドと、バトルの呪文/技の effectId の両方から再生できる。 */
export interface EffectPreset {
  id: string; name: string;
  /** 画像の asset ref（post:/url: など）。imageUrl は post: のときの解決済みURLキャッシュ。 */
  imageRef: string; imageUrl?: string;
  frameCount: number;
  /** 再生速度（フレーム/秒）。省略時 12。 */
  fps?: number;
  /** 効果音（任意）。 */
  sfx?: SfxRef;
}

/** バトル演出用のアニメ1本（フレーム順の画像URL列）。fps 省略時は 8。
 *  tlDR Engine のスプライト（lib/deltarune-tldr-assets.ts の TldrAnim）と構造互換。 */
export interface BattleSpriteAnim { frames: string[]; fps?: number; w?: number; h?: number; }

/** battle.style==='deltarune' のパーティメンバーの横向きバトルスプライト一式。
 *  idle 以外は省略可（無い状態は idle で代用される）。attack/act/spell/item は行動時に1周だけ再生。 */
export interface PartyBattleSprites {
  idle: BattleSpriteAnim;
  attackReady?: BattleSpriteAnim; attack?: BattleSpriteAnim;
  hurt?: BattleSpriteAnim; defend?: BattleSpriteAnim; defeat?: BattleSpriteAnim;
  act?: BattleSpriteAnim; spell?: BattleSpriteAnim; item?: BattleSpriteAnim;
  /** ステータスボックス用の顔アイコン（通常／被ダメージ時）。省略時は emoji で代用。 */
  icon?: BattleSpriteAnim; iconHurt?: BattleSpriteAnim;
}

/** 敵のバトル画面スプライト。設定すると戦闘オーバーレイで絵文字の代わりに描画される。
 *  hurt=被ダメージ演出中、spare=みのがし可能（敵意が消えた）とき。 */
export interface EnemyBattleSprite { idle: BattleSpriteAnim; hurt?: BattleSpriteAnim; spare?: BattleSpriteAnim; }

/** パーティ制バトル（deltarune / ff / mother3 / milky）のメンバー。先頭(index 0)は
 *  フィールド上の操作キャラと同一人物として扱われ、そのHP/MPは player.maxHp（進行データの pr.hp/pr.mp）を
 *  共有する。2人目以降はフィールドに実体を持たない同行キャラのため、HP/MPは戦闘中だけの一時状態
 *  （戦闘終了で破棄・次戦闘は毎回 maxHp/maxMp から再開）。
 *  maxMp/atk/def は deltarune 以外のパーティ制スタイル用（省略時は先頭メンバー＝プレイヤーの現在値を流用）。 */
export interface PartyMember { id: string; name: string; emoji: string; spriteRef?: string; spriteUrl?: string; maxHp: number; maxMp?: number; atk?: number; def?: number; spells?: PartySpell[]; battleSprites?: PartyBattleSprites; /** メンバーカラー（HPバー・ボックス枠。省略時は白） */ color?: string; }

/** ターン制戦闘設定（rpg エンジン：ドラクエ/ポケモン）。
 *  フィールド上の敵に接触（シンボルエンカウント）でコマンド戦闘に入る。 */
export interface BattleConfig {
  playerName: string;
  maxHp: number; maxMp: number; atk: number; def: number;
  /** 戦闘スタイル。'undertale'＝アンダーテール風：FIGHT/ACT/ITEM/MERCY の4コマンド、
   *  たたかう＝タイミングバー、敵ターン＝バトルボックスが変形してハート弾幕よけ。
   *  'deltarune'＝デルタルーン風：'undertale'の弾幕よけ・タイミング攻撃を流用しつつ、
   *  パーティ（party）で1人ずつ行動選択（FIGHT/ACT/ITEM/まもる、ACT欄にSPELLも並ぶ）してから
   *  敵ターンへ進む。TPは共有リソースでMPとは独立（グレイズ／まもる で加算、呪文で消費、毎戦闘0から）。
   *  'ff'＝FF風サイドビュー：パーティ全員のコマンドを選んでから一斉実行するラウンド制。
   *  'mother3'＝MOTHER3風：ローリングHP。被弾/回復で表示HPが実HPへ向けて1ずつ数字が回転するように増減し、
   *  表示が0に落ちきる前に回復すれば、実HPが0以下になる致命傷を受けていても生存できる（クリティカルダメージ演出）。
   *  'milky'＝ミルキークエスト2風：全員の行動値がカウントダウンし0になった者から行動するCTB。強い技ほど
   *  行動値コストが大きい。敵はHPが減ると疲れた表情になる。
   *  省略時 'classic'＝従来のコマンド戦闘。 */
  style?: 'classic' | 'undertale' | 'deltarune' | 'ff' | 'mother3' | 'milky';
  moves: BattleMove[];
  /** コマンドの表示名（テーマ差し替え）。item 省略時は「どうぐ」。
   *  mercy を指定すると「みのがす」コマンドが出現する（アンダーテール系）。 */
  labels: { attack: string; move: string; flee: string; item?: string; mercy?: string };
  /** style==='deltarune' のパーティ構成。先頭が操作キャラ本人。 */
  party?: PartyMember[];
  /** 初期所持金。 */
  gold?: number;
  /** レベルアップテーブル（任意・特定レベルだけ手動で上書きしたいとき用）。exp 到達時に対応ステータスへ上書き。
   *  該当レベルの行が無いときは growthType/growth による自動成長が使われる。 */
  levelTable?: LevelEntry[];
  /** 経験値カーブの成長タイプ（早熟/標準/晩成）。省略時 'standard'。 */
  growthType?: GrowthType;
  /** レベルアップ1回ごとの自動ステータス増分。省略時は控えめな既定値（HP+6/MP+3/攻+2/防+1）。 */
  growth?: StatGrowth;
  /** ゴール（城/ジム）到達時に戦うボス。倒すとクリア。 */
  boss?: EncounterEnemy;
  /** ゴールボス撃破後に流すセリフ。 */
  outroDialogue?: DialogueLine[];
  /** みのがしに必要な敵意ゲージ %（デフォルト100）。 */
  mercyThreshold?: number;
  /** みのがし可能になる敵HP割合 %（デフォルト20）。 */
  hpSpareThreshold?: number;
}


// ── 2.5Dエンジン（yume25d）レイアウト ────────────────────────────────────
/** 方角。0=北(-row) 1=東(+col) 2=南(+row) 3=西(-col)。 */
export type Dir4 = 0 | 1 | 2 | 3;

/** 2.5D用テクスチャ定義。imageUrl が無ければ color（＋emoji）から生成する。 */
export interface Tex25D {
  id: number;
  name: string;
  kind: 'floor' | 'wall' | 'sprite';
  /** フォールバック色（チェッカー模様の下地に使う） */
  color: string;
  /** sprite用：絵文字をそのままテクスチャ化する */
  emoji?: string;
  imageRef?: string;
  imageUrl?: string;
  /** システム床の効果（kind==='floor' のみ）。2Dエンジンの TileDef.special と同じ値
   *  （'warp' | 'damage' | 'ice-up' | 'ice-right' | 'ice-down' | 'ice-left'）。
   *  yume25d にはシーンが無いので warp は同一マップ内の座標転送、damage は HP を削り、
   *  尽きたら「ゆめから さめて スタート地点へ戻る」。 */
  special?: string;
  /** special==='warp'：同一マップ内の転送先セル。dir 指定で着地後の向きも変える。 */
  warpDest?: { col: number; row: number; dir?: Dir4 };
  /** special==='damage'：被ダメージ量。未指定時は3（2Dの TileDef.damageAmount と同じ既定値）。 */
  damageAmount?: number;
  /** special==='food'（kind==='sprite'）：食べたときの空腹回復量（ポイント。2で🍗1個）。未指定は6。 */
  foodValue?: number;
  /** サンプル3Dモデル（glb）のURL（kind==='sprite'）。指定時はビルボードの代わりに
   *  GLTFモデルを配置する（当たり判定なし・すり抜け）。model-catalog.ts の検索モーダルから設定する。 */
  modelUrl?: string;
  /** Minecraftスキン画像（Slim型・64x64）のURL（kind==='sprite'）。指定時はビルボードの代わりに
   *  ブロック人形の3Dモデル（lib/minecraft-model.ts）を組み立てて配置する。
   *  プリセットURL・任意の画像URL・アップロード画像のどれでも参照できる。 */
  minecraftSkin?: string;
  /** モデルの大きさ（最大辺のマス数）。未指定は1。 */
  modelScale?: number;
  /** special==='ball'（kind==='sprite'）：球の半径（マス単位）。未指定は0.22。
   *  ボールはビルボードではなく本物の球体メッシュ（模様なし・color の単色＋陰影）で描画される。 */
  ballRadius?: number;
  /** special==='speaker'（kind==='sprite'）：近づくと聞こえる音源（ライブステージ/スピーカー）。
   *  距離減衰は (1 - d/radius)² の近似（radius マスでちょうど無音）。direct 音源のみ再生できる。
   *  radius 未指定は8マス、volume（最大音量 0〜1）未指定は0.7。 */
  sound?: { ref: string; src?: string; type?: 'youtube' | 'mml' | 'direct'; radius?: number; volume?: number };
}

/** 薄板1枚の壁。セルの北辺(dir=0)または西辺(dir=3)に正規化して保存する
 *  （南辺＝1つ下のセルの北辺、東辺＝1つ右のセルの西辺）。
 *  level は縦積みの段（0=地上。1以上は上空: y ∈ [level*wallHeight, (level+1)*wallHeight]）。
 *  当たり判定があるのは level 0 のみで、上段の壁の下はくぐれる（アーチ・浮遊構造物用）。 */
export interface Wall25D { col: number; row: number; dir: Dir4; tex: number; level?: number; }

/** ビルボードスプライト（常にカメラへ正対する薄板）。セル中央に立つ。
 *  interactive=true のとき「話す」ボタンの対象になる（message／choices を表示）。
 *  level は縦積みの段（0=地面に立つ。1以上は y=level*wallHeight を足元に浮かぶ）。 */
export interface Billboard25D {
  id: string; col: number; row: number; tex: number; scale?: number;
  level?: number;
  interactive?: boolean;
  message?: string;
  /** 選択肢（あれば「はなす」でメッセージの下に並ぶ。実行結果は無く、選ぶと会話が閉じるだけ）。 */
  choices?: string[];
  behavior?: NpcBehavior;
  collidable?: boolean;
  /** true のとき、このビルボードの AI 移動は壁の衝突判定を無視してすり抜ける。 */
  through?: boolean;
  dir?: Dir4;
  /** イベントページ。持つ場合は「はなす」でコマンドが実行される（ObjectDef.pages と同じ仕組み）。 */
  pages?: EventPage[];
}

/** 2.5Dエンジンのレイアウト全体。プレーンJSONとしてそのまま保存できる。 */
export interface Layout25D {
  cols: number; rows: number;
  /** 床テクスチャID。0=床なし（奈落＝描画しない） */
  floor: number[][];
  /** 天井を張るか（屋内風）。false なら空が見える */
  ceiling: boolean;
  ceilingTex: number;
  walls: Wall25D[];
  billboards: Billboard25D[];
  textures: Record<number, Tex25D>;
  /** 壁の高さ（1.0＝1マス幅と同じ） */
  wallHeight: number;
  skyColor: string;
  fogColor: string; fogNear: number; fogFar: number;
  /** 背景画像（横360°の円筒パノラマ）。カメラ位置に追従し、霧の影響を受けない。
   *  上下の余白には skyColor が見える。未指定なら skyColor 一色。 */
  skyRef?: string; skyUrl?: string;
  /** 海（水面）の高さ。0/未指定=水なし。この高さから下（底まで）がすべて水になり、
   *  プレイヤーは泳げる（水中はゆっくり沈む・ジャンプ入力でひとかき上昇・移動は減速）。 */
  waterLevel?: number;
  /** 水の色。未指定は青緑（waterKind==='lava' のときはマグマ色）。 */
  waterColor?: string;
  /** 海の種類。'lava' で溶岩になる（既定色がマグマ色になり、面が発光して見える・水没ダメージも強め）。未指定は 'water'。 */
  waterKind?: 'water' | 'lava';
  /** 水没ダメージ：水（溶岩）に浸かっている間、時間経過でダメージを受けるかを対象別に指定する。
   *  enemy は「追尾」行動の住人、npc はそれ以外の住人。住人はしばらく浸かると倒れて消える（リスポーンで復活）。 */
  waterDamage?: { player?: boolean; npc?: boolean; enemy?: boolean };
  /** 酸素ゲージ（Minecraft風）。頭まで潜ると酸素が減り、尽きると窒息ダメージ。水面に出ると回復する。未指定は無効。 */
  oxygen?: boolean;
  /** 空腹ゲージ（Minecraft風）。ダッシュ中にすこしずつ減り、🍗3個以下でダッシュ不可・0で飢餓ダメージ・
   *  9個以上でHP自然回復。「食べ物」スプライト（special==='food'）に触れると回復する。未指定は無効。 */
  hunger?: boolean;
  /** ワールド全体の明るさ（環境光）。1=従来のフルブライト。0.1〜2。未指定は1。 */
  ambientLight?: number;
  /** 環境光の色。未指定は白（テクスチャそのままの色）。 */
  ambientColor?: string;
  /** プレイヤー光源（ランタン）。enabled のときプレイヤー位置から周囲を照らす。
   *  intensity は 1=標準（隣接マスがほぼ等倍で照る）、distance は届くマス数。 */
  playerLight?: { enabled: boolean; color?: string; intensity?: number; distance?: number };
  start: { col: number; row: number; dir: Dir4 };
  /** 視点モード。first=一人称、third=三人称（プレイヤー自身のスプライトが見える）。未指定は first。 */
  pov?: 'first' | 'third';
  /** 三人称視点でのカメラ距離（マス単位）。未指定は 1.6。 */
  povDistance?: number;
  /** ジャンプ高さ（速度）。未指定は 3.2。 */
  jumpHeight?: number;
}

/** 壁の置き場所を北辺/西辺に正規化する。 */
export const normalizeWall25D = (col: number, row: number, dir: Dir4, tex: number, level = 0): Wall25D => {
  const w: Wall25D =
    dir === 2 ? { col, row: row + 1, dir: 0, tex }    // 南辺 → 下セルの北辺
    : dir === 1 ? { col: col + 1, row, dir: 3, tex }  // 東辺 → 右セルの西辺
    : { col, row, dir, tex };
  if (level > 0) w.level = level;  // 0 は省略（保存JSONを小さく保つ・後方互換）
  return w;
};

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
  /** 置物レイヤー。プレイヤーの後ろに描画され、当たり判定を持つ（地面レイヤーより優先される）。 */
  overlayMap?: number[][];
  /** 天蓋/上層レイヤー（木の上部・屋根など）。プレイヤーより手前に描画され、真下付近にいる間は半透明化する。当たり判定は持たない。 */
  overheadMap?: number[][];
  objects: ObjectDef[];
  exits?: SceneExit;
  /** このシーン専用 BGM。省略時はゲーム共通 BGM を継続。 */
  bgm?: BgmState;
  /** ランダムエンカウント敵テーブル（rpg エンジン）。フィールド歩行中に抽選して戦闘に入る。
   *  encounterGroups が1件以上あるときは無視される（フラットな旧形式・後方互換用）。 */
  randomEncounters?: EncounterEnemy[];
  /** ランダムエンカウントのグループ分け。設定されている場合は randomEncounters より優先。 */
  encounterGroups?: EncounterGroup[];
  /** ランダムエンカウント発生ステップ数（デフォルト 16）。 */
  encounterRate?: number;
}

export interface PresetData {
  id: PresetId; name: string; engine: EngineKind; gravity: number; friction: number;
  /** つるつる床（システムタイル ice-*）の強制スライド速度（px/frame）。未指定時は既定値を使う。
   *  rpg / onjReze エンジン（グリッド4/8方向移動）でのみ使用。action は friction ベースの物理挙動のため対象外。 */
  iceSlideSpeed?: number;
  player: PlayerDef; tiles: Record<number, TileDef>; map: number[][];
  /** 置物レイヤー。map と同サイズのグリッド。プレイヤーの後ろに描画され、当たり判定を持つ。 */
  overlayMap?: number[][];
  /** 天蓋/上層レイヤー（木の上部・屋根など）。map と同サイズのグリッド。プレイヤーより手前に描画され、半透明化する。 */
  overheadMap?: number[][];
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
  /** 武器一覧。装備は EquipmentDef.restrictTo で装備可能キャラを制限できる。 */
  weapons?: EquipmentDef[];
  /** 防具一覧。装備は EquipmentDef.restrictTo で装備可能キャラを制限できる。 */
  armors?: EquipmentDef[];
  /** 汎用エフェクトアニメーション一覧。フィールドイベント/バトル演出から effectId で参照する。 */
  effects?: EffectPreset[];
  /** フェーズ定義（touhou エンジン）。定義するとフェーズ順に進行する。 */
  phases?: StagePhase[];
  /** 2.5Dエンジン（yume25d）のレイアウト。engine==='yume25d' のとき必須。 */
  layout25d?: Layout25D;
/** タイトル画面（東方以外）。enabled=true でプレイ開始前に表示。 */
  titleScreen?: TitleScreenConfig;
  /** エンディング画面（東方以外）。enabled=true でクリア時に表示。 */
  ending?: EndingScreenConfig;
  /** 死亡画面（yume25d エンジン専用）。未設定時はフェード復帰のみ（none 相当）。 */
  deathScreen?: DeathScreenConfig;
}

/** タイトル画面のデフォルト設定（エディタで「有効化」したとき生成）。 */
export const defaultTitleScreen = (name: string): TitleScreenConfig => ({
  enabled: true,
  heading: name,
  subtitle: '',
  textColor: '#ffffff',
  menu: [{ kind: 'newGame', label: 'はじめる' }],
});

/** エンディング画面のデフォルト設定。 */
export const defaultEndingScreen = (): EndingScreenConfig => ({
  enabled: true,
  heading: 'THE END',
  message: 'クリアおめでとう！',
  textColor: '#ffffff',
});

/** 死亡画面のデフォルト設定（Minecraft風）。 */
export const defaultDeathScreen = (): DeathScreenConfig => ({
  style: 'minecraft',
  heading: '死んでしまった！',
  retryLabel: 'リスポーン',
  exitLabel: 'タイトル画面',
  textColor: '#ffffff',
});

/** メニュー項目の種別ラベル。 */
export const SCREEN_MENU_LABELS: Record<ScreenMenuKind, string> = {
  newGame: 'はじめる',
};

export const uid = () => `o${Math.random().toString(36).slice(2, 9)}`;

export const newObject = (over: Partial<ObjectDef> = {}): ObjectDef => ({
  id: uid(), kind: 'npc', emoji: '👾', col: 5, row: 5, hp: 8, speed: 1.5,
  behavior: 'random', bullet: 'none', bulletSpeed: 3, bulletColor: '#00ffff', fireRate: 60,
  hazard: true, message: '', ...over,
});

// ── 宝箱（全プリセット共通） ────────────────────────────────────────────
// リポジトリ同梱の RPGEN マップチップ（/assets/rpgen/map.png, 16pxグリッド）から
// 閉/開の宝箱チップを切り出して使う。walk:smc:u:<url>#sx,sy,sw,sh は
// 1コマだけのストリップとして解釈されるため、静止画の切り出しにも使える。
const CHEST_CHIP_URL = '/assets/rpgen/map.png';
const chestChipCrop = (col: number, row: number) => `${col * 16},${row * 16},16,16`;
const CHEST_SPRITE_CLOSED = `walk:smc:u:${CHEST_CHIP_URL}#${chestChipCrop(18, 15)}`;
const CHEST_SPRITE_OPEN = `walk:smc:u:${CHEST_CHIP_URL}#${chestChipCrop(19, 15)}`;
const CHEST_OPEN_SOUND = 'https://rpgen-search.pages.dev/data/audio/sound/1Jl7OF.mp3';

/** 一度だけ開けられる宝箱（セルフスイッチ A）。近づくと開き、頭上メッセージでアイテムを渡す。
 *  openCmds が giveItem/changeGold を含んでいれば、その入手メッセージが自動で頭上に出るため、
 *  呼び出し側で message コマンドを足す必要はない。openCmds が空なら「からっぽだった」を表示する。 */
/** 内蔵 RPGEN マップチップ（/assets/rpgen/map.png, 16pxグリッド）から1マス切り出す。 */
export const localSysTileUrl = (col: number, row: number) => `${CHEST_CHIP_URL}#${col * 16},${row * 16},16,16`;

/** システムタイルのテンプレート。エディタの「システムオブジェクト」パネルから
 *  gameData.tiles に1件追加する形で使う（追加後は通常タイルと同様にマップへペイントする）。
 *  yume25d では layout25d.textures に special 付きの床テクスチャとして追加し、床ツールで塗る。
 *  color は画像が使えない場面（yume25d の 2D 見下ろしエディタ等）のフォールバック色。 */
export interface SystemTileTemplate {
  key: string; label: string; special: string; imageUrl: string; imageRef: string; passable: boolean; color: string;
}
export const SYSTEM_TILE_TEMPLATES: SystemTileTemplate[] = [
  { key: 'warp', label: 'シーン切替床', special: 'warp', imageUrl: localSysTileUrl(15, 10), imageRef: `url:${localSysTileUrl(15, 10)}`, passable: true, color: '#7fd4ff' },
  { key: 'poison', label: 'どく沼', special: 'damage', imageUrl: localSysTileUrl(6, 0), imageRef: `url:${localSysTileUrl(6, 0)}`, passable: true, color: '#3f6d34' },
  { key: 'damageFloor', label: 'ダメージ床', special: 'damage', imageUrl: localSysTileUrl(13, 7), imageRef: `url:${localSysTileUrl(13, 7)}`, passable: true, color: '#8a4a2a' },
  { key: 'ice-up', label: 'つるつる床（↑）', special: 'ice-up', imageUrl: localSysTileUrl(16, 13), imageRef: `url:${localSysTileUrl(16, 13)}`, passable: true, color: '#9fd8ea' },
  { key: 'ice-right', label: 'つるつる床（→）', special: 'ice-right', imageUrl: localSysTileUrl(17, 13), imageRef: `url:${localSysTileUrl(17, 13)}`, passable: true, color: '#9fd8ea' },
  { key: 'ice-left', label: 'つるつる床（←）', special: 'ice-left', imageUrl: localSysTileUrl(16, 14), imageRef: `url:${localSysTileUrl(16, 14)}`, passable: true, color: '#9fd8ea' },
  { key: 'ice-down', label: 'つるつる床（↓）', special: 'ice-down', imageUrl: localSysTileUrl(17, 14), imageRef: `url:${localSysTileUrl(17, 14)}`, passable: true, color: '#9fd8ea' },
];

/** yume25d の遊べるシステムスプライト（蹴れるボール・近づくと聞こえるスピーカー）。
 *  システム床と同様「special 付きのスプライトテクスチャ」として追加し、スプライトツールで配置する。 */
export interface SystemSpriteTemplate {
  key: string; label: string; special: string; emoji: string; color: string;
}
export const SYSTEM_SPRITE_TEMPLATES: SystemSpriteTemplate[] = [
  { key: 'ball', label: 'サッカーボール', special: 'ball', emoji: '⚽', color: '#e8e8e8' },
  { key: 'speaker', label: 'スピーカー', special: 'speaker', emoji: '🔊', color: '#8ab4ff' },
  { key: 'block', label: 'ブロック', special: 'block', emoji: '🧱', color: '#a97a50' },
  { key: 'food', label: '食べ物', special: 'food', emoji: '🍖', color: '#e0995a' },
];

/** システムタイル共通の効果音（2Dエンジンと yume25d の両方で使う直リンクmp3）。 */
export const SYS_TILE_WARP_SFX = 'https://rpgen-search.pages.dev/data/audio/sound/vfCmoe.mp3';
export const SYS_TILE_DAMAGE_SFX = 'https://rpgen-search.pages.dev/audio/sound/4z7O4A.mp3';
export const SYS_TILE_DOOR_SFX = 'https://rpgen-search.pages.dev/audio/sound/HMyV1k.mp3';

export const chest = (col: number, row: number, openCmds: EventCommand[]): ObjectDef => newObject({
  emoji: '📦', col, row, behavior: 'still', hazard: false,
  spriteRef: CHEST_SPRITE_CLOSED, spriteUrl: CHEST_CHIP_URL,
  altSpriteRef: CHEST_SPRITE_OPEN, altSpriteUrl: CHEST_CHIP_URL,
  pages: [
    {
      conditions: {},
      commands: [
        { type: 'playSound', src: CHEST_OPEN_SOUND },
        ...(openCmds.length > 0 ? openCmds : [{ type: 'overheadMessage', text: 'からっぽだった。' } as EventCommand]),
        { type: 'setSelfSwitch', id: 'A', value: true },
      ],
    },
    // 開封済み（selfSwitch A=true）のときは最高優先度でマッチし、空コマンドで再発動を防ぐ
    { conditions: { selfSwitchId: 'A', selfSwitchValue: true }, commands: [] },
  ],
});

// ── エンジン切替時のマップ変換（ロッシー） ──────────────────────────────────
// 2Dエンジン ⇄ yume25d（2.5D）でマップ構造を「ある程度」引き継ぐための近似変換。
// 完全な再現はしない：2D→2.5D では天蓋は2段目の浮遊ビルボードに、進入不可タイル/置物は
// 境界の壁になる。2.5D→2D では辺単位の薄板壁をセル単位のタイルで表現できず消える。

/** 2Dマップ → Layout25D。
 *  - 地面タイル → 床テクスチャ（damage/ice-* の特殊効果も引き継ぐ。warp はシーン依存のため落とす）
 *  - 進入不可のタイル/置物 → 通行可能マスとの境界の辺に壁を立てる（ブロックの輪郭だけ壁化）
 *  - 天蓋レイヤー → 2段目（level=1）に浮かぶビルボード
 *  - オブジェクト → ビルボード（message があれば「はなす」対象）
 *  スカイ/フォグ/壁高さ等の雰囲気は base（切替先プリセットの初期レイアウト）から継承する。 */
export const convertMapToLayout25D = (src: PresetData, base: Layout25D): Layout25D => {
  const rows = src.map.length;
  const cols = src.map[0]?.length ?? 0;
  const textures: Record<number, Tex25D> = {};
  const tileIds = Object.keys(src.tiles).map(Number);
  const maxTile = tileIds.length ? Math.max(...tileIds) : 0;
  const floorTexId = (tid: number) => tid + 1;           // 0 は「床なし」予約なので +1
  const wallTexId = (tid: number) => maxTile + 2 + tid;  // 床テクスチャ群の後ろへ壁用を並べる
  let nextId = maxTile * 2 + 3;

  for (const tid of tileIds) {
    const t = src.tiles[tid];
    const special = (t.special === 'damage' || t.special?.startsWith('ice-')) ? t.special : undefined;
    textures[floorTexId(tid)] = {
      id: floorTexId(tid), name: t.name, kind: 'floor', color: t.color,
      imageRef: t.imageRef, imageUrl: t.imageUrl,
      ...(special ? { special } : {}),
      ...(special === 'damage' && t.damageAmount !== undefined ? { damageAmount: t.damageAmount } : {}),
    };
  }

  // マスの実効タイル（置物があれば置物優先）と通行可否
  const effTile = (c: number, r: number): { id: number; def?: TileDef } => {
    const ov = src.overlayMap?.[r]?.[c] ?? 0;
    const id = ov > 0 ? ov : (src.map[r]?.[c] ?? 0);
    return { id, def: src.tiles[id] };
  };
  const isPassable = (c: number, r: number) => effTile(c, r).def?.passable !== false;

  const floor: number[][] = Array.from({ length: rows }, (_, r) =>
    Array.from({ length: cols }, (_, c) => floorTexId(src.map[r]?.[c] ?? 0)));

  // 進入不可マス：通行可能な隣接マスとの境界の辺へ壁を立てる
  const walls: Wall25D[] = [];
  const DIRS: [number, number, Dir4][] = [[0, -1, 0], [1, 0, 1], [0, 1, 2], [-1, 0, 3]];
  for (let r = 0; r < rows; r++) for (let c = 0; c < cols; c++) {
    if (isPassable(c, r)) continue;
    const { id, def } = effTile(c, r);
    if (!def) continue;
    if (!textures[wallTexId(id)]) {
      textures[wallTexId(id)] = {
        id: wallTexId(id), name: `${def.name}（壁）`, kind: 'wall',
        color: def.color, imageRef: def.imageRef, imageUrl: def.imageUrl,
      };
    }
    for (const [dx, dy, dir] of DIRS) {
      const nc = c + dx, nr = r + dy;
      if (nc < 0 || nr < 0 || nc >= cols || nr >= rows) continue;
      if (isPassable(nc, nr)) walls.push(normalizeWall25D(c, r, dir, wallTexId(id)));
    }
  }

  // 天蓋レイヤー → 2段目（level=1）に浮かぶビルボード。メッシュ数の暴発を防ぐため上限で打ち切る
  const billboards: Billboard25D[] = [];
  const overheadTexIds = new Map<number, number>();
  const OVERHEAD_BB_MAX = 300;
  outer: for (let r = 0; r < rows; r++) for (let c = 0; c < cols; c++) {
    const oh = src.overheadMap?.[r]?.[c] ?? 0;
    if (oh <= 0) continue;
    const t = src.tiles[oh];
    if (!t) continue;
    if (!overheadTexIds.has(oh)) {
      textures[nextId] = { id: nextId, name: `${t.name}（天蓋）`, kind: 'sprite', color: t.color, imageRef: t.imageRef, imageUrl: t.imageUrl };
      overheadTexIds.set(oh, nextId); nextId++;
    }
    billboards.push({ id: `cv-oh-${c}-${r}`, col: c, row: r, tex: overheadTexIds.get(oh)!, scale: 1, level: 1 });
    if (billboards.length >= OVERHEAD_BB_MAX) break outer;
  }

  // オブジェクト → ビルボード（見た目＝スプライト/絵文字。message 持ちは「はなす」対象）
  for (const o of src.objects) {
    if (o.col < 0 || o.row < 0 || o.col >= cols || o.row >= rows) continue;
    textures[nextId] = {
      id: nextId, name: o.name || o.emoji || 'オブジェ', kind: 'sprite', color: '#c8c8dc',
      emoji: o.emoji || undefined, imageRef: o.spriteRef, imageUrl: o.spriteUrl,
    };
    billboards.push({
      id: `cv-obj-${o.id}`, col: o.col, row: o.row, tex: nextId, scale: 1,
      ...(o.message ? { interactive: true, message: o.message } : {}),
    });
    nextId++;
  }

  // 天井用テクスチャ（初期はOFFだが、後で設定からONにできるよう1枚用意しておく）
  const ceilBase = base.textures[base.ceilingTex];
  const ceilingTex = nextId;
  textures[ceilingTex] = { ...(ceilBase ?? { name: '天井', color: '#191430' }), id: ceilingTex, kind: 'wall' };

  const startCol = Math.max(0, Math.min(cols - 1, Math.round(src.player.start.x / TILE_SIZE)));
  const startRow = Math.max(0, Math.min(rows - 1, Math.round(src.player.start.y / TILE_SIZE)));

  return {
    cols, rows, floor, walls, billboards, textures,
    ceiling: false, ceilingTex,
    wallHeight: base.wallHeight, skyColor: base.skyColor,
    fogColor: base.fogColor, fogNear: base.fogNear, fogFar: base.fogFar,
    start: { col: startCol, row: startRow, dir: 0 },
    pov: base.pov, povDistance: base.povDistance, jumpHeight: base.jumpHeight,
  };
};

/** Layout25D → 2Dマップ。床テクスチャ→タイル・地上ビルボード→NPCオブジェクトの近似変換。
 *  薄板壁（辺単位）はセル単位のタイルで表現できないため失われる。床なし(0)は進入不可タイルになる。 */
export const convertLayout25DToMap = (l: Layout25D): Pick<PresetData, 'tiles' | 'map' | 'overlayMap' | 'overheadMap' | 'objects' | 'scroll'> & { startPx: { x: number; y: number } } => {
  const tiles: Record<number, TileDef> = {
    0: { name: '奈落', color: '#0d0a14', passable: false },
  };
  for (const t of Object.values(l.textures)) {
    if (t.kind !== 'floor' || t.id <= 0) continue;
    tiles[t.id] = {
      name: t.name, color: t.color, passable: true, imageRef: t.imageRef, imageUrl: t.imageUrl,
      ...(t.special && t.special !== 'warp' ? { special: t.special } : {}),
      ...(t.damageAmount !== undefined ? { damageAmount: t.damageAmount } : {}),
    };
  }
  const map = Array.from({ length: l.rows }, (_, r) => Array.from({ length: l.cols }, (_, c) => l.floor[r]?.[c] ?? 0));
  const objects: ObjectDef[] = l.billboards.filter(b => (b.level ?? 0) === 0).map(b => {
    const t = l.textures[b.tex];
    return {
      id: `cv-bb-${b.id}`, kind: 'npc' as const, objType: 'npc' as const,
      emoji: t?.emoji ?? '❓', spriteRef: t?.imageRef, spriteUrl: t?.imageUrl,
      col: b.col, row: b.row, hp: 3, speed: 0,
      behavior: 'still' as const, bullet: 'none' as const, bulletSpeed: 0, bulletColor: '#ffffff', fireRate: 0,
      hazard: false, message: b.message ?? '', name: t?.name,
    };
  });
  return {
    tiles, map,
    overlayMap: map.map(row => row.map(() => 0)),
    overheadMap: map.map(row => row.map(() => 0)),
    objects,
    scroll: { worldCols: l.cols, worldRows: l.rows },
    startPx: { x: l.start.col * TILE_SIZE, y: l.start.row * TILE_SIZE },
  };
};
