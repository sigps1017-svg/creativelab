import { CanvasTexture, ImageLoader, LoadingManager, SRGBColorSpace, Texture } from 'three';

/** Texture de remplacement quand une image de projet ne peut pas être chargée en 3D. */
export function textureProvisoire(titre: string): CanvasTexture {
  const c = document.createElement('canvas');
  c.width = 1024;
  c.height = 683;
  const ctx = c.getContext('2d')!;
  const fond = ctx.createLinearGradient(0, 0, c.width, c.height);
  fond.addColorStop(0, '#2a2824');
  fond.addColorStop(1, '#14130f');
  ctx.fillStyle = fond;
  ctx.fillRect(0, 0, c.width, c.height);

  // Trame de plan d'architecte.
  ctx.strokeStyle = 'rgba(243, 239, 232, 0.08)';
  ctx.lineWidth = 1;
  for (let x = 0; x < c.width; x += 48) {
    ctx.beginPath();
    ctx.moveTo(x, 0);
    ctx.lineTo(x, c.height);
    ctx.stroke();
  }
  for (let y = 0; y < c.height; y += 48) {
    ctx.beginPath();
    ctx.moveTo(0, y);
    ctx.lineTo(c.width, y);
    ctx.stroke();
  }

  ctx.fillStyle = '#c8a165';
  ctx.font = '500 26px Manrope, sans-serif';
  ctx.fillText('PROJET', 64, c.height - 150);
  ctx.fillStyle = '#f3efe8';
  ctx.font = '300 72px Manrope, sans-serif';
  ctx.fillText(titre, 64, c.height - 80);

  const t = new CanvasTexture(c);
  t.colorSpace = SRGBColorSpace;
  return t;
}

/** Silhouette provisoire pour le mur de l'équipe. */
export function texturePortrait(index: number): CanvasTexture {
  const c = document.createElement('canvas');
  c.width = 320;
  c.height = 400;
  const ctx = c.getContext('2d')!;
  const teintes = ['#3a352e', '#2f3438', '#38312f', '#30352f'];
  ctx.fillStyle = teintes[index % teintes.length];
  ctx.fillRect(0, 0, c.width, c.height);
  ctx.fillStyle = 'rgba(243, 239, 232, 0.18)';
  ctx.beginPath();
  ctx.arc(160, 150, 62, 0, Math.PI * 2);
  ctx.fill();
  ctx.beginPath();
  ctx.ellipse(160, 380, 130, 140, 0, Math.PI, 0);
  ctx.fill();
  const t = new CanvasTexture(c);
  t.colorSpace = SRGBColorSpace;
  return t;
}

/**
 * Charge la photo d'un projet et y inscrit son nom, recadrée au format du cadre (comme
 * object-fit: cover). En attendant, ou si l'image manque, le cadre garde le visuel provisoire.
 */
export function chargerImageProjet(
  url: string,
  titre: string,
  aspect: number,
  manager: LoadingManager,
  quandPrete: (t: Texture) => void,
) {
  quandPrete(textureProvisoire(titre));
  new ImageLoader(manager).load(
    url,
    async (img) => {
      await document.fonts?.ready;
      quandPrete(photoAvecTitre(img, titre, aspect));
    },
    undefined,
    () => {
      /* on garde la texture provisoire */
    },
  );
}

function photoAvecTitre(img: HTMLImageElement, titre: string, aspect: number): CanvasTexture {
  const c = document.createElement('canvas');
  c.width = 1280;
  c.height = Math.round(c.width / aspect);
  const ctx = c.getContext('2d')!;
  const echelle = Math.max(c.width / img.width, c.height / img.height);
  const l = img.width * echelle;
  const h = img.height * echelle;
  ctx.drawImage(img, (c.width - l) / 2, (c.height - h) / 2, l, h);

  // Bandeau dégradé en bas pour que le nom reste lisible sur toutes les photos.
  const voile = ctx.createLinearGradient(0, c.height * 0.5, 0, c.height);
  voile.addColorStop(0, 'rgba(14, 14, 13, 0)');
  voile.addColorStop(1, 'rgba(14, 14, 13, 0.88)');
  ctx.fillStyle = voile;
  ctx.fillRect(0, 0, c.width, c.height);

  ctx.fillStyle = '#c8a165';
  ctx.font = '500 24px Manrope, sans-serif';
  ctx.fillText('PROJET', 56, c.height - 116);
  ctx.fillStyle = '#f3efe8';
  let taille = 68;
  do {
    ctx.font = `300 ${taille}px Manrope, sans-serif`;
    taille -= 4;
  } while (ctx.measureText(titre).width > c.width - 112 && taille > 28);
  ctx.fillText(titre, 56, c.height - 52);

  const t = new CanvasTexture(c);
  t.colorSpace = SRGBColorSpace;
  t.anisotropy = 8;
  return t;
}
