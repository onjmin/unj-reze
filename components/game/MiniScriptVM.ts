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

// ── 式の評価 ──────────────────────────────────────────────────────────
// スクリプトは投稿されたゲームの manifest から来る＝他人が書いたコード。以前は式を JS 文字列に
// 組み立てて Function() で実行していたが、`[].constructor.constructor("…")()` で素の JS に
// 抜けられた（投稿ゲームを遊ぶだけで、こちらのオリジンで任意コードが走る）。
// なので式は自前の字句解析→構文解析（優先順位つき再帰下降）→木を歩く評価器で解く。
// - 呼べる関数は env（＋CORE_BUILTINS）に入っている関数だけ。プロパティ経由で拾った関数は呼ばない。
// - プロパティの読み書きは「配列の添字と length／文字列の添字と length／辞書の自前のキー」だけ。
//   constructor / __proto__ / prototype などはどの値からも読めないし、書けない。
// - 識別子は env → scope の自前のキーの順に引き、どちらにも無ければ undefined（従来どおり）。

type Node =
	| { t: "lit"; v: unknown }
	| { t: "id"; n: string }
	| { t: "arr"; items: Node[] }
	| { t: "obj"; entries: [string, Node][] }
	| { t: "un"; op: string; a: Node }
	| { t: "bin"; op: string; a: Node; b: Node }
	| { t: "cond"; c: Node; a: Node; b: Node }
	| { t: "mem"; o: Node; k: Node }
	| { t: "call"; f: Node; args: Node[] };

type Tok =
	| { k: "num"; v: number }
	| { k: "str"; v: string }
	| { k: "id"; v: string }
	| { k: "op"; v: string }
	| { k: "eof" };

/** どの値からも読み書きさせないキー。プロトタイプ汚染と、暗黙の型変換（valueOf 等）経由で
 *  関数を呼ばせる余地を潰す。 */
const BLOCKED_KEYS = new Set([
	"__proto__",
	"constructor",
	"prototype",
	"valueOf",
	"toString",
	"toLocaleString",
	"toJSON",
	"then",
	"hasOwnProperty",
	"isPrototypeOf",
	"propertyIsEnumerable",
	"__defineGetter__",
	"__defineSetter__",
	"__lookupGetter__",
	"__lookupSetter__",
]);

// 長い記号を先に並べる（最長一致）
const OPERATORS = [
	">>>",
	"===",
	"!==",
	"**",
	"==",
	"!=",
	"<=",
	">=",
	"&&",
	"||",
	"??",
	"<<",
	">>",
	"+",
	"-",
	"*",
	"/",
	"%",
	"<",
	">",
	"!",
	"~",
	"&",
	"|",
	"^",
	"?",
	":",
	"(",
	")",
	"[",
	"]",
	"{",
	"}",
	",",
	".",
];

const NUM_RE = /^(?:0[xX][0-9a-fA-F]+|(?:\d+\.?\d*|\.\d+)(?:[eE][+-]?\d+)?)/;
const ID_RE = /^[A-Za-z_$][A-Za-z0-9_$]*/;

function tokenize(src: string): Tok[] {
	const toks: Tok[] = [];
	let i = 0;
	while (i < src.length) {
		const c = src[i];
		if (c === " " || c === "\t" || c === "\r" || c === "\n") {
			i++;
			continue;
		}
		const rest = src.slice(i);
		// 数値（"." の後ろが数字なら小数、そうでなければプロパティアクセス）
		if (/[0-9]/.test(c) || (c === "." && /[0-9]/.test(src[i + 1] ?? ""))) {
			const m = rest.match(NUM_RE);
			if (m) {
				toks.push({ k: "num", v: Number(m[0]) });
				i += m[0].length;
				continue;
			}
		}
		if (c === '"' || c === "'") {
			let s = "";
			let j = i + 1;
			for (; j < src.length && src[j] !== c; j++) {
				if (src[j] === "\\" && j + 1 < src.length) {
					const e = src[++j];
					if (e === "n") s += "\n";
					else if (e === "t") s += "\t";
					else if (e === "r") s += "\r";
					else if (e === "0") s += "\0";
					else if (e === "u" && /^[0-9a-fA-F]{4}$/.test(src.slice(j + 1, j + 5))) {
						s += String.fromCharCode(parseInt(src.slice(j + 1, j + 5), 16));
						j += 4;
					} else s += e;
				} else s += src[j];
			}
			if (j >= src.length) throw new SyntaxError("Invalid or unexpected token");
			toks.push({ k: "str", v: s });
			i = j + 1;
			continue;
		}
		const idm = rest.match(ID_RE);
		if (idm) {
			const w = idm[0];
			// and / or / not は && / || / ! の別名
			if (w === "and") toks.push({ k: "op", v: "&&" });
			else if (w === "or") toks.push({ k: "op", v: "||" });
			else if (w === "not") toks.push({ k: "op", v: "!" });
			else toks.push({ k: "id", v: w });
			i += w.length;
			continue;
		}
		const op = OPERATORS.find((o) => rest.startsWith(o));
		if (!op) throw new SyntaxError(`Unexpected character '${c}'`);
		toks.push({ k: "op", v: op });
		i += op.length;
	}
	toks.push({ k: "eof" });
	return toks;
}

