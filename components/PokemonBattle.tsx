'use client';

// gomi/games/pokemon.html のパーティバトルを React に移植した汎用エンジン。
// ポケモン固有のデータ（図鑑・技・タイプ相性）は PartyBattleConfig（pokemon.ts）から受け取る。

import { useEffect, useRef, useState, type CSSProperties } from 'react';
import type {
  PartyBattleConfig, PkmnSpeciesDef, PkmnMoveDef, PkmnStatusDef,
} from './game-presets/shared';

// ── 戦闘中の個体 ──────────────────────────────────────────────────────────
interface Fighter {
  species: PkmnSpeciesDef;
  name: string;
  sprite: string;
  types: string[];
  level: number;
  maxHp: number;
  currentHp: number;
  atkStat: number;
  defStat: number;
  spaStat: number;
  spdStat: number;
  speStat: number;
  moves: string[];
  pp: Record<string, number>;
  status: string | null;
  sleepTurns: number;
}

type Outcome = 'win' | 'lose' | 'run';
type Screen = 'title' | 'party' | 'battle' | 'result';

const LIGHT_TEXT_TYPES = new Set(['electric', 'ice', 'ground', 'steel', 'fairy']);
// 乱数はモジュールスコープに集約（コンポーネント内で Math.random を直接呼ばない＝purity ルール対策）。
const rand = (min: number, max: number) => Math.floor(Math.random() * (max - min + 1)) + min;
const chance = (p: number) => Math.random() < p;            // 確率 p で true
const roll100 = () => Math.random() * 100;                  // 0〜100 の乱数
const shuffle = <T,>(arr: T[]): T[] => [...arr].sort(() => Math.random() - 0.5);
const delay = (ms: number) => new Promise<void>(r => setTimeout(r, ms));

