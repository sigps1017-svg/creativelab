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
    batiment.ts               Le bâtiment provisoire, la galerie, l'atelier, les abords.
    lumiere.ts                Les ambiances selon l'heure.
    textures.ts               Images des projets et visuels provisoires.
  styles/global.css
```

Tout le texte est en HTML. La 3D se dessine derrière. Google lit donc le contenu, et un visiteur sans WebGL, ou qui a demandé de réduire les animations, voit une version simple. Le bouton « Version simple » de l'en-tête permet aussi de basculer.

## Ce qui est provisoire

- **Le bâtiment** est fait de formes simples pour caler le parcours et les cadrages. Il sera remplacé par le bâtiment inventé, modélisé dans Blender.
- **Les titres des projets** viennent des noms de fichiers du carrousel actuel. Ils sont à corriger dans `src/data/projets.ts`, avec lieu, année, programme, surface et description.
- **Les images** pointent vers le site actuel. Le navigateur refuse généralement de les utiliser en 3D, car elles sont sur un autre domaine : les cadres affichent alors un visuel provisoire. Copiez les images dans `public/images/projets/` et remplacez les URL par `/images/projets/<fichier>`.
- **Les textes** du manifeste et de l'équipe, les portraits et le formulaire de contact (pas encore relié à un service d'envoi).

## Choisir les projets de la galerie

Les 10 premiers projets de `src/data/projets.ts` sont accrochés au mur de la galerie. Réordonnez la liste pour choisir les projets phares. Tous les projets ont leur page dans `/projets`.

## Remplacer le bâtiment provisoire

1. Modéliser le bâtiment dans Blender (ou partir de SketchUp ou ArchiCAD), en gardant les mêmes repères : 1 unité = 1 mètre, rez-de-chaussée à 0 m, 1er étage à 6 m, toit à 11 m, entrée face à +Z.
2. Pré-calculer la lumière (baking) dans les textures : c'est ce qui donne un beau rendu tout en restant fluide.
3. Exporter en glTF binaire (`.glb`) avec compression Meshopt, dans `public/models/`.
4. Charger le modèle dans `batiment.ts` avec `GLTFLoader` à la place des formes simples, puis ajuster les points de vue dans `parcours.ts`.

Les panoramas 360° et les vidéos Twinmotion serviront pour l'intérieur des projets phares.
