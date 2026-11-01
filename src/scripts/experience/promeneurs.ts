import { AnimationClip, AnimationMixer, Color, Group, MathUtils, MeshStandardMaterial, Bone, KeyframeTrack, Matrix4, Object3D, Quaternion, QuaternionKeyframeTrack, SkinnedMesh, Vector3, VectorKeyframeTrack } from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { MeshoptDecoder } from 'three/examples/jsm/libs/meshopt_decoder.module.js';
import { clone as cloner } from 'three/examples/jsm/utils/SkeletonUtils.js';

// Des visiteurs donnent vie au bâtiment : passants sur le parvis, curieux devant les tableaux de la
// galerie, architectes à l'atelier, quelqu'un qui admire la vue sur le toit. Ce sont de vrais
// personnages 3D animés (voir plus bas) ; ils marchent, s'arrêtent, regardent, puis repartent. Leurs chemins évitent le mobilier du modèle (repéré dans le .glb).

type Point = [number, number];

interface Promeneur {
  /** Hauteur du sol (0 rez-de-chaussée, 6 étage, 11,04 toit). */
  sol: number;
  /** Chemin parcouru en aller-retour ; un seul point = personne immobile. */
  chemin: Point[];
  /** Arrêt (en secondes) à chaque extrémité du chemin, et cap du regard pendant l'arrêt. */
  arret?: number;
  regardDebut?: number;
  regardFin?: number;
  vitesse?: number;
  /** Décalage de départ le long du chemin (0 à 1). */
  depart?: number;
}

// Cap : 0 = regard vers +z (vers la ville, côté entrée), π = vers le fond du bâtiment.
const FOND = Math.PI;
const ENTREE = 0;

const PROMENEURS: Promeneur[] = [
  // Parvis
  { sol: 0, chemin: [[3.5, 44], [3.5, 16], [1.6, 13.6]], arret: 3, regardFin: FOND, vitesse: 1.25 },
  { sol: 0, chemin: [[-24, 40.5], [24, 40.5]], arret: 0.5, vitesse: 1.35, depart: 0.3 },
  { sol: 0, chemin: [[-20, 19.1], [14, 19.1]], arret: 4, vitesse: 1.0, depart: 0.55 },
  { sol: 0, chemin: [[-20, 19.8], [14, 19.8]], arret: 4, vitesse: 1.0, depart: 0.55 },
  { sol: 0, chemin: [[-6, 15.5]], regardDebut: FOND - 0.2 },
  // Hall et galerie
  { sol: 0, chemin: [[-1, 10], [2, 4], [7, -1], [11, -7.5]], arret: 5, regardDebut: ENTREE, regardFin: FOND, vitesse: 1.1 },
  { sol: 0, chemin: [[-3, -9.6]], regardDebut: FOND },
  { sol: 0, chemin: [[5.5, -9.3]], regardDebut: FOND + 0.15 },
  { sol: 0, chemin: [[-6, -8.2], [8, -8.2]], arret: 4, regardDebut: FOND, regardFin: FOND, vitesse: 0.75, depart: 0.2 },
  // Étage : la coursive et l'atelier
  { sol: 6, chemin: [[-15, 7.5], [15, 7.5]], arret: 3, regardDebut: FOND, regardFin: FOND, vitesse: 1.1, depart: 0.7 },
  { sol: 6, chemin: [[-13, -5.5]], regardDebut: ENTREE },
  { sol: 6, chemin: [[-15.5, -1]], regardDebut: FOND },
  // Toit-terrasse
  { sol: 11.04, chemin: [[-5.2, 13.2]], regardDebut: -0.16 },
  { sol: 11.04, chemin: [[8, 6.5], [14, 10], [14, 12.8]], arret: 6, regardFin: ENTREE, vitesse: 0.9, depart: 0.4 },
];

// Personnages réalistes (npm run preparer-personnes) : une femme et un homme, animés par les
// mouvements Mixamo « marche » et « attente » du robot Xbot. Chaque visiteur reçoit sa taille et,
// pour l'homme, sa teinte de peau et la couleur de son costume ; les animations sont décalées
// pour que tout le monde ne marche pas au même pas.
const URL_PERSONNES = '/modeles/personnes/';
const MODELES = ['femme', 'homme'] as const;
type Modele = (typeof MODELES)[number];

