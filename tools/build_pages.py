"""Builds the service pages for surfinglagunabeach.com from laguna-backoffice/index.html.

Run from the repo root:  python3 tools/build_pages.py
Shares the homepage's CSS (written to /site.css), header and footer, so the pages
stay on brand. Every fact here must match lib/availability.js and the homepage.
"""
import json, re, html as H, pathlib
ROOT = pathlib.Path(__file__).resolve().parent.parent / 'laguna-backoffice'
D = 'https://surfinglagunabeach.com'
src = (ROOT / 'index.html').read_text(encoding='utf-8')

css = re.search(r'<style>(.*?)</style>', src, re.S).group(1)
css += '''
/* ---------- service pages ---------- */
.sp-hero{padding:132px 0 56px}
.sp-grid{display:grid; grid-template-columns:minmax(0,1.05fr) minmax(0,.95fr); gap:clamp(28px,5vw,72px); align-items:center}
.sp-grid h1{font-family:var(--f-dis); font-weight:400; letter-spacing:-.025em; line-height:.98; font-size:clamp(2.4rem,5.6vw,4.6rem); margin:14px 0 0; text-wrap:balance}
.sp-price{display:flex; flex-wrap:wrap; gap:10px 26px; margin:26px 0 0; padding:0; list-style:none}
.sp-price li{display:grid; gap:2px}
.sp-price b{font:400 1.7rem/1 var(--f-dis)}
.sp-price span{font:600 .8rem/1.2 var(--f-lab); letter-spacing:.16em; text-transform:uppercase; color:var(--ink2)}
.sp-cta{display:flex; flex-wrap:wrap; align-items:center; gap:16px 24px; margin-top:30px}
.sp-photo{border-radius:18px; overflow:hidden; aspect-ratio:4/3; max-width:100%}
.sp-photo img{width:100%; height:100%; object-fit:cover; display:block}
.sp-body{border-top:1px solid var(--line); padding:56px 0 72px}
.sp-cols{display:grid; grid-template-columns:minmax(0,1fr) minmax(0,1fr); gap:44px clamp(28px,5vw,72px)}
.sp-sec h2{font-family:var(--f-dis); font-weight:400; font-size:clamp(1.5rem,2.6vw,2rem); letter-spacing:-.015em; line-height:1.08; margin:10px 0 14px; text-wrap:balance}
.sp-sec p{margin:0 0 12px; color:var(--ink2); max-width:62ch}
.sp-sec ul{margin:0; padding-left:1.15em; color:var(--ink2); display:grid; gap:6px}
.sp-dl{margin:0; border-top:1px solid var(--line)}
.sp-dl div{display:grid; grid-template-columns:140px minmax(0,1fr); gap:16px; padding:13px 0; border-bottom:1px solid var(--line)}
.sp-dl dt{font:600 .8rem/1.5 var(--f-lab); letter-spacing:.16em; text-transform:uppercase; color:var(--ink2)}
.sp-dl dd{margin:0}
.sp-q{border-top:1px solid var(--line); padding:18px 0}
.sp-q h3{font-size:1.06rem; font-weight:600; margin:0 0 6px}
.sp-q p{margin:0; color:var(--ink2)}
.sp-band{background:var(--ink); color:#fff; padding:56px 0}
.sp-band .wrap{display:flex; flex-wrap:wrap; align-items:center; justify-content:space-between; gap:22px}
.sp-band h2{font-family:var(--f-dis); font-weight:400; font-size:clamp(1.7rem,3.4vw,2.6rem); line-height:1.02; margin:0; max-width:20ch}
.sp-band .tlink{color:#fff} .sp-band .tlink::after{background:#fff}
.crumbs{font:600 .8rem/1.4 var(--f-lab); letter-spacing:.16em; text-transform:uppercase; color:var(--ink2)}
.crumbs a{text-decoration:none} .crumbs a:hover{text-decoration:underline}
.sp-more{display:flex; flex-wrap:wrap; gap:10px 22px; margin-top:12px}
.sp-cols>div{align-content:start}
.sp-hero .lab,.sp-body .lab{font-size:.8rem}
@media (max-width:860px){.sp-grid,.sp-cols{grid-template-columns:minmax(0,1fr)} .sp-hero{padding-top:108px}}
@media (max-width:520px){.sp-dl div{grid-template-columns:minmax(0,1fr); gap:2px}}
'''
(ROOT / 'site.css').write_text(css, encoding='utf-8')

