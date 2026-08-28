"use client";

import {
  createContext,
  type ReactNode,
  useContext,
  useEffect,
  useMemo,
} from "react";
import {
  DataTexture,
  DoubleSide,
  LinearFilter,
  LinearMipmapLinearFilter,
  RepeatWrapping,
  RGBAFormat,
  SRGBColorSpace,
  UnsignedByteType,
  Vector2,
  type Texture,
} from "three";

export type SurfaceKind =
  | "fabric"
  | "wood"
  | "stone"
  | "plaster"
  | "floor"
  | "rug"
  | "metal"
  | "glass";

type TextureSet = {
  map: Texture;
  normalMap: Texture;
  roughnessMap: Texture;
};

type SurfaceLibrary = Record<Exclude<SurfaceKind, "glass">, TextureSet>;

type SurfaceMaterialProps = {
  surface: SurfaceKind;
  color: string;
  roughness?: number;
  metalness?: number;
  envMapIntensity?: number;
};

const SurfaceContext = createContext<SurfaceLibrary | null>(null);

const fract = (value: number) => value - Math.floor(value);

function random2d(x: number, y: number, seed: number) {
  return fract(Math.sin(x * 12.9898 + y * 78.233 + seed * 37.719) * 43758.5453);
}

function valueNoise(x: number, y: number, seed: number) {
  const x0 = Math.floor(x);
  const y0 = Math.floor(y);
  const tx = x - x0;
  const ty = y - y0;
  const sx = tx * tx * (3 - 2 * tx);
  const sy = ty * ty * (3 - 2 * ty);
  const top = random2d(x0, y0, seed) * (1 - sx) + random2d(x0 + 1, y0, seed) * sx;
  const bottom = random2d(x0, y0 + 1, seed) * (1 - sx) + random2d(x0 + 1, y0 + 1, seed) * sx;
  return top * (1 - sy) + bottom * sy;
}

function layeredNoise(x: number, y: number, seed: number) {
  return (
    valueNoise(x, y, seed) * 0.58 +
    valueNoise(x * 2.07, y * 2.07, seed + 1) * 0.29 +
    valueNoise(x * 4.13, y * 4.13, seed + 2) * 0.13
  );
}

function createTexture(
  size: number,
  pixel: (x: number, y: number) => [number, number, number],
  colorTexture = false,
  repeat: [number, number] = [1, 1],
) {
  const data = new Uint8Array(size * size * 4);

  for (let y = 0; y < size; y += 1) {
    for (let x = 0; x < size; x += 1) {
      const index = (y * size + x) * 4;
      const [red, green, blue] = pixel(x, y);
      data[index] = Math.max(0, Math.min(255, Math.round(red)));
      data[index + 1] = Math.max(0, Math.min(255, Math.round(green)));
      data[index + 2] = Math.max(0, Math.min(255, Math.round(blue)));
      data[index + 3] = 255;
    }
  }

  const texture = new DataTexture(data, size, size, RGBAFormat, UnsignedByteType);
  texture.wrapS = RepeatWrapping;
  texture.wrapT = RepeatWrapping;
  texture.repeat.set(...repeat);
  texture.magFilter = LinearFilter;
  texture.minFilter = LinearMipmapLinearFilter;
  texture.generateMipmaps = true;
  texture.anisotropy = 8;
  if (colorTexture) texture.colorSpace = SRGBColorSpace;
  texture.needsUpdate = true;
  return texture;
}

function createNormalTexture(
  size: number,
  heightAt: (x: number, y: number) => number,
  strength: number,
  repeat: [number, number],
) {
  return createTexture(size, (x, y) => {
    const left = heightAt((x - 1 + size) % size, y);
    const right = heightAt((x + 1) % size, y);
    const down = heightAt(x, (y - 1 + size) % size);
    const up = heightAt(x, (y + 1) % size);
    const dx = (left - right) * strength;
    const dy = (down - up) * strength;
    const length = Math.sqrt(dx * dx + dy * dy + 1);
    return [128 + (dx / length) * 127, 128 + (dy / length) * 127, 128 + (1 / length) * 127];
  }, false, repeat);
}

function createFabricSet(): TextureSet {
  const size = 256;
  const repeat: [number, number] = [7, 7];
  const height = (x: number, y: number) => {
    const warp = Math.sin((x / size) * Math.PI * 96) * 0.36;
    const weft = Math.sin((y / size) * Math.PI * 88) * 0.31;
    const slub = (layeredNoise(x * 0.045, y * 0.045, 4) - 0.5) * 0.42;
    return warp + weft + slub + (random2d(x, y, 7) - 0.5) * 0.1;
  };

  return {
    map: createTexture(size, (x, y) => {
      const broad = (layeredNoise(x * 0.022, y * 0.022, 8) - 0.5) * 5.5;
      const variation = height(x, y) * 1.15 + broad;
      return [246 + variation, 245 + variation, 242 + variation];
    }, true, repeat),
    normalMap: createNormalTexture(size, height, 1.5, repeat),
    roughnessMap: createTexture(size, (x, y) => {
      const value = 222 + height(x, y) * 5 + (layeredNoise(x * 0.035, y * 0.035, 12) - 0.5) * 9;
      return [value, value, value];
    }, false, repeat),
  };
}

