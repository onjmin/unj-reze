// MiniScript VM — touhou.html 参考実装を TypeScript に移植
// 雑魚 wave / ボス弾幕スクリプトの非同期インタープリタ

export type MiniEnv = Record<string, unknown>;
export type MiniScope = Record<string, unknown>;

function splitArgs(s: string): string[] {
  const args: string[] = [];
  let cur = '', depth = 0, inStr = false, strQ = '"';
  for (let i = 0; i < s.length; i++) {
    const c = s[i];
    if (inStr) { cur += c; if (c === strQ && s[i - 1] !== '\\') inStr = false; continue; }
    if (c === '"' || c === "'") { inStr = true; strQ = c; cur += c; continue; }
    if ('([{'.includes(c)) { depth++; cur += c; continue; }
    if (')]}'.includes(c)) { depth--; cur += c; continue; }
    if (c === ',' && depth === 0) { args.push(cur.trim()); cur = ''; continue; }
    cur += c;
  }
  if (cur.trim()) args.push(cur.trim());
  return args;
}

function evalExpr(src: string, scope: MiniScope, env: MiniEnv): unknown {
  const safe = src.replace(/\/\/.*$/, '').trim();
  const allow = /[A-Za-z_][A-Za-z0-9_]*/g;
  const tokens = new Set<string>();
  (safe.match(allow) || []).forEach(t => tokens.add(t));
  const builtins = new Set(Object.keys(env));
  const reserved = new Set([
    'true', 'false', 'null', 'undefined', 'NaN', 'Infinity',
    'if', 'else', 'for', 'while', 'return', 'function', 'end', 'then', 'and', 'or', 'not',
  ]);
  const code = safe.replace(/\band\b/g, '&&').replace(/\bor\b/g, '||').replace(/\bnot\b/g, '!');
  const getters: string[] = [];
  tokens.forEach(t => {
    if (reserved.has(t) || /^\d/.test(t)) return;
    if (builtins.has(t)) { getters.push(`const ${t} = __env["${t}"];`); return; }
    getters.push(`let ${t} = __scope["${t}"];`);
  });
  const js = `(function(__env,__scope){ ${getters.join('\n')} return (${code}); })`;
  try {
    return Function(`return ${js}`)()(env, scope);
  } catch (e) {
    throw new Error(`ExprError in \`${src}\`: ${(e as Error).message}`);
  }
}

function getBlockEnd(lines: string[], start: number, kind: string): number {
  let depth = 0;
  for (let i = start; i < lines.length; i++) {
    const s = lines[i];
    if (kind === 'if') {
      if (/^if\b/.test(s)) depth++;
      if (/^end if\b/.test(s)) { depth--; if (depth === 0) return i; }
    } else if (kind === 'while') {
      if (/^while\b/.test(s)) depth++;
      if (/^end while\b/.test(s)) { depth--; if (depth === 0) return i; }
    } else if (kind === 'for') {
      if (/^for\b/.test(s)) depth++;
      if (/^end for\b/.test(s)) { depth--; if (depth === 0) return i; }
    }
  }
  throw new Error(`Unclosed block: ${kind}`);
}

export function parseMiniScript(src: string): string[] {
  const lines: string[] = [];
  for (let line of src.split(/\r?\n/)) {
    const ci = line.indexOf('//');
    if (ci >= 0) line = line.slice(0, ci);
    const s = line.trim();
    if (s) lines.push(s);
  }
  return lines;
}

export async function runMiniScript(
  lines: string[],
  env: MiniEnv,
  initScope: MiniScope = {},
): Promise<void> {
  async function run(stmts: string[], sc: MiniScope): Promise<void> {
    let ip = 0;
    while (ip < stmts.length) {
      const line = stmts[ip];

      // if / else if / else
      if (/^if\b/.test(line)) {
        const end = getBlockEnd(stmts, ip, 'if');
        const branches: { type: string; cond?: string; start: number; end: number }[] = [];
        let j = ip;
        while (j <= end) {
          const s = stmts[j];
          if (/^if\b/.test(s) || /^else if\b/.test(s)) {
            const condSrc = s.replace(/^(if|else if)\s*/, '').replace(/\s*then$/, '');
            let k = j + 1; let next = end;
            for (; k <= end; k++) {
              if (/^(else if|else|end if)\b/.test(stmts[k])) { next = k - 1; break; }
            }
            branches.push({ type: 'if', cond: condSrc, start: j + 1, end: next });
            j = k;
          } else if (/^else\b/.test(s)) {
            branches.push({ type: 'else', start: j + 1, end: end - 1 });
            j = end;
          } else { j++; }
        }
        for (const b of branches) {
          if (b.type === 'if') {
            if (!!evalExpr(b.cond!, sc, env)) { await run(stmts.slice(b.start, b.end + 1), sc); break; }
          } else { await run(stmts.slice(b.start, b.end + 1), sc); break; }
        }
        ip = end + 1; continue;
      }

      // while
      if (/^while\b/.test(line)) {
        const condSrc = line.replace(/^while\s*/, '');
        const end = getBlockEnd(stmts, ip, 'while');
        while (!!evalExpr(condSrc, sc, env)) {
          await run(stmts.slice(ip + 1, end), sc);
        }
        ip = end + 1; continue;
      }

      // for i in range(...)
      if (/^for\b/.test(line)) {
        const m = line.match(/^for\s+([A-Za-z_][A-Za-z0-9_]*)\s+in\s+(.+)$/);
        if (!m) throw new Error(`Invalid for: ${line}`);
        const [, varName, iterExpr] = m;
        const end = getBlockEnd(stmts, ip, 'for');
        const list = evalExpr(iterExpr, sc, env);
        if (!Array.isArray(list)) throw new Error(`for expects array: ${iterExpr}`);
        for (const v of list) {
          sc[varName] = v;
          await run(stmts.slice(ip + 1, end), sc);
        }
        ip = end + 1; continue;
      }

      // assignment (x = expr, not x == expr)
      if (/^[A-Za-z_][A-Za-z0-9_]*\s*=[^=]/.test(line)) {
        const eqIdx = line.indexOf('=');
        const lhs = line.slice(0, eqIdx).trim();
        const rhs = line.slice(eqIdx + 1).trim();
        sc[lhs] = evalExpr(rhs, sc, env);
        ip++; continue;
      }

      // function call: fn(args)
      if (/^[A-Za-z_][A-Za-z0-9_]*\s*\(/.test(line)) {
        const m = line.match(/^([A-Za-z_][A-Za-z0-9_]*)\s*\((.*)\)\s*$/);
        if (m) {
          const fn = m[1];
          const argsStr = m[2].trim();
          const args = argsStr ? splitArgs(argsStr).map(a => evalExpr(a, sc, env)) : [];
          const f = env[fn];
          if (typeof f !== 'function') throw new Error(`Unknown function: ${fn}`);
          const r = (f as (...a: unknown[]) => unknown)(...args);
          if (r && typeof (r as Promise<void>).then === 'function') await (r as Promise<void>);
        }
        ip++; continue;
      }

      // block terminators
      if (/^end (if|while|for)\b/.test(line) || /^else(\s+if)?\b/.test(line)) {
        ip++; continue;
      }

      ip++;
    }
  }

  await run(lines, { ...initScope });
}
