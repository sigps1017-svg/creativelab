import {
  BoxGeometry,
  CanvasTexture,
  Color,
  Group,
  Mesh,
  MeshStandardMaterial,
  PlaneGeometry,
  PointLight,
  RepeatWrapping,
  SRGBColorSpace,
  type Texture,
} from 'three';

// Piscine à débordement sur le toit-terrasse, côté façade : un bassin surélevé dont l'eau file
// jusqu'au bord et semble se jeter dans la ville. L'eau reflète le ciel (environnement du site)
// et ondule doucement ; la nuit, les projecteurs du bassin l'éclairent de l'intérieur.

// Coordonnées du site : entre les deux jardinières centrales et les oliviers du toit.
const X0 = -3.8;
const X1 = 3.8;
const Z0 = 9.0; // côté terrasse
const Z1 = 14.6; // côté vide (bord à débordement)
const SOL = 11.04; // dessus des dalles de la terrasse
const HAUTEUR = 0.45; // margelle au-dessus des dalles
const PROFONDEUR = 1.1;

/** Texture de bruit qui se répète sans couture, transformée en carte de normales (ondulations). */
export function normalesEau(taille = 256): Texture {
  const hauteurs = new Float32Array(taille * taille);
  // Somme de quelques ondes périodiques : la texture se raccorde parfaitement sur ses bords.
  const ondes = Array.from({ length: 14 }, () => ({
    kx: Math.round((Math.random() - 0.5) * 16),
    ky: Math.round((Math.random() - 0.5) * 16),
    a: 0.3 + Math.random(),
    p: Math.random() * Math.PI * 2,
  }));
  for (let y = 0; y < taille; y++) {
    for (let x = 0; x < taille; x++) {
      let h = 0;
      for (const o of ondes) h += o.a * Math.sin(((o.kx * x + o.ky * y) / taille) * Math.PI * 2 + o.p);
      hauteurs[y * taille + x] = h;
    }
  }
  const c = document.createElement('canvas');
  c.width = c.height = taille;
  const ctx = c.getContext('2d')!;
  const img = ctx.createImageData(taille, taille);
  const h = (x: number, y: number) => hauteurs[((y + taille) % taille) * taille + ((x + taille) % taille)];
  for (let y = 0; y < taille; y++) {
    for (let x = 0; x < taille; x++) {
      const dx = (h(x + 1, y) - h(x - 1, y)) * 0.08;
      const dy = (h(x, y + 1) - h(x, y - 1)) * 0.08;
      const l = Math.hypot(dx, dy, 1);
      const i = (y * taille + x) * 4;
      img.data[i] = (-dx / l * 0.5 + 0.5) * 255;
      img.data[i + 1] = (-dy / l * 0.5 + 0.5) * 255;
      img.data[i + 2] = (1 / l * 0.5 + 0.5) * 255;
      img.data[i + 3] = 255;
    }
  }
  ctx.putImageData(img, 0, 0);
  const t = new CanvasTexture(c);
  t.wrapS = t.wrapT = RepeatWrapping;
  return t;
}

/** Mosaïque turquoise du fond du bassin. */
function mosaique(): Texture {
  const c = document.createElement('canvas');
  c.width = c.height = 256;
  const ctx = c.getContext('2d')!;
  const n = 16;
  const pas = c.width / n;
  for (let y = 0; y < n; y++) {
    for (let x = 0; x < n; x++) {
      const l = 52 + Math.random() * 10;
      ctx.fillStyle = `hsl(${186 + Math.random() * 8}, 55%, ${l}%)`;
      ctx.fillRect(x * pas, y * pas, pas, pas);
    }
  }
  ctx.strokeStyle = 'rgba(255,255,255,0.55)';
  ctx.lineWidth = 2;
  for (let i = 0; i <= n; i++) {
    ctx.beginPath();
    ctx.moveTo(i * pas, 0);
    ctx.lineTo(i * pas, c.height);
    ctx.moveTo(0, i * pas);
    ctx.lineTo(c.width, i * pas);
    ctx.stroke();
  }
  const t = new CanvasTexture(c);
  t.colorSpace = SRGBColorSpace;
  t.wrapS = t.wrapT = RepeatWrapping;
  return t;
}

