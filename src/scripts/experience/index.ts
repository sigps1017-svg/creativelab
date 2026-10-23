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
import {
  ambiancePour,
  enregistrerMode,
  estLaNuit,
  heurePourMode,
  modeEnregistre,
  MODES,
  type Ambiance,
} from './lumiere';
import {
  dansLaGalerie,
  devantLEquipe,
  espaceDepuisVue,
  mesurerAncres,
  scrollPourEspace,
  vueA,
  vueDepuisScroll,
} from './parcours';
import { creerVisite } from './visite';
import { jouerChantier } from './chantier';

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
  renderer.localClippingEnabled = true; // construction du bâtiment à l'ouverture

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

  // ---- Lumière : l'heure du visiteur, ou le jour / la nuit qu'il a choisi ----
  let modeLumiere = modeEnregistre();
  const ambiance = ambiancePour(heurePourMode(modeLumiere));
  const ciel = ambiance.ciel.clone(); // couleur courante du ciel, animée au changement de mode
  scene.background = ciel;
  scene.fog = new Fog(ciel, 80, 420);

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
  const hemi = new HemisphereLight(ciel, '#8c7f6c', ambiance.ambiante * 1.6);
  scene.add(hemi);
  // La nuit, moins de reflets du ciel et une exposition plus basse : les lampes ressortent.
  const reglerReflets = (nuit: number) => {
    scene.environmentIntensity = 0.3 - 0.22 * nuit;
    renderer.toneMappingExposure = 0.8 - 0.12 * nuit;
  };
  reglerReflets(ambiance.nuit);
  let nuitCourante = ambiance.nuit;

  // ---- Chargement ----
  const chargement = document.getElementById('chargement')!;
  const pourcent = document.getElementById('chargement-pourcent')!;
  const manager = new LoadingManager();
  document.documentElement.classList.add('intro');
  let chantier: ReturnType<typeof jouerChantier> | null = null;
  let ouvert = false;
  const ouvrir = () => {
    if (ouvert) return;
    ouvert = true;
    chargement.classList.add('fini');
    document.documentElement.classList.remove('intro');
  };
  manager.onProgress = (_url, charges, total) => {
    pourcent.textContent = `${Math.round((charges / total) * 100)} %`;
  };
  // Si le modèle tarde trop, on ouvre quand même (sauf si la construction a commencé).
  setTimeout(() => chantier || ouvrir(), 15000);

  const batiment = chargerBatiment(projets, equipe, manager, !mobile);
  batiment.reglerNuit(ambiance.nuit);
  scene.add(batiment.groupe);

  // Dès que le bâtiment est là, il se construit à partir de son plan (voir chantier.ts) ;
  // les images des projets continuent d'arriver pendant ce temps.
  const decalageIntro = new Vector3();
  batiment.pret.then(() => {
    if (ouvert) return;
    if (matchMedia('(prefers-reduced-motion: reduce)').matches) return ouvrir();
    chargement.classList.add('chantier');
    chargement.querySelector('p')!.textContent = 'Construction du bâtiment';
    decalageIntro.set(-10, 12, 16);
    chantier = jouerChantier({
      scene,
      monde: batiment.groupe,
      ciel,
      decalage: decalageIntro,
      vitesse: Number(new URLSearchParams(location.search).get('intro')) || 1,
      quandFini: () => {
        chantier = null;
        ouvrir();
      },
    });
  });
  // Le visiteur pressé (défilement, clic, touche) accélère la fin de la construction.
  for (const evenement of ['wheel', 'touchstart', 'keydown', 'pointerdown']) {
    addEventListener(evenement, () => chantier?.presser(), { passive: true });
  }

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
    const cibles = enTransition
      ? []
      : visite.actif
        ? [...batiment.cadres, ...batiment.portraits]
        : dansLaGalerie(vue)
          ? batiment.cadres
          : devantLEquipe(vue)
            ? batiment.portraits
            : [];
    if (cibles.length) {
      raycaster.setFromCamera(pointeur, camera);
      // En visite libre, on ne vise que ce qui est assez proche pour être regardé.
      raycaster.far = visite.actif ? 9 : Infinity;
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
    if (visite.actif) {
      // En visite libre, le visiteur est déjà devant le mur : la fiche s'ouvre sur place.
      afficherMembre(i);
      fiche.showModal();
      return;
    }
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
    if (!visite.actif) viserPortrait(i, 0.8);
  };

  fiche.querySelector('.fiche-precedent')!.addEventListener('click', () => changerMembre(-1));
  fiche.querySelector('.fiche-suivant')!.addEventListener('click', () => changerMembre(1));
  fiche.addEventListener('keydown', (e) => {
    if (e.key === 'ArrowLeft') changerMembre(-1);
    if (e.key === 'ArrowRight') changerMembre(1);
  });

  /** Ramène la caméra en douceur sur le parcours guidé, puis rend la main au défilement. */
  const revenirAuParcours = () => {
    enTransition = true;
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
  };

  fiche.addEventListener('close', () => {
    if (!visite.actif) revenirAuParcours();
  });
  // Un clic sur le fond sombre, hors de la fiche, la ferme aussi.
  fiche.addEventListener('click', (e) => {
    if (e.target === fiche) fiche.close();
  });

  // Un glisser pour regarder autour (visite libre) n'est pas un clic sur un cadre.
  const appui = new Vector2();
  canvas.addEventListener('pointerdown', (e) => appui.set(e.clientX, e.clientY));
  canvas.addEventListener('click', (e) => {
    if (!survole || Math.hypot(e.clientX - appui.x, e.clientY - appui.y) > 6) return;
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

  // ---- Jour / nuit ----
  const changerAmbiance = (cible: Ambiance, duree = 1.8) => {
    const d = {
      ciel: ciel.clone(),
      soleil: soleil.color.clone(),
      intensite: soleil.intensity,
      position: soleil.position.clone(),
      ambiante: hemi.intensity,
      nuit: nuitCourante,
    };
    const p = { t: 0 };
    gsap.to(p, {
      t: 1,
      duration: duree,
      ease: 'power2.inOut',
      onUpdate: () => {
        const t = p.t;
        ciel.copy(d.ciel).lerp(cible.ciel, t);
        // Pendant la construction, le fond bleu du plan garde la main sur le brouillard.
        if (!chantier) (scene.fog as Fog).color.copy(ciel);
        hemi.color.copy(ciel);
        soleil.color.copy(d.soleil).lerp(cible.soleilCouleur, t);
        soleil.intensity = MathUtils.lerp(d.intensite, cible.soleilIntensite, t);
        soleil.position.lerpVectors(d.position, cible.soleilPosition, t);
        hemi.intensity = MathUtils.lerp(d.ambiante, cible.ambiante * 1.6, t);
        nuitCourante = MathUtils.lerp(d.nuit, cible.nuit, t);
        batiment.reglerNuit(nuitCourante);
        reglerReflets(nuitCourante);
      },
    });
  };

  const boutonLumiere = document.getElementById('bascule-lumiere') as HTMLButtonElement | null;
  const majBoutonLumiere = () => {
    if (!boutonLumiere) return;
    const nuit = modeLumiere === 'nuit' || (modeLumiere === 'auto' && estLaNuit(heurePourMode('auto')));
    const nom = { auto: 'Auto', jour: 'Jour', nuit: 'Nuit' }[modeLumiere];
    boutonLumiere.textContent = `${nuit ? '☾' : '☀'} ${nom}`;
    boutonLumiere.title =
      modeLumiere === 'auto' ? `Lumière selon votre heure (${nuit ? 'nuit' : 'jour'}) : cliquez pour choisir` : `Mode ${nom.toLowerCase()} : cliquez pour changer`;
    boutonLumiere.setAttribute('aria-label', `Lumière : ${boutonLumiere.title}`);
  };
  if (boutonLumiere) {
    boutonLumiere.hidden = false;
    majBoutonLumiere();
    // Auto → Jour → Nuit → Auto
    boutonLumiere.addEventListener('click', () => {
      modeLumiere = MODES[(MODES.indexOf(modeLumiere) + 1) % MODES.length];
      enregistrerMode(modeLumiere);
      changerAmbiance(ambiancePour(heurePourMode(modeLumiere)));
      majBoutonLumiere();
    });
  }
  // En automatique, la lumière suit l'heure qui passe pendant la visite.
  setInterval(() => {
    if (modeLumiere !== 'auto') return;
    changerAmbiance(ambiancePour(heurePourMode('auto')), 6);
    majBoutonLumiere();
  }, 5 * 60 * 1000);

  // ---- Visite libre ----
  const panneauVisite = document.getElementById('visite')!;
  const visite = creerVisite({
    camera,
    canvas,
    monde: batiment.groupe,
    joystick: panneauVisite.querySelector('.visite-joystick'),
  });
  const entrerVisite = () => {
    if (enTransition) return;
    lenis.stop();
    visite.entrer();
    document.documentElement.classList.add('visite-active');
    panneauVisite.hidden = false;
  };
  const sortirVisite = () => {
    if (!visite.actif) return;
    visite.sortir();
    document.documentElement.classList.remove('visite-active');
    panneauVisite.hidden = true;
    revenirAuParcours();
  };
  document.getElementById('bouton-visite')!.addEventListener('click', entrerVisite);
  panneauVisite.querySelector('.visite-quitter')!.addEventListener('click', sortirVisite);
  panneauVisite.querySelectorAll<HTMLButtonElement>('[data-lieu]').forEach((b) => {
    b.addEventListener('click', () => {
      visite.aller(b.dataset.lieu!);
      b.blur(); // le clavier revient à la marche
    });
  });
  addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && visite.actif && !fiche.open) sortirVisite();
  });

  // ---- Boucle ----
  const horloge = new Timer();
  renderer.setAnimationLoop((temps) => {
    horloge.update(temps);
    const dt = Math.min(horloge.getDelta(), 0.1);
    if (enTransition) {
      // la caméra suit une animation (entrée dans un projet, fiche, retour au parcours)
    } else if (visite.actif) {
      visite.mettreAJour(dt, regard);
    } else {
      vueCible = vueDepuisScroll(lenis.scroll);
      vue = MathUtils.damp(vue, vueCible, 4, dt);
      vueA(vue, pos, cible);
      sourisLissee.lerp(souris, 1 - Math.exp(-3 * dt));
      cible.x += sourisLissee.x * 0.8;
      cible.y += sourisLissee.y * 0.4;
      camera.position.copy(pos).add(decalageIntro);
      regard.copy(cible);
    }
    camera.lookAt(regard);
    majSurvol();
    majPlan(vueCible);
    if (composer && !chantier) {
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
