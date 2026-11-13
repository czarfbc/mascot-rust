import { useEffect, useRef } from "react";
import { createGopherStage, type GopherStage } from "../gopher3d/stage";

// Ângulo da caminhada vindo do Rust, em graus na tela (ver GopherMotion.setDirection).
export interface Direction {
  degrees: number;
}

interface Gopher3DProps {
  animation: string; // nome vindo do Rust: walk_*, idle, sit, sleep
  direction: Direction | null;
}

// Casca React do gopher 3D: cria o palco Three.js uma vez e repassa animação e direção.
// O canvas acompanha o tamanho da janela, então a escala vem de graça.
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

  // A animação vem antes da direção: se as duas chegarem juntas, a direção
  // é aplicada por último e não é apagada pela troca de pose.
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
