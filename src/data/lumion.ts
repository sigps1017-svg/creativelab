// Rendus Lumion d'un projet : images, panorama 360° et vidéo.
//
// Rien à déclarer ici : il suffit de déposer les fichiers dans public/lumion/<slug du projet>/ :
//   couverture.jpg    remplace l'image du haut de la page projet (facultatif)
//   01.jpg, 02.jpg…   galerie de rendus, dans l'ordre alphabétique
//   360.jpg           panorama 360° équirectangulaire (largeur = 2 × hauteur, 4096 × 2048 conseillé)
//   video.mp4         film du projet (H.264), video.jpg en image d'attente si présente
// La liste est lue au moment de la construction du site : un fichier ajouté apparaît au prochain déploiement.

import { existsSync, readdirSync } from 'node:fs';
import { join } from 'node:path';

export interface RendusLumion {
  couverture?: string;
  images: string[];
  panorama?: string;
  video?: string;
  affiche?: string;
}

const DOSSIER = join(process.cwd(), 'public', 'lumion');
const IMAGE = /\.(jpe?g|webp|png|avif)$/i;

export function rendusLumion(slug: string): RendusLumion {
  const dossier = join(DOSSIER, slug);
  if (!existsSync(dossier)) return { images: [] };

  const fichiers = readdirSync(dossier).sort((a, b) => a.localeCompare(b, 'fr', { numeric: true }));
  const url = (nom: string) => `/lumion/${slug}/${nom}`;
  const trouver = (base: string, motif: RegExp) => fichiers.find((f) => f.toLowerCase().startsWith(base) && motif.test(f));

  const couverture = trouver('couverture', IMAGE);
  const panorama = trouver('360', IMAGE);
  const video = trouver('video', /\.mp4$/i);
  const affiche = trouver('video', IMAGE);
  const reserves = new Set([couverture, panorama, affiche]);

  return {
    couverture: couverture && url(couverture),
    images: fichiers.filter((f) => IMAGE.test(f) && !reserves.has(f)).map(url),
    panorama: panorama && url(panorama),
    video: video && url(video),
    affiche: affiche && url(affiche),
  };
}
