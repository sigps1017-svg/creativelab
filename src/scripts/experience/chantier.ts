import {
  Color,
  EdgesGeometry,
  Fog,
  GridHelper,
  LineBasicMaterial,
  LineSegments,
  Material,
  Mesh,
  Object3D,
  Plane,
  Scene,
  Vector3,
} from 'three';
import gsap from 'gsap';

// Ouverture du site : le bâtiment apparaît d'abord en plan d'architecte (traits blancs sur fond
// bleu, grille au sol), dessiné du sol vers le toit ; les matériaux réels montent ensuite derrière
// les traits, le ciel remplace le bleu, puis les traits s'effacent.

export const BLEU_PLAN = new Color('#0f3557');
const HAUT = 50; // au-delà de tout (bâtiment, arbres, ville)

interface Options {
  scene: Scene;
  monde: Object3D;
  ciel: Color;
  /** Décalage de caméra animé : la caméra glisse vers sa place pendant la construction. */
  decalage: Vector3;
  quandFini: () => void;
  /** Vitesse de l'animation (1 = normale), réglable par ?intro=0.1 pour la vérifier. */
  vitesse?: number;
}

export function jouerChantier({ scene, monde, ciel, decalage, quandFini, vitesse = 1 }: Options) {
  // Les plans de coupe : on garde ce qui est sous la hauteur h (normale vers le bas).
  const coupeTraits = new Plane(new Vector3(0, -1, 0), -0.5);
  const coupeReel = new Plane(new Vector3(0, -1, 0), -0.5);

  const trait = new LineBasicMaterial({
    color: '#dcefff',
    transparent: true,
    opacity: 0.8,
    depthWrite: false,
    clippingPlanes: [coupeTraits],
  });
  const traits: LineSegments[] = [];
  const materiaux = new Set<Material>();
  monde.traverse((o) => {
    if (!(o instanceof Mesh) || !o.visible) return;
    const l = new LineSegments(new EdgesGeometry(o.geometry, 30), trait);
    l.renderOrder = 2;
    o.add(l);
    traits.push(l);
    (Array.isArray(o.material) ? o.material : [o.material]).forEach((m) => materiaux.add(m));
  });
  materiaux.forEach((m) => {
    m.clippingPlanes = [coupeReel];
    m.clipShadows = true;
    m.needsUpdate = true;
  });

  const grille = new GridHelper(240, 120, '#8cc0f0', '#3f73a3');
  grille.position.y = 0.03;
  const matGrille = grille.material as Material;
  matGrille.transparent = true;
  matGrille.opacity = 0.55;
  matGrille.depthWrite = false;
  scene.add(grille);

  const fond = new Color().copy(BLEU_PLAN);
  const brouillard = scene.fog as Fog | null;
  scene.background = fond;
  const ambiance = { ciel: 0 };
  const peindre = () => {
    fond.copy(BLEU_PLAN).lerp(ciel, ambiance.ciel);
    brouillard?.color.copy(fond);
  };
  peindre();

  const finir = () => {
    traits.forEach((l) => {
      l.removeFromParent();
      l.geometry.dispose();
    });
    trait.dispose();
    grille.removeFromParent();
    grille.dispose();
    materiaux.forEach((m) => {
      m.clippingPlanes = null;
      m.clipShadows = false;
      m.needsUpdate = true;
    });
    scene.background = ciel;
    brouillard?.color.copy(ciel);
    quandFini();
  };

  const depart = decalage.clone();
  const tl = gsap.timeline({ onComplete: finir }).timeScale(vitesse);
  tl.to(coupeTraits, { constant: HAUT, duration: 3.2, ease: 'power2.in' }, 0);
  tl.to(coupeReel, { constant: HAUT, duration: 3.2, ease: 'power2.in' }, 1.8);
  tl.to(ambiance, { ciel: 1, duration: 2.4, ease: 'power1.inOut', onUpdate: peindre }, 3);
  tl.to(matGrille, { opacity: 0, duration: 1.6 }, 3.4);
  tl.to(trait, { opacity: 0, duration: 1.4, ease: 'power1.in' }, 4.6);
  tl.fromTo(decalage, { x: depart.x, y: depart.y, z: depart.z }, { x: 0, y: 0, z: 0, duration: 6, ease: 'power2.out' }, 0);

  return {
    /** Accélère la fin (le visiteur fait défiler ou clique). */
    presser() {
      tl.timeScale(5);
    },
  };
}
