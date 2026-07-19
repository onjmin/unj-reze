/** クライアント側で収集する生の（未ハッシュ化）デバイス信号。
 * サーバー側で重み付け評価できるよう、単一ハッシュにせず構造化 JSON のまま送信する。 */
export interface FingerprintSignals {
  canvas: string; // 固定サイズ canvas の toDataURL()
  webglVendor: string | null;
  webglRenderer: string | null;
  hardwareConcurrency: number | null;
  deviceMemory: number | null;
  screen: {
    width: number;
    height: number;
    colorDepth: number;
    pixelRatio: number;
  };
  timezone: string | null;
  language: string | null;
  languages: string[];
  platform: string | null;
}

export interface VerifyRequestBody {
  turnstileToken: string | null;
  fingerprint: FingerprintSignals | null;
  /** 呼び出し元が識別しやすいようにするための任意ラベル（例: "post.create"） */
  action?: string;
}

export interface ScoreResult {
  /** 0(安全)〜100(ほぼ確実にボット/不正) */
  score: number;
  blocked: boolean;
  rateLimited: boolean;
  reasons: string[];
  fingerprintHash: string;
}
