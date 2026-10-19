import os
import sys
from pathlib import Path
import tempfile
import unittest
from unittest.mock import patch
sys.path.insert(0,str(Path(__file__).resolve().parents[1]))
import integrations

class Integrations(unittest.TestCase):
    """Lot 4: Google Maps Platform replaces OpenRouteService; every provider call is simulated here."""
    def setUp(self):integrations.clear_cache()
    def test_route_matrix_is_one_documented_call_and_keeps_durations(self):
        response=[{'originIndex':0,'destinationIndex':0,'status':{},'condition':'ROUTE_EXISTS','duration':'60s'},
                  {'originIndex':0,'destinationIndex':1,'status':{},'condition':'ROUTE_EXISTS','duration':'120.5s'},
                  {'originIndex':1,'destinationIndex':1,'status':{},'condition':'ROUTE_NOT_FOUND'},
                  {'originIndex':2,'destinationIndex':0,'status':{'code':8,'message':'quota'},'condition':'ROUTE_MATRIX_ELEMENT_CONDITION_UNSPECIFIED'}]
        with patch.object(integrations,'request',return_value=response) as request:
            matrix=integrations.google_matrix('test-key',[(41.15,-8.61),(41.16,-8.60),(41.17,-8.62)])
        self.assertEqual(request.call_count,1)
        url,body=request.call_args.args;headers=request.call_args.kwargs['headers']
        self.assertEqual(url,'https://routes.googleapis.com/distanceMatrix/v2:computeRouteMatrix')
        self.assertIn('status',headers['X-Goog-FieldMask'].split(','));self.assertEqual(headers['X-Goog-Api-Key'],'test-key')
        self.assertEqual(len(body['origins']),3);self.assertEqual(len(body['destinations']),2);self.assertEqual(body['travelMode'],'DRIVE')
        self.assertEqual(body['origins'][1]['waypoint']['location']['latLng'],{'latitude':41.16,'longitude':-8.60})
        self.assertEqual(matrix[0][1],60.0);self.assertEqual(matrix[0][2],120.5)
        self.assertIsNone(matrix[1][2]);self.assertIsNone(matrix[2][1])  # no route / element error never becomes a duration
    def test_keys_are_encrypted_and_round_trip(self):
        store={}
        get=lambda db,key:store.get(key,{})
        put=lambda db,key,value:store.update({key:value})
        with tempfile.TemporaryDirectory() as runtime:
            integrations.secret(None,runtime,'google-routes',get,put,'test-placeholder-key')
            self.assertNotIn('test-placeholder-key',store['secret/google-routes']['value'])
            self.assertEqual(integrations.secret(None,runtime,'google-routes',get,put),'test-placeholder-key')
            self.assertEqual(integrations.google_key(None,runtime,get,put,'routes'),'test-placeholder-key')
            with patch.dict(os.environ,{'PK_GOOGLE_KEY':'environment-key'}):
                self.assertEqual(integrations.google_key(None,runtime,get,put,'routes'),'environment-key')
                self.assertEqual(integrations.key_source(get,None,'places'),'env')
            self.assertIsNone(integrations.google_key(None,runtime,get,put,'places'))
    def test_durations_are_cached_briefly_and_stale_results_are_flagged(self):
        calls=[];clock=[1_000_000]
        def provider(key,points):
            calls.append(points)
            if len(calls)>1:raise integrations.ProviderError('Quota Google atteint.','quota')
            return [[0,60],[60,0]]
        points=[(41.15,-8.61),(41.16,-8.60)];get=lambda db,key:{};now=lambda:clock[0]
        with patch.dict(os.environ,{'PK_GOOGLE_KEY':'test-key'}),patch.object(integrations,'PROVIDER',provider):
            first=integrations.durations(None,None,get,None,points,now);self.assertFalse(first['cached'])
            clock[0]+=60000;again=integrations.durations(None,None,get,None,points,now)
            self.assertEqual(len(calls),1);self.assertTrue(again['cached']);self.assertFalse(again['stale'])
            clock[0]+=180000;stale=integrations.durations(None,None,get,None,points,now)
            self.assertEqual(len(calls),2);self.assertTrue(stale['stale']);self.assertIn('Quota',stale['warning'])
            clock[0]+=integrations.MATRIX_STALE
            with self.assertRaises(integrations.ProviderError) as error:integrations.durations(None,None,get,None,points,now)
            self.assertEqual(error.exception.kind,'quota')
        with self.assertRaises(integrations.ProviderError) as error:integrations.durations(None,tempfile.gettempdir(),get,None,points,now)
        self.assertEqual(error.exception.kind,'unconfigured')
    def test_places_autocomplete_then_details_with_street_number(self):
        with patch.object(integrations,'request',return_value={'suggestions':[{'placePrediction':{'placeId':'abc','text':{'text':'Rua de Santa Catarina 10, Porto'}}},{'queryPrediction':{}}]}) as request:
            rows=integrations.autocomplete('test-key','Rua de Santa Catarina 10','session-1')
        self.assertEqual(rows,[{'placeId':'abc','label':'Rua de Santa Catarina 10, Porto'}])
        url,body=request.call_args.args;self.assertEqual(url,'https://places.googleapis.com/v1/places:autocomplete')
        self.assertEqual(body['includedRegionCodes'],['pt']);self.assertEqual(body['sessionToken'],'session-1')
        place={'id':'abc','formattedAddress':'R. de Santa Catarina 10, 4000-447 Porto','location':{'latitude':41.149,'longitude':-8.606},
               'addressComponents':[{'longText':'10','types':['street_number']},{'longText':'Rua de Santa Catarina','types':['route']}]}
        with patch.object(integrations,'request',return_value=place) as request:
            details=integrations.place_details('test-key','abc','session-1')
        self.assertTrue(request.call_args.args[0].startswith('https://places.googleapis.com/v1/places/abc?'))
        self.assertIn('sessionToken=session-1',request.call_args.args[0]);self.assertIn('location',request.call_args.kwargs['headers']['X-Goog-FieldMask'])
        value=integrations.verified_address(details,'Rua de Santa Catarina 10')
        self.assertEqual((value['streetNumber'],value['precision'],value['latitude']),('10','address',41.149))
        street=integrations.verified_address({**place,'formattedAddress':'R. de Santa Catarina, Porto','addressComponents':[]},'Rua de Santa Catarina 12')
        self.assertEqual((street['label'],street['streetNumber'],street['precision']),('12 R. de Santa Catarina, Porto','12','street'))
    def test_address_tokens_are_server_produced_only(self):
        with tempfile.TemporaryDirectory() as runtime:
            value={'label':'R. de Santa Catarina 10, Porto','latitude':41.149,'longitude':-8.606,'placeId':'abc','streetNumber':'10','precision':'address'}
            token=integrations.sign_address(runtime,value)
            self.assertEqual(integrations.open_address(runtime,token)['latitude'],41.149)
            for forged in [token[:-4]+'AAAA','{"latitude":1}','']:
                with self.assertRaises(ValueError):integrations.open_address(runtime,forged)
    def test_openrouteservice_configuration_is_retired(self):
        with self.assertRaises(ValueError):
            integrations.route(None,None,{'role':'ceo'},{'action':'configure','key':'x'},lambda *a:{},lambda *a:None,None,lambda:0)
        with self.assertRaises(PermissionError):
            integrations.route(None,None,{'role':'driver'},{'action':'test'},lambda *a:{},lambda *a:None,None,lambda:0)
    def test_provider_errors_never_contain_the_key(self):
        from urllib.error import HTTPError
        for code,kind in [(429,'quota'),(403,'denied'),(400,'invalid')]:
            with patch.object(integrations,'urlopen',side_effect=HTTPError('https://routes.googleapis.com/?key=SECRET-KEY',code,'x',{},None)):
                with self.assertRaises(integrations.ProviderError) as error:integrations.request('https://routes.googleapis.com/x',{},headers={'X-Goog-Api-Key':'SECRET-KEY'})
            self.assertEqual(error.exception.kind,kind);self.assertNotIn('SECRET-KEY',str(error.exception))
if __name__=='__main__':unittest.main()
