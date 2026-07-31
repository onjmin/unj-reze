/**
 * 初回DMの制限。ログイン不要のSNSなので、DMは「見知らぬ相手へ大量に投げる」導線になりやすい。
 * 相手から1通でも返信が来るまでは
 *   - 送れるのは1通だけ
 *   - URL / 画像 / 音声などのメディア参照は送れない
 * とし、返信＝受信側の同意があった時点で解放する。
 * サーバ(app/api/messages)とクライアント(DmThreadView)で同じ判定を使うためここに置く。
 */

export interface DmGate {
  /** 自分がこの相手へ送った通数 */
  sent: number;
  /** 相手から届いた通数 */
  received: number;
}

export const FIRST_DM_NOTICE =
  '初回送れるのは1通まで。相手から返信があるまでURL・画像・音声などのメディアは送れません。';

/** 相手が一度でも返信していれば通常のDMとして扱う。 */
export function isDmOpen(gate: DmGate): boolean {
  return gate.received > 0;
}

/** いま送信できるか（返信待ちの1通目を使い切っていないか）。 */
export function canSendDm(gate: DmGate): boolean {
  return isDmOpen(gate) || gate.sent === 0;
}

/**
 * 初回DMで禁止されるメディア参照。
 * 本文は現状テキストのみなので、URL と data URI（画像/音声の直貼り）を弾く。
 */
const MEDIA_REF = /(https?:\/\/|www\.[^\s]|data:(image|audio|video)\/|<img\b|\[mml\]|\[chord\])/i;

export function containsMediaRef(text: string): boolean {
  return MEDIA_REF.test(text);
}

/** 送信を弾く理由。null なら送信可。 */
export function rejectDmReason(gate: DmGate, text: string): string | null {
  if (!canSendDm(gate)) {
    return '相手から返信があるまで、送れるのは1通までです';
  }
  if (!isDmOpen(gate) && containsMediaRef(text)) {
    return '初回のメッセージにURL・画像・音声などのメディアは含められません';
  }
  return null;
}
