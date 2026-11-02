# Creativ Lab Architects : personnage « homme en costume » modélisé entièrement par script
#
# Construit dans une scène vide :
#   - un homme de 1,80 m en costume deux pièces bleu nuit (veste à revers, pantalon),
#     chemise blanche, cravate bordeaux, pochette, chaussures de ville noires, cheveux courts ;
#   - un squelette aux noms Mixamo (mixamorigHips, mixamorigSpine…), au repos en T, pour que
#     le site puisse lui appliquer les mêmes mouvements que les autres promeneurs ;
#   - deux animations sur place : « walk » (marche, 1,1 s) et « idle » (attente, 4 s) ;
#   - un export .glb léger (matériaux unis, sans texture) prêt pour three.js.
#
# Lancer dans Blender : onglet Scripting > Ouvrir > Exécuter. Le .glb est écrit à côté du
# fichier .blend (ou dans le dossier personnel si le fichier n'est pas enregistré).
# En ligne de commande : blender -b -P creativ_homme_costume.py -- sortie.glb [dossier_rendus]
#
# Coordonnées Blender : le personnage regarde vers -Y (vers la caméra de face), sa gauche est
# du côté +X, les pieds sont à z = 0, 1 unité = 1 m.

import math
import os
import sys

import bmesh
import bpy
from mathutils import Matrix, Quaternion, Vector
from mathutils.bvhtree import BVHTree

# ================================================================== scène vide

bpy.ops.wm.read_factory_settings(use_empty=True)
scene = bpy.context.scene
scene.render.fps = 30

# ================================================================== matériaux


def materiau(nom, couleur, rugosite, double=False):
    m = bpy.data.materials.new(nom)
    m.use_nodes = True
    p = m.node_tree.nodes.get("Principled BSDF")
    p.inputs["Base Color"].default_value = (*couleur, 1)
    p.inputs["Roughness"].default_value = rugosite
    m.use_backface_culling = not double
    m.diffuse_color = (*couleur, 1)
    return m


MAT = {
    "costume": materiau("Costume", (0.018, 0.024, 0.045), 0.78),
    "revers": materiau("Revers", (0.024, 0.030, 0.055), 0.55),
    "chemise": materiau("Chemise", (0.80, 0.81, 0.83), 0.6, double=True),
    "cravate": materiau("Cravate", (0.22, 0.025, 0.04), 0.42),
    "peau": materiau("Peau", (0.56, 0.34, 0.25), 0.55),
    "cheveux": materiau("Cheveux", (0.028, 0.018, 0.012), 0.62, double=True),
    "chaussures": materiau("Chaussures", (0.012, 0.009, 0.007), 0.22),
    "yeux": materiau("Yeux", (0.015, 0.011, 0.008), 0.25),
    "levres": materiau("Levres", (0.32, 0.14, 0.11), 0.5),
    "boutons": materiau("Boutons", (0.01, 0.01, 0.012), 0.3),
}

# ================================================================== squelette (noms Mixamo)

P = "mixamorig"
OS = {  # nom : (tête, queue, parent)
    "Hips": ((0, 0, 1.00), (0, 0, 1.10), None),
    "Spine": ((0, 0, 1.10), (0, 0, 1.22), "Hips"),
    "Spine1": ((0, 0, 1.22), (0, 0, 1.34), "Spine"),
    "Spine2": ((0, 0, 1.34), (0, 0, 1.47), "Spine1"),
    "Neck": ((0, 0.005, 1.47), (0, 0.005, 1.585), "Spine2"),
    "Head": ((0, 0.005, 1.585), (0, 0.005, 1.78), "Neck"),
    "HeadTop_End": ((0, 0.005, 1.78), (0, 0.005, 1.84), "Head"),
}
for c, s in (("Left", 1), ("Right", -1)):
    OS.update({
        c + "Shoulder": ((s * 0.03, 0, 1.44), (s * 0.16, 0, 1.445), "Spine2"),
        c + "Arm": ((s * 0.16, 0, 1.445), (s * 0.455, 0, 1.445), c + "Shoulder"),
        c + "ForeArm": ((s * 0.455, 0, 1.445), (s * 0.725, 0, 1.445), c + "Arm"),
        c + "Hand": ((s * 0.725, 0, 1.445), (s * 0.815, 0, 1.445), c + "ForeArm"),
        c + "HandEnd": ((s * 0.815, 0, 1.445), (s * 0.90, 0, 1.44), c + "Hand"),
        c + "UpLeg": ((s * 0.095, 0, 0.95), (s * 0.095, 0, 0.52), "Hips"),
        c + "Leg": ((s * 0.095, 0, 0.52), (s * 0.095, 0.005, 0.085), c + "UpLeg"),
        c + "Foot": ((s * 0.095, 0.005, 0.085), (s * 0.10, -0.115, 0.025), c + "Leg"),
        c + "ToeBase": ((s * 0.10, -0.115, 0.025), (s * 0.10, -0.19, 0.02), c + "Foot"),
        c + "Toe_End": ((s * 0.10, -0.19, 0.02), (s * 0.10, -0.23, 0.02), c + "ToeBase"),
    })
