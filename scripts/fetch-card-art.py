# Rebuild Heirs Ad Astra card art from the National Gallery of Art's open-access images.
# Each card design gets one public-domain work (openaccess=1 in NGA's opendata), cropped 2:1
# through IIIF, converted to WebP (Pillow), plus card-art/manifest.json with the credits.
#   git clone --depth 1 https://github.com/NationalGalleryOfArt/opendata /tmp/nga
#   python3 scripts/fetch-card-art.py /tmp/nga/data [card-key ...]
import csv, json, os, subprocess, sys, urllib.request, concurrent.futures as cf
csv.field_size_limit(10**9)
import tempfile
REPO = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
OUT = os.path.join(REPO, 'prototypes/galactic-reach/card-art')
RAW = tempfile.mkdtemp(prefix='card-art-')
DATA = sys.argv[1] if len(sys.argv) > 1 else 'nga-opendata/data'
W, H = 600, 300  # 2:1, the card art window's shape; CSS covers the rest
UA = {'User-Agent': 'drawing-board-card-art/1.0 (+https://github.com/CardBoardStudio/drawing_board)'}

# key: (family, NGA object id, focus x, focus y (0-1 of the image), zoom (1 = the largest 2:1 window))
CARDS = {
  # Starters and unit-bundled cards: Hudson River and Romantic landscapes of travel and settlement.
  'move': ('Starter', 52279, .5, .55, 1), 'construct': ('Starter', 30776, .5, .6, 1), 'colonize': ('Starter', 50852, .5, .55, 1),
  'probe': ('Starter', 121618, .55, .45, 1), 'excavate': ('Starter', 221599, .5, .55, 1),
  'concentratedFire': ('Basic tactic', 195475, .55, .5, 1), 'defensiveScreen': ('Basic tactic', 80924, .5, .45, 1),
  # Movement: ships under sail.
  'ionThrusters': ('Movement', 30228, .4, .45, 1), 'slipstreamCharts': ('Movement', 57611, .5, .55, 1),
  'strikeVector': ('Movement', 1226, .5, .5, 1), 'foldSpaceGate': ('Movement', 117, .5, .5, 1),
  # Industry: forges and furnaces.
  'prefabYards': ('Industry', 50690, .5, .5, 1), 'worldEngine': ('Industry', 1225, .5, .5, 1),
  # Expansion: tropical and paradise landscapes.
  'seedArk': ('Expansion', 50299, .5, .5, 1), 'colonyPods': ('Expansion', 166437, .5, .5, 1), 'genesisCharter': ('Expansion', 52451, .5, .45, 1),
  # Deckcraft: survey, signal and command.
  'strategyCore': ('Deckcraft', 166428, .5, .4, 1), 'archivePurge': ('Deckcraft', 195574, .5, .45, 1), 'commandNexus': ('Deckcraft', 129865, .5, .4, 1),
  'signalRelay': ('Deckcraft', 42389, .5, .5, 1), 'surveyNetwork': ('Deckcraft', 82648, .5, .5, 1), 'tacticalBriefing': ('Deckcraft', 46602, .5, .45, 1),
  # Capacity, Buy, Wonder and Prestige: harbours, vaults and monuments.
  'cargoExpansion': ('Capacity', 154215, .5, .55, 1), 'hyperspaceVaults': ('Capacity', 50884, .5, .35, 1),
  'procurementHub': ('Buy', 71554, .5, .5, 1), 'tradeSyndicate': ('Buy', 1224, .5, .5, 1),
  'monumentOfAccord': ('Wonder', 165, .5, .3, 1), 'dysonLattice': ('Wonder', 46089, .5, .45, 1),
  'ascendancyCodex': ('Prestige', 52453, .5, .25, 1),
  # Military deck: naval battle, storm and fortification.
  'railBattery': ('Military', 45885, .5, .45, 1), 'deflectorGrid': ('Military', 126132, .5, .5, 1), 'flakScreen': ('Military', 112264, .5, .5, 1),
  'torpedoSpread': ('Military', 111194, .5, .5, 1), 'hardlightBulwark': ('Military', 70987, .5, .5, 1), 'phaseLance': ('Military', 51138, .5, .5, 1),
  'novaBarrage': ('Military', 56598, .5, .45, 1), 'aegisLattice': ('Military', 82649, .5, .45, 1), 'victoryDoctrine': ('Military', 157388, .5, .5, 1),
  # Alien relics: engravings and drawings of imaginary ruins, star charts and the moon.
  'phaseShearDrive': ('Alien Relic', 33734, .5, .5, 1), 'firstDawnEchoes': ('Alien Relic', 74798, .5, .55, 1),
  'omniscientChorus': ('Alien Relic', 136358, .315, .5, .42), 'obeliskOfAnnihilation': ('Alien Relic', 54439, .55, .45, 1),
  'aegisOfSilentArchitects': ('Alien Relic', 33735, .5, .5, 1), 'warSongOfHollowStars': ('Alien Relic', 110481, .5, .4, 1),
  'starfarersCompass': ('Alien Relic', 43181, .5, .5, 1), 'horizonSail': ('Alien Relic', 139124, .5, .3, 1),
  'memoryPrism': ('Alien Relic', 33739, .5, .5, 1), 'archiveOfTides': ('Alien Relic', 33738, .5, .55, 1),
  'stellarCrucible': ('Alien Relic', 33740, .5, .5, 1), 'evergreenArk': ('Alien Relic', 56673, .5, .5, 1),
  'foldedWarehouse': ('Alien Relic', 33741, .5, .5, 1), 'cinderDrive': ('Alien Relic', 33731, .5, .4, 1),
  'keepersArchive': ('Alien Relic', 43182, .5, .5, 1),
  # New relics continue the imaginary-architecture engraving theme.
  'prismaticReservoir': ('Alien Relic', 9794, .5, .5, 1),
  'hourglassOfTwoSuns': ('Alien Relic', 30124, .5, .5, 1),
  'crownOfTheUsurper': ('Alien Relic', 67345, .5, .5, 1),
  'phoenixCrucible': ('Alien Relic', 56867, .5, .5, 1),
  'worldseed': ('Alien Relic', 54766, .5, .5, 1),
  'theSilentHour': ('Alien Relic', 80710, .5, .5, 1),
  'gravityScepter': ('Alien Relic', 55808, .5, .5, 1),
  'eclipseRegalia': ('Alien Relic', 55809, .5, .5, 1),
  'oracleOfTheUnmade': ('Alien Relic', 36456, .5, .5, 1),
}

