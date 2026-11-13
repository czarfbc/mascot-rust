import { useEffect, useState, type WheelEvent } from "react";
import { listen } from "@tauri-apps/api/event";
import { Gopher3D, type Direction } from "./components/Gopher3D";
import { useMascotScale } from "./hooks/useMascotScale";
import "./App.css";

function App() {
  const [animation, setAnimation] = useState("idle");
  const [direction, setDirection] = useState<Direction | null>(null);
  const { grow } = useMascotScale();

  useEffect(() => {
    const unlistenAnimation = listen<string>("animation", (event) => {
      setAnimation(event.payload);
    });
    const unlistenDirection = listen<number>("direction", (event) => {
      setDirection({ degrees: event.payload });
    });
    return () => {
      unlistenAnimation.then((off) => off());
      unlistenDirection.then((off) => off());
    };
  }, []);

  function handleWheel(event: WheelEvent) {
    grow(event.deltaY < 0 ? 1 : -1);
  }

  return (
    <div className="stage" onWheel={handleWheel}>
      <Gopher3D animation={animation} direction={direction} />
    </div>
  );
}

export default App;
