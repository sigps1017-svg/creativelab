import { BufferGeometry, Mesh, Object3D, PerspectiveCamera, Raycaster, Vector3 } from 'three';
import { acceleratedRaycast, computeBoundsTree } from 'three-mesh-bvh';

// Visite libre : on marche dans le bâtiment et autour, à hauteur d'yeux.
// Clavier (ZQSD, WASD, flèches) et souris sur ordinateur, joystick et glisser sur téléphone.
// Les murs et garde-corps arrêtent le visiteur, le sol (marches comprises) le porte.

BufferGeometry.prototype.computeBoundsTree = computeBoundsTree;
Mesh.prototype.raycast = acceleratedRaycast;

const YEUX = 1.65;
const MARCHE_MAX = 0.45; // hauteur franchissable d'un pas (marches de l'escalier)
const RAYON = 0.35; // distance gardée aux murs
const VITESSE = 3.2;
const COURSE = 7;
const LIMITE = 110; // on ne s'éloigne pas au-delà de la ville

// Points d'arrivée des raccourcis (coordonnées du site : y vers le haut, entrée côté +z).
export const LIEUX: Record<string, { pos: [number, number, number]; cap: number }> = {
  parvis: { pos: [0, 0, 34], cap: 0 },
  hall: { pos: [0, 0, 9], cap: 0 },
  galerie: { pos: [0, 0, -6], cap: 0 },
  atelier: { pos: [-12, 6, 4], cap: 0 },
  equipe: { pos: [12, 6, -4.6], cap: 0 },
  toit: { pos: [0, 11, 8], cap: Math.PI },
};

interface Options {
  camera: PerspectiveCamera;
  canvas: HTMLCanvasElement;
  monde: Object3D;
  joystick: HTMLElement | null;
}

