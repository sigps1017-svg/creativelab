import {
  ACESFilmicToneMapping,
  DirectionalLight,
  EquirectangularReflectionMapping,
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
  Texture,
  TextureLoader,
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
  reglerCadrage,
  scrollPourEspace,
  vueA,
  vueDepuisScroll,
} from './parcours';
import { creerVisite } from './visite';
import { jouerOuverture } from './ouverture';
import { creerEcranServices, type Service } from './ecran-services';
import { creerPiscine } from './piscine';
import { creerTourHorizon } from './tour-horizon';
import { creerPromeneurs } from './promeneurs';
import { creerAmbianceSonore } from './ambiance-sonore';
import { creerVisiteAuto } from './visite-auto';

// Lumière ambiante de midi (lumiere.ts : 0.9 × 1.6), celle du calcul de la lumière précalculée.
const AMBIANTE_MIDI = 1.44;

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
  // La pièce neutre est très lumineuse ; le panorama (image ordinaire, sans surexposition) l'est moins.
  let intensiteDecor = 0.3;
  scene.environmentIntensity = intensiteDecor;
  // Puis le vrai décor, photographié à 360° depuis le parvis dans Blender (creativ_ciel_web.py) :
  // ciel, ville et arbres se reflètent dans les vitres et les métaux. Le centre du panorama
  // regarde le bâtiment (-z) : un quart de tour l'aligne sur la scène.
  new TextureLoader().load('/modeles/ciel.webp', (t) => {
    t.mapping = EquirectangularReflectionMapping;
    t.colorSpace = SRGBColorSpace;
    scene.environment = pmrem.fromEquirectangular(t).texture;
    scene.environmentRotation.y = Math.PI / 2;
    t.dispose();
    intensiteDecor = 1;
    reglerReflets(nuitCourante);
  });

  // Écran en portrait (téléphone) : on élargit le champ de vision pour garder le bâtiment en vue.
  const champPour = (aspect: number) => (aspect < 1 ? 72 : mobile ? 60 : 50);
  // Part de la hauteur d'écran dont l'image est remontée en portrait (cartes en bas de l'écran).
  const REMONTEE_PORTRAIT = 0.14;
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
  // Le bâtiment Blender a la sienne, précalculée (ombres douces, rebonds) : elle suit cette
  // intensité, rapportée à celle de midi qui a servi au calcul.
  const hemi = new HemisphereLight(ciel, '#8c7f6c', ambiance.ambiante * 1.6);
  scene.add(hemi);
  // La nuit, moins de reflets du ciel et une exposition plus basse : les lampes ressortent.
  const reglerReflets = (nuit: number) => {
    scene.environmentIntensity = intensiteDecor * (1 - 0.75 * nuit);
    renderer.toneMappingExposure = 0.8 - 0.12 * nuit;
  };
  reglerReflets(ambiance.nuit);
  let nuitCourante = ambiance.nuit;

  // ---- Ouverture ----
  // Le nom du cabinet s'anime pendant le chargement (voir ouverture.ts). Derrière les volets, la
  // caméra attend sur la vue d'ensemble de biais (en hauteur) ; à l'ouverture, elle vient se
  // placer face à la façade : la vue 0 du parcours plus ces décalages, ramenés à zéro.
  const chargement = document.getElementById('chargement')!;
  const manager = new LoadingManager();
  document.documentElement.classList.add('intro');
  const decalageIntro = new Vector3(-38, 16, 28);
  const decalageCibleIntro = new Vector3(0, 0, -10);
  const ouverture = jouerOuverture(chargement, {
    decalage: decalageIntro,
    decalageCible: decalageCibleIntro,
    vitesse: Number(new URLSearchParams(location.search).get('intro')) || 1,
  });
  let ouvert = false;
  const ouvrir = () =>
    ouverture.ouvrir(() => {
      ouvert = true;
      setTimeout(() => demarrerVisiteAuto(), 5500);
      chargement.classList.add('fini');
      document.documentElement.classList.remove('intro');
    });
  manager.onProgress = (_url, charges, total) => ouverture.progression(charges / total);
  // Si le modèle tarde trop, on ouvre quand même.
  setTimeout(ouvrir, 15000);
  // Le visiteur pressé (défilement, clic, touche) accélère l'ouverture.
  for (const evenement of ['wheel', 'touchstart', 'keydown', 'pointerdown']) {
    addEventListener(evenement, () => ouvert || ouverture.presser(), { passive: true });
  }

  const batiment = chargerBatiment(projets, equipe, manager, !mobile);
  const services: Service[] = JSON.parse(document.getElementById('donnees-services')?.textContent || '[]');
  batiment.groupe.add(creerEcranServices(services));
  // Sur le toit : la piscine à débordement, et au loin la tour Horizon, l'architecture de demain.
  const piscine = creerPiscine();
  const tour = creerTourHorizon();
  batiment.groupe.add(piscine.groupe, tour.groupe);
  const reglerNuit = (nuit: number) => {
    batiment.reglerNuit(nuit);
    piscine.reglerNuit(nuit);
    tour.reglerNuit(nuit);
  };
  reglerNuit(ambiance.nuit);
  batiment.reglerAmbiante(hemi.intensity / AMBIANTE_MIDI);
  scene.add(batiment.groupe);
  // Des visiteurs dans et autour du bâtiment (hors du groupe du bâtiment : ils ne doivent pas
  // arrêter la visite libre), et les sons d'ambiance de chaque lieu.
  const promeneurs = creerPromeneurs(!mobile);
  scene.add(promeneurs.groupe);
  const ambianceSonore = creerAmbianceSonore();

  // Le bâtiment reste caché tant que ses shaders et ses textures ne sont pas prêts : leur
  // préparation fige la page un instant, et elle doit avoir lieu derrière les volets, pas pendant
  // leur ouverture.
  let batimentAffiche = false;
  batiment.pret.then(async () => {
    batiment.groupe.visible = true;
    await renderer.compileAsync(scene, camera).catch(() => {});
    batiment.groupe.traverse((o) => {
      if (!(o instanceof Mesh)) return;
      for (const m of Array.isArray(o.material) ? o.material : [o.material]) {
        for (const valeur of Object.values(m)) if (valeur instanceof Texture) renderer.initTexture(valeur);
      }
    });
    batimentAffiche = true;
    // Deux images rendues derrière les volets (ombres, occlusion), puis on ouvre.
    requestAnimationFrame(() => requestAnimationFrame(ouvrir));
  });

  // ---- Défilement fluide et caméra ----
  const lenis = new Lenis({ lerp: 0.09, anchors: true });
  lenis.on('scroll', ScrollTrigger.update);
  gsap.ticker.add((t) => lenis.raf(t * 1000));
  gsap.ticker.lagSmoothing(0);

  const mesurer = () => {
    reglerCadrage(innerWidth < innerHeight);
    mesurerAncres(sections);
  };
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

  // Le titre d'accueil s'efface en montant, au lieu de glisser sous l'en-tête.
  gsap.to(sections[0], {
    opacity: 0,
    ease: 'none',
    scrollTrigger: { trigger: sections[0], start: 'top top', end: 'bottom 45%', scrub: true },
  });

  // Sur téléphone, les cartes sont posées en bas de l'écran (global.css) : elles s'effacent dès
  // qu'elles remontent, pour ne pas passer devant les murs qu'on vient regarder.
  const cartesBas = sections.slice(1, -1).map((s) => s.querySelector<HTMLElement>('.carte')!);
  const mesurerCartes = () => {
    cartesBas.forEach((c) => c.style.setProperty('--hauteur-carte', `${c.offsetHeight}px`));
  };
  const observateur = new ResizeObserver(mesurerCartes);
  cartesBas.forEach((c) => observateur.observe(c));
  gsap.matchMedia().add('(max-width: 760px)', () => {
    sections.slice(1, -1).forEach((s) => {
      gsap.to(s, {
        opacity: 0,
        ease: 'none',
        scrollTrigger: { trigger: s, start: 'bottom 85%', end: 'bottom 55%', scrub: true },
      });
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
    visiteAuto.arreter();
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
        (scene.fog as Fog).color.copy(ciel);
        hemi.color.copy(ciel);
        soleil.color.copy(d.soleil).lerp(cible.soleilCouleur, t);
        soleil.intensity = MathUtils.lerp(d.intensite, cible.soleilIntensite, t);
        soleil.position.lerpVectors(d.position, cible.soleilPosition, t);
        hemi.intensity = MathUtils.lerp(d.ambiante, cible.ambiante * 1.6, t);
        nuitCourante = MathUtils.lerp(d.nuit, cible.nuit, t);
        reglerNuit(nuitCourante);
        batiment.reglerAmbiante(hemi.intensity / AMBIANTE_MIDI);
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

  // ---- Terrasse : formulaire repliable ----
  const contact = document.getElementById('contact')!;
  const rouvrir = contact.querySelector<HTMLButtonElement>('.rouvrir-contact')!;
  const replier = (replie: boolean) => contact.classList.toggle('replie', replie);
  contact.querySelector('.fermer-carte')!.addEventListener('click', () => replier(true));
  rouvrir.addEventListener('click', () => replier(false));
  ScrollTrigger.create({
    trigger: contact,
    start: 'top 60%',
    onToggle: (st) => {
      // Sur la terrasse, le bouton de visite guidée laisse la place au formulaire.
      document.documentElement.classList.toggle('sur-terrasse', st.isActive);
    },
  });

  // ---- Visite guidée automatique ----
  // Chaque espace avec son trajet et son temps d'arrêt ; la galerie et le mur de l'équipe se
  // longent lentement.
  const finDe = (s: HTMLElement) => s.offsetTop + s.offsetHeight - innerHeight;
  const visiteAuto = creerVisiteAuto(lenis, document.getElementById('bouton-auto') as HTMLButtonElement, () => {
    const max = document.documentElement.scrollHeight - innerHeight;
    const [, hall, galerie, atelier, servicesSection, equipeSection, contact] = sections;
    return [
      { y: hall.offsetTop, trajet: 3.5, arret: 4 },
      { y: galerie.offsetTop, trajet: 3, arret: 2 },
      { y: finDe(galerie), trajet: innerWidth < innerHeight ? 18 : 12, arret: 2 },
      { y: atelier.offsetTop, trajet: 3.5, arret: 4 },
      { y: servicesSection.offsetTop, trajet: 3, arret: 7 },
      { y: equipeSection.offsetTop, trajet: 3, arret: 1.5 },
      { y: finDe(equipeSection), trajet: 8, arret: 2 },
      { y: contact.offsetTop, trajet: 4.5, arret: 0 },
    ].map((e) => ({ ...e, y: Math.min(e.y, max) }));
  });
  // Elle démarre seule à l'arrivée, après un temps d'arrêt devant la façade, sauf si le visiteur
  // a déjà commencé à défiler ou arrive directement sur une section.
  let dejaParti = !!location.hash || matchMedia('(prefers-reduced-motion: reduce)').matches;
  for (const evenement of ['wheel', 'touchmove', 'keydown']) {
    addEventListener(evenement, () => (dejaParti = true), { passive: true, once: true });
  }
  const demarrerVisiteAuto = () => {
    if (dejaParti || lenis.scroll > 10 || visite.actif || enTransition) return;
    visiteAuto.lancer();
  };

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
    visiteAuto.arreter();
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
  let remontee = camera.aspect < 1 ? REMONTEE_PORTRAIT : 0;
  const appliquerRemontee = () => {
    if (remontee === 0) camera.clearViewOffset();
    else camera.setViewOffset(innerWidth, innerHeight, 0, remontee * innerHeight, innerWidth, innerHeight);
  };
  appliquerRemontee();
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
      regard.copy(cible).add(decalageCibleIntro);
    }
    camera.lookAt(regard);
    piscine.mettreAJour(temps / 1000);
    tour.mettreAJour(temps / 1000);
    promeneurs.mettreAJour(temps / 1000);
    ambianceSonore.regler(camera.position);
    // Téléphone en portrait : l'image est remontée pour que les murs restent dégagés au-dessus
    // des cartes de texte, puis recentrée en visite libre et quand on s'approche d'un cadre.
    const voulue = camera.aspect < 1 && !enTransition && !visite.actif ? REMONTEE_PORTRAIT : 0;
    const avant = remontee;
    remontee = MathUtils.damp(remontee, voulue, 4, dt);
    if (Math.abs(remontee - voulue) < 1e-4) remontee = voulue;
    if (remontee !== avant) appliquerRemontee();
    majSurvol();
    majPlan(vueCible);
    batiment.groupe.visible = batimentAffiche;
    promeneurs.groupe.visible = batimentAffiche;
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
    appliquerRemontee();
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
