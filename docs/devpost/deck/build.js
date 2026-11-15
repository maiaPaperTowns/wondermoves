// WonderMoves 3-minute pitch deck, in the website's style (sky, sand, cream panels, Pip).
const path = require("path");
const pptxgen = require("pptxgenjs");
const { applyTheme } = require(process.env.SKILL + "/scripts/apply_theme.js");
const A = f => path.join(__dirname, "art", f);

const THEME = {
  name: "WonderMoves",
  headFontFace: "Arial Rounded MT Bold",
  bodyFontFace: "Arial",
  colors: {
    dk1: "4A2C17", lt1: "FFFFFF", dk2: "85634A", lt2: "FFFBF2",
    accent1: "FF8A3D", accent2: "22B4A3", accent3: "D9621A", accent4: "157F73",
    accent5: "FFC56E", accent6: "5DB3C8", hlink: "157F73", folHlink: "85634A",
  },
};
const LINE = "EED6AE";

const pres = new pptxgen();
pres.layout = "LAYOUT_16x9"; // 10 x 5.625 in
pres.title = "WonderMoves pitch";
pres.theme = { headFontFace: THEME.headFontFace, bodyFontFace: THEME.bodyFontFace };
const C = pres.SchemeColor;

pres.defineSlideMaster({
  title: "Scene",
  background: { path: A("scene.png") },
  objects: [],
});
pres.defineSlideMaster({
  title: "Content",
  background: { path: A("sky.png") },
  objects: [
    { placeholder: { options: { name: "title", type: "title", x: 0.5, y: 0.32, w: 9, h: 0.75, fontFace: THEME.headFontFace, fontSize: 28, color: C.text1, valign: "middle", margin: 0 }, text: "" } },
  ],
  slideNumber: { x: 9.2, y: 5.2, w: 0.5, h: 0.3, fontFace: "Arial", fontSize: 10, color: C.text2, align: "right" },
});

const shadow = () => ({ type: "outer", color: "4A2C17", opacity: 0.18, blur: 8, offset: 3, angle: 90 });
const panel = (s, o) => s.addShape(pres.shapes.ROUNDED_RECTANGLE, {
  x: o.x, y: o.y, w: o.w, h: o.h, rectRadius: o.r || 0.25,
  fill: { color: o.fill || THEME.colors.lt2 }, line: { color: LINE, width: 2.5 }, shadow: shadow(), objectName: o.name,
});
const pill = (s, text, o) => {
  s.addShape(pres.shapes.ROUNDED_RECTANGLE, { x: o.x, y: o.y, w: o.w, h: o.h || 0.36, rectRadius: (o.h || 0.36) / 2,
    fill: { color: o.fill || THEME.colors.accent2 }, line: { color: o.line || o.fill || THEME.colors.accent2, width: o.line ? 2 : 0 }, objectName: o.name });
  s.addText(text, { x: o.x, y: o.y, w: o.w, h: o.h || 0.36, align: "center", valign: "middle", margin: 0, isTextBox: true,
    fontFace: THEME.headFontFace, fontSize: o.size || 12, color: o.color || "FFFFFF", objectName: (o.name || "pill") + " text" });
};

/* 1 ─ Title */
pres.addSection({ title: "Pitch" });
{
  const s = pres.addSlide({ masterName: "Scene", sectionTitle: "Pitch" });
  panel(s, { x: 0.45, y: 0.45, w: 5.6, h: 3.75, r: 0.35, name: "Title panel" });
  pill(s, "MadHacks 2026 · Qualcomm track", { x: 0.85, y: 0.8, w: 3.0, name: "Event pill" });
  s.addText([
    { text: "Wonder", options: { color: C.accent1 } }, { text: "Moves", options: { color: C.accent2 } },
  ], { x: 0.85, y: 1.25, w: 5, h: 0.7, fontFace: THEME.headFontFace, fontSize: 40, margin: 0, isTextBox: true, objectName: "Wordmark" });
  s.addText([
    { text: "Hand-therapy games for kids with " },
    { text: "cerebral palsy", options: { color: C.accent3, highlight: "FFC56E" } },
  ], { x: 0.85, y: 2.0, w: 4.9, h: 1.1, fontFace: THEME.headFontFace, fontSize: 26, color: C.text1, margin: 0, valign: "top", isTextBox: true, objectName: "Headline" });
  s.addText("Turning the movement a therapist prescribes into play a child wants to repeat at home, on an Arduino UNO Q.",
    { x: 0.85, y: 3.15, w: 4.9, h: 0.8, fontSize: 14, color: C.text2, margin: 0, valign: "top", isTextBox: true, objectName: "Subtitle" });
  s.addImage({ path: A("pip.png"), x: 6.7, y: 2.2, w: 2.9, h: 2.9, objectName: "Pip" });
  s.addNotes("Hi, we're WonderMoves. About 1 in 345 children in the US has cerebral palsy. Many have one weaker hand, and the way that hand gets better is practice: the same movement, hundreds of times, at home. We built games that make that practice fun, running entirely on an Arduino UNO Q with Qualcomm's chip.");
}

