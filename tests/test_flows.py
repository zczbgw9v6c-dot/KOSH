"""Integration checks against an isolated database; no production data or API calls."""
import http.client
import json
import os
from pathlib import Path
import secrets
import sys
import tempfile
import threading
import unittest
sys.path.insert(0,str(Path(__file__).resolve().parents[1]))
TEMP=tempfile.TemporaryDirectory();os.environ['PK_RUNTIME']=TEMP.name
import server as app
CART={'m':'levfood','lines':[{'id':'add-009','q':1}]}  # I-5: address search needs a cart in progress

class Browser:
    def __init__(self,port,portal='client'): self.port,self.portal,self.cookies=port,portal,{}
    def call(self,path,body=None):
        c=http.client.HTTPConnection('127.0.0.1',self.port,timeout=5)
        headers={'Cookie':'; '.join(k+'='+v for k,v in self.cookies.items()),'X-PK-Portal':self.portal}
        if body is not None:headers['Content-Type']='application/json'
        c.request('POST' if body is not None else 'GET',path,json.dumps(body) if body is not None else None,headers)
        r=c.getresponse();raw=r.read()
        cookie=r.getheader('Set-Cookie')
        if cookie:
            k,v=cookie.split(';')[0].split('=',1);self.cookies[k]=v
        try: value=json.loads(raw)
        except ValueError:value=raw
        return r.status,value