function createWoodSet(): TextureSet {
  const size = 256;
  const repeat: [number, number] = [3.5, 6];
  const height = (x: number, y: number) => {
    const drift = Math.sin(y * 0.025) * 7 + Math.sin(y * 0.009) * 12;
    const organic = (layeredNoise(x * 0.022, y * 0.011, 13) - 0.5) * 22;
    const longGrain = Math.sin((x + drift + organic) * 0.17) * 0.24;
    const brokenGrain = Math.sin((x * 0.43 + drift * 0.22 + organic * 0.7)) * 0.09;
    const fineGrain = Math.sin((x + drift * 0.4 + organic) * 0.72) * 0.075;
    const knotDistance = Math.hypot(x - 178, (y - 92) * 0.35);
    const knot = Math.sin(knotDistance * 0.28) * Math.max(0, 1 - knotDistance / 55) * 0.22;
    return longGrain + brokenGrain + fineGrain + knot + (random2d(x, y, 16) - 0.5) * 0.06;
  };

  return {
    map: createTexture(size, (x, y) => {
      const grain = height(x, y);
      const boardVariation = (layeredNoise(x * 0.012, y * 0.008, 17) - 0.5) * 8;
      return [220 + grain * 11 + boardVariation, 207 + grain * 10 + boardVariation, 194 + grain * 8 + boardVariation];
    }, true, repeat),
    normalMap: createNormalTexture(size, height, 0.72, repeat),
    roughnessMap: createTexture(size, (x, y) => {
      const value = 166 + height(x, y) * 24 + (layeredNoise(x * 0.025, y * 0.016, 19) - 0.5) * 18;
      return [value, value, value];
    }, false, repeat),
  };
}

function createStoneSet(): TextureSet {
  const size = 256;
  const repeat: [number, number] = [2.5, 2.5];
  const height = (x: number, y: number) => {
    const sediment = Math.sin(y * 0.095 + Math.sin(x * 0.014) * 1.7) * 0.13;
    const pores = Math.pow(Math.max(0, random2d(x, y, 22) - 0.89), 2) * -8;
    return sediment + pores + (layeredNoise(x * 0.035, y * 0.035, 21) - 0.5) * 0.2;
  };

  return {
    map: createTexture(size, (x, y) => {
      const grain = height(x, y);
      const stratum = Math.sin(y * 0.065 + Math.sin(x * 0.018)) * 2.8;
      return [240 + grain * 19 + stratum, 236 + grain * 17 + stratum, 226 + grain * 14 + stratum];
    }, true, repeat),
    normalMap: createNormalTexture(size, height, 0.82, repeat),
    roughnessMap: createTexture(size, (x, y) => {
      const value = 156 - height(x, y) * 22 + (layeredNoise(x * 0.035, y * 0.035, 24) - 0.5) * 15;
      return [value, value, value];
    }, false, repeat),
  };
}

function createPlasterSet(): TextureSet {
  const size = 256;
  const repeat: [number, number] = [8, 8];
  const height = (x: number, y: number) =>
    (layeredNoise(x * 0.08, y * 0.08, 31) - 0.5) * 0.42 +
    (random2d(x, y, 34) - 0.5) * 0.11;

  return {
    map: createTexture(size, (x, y) => {
      const grain = height(x, y) * 9;
      return [244 + grain, 242 + grain, 237 + grain];
    }, true, repeat),
    normalMap: createNormalTexture(size, height, 0.62, repeat),
    roughnessMap: createTexture(size, (x, y) => {
      const value = 224 + height(x, y) * 14;
      return [value, value, value];
    }, false, repeat),
  };
}

function createFloorSet(): TextureSet {
  const size = 256;
  const repeat: [number, number] = [8, 22];
  const height = (x: number, y: number) => {
    const edgeDistance = Math.min(x, y, size - 1 - x, size - 1 - y);
    const joint = Math.max(0, 1 - edgeDistance / 2.2);
    const aggregate = (layeredNoise(x * 0.055, y * 0.055, 40) - 0.5) * 0.3;
    return aggregate - joint * 0.48;
  };

  return {
    map: createTexture(size, (x, y) => {
      const edgeDistance = Math.min(x, y, size - 1 - x, size - 1 - y);
      const joint = Math.max(0, 1 - edgeDistance / 2.1);
      const cloud = (layeredNoise(x * 0.027, y * 0.027, 43) - 0.5) * 9;
      return [232 + cloud - joint * 23, 229 + cloud - joint * 22, 222 + cloud - joint * 19];
    }, true, repeat),
    normalMap: createNormalTexture(size, height, 0.7, repeat),
    roughnessMap: createTexture(size, (x, y) => {
      const edgeDistance = Math.min(x, y, size - 1 - x, size - 1 - y);
      const joint = Math.max(0, 1 - edgeDistance / 2.1);
      const value = 191 + joint * 35 + (layeredNoise(x * 0.04, y * 0.04, 46) - 0.5) * 13;
      return [value, value, value];
    }, false, repeat),
  };
}

