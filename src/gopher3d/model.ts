import {
  CanvasTexture,
  CircleGeometry,
  Color,
  Group,
  LatheGeometry,
  Mesh,
  MeshBasicMaterial,
  PlaneGeometry,
  SphereGeometry,
  TorusGeometry,
  Vector2,
  type BufferGeometry,
  type Material,
  type Object3D,
} from "three";
import { RoundedBoxGeometry } from "three/addons/geometries/RoundedBoxGeometry.js";

// Gopher montado só com primitivas, sem arquivo de modelo.
// Unidades de mundo: o gopher tem ~1,8 de altura, pés em y = 0, frente para +z.
// Medidas e cores tiradas do frame de frente do sprite sheet original (gopher_walk.png).

// Tudo chapado (sem luz), como no desenho.
const COLOR = {
  body: 0x31aac4,
  tan: 0xc2b498,
  white: 0xf0f2ec,
  pupil: 0x080808,
  nose: 0x3b2f2a,
};

// Corpo: uma superelipse girada em torno do eixo Y (feito vaso no torno).
const BODY = {
  halfWidth: 0.62,
  halfHeight: 0.86,
  roundness: 3.2, // 2 = elipse; maior = mais "retângulo arredondado"
  taper: 0.05, // base um pouco mais larga que o topo
  lift: 0.08, // altura da base do corpo acima do chão (os pés ficam por baixo)
};

// Olhos são discos que sempre encaram a câmera (billboards): no sprite eles
// aparecem como círculo em toda vista, inclusive de lado, e é isso que imita.
const EYE = {
  x: 0.26, // distância do centro
  y: 0.49, // altura acima do centro do corpo
  radius: 0.215,
  pupil: 0.052,
  // Ponto de apoio afundado no corpo: de lado, o olho fica dentro da cabeça
  // (como no sprite) em vez de pendurado na borda.
  depth: 0.15,
  // Quanto o disco sai do ponto de apoio em direção à câmera. Grande o bastante
  // para o corpo não cortar o olho de 3/4, pequeno o bastante para o corpo
  // ainda esconder o olho quando o gopher está de costas.
  push: 0.5,
};

export const BODY_LIFT = BODY.lift;
// Quanto a pupila pode andar dentro do olho.
export const PUPIL_RANGE = EYE.radius - EYE.pupil - 0.035;

// Cada peça contornada guarda o material normal e um material "de ID".
// O contorno preto é desenhado onde o ID muda de um pixel para o vizinho
// (ver stage.ts). Peças que compartilham ID (pupila no olho, nariz no
// focinho, pata no braço) não ganham linha entre si.
export interface OutlinedMesh {
  mesh: Mesh;
  material: Material;
  idMaterial: MeshBasicMaterial;
}

export interface GopherRig {
  root: Group; // no chão; gira (yaw) para a direção da caminhada
  body: Group; // pivô na base do corpo: sobe/desce, inclina, respira
  face: Group; // olhos, focinho e dentes; gira um pouco à parte (ver motion.ts)
  feet: Group[]; // [lado -x, lado +x]
  arms: Group[]; // pivô no ombro, [lado -x, lado +x]
  eyes: Group[]; // billboards; escala Y = piscar
  pupils: Group[]; // posição x/y = para onde olha
  closedEyes: Group[]; // billboards "◡" para dormir
  billboards: Object3D[]; // o palco vira estes para a câmera a cada frame
  shadow: Mesh;
  outlined: OutlinedMesh[];
}

// Raio da seção horizontal do corpo na altura y (medida a partir do centro do corpo).
function bodyRadius(y: number): number {
  const t = Math.min(1, Math.abs(y) / BODY.halfHeight);
  const sin = t ** (BODY.roundness / 2);
  const cos = Math.sqrt(Math.max(0, 1 - sin * sin));
  return BODY.halfWidth * cos ** (2 / BODY.roundness) * (1 - BODY.taper * Math.sign(y) * t);
}

