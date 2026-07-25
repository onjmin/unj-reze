import {
  CommandType,
  Direction,
  EventTiming,
  HumanBehavior,
  RAW_DQ_STILL_SPRITE_SEPARATOR,
  RAW_TILE_COLLISION_SUFFIX,
  RPGMap,
  RawCommand,
  RawSpritePrefix,
  SpriteType,
  checkDamageTile,
  checkDoorTile,
  checkTableTile,
  checkTreasureBoxTile,
  checkWalkableTile,
  tileOfEvent,
  tileOfLook,
  tileOfTeleport,
  tilesLogicalName,
  type Command,
  type RawTile,
} from "@rpgja/rpgen-map";
import type { GameManifestDraft } from '@/components/GameMaker';
import type { Dir4Name, EventCommand, EventCondition, EventPage, NpcBehavior } from '@/components/game-presets/shared';
import { newObject, uid, TILE_SIZE, chest, localSysTileUrl } from '@/components/game-presets/shared';
import { DQ_CHARACTERS } from '@/lib/local-assets';
import { youtubeRefFromUrl } from '@/lib/asset-ref';
import LZString from 'lz-string';

export const MAX_TILE_CONVERSIONS = 500;

const ORIGIN = 'https://rpgen-search.pages.dev';
const SPRITE_BASE = `${ORIGIN}/data/images/sprites`;
const SANIM_BASE = `${ORIGIN}/data/images/sAnims`;
const SOUND_BASE = `${ORIGIN}/data/audio/sound`;
const BGM_BASE = `${ORIGIN}/data/audio/bgm`;
/** リポジトリ同梱の RPGEN 標準マップチップ（16pxグリッド） */
const RPGEN_CHIP_URL = '/assets/rpgen/map.png';
const RPGEN_CHIP_SIZE = 16;

/** RPGEN の人物の動き方 → エンジンの NPC ビヘイビア。
 *  RPGEN の人物は「一定間隔で speed% の判定を行い、当たったら1マス歩く」という DQ 風の動き方をするため、
 *  必ず moveChance（1マス移動モード）とセットで使う。1マス移動モードでの各 behavior の意味は
 *  ObjectDef.moveChance のコメントを参照。 */
const NPC_BEHAVIOR_BY_HUMAN_BEHAVIOR: Record<HumanBehavior, NpcBehavior> = {
  [HumanBehavior.Still]: 'still',
  [HumanBehavior.RandomMove]: 'random',
  // 1マス移動モードの still は「移動せず向きだけ変える」なので、そのまま方向転換になる
  [HumanBehavior.RandomDirection]: 'still',
  // 1マス移動モードの patrolH/patrolV は左右／上下のランダム移動になる
  [HumanBehavior.RandomMoveHorizontal]: 'patrolH',
  [HumanBehavior.RandomMoveVertical]: 'patrolV',
  [HumanBehavior.GoNear]: 'chase',
  [HumanBehavior.RunAway]: 'flee',
};

/** RPGEN の人物の向き → エンジンの初期の向き。 */
const DIR_BY_RPGEN_DIRECTION: Record<Direction, Dir4Name> = {
  [Direction.North]: 'up',
  [Direction.East]: 'right',
  [Direction.South]: 'down',
  [Direction.West]: 'left',
};

/** 標準素材の「動く床」→ エンジンの強制スライド床。 */
const ICE_SPECIAL_BY_TILE: Record<string, string> = {
  '16_13': 'ice-up',
  '17_13': 'ice-right',
  '16_14': 'ice-left',
  '17_14': 'ice-down',
};

const ANIMATION_SPRITE_PREFIX = RawSpritePrefix[SpriteType.CustomAnimationSprite];

type ImageFrame = { url: string; sx: number; sy: number; sw: number; sh: number; ox: number; oy: number; r: number; a: number };
/** 素材ID・ファイル名・URL のいずれかを実URLへ解決する。 */
type ResolveUrl = (raw: string) => string;

/** 独自素材タイル（"123" / "123C"）の素材ID。標準素材（"12_3"）なら undefined。 */
const customTileId = (rawTile: string): number | undefined => {
  if (rawTile.includes(RAW_DQ_STILL_SPRITE_SEPARATOR)) return undefined;
  const id = Number(rawTile.replaceAll(RAW_TILE_COLLISION_SUFFIX, ''));
  return Number.isFinite(id) ? id : undefined;
};

/** コマンドの n パラメータ（"A123"=歩行グラ / "123"=静止スプライト）。 */
const parseSpriteParam = (raw: string | undefined): { id: number; animated: boolean } | undefined => {
  if (!raw) return undefined;
  const animated = raw.startsWith(ANIMATION_SPRITE_PREFIX);
  const id = Number(animated ? raw.slice(ANIMATION_SPRITE_PREFIX.length) : raw);
  return Number.isFinite(id) ? { id, animated } : undefined;
};

