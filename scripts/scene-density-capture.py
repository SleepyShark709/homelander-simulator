"""Fixed game-camera evidence, shared by baseline, D2 massing and D6 sample."""
from pathlib import Path
import argparse
import json
from playwright.sync_api import sync_playwright

parser = argparse.ArgumentParser()
parser.add_argument('--url', default='http://127.0.0.1:5181/')
parser.add_argument('--output', default='.artifacts/scene-density/before')
args = parser.parse_args()
folder = Path(args.output)
folder.mkdir(parents=True, exist_ok=True)
views = [
    ('street-forward', [-91, 2.8, 5], [-37, 5, -1]),
    ('street-reverse', [-17, 2.8, -5], [-75, 5, 1]),
    ('corner', [-59, 3, 16], [-58, 6, -44]),
    ('service-alley', [-30.5, 2.8, -15], [-30.5, 4, -51]),
    ('campus-entry', [-33, 2.8, 14], [-33, 3.5, 46]),
    ('low-flight', [-78, 12, 7], [-26, 12, -15]),
    ('rooftop', [-62, 35, 2], [-43, 16, -27]),
    ('layout', [0, 168, 80], [0, 0, 0]),
]
errors = []
with sync_playwright() as p:
    browser = p.chromium.launch(channel='chrome', headless=True, args=['--use-angle=metal'])
    page = browser.new_page(viewport={'width': 1600, 'height': 1000})
    page.on('pageerror', lambda e: errors.append(str(e)))
    page.goto(args.url)
    page.wait_for_function('window.game?.world', timeout=90000)
    page.wait_for_load_state('networkidle')
    page.evaluate('''() => {
        const g=window.game;g.renderer.setAnimationLoop(null);g.reset();g.ui.playing(true);
        g.physics.world.step();g.player.sync();
    }''')
    for name, position, target in views:
        page.evaluate('''({position,target}) => {
            const g=window.game,c=g.camera.camera;
            c.position.set(...position);c.lookAt(...target);c.updateMatrixWorld(true);g.presentation.render();
        }''', {'position': position, 'target': target})
        page.locator('#viewport canvas').screenshot(path=str(folder / (name + '.png')))
    state = page.evaluate('window.game.snapshot()')
    browser.close()
(folder / 'cameras.json').write_text(json.dumps({'url':args.url,'views':views,'state':state,'errors':errors},indent=2)+'\n')
print(json.dumps({'views':len(views),'errors':errors,'state':state}))
if errors: raise SystemExit(1)