/** Teintes multipliées sur la peau de l'homme (texture claire) : du très foncé au clair. */
const PEAUX = ['#5b3a29', '#7a4e36', '#8f5d3f', '#4a2e21', '#a8714d', '#e6c2a4'];
/** Teintes multipliées sur la veste et le pantalon de l'homme. */
const COSTUMES = ['#ffffff', '#3a4656', '#8a7a64', '#2b2f36', '#6b7f72', '#b9a88c'];
const choisir = <T>(liste: readonly T[], i: number) => liste[i % liste.length];

/** Vitesse (m/s) à laquelle le clip de marche est joué à vitesse normale. */
const VITESSE_CLIP = 1.25;

interface Gabarits {
  modeles: Record<Modele, Object3D>;
  marche: Record<Modele, AnimationClip>;
  attente: Record<Modele, AnimationClip>;
}

/**
 * Adapte un clip Mixamo à un autre personnage. Les os n'ont pas les mêmes axes d'un export à
 * l'autre (Ready Player Me, Mixamo selon le logiciel), mais tous sont au repos en T. On rejoue la source image par image et on applique à chaque os de la cible
 * la même rotation, mesurée dans le monde, par rapport à la pose de repos (en T) de la source.
 */
function adapterClip(clip: AnimationClip, modele: Object3D, source: Object3D) {
  const prefixe = modele.getObjectByName('mixamorigHips') ? 'mixamorig' : '';
  const paires: { os: Object3D; ref: Object3D; reposCible: Quaternion; reposSource: Quaternion; q: number[] }[] = [];
  const monde = (o: Object3D) => o.getWorldQuaternion(new Quaternion());
  const sauvegarde = new Map<Object3D, [Vector3, Quaternion]>();
  source.traverse((o) => sauvegarde.set(o, [o.position.clone(), o.quaternion.clone()]));
  const mixer = new AnimationMixer(source);
  const jouer = (c: AnimationClip, t: number) => {
    mixer.stopAllAction();
    mixer.clipAction(c).play();
    mixer.setTime(t);
    source.updateMatrixWorld(true);
  };

  // La source est dans sa pose de repos, en T.
  source.updateMatrixWorld(true);
  modele.updateMatrixWorld(true);
  modele.traverse((os) => {
    if (!(os as Bone).isBone) return;
    const ref = source.getObjectByName('mixamorig' + os.name.slice(prefixe.length));
    if (ref) paires.push({ os, ref, reposCible: monde(os), reposSource: monde(ref), q: [] });
  });
  const hanches = paires.find((p) => p.ref.name === 'mixamorigHips')!;
  // Les deux personnages ne regardent pas forcément dans la même direction : on construit, pour
  // chacun, un repère (gauche, haut) à partir des épaules et de la tête, et la rotation qui passe
  // de l'un à l'autre.
  const repere = (racine: Object3D, prefixe: string) => {
    const pos = (nom: string) => racine.getObjectByName(prefixe + nom)!.getWorldPosition(new Vector3());
    const gauche = pos('LeftArm').sub(pos('RightArm')).normalize();
    const haut = pos('Head').sub(pos('Hips'));
    const avant = new Vector3().crossVectors(gauche, haut).normalize();
    haut.crossVectors(avant, gauche).normalize();
    return new Quaternion().setFromRotationMatrix(new Matrix4().makeBasis(gauche, haut, avant));
  };
  const alignement = repere(modele, prefixe).multiply(repere(source, 'mixamorig').invert());
  const alignementInverse = alignement.clone().invert();
  const p = new Vector3();
  const ySource = hanches.ref.getWorldPosition(p).y;
  const reposMonde = hanches.os.getWorldPosition(new Vector3());
  const echelle = reposMonde.y / ySource;
  const reposLocal = new Map(paires.map((c) => [c.os, c.os.quaternion.clone()]));

  const images = Math.max(2, Math.round(clip.duration * 30) + 1);
  const temps: number[] = [];
  const positions: number[] = [];
  const wCible = new Quaternion();
  const parent = new Quaternion();
  for (let f = 0; f < images; f++) {
    const t = (f / (images - 1)) * clip.duration;
    temps.push(t);
    jouer(clip, t);
    // Les parents passent avant leurs enfants (ordre de traverse) : on pose la cible au fur et à mesure.
    for (const c of paires) {
      wCible
        .copy(alignement)
        .multiply(monde(c.ref))
        .multiply(c.reposSource.clone().invert())
        .multiply(alignementInverse)
        .multiply(c.reposCible);
      c.os.parent!.getWorldQuaternion(parent);
      c.os.quaternion.copy(parent.invert().multiply(wCible));
      c.os.updateMatrixWorld(true);
      c.q.push(...c.os.quaternion.toArray());
    }
    // Le bassin garde sa place mais monte et descend avec la foulée.
    const y = reposMonde.y + (hanches.ref.getWorldPosition(p).y - ySource) * echelle;
    const local = hanches.os.parent!.worldToLocal(reposMonde.clone().setY(y));
    positions.push(local.x, local.y, local.z);
  }
  mixer.stopAllAction();
  sauvegarde.forEach(([pos, q], o) => (o.position.copy(pos), o.quaternion.copy(q)));
  reposLocal.forEach((q, o) => o.quaternion.copy(q));
  modele.updateMatrixWorld(true);

  const pistes: KeyframeTrack[] = paires.map((c) => new QuaternionKeyframeTrack(c.os.name + '.quaternion', temps, c.q));
  pistes.push(new VectorKeyframeTrack(hanches.os.name + '.position', temps, positions));
  return new AnimationClip(clip.name, clip.duration, pistes);
}