export default function PokemonBattle({ config }: { config: PartyBattleConfig }) {
  const cfg = config;
  const moveById = useRef(new Map<string, PkmnMoveDef>(cfg.moves.map(m => [m.id, m])));
  const statusByKey = useRef(new Map<string, PkmnStatusDef>(cfg.statuses.map(s => [s.key, s])));

  // ── 再描画トリガ（実体は ref に保持し sync() で再レンダ）──
  const [, force] = useState(0);
  const mountedRef = useRef(true);
  const sync = () => { if (mountedRef.current) force(n => n + 1); };
  // StrictMode（dev）の mount→unmount→mount に耐えるよう、setup で true に戻す。
  useEffect(() => { mountedRef.current = true; return () => { mountedRef.current = false; }; }, []);

  const [screen, setScreen] = useState<Screen>('title');
  const [selectedIds, setSelectedIds] = useState<number[]>([]);
  const [outcome, setOutcome] = useState<Outcome>('win');

  // ── バトル状態（ref）──
  const playerPartyRef = useRef<Fighter[]>([]);
  const enemyPartyRef = useRef<Fighter[]>([]);
  const playerActiveRef = useRef(0);
  const enemyActiveRef = useRef(0);
  const busyRef = useRef(false);
  const turnCountRef = useRef(0);
  const logRef = useRef<string[]>([]);
  const switchOpenRef = useRef(false);
  const forcedSwitchRef = useRef(false);

  // ── アニメーション（n を増やして再マウント→アニメ再生）──
  const pAnimRef = useRef({ cls: '', n: 0 });
  const eAnimRef = useRef({ cls: '', n: 0 });
  const animOf = (side: 'player' | 'enemy') => (side === 'player' ? pAnimRef : eAnimRef).current;
  const triggerAnim = (side: 'player' | 'enemy', cls: string, dur: number) => {
    const a = animOf(side);
    a.cls = cls; a.n++; sync();
    if (cls !== 'pkb-anim-faint') setTimeout(() => { a.cls = ''; a.n++; sync(); }, dur);
  };
  const clearAnim = (side: 'player' | 'enemy') => { const a = animOf(side); a.cls = ''; a.n++; };
  const animHit = (side: 'player' | 'enemy') => triggerAnim(side, 'pkb-anim-hit', 400);
  const animShake = (side: 'player' | 'enemy') => triggerAnim(side, 'pkb-anim-shake', 500);
  const animFaint = async (side: 'player' | 'enemy') => { triggerAnim(side, 'pkb-anim-faint', 600); await delay(600); };

  // ── ステータス計算 ──
  const calcMaxHp = (base: number, level = cfg.level) => Math.floor((2 * base * level) / 100 + level + 10);
  const calcStat = (base: number, level = cfg.level) => Math.floor((2 * base * level) / 100 + 5);

  const createFighter = (sp: PkmnSpeciesDef): Fighter => {
    const lv = cfg.level;
    const maxHp = calcMaxHp(sp.hp, lv);
    return {
      species: sp, name: sp.name, sprite: sp.sprite, types: sp.types, level: lv,
      maxHp, currentHp: maxHp,
      atkStat: calcStat(sp.atk, lv), defStat: calcStat(sp.def, lv),
      spaStat: calcStat(sp.spa, lv), spdStat: calcStat(sp.spd, lv), speStat: calcStat(sp.spe, lv),
      moves: sp.moves, pp: Object.fromEntries(sp.moves.map(m => [m, moveById.current.get(m)?.pp ?? 0])),
      status: null, sleepTurns: 0,
    };
  };

  // ── タイプ相性・ダメージ ──
  const typeEff = (atkType: string, defTypes: string[]) => {
    let mult = 1;
    for (const dt of defTypes) mult *= (cfg.typeChart[atkType]?.[dt] ?? 1);
    return mult;
  };
  const calcDamage = (attacker: Fighter, defender: Fighter, moveId: string) => {
    const move = moveById.current.get(moveId)!;
    if (!move.power) return { dmg: 0, eff: 1 };
    const isPhysical = move.cat === 'ph';
    const atk = isPhysical ? attacker.atkStat : attacker.spaStat;
    const def = isPhysical ? defender.defStat : defender.spdStat;
    const burnMod = (attacker.status === 'burn' && isPhysical) ? 0.5 : 1;
    const lvl = attacker.level;
    let dmg = Math.floor((Math.floor((2 * lvl) / 5 + 2) * move.power * atk / def) / 50 + 2);
    dmg = Math.floor(dmg * rand(85, 100) / 100);
    if (attacker.types.includes(move.type)) dmg = Math.floor(dmg * 1.5); // STAB
    const eff = typeEff(move.type, defender.types);
    dmg = Math.floor(dmg * eff * burnMod);
    return { dmg, eff };
  };
  const effMsg = (eff: number): string | null => {
    if (eff === 0) return 'こうかなし！';
    if (eff >= 4) return 'こうかはばつぐんだ！（×4）';
    if (eff >= 2) return 'こうかはばつぐんだ！';
    if (eff <= 0.25) return 'こうかはいまひとつのようだ…（×1/4）';
    if (eff < 1) return 'こうかはいまひとつのようだ…';
    return null;
  };

  const addLog = (msg: string) => { logRef.current = [...logRef.current, msg].slice(-8); sync(); };

  // ── 画面遷移 ──
  const showPartySelect = () => { setSelectedIds([]); setScreen('party'); };

  const toggleSelect = (id: number) => {
    setSelectedIds(prev => {
      const idx = prev.indexOf(id);
      if (idx >= 0) return prev.filter(x => x !== id);
      if (prev.length >= cfg.teamSize) return prev;
      return [...prev, id];
    });
  };

  const startBattle = () => {
    playerPartyRef.current = selectedIds.map(id => createFighter(cfg.pokedex.find(p => p.id === id)!));
    const shuffled = shuffle(cfg.pokedex);
    enemyPartyRef.current = shuffled.slice(0, cfg.teamSize).map(createFighter);
    playerActiveRef.current = 0; enemyActiveRef.current = 0;
    busyRef.current = false; turnCountRef.current = 0;
    logRef.current = [];
    switchOpenRef.current = false;
    clearAnim('player'); clearAnim('enemy');
    setScreen('battle');
    addLog(`${playerPartyRef.current[0].name}、いけ！`);
    addLog(`あいては${enemyPartyRef.current[0].name}を出してきた！`);
  };

  const showResult = (o: Outcome) => { setOutcome(o); setScreen('result'); };

  // ── 状態異常チェック（行動可否）──
  const checkStatus = async (fighter: Fighter, side: 'player' | 'enemy'): Promise<boolean> => {
    if (!fighter.status) return true;
    const s = fighter.status;
    if (s === 'sleep') {
      fighter.sleepTurns = (fighter.sleepTurns || 0) + 1;
      if (fighter.sleepTurns >= rand(2, 5)) {
        fighter.status = null; fighter.sleepTurns = 0;
        addLog(`${fighter.name}は目を覚ました！`);
        return true;
      }
      addLog(`${fighter.name}はぐっすり眠っている…`); animShake(side); await delay(600); return false;
    }
    if (s === 'freeze') {
      if (chance(0.2)) { fighter.status = null; addLog(`${fighter.name}のこおりが溶けた！`); return true; }
      addLog(`${fighter.name}はこおっている！`); animShake(side); await delay(600); return false;
    }
    if (s === 'para') {
      if (chance(0.25)) { addLog(`${fighter.name}はしびれて動けない！`); animShake(side); await delay(600); return false; }
    }
    return true;
  };

  // ── 技実行 ──
  const executeMove = async (attacker: Fighter, defender: Fighter, moveId: string, atkSide: 'player' | 'enemy', defSide: 'player' | 'enemy') => {
    const move = moveById.current.get(moveId)!;
    attacker.pp[moveId] = Math.max(0, attacker.pp[moveId] - 1);
    addLog(`${attacker.name}の${move.name}！`);
    await delay(300);

    if (move.acc < 100 && roll100() > move.acc) {
      addLog('外れた！'); animShake(atkSide); await delay(400); return;
    }

    // 変化技
    if (move.cat === 'st') {
      const effect = move.effect;
      if (effect && effect.always) {
        if (defender.status) {
          addLog(`${defender.name}はすでに状態異常だ！`);
        } else if (effect.status === 'burn' && defender.types.includes('fire')) {
          addLog('こうかなし！');
        } else if (effect.status === 'para' && defender.types.includes('electric')) {
          addLog('こうかなし！');
        } else if (effect.status === 'poison' && (defender.types.includes('poison') || defender.types.includes('steel'))) {
          addLog('こうかなし！');
        } else if (effect.status) {
          defender.status = effect.status;
          addLog(`${defender.name}は${statusByKey.current.get(effect.status)?.label ?? '状態異常'}になった！`);
          animHit(defSide);
        }
      }
      await delay(400); return;
    }

    // ダメージ技
    const { dmg, eff } = calcDamage(attacker, defender, moveId);
    if (eff === 0) { addLog('こうかなし！'); await delay(400); return; }
    const actualDmg = Math.max(1, dmg);
    defender.currentHp = Math.max(0, defender.currentHp - actualDmg);
    animHit(defSide); sync();

    const m = effMsg(eff);
    if (m) { await delay(200); addLog(m); }

    if (move.effect?.recoil) {
      const recoilDmg = Math.max(1, Math.floor(actualDmg / move.effect.recoil));
      attacker.currentHp = Math.max(0, attacker.currentHp - recoilDmg); sync();
      addLog(`${attacker.name}はその反動でダメージを受けた！`);
    }
    await delay(400);

    // 2次効果
    if (move.effect && move.effect.chance && move.effect.status) {
      if (!defender.status && roll100() < move.effect.chance) {
        defender.status = move.effect.status;
        addLog(`${defender.name}は${statusByKey.current.get(move.effect.status)?.label ?? '状態異常'}になった！`);
      }
    }
  };

  // ── ターン終了時（毒・やけど）──
  const endOfTurnEffects = async () => {
    const sides: { fighter: Fighter; side: 'player' | 'enemy' }[] = [
      { fighter: playerPartyRef.current[playerActiveRef.current], side: 'player' },
      { fighter: enemyPartyRef.current[enemyActiveRef.current], side: 'enemy' },
    ];
    for (const { fighter, side } of sides) {
      if (fighter.currentHp <= 0) continue;
      if (fighter.status === 'burn') {
        fighter.currentHp = Math.max(0, fighter.currentHp - Math.max(1, Math.floor(fighter.maxHp / 16))); sync();
        addLog(`${fighter.name}はやけどのダメージを受けた！`); animHit(side); await delay(300);
      } else if (fighter.status === 'poison') {
        fighter.currentHp = Math.max(0, fighter.currentHp - Math.max(1, Math.floor(fighter.maxHp / 8))); sync();
        addLog(`${fighter.name}はどくのダメージを受けた！`); animHit(side); await delay(300);
      }
    }
  };

  // ── ひんし処理 ──
  const handleFaint = async (side: 'player' | 'enemy') => {
    const party = side === 'player' ? playerPartyRef.current : enemyPartyRef.current;
    const activeIdx = side === 'player' ? playerActiveRef.current : enemyActiveRef.current;
    addLog(`${party[activeIdx].name}はたおれた！`);
    await animFaint(side);

    const nextIdx = party.findIndex((p, i) => i !== activeIdx && p.currentHp > 0);
    if (nextIdx === -1) { await delay(400); showResult(side === 'player' ? 'lose' : 'win'); return; }

    if (side === 'enemy') {
      enemyActiveRef.current = nextIdx; clearAnim('enemy');
      addLog(`あいては${party[nextIdx].name}を出してきた！`); sync();
      busyRef.current = false;
    } else {
      // 強制交代
      clearAnim('player'); sync();
      addLog('ポケモンを選んでください！');
      openSwitch(true);
      busyRef.current = false;
    }
  };

  // ── 敵AI ──
  const pickEnemyMove = (ef: Fighter, pf: Fighter): string => {
    const available = ef.moves.filter(m => ef.pp[m] > 0 && moveById.current.get(m)!.cat !== 'st');
    if (available.length === 0) return ef.moves.find(m => ef.pp[m] > 0) ?? ef.moves[0];
    let best = available[0], bestScore = -1;
    for (const m of available) {
      const move = moveById.current.get(m)!;
      const { dmg } = calcDamage(ef, pf, m);
      const score = dmg * (move.acc / 100);
      if (score > bestScore) { bestScore = score; best = m; }
    }
    if (chance(0.2)) return available[rand(0, available.length - 1)];
    return best;
  };

  // ── プレイヤーの行動（1ターン）──
  const playerUsesMove = async (moveId: string) => {
    if (busyRef.current) return;
    busyRef.current = true; sync();

    const pf = playerPartyRef.current[playerActiveRef.current];
    const ef = enemyPartyRef.current[enemyActiveRef.current];

    if (await checkStatus(pf, 'player')) {
      await executeMove(pf, ef, moveId, 'player', 'enemy');
      if (ef.currentHp <= 0) { await handleFaint('enemy'); sync(); return; }
    }

    await delay(400);
    const ef2 = enemyPartyRef.current[enemyActiveRef.current];
    const pf2 = playerPartyRef.current[playerActiveRef.current];
    if (await checkStatus(ef2, 'enemy')) {
      const enemyMove = pickEnemyMove(ef2, pf2);
      await executeMove(ef2, pf2, enemyMove, 'enemy', 'player');
      if (pf2.currentHp <= 0) { await handleFaint('player'); sync(); return; }
    }

    await endOfTurnEffects();
    turnCountRef.current++;
    busyRef.current = false; sync();
  };

  // ── 交代 ──
  const openSwitch = (forced = false) => { forcedSwitchRef.current = forced; switchOpenRef.current = true; sync(); };
  const closeSwitch = () => { switchOpenRef.current = false; forcedSwitchRef.current = false; sync(); };

  const switchTo = async (idx: number) => {
    if (idx === playerActiveRef.current) return;
    const forced = forcedSwitchRef.current;
    const old = playerPartyRef.current[playerActiveRef.current];
    playerActiveRef.current = idx; clearAnim('player');
    const nw = playerPartyRef.current[idx];
    closeSwitch();
    addLog(`${old.name}、もどれ！`); await delay(200);
    addLog(`${nw.name}、いけ！`); sync();

    if (!forced) {
      // 交代後、敵に1回行動を許す
      busyRef.current = true; sync();
      await delay(400);
      const ef = enemyPartyRef.current[enemyActiveRef.current];
      if (await checkStatus(ef, 'enemy')) {
        const mv = pickEnemyMove(ef, playerPartyRef.current[playerActiveRef.current]);
        await executeMove(ef, playerPartyRef.current[playerActiveRef.current], mv, 'enemy', 'player');
        if (playerPartyRef.current[playerActiveRef.current].currentHp <= 0) { await handleFaint('player'); sync(); return; }
      }
      await endOfTurnEffects();
      busyRef.current = false; sync();
    } else {
      busyRef.current = false; sync();
    }
  };

  // ── にげる ──
  const tryRun = async () => {
    if (busyRef.current) return;
    if (chance(0.5)) {
      addLog('うまく逃げられた！'); await delay(600); showResult('run');
    } else {
      addLog('逃げられなかった！'); busyRef.current = true; sync();
      await delay(400);
      const ef = enemyPartyRef.current[enemyActiveRef.current];
      if (await checkStatus(ef, 'enemy')) {
        const mv = pickEnemyMove(ef, playerPartyRef.current[playerActiveRef.current]);
        await executeMove(ef, playerPartyRef.current[playerActiveRef.current], mv, 'enemy', 'player');
        if (playerPartyRef.current[playerActiveRef.current].currentHp <= 0) { await handleFaint('player'); sync(); return; }
      }
      busyRef.current = false; sync();
    }
  };

  // ── 表示ヘルパー ──
  const typeLabel = (t: string) => cfg.typeLabels?.[t] ?? t.toUpperCase();
  const typeColor = (t: string) => cfg.typeColors[t] ?? '#888';
  const typeBadgeStyle = (t: string): CSSProperties => ({
    background: typeColor(t), color: LIGHT_TEXT_TYPES.has(t) ? '#333' : '#fff',
  });
  const moveBtnStyle = (t: string): CSSProperties => {
    const base = typeColor(t);
    return { background: `linear-gradient(135deg, ${base}dd, ${base}88)`, borderColor: base };
  };
  const hpColor = (pct: number) => (pct > 50 ? 'var(--pkb-hp-green)' : pct > 20 ? 'var(--pkb-hp-yellow)' : 'var(--pkb-hp-red)');

  // ── 各画面 ──
  const renderTitle = () => (
    <div className="pkb-screen pkb-title">
      <div className="pkb-pokeball" />
      <div className="pkb-logo">{cfg.title.split('\n').map((l, i) => <span key={i}>{l}<br /></span>)}</div>
      {cfg.subtitle && <div className="pkb-sub">{cfg.subtitle}</div>}
      <button className="pkb-btn-primary" onClick={showPartySelect}>はじめる</button>
    </div>
  );

  const renderParty = () => (
    <div className="pkb-screen pkb-party">
      <div className="pkb-party-header">
        <h2>パーティを選ぶ <span className="pkb-sel-count">{selectedIds.length} / {cfg.teamSize}</span></h2>
        <p>{cfg.teamSize}体選んでください</p>
      </div>
      <div className="pkb-grid">
        {cfg.pokedex.map(p => (
          <div key={p.id} className={`pkb-card${selectedIds.includes(p.id) ? ' pkb-selected' : ''}`} onClick={() => toggleSelect(p.id)}>
            <span className="pkb-check">✓</span>
            <span className="pkb-sprite-lg">{p.sprite}</span>
            <div className="pkb-name">{p.name}</div>
            <div className="pkb-types">
              {p.types.map(t => <span key={t} className="pkb-type-badge" style={typeBadgeStyle(t)}>{typeLabel(t)}</span>)}
            </div>
            <div className="pkb-stats-mini">HP:{calcMaxHp(p.hp)} / 速:{calcStat(p.spe)}</div>
          </div>
        ))}
      </div>
      <div className="pkb-party-confirm">
        <button className="pkb-btn-primary" disabled={selectedIds.length !== cfg.teamSize} onClick={startBattle}>対戦開始！</button>
      </div>
    </div>
  );

  const renderInfo = (f: Fighter, side: 'player' | 'enemy') => {
    const party = side === 'player' ? playerPartyRef.current : enemyPartyRef.current;
    const activeIdx = side === 'player' ? playerActiveRef.current : enemyActiveRef.current;
    const pct = Math.max(0, (f.currentHp / f.maxHp) * 100);
    const st = f.status ? statusByKey.current.get(f.status) : null;
    return (
      <div className="pkb-info">
        <div className="pkb-info-top">
          <div className="pkb-fname">{f.name}</div>
          <div className="pkb-flevel">Lv.{f.level}</div>
        </div>
        <div className="pkb-dots">
          {party.map((p, i) => (
            <div key={i} className={`pkb-dot ${i === activeIdx ? 'pkb-dot-active' : p.currentHp > 0 ? 'pkb-dot-alive' : 'pkb-dot-fainted'}`} />
          ))}
        </div>
        <div className="pkb-hp-wrap">
          <div className="pkb-hp-label"><span>HP</span><span>{Math.max(0, f.currentHp)}/{f.maxHp}</span></div>
          <div className="pkb-hp-bg"><div className="pkb-hp" style={{ width: `${pct}%`, background: hpColor(pct) }} /></div>
        </div>
        {st && <div><span className="pkb-status-badge" style={{ background: st.badgeColor }}>{st.label}</span></div>}
      </div>
    );
  };

  const renderBattle = () => {
    const pf = playerPartyRef.current[playerActiveRef.current];
    const ef = enemyPartyRef.current[enemyActiveRef.current];
    if (!pf || !ef) return null;
    const pa = pAnimRef.current, ea = eAnimRef.current;
    const canAct = !busyRef.current && !switchOpenRef.current;
    return (
      <div className="pkb-screen pkb-battle">
        <div className="pkb-field">
          <div className="pkb-enemy-side">{renderInfo(ef, 'enemy')}</div>
          <div className="pkb-enemy-sprite-wrap">
            <span key={`e${ea.n}`} className={`pkb-sprite pkb-enemy-sprite ${ea.cls}`}>{ef.sprite}</span>
          </div>
          <div className="pkb-player-sprite-wrap">
            <span key={`p${pa.n}`} className={`pkb-sprite pkb-player-sprite ${pa.cls}`}>{pf.sprite}</span>
          </div>
          <div className="pkb-player-side">{renderInfo(pf, 'player')}</div>
        </div>

        <div className="pkb-bottom">
          <div className="pkb-log">
            {logRef.current.slice(-4).map((l, i, arr) => (
              <div key={i} className={`pkb-log-line${i === arr.length - 1 ? ' pkb-log-last' : ''}`}>{l}</div>
            ))}
          </div>
          <div className="pkb-controls">
            {!switchOpenRef.current ? (
              <div>
                <div className="pkb-moves">
                  {pf.moves.map(mid => {
                    const move = moveById.current.get(mid)!;
                    const pp = pf.pp[mid];
                    return (
                      <button key={mid} className="pkb-move" style={moveBtnStyle(move.type)} disabled={pp === 0 || !canAct}
                        onClick={() => playerUsesMove(mid)}>
                        <span className="pkb-move-name">{move.name}</span>
                        <span className="pkb-move-meta"><span>{typeLabel(move.type)}</span><span>PP {pp}/{move.pp}</span></span>
                      </button>
                    );
                  })}
                </div>
                <div className="pkb-actions">
                  <button className="pkb-action" disabled={!canAct} onClick={() => openSwitch(false)}>🔄 ポケモン</button>
                  <button className="pkb-action" disabled={!canAct} onClick={tryRun}>🏃 にげる</button>
                </div>
              </div>
            ) : (
              <div className="pkb-switch">
                {playerPartyRef.current.map((p, i) => {
                  const hpPct = Math.round((p.currentHp / p.maxHp) * 100);
                  return (
                    <button key={i} className={`pkb-switch-btn${i === playerActiveRef.current ? ' pkb-switch-active' : ''}`}
                      disabled={p.currentHp <= 0 || i === playerActiveRef.current} onClick={() => switchTo(i)}>
                      <span className="pkb-sp-sprite">{p.sprite}</span>
                      <div className="pkb-sp-info">
                        <div className="pkb-sp-name">{p.name}</div>
                        <div className="pkb-sp-hp">HP: {p.currentHp}/{p.maxHp} ({hpPct}%)</div>
                      </div>
                    </button>
                  );
                })}
                {!forcedSwitchRef.current && <button className="pkb-back" onClick={closeSwitch}>← もどる</button>}
              </div>
            )}
          </div>
        </div>
      </div>
    );
  };

  const renderResult = () => {
    const title = outcome === 'win' ? '勝利！' : outcome === 'lose' ? '敗北…' : '逃げた！';
    const msg = outcome === 'win'
      ? `${turnCountRef.current}ターンで相手を全滅させた！\nポケモンマスターへの道は続く…`
      : outcome === 'lose'
        ? '全てのポケモンがたおれた。\n次は勝てるように鍛え直そう！'
        : 'またいつかチャレンジしよう！';
    return (
      <div className="pkb-screen pkb-result">
        <div className="pkb-pokeball pkb-pokeball-static" />
        <div className={`pkb-result-title ${outcome === 'win' ? 'pkb-win' : 'pkb-lose'}`}>{title}</div>
        <div className="pkb-result-msg">{msg}</div>
        <button className="pkb-btn-primary" onClick={showPartySelect}>もういちど</button>
      </div>
    );
  };

  return (
    <div className="pkb-root">
      <style>{STYLE}</style>
      {screen === 'title' && renderTitle()}
      {screen === 'party' && renderParty()}
      {screen === 'battle' && renderBattle()}
      {screen === 'result' && renderResult()}
    </div>
  );
}