export function creerPiscine() {
  const groupe = new Group();
  groupe.name = 'Piscine';
  const largeur = X1 - X0;
  const longueur = Z1 - Z0;
  const cx = (X0 + X1) / 2;
  const cz = (Z0 + Z1) / 2;
  const dessus = SOL + HAUTEUR;

  const pierre = new MeshStandardMaterial({ color: '#e7e1d6', roughness: 0.55 });
  const fond = mosaique();
  fond.repeat.set(largeur / 2, longueur / 2);
  const carrelage = new MeshStandardMaterial({ map: fond, roughness: 0.35, emissive: new Color('#38c6e0'), emissiveIntensity: 0 });

  // Bassin : fond et parois en mosaïque, margelle en pierre sur trois côtés.
  const bas = dessus - PROFONDEUR;
  const ajouter = (geo: BoxGeometry, mat: MeshStandardMaterial, x: number, y: number, z: number) => {
    const m = new Mesh(geo, mat);
    m.position.set(x, y, z);
    m.receiveShadow = true;
    m.castShadow = true;
    groupe.add(m);
    return m;
  };
  ajouter(new BoxGeometry(largeur, 0.1, longueur), carrelage, cx, bas, cz);
  ajouter(new BoxGeometry(0.1, PROFONDEUR, longueur), carrelage, X0 + 0.05, bas + PROFONDEUR / 2, cz);
  ajouter(new BoxGeometry(0.1, PROFONDEUR, longueur), carrelage, X1 - 0.05, bas + PROFONDEUR / 2, cz);
  ajouter(new BoxGeometry(largeur, PROFONDEUR, 0.1), carrelage, cx, bas + PROFONDEUR / 2, Z0 + 0.05);
  // Margelle (côtés et arrière) ; le bord avant reste à fleur d'eau.
  const margelle = 0.4;
  ajouter(new BoxGeometry(largeur + 2 * margelle, 0.08, margelle), pierre, cx, dessus + 0.04, Z0 - margelle / 2);
  ajouter(new BoxGeometry(margelle, 0.08, longueur + 0.3), pierre, X0 - margelle / 2, dessus + 0.04, cz + 0.15);
  ajouter(new BoxGeometry(margelle, 0.08, longueur + 0.3), pierre, X1 + margelle / 2, dessus + 0.04, cz + 0.15);
  // Habillage extérieur du bassin, en pierre, et la rigole de débordement côté vide.
  ajouter(new BoxGeometry(largeur + 2 * margelle, HAUTEUR, 0.2), pierre, cx, SOL + HAUTEUR / 2, Z0 - 0.1 - margelle + 0.2);
  ajouter(new BoxGeometry(0.2, HAUTEUR, longueur), pierre, X0 - margelle + 0.1, SOL + HAUTEUR / 2, cz);
  ajouter(new BoxGeometry(0.2, HAUTEUR, longueur), pierre, X1 + margelle - 0.1, SOL + HAUTEUR / 2, cz);
  const lame = ajouter(new BoxGeometry(largeur, HAUTEUR - 0.06, 0.06), new MeshStandardMaterial({ color: '#0f3d4a', roughness: 0.05, metalness: 0.2 }), cx, SOL + (HAUTEUR - 0.06) / 2, Z1 + 0.05);
  lame.castShadow = false;
  ajouter(new BoxGeometry(largeur + 2 * margelle, 0.12, 0.35), pierre, cx, SOL + 0.06, Z1 + 0.28);

  // L'eau : une nappe réfléchissante qui ondule, à ras du bord avant (le débordement).
  const normales = normalesEau();
  normales.repeat.set(largeur / 3, longueur / 3);
  const normales2 = normales.clone();
  normales2.repeat.set(largeur / 5, longueur / 5);
  const eau = new MeshStandardMaterial({
    color: '#0d5d73',
    roughness: 0.03,
    metalness: 0.1,
    transparent: true,
    opacity: 0.78,
    normalMap: normales,
    envMapIntensity: 1.6,
  });
  eau.normalScale.set(0.25, 0.25);
  const nappe = new Mesh(new PlaneGeometry(largeur, longueur + 0.06), eau);
  nappe.rotation.x = -Math.PI / 2;
  nappe.position.set(cx, dessus - 0.02, cz + 0.03);
  nappe.renderOrder = 2;
  groupe.add(nappe);
  // Le voile d'eau qui glisse sur la lame avant.
  const voile = new MeshStandardMaterial({ color: '#7fc4d2', roughness: 0.1, transparent: true, opacity: 0.45, normalMap: normales2 });
  const chute = new Mesh(new PlaneGeometry(largeur, HAUTEUR - 0.02), voile);
  chute.position.set(cx, SOL + HAUTEUR / 2 - 0.01, Z1 + 0.085);
  groupe.add(chute);

  // Projecteurs immergés : éteints le jour, ils font briller le bassin la nuit.
  const lampe = new PointLight('#5fd8f0', 0, 9, 1.6);
  lampe.position.set(cx, bas + 0.4, cz);
  groupe.add(lampe);

  return {
    groupe,
    /** 0 en plein jour, 1 la nuit. */
    reglerNuit(nuit: number) {
      carrelage.emissiveIntensity = 0.55 * nuit;
      lampe.intensity = 6 * nuit;
      eau.opacity = 0.78 - 0.2 * nuit;
    },
    mettreAJour(temps: number) {
      normales.offset.set(temps * 0.02, temps * 0.013);
      normales2.offset.set(0, -temps * 0.35);
    },
  };
}