function chargerGabarits(): Promise<Gabarits> {
  const loader = new GLTFLoader();
  loader.setMeshoptDecoder(MeshoptDecoder);
  const lire = (nom: string) => loader.loadAsync(URL_PERSONNES + nom + '.glb');
  return Promise.all([lire('mouvements'), ...MODELES.map(lire)]).then(([mouvements, ...gltfs]) => {
    const clip = (nom: string) => mouvements.animations.find((a) => a.name === nom)!;
    const g = { modeles: {}, marche: {}, attente: {} } as Gabarits;
    MODELES.forEach((m, i) => {
      const scene = gltfs[i].scene;
      g.modeles[m] = scene;
      const adapter = (nom: string) => adapterClip(clip(nom), scene, mouvements.scene);
      g.marche[m] = adapter('walk');
      g.attente[m] = adapter('idle');
    });
    return g;
  });
}

function creerPersonne(g: Gabarits, i: number, ombres: boolean) {
  const modele: Modele = i % 5 === 1 || i % 5 === 3 ? 'femme' : 'homme';
  const corps = cloner(g.modeles[modele]);
  const teinte = (couleur: string) => new Color(couleur);
  corps.traverse((o) => {
    const m = o as SkinnedMesh;
    if (!m.isMesh) return;
    m.castShadow = ombres;
    m.frustumCulled = false; // la boîte englobante d'un maillage animé ne suit pas le squelette
    const mat = (m.material as MeshStandardMaterial).clone();
    if (modele === 'homme') {
      if (/Skin|Body/.test(mat.name)) mat.color.copy(teinte(choisir(PEAUX, i)));
      if (/Outfit_(Top|Bottom)/.test(mat.name)) mat.color.copy(teinte(choisir(COSTUMES, i * 3 + 1)));
    }
    m.material = mat;
  });
  // Les deux modèles mesurent environ 1,72 m (femme) et 1,85 m (homme) ; légère variation.
  const taille = (modele === 'homme' ? 0.94 : 0.98) + ((i * 37) % 9) / 100;
  corps.scale.multiplyScalar(taille);

  const mixer = new AnimationMixer(corps);
  const marche = mixer.clipAction(g.marche[modele]);
  const attente = mixer.clipAction(g.attente[modele]);
  marche.play();
  attente.play();
  marche.time = (i * 0.29) % g.marche[modele].duration;
  attente.time = (i * 0.71) % g.attente[modele].duration;
  marche.setEffectiveWeight(0);
  return { corps, mixer, marche, attente, poids: { valeur: 0 } };
}

