"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { Canvas, useFrame } from "@react-three/fiber";
import {
  AdaptiveDpr,
  BakeShadows,
  ContactShadows,
  Environment,
  Lightformer,
  RoundedBox,
} from "@react-three/drei";
import {
  ACESFilmicToneMapping,
  CatmullRomCurve3,
  Color,
  Group,
  MathUtils,
  Object3D,
  PerspectiveCamera,
  PointLight,
  SRGBColorSpace,
  Vector3,
} from "three";
import {
  SurfaceMaterial,
  SurfaceMaterialLibrary,
  type SurfaceKind,
} from "./showroom/surface-materials";

type ShowroomSceneProps = {
  active?: boolean;
  compact: boolean;
  activeRoom: number;
  progress: { current: number };
  reducedMotion?: boolean;
  onReady: () => void;
};

type VectorTuple = [number, number, number];

type BeveledBoxProps = {
  size: VectorTuple;
  position?: VectorTuple;
  rotation?: VectorTuple;
  radius?: number;
  surface: SurfaceKind;
  color: string;
  roughness?: number;
  metalness?: number;
  castShadow?: boolean;
  receiveShadow?: boolean;
};

type SoftPillowProps = {
  position: VectorTuple;
  rotation?: VectorTuple;
  scale: VectorTuple;
  color: string;
};

const palette = {
  plaster: "#c8c0b4",
  warmWhite: "#ded8ce",
  walnut: "#6a4938",
  darkWalnut: "#35271f",
  linen: "#b1a99c",
  lightLinen: "#d7d0c5",
  olive: "#66705d",
  charcoal: "#292b27",
  travertine: "#d5c6ac",
  brass: "#8b6848",
};

const clamp = (value: number) => Math.min(1, Math.max(0, value));

function smootherstep(value: number) {
  const point = clamp(value);
  return point * point * point * (point * (point * 6 - 15) + 10);
}

function directedProgress(value: number) {
  if (value < 0.36) return smootherstep(value / 0.36) * 0.36;
  if (value < 0.7) return 0.36 + smootherstep((value - 0.36) / 0.34) * 0.34;
  return 0.7 + smootherstep((value - 0.7) / 0.3) * 0.3;
}

function BeveledBox({
  size,
  position,
  rotation,
  radius = 0.07,
  surface,
  color,
  roughness,
  metalness,
  castShadow = true,
  receiveShadow = true,
}: BeveledBoxProps) {
  return (
    <RoundedBox
      args={size}
      radius={Math.min(radius, Math.min(...size) / 2 - 0.005)}
      smoothness={3}
      position={position}
      rotation={rotation}
      castShadow={castShadow}
      receiveShadow={receiveShadow}
    >
      <SurfaceMaterial
        surface={surface}
        color={color}
        roughness={roughness}
        metalness={metalness}
      />
    </RoundedBox>
  );
}

function SoftPillow({ position, rotation = [0, 0, 0], scale, color }: SoftPillowProps) {
  return (
    <group position={position} rotation={rotation} scale={scale}>
      <mesh castShadow receiveShadow>
        <sphereGeometry args={[0.92, 24, 16]} />
        <SurfaceMaterial surface="fabric" color={color} />
      </mesh>
      <mesh position={[0, 0, 0.575]} castShadow>
        <torusGeometry args={[0.79, 0.009, 6, 48]} />
        <meshStandardMaterial color={color} roughness={0.96} />
      </mesh>
    </group>
  );
}

function UpholsteryPiping({
  position,
  length,
  color,
  rotation = [0, 0, Math.PI / 2],
}: {
  position: VectorTuple;
  length: number;
  color: string;
  rotation?: VectorTuple;
}) {
  return (
    <mesh position={position} rotation={rotation} castShadow>
      <capsuleGeometry args={[0.018, length, 4, 8]} />
      <meshStandardMaterial color={color} roughness={0.94} />
    </mesh>
  );
}

