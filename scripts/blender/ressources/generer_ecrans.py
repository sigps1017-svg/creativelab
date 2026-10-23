# Images affichées sur les écrans d'ordinateur de l'atelier (plans, 3D, façade, rendu).
# Lancer depuis la racine du dépôt :  python3 scripts/blender/ressources/generer_ecrans.py
# Les PNG produits sont lus par creativ_realisme.py.
import math
import os
import random

from PIL import Image, ImageDraw, ImageFont

ICI = os.path.dirname(os.path.abspath(__file__))
RACINE = os.path.normpath(os.path.join(ICI, "..", "..", ".."))
L, H = 1280, 800
INTER = "/usr/share/fonts/opentype/inter/Inter-{}.otf"

FOND = (24, 27, 32)
PANNEAU = (34, 38, 45)
BORD = (52, 57, 66)
TEXTE = (190, 196, 205)
TEXTE_PALE = (120, 128, 140)
LAITON = (200, 161, 101)
CYAN = (110, 200, 230)
TRAIT = (225, 232, 240)


def police(taille, graisse="Regular"):
    return ImageFont.truetype(INTER.format(graisse), taille)


def interface(titre, onglet):
    """Fenêtre de logiciel de CAO : barre de menus, outils à gauche, propriétés à droite."""
    im = Image.new("RGB", (L, H), FOND)
    d = ImageDraw.Draw(im)
    d.rectangle((0, 0, L, 34), fill=(18, 20, 24))
    d.text((14, 8), "CREATIV LAB", font=police(15, "SemiBold"), fill=LAITON)
    x = 140
    for m in ("Fichier", "Édition", "Vue", "Dessin", "Modèle", "Rendu", "Aide"):
        d.text((x, 9), m, font=police(14), fill=TEXTE_PALE)
        x += 78
    d.text((L - 330, 9), titre, font=police(14), fill=TEXTE)
    # onglets
    d.rectangle((0, 34, L, 66), fill=PANNEAU)
    x = 64
    for o in ("Plan RDC", "Façade sud", "Maquette 3D", "Rendu"):
        actif = o == onglet
        w = d.textlength(o, font=police(14)) + 32
        if actif:
            d.rectangle((x, 38, x + w, 66), fill=FOND)
            d.line((x, 38, x + w, 38), fill=LAITON, width=2)
        d.text((x + 16, 44), o, font=police(14), fill=TEXTE if actif else TEXTE_PALE)
        x += w + 4
    # outils
    d.rectangle((0, 66, 52, H), fill=PANNEAU)
    for i in range(11):
        y = 84 + i * 46
        d.rounded_rectangle((12, y, 40, y + 28), 5, outline=BORD, width=2, fill=(LAITON if i == 2 else PANNEAU))
    # propriétés
    d.rectangle((L - 250, 66, L, H), fill=PANNEAU)
    d.text((L - 232, 82), "PROPRIÉTÉS", font=police(13, "SemiBold"), fill=TEXTE_PALE)
    lignes = (("Calque", "A-MURS"), ("Épaisseur", "0,20 m"), ("Hauteur", "3,00 m"), ("Matériau", "Béton banché"),
              ("Niveau", "RDC  ±0,00"), ("Échelle", "1/100"))
    for i, (k, v) in enumerate(lignes):
        y = 116 + i * 34
        d.text((L - 232, y), k, font=police(13), fill=TEXTE_PALE)
        d.text((L - 120, y), v, font=police(13), fill=TEXTE)
        d.line((L - 232, y + 26, L - 16, y + 26), fill=BORD)
    d.text((L - 232, 340), "CALQUES", font=police(13, "SemiBold"), fill=TEXTE_PALE)
    for i, (n, c) in enumerate((("Murs", TRAIT), ("Menuiseries", CYAN), ("Cotations", LAITON), ("Mobilier", (140, 150, 160)),
                               ("Végétation", (120, 170, 110)))):
        y = 372 + i * 30
        d.rectangle((L - 232, y + 4, L - 220, y + 16), fill=c)
        d.text((L - 208, y), n, font=police(13), fill=TEXTE)
    # barre d'état
    d.rectangle((52, H - 28, L - 250, H), fill=(18, 20, 24))
    d.text((66, H - 22), "X 24,350   Y 12,180   Accrochage : extrémité", font=police(12), fill=TEXTE_PALE)
    return im, d, (52, 66, L - 250, H - 28)