head_fonts = re.findall(r'<link rel="preload" as="font"[^>]+>', src)
header = re.search(r'<header id="hd">.*?</header>', src, re.S).group(0)
footer = re.search(r'<footer>.*?</footer>', src, re.S).group(0)
for a, b in [('href="#top"', 'href="/"'), ('href="#', 'href="/#')]:
    header = header.replace(a, b)
footer = footer.replace('href="#', 'href="/#')
# footer links point at the real pages now
for old, new in [('<li><a href="/#lessons">Private lesson</a></li>', '<li><a href="/private-surf-lessons">Private lesson</a></li>'),
                 ('<li><a href="/#lessons">Private group</a></li>', '<li><a href="/group-surf-lessons">Private group</a></li>'),
                 ('<li><a href="/#gift">Gift cards</a></li>', '<li><a href="/surf-lesson-gift-cards">Gift cards</a></li>'),
                 ('<li><a href="/#lessons">Advanced coaching</a></li>', '<li><a href="/advanced-surf-coaching">Advanced coaching</a></li><li><a href="/kids-surf-lessons">Kids surf lessons</a></li>'),
                 ('<li><a href="/thalia-street-beach">Where we meet</a></li>', '<li><a href="/#surf">Surf check</a></li>')]:
    footer = footer.replace(old, new)

import sys; sys.path.insert(0, str(pathlib.Path(__file__).parent))
from content import PRICES, SMS, PHONE, SPOT_TEXT
TIMES = '6:00, 8:00 and 10:00 AM, 12:00, 2:00 and 3:30 PM, every day except Monday. Book at least 24 hours ahead.'
MEET = 'Troy picks the spot based on the conditions, safety and your ability, and texts you where to meet.'
BRING = 'A towel, sunscreen and a swimsuit or board shorts to wear under the wetsuit.'
INSTR = 'Most lessons are taught by Troy. When he is booked up, he may send one of his trusted instructors, and he will let you know before your lesson.'
CANCEL = "Full refund with 24 hours' notice, or if Troy calls it off for conditions. Free reschedule with 12 hours' notice."
REVIEWS = {
 'phil': ("I came in with absolutely zero surfing experience, but Troy had me standing up and riding waves in my very first lesson—mind-blowing.", 'Phil D.'),
 'jeff': ("Laguna Surf Lessons with Troy is a real 10/10! Troy was great with my son…", 'Jeff'),
 'max':  ("Troy was awesome—he had both our kids up and surfing way faster than we ever expected!", 'Maximiliano A.'),
}