function CameraRig({
  progress,
  compact,
  reducedMotion = false,
}: Pick<ShowroomSceneProps, "progress" | "compact" | "reducedMotion">) {
  const currentProgress = useRef(0);
  const lookAt = useRef(new Vector3(-1.2, 1.5, 1.5));
  const nextPosition = useRef(new Vector3());
  const nextTarget = useRef(new Vector3());

  const cameraPath = useMemo(
    () =>
      new CatmullRomCurve3(
        [
          new Vector3(compact ? 7.7 : 8.65, compact ? 3.1 : 2.95, 18),
          new Vector3(7.1, 2.72, 12.5),
          new Vector3(5.35, 2.32, 5.4),
          new Vector3(4.55, 2.14, -2.2),
          new Vector3(4, 2.06, -7.15),
          new Vector3(3.05, 2.12, -11.15),
          new Vector3(1.25, 2.16, -15.6),
          new Vector3(-1.25, 2.24, -17.35),
          new Vector3(-7.55, 2.48, -17.4),
        ],
        false,
        "centripetal",
        0.5,
      ),
    [compact],
  );

  const targetPath = useMemo(
    () =>
      new CatmullRomCurve3(
        [
          new Vector3(-1.8, 1.48, 1.6),
          new Vector3(-1.9, 1.43, 0.2),
          new Vector3(-2.2, 1.45, -4.2),
          new Vector3(-3.1, 1.43, -10.4),
          new Vector3(-3.4, 1.48, -12.8),
          new Vector3(-2.2, 1.5, -16.2),
          new Vector3(0.2, 1.55, -21.2),
          new Vector3(0.5, 1.58, -24.2),
          new Vector3(0.3, 1.62, -28.8),
        ],
        false,
        "centripetal",
        0.5,
      ),
    [],
  );

  useFrame((state, delta) => {
    const desiredProgress = reducedMotion ? 0 : directedProgress(progress.current);
    const progressDamping = 1 - Math.exp(-delta * 4.2);
    const cameraDamping = 1 - Math.exp(-delta * 5.6);
    currentProgress.current += (desiredProgress - currentProgress.current) * progressDamping;
    const point = clamp(currentProgress.current) * 0.999;

    cameraPath.getPointAt(point, nextPosition.current);
    targetPath.getPointAt(point, nextTarget.current);

    if (!reducedMotion) {
      const pointerScale = compact ? 0.08 : 0.16;
      const breathing = Math.sin(state.clock.elapsedTime * 0.22) * (compact ? 0.006 : 0.012);
      nextPosition.current.x += state.pointer.x * pointerScale;
      nextPosition.current.y += state.pointer.y * pointerScale * 0.38 + breathing;
    }

    state.camera.position.lerp(nextPosition.current, cameraDamping);
    lookAt.current.lerp(nextTarget.current, cameraDamping);
    state.camera.lookAt(lookAt.current);

    const bedroomBlend = smootherstep((point - 0.27) / 0.18);
    const kitchenBlend = smootherstep((point - 0.66) / 0.2);
    const livingExposure = compact ? 0.96 : 1;
    const desiredExposure = livingExposure - bedroomBlend * 0.065 + kitchenBlend * 0.095;
    state.gl.toneMappingExposure = MathUtils.damp(
      state.gl.toneMappingExposure,
      desiredExposure,
      2.8,
      delta,
    );

    const camera = state.camera as PerspectiveCamera;
    const baseFov = compact ? 48 : 39;
    const desiredFov = baseFov - smootherstep(point) * (compact ? 0.7 : 0.8) + kitchenBlend * 1.1;
    const fov = MathUtils.damp(camera.fov, desiredFov, 5, delta);
    if (Math.abs(fov - camera.fov) > 0.001) {
      camera.fov = fov;
      camera.updateProjectionMatrix();
    }
  });

  return null;
}

function WindowBay({ position, rotation = [0, 0, 0] }: { position: VectorTuple; rotation?: VectorTuple }) {
  return (
    <group position={position} rotation={rotation}>
      <mesh position={[0, 0, -0.028]}>
        <planeGeometry args={[2.62, 3.68]} />
        <meshBasicMaterial color="#b9cac4" toneMapped={false} />
      </mesh>
      <mesh receiveShadow>
        <planeGeometry args={[2.7, 3.75]} />
        <SurfaceMaterial surface="glass" color="#dbe7e3" roughness={0.075} />
      </mesh>
      {[-1.38, 0, 1.38].map((x) => (
        <BeveledBox key={x} size={[0.055, 3.92, 0.08]} position={[x, 0, 0.035]} radius={0.018} surface="metal" color="#393a35" />
      ))}
      {[-1.93, 1.93].map((y) => (
        <BeveledBox key={y} size={[2.82, 0.055, 0.08]} position={[0, y, 0.035]} radius={0.018} surface="metal" color="#393a35" />
      ))}
    </group>
  );
}

