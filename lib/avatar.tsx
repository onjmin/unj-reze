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

export function getAvatarInfo(userId: string | null | undefined) {
  if (!userId) {
    return {
      style: { backgroundColor: '#4b5563' },
      Icon: User,
      username: '名無し???'
    };
  }

  // IDの3文字を切り出し、「名無し」＋「3文字」にする
  let idPart = '';
  if (userId.startsWith('名無し') && userId.length > 3) {
    idPart = userId.substring(3, 6);
  } else {
    idPart = userId.substring(0, 3);
  }
  if (!idPart) idPart = '???';
  const username = `名無し${idPart}`;

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
