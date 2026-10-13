"""One-time patch: Troy's 13 Oct 2026 change list applied to laguna-backoffice/index.html."""
import json, re, html as H, pathlib, sys
sys.path.insert(0, str(pathlib.Path(__file__).parent))
from content import PRICES, FAQ, SPOTS, SMS, PHONE, SPOT_TEXT, TIMES_TEXT

P = pathlib.Path(__file__).resolve().parent.parent / 'laguna-backoffice' / 'index.html'
h = P.read_text(encoding='utf-8')
D = 'https://surfinglagunabeach.com'

def sub(a, b, count=1):
    global h
    assert a in h, ('MISSING', a[:90])
    h = h.replace(a, b, count)

def between(start, end, new, keep_end=True):
    global h
    i = h.index(start); j = h.index(end, i)
    h = h[:i] + new + (h[j:] if keep_end else h[j + len(end):])

e = lambda s: H.escape(s, quote=True)

# ---------------------------------------------------------------- head
sub('$160 private, $130 per person for groups.', f"${PRICES['private']} private, ${PRICES['pgroup']} per person for groups.")
sub('Private surf lessons in Laguna Beach at Thalia Street with Troy MacDonald', 'Private surf lessons in Laguna Beach and South Orange County with Troy MacDonald')
sub('<meta property="og:description" content="Surf lessons at Thalia Street, Laguna Beach with Troy MacDonald.', '<meta property="og:description" content="Surf lessons in Laguna Beach with Troy MacDonald.')

# ---------------------------------------------------------------- schema
s0 = h.index('<script type="application/ld+json">'); s1 = h.index('</script>', s0) + 9
g = json.loads(h[s0 + len('<script type="application/ld+json">'):s1 - 9])
for node in g['@graph']:
    t = node['@type']
    if t == ['LocalBusiness', 'SportsActivityLocation']:
        node['description'] = ('Private surf lessons and private group lessons in Laguna Beach and South Orange County, taught by Troy MacDonald, '
                               'a Laguna Beach native with over 20 years of surf instruction. Board, wetsuit and leash included.')
        node['priceRange'] = f"${PRICES['pgroup']}-${PRICES['advanced']}"
        node['openingHoursSpecification'] = [{'@type': 'OpeningHoursSpecification',
            'dayOfWeek': ['Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'], 'opens': '06:00', 'closes': '17:00'}]
        node['areaServed'] = [{'@type': 'City', 'name': n} for n in ['Laguna Beach', 'Dana Point', 'San Clemente', 'Newport Beach']] + [{'@type': 'AdministrativeArea', 'name': 'Orange County'}]
        for o in node['makesOffer']:
            if o['name'].startswith('Private surf lesson'): o['price'] = str(PRICES['private'])
            if o['name'].startswith('Advanced'): o['price'] = str(PRICES['advanced'])
    if t == 'Person':
        node['description'] = 'Laguna Beach local born into a surf family, competitive surfer and surf instructor for over 20 years. Free diver and underwater photographer.'
    if t == 'FAQPage':
        node['mainEntity'] = [{'@type': 'Question', 'name': q, 'acceptedAnswer': {'@type': 'Answer', 'text': a}} for q, a in FAQ]
    if t == 'WebPage':
        node['dateModified'] = '2026-10-13'
h = h[:s0] + '<script type="application/ld+json">' + json.dumps({'@context': 'https://schema.org', '@graph': g['@graph']}, ensure_ascii=False, indent=1) + '</script>' + h[s1:]

# ---------------------------------------------------------------- nav
sub('<a href="#where">The beach</a>', '<a href="#surf">Surf check</a>')

# ---------------------------------------------------------------- hero
sub('<p class="eyeb">Laguna Beach surf lessons &middot; Thalia Street &middot; Since 2005</p>', '<p class="eyeb">Laguna Beach surf lessons &middot; Since 2005</p>')
sub('<a class="tlink tlink-w" href="tel:+19492805818">or call Troy <span class="ar">&#8594;</span></a>',
    f'<a class="tlink tlink-w" href="{SMS}">or text Troy <span class="ar">&#8594;</span></a>')