NON_DEFORMANTS = {"HeadTop_End", "LeftHandEnd", "RightHandEnd", "LeftToe_End", "RightToe_End"}

arm_data = bpy.data.armatures.new("Squelette")
armature = bpy.data.objects.new("HommeCostume_Squelette", arm_data)
scene.collection.objects.link(armature)
bpy.context.view_layer.objects.active = armature
bpy.ops.object.mode_set(mode="EDIT")
for nom, (tete, queue, parent) in OS.items():
    eb = arm_data.edit_bones.new(P + nom)
    eb.head, eb.tail, eb.roll = tete, queue, 0.0
    eb.use_deform = nom not in NON_DEFORMANTS
for nom, (tete, queue, parent) in OS.items():
    if parent:
        eb = arm_data.edit_bones[P + nom]
        eb.parent = arm_data.edit_bones[P + parent]
        eb.use_connect = (Vector(eb.head) - Vector(eb.parent.tail)).length < 1e-4
bpy.ops.object.mode_set(mode="OBJECT")

# ================================================================== outils de modélisation


def anneau(axe, pos, c1, c2, r1, r2, n=20, p=2.0):
    """Section elliptique (superellipse d'exposant p) perpendiculaire à l'axe x, y ou z."""
    pts = []
    for i in range(n):
        a = 2 * math.pi * i / n
        ca, sa = math.cos(a), math.sin(a)
        u = c1 + r1 * math.copysign(abs(ca) ** (2 / p), ca)
        v = c2 + r2 * math.copysign(abs(sa) ** (2 / p), sa)
        pts.append({"x": (pos, u, v), "y": (u, pos, v), "z": (u, v, pos)}[axe])
    return pts


def objet(nom, bm, mat, os_permis, subdiv=1, lisse=True, allege=0.55):
    """Crée l'objet, applique un lissage Catmull-Clark et note les os autorisés pour le skinning."""
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces[:])
    me = bpy.data.meshes.new(nom)
    bm.to_mesh(me)
    bm.free()
    ob = bpy.data.objects.new(nom, me)
    scene.collection.objects.link(ob)
    me.materials.append(MAT[mat])
    if subdiv:
        mod = ob.modifiers.new("Lissage", "SUBSURF")
        mod.levels = mod.render_levels = subdiv
        bpy.context.view_layer.objects.active = ob
        bpy.ops.object.modifier_apply(modifier=mod.name)
        if allege < 1:  # allègement pour le web
            mod = ob.modifiers.new("Allegement", "DECIMATE")
            mod.ratio = allege
            bpy.ops.object.modifier_apply(modifier=mod.name)
    for poly in ob.data.polygons:
        poly.use_smooth = lisse
    ob["os_permis"] = ",".join(os_permis)
    return ob


def loft(anneaux, bouche_debut=True, bouche_fin=True):
    bm = bmesh.new()
    rangs = [[bm.verts.new(p) for p in a] for a in anneaux]
    n = len(anneaux[0])
    for r0, r1 in zip(rangs, rangs[1:]):
        for i in range(n):
            j = (i + 1) % n
            bm.faces.new((r0[i], r0[j], r1[j], r1[i]))
    for rang, ok in ((rangs[0], bouche_debut), (rangs[-1], bouche_fin)):
        if ok:
            centre = bm.verts.new(sum((v.co for v in rang), Vector()) / n)
            for i in range(n):
                bm.faces.new((rang[i], rang[(i + 1) % n], centre))
    return bm