function ArchitecturalShell() {
  return (
    <group>
      <mesh position={[0, -0.14, -6]} receiveShadow>
        <boxGeometry args={[18, 0.28, 53]} />
        <SurfaceMaterial surface="floor" color="#a39d94" roughness={0.74} />
      </mesh>
      <mesh position={[-9, 3, -6]} receiveShadow>
        <boxGeometry args={[0.28, 6.3, 53]} />
        <SurfaceMaterial surface="plaster" color={palette.plaster} />
      </mesh>
      <mesh position={[9, 3, -6]} receiveShadow>
        <boxGeometry args={[0.28, 6.3, 53]} />
        <SurfaceMaterial surface="plaster" color="#b6aea2" />
      </mesh>
      <mesh position={[0, 6.15, -6]} receiveShadow>
        <boxGeometry args={[18.3, 0.25, 53]} />
        <SurfaceMaterial surface="plaster" color="#d0c9bf" />
      </mesh>
      <mesh position={[0, 3, -31.4]} receiveShadow>
        <boxGeometry args={[18.3, 6.3, 0.25]} />
        <SurfaceMaterial surface="plaster" color={palette.warmWhite} />
      </mesh>

      <group position={[0, 0, -6.2]}>
        <mesh position={[-4, 2.8, 0]} castShadow receiveShadow>
          <boxGeometry args={[10, 5.8, 0.32]} />
          <SurfaceMaterial surface="plaster" color="#b7afa3" />
        </mesh>
        <mesh position={[8, 2.8, 0]} castShadow receiveShadow>
          <boxGeometry args={[2, 5.8, 0.32]} />
          <SurfaceMaterial surface="plaster" color="#b7afa3" />
        </mesh>
        <mesh position={[4, 5.25, 0]} castShadow receiveShadow>
          <boxGeometry args={[6, 0.9, 0.38]} />
          <SurfaceMaterial surface="plaster" color="#b7afa3" />
        </mesh>
        {[0.88, 7.12].map((x) => (
          <BeveledBox key={x} size={[0.22, 5.02, 0.54]} position={[x, 2.44, 0.12]} radius={0.035} surface="wood" color={palette.darkWalnut} />
        ))}
      </group>

      <group position={[0, 0, -16.3]}>
        <mesh position={[-7.5, 2.8, 0]} castShadow receiveShadow>
          <boxGeometry args={[3, 5.8, 0.32]} />
          <SurfaceMaterial surface="plaster" color="#c0b8ad" />
        </mesh>
        <mesh position={[5.5, 2.8, 0]} castShadow receiveShadow>
          <boxGeometry args={[7, 5.8, 0.32]} />
          <SurfaceMaterial surface="plaster" color="#c0b8ad" />
        </mesh>
        <mesh position={[-2, 5.28, 0]} castShadow receiveShadow>
          <boxGeometry args={[8, 0.86, 0.38]} />
          <SurfaceMaterial surface="plaster" color="#c0b8ad" />
        </mesh>
        {[-5.88, 1.88].map((x) => (
          <BeveledBox key={x} size={[0.22, 5.02, 0.54]} position={[x, 2.44, 0.11]} radius={0.035} surface="wood" color={palette.darkWalnut} />
        ))}
      </group>

      {[-4.4, -1.4, 1.6].map((z) => (
        <WindowBay key={z} position={[-8.82, 3.15, z]} rotation={[0, Math.PI / 2, 0]} />
      ))}
      {[-10.2, -13.2].map((z) => (
        <WindowBay key={z} position={[8.82, 3.12, z]} rotation={[0, -Math.PI / 2, 0]} />
      ))}

      <BeveledBox size={[0.11, 0.34, 52]} position={[-8.78, 0.16, -6]} radius={0.025} surface="wood" color="#5c4437" />
      <BeveledBox size={[0.11, 0.34, 52]} position={[8.78, 0.16, -6]} radius={0.025} surface="wood" color="#5c4437" />
      <BeveledBox size={[9.72, 0.3, 0.12]} position={[-4, 0.15, -6.03]} radius={0.026} surface="wood" color="#5c4437" />
      <BeveledBox size={[1.72, 0.3, 0.12]} position={[8, 0.15, -6.03]} radius={0.026} surface="wood" color="#5c4437" />
      <BeveledBox size={[2.72, 0.3, 0.12]} position={[-7.5, 0.15, -16.27]} radius={0.026} surface="wood" color="#5c4437" />
      <BeveledBox size={[6.72, 0.3, 0.12]} position={[5.5, 0.15, -16.27]} radius={0.026} surface="wood" color="#5c4437" />
      <BeveledBox size={[17.72, 0.3, 0.12]} position={[0, 0.15, -31.22]} radius={0.026} surface="wood" color="#5c4437" />

      <BeveledBox size={[6.22, 0.18, 0.5]} position={[4, 5.15, -6.01]} radius={0.035} surface="wood" color={palette.darkWalnut} />
      <BeveledBox size={[8.02, 0.18, 0.5]} position={[-2, 5.18, -16.29]} radius={0.035} surface="wood" color={palette.darkWalnut} />
    </group>
  );
}

function Plant({ position, scale = 1, animate = false }: { position: VectorTuple; scale?: number; animate?: boolean }) {
  const crown = useRef<Group>(null);

  useFrame((state) => {
    if (!animate || !crown.current) return;
    crown.current.rotation.z = Math.sin(state.clock.elapsedTime * 0.42) * 0.012;
    crown.current.rotation.x = Math.sin(state.clock.elapsedTime * 0.31 + 1.2) * 0.008;
  });

  return (
    <group position={position} scale={scale}>
      <mesh position={[0, 0.38, 0]} castShadow receiveShadow>
        <cylinderGeometry args={[0.38, 0.29, 0.76, 28]} />
        <SurfaceMaterial surface="stone" color="#8a7767" roughness={0.72} />
      </mesh>
      <group ref={crown} position={[0, 0.72, 0]}>
        <mesh position={[0, 0.72, 0]} castShadow>
          <cylinderGeometry args={[0.035, 0.055, 1.45, 10]} />
          <meshStandardMaterial color="#3f4936" roughness={0.88} />
        </mesh>
        {[
          [0.2, 1.35, 0.05, -0.35, 0.1],
          [-0.22, 1.18, 0.08, 0.42, -0.2],
          [0.12, 0.92, 0.18, -0.55, 0.5],
          [-0.18, 0.72, -0.05, 0.62, -0.6],
          [0.03, 1.55, -0.12, 0.08, 0.9],
        ].map(([x, y, z, rz, ry], index) => (
          <mesh key={index} position={[x, y, z]} rotation={[0.18, ry, rz]} scale={[0.35, 0.78, 0.14]} castShadow>
            <sphereGeometry args={[0.72, 14, 9]} />
            <meshStandardMaterial color={index % 2 ? "#66705b" : "#56624e"} roughness={0.92} />
          </mesh>
        ))}
      </group>
    </group>
  );
}

