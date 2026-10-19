import unittest
import test_flows as flow
app=flow.app
class WorkflowChanges(unittest.TestCase):
 setUpClass=classmethod(flow.Flows.setUpClass.__func__)
 tearDownClass=classmethod(flow.Flows.tearDownClass.__func__)
 setUp=flow.Flows.setUp
 login=flow.Flows.login
 order=flow.Flows.order
 def test_access_notes_scope_and_pickup_visibility(self):
  notes={'merchant':'levfood','driverAccessNote':'Entrée cuisine à gauche','pickupAccessNote':'Sonner au comptoir'}
  self.assertEqual(self.other.call('/api/access-notes',notes)[0],403)
  self.assertEqual(self.rest.call('/api/access-notes',notes)[0],200)
  self.assertEqual(self.rest.call('/api/access-notes',{**notes,'pickupAccessNote':'x'*1001})[0],400)
  order=self.order(mode='pick')
  _,boot=self.client.call('/api/bootstrap');view=boot['orders'][order['id']]
  self.assertEqual(view['pickupAccessNote'],notes['pickupAccessNote']);self.assertNotIn('driverAccessNote',view)
  self.assertNotIn('driverAccessNote',boot['menus']['levfood'])
 def test_client_sees_only_fresh_collected_courier_point(self):
  order={'id':'test','m':'levfood','st':'go','mode':'deliv','prepEta':123,'prepMinutes':15,'pickupEta':456}
  part={'id':'p','order':'test','driver':'d','bags':1,'state':'accepted'}
  pos={'d':{'latitude':41.1,'longitude':-8.6,'tracking':True,'fixAt':app.now()}}
  value=app.order_view(order,'client',[part],positions=pos)
  self.assertEqual(value['courierPositions'],[]);self.assertNotIn('prepEta',value);self.assertNotIn('pickupEta',value)
  part['state']='collected';value=app.order_view(order,'client',[part],positions=pos)
  self.assertEqual(value['courierPositions'][0]['latitude'],41.1);self.assertNotIn('driver',value['courierPositions'][0])
  pos['d']['fixAt']=app.now()-180000
  self.assertEqual(app.order_view(order,'client',[part],positions=pos)['courierPositions'],[])

 def test_restaurant_share_link_is_served(self):
  status,html=self.client.call('/?restaurant=levfood')
  self.assertEqual(status,200);self.assertIn(b'workflow-ui.js',html)

 def test_professional_portal_routes(self):
  for path in ('/restaurant','/livreur','/ceo'):
   with self.subTest(path=path):
    status,html=self.client.call(path)
    self.assertEqual(status,200);self.assertIn(b'workflow-ui.js',html)
 def test_amendment_reprices_stock_keeps_identity_and_time(self):
  with app.connect() as db:
   menu=app.get(db,'menus/levfood');menu.setdefault('items',{}).setdefault('add-009',{})['s']=5;app.put(db,'menus/levfood',menu)
  order=self.order()
  result=self.client.call('/api/orders/amend',{'id':order['id'],'revision':0,'lines':[{'id':'add-009','q':3}]})
  self.assertEqual(result[0],200,result);updated=result[1]['order']
  self.assertEqual(updated['id'],order['id']);self.assertEqual(updated['t'],order['t']);self.assertEqual(updated['total'],12.5)
  with app.connect() as db:
   self.assertEqual(app.items(db,'levfood')['add-009']['s'],2)
   self.assertEqual(len(app.collection(db,'orders')),1)
 def test_amendment_deadline_owner_and_rollback(self):
  order=self.order()
  self.assertEqual(self.stranger.call('/api/orders/amend',{'id':order['id'],'lines':[{'id':'add-009','q':1}]})[0],404)
  with app.connect() as db:
   current=app.get(db,'orders/'+order['id']);current['t']=app.now()-300001;app.put(db,'orders/'+order['id'],current)
  self.assertEqual(self.client.call('/api/orders/amend',{'id':order['id'],'lines':[{'id':'add-009','q':1}]})[0],409)
 def test_paid_amendment_tracks_supplement_and_refund(self):
  order=self.order()
  with app.connect() as db:
   current=app.get(db,'orders/'+order['id']);current.update(paid=True,st='prep');app.put(db,'orders/'+order['id'],current)
  status,result=self.client.call('/api/orders/amend',{'id':order['id'],'lines':[{'id':'add-009','q':3}]})
  self.assertEqual(status,200,result);self.assertEqual(result['order']['additionalDue'],3);self.assertFalse(result['order']['paid'])
  status,result=self.client.call('/api/orders/amend',{'id':order['id'],'revision':1,'lines':[{'id':'add-009','q':1}]})
  self.assertEqual(status,200,result);self.assertEqual(result['order']['editRefundDue'],3);self.assertEqual(result['order']['additionalDue'],0)
 def test_failed_amendment_restores_original_reservation(self):
  with app.connect() as db:
   menu=app.get(db,'menus/levfood');menu.setdefault('items',{}).setdefault('add-009',{})['s']=5;app.put(db,'menus/levfood',menu)
  order=self.order()
  status,_=self.client.call('/api/orders/amend',{'id':order['id'],'lines':[{'id':'add-009','q':6}]})
  self.assertEqual(status,409)
  with app.connect() as db:
   self.assertEqual(app.items(db,'levfood')['add-009']['s'],3)
   self.assertEqual(app.get(db,'orders/'+order['id'])['lines'][0]['q'],2)
 def test_amended_payment_state_refund_and_redaction(self):
  order=self.order()
  with app.connect() as db:
   current=app.get(db,'orders/'+order['id']);current.update(paid=True,st='prep',prepEta=123456);app.put(db,'orders/'+order['id'],current)
  status,result=self.client.call('/api/orders/amend',{'id':order['id'],'lines':[{'id':'add-009','q':3}]})
  self.assertEqual(status,200,result);self.assertNotIn('prepEta',result['order'])
  status,result=self.client.call('/api/orders/amend',{'id':order['id'],'revision':1,'lines':[{'id':'add-009','q':1}]})
  self.assertEqual(result['order']['st'],'prep')
  self.assertEqual(self.client.call('/api/orders/action',{'id':order['id'],'action':'amend-refund'})[0],403)
  self.assertEqual(self.rest.call('/api/orders/action',{'id':order['id'],'action':'amend-refund'})[0],200)
  with app.connect() as db:
   updated=app.get(db,'orders/'+order['id']);self.assertEqual(updated['editRefundDue'],0);self.assertEqual(updated['paidAmount'],6.5)
 def test_cancel_after_supplement_keeps_refund(self):
  order=self.order()
  with app.connect() as db:
   current=app.get(db,'orders/'+order['id']);current.update(paid=True,st='prep');app.put(db,'orders/'+order['id'],current)
  self.assertEqual(self.client.call('/api/orders/amend',{'id':order['id'],'lines':[{'id':'add-009','q':3}]})[0],200)
  self.assertEqual(self.rest.call('/api/orders/action',{'id':order['id'],'action':'status','status':'no','reason':'Test annulation'})[0],200)
  with app.connect() as db:
   updated=app.get(db,'orders/'+order['id']);self.assertTrue(updated['refund']);self.assertEqual(updated['refundAmount'],9.5)