def sphere(centre, rayons, u=16, v=10):
    bm = bmesh.new()
    bmesh.ops.create_uvsphere(bm, u_segments=u, v_segments=v, radius=1.0)
    for vert in bm.verts:
        vert.co = Vector((vert.co.x * rayons[0], vert.co.y * rayons[1], vert.co.z * rayons[2])) + Vector(centre)
    return bm


def boite(centre, demi, rotation=None):
    bm = bmesh.new()
    bmesh.ops.create_cube(bm, size=2.0)
    for vert in bm.verts:
        co = Vector((vert.co.x * demi[0], vert.co.y * demi[1], vert.co.z * demi[2]))
        if rotation:
            co = rotation @ co
        vert.co = co + Vector(centre)
    return bm


def miroir(bm):
    """Symétrie gauche/droite (x -> -x) d'un bmesh, normales recalculées ensuite."""
    for vert in bm.verts:
        vert.co.x = -vert.co.x
    bmesh.ops.reverse_faces(bm, faces=bm.faces[:])
    return bm


def bvh(ob):
    return BVHTree.FromObject(ob, bpy.context.evaluated_depsgraph_get())


def sur_face(arbre, x, z, decalage, depuis=-1.0):
    """Point de la surface vue de face (rayon tiré depuis -Y), avancé de `decalage` vers l'avant."""
    hit = arbre.ray_cast(Vector((x, depuis, z)), Vector((0, 1, 0)))
    if hit[0] is None:
        hit = arbre.find_nearest(Vector((x, -0.05, z)))
    p, nrm = hit[0], hit[1]
    if nrm.y > 0:
        nrm = -nrm
    return p + nrm * decalage


def plaque(arbre, contour_par_rang, decalage, epaisseur=0.0):
    """Bande de quads posée sur une surface : contour_par_rang = [(x_gauche, x_droite, z), …]."""
    bm = bmesh.new()
    rangs = []
    for xa, xb, z in contour_par_rang:
        rang = []
        for k in range(5):
            x = xa + (xb - xa) * k / 4
            rang.append(bm.verts.new(sur_face(arbre, x, z, decalage)))
        rangs.append(rang)
    for r0, r1 in zip(rangs, rangs[1:]):
        for k in range(4):
            bm.faces.new((r0[k], r0[k + 1], r1[k + 1], r1[k]))
    if epaisseur:
        bmesh.ops.solidify(bm, geom=bm.faces[:], thickness=epaisseur)
    return bm


TRONC = ["Hips", "Spine", "Spine1", "Spine2"]
pieces = []

# ================================================================== tronc : veste

# (z, demi-largeur, demi-profondeur, centre y, exposant de forme)
VESTE = [
    (0.775, 0.192, 0.130, 0.004, 2.3),
    (0.86, 0.186, 0.125, 0.0, 2.3),
    (0.98, 0.172, 0.118, 0.0, 2.3),
    (1.08, 0.168, 0.118, -0.004, 2.4),
    (1.18, 0.178, 0.124, -0.008, 2.4),
    (1.28, 0.192, 0.128, -0.010, 2.5),
    (1.37, 0.205, 0.124, -0.006, 2.7),
    (1.43, 0.218, 0.112, 0.0, 3.4),
    (1.465, 0.212, 0.096, 0.004, 3.4),
    (1.495, 0.150, 0.082, 0.006, 2.4),
    (1.52, 0.080, 0.066, 0.008, 2.0),
]
veste = objet("Veste", loft([anneau("z", z, 0, cy, rx, ry, 24, p) for z, rx, ry, cy, p in VESTE]),
              "costume", TRONC + ["LeftShoulder", "RightShoulder", "Neck", "LeftUpLeg", "RightUpLeg"])
pieces.append(veste)
arbre_veste = bvh(veste)

# bassin (sous la veste) et jambes de pantalon
pieces.append(objet("Bassin", loft([anneau("z", z, 0, 0.0, rx, ry, 20) for z, rx, ry in
                                     ((0.80, 0.07, 0.06), (0.84, 0.15, 0.10), (0.95, 0.172, 0.112), (1.06, 0.165, 0.11))]),
                    "costume", ["Hips", "LeftUpLeg", "RightUpLeg", "Spine"]))