function LivingCurtain({ compact }: { compact: boolean }) {
  const curtain = useRef<Group>(null);

  useFrame((state) => {
    if (compact || !curtain.current) return;
    curtain.current.rotation.z = Math.sin(state.clock.elapsedTime * 0.28) * 0.006;
    curtain.current.position.z = -1.45 + Math.sin(state.clock.elapsedTime * 0.36) * 0.015;
  });

  return (
    <group ref={curtain} position={[-8.57, 3.04, -1.45]}>
      {[-0.9, 0, 0.9].map((z, index) => (
        <mesh key={z} position={[0, 0, z]} rotation={[0, Math.PI / 2, 0.02 * (index - 1)]} castShadow>
          <planeGeometry args={[1.15, 5.35, 10, 1]} />
          <SurfaceMaterial surface="fabric" color="#d6cfc3" roughness={0.93} />
        </mesh>
      ))}
    </group>
  );
}

function LivingRoom({ compact }: { compact: boolean }) {
  return (
    <group>
      <mesh position={[-1.7, 0.022, 3.05]} rotation={[-Math.PI / 2, 0, -0.04]} receiveShadow>
        <planeGeometry args={[7.8, 6.5]} />
        <SurfaceMaterial surface="rug" color="#777b6d" />
      </mesh>

      <group position={[-2.45, 0, 0.65]}>
        <BeveledBox size={[6.35, 0.5, 2.28]} position={[0, 0.62, 0]} radius={0.2} surface="fabric" color="#9f978a" />
        <BeveledBox size={[5.95, 0.82, 0.32]} position={[0, 1.38, -0.94]} radius={0.13} surface="fabric" color="#9a9286" />
        {[-2, 0, 2].map((x, index) => (
          <BeveledBox
            key={`seat-${x}`}
            size={[1.85, 0.38, 1.78]}
            position={[x, 1.02 + (index === 1 ? 0.025 : 0), 0.1]}
            rotation={[0.015 * (index - 1), 0.012 * (index - 1), 0.008 * (1 - index)]}
            radius={0.16}
            surface="fabric"
            color={index === 1 ? "#bcb4a8" : "#b5ada1"}
          />
        ))}
        {[-1.98, 0, 1.98].map((x, index) => (
          <BeveledBox
            key={`back-${x}`}
            size={[1.82, 1.16, 0.36]}
            position={[x, 1.7 + (index === 1 ? 0.03 : 0), -0.81]}
            rotation={[-0.11, 0.02 * (index - 1), 0.025 * (index - 1)]}
            radius={0.16}
            surface="fabric"
            color="#aba397"
          />
        ))}
        {[-2, 0, 2].map((x) => (
          <UpholsteryPiping
            key={`seat-piping-${x}`}
            position={[x, 1.18, 1.005]}
            length={1.62}
            color="#9f978b"
          />
        ))}
        {[-2.98, 2.98].map((x) => (
          <BeveledBox key={x} size={[0.48, 1.3, 2.02]} position={[x, 1.17, 0]} radius={0.2} surface="fabric" color="#9d9589" />
        ))}
        <SoftPillow
          position={[-1.42, 1.62, 0.68]}
          rotation={[0.1, 0.1, -0.12]}
          scale={[0.82, 0.62, 0.3]}
          color={palette.olive}
        />
        {[-2.55, 2.55].flatMap((x) =>
          [-0.78, 0.78].map((z) => (
            <BeveledBox key={`${x}-${z}`} size={[0.12, 0.32, 0.12]} position={[x, 0.2, z]} radius={0.025} surface="wood" color={palette.darkWalnut} />
          )),
        )}
      </group>

      <group position={[-1.1, 0, 4.7]}>
        <mesh position={[0, 0.5, 0]} castShadow receiveShadow>
          <cylinderGeometry args={[1.42, 1.47, 0.19, 64]} />
          <SurfaceMaterial surface="stone" color={palette.travertine} roughness={0.5} />
        </mesh>
        <mesh position={[0, 0.25, 0]} castShadow>
          <cylinderGeometry args={[0.58, 0.76, 0.48, 48]} />
          <SurfaceMaterial surface="stone" color="#988775" roughness={0.68} />
        </mesh>
        <group position={[0.35, 0.68, 0.05]} rotation={[0, -0.25, 0.03]}>
          {[0, 0.09, 0.18].map((y, index) => (
            <BeveledBox key={y} size={[0.65, 0.07, 0.48]} position={[0, y, 0]} radius={0.025} surface="fabric" color={["#8b725c", "#ddd1bc", "#4f554a"][index]} />
          ))}
        </group>
        <mesh position={[-0.55, 0.83, 0.05]} castShadow>
          <sphereGeometry args={[0.23, 24, 16]} />
          <SurfaceMaterial surface="stone" color="#8a6753" roughness={0.62} />
        </mesh>
      </group>

      <group position={[5.72, 0, 0.72]} rotation={[0, -0.5, 0]}>
        <BeveledBox size={[1.95, 0.52, 1.82]} position={[0, 0.72, 0]} radius={0.22} surface="fabric" color="#6c735f" />
        <BeveledBox size={[1.86, 1.25, 0.34]} position={[0, 1.43, -0.68]} rotation={[-0.16, 0, 0]} radius={0.17} surface="fabric" color="#737a66" />
        {[-0.78, 0.78].map((x) => (
          <BeveledBox key={x} size={[0.22, 0.8, 1.65]} position={[x, 1.04, 0]} radius={0.09} surface="fabric" color="#656c59" />
        ))}
        {[-0.66, 0.66].map((x) => (
          <BeveledBox key={x} size={[0.1, 0.55, 0.1]} position={[x, 0.28, -0.44]} rotation={[0.08, 0, x * 0.08]} radius={0.022} surface="metal" color="#3b3b35" />
        ))}
        <UpholsteryPiping position={[0, 0.96, 0.9]} length={1.55} color="#5f6654" />
      </group>

      <group position={[-7.15, 0, 2.45]}>
        <mesh position={[0, 2.02, 0]} castShadow>
          <cylinderGeometry args={[0.055, 0.08, 4.04, 20]} />
          <SurfaceMaterial surface="metal" color={palette.charcoal} roughness={0.42} />
        </mesh>
        <mesh position={[0, 4.08, 0]} castShadow>
          <cylinderGeometry args={[0.52, 0.78, 0.92, 40, 1, true]} />
          <meshPhysicalMaterial color="#c9b597" side={2} roughness={0.74} />
        </mesh>
        <pointLight position={[0, 3.85, 0]} color="#ffd4a4" intensity={1.8} distance={4} decay={2} />
      </group>

      <group position={[-1.9, 2.9, -5.98]}>
        <BeveledBox size={[3.5, 2.18, 0.17]} radius={0.045} surface="wood" color={palette.darkWalnut} />
        <mesh position={[0, 0, 0.095]}>
          <planeGeometry args={[3.14, 1.82]} />
          <meshStandardMaterial color="#896148" roughness={0.95} />
        </mesh>
      </group>

      <LivingCurtain compact={compact} />
      {!compact ? <Plant position={[7.72, 0, 9.7]} scale={0.72} animate /> : null}
    </group>
  );
}