PAGES = [
 dict(slug='private-surf-lessons', nav='Private lesson', pick='private', offer=PRICES['private'],
  title=f'Private Surf Lessons in Laguna Beach | ${PRICES["private"]} | Laguna Surf Lessons',
  desc=f'One-on-one private surf lessons in Laguna Beach from Troy MacDonald\u2019s surf school. 90 minutes, ${PRICES["private"]}, board and wetsuit included. Ages 5 and up. Book online.',
  eyebrow='Private lesson · Laguna Beach', h1='Private surf lessons in Laguna Beach.',
  intro='Ninety minutes, one-on-one, from the surf school Troy MacDonald has run in Laguna Beach for over twenty years. The fastest way to stand up: about 95% of his students do it in their first lesson.',
  price=[(f'${PRICES["private"]}','90 minutes'),('1 surfer','Just you and your instructor'),('Included','Board, wetsuit, leash')],
  img=('/img/3c1a48fe69.jpg','Troy MacDonald coaching a student through the pop-up on the sand'),
  review='phil',
  secs=[('How the lesson runs',['Troy texts you the spot, picked on the conditions, safety and your ability. You suit up and start on the sand with the pop-up, then you are in the water with your instructor beside you.','They pick the wave, times the push and tells you the one thing to think about.']),
        ('Who it is for',['First-timers who want to stand up today, nervous swimmers who want one instructor watching only them, and anyone who wants to learn faster than a group allows.','Ages five and up. You should be comfortable in water over your head.'])],
  facts=[('Price',f'${PRICES["private"]} for 90 minutes'),('Times',TIMES),('Meet',MEET),('Instructor',INSTR),('Bring',BRING),('Add-ons','Photo and video package $45. GoPro on the board $25.'),('Cancellation',CANCEL)],
  faq=[('How much is a private surf lesson in Laguna Beach?',f'A 90-minute private lesson is ${PRICES["private"]}, with the board, wetsuit and leash included.'),
       ('Will I stand up in my first private lesson?','About 95% of Troy\'s students stand up in their first lesson.'),
       ('How old do you have to be for a private surf lesson?','Five and up. There is no upper age limit.')]),
 dict(slug='group-surf-lessons', nav='Private group', pick='pgroup', offer=PRICES['pgroup'],
  title='Group Surf Lessons in Laguna Beach | Private Groups of 2 to 5',
  desc='Private group surf lessons in Laguna Beach: your own group of 2 to 5, $130 per person, 90 minutes from Troy MacDonald\u2019s surf school. Families, friends, birthdays.',
  eyebrow='Private group · Laguna Beach', h1='Group surf lessons for just your people.',
  intro='Bring 2 to 5 friends or family and have an instructor to yourselves for ninety minutes. Nobody outside your group is in the lesson.',
  price=[('$130','Per person'),('2 to 5','Surfers'),('Included','Board, wetsuit, leash')],
  img=('/img/5a78b436d2.jpg','Three surfers holding soft-top boards on the sand after a lesson'),
  review='max',
  secs=[('Good for',['Families, couples, friends visiting Laguna, birthday groups and teams. Everyone learns together and nobody waits behind strangers.','Ages seven and up for a private group. Everyone should be comfortable in water over their head.']),
        ('What you get',['Ninety minutes with your instructor, a board and wetsuit for each surfer, and a lesson paced to your group.','Add a photo and video package for $45 and the whole group gets a gallery link a couple of hours after.'])],
  facts=[('Price','$130 per person, 2 to 5 people'),('Times',TIMES),('Meet',MEET),('Instructor',INSTR),('Bring',BRING),('Cancellation',CANCEL)],
  faq=[('How much are group surf lessons in Laguna Beach?','A private group lesson is $130 per person for 2 to 5 people, 90 minutes, board and wetsuit included.'),
       ('Will there be other people in our group lesson?','No. A private group is only the people you book.'),
       ('What is the minimum age for a group surf lesson?','Seven and up for a private group.')]),
 dict(slug='kids-surf-lessons', nav='Kids', pick='private',
  title='Kids Surf Lessons in Laguna Beach | Ages 5 and Up',
  desc='Surf lessons for kids in Laguna Beach from Troy MacDonald\u2019s surf school. Private lessons from age 5, private groups from age 7. Board and wetsuit included.',
  eyebrow='Kids · Laguna Beach', h1='Surf lessons for kids in Laguna Beach.',
  intro='Private lessons from age five, private groups from age seven. An instructor is in the water beside your child the whole time.',
  price=[(f'${PRICES["private"]}','Private, age 5+'),('$130','Per child in a group, age 7+'),('Included','Board, wetsuit, leash')],
  img=('/img/98e99e4458.jpg','A student stepping onto a surfboard on the sand while Troy MacDonald watches'),
  review='max',
  secs=[('Before you book',['Your child should be comfortable in water over their head. They do not need to be a strong swimmer.','A parent or legal guardian signs the waiver for anyone under 18 when you book.']),
        ('Siblings and friends',['Booking two to five kids together? A private group is $130 per child, ages seven and up, with nobody else in the lesson.'])],
  facts=[('Ages','5+ private, 7+ private group'),('Times',TIMES),('Meet',MEET),('Instructor',INSTR),('Bring',BRING),('Cancellation',CANCEL)],
  faq=[('What age can kids start surf lessons in Laguna Beach?','We teach private lessons from age five and private groups from age seven.'),
       ('Does my child need to be a strong swimmer?','No, but they should be comfortable in water over their head.'),
       ('Who signs the waiver for a child?','A parent or legal guardian signs it when you book.')]),
 dict(slug='advanced-surf-coaching', nav='Advanced', pick='advanced', offer=PRICES['advanced'],
  title='Advanced Surf Coaching in Laguna Beach | Laguna Surf Lessons',
  desc=f'Advanced surf coaching in Laguna Beach for surfers who already stand up. 90 minutes, ${PRICES["advanced"]}, from Troy MacDonald\u2019s surf school. Book online.',
  eyebrow='Advanced coaching · Laguna Beach', h1='Advanced surf coaching in Laguna Beach.',
  intro='Already standing up and stuck? Ninety minutes of coaching, filmed from the sand, and told the one thing that is holding you back.',
  price=[(f'${PRICES["advanced"]}','90 minutes'),('1 surfer','Coaching for you'),('Video','Filmed from the sand')],
  img=('/img/878571e34a.jpg','A surfer riding a wave in Laguna Beach'),
  review='phil',
  secs=[('Who it is for',['Surfers who can already catch and stand on a wave and want specific feedback on what to fix next.']),
        ('Add the footage',['Add the photo and video package for $45, or a GoPro on the board for $25, and take the session home.'])],
  facts=[('Price',f'${PRICES["advanced"]} for 90 minutes'),('Times',TIMES),('Meet',MEET),('Instructor',INSTR),('Cancellation',CANCEL)],
  faq=[('How much is advanced surf coaching in Laguna Beach?',f'A 90-minute advanced coaching session is ${PRICES["advanced"]}.'),
       ('Do I need my own board for advanced coaching?','No. A board, wetsuit and leash are included.')]),
 dict(slug='surf-lesson-gift-cards', nav='Gift cards', pick=None,
  title='Surf Lesson Gift Cards | Laguna Beach Surf Lessons',
  desc='Give a surf lesson in Laguna Beach. Gift cards from $50 to $1,000, emailed on the day you choose, good for any Laguna Surf Lessons lesson.',
  eyebrow='Gift cards', h1='Give someone their first wave.',
  intro='A Laguna Surf Lessons gift card is good for any lesson. Pick any amount from $50 to $1,000 and choose the day it goes to them.',
  price=[('$50 to $1,000','Any amount'),('Email','On the day you choose'),('Any lesson','Private, group or advanced')],
  img=('/img/3dba4c54b6.jpg','Two students holding surfboards on the beach'),
  review='jeff',
  secs=[('How it works',['Choose the amount, add their name, email and a message, and pick the delivery date. Pay by card and the code comes straight to your email.','They enter the code when they book and it comes off the total.']),
        ('What it covers',[f'A private lesson is ${PRICES["private"]}. A private group is ${PRICES["pgroup"]} per person. Advanced coaching is ${PRICES["advanced"]}. Add-ons too.'])],
  facts=[('Amount','$50 to $1,000'),('Delivery','On the date you pick'),('Use','Any lesson or add-on')],
  faq=[('How much should a surf lesson gift card be?',f'A private lesson is ${PRICES["private"]} and a private group lesson is ${PRICES["pgroup"]} per person, so ${PRICES["private"]} covers one private lesson.'),
       ('Can I schedule the gift card email for a birthday?','Yes. You choose the day it is delivered.')])
]