JAMBE = [(1.00, 0.092, 0.095, 0.0), (0.88, 0.088, 0.090, 0.0), (0.75, 0.079, 0.082, -0.002),
         (0.61, 0.066, 0.069, -0.002), (0.51, 0.060, 0.063, -0.004), (0.36, 0.056, 0.059, 0.002),
         (0.21, 0.054, 0.057, 0.004), (0.095, 0.056, 0.060, -0.006), (0.058, 0.058, 0.064, -0.010)]
for cote, s in (("Left", 1), ("Right", -1)):
    pieces.append(objet("Pantalon" + cote, loft([anneau("z", z, s * 0.095, cy, rx, ry, 18) for z, rx, ry, cy in JAMBE]),
                        "costume", ["Hips", cote + "UpLeg", cote + "Leg"]))

# chaussures de ville (bout légèrement effilé, semelle plate)
CHAUSSURE = [(0.075, 0.030, 0.034, 0.046), (0.05, 0.041, 0.050, 0.050), (0.0, 0.045, 0.054, 0.050),
             (-0.06, 0.047, 0.044, 0.040), (-0.12, 0.046, 0.034, 0.032), (-0.17, 0.039, 0.026, 0.026),
             (-0.205, 0.022, 0.017, 0.020)]
for cote, s in (("Left", 1), ("Right", -1)):
    bm = loft([anneau("y", y, s * 0.10, cz, rx, rz, 16) for y, rx, rz, cz in CHAUSSURE])
    for v in bm.verts:
        v.co.z = max(v.co.z, 0.004)
    ob = objet("Chaussure" + cote, bm, "chaussures", [cote + "Leg", cote + "Foot", cote + "ToeBase"])
    for v in ob.data.vertices:
        v.co.z = max(v.co.z, 0.0)
    pieces.append(ob)

# ================================================================== bras : manches, poignets, mains

MANCHE = [(0.13, 0.068, 0.070, 1.425), (0.21, 0.062, 0.066, 1.435), (0.32, 0.056, 0.058, 1.44),
          (0.455, 0.049, 0.050, 1.443), (0.58, 0.045, 0.046, 1.445), (0.70, 0.046, 0.047, 1.445),
          (0.712, 0.046, 0.047, 1.445)]
for cote, s in (("Left", 1), ("Right", -1)):
    bm = loft([anneau("x", x, 0.0, cz, ry, rz, 16) for x, ry, rz, cz in MANCHE])
    if s < 0:
        miroir(bm)
    pieces.append(objet("Manche" + cote, bm, "costume",
                        ["Spine2", cote + "Shoulder", cote + "Arm", cote + "ForeArm"]))

    bm = loft([anneau("x", x, -0.003, 1.445, 0.041, 0.040, 14) for x in (0.69, 0.712, 0.735)], True, True)
    if s < 0:
        miroir(bm)
    pieces.append(objet("Poignet" + cote, bm, "chemise", [cote + "ForeArm", cote + "Hand"]))

    # main au repos en T, paume vers le bas, pouce vers l'avant (-Y)
    bm = loft([anneau("x", x, cy, cz, ry, rz, 14) for x, ry, rz, cy, cz in
               ((0.722, 0.030, 0.020, 0.0, 1.444), (0.765, 0.043, 0.021, -0.002, 1.443),
                (0.815, 0.044, 0.016, -0.002, 1.440))])
    doigts = [(-0.031, 0.072, 0.0092), (-0.0105, 0.080, 0.0096), (0.0105, 0.075, 0.0092), (0.030, 0.060, 0.0082)]
    for y, longueur, r in doigts:
        d = loft([anneau("x", 0.805 + longueur * t, y, 1.440 - 0.012 * t * t, r * (1 - 0.18 * t), r * (1 - 0.15 * t), 8)
                  for t in (0.0, 0.35, 0.7, 1.0)])
        tmp = bpy.data.meshes.new("tmp")
        d.to_mesh(tmp)
        d.free()
        bm.from_mesh(tmp)
        bpy.data.meshes.remove(tmp)
    pouce = loft([anneau("x", x, y, z, 0.0115, 0.011, 8) for x, y, z in
                  ((0.742, -0.030, 1.439), (0.770, -0.052, 1.436), (0.795, -0.066, 1.433), (0.815, -0.074, 1.431))])
    tmp = bpy.data.meshes.new("tmp")
    pouce.to_mesh(tmp)
    pouce.free()
    bm.from_mesh(tmp)
    bpy.data.meshes.remove(tmp)
    if s < 0:
        miroir(bm)
    pieces.append(objet("Main" + cote, bm, "peau", [cote + "ForeArm", cote + "Hand"]))

