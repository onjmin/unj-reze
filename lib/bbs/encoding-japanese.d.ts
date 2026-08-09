declare module "encoding-japanese" {
	type Encoding =
		| "UNICODE"
		| "SJIS"
		| "UTF8"
		| "UTF16"
		| "UTF32"
		| "JIS"
		| "EUCJP"
		| "AUTO";

	interface ConvertOptions {
		to: Encoding;
		from?: Encoding;
	}

	const Encoding: {
		stringToCode(str: string): number[];
		codeToString(code: number[]): string;
		convert(data: number[] | Uint8Array, options: ConvertOptions): number[];
	};

	export default Encoding;
}