# ---------------------------------------------------------------- surf check strip
opts = ''.join(f'<option value="{i}" data-lat="{la}" data-lon="{lo}" data-sl="{e(u)}">{e(n)}</option>' for i, (n, la, lo, u) in enumerate(SPOTS))
between('<div class="report" aria-label="Today at Thalia Street">', '<!-- ================= 95% ================= -->',
f'''<div class="report" id="surf" aria-label="Surf check">
  <div class="wrap">
    <div class="rp rp-spot"><label class="lab" for="spot-pick">Surf check</label>
      <div class="spot-sel"><select id="spot-pick">{opts}</select></div>
      <a class="rp-sl" id="rp-sl" href="{e(SPOTS[0][3])}" target="_blank" rel="noopener">Full report on Surfline <span aria-hidden="true">&#8599;</span></a></div>
    <div class="rp"><p class="lab">Swell</p><b id="rp-swell" aria-live="polite">&mdash;</b></div>
    <div class="rp"><p class="lab">Wind</p><b id="rp-wind" aria-live="polite">&mdash;</b></div>
    <div class="rp"><p class="lab">Water</p><b id="rp-water" aria-live="polite">&mdash;</b></div>
    <div class="rp"><p class="lab">Next open lesson</p><b><a class="rplink" id="rp-next" href="#book">See open times <span aria-hidden="true">&#8594;</span></a></b></div>
  </div>
</div>

''')

# ---------------------------------------------------------------- lessons
sub('<aside><p>Every lesson is ninety minutes, and every price includes the board, the wetsuit and the rash guard. No gear fee at the bottom of the stairs.</p></aside>',
    '<aside><p>Every lesson is ninety minutes and includes the board and wetsuit.</p></aside>')
sub('<span class="mp"><b class="tnum">$160</b><small>90 minutes</small></span>', f'<span class="mp"><b class="tnum">${PRICES["private"]}</b><small>90 minutes</small></span>')
sub('<span class="mp"><b class="tnum">$160</b><small>90 minutes</small></span>', f'<span class="mp"><b class="tnum">${PRICES["advanced"]}</b><small>90 minutes</small></span>')

# ---------------------------------------------------------------- booking
sub('<h2 class="disp">Pick a morning.</h2>', '<h2 class="disp">Pick a time.</h2>')
sub('<aside><p>Takes about thirty seconds. You pay when you get here, or online &mdash; whichever you prefer.</p></aside>', '')
sub('<div class="times" id="opt-time" role="group" aria-label="Choose a time"></div>',
    '<div class="times" id="opt-time" role="group" aria-label="Choose a time"></div>\n'
    f'          <p class="time-help">Don&rsquo;t see a time that works for you? <a href="{SMS}">Text Troy directly</a> at {PHONE}.</p>')
sub('<div class="row"><span>Meeting point</span><span>Thalia St stairs</span></div>', '<div class="row"><span>Meeting spot</span><span>Troy texts you</span></div>')
sub('<span class="tnum" id="s-sub">$160</span>', f'<span class="tnum" id="s-sub">${PRICES["private"]}</span>')
sub('<span class="tnum" id="s-total">$160</span>', f'<span class="tnum" id="s-total">${PRICES["private"]}</span>')
sub('<div class="row"><span>Meet</span><span>Thalia Street stairs, turn left</span></div>', '<div class="row"><span>Meet</span><span>Troy texts you the spot</span></div>')
sub('\n            <a class="btn btn-o btn-sm" href="https://maps.google.com/?q=Thalia+Street+Beach+Laguna+Beach+CA" target="_blank" rel="noopener">Directions</a>',
    f'\n            <a class="btn btn-o btn-sm" href="{SMS}">Text Troy</a>')
between('<div class="j-row"><b>Now</b><span>Confirmation email with everything above</span></div>', '          </div>\n        </div>\n        <div class="stub-logo">',
'''<div class="j-row"><b>Now</b><span>Confirmation email. Not in your inbox? Check spam</span></div>
            <div class="j-row"><b>Before</b><span>Troy texts you the spot, picked on conditions, safety and your ability</span></div>
            <div class="j-row"><b>2h after</b><span>Your photos &amp; video, if you added them</span></div>
''')
sub("$('s-note').textContent = 'Payment is the last step. In the live site Stripe handles it right here.';",
    "$('s-note').textContent = 'Once you confirm, check your email for your booking confirmation. If you don\\u2019t see it, check your spam folder.';")
