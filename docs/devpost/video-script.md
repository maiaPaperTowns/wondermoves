# WonderMoves: full video script (about 3 minutes)

A clear beginning, middle and end: the problem, what we built (3 games, the science behind each, the tech, the parent portal), and where we're going. About 450 words, spoken calmly. **[Shot]** is what's on screen.

---

## BEGINNING: the problem (0:00–0:35)

**[Shot]** A child's hand slowly reaching for a cup. Then text on screen: **1 in 345 children** · **one hand that won't follow**.

> Think about zipping a coat or picking up a cup. Easy, right? Now imagine one of your hands just won't do what you ask.
>
> That's daily life for many kids with cerebral palsy, the most common movement disability in childhood. About 1 in 345 children in the US has it. Often one side of the body is much weaker.
>
> The good news: the brain can rewire through practice, the same useful movement again and again, for many hours. But that practice has to happen at home, and repetitive exercises are boring. Kids push back, and families struggle to keep it up.

## MIDDLE (0:35–2:30)

### What we built (0:35–0:45)

**[Shot]** The Home screen with the three game cards.

> So we built WonderMoves: a set of three games that turn the exact movement a therapist prescribes into something a kid actually wants to do.

### Each game, and the science behind it (0:45–1:35)

**[Shot]** Treasure Reach: a hand slides to the sensor, the "Touch the sensor!" card, the chest opens.

> **Treasure Reach** is about reaching forward, like reaching for a cup. Touch the sensor, hold, and a treasure chest opens. It's built on *goal-directed training*: practising a real, meaningful movement toward a goal. A 2025 review of 48 clinical trials with children with CP found it improves hand use and helps kids reach their own goals.

**[Shot]** Fossil Brush: Pip draws a shape, then a hand traces it and sand brushes away.

> **Fossil Brush** uses *action observation*: Pip shows the movement first, then the child copies it. Watching and then doing helped children with one weaker side use that hand more in the same review, and in a clinical trial called UP-CAT.

**[Shot]** Bubble Pop: a hand pops bubbles, then taps "I'm done".

> **Bubble Pop** practises reaching to targets, with no timer: the child decides when they're done. We've also built a both-hands mode, because practising with both hands together had the strongest evidence of all.

**[Shot]** On screen, three short rules: **one movement · no timers · slow counts too**.

> Every game follows design rules from research on games for kids with CP: one simple movement, no timers, and a slow movement counts just like a fast one.

### The tech (1:35–1:55)

**[Shot]** The hardware on the table, with labels: Arduino UNO Q · Distance sensor · Webcam. Then a simple diagram: board → games → parent portal → Databricks.

> Under the hood, everything runs on an Arduino UNO Q with a Qualcomm chip. A time-of-flight distance sensor measures each reach, and a webcam with on-device hand tracking follows the hands, so no video ever leaves the house. The games run in the browser, served by the board. And Databricks turns each session into history and a short note for parents.

### The parent and caregiver portal (1:55–2:30)

**[Shot]** The PIN screen, then the Progress page: reaches completed, average reach length, the daily trend, a session with its Databricks note.

> Parents and caregivers get their own portal, behind a PIN. They see how much their child practised each day, how far the reaches went, and how that changes over time, with a short note after every session. No scores, and no comparisons with other kids.

**[Shot]** Settings: hand to practise, approved reach, break reminder, Calm mode, one-button play.

> A therapist or parent sets the safe reach and the hand to practise, and the game never pushes past it. There's Calm mode for kids sensitive to flashing or loud sounds, and a one-button mode for kids who can't use a camera or mouse.

## END: where we are, and the ask (2:30–3:00)

**[Shot]** Home screen saying "Hi, Mia! Pick a game.", a quick montage of the three games, then the logo.

> WonderMoves already works with real hands, on affordable, off-the-shelf parts. It's not a medical device yet, so our next step is a home pilot with an occupational therapist, to measure real progress.
>
> If you know an OT who'd like to try it, we'd love to hear from you. We're WonderMoves, and every move counts.

---

## If a judge asks for the details

- **Evidence:** Burgess et al., *Developmental Medicine & Child Neurology* (2025), network meta-analysis of 48 randomised trials with 1,629 children with CP:
  - goal-directed training: hand function +3.8 AHA, goals +2.3 COPM;
  - action observation: hand function +4.9 AHA (our least certain game);
  - bimanual training: +4.6 AHA and +3.3 COPM, and it improved self-care.
  - UP-CAT trial: Sgandurra et al., 2013.
  - Game design rules: Hernandez et al., *CHI 2013*.
- **Tech stack:**
  - Hardware: Arduino UNO Q (Qualcomm QRB2210 running Linux, plus an STM32 microcontroller), Modulino Distance (VL53L4CD time-of-flight sensor), Logitech Brio webcam.
  - On-device hand tracking: MediaPipe.
  - Board app: Python, with the Arduino App Lab web brick (FastAPI and Socket.IO).
  - Games: HTML, JavaScript and canvas.
  - Parent notes: a Databricks notebook writing Delta tables, with Llama 3.3 70B notes checked against safety rules.
  - Public demo: GitHub Pages.
- **Privacy:** no video leaves the board. The child's details stay on the board and never go to Databricks. The parent PIN is stored as a salted hash.
- **Honest limits:**
  - The distance sensor can't tell a reach from leaning forward.
  - Fossil Brush and Bubble Pop use more than one direction in their current versions.
  - Not yet tested with children.