/** #DW_IMG/#DW_IMA/#DW_FL の u 系パラメータのうち、素材IDで指定されたもの。 */
const spriteIdsInImageParams = (params: Record<string, string>): number[] => {
  const ids: number[] = [];
  for (const [key, value] of Object.entries(params)) {
    if (key[0] !== 'u') continue;
    if (!/^\d+$/.test(value)) continue;
    ids.push(Number(value));
  }
  return ids;
};

const parseParamsBody = (body: string): Record<string, string> => {
  const params: Record<string, string> = {};
  for (const pair of body.trim().split(',')) {
    const idx = pair.indexOf(':');
    if (idx >= 0) params[pair.slice(0, idx).trim()] = pair.slice(idx + 1).trim();
  }
  return params;
};

/** #MSG 本文に "#DW_IMA\nu:…,x:…," のようなコマンドが直接書かれている場合に分解する。 */
const parseEmbeddedCommand = (text: string): { name: string; params: Record<string, string> } | null => {
  const matched = text.match(/^#([A-Z_]+)[ \t]*(?:\r?\n([\s\S]*))?$/);
  if (!matched) return null;
  return { name: matched[1], params: parseParamsBody(matched[2] ?? '') };
};

/** 選択肢の分岐の中まで再帰的に全コマンドを走査する。 */
const forEachCommand = (commands: Command[], visit: (cmd: Command) => void): void => {
  for (const cmd of commands) {
    visit(cmd);
    if (cmd.type === CommandType.Select) {
      for (const choice of cmd.choices) forEachCommand(choice.sequence, visit);
    }
  }
};

/** d（方角）と v（マス数）から移動量を求める。0-3=上右下左、4-7=斜め。 */
const directionDelta = (dRaw: string | undefined, vRaw: string | undefined): { dx: number; dy: number } => {
  const v = parseInt(vRaw || '1');
  const named: Record<string, number> = { up: 0, right: 1, down: 2, left: 3 };
  const d = named[dRaw ?? ''] ?? parseInt(dRaw || '0');
  switch (d) {
    case 0: return { dx: 0, dy: -v };
    case 1: return { dx: v, dy: 0 };
    case 2: return { dx: 0, dy: v };
    case 3: return { dx: -v, dy: 0 };
    case 4: return { dx: v, dy: -v };
    case 5: return { dx: v, dy: v };
    case 6: return { dx: -v, dy: v };
    case 7: return { dx: -v, dy: -v };
    default: return { dx: 0, dy: 0 };
  }
};

const buildFrames = (params: Record<string, string>, resolveUrl: ResolveUrl): ImageFrame[] => {
  const frames: ImageFrame[] = [];
  for (let i = 1; i <= 30; i++) {
    const sfx = i === 1 ? '' : String(i);
    const hasAnyParam = ['u', 'sx', 'sy', 'sw', 'sh', 'ox', 'oy', 'r', 'a'].some(k => params[`${k}${sfx}`] !== undefined);
    if (!hasAnyParam) break;
    const prevFrame = i > 1 ? frames[frames.length - 1] : null;
    const u = params[`u${sfx}`];
    frames.push({
      url: u ? resolveUrl(u) : (prevFrame ? prevFrame.url : ''),
      sx: parseInt(params[`sx${sfx}`] || '0'),
      sy: parseInt(params[`sy${sfx}`] || '0'),
      sw: parseInt(params[`sw${sfx}`] || '100'),
      sh: parseInt(params[`sh${sfx}`] || '100'),
      ox: parseInt(params[`ox${sfx}`] || '0'),
      oy: parseInt(params[`oy${sfx}`] || '0'),
      r: parseInt(params[`r${sfx}`] || '0'),
      a: parseInt(params[`a${sfx}`] || (i === 1 ? '100' : (prevFrame ? String(prevFrame.a) : '100'))),
    });
  }
  return frames;
};

const showImageCommand = (params: Record<string, string>, resolveUrl: ResolveUrl): EventCommand => {
  const frames = buildFrames(params, resolveUrl);
  return {
    type: 'showImage',
    imgId: params.i || '1',
    url: frames.length > 0 ? frames[0].url : '',
    x: parseInt(params.x || '0'),
    y: parseInt(params.y || '0'),
    w: parseInt(params.w || '0'),
    h: parseInt(params.h || '0'),
    opacity: parseInt(params.a || '100'),
    isPercent: params.xp !== '1',
    m: params.m === '1',
    c: params.c === '1',
    sxp: params.sxp === '1',
    swp: params.swp === '1',
    xp: params.xp === '1',
    wp: params.wp === '1',
    lp: params.lp === '1',
    ms: parseInt(params.ms || '100'),
    frames,
  };
};

export async function parseRpgen(text: string): Promise<GameManifestDraft> {
  // Try to parse as-is. If that fails and the text looks like it could be
  // LZString-compressed (no 'L1' prefix — that case is handled by the caller),
  // attempt decompression and retry once before giving up.
  let rpgMap: RPGMap;
  try {
    rpgMap = RPGMap.parse(text);
  } catch (firstErr) {
    const decompressed = LZString.decompressFromEncodedURIComponent(text);
    if (decompressed) {
      rpgMap = RPGMap.parse(decompressed); // throws with a meaningful error if still invalid
    } else {
      throw firstErr;
    }
  }

  // ── 解析結果のキャッシュ ────────────────────────────────────────────────
  // 素材IDの収集とコマンド変換で同じ解析結果を使い回す。
  const scriptCache = new Map<string, Command[]>();
  /** RPGENのメッセージ本文をコマンド列として解釈する（コマンドで始まらなければ空配列）。 */
  const parseScript = (message: string): Command[] => {
    const cached = scriptCache.get(message);
    if (cached) return cached;
    let parsed: Command[] = [];
    if (/^\s*#[A-Z_]+/.test(message)) {
      try {
        parsed = RawCommand.parseSequence(message).map((c) => c.parse());
      } catch {
        parsed = [];
      }
    }
    scriptCache.set(message, parsed);
    return parsed;
  };

  const phaseCache = new Map<RawCommand[], Command[]>();
  /** #PH<N> のコマンド列を parse する（壊れたコマンドは読み飛ばす）。 */
  const parsePhase = (sequence: RawCommand[]): Command[] => {
    const cached = phaseCache.get(sequence);
    if (cached) return cached;
    const parsed: Command[] = [];
    for (const raw of sequence) {
      try {
        parsed.push(raw.parse());
      } catch {
        // 壊れたコマンドは読み飛ばす
      }
    }
    phaseCache.set(sequence, parsed);
    return parsed;
  };

  // ── 素材ID・スイッチIDの収集 ────────────────────────────────────────────
  // RPGEN の素材は連番IDで参照されるが、画像の実URLはハッシュ化されたIDになる。
  // 変換に必要なIDをマップ全体から先に集め、まとめて encode API に問い合わせる。
  const idsToTranslate = new Set<number>();
  const switchIds = new Set<number>();

  const floorSize = rpgMap.floor.getSize();
  const objSize = rpgMap.objects.getSize();
  const cols = Math.max(floorSize.width, objSize.width);
  const rows = Math.max(floorSize.height, objSize.height);

  for (let y = 0; y < rows; y++) {
    for (let x = 0; x < cols; x++) {
      for (const raw of [rpgMap.floor.getRaw(x, y), rpgMap.objects.getRaw(x, y)]) {
        if (!raw) continue;
        const id = customTileId(raw);
        if (id !== undefined) idsToTranslate.add(id);
      }
    }
  }

  for (const human of rpgMap.humans) {
    if (human.sprite.type === SpriteType.CustomStillSprite || human.sprite.type === SpriteType.CustomAnimationSprite) {
      if (Number.isFinite(human.sprite.id)) idsToTranslate.add(human.sprite.id);
    }
  }

  const collectFromCommand = (cmd: Command): void => {
    switch (cmd.type) {
      case CommandType.ChangeObjectSprite:
      case CommandType.ChangeHumanSprite: {
        const spec = parseSpriteParam(cmd.params.n);
        if (spec) idsToTranslate.add(spec.id);
        break;
      }
      case CommandType.DrawImage:
      case CommandType.DrawAnimation:
      case CommandType.DrawFollowImage: {
        for (const id of spriteIdsInImageParams(cmd.params)) idsToTranslate.add(id);
        break;
      }
      case CommandType.PlaySound: {
        const id = Number(cmd.params.i);
        if (cmd.params.i !== undefined && Number.isFinite(id)) idsToTranslate.add(id);
        break;
      }
      case CommandType.OnSwitch:
      case CommandType.OffSwitch: {
        const id = Number(cmd.params.n);
        if (Number.isFinite(id)) switchIds.add(id);
        break;
      }
      case CommandType.Message: {
        // #MSG の本文にコマンドが直書きされている場合（#DW_IMA 等）も対象にする
        const embedded = parseEmbeddedCommand(cmd.content);
        if (embedded) for (const id of spriteIdsInImageParams(embedded.params)) idsToTranslate.add(id);
        break;
      }
    }
  };
  const collectFrom = (commands: Command[]) => forEachCommand(commands, collectFromCommand);

  for (const human of rpgMap.humans) collectFrom(parseScript(human.message ?? ''));
  for (const tbox of rpgMap.treasureBoxPoints) collectFrom(parseScript(tbox.message ?? ''));
  for (const spoint of rpgMap.lookPoints) collectFrom(parseScript(spoint.message ?? ''));
  for (const ep of rpgMap.eventPoints) {
    for (const phase of ep.phases) {
      collectFrom(parsePhase(phase.sequence));
      const sw = 'condition' in phase ? phase.condition.switch : undefined;
      if (sw !== undefined && Number.isFinite(sw)) switchIds.add(sw);
    }
  }

  const AUTH_TOKEN = process.env.NEXT_PUBLIC_RPGEN_SEARCH_TOKEN;

  const uniqueIds = Array.from(idsToTranslate);
  const idToHash = new Map<number, string>();

  for (let i = 0; i < uniqueIds.length; i += 1000) {
    const chunk = uniqueIds.slice(i, i + 1000);
    try {
      const res = await fetch(`${ORIGIN}/api/rpgen/encode`, {
        method: "POST",
        headers: {
          "Authorization": `Bearer ${AUTH_TOKEN}`,
          "Content-Type": "application/json"
        },
        body: JSON.stringify({ ids: chunk })
      });
      const data = await res.json();
      if (data.encodedIds) {
        chunk.forEach((id, idx) => {
          idToHash.set(id, data.encodedIds[idx]);
        });
      }
    } catch (err) {
      console.warn("RPGEN encode API failed", err);
    }
  }

  const spriteUrlOf = (id: number): string => {
    const hash = idToHash.get(id);
    return hash ? `${SPRITE_BASE}/${hash}.png` : '';
  };
  const sAnimUrlOf = (id: number): string => {
    const hash = idToHash.get(id);
    return hash ? `${SANIM_BASE}/${hash}.png` : '';
  };
  /** 素材ID / imgur のファイル名 / 直リンクURL のいずれかを実URLへ解決する。 */
  const resolveUrl: ResolveUrl = (raw) => {
    if (!raw) return '';
    if (raw.startsWith('http')) return raw;
    if (/^[A-Za-z0-9]+\.(png|jpg|jpeg|gif)$/i.test(raw)) return `https://i.imgur.com/${raw}`;
    return spriteUrlOf(parseInt(raw));
  };
  /** 素材IDで指定された効果音を直リンクmp3へ解決する。 */
  const resolveSoundUrl = (raw: string | undefined): string => {
    if (!raw) return '';
    if (raw.startsWith('http')) return raw;
    const hash = /^\d+$/.test(raw) ? idToHash.get(Number(raw)) : raw;
    return hash ? `${SOUND_BASE}/${hash}.mp3` : '';
  };

  const draft: GameManifestDraft = {
    engine: 'rpg',
    preset: 'onjReze',
    name: 'RPGEN Imported Game',
    gravity: 0,
    friction: 0,
    player: {
      emoji: '', color: '#ffffff', speed: 2, jumpPower: 0, w: TILE_SIZE, h: TILE_SIZE,
      start: { x: (rpgMap.initialHeroPosition?.x ?? 0) * TILE_SIZE, y: (rpgMap.initialHeroPosition?.y ?? 0) * TILE_SIZE },
      spriteRef: 'walk:auto:u:/assets/rpgen/char/00-hero.png',
    },
    tiles: {
      0: { name: 'Empty', color: '#000000', passable: true }
    },
    map: [],
    overlayMap: [],
    overheadMap: [],
    objects: [],
    bgm: rpgMap.bgmUrl
      ? (/(?:youtube\.com|youtu\.be)/i.test(rpgMap.bgmUrl) ? youtubeRefFromUrl(rpgMap.bgmUrl) : rpgMap.bgmUrl.startsWith('http') || rpgMap.bgmUrl.startsWith('/') ? `direct:${rpgMap.bgmUrl}` : `direct:${BGM_BASE}/${rpgMap.bgmUrl}`)
      : '',
    mapBgRef: 'tile:#000000',
    sfx: {},
    // RPGEN のスイッチは番号のみで名前を持たないため、使われている番号だけを登録する
    switches: Array.from(switchIds).sort((a, b) => a - b).map(id => ({ id, name: `スイッチ${id}` })),
  };

  const tileIndexMap = new Map<string, number>();
  let nextTileIdx = 1;

  const parseTile = (rawVal: RawTile | undefined): number => {
    if (!rawVal) return 0;
    const tk = String(rawVal);
    if (!tileIndexMap.has(tk)) {
      if (tileIndexMap.size >= MAX_TILE_CONVERSIONS) {
        throw new Error(`タイル変換数が上限（${MAX_TILE_CONVERSIONS}種類）を超えています。インポートを中断します。`);
      }
      let imageUrl: string | undefined = undefined;
      let passable = !tk.includes(RAW_TILE_COLLISION_SUFFIX);
      let name = tk;
      const tkBase = tk.replaceAll(RAW_TILE_COLLISION_SUFFIX, '');
      let special: string | undefined = ICE_SPECIAL_BY_TILE[tkBase];
      if (special === undefined) {
        if (checkDoorTile(tkBase)) special = 'door';
        else if (checkTableTile(tkBase)) special = 'table';
        else if (checkTreasureBoxTile(tkBase)) special = 'treasure';
        else if (checkDamageTile(tkBase)) special = 'damage';
      }

      if (tk.includes(RAW_DQ_STILL_SPRITE_SEPARATOR)) {
        const [cStr, rStr] = tk.split(RAW_DQ_STILL_SPRITE_SEPARATOR);
        imageUrl = `${RPGEN_CHIP_URL}#${parseInt(cStr, 10) * RPGEN_CHIP_SIZE},${parseInt(rStr, 10) * RPGEN_CHIP_SIZE},${RPGEN_CHIP_SIZE},${RPGEN_CHIP_SIZE}`;
        // 標準素材は checkWalkableTile の判定を C フラグより優先する
        passable = checkWalkableTile(tkBase);
        // エディタのタイル一覧で識別できるよう、生の値ではなく論理名を使う
        name = (tilesLogicalName as Record<string, string | undefined>)[tkBase] ?? tk;
      } else {
        const id = customTileId(tk);
        if (id !== undefined) imageUrl = spriteUrlOf(id) || undefined;
      }
      tileIndexMap.set(tk, nextTileIdx);
      draft.tiles[nextTileIdx] = { name, color: '#333333', passable, imageUrl, special };
      nextTileIdx++;
    }
    return tileIndexMap.get(tk)!;
  };

  for (let y = 0; y < rows; y++) {
    const rowFloor: number[] = [];
    const rowObj: number[] = [];
    const rowOverhead: number[] = [];
    for (let x = 0; x < cols; x++) {
      rowFloor.push(parseTile(rpgMap.floor.getRaw(x, y)));
      rowObj.push(parseTile(rpgMap.objects.getRaw(x, y)));
      rowOverhead.push(0);
    }
    draft.map.push(rowFloor);
    draft.overlayMap!.push(rowObj);
    draft.overheadMap!.push(rowOverhead);
  }

  /** #CH_SP / #CH_HM の n パラメータから見た目の差し替え内容を作る。 */
  const spriteChangeOf = (n: string | undefined): { spriteRef: string; spriteUrl: string } => {
    const spec = parseSpriteParam(n);
    if (!spec) return { spriteRef: '', spriteUrl: '' };
    if (spec.animated) {
      const url = sAnimUrlOf(spec.id);
      return { spriteRef: url ? `walk:auto:u:${url}` : '', spriteUrl: '' };
    }
    return { spriteRef: '', spriteUrl: spriteUrlOf(spec.id) };
  };

  // ── 人物の参照解決 ──────────────────────────────────────────────────────
  // RPGEN の #MV_N*/#CH_SP/#CH_HM/#DW_FL は対象の人物を「配置時の座標」で指す。
  // エンジン側は ObjectDef.id で対象を探すため、人物ごとの id を先に採番しておき、
  // 座標からその id を引けるようにする（座標に人物がいなければ RPGEN でも対象なしなので解決しない）。
  const humanObjIdByCell = new Map<string, string>();
  const cellKey = (x: number, y: number) => `${x},${y}`;
  for (const human of rpgMap.humans) {
    humanObjIdByCell.set(cellKey(human.position.x, human.position.y), uid());
  }

  /** 座標パラメータ（文字列）から対象の人物の objId を求める。該当なしのときは実在しない id を返す。 */
  const npcObjId = (x: string | undefined, y: string | undefined): string => {
    if (x === undefined || y === undefined) return '';
    const cx = parseInt(x, 10), cy = parseInt(y, 10);
    if (!Number.isFinite(cx) || !Number.isFinite(cy)) return '';
    return humanObjIdByCell.get(cellKey(cx, cy)) ?? `obj-human-${cx}-${cy}`;
  };

  const translateRpgenCommand = (cmd: Command): EventCommand | null => {
    switch (cmd.type) {
      case CommandType.Message: {
        const text = cmd.content || '';
        const embedded = parseEmbeddedCommand(text);
        switch (embedded?.name) {
          case CommandType.DrawAnimation:
          case CommandType.DrawImage:
            return showImageCommand(embedded.params, resolveUrl);
          case CommandType.StopAnimation:
          case CommandType.StopImage:
            return { type: 'hideImage', imgId: embedded.params.i || '1' };
          case 'ED':
            // 一部の #ED が MSG として残っている場合の後方互換
            return null;
        }
        return { type: 'message', text };
      }
      case CommandType.Select: {
        const choiceNode: EventCommand = {
          type: 'choice', text: '', choices: [],
          // x/y の指定がない #SEL はランダムな位置に出るため、選択肢UIを出さずランダムに1つ実行する
          random: cmd.displayPosition === undefined,
          // ライブラリの clearMessage は c フラグそのもの。RPGENの実際の挙動は
          // c:1で直前のメッセージウィンドウを表示したままにする、というものなのでそのまま使う。
          keepMessage: cmd.clearMessage === true,
        };
        for (const choice of cmd.choices) {
          choiceNode.choices.push({
            label: choice.label,
            commands: choice.sequence.map(translateRpgenCommand).filter(Boolean) as EventCommand[],
          });
        }
        return choiceNode;
      }
      case CommandType.Wait: return { type: 'wait', frames: Math.floor((cmd.delay || 1000) / 16) };
      case CommandType.ChangeObjectSprite: {
        const { spriteRef, spriteUrl } = spriteChangeOf(cmd.params.n);
        return { type: 'changeSprite', spriteRef, spriteUrl, objId: npcObjId(cmd.params.tx, cmd.params.ty) };
      }
      case CommandType.ChangeHumanSprite: {
        const { spriteRef, spriteUrl } = spriteChangeOf(cmd.params.n);
        // i:0 は主人公、それ以外は tx/ty の位置にいるNPC
        const objId = cmd.params.i === '0' ? 'player' : (npcObjId(cmd.params.tx, cmd.params.ty) || 'player');
        return { type: 'changeSprite', spriteRef, spriteUrl, objId };
      }
      case CommandType.MovePartyDirection: {
        const { dx, dy } = directionDelta(cmd.params.d, cmd.params.v);
        return { type: 'moveNpc', objId: 'player', dx, dy, duration: parseInt(cmd.params.t || cmd.params.p || '0') };
      }
      case CommandType.MovePartyAbsolute:
        return { type: 'moveNpc', objId: 'player', tx: parseInt(cmd.params.tx || '0'), ty: parseInt(cmd.params.ty || '0'), duration: parseInt(cmd.params.t || cmd.params.p || '0') };
      case CommandType.MovePartyRelative:
        return { type: 'moveNpc', objId: 'player', dx: parseInt(cmd.params.tx || '0'), dy: parseInt(cmd.params.ty || '0'), duration: parseInt(cmd.params.t || cmd.params.p || '0') };
      case CommandType.MoveNpcDirection: {
        const { dx, dy } = directionDelta(cmd.params.d, cmd.params.v);
        return { type: 'moveNpc', objId: npcObjId(cmd.params.nx ?? '0', cmd.params.ny ?? '0'), dx, dy, duration: parseInt(cmd.params.t || cmd.params.p || '0') };
      }
      case CommandType.MoveNpcAbsolute:
        return { type: 'moveNpc', objId: npcObjId(cmd.params.nx ?? '0', cmd.params.ny ?? '0'), tx: parseInt(cmd.params.tx || '0'), ty: parseInt(cmd.params.ty || '0'), duration: parseInt(cmd.params.t || cmd.params.p || '0') };
      case CommandType.MoveNpcRelative:
        return { type: 'moveNpc', objId: npcObjId(cmd.params.nx ?? '0', cmd.params.ny ?? '0'), dx: parseInt(cmd.params.tx || '0'), dy: parseInt(cmd.params.ty || '0'), duration: parseInt(cmd.params.t || cmd.params.p || '0') };
      case CommandType.PlusGold: return { type: 'changeGold', amount: parseInt(cmd.params.v || '0') };
      case CommandType.MinusGold: return { type: 'changeGold', amount: -parseInt(cmd.params.v || '0') };
      case CommandType.SetGold: return { type: 'changeGold', amount: parseInt(cmd.params.v || '0') };
      case CommandType.DrawAnimation:
      case CommandType.DrawImage:
        return showImageCommand(cmd.params, resolveUrl);
      case CommandType.StopAnimation:
      case CommandType.StopImage: return { type: 'hideImage', imgId: cmd.params.i || '1' };
      case CommandType.DrawFollowImage: {
        const params = cmd.params;
        const dirs: Record<'U' | 'D' | 'L' | 'R', NonNullable<Extract<EventCommand, { type: 'followImage' }>['directions']['U']> | undefined> =
          { U: undefined, D: undefined, L: undefined, R: undefined };
        for (const dir of ['U', 'D', 'L', 'R'] as const) {
          const u = params[`u${dir}`];
          if (u || params[`x${dir}`] !== undefined) {
            dirs[dir] = {
              url: resolveUrl(u || ''),
              x: parseInt(params[`x${dir}`] || '0'),
              y: parseInt(params[`y${dir}`] || '0'),
              w: parseInt(params[`w${dir}`] || '0'),
              h: parseInt(params[`h${dir}`] || '0'),
              opacity: parseInt(params[`a${dir}`] || '100'),
              xp: params[`xp${dir}`] === '1',
              wp: params[`wp${dir}`] === '1',
              sxp: params[`sxp${dir}`] === '1',
              swp: params[`swp${dir}`] === '1',
              m: params[`m${dir}`] === '1',
              c: params[`c${dir}`] === '1',
              sx: parseInt(params[`sx${dir}`] || '0'),
              sy: parseInt(params[`sy${dir}`] || '0'),
              sw: parseInt(params[`sw${dir}`] || '100'),
              sh: parseInt(params[`sh${dir}`] || '100'),
              ox: parseInt(params[`ox${dir}`] || '0'),
              oy: parseInt(params[`oy${dir}`] || '0'),
              r: parseInt(params[`r${dir}`] || '0'),
            };
          }
        }
        return {
          type: 'followImage',
          imgId: params.i || '1',
          targetObjId: npcObjId(params.nx, params.ny) || 'player',
          directions: dirs,
        };
      }
      case CommandType.PauseImage:
      case CommandType.PauseAnimation: return { type: 'pauseImage', imgId: cmd.params.i || '1' };
      case CommandType.ResumeImage:
      case CommandType.ResumeAnimation: return { type: 'resumeImage', imgId: cmd.params.i || '1' };
      case CommandType.PauseLayer:
      case CommandType.PauseLayerAnimation: return { type: 'pauseImage', layer: parseInt(cmd.params.l || '0') };
      case CommandType.ResumeLayer:
      case CommandType.ResumeLayerAnimation: return { type: 'resumeImage', layer: parseInt(cmd.params.l || '0') };
      case CommandType.PlaySound: return { type: 'playSound', src: resolveSoundUrl(cmd.params.i) };
      case CommandType.ChangeBGM: return { type: 'changeBackground', bgRef: '', bgUrl: cmd.params.v };
      case CommandType.ChangePhase: return { type: 'changePhase', phaseIndex: parseInt(cmd.params.p || '1') };
      case CommandType.OnSwitch: return { type: 'setSwitch', switchId: parseInt(cmd.params.n || '0'), value: true };
      case CommandType.OffSwitch: return { type: 'setSwitch', switchId: parseInt(cmd.params.n || '0'), value: false };
      case CommandType.MoveMap: return { type: 'warp', col: parseInt(cmd.params.tx || '0'), row: parseInt(cmd.params.ty || '0'), mapId: cmd.params.n };
      case CommandType.Comment: return { type: 'comment', text: cmd.params.m || '' };
      case CommandType.StopScreenEffect: return { type: 'clearScreenEffect' };
      case CommandType.StartScreenEffect: {
        const effects = [];
        for (let idx = 0; idx < 10; idx++) {
          const iStr = cmd.params[`i${idx}`];
          if (!iStr) continue;
          const kvs = iStr.split('+').reduce((acc: Record<string, string>, kv: string) => {
            const [k, v] = kv.split('=');
            if (k) acc[k] = v;
            return acc;
          }, {});
          effects.push({
            type: kvs.t === '1' ? 'gradient' : 'solid',
            color: kvs.c || '',
            c1: kvs.c1 || '',
            c2: kvs.c2 || '',
            pos: kvs.p || '',
            stops: kvs.s || ''
          });
        }
        return { type: 'screenEffect', effects: effects as Extract<EventCommand, { type: 'screenEffect' }>['effects'] };
      }
      case CommandType.MoveCameraReset: return { type: 'resetCamera', duration: parseInt(cmd.params.t || cmd.params.p || '300') };
      case CommandType.MoveCameraDirection: {
        const { dx, dy } = directionDelta(cmd.params.d, cmd.params.v);
        return { type: 'moveCamera', dx, dy, duration: parseInt(cmd.params.t || cmd.params.p || '300'), blocking: cmd.params.nb !== '1' };
      }
      case CommandType.MoveCameraAbsolute:
        return { type: 'moveCamera', tx: parseInt(cmd.params.tx || '0'), ty: parseInt(cmd.params.ty || '0'), duration: parseInt(cmd.params.t || cmd.params.p || '300'), blocking: cmd.params.nb !== '1' };
      case CommandType.MoveCameraRelative:
        return { type: 'moveCamera', dx: parseInt(cmd.params.tx || '0'), dy: parseInt(cmd.params.ty || '0'), duration: parseInt(cmd.params.t || cmd.params.p || '300'), blocking: cmd.params.nb !== '1' };
      case CommandType.ChangeWeatherRain:
      case CommandType.ChangeWeatherClear:
        return { type: 'screenEffect', effects: [{ type: 'solid', color: cmd.params.c || cmd.params.c1 || '', c1: '', c2: '', pos: '', stops: '' }] };
      default: return { type: 'comment', text: `Unimplemented: ${cmd.type}` };
    }
  };

  const translateSequence = (commands: Command[]): EventCommand[] =>
    commands.map(translateRpgenCommand).filter(Boolean) as EventCommand[];

  // RPGENの message は本来「#DW_IMA/#MSG/#SEL...」等のコマンド列を含むスクリプトになりうる。
  // 単なる表示テキストとして扱うと fade-in/message/fade-out のような演出が逐次実行されないため、
  // スクリプトらしき内容は translateRpgenCommand でコマンド列化して pages に変換する。
  const messageToPages = (message: string): EventPage[] | undefined => {
    if (!message || !message.trim()) return undefined;
    const commands = translateSequence(parseScript(message));
    if (commands.length === 0) return undefined;
    return [{ name: 'Phase 0', conditions: {}, trigger: 'action', commands }];
  };

  for (const human of rpgMap.humans) {
    let spriteUrl: string | undefined = undefined;
    let spriteRef: string | undefined = undefined;
    if (human.sprite.type === SpriteType.DQAnimationSprite) {
      const surface = human.sprite.surface;
      const match = DQ_CHARACTERS.find(c => c.surface === surface);
      if (match) spriteRef = `walk:auto:u:${match.url}`;
    } else if (human.sprite.type === SpriteType.CustomStillSprite) {
      spriteUrl = spriteUrlOf(human.sprite.id) || undefined;
    } else if (human.sprite.type === SpriteType.CustomAnimationSprite) {
      const url = sAnimUrlOf(human.sprite.id);
      if (url) spriteRef = `walk:auto:u:${url}`;
    }

    const pages = messageToPages(human.message || '');
    draft.objects.push(newObject({
      // 座標で人物を指すコマンド（#MV_NA 等）の変換先と一致させるため、先に採番した id を使う
      id: humanObjIdByCell.get(cellKey(human.position.x, human.position.y)) ?? uid(),
      col: human.position.x, row: human.position.y,
      emoji: (spriteUrl || spriteRef) ? undefined : '🧍',
      spriteUrl,
      spriteRef,
      behavior: NPC_BEHAVIOR_BY_HUMAN_BEHAVIOR[human.behavior] ?? 'still',
      dir: DIR_BY_RPGEN_DIRECTION[human.direction] ?? 'down',
      // RPGEN の speed は「移動する確率(%)」。一定間隔で判定し、当たったら1マス歩く。
      moveChance: Number.isFinite(human.speed) ? Math.max(0, Math.min(100, human.speed)) : 0,
      hazard: false,
      message: pages ? '' : (human.message || ''), objType: 'npc',
      pages
    }));
  }

  for (const tbox of rpgMap.treasureBoxPoints) {
    const pages = messageToPages(tbox.message || '');
    const openCmds = pages?.[0]?.commands ?? (tbox.message ? [{ type: 'overheadMessage', text: tbox.message }] : []);
    const chestObj = chest(tbox.position.x, tbox.position.y, openCmds as EventCommand[]);
    // RPGENの宝箱は近づくだけで自動開封（RPGエンジンと同じ playerTouch 動作）
    if (chestObj.pages) {
      const opener = chestObj.pages.find(p => !p.conditions?.selfSwitchId);
      if (opener) opener.trigger = 'playerTouch';
    }
    draft.objects.push(chestObj);
  }

  for (const spoint of rpgMap.lookPoints) {
    const pages = messageToPages(spoint.message || '');
    const commands = pages?.[0]?.commands
      ?? [{ type: 'overheadMessage', text: spoint.message || '何も発見できなかった。' } as EventCommand];
    // once（1回だけ）のしらべるポイントは、実行後にセルフスイッチAを立てて再発動を防ぐ
    const lookPages: EventPage[] = spoint.once
      ? [
          { name: 'Examine', conditions: {}, trigger: 'action', commands: [...commands, { type: 'setSelfSwitch', id: 'A', value: true }] },
          { name: 'Examined', conditions: { selfSwitchId: 'A', selfSwitchValue: true }, trigger: 'action', commands: [] },
        ]
      : [{ name: 'Examine', conditions: {}, trigger: 'action', commands }];

    draft.objects.push(newObject({
      col: spoint.position.x, row: spoint.position.y, emoji: '',
      behavior: 'still', hazard: false,
      editorSprite: localSysTileUrl(tileOfLook.x, tileOfLook.y),
      message: pages ? '' : (spoint.message || ''), objType: 'npc',
      pages: lookPages
    }));
  }

  for (const ep of rpgMap.eventPoints) {
    const pages: EventPage[] = ep.phases.map((phase, idx) => {
      // RPGEN のフェーズ発生条件を EventCondition へ変換する。
      const conditions: EventCondition = {};
      if ('condition' in phase) {
        const goldCond = Number(phase.condition.gold);
        if (Number.isFinite(goldCond) && goldCond > 0) conditions.minGold = goldCond;
        const switchCond = Number(phase.condition.switch);
        if (Number.isFinite(switchCond)) {
          conditions.switchId = switchCond;
          conditions.switchValue = true;
        }
      }
      return {
        name: `Phase ${idx}`,
        conditions,
        trigger: phase.timing === EventTiming.Touch ? 'playerTouch' as const : 'action' as const,
        commands: translateSequence(parsePhase(phase.sequence)),
      };
    });

    const humanObj = draft.objects.find(o => o.col === ep.position.x && o.row === ep.position.y && o.objType === 'npc');
    if (humanObj) {
      humanObj.pages = pages;
    } else {
      draft.objects.push(newObject({
        col: ep.position.x, row: ep.position.y, emoji: '', objType: 'event',
        behavior: 'still', hazard: false,
        editorSprite: localSysTileUrl(tileOfEvent.x, tileOfEvent.y),
        pages
      }));
    }
  }

  for (const tp of rpgMap.teleportPoints) {
    draft.objects.push(newObject({
      col: tp.position.x, row: tp.position.y, emoji: '', objType: 'warp',
      behavior: 'still', hazard: false,
      editorSprite: localSysTileUrl(tileOfTeleport.x, tileOfTeleport.y),
      pages: [{
        name: 'Warp',
        conditions: {},
        trigger: 'playerTouch',
        commands: [
          { type: 'warp', col: tp.destination.position.x, row: tp.destination.position.y, mapId: String(tp.destination.mapId) }
        ]
      }]
    }));
  }

  return draft;
}
