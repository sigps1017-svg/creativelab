import gsap from 'gsap';
import {
  AdditiveBlending,
  BufferAttribute,
  BufferGeometry,
  CanvasTexture,
  Color,
  MathUtils,
  PerspectiveCamera,
  Points,
  PointsMaterial,
  Quaternion,
  Scene,
  Vector3,
} from 'three';

// Spectacle de drones sur le toit : quand le visiteur arrive sur la terrasse, le ciel passe au
// crépuscule et des centaines de drones lumineux décollent des toits de la ville. Ils écrivent
// CREATIV LAB, dessinent la façade du bâtiment, puis invitent à parler de son projet.

const POLICE = "'Manrope', system-ui, sans-serif";
const BLANC = new Color('#fff3df');
const LAITON = new Color('#e0b26a');
const BLEU = new Color('#9fc4ff');
// Vitesse du spectacle (1 = normale), réglable par ?spectacle=0.2 pour le vérifier image par image.
const VITESSE = Number(new URLSearchParams(location.search).get('spectacle')) || 1;

/** Où le spectacle se place à l'écran, vu depuis la terrasse. */
export interface Cadrage {
  /** Caméra placée sur le point de vue de la terrasse (même projection que la caméra du site). */
  camera: PerspectiveCamera;
  /** Centre de la formation, en coordonnées normalisées de l'écran (-1 à 1). */
  ecranX: number;
  ecranY: number;
  /** Part de la largeur de l'écran occupée par la formation. */
  largeur: number;
  /** Écran en portrait : les mots passent sur deux lignes. */
  portrait: boolean;
}

/** Points d'une forme dessinée sur un canevas, en coordonnées (-0,5 à 0,5 en largeur). */
function echantillonner(dessiner: (ctx: CanvasRenderingContext2D, l: number, h: number) => void, l: number, h: number, n: number) {
  const c = document.createElement('canvas');
  c.width = l;
  c.height = h;
  const ctx = c.getContext('2d', { willReadFrequently: true })!;
  ctx.fillStyle = '#fff';
  ctx.strokeStyle = '#fff';
  dessiner(ctx, l, h);
  const donnees = ctx.getImageData(0, 0, l, h).data;
  const pleins: number[] = [];
  const pas = 2;
  for (let y = 0; y < h; y += pas) {
    for (let x = 0; x < l; x += pas) {
      if (donnees[(y * l + x) * 4 + 3] > 128) pleins.push(x, y);
    }
  }
  const res = new Float32Array(n * 2);
  const total = pleins.length / 2;
  // Tirage régulier dans les pixels pleins : chaque drone a sa place, sans trou ni amas.
  const ordre = Uint32Array.from({ length: total }, (_, i) => i);
  for (let i = total - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [ordre[i], ordre[j]] = [ordre[j], ordre[i]];
  }
  for (let i = 0; i < n; i++) {
    const k = ordre[i % total] * 2;
    res[i * 2] = (pleins[k] + (Math.random() - 0.5) * pas) / l - 0.5;
    res[i * 2 + 1] = (0.5 - (pleins[k + 1] + (Math.random() - 0.5) * pas) / h) * (h / l);
  }
  return res;
}

function texte(lignes: { mots: string; taille: number; graisse: number }[]) {
  return (ctx: CanvasRenderingContext2D, l: number, h: number) => {
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    const total = lignes.reduce((s, li) => s + li.taille * 1.15, 0);
    let y = (h - total) / 2;
    for (const li of lignes) {
      ctx.font = `${li.graisse} ${li.taille}px ${POLICE}`;
      y += li.taille * 0.575;
      ctx.fillText(li.mots, l / 2, y);
      y += li.taille * 0.575;
    }
  };
}

// La façade du bâtiment en traits de lumière : deux niveaux, l'atrium vitré, la toiture.
function facade(ctx: CanvasRenderingContext2D, l: number, h: number) {
  ctx.lineWidth = 5;
  const x0 = l * 0.08;
  const x1 = l * 0.92;
  const sol = h * 0.86;
  const etage = h * 0.55;
  const toit = h * 0.26;
  ctx.strokeRect(x0, toit, x1 - x0, sol - toit);
  ctx.beginPath();
  ctx.moveTo(x0 - l * 0.04, toit);
  ctx.lineTo(x1 + l * 0.04, toit);
  ctx.moveTo(x0, etage);
  ctx.lineTo(x1, etage);
  ctx.moveTo(x0 - l * 0.06, sol);
  ctx.lineTo(x1 + l * 0.06, sol);
  // Baies de l'étage et porte au centre.
  for (let i = 1; i < 8; i++) {
    const x = x0 + ((x1 - x0) * i) / 8;
    ctx.moveTo(x, toit);
    ctx.lineTo(x, etage);
  }
  ctx.moveTo(l * 0.44, sol);
  ctx.lineTo(l * 0.44, h * 0.66);
  ctx.lineTo(l * 0.56, h * 0.66);
  ctx.lineTo(l * 0.56, sol);
  ctx.stroke();
  // Le cercle de l'atrium, au-dessus du toit.
  ctx.beginPath();
  ctx.ellipse(l / 2, toit - h * 0.06, l * 0.12, h * 0.05, 0, 0, Math.PI * 2);
  ctx.stroke();
}

