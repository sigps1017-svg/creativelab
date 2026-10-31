# Creativ Lab Architects : textures photo (Poly Haven, licence CC0) sur les grandes surfaces
#
# À lancer dans le fichier creativ-batiment.blend (Texte > Exécuter, ou en ligne de commande).
# Le script télécharge pour chaque matériau de la liste une texture scannée (couleur, relief,
# rugosité), la range dans le dossier creativ-textures à côté du .blend, et remplace le réseau
# procédural du matériau par ces images. La taille réelle du motif est notée sur le matériau
# (propriété « photo_taille », en mètres) : creativ_export_web.py s'en sert pour les coordonnées
# de texture et ne recuit pas ces matériaux.
#
# Pour revenir en arrière sur un matériau, rouvrir la copie de sécurité du .blend.

import json
import os
import urllib.request

import bpy

# matériau : identifiant Poly Haven
TEXTURES = {
    "Beton": "concrete_wall_008",           # béton lisse clair des murs
    "Beton_sombre": "concrete_wall_008",    # même béton lisse : plus calme derrière cadres et portraits
    "Parvis": "concrete_tiles_02",          # dalles de béton gris du parvis
    "Trottoir": "concrete_pavement",
    "Dalles_terrasse": "granite_tile_03",
    "Sol_interieur": "marble_01",           # grandes dalles de pierre claire du rez-de-chaussée
    "Parquet_chene": "laminate_floor_02",
    "Deck_bois": "wood_floor",
    "Chene": "oak_veneer_01",
    "Bitume": "asphalt_02",
}
RESOLUTION = "1k"  # largement assez pour le web, et léger sur téléphone
CARTES = {"couleur": "Diffuse", "relief": "nor_gl", "rugosite": "Rough"}
ENTETES = {"User-Agent": "CreativLab-Blender/1.0"}

DOSSIER = os.path.join(os.path.dirname(bpy.data.filepath) or os.getcwd(), "creativ-textures")


def lire(url):
    return urllib.request.urlopen(urllib.request.Request(url, headers=ENTETES), timeout=60).read()


def telecharger(identifiant):
    """Renvoie {carte: chemin} et la taille réelle du motif en mètres."""
    infos = json.loads(lire(f"https://api.polyhaven.com/info/{identifiant}"))
    fichiers = json.loads(lire(f"https://api.polyhaven.com/files/{identifiant}"))
    taille = infos["dimensions"][0] / 1000
    chemins = {}
    os.makedirs(DOSSIER, exist_ok=True)
    for carte, cle in CARTES.items():
        if cle not in fichiers:
            continue
        url = fichiers[cle][RESOLUTION]["jpg"]["url"]
        chemin = os.path.join(DOSSIER, f"{identifiant}_{carte}_{RESOLUTION}.jpg")
        if not os.path.exists(chemin):
            with open(chemin, "wb") as f:
                f.write(lire(url))
        chemins[carte] = chemin
    return chemins, taille


def appliquer(materiau, chemins, taille, identifiant):
    nt = materiau.node_tree
    ancien = next((n for n in nt.nodes if n.type == "BSDF_PRINCIPLED"), None)
    metal = ancien.inputs["Metallic"].default_value if ancien else 0.0
    nt.nodes.clear()
    sortie = nt.nodes.new("ShaderNodeOutputMaterial")
    bsdf = nt.nodes.new("ShaderNodeBsdfPrincipled")
    bsdf.inputs["Metallic"].default_value = metal
    nt.links.new(bsdf.outputs["BSDF"], sortie.inputs["Surface"])
    # Dans Blender : projection en boîte à l'échelle réelle. À l'export, le site reçoit des
    # coordonnées calculées de la même façon (creativ_export_web.py).
    coord = nt.nodes.new("ShaderNodeTexCoord")
    echelle = nt.nodes.new("ShaderNodeMapping")
    echelle.inputs["Scale"].default_value = (1 / taille,) * 3
    nt.links.new(coord.outputs["Object"], echelle.inputs["Vector"])

    def image(carte, non_couleur):
        n = nt.nodes.new("ShaderNodeTexImage")
        n.image = bpy.data.images.load(chemins[carte], check_existing=True)
        if non_couleur:
            n.image.colorspace_settings.name = "Non-Color"
        n.projection = "BOX"
        n.projection_blend = 0.15
        nt.links.new(echelle.outputs["Vector"], n.inputs["Vector"])
        return n

    nt.links.new(image("couleur", False).outputs["Color"], bsdf.inputs["Base Color"])
    if "rugosite" in chemins:
        nt.links.new(image("rugosite", True).outputs["Color"], bsdf.inputs["Roughness"])
    if "relief" in chemins:
        nm = nt.nodes.new("ShaderNodeNormalMap")
        nt.links.new(image("relief", True).outputs["Color"], nm.inputs["Color"])
        nt.links.new(nm.outputs["Normal"], bsdf.inputs["Normal"])
    materiau["photo_taille"] = taille
    materiau["photo_source"] = f"polyhaven.com/a/{identifiant}"


for nom, identifiant in TEXTURES.items():
    m = bpy.data.materials.get(nom)
    if m is None:
        print("matériau absent :", nom)
        continue
    chemins, taille = telecharger(identifiant)
    appliquer(m, chemins, taille, identifiant)
    print(f"texture photo : {nom} ← {identifiant} ({taille:.2f} m)")
