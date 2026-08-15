import { Canvas, useFrame, useThree } from '@react-three/fiber';
import { useEffect, useMemo, useRef } from 'react';
import * as THREE from 'three';
import { colliderToScene, floorGeometry, mapDefinitionById } from './mapRegistry';
import { matchClient } from './network';
import { useGameStore, type NetworkPlayer } from './store';

function World() {
  const mapId = useGameStore((state) => state.mapId) ?? 'strike';
  const map = useMemo(() => mapDefinitionById(mapId), [mapId]);
  const floor = useMemo(() => floorGeometry(map), [map]);
  const colliders = useMemo(() => map.boxes.map((box) => colliderToScene(box, 3)), [map]);
  return (
    <group>
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[floor.centerX, 0, floor.centerZ]} receiveShadow>
        <planeGeometry args={[floor.width, floor.depth]} />
        <meshStandardMaterial color="#2b3940" roughness={0.95} metalness={0.05} />
      </mesh>
      <gridHelper
        args={[Math.max(floor.width, floor.depth), 24, '#41555f', '#2b3b43']}
        position={[floor.centerX, 0.02, floor.centerZ]}
      />
      {colliders.map((box, index) => (
        <mesh key={index} position={[box.x, box.y, box.z]} castShadow receiveShadow>
          <boxGeometry args={[box.sx, box.sy, box.sz]} />
          <meshStandardMaterial color="#5b6a74" roughness={0.8} metalness={0.1} />
        </mesh>
      ))}
    </group>
  );
}

function PlayerFigure({ player, isSelf }: { player: NetworkPlayer; isSelf: boolean }) {
  const color = player.team === 'ct' ? '#4f9cf7' : player.team === 't' ? '#f0913c' : '#7ee081';
  return (
    <group position={[player.x, 0, player.z]} rotation={[0, -player.yaw, 0]}>
      <mesh position={[0, 1, 0]} castShadow>
        <capsuleGeometry args={[0.28, 0.9, 6, 12]} />
        <meshStandardMaterial
          color={color}
          emissive={isSelf ? new THREE.Color('#1d3a2b') : new THREE.Color('#000000')}
          emissiveIntensity={isSelf ? 0.25 : 0}
        />
      </mesh>
      <mesh position={[0, 1.75, 0]} castShadow>
        <sphereGeometry args={[0.3, 12, 12]} />
        <meshStandardMaterial color={isSelf ? '#7ee081' : color} />
      </mesh>
      <mesh position={[0, 1, 0.42]}>
        <boxGeometry args={[0.12, 0.12, 0.8]} />
        <meshStandardMaterial color="#d9dee3" metalness={0.4} roughness={0.4} />
      </mesh>
      {!player.alive && (
        <mesh position={[0, 0.12, 0]}>
          <boxGeometry args={[0.7, 0.06, 0.7]} />
          <meshBasicMaterial color="#ff5252" />
        </mesh>
      )}
    </group>
  );
}

function Players() {
  const players = useGameStore((state) => state.networkPlayers);
  const selfId = useGameStore((state) => state.selfId);
  return (
    <group>
      {players.map((player) => (
        <PlayerFigure key={player.id} player={player} isSelf={player.id === selfId} />
      ))}
    </group>
  );
}

function PlayerRig() {
  const camera = useThree((state) => state.camera);
  const selfId = useGameStore((state) => state.selfId);
  const spectator = useGameStore((state) => state.spectator);
  const followId = useGameStore((state) => state.followId);
  const players = useGameStore((state) => state.networkPlayers);
  const yaw = useRef(0);
  const pitch = useRef(0);
  const seq = useRef(0);
  const initialized = useRef(false);
  const keys = useRef<Set<string>>(new Set());

  useEffect(() => {
    const keyDown = (event: KeyboardEvent) => {
      keys.current.add(event.code);
      if (event.code === 'KeyR') matchClient.reload();
    };
    const keyUp = (event: KeyboardEvent) => keys.current.delete(event.code);
    const mouseMove = (event: MouseEvent) => {
      if (document.pointerLockElement) {
        yaw.current -= event.movementX * 0.0022;
        pitch.current = Math.max(-1.45, Math.min(1.45, pitch.current - event.movementY * 0.0022));
      }
    };
    const mouseDown = (event: MouseEvent) => {
      const target = event.target as HTMLElement | null;
      if (target?.tagName === 'CANVAS' && document.pointerLockElement) {
        matchClient.fire(yaw.current);
      }
    };
    const click = (event: MouseEvent) => {
      const target = event.target as HTMLElement | null;
      if (target?.tagName === 'CANVAS' && !document.pointerLockElement) {
        target.requestPointerLock?.();
      }
    };
    window.addEventListener('keydown', keyDown);
    window.addEventListener('keyup', keyUp);
    window.addEventListener('mousemove', mouseMove);
    window.addEventListener('mousedown', mouseDown);
    window.addEventListener('click', click);
    return () => {
      window.removeEventListener('keydown', keyDown);
      window.removeEventListener('keyup', keyUp);
      window.removeEventListener('mousemove', mouseMove);
      window.removeEventListener('mousedown', mouseDown);
      window.removeEventListener('click', click);
    };
  }, []);

  const self = useMemo(() => players.find((player) => player.id === selfId), [players, selfId]);
  const follow = useMemo(
    () => players.find((player) => player.id === (spectator ? followId ?? selfId : selfId)),
    [players, spectator, followId, selfId],
  );

  useFrame(() => {
    const target = spectator ? follow : self;
    if (!target) return;
    if (!initialized.current) {
      yaw.current = target.yaw;
      initialized.current = true;
    }
    if (spectator) {
      camera.position.set(
        target.x + Math.sin(-target.yaw) * 4,
        3.2,
        target.z + Math.cos(-target.yaw) * 4,
      );
      camera.lookAt(target.x, 1, target.z);
      return;
    }
    camera.position.set(target.x, 1.65, target.z);
    camera.rotation.order = 'YXZ';
    camera.rotation.y = yaw.current;
    camera.rotation.x = pitch.current;
    const forward = (keys.current.has('KeyW') ? 1 : 0) - (keys.current.has('KeyS') ? 1 : 0);
    const right = (keys.current.has('KeyD') ? 1 : 0) - (keys.current.has('KeyA') ? 1 : 0);
    matchClient.sendInput({
      forward,
      right,
      yaw: yaw.current,
      sprint: keys.current.has('ShiftLeft') || keys.current.has('ShiftRight'),
      seq: ++seq.current,
    });
  });

  return null;
}

export function Arena() {
  return (
    <div id="arena-canvas" style={{ position: 'absolute', inset: 0 }}>
      <Canvas shadows camera={{ fov: 75, near: 0.1, far: 300 }} gl={{ antialias: true }}>
        <color attach="background" args={['#0d1419']} />
        <fog attach="fog" args={['#0d1419', 55, 160]} />
        <ambientLight intensity={0.65} />
        <directionalLight position={[20, 30, 10]} intensity={1.15} castShadow />
        <World />
        <Players />
        <PlayerRig />
      </Canvas>
    </div>
  );
}
