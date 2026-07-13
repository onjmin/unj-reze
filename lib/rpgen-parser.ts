import { RPGMap } from "@rpgja/rpgen-map";
import type { GameManifestDraft } from '@/components/GameMaker';
import type { EventCommand, EventPage } from '@/components/game-presets/shared';
import { newObject } from '@/components/game-presets/shared';
import { DQ_CHARACTERS } from '@/lib/local-assets';

export async function parseRpgen(text: string): Promise<GameManifestDraft> {
  const rpgMap = RPGMap.parse(text);

  const idsToTranslate = new Set<number>();

  const mapSize = rpgMap.floor.getSize();
  const cols = mapSize.width;
  const rows = mapSize.height;

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
        ph.sequence.forEach((c: any) => {
          let cmd;
          try { cmd = c.parse(); } catch { return; }
          if (cmd.type === 'CH_SP' && cmd.params?.n) {
            const nStr = String(cmd.params.n);
            const idNum = Number(nStr.replace('A', ''));
            if (!isNaN(idNum)) idsToTranslate.add(idNum);
          }
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
      emoji: '', color: '#ffffff', speed: 2, jumpPower: 0, w: 32, h: 32,
      start: { x: (rpgMap.initialHeroPosition?.x ?? 0) * 32, y: (rpgMap.initialHeroPosition?.y ?? 0) * 32 },
      spriteRef: 'walk:auto:u:/assets/rpgen/char/00-hero.png',
    },
    tiles: {
      0: { name: 'Empty', color: '#000000', passable: true }
    },
    map: [],
    overlayMap: [],
    objects: [],
    bgm: rpgMap.bgmUrl || '',
    mapBgRef: rpgMap.backgroundImageUrl ? `url:${rpgMap.backgroundImageUrl}` : undefined,
    sfx: {},
    switches: [],
  };

  const tileIndexMap = new Map<string, number>();
  let nextTileIdx = 1;

  const parseTile = (rawVal: any): number => {
    if (!rawVal) return 0;
    const tk = String(rawVal);
    if (!tileIndexMap.has(tk)) {
      let imageUrl: string | undefined = undefined;
      let passable = !tk.includes('C');
      let special: string | undefined = undefined;
      const tkBase = tk.replace('C', '');
      if (tkBase === '16_13') special = 'ice-up';
      else if (tkBase === '17_13') special = 'ice-right';
      else if (tkBase === '16_14') special = 'ice-left';
      else if (tkBase === '17_14') special = 'ice-down';

      if (tk.includes('_')) {
        const [cStr, rStr] = tk.split('_');
        imageUrl = `/assets/rpgen/map.png#${parseInt(cStr, 10) * 16},${parseInt(rStr, 10) * 16},16,16`;
      } else {
        const id = Number(tk.replace('C', ''));
        const hash = idToHash.get(id);
        if (hash) imageUrl = `https://rpgen-search.pages.dev/images/sprites/${hash}.png`;
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
    for (let x = 0; x < cols; x++) {
      rowFloor.push(parseTile(rpgMap.floor.getRaw(x, y)));
      rowObj.push(parseTile(rpgMap.objects.getRaw(x, y)));
    }
    draft.map.push(rowFloor);
    draft.overlayMap!.push(rowObj);
  }

  for (const human of rpgMap.humans) {
    let spriteUrl: string | undefined = undefined;
    let spriteRef: string | undefined = undefined;
    if (human.sprite.type === 1) {
      const match = DQ_CHARACTERS.find(c => c.surface === (human.sprite as any).surface);
      if (match) spriteRef = `walk:auto:u:${match.url}`;
    } else if (human.sprite.type === 2) {
      const hash = idToHash.get(Number((human.sprite as any).id));
      if (hash) spriteUrl = `https://rpgen-search.pages.dev/images/sprites/${hash}.png`;
    } else if (human.sprite.type === 3) {
      const hash = idToHash.get(Number((human.sprite as any).id));
      if (hash) spriteRef = `walk:auto:u:https://rpgen-search.pages.dev/images/sAnims/${hash}.png`;
    }

    let behavior: 'still' | 'random' | 'chase' | 'flee' | 'patrolH' | 'patrolV' = 'still';
    if (human.behavior === 1 || human.behavior === 2) behavior = 'random';
    if (human.behavior === 3) behavior = 'patrolH';
    if (human.behavior === 4) behavior = 'patrolV';
    if (human.behavior === 5) behavior = 'chase';
    if (human.behavior === 6) behavior = 'flee';

    draft.objects.push(newObject({
      col: human.position.x, row: human.position.y,
      emoji: (spriteUrl || spriteRef) ? undefined : '🧍',
      spriteUrl,
      spriteRef,
      behavior,
      hazard: false,
      message: human.message || '', objType: 'npc'
    }));
  }

  for (const tbox of rpgMap.treasureBoxPoints) {
    draft.objects.push(newObject({
      col: tbox.position.x, row: tbox.position.y, emoji: '📦',
      behavior: 'still', hazard: false,
      message: tbox.message || '', objType: 'npc'
    }));
  }

  for (const spoint of rpgMap.lookPoints) {
    draft.objects.push(newObject({
      col: spoint.position.x, row: spoint.position.y, emoji: '',
      behavior: 'still', hazard: false,
      editorSprite: '/assets/rpgen/map.png#352,128,16,16',
      message: spoint.message || '', objType: 'npc'
    }));
  }

  const translateRpgenCommand = (rawCmd: any): EventCommand | null => {
    let cmd;
    try {
      cmd = rawCmd.parse();
    } catch {
      return null;
    }
    
    switch (cmd.type) {
      case 'MSG': return { type: 'message', text: cmd.content || '' };
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
              spriteRef = `walk:auto:u:https://rpgen-search.pages.dev/images/sAnims/${hash}.png`;
            } else {
              spriteUrl = `https://rpgen-search.pages.dev/images/sprites/${hash}.png`;
            }
          }
        }
        return { type: 'changeSprite', spriteRef, spriteUrl, objId: '' };
      }
      case 'MV_CA': return { type: 'moveCamera', tx: parseInt(cmd.params?.tx || '0'), ty: parseInt(cmd.params?.ty || '0'), duration: parseInt(cmd.params?.t || '0') };
      case 'MV_NA': return { type: 'moveNpc', tx: parseInt(cmd.params?.tx || '0'), ty: parseInt(cmd.params?.ty || '0'), duration: parseInt(cmd.params?.t || '0') };
      case 'MV_PA': return { type: 'moveNpc', objId: 'player', tx: parseInt(cmd.params?.tx || '0'), ty: parseInt(cmd.params?.ty || '0'), duration: parseInt(cmd.params?.t || '0') };
      case 'DW_IMG': return { type: 'showImage', imgId: cmd.params?.i || '1', url: cmd.params?.u || '', x: parseInt(cmd.params?.x || '0'), y: parseInt(cmd.params?.y || '0'), w: parseInt(cmd.params?.w || '0'), h: parseInt(cmd.params?.h || '0'), opacity: parseInt(cmd.params?.a || '100'), isPercent: cmd.params?.xp !== '1' };
      case 'ST_IMG': return { type: 'hideImage', imgId: cmd.params?.i || '1' };
      case 'PL_SD': return { type: 'playSound', src: cmd.params?.i || '' };
      case 'CH_YB': return { type: 'changeBackground', bgRef: '', bgUrl: cmd.params?.v };
      case 'SET_GLD': return { type: 'changeGold', amount: parseInt(cmd.params?.v || '0') };
      case 'CH_PH': return { type: 'changePhase', phaseIndex: parseInt(cmd.params?.p || '1') };
      case 'ON_SW': return { type: 'setSwitch', switchId: parseInt(cmd.params?.n || '0'), value: true };
      case 'OFF_SW': return { type: 'setSwitch', switchId: parseInt(cmd.params?.n || '0'), value: false };
      case 'MV_MP': return { type: 'warp', col: parseInt(cmd.params?.tx || '0'), row: parseInt(cmd.params?.ty || '0') };
      case 'CM_EV': return { type: 'comment', text: cmd.params?.m || '' };
      case 'EF_GR': 
      case 'EF_RGR':
      case 'WT_RN':
      case 'WT_SN': return { type: 'screenEffect', effectType: cmd.type, color: cmd.params?.c || cmd.params?.c1 || '' };
      default: return { type: 'comment', text: `Unimplemented: ${cmd.type}` };
    }
  };

  for (const ep of rpgMap.eventPoints) {
    const pages: EventPage[] = [];
    ep.phases.forEach((ph: any, idx: number) => {
      if (!ph || !ph.sequence) return;
      const commands: EventCommand[] = [];
      ph.sequence.forEach((c: any) => {
        const translated = translateRpgenCommand(c);
        if (translated) commands.push(translated);
      });
      pages.push({
        name: `Phase ${idx}`,
        conditions: {},
        commands
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
      col: tp.position.x, row: tp.position.y, emoji: '', objType: 'event',
      behavior: 'still', hazard: false,
      editorSprite: '/assets/rpgen/map.png#368,112,16,16',
      pages: [{
        name: 'Warp',
        conditions: {},
        commands: [{ type: 'comment', text: `Warp to map ${tp.destination.mapId} (${tp.destination.position.x}, ${tp.destination.position.y})` }]
      }]
    }));
  }

  return draft;
}
