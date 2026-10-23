import {
  ACESFilmicToneMapping,
  DirectionalLight,
  Fog,
  HemisphereLight,
  LoadingManager,
  MathUtils,
  Mesh,
  PCFShadowMap,
  PerspectiveCamera,
  PMREMGenerator,
  Raycaster,
  Scene,
  Timer,
  SRGBColorSpace,
  Vector2,
  Vector3,
  WebGLRenderer,
} from 'three';
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js';
import { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer.js';
import { GTAOPass } from 'three/examples/jsm/postprocessing/GTAOPass.js';
import { OutputPass } from 'three/examples/jsm/postprocessing/OutputPass.js';
import { RenderPass } from 'three/examples/jsm/postprocessing/RenderPass.js';
import gsap from 'gsap';
import { ScrollTrigger } from 'gsap/ScrollTrigger';
import Lenis from 'lenis';
import type { MembreMur, ProjetGalerie } from './batiment';
import { chargerBatiment } from './modele';
import { ambiancePour, heureDuVisiteur } from './lumiere';
import {
  dansLaGalerie,
  devantLEquipe,
  espaceDepuisVue,
  mesurerAncres,
  scrollPourEspace,
  vueA,
  vueDepuisScroll,
} from './parcours';

gsap.registerPlugin(ScrollTrigger);

export function demarrerExperience() {
  const canvas = document.getElementById('scene') as HTMLCanvasElement;
  const sections = Array.from(document.querySelectorAll<HTMLElement>('.parcours > section'));
  const boutonsPlan = Array.from(document.querySelectorAll<HTMLButtonElement>('.plan-etages button'));
  const infobulle = document.getElementById('infobulle')!;
  const voile = document.getElementById('voile')!;
  const fiche = document.getElementById('fiche-membre') as HTMLDialogElement;
  const projets: ProjetGalerie[] = JSON.parse(document.getElementById('donnees-galerie')!.textContent || '[]');
  const equipe: (MembreMur & { description: string; email?: string })[] = JSON.parse(
    document.getElementById('donnees-equipe')?.textContent || '[]',
  );

  const mobile = matchMedia('(pointer: coarse)').matches || innerWidth < 760;

  // ---- Rendu ----
  const renderer = new WebGLRenderer({ canvas, antialias: !mobile, powerPreference: 'high-performance' });
  renderer.setPixelRatio(Math.min(devicePixelRatio, mobile ? 1.5 : 2));
  renderer.setSize(innerWidth, innerHeight);
  renderer.outputColorSpace = SRGBColorSpace;
  renderer.toneMapping = ACESFilmicToneMapping;
  renderer.toneMappingExposure = 0.8;
  renderer.shadowMap.enabled = !mobile;
  renderer.shadowMap.type = PCFShadowMap;

  const scene = new Scene();
  const pmrem = new PMREMGenerator(renderer);
  scene.environment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
  scene.environmentIntensity = 0.3;

  // Écran en portrait (téléphone) : on élargit le champ de vision pour garder le bâtiment en vue.
  const champPour = (aspect: number) => (aspect < 1 ? 72 : mobile ? 60 : 50);
  const camera = new PerspectiveCamera(champPour(innerWidth / innerHeight), innerWidth / innerHeight, 0.1, 900);
  camera.layers.enable(1);

  // Ombres de contact (occlusion ambiante) sur ordinateur : coins, pieds de meubles, dessous des
  // dalles. Le verre (calque 1) en est exclu, sinon il assombrirait ce qu'il y a derrière.
  const cameraOmbres = camera.clone();
  let composer: EffectComposer | null = null;
  if (!mobile) {
    composer = new EffectComposer(renderer);
    composer.addPass(new RenderPass(scene, camera));
    const ao = new GTAOPass(scene, cameraOmbres, innerWidth, innerHeight);
    ao.updateGtaoMaterial({ radius: 0.8, distanceExponent: 1.5, thickness: 1, scale: 1.2 });
    ao.blendIntensity = 0.9;
    composer.addPass(ao);
    composer.addPass(new OutputPass());
  }

  // ---- Lumière selon l'heure du visiteur ----
  const ambiance = ambiancePour(heureDuVisiteur());
  scene.background = ambiance.ciel;
  scene.fog = new Fog(ambiance.ciel, 80, 420);

  const soleil = new DirectionalLight(ambiance.soleilCouleur, ambiance.soleilIntensite);
  soleil.position.copy(ambiance.soleilPosition);
  soleil.castShadow = !mobile;
  soleil.shadow.mapSize.set(2048, 2048);
  soleil.shadow.camera.left = -45;
  soleil.shadow.camera.right = 45;
  soleil.shadow.camera.top = 45;
  soleil.shadow.camera.bottom = -45;
  soleil.shadow.camera.far = 220;
  soleil.shadow.bias = -0.0004;
  scene.add(soleil);
  // Lumière du ciel par le haut, rebond plus chaud du sol par le bas : les volumes restent lisibles.
  scene.add(new HemisphereLight(ambiance.ciel, '#8c7f6c', ambiance.ambiante * 1.6));

  // ---- Chargement ----
  const chargement = document.getElementById('chargement')!;
  const pourcent = document.getElementById('chargement-pourcent')!;
  const manager = new LoadingManager();
  let ouvert = false;
  const ouvrir = () => {
    if (ouvert) return;
    ouvert = true;
    chargement.classList.add('fini');
  };
  manager.onProgress = (_url, charges, total) => {
    pourcent.textContent = `${Math.round((charges / total) * 100)} %`;
  };
  manager.onLoad = ouvrir;
  // Les images ne doivent jamais bloquer l'entrée : on ouvre au plus tard après 6 s.
  setTimeout(ouvrir, 6000);

  const batiment = chargerBatiment(projets, equipe, manager, !mobile);
  batiment.reglerNuit(ambiance.nuit);
  scene.add(batiment.groupe);
  if (projets.length === 0) ouvrir();

  // ---- Défilement fluide et caméra ----
  const lenis = new Lenis({ lerp: 0.09, anchors: true });
  lenis.on('scroll', ScrollTrigger.update);
  gsap.ticker.add((t) => lenis.raf(t * 1000));
  gsap.ticker.lagSmoothing(0);

  const mesurer = () => mesurerAncres(sections);
  mesurer();
  ScrollTrigger.addEventListener('refresh', mesurer);

  let vueCible = vueDepuisScroll(scrollY);
  let vue = vueCible;
  const pos = new Vector3();
  const cible = new Vector3();
  const regard = new Vector3();
  vueA(vue, pos, cible);
  camera.position.copy(pos);
  regard.copy(cible);

  // Petit décalage du regard avec la souris, pour donner de la vie à la scène.
  const souris = new Vector2();
  const sourisLissee = new Vector2();

  // Pendant l'entrée dans un projet, la caméra n'obéit plus au défilement.
  let enTransition = false;

  // ---- Apparition des cartes de texte ----
  sections.forEach((s) => {
    const carte = s.querySelector('.carte');
    if (!carte) return;
    gsap.from(carte, {
      autoAlpha: 0,
      y: 40,
      duration: 1,
      ease: 'power3.out',
      scrollTrigger: { trigger: s, start: 'top 70%', toggleActions: 'play none none reverse' },
    });
  });

  // ---- Plan des étages ----
  boutonsPlan.forEach((b) => {
    b.addEventListener('click', () => {
      lenis.scrollTo(scrollPourEspace(Number(b.dataset.espace)), { duration: 2.2 });
    });
  });
  let espaceActif = -1;
  const majPlan = (k: number) => {
    const e = espaceDepuisVue(k);
    if (e === espaceActif) return;
    espaceActif = e;
    boutonsPlan.forEach((b, i) => b.classList.toggle('actif', i === e));
  };

  // ---- Cadres des projets et portraits de l'équipe : survol et clic ----
  const raycaster = new Raycaster();
  const pointeur = new Vector2(2, 2);
  let survole: Mesh | null = null;

  addEventListener('pointermove', (e) => {
    pointeur.set((e.clientX / innerWidth) * 2 - 1, -(e.clientY / innerHeight) * 2 + 1);
    souris.set(pointeur.x, pointeur.y);
    infobulle.style.left = `${e.clientX}px`;
    infobulle.style.top = `${e.clientY}px`;
  });

  const majSurvol = () => {
    let touche: Mesh | null = null;
    const cibles = enTransition ? [] : dansLaGalerie(vue) ? batiment.cadres : devantLEquipe(vue) ? batiment.portraits : [];
    if (cibles.length) {
      raycaster.setFromCamera(pointeur, camera);
      touche = (raycaster.intersectObjects(cibles, false)[0]?.object as Mesh) ?? null;
    }
    if (touche === survole) return;
    // Le modèle compressé porte une échelle sur chaque objet : on grossit par rapport à elle.
    const grossir = (m: Mesh, f: number) => {
      m.userData.echelle ??= m.scale.x;
      const e = m.userData.echelle * f;
      gsap.to(m.scale, { x: e, y: e, duration: 0.4 });
    };
    if (survole) grossir(survole, 1);
    survole = touche;
    if (survole) {
      grossir(survole, 1.04);
      const membre = survole.userData.membre !== undefined;
      infobulle.textContent = `${membre ? 'Découvrir' : 'Entrer dans'} ${survole.userData.titre}`;
    }
    infobulle.classList.toggle('visible', !!survole);
    document.body.style.cursor = survole ? 'pointer' : '';
  };

  const entrerDansProjet = (cadre: Mesh) => {
    enTransition = true;
    infobulle.classList.remove('visible');
    lenis.stop();
    const p = cadre.getWorldPosition(new Vector3());
    const tl = gsap.timeline({
      onComplete: () => {
        location.href = `/projets/${cadre.userData.slug}`;
      },
    });
    tl.to(camera.position, { x: p.x, y: p.y, z: p.z + 1.1, duration: 1.4, ease: 'power3.inOut' }, 0);
    tl.to(regard, { x: p.x, y: p.y, z: p.z, duration: 1.2, ease: 'power3.inOut' }, 0);
    tl.to(camera, { fov: 35, duration: 1.4, ease: 'power3.inOut', onUpdate: () => camera.updateProjectionMatrix() }, 0);
    tl.to(voile, { opacity: 1, duration: 0.5, ease: 'power1.in' }, 1);
  };

  // Portrait : la caméra s'approche, puis la fiche s'ouvre ; à la fermeture, elle revient.
  // Dans la fiche, les flèches passent au membre précédent ou suivant (la caméra suit).
  let membreOuvert = 0;

  const viserPortrait = (i: number, duree: number) => {
    const tl = gsap.timeline();
    const portrait = batiment.portraits[i];
    if (!portrait) return tl;
    const p = portrait.getWorldPosition(new Vector3());
    tl.to(camera.position, { x: p.x, y: p.y, z: p.z + 2.6, duration: duree, ease: 'power3.inOut' }, 0);
    tl.to(regard, { x: p.x, y: p.y, z: p.z, duration: duree * 0.9, ease: 'power3.inOut' }, 0);
    return tl;
  };

  const approcherMembre = (portrait: Mesh) => {
    const i = portrait.userData.membre as number;
    if (!equipe[i]) return;
    enTransition = true;
    infobulle.classList.remove('visible');
    document.body.style.cursor = '';
    lenis.stop();
    viserPortrait(i, 1.2).eventCallback('onComplete', () => {
      afficherMembre(i);
      fiche.showModal();
    });
  };

  const afficherMembre = (i: number) => {
    membreOuvert = i;
    const m = equipe[i];
    const img = fiche.querySelector('img')!;
    img.src = m.photo;
    img.alt = `Portrait de ${m.nom}`;
    fiche.querySelector('.surtitre')!.textContent = m.role;
    fiche.querySelector('h2')!.textContent = m.nom;
    fiche.querySelector('.fiche-texte')!.textContent = m.description;
    const lien = fiche.querySelector<HTMLAnchorElement>('.fiche-email')!;
    lien.hidden = !m.email;
    lien.href = m.email ? `mailto:${m.email}` : '';
    lien.textContent = m.email ?? '';
    fiche.querySelector('.fiche-compteur')!.textContent = `${i + 1} / ${equipe.length}`;
  };

  const changerMembre = (sens: number) => {
    const i = (membreOuvert + sens + equipe.length) % equipe.length;
    afficherMembre(i);
    gsap.fromTo(fiche.children, { opacity: 0.2 }, { opacity: 1, duration: 0.45, ease: 'power2.out' });
    viserPortrait(i, 0.8);
  };

  fiche.querySelector('.fiche-precedent')!.addEventListener('click', () => changerMembre(-1));
  fiche.querySelector('.fiche-suivant')!.addEventListener('click', () => changerMembre(1));
  fiche.addEventListener('keydown', (e) => {
    if (e.key === 'ArrowLeft') changerMembre(-1);
    if (e.key === 'ArrowRight') changerMembre(1);
  });

  fiche.addEventListener('close', () => {
    vueA(vue, pos, cible);
    gsap.to(camera.position, { x: pos.x, y: pos.y, z: pos.z, duration: 1, ease: 'power3.inOut' });
    gsap.to(regard, {
      x: cible.x,
      y: cible.y,
      z: cible.z,
      duration: 1,
      ease: 'power3.inOut',
      onComplete: () => {
        enTransition = false;
        lenis.start();
      },
    });
  });
  // Un clic sur le fond sombre, hors de la fiche, la ferme aussi.
  fiche.addEventListener('click', (e) => {
    if (e.target === fiche) fiche.close();
  });

  canvas.addEventListener('click', () => {
    if (!survole) return;
    if (survole.userData.membre !== undefined) approcherMembre(survole);
    else entrerDansProjet(survole);
  });
  // Sur écran tactile, il n'y a pas de survol : on teste le point touché.
  canvas.addEventListener('pointerdown', (e) => {
    if (e.pointerType === 'mouse') return;
    pointeur.set((e.clientX / innerWidth) * 2 - 1, -(e.clientY / innerHeight) * 2 + 1);
    majSurvol();
  });

  // Les cadres sont dessinés sur le canvas, sous les cartes HTML : on laisse passer les clics
  // vers le canvas partout où il n'y a pas de carte.
  canvas.style.pointerEvents = 'auto';

  // Retour arrière depuis une page projet (cache du navigateur) : on rétablit la scène.
  addEventListener('pageshow', (e) => {
    if (!e.persisted) return;
    enTransition = false;
    camera.fov = champPour(camera.aspect);
    camera.updateProjectionMatrix();
    gsap.set(voile, { opacity: 0 });
    lenis.start();
  });

  // ---- Boucle ----
  const horloge = new Timer();
  renderer.setAnimationLoop((temps) => {
    horloge.update(temps);
    const dt = Math.min(horloge.getDelta(), 0.1);
    if (!enTransition) {
      vueCible = vueDepuisScroll(lenis.scroll);
      vue = MathUtils.damp(vue, vueCible, 4, dt);
      vueA(vue, pos, cible);
      sourisLissee.lerp(souris, 1 - Math.exp(-3 * dt));
      cible.x += sourisLissee.x * 0.8;
      cible.y += sourisLissee.y * 0.4;
      camera.position.copy(pos);
      regard.copy(cible);
    }
    camera.lookAt(regard);
    majSurvol();
    majPlan(vueCible);
    if (composer) {
      cameraOmbres.copy(camera);
      cameraOmbres.layers.set(0);
      composer.render();
    } else {
      renderer.render(scene, camera);
    }
  });

  addEventListener('resize', () => {
    camera.aspect = innerWidth / innerHeight;
    camera.fov = champPour(camera.aspect);
    camera.updateProjectionMatrix();
    renderer.setSize(innerWidth, innerHeight);
    composer?.setSize(innerWidth, innerHeight);
    ScrollTrigger.refresh();
  });

  // Arrivée directe sur une section (ex. /#projets depuis une page projet) : on y place la caméra.
  if (location.hash) {
    const i = sections.findIndex((s) => `#${s.id}` === location.hash);
    if (i >= 0) {
      lenis.scrollTo(scrollPourEspace(i), { immediate: true });
      vue = vueDepuisScroll(scrollPourEspace(i));
    }
  }
}
