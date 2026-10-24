import gsap from 'gsap';
import { BoxGeometry, CanvasTexture, Group, Mesh, MeshBasicMaterial, MeshStandardMaterial, PlaneGeometry, SRGBColorSpace } from 'three';

// Grand écran des services, au fond de l'atrium (1er étage, entre l'atelier et le mur de l'équipe).
// Les services du cabinet s'y succèdent : le texte sort par le haut, une bande de laiton balaie
// l'écran et le service suivant monte à sa place, ligne par ligne.

export interface Service {
  titre: string;
  resume: string;
}

const LARGEUR = 4.8;
const HAUTEUR = 2.7;
// Mur du fond du 1er étage, au centre (coordonnées du site).
const POSITION = { x: 0, y: 8.75, z: -11.915 };
const PAUSE = 4.5; // secondes d'affichage de chaque service

const PX = 1280;
const PY = 720;
const LAITON = '#c8a165';
const ENCRE = '#f3efe8';
const ENCRE_DOUCE = 'rgba(243, 239, 232, 0.62)';
const POLICE = "'Manrope', system-ui, sans-serif";

export function creerEcranServices(services: Service[]): Group {
  const groupe = new Group();
  groupe.position.set(POSITION.x, POSITION.y, POSITION.z);
  const cadre = new Mesh(
    new BoxGeometry(LARGEUR + 0.16, HAUTEUR + 0.16, 0.08),
    new MeshStandardMaterial({ color: '#121212', roughness: 0.35, metalness: 0.2 }),
  );
  cadre.position.z = -0.045;
  groupe.add(cadre);

  const toile = document.createElement('canvas');
  toile.width = PX;
  toile.height = PY;
  const ctx = toile.getContext('2d')!;
  const texture = new CanvasTexture(toile);
  texture.colorSpace = SRGBColorSpace;
  texture.anisotropy = 4;
  const ecran = new Mesh(new PlaneGeometry(LARGEUR, HAUTEUR), new MeshBasicMaterial({ map: texture, toneMapped: false }));
  groupe.add(ecran);
  if (!services.length) return groupe;

  // État animé par GSAP : `sortie` fait partir le service affiché, `balayage` fait passer la bande
  // de laiton (0 → 1 → 2 : elle entre par la gauche, couvre l'écran, sort par la droite),
  // `entree` fait monter le suivant.
  const etat = { courant: 0, sortie: 0, balayage: 0, entree: 1 };

  const lignes = (texte: string, taille: number, largeurMax: number, graisse: number) => {
    ctx.font = `${graisse} ${taille}px ${POLICE}`;
    const mots = texte.split(' ');
    const res: string[] = [];
    let ligne = '';
    for (const mot of mots) {
      const essai = ligne ? `${ligne} ${mot}` : mot;
      if (ctx.measureText(essai).width > largeurMax && ligne) {
        res.push(ligne);
        ligne = mot;
      } else ligne = essai;
    }
    if (ligne) res.push(ligne);
    return res;
  };

  // Une ligne de texte qui monte depuis son masque (t = 0 caché sous la ligne, 1 en place,
  // puis de 1 à 2 elle repart vers le haut).
  const ligneMasquee = (texte: string, x: number, y: number, taille: number, t: number, couleur: string, graisse: number) => {
    if (t <= 0 || t >= 2) return;
    const h = taille * 1.3;
    ctx.save();
    ctx.beginPath();
    ctx.rect(x - 10, y - taille, PX, h);
    ctx.clip();
    ctx.font = `${graisse} ${taille}px ${POLICE}`;
    ctx.fillStyle = couleur;
    ctx.globalAlpha = t < 1 ? t : 2 - t;
    ctx.fillText(texte, x, y + (1 - t) * h);
    ctx.restore();
  };

  // Avancement de la ligne i parmi n, décalé ligne après ligne (effet de cascade).
  const cascade = (p: number, i: number, n: number) => gsap.utils.clamp(0, 1, p * (1 + 0.35 * n) - 0.35 * i);
  const douce = gsap.parseEase('power3.out');
  const dure = gsap.parseEase('power3.in');

  const dessiner = () => {
    // Fond : nuit profonde, léger halo, filets de laiton.
    const fond = ctx.createLinearGradient(0, 0, PX, PY);
    fond.addColorStop(0, '#1b1a17');
    fond.addColorStop(1, '#0b0b0a');
    ctx.fillStyle = fond;
    ctx.fillRect(0, 0, PX, PY);
    ctx.strokeStyle = 'rgba(200, 161, 101, 0.35)';
    ctx.lineWidth = 2;
    ctx.strokeRect(36, 36, PX - 72, PY - 72);

    ctx.font = `500 22px ${POLICE}`;
    ctx.fillStyle = LAITON;
    ctx.fillText('NOS SERVICES', 84, 104);
    ctx.fillStyle = ENCRE_DOUCE;
    ctx.font = `300 22px ${POLICE}`;
    ctx.textAlign = 'right';
    ctx.fillText('CREATIV LAB ARCHITECTS', PX - 84, 104);
    ctx.textAlign = 'left';

    const s = services[etat.courant];
    const titre = lignes(s.titre, 92, PX - 380, 300);
    const resume = lignes(s.resume, 34, PX - 380, 400);
    const n = titre.length + resume.length + 1;
    // t de chaque ligne : 0 → 1 à l'entrée, 1 → 2 à la sortie.
    const t = (i: number) =>
      etat.sortie > 0 ? 1 + dure(cascade(etat.sortie, i, n)) : douce(cascade(etat.entree, i, n));

    // Numéro en laiton, en grand.
    const numero = String(etat.courant + 1).padStart(2, '0');
    ligneMasquee(numero, 84, 250, 130, t(0), LAITON, 200);
    let y = 250 + 30;
    titre.forEach((l, i) => {
      y += 100;
      ligneMasquee(l, 84, y, 92, t(i + 1), ENCRE, 300);
    });
    y += 30;
    resume.forEach((l, i) => {
      y += 48;
      ligneMasquee(l, 88, y, 34, t(titre.length + 1 + i), ENCRE_DOUCE, 400);
    });

    // Repères : un tiret par service, celui affiché en laiton.
    services.forEach((_, i) => {
      ctx.fillStyle = i === etat.courant ? LAITON : 'rgba(243, 239, 232, 0.25)';
      ctx.fillRect(PX - 84 - (services.length - i) * 46 + 10, PY - 92, i === etat.courant ? 36 : 24, 4);
    });

    // Bande de laiton inclinée qui traverse l'écran entre deux services.
    if (etat.balayage > 0 && etat.balayage < 2) {
      const pente = PY * 0.35;
      const largeur = PX + pente;
      const debut = (etat.balayage <= 1 ? 0 : etat.balayage - 1) * largeur - pente;
      const fin = (etat.balayage <= 1 ? etat.balayage : 1) * largeur;
      const bande = ctx.createLinearGradient(debut, 0, fin + pente, 0);
      bande.addColorStop(0, '#a8834c');
      bande.addColorStop(1, '#d9b87f');
      ctx.fillStyle = bande;
      ctx.beginPath();
      ctx.moveTo(debut + pente, 0);
      ctx.lineTo(fin + pente, 0);
      ctx.lineTo(fin, PY);
      ctx.lineTo(debut, PY);
      ctx.closePath();
      ctx.fill();
    }
    texture.needsUpdate = true;
  };

  const suivant = () => {
    gsap
      .timeline({ delay: PAUSE, onUpdate: dessiner, onComplete: suivant })
      .to(etat, { sortie: 1, duration: 0.9, ease: 'none' })
      .to(etat, { balayage: 1, duration: 0.55, ease: 'power2.in' }, 0.45)
      .call(() => {
        etat.courant = (etat.courant + 1) % services.length;
        etat.sortie = 0;
        etat.entree = 0;
      })
      .to(etat, { balayage: 2, duration: 0.6, ease: 'power2.out' })
      .to(etat, { entree: 1, duration: 1.2, ease: 'none' }, '<0.15')
      .set(etat, { balayage: 0 });
  };

  // Entrée du premier service une fois la police chargée (sinon le texte serait mesuré dans la
  // police de secours).
  etat.entree = 0;
  dessiner();
  const police = Promise.race([document.fonts.ready, new Promise((ok) => setTimeout(ok, 1500))]);
  police.then(() => {
    gsap.to(etat, { entree: 1, duration: 1.2, ease: 'none', delay: 0.5, onUpdate: dessiner, onComplete: suivant });
  });
  return groupe;
}
