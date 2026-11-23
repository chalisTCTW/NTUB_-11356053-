import json
import re
import time
from pathlib import Path

import requests
from bs4 import BeautifulSoup

URL = "https://ntcbadm.ntub.edu.tw/pub/TchSchedule_Search.aspx"
ROOT = Path(__file__).resolve().parent.parent
FOCUS = re.compile(r"資訊管理|資管|應用外語|應外|企業管理|企管")
TERMS = [("113", "1"), ("113", "2"), ("114", "1"), ("114", "2"), ("115", "1")]

s = requests.Session()
s.headers["User-Agent"] = "Mozilla/5.0"


def form_of(soup):
    data = {}
    for el in soup.select("input[name]"):
        if el.get("type") not in ("submit", "image"):
            data[el["name"]] = el.get("value", "")
    for sel in soup.select("select[name]"):
        opt = sel.find("option", selected=True) or sel.find("option")
        data[sel["name"]] = opt["value"] if opt else ""
    return data


def post(soup, values, target=""):
    data = form_of(soup)
    data.update(values)
    data["__EVENTTARGET"] = target
    if not target:
        data["btnSearch"] = "查詢"
    r = s.post(URL, data=data, timeout=30)
    r.raise_for_status()
    time.sleep(0.3)
    return BeautifulSoup(r.text, "html.parser")


def options(soup, sel_id):
    return [(o["value"], o.get_text(strip=True)) for o in soup.select(f"#{sel_id} option") if o["value"] != "-1"]


def rows(soup):
    table = soup.find(id="dsCurList")
    if not table:
        return []
    out = []
    for tr in table.find_all("tr", recursive=False)[1:]:
        cells = [td.get_text(" ", strip=True) for td in tr.find_all("td") if not td.find("td")]
        if len(cells) >= 10 and not cells[2].startswith("ntcb"):
            out.append(cells[:10])
    return out


def main():
    home = BeautifulSoup(s.get(URL, timeout=30).text, "html.parser")
    edus = [(v, t.split(" ", 1)[-1]) for v, t in options(home, "ddlEdu") if "校外" not in t]
    result = {"c": [], "d": {}}
    for y, t in TERMS:
        for ev, en in edus:
            base = {"txtYears": y, "txtTerm": t, "ddlEdu": ev}
            d1 = post(home, base, "ddlEdu")
            for dv, dn in options(d1, "ddlDept"):
                result["d"][f"{ev}|{dv}"] = [en, dn]
                if not FOCUS.search(dn):
                    continue
                d2 = post(d1, {**base, "ddlDept": dv}, "ddlDept")
                d3 = post(d2, {**base, "ddlDept": dv, "ddlClass": "-1"})
                got = rows(d3)
                result["c"] += [[f"{y}-{t}", en, dn, *r] for r in got]
                print(y, t, en, dn, len(got))
    out = ROOT / "data" / "raw.json"
    out.write_text(json.dumps(result, ensure_ascii=False), encoding="utf-8")
    print(len(result["c"]), "rows ->", out)


if __name__ == "__main__":
    main()
