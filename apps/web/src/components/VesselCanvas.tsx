import type {
  BoardingTacticsTelemetry,
  DoorState,
  PawnState,
  StationFixture,
  WeaponType,
} from '@kybernetes/protocol';
import { createInitialDoors, HESPERIA_STATIONS } from '@kybernetes/sim-core';
import type React from 'react';
import { useEffect, useRef } from 'react';
import type { ActiveInteraction } from '../types';
import { WebGL2Renderer } from '../webgl';

interface VesselCanvasProps {
  pawn: PawnState;
  nearestStation: StationFixture | null;
  activeInteraction?: ActiveInteraction | null;
  promptActionName?: string;
  alertLevel?: 'nominal' | 'yellow' | 'red';
  activeFires?: string[];
  breaches?: string[];
  boarding?: BoardingTacticsTelemetry;
  equippedWeapon?: WeaponType;
  onStationClick?: (station: StationFixture) => void;
  onEngageIntruder?: (intruderId: string) => void;
  onFireWeapon?: (
    originX: number,
    originY: number,
    targetX: number,
    targetY: number,
    weaponType: WeaponType
  ) => void;
  onToggleDoor?: (doorId: string, open: boolean) => void;
}

// fallow-ignore-next-line complexity
function handleCanvasClick(
  e: React.MouseEvent<HTMLCanvasElement>,
  canvas: HTMLCanvasElement | null,
  camera: { x: number; y: number },
  pawn: PawnState,
  equippedWeapon: WeaponType,
  doors: DoorState[] | undefined,
  nearestStation: StationFixture | null,
  onStationClick?: (station: StationFixture) => void,
  onToggleDoor?: (doorId: string, open: boolean) => void,
  onFireWeapon?: (
    originX: number,
    originY: number,
    targetX: number,
    targetY: number,
    weaponType: WeaponType
  ) => void
) {
  if (!canvas) return;
  const rect = canvas.getBoundingClientRect();
  const clickX = e.clientX - rect.left;
  const clickY = e.clientY - rect.top;
  const worldX = clickX - canvas.width / 2 + camera.x;
  const worldY = clickY - canvas.height / 2 + camera.y;

  // 1. Check if clicked an in-world door
  if (doors && onToggleDoor) {
    const clickedDoor = doors.find((d) => {
      const mx = (d.x1 + d.x2) / 2;
      const my = (d.y1 + d.y2) / 2;
      return Math.hypot(mx - worldX, my - worldY) < 32;
    });
    if (clickedDoor) {
      onToggleDoor(clickedDoor.id, !clickedDoor.isOpen);
      return;
    }
  }

  // 2. Check if clicked nearest station
  if (nearestStation && onStationClick) {
    const distToStation = Math.hypot(nearestStation.x - worldX, nearestStation.y - worldY);
    if (distToStation < nearestStation.radius + 10) {
      onStationClick(nearestStation);
      return;
    }
  }

  // 3. Else: Fire equipped weapon towards mouse click coordinates!
  if (onFireWeapon) {
    onFireWeapon(pawn.x, pawn.y, worldX, worldY, equippedWeapon);
  }
}