# ================================================================== cou, col, tête

pieces.append(objet("Cou", loft([anneau("z", z, 0, 0.010, rx, ry, 16) for z, rx, ry in
                                  ((1.47, 0.062, 0.064), (1.55, 0.059, 0.062), (1.63, 0.056, 0.060))]),
                    "peau", ["Spine2", "Neck", "Head"]))
pieces.append(objet("Col", loft([anneau("z", z, 0, 0.008, rx, ry, 18) for z, rx, ry in
                                  ((1.50, 0.073, 0.074), (1.53, 0.068, 0.070), (1.558, 0.064, 0.067))], False, False),
                    "chemise", ["Spine2", "Neck"]))

TETE_C, TETE_R = Vector((0, 0.006, 1.678)), Vector((0.079, 0.099, 0.118))
bm = sphere(TETE_C, (1, 1, 1), 24, 16)
for v in bm.verts:
    x, y, z = v.co - TETE_C
    if z < 0:  # mâchoire et menton
        t = -z
        x *= 1 - 0.26 * t ** 1.6
        y = y * (1 - 0.18 * t ** 2) - 0.06 * t ** 2 * (y < 0)
    if y < 0:  # visage plus plat
        y *= 0.92
    elif z > -0.2:  # occiput
        y *= 1.04
    v.co = TETE_C + Vector((x * TETE_R.x, y * TETE_R.y, z * TETE_R.z))
tete = objet("Tete", bm, "peau", ["Head"])
pieces.append(tete)
arbre_tete = bvh(tete)

# traits du visage, posés sur la surface de la tête
for s in (1, -1):
    oeil = sur_face(arbre_tete, s * 0.031, 1.690, -0.004)
    pieces.append(objet("Oeil", sphere(oeil, (0.0095, 0.006, 0.0075), 12, 8), "yeux", ["Head"], 0))
    sourcil = sur_face(arbre_tete, s * 0.032, 1.712, 0.0015)
    rot = Matrix.Rotation(s * -0.10, 3, "Y")
    pieces.append(objet("Sourcil", boite(sourcil, (0.019, 0.004, 0.0035), rot), "cheveux", ["Head"], 1))
    oreille = TETE_C + Vector((s * 0.0755, 0.012, -0.012))
    pieces.append(objet("Oreille", sphere(oreille, (0.009, 0.019, 0.027), 12, 8), "peau", ["Head"], 0))
nez_base = sur_face(arbre_tete, 0, 1.662, -0.006)
bm = sphere(nez_base + Vector((0, -0.001, 0.008)), (0.0085, 0.013, 0.022), 12, 8)
for v in bm.verts:  # arête du nez : plus fine en haut, pointe vers l'avant en bas
    h = (v.co.z - nez_base.z) / 0.03
    v.co.x *= 1 - 0.35 * max(0, h)
    if v.co.y < nez_base.y:
        v.co.y -= 0.006 * max(0, 1 - abs(h + 0.2))
pieces.append(objet("Nez", bm, "peau", ["Head"], 1))
bouche = sur_face(arbre_tete, 0, 1.608, 0.0005)
pieces.append(objet("Bouche", boite(bouche, (0.019, 0.003, 0.0032)), "levres", ["Head"], 1))