// Ponto na frente do corpo (z > 0) na altura y (do centro) e deslocamento lateral x,
// já em coordenadas do pivô do corpo. `push` afasta o ponto da superfície.
function front(x: number, y: number, push = 0): [number, number, number] {
  const radius = bodyRadius(y);
  const z = Math.sqrt(Math.max(radius * radius - x * x, 0));
  return [x, BODY.halfHeight + y, z + push];
}

function bodyGeometry(): BufferGeometry {
  const points: Vector2[] = [];
  const steps = 40;
  for (let i = 0; i <= steps; i++) {
    const angle = -Math.PI / 2 + (Math.PI * i) / steps;
    const sin = Math.sin(angle);
    const y = BODY.halfHeight * Math.sign(sin) * Math.abs(sin) ** (2 / BODY.roundness);
    points.push(new Vector2(bodyRadius(y), y));
  }
  // Começa em PI para a emenda do torno ficar nas costas.
  return new LatheGeometry(points, 48, Math.PI, Math.PI * 2);
}

function ellipsoid(rx: number, ry: number, rz: number): BufferGeometry {
  return new SphereGeometry(1, 24, 16).scale(rx, ry, rz);
}

// Mancha redonda e esfumada para a sombra no chão.
function shadowTexture(): CanvasTexture {
  const size = 64;
  const canvas = document.createElement("canvas");
  canvas.width = size;
  canvas.height = size;
  const context = canvas.getContext("2d")!;
  const gradient = context.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2);
  gradient.addColorStop(0, "rgba(0, 0, 0, 1)");
  gradient.addColorStop(0.6, "rgba(0, 0, 0, 0.8)");
  gradient.addColorStop(1, "rgba(0, 0, 0, 0)");
  context.fillStyle = gradient;
  context.fillRect(0, 0, size, size);
  return new CanvasTexture(canvas);
}

