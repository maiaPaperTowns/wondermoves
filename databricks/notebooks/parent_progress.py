# Databricks notebook source
# MAGIC %md
# MAGIC # WonderMoves · Parent progress
# MAGIC Runs after each closed play session (started by `parents/server.py` on the laptop).
# MAGIC
# MAGIC Input: one row per finished session, for all three games (Treasure Reach, Fossil Brush, Bubble Pop),
# MAGIC uploaded to `/Volumes/workspace/wondermoves/raw/parents/sessions.jsonl`.
# MAGIC
# MAGIC It works out, per child:
# MAGIC * **history tables** (`parent_sessions`, `parent_daily`) — every session and movements per day;
# MAGIC * **change since last time** for the same game, as plain numbers ("12 brush strokes, 9 last time");
# MAGIC * a short **note for parents** written by a hosted AI model, checked against the project rules:
# MAGIC   no diagnosis, no scores, no comparison with other children, no judging words, no body-side wording.
# MAGIC
# MAGIC Output: `exports/parent_insights.json`, which the parent website shows.

# COMMAND ----------

dbutils.widgets.text("catalog", "workspace")
dbutils.widgets.text("schema", "wondermoves")
dbutils.widgets.text("volume", "raw")
dbutils.widgets.text("endpoint", "databricks-meta-llama-3-3-70b-instruct")
dbutils.widgets.text("max_new_notes", "40")
CAT, SCH, VOL, ENDPOINT = (dbutils.widgets.get(k) for k in ("catalog", "schema", "volume", "endpoint"))
MAX_NEW = int(dbutils.widgets.get("max_new_notes"))
BASE = f"/Volumes/{CAT}/{SCH}/{VOL}"

import json, os, re, datetime
import pandas as pd

rows = [json.loads(l) for l in open(f"{BASE}/parents/sessions.jsonl") if l.strip()]
df = pd.DataFrame(rows)
# Visits with no movements (opened a game and left) are not practice: they would make "last time" 0
# and use up AI notes on sessions the parent page hides.
skipped = int((df["movements"] <= 0).sum()) if len(df) else 0
df = df[df["movements"] > 0].copy() if len(df) else df
if df.empty:
    os.makedirs(f"{BASE}/exports", exist_ok=True)
    with open(f"{BASE}/exports/parent_insights.json", "w") as f:
        json.dump({"generated_at": datetime.datetime.utcnow().isoformat() + "Z", "source": "Databricks",
                   "sessions": {}, "daily": []}, f)
    dbutils.notebook.exit(f"no sessions with movements yet ({skipped} empty visits skipped)")
df["start"] = pd.to_datetime(df["start_t"], unit="s")
df = df.sort_values(["child", "game", "start_t"])
df["prev_movements"] = df.groupby(["child", "game"])["movements"].shift(1)
df["prev_minutes"] = df.groupby(["child", "game"])["minutes"].shift(1)
df["sessions_so_far"] = df.groupby(["child", "game"]).cumcount() + 1
print(f"{len(df)} sessions, {df.child.nunique()} children ({skipped} empty visits skipped)")

# A fixed, typed set of columns. Saving every field as-is breaks the Delta table when a field is empty
# in every session (no type to infer), and new fields from the board would change the schema each time.
COLUMNS = {"session_id": str, "child": str, "game": str, "game_name": str, "movement_word": str, "detail": str,
           "local_day": str, "movements": int, "pairs": int, "breaks": int, "sessions_so_far": int, "reach_n": int,
           "minutes": float, "start_t": float, "end_t": float, "prev_movements": float, "prev_minutes": float,
           "comfortable_mm": float, "reach_avg_mm": float, "reach_max_mm": float, "closest_mm": float,
           "quality_pct": float}


def typed(frame):
    out = pd.DataFrame(index=frame.index)
    for col, kind in COLUMNS.items():
        v = frame[col] if col in frame else pd.Series([None] * len(frame), index=frame.index)
        if kind is str:
            out[col] = v.fillna("").astype(str)
        elif kind is int:
            out[col] = pd.to_numeric(v, errors="coerce").fillna(0).astype("int64")
        else:
            out[col] = pd.to_numeric(v, errors="coerce").astype("float64")
    return out


spark.createDataFrame(typed(df)).write.mode("overwrite").option("overwriteSchema", "true") \
    .saveAsTable(f"{CAT}.{SCH}.parent_sessions")

# COMMAND ----------

# MAGIC %md ### Movements per day (for the parent chart)

# COMMAND ----------

# The family's own calendar day (sent by the laptop helper); UTC only as a fallback.
utc_day = df["start"].dt.strftime("%Y-%m-%d")
df["day"] = df["local_day"].where(df["local_day"].astype(bool), utc_day) if "local_day" in df else utc_day
daily = df.groupby(["child", "day", "game"], as_index=False).agg(movements=("movements", "sum"),
                                                                  minutes=("minutes", "sum"),
                                                                  sessions=("session_id", "count"))
spark.createDataFrame(daily).write.mode("overwrite").option("overwriteSchema", "true") \
    .saveAsTable(f"{CAT}.{SCH}.parent_daily")
display(daily.tail(20))

# COMMAND ----------

# MAGIC %md ### Notes for parents (only for sessions that don't have one yet)

# COMMAND ----------

from databricks.sdk import WorkspaceClient
from databricks.sdk.service.serving import ChatMessage, ChatMessageRole