export function creerVisite({ camera, canvas, monde, joystick }: Options) {
  let actif = false;
  let cap = 0; // rotation autour de la verticale (0 = regard vers -z)
  let tangage = 0;
  let vitesseChute = 0;
  const pieds = new Vector3();
  const touches = new Set<string>();
  const manette = { x: 0, y: 0 };
  let obstacles: Mesh[] = [];

  const rayon = new Raycaster();
  rayon.layers.enableAll(); // le verre (calque 1) arrête aussi le visiteur
  rayon.firstHitOnly = true;

  const preparerObstacles = () => {
    obstacles = [];
    monde.traverse((o) => {
      if (!(o instanceof Mesh) || !o.visible) return;
      if (!o.geometry.boundsTree) o.geometry.computeBoundsTree();
      obstacles.push(o);
    });
  };

  const bas = new Vector3(0, -1, 0);
  const origine = new Vector3();
  /** Hauteur du sol sous un point, cherchée depuis un peu au-dessus des pieds. */
  const sol = (x: number, y: number, z: number) => {
    origine.set(x, y + MARCHE_MAX + 0.05, z);
    rayon.set(origine, bas);
    rayon.far = 40;
    const t = rayon.intersectObjects(obstacles, false)[0];
    return t ? t.point.y : -Infinity;
  };

  const dir = new Vector3();
  /** Le pas de longueur d est-il libre ? On teste au genou (au-dessus des marches) et aux yeux. */
  const libre = (dx: number, dz: number) => {
    const d = Math.hypot(dx, dz);
    if (d < 1e-6) return true;
    dir.set(dx / d, 0, dz / d);
    rayon.far = d + RAYON;
    for (const h of [MARCHE_MAX + 0.1, 1.2, YEUX - 0.05]) {
      origine.set(pieds.x, pieds.y + h, pieds.z);
      rayon.set(origine, dir);
      if (rayon.intersectObjects(obstacles, false).length) return false;
    }
    return true;
  };

  const placer = (x: number, y: number, z: number, c: number) => {
    const s = sol(x, y + 0.5, z);
    pieds.set(x, Number.isFinite(s) ? s : y, z);
    cap = c;
    tangage = -0.05;
    vitesseChute = 0;
  };

  // ---- Regard : glisser à la souris ou au doigt ----
  let glisse: { id: number; x: number; y: number } | null = null;
  canvas.addEventListener('pointerdown', (e) => {
    if (!actif || glisse) return;
    glisse = { id: e.pointerId, x: e.clientX, y: e.clientY };
  });
  addEventListener('pointermove', (e) => {
    if (!actif || !glisse || e.pointerId !== glisse.id) return;
    const k = e.pointerType === 'mouse' ? 0.0042 : 0.006;
    cap -= (e.clientX - glisse.x) * k;
    tangage = Math.max(-1.3, Math.min(1.3, tangage - (e.clientY - glisse.y) * k));
    glisse.x = e.clientX;
    glisse.y = e.clientY;
  });
  const lacher = (e: PointerEvent) => {
    if (glisse && e.pointerId === glisse.id) glisse = null;
  };
  addEventListener('pointerup', lacher);
  addEventListener('pointercancel', lacher);

  // ---- Clavier ----
  addEventListener('keydown', (e) => {
    if (!actif || (e.target as HTMLElement).closest?.('input, textarea, dialog')) return;
    touches.add(e.code);
    if (e.code.startsWith('Arrow') || e.code === 'Space') e.preventDefault();
  });
  addEventListener('keyup', (e) => touches.delete(e.code));
  addEventListener('blur', () => touches.clear());

  // ---- Joystick (écrans tactiles) ----
  if (joystick) {
    const bouton = joystick.querySelector<HTMLElement>('span')!;
    let doigt: number | null = null;
    const bouger = (e: PointerEvent) => {
      const r = joystick.getBoundingClientRect();
      const max = r.width / 2;
      let x = e.clientX - (r.left + max);
      let y = e.clientY - (r.top + max);
      const l = Math.hypot(x, y);
      if (l > max) {
        x *= max / l;
        y *= max / l;
      }
      manette.x = x / max;
      manette.y = y / max;
      bouton.style.transform = `translate(${x}px, ${y}px)`;
    };
    joystick.addEventListener('pointerdown', (e) => {
      doigt = e.pointerId;
      joystick.setPointerCapture(e.pointerId);
      bouger(e);
      e.stopPropagation();
    });
    joystick.addEventListener('pointermove', (e) => {
      if (e.pointerId === doigt) bouger(e);
    });
    const fin = (e: PointerEvent) => {
      if (e.pointerId !== doigt) return;
      doigt = null;
      manette.x = manette.y = 0;
      bouton.style.transform = '';
    };
    joystick.addEventListener('pointerup', fin);
    joystick.addEventListener('pointercancel', fin);
  }

  const axe = (plus: string[], moins: string[]) =>
    (plus.some((c) => touches.has(c)) ? 1 : 0) - (moins.some((c) => touches.has(c)) ? 1 : 0);

  return {
    get actif() {
      return actif;
    },

    /** Entre en visite libre là où se trouve la caméra, ou à un lieu donné. */
    entrer(lieu?: string) {
      preparerObstacles(); // le modèle a pu arriver depuis la dernière visite
      actif = true;
      touches.clear();
      if (lieu && LIEUX[lieu]) {
        const l = LIEUX[lieu];
        placer(l.pos[0], l.pos[1], l.pos[2], l.cap);
        return;
      }
      const regard = camera.getWorldDirection(new Vector3());
      const p = camera.position;
      // Depuis le parcours, la caméra flotte souvent en l'air : on pose le visiteur au sol.
      placer(p.x, p.y - YEUX, p.z, Math.atan2(-regard.x, -regard.z));
    },

    aller(lieu: string) {
      const l = LIEUX[lieu];
      if (l) placer(l.pos[0], l.pos[1], l.pos[2], l.cap);
    },

    sortir() {
      actif = false;
      touches.clear();
      glisse = null;
    },

    /** Avance le visiteur et place la caméra ; `regard` reçoit le point visé. */
    mettreAJour(dt: number, regard: Vector3) {
      const avant = axe(['KeyW', 'KeyZ', 'ArrowUp'], ['KeyS', 'ArrowDown']) - manette.y;
      const cote = axe(['KeyD', 'ArrowRight'], ['KeyA', 'KeyQ', 'ArrowLeft']) + manette.x;
      const course = touches.has('ShiftLeft') || touches.has('ShiftRight');
      const n = Math.min(1, Math.hypot(avant, cote));
      if (n > 0.05) {
        const v = (course ? COURSE : VITESSE) * dt * n / Math.hypot(avant, cote);
        const sx = -Math.sin(cap), sz = -Math.cos(cap); // devant
        const dx = (sx * avant - sz * cote) * v;
        const dz = (sz * avant + sx * cote) * v;
        // On glisse le long des murs : si le pas est bloqué, on essaie chaque direction seule.
        for (const [mx, mz] of [[dx, dz], [dx, 0], [0, dz]]) {
          if (!libre(mx, mz)) continue;
          const nx = pieds.x + mx, nz = pieds.z + mz;
          if (Math.hypot(nx, nz) > LIMITE) break;
          const s = sol(nx, pieds.y, nz);
          if (s > pieds.y + MARCHE_MAX) continue;
          pieds.x = nx;
          pieds.z = nz;
          break;
        }
      }
      // Gravité : on suit les marches en douceur et on tombe si le sol se dérobe.
      const s = sol(pieds.x, pieds.y, pieds.z);
      if (Number.isFinite(s) && s >= pieds.y - 0.02) {
        pieds.y += (s - pieds.y) * Math.min(1, dt * 14);
        vitesseChute = 0;
      } else if (Number.isFinite(s)) {
        vitesseChute = Math.min(vitesseChute + 20 * dt, 30);
        pieds.y = Math.max(s, pieds.y - vitesseChute * dt);
      }
      camera.position.set(pieds.x, pieds.y + YEUX, pieds.z);
      regard.set(
        pieds.x - Math.sin(cap) * Math.cos(tangage),
        pieds.y + YEUX + Math.sin(tangage),
        pieds.z - Math.cos(cap) * Math.cos(tangage),
      );
    },
  };
}
