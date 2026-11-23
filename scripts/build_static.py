import shutil
from pathlib import Path

from jinja2 import Environment, FileSystemLoader

ROOT = Path(__file__).resolve().parent.parent
APP = ROOT / "app"
OUT = ROOT / "docs"

if OUT.exists():
    shutil.rmtree(OUT)
shutil.copytree(APP / "static", OUT / "static")
env = Environment(loader=FileSystemLoader(APP / "templates"))
html = env.get_template("index.html").render(mode="static", base="")
(OUT / "index.html").write_text(html, encoding="utf-8")
(OUT / ".nojekyll").write_text("")
print("static site ->", OUT)