notes_table = f"{CAT}.{SCH}.parent_notes"
NOTE_VERSION = 2   # bump when the prompt or rules change, so older notes are rewritten
try:
    known = {r["session_id"]: r.asDict() for r in spark.table(notes_table).collect()
             if r.asDict().get("note_version") == NOTE_VERSION}
except Exception:
    known = {}

FORBIDDEN = [r"diagnos", r"improv", r"better", r"worse", r"decline", r"\bscore", r"percent|%", r"other (kids|children)",
             r"normal", r"therap", r"recover", r"cerebral|palsy|spastic", r"\bshould\b", r"\bmust\b", r"weak", r"fail",
             r"\b(left|right|affected|dominant|stronger|weaker) (side|hand|arm)", r"\bsides? of", r"great job|amazing|incredible",
             # use the child's name or "they": never guess gender from a name
             r"\b(he|she|his|her|hers|him|himself|herself)\b",
             # plain facts, not a chatty message from "us"
             r"^(hi|hello|dear)\b", r"\b(we|our|us)\b", r"\bi wanted\b"]


def note_ok(text):
    sentences = [s for s in re.split(r"[.!?]+(?:\s|$)", text.strip()) if s.strip()]
    return 0 < len(text) <= 420 and len(sentences) <= 3 and not any(re.search(p, text.lower()) for p in FORBIDDEN)


def facts(r):
    f = {"game": r.game_name, "what_one_movement_is": r.movement_word, "movements_this_session": int(r.movements),
         "minutes_played": r.minutes}
    if r.breaks:
        f["rest_breaks_offered"] = int(r.breaks)
    if isinstance(r.detail, str) and r.detail:
        f["setting"] = r.detail
    if isinstance(r.rewards, list) and r.rewards:
        f["found"] = r.rewards
    if r.pairs:
        f["times_both_hands_lifted_together"] = int(r.pairs)
    if "reach_avg_mm" in df and pd.notna(getattr(r, "reach_avg_mm", None)):
        f["average_reach_cm"] = round(float(r.reach_avg_mm) / 10, 1)
    if pd.notna(r.prev_movements):
        f["movements_last_time_in_this_game"] = int(r.prev_movements)
    f["this_was_session_number"] = int(r.sessions_so_far)
    return f


def template(r):
    how_long = "under a minute" if r.minutes < 1 else f"{round(r.minutes)} minute{'s' if round(r.minutes) != 1 else ''}"
    t = f"{r.child.split(' (')[0]} played {r.game_name} for {how_long} and completed {int(r.movements)} {r.movement_word}."
    if pd.notna(r.prev_movements):
        t += f" Last time in this game: {int(r.prev_movements)}."
    return t


w = WorkspaceClient()
new_rows, made = [], 0
for r in df.sort_values("start_t", ascending=False).itertuples():
    if r.session_id in known:
        continue
    text, source = None, "template"
    if made < MAX_NEW:
        made += 1
        try:
            reply = w.serving_endpoints.query(name=ENDPOINT, temperature=0.3, max_tokens=180, messages=[
                ChatMessage(role=ChatMessageRole.SYSTEM, content=(
                    "You write a 2-3 sentence note for a parent about one session of a children's movement game. "
                    "Write plain third-person statements, no greeting, no 'we' or 'I'. Refer to the child only by first "
                    "name or 'they' (never he/she/his/her). Restate only the facts given, with the exact numbers, warmly. "
                    "If a number from last time is given, you may state both numbers side by side, without judging them. "
                    "Never diagnose, never say better/worse/improved, never use scores or percentages, never compare "
                    "with other children, never tell the family what to do, never mention sides of the body.")),
                ChatMessage(role=ChatMessageRole.USER, content=json.dumps({"child": r.child.split(" (")[0], **facts(r)}))])
            text = reply.choices[0].message.content
            if isinstance(text, list):
                text = "".join(p.get("text", "") if isinstance(p, dict) else str(p) for p in text)
            text = text.strip()
            source = ENDPOINT if note_ok(text) else "template"
        except Exception as e:
            print("model unavailable:", e)
    new_rows.append({"session_id": r.session_id, "note": text if source != "template" else template(r),
                     "note_source": source, "note_version": NOTE_VERSION})

if new_rows:
    known.update({n["session_id"]: n for n in new_rows})
    spark.createDataFrame(pd.DataFrame(list(known.values()))).write.mode("overwrite") \
        .option("overwriteSchema", "true").saveAsTable(notes_table)
print(f"{len(new_rows)} new notes ({sum(n['note_source'] != 'template' for n in new_rows)} by the AI model)")

# COMMAND ----------

# MAGIC %md ### Export for the parent website

# COMMAND ----------

def change(r):
    if pd.isna(r.prev_movements):
        return None
    return {"movements": int(r.movements), "last_time": int(r.prev_movements)}


out = {
    "generated_at": datetime.datetime.utcnow().isoformat() + "Z",
    "source": f"Databricks · {ENDPOINT}",
    "sessions": {r.session_id: {"note": known[r.session_id]["note"], "note_source": known[r.session_id]["note_source"],
                                "change": change(r), "times_played": int(r.sessions_so_far)}
                 for r in df.itertuples() if r.session_id in known},
    "daily": daily.to_dict(orient="records"),
}
os.makedirs(f"{BASE}/exports", exist_ok=True)
with open(f"{BASE}/exports/parent_insights.json", "w") as f:
    json.dump(out, f, indent=1, ensure_ascii=False, default=str)
print("exported", len(out["sessions"]), "sessions")