def grille(d, zone, pas, couleur):
    x0, y0, x1, y1 = zone
    for x in range(x0, x1, pas):
        d.line((x, y0, x, y1), fill=couleur)
    for y in range(y0, y1, pas):
        d.line((x0, y, x1, y), fill=couleur)


def cote(d, a, b, texte, decalage=18):
    (xa, ya), (xb, yb) = a, b
    if ya == yb:
        y = ya - decalage
        d.line((xa, y, xb, y), fill=LAITON)
        for x in (xa, xb):
            d.line((x - 5, y + 5, x + 5, y - 5), fill=LAITON, width=2)
        d.text(((xa + xb) / 2 - 18, y - 18), texte, font=police(12), fill=LAITON)
    else:
        x = xa - decalage
        d.line((x, ya, x, yb), fill=LAITON)
        for y in (ya, yb):
            d.line((x - 5, y + 5, x + 5, y - 5), fill=LAITON, width=2)
        d.text((x - 44, (ya + yb) / 2 - 8), texte, font=police(12), fill=LAITON)


def plan():
    im, d, zone = interface("Villa Cocody — plan.pln", "Plan RDC")
    grille(d, zone, 24, (30, 34, 40))
    ox, oy, e = 170, 140, 7  # origine et échelle en pixels par 0,1 m
    def r(x, y, w, h):  # en mètres
        return (ox + x * e * 10, oy + y * e * 10, ox + (x + w) * e * 10, oy + (y + h) * e * 10)
    murs = [(0, 0, 11, 7.4), (0, 0, 5.2, 4.2), (5.2, 0, 5.8, 4.2), (0, 4.2, 3.6, 3.2), (3.6, 4.2, 3.2, 3.2), (6.8, 4.2, 4.2, 3.2)]
    for m in murs:
        d.rectangle(r(*m), outline=TRAIT, width=5 if m == murs[0] else 3)
    # ouvertures
    for x, y, w in ((1.2, 0, 2.6), (6.4, 0, 3.4), (8.0, 7.4, 1.8)):
        a, b = r(x, y - 0.1, w, 0.2)[0::2], r(x, y - 0.1, w, 0.2)[1::2]
        d.rectangle((a[0], b[0], a[1], b[1]), fill=FOND)
        d.line((a[0], (b[0] + b[1]) / 2, a[1], (b[0] + b[1]) / 2), fill=CYAN, width=2)
    for cx, cy in ((3.6, 5.2), (6.8, 5.6)):  # portes
        x, y = r(cx, cy, 0, 0)[:2]
        d.arc((x - 56, y - 56, x + 56, y + 56), 270, 360, fill=CYAN, width=2)
        d.line((x, y, x, y - 56), fill=CYAN, width=2)
    for (x, y, t) in ((1.6, 1.8, "SÉJOUR  32 m²"), (6.9, 1.8, "CUISINE  24 m²"), (0.5, 5.6, "CH. 1  11 m²"),
                      (3.9, 5.6, "SDB  8 m²"), (7.6, 5.6, "CH. 2  13 m²")):
        d.text(r(x, y, 0, 0)[:2], t, font=police(14, "Medium"), fill=TEXTE)
    # mobilier
    d.rounded_rectangle(r(0.6, 2.6, 2.4, 0.9), 8, outline=(140, 150, 160), width=2)
    d.rounded_rectangle(r(6.0, 2.8, 3.4, 0.8), 4, outline=(140, 150, 160), width=2)
    d.ellipse(r(1.6, 1.0, 1.0, 1.0)[:2] + r(2.6, 2.0, 0, 0)[:2], outline=(140, 150, 160), width=2)
    cote(d, r(0, 0, 0, 0)[:2], r(11, 0, 0, 0)[:2], "11,00", 34)
    cote(d, r(0, 0, 0, 0)[:2], r(0, 7.4, 0, 0)[:2], "7,40", 34)
    cote(d, r(0, 0, 0, 0)[:2], r(5.2, 0, 0, 0)[:2], "5,20", 16)
    # flèche nord et cartouche
    x, y = zone[2] - 70, zone[1] + 70
    d.polygon(((x, y - 30), (x - 12, y + 14), (x, y + 6), (x + 12, y + 14)), outline=TRAIT, fill=TRAIT)
    d.text((x - 5, y + 18), "N", font=police(14, "SemiBold"), fill=TRAIT)
    x0, y0 = zone[2] - 300, zone[3] - 92
    d.rectangle((x0, y0, zone[2] - 16, zone[3] - 14), outline=TEXTE_PALE, width=2)
    d.text((x0 + 12, y0 + 10), "CREATIV LAB ARCHITECTS", font=police(13, "SemiBold"), fill=LAITON)
    d.text((x0 + 12, y0 + 32), "Villa — Plan du rez-de-chaussée", font=police(12), fill=TEXTE)
    d.text((x0 + 12, y0 + 52), "Éch. 1/100     Ind. B     APD", font=police(12), fill=TEXTE_PALE)
    return im