# cheveux courts : calotte un peu plus grande que le crâne, coupée au-dessus des oreilles
bm = sphere(TETE_C + Vector((0, 0.004, 0.006)), (TETE_R.x * 1.085, TETE_R.y * 1.075, TETE_R.z * 1.06), 24, 16)
a_retirer = []
for v in bm.verts:
    ny = (v.co.y - TETE_C.y) / TETE_R.y
    seuil = 1.688 - 0.075 * max(ny, 0) ** 1.3 + 0.032 * max(-ny, 0) ** 1.5
    if v.co.z < seuil:
        a_retirer.append(v)
    elif v.co.z > 1.73 and ny < 0.3:  # un peu de volume sur le dessus et l'avant
        v.co += (v.co - TETE_C).normalized() * 0.007 * min(1, (v.co.z - 1.73) / 0.03)
bmesh.ops.delete(bm, geom=a_retirer, context="VERTS")
# le bord de la coupe vient se poser sur le crâne (pas de jour entre cheveux et peau)
bord = {v for v in bm.verts if v.is_boundary}
voisins = {e.other_vert(v) for v in bord for e in v.link_edges} - bord
for groupe, f in ((bord, 1.0), (voisins, 0.45)):
    for v in groupe:
        d = v.co - TETE_C
        v.co = TETE_C + d * (1 - f * 0.075)
pieces.append(objet("Cheveux", bm, "cheveux", ["Head"]))

# ================================================================== chemise, cravate, revers, boutons

# V de chemise visible entre les revers
rangs = [(-0.058 * (1 - t), 0.058 * (1 - t), 1.512 - 0.29 * t) for t in [i / 8 for i in range(9)]]
rangs[-1] = (-0.004, 0.004, rangs[-1][2])
pieces.append(objet("Plastron", plaque(arbre_veste, rangs, 0.0015), "chemise", TRONC, 0))

# cravate : nœud puis pan qui disparaît sous la veste boutonnée
noeud = sur_face(arbre_veste, 0, 1.494, 0.006)
bm = sphere(noeud, (0.016, 0.009, 0.014), 12, 8)
for v in bm.verts:  # nœud en trapèze, plus étroit en bas
    v.co.x *= 1 - 0.4 * max(0.0, (noeud.z - v.co.z) / 0.014)
pieces.append(objet("Noeud", bm, "cravate", TRONC + ["Neck"], 0))
rangs = [(-w, w, z) for w, z in ((0.012, 1.482), (0.016, 1.43), (0.020, 1.36), (0.024, 1.29), (0.026, 1.235), (0.004, 1.205))]
pieces.append(objet("Cravate", plaque(arbre_veste, rangs, 0.0042), "cravate", TRONC, 0))

# revers (crantés) le long du V, de chaque côté
for s in (1, -1):
    rangs = []
    for i in range(10):
        t = i / 9
        x_int = 0.060 * (1 - t) + 0.006 * t
        z = 1.515 - 0.30 * t
        largeur = 0.040 * math.sin(math.pi * min(1, t * 1.15)) ** 0.6 + 0.004
        if 0.12 < t < 0.2:  # cran du revers
            largeur *= 0.45
        xa, xb = (x_int, x_int + largeur) if s > 0 else (-x_int - largeur, -x_int)
        rangs.append((xa, xb, z))
    pieces.append(objet("Revers", plaque(arbre_veste, rangs, 0.003, 0.004), "revers", TRONC, 0, False))

for z in (1.16, 1.07):
    pieces.append(objet("Bouton", sphere(sur_face(arbre_veste, 0.004, z, 0.002), (0.0085, 0.0035, 0.0085), 10, 6),
                        "boutons", TRONC, 0))

# pochette blanche dans la poche de poitrine (côté gauche du personnage)
rangs = [(0.088, 0.135, 1.322), (0.092, 0.132, 1.335), (0.100, 0.122, 1.348), (0.108, 0.114, 1.356)]
pieces.append(objet("Pochette", plaque(arbre_veste, rangs, 0.0035), "chemise", TRONC, 0))
rangs = [(0.082, 0.142, 1.318), (0.082, 0.142, 1.326)]
pieces.append(objet("Poche", plaque(arbre_veste, rangs, 0.0025), "revers", TRONC, 0, False))

# ================================================================== poids de skinning

def distance_segment(p, a, b):
    ab = b - a
    t = max(0.0, min(1.0, (p - a).dot(ab) / ab.length_squared))
    return (p - (a + ab * t)).length


SEGMENTS = {nom: (Vector(OS[nom][0]), Vector(OS[nom][1])) for nom in OS if nom not in NON_DEFORMANTS}