/** 二項演算子の結合の強さ（JS と同じ順序）。 */
const BINARY_PREC: Record<string, number> = {
	"??": 3,
	"||": 4,
	"&&": 5,
	"|": 6,
	"^": 7,
	"&": 8,
	"==": 9,
	"!=": 9,
	"===": 9,
	"!==": 9,
	"<": 10,
	">": 10,
	"<=": 10,
	">=": 10,
	"<<": 11,
	">>": 11,
	">>>": 11,
	"+": 12,
	"-": 12,
	"*": 13,
	"/": 13,
	"%": 13,
	"**": 14,
};

const LITERAL_WORDS: Record<string, unknown> = {
	true: true,
	false: false,
	null: null,
	undefined: undefined,
	NaN: NaN,
	Infinity: Infinity,
};

function parseExpression(src: string): Node {
	const toks = tokenize(src);
	let p = 0;
	const peek = () => toks[p];
	const isOp = (v: string) => {
		const t = toks[p];
		return t.k === "op" && t.v === v;
	};
	const expect = (v: string) => {
		if (!isOp(v)) throw new SyntaxError(`Expected '${v}'`);
		p++;
	};

	function parseCond(): Node {
		const c = parseBinary(0);
		if (isOp("?")) {
			p++;
			const a = parseCond();
			expect(":");
			const b = parseCond();
			return { t: "cond", c, a, b };
		}
		return c;
	}

	function parseBinary(minPrec: number): Node {
		let left = parseUnary();
		for (;;) {
			const t = peek();
			if (t.k !== "op") break;
			const prec = BINARY_PREC[t.v];
			if (prec === undefined || prec <= minPrec) break;
			p++;
			// ** だけ右結合
			const right = parseBinary(t.v === "**" ? prec - 1 : prec);
			left = { t: "bin", op: t.v, a: left, b: right };
		}
		return left;
	}

	function parseUnary(): Node {
		const t = peek();
		if (t.k === "op" && (t.v === "!" || t.v === "-" || t.v === "+" || t.v === "~")) {
			p++;
			return { t: "un", op: t.v, a: parseUnary() };
		}
		return parsePostfix(parsePrimary());
	}

	function parsePostfix(base: Node): Node {
		let node = base;
		for (;;) {
			if (isOp(".")) {
				p++;
				const t = peek();
				if (t.k !== "id") throw new SyntaxError("Unexpected token after '.'");
				p++;
				node = { t: "mem", o: node, k: { t: "lit", v: t.v } };
			} else if (isOp("[")) {
				p++;
				const k = parseCond();
				expect("]");
				node = { t: "mem", o: node, k };
			} else if (isOp("(")) {
				p++;
				node = { t: "call", f: node, args: parseList(")") };
			} else return node;
		}
	}

	function parseList(close: string): Node[] {
		const items: Node[] = [];
		while (!isOp(close)) {
			items.push(parseCond());
			if (isOp(",")) p++;
			else break;
		}
		expect(close);
		return items;
	}

	function parsePrimary(): Node {
		const t = peek();
		p++;
		if (t.k === "num" || t.k === "str") return { t: "lit", v: t.v };
		if (t.k === "id") {
			if (Object.hasOwn(LITERAL_WORDS, t.v)) return { t: "lit", v: LITERAL_WORDS[t.v] };
			return { t: "id", n: t.v };
		}
		if (t.k === "op") {
			if (t.v === "(") {
				const e = parseCond();
				expect(")");
				return e;
			}
			if (t.v === "[") return { t: "arr", items: parseList("]") };
			if (t.v === "{") {
				const entries: [string, Node][] = [];
				while (!isOp("}")) {
					const kt = peek();
					p++;
					let key: string;
					if (kt.k === "id" || kt.k === "str") key = kt.v;
					else if (kt.k === "num") key = String(kt.v);
					else throw new SyntaxError("Invalid dictionary key");
					expect(":");
					entries.push([key, parseCond()]);
					if (isOp(",")) p++;
					else break;
				}
				expect("}");
				return { t: "obj", entries };
			}
		}
		throw new SyntaxError(
			t.k === "eof" ? "Unexpected end of input" : `Unexpected token '${t.k === "op" ? t.v : "?"}'`,
		);
	}

	const node = parseCond();
	if (peek().k !== "eof") throw new SyntaxError("Unexpected token after expression");
	return node;
}

