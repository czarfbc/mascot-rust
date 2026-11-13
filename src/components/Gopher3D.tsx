import { useEffect, useRef } from "react";
import { createGopherStage, type GopherStage } from "../gopher3d/stage";

export interface Direction {
  degrees: number;
}

interface Gopher3DProps {
  animation: string; 
  direction: Direction | null;
}

export function Gopher3D({ animation, direction }: Gopher3DProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const stageRef = useRef<GopherStage | null>(null);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) {
      return;
    }
    const stage = createGopherStage(container);
    stageRef.current = stage;
    return () => {
      stage.dispose();
      stageRef.current = null;
    };
  }, []);

  useEffect(() => {
    stageRef.current?.setAnimation(animation);
  }, [animation]);

  useEffect(() => {
    if (direction) {
      stageRef.current?.setDirection(direction.degrees);
    }
  }, [direction]);

  return <div ref={containerRef} className="gopher-3d" />;
}
