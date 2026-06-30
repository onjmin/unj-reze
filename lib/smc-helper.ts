// Shared utilities for loading SMC assets from zynq-platform/super-mario-construct repository CDN

export function resolveSMCUrl(image: string): string {
  // Normalize to png if it ends with webp (since the repo zynq-platform/super-mario-construct hosts PNG files)
  const normalized = image.replace(/\.webp$/, '.png');
  return `https://cdn.jsdelivr.net/gh/zynq-platform/super-mario-construct@main/${normalized}`;
}

export function extractSmcMetadata(dataJson: any): any {
  const proj = dataJson.project;
  if (!proj || !Array.isArray(proj[3])) return null;
  const objectTypes = proj[3];
  const results: any = {};
  for (const obj of objectTypes) {
    const name = obj[0];
    const isFamily = obj[2];
    if (isFamily) continue;

    let animsField = null;
    for (const field of obj) {
      if (Array.isArray(field) && field.length > 0 && Array.isArray(field[0]) && typeof field[0][0] === 'string' && Array.isArray(field[0][7])) {
        animsField = field;
        break;
      }
    }
    if (!animsField) continue;

    results[name] = {
      name: name,
      animations: {}
    };

    for (const anim of animsField) {
      const animName = anim[0];
      const speed = anim[1];
      const loop = anim[2];
      const repeatCount = anim[3];
      const repeatTo = anim[4];
      const pingPong = anim[5];
      const frames = anim[7];

      results[name].animations[animName] = {
        name: animName,
        speed: speed,
        loop: loop,
        repeatCount: repeatCount,
        repeatTo: repeatTo,
        pingPong: pingPong,
        frames: frames.map((f: any) => {
          const imagePath = f[0].replace(/\.webp$/, '.png');
          return {
            image: imagePath,
            x: f[2],
            y: f[3],
            w: f[4],
            h: f[5],
            mirrored: f[6],
            duration: f[7],
            originX: f[8],
            originY: f[9],
            imagePoints: f[10] ? f[10].map((ip: any) => ({ name: ip[0], x: ip[1], y: ip[2] })) : [],
            collisionPoly: f[11] || []
          };
        })
      };
    }
  }

  // --- Compatibility Shim (Older Construct 3 Version on GitHub to Newer Version Mapping) ---
  
  // 1. Alias Mario to PlayerSprite
  if (results['Mario']) {
    results['PlayerSprite'] = {
      name: 'PlayerSprite',
      animations: {}
    };
    for (const [animName, anim] of Object.entries(results['Mario'].animations)) {
      if (animName.startsWith('0Idle')) {
        results['PlayerSprite'].animations['2Idle0_3'] = anim;
        results['PlayerSprite'].animations['2Idle0_0'] = anim;
        results['PlayerSprite'].animations['2Idle0_1'] = anim;
      } else if (animName.startsWith('0Walk')) {
        results['PlayerSprite'].animations['2Walk0_3'] = anim;
        results['PlayerSprite'].animations['2Walk0_0'] = anim;
        results['PlayerSprite'].animations['2Walk0_1'] = anim;
      } else if (animName.startsWith('0Jump')) {
        results['PlayerSprite'].animations['2Jump0_3'] = anim;
        results['PlayerSprite'].animations['2Jump0_0'] = anim;
        results['PlayerSprite'].animations['2Jump0_1'] = anim;
      } else {
        results['PlayerSprite'].animations[animName] = anim;
      }
    }
  }

  // 2. Alias Toad to NPC
  if (results['Toad']) {
    results['NPC'] = {
      name: 'NPC',
      animations: {}
    };
    for (const [animName, anim] of Object.entries(results['Toad'].animations)) {
      if (animName === '0Idle') {
        results['NPC'].animations['1NPC0'] = anim;
        results['NPC'].animations['1NPC0_Walk'] = anim;
      } else if (animName === '1Idle') {
        results['NPC'].animations['1NPC1'] = anim;
        results['NPC'].animations['1NPC1_Walk'] = anim;
      }
    }
  }

  // 3. Alias BobOmb to Bobomb
  if (results['BobOmb']) {
    results['Bobomb'] = results['BobOmb'];
  }

  return results;
}

let metadataPromise: Promise<any> | null = null;

export function getSmcMetadata(): Promise<any> {
  if (!metadataPromise) {
    metadataPromise = fetch('https://cdn.jsdelivr.net/gh/zynq-platform/super-mario-construct@main/data.json')
      .then(res => res.json())
      .then(data => {
        const extracted = extractSmcMetadata(data);
        return extracted;
      })
      .catch(e => {
        metadataPromise = null; // reset cache on failure
        console.error("Failed to load or parse SMC data.json from GitHub CDN:", e);
        throw e;
      });
  }
  return metadataPromise;
}
