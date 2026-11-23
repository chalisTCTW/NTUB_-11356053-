import json
import re
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
FOCUS = re.compile(r"資訊管理|資管|應用外語|應外|企業管理|企管")
GROUPS = [("資訊管理", re.compile(r"資訊管理|資管")), ("應用外語", re.compile(r"應用外語|應外")), ("企業管理", re.compile(r"企業管理|企管"))]
DAYS = "一二三四五六日"


def group_of(name):
    for g, rx in GROUPS:
        if rx.search(name):
            return g
    return None


def parse_time(s):
    when, _, room = s.partition("/")
    slots = []
    for tok in when.split():
        if len(tok) >= 2 and tok[0].isdigit():
            slots.append([int(tok[0]), int(tok[1:])])
    return slots, room.strip()


def parse_teachers(s):
    out = []
    for t in s.split(","):
        parts = t.strip().split(" ", 1)
        out.append(parts[1] if len(parts) == 2 else parts[0])
    return [t for t in out if t]


def to_num(s):
    try:
        return float(s)
    except ValueError:
        return 0.0


def build(raw):
    courses = []
    for i, r in enumerate(raw["c"]):
        term, edu, dept, cls, seq, code, name, teacher, tp, credit, hours, cap, kind = r
        slots, room = parse_time(tp)
        limit, _, taken = cap.partition("/")
        courses.append({
            "id": f"{term}-{cls}-{seq}",
            "term": term,
            "edu": edu,
            "dept": dept,
            "group": group_of(dept),
            "cls": cls,
            "seq": seq,
            "code": code,
            "name": name,
            "teachers": parse_teachers(teacher),
            "slots": slots,
            "room": room,
            "credit": to_num(credit),
            "hours": to_num(hours),
            "limit": int(limit or 0),
            "taken": int(taken or 0),
            "kind": kind,
        })
    seen = {}
    for c in courses:
        seen.setdefault(c["id"], c)
    courses = list(seen.values())

    depts = {}
    for edu, name in raw["d"].values():
        depts.setdefault(edu, set()).add(name)
    catalog = []
    for edu in sorted(depts):
        for name in sorted(depts[edu]):
            catalog.append({"edu": edu, "dept": name, "ready": bool(FOCUS.search(name))})

    terms = sorted({c["term"] for c in courses}, reverse=True)
    return {"terms": terms, "depts": catalog, "days": DAYS, "courses": courses}


def main():
    src = Path(sys.argv[1]) if len(sys.argv) > 1 else ROOT / "data" / "raw.json"
    raw = json.loads(src.read_text(encoding="utf-8"))
    data = build(raw)
    out = ROOT / "app" / "static" / "courses.json"
    out.write_text(json.dumps(data, ensure_ascii=False, separators=(",", ":")), encoding="utf-8")
    print(f"{len(data['courses'])} courses, {len(data['terms'])} terms -> {out}")


if __name__ == "__main__":
    main()