for ob in pieces:
    permis = ob["os_permis"].split(",")
    groupes = {nom: ob.vertex_groups.new(name=P + nom) for nom in permis}
    for v in ob.data.vertices:
        p = v.co
        poids = {}
        for nom in permis:
            a, b = SEGMENTS[nom]
            d = max(distance_segment(p, a, b), 0.005)
            w = 1.0 / d ** 5
            # la veste ne suit les cuisses que dans son bas, et seulement du bon côté
            if ob.name == "Veste" and nom.endswith("UpLeg"):
                bas = max(0.0, min(1.0, (0.94 - p.z) / 0.14))
                cote = 1 if nom.startswith("Left") else -1
                w *= bas * 0.45 if p.x * cote > 0.015 else 0.0
            if ob.name == "Veste" and nom == "Neck" and p.z < 1.49:
                w = 0.0
            poids[nom] = w
        meilleurs = sorted(poids.items(), key=lambda kv: -kv[1])[:3]
        total = sum(w for _, w in meilleurs) or 1.0
        for nom, w in meilleurs:
            if w / total > 0.01:
                groupes[nom].add([v.index], w / total, "REPLACE")

# ================================================================== assemblage

bpy.ops.object.select_all(action="DESELECT")
for ob in pieces:
    ob.select_set(True)
bpy.context.view_layer.objects.active = veste
bpy.ops.object.join()
corps = veste
corps.name = corps.data.name = "HommeCostume"
del corps["os_permis"]
corps.parent = armature
mod = corps.modifiers.new("Squelette", "ARMATURE")
mod.object = armature

# ================================================================== animations

def rot(axe, degres):
    return Quaternion(axe, math.radians(degres))


X, Y, Z = Vector((1, 0, 0)), Vector((0, 1, 0)), Vector((0, 0, 1))


def avant(degres):
    """Bascule vers l'avant (vers -Y) d'un os qui pointe vers le bas (jambes, bras baissés)."""
    return rot(X, -degres)


def pencher(degres):
    """Penche vers l'avant un os qui pointe vers le haut (tronc, cou, tête)."""
    return rot(X, degres)


REPOS = {pb.name: pb.bone.matrix_local.to_quaternion() for pb in armature.pose.bones}


def poser(deltas, hanches=Vector()):
    """deltas : rotation de chaque os exprimée dans le repère de repos de son parent."""
    for pb in armature.pose.bones:
        r = REPOS[pb.name]
        d = deltas.get(pb.name[len(P):], Quaternion())
        pb.rotation_mode = "QUATERNION"
        pb.rotation_quaternion = r.inverted() @ d @ r
        pb.location = Vector()
    hips = armature.pose.bones[P + "Hips"]
    hips.location = REPOS[hips.name].inverted() @ hanches


def cle(frame):
    for pb in armature.pose.bones:
        pb.keyframe_insert("rotation_quaternion", frame=frame)
        if pb.name == P + "Hips":
            pb.keyframe_insert("location", frame=frame)


def bras_baisses(cote, s, balancement, flexion):
    return {
        cote + "Shoulder": rot(Y, s * 4),
        cote + "Arm": avant(balancement) @ rot(Y, s * 76) @ rot(X, s * -6),
        cote + "ForeArm": rot(Z, -s * flexion),
        cote + "Hand": rot(Z, -s * 6) @ rot(X, s * 8),
    }


def nouvelle_action(nom):
    act = bpy.data.actions.new(nom)
    act.use_fake_user = True
    armature.animation_data_create()
    armature.animation_data.action = act
    return act


