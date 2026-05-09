"""Build the Cloudflare Pages static bundle from the Flask project assets."""
from __future__ import annotations

import json
import shutil
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
PUBLIC = ROOT / "public"
STATIC = ROOT / "static"
TEMPLATES = ROOT / "templates"
KNOWLEDGE_BASE = ROOT / "knowledge_base"


def ensure_dir(path: Path) -> None:
    path.mkdir(parents=True, exist_ok=True)


def copy_file(source: Path, target: Path) -> None:
    ensure_dir(target.parent)
    shutil.copy2(source, target)


def copy_tree(source: Path, target: Path) -> None:
    if target.exists():
        shutil.rmtree(target)
    shutil.copytree(source, target)


def build_index() -> None:
    source = TEMPLATES / "index.html"
    target = PUBLIC / "index.html"
    copy_file(source, target)


def build_static_assets() -> None:
    copy_tree(STATIC, PUBLIC / "static")


def build_knowledge_base() -> None:
    target = PUBLIC / "knowledge_base"
    ensure_dir(target)
    for path in KNOWLEDGE_BASE.glob("*.json"):
        copy_file(path, target / path.name)


def write_pages_marker() -> None:
    marker = {
        "runtime": "cloudflare-pages",
        "source": "BookWise AI Flask project",
        "generated": True,
    }
    ensure_dir(PUBLIC)
    (PUBLIC / ".bookwise-pages.json").write_text(json.dumps(marker, indent=2), encoding="utf-8")


def main() -> None:
    ensure_dir(PUBLIC)
    build_index()
    build_static_assets()
    build_knowledge_base()
    write_pages_marker()
    print(f"Built Cloudflare Pages bundle in {PUBLIC}")


if __name__ == "__main__":
    main()
