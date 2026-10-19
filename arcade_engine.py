"""Deterministic arcade replay. Scores are computed from inputs, never trusted totals."""
import math

FPS = 60
TAU = math.pi * 2

def create(game, seed):
    state = {'key':game, 'seed':seed, 'tick':0, 'mode':'ready', 'score':'0', 'best':'0', 'progress':0}
    reset(state)
    return state

def reset(s):
    s['score']='0';s['progress']=0
    s['game'] = ({'angle':0,'pins':[],'fly':None,'cycle':0,'cooldown':0} if s['key']=='spin'
        else {'blocks':[{'x':85,'w':150}], 'cur':{'x':0,'w':150,'d':1}, 'placed':0} if s['key']=='stack'
        else {'y':230,'vy':0,'gates':[],'stars':[],'next':0})

def random(s):
    x=s['seed'];x^=(x<<13)&0xffffffff;x^=x>>17;x^=(x<<5)&0xffffffff
    s['seed']=x&0xffffffff
    return s['seed']/4294967296

def add(s, amount):
    s['score']=str(int(s['score'])+amount);s['progress']+=1
    s['best']=str(max(int(s['best']),int(s['score'])))

def tap(s):
    if s['mode']!='play':reset(s);s['mode']='play';return
    g=s['game']
    if s['key']=='spin':
        if g['fly'] is None and s['tick']/FPS>=g['cooldown']:g['fly']=400
    elif s['key']=='sky':g['vy']=-290
    else:
        c=g['cur'];top=g['blocks'][-1];left=max(c['x'],top['x']);overlap=min(c['x']+c['w'],top['x']+top['w'])-left
        if overlap<=2:s['mode']='lose';return
        perfect=abs(c['x']-top['x'])<4
        if perfect:left=top['x'];overlap=top['w']
        add(s,20 if perfect else 10);g['placed']+=1
        g['blocks']=(g['blocks']+[{'x':left,'w':overlap}])[-9:]
        g['cur']={'x':0 if random(s)<.5 else 320-overlap,'w':overlap,'d':1 if random(s)<.5 else -1}

def step(s):
    if s['mode']!='play':return
    g=s['game'];d=1+min(9,math.log2(1+s['progress']/8));dt=1/FPS;elapsed=s['tick']/FPS
    if s['key']=='spin':
        direction=-1 if s['progress']>20 and math.sin(elapsed*.5)<0 else 1
        g['angle']=(g['angle']+(1.3+d*.22)*direction*dt+TAU)%TAU
        if g['fly'] is not None:
            g['fly']-=950*dt
            if g['fly']<=240:
                angle=(math.pi/2-g['angle'])%TAU
                if any(min(abs(pin-angle),TAU-abs(pin-angle))<.27 for pin in g['pins']):s['mode']='lose';return
                g['pins'].append(angle);g['fly']=None;g['cooldown']=elapsed+.2;add(s,10)
                if len(g['pins'])>=8:g['pins']=[];g['cycle']+=1
    elif s['key']=='stack':
        c=g['cur'];c['x']+=c['d']*(110+d*32)*dt
        if c['x']<0:c['x']=0;c['d']=1
        if c['x']>320-c['w']:c['x']=320-c['w'];c['d']=-1
    else:
        gap=max(100,165-d*6);speed=125+d*14
        g['vy']+=950*dt;g['y']+=g['vy']*dt;g['next']-=speed*dt
        if g['next']<=0:
            center=gap/2+40+random(s)*(460-gap-80)
            g['gates'].append({'x':350,'center':center,'gap':gap});g['next']=185
        for gate in g['gates']:
            gate['x']-=speed*dt
            if not gate.get('passed') and gate['x']+26<70:gate['passed']=True;add(s,10)
            if abs(gate['x']-70)<37 and (g['y']-11<gate['center']-gate['gap']/2 or g['y']+11>gate['center']+gate['gap']/2):s['mode']='lose';return
        g['gates']=[gate for gate in g['gates'] if gate['x']>-40]
        if g['y']<14 or g['y']>448:s['mode']='lose'

def advance(state, target, taps):
    taps=set(taps)
    while state['tick']<target:
        state['tick']+=1
        if state['tick'] in taps:tap(state)
        step(state)
    return state
