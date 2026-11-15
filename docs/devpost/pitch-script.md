# WonderMoves: 3-minute pitch

About 420 words, at a calm speaking pace. **[Slide]** is what's on screen; the indented text is what you say. Numbers in brackets are the sources at the end. Keep the honest lines (marked ✔): judges trust a team that names its limits.

---

## 1. Hook (0:00–0:15)

**[Slide]** A child's hand slowly reaching for a cup. Title: *WonderMoves*.

> Imagine trying to open a lunchbox, zip a coat, or hold a cup, when one of your hands won't do what you ask. For thousands of kids with cerebral palsy, that's every day.

## 2. What CP is, in numbers (0:15–0:40)

**[Slide]** Three numbers: **1 in 345** · **17 million** · **one hand**.

> Cerebral palsy is the most common motor disability in childhood. It's caused by an injury to the developing brain, and it affects movement for life. About 1 in 345 children in the US has CP [1], and around 17 million people worldwide live with it [2]. Many children have *unilateral* CP: one side of the body, often one hand, works much less well than the other.

## 3. What actually helps (0:40–1:00)

**[Slide]** "Practice is the medicine" with the bar: **> 25 hours** of practice.

> The brain can rewire through practice: the same meaningful movement, hundreds of times. A 2025 meta-analysis of 48 trials with 1,629 children found the biggest gains with more than 25 hours of practice [3]. That dose has to happen at home.

## 4. The problem with home practice and today's options (1:00–1:25)

**[Slide]** Left: "45% of caregivers keep it up". Right: a 3-row table: Neofect £3,910 · clinic exoskeletons · console games.

> But only 45% of caregivers keep up home programmes [4]. Today's tools are expensive (nearly £4,000 for a children's sensor kit [5]), clinic-only like exoskeletons, or ordinary motion games built on timers and speed, exactly what CP game-design research says to avoid [6].

## 5. Our games, and the science behind each (1:25–2:20)

**[Slide]** Three game cards, each with: the movement → the daily-life skill → the evidence.

> WonderMoves is three games, each built around one movement a therapist already prescribes.
>
> **Treasure Reach:** reach forward and hold to open a chest: the movement for reaching a cup or a door handle. It's *goal-directed training*, which improved hand function by 3.8 points and goal achievement by 2.3 [3]. The distance sensor asks only for the child's own approved distance.
>
> **Fossil Brush:** Pip shows a movement, the child copies it to brush away sand. That's *action observation*, watch then do: +4.9 hand function in unilateral CP [3], and more daily use of the affected arm in the UP-CAT trial [7]. ✔ It's our least certain game.
>
> **Bubble Pop:** move a hand onto floating bubbles, no timer. It trains reaching to targets, and its both-hands mode uses *bimanual training*, the strongest approach in the meta-analysis: +4.6 hand function, +3.3 goals, and better self-care [3].

## 6. How we're different (2:20–2:45)

**[Slide]** Four icons: one movement · therapist limits · private AI · $130.

> What sets us apart: **one movement per game**, no timers, completion over speed [6]. **Therapist-set limits** the game never raises. **Private AI**: hand tracking runs on the Qualcomm chip, so no video leaves the house. And **about $130** in off-the-shelf parts, with a parent page showing daily practice.

## 7. Proof and ask (2:45–3:00)

**[Slide]** "Working today" + the board photo. Ask: "OT partners for a home pilot."

> It works with real hands today: 23 bubble lifts in two minutes, seven with both hands. ✔ It's not a medical device, and evidence for CP games is still low-certainty [8], so next is a home pilot with an occupational therapist, measuring hand function before and after. We're looking for OT partners. Thank you!

---

## Questions judges are likely to ask

| Question | Answer |
|---|---|
| **How do you know the child is reaching, not leaning forward?** | Honest answer: the distance sensor can't tell. Leaning the trunk is a common compensation in CP. Today a grown-up watches for it; next we use the camera's shoulder tracking (already in the code) to flag leaning. |
| **Bubble Pop and Fossil Brush use several directions. Isn't that against your one-movement rule?** | Yes, partly, and we say so in our evidence brief. Both have a single-movement version written: Fossil Brush's back-and-forth stroke with the Movement sensor, and Bubble Pop's both-hands lift. Switching to them is a setting, not a rewrite. |
| **Have you tested with children?** | Not yet. That needs ethics approval. We tested with our own hands and simulated sensor data. The pilot with an OT (measured with AHA and COPM) is the next step. |
| **What about privacy? These are kids.** | No video leaves the device. Hand tracking runs on the board. The child's details stay on the board, never go to Databricks, and Progress and Settings need a parent PIN. The AI voice (coming) only uses the microphone with a parent's consent and keeps no recordings. |
| **Why would a family keep using it?** | Kids collect treasures and see Pip react; parents see practice per day without counting reps themselves. Dose is the whole point [3, 4]. |
| **Business model?** | Kit near cost (~$130), a family subscription for new games, and a clinic licence so OTs set limits and see home practice between visits. These are hypotheses we want to test in the pilot. |
| **Why Qualcomm / why on-device?** | Privacy for children, and it works offline. Pose tracking runs on the QRB2210 at about 8 frames per second. |

## Sources

1. CDC, Autism and Developmental Disabilities Monitoring Network: about 1 in 345 children in the US has CP.
2. Cerebral Palsy Alliance: about 17 million people with CP worldwide.
3. Burgess et al., *Developmental Medicine & Child Neurology*, 2025: network meta-analysis, 48 RCTs, 1,629 children with CP (goal-directed training, action observation, bimanual training; > 25 h dose subgroup).
4. Caregiver adherence survey (Malaysia): 45% followed the home programme; other studies report poor adherence in 34–79% of parents.
5. Neofect Smart Kids, UK retailer price: £3,910 home, £8,350 clinic (ex VAT).
6. Hernandez et al., *CHI 2013*: design guidelines for motion games for children with CP (limit actions, no precise timing).
7. Sgandurra et al., 2013, UP-CAT trial: action observation in unilateral CP.
8. 2023 meta-analysis of interactive / VR games in CP: SMD 0.65 for upper-limb activity, low to very low certainty.

The full evidence, with the honest limits for each game, is in [`docs/evidence-brief.html`](../evidence-brief.html).
