"""Render the GitHub Pages project page into static DE (/) and EN (/en/) pages.

site/index.html is the template: translatable elements carry data-de/data-en,
the head uses {{TOKENS}}. Every language gets its own crawlable URL with
hreflang links, structured data (JSON-LD) and a sitemap entry.
Usage: python3 site/render.py <out_dir>
"""
import datetime, json, os, re, sys

BASE = 'https://glenn-dandy.github.io/easytiley/'
REPO = 'https://github.com/Glenn-Dandy/easytiley'
ROOT_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))

LANGS = {
    'de': {
        'TITLE': 'EasyTiley – kostenloses FHEM-Dashboard für Tablet & Browser',
        'DESC': 'Kostenloses Web-Dashboard für FHEM: Kacheln per Drag & Drop, Live-Werte in Echtzeit, '
                'ideal fürs Wand-Tablet. Licht, Heizung, Rollladen, Wetter, Diagramme – läuft offline in Docker.',
        'KEYWORDS': 'FHEM Dashboard, FHEM Tablet UI, FHEM Oberfläche, Smart Home Dashboard, Hausautomation, '
                    'Wand-Tablet, Android Kiosk-Browser, MQTT, FHEMWEB, Docker, Open Source',
        'LOCALE': 'de_DE', 'LOCALE_ALT': 'en_US',
        'IMG_ALT': 'EasyTiley FHEM-Dashboard mit Kacheln für Uhr, Wetter, Licht, Heizung, Rollladen und Diagramm',
        'DEMO_LABEL': 'Live-Demo öffnen',
        'APP_DESC': 'Web-Dashboard für die Hausautomation FHEM mit frei platzierbaren Kacheln und Echtzeit-Updates.',
    },
    'en': {
        'TITLE': 'EasyTiley – free FHEM dashboard for tablet & browser',
        'DESC': 'Free web dashboard for FHEM: drag & drop tiles, real-time live values, perfect for wall tablets. '
                'Lights, heating, shutters, weather, charts – runs offline in Docker.',
        'KEYWORDS': 'FHEM dashboard, FHEM tablet UI, FHEM frontend, smart home dashboard, home automation, '
                    'wall tablet, Android kiosk browser, MQTT, FHEMWEB, Docker, open source',
        'LOCALE': 'en_US', 'LOCALE_ALT': 'de_DE',
        'IMG_ALT': 'EasyTiley FHEM dashboard with tiles for clock, weather, lights, heating, shutters and a chart',
        'DEMO_LABEL': 'Open the live demo',
        'APP_DESC': 'Web dashboard for the FHEM home automation server with freely placed tiles and real-time updates.',
    },
}

TRANSLATABLE = re.compile(r'<(\w+)([^>]*?)\s+data-de="([^"]*)"\s+data-en="([^"]*)"([^>]*)>(.*?)</\1>', re.S)


def attr_to_html(v):
    # attribute values are escaped; turn them back into markup (keep &amp; entities)
    return v.replace('&lt;', '<').replace('&gt;', '>').replace('&quot;', '"')


def version():
    src = open(os.path.join(ROOT_DIR, 'public/js/app.js'), encoding='utf-8').read()
    m = re.search(r"APP_VERSION = '([^']+)'", src)
    return m.group(1) if m else ''


