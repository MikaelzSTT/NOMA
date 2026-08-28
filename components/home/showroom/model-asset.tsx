"use client";

import { Gltf, useGLTF } from "@react-three/drei";
import type { ComponentProps } from "react";

type ShowroomModelProps = Omit<ComponentProps<typeof Gltf>, "src" | "useDraco" | "useMeshOpt"> & {
  src: string;
  dracoDecoderPath?: string;
};

/**
 * Shared GLB boundary for Blender-authored replacements.
 * Meshopt works without an extra public decoder; Draco stays opt-in so the
 * scene never depends on a third-party decoder/CDN.
 */
export function ShowroomModel({ src, dracoDecoderPath, ...props }: ShowroomModelProps) {
  return (
    <Gltf
      src={src}
      useDraco={dracoDecoderPath ?? false}
      useMeshOpt
      castShadow
      receiveShadow
      {...props}
    />
  );
}

export function preloadShowroomModel(src: string, dracoDecoderPath?: string) {
  useGLTF.preload(src, dracoDecoderPath ?? false, true);
}