def projeter(p, cam):
    """Vue axonométrique d'un point (x, y, z) pour la maquette 3D."""
    x, y, z = p
    a = math.radians(35)
    xr = x * math.cos(a) - y * math.sin(a)
    yr = x * math.sin(a) + y * math.cos(a) + cam
    f = 22
    return 520 + xr * f, 560 - z * f - yr * f * 0.45


def maquette():
    im, d, zone = interface("Siège AFG — maquette.3dm", "Maquette 3D")
    for y in range(zone[1], zone[3]):  # ciel dégradé
        t = (y - zone[1]) / (zone[3] - zone[1])
        d.line((zone[0], y, zone[2], y), fill=(int(40 + 20 * t), int(46 + 18 * t), int(56 + 14 * t)))
    for i in range(-12, 13, 2):  # grille au sol
        d.line(projeter((i, -12, 0), 0) + projeter((i, 12, 0), 0), fill=(70, 78, 90))
        d.line(projeter((-12, i, 0), 0) + projeter((12, i, 0), 0), fill=(70, 78, 90))

    def volume(x, y, z, w, p, h, teinte):
        s = [(x, y, z), (x + w, y, z), (x + w, y + p, z), (x, y + p, z)]
        t = [(a, b, c + h) for a, b, c in s]
        P = [projeter(q, 0) for q in s + t]
        faces = ((0, 1, 5, 4, 1.0), (0, 3, 7, 4, 0.75), (4, 5, 6, 7, 1.15))
        for a, b, c, e, k in faces:
            d.polygon([P[a], P[b], P[c], P[e]], fill=tuple(min(255, int(v * k)) for v in teinte), outline=(30, 34, 40))
        # bandeaux de fenêtres sur la face avant
        for n in range(1, int(h / 3.2) + 1):
            zz = z + n * 3.2 - 1.6
            q = [projeter(v, 0) for v in ((x + 0.4, y, zz - 0.7), (x + w - 0.4, y, zz - 0.7), (x + w - 0.4, y, zz + 0.7), (x + 0.4, y, zz + 0.7))]
            d.polygon(q, fill=(70, 100, 120))
    volume(-8, -2, 0, 16, 9, 6.4, (196, 190, 180))
    volume(-6, -1, 6.4, 9, 7, 9.6, (214, 208, 198))
    volume(3, 0, 6.4, 4, 6, 3.2, (168, 160, 150))
    # sélection et gizmo
    a, b = projeter((-6, -1, 16), 0), projeter((3, -1, 6.4), 0)
    d.rectangle((a[0] - 6, a[1] - 6, b[0] + 6, b[1] + 6), outline=LAITON, width=2)
    gx, gy = zone[0] + 60, zone[3] - 60
    for (dx, dy, c, t) in ((40, 10, (220, 90, 80), "X"), (-22, 16, (110, 190, 100), "Y"), (0, -42, (90, 140, 230), "Z")):
        d.line((gx, gy, gx + dx, gy + dy), fill=c, width=3)
        d.text((gx + dx + 4, gy + dy - 8), t, font=police(12, "SemiBold"), fill=c)
    d.text((zone[0] + 16, zone[1] + 12), "Perspective  ·  Ombré", font=police(13), fill=TEXTE)
    return im


