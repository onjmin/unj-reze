'use client';

import { useEffect, useMemo, useRef } from 'react';
import { parseWalkRef } from '@/lib/asset-ref';
import { loadImage, resolveSpriteRect } from '@/lib/walk-sprite';

/** 素材参照のサムネイル。walk: 参照は正面1コマ目を切り出し、url:#fragment はクロップ矩形を表示する。
 *  使用履歴（ContentPicker）とマイシートの単体素材（UserSheetPanel）で共有する。 */
export default function AssetThumb({ refStr, url, size = 48 }: { refStr: string; url?: string; size?: number }) {
  const cvRef = useRef<HTMLCanvasElement>(null);
  const walk = useMemo(() => parseWalkRef(refStr), [refStr]);
  const imgUrl = url ?? (walk?.source.kind === 'url' ? walk.source.url : undefined);

  useEffect(() => {
    const cv = cvRef.current;
    if (!cv || !imgUrl) return;
    const ctx = cv.getContext('2d');
    if (!ctx) return;

    if (walk && walk.source.kind === 'url') {
      let cancelled = false;
      loadImage(imgUrl).then(img => {
        if (cancelled || !ctx) return;
        const { sx, sy, sw, sh } = resolveSpriteRect(walk, img.naturalWidth, img.naturalHeight, imgUrl);
        ctx.clearRect(0, 0, size, size);
        const zoom = Math.min(size / sw, size / sh);
        ctx.imageSmoothingEnabled = false;
        ctx.drawImage(img, sx, sy, sw, sh, (size - sw * zoom) / 2, (size - sh * zoom) / 2, sw * zoom, sh * zoom);
      });
      return () => { cancelled = true; };
    }

    // url:#fragment → フラグメントでクロップ（walk なし）
    if (!walk) {
      const hashIdx = imgUrl.indexOf('#');
      if (hashIdx !== -1) {
        const parts = imgUrl.slice(hashIdx + 1).split(',').map(Number);
        if (parts.length >= 4 && parts.slice(0, 4).every(n => !isNaN(n))) {
          const [fsx, fsy, fsw, fsh] = parts;
          const baseUrl = imgUrl.slice(0, hashIdx);
          let cancelled = false;
          loadImage(baseUrl).then(img => {
            if (cancelled || !ctx) return;
            const rect = resolveSpriteRect(null, img.naturalWidth, img.naturalHeight, imgUrl);
            ctx.clearRect(0, 0, size, size);
            const zoom = Math.min(size / fsw, size / fsh);
            ctx.imageSmoothingEnabled = false;
            ctx.drawImage(img, rect.sx, rect.sy, rect.sw, rect.sh, (size - rect.sw * zoom) / 2, (size - rect.sh * zoom) / 2, rect.sw * zoom, rect.sh * zoom);
          });
          return () => { cancelled = true; };
        }
      }
    }
  }, [imgUrl, walk?.crop?.[0], walk?.crop?.[1], walk?.crop?.[2], walk?.crop?.[3], walk?.stdId, walk?.frames, size]);

  if (!walk && !(url && url.includes('#'))) {
    return url
      ?   <img src={url} alt="" className="w-full h-full object-cover" />
      : <div className="w-full h-full flex items-center justify-center text-gray-600 text-[10px]">?</div>;
  }

  return (
    <canvas
      ref={cvRef}
      width={size}
      height={size}
      className="w-full h-full"
      style={{ imageRendering: 'pixelated' }}
    />
  );
}