function createRugSet(): TextureSet {
  const size = 256;
  const repeat: [number, number] = [9, 9];
  const height = (x: number, y: number) => {
    const tuft = random2d(x * 3, y * 3, 48) - 0.5;
    const weave = Math.sin(x * 1.4) * Math.sin(y * 1.25) * 0.18;
    return tuft * 0.72 + weave;
  };

  return {
    map: createTexture(size, (x, y) => {
      const variation = height(x, y) * 2.4;
      return [239 + variation, 236 + variation, 228 + variation];
    }, true, repeat),
    normalMap: createNormalTexture(size, height, 1.7, repeat),
    roughnessMap: createTexture(size, (x, y) => {
      const value = 236 + height(x, y) * 8;
      return [value, value, value];
    }, false, repeat),
  };
}

function createMetalSet(): TextureSet {
  const size = 128;
  const repeat: [number, number] = [2, 10];
  const height = (x: number, y: number) =>
    Math.sin(x * 1.9) * 0.12 +
    Math.sin(x * 0.47) * 0.06 +
    (random2d(x, y, 57) - 0.5) * 0.055;

  return {
    map: createTexture(size, (x, y) => {
      const brushing = height(x, y) * 12;
      return [245 + brushing, 244 + brushing, 241 + brushing];
    }, true, repeat),
    normalMap: createNormalTexture(size, height, 0.5, repeat),
    roughnessMap: createTexture(size, (x, y) => {
      const value = 174 + height(x, y) * 32 + (layeredNoise(x * 0.08, y * 0.02, 60) - 0.5) * 13;
      return [value, value, value];
    }, false, repeat),
  };
}

function useSurfaceLibrary() {
  const surfaces = useMemo<SurfaceLibrary>(
    () => ({
      fabric: createFabricSet(),
      wood: createWoodSet(),
      stone: createStoneSet(),
      plaster: createPlasterSet(),
      floor: createFloorSet(),
      rug: createRugSet(),
      metal: createMetalSet(),
    }),
    [],
  );

  useEffect(
    () => () => {
      Object.values(surfaces).forEach((surface) => {
        surface.map.dispose();
        surface.normalMap.dispose();
        surface.roughnessMap.dispose();
      });
    },
    [surfaces],
  );

  return surfaces;
}

export function SurfaceMaterialLibrary({ children }: { children: ReactNode }) {
  const surfaces = useSurfaceLibrary();
  return <SurfaceContext.Provider value={surfaces}>{children}</SurfaceContext.Provider>;
}

const normalScale: Record<Exclude<SurfaceKind, "glass">, Vector2> = {
  fabric: new Vector2(0.16, 0.16),
  wood: new Vector2(0.075, 0.075),
  stone: new Vector2(0.11, 0.11),
  plaster: new Vector2(0.065, 0.065),
  floor: new Vector2(0.085, 0.085),
  rug: new Vector2(0.22, 0.22),
  metal: new Vector2(0.075, 0.075),
};

const defaultRoughness: Record<SurfaceKind, number> = {
  fabric: 0.88,
  wood: 0.62,
  stone: 0.48,
  plaster: 0.9,
  floor: 0.68,
  rug: 0.96,
  metal: 0.28,
  glass: 0.12,
};

export function SurfaceMaterial({
  surface,
  color,
  roughness = defaultRoughness[surface],
  metalness = surface === "metal" ? 0.88 : 0,
  envMapIntensity = surface === "metal" || surface === "stone" ? 1.25 : 0.7,
}: SurfaceMaterialProps) {
  const library = useContext(SurfaceContext);

  if (surface === "glass") {
    return (
      <meshPhysicalMaterial
        color={color}
        roughness={roughness}
        metalness={0}
        transmission={0.86}
        thickness={0.018}
        ior={1.5}
        specularIntensity={1}
        transparent
        opacity={1}
        depthWrite={false}
        side={DoubleSide}
        envMapIntensity={1.75}
      />
    );
  }

  if (!library) throw new Error("SurfaceMaterial must be rendered inside SurfaceMaterialLibrary");
  const textures = library[surface];

  return (
    <meshPhysicalMaterial
      color={color}
      map={textures.map}
      normalMap={textures.normalMap}
      normalScale={normalScale[surface]}
      roughness={roughness}
      roughnessMap={textures.roughnessMap}
      metalness={metalness}
      envMapIntensity={envMapIntensity}
      clearcoat={surface === "stone" ? 0.11 : surface === "wood" ? 0.035 : 0}
      clearcoatRoughness={surface === "stone" ? 0.3 : 0.5}
      sheen={surface === "fabric" ? 0.14 : 0}
      sheenColor={surface === "fabric" ? color : "#000000"}
      sheenRoughness={0.88}
      anisotropy={surface === "metal" ? 0.55 : 0}
      anisotropyRotation={Math.PI / 2}
    />
  );
}