sub("{k:'private',  n:'Private lesson',    d:'1-on-1 with Troy, 90 minutes',        p:160,", f"{{k:'private',  n:'Private lesson',    d:'1-on-1 with Troy, 90 minutes',        p:{PRICES['private']},")
sub("{k:'advanced', n:'Advanced coaching', d:'For surfers who already stand up',    p:160,", f"{{k:'advanced', n:'Advanced coaching', d:'For surfers who already stand up',    p:{PRICES['advanced']},")
sub("var TIMES = ['7:00 AM','9:00 AM','11:00 AM','1:00 PM','3:00 PM'];\n", "")
sub("""'We could not load the diary just now. Call Troy on ' +
          '<a href="tel:+19495550100">(949) 555-0100</a> and he will sort you out.</p>';""",
    f"""'We could not load the diary just now. <a href="{SMS}">Text Troy</a> at {PHONE} and he will sort you out.</p>';""")
sub("""'call Troy and he will find you a slot.</p>';""", f"""'<a href="{SMS}">text Troy</a> at {PHONE} and he will find you a slot.</p>';""")
sub("""        + '&location=' + encodeURIComponent('Thalia Street Beach, Laguna Beach, CA')
        + '&details=' + encodeURIComponent('Booking ' + b.ref + '. Meet at the bottom of the Thalia Street stairs, turn left. Board and wetsuit included.');""",
    f"""        + '&details=' + encodeURIComponent('Booking ' + b.ref + '. Troy texts you the spot before your lesson. Questions: text Troy at {PHONE}. Board and wetsuit included.');""")

# ---------------------------------------------------------------- gift cards
sub('<aside><p>Good for any lesson, any time of year. It arrives by email on the day you choose, and the balance stays on it until it is used &mdash; nothing expires in a drawer.</p></aside>',
    '<aside><p>It arrives by email on the day you choose, and the balance stays on it until it is used.</p></aside>')
sub('placeholder="Happy birthday. See you at the stairs."', 'placeholder="Happy birthday. See you in the water."')
sub('<span class="gcard-foot">Good for any lesson &middot; Thalia Street</span>', '<span class="gcard-foot">Good for any lesson &middot; Laguna Surf Lessons</span>')
for a in ['<span class="gcard-amt tnum" id="gc-face">$160</span>', '<span class="tnum" id="s-gc-amt">$160</span>', '<span class="tnum" id="s-gc-total">$160</span>']:
    sub(a, a.replace('$160', f'${PRICES["private"]}'))
p1 = PRICES['private']
sub("{v:160, n:'One private lesson',", f"{{v:{p1}, n:'One private lesson',")
sub("{v:320, n:'Two private lessons',", f"{{v:{p1*2}, n:'Two private lessons',")
sub("{v:480, n:'Three private lessons',", f"{{v:{p1*3}, n:'Three private lessons',")
sub("var state = {amount:160, custom:0};", f"var state = {{amount:{p1}, custom:0}};")
between('<div class="j-row"><b>Now</b><span>Receipt to you, with the code and a printable card</span></div>', '          </div>\n        </div>\n      </aside>',
'''<div class="j-row"><b>Now</b><span>Troy texts you to take payment</span></div>
            <div class="j-row"><b>On the day</b><span>The card goes to them with your message</span></div>
            <div class="j-row"><b>When they book</b><span>Code comes off the total at checkout</span></div>
''')

# ---------------------------------------------------------------- Troy, in his own words (from lagunasurflessons.com/about)
between('<p class="pull">&ldquo;He will not put you anywhere <em>you should not be.</em>&rdquo;</p>', '      <div class="cred">',
'''<p class="lead" style="margin-top:26px">I am a Laguna Beach local, born into a surf family. My father had me on a surfboard at the age of 3. The ocean has always been a huge part of my life, and I have a deep connection and respect for it. I began competing at a young age, winning numerous surf contests and riding for multiple sponsors who recognized my passion and dedication to the sport.</p>
      <p class="lead" style="margin-top:14px">I spent my summers working with local surfing companies and camps, teaching people of all ages and skill levels. With over 20 years of surf instruction experience, my goal is to make your surf lesson both fun and safe, leaving you excited to do it again. When you learn to surf with me, you get guidance from a lifelong surfer who not only knows how to surf but knows how to teach it.</p>
      <p class="lead" style="margin-top:14px">I&rsquo;m just as passionate about what lies beneath the waves as I am about riding them. As a free diver and underwater photographer, I love capturing marine life through my lens. <a href="https://www.youtube.com/@TroyMacDonald" target="_blank" rel="noopener">See my work on YouTube</a>.</p>
      <p class="troy-sig">Troy MacDonald, owner and instructor</p>
''')
sub('<div><b>20+ years</b><span>Teaching Thalia Street</span></div>', '<div><b>20+ years</b><span>Teaching surf</span></div>')