function BedsideLamp({ position }: { position: VectorTuple }) {
  return (
    <group position={position}>
      <mesh position={[0, 0.24, 0]} castShadow>
        <cylinderGeometry args={[0.05, 0.08, 0.48, 18]} />
        <SurfaceMaterial surface="metal" color={palette.brass} />
      </mesh>
      <mesh position={[0, 0.6, 0]} castShadow>
        <cylinderGeometry args={[0.2, 0.32, 0.48, 28, 1, true]} />
        <meshPhysicalMaterial color="#dacbb5" side={2} roughness={0.82} />
      </mesh>
      <pointLight position={[0, 0.52, 0]} intensity={1.15} distance={3} decay={2} color="#ffd4a2" />
    </group>
  );
}

function Bedroom({ compact }: { compact: boolean }) {
  return (
    <group>
      <mesh position={[-2.7, 0.022, -11.15]} rotation={[-Math.PI / 2, 0, 0]} receiveShadow>
        <planeGeometry args={[8.8, 8.2]} />
        <SurfaceMaterial surface="rug" color="#928a7f" />
      </mesh>

      <group position={[-3.35, 0, -12.2]}>
        {[-2.02, 0, 2.02].map((x, index) => (
          <BeveledBox key={x} size={[1.94, 2.35, 0.4]} position={[x, 1.9, -2.07]} radius={0.17} surface="fabric" color={index === 1 ? "#7b7267" : "#746b61"} />
        ))}
        <BeveledBox size={[5.9, 0.58, 4.35]} position={[0, 0.62, 0]} radius={0.18} surface="wood" color={palette.darkWalnut} />
        <BeveledBox size={[5.58, 0.6, 4.02]} position={[0, 1.05, 0.02]} radius={0.23} surface="fabric" color="#cec7bc" />
        <BeveledBox size={[5.45, 0.32, 2.85]} position={[0, 1.45, 0.55]} radius={0.17} surface="fabric" color="#9b988a" />
        <BeveledBox size={[5.42, 0.5, 0.98]} position={[0, 1.32, 1.55]} rotation={[0.02, 0, 0]} radius={0.15} surface="fabric" color="#8d8f80" />
        <BeveledBox size={[2.5, 0.17, 2.2]} position={[0.78, 1.67, 0.36]} rotation={[0.03, 0.04, -0.015]} radius={0.08} surface="fabric" color="#6f7566" />
        {[-1.48, 1.42].map((x, index) => (
          <SoftPillow
            key={x}
            position={[x, 1.72, -0.92]}
            rotation={[-0.1, index ? -0.08 : 0.08, index ? 0.035 : -0.035]}
            scale={[1.05, 0.5, 0.65]}
            color={palette.lightLinen}
          />
        ))}
        {[-0.35, 0.3, 0.95, 1.6].map((x, index) => (
          <UpholsteryPiping
            key={`duvet-fold-${x}`}
            position={[x, 1.765 + (index % 2) * 0.008, 0.52]}
            rotation={[Math.PI / 2, 0, 0.025 * (index - 1.5)]}
            length={1.5 + (index % 2) * 0.18}
            color={index % 2 ? "#73796a" : "#6a7062"}
          />
        ))}
      </group>

      {[-7.15, 0.42].map((x) => (
        <group key={x} position={[x, 0, -13.55]}>
          <BeveledBox size={[1.3, 0.18, 1.08]} position={[0, 0.58, 0]} radius={0.055} surface="wood" color={palette.walnut} />
          {[-0.5, 0.5].map((legX) => (
            <BeveledBox key={legX} size={[0.08, 0.58, 0.08]} position={[legX, 0.29, 0]} radius={0.018} surface="metal" color="#423a32" />
          ))}
          <BedsideLamp position={[0, 0.68, 0]} />
        </group>
      ))}

      <group position={[6.55, 0, -12]}>
        <BeveledBox size={[3.62, 4.82, 0.78]} position={[0, 2.41, 0]} radius={0.08} surface="wood" color={palette.walnut} />
        {[-1.19, 0, 1.19].map((x) => (
          <group key={x} position={[x, 2.42, -0.405]}>
            <BeveledBox size={[1.12, 4.57, 0.08]} radius={0.026} surface="wood" color="#74513d" />
            <BeveledBox size={[0.025, 0.56, 0.035]} position={[x < 0 ? 0.39 : -0.39, 0, -0.065]} radius={0.007} surface="metal" color={palette.brass} />
          </group>
        ))}
      </group>

      <group position={[1.4, 0, -8.55]} rotation={[0, -0.18, 0]}>
        <BeveledBox size={[2.7, 0.32, 0.92]} position={[0, 0.72, 0]} radius={0.13} surface="fabric" color="#7a7468" />
        {[-1.08, 1.08].map((x) => (
          <BeveledBox key={x} size={[0.1, 0.62, 0.68]} position={[x, 0.34, 0]} rotation={[0, 0, x * 0.04]} radius={0.025} surface="wood" color={palette.darkWalnut} />
        ))}
      </group>

      {!compact ? <Plant position={[7.45, 0, -8.45]} scale={0.82} animate /> : null}
    </group>
  );
}

