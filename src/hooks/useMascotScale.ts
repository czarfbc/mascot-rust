import { useEffect, useState } from "react";
import { getCurrentWindow, LogicalSize } from "@tauri-apps/api/window";
import { MASCOT_SIZE } from "../gopher3d/size";

const STORAGE_KEY = "mascot.scale";
const MIN_SCALE = 0.5;
const MAX_SCALE = 3;
const STEP = 0.1;

function clampScale(value: number): number {
  const rounded = Math.round(value * 10) / 10;
  return Math.min(MAX_SCALE, Math.max(MIN_SCALE, rounded));
}

function loadScale(): number {
  try {
    const saved = Number(localStorage.getItem(STORAGE_KEY));
    if (saved >= MIN_SCALE && saved <= MAX_SCALE) {
      return saved;
    }
  } catch {
  }
  return 1;
}

export function useMascotScale() {
  const [scale, setScale] = useState(loadScale);

  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEY, String(scale));
    } catch {
    }

    const size = new LogicalSize(
      Math.round(MASCOT_SIZE.width * scale),
      Math.round(MASCOT_SIZE.height * scale),
    );
    getCurrentWindow().setSize(size).catch(console.error);
  }, [scale]);

  function grow(steps: number) {
    setScale((current) => clampScale(current + steps * STEP));
  }

  return { scale, grow };
}
