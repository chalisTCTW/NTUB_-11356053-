import json
from pathlib import Path

from flask import Flask, jsonify, render_template, request, session

BASE = Path(__file__).resolve().parent
DATA = json.loads((BASE / "static" / "courses.json").read_text(encoding="utf-8"))
COURSES = {c["id"]: c for c in DATA["courses"]}
MAX_CREDIT = 25

app = Flask(__name__)
app.secret_key = "ntub-course-demo"


def match(c, a):
    if a.get("term") and c["term"] != a["term"]:
        return False
    if a.get("group") and c["group"] != a["group"]:
        return False
    if a.get("edu") and c["edu"] != a["edu"]:
        return False
    if a.get("dept") and c["dept"] != a["dept"]:
        return False
    if a.get("kind") and a["kind"] not in c["kind"]:
        return False
    if a.get("day") and not any(str(d) == a["day"] for d, _ in c["slots"]):
        return False
    q = a.get("q", "").strip().lower()
    if q:
        text = " ".join([c["name"], c["code"], c["cls"], *c["teachers"]]).lower()
        if q not in text:
            return False
    return True


def picked(term):
    ids = session.get("picks", {}).get(term, [])
    return [COURSES[i] for i in ids if i in COURSES]


def check_add(c):
    mine = picked(c["term"])
    if any(m["id"] == c["id"] for m in mine):
        return "已在課表中"
    if any(m["code"] == c["code"] for m in mine):
        return "已選過相同科目"
    if c["limit"] and c["taken"] >= c["limit"]:
        return "人數已額滿"
    if sum(m["credit"] for m in mine) + c["credit"] > MAX_CREDIT:
        return f"超過學分上限 {MAX_CREDIT}"
    used = {(d, p): m["name"] for m in mine for d, p in m["slots"]}
    for d, p in c["slots"]:
        if (d, p) in used:
            return f"與「{used[(d, p)]}」衝堂"
    return None


@app.get("/")
def index():
    return render_template("index.html", mode="flask", base="/")


@app.get("/api/meta")
def meta():
    return jsonify(terms=DATA["terms"], depts=DATA["depts"], days=DATA["days"], user=session.get("user"), max_credit=MAX_CREDIT)


@app.get("/api/courses")
def courses():
    rows = [c for c in DATA["courses"] if match(c, request.args)]
    return jsonify(rows)


@app.post("/api/login")
def login():
    body = request.get_json(force=True)
    sid = (body.get("sid") or "").strip()
    if not sid or not (body.get("pw") or ""):
        return jsonify(error="請輸入學號與密碼"), 400
    session["user"] = {"sid": sid, "name": body.get("name") or f"同學 {sid[-3:]}"}
    session.setdefault("picks", {})
    return jsonify(user=session["user"])


@app.post("/api/logout")
def logout():
    session.clear()
    return jsonify(ok=True)


@app.get("/api/picks/<term>")
def get_picks(term):
    if not session.get("user"):
        return jsonify(error="請先登入"), 401
    return jsonify(picked(term))


@app.post("/api/picks/<term>/<path:cid>")
def add_pick(term, cid):
    if not session.get("user"):
        return jsonify(error="請先登入"), 401
    c = COURSES.get(cid)
    if not c or c["term"] != term:
        return jsonify(error="找不到課程"), 404
    err = check_add(c)
    if err:
        return jsonify(error=err), 409
    picks = session.get("picks", {})
    picks.setdefault(term, []).append(cid)
    session["picks"] = picks
    return jsonify(picked(term))


@app.delete("/api/picks/<term>/<path:cid>")
def drop_pick(term, cid):
    if not session.get("user"):
        return jsonify(error="請先登入"), 401
    picks = session.get("picks", {})
    picks[term] = [i for i in picks.get(term, []) if i != cid]
    session["picks"] = picks
    return jsonify(picked(term))


if __name__ == "__main__":
    app.run(debug=True)
