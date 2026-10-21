"""Shared facts for the homepage, service pages and llms.txt.

Change a price, a time or an answer here, then run tools/apply_home.py (once)
and tools/build_pages.py. Must match lib/availability.js.
"""
PRICES = {'private': 170, 'pgroup': 130, 'advanced': 180}
TIMES_TEXT = '6:00, 8:00 and 10:00 AM, 12:00, 2:00 and 3:30 PM'
DAYS_TEXT = 'every day except Monday'
SMS = 'sms:+19492805818'
PHONE = '949-280-5818'
SPOT_TEXT = ('Troy picks the spot for each lesson based on the conditions, safety and your ability, '
             'and texts you where to meet before your lesson.')

FAQ = [
 ("How much are surf lessons?",
  f"A private one-on-one lesson is ${PRICES['private']}. A private group lesson is ${PRICES['pgroup']} per person for 2 to 5 people. "
  f"Advanced coaching is ${PRICES['advanced']}. Every lesson is 90 minutes and includes a premium surfboard, wetsuit and leash. "
  "For coaching packages, birthday parties or corporate and team events, text Troy."),
 ("When can I book a lesson?",
  f"Lessons run {DAYS_TEXT}, 6 AM to 5 PM, conditions permitting. Lessons start at {TIMES_TEXT}. "
  f"Book at least 24 hours ahead. Don't see a time that works? Text Troy at {PHONE}."),
 ("I've never been surfing. Is that a problem?",
  "Sharing the joy of surfing with a first-time surfer is one of our favorite things to do! We are with you every step of the way, "
  "creating a fun, positive and memorable surfing experience."),
 ("Is surfing still an option for me, despite my age?",
  "We welcome students of all ages! Our private one-on-one lessons are great for kids as young as 5 to adults in their 70s. "
  "Private group lessons are perfect for ages 7 and up, provided they are competent swimmers."),
 ("What if I'm not a strong swimmer or I'm afraid of the ocean?",
  "Surf lessons are still an option. We love helping people overcome a fear of the ocean. Our goal is for you to feel safe, "
  "have fun and turn that fear into a love for the ocean."),
 ("What happens in my first lesson?",
  "Before hitting the water, we start with land demonstrations on reading waves and ocean conditions, standing up, board handling, "
  "ocean safety and surf etiquette. Then we move to the water and put those skills into practice."),
 ("Will I actually stand up?", "About 95% of Troy's students stand up in their first lesson."),
 ("Will Troy be my instructor?", "Most lessons are taught by Troy. When he is booked up, he may send one of his trusted instructors, and he will let you know before your lesson."),
 ("Where do we meet?", SPOT_TEXT),
 ("How early should I arrive?",
  "Allow time to find parking, especially in summer. We recommend arriving 15 minutes before your lesson."),
 ("What equipment is provided?",
  "Your lesson includes a premium surfboard, wetsuit and leash. Your equipment will be waiting for you at the beach."),
 ("What should I bring?",
  "Bring what you would bring for a day at the beach: a bottle of water, a bathing suit, sunscreen and a towel."),
 ("Do I need to sign a waiver?",
  "Yes. You sign it online when you book, and it must be signed before your lesson starts."),
 ("What payment methods do you accept?",
  "Credit and debit cards, Apple Pay, Zelle and Venmo. If you'd rather book by text, you can pay with Zelle or Venmo."),
 ("How do I tip my instructor?", "Tips can be given by Zelle, Venmo or cash."),
 ("When can I get a full refund?",
  "If you ask for a refund 24 or more hours before your lesson, or if the lesson is cancelled because of conditions, you get a full refund."),
 ("What if I need to reschedule?",
  "You can reschedule free of charge if you let Troy know at least 12 hours before your lesson."),
 ("Is there somewhere to store my things?",
  "No. Pack for a day at the beach. We are not responsible for personal belongings."),
 ("Are there restrooms nearby?",
  "There are no restrooms directly on the beach. You'll need to use a nearby business."),
 ("Can I surf with goggles, a life jacket or floaties?",
  "We recommend not wearing goggles if you can avoid it. Life jackets and floaties get in the way of paddling, so we don't use them."),
 ("Can I rent a surfboard after my lesson?",
  "We don't rent boards, but several local shops rent surfboards and wetsuits by the day."),
 ("Can I buy a surf lesson as a gift?",
  "Yes. Gift cards come in any amount from $50 to $1,000 and are good for any lesson."),
]

SPOTS = [
 # name, lat, lon, surfline url
 ("Thalia Street", 33.5369, -117.7769, "https://www.surfline.com/surf-report/thalia-street/5842041f4e65fad6a77088de"),
 ("Brooks Street", 33.5327, -117.7776, "https://www.surfline.com/surf-report/brooks-street/5842041f4e65fad6a77088dd"),
 ("Aliso Creek", 33.5089, -117.7524, "https://www.surfline.com/surf-report/aliso-creek/5842041f4e65fad6a77088dc"),
 ("Salt Creek", 33.4776, -117.7246, "https://www.surfline.com/surf-report/salt-creek/5842041f4e65fad6a770882e"),
 ("Doheny", 33.4610, -117.6854, "https://www.surfline.com/surf-report/doheny-state-beach/5842041f4e65fad6a77088d7"),
 ("San Clemente", 33.4195, -117.6205, "https://www.surfline.com/surf-report/san-clemente-pier-northside/5cc8b55739a02e0001ac69f8"),
 ("Upper Trestles", 33.3845, -117.5945, "https://www.surfline.com/surf-report/upper-trestles/5842041f4e65fad6a7708887"),
 ("Lower Trestles", 33.3814, -117.5884, "https://www.surfline.com/surf-report/lower-trestles/5842041f4e65fad6a770888a"),
]
