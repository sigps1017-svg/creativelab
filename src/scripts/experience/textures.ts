import { CanvasTexture, LoadingManager, SRGBColorSpace, Texture, TextureLoader } from 'three';

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
 * Charge l'image d'un projet ; en cas d'échec (image absente, ou hébergée sur un autre domaine
 * qui refuse l'usage en 3D), on garde la texture provisoire.
 */
export function chargerImageProjet(
  url: string,
  titre: string,
  manager: LoadingManager,
  quandPrete: (t: Texture) => void,
) {
  quandPrete(textureProvisoire(titre));
  const loader = new TextureLoader(manager);
  loader.setCrossOrigin('anonymous');
  loader.load(
    url,
    (t) => {
      t.colorSpace = SRGBColorSpace;
      t.anisotropy = 4;
      quandPrete(t);
    },
    undefined,
    () => {
      /* on garde la texture provisoire */
    },
  );
}
