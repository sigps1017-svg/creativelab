# Creativ Lab Architects : panorama d'environnement pour le site (public/modeles/ciel.webp)
# et ciel photo visible derrière le décor (public/modeles/ciel-fond.webp)
#
# Appelé par creativ_export_web.py, comme la lumière précalculée. Cycles photographie à 360°
# ce qu'on voit depuis le parvis : le ciel du fichier (sans le disque du soleil, que le site
# dessine lui-même), la ville, les arbres, le sol. Le site s'en sert comme environnement :
# les vitres, les métaux et les sols cirés reflètent ce vrai décor au lieu d'une pièce neutre.

import math
import os

import bpy
import numpy as np

# Depuis le parvis, à hauteur d'yeux, face au bâtiment (coordonnées Blender).
POSITION = (0.0, -30.0, 1.7)
LARGEUR = 2048
ECHANTILLONS = 48


def rendre(chemin):
    scene = bpy.context.scene
    reglages = {
        "camera": scene.camera,
        "x": scene.render.resolution_x,
        "y": scene.render.resolution_y,
        "pourcent": scene.render.resolution_percentage,
        "vue": scene.view_settings.view_transform,
        "aspect": scene.view_settings.look,
    }
    ciel = None
    if scene.world and scene.world.use_nodes:
        ciel = next((n for n in scene.world.node_tree.nodes if n.type == "TEX_SKY"), None)
    disque = ciel.sun_disc if ciel else None
    if ciel:
        ciel.sun_disc = False

    donnees = bpy.data.cameras.new("_panorama")
    donnees.type = "PANO"
    donnees.panorama_type = "EQUIRECTANGULAR"
    cam = bpy.data.objects.new("_panorama", donnees)
    cam.location = POSITION
    # Caméra à l'horizontale, regard vers le bâtiment (+Y) au centre de l'image.
    cam.rotation_euler = (math.pi / 2, 0, 0)
    scene.collection.objects.link(cam)

    scene.camera = cam
    scene.render.engine = "CYCLES"
    scene.cycles.samples = ECHANTILLONS
    scene.cycles.use_denoising = True
    scene.render.resolution_x = LARGEUR
    scene.render.resolution_y = LARGEUR // 2
    scene.render.resolution_percentage = 100
    scene.view_settings.view_transform = "Standard"
    scene.view_settings.look = "None"
    scene.render.image_settings.file_format = "WEBP"
    scene.render.image_settings.quality = 85
    scene.render.filepath = chemin
    bpy.ops.render.render(write_still=True)

    bpy.data.objects.remove(cam, do_unlink=True)
    bpy.data.cameras.remove(donnees)
    if ciel:
        ciel.sun_disc = disque
    scene.camera = reglages["camera"]
    scene.render.resolution_x = reglages["x"]
    scene.render.resolution_y = reglages["y"]
    scene.render.resolution_percentage = reglages["pourcent"]
    scene.view_settings.view_transform = reglages["vue"]
    scene.view_settings.look = reglages["aspect"]
    print("panorama :", chemin, round(os.path.getsize(chemin) / 1e3), "ko")


def fond(chemin, largeur=2048):
    """Ciel photo du fichier (image HDRI du monde) en image ordinaire pour le dôme du site.
    Le disque du soleil est effacé : le site place son propre soleil selon l'heure.
    Renvoie False si le monde n'a pas d'image HDRI."""
    monde = bpy.context.scene.world
    noeud = next((n for n in monde.node_tree.nodes if n.type == "TEX_ENVIRONMENT" and n.image), None) \
        if monde and monde.use_nodes else None
    if noeud is None:
        return False
    img = noeud.image
    l, h = img.size
    px = np.empty(l * h * 4, dtype=np.float32)
    img.pixels.foreach_get(px)
    rgb = px.reshape(h, l, 4)[..., :3]
    # Réduction à la largeur voulue (moyenne par blocs).
    f = max(1, l // largeur)
    rgb = rgb[: h // f * f, : l // f * f].reshape(h // f, f, l // f, f, 3).mean(axis=(1, 3))
    lum = rgb @ np.array([0.2126, 0.7152, 0.0722], dtype=np.float32)
    # Les pixels d'une image Blender sont rangés de bas en haut : le ciel est dans la moitié haute.
    haut = lum[lum.shape[0] // 2:]
    # Soleil : tout ce qui dépasse nettement les nuages les plus clairs est remplacé par le ciel
    # autour, avec un large fondu pour effacer aussi le halo.
    soleil = lum > np.percentile(haut, 99) * 4
    if soleil.any():
        ys, xs = np.nonzero(soleil)
        cy, cx = ys.mean(), xs.mean()
        r = int(max(np.ptp(ys), np.ptp(xs)) * 2) + 24
        y0, y1 = max(int(cy) - 2 * r, 0), min(int(cy) + 2 * r, rgb.shape[0])
        x0, x1 = max(int(cx) - 2 * r, 0), min(int(cx) + 2 * r, rgb.shape[1])
        zone = rgb[y0:y1, x0:x1]
        yy, xx = np.mgrid[y0:y1, x0:x1]
        d = np.sqrt((yy - cy) ** 2 + (xx - cx) ** 2) / r
        anneau = (d > 1.6) & (d < 2.0)
        moyenne = zone[anneau].mean(axis=0) if anneau.any() else np.median(zone.reshape(-1, 3), axis=0)
        poids = np.clip((1.8 - d) / 1.2, 0, 1)[..., None]
        poids = poids * poids * (3 - 2 * poids)
        rgb[y0:y1, x0:x1] = zone * (1 - poids) + moyenne * poids
        lum = rgb @ np.array([0.2126, 0.7152, 0.0722], dtype=np.float32)
        haut = lum[lum.shape[0] // 2:]
    # Exposition : courbe douce qui garde le relief des nuages, ciel médian à mi-teinte.
    k = -np.log(1 - 0.26) / max(float(np.median(haut)), 1e-4)
    rgb = 1 - np.exp(-rgb * k)
    rgb = np.clip(rgb, 0, 1) ** (1 / 2.2)
    sortie = bpy.data.images.new("_ciel_fond", rgb.shape[1], rgb.shape[0], alpha=False)
    rgba = np.concatenate([rgb, np.ones(rgb.shape[:2] + (1,), np.float32)], axis=2)
    sortie.pixels.foreach_set(rgba.astype(np.float32).ravel())
    sortie.file_format = "WEBP"
    sortie.filepath_raw = chemin
    sortie.save(filepath=chemin, quality=82)
    bpy.data.images.remove(sortie)
    print("ciel photo :", chemin, round(os.path.getsize(chemin) / 1e3), "ko")
    return True
