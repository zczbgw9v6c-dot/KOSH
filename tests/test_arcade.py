import json
from pathlib import Path
import subprocess
import sys
import unittest
sys.path.insert(0,str(Path(__file__).resolve().parents[1]))
import arcade_engine

class Replay(unittest.TestCase):
    def test_actual_browser_game_and_server_agree(self):
        result=subprocess.run(['node',str(Path(__file__).with_name('arcade_replay.cjs'))],capture_output=True,text=True,check=True)
        vectors=json.loads(next(line for line in result.stdout.splitlines() if line.startswith('[{')))
        for vector in vectors:
            with self.subTest(game=vector['key']):
                state=arcade_engine.create(vector['key'],vector['seed'])
                arcade_engine.advance(state,vector['tick'],vector['taps'])
                self.assertEqual(state['best'],vector['best'])
    def test_replay_is_identical_across_network_chunks(self):
        for game in ['spin','stack','sky']:
            full=arcade_engine.create(game,123);chunked=arcade_engine.create(game,123)
            taps=[1,2]+list(range(30,600,29))
            arcade_engine.advance(full,600,taps)
            for end in range(60,601,60):arcade_engine.advance(chunked,end,[t for t in taps if end-60<t<=end])
            self.assertEqual(full,chunked)
    def test_scores_keep_arbitrary_precision(self):
        state=arcade_engine.create('spin',123);state['score']='99999999999999999999999999999999999'
        arcade_engine.add(state,10)
        self.assertEqual(state['best'],'100000000000000000000000000000000009')