export function creerPromeneurs(ombres: boolean) {
  const groupe = new Group();
  groupe.name = 'Promeneurs';

  const acteurs = PROMENEURS.map((p, i) => {
    const racine = new Group();
    groupe.add(racine);
    // Longueurs cumulées du chemin.
    const longueurs = [0];
    for (let k = 1; k < p.chemin.length; k++) {
      const [ax, az] = p.chemin[k - 1];
      const [bx, bz] = p.chemin[k];
      longueurs.push(longueurs[k - 1] + Math.hypot(bx - ax, bz - az));
    }
    const total = longueurs[longueurs.length - 1];
    const vitesse = p.vitesse ?? 1.1;
    const arret = p.arret ?? 0;
    // Un cycle : aller, arrêt, retour, arrêt.
    const cycle = total ? 2 * (total / vitesse + arret) : 1;
    const cap = { valeur: p.regardDebut ?? 0 };
    return { p, s: null as ReturnType<typeof creerPersonne> | null, racine, longueurs, total, vitesse, arret, cycle, decalage: (p.depart ?? 0) * cycle + i * 0.37, cap };
  });

  const placer = (a: (typeof acteurs)[number], d: number) => {
    // Position à la distance d le long du chemin.
    const { chemin } = a.p;
    let k = 1;
    while (k < a.longueurs.length - 1 && a.longueurs[k] < d) k++;
    const [ax, az] = chemin[k - 1];
    const [bx, bz] = chemin[k];
    const l = a.longueurs[k] - a.longueurs[k - 1] || 1;
    const f = MathUtils.clamp((d - a.longueurs[k - 1]) / l, 0, 1);
    a.racine.position.set(ax + (bx - ax) * f, a.p.sol, az + (bz - az) * f);
    return Math.atan2(bx - ax, bz - az);
  };

  chargerGabarits()
    .then((g) => {
      acteurs.forEach((a, i) => {
        a.s = creerPersonne(g, i, ombres);
        a.racine.add(a.s.corps);
      });
    })
    .catch((e) => console.warn('Promeneurs : personnages indisponibles', e));

  let precedent = 0;
  return {
    groupe,
    mettreAJour(temps: number) {
      const dt = Math.min(0.1, Math.max(0, temps - precedent));
      precedent = temps;
      for (const a of acteurs) {
        const { s, p } = a;
        let marche = false;
        let capVoulu = a.cap.valeur;
        let distance = 0;
        if (!a.total) {
          const [x, z] = p.chemin[0];
          a.racine.position.set(x, p.sol, z);
          capVoulu = p.regardDebut ?? 0;
        } else {
          const t = (temps + a.decalage) % a.cycle;
          const aller = a.total / a.vitesse;
          if (t < aller) {
            distance = t * a.vitesse;
            capVoulu = placer(a, distance);
            marche = true;
          } else if (t < aller + a.arret) {
            placer(a, a.total);
            capVoulu = p.regardFin ?? a.cap.valeur;
          } else if (t < 2 * aller + a.arret) {
            distance = a.total - (t - aller - a.arret) * a.vitesse;
            capVoulu = placer(a, distance) + Math.PI;
            marche = true;
          } else {
            placer(a, 0);
            capVoulu = p.regardDebut ?? a.cap.valeur;
          }
        }
        // Le corps tourne en douceur vers sa direction.
        let ecart = capVoulu - a.cap.valeur;
        ecart = Math.atan2(Math.sin(ecart), Math.cos(ecart));
        a.cap.valeur += ecart * (1 - Math.exp(-5 * dt));
        a.racine.rotation.y = a.cap.valeur;

        // Fondu entre la marche et l'attente ; la marche suit la vitesse du visiteur.
        if (!s) continue;
        s.poids.valeur = MathUtils.damp(s.poids.valeur, marche ? 1 : 0, 6, dt);
        s.marche.setEffectiveWeight(s.poids.valeur);
        s.attente.setEffectiveWeight(1 - s.poids.valeur);
        s.marche.timeScale = a.vitesse / VITESSE_CLIP;
        s.mixer.update(dt);
      }
    },
  };
}