/* 2 ─ Problem */
{
  const s = pres.addSlide({ masterName: "Content", sectionTitle: "Pitch" });
  s.addText("Therapy works through repetition. Home practice is hard", { placeholder: "title" });
  const stats = [
    ["1 in 345", "US children has cerebral palsy", "CDC"],
    [">25 h", "of practice gave the biggest gains in trials", "Burgess et al. 2025, 48 RCTs"],
    ["45%", "of caregivers in one survey kept up the home programme", "Systematic review 2024"],
  ];
  stats.forEach(([big, label, src], i) => {
    const x = 0.5 + i * 3.08;
    panel(s, { x, y: 1.35, w: 2.84, h: 2.35, name: `Stat ${i + 1}` });
    s.addText(big, { x: x + 0.25, y: 1.55, w: 2.4, h: 0.9, fontFace: THEME.headFontFace, fontSize: 40, color: i === 2 ? C.accent3 : C.accent4, margin: 0, isTextBox: true, objectName: `Stat ${i + 1} number` });
    s.addText(label, { x: x + 0.25, y: 2.45, w: 2.4, h: 0.75, fontSize: 14, color: C.text1, margin: 0, valign: "top", isTextBox: true, objectName: `Stat ${i + 1} label` });
    s.addText(src, { x: x + 0.25, y: 3.3, w: 2.4, h: 0.3, fontSize: 10, color: C.text2, margin: 0, isTextBox: true, objectName: `Stat ${i + 1} source` });
  });
  panel(s, { x: 0.5, y: 4.0, w: 9.0, h: 0.85, fill: "FFFFFF", name: "Gap panel" });
  s.addText([
    { text: "And mainstream motion games get it wrong: ", options: { bold: true } },
    { text: "timers, speed and many actions at once are exactly what the CP game-design research says to avoid." },
  ], { x: 0.75, y: 4.05, w: 8.5, h: 0.75, fontSize: 14, color: C.text1, margin: 0, valign: "middle", isTextBox: true, objectName: "Gap text" });
  s.addNotes("The research is clear: in a 2025 meta-analysis of 48 trials, children who got more than 25 hours of practice gained the most. But that practice happens at home, and families struggle; in one survey fewer than half kept it up. And ordinary motion games don't help: they're built on timers and speed, the opposite of what kids with CP need.");
}

/* 3 ─ Solution */
{
  const s = pres.addSlide({ masterName: "Content", sectionTitle: "Pitch" });
  s.addText("Three games, one therapy movement each", { placeholder: "title" });
  const games = [
    ["money.png", "Treasure Reach", "Reach forward and back", "Goal-directed training", "Moderate evidence", "FFE7CF"],
    ["bone.png", "Fossil Brush", "Brush back and forth", "Action observation (Pip shows it)", "Emerging evidence", "F7EBD3"],
    ["bubble.png", "Bubble Pop", "Lift one hand, or both", "Bimanual training", "Strong evidence", "D8F1F6"],
  ];
  games.forEach(([icon, name, move, approach, ev, tint], i) => {
    const x = 0.5 + i * 3.08;
    panel(s, { x, y: 1.3, w: 2.84, h: 2.75, name: `${name} card` });
    s.addShape(pres.shapes.OVAL, { x: x + 0.25, y: 1.5, w: 0.85, h: 0.85, fill: { color: tint }, line: { color: LINE, width: 1.5 }, objectName: `${name} icon circle` });
    s.addImage({ path: A(icon), x: x + 0.37, y: 1.62, w: 0.61, h: 0.61, objectName: `${name} icon` });
    s.addText(name, { x: x + 0.25, y: 2.45, w: 2.4, h: 0.4, fontFace: THEME.headFontFace, fontSize: 18, color: C.text1, margin: 0, isTextBox: true, objectName: `${name} title` });
    s.addText(move, { x: x + 0.25, y: 2.85, w: 2.4, h: 0.35, fontSize: 14, bold: true, color: C.accent4, margin: 0, isTextBox: true, objectName: `${name} movement` });
    s.addText(approach, { x: x + 0.25, y: 3.2, w: 2.4, h: 0.4, fontSize: 12, color: C.text2, margin: 0, valign: "top", isTextBox: true, objectName: `${name} approach` });
    pill(s, ev, { x: x + 0.25, y: 3.6, w: 1.75, h: 0.3, size: 10, fill: i === 2 ? THEME.colors.accent2 : i === 0 ? THEME.colors.accent1 : "C99A5B", name: `${name} evidence` });
  });
  const rules = ["No timers", "Completion, not speed", "Never past the approved range", "Affected hand first"];
  let x = 0.5;
  const widths = [1.45, 2.15, 2.95, 1.95];
  rules.forEach((r, i) => { pill(s, r, { x, y: 4.35, w: widths[i], h: 0.42, size: 12, fill: "FFFFFF", line: LINE, color: THEME.colors.dk1, name: `Rule ${i + 1}` }); x += widths[i] + 0.17; });
  s.addNotes("So we built three games, each around a single movement. Treasure Reach: reach forward, and each completed reach digs up treasure. Fossil Brush: Pip demonstrates the stroke, then the child brushes. Bubble Pop: lift a hand, or both hands together. Each maps to a therapy approach with trial evidence; bimanual training is the strongest. And the rules come from the research: no timers, a slow movement counts like a fast one, and the game never pushes past the range a therapist approved.");
}

