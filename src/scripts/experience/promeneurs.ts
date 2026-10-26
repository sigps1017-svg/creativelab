import { BufferGeometry, CapsuleGeometry, Group, MathUtils, Mesh, MeshStandardMaterial, SphereGeometry } from 'three';

// Des visiteurs donnent vie au bâtiment : passants sur le parvis, curieux devant les tableaux de la
// galerie, architectes à l'atelier, quelqu'un qui admire la vue sur le toit. Silhouettes simples
// à l'échelle humaine (1,60 à 1,85 m), habillées de teintes sobres ; elles marchent, s'arrêtent,
// regardent, puis repartent. Leurs chemins évitent le mobilier du modèle (repéré dans le .glb).

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

const HAUTS = ['#2f3a4a', '#c9c2b5', '#6b4f3a', '#3f5a4c', '#a8553f', '#e8e4dc', '#1f2226', '#7c8a96', '#b08d57'];
const BAS = ['#23272e', '#4a4f57', '#6d6458', '#2e3b52', '#d8d2c6', '#3a3330'];
const PEAUX = ['#f1c9a5', '#d9a77f', '#a8714d', '#7a4b2f', '#5a3522'];
const CHEVEUX = ['#1b1512', '#3b2a1e', '#6e4b2e', '#9b9b9b', '#c8a26b'];

const choisir = <T>(liste: T[], i: number) => liste[i % liste.length];

const geo = {
  jambe: new CapsuleGeometry(0.068, 0.72, 4, 8).translate(0, -0.43, 0),
  bras: new CapsuleGeometry(0.048, 0.55, 4, 8).translate(0, -0.32, 0),
  buste: new CapsuleGeometry(0.16, 0.37, 4, 12).scale(1.2, 1, 0.72),
  tete: new SphereGeometry(0.105, 16, 12),
  cheveux: new SphereGeometry(0.113, 16, 8, 0, Math.PI * 2, 0, Math.PI * 0.55),
};

function creerSilhouette(i: number, ombres: boolean) {
  const mat = (couleur: string, rugosite = 0.85) => new MeshStandardMaterial({ color: couleur, roughness: rugosite });
  const haut = mat(choisir(HAUTS, i * 5 + 2));
  const bas = mat(choisir(BAS, i * 3 + 1));
  const peau = mat(choisir(PEAUX, i * 7 + 3), 0.6);
  const cheveux = mat(choisir(CHEVEUX, i * 2 + 1), 0.7);

  const corps = new Group();
  const ajouter = (g: BufferGeometry, m: MeshStandardMaterial, x: number, y: number, z = 0) => {
    const me = new Mesh(g, m);
    me.position.set(x, y, z);
    me.castShadow = ombres;
    corps.add(me);
    return me;
  };
  const jambeG = ajouter(geo.jambe, bas, 0.09, 0.88);
  const jambeD = ajouter(geo.jambe, bas, -0.09, 0.88);
  ajouter(geo.buste, haut, 0, 1.2);
  const brasG = ajouter(geo.bras, haut, 0.235, 1.47);
  const brasD = ajouter(geo.bras, haut, -0.235, 1.47);
  brasG.rotation.z = 0.06;
  brasD.rotation.z = -0.06;
  const tete = ajouter(geo.tete, peau, 0, 1.66);
  const coiffe = new Mesh(geo.cheveux, cheveux);
  coiffe.position.set(0, 0.015, -0.01);
  coiffe.rotation.x = -0.25;
  tete.add(coiffe);

  const taille = 0.92 + ((i * 37) % 13) / 100; // de 1,60 à 1,82 m environ
  corps.scale.setScalar(taille);
  return { corps, jambeG, jambeD, brasG, brasD, tete };
}

export function creerPromeneurs(ombres: boolean) {
  const groupe = new Group();
  groupe.name = 'Promeneurs';

  const acteurs = PROMENEURS.map((p, i) => {
    const s = creerSilhouette(i, ombres);
    const racine = new Group();
    racine.add(s.corps);
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
    return { p, s, racine, longueurs, total, vitesse, arret, cycle, decalage: (p.depart ?? 0) * cycle + i * 0.37, cap };
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

        // Foulée : environ 1,4 m par cycle de pas ; à l'arrêt, un léger balancement.
        const phase = marche ? (distance / 1.4) * Math.PI * 2 : 0;
        const ampleur = marche ? 1 : 0;
        const pas = Math.sin(phase) * ampleur;
        s.jambeG.rotation.x = MathUtils.damp(s.jambeG.rotation.x, 0.42 * pas, 12, dt);
        s.jambeD.rotation.x = MathUtils.damp(s.jambeD.rotation.x, -0.42 * pas, 12, dt);
        s.brasG.rotation.x = MathUtils.damp(s.brasG.rotation.x, -0.32 * pas, 12, dt);
        s.brasD.rotation.x = MathUtils.damp(s.brasD.rotation.x, 0.32 * pas, 12, dt);
        s.corps.position.y = marche ? 0.025 * Math.abs(Math.cos(phase)) : 0;
        const respiration = Math.sin(temps * 0.9 + a.decalage);
        s.corps.rotation.z = marche ? 0 : 0.012 * respiration;
        s.tete.rotation.y = marche ? 0 : 0.25 * Math.sin(temps * 0.21 + a.decalage);
      }
    },
  };
}