// fallow-ignore-next-line complexity
export const VesselCanvas: React.FC<VesselCanvasProps> = ({
  pawn,
  nearestStation,
  promptActionName,
  alertLevel = 'nominal',
  boarding,
  equippedWeapon = 'kinetic_carbine',
  onStationClick,
  onFireWeapon,
  onToggleDoor,
}) => {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const rendererRef = useRef<WebGL2Renderer | null>(null);
  const cameraRef = useRef({ x: pawn.x, y: pawn.y });
  const mouseWorldRef = useRef({ x: pawn.x + 50, y: pawn.y });
  const defaultDoorsRef = useRef(createInitialDoors());

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas?.parentElement) return;

    const observer = new ResizeObserver((entries) => {
      if (entries[0]) {
        const { width, height } = entries[0].contentRect;
        const dpr = Math.min(window.devicePixelRatio || 1, 2);
        canvas.width = Math.round(width * dpr);
        canvas.height = Math.round(height * dpr);
      }
    });

    observer.observe(canvas.parentElement);
    return () => observer.disconnect();
  }, []);

  // Handle Space key to fire towards mouse crosshair
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.code === 'Space' && onFireWeapon) {
        e.preventDefault();
        onFireWeapon(
          pawn.x,
          pawn.y,
          mouseWorldRef.current.x,
          mouseWorldRef.current.y,
          equippedWeapon
        );
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [pawn.x, pawn.y, equippedWeapon, onFireWeapon]);

  // WebGL 2 Rendering Loop
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    if (!rendererRef.current) {
      try {
        rendererRef.current = new WebGL2Renderer(canvas);
      } catch (err) {
        console.error('Failed to initialize pure WebGL 2 renderer:', err);
        return;
      }
    }

    let animId: number;

    const render = () => {
      if (canvas.width === 0 || canvas.height === 0) {
        animId = requestAnimationFrame(render);
        return;
      }

      // Smooth camera lerp tracking pawn
      cameraRef.current.x += (pawn.x - cameraRef.current.x) * 0.12;
      cameraRef.current.y += (pawn.y - cameraRef.current.y) * 0.12;

      rendererRef.current?.render(
        {
          pawn,
          nearestStation,
          boarding,
          alertLevel,
          camera: cameraRef.current,
          mouseWorld: mouseWorldRef.current,
          timeMs: performance.now(),
        },
        canvas.width,
        canvas.height
      );

      animId = requestAnimationFrame(render);
    };

    animId = requestAnimationFrame(render);
    return () => cancelAnimationFrame(animId);
  }, [pawn, nearestStation, alertLevel, boarding]);

  const activeDoors = boarding?.doors || defaultDoorsRef.current;

  return (
    <div style={{ position: 'relative', width: '100%', height: '100%', overflow: 'hidden' }}>
      <canvas
        ref={canvasRef}
        style={{
          position: 'absolute',
          top: 0,
          left: 0,
          width: '100%',
          height: '100%',
          display: 'block',
          cursor: 'crosshair',
        }}
        onMouseMove={(e) => {
          const canvas = canvasRef.current;
          if (!canvas) return;
          const rect = canvas.getBoundingClientRect();
          const clickX = e.clientX - rect.left;
          const clickY = e.clientY - rect.top;
          mouseWorldRef.current = {
            x: clickX - canvas.width / 2 + cameraRef.current.x,
            y: clickY - canvas.height / 2 + cameraRef.current.y,
          };
        }}
        onClick={(e) =>
          handleCanvasClick(
            e,
            canvasRef.current,
            cameraRef.current,
            pawn,
            equippedWeapon,
            activeDoors,
            nearestStation,
            onStationClick,
            onToggleDoor,
            onFireWeapon
          )
        }
      />

      {/* Diegetic In-World Station Prompt Overlay */}
      {nearestStation && (
        <div
          style={{
            position: 'absolute',
            left: `${Math.round((canvasRef.current ? canvasRef.current.clientWidth / 2 : 500) + (nearestStation.x - cameraRef.current.x))}px`,
            top: `${Math.round((canvasRef.current ? canvasRef.current.clientHeight / 2 : 400) + (nearestStation.y - cameraRef.current.y - nearestStation.radius - 24))}px`,
            transform: 'translateX(-50%)',
            background: 'rgba(10, 15, 23, 0.92)',
            border: '1px solid #00e5ff',
            color: '#00e5ff',
            padding: '4px 8px',
            fontSize: '11px',
            fontWeight: 'bold',
            fontFamily: 'monospace',
            pointerEvents: 'none',
            borderRadius: '4px',
            boxShadow: '0 0 10px rgba(0, 229, 255, 0.5)',
            zIndex: 10,
          }}
        >
          [E] {promptActionName || nearestStation.name}
        </div>
      )}
    </div>
  );
};
