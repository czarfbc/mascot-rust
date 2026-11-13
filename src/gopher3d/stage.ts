import {
  MathUtils,
  Mesh,
  NearestFilter,
  OrthographicCamera,
  PlaneGeometry,
  Quaternion,
  Scene,
  ShaderMaterial,
  Vector2,
  WebGLRenderTarget,
  WebGLRenderer,
  type Material,
  type Texture,
} from "three";
import { buildGopher } from "./model";
import { GopherMotion } from "./motion";
import { MASCOT_SIZE } from "./size";

const FPS = 30; // basta para o mascote e poupa GPU/bateria

// Enquadramento (unidades de mundo), igual ao sprite: o gopher ocupa ~80% da
// altura e os pés ficam a ~89% do topo. Pés em y = 0.
const VIEW_HEIGHT = 2.3;
const VIEW_CENTER_Y = 0.9;
const CAMERA_TILT = MathUtils.degToRad(8); // quase de frente, só um pouco de cima

// Espessura do contorno: pixels de raio por altura do mascote em escala 1,
// então cresce junto com o mascote.
const OUTLINE_RADIUS = 1.3;

// Passe de contorno: lê a imagem de IDs e pinta de preto todo pixel cujo
// vizinho (num anel de raio `radius`) tem outro ID. Fundo também é um "ID",
// então a silhueta ganha contorno junto com as divisas entre peças.
const OUTLINE_SHADER = {
  vertexShader: /* glsl */ `
    varying vec2 vUv;
    void main() {
      vUv = uv;
      gl_Position = vec4(position.xy, 0.0, 1.0);
    }
  `,
  fragmentShader: /* glsl */ `
    uniform sampler2D ids;
    uniform vec2 texel;
    uniform float radius;
    varying vec2 vUv;
    void main() {
      vec4 center = texture2D(ids, vUv);
      float hits = 0.0;
      for (int i = 0; i < 8; i++) {
        float angle = float(i) * 0.7853982;
        vec2 offset = vec2(cos(angle), sin(angle)) * radius * texel;
        hits += step(0.001, distance(center, texture2D(ids, vUv + offset)));
        hits += step(0.001, distance(center, texture2D(ids, vUv + offset * 0.5)));
      }
      float alpha = clamp(hits / 1.5, 0.0, 1.0);
      gl_FragColor = vec4(0.0, 0.0, 0.0, alpha);
    }
  `,
};

export interface GopherStage {
  setAnimation(name: string): void;
  setDirection(screenDegrees: number): void;
  dispose(): void;
}

export function createGopherStage(container: HTMLElement): GopherStage {
  const renderer = new WebGLRenderer({ antialias: true, alpha: true, powerPreference: "low-power" });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  renderer.setClearColor(0x000000, 0);
  renderer.domElement.style.display = "block";
  container.appendChild(renderer.domElement);

  // Sem luzes: os materiais são chapados, como o sprite.
  const scene = new Scene();

  const camera = new OrthographicCamera();
  camera.position.set(0, VIEW_CENTER_Y + Math.sin(CAMERA_TILT) * 10, Math.cos(CAMERA_TILT) * 10);
  camera.lookAt(0, VIEW_CENTER_Y, 0);
  camera.near = 0.1;
  camera.far = 30;

  const rig = buildGopher();
  scene.add(rig.root);
  const motion = new GopherMotion(rig);

  // Alvo da imagem de IDs (sem filtro, para os IDs não se misturarem).
  const idTarget = new WebGLRenderTarget(1, 1, { minFilter: NearestFilter, magFilter: NearestFilter });
  const outlineMaterial = new ShaderMaterial({
    ...OUTLINE_SHADER,
    uniforms: {
      ids: { value: idTarget.texture },
      texel: { value: new Vector2() },
      radius: { value: 1 },
    },
    transparent: true,
    depthTest: false,
    depthWrite: false,
  });
  const outlineScene = new Scene();
  outlineScene.add(new Mesh(new PlaneGeometry(2, 2), outlineMaterial));
  const screenCamera = new OrthographicCamera(-1, 1, 1, -1, 0, 1);

  function resize() {
    const width = container.clientWidth;
    const height = container.clientHeight;
    if (width === 0 || height === 0) {
      return;
    }
    renderer.setSize(width, height);
    const halfHeight = VIEW_HEIGHT / 2;
    const halfWidth = halfHeight * (width / height);
    camera.left = -halfWidth;
    camera.right = halfWidth;
    camera.top = halfHeight;
    camera.bottom = -halfHeight;
    camera.updateProjectionMatrix();

    const buffer = renderer.getDrawingBufferSize(new Vector2());
    idTarget.setSize(buffer.x, buffer.y);
    outlineMaterial.uniforms.texel.value.set(1 / buffer.x, 1 / buffer.y);
    outlineMaterial.uniforms.radius.value = (OUTLINE_RADIUS * buffer.y) / MASCOT_SIZE.height;
  }
  const observer = new ResizeObserver(resize);
  observer.observe(container);
  resize();

  // Vira os billboards (olhos) para a câmera, desfazendo a rotação dos pais.
  const parentRotation = new Quaternion();
  function faceCamera() {
    for (const item of rig.billboards) {
      item.parent?.getWorldQuaternion(parentRotation);
      item.quaternion.copy(parentRotation.invert().multiply(camera.quaternion));
    }
  }

  function render() {
    faceCamera();

    // 1) IDs: cada peça com sua cor única, sem a sombra.
    for (const part of rig.outlined) part.mesh.material = part.idMaterial;
    rig.shadow.visible = false;
    renderer.setRenderTarget(idTarget);
    renderer.render(scene, camera);

    // 2) Cor normal na tela.
    for (const part of rig.outlined) part.mesh.material = part.material;
    rig.shadow.visible = true;
    renderer.setRenderTarget(null);
    renderer.render(scene, camera);

    // 3) Contorno por cima, sem limpar a tela.
    renderer.autoClear = false;
    renderer.render(outlineScene, screenCamera);
    renderer.autoClear = true;
  }

  let frame = 0;
  let last = performance.now();
  function tick(now: number) {
    frame = requestAnimationFrame(tick);
    const elapsed = (now - last) / 1000;
    if (elapsed < 0.9 / FPS) {
      return;
    }
    last = now;
    motion.update(Math.min(elapsed, 0.1));
    render();
  }
  frame = requestAnimationFrame(tick);

  function dispose() {
    cancelAnimationFrame(frame);
    observer.disconnect();

    const materials = new Set<Material>([outlineMaterial]);
    for (const part of rig.outlined) {
      materials.add(part.material);
      materials.add(part.idMaterial);
    }
    for (const scope of [scene, outlineScene]) {
      scope.traverse((object) => {
        if (object instanceof Mesh) {
          object.geometry.dispose();
          materials.add(object.material as Material);
        }
      });
    }
    for (const material of materials) {
      for (const value of Object.values(material)) {
        if (value && typeof value === "object" && "isTexture" in value) {
          (value as Texture).dispose();
        }
      }
      material.dispose();
    }
    idTarget.dispose();
    renderer.dispose();
    renderer.domElement.remove();
  }

  return {
    setAnimation: (name) => motion.setAnimation(name),
    setDirection: (screenDegrees) => motion.setDirection(screenDegrees),
    dispose,
  };
}