def render(tpl, lang):
    t = LANGS[lang]
    url = BASE + ('' if lang == 'de' else 'en/')
    html = TRANSLATABLE.sub(lambda m: '<%s%s%s>%s</%s>' % (
        m.group(1), m.group(2), m.group(5), attr_to_html(m.group(3 if lang == 'de' else 4)), m.group(1)), tpl)

    faq = [{'@type': 'Question', 'name': re.sub('<[^>]+>', '', q),
            'acceptedAnswer': {'@type': 'Answer', 'text': re.sub('<[^>]+>', '', a)}}
           for q, a in re.findall(r'<summary>(.*?)</summary><p>(.*?)</p>', html, re.S)]
    ld = [
        {'@context': 'https://schema.org', '@type': 'SoftwareApplication', 'name': 'EasyTiley',
         'description': t['APP_DESC'], 'url': url, 'image': BASE + 'screenshot.png', 'screenshot': BASE + 'screenshot.png',
         'applicationCategory': 'UtilitiesApplication', 'applicationSubCategory': 'Smart home dashboard',
         'operatingSystem': 'Linux, Docker, Web browser', 'softwareVersion': version(), 'inLanguage': ['de', 'en'],
         'license': 'https://opensource.org/licenses/MIT', 'isAccessibleForFree': True,
         'offers': {'@type': 'Offer', 'price': '0', 'priceCurrency': 'EUR'},
         'downloadUrl': REPO + '/releases/latest', 'codeRepository': REPO,
         'author': {'@type': 'Person', 'name': 'Glenn-Dandy', 'url': 'https://github.com/Glenn-Dandy'}},
        {'@context': 'https://schema.org', '@type': 'FAQPage', 'inLanguage': lang, 'mainEntity': faq},
    ]
    tokens = dict(t, LANG=lang, URL=url, BASE=BASE, ROOT='' if lang == 'de' else '../', VERSION=version(),
                  ON_DE='on' if lang == 'de' else '', ON_EN='on' if lang == 'en' else '',
                  JSONLD=json.dumps(ld, ensure_ascii=False).replace('</', '<\\/'))
    for k, v in tokens.items():
        if k in ('TITLE', 'DESC', 'IMG_ALT', 'DEMO_LABEL', 'KEYWORDS'):
            v = v.replace('&', '&amp;').replace('"', '&quot;')
        html = html.replace('{{%s}}' % k, str(v))
    left = re.findall(r'\{\{\w+\}\}', html)
    if left:
        sys.exit('unfilled tokens: %s' % sorted(set(left)))
    return html


def demo_meta(out):
    p = os.path.join(out, 'demo/index.html')
    html = open(p, encoding='utf-8').read()
    head = ('<title>EasyTiley Live-Demo – FHEM-Dashboard im Browser ausprobieren</title>\n'
            '  <meta name="description" content="Interaktive Demo von EasyTiley, dem kostenlosen FHEM-Dashboard: '
            'simulierte Geräte, Kacheln bedienen und bearbeiten – ohne Installation.">\n'
            '  <link rel="canonical" href="%sdemo/">' % BASE)
    html = re.sub(r'<title>[^<]*</title>', head, html, count=1)
    open(p, 'w', encoding='utf-8').write(html)


def sitemap(out):
    today = datetime.date.today().isoformat()
    alt = ('    <xhtml:link rel="alternate" hreflang="de" href="%s"/>\n'
           '    <xhtml:link rel="alternate" hreflang="en" href="%sen/"/>\n'
           '    <xhtml:link rel="alternate" hreflang="x-default" href="%s"/>\n') % (BASE, BASE, BASE)
    urls = [(BASE, '1.0', alt), (BASE + 'en/', '0.9', alt), (BASE + 'demo/', '0.6', '')]
    body = ''.join('  <url>\n    <loc>%s</loc>\n    <lastmod>%s</lastmod>\n    <priority>%s</priority>\n%s  </url>\n'
                   % (u, today, pr, a) for u, pr, a in urls)
    open(os.path.join(out, 'sitemap.xml'), 'w', encoding='utf-8').write(
        '<?xml version="1.0" encoding="UTF-8"?>\n'
        '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9" xmlns:xhtml="http://www.w3.org/1999/xhtml">\n'
        + body + '</urlset>\n')


if __name__ == '__main__':
    out = sys.argv[1]
    tpl = open(os.path.join(ROOT_DIR, 'site/index.html'), encoding='utf-8').read()
    open(os.path.join(out, 'index.html'), 'w', encoding='utf-8').write(render(tpl, 'de'))
    os.makedirs(os.path.join(out, 'en'), exist_ok=True)
    open(os.path.join(out, 'en/index.html'), 'w', encoding='utf-8').write(render(tpl, 'en'))
    demo_meta(out)
    sitemap(out)
    print('rendered de, en, demo meta, sitemap')