/* 4 ─ How it works */
{
  const s = pres.addSlide({ masterName: "Content", sectionTitle: "Pitch" });
  s.addText("Everything runs on one Arduino UNO Q, offline", { placeholder: "title" });
  panel(s, { x: 0.5, y: 1.25, w: 4.3, h: 3.85, fill: "FFFFFF", name: "Hardware card" });
  s.addImage({ path: A("hardware.png"), x: 0.62, y: 1.33, w: 4.06, h: 3.65, objectName: "Hardware illustration" });
  const steps = [
    ["1", "Sensors see the movement", "Distance, Movement and Thermo sensors, plus a webcam."],
    ["2", "The Qualcomm chip counts it", "Pose AI and rep counting on the QRB2210. No video leaves the device."],
    ["3", "The game celebrates", "Every completed movement moves the story on. Pip suggests breaks."],
    ["4", "Grown-ups see the practice", "A Today counter and a parent dashboard, no scores for the child."],
  ];
  steps.forEach(([n, head, body], i) => {
    const y = 1.3 + i * 0.95;
    s.addShape(pres.shapes.OVAL, { x: 5.15, y: y + 0.05, w: 0.5, h: 0.5, fill: { color: THEME.colors.accent1 }, line: { color: "FFFFFF", width: 2 }, objectName: `Step ${n} circle` });
    s.addText(n, { x: 5.15, y: y + 0.05, w: 0.5, h: 0.5, align: "center", valign: "middle", margin: 0, fontFace: THEME.headFontFace, fontSize: 16, color: "FFFFFF", isTextBox: true, objectName: `Step ${n} number` });
    s.addText(head, { x: 5.85, y, w: 3.65, h: 0.32, fontFace: THEME.headFontFace, fontSize: 15, color: C.text1, margin: 0, isTextBox: true, objectName: `Step ${n} title` });
    s.addText(body, { x: 5.85, y: y + 0.33, w: 3.65, h: 0.5, fontSize: 12, color: C.text2, margin: 0, valign: "top", isTextBox: true, objectName: `Step ${n} text` });
  });
  s.addNotes("Here's how it works. The sensors and webcam watch the movement. The Qualcomm chip on the UNO Q runs the pose AI and counts each completed repetition, completely offline, so no video ever leaves the house. The game turns each rep into progress, and the caregiver sees how much practice happened today.");
}

