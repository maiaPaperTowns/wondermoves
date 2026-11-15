# WonderMoves: 3-minute pitch

About 430 words, spoken calmly, like you're explaining it to a friend. **[Slide]** is what's on screen; the indented text is what you say. Numbers stay in the opening; after that, keep it simple. The sources and the exact figures are at the end, ready for questions.

---

## 1. Hook (0:00–0:15)

**[Slide]** A child's hand slowly reaching for a cup. Title: *WonderMoves*.

> Think about the last time you zipped a coat, opened a lunchbox, or picked up a cup. You didn't even think about it. Now imagine one of your hands just won't do what you ask. For a lot of kids, that's every single day.

## 2. What cerebral palsy is (0:15–0:40)

**[Slide]** **1 in 345 children** · **17 million people worldwide** · one hand that doesn't follow.

> Those kids have cerebral palsy. It's the most common movement disability in childhood. It comes from an injury to the brain while it's still developing, and it stays for life. About 1 in 345 children in the US has it, and around 17 million people live with it worldwide. Many of these kids have one side of the body that's much weaker, so one hand ends up doing almost everything.

## 3. What actually helps (0:40–1:00)

**[Slide]** "Practice is the medicine."

> The good news is that a child's brain can rewire. And what rewires it is practice: the same useful movement, again and again, for many hours. That's what the research keeps showing. The catch is that clinic visits can't give anywhere near that much practice. Most of it has to happen at home.

## 4. Why that's hard today (1:00–1:25)

**[Slide]** Three simple pictures: an expensive kit, a hospital machine, a regular video game.

> And at home, it's hard. Repetitive exercises are boring, kids push back, and many families can't keep it up. The tools that exist are either very expensive, stuck in a clinic, or regular motion games built around timers and speed, which is the opposite of what these kids need.

## 5. Our games (1:25–2:20)

**[Slide]** Three game cards: the movement → the everyday skill.

> So we built WonderMoves: games that turn the exact movement a therapist prescribes into something a kid actually wants to do.
>
> In **Treasure Reach**, you reach forward and hold, and a treasure chest pops open. That's the same movement as reaching for a cup or a door handle. It's based on goal-directed training, one of the approaches with solid evidence behind it.
>
> In **Fossil Brush**, our mascot Pip shows a movement first, then the child copies it to brush sand off a fossil. Watching and then doing is a proven way for kids with one weaker side to learn to use that hand more.
>
> In **Bubble Pop**, you move your hand onto floating bubbles. There's no timer: the child decides when they're done. And we built a both-hands mode, because practising with both hands together has the strongest evidence of all.

## 6. What makes us different (2:20–2:45)

**[Slide]** Four icons: one movement · therapist limits · private AI · affordable.

> A few things make us different. Every game uses one simple movement, with no timers and no rush. A therapist or parent sets the limits, and the game never pushes past them. The AI that tracks the hand runs right on the Qualcomm chip, so no video ever leaves the house. And it's built from affordable, off-the-shelf parts, with a simple page that shows parents how much their kid practised.

## 7. Where we are and the ask (2:45–3:00)

**[Slide]** "Working today" + the board photo. "Looking for OT partners."

> It already works with real hands today. We're honest that it's not a medical device yet, so our next step is a home pilot with an occupational therapist to measure real progress. If you know an OT who'd want to try it, we'd love to talk. Thank you!

---

## Exact numbers, if a judge asks

- Dose: a 2025 meta-analysis of 48 trials with 1,629 children found the biggest gains with more than 25 hours of practice [3].
- Home practice: in one survey only 45% of caregivers kept up the programme [4].
- Price: a children's sensor kit (Neofect Smart Kids) costs about £3,910 for home use [5]. WonderMoves parts cost about $130.
- Treasure Reach (goal-directed training): hand function +3.8 AHA, goals +2.3 COPM [3].
- Fossil Brush (action observation): hand function +4.9 AHA in unilateral CP [3]; UP-CAT trial [7]. Least certain of the three.
- Bubble Pop both-hands mode (bimanual training): +4.6 AHA, +3.3 COPM, and the only approach that improved self-care [3]. Our test: 23 lifts in about 2 minutes, 7 with both hands (lift mode, currently switched off).

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
