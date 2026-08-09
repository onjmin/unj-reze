// MiniScript VM — touhou.html 参考実装を TypeScript に移植
// 雑魚 wave / ボス弾幕スクリプトの非同期インタープリタ

export type MiniEnv = Record<string, unknown>;
export type MiniScope = Record<string, unknown>;

function splitArgs(s: string): string[] {
	const args: string[] = [];
	let cur = "",
		depth = 0,
		inStr = false,
		strQ = '"';
	for (let i = 0; i < s.length; i++) {
		const c = s[i];
		if (inStr) {
			cur += c;
			if (c === strQ && s[i - 1] !== "\\") inStr = false;
			continue;
		}
		if (c === '"' || c === "'") {
			inStr = true;
			strQ = c;
			cur += c;
			continue;
		}
		if ("([{".includes(c)) {
			depth++;
			cur += c;
			continue;
		}
		if (")]}".includes(c)) {
			depth--;
			cur += c;
			continue;
		}
		if (c === "," && depth === 0) {
			args.push(cur.trim());
			cur = "";
			continue;
		}
		cur += c;
	}
	if (cur.trim()) args.push(cur.trim());
	return args;
}

const RESERVED_WORDS = new Set([
	"true",
	"false",
	"null",
	"undefined",
	"NaN",
	"Infinity",
	"if",
	"else",
	"for",
	"while",
	"return",
	"function",
	"end",
	"then",
	"and",
	"or",
	"not",
]);

/** ソース断片から識別子トークンを抽出し、env組み込み関数は const 参照、それ以外は
 *  scope からの let 束縛として宣言する行を作る（配列/辞書のプロパティ名等も無害に紛れ込むが、
 *  そのまま未使用のローカル変数になるだけで実害はない）。 */
function buildGetters(code: string, env: MiniEnv): string[] {
	const allow = /[A-Za-z_][A-Za-z0-9_]*/g;
	const tokens = new Set<string>();
	(code.match(allow) || []).forEach((t) => tokens.add(t));
	const builtins = new Set(Object.keys(env));
	const getters: string[] = [];
	tokens.forEach((t) => {
		if (RESERVED_WORDS.has(t) || /^\d/.test(t)) return;
		if (builtins.has(t)) {
			getters.push(`const ${t} = __env["${t}"];`);
			return;
		}
		getters.push(`let ${t} = __scope["${t}"];`);
	});
	return getters;
}

function normalizeOps(src: string): string {
	return src
		.replace(/\band\b/g, "&&")
		.replace(/\bor\b/g, "||")
		.replace(/\bnot\b/g, "!");
}

function evalExpr(src: string, scope: MiniScope, env: MiniEnv): unknown {
	const safe = src.replace(/\/\/.*$/, "").trim();
	const code = normalizeOps(safe);
	const getters = buildGetters(code, env);
	const js = `(function(__env,__scope){ ${getters.join("\n")} return (${code}); })`;
	try {
		return Function(`return ${js}`)()(env, scope);
	} catch (e) {
		throw new Error(`ExprError in \`${src}\`: ${(e as Error).message}`);
	}
}

/** 配列要素・辞書プロパティへの代入（arr[i] = x / dict.key = x / dict["key"] = x）。
 *  配列・オブジェクトは参照型なので、scope 上のベースを書き換えれば元の変数に反映される。 */
function execMemberAssign(lhs: string, rhs: string, scope: MiniScope, env: MiniEnv): void {
	const rhsCode = normalizeOps(rhs.replace(/\/\/.*$/, "").trim());
	const combined = `${lhs.trim()} = (${rhsCode});`;
	const getters = buildGetters(`${lhs} ${rhsCode}`, env);
	const js = `(function(__env,__scope){ ${getters.join("\n")} ${combined} })`;
	try {
		Function(`return ${js}`)()(env, scope);
	} catch (e) {
		throw new Error(`AssignError in \`${lhs} = ${rhs}\`: ${(e as Error).message}`);
	}
}

/** MiniScript から使える配列/辞書の組み込み関数。参照型の in-place 操作が中心。 */
const CORE_BUILTINS: MiniEnv = {
	push: (arr: unknown, v: unknown) => {
		if (Array.isArray(arr)) arr.push(v);
		return arr;
	},
	pop: (arr: unknown) => (Array.isArray(arr) ? arr.pop() : undefined),
	len: (v: unknown) =>
		Array.isArray(v) ? v.length : v && typeof v === "object" ? Object.keys(v).length : 0,
	keys: (v: unknown) => (v && typeof v === "object" ? Object.keys(v) : []),
	values: (v: unknown) => (v && typeof v === "object" ? Object.values(v) : []),
	del: (v: unknown, key: unknown) => {
		if (Array.isArray(v)) {
			const i = (key as number) | 0;
			if (i >= 0 && i < v.length) v.splice(i, 1);
		} else if (v && typeof v === "object") {
			delete (v as Record<string, unknown>)[String(key)];
		}
		return v;
	},
	has: (v: unknown, key: unknown) =>
		Array.isArray(v) ? (key as number) < v.length : !!v && typeof v === "object" && String(key) in (v as object),
};

