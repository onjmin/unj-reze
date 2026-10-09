const UPLOADS_DIR = "./public/uploads";

type FsModule = typeof import("fs");
type PathModule = typeof import("path");

let _fs: FsModule | null = null;
let _path: PathModule | null = null;

async function loadFs(): Promise<{ fs: FsModule; path: PathModule }> {
	if (_fs) return { fs: _fs, path: _path! };
	const fsModuleName = "fs";
	const pathModuleName = "path";
	const [fsMod, pathMod] = await Promise.all([
		import(fsModuleName),
		import(pathModuleName),
	]);
	_fs = fsMod.default ?? fsMod;
	_path = pathMod.default ?? pathMod;
	return { fs: _fs!, path: _path! };
}

/**
 * `/uploads/<key>` の key を UPLOADS_DIR 配下の実パスへ解決する。外へ出るなら null。
 * key は DB に入った URL 由来（＝利用者が送れる文字列）なので、`../` や絶対パス、
 * サブディレクトリを使って public/uploads の外を読み書き・削除されないよう、
 * 「1階層のファイル名」で、かつ解決後も UPLOADS_DIR の直下にあるものだけ通す。
 */
function resolveUploadPath(pathMod: PathModule, key: string): string | null {
	if (!/^[\w.-]+$/.test(key) || key === "." || key === "..") return null;
	const base = pathMod.resolve(UPLOADS_DIR);
	const filePath = pathMod.resolve(base, key);
	if (pathMod.dirname(filePath) !== base) return null;
	return filePath;
}

export async function uploadImage(base64Data: string): Promise<string> {
	const ext = (base64Data.match(/^data:image\/(\w+)/) || [])[1] || "png";
	const extMap: Record<string, string> = {
		jpeg: "jpg",
		jpg: "jpg",
		png: "png",
		gif: "gif",
		webp: "webp",
	};
	const safeExt = extMap[ext] || "png";
	const key = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}.${safeExt}`;

	const base64 = base64Data.includes(",")
		? base64Data.split(",")[1]
		: base64Data;

	let fs: FsModule, pathMod: PathModule;
	try {
		({ fs, path: pathMod } = await loadFs());
	} catch {
		return base64Data;
	}

	const buffer = Buffer.from(base64, "base64");
	if (!fs.existsSync(UPLOADS_DIR)) {
		fs.mkdirSync(UPLOADS_DIR, { recursive: true });
	}
	// key はサーバーが作った名前だが、念のため同じ検査を通す
	const filePath = resolveUploadPath(pathMod, key);
	if (!filePath) throw new Error("invalid upload key");
	fs.writeFileSync(filePath, buffer);

	return `/uploads/${key}`;
}

export async function deleteImage(url: string): Promise<void> {
	if (!url.startsWith("/uploads/")) return;
	const key = url.replace("/uploads/", "");
	let fs: FsModule, pathMod: PathModule;
	try {
		({ fs, path: pathMod } = await loadFs());
	} catch {
		return;
	}
	const filePath = resolveUploadPath(pathMod, key);
	if (filePath && fs.existsSync(filePath)) {
		fs.unlinkSync(filePath);
	}
}

export async function getImageBuffer(url: string): Promise<Buffer | null> {
	if (!url.startsWith("/uploads/")) return null;
	const key = url.replace("/uploads/", "");
	let fs: FsModule, pathMod: PathModule;
	try {
		({ fs, path: pathMod } = await loadFs());
	} catch {
		return null;
	}
	const filePath = resolveUploadPath(pathMod, key);
	if (!filePath) return null;
	try {
		return fs.readFileSync(filePath);
	} catch {
		return null;
	}
}

export const s3Storage = { uploadImage, deleteImage, getImageBuffer };