# --- marche : cycle de 33 images (1,1 s), sur place
DUREE = 33
marche = nouvelle_action("walk")
for f in range(DUREE + 1):
    ph = 2 * math.pi * f / DUREE
    d = {}
    for cote, s, dec in (("Left", 1, 0.0), ("Right", -1, math.pi)):
        q = ph + dec
        cuisse = 24 * math.sin(q) + 2
        genou = 6 + 42 * max(0.0, math.cos(q - 0.35)) ** 1.6 + 8 * max(0.0, -math.cos(q)) * max(0.0, math.sin(q))
        pied = -(cuisse - genou) * 0.85 + 12 * max(0.0, -math.sin(q)) ** 2 * (math.cos(q) < 0) - 4
        d[cote + "UpLeg"] = avant(cuisse) @ rot(Y, -s * 1.5)
        d[cote + "Leg"] = avant(-genou)
        d[cote + "Foot"] = avant(pied)
        d[cote + "ToeBase"] = avant(-14 * max(0.0, -math.sin(q)) * (math.cos(q) < 0))
        # le bras gauche avance avec la jambe droite
        d.update(bras_baisses(cote, s, -17 * math.sin(q), 14 + 10 * max(0.0, -math.sin(q))))
    d["Hips"] = rot(Z, 5 * math.sin(ph)) @ rot(Y, 2.5 * math.cos(2 * ph))
    d["Spine"] = rot(Z, -3 * math.sin(ph)) @ pencher(3)
    d["Spine1"] = rot(Z, -2.5 * math.sin(ph)) @ rot(Y, -1.2 * math.cos(2 * ph))
    d["Spine2"] = rot(Z, -2 * math.sin(ph)) @ pencher(-1)
    d["Neck"] = rot(Z, 1.5 * math.sin(ph)) @ pencher(3)
    d["Head"] = rot(Z, 1.5 * math.sin(ph)) @ pencher(-2 + 1.2 * math.cos(2 * ph))
    poser(d, Vector((0.012 * math.cos(ph), 0, 0.028 * (abs(math.cos(ph)) - 0.6))))
    cle(f)

# --- attente : respiration lente, léger transfert de poids, cycle de 4 s
DUREE_ATTENTE = 120
attente = nouvelle_action("idle")
for f in range(0, DUREE_ATTENTE + 1, 4):
    ph = 2 * math.pi * f / DUREE_ATTENTE
    souffle = math.sin(2 * ph)
    d = {}
    for cote, s in (("Left", 1), ("Right", -1)):
        d.update(bras_baisses(cote, s, 2 + 1.5 * souffle, 12 + 2 * souffle))
        d[cote + "UpLeg"] = rot(Y, -s * 2.5 + 1.5 * math.sin(ph)) @ avant(1)
        d[cote + "Leg"] = avant(-2 - 1.5 * max(0.0, s * math.sin(ph)))
        d[cote + "Foot"] = avant(1) @ rot(Y, s * 2.5 - 1.5 * math.sin(ph))
    d["Hips"] = rot(Y, -1.5 * math.sin(ph))
    d["Spine"] = rot(Y, 1.0 * math.sin(ph)) @ pencher(-0.8 * souffle)
    d["Spine1"] = pencher(-0.8 * souffle)
    d["Spine2"] = pencher(-0.6 * souffle)
    d["Head"] = rot(Z, 4 * math.sin(ph * 0.5 + 0.6)) @ pencher(1.5)
    poser(d, Vector((0.012 * math.sin(ph), 0, -0.004 - 0.002 * souffle)))
    cle(f)

# les deux actions sont rangées dans des pistes NLA pour l'export
armature.animation_data.action = None
for act in (marche, attente):
    piste = armature.animation_data.nla_tracks.new()
    piste.name = act.name
    piste.strips.new(act.name, 0, act)
    piste.mute = True
for pb in armature.pose.bones:  # retour à la pose en T
    pb.rotation_quaternion = Quaternion()
    pb.location = Vector()

# ================================================================== export

args = sys.argv[sys.argv.index("--") + 1:] if "--" in sys.argv else []
dossier = os.path.dirname(bpy.data.filepath) if bpy.data.filepath else os.path.expanduser("~")
sortie = args[0] if args else os.path.join(dossier, "homme-costume.glb")

bpy.ops.object.select_all(action="DESELECT")
armature.select_set(True)
corps.select_set(True)
bpy.ops.export_scene.gltf(
    filepath=sortie,
    export_format="GLB",
    use_selection=True,
    export_apply=False,
    export_skins=True,
    export_animations=True,
    export_animation_mode="ACTIONS",
    export_force_sampling=True,
    export_frame_step=1,
    export_def_bones=False,
    export_yup=True,
)
nb = sum(len(p.vertices) - 2 for p in corps.data.polygons)
print(f"Homme en costume : {len(corps.data.vertices)} sommets, {nb} triangles -> {sortie}")