def metadata():
    want = {str(v[1]) for v in CARDS.values()}
    objs, imgs = {}, {}
    with open(os.path.join(DATA, 'objects.csv'), encoding='utf-8', newline='') as f:
        for o in csv.DictReader(f):
            if o['objectid'] in want: objs[o['objectid']] = o
    with open(os.path.join(DATA, 'published_images.csv'), encoding='utf-8', newline='') as f:
        for r in csv.DictReader(f):
            if r['depictstmsobjectid'] in want and r['viewtype'] == 'primary': imgs[r['depictstmsobjectid']] = r
    return objs, imgs

def get(url):
    return urllib.request.urlopen(urllib.request.Request(url, headers=UA), timeout=120).read()

def one(key, objs, imgs):
    family, oid, fx, fy, zoom = CARDS[key]
    o, i = objs[str(oid)], imgs[str(oid)]
    assert i['openaccess'] == '1', f'{key}: object {oid} is not open access'
    info = json.loads(get(i['iiifurl'] + '/info.json'))
    iw, ih = info['width'], info['height']
    cw = min(iw, ih * W / H) * zoom; ch = cw * H / W
    x = min(max(fx * iw - cw / 2, 0), iw - cw); y = min(max(fy * ih - ch / 2, 0), ih - ch)
    region = f'{round(x)},{round(y)},{round(cw)},{round(ch)}'
    src = f"{i['iiifurl']}/{region}/{W},{H}/0/default.jpg"
    jpg = os.path.join(RAW, f'{key}.jpg')
    open(jpg, 'wb').write(get(src))
    from PIL import Image
    Image.open(jpg).save(os.path.join(OUT, f'{key}.webp'), 'WEBP', quality=68, method=6)
    return key, {
        'family': family, 'image': f'card-art/{key}.webp', 'ngaObjectId': oid, 'title': o['title'], 'artist': o['attribution'],
        'date': o['displaydate'], 'medium': o['medium'], 'accession': o['accessionnum'], 'creditLine': o['creditline'],
        'objectPage': f'https://www.nga.gov/collection/art-object-page.{oid}.html', 'iiif': src,
        'crop': {'region': region, 'imageSize': [iw, ih], 'output': [W, H]}, 'license': 'CC0 1.0 (NGA Open Access)',
    }

if __name__ == '__main__':
    only = sys.argv[2:]
    objs, imgs = metadata()
    path = os.path.join(OUT, 'manifest.json')
    old = json.load(open(path))['cards'] if os.path.exists(path) else {}
    keys = only or list(CARDS)
    with cf.ThreadPoolExecutor(6) as ex:
        done = dict(ex.map(lambda k: one(k, objs, imgs), keys))
    cards = {k: done.get(k) or old[k] for k in CARDS}
    manifest = {
        'source': 'National Gallery of Art, Washington, open access images (https://www.nga.gov/open-access-images.html); metadata from https://github.com/NationalGalleryOfArt/opendata',
        'license': 'CC0 1.0 Universal. NGA releases these public-domain images without restriction and asks for a credit line, given here and on the card gallery.',
        'cards': cards,
    }
    json.dump(manifest, open(path, 'w'), indent=1, ensure_ascii=False); open(path, 'a').write('\n')
    print('wrote', len(keys), 'images;', sum(os.path.getsize(os.path.join(OUT, f)) for f in os.listdir(OUT)), 'bytes in', OUT)