function Pendant({ x }: { x: number }) {
  const light = useRef<PointLight>(null);

  useFrame((state) => {
    if (!light.current) return;
    light.current.intensity = 2.15 + Math.sin(state.clock.elapsedTime * 0.35 + x) * 0.06;
  });

  return (
    <group position={[x, 5.42, -23.15]}>
      <mesh position={[0, -1.02, 0]}>
        <cylinderGeometry args={[0.028, 0.028, 2.05, 12]} />
        <SurfaceMaterial surface="metal" color={palette.charcoal} />
      </mesh>
      <mesh position={[0, -2.12, 0]} castShadow>
        <cylinderGeometry args={[0.25, 0.52, 0.68, 40, 1, true]} />
        <SurfaceMaterial surface="metal" color={palette.brass} roughness={0.4} />
      </mesh>
      <mesh position={[0, -2.18, 0]}>
        <sphereGeometry args={[0.12, 18, 12]} />
        <meshStandardMaterial color="#ffd9aa" emissive="#ffb55c" emissiveIntensity={2.1} toneMapped={false} />
      </mesh>
      <pointLight ref={light} position={[0, -2.26, 0]} color="#ffd4a2" intensity={2.15} distance={5} decay={2} />
    </group>
  );
}

function Stool({ x }: { x: number }) {
  return (
    <group position={[x, 0, -20.75]}>
      <BeveledBox size={[0.88, 0.22, 0.82]} position={[0, 0.92, 0]} radius={0.16} surface="fabric" color="#51574c" />
      {[-0.3, 0.3].flatMap((legX) =>
        [-0.27, 0.27].map((z) => (
          <BeveledBox key={`${legX}-${z}`} size={[0.06, 0.82, 0.06]} position={[legX, 0.44, z]} rotation={[z * 0.08, 0, legX * -0.08]} radius={0.016} surface="metal" color={palette.charcoal} />
        )),
      )}
      <mesh position={[0, 0.33, 0]} rotation={[Math.PI / 2, 0, 0]}>
        <torusGeometry args={[0.34, 0.025, 10, 32]} />
        <SurfaceMaterial surface="metal" color={palette.charcoal} />
      </mesh>
    </group>
  );
}

