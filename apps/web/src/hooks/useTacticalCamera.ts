import { type MutableRefObject, type RefObject, useCallback, useEffect, useRef } from 'react';

interface UseTacticalCameraOptions {
  initialX: number;
  initialY: number;
  canvasRef?: RefObject<HTMLCanvasElement | null>;
}

interface UseTacticalCameraReturn {
  cameraRef: MutableRefObject<{ x: number; y: number }>;
  zoomRef: MutableRefObject<number>;
  targetZoomRef: MutableRefObject<number>;
  shakeIntensityRef: MutableRefObject<number>;
  addScreenShake: (impulse: number) => void;
  updateCamera: (
    pawnX: number,
    pawnY: number,
    mouseWorldX: number,
    mouseWorldY: number,
    dt: number
  ) => { x: number; y: number };
  handleWheel: (e: WheelEvent) => void;
}

export function useTacticalCamera({
  initialX,
  initialY,
  canvasRef,
}: UseTacticalCameraOptions): UseTacticalCameraReturn {
  const cameraRef = useRef({ x: initialX, y: initialY });
  const shakeIntensityRef = useRef(0);
  const zoomRef = useRef(1.0);
  const targetZoomRef = useRef(1.0);

  const addScreenShake = useCallback((impulse: number) => {
    shakeIntensityRef.current = Math.min(8, shakeIntensityRef.current + impulse);
  }, []);

  const handleWheel = useCallback((e: WheelEvent) => {
    e.preventDefault();
    const delta = -e.deltaY * 0.0012;
    targetZoomRef.current = Math.max(0.75, Math.min(1.25, targetZoomRef.current + delta));
  }, []);

  useEffect(() => {
    const canvas = canvasRef?.current;
    if (!canvas) return;

    canvas.addEventListener('wheel', handleWheel, { passive: false });
    return () => canvas.removeEventListener('wheel', handleWheel);
  }, [canvasRef, handleWheel]);

  const updateCamera = useCallback(
    (
      pawnX: number,
      pawnY: number,
      mouseWorldX: number,
      mouseWorldY: number,
      dt: number
    ): { x: number; y: number } => {
      // Look-ahead camera lead towards aiming crosshair
      const leadFactor = 0.15;
      const targetCamX = pawnX + (mouseWorldX - pawnX) * leadFactor;
      const targetCamY = pawnY + (mouseWorldY - pawnY) * leadFactor;
      cameraRef.current.x += (targetCamX - cameraRef.current.x) * 0.12;
      cameraRef.current.y += (targetCamY - cameraRef.current.y) * 0.12;

      // Micro screenshake decaying impulse
      shakeIntensityRef.current = Math.max(0, shakeIntensityRef.current - dt * 14.0);
      const shakeX = (Math.random() - 0.5) * shakeIntensityRef.current;
      const shakeY = (Math.random() - 0.5) * shakeIntensityRef.current;

      // Tactical zoom interpolation
      zoomRef.current += (targetZoomRef.current - zoomRef.current) * 0.15;

      return {
        x: cameraRef.current.x + shakeX,
        y: cameraRef.current.y + shakeY,
      };
    },
    []
  );

  return {
    cameraRef,
    zoomRef,
    targetZoomRef,
    shakeIntensityRef,
    addScreenShake,
    updateCamera,
    handleWheel,
  };
}