/** 構文木のキャッシュ（同じ式が弾ごと・フレームごとに何度も評価されるため）。 */
const AST_CACHE = new Map<string, Node>();
const AST_CACHE_MAX = 4096;

function getAst(src: string): Node {
	let ast = AST_CACHE.get(src);
	if (!ast) {
		ast = parseExpression(src);
		if (AST_CACHE.size >= AST_CACHE_MAX) AST_CACHE.clear();
		AST_CACHE.set(src, ast);
	}
	return ast;
}

/** 式の評価に要る文脈。trusted は呼んでよい関数（env に入っている関数）の集合。 */
interface EvalCtx {
	scope: MiniScope;
	env: MiniEnv;
	trusted: Set<unknown>;
}

function isIndexKey(key: unknown): number {
	const n = typeof key === "number" ? key : typeof key === "string" && /^(0|[1-9]\d*)$/.test(key) ? Number(key) : NaN;
	return Number.isInteger(n) && n >= 0 ? n : -1;
}

/** 辞書として扱ってよい値か（スクリプトが作った {} や、listBullets が返すような素のオブジェクト）。 */
function isPlainDict(v: unknown): v is Record<string, unknown> {
	if (!v || typeof v !== "object" || Array.isArray(v)) return false;
	const proto = Object.getPrototypeOf(v);
	return proto === Object.prototype || proto === null;
}

function describe(v: unknown): string {
	return v === null ? "null" : typeof v;
}

function getMember(obj: unknown, key: unknown): unknown {
	if (obj === null || obj === undefined)
		throw new TypeError(`Cannot read properties of ${obj} (reading '${String(key)}')`);
	const k = typeof key === "number" ? key : String(key);
	if (typeof k === "string" && BLOCKED_KEYS.has(k)) return undefined;
	if (Array.isArray(obj) || typeof obj === "string") {
		if (k === "length") return obj.length;
		const i = isIndexKey(k);
		return i >= 0 && i < obj.length ? obj[i] : undefined;
	}
	if (isPlainDict(obj)) {
		const sk = String(k);
		return Object.hasOwn(obj, sk) ? obj[sk] : undefined;
	}
	return undefined;
}

function setMember(obj: unknown, key: unknown, value: unknown): void {
	if (obj === null || obj === undefined)
		throw new TypeError(`Cannot set properties of ${obj} (setting '${String(key)}')`);
	const k = typeof key === "number" ? String(key) : String(key);
	if (BLOCKED_KEYS.has(k)) throw new TypeError(`Cannot set property '${k}'`);
	if (Array.isArray(obj)) {
		if (k === "length") {
			const n = isIndexKey(value);
			if (n < 0) throw new RangeError("Invalid array length");
			obj.length = n;
			return;
		}
		const i = isIndexKey(k);
		if (i < 0 || i > 0xffffff) throw new TypeError(`Invalid array index '${k}'`);
		obj[i] = value;
		return;
	}
	if (isPlainDict(obj)) {
		obj[k] = value;
		return;
	}
	throw new TypeError(`Cannot set property '${k}' on ${describe(obj)}`);
}

function lookupVar(name: string, ctx: EvalCtx): unknown {
	if (Object.hasOwn(ctx.env, name)) return ctx.env[name];
	if (Object.hasOwn(ctx.scope, name)) return ctx.scope[name];
	return undefined;
}

function nodeName(n: Node): string {
	if (n.t === "id") return n.n;
	if (n.t === "mem" && n.k.t === "lit") return `${nodeName(n.o)}.${String(n.k.v)}`;
	return "expression";
}