function halo() {
  const c = document.createElement('canvas');
  c.width = c.height = 64;
  const ctx = c.getContext('2d')!;
  const g = ctx.createRadialGradient(32, 32, 0, 32, 32, 32);
  g.addColorStop(0, 'rgba(255,255,255,1)');
  g.addColorStop(0.18, 'rgba(255,255,255,0.85)');
  g.addColorStop(0.45, 'rgba(255,255,255,0.18)');
  g.addColorStop(1, 'rgba(255,255,255,0)');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, 64, 64);
  return new CanvasTexture(c);
}

export function creerSpectacle(scene: Scene, nombre: number) {
  const n = nombre;
  const positions = new Float32Array(n * 3);
  const couleurs = new Float32Array(n * 3);
  const geo = new BufferGeometry();
  geo.setAttribute('position', new BufferAttribute(positions, 3));
  geo.setAttribute('color', new BufferAttribute(couleurs, 3));
  const mat = new PointsMaterial({
    size: 0.95,
    map: halo(),
    vertexColors: true,
    transparent: true,
    opacity: 0,
    depthWrite: false,
    // Les drones sont dans le ciel, devant tout : les garde-corps vitrés du toit ne doivent pas
    // en masquer une partie.
    depthTest: false,
    blending: AdditiveBlending,
    fog: false,
    toneMapped: false,
  });
  const points = new Points(geo, mat);
  points.frustumCulled = false;
  points.visible = false;
  points.renderOrder = 10;
  scene.add(points);

  // Chaque drone va de `depart` à `arrivee` avec son propre retard et une petite courbe de vol.
  const depart = new Float32Array(n * 3);
  const arrivee = new Float32Array(n * 3);
  const couleurDepart = new Float32Array(n * 3);
  const couleurArrivee = new Float32Array(n * 3);
  const retard = new Float32Array(n);
  const courbe = new Float32Array(n * 3);
  const phase = new Float32Array(n);
  for (let i = 0; i < n; i++) phase[i] = Math.random() * Math.PI * 2;
  const vol = { p: 1 };

  let formes: Float32Array[] = [];
  let portraitFormes: boolean | null = null;
  const preparerFormes = (portrait: boolean) => {
    if (portraitFormes === portrait) return;
    portraitFormes = portrait;
    const [l, h] = portrait ? [900, 640] : [1400, 420];
    const nom = portrait
      ? texte([
          { mots: 'CREATIV', taille: 190, graisse: 700 },
          { mots: 'LAB', taille: 190, graisse: 700 },
          { mots: 'ARCHITECTS', taille: 64, graisse: 500 },
        ])
      : texte([
          { mots: 'CREATIV LAB', taille: 200, graisse: 700 },
          { mots: 'ARCHITECTS', taille: 70, graisse: 500 },
        ]);
    const invitation = portrait
      ? texte([
          { mots: 'PARLONS DE', taille: 120, graisse: 700 },
          { mots: 'VOTRE', taille: 120, graisse: 700 },
          { mots: 'PROJET', taille: 120, graisse: 700 },
        ])
      : texte([
          { mots: 'PARLONS DE', taille: 150, graisse: 700 },
          { mots: 'VOTRE PROJET', taille: 150, graisse: 700 },
        ]);
    formes = [
      echantillonner(nom, l, h, n),
      echantillonner(facade, portrait ? 900 : 1400, portrait ? 700 : 560, n),
      echantillonner(invitation, l, h, n),
    ];
  };

  // Repère de la formation : centre, droite et haut dans le ciel, largeur en mètres.
  const centre = new Vector3();
  const droite = new Vector3();
  const haut = new Vector3();
  let largeur = 40;

  const placer = (c: Cadrage) => {
    const cam = c.camera;
    const distance = 70;
    const dir = new Vector3(c.ecranX, c.ecranY, 0.5).unproject(cam).sub(cam.position).normalize();
    centre.copy(cam.position).addScaledVector(dir, distance);
    const q = new Quaternion();
    cam.getWorldQuaternion(q);
    droite.set(1, 0, 0).applyQuaternion(q);
    haut.set(0, 1, 0).applyQuaternion(q);
    const visible = 2 * distance * Math.tan(MathUtils.degToRad(cam.fov / 2)) * cam.aspect;
    largeur = visible * c.largeur;
  };

  const versForme = (f: Float32Array, i: number, cible: Float32Array) => {
    const u = f[i * 2] * largeur;
    const v = f[i * 2 + 1] * largeur;
    cible[i * 3] = centre.x + droite.x * u + haut.x * v;
    cible[i * 3 + 1] = centre.y + droite.y * u + haut.y * v;
    cible[i * 3 + 2] = centre.z + droite.z * u + haut.z * v;
  };

  // Nouvelle étape : les drones partent d'où ils sont vers `cible(i, sortie)`.
  const etape = (cible: (i: number, sortie: Float32Array) => void, couleur: (i: number) => Color, dispersion: number, arc: number) => {
    depart.set(positions);
    couleurDepart.set(couleurs);
    for (let i = 0; i < n; i++) {
      cible(i, arrivee);
      const c = couleur(i);
      couleurArrivee[i * 3] = c.r;
      couleurArrivee[i * 3 + 1] = c.g;
      couleurArrivee[i * 3 + 2] = c.b;
      retard[i] = Math.random() * dispersion;
      courbe[i * 3] = (Math.random() - 0.5) * arc;
      courbe[i * 3 + 1] = Math.random() * arc;
      courbe[i * 3 + 2] = (Math.random() - 0.5) * arc;
    }
    vol.p = 0;
  };

  const auSol = (i: number, sortie: Float32Array) => {
    // Sur les toits de la ville, sous la formation.
    sortie[i * 3] = centre.x + (Math.random() - 0.5) * largeur * 2.2;
    sortie[i * 3 + 1] = 2 + Math.random() * 14;
    sortie[i * 3 + 2] = centre.z + (Math.random() - 0.3) * 50;
  };
  const enNuage = (i: number, sortie: Float32Array) => {
    const a = Math.random() * Math.PI * 2;
    const r = Math.sqrt(Math.random());
    const u = Math.cos(a) * r * largeur * 0.6;
    const v = Math.sin(a) * r * largeur * 0.2;
    const w = (Math.random() - 0.5) * 12;
    sortie[i * 3] = centre.x + droite.x * u + haut.x * v + w;
    sortie[i * 3 + 1] = centre.y + droite.y * u + haut.y * v;
    sortie[i * 3 + 2] = centre.z + droite.z * u + haut.z * v + w;
  };

  const blanc = () => BLANC;
  const laiton = () => LAITON;
  const melange = () => (Math.random() < 0.3 ? LAITON : Math.random() < 0.15 ? BLEU : BLANC);
  const tmp = new Color();

  let chrono: gsap.core.Timeline | null = null;
  let actif = false;

  const lancer = (c: Cadrage) => {
    actif = true;
    chrono?.kill();
    preparerFormes(c.portrait);
    placer(c);
    // Les drones attendent sur les toits, éteints.
    for (let i = 0; i < n; i++) auSol(i, positions);
    couleurs.fill(0);
    points.visible = true;
    gsap.to(mat, { opacity: 1, duration: 1.2, overwrite: true });
    const duree = 2.6;
    chrono = gsap
      .timeline({ delay: 1.2 })
      .timeScale(VITESSE)
      .call(() => etape(enNuage, melange, 0.5, 6))
      .to(vol, { p: 1, duration: 3, ease: 'none' })
      .call(() => etape((i, s) => versForme(formes[0], i, s), blanc, 0.4, 5))
      .to(vol, { p: 1, duration: duree, ease: 'none' })
      .to({}, { duration: 3.2 })
      .call(() => etape((i, s) => versForme(formes[1], i, s), laiton, 0.3, 8))
      .to(vol, { p: 1, duration: duree, ease: 'none' })
      .to({}, { duration: 2.6 })
      .call(() => etape((i, s) => versForme(formes[2], i, s), melange, 0.4, 6))
      .to(vol, { p: 1, duration: duree, ease: 'none' });
  };

  const arreter = () => {
    if (!actif) return;
    actif = false;
    chrono?.kill();
    // Retour sur les toits, en s'éteignant.
    etape(auSol, () => tmp.setRGB(0, 0, 0), 0.3, 4);
    chrono = gsap.timeline().to(vol, { p: 1, duration: 2.2, ease: 'none' });
    gsap.to(mat, { opacity: 0, duration: 2.2, overwrite: true, onComplete: () => void (points.visible = actif) });
  };

  const facile = gsap.parseEase('power2.inOut');
  const mettreAJour = (temps: number) => {
    if (!points.visible) return;
    for (let i = 0; i < n; i++) {
      const t = facile(MathUtils.clamp((vol.p - retard[i]) / (1 - 0.5), 0, 1));
      const bosse = Math.sin(Math.PI * t);
      // Léger flottement des drones en vol stationnaire.
      const flotte = Math.sin(temps * 1.3 + phase[i]) * 0.12;
      for (let k = 0; k < 3; k++) {
        const j = i * 3 + k;
        positions[j] = MathUtils.lerp(depart[j], arrivee[j], t) + courbe[j] * bosse + (k === 1 ? flotte : 0);
      }
      // Scintillement.
      const eclat = 0.8 + 0.2 * Math.sin(temps * 3.1 + phase[i] * 3);
      for (let k = 0; k < 3; k++) {
        const j = i * 3 + k;
        couleurs[j] = MathUtils.lerp(couleurDepart[j], couleurArrivee[j], t) * eclat;
      }
    }
    geo.attributes.position.needsUpdate = true;
    geo.attributes.color.needsUpdate = true;
  };

  return {
    lancer,
    arreter,
    mettreAJour,
    get actif() {
      return actif;
    },
    get visible() {
      return points.visible;
    },
  };
}