# ---------------------------------------------------------------- remove Where we meet
i = h.index('<section id="where"'); j = h.index('</section>', i) + len('</section>')
k = h.rfind('<!--', 0, i)
if k != -1 and i - k < 120: i = k
h = h[:i] + h[j:]

# ---------------------------------------------------------------- FAQ
f0 = h.index('<div class="faq-grid">'); f1 = h.index('</div>\n  </div>\n</section>\n</main>', f0)
def qa(q, a): return f'<details class="qa"><summary><h3>{e(q)}</h3></summary><p>{e(a)}</p></details>'
half = (len(FAQ) + 1) // 2
h = h[:f0] + '<div class="faq-grid">\n      <div>' + ''.join(qa(q, a) for q, a in FAQ[:half]) + '</div>\n      <div>' + ''.join(qa(q, a) for q, a in FAQ[half:]) + '</div>\n    ' + h[f1:]

# ---------------------------------------------------------------- mobile bar + footer
sub('<a class="btn btn-o btn-sm" href="tel:+19492805818">Call Troy</a>', f'<a class="btn btn-o btn-sm" href="{SMS}">Text Troy</a>')
sub('<p>Surf lessons at Thalia Street, taught by the guy who grew up on it.</p>', '<p>Surf lessons in Laguna Beach and South Orange County, taught by the guy who grew up here.</p>')
sub('<li><a href="tel:+19492805818">949-280-5818</a></li>', f'<li><a href="{SMS}">Text Troy, {PHONE}</a></li>')
sub('<li>Thalia Street Beach<br>Laguna Beach, CA 92651</li>', '<li>Laguna Beach, CA 92651</li>')
sub('<li>Lessons from 7am, closed Tuesdays</li>', '<li>Lessons 6 AM to 5 PM, closed Mondays</li>')
if '<li><a href="/thalia-street-beach">Where we meet</a></li>' in h:
    sub('<li><a href="/thalia-street-beach">Where we meet</a></li>', '<li><a href="#surf">Surf check</a></li>')

# ---------------------------------------------------------------- live surf check script
s0 = h.index("<script>\n(function(){\n  function ft(m){return Math.round(m*3.28084*2)/2}")
s1 = h.index('</script>', s0) + 9
h = h[:s0] + '''<script>
(function(){
  var sel = document.getElementById('spot-pick'); if (!sel) return;
  var DIRS = ['N','NNE','NE','ENE','E','ESE','SE','SSE','S','SSW','SW','WSW','W','WNW','NW','NNW'];
  function dir(d){ return d == null ? '' : DIRS[Math.round(d / 22.5) % 16]; }
  function ft(m){ return Math.round(m * 3.28084 * 2) / 2; }
  function set(id, t){ var el = document.getElementById(id); if (el) el.textContent = t; }
  var KEY = 'lsl-spot', n = 0;
  function load(){
    var o = sel.options[sel.selectedIndex], la = o.getAttribute('data-lat'), lo = o.getAttribute('data-lon'), mine = ++n;
    document.getElementById('rp-sl').href = o.getAttribute('data-sl');
    set('rp-swell', '...'); set('rp-wind', '...'); set('rp-water', '...');
    fetch('https://marine-api.open-meteo.com/v1/marine?latitude=' + la + '&longitude=' + lo +
      '&current=swell_wave_height,swell_wave_period,swell_wave_direction,sea_surface_temperature&timezone=America%2FLos_Angeles')
      .then(function(r){ return r.json(); }).then(function(d){
        if (mine !== n) return; var c = d && d.current; if (!c) throw 0;
        set('rp-swell', c.swell_wave_height == null ? 'n/a' : ft(c.swell_wave_height) + ' ft ' + Math.round(c.swell_wave_period) + 's ' + dir(c.swell_wave_direction));
        set('rp-water', c.sea_surface_temperature == null ? 'n/a' : Math.round(c.sea_surface_temperature * 9 / 5 + 32) + '\\u00B0F');
      }).catch(function(){ if (mine === n){ set('rp-swell', 'n/a'); set('rp-water', 'n/a'); } });
    fetch('https://api.open-meteo.com/v1/forecast?latitude=' + la + '&longitude=' + lo +
      '&current=wind_speed_10m,wind_direction_10m&wind_speed_unit=mph&timezone=America%2FLos_Angeles')
      .then(function(r){ return r.json(); }).then(function(d){
        if (mine !== n) return; var c = d && d.current; if (!c) throw 0;
        set('rp-wind', Math.round(c.wind_speed_10m) + ' mph ' + dir(c.wind_direction_10m));
      }).catch(function(){ if (mine === n) set('rp-wind', 'n/a'); });
  }
  try { var saved = localStorage.getItem(KEY); if (saved && sel.options[+saved]) sel.selectedIndex = +saved; } catch (e) {}
  sel.addEventListener('change', function(){ try { localStorage.setItem(KEY, sel.selectedIndex); } catch (e) {} load(); });
  load();
  fetch('/api/availability', {headers:{'Accept':'application/json'}}).then(function(r){ return r.json(); }).then(function(d){
    var days = (d && d.days) || [], now = new Date();
    for (var i = 0; i < days.length; i++){
      var s = (days[i].slots || []).filter(function(x){ return x.open; })[0];
      if (s){
        var dt = new Date(s.startsAt), t = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1);
        var lab = dt.toDateString() === now.toDateString() ? 'Today' : dt.toDateString() === t.toDateString() ? 'Tomorrow' :
          dt.toLocaleDateString('en-US', {weekday:'short', month:'short', day:'numeric', timeZone:'America/Los_Angeles'});
        document.getElementById('rp-next').innerHTML = lab + ' &middot; ' + s.time + ' <span aria-hidden="true">&#8594;</span>';
        return;
      }
    }
  }).catch(function(){});
})();
</script>''' + h[s1:]