function Kitchen({ compact }: { compact: boolean }) {
  const cabinetXs = [-6.9, -4.55, -2.2, 0.15, 2.5, 4.85, 7.2];

  return (
    <group>
      <group position={[0, 0, -29.72]}>
        <BeveledBox size={[17.25, 3.72, 1.05]} position={[0, 1.87, 0.08]} radius={0.08} surface="wood" color="#614333" />
        {cabinetXs.map((x) => (
          <group key={x} position={[x, 1.88, -0.48]}>
            <BeveledBox size={[2.2, 3.56, 0.07]} radius={0.022} surface="wood" color={palette.walnut} />
            <BeveledBox size={[0.022, 0.68, 0.035]} position={[x > 0 ? -0.84 : 0.84, 0, -0.06]} radius={0.007} surface="metal" color={palette.brass} />
          </group>
        ))}
        <BeveledBox size={[17.35, 0.2, 1.24]} position={[0, 3.86, 0.08]} radius={0.07} surface="stone" color={palette.travertine} roughness={0.58} />
        <mesh position={[0, 4.68, 0.63]}>
          <planeGeometry args={[14.8, 1.05]} />
          <meshStandardMaterial color="#c7b79f" emissive="#b78f61" emissiveIntensity={0.13} roughness={0.82} />
        </mesh>
        <rectAreaLight position={[0, 4.62, 0.38]} width={13.8} height={0.18} intensity={2.6} color="#ffd7a3" />
      </group>

      <group position={[0.5, 0, -23.3]}>
        <BeveledBox size={[5.08, 1.84, 2.02]} position={[0, 0.92, 0]} radius={0.09} surface="wood" color="#715c4c" />
        {[-1.65, 0, 1.65].map((x) => (
          <BeveledBox key={x} size={[1.56, 1.62, 0.055]} position={[x, 0.94, 1.03]} radius={0.018} surface="wood" color="#796452" />
        ))}
        <BeveledBox size={[5.3, 0.24, 2.22]} position={[0, 1.96, 0]} radius={0.075} surface="stone" color={palette.travertine} roughness={0.56} />
        <BeveledBox size={[1.38, 0.035, 0.74]} position={[0.55, 2.095, 0]} radius={0.012} surface="metal" color="#343733" roughness={0.22} />
        <mesh position={[1.05, 2.33, -0.26]} rotation={[0, Math.PI / 2, 0]} castShadow>
          <torusGeometry args={[0.31, 0.035, 12, 32, Math.PI]} />
          <SurfaceMaterial surface="metal" color="#77766e" roughness={0.2} />
        </mesh>
        <mesh position={[0.74, 2.19, -0.26]}>
          <cylinderGeometry args={[0.045, 0.055, 0.35, 16]} />
          <SurfaceMaterial surface="metal" color="#77766e" roughness={0.2} />
        </mesh>
        <mesh position={[-1.25, 2.18, -0.08]} castShadow>
          <sphereGeometry args={[0.34, 28, 16, 0, Math.PI * 2, 0, Math.PI / 2]} />
          <SurfaceMaterial surface="stone" color="#7e705e" />
        </mesh>
      </group>

      {[-1.15, 0.5, 2.15].map((x) => <Stool key={x} x={x} />)}
      {[-1.1, 1.1].map((x) => <Pendant key={x} x={x} />)}

      {!compact ? (
        <group position={[-7.7, 0, -26.5]}>
          <Plant position={[0, 0, 0]} scale={0.76} animate />
          <group position={[1.1, 1.18, 0.12]}>
            {[0, 0.12, 0.24].map((y, index) => (
              <BeveledBox key={y} size={[0.7, 0.09, 0.48]} position={[0, y, 0]} radius={0.025} surface="fabric" color={["#a67d5c", "#d6c8ad", "#53594e"][index]} />
            ))}
          </group>
        </group>
      ) : null}
    </group>
  );
}

function WindowLight({
  position,
  targetPosition,
  color,
  intensity,
  compact,
}: {
  position: VectorTuple;
  targetPosition: VectorTuple;
  color: string;
  intensity: number;
  compact: boolean;
}) {
  const target = useMemo(() => new Object3D(), []);

  return (
    <>
      <primitive object={target} position={targetPosition} />
      <spotLight
        position={position}
        target={target}
        color={color}
        intensity={intensity}
        distance={18}
        decay={2}
        angle={0.72}
        penumbra={0.92}
        castShadow
        shadow-mapSize-width={compact ? 256 : 512}
        shadow-mapSize-height={compact ? 256 : 512}
        shadow-camera-near={0.6}
        shadow-camera-far={18}
        shadow-bias={-0.00012}
        shadow-normalBias={0.035}
        shadow-radius={compact ? 2 : 4}
      />
    </>
  );
}

function Lighting({ compact }: { compact: boolean }) {
  return (
    <>
      <ambientLight intensity={0.07} color="#eadfd1" />
      <hemisphereLight args={["#e8e4dc", "#403b35", 0.32]} />
      <directionalLight
        position={[-7, 12, 11]}
        intensity={2.25}
        color="#ffedda"
        castShadow
        shadow-mapSize-width={compact ? 512 : 1024}
        shadow-mapSize-height={compact ? 512 : 1024}
        shadow-camera-left={-12}
        shadow-camera-right={12}
        shadow-camera-top={15}
        shadow-camera-bottom={-18}
        shadow-camera-near={1}
        shadow-camera-far={58}
        shadow-bias={-0.00015}
        shadow-normalBias={0.025}
        shadow-radius={compact ? 3 : 5}
      />
      <WindowLight
        position={[-7.8, 5.1, 1.2]}
        targetPosition={[-1.4, 0.3, 1.6]}
        color="#dce9e5"
        intensity={42}
        compact={compact}
      />
      <WindowLight
        position={[7.75, 5.05, -11.7]}
        targetPosition={[-2.2, 0.3, -12.2]}
        color="#f5dfc4"
        intensity={46}
        compact={compact}
      />
      <WindowLight
        position={[-3.8, 5.8, -21.6]}
        targetPosition={[0.5, 0.35, -24.2]}
        color="#f8e5cb"
        intensity={31}
        compact={compact}
      />
      <rectAreaLight position={[-8.1, 3.25, 0]} rotation={[0, Math.PI / 2, 0]} width={9} height={4.5} intensity={5.2} color="#d5e1da" />
      <rectAreaLight position={[8.1, 3.2, -11.5]} rotation={[0, -Math.PI / 2, 0]} width={7} height={4} intensity={4.3} color="#f3dfc8" />
      <rectAreaLight position={[0, 5.72, -24]} rotation={[Math.PI / 2, 0, 0]} width={9} height={8} intensity={3.4} color="#ffe2bd" />
      <rectAreaLight position={[0, 0.15, -7]} rotation={[-Math.PI / 2, 0, 0]} width={16} height={44} intensity={0.58} color="#b9a993" />
      <Environment resolution={compact ? 32 : 64} environmentIntensity={0.86}>
        <Lightformer form="rect" intensity={4.2} color="#fff4e8" position={[-6, 8, 8]} scale={[11, 5, 1]} target={[0, 0, -7]} />
        <Lightformer form="rect" intensity={3.2} color="#dbe8e3" position={[7, 4, -4]} scale={[7, 4, 1]} target={[0, 1, -12]} />
        <Lightformer form="rect" intensity={3.5} color="#ffe2bd" position={[0, 7, -28]} scale={[10, 5, 1]} target={[0, 0, -23]} />
        <Lightformer form="ring" intensity={0.75} color="#8f8174" position={[0, -4, -12]} scale={9} target={[0, 0, -12]} />
      </Environment>
    </>
  );
}