export function buildGopher(): GopherRig {
  const bodyMaterial = new MeshBasicMaterial({ color: COLOR.body });
  const tanMaterial = new MeshBasicMaterial({ color: COLOR.tan });
  const whiteMaterial = new MeshBasicMaterial({ color: COLOR.white });
  const noseMaterial = new MeshBasicMaterial({ color: COLOR.nose });
  const pupilMaterial = new MeshBasicMaterial({ color: COLOR.pupil });

  const outlined: OutlinedMesh[] = [];

  // Cria uma peça. `sameOutlineAs` reaproveita o ID de outra peça, então
  // não sai contorno entre as duas (só em volta do conjunto).
  function part(
    geometry: BufferGeometry,
    material: Material,
    parent: Object3D,
    position: [number, number, number] = [0, 0, 0],
    sameOutlineAs?: Mesh,
  ): Mesh {
    const mesh = new Mesh(geometry, material);
    mesh.position.set(...position);
    parent.add(mesh);
    const shared = outlined.find((item) => item.mesh === sameOutlineAs);
    // IDs distintos no canal vermelho (passo de 4 níveis em 8 bits).
    const idMaterial =
      shared?.idMaterial ?? new MeshBasicMaterial({ color: new Color().setRGB((outlined.length + 1) / 64, 0, 0) });
    outlined.push({ mesh, material, idMaterial });
    return mesh;
  }

  const root = new Group();
  const body = new Group();
  body.position.y = BODY.lift;
  root.add(body);

  const torso = part(bodyGeometry(), bodyMaterial, body, [0, BODY.halfHeight, 0]);

  // Orelhas: semicírculos nos cantos de cima, metade para fora da cabeça.
  for (const side of [-1, 1]) {
    part(ellipsoid(0.135, 0.135, 0.08), bodyMaterial, body, [side * 0.49, BODY.halfHeight + 0.72, -0.02]);
  }

  // Rosto num grupo próprio, girando em torno do eixo do corpo.
  const face = new Group();
  body.add(face);

  // Olhos: disco branco + pupila (mesmo ID: a pupila não ganha contorno).
  const eyes: Group[] = [];
  const pupils: Group[] = [];
  for (const side of [-1, 1]) {
    const eye = new Group();
    eye.position.set(...front(side * EYE.x, EYE.y, -EYE.depth));
    face.add(eye);
    const white = part(new CircleGeometry(EYE.radius, 40), whiteMaterial, eye, [0, 0, EYE.push]);

    const pupil = new Group();
    pupil.position.z = EYE.push + 0.002;
    eye.add(pupil);
    part(new CircleGeometry(EYE.pupil, 24), pupilMaterial, pupil, [0, 0, 0], white);

    eyes.push(eye);
    pupils.push(pupil);
  }

  // Olhos fechados: arcos "◡", sem contorno próprio (usam o ID do corpo).
  const closedEyes: Group[] = [];
  for (const side of [-1, 1]) {
    const closed = new Group();
    closed.position.set(...front(side * EYE.x, EYE.y - 0.04, -EYE.depth));
    closed.visible = false;
    face.add(closed);
    const arc = part(new TorusGeometry(0.11, 0.022, 8, 24, Math.PI), pupilMaterial, closed, [0, 0, EYE.push], torso);
    arc.rotation.z = Math.PI;
    closedEyes.push(closed);
  }

  // Focinho com nariz em cima e os dois dentes embaixo.
  const [muzzleX, muzzleY, muzzleZ] = front(0, 0.26, 0.04);
  const muzzle = part(ellipsoid(0.13, 0.095, 0.1), tanMaterial, face, [muzzleX, muzzleY, muzzleZ]);
  part(ellipsoid(0.058, 0.033, 0.035), noseMaterial, face, [0, muzzleY + 0.055, muzzleZ + 0.075], muzzle);
  for (const side of [-1, 1]) {
    const tooth = new RoundedBoxGeometry(0.065, 0.1, 0.03, 2, 0.012);
    part(tooth, whiteMaterial, face, [side * 0.034, muzzleY - 0.115, muzzleZ + 0.05]);
  }

  // Braços: toco azul pendurado do lado do corpo, com a pata bege na ponta.
  const arms: Group[] = [];
  for (const side of [-1, 1]) {
    const shoulderY = -0.1;
    const arm = new Group();
    arm.position.set(side * (bodyRadius(shoulderY) - 0.04), BODY.halfHeight + shoulderY, 0);
    arm.rotation.z = side * 0.4; // ponta aberta para fora
    body.add(arm);
    const limb = part(ellipsoid(0.075, 0.16, 0.08), bodyMaterial, arm, [0, -0.13, 0]);
    part(ellipsoid(0.06, 0.05, 0.065), tanMaterial, arm, [0, -0.26, 0], limb);
    arms.push(arm);
  }

  // Rabinho nas costas, perto da base. Mesmo ID do corpo: sem contorno próprio,
  // só aparece como calombo na silhueta de lado (de costas o sprite não mostra).
  const [, tailY, tailZ] = front(0, -0.6);
  part(ellipsoid(0.075, 0.075, 0.075), bodyMaterial, body, [0, tailY, -tailZ + 0.02], torso);

  // Pés: presos ao root (não ao corpo), para ficarem no chão quando o corpo balança.
  const feet: Group[] = [];
  for (const side of [-1, 1]) {
    const foot = new Group();
    foot.position.set(side * 0.32, 0, 0.06);
    root.add(foot);
    part(ellipsoid(0.12, 0.065, 0.16), tanMaterial, foot, [0, 0.065, 0.03]);
    feet.push(foot);
  }

  const shadow = new Mesh(
    new PlaneGeometry(1.25, 1.25),
    new MeshBasicMaterial({
      map: shadowTexture(),
      color: 0x000000,
      transparent: true,
      opacity: 0.22,
      depthWrite: false,
    }),
  );
  shadow.rotation.x = -Math.PI / 2;
  shadow.position.y = 0.001;
  shadow.renderOrder = -1;
  root.add(shadow);

  return {
    root,
    body,
    face,
    feet,
    arms,
    eyes,
    pupils,
    closedEyes,
    billboards: [...eyes, ...closedEyes],
    shadow,
    outlined,
  };
}
