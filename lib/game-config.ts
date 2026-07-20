export type Genre = 'rpg' | 'platformer' | 'bullet-hell';

export interface SceneTile {
  type: number;
  meta?: Record<string, unknown>;
}

export interface SceneData {
  cols: number;
  rows: number;
  tileSize: number;
  tiles: number[][];
  playerStart: { col: number; row: number };
  npcs?: NpcDef[];
  objects?: ObjectDef[];
  winCondition?: WinCondition;
}

export interface NpcDef {
  id: string;
  col: number;
  row: number;
  sprite?: string;
  color: string;
  script?: string;
}

export interface ObjectDef {
  id: string;
  col: number;
  row: number;
  type: 'item' | 'door' | 'enemy_spawn' | 'bullet_spawner';
  meta?: Record<string, unknown>;
}

export interface WinCondition {
  type: 'collect_all' | 'reach_point' | 'survive_time';
  targetId?: string;
  col?: number;
  row?: number;
  duration?: number;
}

export interface BgmAsset {
  type: 'midi' | 'mml' | 'youtube' | 'nicovideo' | 'soundcloud' | 'direct';
  src: string;
  loop?: boolean | {
    start?: {
      bar?: number;
      step?: number;
      seconds?: number;
    };
    end?: {
      bar?: number;
      step?: number;
      seconds?: number;
    };
  };
}

export interface SpriteMap {
  [name: string]: string;
}

export interface Tileset {
  [tileType: number]: { color: string; label?: string };
}

export interface AssetManifest {
  bgm?: BgmAsset;
  tileset: Tileset;
  sprites?: SpriteMap;
}

export interface GameManifest {
  id: string;
  name: string;
  genre: Genre;
  scene: SceneData;
  assets: AssetManifest;
}
