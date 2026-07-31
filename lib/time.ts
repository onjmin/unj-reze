export function formatRelativeTime(isoString: string): string {
  const now = Date.now();
  const date = new Date(isoString).getTime();
  if (isNaN(date)) return isoString;
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

export interface ThreadActivityTime {
  iso: string;
  time: string;
  isReplyUpdate: boolean;
}

export function getThreadDisplayTime(post: { createdAt: string; time: string; replies?: { createdAt: string; time: string }[] }): ThreadActivityTime {
  let latestMs = post.createdAt ? new Date(post.createdAt).getTime() : 0;
  let latestIso = post.createdAt;
  let latestTime = post.time;
  let isReplyUpdate = false;

  if (post.replies && post.replies.length > 0) {
    for (const r of post.replies) {
      const rMs = r.createdAt ? new Date(r.createdAt).getTime() : 0;
      if (!isNaN(rMs) && rMs > latestMs) {
        latestMs = rMs;
        latestIso = r.createdAt;
        latestTime = r.time || (r.createdAt ? formatRelativeTime(r.createdAt) : post.time);
        isReplyUpdate = true;
      }
    }
  }

  let displayTime = latestTime;
  if (latestIso) {
    const parsed = new Date(latestIso).getTime();
    if (!isNaN(parsed)) {
      displayTime = formatRelativeTime(latestIso);
    }
  }

  return {
    iso: latestIso || post.createdAt,
    time: displayTime,
    isReplyUpdate,
  };
}