class Flows(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.http=app.ThreadingHTTPServer(('127.0.0.1',0),app.Handler);threading.Thread(target=cls.http.serve_forever,daemon=True).start();cls.port=cls.http.server_port
    @classmethod
    def tearDownClass(cls):cls.http.shutdown();cls.http.server_close();TEMP.cleanup()
    def setUp(self):
        with app.connect() as db:
            for table in ['docs','sessions','accounts','clients','runs','audit','files','delivery_parts','couriers']:db.execute('DELETE FROM '+table)
            for role,mid in [('ceo',''),('restaurant','levfood'),('other','kosherfc'),('driver',''),('driver2','')]:
                salt=secrets.token_hex(16);actual='restaurant' if role=='other' else 'driver' if role=='driver2' else role
                db.execute('INSERT INTO accounts VALUES(?,?,?,?,?,?,?,1)',(role,role+'@test.invalid',actual,mid,role,salt,app.password_hash('test-password-for-flow',salt)))
        app.LIMITS.clear()  # in-memory login/address limits are per process: every test starts clean
        self.client=Browser(self.port);self.client.call('/api/bootstrap');self.stranger=Browser(self.port);self.stranger.call('/api/bootstrap')
        self.ceo=self.login('ceo');self.rest=self.login('restaurant');self.other=self.login('other');self.driver=self.login('driver');self.driver2=self.login('driver2')
        # Lot 2: an active account is not enough; the CEO opens each courier's tour service.
        for aid in ['driver','driver2']:self.assertEqual(self.ceo.call('/api/ceo',{'action':'driver-service','id':aid,'open':True})[0],200)
    def login(self,role):
        portal='restaurant' if role=='other' else 'driver' if role=='driver2' else role
        b=Browser(self.port,portal);status,_=b.call('/api/login',{'role':portal,'login':role+'@test.invalid','password':'test-password-for-flow'});self.assertEqual(status,200);return b
    def order(self,**kwargs):
        body={'m':'levfood','lines':[{'id':'add-009','q':2,'o':[]}],'mode':'deliv','name':'Test client','tel':'+351 900000000','addr':'Test address Porto','when':'asap',**kwargs}
        status,result=self.client.call('/api/orders',body);self.assertEqual(status,200,result);return result['order']
    def action(self,who,order,action,**kwargs):return who.call('/api/orders/action',{'id':order['id'],'action':action,**kwargs})
    def promo(self,code,who=None,**fields):
        # Lot 5a: codes are created only through the single promotions function (/api/promo).
        status,result=(who or self.rest).call('/api/promo',{'action':'create','code':code,**fields});self.assertEqual(status,200,result);return result
    def bags(self,order,count,who=None):
        status,result=self.action(who or self.rest,order,'bags',bags=count);self.assertEqual(status,200,result)
    def test_restaurant_cover_is_scoped_published_and_resettable(self):
        import base64
        image=base64.b64encode(b'\x89PNG\r\n\x1a\ncover-test').decode()
        status,photo=self.rest.call('/api/photo',{'merchant':'levfood','name':'cover.png','mime':'image/png','body':image})
        self.assertEqual(status,200);path=photo['image']
        self.assertEqual(self.client.call(path)[0],404)
        self.assertEqual(self.other.call('/api/restaurant-photo',{'merchant':'levfood','image':path})[0],403)
        self.assertEqual(self.other.call('/api/restaurant-photo',{'merchant':'kosherfc','image':path})[0],400)
        self.assertEqual(self.client.call('/api/restaurant-photo',{'merchant':'levfood','image':path})[0],401)
        self.assertEqual(self.rest.call('/api/restaurant-photo',{'merchant':'levfood','image':path})[0],200)
        _,boot=self.client.call('/api/bootstrap');self.assertEqual(boot['menus']['levfood']['coverImage'],path)
        self.assertEqual(self.client.call(path)[0],200)
        _,staff=self.rest.call('/api/bootstrap?portal=restaurant');menu=staff['menus']['levfood'];menu['coverImage']='/media/'+'a'*24
        self.assertEqual(self.rest.call('/api/menu',{'merchant':'levfood','menu':menu})[0],200)
        _,boot=self.client.call('/api/bootstrap');self.assertEqual(boot['menus']['levfood']['coverImage'],path)
        self.assertEqual(self.rest.call('/api/restaurant-photo',{'merchant':'levfood','image':''})[0],200)
        self.assertEqual(self.client.call(path)[0],404)
    def test_percentage_boundaries_never_increase_the_price(self):
        for pct in [-20,0,101,1.5,True,'20']:
            status,_=self.rest.call('/api/promo',{'action':'create','merchant':'levfood','code':'BAD'+str(abs(hash(str(pct))))[:8],'kind':'percent','pct':pct,'max':5})
            self.assertEqual(status,400,pct)
        self.promo('GOOD20',pct=20,max=5,kind='percent')
        o=self.order(promo='GOOD20');self.assertEqual(o['disc'],1.2);self.assertEqual(o['total'],8.3)
    def test_order_prices_and_time_are_server_controlled(self):
        o=self.order(total=.01,t=1,paid=True,client='stranger')
        self.assertEqual(o['total'],9.5);self.assertEqual(o['fee'],3.5);self.assertFalse(o['paid']);self.assertGreater(o['t'],1)
        _,boot=self.client.call('/api/bootstrap');self.assertEqual(boot['gameExpires'],o['t']+3600000)
    def test_no_game_without_order_and_no_order_access_to_stranger(self):
        status,_=self.stranger.call('/api/games/start',{'game':'spin'});self.assertEqual(status,403)
        o=self.order();_,boot=self.stranger.call('/api/bootstrap');self.assertEqual(boot['orders'],{})
        self.assertEqual(self.action(self.stranger,o,'paid')[0],403)
    def test_full_driver_and_restaurant_flow(self):
        o=self.order();self.assertEqual(self.action(self.client,o,'paid')[0],200)
        for st in ['ok','prep','ready']:self.assertEqual(self.action(self.rest,o,'status',status=st)[0],200)
        self.bags(o,1)
        status,_=self.ceo.call('/api/dispatch',{'id':o['id'],'driver':'driver','minutes':12});self.assertEqual(status,200)
        self.assertEqual(self.action(self.driver2,o,'collect')[0],403)
        self.assertEqual(self.driver.call('/api/orders/accept',{'id':o['id']})[0],200)
        self.assertEqual(self.action(self.driver,o,'collect')[0],200)
        self.assertEqual(self.driver.call('/api/location',{'latitude':41.15,'longitude':-8.61,'accuracy':8})[0],200)
        _,view=self.rest.call('/api/bootstrap?portal=restaurant');self.assertEqual(view['orders'][o['id']]['location']['latitude'],41.15)
        for st in ['go','done']:self.assertEqual(self.action(self.driver,o,'status',status=st)[0],200)
        self.assertEqual(self.action(self.client,o,'received')[0],200);self.assertEqual(self.action(self.client,o,'rate',rate=5)[0],200)
    def test_restaurant_cannot_view_or_modify_other_restaurant(self):
        o=self.order();self.assertEqual(self.action(self.other,o,'status',status='ok')[0],403)
        self.assertEqual(self.other.call('/api/menu',{'merchant':'levfood','menu':{}})[0],403)
        self.assertEqual(self.driver.call('/api/bootstrap?portal=ceo')[0],401)
        self.assertEqual(self.client.call('/api/ceo',{'action':'config','config':{}})[0],401)
    def test_order_rejection_rolls_back_stock(self):
        self.rest.call('/api/menu',{'merchant':'levfood','menu':{'items':{'add-009':{'s':1}}}})
        status,_=self.client.call('/api/orders',{'m':'levfood','lines':[{'id':'add-009','q':2,'o':[]}],'mode':'pick','name':'A','tel':'900000000'})
        self.assertEqual(status,409)
        with app.connect() as db:self.assertEqual(app.items(db,'levfood')['add-009']['s'],1)
    def test_cancel_restores_stock_once_and_revokes_game(self):
        self.rest.call('/api/menu',{'merchant':'levfood','menu':{'items':{'add-009':{'s':4}}}})
        o=self.order();self.action(self.rest,o,'status',status='ok')
        for _ in range(2):self.assertEqual(self.action(self.rest,o,'status',status='no',reason='Test cancellation')[0],200)
        with app.connect() as db:
            self.assertEqual(app.items(db,'levfood')['add-009']['s'],4)
            self.assertTrue(app.get(db,'orders/'+o['id'])['refund'])
        self.assertEqual(self.client.call('/api/games/start',{'game':'stack'})[0],403)
    def test_exact_hour_deadline_and_user_score_ownership(self):
        o=self.order();status,run=self.client.call('/api/games/start',{'game':'sky'});self.assertEqual(status,200)
        self.assertEqual(self.client.call('/api/games/score',{'run':run['run'],'score':'1234567890123456789012345678901234567890','name':'Test player'})[0],400)
        self.assertEqual(self.stranger.call('/api/games/score',{'run':run['run'],'score':'1','name':'Intruder'})[0],403)
        with app.connect() as db:
            row=app.get(db,'orders/'+o['id']);row['t']=app.now()-3600000;app.put(db,'orders/'+o['id'],row)
        self.assertEqual(self.client.call('/api/games/start',{'game':'sky'})[0],403)
        self.assertEqual(self.client.call('/api/games/score',{'run':run['run'],'score':'2'})[0],403)
    def test_score_identity_is_not_authentication_token(self):
        o=self.order();_,run=self.client.call('/api/games/start',{'game':'spin'})
        from unittest.mock import patch
        with patch.object(app,'now',return_value=run['time']+1000):
            self.assertEqual(self.client.call('/api/games/score',{'run':run['run'],'from':0,'tick':60,'taps':[1,2],'name':'Alice'})[0],200)
        _,boot=self.stranger.call('/api/bootstrap');uid=next(iter(boot['scores']));self.assertNotEqual(uid,self.client.cookies['pk_client'])
        self.stranger.cookies['pk_client']=uid;_,again=self.stranger.call('/api/bootstrap');self.assertEqual(again['orders'],{})
    def test_disabled_account_sessions_are_revoked(self):
        self.ceo.call('/api/ceo',{'action':'disable','id':'driver'})
        self.assertEqual(self.driver.call('/api/bootstrap?portal=driver')[0],401)
    def enable_uber(self,mid='levfood'):
        # Provisional default (m-5): Uber Colis is off until a CEO enables it globally and for the establishment.
        for merchant in ['',mid]:self.assertEqual(self.ceo.call('/api/service',{'merchant':merchant,'action':'uber','enabled':True})[0],200)
    def test_uber_has_no_kosh_fee_and_pickup_costs_fifty_cents(self):
        self.enable_uber();self.rest.call('/api/service',{'action':'glo','enabled':False})
        self.assertEqual(self.order(mode='uber',addr='')['fee'],0)
        pick=self.order(mode='pick',addr='');self.assertEqual(pick['fee'],0.5);self.assertEqual(pick['total'],pick['sub']+0.5)
    def test_glo_disable_blocks_new_orders_but_preserves_accepted(self):
        o=self.order();self.ceo.call('/api/service',{'action':'glo','enabled':False})
        self.assertEqual(self.action(self.rest,o,'status',status='ok')[0],200)
        status,_=self.client.call('/api/orders',{'m':'levfood','lines':[{'id':'add-009','q':1,'o':[]}],'mode':'deliv','name':'A','tel':'900000000','addr':'Porto'})
        self.assertEqual(status,409);self.assertEqual(self.order(mode='pick')['fee'],0.5)
    def test_complaints_can_be_replied_to_only_by_correct_restaurant(self):
        o=self.order();self.action(self.rest,o,'status',status='ok')
        self.assertEqual(self.action(self.client,o,'claim',kind='miss',text='Un article manque dans le sac.')[0],200)
        self.assertEqual(self.action(self.other,o,'reply',index=0,text='Response')[0],403)
        self.assertEqual(self.action(self.rest,o,'reply',index=0,text='Nous vous contactons.')[0],200)
    def test_private_files_and_source_are_not_served(self):
        for path in ['/server.py','/.runtime/porto.sqlite3','/tests/test_flows.py','/.git/config']:
            self.assertEqual(self.client.call(path)[0],404)
        self.assertEqual(self.client.call('/api/file?id=unknown')[0],401)
    def test_service_close_keeps_received_orders_and_history(self):
        # C44/R82: closing blocks new orders only; received and paid orders are not cancelled.
        o=self.order();self.action(self.rest,o,'status',status='ok');self.assertEqual(self.ceo.call('/api/service',{'action':'close'})[0],200)
        _,boot=self.ceo.call('/api/bootstrap?portal=ceo');self.assertEqual(boot['orders'][o['id']]['st'],'ok');self.assertFalse(boot['orders'][o['id']].get('refund'));self.assertEqual(len(boot['reports']),1)
        self.assertEqual(self.client.call('/api/orders',{'m':'levfood','lines':[{'id':'add-009','q':1,'o':[]}],'mode':'pick','name':'A','tel':'900000000'})[0],409)
        self.assertEqual(self.action(self.rest,o,'status',status='prep')[0],200)
    def test_required_product_options_are_verified_server_side(self):
        status,_=self.client.call('/api/orders',{'m':'levfood','lines':[{'id':'add-001','q':1,'o':[]}],'mode':'pick','name':'A','tel':'900000000'})
        self.assertEqual(status,400)
        self.assertEqual(self.order(lines=[{'id':'add-001','q':1,'o':['Salmon']}],mode='pick')['total'],15.5)
    def test_customer_account_restores_orders_on_another_device(self):
        order=self.order()
        self.assertEqual(self.client.call('/api/client/account',{'action':'register','email':'customer@test.invalid','password':'customer-password-123','name':'Arcade player'})[0],200)
        self.assertEqual(self.stranger.call('/api/client/account',{'action':'login','email':'customer@test.invalid','password':'customer-password-123'})[0],200)
        _,boot=self.stranger.call('/api/bootstrap');self.assertIn(order['id'],boot['orders']);self.assertEqual(boot['clientAccount']['name'],'Arcade player')
    def test_fixed_and_choice_menus_reserve_component_stock(self):
        menu={'items':{'add-009':{'s':5},'add-010':{'s':1},'x-fixed':{'id':'x-fixed','n':'Fixed menu','p':8,'c':'Menus','components':[{'id':'add-009','q':2}]},'x-choice':{'id':'x-choice','n':'Choice menu','p':5,'c':'Menus','menuChoices':[{'category':'Desserts','q':1}]}}}
        self.assertEqual(self.rest.call('/api/menu',{'merchant':'levfood','menu':menu})[0],200)
        self.order(lines=[{'id':'x-fixed','q':1,'o':[]}],mode='pick')
        self.order(lines=[{'id':'x-choice','q':1,'o':[],'choices':{'add-010':1}}],mode='pick')
        with app.connect() as db:self.assertEqual(app.items(db,'levfood')['add-009']['s'],3);self.assertEqual(app.items(db,'levfood')['add-010']['s'],0)
    def test_promo_is_verified_without_leaking_all_codes(self):
        self.promo('TEST10',kind='percent',pct=10,max=1)
        _,public=self.client.call('/api/bootstrap');self.assertNotIn('promos',public['menus']['levfood'])
        status,promo=self.client.call('/api/promo/check',{'merchant':'levfood','code':'TEST10'});self.assertEqual(status,200);self.assertEqual(promo['pct'],10)
        self.assertEqual(self.order(mode='pick',promo='TEST10')['total'],5.9)
        self.assertEqual(self.stranger.call('/api/promo/check',{'merchant':'levfood','code':'TEST10'})[0],409)
    def test_ceo_cannot_overwrite_own_account_with_public_registration(self):
        self.assertEqual(self.client.call('/api/client/account',{'action':'register','email':'ceo@test.invalid','password':'customer-password-123','name':'intruder'})[0],409)
    def test_location_is_hidden_from_other_restaurants_and_stopped_explicitly(self):
        order=self.order();self.action(self.rest,order,'status',status='ok');self.bags(order,1);self.ceo.call('/api/dispatch',{'id':order['id'],'driver':'driver','minutes':10});self.driver.call('/api/orders/accept',{'id':order['id']})
        self.driver.call('/api/location',{'latitude':41.15,'longitude':-8.61,'accuracy':5})
        _,other=self.other.call('/api/bootstrap?portal=restaurant');driver=next(d for d in other['drivers'] if d['id']=='driver');self.assertNotIn('latitude',driver)
        self.driver.call('/api/location',{'stop':True});_,mine=self.rest.call('/api/bootstrap?portal=restaurant');self.assertFalse(mine['orders'][order['id']]['location']['tracking'])
    def test_preorders_closed_before_configured_time(self):
        self.rest.call('/api/service',{'merchant':'levfood','action':'schedule','preordersAt':'2099-01-01T17:00','opensAt':'2099-01-01T20:00','delay':30})
        status,_=self.client.call('/api/orders',{'m':'levfood','lines':[{'id':'add-009','q':1,'o':[]}],'mode':'pick','name':'A','tel':'900000000'});self.assertEqual(status,409)
    def test_stale_menu_edits_do_not_overwrite_new_order_stock(self):
        menu={'items':{'add-009':{'s':5}}};self.rest.call('/api/menu',{'merchant':'levfood','menu':menu})
        _,boot=self.rest.call('/api/bootstrap?portal=restaurant');stale=boot['menus']['levfood'];self.order()
        stale['items']['add-009']['p']=4
        self.assertEqual(self.rest.call('/api/menu',{'merchant':'levfood','menu':stale})[0],409)
        with app.connect() as db:self.assertEqual(app.items(db,'levfood')['add-009']['s'],3)
    def test_staff_session_remember_option_sets_thirty_day_cookie(self):
        b=Browser(self.port,'restaurant');status,_=b.call('/api/login',{'login':'restaurant@test.invalid','password':'test-password-for-flow','role':'restaurant','remember':True});self.assertEqual(status,200)
        with app.connect() as db:expiry=db.execute('SELECT expires FROM sessions ORDER BY expires DESC LIMIT 1').fetchone()[0]
        self.assertGreater(expiry-app.now(),29*86400000)
    def test_retired_studio_and_finance_routes_keep_existing_data(self):
        with app.connect() as db:
            app.put(db,'finance/invoice-old',{'kind':'invoice','id':'old','total':12});app.put(db,'conf/main',{'brand':'Old brand'})
        self.assertEqual(self.ceo.call('/api/ceo',{'action':'config','config':{'brand':'New'}})[0],410)
        self.assertEqual(self.ceo.call('/api/finance',{'kind':'invoice','value':{'total':1,'status':'draft','date':'2026-10-14'}})[0],410)
        self.assertEqual(self.ceo.call('/api/upload',{'name':'x.pdf','mime':'application/pdf','body':''})[0],410)
        self.assertEqual(self.ceo.call('/api/ai',{'action':'studio'})[0],410)
        with app.connect() as db:
            self.assertEqual(app.get(db,'finance/invoice-old')['total'],12);self.assertEqual(app.get(db,'conf/main')['brand'],'Old brand')
    def test_restore_preserves_live_stock_promos_service_and_revision(self):
        menu={'items':{'add-009':{'s':8}}}
        self.assertEqual(self.rest.call('/api/menu',{'merchant':'levfood','menu':menu})[0],200);self.promo('SAVE',kind='percent',pct=10,max=4)
        _,boot=self.rest.call('/api/bootstrap?portal=restaurant');menu=boot['menus']['levfood'];menu['items']['add-009']['n']='Cookie new'
        self.rest.call('/api/menu',{'merchant':'levfood','menu':menu})
        with app.connect() as db:version=next(v for v in app.collection(db,'versions').values() if v['config'].get('items',{}).get('add-009',{}).get('s')==8)
        self.order(promo='SAVE')
        self.rest.call('/api/service',{'merchant':'levfood','action':'glo','enabled':False})
        with app.connect() as db:before=app.get(db,'menus/levfood')
        self.assertEqual(self.ceo.call('/api/ceo',{'action':'restore','id':version['id']})[0],200)
        with app.connect() as db:after=app.get(db,'menus/levfood')
        self.assertEqual(after['items']['add-009']['s'],6)
        self.assertEqual(after['promos']['SAVE']['used'],1)
        self.assertFalse(after['service']['glo'])
        self.assertGreater(after['_revision'],before['_revision'])
    def test_service_and_studio_invalidate_old_menu_documents(self):
        self.rest.call('/api/menu',{'merchant':'levfood','menu':{'items':{'add-009':{'s':8}}}})
        _,boot=self.rest.call('/api/bootstrap?portal=restaurant');stale=boot['menus']['levfood']
        self.rest.call('/api/service',{'merchant':'levfood','action':'close'})
        self.assertEqual(self.rest.call('/api/menu',{'merchant':'levfood','menu':stale})[0],409)
    def test_composite_gift_reserves_and_restores_ingredients(self):
        menu={'items':{'add-009':{'s':4},'x-gift':{'n':'Gift menu','p':6,'c':'Menus','components':[{'id':'add-009','q':2}]}}}
        self.rest.call('/api/menu',{'merchant':'levfood','menu':menu})
        self.promo('GIFT',kind='gift',giftId='x-gift',giftQ=1,max=4)
        o=self.order(lines=[{'id':'add-010','q':1,'o':[]}],promo='GIFT')
        with app.connect() as db:self.assertEqual(app.items(db,'levfood')['add-009']['s'],2)
        self.action(self.rest,o,'status',status='no',reason='Test')
        with app.connect() as db:self.assertEqual(app.items(db,'levfood')['add-009']['s'],4)
    def test_disabled_and_reset_customer_tokens_are_revoked(self):
        self.order();self.client.call('/api/client/account',{'action':'register','email':'audit@test.invalid','password':'audit-password-long','name':'Audit'})
        _,boot=self.client.call('/api/bootstrap');cid=boot['client'];old_cookie=dict(self.client.cookies)
        self.ceo.call('/api/ceo',{'action':'reset','id':cid})
        _,boot=self.client.call('/api/bootstrap');self.assertEqual(boot['orders'],{})
        self.client.cookies=old_cookie
        self.ceo.call('/api/ceo',{'action':'disable','id':cid})
        self.assertEqual(self.client.call('/api/games/start',{'game':'spin'})[0],403)
    def test_global_schedule_blocks_orders_and_is_public(self):
        self.ceo.call('/api/service',{'action':'schedule','preordersAt':'2099-01-01T17:00','opensAt':'2099-01-01T20:00','delay':30})
        status,_=self.client.call('/api/orders',{'m':'levfood','lines':[{'id':'add-009','q':1,'o':[]}],'mode':'pick','name':'Audit','tel':'900000000'})
        self.assertEqual(status,409)
        _,boot=self.client.call('/api/bootstrap');self.assertEqual(boot['menus']['levfood']['effectiveService']['preordersAt'],'2099-01-01T17:00')
    def test_explicitly_removed_options_stay_removed(self):
        self.rest.call('/api/menu',{'merchant':'levfood','menu':{'items':{'add-001':{'o':[]}}}})
        self.order(lines=[{'id':'add-001','q':1,'o':[]}],mode='pick')
    def test_retired_studio_pages_and_styles_are_not_published_but_kept(self):
        # Lot 5b (H14-H18): pages, sections and styles saved by the former studio stay stored, never applied publicly.
        studio={'pages':[{'slug':'test','title':'Test','body':'Hello'}],'siteCss':'body{color:red}','screenBlocks':{'client':{'title':'T','body':'B'}},'accent':'#ff0000','background':'#000000','brand':'Old brand','headline':'H','intro':'I'}
        with app.connect() as db:app.put(db,'conf/main',{**studio,'glo':True})
        self.assertEqual(self.client.call('/page/test')[0],404)
        for who,portal in [(self.client,'client'),(self.rest,'restaurant'),(self.driver,'driver')]:
            conf=self.boot(who,portal)['conf'] if portal!='client' else self.client.call('/api/bootstrap')[1]['conf']
            for key in studio:self.assertNotIn(key,conf,(portal,key))
            self.assertTrue(conf['glo'])
        self.assertEqual(self.boot(self.ceo,'ceo')['config']['pages'],studio['pages'])
        self.assertEqual(self.ceo.call('/api/ceo',{'action':'config','config':{'brand':'New'}})[0],410)
        with app.connect() as db:self.assertEqual(app.get(db,'conf/main')['siteCss'],'body{color:red}')
        root=Path(__file__).resolve().parents[1]
        code=''.join((root/'js'/f).read_text() for f in ['professional.js','operations.js','content-studio.js','notifications.js'])
        for dead in ['pkStudio','pkFinance','studio-publish','studio-generate','invoice-ai','/api/finance','/api/upload','/api/ai','pk-studio-css','siteCss']:
            self.assertNotIn(dead,code,dead)
        import integrations
        self.assertFalse(hasattr(integrations,'generate'))
        self.assertNotIn('0000',(root/'index.html').read_text(),'demo PIN must be gone')
    def test_external_wait_does_not_block_orders_or_bootstrap(self):
        import integrations
        from unittest.mock import patch
        entered=threading.Event();release=threading.Event();result=[]
        def external(*args):entered.set();release.wait(3);return []
        with patch.object(integrations,'address',side_effect=external):
            worker=threading.Thread(target=lambda:result.append(self.client.call('/api/address',{'query':'Test','session':'s1','cart':CART})));worker.start()
            self.assertTrue(entered.wait(2))
            finished=threading.Event()
            def independent():
                self.stranger.call('/api/bootstrap');self.order();finished.set()
            other=threading.Thread(target=independent);other.start()
            try:self.assertTrue(finished.wait(1),'External request held global API lock')
            finally:release.set();worker.join();other.join()
        self.assertEqual(result[0][0],200)
    def test_raw_fabricated_arcade_score_is_rejected(self):
        self.order();_,run=self.client.call('/api/games/start',{'game':'sky'})
        self.assertEqual(self.client.call('/api/games/score',{'run':run['run'],'score':'999999999999999999999999999'})[0],400)

    def test_replay_scores_are_computed_idempotently_and_time_bounded(self):
        from unittest.mock import patch
        self.order();_,run=self.client.call('/api/games/start',{'game':'spin'})
        body={'run':run['run'],'from':0,'tick':60,'taps':[1,2],'name':'Alice'}
        with patch.object(app,'now',return_value=run['time']+1000):
            status,result=self.client.call('/api/games/score',body);self.assertEqual(status,200,result)
            self.assertEqual(result['row']['best']['spin'],'10')
            self.assertEqual(self.client.call('/api/games/score',body)[1],result)
            self.assertEqual(self.client.call('/api/games/score',{**body,'from':60,'tick':300,'taps':[]})[0],400)
            self.assertEqual(self.stranger.call('/api/games/score',body)[0],403)
        with app.connect() as db:
            state=app.get(db,'arcade/'+run['run']);self.assertEqual(state['tick'],60)
    def test_late_route_never_overwrites_new_order_state(self):
        import integrations
        from unittest.mock import patch
        o=self.order();self.action(self.rest,o,'status',status='ok');self.bags(o,1);self.ceo.call('/api/dispatch',{'id':o['id'],'driver':'driver','minutes':10});self.driver.call('/api/orders/accept',{'id':o['id']})
        self.driver.call('/api/location',{'latitude':41.15,'longitude':-8.61,'accuracy':5});self.routable(o)
        entered=threading.Event();release=threading.Event();result=[]
        def slow_matrix(key,points):
            entered.set();release.wait(3);return [[0 if a==b else 60 for b in range(len(points))] for a in range(len(points))]
        integrations.clear_cache()
        with patch.dict(os.environ,{'PK_GOOGLE_KEY':'test-placeholder'}),patch.object(integrations,'PROVIDER',slow_matrix):
            worker=threading.Thread(target=lambda:result.append(self.driver.call('/api/tour',{'action':'optimize'})));worker.start();self.assertTrue(entered.wait(2))
            try:self.action(self.rest,o,'status',status='no',reason='Changed during route')
            finally:release.set();worker.join()
        self.assertEqual(result[0][0],409)
        with app.connect() as db:self.assertEqual(app.get(db,'orders/'+o['id'])['st'],'no');self.assertIsNone(app.get(db,'tours/driver').get('computed'))

    def test_config_restore_removes_new_editorial_fields_only(self):
        with app.connect() as db:
            app.put(db,'versions/old',{'id':'old','t':1,'config':{},'note':'Before'});app.put(db,'conf/main',{'brand':'New','pages':[{'slug':'test','title':'Test','body':'Hi'}],'siteCss':'body{color:red}'})
            version=app.get(db,'versions/old')
        self.ceo.call('/api/service',{'action':'glo','enabled':False})
        self.ceo.call('/api/ceo',{'action':'restore','id':version['id']})
        with app.connect() as db:
            config=app.get(db,'conf/main');self.assertNotIn('pages',config);self.assertNotIn('siteCss',config);self.assertNotIn('brand',config);self.assertFalse(config['glo'])

    def test_reception_modes_are_independent_and_exclude_uber_with_driver(self):
        body={'m':'levfood','lines':[{'id':'add-009','q':1,'o':[]}],'mode':'uber','name':'Test','tel':'900000000'}
        self.assertEqual(self.client.call('/api/orders',body)[0],409)
        self.enable_uber()
        self.assertEqual(self.rest.call('/api/service',{'action':'pickup','enabled':False})[0],200)
        self.assertEqual(self.client.call('/api/orders',{**body,'mode':'pick'})[0],409)
        self.assertEqual(self.rest.call('/api/service',{'action':'glo','enabled':False})[0],200)
        self.assertEqual(self.client.call('/api/orders',body)[0],200)
        self.assertEqual(self.rest.call('/api/service',{'action':'uber','enabled':False})[0],403)
        self.assertEqual(self.ceo.call('/api/service',{'merchant':'levfood','action':'uber','enabled':False})[0],200)
        self.assertEqual(self.client.call('/api/orders',body)[0],409)
        _,boot=self.client.call('/api/bootstrap');service=boot['menus']['levfood']['effectiveService']
        self.assertFalse(service['pickup']);self.assertFalse(service['glo']);self.assertFalse(service['uber'])
        self.ceo.call('/api/service',{'action':'pickup','enabled':False})
        self.rest.call('/api/service',{'action':'pickup','enabled':True})
        self.assertEqual(self.client.call('/api/orders',{**body,'mode':'pick'})[0],409)

    def test_all_drivers_receive_paid_offers_and_accept_exclusively(self):
        first=self.order()
        with app.connect() as db:
            pid=next(iter(app.items(db,'kosherfc')));app.put(db,'menus/kosherfc',{'items':{pid:{'o':[],'ot':''}}})
            second=app.create_order(db,'test-client',{'m':'kosherfc','lines':[{'id':pid,'q':1,'o':[]}],'mode':'deliv','name':'Test','tel':'900000000','addr':'Test Porto'})
        _,boot=self.driver.call('/api/bootstrap?portal=driver');self.assertEqual(boot.get('offers',{}),{})
        self.action(self.rest,first,'status',status='ok');self.action(self.other,second,'status',status='ok');self.bags(first,1)
        _,boot=self.driver.call('/api/bootstrap?portal=driver')
        self.assertEqual(set(boot['offers']),{first['id'],second['id']});self.assertNotIn('tel',boot['offers'][first['id']]);self.assertEqual(boot['orders'],{})
        self.assertEqual(self.driver.call('/api/orders/accept',{'id':first['id']})[0],200)
        self.assertEqual(self.driver2.call('/api/orders/accept',{'id':first['id']})[0],409)
        _,mine=self.driver.call('/api/bootstrap?portal=driver');self.assertTrue(mine['orders'][first['id']]['driverAccepted'])
        _,others=self.driver2.call('/api/bootstrap?portal=driver');self.assertNotIn(first['id'],others['offers']);self.assertNotIn(first['id'],others['orders'])
        self.assertEqual(self.client.call('/api/orders/accept',{'id':second['id']})[0],401)

    def test_dispatch_requires_driver_acceptance_before_actions(self):
        order=self.order();self.action(self.rest,order,'status',status='ok');self.bags(order,1)
        self.assertEqual(self.ceo.call('/api/dispatch',{'id':order['id'],'driver':'driver','minutes':10})[0],200)
        self.assertEqual(self.action(self.driver,order,'collect')[0],403)
        self.assertEqual(self.driver.call('/api/location',{'latitude':41,'longitude':-8,'accuracy':5})[0],403)
        self.assertEqual(self.driver.call('/api/orders/accept',{'id':order['id']})[0],200)
        self.assertEqual(self.action(self.driver,order,'collect')[0],200)

    def test_professional_password_vault_and_personal_change(self):
        status,created=self.ceo.call('/api/ceo',{'action':'account','login':'new@test.invalid','name':'New','role':'restaurant','merchant':'levfood'})
        self.assertEqual(status,200);aid=created['id'];password=created['password']
        self.assertEqual(self.ceo.call('/api/ceo',{'action':'credential','id':aid})[1]['password'],password)
        self.assertEqual(self.rest.call('/api/ceo',{'action':'credential','id':aid})[0],401)
        with app.connect() as db:
            self.assertNotIn(password,app.get(db,'credentials/'+aid)['value'])
        new=Browser(self.port,'restaurant');self.assertEqual(new.call('/api/login',{'role':'restaurant','login':'new@test.invalid','password':password})[0],200)
        body={'current':password,'password':'my-new-password-2026','confirm':'my-new-password-2026'}
        self.assertEqual(new.call('/api/password',{**body,'current':'wrong'})[0],401)
        self.assertEqual(new.call('/api/password',body)[0],200)
        self.assertEqual(new.call('/api/bootstrap?portal=restaurant')[0],401)
        self.assertEqual(self.ceo.call('/api/ceo',{'action':'credential','id':aid})[1]['password'],body['password'])
        self.assertEqual(new.call('/api/login',{'role':'restaurant','login':'new@test.invalid','password':body['password']})[0],200)
        _,boot=self.ceo.call('/api/bootstrap?portal=ceo');self.assertNotIn(body['password'],json.dumps(boot))
        _,reset=self.ceo.call('/api/ceo',{'action':'reset','id':aid})
        self.assertEqual(self.ceo.call('/api/ceo',{'action':'credential','id':aid})[1]['password'],reset['password'])

    def test_simultaneous_acceptance_has_one_winner(self):
        order=self.order();self.action(self.rest,order,'status',status='ok');self.bags(order,1)
        barrier=threading.Barrier(2);results=[]
        def accept(browser):
            barrier.wait();results.append(browser.call('/api/orders/accept',{'id':order['id']})[0])
        workers=[threading.Thread(target=accept,args=(browser,)) for browser in [self.driver,self.driver2]]
        for worker in workers:worker.start()
        for worker in workers:worker.join(6)
        self.assertEqual(sorted(results),[200,409])
        other=self.order();self.bags(other,1);self.action(self.rest,other,'status',status='no',reason='Test')
        self.assertEqual(self.driver.call('/api/orders/accept',{'id':other['id']})[0],409)

    def test_validated_payment_records_receipt_time(self):
        order=self.order();self.assertNotIn('paidAt',order)
        self.action(self.rest,order,'status',status='ok')
        _,boot=self.client.call('/api/bootstrap');self.assertTrue(boot['orders'][order['id']]['paidAt'])

    # ----- Lot 1 -----
    def accepted_order(self):
        o=self.order();self.action(self.rest,o,'status',status='ok');self.bags(o,1)
        self.assertEqual(self.ceo.call('/api/dispatch',{'id':o['id'],'driver':'driver','minutes':10})[0],200)
        self.assertEqual(self.driver.call('/api/orders/accept',{'id':o['id']})[0],200);return o
    def test_client_payload_never_contains_driver_gps_or_route(self):
        o=self.accepted_order()
        self.assertEqual(self.driver.call('/api/location',{'latitude':41.151234,'longitude':-8.612345,'accuracy':7})[0],200)
        with app.connect() as db:
            row=app.get(db,'orders/'+o['id']);row.update(route=[[-8.612345,41.151234],[-8.7777,41.9999]],routePosition=2,routeAt=app.now());app.put(db,'orders/'+o['id'],row)
        _,boot=self.client.call('/api/bootstrap');mine=boot['orders'][o['id']];raw=json.dumps(boot)
        for key in ['location','route','routePosition','routeAt']:self.assertNotIn(key,mine)
        for value in ['41.151234','-8.612345','41.9999']:self.assertNotIn(value,raw)
        self.assertNotIn('drivers',boot);self.assertEqual(mine['st'],'ok')
        _,rest=self.rest.call('/api/bootstrap?portal=restaurant');view=rest['orders'][o['id']]
        self.assertEqual(view['location']['latitude'],41.151234);self.assertNotIn('route',view);self.assertNotIn('41.9999',json.dumps(rest))
        _,other=self.other.call('/api/bootstrap?portal=restaurant');self.assertNotIn(o['id'],other['orders']);self.assertNotIn('41.151234',json.dumps(other))
        _,ceo=self.ceo.call('/api/bootstrap?portal=ceo');self.assertEqual(ceo['orders'][o['id']]['routePosition'],2)
    def test_three_professional_sessions_in_one_browser_and_separate_logout(self):
        b=Browser(self.port);b.call('/api/bootstrap');client_id=b.call('/api/bootstrap')[1]['client']
        for role in ['restaurant','driver','ceo']:
            b.portal=role;self.assertEqual(b.call('/api/login',{'role':role,'login':role+'@test.invalid','password':'test-password-for-flow'})[0],200)
        self.assertTrue({'pk_staff_restaurant','pk_staff_driver','pk_staff_ceo','pk_client'}<=set(b.cookies))
        for role in ['restaurant','driver','ceo']:
            b.portal=role;status,boot=b.call('/api/bootstrap?portal='+role);self.assertEqual(status,200);self.assertEqual(boot['me']['role'],role)
        b.portal='restaurant';self.assertEqual(b.call('/api/logout',{'portal':'restaurant'})[0],200)
        self.assertEqual(b.call('/api/bootstrap?portal=restaurant')[0],401)
        for role in ['driver','ceo']:b.portal=role;self.assertEqual(b.call('/api/bootstrap?portal='+role)[0],200)
        b.portal='client';self.assertEqual(b.call('/api/bootstrap')[1]['client'],client_id)
        b.portal='ceo';self.assertEqual(b.call('/api/dispatch',{'id':'none','driver':'driver'})[0],404)
        b.portal='driver';self.assertEqual(b.call('/api/dispatch',{'id':'none','driver':'driver'})[0],401)
        b.cookies['pk_staff']=b.cookies.pop('pk_staff_driver');self.assertEqual(b.call('/api/bootstrap?portal=driver')[0],401)
    def test_driver_cannot_cancel_sale_or_edit_eta_and_destination(self):
        o=self.accepted_order()
        self.assertEqual(self.action(self.driver,o,'status',status='no',reason='Driver cancel')[0],403)
        self.assertEqual(self.action(self.driver,o,'eta',minutes=5)[0],403)
        self.assertEqual(self.action(self.driver,o,'destination',latitude=41.1,longitude=-8.6)[0],403)
        with app.connect() as db:row=app.get(db,'orders/'+o['id']);self.assertEqual(row['st'],'ok');self.assertNotIn('destLat',row)
        self.assertEqual(self.action(self.rest,o,'status',status='no',reason='Restaurant cancel')[0],200)
    def test_manual_dispatch_and_uber_are_ceo_only(self):
        o=self.order();self.action(self.rest,o,'status',status='ok');self.bags(o,1)
        self.assertIn(self.rest.call('/api/dispatch',{'id':o['id'],'driver':'driver','minutes':10})[0],(401,403))
        self.assertEqual(self.ceo.call('/api/dispatch',{'id':o['id'],'driver':'driver','minutes':10})[0],200)
        self.assertEqual(self.rest.call('/api/service',{'merchant':'levfood','action':'uber','enabled':True})[0],403)
        self.assertEqual(self.ceo.call('/api/service',{'action':'uber','enabled':True})[0],200)
    def test_fees_kosh_delivery_pickup_and_no_commission(self):
        deliv=self.order();pick=self.order(mode='pick',addr='')
        self.assertEqual(deliv['fee'],3.5);self.assertEqual(deliv['total'],round(deliv['sub']+3.5,2))
        self.assertEqual(pick['fee'],0.5);self.assertEqual(pick['total'],round(pick['sub']+0.5,2))
        self.assertFalse([k for k in deliv if 'com' in k.lower()])
        html=(Path(app.ROOT)/'index.html').read_text()+(Path(app.ROOT)/'js/professional.js').read_text()
        self.assertNotIn('Commission KOSH',html);self.assertNotIn('Glovo',html);self.assertNotIn('COM=1.5',html)
    def test_three_active_ceo_maximum_and_reactivation_keeps_vault(self):
        ids=[]
        for n in [2,3]:
            status,created=self.ceo.call('/api/ceo',{'action':'account','role':'ceo','login':f'ceo{n}@test.invalid','name':f'CEO {n}'});self.assertEqual(status,200);ids.append(created)
        self.assertEqual(self.ceo.call('/api/ceo',{'action':'account','role':'ceo','login':'ceo4@test.invalid'})[0],409)
        second=Browser(self.port,'ceo');self.assertEqual(second.call('/api/login',{'role':'ceo','login':'ceo2@test.invalid','password':ids[0]['password']})[0],200)
        self.assertEqual(self.ceo.call('/api/ceo',{'action':'disable','id':ids[0]['id']})[0],200)
        self.assertEqual(second.call('/api/bootstrap?portal=ceo')[0],401)
        with app.connect() as db:self.assertTrue(app.get(db,'credentials/'+ids[0]['id']).get('value'))
        status,fourth=self.ceo.call('/api/ceo',{'action':'account','role':'ceo','login':'ceo4@test.invalid'});self.assertEqual(status,200)
        self.assertEqual(self.ceo.call('/api/ceo',{'action':'enable','id':ids[0]['id']})[0],409)
        self.ceo.call('/api/ceo',{'action':'disable','id':fourth['id']})
        status,enabled=self.ceo.call('/api/ceo',{'action':'enable','id':ids[0]['id']});self.assertEqual(status,200);self.assertTrue(enabled['credentialSaved'])
        self.assertEqual(self.ceo.call('/api/ceo',{'action':'credential','id':ids[0]['id']})[1]['password'],ids[0]['password'])
        self.assertEqual(second.call('/api/login',{'role':'ceo','login':'ceo2@test.invalid','password':ids[0]['password']})[0],200)
        self.assertEqual(self.rest.call('/api/ceo',{'action':'enable','id':fourth['id']})[0],401)
    # ----- Lot 2: courier service, capacity, bags and delivery parts -----
    def paid(self,count=None,ready=False,who=None):
        o=self.order();self.assertEqual(self.action(self.rest,o,'status',status='ok')[0],200)
        if count is not None:self.bags(o,count)
        if ready:
            for st in ['prep','ready']:self.assertEqual(self.action(self.rest,o,'status',status=st)[0],200)
        return o
    def part(self,who,o,action,**kw):return who.call('/api/parts',{'action':action,'order':o['id'],**kw})
    def boot(self,who,portal):
        status,value=who.call('/api/bootstrap?portal='+portal);self.assertEqual(status,200,value);return value
    def service(self,aid,open_):self.assertEqual(self.ceo.call('/api/ceo',{'action':'driver-service','id':aid,'open':open_})[0],200)
    def stored(self,o):
        with app.connect() as db:return app.get(db,'orders/'+o['id']),app.parts_for(db,o['id'])
    def test_closed_service_shows_no_offer_and_refuses_acceptance(self):
        o=self.paid(2);self.service('driver',False)
        view=self.boot(self.driver,'driver');self.assertEqual(view['offers'],{});self.assertFalse(view['courier']['open'])
        status,result=self.part(self.driver,o,'accept',bags=1);self.assertEqual(status,409);self.assertIn('service',result['error'])
        self.assertEqual(self.driver.call('/api/orders/accept',{'id':o['id']})[0],409)
        self.assertEqual(self.stored(o)[1],[])
        self.assertEqual(self.driver.call('/api/ceo',{'action':'driver-service','id':'driver','open':True})[0],401)
        self.assertIn(self.rest.call('/api/ceo',{'action':'driver-service','id':'driver','open':True})[0],(401,403))
        self.assertIn(o['id'],self.boot(self.driver2,'driver')['offers'])
        self.service('driver',True);self.assertIn(o['id'],self.boot(self.driver,'driver')['offers'])
    def test_closing_service_keeps_accepted_parts_finishable(self):
        o=self.paid(3,ready=True);other=self.paid(2)
        self.assertEqual(self.part(self.driver,o,'accept',bags=3)[0],200);self.service('driver',False)
        view=self.boot(self.driver,'driver');self.assertIn(o['id'],view['orders']);self.assertEqual(view['offers'],{})
        self.assertEqual(self.part(self.driver,other,'accept',bags=1)[0],409)
        self.assertEqual(self.part(self.driver,o,'collect')[0],200);self.assertEqual(self.part(self.driver,o,'deliver')[0],200)
        self.assertEqual(self.stored(o)[0]['st'],'done');self.assertEqual(self.boot(self.driver,'driver')['me']['id'],'driver')
    def test_ten_bags_split_five_five_with_independent_departure(self):
        o=self.paid(10);fee,total=o['fee'],o['total']
        offer=self.boot(self.driver,'driver')['offers'][o['id']];self.assertEqual((offer['bags'],offer['remaining'],offer['suggested']),(10,10,5))
        for key in ['name','tel','addr','destLat','destLon','note','lines']:self.assertNotIn(key,offer)
        status,result=self.part(self.driver,o,'accept');self.assertEqual(status,200,result);self.assertEqual(result['part']['bags'],5)
        self.assertEqual(self.boot(self.driver,'driver')['courier']['available'],0)
        self.assertEqual(self.boot(self.driver2,'driver')['offers'][o['id']]['remaining'],5)
        self.assertNotIn(o['id'],self.boot(self.driver,'driver')['offers'])
        self.assertEqual(self.part(self.driver,o,'collect')[0],409)  # not ready yet
        for st in ['prep','ready']:self.assertEqual(self.action(self.rest,o,'status',status=st)[0],200)
        self.assertEqual(self.part(self.driver,o,'collect')[0],200);self.assertEqual(self.part(self.driver,o,'deliver')[0],200)
        order,parts=self.stored(o);self.assertEqual(order['st'],'go');self.assertEqual([p['state'] for p in parts],['delivered'])
        rest=self.boot(self.rest,'restaurant')['orders'][o['id']];self.assertEqual(rest['delivery']['state'],'partially_delivered')
        self.assertEqual((rest['delivery']['remaining'],rest['delivery']['delivered']),(5,5));self.assertEqual(rest['parts'][0]['driverName'],'driver')
        self.assertEqual(self.boot(self.driver,'driver')['courier']['available'],5)
        self.assertEqual(self.client.call('/api/bootstrap')[1]['orders'][o['id']]['delivery'],{'bags':10,'delivered':5,'state':'partially_delivered'})
        status,result=self.part(self.driver2,o,'accept',bags=5);self.assertEqual(status,200,result)
        self.assertNotIn(o['id'],self.boot(self.driver,'driver')['offers'])
        self.assertEqual(self.part(self.driver2,o,'collect')[0],200)  # "ready" also covers parts accepted later
        self.assertEqual(self.part(self.driver2,o,'deliver')[0],200)
        order,parts=self.stored(o);self.assertEqual(order['st'],'done');self.assertEqual(sorted(p['bags'] for p in parts),[5,5])
        self.assertEqual((order['fee'],order['total']),(fee,total));self.assertEqual(order['fee'],3.5)
        ceo=self.boot(self.ceo,'ceo')['orders'][o['id']];self.assertEqual(ceo['delivery']['state'],'delivered');self.assertEqual(len(ceo['parts']),2)
    def test_concurrent_acceptances_never_assign_the_same_bags_twice(self):
        o=self.paid(6);barrier=threading.Barrier(2);results=[]
        def accept(browser):barrier.wait();results.append(self.part(browser,o,'accept',bags=4)[0])
        workers=[threading.Thread(target=accept,args=(b,)) for b in [self.driver,self.driver2]]
        for w in workers:w.start()
        for w in workers:w.join(6)
        self.assertEqual(sorted(results),[200,409]);order,parts=self.stored(o)
        self.assertEqual(len(parts),1);self.assertLessEqual(sum(p['bags'] for p in parts),6)
        loser=self.driver2 if parts[0]['driver']=='driver' else self.driver
        self.assertEqual(self.boot(loser,'driver')['offers'][o['id']]['remaining'],2)
        self.assertEqual(self.part(loser,o,'accept',bags=2)[0],200);self.assertEqual(self.part(self.driver,o,'accept',bags=1)[0],200)  # driver already holds a part: idempotent
        self.assertEqual(sum(p['bags'] for p in self.stored(o)[1]),6)
    def test_capacity_is_checked_on_available_space_and_adjustable(self):
        first=self.paid(4);second=self.paid(3)
        self.assertEqual(self.part(self.driver,first,'accept',bags=4)[0],200)
        status,result=self.part(self.driver,second,'accept',bags=3);self.assertEqual(status,409);self.assertIn('Capacité',result['error'])
        self.assertEqual(self.boot(self.driver,'driver')['offers'][second['id']]['suggested'],1)
        self.assertEqual(self.driver.call('/api/courier',{'action':'capacity','capacity':3})[0],409)  # below engaged bags
        self.assertEqual(self.driver.call('/api/courier',{'action':'capacity','capacity':11})[0],400)
        self.assertEqual(self.ceo.call('/api/ceo',{'action':'capacity','id':'driver','capacity':0})[0],400)
        status,result=self.driver.call('/api/courier',{'action':'capacity','capacity':7});self.assertEqual(status,200);self.assertEqual(result['courier']['available'],3)
        self.assertEqual(self.part(self.driver,second,'accept',bags=3)[0],200)
        self.assertEqual(self.ceo.call('/api/ceo',{'action':'capacity','id':'driver2','capacity':10})[0],200)
        self.assertEqual(self.boot(self.driver2,'driver')['courier']['capacity'],10)
    def test_double_click_and_repeated_confirmations_are_idempotent(self):
        self.rest.call('/api/menu',{'merchant':'levfood','menu':{'items':{'add-009':{'s':5}}}});o=self.paid(2,ready=True)
        first=self.part(self.driver,o,'accept',bags=2)[1];again=self.part(self.driver,o,'accept',bags=2)[1]
        self.assertTrue(first['created']);self.assertFalse(again['created']);self.assertEqual(first['part']['id'],again['part']['id'])
        self.assertEqual(self.driver.call('/api/orders/accept',{'id':o['id']})[0],200);self.assertEqual(len(self.stored(o)[1]),1)
        for _ in range(2):self.assertEqual(self.part(self.driver,o,'collect')[0],200)
        for _ in range(2):self.assertEqual(self.part(self.driver,o,'deliver')[0],200)
        order,parts=self.stored(o);done=order['completedAt'];self.assertEqual(order['st'],'done')
        self.assertEqual(self.action(self.driver,o,'status',status='done')[0],200);self.assertEqual(self.stored(o)[0]['completedAt'],done)
        with app.connect() as db:self.assertEqual(app.items(db,'levfood')['add-009']['s'],3)  # reserved once, never touched by confirmations
        self.assertEqual(len([a for a in self.boot(self.ceo,'ceo')['audit'] if a['action']=='part.deliver']),1)
    def test_release_before_collection_only_returns_own_bags(self):
        o=self.paid(8,ready=True)
        self.assertEqual(self.part(self.driver,o,'accept',bags=5)[0],200);self.assertEqual(self.part(self.driver2,o,'accept',bags=3)[0],200)
        self.assertEqual(self.part(self.driver,o,'release')[0],400)
        self.assertEqual(self.part(self.driver,o,'release',reason='Crevaison')[0],200)
        order,parts=self.stored(o);self.assertEqual(order['st'],'ready');self.assertFalse(order.get('refund'))
        self.assertEqual({p['driver']:p['state'] for p in parts},{'driver':'released','driver2':'accepted'})
        self.assertEqual(next(p for p in parts if p['driver']=='driver')['release_reason'],'Crevaison')
        self.assertEqual(self.boot(self.driver,'driver')['offers'][o['id']]['remaining'],5);self.assertNotIn(o['id'],self.boot(self.driver,'driver')['orders'])
        self.assertEqual(self.part(self.driver2,o,'collect')[0],200)
        status,result=self.part(self.driver2,o,'release',reason='Trop tard');self.assertEqual(status,409);self.assertEqual(self.stored(o)[1][1]['state'],'collected')
        self.assertIn(self.part(self.rest,o,'release',reason='x',part=parts[1]['id'])[0],(403,))
    def test_ceo_assignment_is_a_proposal_the_courier_must_accept(self):
        o=self.paid(6,ready=True)
        status,result=self.ceo.call('/api/dispatch',{'id':o['id'],'driver':'driver','bags':4,'minutes':10});self.assertEqual(status,200,result)
        self.assertEqual(self.part(self.driver,o,'collect')[0],403);self.assertNotIn(o['id'],self.boot(self.driver,'driver')['orders'])
        offer=self.boot(self.driver,'driver')['offers'][o['id']];self.assertEqual(offer['proposal']['bags'],4);self.assertNotIn('tel',offer)
        self.assertEqual(self.boot(self.driver2,'driver')['offers'][o['id']]['remaining'],2)
        self.assertEqual(self.ceo.call('/api/dispatch',{'id':o['id'],'driver':'driver2','bags':3})[0],400)
        self.service('driver',False);self.assertEqual(self.part(self.driver,o,'accept')[0],409);self.service('driver',True)
        status,result=self.part(self.driver,o,'accept');self.assertEqual(status,200);self.assertEqual(result['part']['bags'],4)
        self.assertEqual(self.stored(o)[1][0]['state'],'accepted');self.assertEqual(self.part(self.driver,o,'collect')[0],200)
        second=self.paid(2);self.ceo.call('/api/dispatch',{'id':second['id'],'driver':'driver2'})
        self.assertEqual(self.part(self.driver2,second,'release',reason='Indisponible')[0],200)
        self.assertEqual(self.boot(self.driver,'driver')['offers'][second['id']]['remaining'],2)
    def test_customer_details_only_after_acceptance_and_only_own_parts(self):
        o=self.paid(4,ready=True);secret=['Test client','900000000','Test address Porto']
        raw=json.dumps(self.boot(self.driver,'driver'))
        for value in secret:self.assertNotIn(value,raw)
        self.ceo.call('/api/dispatch',{'id':o['id'],'driver':'driver','bags':2})
        raw=json.dumps(self.boot(self.driver,'driver'))
        for value in secret:self.assertNotIn(value,raw)
        self.part(self.driver,o,'accept');self.part(self.driver2,o,'accept',bags=2)
        mine=self.boot(self.driver,'driver')['orders'][o['id']];self.assertEqual(mine['tel'],'+351 900000000')
        self.assertEqual([p['driver'] for p in mine['parts']],['driver'])
        self.driver2.call('/api/location',{'latitude':41.1777,'longitude':-8.6777,'accuracy':5})
        self.assertNotIn('41.1777',json.dumps(self.boot(self.driver,'driver')))
        rest=self.boot(self.rest,'restaurant')['orders'][o['id']];self.assertEqual(sorted(p['driverName'] for p in rest['parts']),['driver','driver2'])
        self.assertEqual(rest['delivery']['remaining'],0)
        client=self.client.call('/api/bootstrap')[1]['orders'][o['id']];self.assertNotIn('parts',client);self.assertNotIn('driverName',client)
    def test_bag_declaration_rules(self):
        o=self.order()
        self.assertEqual(self.action(self.client,o,'bags',bags=3)[0],403);self.assertEqual(self.action(self.other,o,'bags',bags=3)[0],403)
        for bad in [0,-1,2.5,'3',True]:self.assertEqual(self.action(self.rest,o,'bags',bags=bad)[0],400)
        self.action(self.rest,o,'status',status='ok')
        offer=self.boot(self.driver,'driver')['offers'][o['id']];self.assertTrue(offer['unknownLoad'])
        status,result=self.part(self.driver,o,'accept');self.assertEqual(status,409);self.assertIn('Charge inconnue',result['error'])
        self.bags(o,40);self.assertEqual(self.stored(o)[0]['bags'],40)  # no fixed business ceiling
        self.bags(o,6);self.part(self.driver,o,'accept',bags=4)
        self.assertEqual(self.action(self.rest,o,'bags',bags=3)[0],409);self.bags(o,9,who=self.ceo)
        self.assertEqual(self.boot(self.driver2,'driver')['offers'][o['id']]['remaining'],5)
        for st in ['prep','ready']:self.action(self.rest,o,'status',status=st)
        self.part(self.driver,o,'collect');self.assertEqual(self.action(self.rest,o,'bags',bags=12)[0],409)
        self.assertEqual(self.action(self.driver,o,'bags',bags=12)[0],403)
        pick=self.order(mode='pick',addr='');self.assertEqual(self.action(self.rest,pick,'bags',bags=2)[0],409)
    def test_restaurant_hands_over_and_confirms_per_part(self):
        o=self.paid(4,ready=True);self.part(self.driver,o,'accept',bags=2);self.part(self.driver2,o,'accept',bags=2)
        parts=self.stored(o)[1]
        self.assertEqual(self.other.call('/api/parts',{'action':'collect','order':o['id'],'part':parts[0]['id']})[0],403)
        self.assertEqual(self.rest.call('/api/parts',{'action':'collect','order':o['id'],'part':parts[0]['id']})[0],200)
        self.assertEqual(self.action(self.rest,o,'status',status='done')[0],409)  # second part not collected yet
        self.assertEqual(self.rest.call('/api/parts',{'action':'deliver','order':o['id'],'part':parts[0]['id']})[0],200)
        self.assertEqual(self.stored(o)[0]['st'],'go')
        self.assertEqual(self.rest.call('/api/parts',{'action':'collect','order':o['id'],'part':parts[1]['id']})[0],200)
        self.assertEqual(self.action(self.rest,o,'status',status='done')[0],200);self.assertEqual(self.stored(o)[0]['st'],'done')
    def test_cancellation_after_partial_collection_is_not_invented(self):
        o=self.paid(4,ready=True);self.part(self.driver,o,'accept',bags=2);self.part(self.driver,o,'collect')
        status,result=self.action(self.rest,o,'status',status='no',reason='Client absent');self.assertEqual(status,409);self.assertIn('pas encore décidée',result['error'])
        self.assertEqual(self.stored(o)[0]['st'],'go')
        full=self.paid(2);self.part(self.driver2,full,'accept',bags=2)
        self.assertEqual(self.action(self.rest,full,'status',status='no',reason='Rupture')[0],200)
        self.assertEqual(self.stored(full)[1][0]['state'],'cancelled');self.assertEqual(self.boot(self.driver2,'driver')['courier']['load'],0)
    def test_legacy_single_driver_order_migrates_to_one_part(self):
        legacy=self.paid();self.action(self.rest,legacy,'status',status='prep');self.action(self.rest,legacy,'status',status='ready')
        with app.connect() as db:
            row=app.get(db,'orders/'+legacy['id']);row.update(driver='driver',driverName='driver',driverAccepted=True,acceptedAt=app.now(),st='go');app.put(db,'orders/'+legacy['id'],row)
            done=dict(row,id='legacy-done',code='LEGACY',st='done',completedAt=app.now(),driver='driver2');app.put(db,'orders/legacy-done',done)
            db.execute("DELETE FROM migrations WHERE id='2026-10-lot2-delivery-parts'")
            self.assertEqual(app.migrate_parts(db),2);self.assertEqual(app.migrate_parts(db),0)
            parts={p['order_id']:p for p in map(dict,db.execute('SELECT * FROM delivery_parts'))}
        self.assertEqual((parts[legacy['id']]['state'],parts[legacy['id']]['bags'],parts[legacy['id']]['legacy']),('collected',1,1))
        self.assertEqual(parts['legacy-done']['state'],'delivered')
        order=self.stored(legacy)[0];self.assertEqual(order['bags'],1);self.assertTrue(order['bagsLegacy']);self.assertEqual(order['total'],legacy['total'])
        view=self.boot(self.driver,'driver');self.assertIn(legacy['id'],view['orders']);self.assertEqual(view['courier']['load'],1)
        self.assertEqual(self.part(self.driver,legacy,'deliver')[0],200);self.assertEqual(self.stored(legacy)[0]['st'],'done')
    def test_startup_migration_on_pre_lot2_database_copy(self):
        import sqlite3,subprocess
        with tempfile.TemporaryDirectory() as folder:
            old=sqlite3.connect(Path(folder)/'porto.sqlite3')
            old.executescript("CREATE TABLE accounts(id TEXT PRIMARY KEY, login TEXT UNIQUE, role TEXT, merchant TEXT, name TEXT, salt TEXT, hash TEXT, active INTEGER DEFAULT 1);CREATE TABLE docs(path TEXT PRIMARY KEY, body TEXT);")
            order={'id':'old1','m':'levfood','mode':'deliv','st':'ready','paid':True,'t':1,'fee':3.5,'total':12.5,'driver':'d1','driverAccepted':True,'acceptedAt':5}
            old.execute('INSERT INTO docs VALUES(?,?)',('orders/old1',json.dumps(order)));old.execute('INSERT INTO docs VALUES(?,?)',('orders/old2',json.dumps({**order,'id':'old2','driver':None})));old.commit();old.close()
            for _ in range(2):subprocess.run([sys.executable,'-c','import server'],cwd=str(Path(app.ROOT)),env={**os.environ,'PK_RUNTIME':folder},check=True)
            db=sqlite3.connect(Path(folder)/'porto.sqlite3')
            rows=db.execute('SELECT order_id,driver,bags,state,legacy FROM delivery_parts').fetchall();self.assertEqual(rows,[('old1','d1',1,'accepted',1)])
            migrated=json.loads(db.execute("SELECT body FROM docs WHERE path='orders/old1'").fetchone()[0]);untouched=json.loads(db.execute("SELECT body FROM docs WHERE path='orders/old2'").fetchone()[0])
            self.assertEqual((migrated['bags'],migrated['total'],migrated['fee'],migrated['driver']),(1,12.5,3.5,'d1'));self.assertNotIn('bags',untouched);db.close()

    # ----- Lot 3: preparation time, cancellation requests, couriers missing, pickup proposal -----
    def shift(self,o,**stamps):
        with app.connect() as db:row=app.get(db,'orders/'+o['id']);row.update(stamps);app.put(db,'orders/'+o['id'],row)
    def prepared(self,minutes,cancel=False):
        o=self.paid();self.assertEqual(self.action(self.rest,o,'status',status='prep')[0],200)
        self.shift(o,prepStartedAt=app.now()-int(minutes*60000))
        self.assertEqual(self.action(self.rest,o,'status',status='ready')[0],200)
        if cancel:self.assertEqual(self.action(self.rest,o,'status',status='no',reason='Client injoignable')[0],200)
        return o
    def prep_state(self,who=None,portal='restaurant'):return self.boot(who or self.rest,portal)['prep']['levfood']
    def test_preparation_time_default_estimate_and_setting(self):
        self.assertEqual(self.prep_state()['minutes'],15);self.assertNotIn('kosherfc',self.boot(self.rest,'restaurant')['prep'])
        o=self.paid(1);self.action(self.rest,o,'status',status='prep');stored=self.stored(o)[0]
        self.assertEqual((stored['prepMinutes'],stored['prepEta']-stored['prepStartedAt']),(15,15*60000))
        self.assertNotIn('prepEta',self.boot(self.client,'client')['orders'][o['id']])
        self.assertEqual(self.boot(self.ceo,'ceo')['orders'][o['id']]['prepEta'],stored['prepEta'])
        self.assertEqual(self.part(self.driver,o,'accept',bags=1)[0],200);self.assertEqual(self.boot(self.driver,'driver')['orders'][o['id']]['prepEta'],stored['prepEta'])
        for bad in [0,181,12.5,'20']:self.assertEqual(self.rest.call('/api/prep',{'action':'set','minutes':bad})[0],400)
        self.assertEqual(self.other.call('/api/prep',{'merchant':'levfood','action':'set','minutes':20})[0],403)
        self.assertEqual(self.rest.call('/api/prep',{'action':'set','minutes':22})[0],200);self.assertEqual(self.prep_state()['minutes'],22)
        p=self.paid();self.action(self.rest,p,'status',status='prep');self.assertEqual(self.stored(p)[0]['prepMinutes'],22)
    def test_median_of_first_twenty_valid_preparations_is_proposed_then_refused_or_accepted(self):
        import statistics
        self.assertEqual(self.rest.call('/api/prep',{'action':'set','minutes':12})[0],200)
        with app.connect() as db:app.put(db,'orders/legacy-prep',{'id':'legacy-prep','m':'levfood','st':'done','t':1,'readyAt':5})  # old order without start stamp
        self.prepared(25,cancel=True);self.prepared(.1);self.prepared(300)            # cancelled, too short, too long: ignored
        durations=[8,9,10,11,12,13,14,16,17,18,19,21,22,23,24,26,27,28,29,40]
        for minutes in durations[:19]:self.prepared(minutes)
        self.assertIsNone(self.prep_state()['proposal'])
        self.prepared(durations[19]);proposal=self.prep_state()['proposal']
        median=statistics.median(m*60 for m in durations)
        self.assertEqual((proposal['state'],proposal['count'],len(proposal['samples']),proposal['currentMinutes']),('pending',20,20,12))
        self.assertAlmostEqual(proposal['medianSeconds'],median,delta=2);self.assertEqual((median,proposal['minutes']),(1110,19))  # 18.5 min rounded half up
        self.assertEqual(self.prep_state()['minutes'],12)                           # never applied silently
        self.prepared(5);self.assertEqual(self.prep_state()['proposal']['samples'],proposal['samples'])  # no rolling recalculation
        self.assertEqual(self.ceo.call('/api/prep',{'merchant':'levfood','action':'accept'})[0],403)
        self.assertEqual(self.rest.call('/api/prep',{'action':'refuse'})[0],200);state=self.prep_state()
        self.assertEqual((state['minutes'],state['proposal']['state']),(12,'refused'))
        self.assertEqual(self.rest.call('/api/prep',{'action':'accept'})[0],409)
        with app.connect() as db:value=app.get(db,'prep/levfood');value['proposal']['state']='pending';app.put(db,'prep/levfood',value)
        for _ in range(2):self.assertEqual(self.rest.call('/api/prep',{'action':'accept'})[0],200)
        self.assertEqual(self.prep_state()['minutes'],19)
    def stock(self):
        with app.connect() as db:return app.items(db,'levfood')['add-009']['s']
    def test_customer_cancellation_request_refused_with_standard_message(self):
        o=self.order();self.assertEqual(self.action(self.client,o,'cancel-request')[0],409)  # unpaid
        self.action(self.rest,o,'status',status='ok')
        self.assertEqual(self.action(self.stranger,o,'cancel-request')[0],403)
        self.assertEqual(self.action(self.client,o,'cancel-request')[0],200);self.assertEqual(self.action(self.client,o,'cancel-request')[0],409)
        self.assertEqual(self.action(self.client,o,'cancel-decision',decision='accept')[0],403)
        self.assertEqual(self.action(self.other,o,'cancel-decision',decision='accept')[0],403)
        self.assertEqual(self.action(self.rest,o,'cancel-decision',decision='refuse')[0],200)
        view=self.boot(self.client,'client')['orders'][o['id']]
        self.assertEqual(view['cancelRequest']['message'],'Le restaurant a malheureusement décliné votre annulation. Vous pouvez adresser une réclamation.')
        self.assertEqual(view['cancelRequest']['state'],'refused');self.assertNotIn('by',view['cancelRequest']);self.assertEqual(view['st'],'ok')
        self.assertEqual(self.action(self.rest,o,'cancel-decision',decision='accept')[0],409)
        self.assertFalse(self.stored(o)[0].get('refund'))
    def test_accepted_cancellation_restores_stock_once_even_after_preparation(self):
        self.rest.call('/api/menu',{'merchant':'levfood','menu':{'items':{'add-009':{'s':4}}}})
        o=self.paid(2);self.action(self.rest,o,'status',status='prep');self.assertEqual(self.stock(),2)
        self.assertEqual(self.part(self.driver,o,'accept',bags=2)[0],200)
        self.assertEqual(self.action(self.client,o,'cancel-request')[0],200)
        status,first=self.action(self.ceo,o,'cancel-decision',decision='accept');self.assertEqual(status,200)
        status,second=self.action(self.rest,o,'cancel-decision',decision='accept');self.assertEqual((status,second['changed']),(200,False))
        self.assertEqual(self.stock(),4);order,parts=self.stored(o)
        self.assertEqual((order['st'],order['refund'],order['cancelRequest']['state']),('no',True,'accepted'));self.assertEqual([p['state'] for p in parts],['cancelled'])
        self.assertEqual(self.boot(self.driver,'driver')['courier']['load'],0)
        self.assertEqual(self.action(self.rest,o,'status',status='no',reason='Encore')[0],200);self.assertEqual(self.stock(),4)
    def test_accepting_after_partial_collection_keeps_undecided_rule(self):
        o=self.paid(4,ready=True);self.part(self.driver,o,'accept',bags=2);self.part(self.driver,o,'collect')
        self.assertEqual(self.action(self.client,o,'cancel-request')[0],200)
        status,result=self.action(self.rest,o,'cancel-decision',decision='accept');self.assertEqual(status,409);self.assertIn('pas encore décidée',result['error'])
        order=self.stored(o)[0];self.assertEqual((order['st'],order['cancelRequest']['state']),('go','pending'))
    def test_restaurant_cancellation_requires_reason_and_refund_is_declared(self):
        o=self.paid()
        for reason in [None,'',' a ']:self.assertEqual(self.action(self.rest,o,'status',status='no',reason=reason)[0],400)
        self.assertEqual(self.stored(o)[0]['st'],'ok');self.assertEqual(self.action(self.rest,o,'refunded')[0],409)
        self.assertEqual(self.action(self.rest,o,'status',status='no',reason='Rupture de stock')[0],200)
        self.assertEqual(self.action(self.client,o,'refunded')[0],403);self.assertEqual(self.action(self.other,o,'refunded')[0],403)
        self.assertEqual(self.action(self.rest,o,'refunded')[0],200);stamp=self.stored(o)[0]['refundedAt']
        self.assertEqual(self.action(self.ceo,o,'refunded')[1]['changed'],False);self.assertEqual(self.stored(o)[0]['refundedAt'],stamp)
        view=self.boot(self.client,'client')['orders'][o['id']];self.assertEqual((view['why'],view['refundedAt']),('Rupture de stock',stamp));self.assertNotIn('refundedBy',view)
    def alert(self,o,who=None,portal='restaurant'):return self.boot(who or self.rest,portal)['orders'][o['id']]['courierAlert']
    def test_alerts_after_five_and_fifteen_minutes_without_courier(self):
        o=self.paid(3);self.assertIsNone(self.alert(o))
        self.shift(o,paidAt=app.now()-4*60000);self.assertIsNone(self.alert(o))
        self.shift(o,paidAt=app.now()-6*60000);a=self.alert(o);self.assertEqual((a['level'],a['bags'],a['partial'],a['pickupProposable']),(5,3,False,False))
        self.shift(o,paidAt=app.now()-16*60000);self.assertEqual(self.alert(o,self.ceo,'ceo')['level'],15)
        self.assertNotIn('courierAlert',self.boot(self.client,'client')['orders'][o['id']])
        self.assertEqual(self.ceo.call('/api/dispatch',{'id':o['id'],'driver':'driver2','bags':1})[0],200);self.assertEqual(self.alert(o)['bags'],3)  # proposal is not acceptance
        self.part(self.driver,o,'accept',bags=2);a=self.alert(o);self.assertEqual((a['level'],a['bags'],a['partial']),(15,1,True))
        with app.connect() as db:
            self.assertEqual(app.scan_courier_alerts(db),2);self.assertEqual(app.scan_courier_alerts(db),0)
            self.assertEqual(set(app.get(db,'orders/'+o['id'])['courierAlerts']),{'5','15'})
        self.part(self.driver2,o,'accept',bags=1);self.assertIsNone(self.alert(o))
        unknown=self.paid();self.shift(unknown,paidAt=app.now()-6*60000);a=self.alert(unknown);self.assertEqual((a['level'],a['unknownLoad']),(5,True))
        unpaid=self.order();self.shift(unpaid,t=app.now()-20*60000);self.assertIsNone(self.alert(unpaid))
    def test_pickup_proposal_after_fifteen_minutes_accepted_by_customer(self):
        o=self.paid(3);self.part(self.driver,o,'accept',bags=2);self.shift(o,paidAt=app.now()-10*60000)
        self.assertEqual(self.action(self.rest,o,'pickup-offer')[0],409)
        self.shift(o,paidAt=app.now()-16*60000)
        self.assertEqual(self.action(self.driver,o,'pickup-offer')[0],403);self.assertEqual(self.action(self.client,o,'pickup-offer')[0],403)
        self.assertEqual(self.action(self.rest,o,'pickup-offer')[0],200);self.assertEqual(self.action(self.rest,o,'pickup-offer')[0],409)
        self.assertEqual(self.stored(o)[0]['mode'],'deliv')                          # nothing automatic
        view=self.boot(self.client,'client')['orders'][o['id']];self.assertEqual(view['pickupOffer']['state'],'pending');self.assertNotIn('by',view['pickupOffer'])
        self.assertEqual(self.action(self.rest,o,'pickup-answer',accept=True)[0],403);self.assertEqual(self.action(self.stranger,o,'pickup-answer',accept=True)[0],403)
        self.assertEqual(self.action(self.client,o,'pickup-answer',accept=True)[0],200);self.assertFalse(self.action(self.client,o,'pickup-answer',accept=True)[1]['changed'])
        order,parts=self.stored(o)
        self.assertEqual((order['mode'],order['fee'],order['total'],order['conversion']['note']),('pick',o['fee'],o['total'],'Ajustement financier à traiter manuellement'))
        self.assertEqual([(p['state'],p['release_reason']) for p in parts],[('cancelled','Commande convertie en retrait')])
        self.assertEqual(self.boot(self.driver,'driver')['courier']['load'],0);self.assertNotIn(o['id'],self.boot(self.driver2,'driver')['offers'])
        self.assertIsNone(self.alert(o))
        for st in ['prep','ready','done']:self.assertEqual(self.action(self.rest,o,'status',status=st)[0],200)
    def test_pickup_proposal_refused_changes_nothing(self):
        o=self.paid(2);self.part(self.driver,o,'accept',bags=1);self.shift(o,paidAt=app.now()-16*60000)
        self.assertEqual(self.action(self.ceo,o,'pickup-offer')[0],200)
        before=self.stored(o)
        self.assertEqual(self.action(self.client,o,'pickup-answer',accept=False)[0],200)
        order,parts=self.stored(o);self.assertEqual((order['mode'],order['fee'],order['pickupOffer']['state']),('deliv',o['fee'],'refused'))
        self.assertEqual(parts,before[1]);self.assertNotIn('conversion',order);self.assertEqual(self.alert(o)['level'],15)
        self.assertEqual(self.action(self.client,o,'pickup-answer',accept=True)[0],409)
        collected=self.paid(2,ready=True);self.part(self.driver2,collected,'accept',bags=1);self.part(self.driver2,collected,'collect');self.shift(collected,paidAt=app.now()-16*60000)
        status,result=self.action(self.rest,collected,'pickup-offer');self.assertEqual(status,409);self.assertIn('pas encore décidée',result['error'])

    # ----- Lot 4: Google tour, manual order, links, GPS per courier (simulated duration provider, no key, no network) -----
    def routable(self,o,dest=(41.17,-8.62),pickup=(41.16,-8.60)):
        """Verified Google points, as /api/pickup and an address token would store them."""
        with app.connect() as db:
            menu=app.get(db,'menus/'+o['m']);menu.update(lat=pickup[0],lon=pickup[1],pickupVerified=True,address='Rua do Teste 1, Porto');app.put(db,'menus/'+o['m'],menu)
            row=app.get(db,'orders/'+o['id']);row.update(destLat=dest[0],destLon=dest[1],addressVerified=True);app.put(db,'orders/'+o['id'],row)
    def google(self,calls=None):
        """Simulated computeRouteMatrix: one duration per pair from the coordinates, every call recorded."""
        import integrations
        from unittest.mock import patch
        integrations.clear_cache();calls=[] if calls is None else calls
        def provider(key,points):
            calls.append(len(points));return [[0 if a==b else 60+round((abs(points[a][0]-points[b][0])+abs(points[a][1]-points[b][1]))*20000) for b in range(len(points))] for a in range(len(points))]
        stack=__import__('contextlib').ExitStack();stack.enter_context(patch.dict(os.environ,{'PK_GOOGLE_KEY':'test-placeholder'}));stack.enter_context(patch.object(integrations,'PROVIDER',provider))
        return stack,calls
    def tour(self,who=None,**body):
        status,value=(who or self.driver).call('/api/tour',body);return status,value
    def kosher_order(self,ready=True):
        status,o=self.stranger.call('/api/orders',{'m':'kosherfc','lines':[{'id':'p016','q':1,'o':['Sprite']}],'mode':'deliv','name':'Other customer','tel':'+351 911111111','addr':'Other street 99 Porto','when':'asap'});self.assertEqual(status,200,o);o=o['order']
        for st in ['ok','prep','ready'] if ready else ['ok']:self.assertEqual(self.action(self.other,o,'status',status=st)[0],200)
        self.assertEqual(self.action(self.other,o,'bags',bags=1)[0],200);return o
    def test_tour_stops_follow_parts_collected_and_delivered(self):
        done=self.paid(1,ready=True);self.part(self.driver,done,'accept');self.part(self.driver,done,'collect');self.part(self.driver,done,'deliver')
        carried=self.paid(1,ready=True);self.part(self.driver,carried,'accept');self.part(self.driver,carried,'collect')
        waiting=self.paid(2,ready=True);self.part(self.driver,waiting,'accept')
        stops=[s['id'] for s in self.boot(self.driver,'driver')['tour']['stops']]
        self.assertEqual(sorted(stops),sorted(['delivery:'+carried['id'],'pickup:'+waiting['id'],'delivery:'+waiting['id']]))
        self.assertLess(stops.index('pickup:'+waiting['id']),stops.index('delivery:'+waiting['id']))
        self.assertNotIn('pickup:'+carried['id'],stops);self.assertFalse(any(done['id'] in s for s in stops))
        self.assertEqual(self.boot(self.driver2,'driver')['tour']['stops'],[])  # another courier never gets this tour
    def test_optimized_then_manual_order_survives_polling_and_recalculation(self):
        a=self.paid(1,ready=True);b=self.paid(1,ready=True)
        for o,dest in [(a,(41.20,-8.70)),(b,(41.161,-8.601))]:self.part(self.driver,o,'accept');self.routable(o,dest)
        self.driver.call('/api/location',{'latitude':41.15,'longitude':-8.61,'accuracy':5,'age':500})
        stack,calls=self.google()
        with stack:
            status,result=self.tour(action='optimize');self.assertEqual(status,200,result)
            self.assertEqual(calls,[5]);self.assertNotIn('degraded',result)  # ONE matrix call: courier + 4 stops
            tour=result['tour'];self.assertFalse(tour['manual']);self.assertTrue(tour['estimates']['fresh'])
            self.assertIn(tour['estimates']['method'],['exact-enumeration'])
            order=[s['id'] for s in tour['stops']];self.assertTrue(all('eta' in s for s in tour['stops']))
            self.assertEqual(order[0],'pickup:'+order[0].split(':')[1])
            # The courier moves the last stop up: checked by the server, saved, times recomputed (cached durations).
            last=order[-1];status,result=self.tour(action='move',stop=last,to='up',signature=tour['signature'])
            if status==409:last=order[1];status,result=self.tour(action='move',stop=last,to='down',signature=tour['signature'])
            self.assertEqual(status,200,result);manual=[s['id'] for s in result['tour']['stops']]
            self.assertNotEqual(manual,order);self.assertTrue(result['tour']['manual']);self.assertEqual(result['tour']['estimates']['method'],'manual')
            self.assertEqual(len(calls),1)  # same points within two minutes: no new Google call
            for _ in range(3):
                self.driver.call('/api/location',{'latitude':41.1501,'longitude':-8.6101,'accuracy':5})
                view=self.boot(self.driver,'driver')['tour'];self.assertEqual([s['id'] for s in view['stops']],manual);self.assertTrue(view['manual'])
            status,result=self.tour(action='refresh');self.assertEqual(status,200,result)
            self.assertEqual([s['id'] for s in result['tour']['stops']],manual);self.assertTrue(result['tour']['estimates']['fresh'])
            # A new acceptance keeps the manual order and appends the new stops (pickup before delivery).
            c=self.paid(1,ready=True);self.part(self.driver,c,'accept');self.routable(c,(41.18,-8.65))
            view=self.boot(self.driver,'driver')['tour'];ids=[s['id'] for s in view['stops']]
            self.assertEqual(ids[:4],manual);self.assertEqual(ids[4:],['pickup:'+c['id'],'delivery:'+c['id']]);self.assertTrue(view['outdated'])
            # Only an explicit request replaces the manual order with the optimal one.
            status,result=self.tour(action='optimize');self.assertEqual(status,200,result);self.assertFalse(result['tour']['manual']);self.assertEqual(len(calls),2)
    def test_manual_order_violating_constraints_is_refused(self):
        o=self.paid(2,ready=True);self.part(self.driver,o,'accept');self.routable(o)
        before=[s['id'] for s in self.boot(self.driver,'driver')['tour']['stops']];self.assertEqual(before,['pickup:'+o['id'],'delivery:'+o['id']])
        status,result=self.tour(action='order',stops=['delivery:'+o['id'],'pickup:'+o['id']]);self.assertEqual(status,409);self.assertIn('Collectez',result['error'])
        self.assertEqual(self.tour(action='move',stop='delivery:'+o['id'],to='first')[0],409)
        self.assertEqual(self.tour(action='order',stops=['pickup:'+o['id']])[0],409)  # an omitted stop is refused too
        self.assertEqual(self.tour(action='move',stop='pickup:'+o['id'],to='down',signature='old')[0],409)
        self.assertEqual([s['id'] for s in self.boot(self.driver,'driver')['tour']['stops']],before)
        self.assertEqual(self.tour(self.rest,action='optimize')[0],401)
    def test_without_google_key_everything_degrades_without_crash(self):
        import integrations;integrations.clear_cache()
        status,result=self.client.call('/api/address',{'query':'Rua de Santa Catarina 10','session':'s1','cart':CART});self.assertEqual(status,503);self.assertEqual(result['degraded'],'unconfigured')
        o=self.order(destLat=41.9,destLon=-8.9);self.assertFalse(o['addressVerified']);self.assertNotIn('destLat',o)  # free text kept, raw coordinates ignored
        self.action(self.rest,o,'status',status='ok');self.bags(o,1);self.part(self.driver,o,'accept')
        self.driver.call('/api/location',{'latitude':41.15,'longitude':-8.61,'accuracy':5})
        status,result=self.tour(action='optimize');self.assertEqual(status,200,result);self.assertEqual(result['degraded']['kind'],'unverified')
        view=result['tour'];self.assertEqual([s['id'] for s in view['stops']],['pickup:'+o['id'],'delivery:'+o['id']]);self.assertIsNone(view['estimates'])
        self.assertEqual(view['unverified'],[o['code']]);self.assertIn('Test%20address%20Porto',view['links']['segments'][0]['url'])
        self.routable(o)
        status,result=self.tour(action='optimize');self.assertEqual(status,200,result);self.assertEqual(result['degraded']['kind'],'unconfigured')
        self.assertFalse(result['tour']['routes']);self.assertIsNone(result['tour']['estimates'])
        self.assertEqual(self.tour(action='move',stop='delivery:'+o['id'],to='up')[0],409)  # constraints still checked without Google
        _,ceo=self.ceo.call('/api/bootstrap?portal=ceo');self.assertEqual(ceo['integrations'],{'places':None,'routes':None})
    def test_shared_tour_reveals_no_gps_route_or_other_customer(self):
        mine=self.paid(1,ready=True);theirs=self.kosher_order()
        for o,dest in [(mine,(41.171111,-8.621111)),(theirs,(41.188888,-8.655555))]:self.part(self.driver,o,'accept');self.routable(o,dest)
        self.driver.call('/api/location',{'latitude':41.151234,'longitude':-8.612345,'accuracy':7})
        stack,_=self.google()
        with stack:self.assertEqual(self.tour(action='optimize')[0],200)
        client=self.client.call('/api/bootstrap')[1];raw=json.dumps(client);view=client['orders'][mine['id']]
        for key in ['location','route','routePosition','tour','parts','driver','driverName']:self.assertNotIn(key,view)
        for value in ['41.151234','-8.612345','41.188888','Other street','pickup:','delivery:','"tour"']:self.assertNotIn(value,raw)
        self.assertIsInstance(view['deliveryEta'],int);self.assertEqual(view['etaSource'],'route')
        rest=self.boot(self.rest,'restaurant');raw=json.dumps(rest);order=rest['orders'][mine['id']]
        self.assertNotIn(theirs['id'],rest['orders']);self.assertNotIn('tour',rest)
        for value in ['41.188888','-8.655555','Other street','Other customer','delivery:'+theirs['id']]:self.assertNotIn(value,raw)
        part=order['parts'][0];self.assertEqual(part['position']['latitude'],41.151234);self.assertEqual(part['position']['state'],'live')
        self.assertTrue(part['eta']['fresh']);self.assertLess(part['eta']['pickup'],part['eta']['delivery'])
        other=self.boot(self.other,'restaurant');self.assertNotIn(mine['id'],other['orders']);self.assertNotIn('41.171111',json.dumps(other))
        self.assertNotIn('Test address Porto',json.dumps(self.boot(self.driver2,'driver')))
    def test_old_positions_and_estimates_are_never_shown_as_current(self):
        o=self.paid(1,ready=True);self.part(self.driver,o,'accept');self.routable(o)
        self.driver.call('/api/location',{'latitude':41.15,'longitude':-8.61,'accuracy':5})
        stack,_=self.google()
        with stack:self.assertEqual(self.tour(action='optimize')[0],200)
        with app.connect() as db:
            pos=app.get(db,'drivers/driver');pos['fixAt']=app.now()-3*60000;app.put(db,'drivers/driver',pos)
            saved=app.get(db,'tours/driver');saved['computed']['at']-=11*60000;app.put(db,'tours/driver',saved)
        rest=self.boot(self.rest,'restaurant')['orders'][o['id']];self.assertEqual(rest['location']['state'],'stale');self.assertGreaterEqual(rest['location']['ageMs'],180000)
        self.assertFalse(rest['parts'][0]['eta']['fresh']);self.assertNotIn('deliveryEta',self.client.call('/api/bootstrap')[1]['orders'][o['id']])
        ceo=self.boot(self.ceo,'ceo');self.assertEqual(next(d for d in ceo['drivers'] if d['id']=='driver')['state'],'stale')
        self.assertFalse(self.boot(self.driver,'driver')['tour']['estimates']['fresh'])
        stack,_=self.google()
        with stack:status,result=self.tour(action='refresh')
        self.assertEqual(status,200);self.assertEqual(result['degraded']['kind'],'position')
        self.driver.call('/api/location',{'stop':True});rest=self.boot(self.rest,'restaurant')['orders'][o['id']]
        self.assertEqual(rest['location']['state'],'interrupted');self.assertEqual(rest['location']['latitude'],41.15);self.assertFalse(rest['location']['tracking'])
    def test_delivery_and_pickup_addresses_come_from_server_verified_results(self):
        import integrations
        verified={'label':'R. de Santa Catarina 10, 4000-447 Porto','latitude':41.149,'longitude':-8.606,'placeId':'abc','streetNumber':'10','precision':'address'}
        token=integrations.sign_address(app.RUNTIME,verified)
        status,result=self.client.call('/api/orders',{'m':'levfood','lines':[{'id':'add-009','q':1,'o':[]}],'mode':'deliv','name':'T','tel':'+351 900000000','addr':'santa catarina 10','when':'asap','addressToken':token[:-3]+'abc'})
        self.assertEqual(status,400)
        o=self.order(addressToken=token,destLat=1,destLon=1)
        self.assertEqual((o['addr'],o['destLat'],o['destLon'],o['addressVerified']),(verified['label'],41.149,-8.606,True))
        self.assertEqual(self.rest.call('/api/pickup',{'merchant':'levfood','token':token})[0],200)
        self.assertEqual(self.other.call('/api/pickup',{'merchant':'levfood','token':token})[0],403)
        _,boot=self.rest.call('/api/bootstrap?portal=restaurant');menu=boot['menus']['levfood'];menu.update(lat=0,lon=0,pickupVerified=True)
        self.assertEqual(self.rest.call('/api/menu',{'merchant':'levfood','menu':menu})[0],200)
        with app.connect() as db:stored=app.get(db,'menus/levfood')
        self.assertEqual((stored['lat'],stored['lon'],stored['pickupVerified']),(41.149,-8.606,True))
        self.assertEqual(self.rest.call('/api/pickup',{'merchant':'levfood','address':'Rua sem numero, Porto'})[0],200)
        with app.connect() as db:stored=app.get(db,'menus/levfood')
        self.assertEqual((stored['lat'],stored['pickupVerified']),(None,False))
    def test_address_search_and_google_settings_are_server_side(self):
        import integrations
        from unittest.mock import patch
        place={'id':'abc','formattedAddress':'R. de Santa Catarina 10, Porto','location':{'latitude':41.149,'longitude':-8.606},'addressComponents':[{'longText':'10','types':['street_number']}]}
        def fake(url,body=None,headers=None,method=None):
            return {'suggestions':[{'placePrediction':{'placeId':'abc','text':{'text':'R. de Santa Catarina 10, Porto'}}}]} if url.endswith(':autocomplete') else place
        with patch.dict(os.environ,{'PK_GOOGLE_PLACES_KEY':'test-placeholder'}),patch.object(integrations,'request',side_effect=fake):
            status,result=self.client.call('/api/address',{'query':'Santa Catarina 10','session':'s1','cart':CART});self.assertEqual(status,200,result);self.assertEqual(result['results'][0]['placeId'],'abc')
            status,result=self.client.call('/api/address',{'placeId':'abc','session':'s1','query':'Santa Catarina 10','cart':CART});self.assertEqual(status,200,result)
            self.assertEqual(integrations.open_address(app.RUNTIME,result['address']['token'])['latitude'],41.149);self.assertNotIn('test-placeholder',json.dumps(result))
            self.assertEqual(self.rest.call('/api/address',{'query':'Santa Catarina 10','session':'s2'})[0],200)
        self.assertIn(self.driver.call('/api/routing',{'action':'test'})[0],[401,403])
        self.assertEqual(self.ceo.call('/api/routing',{'action':'configure','key':'old-ors'})[0],400)
        with app.connect() as db:app.put(db,'secret/ors',{'value':'legacy-encrypted-value'})
        stack,calls=self.google()
        with stack:
            os.environ.pop('PK_GOOGLE_KEY');self.assertEqual(self.ceo.call('/api/routing',{'action':'google-routes','key':'test-routes-key'})[0],200)
            status,result=self.ceo.call('/api/routing',{'action':'test'});self.assertEqual(status,200,result);self.assertIn('Google Routes disponible',result['message'])
        _,ceo=self.ceo.call('/api/bootstrap?portal=ceo');self.assertEqual(ceo['integrations']['routes'],'vault');self.assertNotIn('test-routes-key',json.dumps(ceo))
        with app.connect() as db:self.assertEqual(app.get(db,'secret/ors')['value'],'legacy-encrypted-value')  # kept, unused

    # ----- Lot 5a: kitchen data, single promotions function, menus, public availability, pre-orders, modes -----
    def menu(self,items,who=None):
        _,boot=(who or self.rest).call('/api/bootstrap?portal=restaurant');menu=boot['menus']['levfood'];menu.setdefault('items',{}).update(items)
        status,result=(who or self.rest).call('/api/menu',{'merchant':'levfood','menu':menu});self.assertEqual(status,200,result)
    def stock(self,pid='add-009'):
        with app.connect() as db:return app.items(db,'levfood')[pid].get('s')
    def stored_promo(self,code):
        with app.connect() as db:return app.get(db,'menus/levfood')['promos'][code]
    def test_percent_and_gift_codes_apply_only_with_their_code(self):
        self.menu({'add-009':{'s':10},'add-010':{'s':10}})
        self.promo('MINUS20',kind='percent',pct=20,max=5);self.promo('COOKIE',kind='gift',giftId='add-009',giftQ=2,max=5)
        self.assertEqual(self.stock(),10)  # creating a gift code reserves nothing (R77)
        plain=self.order(lines=[{'id':'add-010','q':2,'o':[]}],mode='pick');self.assertEqual((plain['total'],plain['gift'],plain['disc']),(6.5,'',0))
        self.assertNotIn('giftLine',plain);self.assertEqual(self.stock(),10)
        pct=self.order(lines=[{'id':'add-010','q':2,'o':[]}],mode='pick',promo='minus20');self.assertEqual((pct['total'],pct['disc'],pct['promo']),(5.3,1.2,'MINUS20'))
        status,check=self.client.call('/api/promo/check',{'merchant':'levfood','code':'COOKIE'});self.assertEqual(status,200);self.assertEqual(check['giftLabel'],'2 × Cookie maison')
        self.assertEqual(self.stock(),10)  # checking a code reserves nothing
        gift=self.order(lines=[{'id':'add-010','q':1,'o':[]}],mode='pick',promo='COOKIE')
        self.assertEqual((gift['total'],gift['gift'],gift['giftLine']),(3.5,'2 × Cookie maison',{'id':'add-009','n':'Cookie maison','q':2}))
        self.assertEqual(self.stock(),8);self.assertEqual(self.stored_promo('COOKIE')['used'],1);self.assertEqual(self.stored_promo('MINUS20')['used'],1)
        _,view=self.rest.call('/api/bootstrap?portal=restaurant');self.assertEqual(view['orders'][gift['id']]['giftLine']['q'],2)
    def test_promo_quota_counter_and_activation(self):
        self.promo('ONCE',kind='percent',pct=10,max=1)
        self.order(mode='pick',promo='ONCE');self.assertEqual(self.stored_promo('ONCE')['used'],1)
        self.assertEqual(self.client.call('/api/orders',{'m':'levfood','lines':[{'id':'add-009','q':1,'o':[]}],'mode':'pick','name':'A','tel':'900000000','promo':'ONCE'})[0],409)
        self.promo('TWICE',kind='percent',pct=10,max=2)
        self.assertEqual(self.rest.call('/api/promo',{'action':'active','code':'TWICE','active':False})[0],200)
        self.assertEqual(self.client.call('/api/promo/check',{'merchant':'levfood','code':'TWICE'})[0],409)
        self.assertEqual(self.client.call('/api/orders',{'m':'levfood','lines':[{'id':'add-009','q':1,'o':[]}],'mode':'pick','name':'A','tel':'900000000','promo':'TWICE'})[0],409)
        self.assertEqual(self.stored_promo('TWICE')['used'],0)
        self.assertEqual(self.other.call('/api/promo',{'merchant':'levfood','action':'active','code':'TWICE','active':True})[0],403)
        self.assertEqual(self.driver.call('/api/promo',{'merchant':'levfood','action':'active','code':'TWICE','active':True})[0],401)
        self.assertEqual(self.ceo.call('/api/promo',{'merchant':'levfood','action':'active','code':'TWICE','active':True})[0],200)
        self.assertEqual(self.order(mode='pick',promo='TWICE')['disc'],.6)
        for bad in [{'kind':'percent','pct':0,'max':1},{'kind':'percent','pct':10,'max':0},{'kind':'gift','giftId':'nope','max':1},{'kind':'gift','giftId':'add-009','giftQ':0,'max':1},{'kind':'other','max':1}]:
            self.assertEqual(self.rest.call('/api/promo',{'action':'create','code':'BAD1',**bad})[0],400,bad)
        self.assertEqual(self.rest.call('/api/promo',{'action':'create','code':'A!','kind':'percent','pct':5,'max':1})[0],400)
    def test_new_offer_needs_new_code_and_counters_survive_menu_saves(self):
        self.promo('SAVE',kind='percent',pct=10,max=5);self.order(mode='pick',promo='SAVE')
        status,result=self.rest.call('/api/promo',{'action':'create','code':'save','kind':'percent','pct':50,'max':100})
        self.assertEqual(status,409);self.assertIn('nouveau code',result['error'])
        self.assertEqual((self.stored_promo('SAVE')['used'],self.stored_promo('SAVE')['pct'],self.stored_promo('SAVE')['max']),(1,10,5))
        _,boot=self.rest.call('/api/bootstrap?portal=restaurant');menu=boot['menus']['levfood']
        menu['promos']={'SAVE':{'pct':90,'max':999,'used':0},'FREE':{'pct':100,'max':99,'used':0}}  # forged browser counters
        self.assertEqual(self.rest.call('/api/menu',{'merchant':'levfood','menu':menu})[0],200)
        with app.connect() as db:promos=app.get(db,'menus/levfood')['promos']
        self.assertEqual(set(promos),{'SAVE'});self.assertEqual((promos['SAVE']['used'],promos['SAVE']['pct']),(1,10))
        _,boot=self.rest.call('/api/bootstrap?portal=restaurant');menu=boot['menus']['levfood'];menu.pop('promos')
        self.assertEqual(self.rest.call('/api/menu',{'merchant':'levfood','menu':menu})[0],200);self.assertEqual(self.stored_promo('SAVE')['used'],1)
        self.promo('SAVE2',kind='percent',pct=50,max=100);self.assertEqual(self.stored_promo('SAVE')['used'],1)
        self.rest.call('/api/promo',{'action':'active','code':'SAVE','active':False});self.assertEqual(self.stored_promo('SAVE')['used'],1)
    def test_last_promo_use_and_last_stock_are_reserved_once_under_concurrency(self):
        self.menu({'add-009':{'s':1}});self.promo('LAST',kind='percent',pct=10,max=1)
        def place(browser,results):
            results.append(browser.call('/api/orders',{'m':'levfood','lines':[{'id':'add-009','q':1,'o':[]}],'mode':'pick','name':'A','tel':'900000000','promo':'LAST'})[0])
        results=[];buyers=[self.client,self.stranger]+[Browser(self.port) for _ in range(4)]
        for b in buyers[2:]:b.call('/api/bootstrap')
        threads=[threading.Thread(target=place,args=(b,results)) for b in buyers]
        for t in threads:t.start()
        for t in threads:t.join()
        self.assertEqual(sorted(results),[200]+[409]*5);self.assertEqual(self.stock(),0);self.assertEqual(self.stored_promo('LAST')['used'],1)
    def test_composed_menus_detail_components_and_become_unavailable(self):
        self.menu({'add-009':{'s':3},'add-010':{'s':1},'x-fixed':{'n':'Duo','p':5,'c':'Menus','components':[{'id':'add-009','q':1},{'id':'add-010','q':1}]},
            'x-double':{'n':'Double fondant','p':5,'c':'Menus','components':[{'id':'add-010','q':2}]},'x-choice':{'n':'Dessert au choix','p':4,'c':'Menus','menuChoices':[{'category':'Desserts','q':1}]}})
        _,public=self.client.call('/api/bootstrap');items=public['menus']['levfood']['items']
        self.assertEqual(items['x-double']['s'],0);self.assertNotIn('s',items['x-fixed']);self.assertNotIn('s',items['add-009']);self.assertNotIn('s',items['x-choice'])
        _,private=self.rest.call('/api/bootstrap?portal=restaurant');self.assertEqual(private['menus']['levfood']['items']['add-009']['s'],3)
        self.assertEqual(self.client.call('/api/orders',{'m':'levfood','lines':[{'id':'x-double','q':1,'o':[]}],'mode':'pick','name':'A','tel':'900000000'})[0],409)
        o=self.order(lines=[{'id':'x-fixed','q':1,'o':[],'note':'Sans sucre'}],mode='pick')
        self.assertEqual(o['lines'][0]['inc'],['1 × Cookie maison','1 × Fondant au chocolat maison'])
        self.assertEqual((self.stock('add-009'),self.stock('add-010')),(2,0))
        _,public=self.client.call('/api/bootstrap');items=public['menus']['levfood']['items']
        self.assertEqual((items['x-fixed']['s'],items['add-010']['s']),(0,0));self.assertNotIn('s',items['x-choice'])
        self.assertEqual(self.client.call('/api/orders',{'m':'levfood','lines':[{'id':'x-fixed','q':1,'o':[]}],'mode':'pick','name':'A','tel':'900000000'})[0],409)
        self.menu({'add-009':{'s':2,'off':True}})
        _,public=self.client.call('/api/bootstrap');self.assertEqual(public['menus']['levfood']['items']['x-choice']['s'],0)
        self.assertEqual(self.client.call('/api/orders',{'m':'levfood','lines':[{'id':'x-choice','q':1,'o':[],'choices':{'add-009':1}}],'mode':'pick','name':'A','tel':'900000000'})[0],409)
    def test_restore_after_orders_keeps_newer_stock_and_promo_counters(self):
        self.menu({'add-009':{'s':5,'n':'Cookie v1'}});self.menu({'add-009':{'n':'Cookie v2'}})
        with app.connect() as db:version=next(v for v in app.collection(db,'versions').values() if v['config'].get('items',{}).get('add-009',{}).get('n')=='Cookie v1')
        self.promo('KEEP',kind='gift',giftId='add-009',giftQ=1,max=3);self.order(promo='KEEP',mode='pick');self.menu({'add-009':{'s':20}})
        self.assertEqual(self.ceo.call('/api/ceo',{'action':'restore','id':version['id']})[0],200)
        with app.connect() as db:menu=app.get(db,'menus/levfood')
        self.assertEqual((menu['items']['add-009']['n'],menu['items']['add-009']['s']),('Cookie v1',20))  # old card text, newer stock
        self.assertEqual((menu['promos']['KEEP']['used'],menu['promos']['KEEP']['active']),(1,True))
    def test_legacy_promos_and_gift_codes_migrate_without_losing_counters(self):
        legacy={'OLD10':{'pct':10,'max':5,'used':3},'OLDGIFT':{'kind':'gift','giftId':'add-009','giftQ':2,'max':4,'used':2},'OFF':{'pct':5,'max':2,'used':1,'active':False}}
        with app.connect() as db:
            app.put(db,'menus/levfood',{'promos':json.loads(json.dumps(legacy)),'items':{'add-009':{'s':9}}});db.execute("DELETE FROM migrations WHERE id='2026-10-lot5a-promos'")
            self.assertEqual(app.migrate_promos(db),1);self.assertEqual(app.migrate_promos(db),0);promos=app.get(db,'menus/levfood')['promos']
        self.assertEqual({c:(p['kind'],p['used'],p['max'],p['active']) for c,p in promos.items()},{'OLD10':('percent',3,5,True),'OLDGIFT':('gift',2,4,True),'OFF':('percent',1,2,False)})
        self.assertEqual((promos['OLD10']['pct'],promos['OLDGIFT']['giftId'],promos['OLDGIFT']['giftQ']),(10,'add-009',2))
        self.assertEqual(self.order(mode='pick',promo='OLDGIFT')['gift'],'2 × Cookie maison');self.assertEqual(self.stored_promo('OLDGIFT')['used'],3)
        self.assertEqual(self.client.call('/api/promo/check',{'merchant':'levfood','code':'OFF'})[0],409)
    def test_hours_revolut_and_kitchen_type_are_editable_and_validated(self):
        _,boot=self.rest.call('/api/bootstrap?portal=restaurant');menu=boot['menus']['levfood']
        for key,bad in [('h1','25:00'),('h2','7h'),('rev','https://evil.example/pay'),('type','pork')]:
            self.assertEqual(self.rest.call('/api/menu',{'merchant':'levfood','menu':{**menu,key:bad}})[0],400,key)
        menu.update(h1='11:30',h2='22:15',rev='https://revolut.me/levfood',type='dairy')
        self.assertEqual(self.rest.call('/api/menu',{'merchant':'levfood','menu':menu})[0],200)
        _,public=self.client.call('/api/bootstrap');m=public['menus']['levfood']
        self.assertEqual((m['h1'],m['h2'],m['rev'],m['type']),('11:30','22:15','https://revolut.me/levfood','dairy'))
    def test_open_preorders_accept_orders_for_the_opening_and_are_public(self):
        import datetime as dt
        from zoneinfo import ZoneInfo
        porto=lambda minutes:(dt.datetime.now(ZoneInfo('Europe/Lisbon'))+dt.timedelta(minutes=minutes)).strftime('%Y-%m-%dT%H:%M')
        self.assertEqual(self.rest.call('/api/service',{'action':'schedule','preordersAt':porto(-30),'opensAt':porto(120),'delay':20})[0],200)
        _,public=self.client.call('/api/bootstrap');service=public['menus']['levfood']['effectiveService']
        self.assertTrue(service['preorderOpen']);self.assertTrue(service['open'])
        o=self.order(mode='pick');self.assertGreaterEqual(o['scheduledAt'],app.porto_timestamp(porto(120))+20*60000-60000)
        self.rest.call('/api/service',{'action':'schedule','preordersAt':porto(30),'opensAt':porto(120),'delay':20})
        _,public=self.client.call('/api/bootstrap');self.assertFalse(public['menus']['levfood']['effectiveService']['preorderOpen'])
        self.rest.call('/api/service',{'action':'schedule','preordersAt':porto(-30),'opensAt':porto(-10),'delay':20})
        _,public=self.client.call('/api/bootstrap');self.assertFalse(public['menus']['levfood']['effectiveService']['preorderOpen'])  # service already open: normal ordering
    def test_restaurant_modes_stay_within_ceo_limits(self):
        body={'m':'levfood','lines':[{'id':'add-009','q':1,'o':[]}],'name':'Test','tel':'900000000','addr':'Rua Test 1, Porto'}
        self.enable_uber()
        self.assertEqual(self.ceo.call('/api/service',{'action':'glo','enabled':False})[0],200)
        self.assertEqual(self.rest.call('/api/service',{'action':'glo','enabled':True})[0],200)
        _,public=self.client.call('/api/bootstrap');service=public['menus']['levfood']['effectiveService']
        self.assertFalse(service['glo']);self.assertTrue(service['uber']);self.assertTrue(service['pickup'])
        self.assertEqual(self.client.call('/api/orders',{**body,'mode':'deliv'})[0],409)
        self.assertEqual(self.ceo.call('/api/service',{'action':'glo','enabled':True})[0],200)
        self.assertEqual(self.rest.call('/api/service',{'action':'pickup','enabled':False})[0],200)
        _,public=self.client.call('/api/bootstrap');service=public['menus']['levfood']['effectiveService']
        self.assertEqual((service['glo'],service['pickup'],service['uber']),(True,False,False))
        self.assertEqual(self.client.call('/api/orders',{**body,'mode':'deliv'})[0],200)
        self.assertEqual(self.client.call('/api/orders',{**body,'mode':'uber'})[0],409)
        self.assertEqual(self.rest.call('/api/service',{'action':'uber','enabled':True})[0],403)

    # ----- Lot 5b: password change, Web Push, game window, Wheelie bonus, agenda, CalJ slot -----
    def staff_account(self,role='restaurant'):
        status,created=self.ceo.call('/api/ceo',{'action':'account','login':f'{role}-{secrets.token_hex(3)}@test.invalid','name':'Staff','role':role,'merchant':'levfood'})
        self.assertEqual(status,200,created);return created
    def staff_login(self,created,portal='restaurant',password=None):
        with app.connect() as db:login=db.execute('SELECT login FROM accounts WHERE id=?',(created['id'],)).fetchone()[0]
        b=Browser(self.port,portal);status,_=b.call('/api/login',{'role':portal,'login':login,'password':password or created['password']});self.assertEqual(status,200);return b
    def test_password_change_checks_current_and_confirmation_updates_vault_audits_and_revokes(self):
        created=self.staff_account();first=self.staff_login(created);second=self.staff_login(created)
        good={'current':created['password'],'password':'a-brand-new-password-26','confirm':'a-brand-new-password-26'}
        self.assertEqual(first.call('/api/password',{**good,'current':'wrong-password-123'})[0],401)
        self.assertEqual(first.call('/api/password',{**good,'confirm':'a-brand-new-password-27'})[0],400)
        self.assertEqual(first.call('/api/password',{k:v for k,v in good.items() if k!='confirm'})[0],400)
        self.assertEqual(first.call('/api/password',{**good,'password':'short','confirm':'short'})[0],400)
        self.assertEqual(first.call('/api/password',{**good,'password':created['password'],'confirm':created['password']})[0],400)
        self.assertEqual(self.boot(second,'restaurant')['me']['id'],created['id'])  # refused attempts change nothing
        self.assertEqual(first.call('/api/password',good)[0],200)
        for browser in [first,second]:self.assertEqual(browser.call('/api/bootstrap?portal=restaurant')[0],401)
        self.assertEqual(self.boot(self.ceo,'ceo')['me']['role'],'ceo')  # other accounts keep their sessions
        status,vault=self.ceo.call('/api/ceo',{'action':'credential','id':created['id']});self.assertEqual((status,vault['password']),(200,good['password']))
        self.assertEqual(self.staff_login(created,password=good['password']).call('/api/bootstrap?portal=restaurant')[0],200)
        with app.connect() as db:
            rows=[dict(r) for r in db.execute('SELECT actor,action,detail FROM audit')]
            stored=app.get(db,'credentials/'+created['id'])['value']
        self.assertIn({'actor':'ceo','action':'credential.view','detail':json.dumps({'account':created['id']})},rows)
        self.assertTrue(any(r['action']=='account.password' and r['actor']==created['id'] for r in rows))
        self.assertNotIn(good['password'],json.dumps(rows)+stored)
        audit=self.boot(self.ceo,'ceo')['audit'];self.assertTrue(any(a['action']=='credential.view' and a['actorName']=='ceo' for a in audit))
    def push_setup(self):
        sent=[];behaviour={'mode':'ok'}
        def sender(info,payload):
            if behaviour['mode']=='fail':raise RuntimeError('HTTP 503')
            if behaviour['mode']=='gone':raise app.push.Gone('410')
            sent.append((info['endpoint'],json.loads(payload)))
        old=(app.push.SENDER,app.push.AUTOFLUSH);app.push.SENDER=sender;app.push.AUTOFLUSH=False
        self.addCleanup(lambda:setattr(app.push,'SENDER',old[0]) or setattr(app.push,'AUTOFLUSH',old[1]))
        return sent,behaviour
    def flush(self,at=None):return app.push.flush(app.connect,app.RUNTIME,app.LOCK,lambda:at or app.now())
    def subscription(self,name):return {'endpoint':'https://push.example.invalid/'+name,'keys':{'p256dh':'B'+'x'*86,'auth':'a'*22}}
    def queue(self):
        with app.connect() as db:return [dict(r) for r in db.execute('SELECT * FROM push_queue ORDER BY created')]
    def test_push_subscription_dedup_unsubscribe_and_simulated_failures(self):
        sub=self.subscription('device-a')
        os.environ.pop('PK_VAPID_SUBJECT',None)
        if app.push.webpush is None:  # degraded mode is declared, nothing is accepted
            self.assertEqual(self.rest.call('/api/push',{'action':'subscribe','subscription':sub})[0],409)
            self.assertFalse(self.boot(self.ceo,'ceo')['push']['enabled'])
        sent,behaviour=self.push_setup()
        boot=self.boot(self.rest,'restaurant');self.assertTrue(boot['push']['enabled']);self.assertGreater(len(boot['push']['publicKey']),80)
        self.assertNotIn('push',self.client.call('/api/bootstrap')[1])
        self.assertEqual(self.client.call('/api/push',{'action':'subscribe','subscription':sub})[0],401)
        self.assertEqual(self.rest.call('/api/push',{'action':'subscribe','subscription':{'endpoint':'http://insecure','keys':{}}})[0],400)
        self.assertEqual(self.rest.call('/api/push',{'action':'subscribe','subscription':sub,'device':'iPhone'})[1]['created'],True)
        self.assertEqual(self.rest.call('/api/push',{'action':'subscribe','subscription':sub})[1]['created'],False)  # same device, same role
        self.assertEqual(self.other.call('/api/push',{'action':'subscribe','subscription':self.subscription('other-restaurant')})[0],200)
        self.assertEqual(self.driver.call('/api/push',{'action':'subscribe','subscription':sub})[0],200)       # same device, courier role
        self.assertEqual(self.driver2.call('/api/push',{'action':'subscribe','subscription':self.subscription('device-b')})[0],200)
        self.assertTrue(self.rest.call('/api/push',{'action':'status','endpoint':sub['endpoint']})[1]['subscribed'])
        o=self.order();self.assertEqual(self.action(self.client,o,'paid')[0],200)
        with app.connect() as db:self.assertEqual(app.notify(db,f"order:{o['id']}:declared",'again',['restaurant','ceo'],merchant='levfood'),0)  # repeated event
        rows=self.queue();self.assertEqual([(r['endpoint'],r['event']) for r in rows],[(sub['endpoint'],f"order:{o['id']}:declared")])  # other restaurant not notified
        self.assertNotIn('Test client',rows[0]['payload'])
        self.assertEqual(self.flush()['sent'],1);self.assertEqual(self.flush()['sent'],0);self.assertEqual(len(sent),1)
        self.assertEqual(sent[0][1]['url'],'/restaurant')
        # Order validated: couriers with an open service; ready: only the courier holding an accepted part.
        self.service('driver2',False);self.assertEqual(self.action(self.rest,o,'status',status='ok')[0],200)
        self.assertEqual([r['endpoint'] for r in self.queue() if r['event'].endswith(':offer')],[sub['endpoint']])
        self.bags(o,2);self.assertEqual(self.part(self.driver,o,'accept',bags=2)[0],200)
        for st in ['prep','ready']:self.assertEqual(self.action(self.rest,o,'status',status=st)[0],200)
        self.assertEqual([r['endpoint'] for r in self.queue() if r['event'].endswith(':ready')],[sub['endpoint']])
        # Simulated failures: retried with backoff, then marked failed; never reported as delivered.
        behaviour['mode']='fail';future=app.now()
        for attempt in range(app.push.MAX_ATTEMPTS):
            future+=10**9;self.flush(future)
        states={r['event'].split(':')[-1]:(r['state'],r['attempts']) for r in self.queue()}
        self.assertEqual(states['offer'],('failed',app.push.MAX_ATTEMPTS));self.assertEqual(states['ready'],('failed',app.push.MAX_ATTEMPTS))
        status=self.boot(self.ceo,'ceo')['push'];self.assertEqual(status['counts']['failed'],2);self.assertEqual(status['lastError']['message'],'HTTP 503')
        # Expired subscription: deactivated, later events skip it.
        behaviour['mode']='gone'
        with app.connect() as db:app.notify(db,'manual:1','x',['driver'],accounts=['driver2']);db.commit()
        self.assertEqual(self.flush()['expired'],1)
        with app.connect() as db:
            self.assertEqual(db.execute("SELECT active FROM push_subscriptions WHERE endpoint=?",(self.subscription('device-b')['endpoint'],)).fetchone()[0],0)
            self.assertEqual(app.notify(db,'manual:2','x',['driver'],accounts=['driver2']),0)
        # Test message needs a subscription and promises no reception; unsubscribe and revocation stop deliveries.
        behaviour['mode']='ok'
        status,test=self.rest.call('/api/push',{'action':'test','endpoint':sub['endpoint']});self.assertEqual(status,200);self.assertIn('Seul l’affichage',test['message'])
        self.assertEqual(self.ceo.call('/api/push',{'action':'test','endpoint':sub['endpoint']})[0],404)
        self.assertEqual(self.rest.call('/api/push',{'action':'unsubscribe','endpoint':sub['endpoint']})[1]['removed'],1)
        self.assertFalse(self.rest.call('/api/push',{'action':'status','endpoint':sub['endpoint']})[1]['subscribed'])
        with app.connect() as db:self.assertEqual(app.notify(db,'manual:3','x',['restaurant'],merchant='levfood'),0)
        self.assertEqual(self.ceo.call('/api/ceo',{'action':'reset','id':'driver'})[0],200)
        with app.connect() as db:self.assertEqual(app.notify(db,'manual:4','x',['driver'],accounts=['driver']),0)
        self.assertNotIn(sub['endpoint'],json.dumps(self.boot(self.ceo,'ceo')['push']))
    def set_order_time(self,o,t):
        with app.connect() as db:row=app.get(db,'orders/'+o['id']);row['t']=t;app.put(db,'orders/'+o['id'],row)
    def test_game_window_per_order_cancellation_and_falsified_scores(self):
        first=self.order();self.set_order_time(first,app.now()-50*60000)
        status,run=self.client.call('/api/games/start',{'game':'spin'});self.assertEqual(status,200)
        with app.connect() as db:t1=app.get(db,'orders/'+first['id'])['t']
        self.assertEqual(run['expires'],t1+app.HOUR)
        _,boot=self.client.call('/api/bootstrap');self.assertEqual(boot['gameExpires'],t1+app.HOUR)  # reload keeps the deadline
        second=self.order();status,run2=self.client.call('/api/games/start',{'game':'stack'});self.assertEqual(status,200)
        self.assertEqual(run2['expires'],second['t']+app.HOUR)  # a new order opens its own hour
        self.assertEqual(self.action(self.rest,second,'status',status='no',reason='Test cancellation')[0],200)
        self.assertEqual(self.client.call('/api/bootstrap')[1]['gameExpires'],t1+app.HOUR)  # cancelled order no longer gives access
        self.assertEqual(self.client.call('/api/games/score',{'run':run['run'],'from':0,'tick':10,'taps':[5,3]})[0],400)  # tampered log
        self.assertEqual(self.client.call('/api/games/score',{'run':run['run'],'score':'1'})[0],400)
        self.set_order_time(first,app.now()-app.HOUR-1000)
        self.assertEqual(self.client.call('/api/games/start',{'game':'sky'})[0],403)
        self.assertEqual(self.client.call('/api/games/score',{'run':run['run'],'from':0,'tick':10,'taps':[]})[0],403)
    def test_wheelie_bonus_has_the_same_window_and_stays_out_of_the_leaderboard(self):
        from unittest.mock import patch
        o=self.order();status,run=self.client.call('/api/games/start',{'game':'wheel'});self.assertEqual(status,200)
        self.assertEqual(run['expires'],o['t']+app.HOUR)
        with app.connect() as db:self.assertEqual(app.get(db,'arcade/'+run['run']),{})  # no replay state, no ranked score
        with patch.object(app,'now',return_value=run['time']+5000):
            status,result=self.client.call('/api/games/score',{'run':run['run'],'from':0,'tick':60,'taps':[1]})
        self.assertEqual(status,400);self.assertIn('hors classement',result['error'])
        self.assertEqual(self.client.call('/api/bootstrap')[1]['scores'],{})
        self.assertEqual(self.client.call('/api/games/start',{'game':'unknown'})[0],400)
        self.set_order_time(o,app.now()-app.HOUR-1)
        self.assertEqual(self.client.call('/api/games/start',{'game':'wheel'})[0],403)
        self.assertEqual(self.stranger.call('/api/games/start',{'game':'wheel'})[0],403)
    def test_weekly_and_one_off_agenda_events_are_validated_editable_and_audited(self):
        weekly={'title':'Kabbalat Chabbat communautaire','time':'19:30','place':'Synagogue','dow':5,'img':'arvit'}
        status,created=self.ceo.call('/api/events',{'event':weekly});self.assertEqual(status,200,created)
        events=self.client.call('/api/bootstrap')[1]['events'];self.assertEqual(events[created['id']]['dow'],5);self.assertNotIn('day',events[created['id']])
        self.assertEqual(self.ceo.call('/api/events',{'id':created['id'],'event':{**weekly,'title':'Kabbalat Chabbat','time':'7:45'}})[0],200)
        events=self.client.call('/api/bootstrap')[1]['events'];self.assertEqual((events[created['id']]['title'],events[created['id']]['time']),('Kabbalat Chabbat','07:45'))
        status,once=self.ceo.call('/api/events',{'event':{'title':'Soirée','time':'20:00','day':'2026-12-31','dow':3}});self.assertEqual(status,200)
        self.assertEqual(self.client.call('/api/bootstrap')[1]['events'][once['id']]['day'],'2026-12-31')
        self.assertNotIn('dow',self.client.call('/api/bootstrap')[1]['events'][once['id']])
        for bad in [{**weekly,'time':'25:00'},{**weekly,'dow':7},{**weekly,'dow':'5'},{**weekly,'title':' '},{'title':'X','time':'10:00','day':'2026-02-30'},{**weekly,'img':'javascript:x'}]:
            self.assertEqual(self.ceo.call('/api/events',{'event':bad})[0],400,bad)
        self.assertEqual(self.ceo.call('/api/events',{'id':'missing','event':weekly})[0],404)
        self.assertEqual(self.rest.call('/api/events',{'event':weekly})[0],401)
        self.assertEqual(self.ceo.call('/api/events',{'id':created['id'],'remove':True})[0],200)
        self.assertEqual(self.ceo.call('/api/events',{'id':created['id'],'remove':True})[0],404)
        self.assertNotIn(created['id'],self.client.call('/api/bootstrap')[1]['events'])
        with app.connect() as db:actions=[r[0] for r in db.execute("SELECT action FROM audit WHERE action LIKE 'event.%' ORDER BY created")]
        self.assertEqual(sorted(actions),sorted(['event.create','event.update','event.create','event.remove']))
    def test_calj_slot_is_disabled_by_default_and_never_invents_times(self):
        public=self.client.call('/api/bootstrap')[1]['calj'];self.assertEqual(public['status'],'unconfigured');self.assertIn('non configurée',public['label'])
        self.assertEqual(set(public),{'status','city','country','label'})
        self.assertFalse(self.boot(self.ceo,'ceo')['caljConfig']['enabled'])
        self.assertEqual(self.rest.call('/api/ceo',{'action':'calj','enabled':True})[0],401)
        status,saved=self.ceo.call('/api/ceo',{'action':'calj','enabled':True,'city':'Porto','country':'Portugal','key':'CALJ-SECRET-KEY'});self.assertEqual(status,200)
        self.assertTrue(saved['calj']['keySaved']);self.assertNotIn('CALJ-SECRET-KEY',json.dumps(self.boot(self.ceo,'ceo')))
        public=self.client.call('/api/bootstrap')[1]['calj'];self.assertEqual(public['status'],'pending');self.assertEqual(set(public),{'status','city','country','label'})
        with app.connect() as db:
            self.assertNotIn('CALJ-SECRET-KEY',app.get(db,'secret/calj')['value'])
            self.assertNotIn('CALJ-SECRET-KEY',json.dumps([dict(r) for r in db.execute('SELECT * FROM audit')]))
        self.assertFalse(self.ceo.call('/api/ceo',{'action':'calj','enabled':False,'removeKey':True})[1]['calj']['keySaved'])
    def test_service_worker_and_role_manifests_are_served(self):
        c=http.client.HTTPConnection('127.0.0.1',self.port,timeout=5);c.request('GET','/sw.js');r=c.getresponse();body=r.read().decode()
        self.assertEqual(r.status,200);self.assertIn('javascript',r.getheader('Content-Type'));self.assertEqual(r.getheader('Cache-Control'),'no-cache')
        self.assertIn("addEventListener('push'",body);self.assertNotIn('caches.',body)
        for role,start in [('restaurant','/restaurant'),('driver','/livreur'),('ceo','/ceo')]:
            status,manifest=self.client.call(f'/manifest/{role}.webmanifest');self.assertEqual((status,manifest['start_url'],manifest['display']),(200,start,'standalone'))
    def test_establishment_is_linked_only_to_restaurant_accounts(self):
        for role in ['driver','ceo']:
            status,created=self.ceo.call('/api/ceo',{'action':'account','login':f'{role}-x@test.invalid','role':role,'merchant':'levfood'})
            if role=='ceo':self.ceo.call('/api/ceo',{'action':'disable','id':created['id']})
            with app.connect() as db:self.assertEqual(db.execute('SELECT merchant FROM accounts WHERE id=?',(created['id'],)).fetchone()[0],'',role)
        status,created=self.ceo.call('/api/ceo',{'action':'account','login':'r-x@test.invalid','role':'restaurant','merchant':'levfood'});self.assertEqual(status,200)
        with app.connect() as db:self.assertEqual(db.execute('SELECT merchant FROM accounts WHERE id=?',(created['id'],)).fetchone()[0],'levfood')

    # ----- Revue indépendante (docs/REVUE.md) : un test par défaut reproduit (scénarios rv01 à rv14) -----
    def test_review_i1_restaurant_never_sees_courier_at_other_brand_customer(self):
        # rv03 / R37: shared tour levfood + kosherfc, courier parked at the kosherfc customer.
        mine=self.paid(1,ready=True);theirs=self.kosher_order()
        for o,dest in [(mine,(41.171111,-8.621111)),(theirs,(41.188888,-8.655555))]:self.part(self.driver,o,'accept');self.routable(o,dest)
        for o in [mine,theirs]:self.assertEqual(self.part(self.driver,o,'collect')[0],200)
        self.assertEqual(self.driver.call('/api/location',{'latitude':41.188888,'longitude':-8.655555,'accuracy':5})[0],200)
        rest=self.boot(self.rest,'restaurant');raw=json.dumps(rest)
        self.assertNotIn('41.188888',raw);self.assertNotIn('-8.655555',raw)
        self.assertEqual(rest['orders'][mine['id']]['parts'][0]['position'],{'state':'busy'})
        self.assertNotIn('latitude',next(d for d in rest['drivers'] if d['id']=='driver'))
        self.assertIn('41.188888',json.dumps(self.boot(self.ceo,'ceo')))  # the CEO keeps the full view
        # The other customer is delivered: the last point (at that door) stays hidden; a new point on the way is shown.
        self.assertEqual(self.part(self.driver,theirs,'deliver')[0],200)
        self.assertNotIn('41.188888',json.dumps(self.boot(self.rest,'restaurant')))
        self.assertEqual(self.driver.call('/api/location',{'latitude':41.175,'longitude':-8.63,'accuracy':5})[0],200)
        rest=self.boot(self.rest,'restaurant')
        self.assertEqual(rest['orders'][mine['id']]['parts'][0]['position']['latitude'],41.175)
        self.assertEqual(next(d for d in rest['drivers'] if d['id']=='driver')['latitude'],41.175)
    def test_review_i1_restaurant_hidden_while_courier_heads_to_other_pickup(self):
        mine=self.paid(1,ready=True);self.part(self.driver,mine,'accept');self.routable(mine)
        self.assertEqual(self.part(self.driver,mine,'collect')[0],200)
        theirs=self.kosher_order();self.part(self.driver,theirs,'accept');self.routable(theirs,(41.188888,-8.655555),(41.18,-8.64))
        sig=self.boot(self.driver,'driver')['tour']['signature']
        self.assertEqual(self.tour(action='move',stop='pickup:'+theirs['id'],to='first',signature=sig)[0],200)
        self.assertEqual(self.boot(self.driver,'driver')['tour']['stops'][0]['id'],'pickup:'+theirs['id'])
        self.driver.call('/api/location',{'latitude':41.179,'longitude':-8.639,'accuracy':5})
        rest=self.boot(self.rest,'restaurant');self.assertNotIn('41.179',json.dumps(rest))
        self.assertEqual(rest['orders'][mine['id']]['parts'][0]['position'],{'state':'busy'})
    def test_review_i2_menu_save_cannot_change_uber_or_service(self):
        # rv01 / H20-C40: Uber Colis is set by the CEO only, /api/menu ignores service fields outside the CEO.
        self.enable_uber()
        self.assertEqual(self.ceo.call('/api/service',{'merchant':'levfood','action':'uber','enabled':False})[0],200)
        self.assertEqual(self.rest.call('/api/service',{'action':'glo','enabled':False})[0],200)
        body={'m':'levfood','lines':[{'id':'add-009','q':1,'o':[]}],'mode':'uber','name':'A','tel':'+351 900000000','when':'asap'}
        self.assertEqual(self.client.call('/api/orders',body)[0],409)
        menu=self.boot(self.rest,'restaurant')['menus']['levfood'];menu.pop('effectiveService',None)
        with app.connect() as db:before=app.get(db,'menus/levfood')['service']
        menu['service']={**menu['service'],'uber':True,'glo':True,'session':'forged','openedAt':1};menu['closed']=True
        self.assertEqual(self.rest.call('/api/menu',{'merchant':'levfood','menu':menu})[0],200)
        with app.connect() as db:stored=app.get(db,'menus/levfood')
        self.assertEqual(stored['service'],before);self.assertNotIn('closed',stored)
        self.assertEqual(self.client.call('/api/orders',body)[0],409)
    def test_review_i3_pickup_address_only_for_accepted_couriers_and_never_chabad(self):
        # rv02: chabad-porto pickup address never public, never to couriers; others only to accepted couriers.
        self.assertEqual(self.ceo.call('/api/pickup',{'merchant':'chabad-porto','address':'Rua Secreta 12, Porto'})[0],200)
        with app.connect() as db:
            m=app.get(db,'menus/chabad-porto');m.update(lat=41.1611,lon=-8.6222,pickupVerified=True);app.put(db,'menus/chabad-porto',m)
        lev=self.paid(1,ready=True);self.routable(lev,pickup=(41.1622,-8.6033))
        for who in [Browser(self.port),self.client]:
            raw=json.dumps(who.call('/api/bootstrap')[1])
            for secret in ['Rua Secreta','41.1611','Rua do Teste 1','41.1622']:self.assertNotIn(secret,raw)
        for who,portal in [(self.driver,'driver'),(self.other,'restaurant')]:
            raw=json.dumps(self.boot(who,portal));self.assertNotIn('Rua Secreta',raw);self.assertNotIn('Rua do Teste 1',raw)
        status,o=self.client.call('/api/orders',{'m':'chabad-porto','lines':[{'id':'new26-099','q':1,'o':[]}],'mode':'deliv','name':'C','tel':'+351 900000001','addr':'Rua Cliente 5, Porto','when':'asap'});self.assertEqual(status,200,o);o=o['order']
        for st in ['ok','prep','ready']:self.assertEqual(self.action(self.ceo,o,'status',status=st)[0],200)
        self.assertEqual(self.action(self.ceo,o,'bags',bags=1)[0],200)
        self.assertEqual(self.part(self.driver,o,'accept')[0],200);self.assertEqual(self.part(self.driver,lev,'accept')[0],200)
        drv=self.boot(self.driver,'driver');raw=json.dumps(drv)+json.dumps(self.tour()[1])
        self.assertNotIn('Rua Secreta',raw);self.assertNotIn('41.1611',raw);self.assertNotIn('-8.6222',raw)
        self.assertEqual(drv['menus']['levfood']['address'],'Rua do Teste 1, Porto')  # accepted part: the courier gets it
        self.assertNotIn('Rua do Teste 1',json.dumps(self.boot(self.driver2,'driver')))
        self.assertIn('Rua Secreta',json.dumps(self.boot(self.ceo,'ceo')))
    def test_review_i4_restore_never_marks_old_coordinates_verified(self):
        # rv13 / C36-W05: the pickup point is never restored from an old menu version.
        with app.connect() as db:
            m=app.get(db,'menus/levfood');m.update(address='Ancienne adresse ORS',lat=41.0001,lon=-8.0001);app.put(db,'menus/levfood',m)
        menu=self.boot(self.rest,'restaurant')['menus']['levfood'];menu.pop('effectiveService',None)
        self.assertEqual(self.rest.call('/api/menu',{'merchant':'levfood','menu':menu})[0],200)
        import integrations
        tok=integrations.sign_address(app.RUNTIME,{'label':'Rua Verificada 1, Porto','latitude':41.15,'longitude':-8.61,'placeId':'p','streetNumber':'1','precision':'address'})
        self.assertEqual(self.rest.call('/api/pickup',{'token':tok})[0],200)
        ceo=self.boot(self.ceo,'ceo');vid=[k for k,v in ceo['history'].items() if v.get('merchant')=='levfood' and v['config'].get('lat')==41.0001][0]
        self.assertEqual(self.ceo.call('/api/ceo',{'action':'restore','id':vid})[0],200)
        with app.connect() as db:m=app.get(db,'menus/levfood')
        self.assertFalse(m['lat']==41.0001 and m['pickupVerified'])
        self.assertEqual((m['address'],m['lat'],m['lon'],m['pickupVerified'],m['placeId']),('Rua Verificada 1, Porto',41.15,-8.61,True,'p'))
    def test_review_i5_address_search_is_reserved_and_rate_limited(self):
        # rv07 / §7 quotas: legitimate use only, Google session token, limits per user, per IP and per day.
        import integrations
        from unittest.mock import patch
        with patch.dict(os.environ,{'PK_GOOGLE_KEY':'fake'}),patch.object(integrations,'autocomplete',lambda *a,**k:[{'placeId':'x','label':'y'}]):
            anon=Browser(self.port);anon.call('/api/bootstrap')
            self.assertEqual(anon.call('/api/address',{'query':'Rua 1 Porto','session':'s1'})[0],403)  # no cart in progress
            self.assertEqual(anon.call('/api/address',{'query':'Rua 1 Porto','cart':CART})[0],400)   # no Google session
            self.assertEqual(anon.call('/api/address',{'query':'Rua 1 Porto','session':'s1','cart':{'m':'levfood','lines':[{'id':'nope','q':1}]}})[0],403)
            self.assertEqual(Browser(self.port,'driver').call('/api/address',{'query':'Rua 1 Porto','session':'s1'})[0],401)
            results=[anon.call('/api/address',{'query':'Rua %d Porto'%i,'session':'s1','cart':CART}) for i in range(60)]
            self.assertEqual(sum(st==200 for st,_ in results),30);self.assertEqual(results[-1][0],429);self.assertIn('Trop de recherches',results[-1][1]['error'])
            self.assertEqual(self.rest.call('/api/address',{'query':'Rua 1 Porto','session':'s2'})[0],200)  # professionals: no cart needed
            app.LIMITS.clear()
            with patch.dict(app.ADDRESS_LIMITS,{'user':3,'ip':5}):
                a=Browser(self.port);a.call('/api/bootstrap');b=Browser(self.port);b.call('/api/bootstrap')
                self.assertEqual([a.call('/api/address',{'query':'Rua %d'%i,'session':'s1','cart':CART})[0] for i in range(4)],[200,200,200,429])
                self.assertEqual([b.call('/api/address',{'query':'Rua %d'%i,'session':'s1','cart':CART})[0] for i in range(3)],[200,200,429])  # same IP: 5 max
            app.LIMITS.clear()
            with patch.dict(os.environ,{'PK_ADDRESS_DAILY_LIMIT':'2'}):
                self.assertEqual([Browser(self.port,'ceo').call('/api/bootstrap')[0] and self.ceo.call('/api/address',{'query':'Rua %d'%i,'session':'s3'})[0] for i in range(3)],[200,200,429])
    def test_review_m1_courier_loses_customer_details_after_delivery_grace(self):
        o=self.paid(1,ready=True)
        for action in ['accept','collect','deliver']:self.assertEqual(self.part(self.driver,o,action)[0],200)
        view=self.boot(self.driver,'driver')['orders'][o['id']];self.assertEqual(view['tel'],'+351 900000000')  # short grace
        with app.connect() as db:db.execute('UPDATE delivery_parts SET delivered_at=? WHERE order_id=?',(app.now()-31*60000,o['id']))
        view=self.boot(self.driver,'driver')['orders'][o['id']]
        for key in ['name','tel','addr','destLat','note']:self.assertNotIn(key,view)
        self.assertTrue(view['detailsExpired']);self.assertNotIn('900000000',json.dumps(self.boot(self.driver,'driver')))
    def test_review_m2_ceo_proposal_limited_to_available_capacity(self):
        o=self.paid(10,ready=True)
        status,result=self.ceo.call('/api/dispatch',{'id':o['id'],'driver':'driver','bags':10});self.assertEqual(status,409);self.assertIn('Capacité',result['error'])
        self.assertEqual(self.ceo.call('/api/dispatch',{'id':o['id'],'driver':'driver'})[0],200)
        _,parts=self.stored(o);self.assertEqual([(p['driver'],p['bags'],p['state']) for p in parts],[('driver',5,'proposed')])
        self.assertEqual(self.boot(self.driver2,'driver')['offers'][o['id']]['remaining'],5)
    def test_review_m3_login_limit_ignores_case(self):
        b=Browser(self.port,'restaurant')
        for _ in range(10):b.call('/api/login',{'role':'restaurant','login':'restaurant@test.invalid','password':'wrong-password-x'})
        s1=b.call('/api/login',{'role':'restaurant','login':'restaurant@test.invalid','password':'test-password-for-flow'})[0]
        s2=b.call('/api/login',{'role':'restaurant','login':'Restaurant@test.invalid','password':'test-password-for-flow'})[0]
        self.assertEqual((s1,s2),(429,429))
    def test_review_m4_cancel_refused_when_all_bags_collected(self):
        # rv06, provisional (reversible): same "undecided rule" refusal as a partial collection.
        o=self.paid(1,ready=True);self.assertEqual(self.part(self.driver,o,'accept')[0],200);self.assertEqual(self.part(self.driver,o,'collect')[0],200)
        with app.connect() as db:stock=app.items(db,'levfood')['add-009'].get('s')
        status,result=self.action(self.rest,o,'status',status='no',reason='Client injoignable')
        self.assertEqual(status,409);self.assertIn('pas encore décidée',result['error'])
        row,parts=self.stored(o);self.assertNotEqual(row['st'],'no');self.assertEqual([p['state'] for p in parts],['collected'])
        with app.connect() as db:self.assertEqual(app.items(db,'levfood')['add-009'].get('s'),stock)
    def test_review_m5_uber_off_until_ceo_enables_global_and_establishment(self):
        body={'m':'levfood','lines':[{'id':'add-009','q':1,'o':[]}],'mode':'uber','name':'A','tel':'+351 900000000','when':'asap'}
        self.assertEqual(self.rest.call('/api/service',{'action':'glo','enabled':False})[0],200)
        self.assertFalse(self.client.call('/api/bootstrap')[1]['menus']['levfood']['effectiveService']['uber'])
        self.assertEqual(self.client.call('/api/orders',body)[0],409)
        self.assertEqual(self.ceo.call('/api/service',{'action':'uber','enabled':True})[0],200)
        self.assertEqual(self.client.call('/api/orders',body)[0],409)  # global only: the establishment is still off
        self.assertEqual(self.ceo.call('/api/service',{'merchant':'levfood','action':'uber','enabled':True})[0],200)
        self.assertEqual(self.client.call('/api/orders',body)[0],200)
    def test_review_m6_secret_key_from_environment_keeps_existing_data(self):
        import integrations
        from unittest.mock import patch
        from cryptography.fernet import Fernet
        with tempfile.TemporaryDirectory() as runtime:
            old=integrations.cipher(runtime).encrypt(b'vault-before');key=Fernet.generate_key().decode()
            with patch.dict(os.environ,{'PK_SECRET_KEY':key}):
                c=integrations.cipher(runtime);self.assertEqual(c.decrypt(old),b'vault-before')
                self.assertEqual(Fernet(key.encode()).decrypt(c.encrypt(b'new')),b'new')  # new data under the environment key
            with patch.dict(os.environ,{'PK_SECRET_KEY':'not-a-key'}),self.assertRaises(ValueError):integrations.cipher(runtime)
        with tempfile.TemporaryDirectory() as runtime,patch.dict(os.environ,{'PK_SECRET_KEY':Fernet.generate_key().decode()}):
            integrations.cipher(runtime);self.assertFalse((Path(runtime)/'integration.key').exists())  # nothing written beside the base
    def test_review_m7_push_unsubscribe_checks_account(self):
        endpoint='https://push.example.invalid/other-device'
        with app.connect() as db:db.execute("INSERT INTO push_subscriptions(id,endpoint,role,account,merchant,p256dh,auth,device,created,updated,active,failures) VALUES('s1',?,'restaurant','other','kosherfc','p','a','',1,1,1,0)",(endpoint,))
        status,result=self.rest.call('/api/push',{'action':'unsubscribe','endpoint':endpoint});self.assertEqual(status,200);self.assertEqual(result['removed'],0)
        with app.connect() as db:self.assertEqual(db.execute('SELECT COUNT(*) FROM push_subscriptions WHERE endpoint=?',(endpoint,)).fetchone()[0],1)
        self.assertEqual(self.other.call('/api/push',{'action':'unsubscribe','endpoint':endpoint})[1]['removed'],1)
    def test_review_m8_public_data_has_no_ceo_id_or_raw_service(self):
        self.assertEqual(self.ceo.call('/api/events',{'event':{'title':'Cours','time':'19:00','place':'Porto','img':'','dow':2}})[0],200)
        self.assertEqual(self.rest.call('/api/service',{'action':'open'})[0],200)
        public=self.client.call('/api/bootstrap')[1]
        self.assertTrue(public['events']);self.assertFalse(any('updatedBy' in e for e in public['events'].values()))
        self.assertFalse(any('service' in m for m in public['menus'].values()));self.assertIn('effectiveService',public['menus']['levfood'])
        self.assertTrue(all('updatedBy' in e for e in self.boot(self.ceo,'ceo')['events'].values()))

if __name__=='__main__':unittest.main(verbosity=2)