/* 5 ─ Market + model */
{
  const s = pres.addSlide({ masterName: "Content", sectionTitle: "Pitch" });
  s.addText("Clinic-grade ideas at a home-kit price", { placeholder: "title" });
  const H = { fontFace: THEME.headFontFace, fontSize: 12, color: "FFFFFF", fill: { color: THEME.colors.dk1 }, valign: "middle" };
  const r = (a, b, c, hi) => [a, b, c].map(t => ({ text: t, options: { fontSize: 12, color: THEME.colors.dk1, bold: !!hi, fill: { color: hi ? "D8F1F6" : "FFFFFF" }, valign: "middle" } }));
  s.addTable([
    [{ text: "Product", options: H }, { text: "Price", options: H }, { text: "Gap", options: H }],
    r("Neofect Smart Kids", "£3,910 home", "Expensive, fixed controllers"),
    r("MusicGlove", "~$399–520", "Timing-based, built for adult stroke"),
    r("ArmeoSpring Pediatric", "Quote only", "Clinic-only exoskeleton"),
    r("WonderMoves", "Board + sensors ≈ $120–135", "One movement, therapist limits, offline", true),
  ], { x: 0.5, y: 1.3, w: 5.4, colW: [1.7, 1.7, 2.0], rowH: 0.52, border: { type: "solid", color: LINE, pt: 1 }, fontFace: "Arial", margin: 0.06, objectName: "Comparison table" });
  s.addText("Price of the UNO Q and three Modulino boards only; webcam not yet priced.", { x: 0.5, y: 4.0, w: 5.4, h: 0.3, fontSize: 10, color: C.text2, margin: 0, isTextBox: true, objectName: "Table note" });
  panel(s, { x: 6.25, y: 1.3, w: 3.25, h: 2.95, name: "Model panel" });
  s.addText("Business model", { x: 6.5, y: 1.45, w: 2.8, h: 0.4, fontFace: THEME.headFontFace, fontSize: 16, color: C.accent3, margin: 0, isTextBox: true, objectName: "Model title" });
  s.addText([
    { text: "Home kit near hardware cost", options: { bold: true, breakLine: true } },
    { text: "An order of magnitude below Neofect", options: { color: THEME.colors.dk2, breakLine: true } },
    { text: " ", options: { fontSize: 6, breakLine: true } },
    { text: "Family subscription", options: { bold: true, breakLine: true } },
    { text: "New games and levels, less than one OT session a month", options: { color: THEME.colors.dk2, breakLine: true } },
    { text: " ", options: { fontSize: 6, breakLine: true } },
    { text: "Clinic licence", options: { bold: true, breakLine: true } },
    { text: "OTs set limits and review home practice", options: { color: THEME.colors.dk2 } },
  ], { x: 6.5, y: 1.9, w: 2.8, h: 2.8, fontSize: 12, color: C.text1, margin: 0, valign: "top", isTextBox: true, objectName: "Model text" });
  s.addNotes("Today's options are either expensive, like Neofect Smart Kids at almost four thousand pounds for home use, built for adults, or clinic-only. WonderMoves uses off-the-shelf parts at around a hundred and thirty dollars for the board and sensors. Our model: sell the kit near cost, a family subscription for new games, and a clinic licence so OTs can set limits and see practice between visits. These are hypotheses we want to test.");
}

/* 6 ─ Proof + next */
{
  const s = pres.addSlide({ masterName: "Scene", sectionTitle: "Pitch" });
  panel(s, { x: 0.45, y: 0.4, w: 6.1, h: 3.95, r: 0.35, name: "Close panel" });
  s.addText("Working on real hands today", { x: 0.85, y: 0.65, w: 5.4, h: 0.55, fontFace: THEME.headFontFace, fontSize: 24, color: C.text1, margin: 0, isTextBox: true, objectName: "Close title" });
  const proof = [["23", "bubble lifts in 2 min, 7 with both hands"], ["3 / 3", "reaches detected by the Distance sensor"], ["0", "videos stored or sent"]];
  proof.forEach(([n, t], i) => {
    const x = 0.85 + i * 1.83;
    s.addText(n, { x, y: 1.3, w: 1.7, h: 0.6, fontFace: THEME.headFontFace, fontSize: 30, color: i === 1 ? C.accent3 : C.accent4, margin: 0, isTextBox: true, objectName: `Proof ${i + 1} number` });
    s.addText(t, { x, y: 1.9, w: 1.65, h: 0.65, fontSize: 12, color: C.text1, margin: 0, valign: "top", isTextBox: true, objectName: `Proof ${i + 1} text` });
  });
  s.addText([
    { text: "Next: ", options: { bold: true, color: THEME.colors.accent3 } },
    { text: "a home pilot with an occupational therapist, measuring hand function (AHA) and goals (COPM), after ethics approval." },
  ], { x: 0.85, y: 2.75, w: 5.3, h: 0.7, fontSize: 14, color: C.text1, margin: 0, valign: "top", isTextBox: true, objectName: "Next step" });
  pill(s, "Looking for OT and clinic partners", { x: 0.85, y: 3.6, w: 3.4, h: 0.45, size: 14, fill: THEME.colors.accent1, name: "Ask pill" });
  s.addImage({ path: A("pip.png"), x: 6.9, y: 2.3, w: 2.8, h: 2.8, objectName: "Pip" });
  s.addNotes("It already works with real hands: 23 bubble lifts in two minutes, seven with both hands, and reaches detected by the distance sensor, with no video ever stored. It's not a medical device yet, so our next step is a home pilot with an occupational therapist, measuring hand function before and after. We're looking for OT partners. Thank you!");
}

(async () => {
  const out = path.join(__dirname, "..", "WonderMoves-pitch.pptx");
  await pres.writeFile({ fileName: out });
  await applyTheme(out, THEME);
  console.log("wrote", out);
})();