// ── スコープ付きスタイル（gomi/games/pokemon.html の CSS を移植・接頭辞 pkb-）──
const STYLE = `
.pkb-root {
  --pkb-bg: #1a1a2e; --pkb-surface: #16213e; --pkb-card: #0f3460; --pkb-accent: #e94560;
  --pkb-text: #eaeaea; --pkb-muted: #a0a0b0;
  --pkb-hp-green: #4caf50; --pkb-hp-yellow: #ffeb3b; --pkb-hp-red: #f44336; --pkb-radius: 12px;
  position: absolute; inset: 0; overflow: hidden;
  font-family: 'Segoe UI', system-ui, sans-serif; color: var(--pkb-text); background: var(--pkb-bg);
  -webkit-tap-highlight-color: transparent;
}
.pkb-root * { box-sizing: border-box; }
.pkb-screen { display: flex; flex-direction: column; height: 100%; }

/* タイトル */
.pkb-title { align-items: center; justify-content: center; gap: 18px;
  background: radial-gradient(ellipse at center, #0f3460 0%, #1a1a2e 70%); }
.pkb-logo { font-size: 2.4rem; font-weight: 900; letter-spacing: 2px; text-align: center; line-height: 1.05;
  background: linear-gradient(135deg, #ffeb3b, #ff9800, #e94560);
  -webkit-background-clip: text; background-clip: text; -webkit-text-fill-color: transparent;
  filter: drop-shadow(0 0 20px rgba(233,69,96,0.5)); }
.pkb-sub { color: var(--pkb-muted); font-size: 0.9rem; }
.pkb-pokeball { width: 70px; height: 70px; border-radius: 50%; border: 6px solid var(--pkb-text);
  position: relative; animation: pkb-spin 4s linear infinite;
  background: linear-gradient(180deg, var(--pkb-accent) 50%, #fff 50%); }
.pkb-pokeball-static { animation-play-state: paused; }
.pkb-pokeball::before { content: ''; position: absolute; width: 100%; height: 6px; background: var(--pkb-text); top: 50%; transform: translateY(-50%); left: 0; }
.pkb-pokeball::after { content: ''; position: absolute; width: 20px; height: 20px; border-radius: 50%; background: #fff; border: 4px solid var(--pkb-text); top: 50%; left: 50%; transform: translate(-50%, -50%); }
@keyframes pkb-spin { from { transform: rotate(0); } to { transform: rotate(360deg); } }
.pkb-btn-primary { background: linear-gradient(135deg, var(--pkb-accent), #c62a47); border: none; color: #fff;
  font-size: 1.05rem; font-weight: 700; padding: 12px 44px; border-radius: 50px; cursor: pointer;
  box-shadow: 0 4px 20px rgba(233,69,96,0.4); transition: transform 0.1s; }
.pkb-btn-primary:active { transform: scale(0.96); }
.pkb-btn-primary:disabled { opacity: 0.4; cursor: default; }

/* パーティ選択 */
.pkb-party { overflow-y: auto; }
.pkb-party-header { padding: 12px 16px; background: var(--pkb-surface); border-bottom: 2px solid var(--pkb-card);
  position: sticky; top: 0; z-index: 10; }
.pkb-party-header h2 { font-size: 1.05rem; margin: 0 0 2px; }
.pkb-party-header p { font-size: 0.78rem; color: var(--pkb-muted); margin: 0; }
.pkb-sel-count { display: inline-block; background: var(--pkb-accent); color: #fff; border-radius: 20px; padding: 2px 10px; font-size: 0.78rem; font-weight: 700; }
.pkb-grid { display: grid; grid-template-columns: 1fr 1fr 1fr; gap: 8px; padding: 10px; }
.pkb-card { background: var(--pkb-surface); border: 2px solid var(--pkb-card); border-radius: var(--pkb-radius);
  padding: 8px; cursor: pointer; position: relative; overflow: hidden; transition: border-color 0.15s, transform 0.1s; }
.pkb-card.pkb-selected { border-color: var(--pkb-accent); background: rgba(233,69,96,0.1); }
.pkb-card:active { transform: scale(0.97); }
.pkb-check { position: absolute; top: 4px; right: 6px; font-size: 1.1rem; opacity: 0; transition: opacity 0.15s; }
.pkb-card.pkb-selected .pkb-check { opacity: 1; }
.pkb-sprite-lg { font-size: 2.4rem; display: block; text-align: center; line-height: 1; margin-bottom: 4px; filter: drop-shadow(0 2px 4px rgba(0,0,0,0.5)); }
.pkb-name { font-weight: 700; font-size: 0.82rem; text-align: center; }
.pkb-types { display: flex; gap: 3px; justify-content: center; margin-top: 3px; flex-wrap: wrap; }
.pkb-type-badge { font-size: 0.58rem; font-weight: 700; padding: 1px 5px; border-radius: 10px; }
.pkb-stats-mini { margin-top: 4px; font-size: 0.62rem; color: var(--pkb-muted); text-align: center; }
.pkb-party-confirm { padding: 10px; background: var(--pkb-surface); border-top: 2px solid var(--pkb-card); position: sticky; bottom: 0; }
.pkb-party-confirm .pkb-btn-primary { width: 100%; }

/* バトル */
.pkb-battle { overflow: hidden; }
.pkb-field { flex: 1; position: relative; overflow: hidden; min-height: 0;
  background: linear-gradient(180deg, #1a3a5c 0%, #2d1b4e 50%, #1a1a2e 100%); }
.pkb-field::before { content: ''; position: absolute; bottom: 0; left: 0; right: 0; height: 35%; background: linear-gradient(180deg, transparent, rgba(0,0,0,0.3)); }
.pkb-enemy-side { position: absolute; top: 8px; left: 12px; }
.pkb-player-side { position: absolute; bottom: 6px; right: 12px; }
.pkb-info { background: rgba(0,0,0,0.6); backdrop-filter: blur(8px); border-radius: var(--pkb-radius); padding: 7px 11px; min-width: 170px; border: 1px solid rgba(255,255,255,0.1); }
.pkb-info-top { display: flex; justify-content: space-between; align-items: baseline; }
.pkb-fname { font-weight: 700; font-size: 0.9rem; }
.pkb-flevel { font-size: 0.68rem; color: var(--pkb-muted); }
.pkb-dots { display: flex; gap: 4px; margin-top: 4px; }
.pkb-dot { width: 9px; height: 9px; border-radius: 50%; border: 1px solid rgba(255,255,255,0.4); }
.pkb-dot-alive { background: var(--pkb-hp-green); }
.pkb-dot-fainted { background: #555; }
.pkb-dot-active { background: #fff; }
.pkb-hp-wrap { margin-top: 4px; }
.pkb-hp-label { font-size: 0.62rem; color: var(--pkb-muted); margin-bottom: 2px; display: flex; justify-content: space-between; }
.pkb-hp-bg { height: 8px; background: rgba(255,255,255,0.15); border-radius: 4px; overflow: hidden; }
.pkb-hp { height: 100%; border-radius: 4px; transition: width 0.6s ease, background-color 0.6s ease; }
.pkb-status-badge { display: inline-block; font-size: 0.58rem; font-weight: 700; padding: 1px 5px; border-radius: 4px; margin-top: 3px; color: #fff; }
.pkb-enemy-sprite-wrap { position: absolute; right: 24px; top: 22%; transform: translateY(-50%); }
.pkb-player-sprite-wrap { position: absolute; left: 24px; bottom: 32%; }
.pkb-sprite { font-size: 4.4rem; display: block; filter: drop-shadow(0 4px 8px rgba(0,0,0,0.5)); }
.pkb-enemy-sprite { animation: pkb-float 3s ease-in-out infinite; transform: scaleX(-1); }
.pkb-player-sprite { animation: pkb-float2 3s ease-in-out infinite 0.5s; }
@keyframes pkb-float { 0%, 100% { transform: scaleX(-1) translateY(0); } 50% { transform: scaleX(-1) translateY(-8px); } }
@keyframes pkb-float2 { 0%, 100% { transform: translateY(0); } 50% { transform: translateY(-8px); } }

.pkb-bottom { background: var(--pkb-surface); border-top: 2px solid var(--pkb-card); flex-shrink: 0; }
.pkb-log { padding: 8px 12px; min-height: 52px; max-height: 76px; overflow-y: auto; border-bottom: 1px solid var(--pkb-card); }
.pkb-log-line { font-size: 0.78rem; line-height: 1.45; color: var(--pkb-muted); }
.pkb-log-last { color: var(--pkb-text); font-size: 0.85rem; }
.pkb-controls { padding: 8px; }
.pkb-moves { display: grid; grid-template-columns: 1fr 1fr; gap: 6px; }
.pkb-move { border: 2px solid transparent; border-radius: var(--pkb-radius); padding: 9px 8px; cursor: pointer;
  font-size: 0.82rem; font-weight: 700; color: #fff; text-align: left; transition: transform 0.1s, opacity 0.1s; overflow: hidden; }
.pkb-move:active { transform: scale(0.97); }
.pkb-move:disabled { opacity: 0.4; cursor: default; }
.pkb-move-name { display: block; }
.pkb-move-meta { font-size: 0.62rem; font-weight: 400; opacity: 0.85; margin-top: 1px; display: flex; justify-content: space-between; }
.pkb-actions { display: grid; grid-template-columns: 1fr 1fr; gap: 6px; margin-top: 6px; }
.pkb-action { background: var(--pkb-card); border: 1px solid rgba(255,255,255,0.1); border-radius: var(--pkb-radius); padding: 9px; color: var(--pkb-text); font-size: 0.82rem; cursor: pointer; transition: transform 0.1s; }
.pkb-action:active { transform: scale(0.97); }
.pkb-action:disabled { opacity: 0.4; cursor: default; }
.pkb-switch { display: flex; flex-direction: column; gap: 6px; }
.pkb-switch-btn { display: flex; align-items: center; gap: 10px; background: var(--pkb-card); border: 2px solid transparent; border-radius: var(--pkb-radius); padding: 7px 11px; cursor: pointer; color: var(--pkb-text); transition: border-color 0.15s, transform 0.1s; }
.pkb-switch-btn:active { transform: scale(0.97); }
.pkb-switch-btn:disabled { opacity: 0.4; cursor: default; }
.pkb-switch-active { border-color: var(--pkb-accent); }
.pkb-sp-sprite { font-size: 1.7rem; }
.pkb-sp-info { flex: 1; text-align: left; }
.pkb-sp-name { font-weight: 700; font-size: 0.88rem; }
.pkb-sp-hp { font-size: 0.7rem; color: var(--pkb-muted); }
.pkb-back { background: transparent; border: 1px solid var(--pkb-muted); border-radius: var(--pkb-radius); padding: 7px; color: var(--pkb-muted); cursor: pointer; font-size: 0.78rem; }

/* リザルト */
.pkb-result { align-items: center; justify-content: center; gap: 18px; padding: 24px; text-align: center;
  background: radial-gradient(ellipse at center, #0f3460 0%, #1a1a2e 70%); }
.pkb-result-title { font-size: 2.3rem; font-weight: 900; }
.pkb-result-title.pkb-win { background: linear-gradient(135deg, #ffeb3b, #ff9800); -webkit-background-clip: text; background-clip: text; -webkit-text-fill-color: transparent; filter: drop-shadow(0 0 20px rgba(255,235,59,0.6)); }
.pkb-result-title.pkb-lose { background: linear-gradient(135deg, #90a4ae, #607d8b); -webkit-background-clip: text; background-clip: text; -webkit-text-fill-color: transparent; }
.pkb-result-msg { color: var(--pkb-muted); font-size: 0.92rem; line-height: 1.6; white-space: pre-wrap; }

/* アニメーション */
@keyframes pkb-shake { 0%, 100% { transform: translateX(0); } 20% { transform: translateX(-8px); } 40% { transform: translateX(8px); } 60% { transform: translateX(-6px); } 80% { transform: translateX(6px); } }
@keyframes pkb-hit { 0%, 100% { filter: drop-shadow(0 4px 8px rgba(0,0,0,0.5)); } 50% { filter: drop-shadow(0 0 20px #fff) brightness(3); } }
@keyframes pkb-faint { to { transform: translateY(60px) scaleY(0.1); opacity: 0; } }
.pkb-anim-shake { animation: pkb-shake 0.4s ease !important; }
.pkb-anim-hit { animation: pkb-hit 0.3s ease !important; }
.pkb-anim-faint { animation: pkb-faint 0.5s ease forwards !important; }
`;
