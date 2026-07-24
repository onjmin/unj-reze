import { RPGMap, RawCommand, checkWalkableTile, checkDamageTile, checkTreasureBoxTile, checkTableTile, checkDoorTile } from "@rpgja/rpgen-map";
import type { GameManifestDraft } from '@/components/GameMaker';
import type { EventCommand, EventCondition, EventPage } from '@/components/game-presets/shared';
import { newObject, TILE_SIZE, chest } from '@/components/game-presets/shared';
import { DQ_CHARACTERS } from '@/lib/local-assets';
import { youtubeRefFromUrl } from '@/lib/asset-ref';
import LZString from 'lz-string';

export const MAX_TILE_CONVERSIONS = 500;

export async function parseRpgen(text: string): Promise<GameManifestDraft> {
  // Try to parse as-is. If that fails and the text looks like it could be
  // LZString-compressed (no 'L1' prefix — that case is handled by the caller),
  // attempt decompression and retry once before giving up.
  let rpgMap: ReturnType<typeof RPGMap.parse>;
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

  console.log(rpgMap)

  const idsToTranslate = new Set<number>();

  const floorSize = rpgMap.floor.getSize();
  const objSize = rpgMap.objects.getSize();
  const cols = Math.max(floorSize.width, objSize.width);
  const rows = Math.max(floorSize.height, objSize.height);

  for (let y = 0; y < rows; y++) {
    for (let x = 0; x < cols; x++) {
      const ft = rpgMap.floor.getRaw(x, y);
      if (ft) {
        const tk = String(ft);
        if (!tk.includes('_')) {
          const idNum = Number(tk.replace('C', ''));
          if (!isNaN(idNum)) idsToTranslate.add(idNum);
        }
      }
      const ot = rpgMap.objects.getRaw(x, y);
      if (ot) {
        const tk = String(ot);
        if (!tk.includes('_')) {
          const idNum = Number(tk.replace('C', ''));
          if (!isNaN(idNum)) idsToTranslate.add(idNum);
        }
      }
    }
  }

  for (const human of rpgMap.humans) {
    if (human.sprite.type === 2 || human.sprite.type === 3) {
      const idNum = Number((human.sprite as any).id);
      if (!isNaN(idNum)) idsToTranslate.add(idNum);
    }
  }

  for (const ep of rpgMap.eventPoints) {
    ep.phases.forEach((ph: any) => {
      if (ph && ph.sequence) {
        const scanCommand = (cmd: any) => {
          if (cmd.type === 'CH_SP' && cmd.params?.n) {
            const nStr = String(cmd.params.n);
            const idNum = Number(nStr.replace('A', ''));
            if (!isNaN(idNum)) idsToTranslate.add(idNum);
          }
          if (cmd.choices) {
            for (const seq of cmd.choices.values()) {
              seq.forEach(scanCommand);
            }
          }
        };
        ph.sequence.forEach((c: any) => {
          let cmd;
          try { cmd = c.parse(); } catch { return; }
          scanCommand(cmd);
        });
      }
    });
  }

const ORIGIN = 'https://rpgen-search.pages.dev';
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
      ? (/(?:youtube\.com|youtu\.be)/i.test(rpgMap.bgmUrl) ? youtubeRefFromUrl(rpgMap.bgmUrl) : rpgMap.bgmUrl.startsWith('http') || rpgMap.bgmUrl.startsWith('/') ? `direct:${rpgMap.bgmUrl}` : `direct:https://rpgen-search.pages.dev/data/audio/bgm/${rpgMap.bgmUrl}`)
      : '',
    mapBgRef: 'tile:#000000',
    sfx: {},
    switches: [],
  };

  const tileIndexMap = new Map<string, number>();
  let nextTileIdx = 1;

  const parseTile = (rawVal: any): number => {
    if (!rawVal) return 0;
    const tk = String(rawVal);
    if (!tileIndexMap.has(tk)) {
      if (tileIndexMap.size >= MAX_TILE_CONVERSIONS) {
        throw new Error(`タイル変換数が上限（${MAX_TILE_CONVERSIONS}種類）を超えています。インポートを中断します。`);
      }
      let imageUrl: string | undefined = undefined;
      let passable = !tk.includes('C');
      let special: string | undefined = undefined;
      const tkBase = tk.replace('C', '');
      if (tkBase === '16_13') special = 'ice-up';
      else if (tkBase === '17_13') special = 'ice-right';
      else if (tkBase === '16_14') special = 'ice-left';
      else if (tkBase === '17_14') special = 'ice-down';
      else if (checkDoorTile(tkBase)) special = 'door';
      else if (checkTableTile(tkBase)) special = 'table';
      else if (checkTreasureBoxTile(tkBase)) special = 'treasure';
      else if (checkDamageTile(tkBase)) special = 'damage';

      if (tk.includes('_')) {
        const [cStr, rStr] = tk.split('_');
        imageUrl = `/assets/rpgen/map.png#${parseInt(cStr, 10) * 16},${parseInt(rStr, 10) * 16},16,16`;
        // map.png タイルは checkWalkableTile の判定を C フラグより優先する
        passable = checkWalkableTile(tkBase);
      } else {
        const id = Number(tk.replace('C', ''));
        const hash = idToHash.get(id);
        if (hash) imageUrl = `https://rpgen-search.pages.dev/data/images/sprites/${hash}.png`;
      }
      tileIndexMap.set(tk, nextTileIdx);
      draft.tiles[nextTileIdx] = { name: tk, color: '#333333', passable, imageUrl, special };
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

  const translateRpgenCommand = (rawCmd: any): EventCommand | null => {
    let cmd = rawCmd;
    if (typeof rawCmd.parse === 'function') {
      try {
        cmd = rawCmd.parse();
      } catch {
        return null;
      }
    }
    
    switch (cmd.type) {
      case 'MSG': {
        const text = cmd.content || '';
        if (text.startsWith('#DW_IMA') || text.startsWith('#DW_IMG')) {
          const lines = text.split('\n');
          const paramsStr = lines.slice(1).join('\n').trim();
          const params: Record<string, string> = {};
          paramsStr.split(',').forEach((pair: string) => {
            const idx = pair.indexOf(':');
            if (idx >= 0) params[pair.slice(0, idx).trim()] = pair.slice(idx + 1).trim();
          });
          
          const resolveUrl = (u: string) => {
            if (!u) return '';
            if (u.startsWith('http')) return u;
            if (/^[A-Za-z0-9]+\.(png|jpg|jpeg|gif)$/i.test(u)) return `https://i.imgur.com/${u}`;
            const hash = idToHash.get(parseInt(u));
            return hash ? `https://rpgen-search.pages.dev/data/images/sprites/${hash}.png` : '';
          };

          const frames: { url: string; sx: number; sy: number; sw: number; sh: number; ox: number; oy: number; r: number; a: number; }[] = [];
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
              a: parseInt(params[`a${sfx}`] || (i === 1 ? '100' : (prevFrame ? String(prevFrame.a) : '100')))
            });
          }

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
            frames
          };
        }
        if (text.startsWith('#ST_IMA') || text.startsWith('#ST_IMG')) {
          const lines = text.split('\n');
          const paramsStr = lines.slice(1).join('\n').trim();
          const params: Record<string, string> = {};
          paramsStr.split(',').forEach((pair: string) => {
            const idx = pair.indexOf(':');
            if (idx >= 0) params[pair.slice(0, idx).trim()] = pair.slice(idx + 1).trim();
          });
          return { type: 'hideImage', imgId: params.i || '1' };
        }
        if (text.startsWith('#ED')) {
          // Backward compatibility if some #ED are still left as MSG
          return null;
        }
        return { type: 'message', text };
      }
      case 'SEL': {
        // RawCommand.parse() は choices/clearMessage しか返さず、元の x/y パラメータの有無は
        // 捨てられてしまう。x/y省略時のランダム判定に必要なので、toString() で元テキストへ
        // 戻し、先頭行（パラメータ行）に x:/y: が含まれるかを直接見る。
        const rawText = typeof rawCmd.toString === 'function' ? String(rawCmd.toString()) : '';
        const paramsLine = rawText.match(/^#SEL\d*[ \t]*(.*?)\r?\n/)?.[1] ?? '';
        const hasXY = /(?:^|,)\s*x:/.test(paramsLine) && /(?:^|,)\s*y:/.test(paramsLine);

        const choiceNode: EventCommand = {
          type: 'choice', text: '', choices: [],
          random: !hasXY,
          // ライブラリの clearMessage は params.c === '1' そのもの。RPGENの実際の挙動は
          // c:1で直前のメッセージウィンドウを表示したままにする、というものなのでそのまま使う。
          keepMessage: cmd.clearMessage === true,
        };
        if (cmd.choices) {
          for (const [label, sequence] of cmd.choices.entries()) {
            choiceNode.choices.push({
              label,
              commands: sequence.map(translateRpgenCommand).filter(Boolean) as EventCommand[]
            });
          }
        }
        return choiceNode;
      }
      case 'WAIT': return { type: 'wait', frames: Math.floor((cmd.delay || 1000) / 16) };
      case 'CH_SP': {
        const nStr = String(cmd.params?.n || '');
        let spriteUrl = '';
        let spriteRef = '';
        if (nStr) {
          const idNum = Number(nStr.replace('A', ''));
          const hash = idToHash.get(idNum);
          if (hash) {
            if (nStr.includes('A')) {
              spriteRef = `walk:auto:u:https://rpgen-search.pages.dev/data/images/sAnims/${hash}.png`;
            } else {
              spriteUrl = `https://rpgen-search.pages.dev/data/images/sprites/${hash}.png`;
            }
          }
        }
        const targetObjId = (cmd.params?.tx !== undefined && cmd.params?.ty !== undefined) ? `obj-human-${cmd.params.tx}-${cmd.params.ty}` : '';
        return { type: 'changeSprite', spriteRef, spriteUrl, objId: targetObjId };
      }
      case 'CH_HM': {
        const nStr = String(cmd.params?.n || '');
        let spriteUrl = '';
        let spriteRef = '';
        if (nStr) {
          const idNum = Number(nStr.replace('A', ''));
          const hash = idToHash.get(idNum);
          if (hash) {
            if (nStr.includes('A')) {
              spriteRef = `walk:auto:u:https://rpgen-search.pages.dev/data/images/sAnims/${hash}.png`;
            } else {
              spriteUrl = `https://rpgen-search.pages.dev/data/images/sprites/${hash}.png`;
            }
          }
        }
        const isPlayer = cmd.params?.i === '0';
        const targetObjId = isPlayer ? 'player' : (cmd.params?.tx !== undefined && cmd.params?.ty !== undefined ? `obj-human-${cmd.params.tx}-${cmd.params.ty}` : 'player');
        return { type: 'changeSprite', spriteRef, spriteUrl, objId: targetObjId };
      }
      case 'MV_PD': {
        const dVal = cmd.params?.d;
        const d = parseInt(dVal || '0');
        const v = parseInt(cmd.params?.v || '1');
        let dx = 0, dy = 0;
        if (d === 0 || dVal === 'up') { dx = 0; dy = -v; }
        else if (d === 1 || dVal === 'right') { dx = v; dy = 0; }
        else if (d === 2 || dVal === 'down') { dx = 0; dy = v; }
        else if (d === 3 || dVal === 'left') { dx = -v; dy = 0; }
        else if (d === 4) { dx = v; dy = -v; }
        else if (d === 5) { dx = v; dy = v; }
        else if (d === 6) { dx = -v; dy = v; }
        else if (d === 7) { dx = -v; dy = -v; }
        return { type: 'moveNpc', objId: 'player', dx, dy, duration: parseInt(cmd.params?.t || cmd.params?.p || '0') };
      }
      case 'MV_PA': return { type: 'moveNpc', objId: 'player', tx: parseInt(cmd.params?.tx || '0'), ty: parseInt(cmd.params?.ty || '0'), duration: parseInt(cmd.params?.t || cmd.params?.p || '0') };
      case 'MV_PR': {
        const dx = parseInt(cmd.params?.tx || '0');
        const dy = parseInt(cmd.params?.ty || '0');
        return { type: 'moveNpc', objId: 'player', dx, dy, duration: parseInt(cmd.params?.t || cmd.params?.p || '0') };
      }
      case 'MV_ND': {
        const nx = parseInt(cmd.params?.nx || '0');
        const ny = parseInt(cmd.params?.ny || '0');
        const dVal = cmd.params?.d;
        const d = parseInt(dVal || '0');
        const v = parseInt(cmd.params?.v || '1');
        let dx = 0, dy = 0;
        if (d === 0 || dVal === 'up') { dx = 0; dy = -v; }
        else if (d === 1 || dVal === 'right') { dx = v; dy = 0; }
        else if (d === 2 || dVal === 'down') { dx = 0; dy = v; }
        else if (d === 3 || dVal === 'left') { dx = -v; dy = 0; }
        else if (d === 4) { dx = v; dy = -v; }
        else if (d === 5) { dx = v; dy = v; }
        else if (d === 6) { dx = -v; dy = v; }
        else if (d === 7) { dx = -v; dy = -v; }
        return { type: 'moveNpc', objId: `obj-human-${nx}-${ny}`, dx, dy, duration: parseInt(cmd.params?.t || cmd.params?.p || '0') };
      }
      case 'MV_NA': {
        const nx = parseInt(cmd.params?.nx || '0');
        const ny = parseInt(cmd.params?.ny || '0');
        return { type: 'moveNpc', objId: `obj-human-${nx}-${ny}`, tx: parseInt(cmd.params?.tx || '0'), ty: parseInt(cmd.params?.ty || '0'), duration: parseInt(cmd.params?.t || cmd.params?.p || '0') };
      }
      case 'MV_NR': {
        const nx = parseInt(cmd.params?.nx || '0');
        const ny = parseInt(cmd.params?.ny || '0');
        const dx = parseInt(cmd.params?.tx || '0');
        const dy = parseInt(cmd.params?.ty || '0');
        return { type: 'moveNpc', objId: `obj-human-${nx}-${ny}`, dx, dy, duration: parseInt(cmd.params?.t || cmd.params?.p || '0') };
      }
      case 'PL_GLD': return { type: 'changeGold', amount: parseInt(cmd.params?.v || '0') };
      case 'MI_GLD': return { type: 'changeGold', amount: -parseInt(cmd.params?.v || '0') };
      case 'SET_GLD': return { type: 'changeGold', amount: parseInt(cmd.params?.v || '0') };
      case 'DW_IMA':
      case 'DW_IMG': {
        const params = cmd.params || {};
        const resolveUrl = (u: string) => {
          if (!u) return '';
          if (u.startsWith('http')) return u;
          if (/^[A-Za-z0-9]+\.(png|jpg|jpeg|gif)$/i.test(u)) return `https://i.imgur.com/${u}`;
          const hash = idToHash.get(parseInt(u));
          return hash ? `https://rpgen-search.pages.dev/data/images/sprites/${hash}.png` : '';
        };

        const frames: { url: string; sx: number; sy: number; sw: number; sh: number; ox: number; oy: number; r: number; a: number; }[] = [];
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
            a: parseInt(params[`a${sfx}`] || (i === 1 ? '100' : (prevFrame ? String(prevFrame.a) : '100')))
          });
        }

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
          frames
        };
      }
      case 'ST_IMA':
      case 'ST_IMG': return { type: 'hideImage', imgId: cmd.params?.i || '1' };
      case 'DW_FL': {
        const params = cmd.params || {};
        const targetObjId = (params.nx !== undefined && params.ny !== undefined) ? `obj-human-${params.nx}-${params.ny}` : 'player';
        
        const resolveUrl = (u: string) => {
          if (!u) return '';
          if (u.startsWith('http')) return u;
          if (/^[A-Za-z0-9]+\.(png|jpg|jpeg|gif)$/i.test(u)) return `https://i.imgur.com/${u}`;
          const hash = idToHash.get(parseInt(u));
          return hash ? `https://rpgen-search.pages.dev/data/images/sprites/${hash}.png` : '';
        };

        const dirs: Record<'U' | 'D' | 'L' | 'R', any> = { U: undefined, D: undefined, L: undefined, R: undefined };
        ['U', 'D', 'L', 'R'].forEach(dir => {
          const u = params[`u${dir}`];
          if (u || params[`x${dir}`] !== undefined) {
            dirs[dir as 'U'|'D'|'L'|'R'] = {
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
              r: parseInt(params[`r${dir}`] || '0')
            };
          }
        });

        return {
          type: 'followImage',
          imgId: params.i || '1',
          targetObjId,
          directions: dirs
        };
      }
      case 'PS_IMG': return { type: 'pauseImage', imgId: cmd.params?.i || '1' };
      case 'RS_IMG': return { type: 'resumeImage', imgId: cmd.params?.i || '1' };
      case 'PS_LAY': return { type: 'pauseImage', layer: parseInt(cmd.params?.l || '0') };
      case 'RS_LAY': return { type: 'resumeImage', layer: parseInt(cmd.params?.l || '0') };
      case 'PL_SD': return { type: 'playSound', src: cmd.params?.i || '' };
      case 'CH_YB': return { type: 'changeBackground', bgRef: '', bgUrl: cmd.params?.v };
      case 'SET_GLD': return { type: 'changeGold', amount: parseInt(cmd.params?.v || '0') };
      case 'CH_PH': return { type: 'changePhase', phaseIndex: parseInt(cmd.params?.p || '1') };
      case 'ON_SW': return { type: 'setSwitch', switchId: parseInt(cmd.params?.n || '0'), value: true };
      case 'OFF_SW': return { type: 'setSwitch', switchId: parseInt(cmd.params?.n || '0'), value: false };
      case 'MV_MP': return { type: 'warp', col: parseInt(cmd.params?.tx || '0'), row: parseInt(cmd.params?.ty || '0'), mapId: cmd.params?.n };
      case 'CM_EV': return { type: 'comment', text: cmd.params?.m || '' };
      case 'EF_RGR': return { type: 'clearScreenEffect' };
      case 'EF_GR': {
        const effects = [];
        for (let idx = 0; idx < 10; idx++) {
          const iStr = cmd.params?.[`i${idx}`];
          if (!iStr) continue;
          const kvs = iStr.split('+').reduce((acc: any, kv: string) => {
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
        return { type: 'screenEffect', effects: effects as any };
      }
      case 'MV_CF': return { type: 'resetCamera', duration: parseInt(cmd.params?.t || cmd.params?.p || '300') };
      case 'MV_CD': {
        const dVal = cmd.params?.d;
        const d = parseInt(dVal || '0');
        const v = parseInt(cmd.params?.v || '1');
        let dx = 0, dy = 0;
        if (d === 0 || dVal === 'up') { dx = 0; dy = -v; }
        else if (d === 1 || dVal === 'right') { dx = v; dy = 0; }
        else if (d === 2 || dVal === 'down') { dx = 0; dy = v; }
        else if (d === 3 || dVal === 'left') { dx = -v; dy = 0; }
        else if (d === 4) { dx = v; dy = -v; }
        else if (d === 5) { dx = v; dy = v; }
        else if (d === 6) { dx = -v; dy = v; }
        else if (d === 7) { dx = -v; dy = -v; }
        return { type: 'moveCamera', dx, dy, duration: parseInt(cmd.params?.t || cmd.params?.p || '300'), blocking: cmd.params?.nb !== '1' };
      }
      case 'MV_CA': {
        const tx = parseInt(cmd.params?.tx || '0');
        const ty = parseInt(cmd.params?.ty || '0');
        return { type: 'moveCamera', tx, ty, duration: parseInt(cmd.params?.t || cmd.params?.p || '300'), blocking: cmd.params?.nb !== '1' };
      }
      case 'MV_CR': {
        const dx = parseInt(cmd.params?.tx || '0');
        const dy = parseInt(cmd.params?.ty || '0');
        return { type: 'moveCamera', dx, dy, duration: parseInt(cmd.params?.t || cmd.params?.p || '300'), blocking: cmd.params?.nb !== '1' };
      }
      case 'WT_RN':
      case 'WT_SN': return { type: 'screenEffect', effects: [{ type: 'solid', color: cmd.params?.c || cmd.params?.c1 || '', c1: '', c2: '', pos: '', stops: '' }] };
      default: return { type: 'comment', text: `Unimplemented: ${cmd.type}` };
    }
  };

  // RPGENの message は本来「#DW_IMA/#MSG/#SEL...」等のコマンド列を含むスクリプトになりうる。
  // 単なる表示テキストとして扱うと fade-in/message/fade-out のような演出が逐次実行されないため、
  // スクリプトらしき内容は translateRpgenCommand でコマンド列化して pages に変換する。
  const messageToPages = (message: string): EventPage[] | undefined => {
    if (!message || !message.trim()) return undefined;
    if (!/^\s*#[A-Z_]+/.test(message)) return undefined;
    const commands = RawCommand.parseSequence(message).map(translateRpgenCommand).filter(Boolean) as EventCommand[];
    if (commands.length === 0) return undefined;
    return [{ name: 'Phase 0', conditions: {}, trigger: 'action', commands }];
  };

  for (const human of rpgMap.humans) {
    let spriteUrl: string | undefined = undefined;
    let spriteRef: string | undefined = undefined;
    if (human.sprite.type === 1) {
      const match = DQ_CHARACTERS.find(c => c.surface === (human.sprite as any).surface);
      if (match) spriteRef = `walk:auto:u:${match.url}`;
    } else if (human.sprite.type === 2) {
      const hash = idToHash.get(Number((human.sprite as any).id));
      if (hash) spriteUrl = `https://rpgen-search.pages.dev/data/images/sprites/${hash}.png`;
    } else if (human.sprite.type === 3) {
      const hash = idToHash.get(Number((human.sprite as any).id));
      if (hash) spriteRef = `walk:auto:u:https://rpgen-search.pages.dev/data/images/sAnims/${hash}.png`;
    }

    let behavior: 'still' | 'random' | 'chase' | 'flee' | 'patrolH' | 'patrolV' = 'still';
    if (human.behavior === 1) behavior = 'random';
    if (human.behavior === 2) behavior = 'still';
    if (human.behavior === 3) behavior = 'patrolH';
    if (human.behavior === 4) behavior = 'patrolV';
    if (human.behavior === 5) behavior = 'chase';
    if (human.behavior === 6) behavior = 'flee';

    const pages = messageToPages(human.message || '');
    draft.objects.push(newObject({
      col: human.position.x, row: human.position.y,
      emoji: (spriteUrl || spriteRef) ? undefined : '🧍',
      spriteUrl,
      spriteRef,
      behavior,
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
    draft.objects.push(newObject({
      col: spoint.position.x, row: spoint.position.y, emoji: '',
      behavior: 'still', hazard: false,
      editorSprite: '/assets/rpgen/map.png#352,128,16,16',
      message: pages ? '' : (spoint.message || ''), objType: 'npc',
      pages: pages ?? [{
        name: 'Examine',
        conditions: {},
        trigger: 'action',
        commands: [{ type: 'overheadMessage', text: spoint.message || '何も発見できなかった。' }]
      }]
    }));
  }

  for (const ep of rpgMap.eventPoints) {
    const pages: EventPage[] = [];
    ep.phases.forEach((ph: any, idx: number) => {
      const parsedCommands = ph.sequence ? ph.sequence.map(translateRpgenCommand).filter(Boolean) as EventCommand[] : [];
      const trig = (ph.timing === 1 || ph.timing === 'touch' || ph.trigger === 'touch')
        ? 'playerTouch'
        : (ph.timing === 2 || ph.timing === 'autorun' || ph.trigger === 'autorun')
        ? 'autorun'
        : 'action';
      // RPGEN のフェーズ発生条件を EventCondition へ変換する。gold（所持金 >= N）は
      // エンジンの minGold 条件へマッピングする（それ以外の条件は未対応のため無視）。
      const conditions: EventCondition = {};
      const goldCond = Number(ph.condition?.gold);
      if (Number.isFinite(goldCond) && goldCond > 0) conditions.minGold = goldCond;
      pages.push({
        name: `Phase ${idx}`,
        conditions,
        trigger: trig,
        commands: parsedCommands
      });
    });
    
    const humanObj = draft.objects.find(o => o.col === ep.position.x && o.row === ep.position.y && o.objType === 'npc');
    if (humanObj) {
      humanObj.pages = pages;
    } else {
      draft.objects.push(newObject({
        col: ep.position.x, row: ep.position.y, emoji: '', objType: 'event',
        behavior: 'still', hazard: false,
        editorSprite: '/assets/rpgen/map.png#112,128,16,16',
        pages
      }));
    }
  }

  for (const tp of rpgMap.teleportPoints) {
    draft.objects.push(newObject({
      col: tp.position.x, row: tp.position.y, emoji: '', objType: 'warp',
      behavior: 'still', hazard: false,
      editorSprite: '/assets/rpgen/map.png#208,128,16,16',
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
