# Creativ Lab Architects : panorama d'environnement pour le site (public/modeles/ciel.webp)
#
# Appelé par creativ_export_web.py, comme la lumière précalculée. Cycles photographie à 360°
# ce qu'on voit depuis le parvis : le ciel du fichier (sans le disque du soleil, que le site
# dessine lui-même), la ville, les arbres, le sol. Le site s'en sert comme environnement :
# les vitres, les métaux et les sols cirés reflètent ce vrai décor au lieu d'une pièce neutre.

import math
import os

import bpy

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
