import {
  Gamepad2, Sword, Shield, Crown, Gem, Rocket, Flame, Droplet, Zap, Sparkles,
  Ghost, Skull, Cat, Dog, Apple, Heart, Star, Compass, Trophy, Key,
  Music, Coins, Hammer, Wrench, Gift, Map, Flag, Bomb, Lightbulb, User
} from 'lucide-react';

const AVATAR_ICONS = [
  Gamepad2, Sword, Shield, Crown, Gem, Rocket, Flame, Droplet, Zap, Sparkles,
  Ghost, Skull, Cat, Dog, Apple, Heart, Star, Compass, Trophy, Key,
  Music, Coins, Hammer, Wrench, Gift, Map, Flag, Bomb, Lightbulb, User
];

/** 掲示板モードで出す「ID」表記。
 *  表示名（例: 名無しvFZ）の末尾英数字＝slug が本来のIDなので、
 *  先頭3文字を切り出すと全員 "名無し" になってしまう。slug があればそれを使う。 */
export function getUserIdLabel(displayName: string | null | undefined, slug?: string | null): string {
  if (slug) return slug;
  const match = displayName?.match(/[a-zA-Z0-9]+$/);
  return match ? match[0] : (displayName || '???');
}

export function getAvatarInfo(userId: string | null | undefined) {
  if (!userId) {
    return {
      style: { backgroundColor: '#4b5563' },
      Icon: User,
      username: '名無し???'
    };
  }

  let username = '';
  const isGenerated = /^[a-zA-Z0-9]{15}$/.test(userId);
  if (isGenerated) {
    const idPart = userId.substring(0, 3) || '???';
    username = `名無し${idPart}`;
  } else {
    username = userId;
  }

  // Simple string hashing
  let hash = 0;
  for (let i = 0; i < userId.length; i++) {
    hash = (hash * 31 + userId.charCodeAt(i)) | 0;
  }
  const absHash = Math.abs(hash);

  // Generate dynamic color using HSL to ensure they look beautiful and vibrant
  const hue = absHash % 360;
  const style = {
    backgroundColor: `hsl(${hue}, 60%, 40%)`
  };

  const Icon = AVATAR_ICONS[absHash % AVATAR_ICONS.length];

  return {
    style,
    Icon,
    username
  };
}
