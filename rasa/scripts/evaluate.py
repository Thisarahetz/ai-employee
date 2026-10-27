#!/usr/bin/env python3
"""Evaluate the running Rasa NLU service against tests/test_nlu.yml.

    RASA_URL=http://localhost:5005 RASA_AUTH_TOKEN=... python3 scripts/evaluate.py

Reports per-intent precision/recall, the confusion list, and the numbers that
matter for routing: how many messages would be handled by Rasa at the
configured confidence threshold, and how many of those would be WRONG.
`out_of_scope` is correct when the model answers out_of_scope, nlu_fallback, or
anything below the threshold (all of which go to the LLM).
"""
import json, os, re, sys, urllib.request
from collections import Counter, defaultdict

URL = os.environ.get("RASA_URL", "http://localhost:5005")
TOKEN = os.environ.get("RASA_AUTH_TOKEN", "")
HIGH = float(os.environ.get("RASA_HIGH_CONFIDENCE", "0.80"))
MIN_MARGIN = float(os.environ.get("RASA_MIN_MARGIN", "0.15"))
FILE = os.path.join(os.path.dirname(__file__), "..", "tests", "test_nlu.yml")


def load(path):
    data, cur = [], None
    for line in open(path, encoding="utf-8"):
        m = re.match(r"- intent: (\w+)", line)
        if m:
            cur = m.group(1)
        elif cur and re.match(r"\s+- ", line):
            data.append((cur, line.strip()[2:]))
    return data


def parse(text):
    req = urllib.request.Request(f"{URL}/model/parse?token={TOKEN}", json.dumps({"text": text}).encode())
    return json.load(urllib.request.urlopen(req, timeout=10))


def script_of(t):
    if re.search(r"[඀-෿]", t):
        return "sinhala" if not re.search(r"[A-Za-z]{3,}", t) else "mixed"
    return "latin"  # English and Singlish both use Latin letters


rows = []
for gold, text in load(FILE):
    r = parse(text)
    ranking = r["intent_ranking"]
    top, conf = r["intent"]["name"], r["intent"]["confidence"]
    margin = conf - (ranking[1]["confidence"] if len(ranking) > 1 else 0)
    handled = top not in ("nlu_fallback", "out_of_scope") and conf >= HIGH and margin >= MIN_MARGIN
    pred = top if handled else "→llm"
    correct = (pred == "→llm") if gold == "out_of_scope" else (pred == gold)
    rows.append(dict(gold=gold, text=text, top=top, conf=conf, pred=pred, correct=correct, handled=handled, script=script_of(text)))

total = len(rows)
handled = [r for r in rows if r["handled"]]
wrong_handled = [r for r in handled if r["pred"] != r["gold"]]
in_scope = [r for r in rows if r["gold"] != "out_of_scope"]
missed = [r for r in in_scope if not r["handled"]]

print(f"Threshold: confidence >= {HIGH}, margin >= {MIN_MARGIN}\n")
print(f"{'intent':24}{'support':>8}{'precision':>11}{'recall':>8}")
for it in sorted({r['gold'] for r in rows}):
    if it == "out_of_scope":
        continue
    tp = sum(1 for r in rows if r["gold"] == it and r["pred"] == it)
    fp = sum(1 for r in rows if r["gold"] != it and r["pred"] == it)
    n = sum(1 for r in rows if r["gold"] == it)
    print(f"{it:24}{n:>8}{(tp/(tp+fp) if tp+fp else 1.0):>11.2f}{tp/n:>8.2f}")

print(f"\nMessages: {total} ({len(in_scope)} in scope, {total-len(in_scope)} out of scope)")
print(f"Handled by Rasa (no router LLM call): {len(handled)}/{total} = {len(handled)/total:.0%}")
print(f"  of in-scope messages: {len(in_scope)-len(missed)}/{len(in_scope)} = {(len(in_scope)-len(missed))/len(in_scope):.0%}")
print(f"WRONG intent executed: {len(wrong_handled)} ({len(wrong_handled)/max(1,len(handled)):.1%} of handled)")
print(f"Overall correct routing (incl. correct → LLM for out-of-scope): {sum(r['correct'] for r in rows)}/{total} = {sum(r['correct'] for r in rows)/total:.0%}")

by_script = defaultdict(lambda: [0, 0, 0])
for r in in_scope:
    s = by_script[r["script"]]
    s[0] += 1; s[1] += r["handled"] and r["pred"] == r["gold"]; s[2] += r["handled"] and r["pred"] != r["gold"]
print("\nIn-scope by script (Latin = English + Singlish):")
for k, (n, ok, bad) in by_script.items():
    print(f"  {k:8} n={n:3} handled-correct={ok/n:.0%} wrong={bad}")

print("\nWrongly handled:")
for r in wrong_handled:
    print(f"  [{r['gold']} → {r['pred']} @{r['conf']:.2f}] {r['text']}")
print("\nSent to LLM although in scope:")
for r in missed:
    print(f"  [{r['gold']} top={r['top']} @{r['conf']:.2f}] {r['text']}")
oos = [r for r in rows if r["gold"] == "out_of_scope" and r["handled"]]
print("\nOut-of-scope wrongly handled:", [(r['text'], r['pred']) for r in oos] or "none")

os.makedirs(os.path.join(os.path.dirname(__file__), "..", "results"), exist_ok=True)
json.dump(rows, open(os.path.join(os.path.dirname(__file__), "..", "results", "evaluation.json"), "w"), ensure_ascii=False, indent=1)
sys.exit(1 if wrong_handled else 0)
