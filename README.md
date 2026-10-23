# Creativ Lab Architects : site immersif

Le site est un bâtiment que l'on visite. Le défilement guide la caméra du parvis jusqu'au toit-terrasse, et chaque espace est une section du site. Dans la galerie, un clic sur un cadre fait entrer le visiteur dans le projet.

| Espace | Niveau | Section |
| --- | --- | --- |
| Parvis | Extérieur | Accueil |
| Hall et atrium | Rez-de-chaussée | Manifeste |
| Galerie | Rez-de-chaussée | Projets |
| Atelier | 1er étage | Savoir-faire |
| Mur de l'équipe | 1er étage | Équipe |
| Terrasse | Toit | Contact |

## Démarrer

Il faut Node.js 22.22 ou plus récent.

```bash
npm install
npm run dev      # http://localhost:4321
npm run build    # site statique dans dist/
```

Pour tester l'ambiance d'une heure précise, ajoutez `?heure=20` à l'adresse. Sans ce paramètre, la lumière suit l'heure du visiteur.

## Organisation

```
src/
  data/projets.ts             La liste des projets : titres, images, fiche.
  pages/index.astro           Le parcours : une section HTML par espace.
  pages/projets/[slug].astro  Une vraie page par projet (référencement, partage de lien).
  scripts/experience/
    index.ts                  Rendu Three.js, défilement (Lenis + GSAP), clic sur les cadres.
    parcours.ts               Le chemin de la caméra : points de vue et correspondance avec le défilement.
    modele.ts                 Charge le bâtiment modélisé dans Blender (public/modeles/creativ-batiment.glb).
    batiment.ts               Le bâtiment provisoire, utilisé seulement si le modèle ne se charge pas.
    lumiere.ts                Les ambiances selon l'heure.
    textures.ts               Images des projets et visuels provisoires.
  styles/global.css
```

Tout le texte est en HTML. La 3D se dessine derrière. Google lit donc le contenu, et un visiteur sans WebGL, ou qui a demandé de réduire les animations, voit une version simple. Le bouton « Version simple » de l'en-tête permet aussi de basculer.

## Ce qui est provisoire

- **Les titres des projets** viennent des noms de fichiers du carrousel actuel. Ils sont à corriger dans `src/data/projets.ts`, avec lieu, année, programme, surface et description.
- **Les images** pointent vers le site actuel. Le navigateur refuse généralement de les utiliser en 3D, car elles sont sur un autre domaine : les cadres affichent alors un visuel provisoire. Copiez les images dans `public/images/projets/` et remplacez les URL par `/images/projets/<fichier>`.
- **Les textes** du manifeste et de l'équipe, les portraits et le formulaire de contact (pas encore relié à un service d'envoi).

## Choisir les projets de la galerie

Les 10 premiers projets de `src/data/projets.ts` sont accrochés au mur de la galerie. Réordonnez la liste pour choisir les projets phares. Tous les projets ont leur page dans `/projets`.

## Mettre à jour le modèle 3D

Le bâtiment est construit dans Blender par deux scripts, puis exporté pour le web par un troisième :

1. `scripts/blender/creativ_batiment_blender.py` : la structure, les façades, la galerie et les caméras `Vue_00` à `Vue_09`, qui suivent le parcours du site (`parcours.ts`).
2. `scripts/blender/creativ_realisme.py` : les matériaux, le mobilier, les abords, la ville et la lumière.
3. `scripts/blender/creativ_export_web.py` : cuit les matériaux en textures, fusionne les objets par zone et exporte le `.glb`. Il transforme la scène : lancez-le en ligne de commande, sur le fichier enregistré.

```
blender -b creativ-batiment.blend -P scripts/blender/creativ_export_web.py -- public/modeles/creativ-batiment.glb
npm run optimiser-modele
```

La seconde commande compresse la géométrie (Meshopt), d'environ 6 Mo à 2 Mo. Les repères sont ceux de Blender : 1 unité = 1 mètre, rez-de-chaussée à 0 m, 1er étage à 6 m, toit à 11 m, entrée côté -Y. Le site retrouve les cadres de la galerie (`Cadre_01` à `Cadre_10`) et les portraits (`Portrait_01` à `Portrait_04`) par leur nom : gardez ces noms si vous retouchez le modèle.

Les panoramas 360° et les vidéos Twinmotion serviront pour l'intérieur des projets phares.
