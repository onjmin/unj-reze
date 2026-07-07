export function getAvatarInfo(userId: string | null | undefined) {
  if (!userId) {
    return {
      style: { background: 'linear-gradient(135deg, #4b5563 0%, #1f2937 100%)' },
      emoji: '👤',
      username: '名無'
    };
  }

  // Handle legacy names (like '名無しvFZ') or custom edited names
  let username = userId;
  if (userId.startsWith('名無し') && userId.length > 3) {
    username = userId.slice(3);
  } else {
    username = userId.substring(0, 3);
  }
  if (!username) username = '名無';

  // Simple string hashing
  let hash = 0;
  for (let i = 0; i < userId.length; i++) {
    hash = (hash * 31 + userId.charCodeAt(i)) | 0;
  }
  const absHash = Math.abs(hash);

  // Generate dynamic gradient using HSL to ensure they look beautiful and vibrant
  const h1 = absHash % 360;
  const h2 = (h1 + 60 + (absHash % 40)) % 360; // 60 to 100 degree color wheel offset
  const style = {
    background: `linear-gradient(135deg, hsl(${h1}, 75%, 55%) 0%, hsl(${h2}, 80%, 42%) 100%)`
  };

  // List of retro/game themed emojis for "絵柄"
  const emojis = [
    '👾', '🎮', '🕹️', '⚔️', '🛡️', '👑', '💎', '🧪', '🚀', '🛸',
    '👽', '🤖', '🌟', '🔥', '💧', '⚡', '🌀', '🍄', '🍎', '🍖',
    '🦖', '🐉', '👻', '💀', '🐱', '🦊', '🐸', '🐨', '🐼', '🦄'
  ];
  const emoji = emojis[absHash % emojis.length];

  return {
    style,
    emoji,
    username
  };
}
