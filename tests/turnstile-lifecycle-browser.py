"""Real browser regression; mocked OAuth/Turnstile, no real keys or accounts.
BASE_URL may point at a local production build or the deployed UI. Only reads
the UI/assets; every API request is fulfilled in the test browser.
"""
import os, time
from playwright.sync_api import sync_playwright, expect

BASE = os.environ.get('BASE_URL', 'http://127.0.0.1:5184')
with sync_playwright() as p:
    browser = p.chromium.launch(headless=True)
    for mobile in [False, True]:
        context = browser.new_context(**(p.devices['iPhone 13'] if mobile else {}))
        page = context.new_page(); errors = []; claims = []
        page.on('pageerror', lambda error: errors.append(str(error)))
        page.on('console', lambda message: errors.append(message.text) if message.type == 'error' else None)
        state = {'plan': None, 'selected': False, 'waitSeconds': 30,
                 'serverNow': int(time.time()*1000), 'lifetimeHours': 6, 'steps': [],
                 'turnstile': {'enabled': True, 'configured': True, 'siteKey': 'fixture', 'challenge': 'fixture', 'passed': False},
                 'canClaim': False, 'key': None}
        def api(route):
            path = route.request.url.split('/api/')[1]
            if path == 'auth/session':
                result = {'required': True, 'user': {'id': '123456789012345678', 'name': 'Fixture', 'isAdmin': False}}
            else:
                if path == 'flow/select':
                    state.update(plan='6h', selected=True, steps=[{'number': 1, 'title': 'Discord', 'subtitle': 'Completed mission', 'service': 'DISCORD', 'configured': True, 'status': 'done', 'deadline': None}])
                elif path == 'flow/verify':
                    state['turnstile']['passed'] = True; state['canClaim'] = True
                elif path == 'flow/claim':
                    claims.append(1)
                    state['key'] = {'key': 'DEVIL-11111111-22222222-33333333-44444444', 'expiresAt': int(time.time()*1000)+21600000, 'status': 'active'}
                    route.fulfill(json=state['key']); return
                result = state
            route.fulfill(json=result)
        context.route('**/api/**', api)
        context.route('https://challenges.cloudflare.com/**', lambda route: route.fulfill(content_type='application/javascript', body="""
          window.turnstile = {
            render(node, options) {
              window.fixtureOptions = options;
              let button = document.createElement('button'); button.textContent = 'Verify fixture';
              button.onclick = () => options.callback('fixture-token'); node.append(button); return 'fixture-widget';
            },
            remove() { window.fixtureRemovals = (window.fixtureRemovals || 0) + 1; throw Error('Unknown widget ID'); },
            reset() { throw Error('Unknown widget ID'); }
          };
        """))
        page.goto(BASE, wait_until='domcontentloaded')
        page.locator('.key-plan-6h button').click()
        page.get_by_text('Verify fixture', exact=True).wait_for()
        # SDK reset failures must remain inside the widget and allow retry.
        page.evaluate('window.fixtureOptions["expired-callback"]()')
        expect(page.locator('.bot-step .quiet-button')).to_be_visible()
        page.get_by_text('Verify fixture', exact=True).click()
        expect(page.locator('.access-card .primary-button')).to_be_enabled()
        page.locator('.access-card .primary-button').click()
        expect(page.locator('.key-ticket')).to_be_visible()
        expect(page.locator('.key-countdown [role=timer]')).to_be_visible()
        assert page.evaluate('window.fixtureRemovals') >= 1
        assert len(claims) == 1
        # Late callbacks from a disposed widget must not send another claim/verify.
        page.evaluate('window.fixtureOptions.callback("late-token")')
        assert not errors, errors
        assert page.evaluate('document.documentElement.scrollWidth <= innerWidth')
        print('PASS widget reset/remove exceptions do not crash verification or key output:', 'mobile' if mobile else 'desktop', flush=True)
        context.close()
    browser.close()