def esc(s): return H.escape(s, quote=True)

def page(p):
    url = f'{D}/{p["slug"]}'
    book = f'/#book-{p["pick"]}' if p['pick'] else '/#gift'
    cta = 'Buy a gift card' if not p['pick'] else ('Book this lesson' if p['slug'] not in ('thalia-street-beach','kids-surf-lessons') else 'Book a lesson')
    q, who = REVIEWS[p['review']]
    graph = [
      {'@type':'BreadcrumbList','itemListElement':[{'@type':'ListItem','position':1,'name':'Laguna Surf Lessons','item':D+'/'},{'@type':'ListItem','position':2,'name':p['nav'],'item':url}]},
      {'@type':'WebPage','@id':url+'#webpage','url':url,'name':p['title'],'description':p['desc'],'isPartOf':{'@id':D+'/#website'},'about':{'@id':D+'/#business'},'dateModified':'2026-10-13','primaryImageOfPage':D+p['img'][0]},
      {'@type':'FAQPage','@id':url+'#faq','mainEntity':[{'@type':'Question','name':a,'acceptedAnswer':{'@type':'Answer','text':b}} for a,b in p['faq']]},
    ]
    if p['slug'] not in ('thalia-street-beach',):
        graph.append({'@type':'Service','name':p['h1'].rstrip('.'),'serviceType':'Surf lesson' if p['pick'] else 'Gift card','areaServed':{'@type':'City','name':'Laguna Beach'},
                      'provider':{'@type':'LocalBusiness','@id':D+'/#business','name':'Laguna Surf Lessons','telephone':'+1-949-280-5818','url':D+'/'},'url':url,
                      **({'offers':{'@type':'Offer','price':str(p['offer']),'priceCurrency':'USD'}} if p.get('offer') else {})})
    ld = json.dumps({'@context':'https://schema.org','@graph':graph}, ensure_ascii=False)
    more = ''.join(f'<a class="tlink" href="/{o["slug"]}">{esc(o["nav"])} <span class="ar">&#8594;</span></a>' for o in PAGES if o is not p)
    secs = ''.join(f'<div class="sp-sec"><p class="lab">{esc(h)}</p>' + ''.join(f'<p>{esc(t)}</p>' for t in ps) + '</div>' for h, ps in p['secs'])
    facts = ''.join(f'<div><dt>{esc(a)}</dt><dd>{esc(b)}</dd></div>' for a, b in p['facts'])
    faqs = ''.join(f'<div class="sp-q"><h3>{esc(a)}</h3><p>{esc(b)}</p></div>' for a, b in p['faq'])
    price = ''.join(f'<li><b>{esc(a)}</b><span>{esc(b)}</span></li>' for a, b in p['price'])
    return f'''<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>{esc(p["title"])}</title>
<meta name="description" content="{esc(p["desc"])}">
<link rel="canonical" href="{url}">
<meta name="robots" content="index, follow, max-image-preview:large">
<meta name="theme-color" content="#3E3330">
<meta property="og:type" content="website"><meta property="og:url" content="{url}"><meta property="og:site_name" content="Laguna Surf Lessons">
<meta property="og:title" content="{esc(p["title"])}"><meta property="og:description" content="{esc(p["desc"])}">
<meta property="og:image" content="{D}{p["img"][0]}"><meta name="twitter:card" content="summary_large_image">
<link rel="icon" href="/favicon.png" type="image/png"><link rel="apple-touch-icon" href="/apple-touch-icon.png">
{chr(10).join(head_fonts)}
<link rel="stylesheet" href="/site.css">
<script type="application/ld+json">{ld}</script>
</head>
<body>
<a class="skip" href="#main">Skip to content</a>
{header}
<main id="main">
<section class="sp-hero"><div class="wrap sp-grid">
  <div>
    <p class="crumbs" style="margin:0"><a href="/">Laguna Surf Lessons</a> / {esc(p["nav"])}</p>
    <p class="lab" style="margin-top:18px;color:var(--rust)">{esc(p["eyebrow"])}</p>
    <h1>{esc(p["h1"])}</h1>
    <p class="lead" style="margin-top:20px">{esc(p["intro"])}</p>
    <ul class="sp-price">{price}</ul>
    <div class="sp-cta"><a class="btn" href="{book}">{cta} <span class="ar">&#8594;</span></a><a class="tlink" href="{SMS}">or text Troy, {PHONE} <span class="ar">&#8594;</span></a></div>
  </div>
  <figure class="sp-photo" style="margin:0"><img src="{p["img"][0]}" alt="{esc(p["img"][1])}" width="1050" height="700" fetchpriority="high"></figure>
</div></section>
<section class="sp-body"><div class="wrap sp-cols">
  <div style="display:grid;gap:34px">{secs}
    <blockquote style="margin:0;border-left:3px solid var(--sun);padding:4px 0 4px 18px"><p style="margin:0;font-size:1.15rem;font-weight:600;line-height:1.45">&ldquo;{esc(q)}&rdquo;</p><p class="lab" style="margin-top:10px">&#9733;&#9733;&#9733;&#9733;&#9733; &middot; {esc(who)} &middot; Google review &middot; 4.9 from 38 reviews</p></blockquote>
  </div>
  <div style="display:grid;gap:34px">
    <div class="sp-sec"><p class="lab">The details</p><dl class="sp-dl">{facts}</dl></div>
    <div class="sp-sec"><p class="lab">Questions</p>{faqs}</div>
  </div>
</div></section>
<section class="sp-band"><div class="wrap">
  <h2>Pick a time. Your board will be ready.</h2>
  <div class="sp-cta" style="margin:0"><a class="btn" href="{book}">{cta} <span class="ar">&#8594;</span></a><a class="tlink" href="{SMS}">Text Troy, {PHONE}</a></div>
</div></section>
<section class="sp-body" style="padding:40px 0 56px"><div class="wrap"><p class="lab">More from Laguna Surf Lessons</p><div class="sp-more">{more}</div></div></section>
</main>
<div class="mob-bar">
  <a class="btn btn-o btn-sm" href="{SMS}">Text Troy</a>
  <a class="btn btn-sm" href="{book}">{cta}</a>
</div>
{footer}
<script>(function(){{var h=document.getElementById('hd');if(!h)return;function s(){{h.classList.toggle('sc',scrollY>8)}}addEventListener('scroll',s,{{passive:true}});s();}})();</script>
</body>
</html>
'''

for p in PAGES:
    (ROOT / f'{p["slug"]}.html').write_text(page(p), encoding='utf-8')

# homepage footer gets the same real links
idx = src
f0, f1 = idx.index('<footer>'), idx.index('</footer>') + 9
home_footer = footer.replace('href="/#', 'href="#')
idx = idx[:f0] + home_footer + idx[f1:]
(ROOT / 'index.html').write_text(idx, encoding='utf-8')

sm = ['<?xml version="1.0" encoding="UTF-8"?>','<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9" xmlns:image="http://www.google.com/schemas/sitemap-image/1.1">',
      f'  <url><loc>{D}/</loc><lastmod>2026-10-13</lastmod><image:image><image:loc>{D}/og.jpg</image:loc></image:image></url>']
sm += [f'  <url><loc>{D}/{p["slug"]}</loc><lastmod>2026-10-13</lastmod><image:image><image:loc>{D}{p["img"][0]}</image:loc></image:image></url>' for p in PAGES]
sm.append('</urlset>')
(ROOT / 'sitemap.xml').write_text('\n'.join(sm) + '\n', encoding='utf-8')
print('built', [p['slug'] for p in PAGES])
