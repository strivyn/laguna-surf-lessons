# Rebuild the homepage reviews section from tools/reviews.py. Safe to rerun.
import html, re, sys, os
sys.path.insert(0, os.path.dirname(__file__))
import reviews as R

P = os.path.join(os.path.dirname(__file__), '..', 'laguna-backoffice', 'index.html')
s = open(P, encoding='utf-8').read()
e = lambda t: html.escape(t, quote=False)
STARS = '&#9733;&#9733;&#9733;&#9733;&#9733;'

quotes = ''.join(
    f'<blockquote class="bigq{" on" if i == 0 else ""}"><p>{e(q)}&rdquo;</p>'
    f'<cite>{STARS} &middot; {e(n)} &middot; Google review</cite></blockquote>'
    for i, (n, q) in enumerate(R.FEATURED))

cards = []
for i, (n, when, t) in enumerate(R.REVIEWS):
    paras = ''.join(f'<p>{e(x.strip())}</p>' for x in t.split('\n\n') if x.strip())
    cards.append(
        f'<article class="rcard{" more" if i >= 6 else ""}">'
        f'<p class="rcard-stars" aria-label="5 out of 5 stars">{STARS}</p>{paras}'
        f'<p class="rcard-by"><b>{e(n)}</b> &middot; {e(when)} on Google</p></article>')

section = f'''<section id="reviews">
  <div class="wrap">
    <div class="rev-head rv">
      <p class="lab" style="color:var(--rust)">Reviews</p>
      <p class="rev-meta"><b>{R.RATING} / 5</b> &middot; {R.COUNT} Google reviews &middot; no paid ones</p>
    </div>
    <div class="rev-stage rv">{quotes}</div>
    <div class="rev-idx rv">
      <button type="button" id="rv-prev" aria-label="Previous review">&#8592;</button>
      <button type="button" id="rv-next" aria-label="Next review">&#8594;</button>
      <span id="rv-n">1 / {len(R.FEATURED)}</span>
    </div>
    <h3 class="rwall-h">Every written review, word for word</h3>
    <div class="rwall" id="rwall">{''.join(cards)}</div>
    <div class="rwall-acts">
      <button type="button" class="btn btn-o" id="rwall-more" aria-controls="rwall" aria-expanded="false">Show all {len(R.REVIEWS)} reviews</button>
      <a class="btn btn-o" href="{R.GOOGLE_REVIEWS_URL}" target="_blank" rel="noopener">See them on Google</a>
      <a class="btn" href="#book">Book with Troy</a>
    </div>
  </div>
</section>'''

s = re.sub(r'<section id="reviews">.*?</section>', lambda m: section, s, count=1, flags=re.S)

css = '''
/* review wall */
.rwall-h{font-size:clamp(1.3rem,2.2vw,1.7rem); margin:clamp(48px,6vw,80px) 0 22px; letter-spacing:-.01em}
.rwall{columns:3 300px; column-gap:18px}
.rcard{break-inside:avoid; margin:0 0 18px; background:#FFF; border:1.5px solid var(--line2); border-radius:16px; padding:22px 22px 20px}
.rcard p{margin:0 0 12px; font-size:1rem; line-height:1.6; color:var(--ink)}
.rcard .rcard-stars{color:var(--rust); letter-spacing:.12em; margin-bottom:10px}
.rcard .rcard-by{margin:14px 0 0; font-size:.95rem; color:var(--ink2)}
.rwall:not(.all) .rcard.more{display:none}
.rwall-acts{display:flex; flex-wrap:wrap; gap:12px; margin-top:24px}
'''
if '/* review wall */' not in s:
    s = s.replace('.rev-idx span{', css.strip() + '\n.rev-idx span{', 1)

js = '''
  // review wall: show all
  var rw = document.getElementById('rwall'), rb = document.getElementById('rwall-more');
  if (rw && rb) rb.addEventListener('click', function(){
    var all = rw.classList.toggle('all');
    rb.setAttribute('aria-expanded', all ? 'true' : 'false');
    rb.textContent = all ? 'Show fewer' : 'Show all ' + rw.children.length + ' reviews';
    if (!all) rw.scrollIntoView({behavior:'smooth', block:'start'});
  });
'''
if 'review wall: show all' not in s:
    s = s.replace("  if (qn){ showq(0); arm(); }\n", "  if (qn){ showq(0); arm(); }\n" + js, 1)
open(P, 'w', encoding='utf-8').write(s)
print('reviews section:', len(R.FEATURED), 'quotes,', len(R.REVIEWS), 'cards')
