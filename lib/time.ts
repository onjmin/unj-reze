export function formatRelativeTime(isoString: string): string {
  const now = Date.now();
  const date = new Date(isoString).getTime();
  const diffMs = now - date;

  const diffSec = Math.floor(diffMs / 1000);
  if (diffSec < 60) return 'たった今';

  const diffMin = Math.floor(diffSec / 60);
  if (diffMin < 60) return `${diffMin}分前`;

  const diffHour = Math.floor(diffMin / 60);
  if (diffHour < 24) return `${diffHour}時間前`;

  const diffDay = Math.floor(diffHour / 24);
  if (diffDay < 7) return `${diffDay}日前`;

  const d = new Date(isoString);
  return `${d.getMonth() + 1}月${d.getDate()}日`;
}

export function nowISO(): string {
  return new Date().toISOString();
}
