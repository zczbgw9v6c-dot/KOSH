import datetime as dt
import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch
from zoneinfo import ZoneInfo
import religious
class ReligiousTest(unittest.TestCase):
 def test_cache_and_filter(self):
  date=dt.datetime.now(ZoneInfo('Europe/Lisbon')).date().isoformat()
  def source(path,params):
   return {'times':{'sunrise':date+'T07:00:00+01:00'}} if path=='zmanim' else {'items':[{'category':'dafyomi','date':date,'title':'Test 2'},{'category':'holiday'}]}
  with tempfile.TemporaryDirectory() as directory,patch.object(religious,'fetch',side_effect=source) as fetch:
   first=religious.agenda(date,Path(directory));self.assertEqual(first,religious.agenda(date,Path(directory)));self.assertEqual(fetch.call_count,2);self.assertEqual(len(first['items']),1)
 def test_invalid_date(self):
  with patch.object(religious,'fetch') as fetch:
   with self.assertRaises(ValueError):religious.agenda('2000-01-01',Path('/tmp'))
   fetch.assert_not_called()
 def test_failure_not_cached(self):
  date=dt.datetime.now(ZoneInfo('Europe/Lisbon')).date().isoformat()
  with tempfile.TemporaryDirectory() as directory,patch.object(religious,'fetch',side_effect=OSError('offline')):
   with self.assertRaises(OSError):religious.agenda(date,Path(directory))
   self.assertFalse(list(Path(directory).rglob('*.json')))

 def test_full_year_and_holiday_tefillin_reference(self):
  today=dt.datetime.now(ZoneInfo('Europe/Lisbon')).date();day=today+dt.timedelta(days=200)
  if day.weekday()==5:day+=dt.timedelta(days=1)
  date=day.isoformat()
  def source(path,params):
   return {'times':{'sunrise':date+'T07:00:00Z'}} if path=='zmanim' else {'items':[{'category':'holiday','date':date,'yomtov':True,'title':'Festival'}]}
  with tempfile.TemporaryDirectory() as directory,patch.object(religious,'fetch',side_effect=source):
   data=religious.agenda(date,Path(directory));self.assertEqual(data['tefillinStatus'],'holiday')
