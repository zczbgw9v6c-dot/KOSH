"""Hebcal data for Porto; date-keyed disk cache, no invented fallback times."""
import datetime as dt
import json
import ssl
import threading
from urllib.parse import urlencode
from urllib.request import Request, urlopen
from zoneinfo import ZoneInfo
import certifi
LOCK = threading.Lock()
LOCATION = dict(latitude=41.1496, longitude=-8.6109, tzid='Europe/Lisbon')

def fetch(path, params):
    url = 'https://www.hebcal.com/' + path + '?' + urlencode(params)
    with urlopen(Request(url, headers={'User-Agent':'KOSH/1.0 (Porto agenda)'}), timeout=12, context=ssl.create_default_context(cafile=certifi.where())) as r:
        return json.load(r)

def agenda(date, runtime):
    day = dt.date.fromisoformat(date)
    today = dt.datetime.now(ZoneInfo('Europe/Lisbon')).date()
    if abs((day-today).days)>366: raise ValueError('Date hors plage')
    cache = runtime / 'hebcal-v2'; cache.mkdir(exist_ok=True)
    file = cache / (date+'.json')
    with LOCK:
        if file.exists(): return json.loads(file.read_text())
        sunday = day-dt.timedelta(days=(day.weekday()+1)%7)
        end = sunday+dt.timedelta(days=6)
        calendar = fetch('hebcal',dict(v=1,cfg='json',start=sunday.isoformat(),end=end.isoformat(),c='on',b=18,M='on',s='on',F='on',leyning='off',**LOCATION))
        zmanim = fetch('zmanim',dict(cfg='json',date=date,**LOCATION))
        if not isinstance(calendar.get('items'),list) or not isinstance(zmanim.get('times'),dict): raise ValueError('Réponse Hebcal invalide')
        holidays=[x for x in calendar['items'] if x.get('category')=='holiday' and x.get('date','')[:10]==date]
        tefillin_status='shabbat' if day.weekday()==5 else 'holiday' if any(x.get('yomtov') for x in holidays) else 'chol_hamoed' if any(x.get('subcat')=='cholhamoed' or 'CH’M' in x.get('title','') or "CH''M" in x.get('title','') for x in holidays) else 'weekday'
        result = dict(tefillinStatus=tefillin_status,date=date,city='Porto',timezone='Europe/Lisbon',source='https://www.hebcal.com/',times=zmanim['times'],items=[x for x in calendar['items'] if x.get('category') in ('candles','havdalah','parashat','dafyomi')])
        temp=file.with_suffix('.tmp');temp.write_text(json.dumps(result));temp.replace(file)
        return result

VIDEO_CACHE = {}
def halakha():
    import time
    import html
    import re
    today = dt.datetime.now(ZoneInfo('Europe/Lisbon')).date().isoformat()
    if VIDEO_CACHE.get('date') == today and VIDEO_CACHE.get('until',0)>time.time(): return VIDEO_CACHE['data']
    with urlopen(Request('https://www.torah-box.com/halakha-time/',headers={'User-Agent':'KOSH/1.0'}),timeout=12,context=ssl.create_default_context(cafile=certifi.where())) as response:
        page=response.read(2000000).decode('utf-8')
    match=re.search(r'<iframe[^>]+src="(https://www\.torah-box\.com/v/[^\"]+)"',page)
    if not match: raise ValueError('Lecteur indisponible')
    url=html.unescape(match.group(1)).replace('\r','').replace('\n','')
    heading=re.search(r'<h1[^>]*>([\s\S]*?)</h1>',page)
    title=html.unescape(re.sub('<[^>]+>','',heading.group(1))).strip() if heading else 'Halakha Time'
    published=re.search(r'Cours du\s+([^<]+)',page)
    data={'checkedAt':dt.datetime.now(dt.timezone.utc).isoformat(),'publicationLabel':html.unescape(published.group(1)).strip() if published else None,'embed':url,'title':title,'source':'https://www.torah-box.com/halakha-time/'}
    VIDEO_CACHE.update(date=today,until=time.time()+60,data=data)
    return data