# ---------------------------------------------------------------- CSS
css = '''
/* ---------- 13 Oct 2026: surf check, FAQ accordion, mobile hero ---------- */
.rp-spot{display:flex; flex-direction:column; gap:6px}
.spot-sel{position:relative; margin-top:2px}
.spot-sel select{appearance:none; -webkit-appearance:none; width:100%; background:transparent; border:0;
  border-bottom:2px solid var(--sun); border-radius:0; padding:4px 26px 6px 0; color:var(--ink); cursor:pointer;
  font-family:var(--f-lab); font-weight:700; font-size:1.06rem; letter-spacing:.04em; text-transform:uppercase}
.spot-sel::after{content:""; position:absolute; right:4px; top:42%; width:8px; height:8px;
  border-right:2px solid var(--ink); border-bottom:2px solid var(--ink); transform:translateY(-50%) rotate(45deg); pointer-events:none}
.spot-sel select:focus-visible{outline:2px solid var(--rust); outline-offset:3px}
.rp-sl{font-size:.82rem; font-weight:600; color:var(--ink2); text-decoration:none}
.rp-sl:hover{color:var(--rust); text-decoration:underline; text-underline-offset:3px}
.report .rp b{text-transform:none}
@media (max-width:900px){
  .report .wrap{grid-template-columns:1fr 1fr}
  .report .rp.rp-spot{grid-column:1/-1; border-right:0; padding-left:0}
  .report .rp:last-child{grid-column:auto}
}
.time-help{margin:14px 0 0; font-size:.95rem; color:var(--ink2)}
.time-help a{color:var(--ember-ink); font-weight:600}
.troy-sig{margin:16px 0 0; font-family:var(--f-lab); font-weight:700; letter-spacing:.14em; text-transform:uppercase; font-size:.8rem; color:var(--ink2)}
#troy .lead a{color:var(--ember-ink); font-weight:600}
details.qa{padding:0; border-bottom:1px solid var(--line)}
details.qa summary{list-style:none; cursor:pointer; display:flex; align-items:center; justify-content:space-between; gap:18px; padding:20px 0}
details.qa summary::-webkit-details-marker{display:none}
details.qa summary::after{content:"+"; font:600 1.4rem/1 var(--f-body); color:var(--rust); flex:0 0 auto; transition:transform .25s}
details.qa[open] summary::after{transform:rotate(45deg)}
details.qa summary:focus-visible{outline:2px solid var(--rust); outline-offset:3px}
details.qa p{margin:0 0 22px}
@media (max-width:700px){
  .cine{height:auto; min-height:0; display:flex; flex-direction:column; background:#0B2227}
  .cine picture{display:block; position:relative; height:min(56svh,470px); flex:0 0 auto; overflow:hidden}
  .cine picture img{position:absolute; inset:0; object-position:62% 16%}
  .cine-scrim{inset:auto 0 auto 0; top:0; height:min(56svh,470px);
    background:linear-gradient(to top, #0B2227 0%, rgba(11,34,39,0) 34%)}
  .cine-in{position:relative; inset:auto; margin-top:-48px; padding:0 20px 30px}
}
'''
sub('</style>', css + '</style>')
P.write_text(h, encoding='utf-8')
print('patched', len(h))