function SceneReady({ onReady }: Pick<ShowroomSceneProps, "onReady">) {
  const ready = useRef(false);

  useFrame(() => {
    if (ready.current) return;
    ready.current = true;
    window.requestAnimationFrame(onReady);
  });

  return null;
}

function Showroom({
  compact,
  progress,
  reducedMotion,
  renderSecondaryRooms,
}: Pick<ShowroomSceneProps, "compact" | "progress" | "reducedMotion"> & {
  renderSecondaryRooms: boolean;
}) {
  return (
    <SurfaceMaterialLibrary>
      <color attach="background" args={["#aaa296"]} />
      <fog attach="fog" args={["#aaa296", 28, 62]} />
      <Lighting compact={compact} />
      <ArchitecturalShell />
      <LivingRoom compact={compact} />
      {renderSecondaryRooms ? (
        <>
          <Bedroom compact={compact} />
          <Kitchen compact={compact} />
        </>
      ) : null}
      {!compact ? (
        <>
          <ContactShadows
            position={[0, 0.025, 1.5]}
            scale={[17, 15]}
            opacity={0.34}
            blur={2.2}
            far={4.5}
            resolution={256}
            frames={1}
            color="#29241f"
          />
          <ContactShadows
            position={[0, 0.025, -11.7]}
            scale={[17, 11]}
            opacity={0.37}
            blur={2.1}
            far={4.6}
            resolution={256}
            frames={1}
            color="#29241f"
          />
          <ContactShadows
            position={[0, 0.025, -25]}
            scale={[17, 13]}
            opacity={0.33}
            blur={2.3}
            far={4.8}
            resolution={256}
            frames={1}
            color="#29241f"
          />
        </>
      ) : null}
      <CameraRig compact={compact} progress={progress} reducedMotion={reducedMotion} />
      <BakeShadows />
    </SurfaceMaterialLibrary>
  );
}

export function ShowroomScene({
  active = true,
  compact,
  activeRoom,
  progress,
  reducedMotion = false,
  onReady,
}: ShowroomSceneProps) {
  const [renderSecondaryRooms, setRenderSecondaryRooms] = useState(false);
  const dpr: [number, number] = compact ? [1, 1.5] : [1, 1.75];
  const shouldRenderSecondaryRooms = renderSecondaryRooms || activeRoom > 0;

  useEffect(() => {
    if (renderSecondaryRooms) return;

    const requestIdle = window.requestIdleCallback?.bind(window);
    const cancelIdle = window.cancelIdleCallback?.bind(window);

    if (requestIdle && cancelIdle) {
      const idleCallback = requestIdle(() => setRenderSecondaryRooms(true), {
        timeout: 1800,
      });

      return () => cancelIdle(idleCallback);
    }

    const timeout = globalThis.setTimeout(() => setRenderSecondaryRooms(true), 1200);
    return () => globalThis.clearTimeout(timeout);
  }, [renderSecondaryRooms]);

  return (
    <Canvas
      camera={{ fov: compact ? 48 : 39, near: 0.1, far: 82, position: [compact ? 7.7 : 8.65, compact ? 3.1 : 2.95, 18] }}
      dpr={dpr}
      shadows="percentage"
      frameloop={active && !reducedMotion ? "always" : "demand"}
      gl={{ antialias: true, alpha: false, powerPreference: "high-performance", stencil: false }}
      performance={{ min: 0.55, max: 1, debounce: 260 }}
      onCreated={({ gl, scene }) => {
        gl.outputColorSpace = SRGBColorSpace;
        gl.toneMapping = ACESFilmicToneMapping;
        gl.toneMappingExposure = compact ? 0.96 : 1;
        scene.background = new Color("#aaa296");
      }}
    >
      <Showroom compact={compact} progress={progress} reducedMotion={reducedMotion} renderSecondaryRooms={shouldRenderSecondaryRooms} />
      <SceneReady onReady={onReady} />
      <AdaptiveDpr />
    </Canvas>
  );
}