DAF_CACHE = {}
def daf_resources(tractate, folio):
    """Resolve links from the official page without copying its media."""
    import re
    import time
    from html.parser import HTMLParser
    from urllib.parse import urljoin
    if not re.fullmatch(r'[a-z]+(?:-[a-z]+)*', tractate) or not folio.isdigit() or not 2 <= int(folio) <= 200:
        raise ValueError('Page invalide')
    source = f'https://www.torah-box.com/torah-pdf/talmud/{tractate}/{int(folio)}.html'
    cached = DAF_CACHE.get(source)
    if cached and cached['until'] > time.time(): return cached['data']
    class Resources(HTMLParser):
        def __init__(self):
            super().__init__(); self.pdfs = {}; self.videos = []
        def handle_starttag(self, tag, attrs):
            attrs = dict(attrs)
            if tag == 'a':
                href = urljoin(source, attrs.get('href', ''))
                for side in ('a', 'b'):
                    if href.split('?')[0] == f'https://www.torah-box.com/torah-pdf/pdf/talmud_{tractate}_{int(folio)}{side}.pdf':
                        self.pdfs[side] = href.split('?')[0]
            if tag == 'iframe':
                src = attrs.get('src', '')
                if src.startswith('https://www.torah-box.com/v/') and src not in self.videos:
                    self.videos.append(src)
    with urlopen(Request(source, headers={'User-Agent': 'KOSH/1.0 (Daf Hayomi)'}), timeout=12, context=ssl.create_default_context(cafile=certifi.where())) as response:
        page = response.read(2000000).decode('utf-8')
    parser = Resources(); parser.feed(page)
    if not parser.pdfs and not parser.videos: raise ValueError('Ressources indisponibles')
    data = {'checkedAt': dt.datetime.now(dt.timezone.utc).isoformat(), 'source': source, 'pdfs': parser.pdfs, 'videos': parser.videos, 'folio': int(folio)}
    DAF_CACHE[source] = {'until': time.time()+60, 'data': data}
    return data


SYNC_STATUS = {}
SYNC_LOCK = threading.Lock()
def record_source(key, data, runtime):
    import hashlib
    payload = {k:v for k,v in data.items() if k not in ('checkedAt',)}
    digest = hashlib.sha256(json.dumps(payload,sort_keys=True).encode()).hexdigest()
    now = data['checkedAt']
    with SYNC_LOCK:
        previous = SYNC_STATUS.get(key,{})
        changed = previous.get('fingerprint') != digest
        entry = dict(previous, checkedAt=now, source=data['source'], fingerprint=digest, error=None)
        if changed:
            entry['detectedAt'] = now
            entry['publicationLabel'] = data.get('publicationLabel')
            journal = runtime / 'study-updates.jsonl'
            with journal.open('a') as f:
                f.write(json.dumps(dict(source=key,detectedAt=now,publicationLabel=data.get('publicationLabel'),initial=not bool(previous)))+'\n')
        SYNC_STATUS[key] = entry
        temp = runtime / 'study-sync.tmp'
        temp.write_text(json.dumps(SYNC_STATUS));temp.replace(runtime / 'study-sync.json')

def study_sync_loop(runtime, interval=60):
    """Observe official resources every minute while KOSH is running."""
    import re
    import time
    file = runtime / 'study-sync.json'
    if file.exists():
        try: SYNC_STATUS.update(json.loads(file.read_text()))
        except (ValueError,OSError): pass
    while True:
        for kind in ('halakha','daf'):
            try:
                if kind == 'halakha': data = halakha()
                else:
                    today = dt.datetime.now(ZoneInfo('Europe/Lisbon')).date().isoformat()
                    item = next(x for x in agenda(today,runtime)['items'] if x['category']=='dafyomi' and x['date'][:10]==today)
                    title, folio = item['title'].rsplit(' ',1)
                    aliases = {'Bechorot':'bekhorot','Bava Kamma':'baba-kama','Bava Metzia':'baba-metsia','Bava Batra':'baba-batra','Rosh Hashana':'roch-hachana','Chullin':'houlin','Chagigah':'haguiga','Avodah Zarah':'avoda-zara'}
                    slug = aliases.get(title,re.sub(r'[^a-z -]','',title.lower()).replace(' ','-'))
                    data = daf_resources(slug,folio)
                record_source(kind,data,runtime)
            except Exception:
                with SYNC_LOCK:
                    SYNC_STATUS.setdefault(kind,{})['error']='Source momentanément indisponible'
        time.sleep(interval)
