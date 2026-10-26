"""Browser regression against local production build; mocks APIs, never issues real keys."""
import json
import os
from datetime import datetime, timezone, timedelta
from pathlib import Path
from playwright.sync_api import sync_playwright, expect

BASE = os.environ.get('DEVIL_TEST_URL', 'http://127.0.0.1:5184')
ART = Path('../devil-key-qa')
ART.mkdir(exist_ok=True)
with sync_playwright() as p:
    browser = p.chromium.launch(headless=True)
    for width in [390, 1440]:
        context = browser.new_context(viewport={'width': width, 'height': 900})
        context.add_init_script("localStorage.setItem('devil-language','en')")
        page = context.new_page()
        errors = []
        page.on('pageerror', lambda e: errors.append(str(e)))
        start = datetime(2026, 10, 27, tzinfo=timezone.utc)
        page.clock.install(time=start)
        page.clock.pause_at(start + timedelta(seconds=1))
        server_now = 1_800_000_000_000  # Deliberately differs from this machine's clock.
        issued = {'key': f'DEVIL-PRIVATE-TEST-{width}', 'status': 'active', 'expiresAt': server_now + 3_661_000}
        flow = {'serverNow': server_now, 'lifetimeHours': 24, 'steps': [], 'canClaim': True, 'key': issued}
        page.route('**/api/flow', lambda r: r.fulfill(json=flow))
        page.goto(BASE)
        timer = page.get_by_role('timer')
        expect(timer).to_have_text('1 hr 01 min 01 sec')
        page.clock.fast_forward(2500)
        expect(timer).to_have_text('1 hr 00 min 59 sec')
        assert page.evaluate('document.documentElement.scrollWidth <= innerWidth'), 'mobile page overflows'
        page.screenshot(path=str(ART / f'key-countdown-{width}.png'), full_page=True)
        # Reload preserves the original expiry and uses the newly returned server time.
        flow['serverNow'] += 30_000
        page.reload()
        expect(timer).to_have_text('1 hr 00 min 31 sec')
        flow['serverNow'] = issued['expiresAt']
        page.reload()
        expect(timer).to_have_text('Key expired')
        assert not errors, errors
        context.close()
    context = browser.new_context(viewport={'width': 1440, 'height': 900})
    context.add_init_script("localStorage.setItem('devil-language','en');sessionStorage.setItem('devil-admin','local-test-only')")
    page = context.new_page()
    start = datetime(2026, 10, 27, tzinfo=timezone.utc)
    page.clock.install(time=start)
    page.clock.pause_at(start + timedelta(seconds=1))
    now = 1_800_000_000_000
    rows = [dict(id=str(i), key=f'DEVIL-LOCAL-{i}', label=state, source='steps', createdAt=now-5000,
                 expiresAt=expires, status=state, kind='hours', amount=24)
            for i, (state, expires) in enumerate([('active',now+2000), ('active',None), ('revoked',now+9000)])]
    page.route('**/api/admin/keys', lambda r: r.fulfill(json={'serverNow':now, 'keys':rows,
        'stats':{'total':3, 'active':2}, 'configuration':{'links':{}, 'lifetimeHours':24, 'steps':[]}}))
    page.goto(BASE + '/admin')
    expect(page.get_by_role('timer')).to_have_count(3)
    expect(page.get_by_role('timer').nth(0)).to_have_text('0 hr 00 min 02 sec')
    expect(page.get_by_role('timer').nth(1)).to_have_text('Never expires')
    expect(page.get_by_role('timer').nth(2)).to_have_text('Revoked')
    page.clock.fast_forward(2500)
    expect(page.get_by_role('timer').nth(0)).to_have_text('Key expired')
    page.screenshot(path=str(ART/'admin-key-countdown.png'), full_page=True)
    browser.close()
print('PASS browser: separate user keys, mobile/desktop, server clock offset, live ticking, reload, expiry, permanent/revoked and admin rows')