def facade():
    im, d, zone = interface("Immeuble Plateau — façade.pln", "Façade sud")
    d.rectangle(zone, fill=(236, 236, 232))
    grille(d, zone, 32, (224, 224, 220))
    sol = 640
    d.line((zone[0] + 20, sol, zone[2] - 20, sol), fill=(40, 40, 40), width=4)
    x0, x1 = 230, 840
    niveaux = [sol - i * 92 for i in range(6)]
    d.rectangle((x0, niveaux[-1] - 30, x1, sol), outline=(40, 40, 40), width=3)
    for i, y in enumerate(niveaux[:-1]):
        d.line((x0, y, x1, y), fill=(90, 90, 90), width=2)
        for k in range(7):
            xa = x0 + 22 + k * 86
            d.rectangle((xa, y - 76, xa + 62, y - 14), outline=(40, 40, 40), width=2, fill=(200, 214, 222))
            d.line((xa + 31, y - 76, xa + 31, y - 14), fill=(40, 40, 40))
        d.text((x1 + 30, y - 10), f"+{i * 3.2:.2f}".replace(".", ","), font=police(13), fill=(40, 40, 40))
        d.line((x1 + 8, y, x1 + 24, y), fill=(40, 40, 40), width=2)
    for k in range(0, 9):  # brise-soleil
        xa = x0 - 6 + k * 77
        d.rectangle((xa, niveaux[-1] - 30, xa + 8, sol - 92), fill=(120, 96, 64))
    for i in range(3):  # arbres
        cx = 140 + i * 780
        if cx > zone[2] - 40:
            continue
        d.ellipse((cx - 50, sol - 190, cx + 50, sol - 80), outline=(60, 110, 60), width=2)
        d.line((cx, sol - 80, cx, sol), fill=(60, 110, 60), width=2)
    d.text((x0, sol + 24), "FAÇADE SUD  —  Éch. 1/200", font=police(16, "SemiBold"), fill=(40, 40, 40))
    d.text((x0, sol + 50), "Béton banché, menuiseries aluminium, brise-soleil bois", font=police(13), fill=(90, 90, 90))
    return im


def rendu():
    im, d, zone = interface("Rendu — vue-sur-rue.tm", "Rendu")
    photo = Image.open(os.path.join(RACINE, "public", "images", "projets", "vue-sur-rue.jpg")).convert("RGB")
    w, h = zone[2] - zone[0] - 40, zone[3] - zone[1] - 70
    k = max(w / photo.width, h / photo.height)
    photo = photo.resize((int(photo.width * k), int(photo.height * k)), Image.LANCZOS)
    photo = photo.crop(((photo.width - w) // 2, (photo.height - h) // 2, (photo.width - w) // 2 + w, (photo.height - h) // 2 + h))
    im.paste(photo, (zone[0] + 20, zone[1] + 20))
    y = zone[3] - 40
    d.rounded_rectangle((zone[0] + 20, y, zone[2] - 20, y + 16), 8, fill=PANNEAU)
    d.rounded_rectangle((zone[0] + 20, y, zone[0] + 20 + int((zone[2] - zone[0] - 40) * 0.72), y + 16), 8, fill=LAITON)
    d.text((zone[2] - 150, y - 22), "Rendu 72 %", font=police(13), fill=TEXTE)
    return im


def presentation():
    """Diapositive du grand écran (le site y fait défiler les projets)."""
    photo = Image.open(os.path.join(RACINE, "public", "images", "projets", "afg-bank-plateau.jpg")).convert("RGB")
    w, h = 1920, 1080
    k = max(w / photo.width, h / photo.height)
    photo = photo.resize((int(photo.width * k), int(photo.height * k)), Image.LANCZOS)
    im = photo.crop(((photo.width - w) // 2, (photo.height - h) // 2, (photo.width - w) // 2 + w, (photo.height - h) // 2 + h))
    voile = Image.new("L", (w, h), 0)
    dv = ImageDraw.Draw(voile)
    for y in range(h // 2, h):
        dv.line((0, y, w, y), fill=int(200 * ((y - h / 2) / (h / 2)) ** 1.4))
    im = Image.composite(Image.new("RGB", (w, h), (10, 10, 12)), im, voile)
    d = ImageDraw.Draw(im)
    d.text((96, h - 230), "CREATIV LAB ARCHITECTS", font=police(34, "Medium"), fill=LAITON)
    d.text((92, h - 180), "Nos réalisations", font=police(84, "Light"), fill=(245, 242, 236))
    return im


if __name__ == "__main__":
    random.seed(3)
    for nom, f in (("ecran_plan", plan), ("ecran_maquette", maquette), ("ecran_facade", facade), ("ecran_rendu", rendu)):
        photo = nom == "ecran_rendu"
        chemin = os.path.join(ICI, f"{nom}.jpg" if photo else f"{nom}.png")
        f().save(chemin, quality=86) if photo else f().save(chemin, optimize=True)
        print(chemin, os.path.getsize(chemin) // 1024, "Ko")
    chemin = os.path.join(ICI, "ecran_presentation.jpg")
    presentation().save(chemin, quality=86)
    print(chemin, os.path.getsize(chemin) // 1024, "Ko")