function getBlockEnd(lines: string[], start: number, kind: string): number {
	let depth = 0;
	for (let i = start; i < lines.length; i++) {
		const s = lines[i];
		if (kind === "if") {
			if (/^if\b/.test(s)) depth++;
			if (/^end if\b/.test(s)) {
				depth--;
				if (depth === 0) return i;
			}
		} else if (kind === "while") {
			if (/^while\b/.test(s)) depth++;
			if (/^end while\b/.test(s)) {
				depth--;
				if (depth === 0) return i;
			}
		} else if (kind === "for") {
			if (/^for\b/.test(s)) depth++;
			if (/^end for\b/.test(s)) {
				depth--;
				if (depth === 0) return i;
			}
		}
	}
	throw new Error(`Unclosed block: ${kind}`);
}

export function parseMiniScript(src: string): string[] {
	const lines: string[] = [];
	for (let line of src.split(/\r?\n/)) {
		const ci = line.indexOf("//");
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
	// CORE_BUILTINS（push/pop/len/keys/values/del/has）はどの呼び出し元でも使えるよう先に敷き、
	// 呼び出し側の env で同名関数を渡された場合はそちらを優先する。
	const mergedEnv: MiniEnv = { ...CORE_BUILTINS, ...env };
	env = mergedEnv;
	async function run(stmts: string[], sc: MiniScope): Promise<void> {
		let ip = 0;
		while (ip < stmts.length) {
			const line = stmts[ip];

			// if / else if / else
			if (/^if\b/.test(line)) {
				const end = getBlockEnd(stmts, ip, "if");
				const branches: {
					type: string;
					cond?: string;
					start: number;
					end: number;
				}[] = [];
				let j = ip;
				while (j <= end) {
					const s = stmts[j];
					if (/^if\b/.test(s) || /^else if\b/.test(s)) {
						const condSrc = s
							.replace(/^(if|else if)\s*/, "")
							.replace(/\s*then$/, "");
						let k = j + 1;
						let next = end;
						for (; k <= end; k++) {
							if (/^(else if|else|end if)\b/.test(stmts[k])) {
								next = k - 1;
								break;
							}
						}
						branches.push({
							type: "if",
							cond: condSrc,
							start: j + 1,
							end: next,
						});
						j = k;
					} else if (/^else\b/.test(s)) {
						branches.push({ type: "else", start: j + 1, end: end - 1 });
						j = end;
					} else {
						j++;
					}
				}
				for (const b of branches) {
					if (b.type === "if") {
						if (!!evalExpr(b.cond!, sc, env)) {
							await run(stmts.slice(b.start, b.end + 1), sc);
							break;
						}
					} else {
						await run(stmts.slice(b.start, b.end + 1), sc);
						break;
					}
				}
				ip = end + 1;
				continue;
			}

			// while
			if (/^while\b/.test(line)) {
				const condSrc = line.replace(/^while\s*/, "");
				const end = getBlockEnd(stmts, ip, "while");
				while (!!evalExpr(condSrc, sc, env)) {
					await run(stmts.slice(ip + 1, end), sc);
				}
				ip = end + 1;
				continue;
			}

			// for i in range(...)
			if (/^for\b/.test(line)) {
				const m = line.match(/^for\s+([A-Za-z_][A-Za-z0-9_]*)\s+in\s+(.+)$/);
				if (!m) throw new Error(`Invalid for: ${line}`);
				const [, varName, iterExpr] = m;
				const end = getBlockEnd(stmts, ip, "for");
				const list = evalExpr(iterExpr, sc, env);
				if (!Array.isArray(list))
					throw new Error(`for expects array: ${iterExpr}`);
				for (const v of list) {
					sc[varName] = v;
					await run(stmts.slice(ip + 1, end), sc);
				}
				ip = end + 1;
				continue;
			}

			// assignment (x = expr, not x == expr)
			if (/^[A-Za-z_][A-Za-z0-9_]*\s*=[^=]/.test(line)) {
				const eqIdx = line.indexOf("=");
				const lhs = line.slice(0, eqIdx).trim();
				const rhs = line.slice(eqIdx + 1).trim();
				sc[lhs] = evalExpr(rhs, sc, env);
				ip++;
				continue;
			}

			// member assignment: arr[i] = expr / dict.key = expr / dict["key"] = expr
			if (
				/^[A-Za-z_][A-Za-z0-9_]*(\[[^\]]+\]|\.[A-Za-z_][A-Za-z0-9_]*)+\s*=[^=]/.test(line)
			) {
				const eqIdx = line.indexOf("=");
				const lhs = line.slice(0, eqIdx).trim();
				const rhs = line.slice(eqIdx + 1).trim();
				execMemberAssign(lhs, rhs, sc, env);
				ip++;
				continue;
			}

			// function call: fn(args)
			if (/^[A-Za-z_][A-Za-z0-9_]*\s*\(/.test(line)) {
				const m = line.match(/^([A-Za-z_][A-Za-z0-9_]*)\s*\((.*)\)\s*$/);
				if (m) {
					const fn = m[1];
					const argsStr = m[2].trim();
					const args = argsStr
						? splitArgs(argsStr).map((a) => evalExpr(a, sc, env))
						: [];
					const f = env[fn];
					if (typeof f !== "function")
						throw new Error(`Unknown function: ${fn}`);
					const r = (f as (...a: unknown[]) => unknown)(...args);
					if (r && typeof (r as Promise<void>).then === "function")
						await (r as Promise<void>);
				}
				ip++;
				continue;
			}

			// block terminators
			if (/^end (if|while|for)\b/.test(line) || /^else(\s+if)?\b/.test(line)) {
				ip++;
				continue;
			}

			ip++;
		}
	}

	await run(lines, { ...initScope });
}