/* eslint-disable @typescript-eslint/no-explicit-any -- 演算子は JS と同じ意味で値に掛ける */
function evalNode(n: Node, ctx: EvalCtx): unknown {
	switch (n.t) {
		case "lit":
			return n.v;
		case "id":
			return lookupVar(n.n, ctx);
		case "arr":
			return n.items.map((it) => evalNode(it, ctx));
		case "obj": {
			const o: Record<string, unknown> = {};
			for (const [k, v] of n.entries) setMember(o, k, evalNode(v, ctx));
			return o;
		}
		case "un": {
			const a: any = evalNode(n.a, ctx);
			if (n.op === "!") return !a;
			if (n.op === "-") return -a;
			if (n.op === "+") return +a;
			return ~a;
		}
		case "cond":
			return evalNode(n.c, ctx) ? evalNode(n.a, ctx) : evalNode(n.b, ctx);
		case "mem":
			return getMember(evalNode(n.o, ctx), evalNode(n.k, ctx));
		case "call": {
			const f = evalNode(n.f, ctx);
			if (typeof f !== "function" || !ctx.trusted.has(f))
				throw new TypeError(`${nodeName(n.f)} is not a function`);
			const args = n.args.map((a) => evalNode(a, ctx));
			return (f as (...a: unknown[]) => unknown)(...args);
		}
		case "bin": {
			// 短絡評価
			if (n.op === "&&") return evalNode(n.a, ctx) && evalNode(n.b, ctx);
			if (n.op === "||") return evalNode(n.a, ctx) || evalNode(n.b, ctx);
			if (n.op === "??") return evalNode(n.a, ctx) ?? evalNode(n.b, ctx);
			const a: any = evalNode(n.a, ctx);
			const b: any = evalNode(n.b, ctx);
			switch (n.op) {
				case "+":
					return a + b;
				case "-":
					return a - b;
				case "*":
					return a * b;
				case "/":
					return a / b;
				case "%":
					return a % b;
				case "**":
					return a ** b;
				case "==":
					return a == b;
				case "!=":
					return a != b;
				case "===":
					return a === b;
				case "!==":
					return a !== b;
				case "<":
					return a < b;
				case ">":
					return a > b;
				case "<=":
					return a <= b;
				case ">=":
					return a >= b;
				case "&":
					return a & b;
				case "|":
					return a | b;
				case "^":
					return a ^ b;
				case "<<":
					return a << b;
				case ">>":
					return a >> b;
				case ">>>":
					return a >>> b;
			}
			throw new SyntaxError(`Unknown operator '${n.op}'`);
		}
	}
}
/* eslint-enable @typescript-eslint/no-explicit-any */

function evalExpr(src: string, ctx: EvalCtx): unknown {
	try {
		return evalNode(getAst(src.replace(/\/\/.*$/, "").trim()), ctx);
	} catch (e) {
		throw new Error(`ExprError in \`${src}\`: ${(e as Error).message}`);
	}
}

/** 配列要素・辞書プロパティへの代入（arr[i] = x / dict.key = x / dict["key"] = x）。
 *  配列・オブジェクトは参照型なので、scope 上のベースを書き換えれば元の変数に反映される。 */
function execMemberAssign(lhs: string, rhs: string, ctx: EvalCtx): void {
	try {
		const target = getAst(lhs.trim());
		if (target.t !== "mem") throw new SyntaxError("Invalid left-hand side in assignment");
		const obj = evalNode(target.o, ctx);
		const key = evalNode(target.k, ctx);
		const value = evalNode(getAst(rhs.replace(/\/\/.*$/, "").trim()), ctx);
		setMember(obj, key, value);
	} catch (e) {
		throw new Error(`AssignError in \`${lhs} = ${rhs}\`: ${(e as Error).message}`);
	}
}

/** scope への代入。__proto__ 等への代入は scope 自体を壊すので弾く。 */
function setVar(scope: MiniScope, name: string, value: unknown): void {
	if (BLOCKED_KEYS.has(name)) throw new Error(`AssignError: cannot assign to '${name}'`);
	scope[name] = value;
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
		Array.isArray(v)
			? (key as number) < v.length
			: !!v && typeof v === "object" && Object.hasOwn(v, String(key)),
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
	// 式から呼んでよい関数は env に入っている関数だけ
	const trusted = new Set<unknown>(Object.values(mergedEnv).filter((v) => typeof v === "function"));
	async function run(stmts: string[], sc: MiniScope): Promise<void> {
		const ctx: EvalCtx = { scope: sc, env, trusted };
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
						if (!!evalExpr(b.cond!, ctx)) {
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
				while (!!evalExpr(condSrc, ctx)) {
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
				const list = evalExpr(iterExpr, ctx);
				if (!Array.isArray(list))
					throw new Error(`for expects array: ${iterExpr}`);
				for (const v of list) {
					setVar(sc, varName, v);
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
				setVar(sc, lhs, evalExpr(rhs, ctx));
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
				execMemberAssign(lhs, rhs, ctx);
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
						? splitArgs(argsStr).map((a) => evalExpr(a, ctx))
						: [];
					// env の自前のキーだけ（constructor 等のプロトタイプ由来を拾わない）
					const f = Object.hasOwn(env, fn) ? env[fn] : undefined;
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
