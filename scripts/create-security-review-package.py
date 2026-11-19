"""Create a source-only review ZIP without local credentials or build outputs."""

from pathlib import Path
import re
import subprocess
import sys
from zipfile import ZipFile, ZIP_DEFLATED


ROOT = Path(__file__).resolve().parents[1]
EXTRA = (
    "docs/CLAUDE_SECURITY_REVIEW_2026-11-19.md",
    "docs/TTOK_V7_PHASE1_2026-11-19.md",
    "services/creditPolicy.ts",
    "tests/credit-policy.test.mjs",
    "scripts/create-security-review-package.py",
)
ALLOWED_EXTENSIONS = {
    ".ts", ".tsx", ".js", ".jsx", ".mjs", ".cjs", ".java", ".kt",
    ".swift", ".xml", ".gradle", ".properties", ".plist", ".css",
    ".html", ".md", ".json", ".yaml", ".yml", ".rules", ".py",
}
EXCLUDE_PARTS = {
    "node_modules", "vendor", "dist", "build", "coverage", ".npm-cache",
    "Pods", ".gradle", "release-artifacts", "generated", "gradle-wrapper.jar",
}
SECRET_MARKERS = [
    re.compile(rb"-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----"),
    re.compile(rb"AIza[0-9A-Za-z_-]{30,}"),
    re.compile(rb"gh[pousr]_[0-9A-Za-z]{20,}"),
    re.compile(rb"sk-(?:proj-)?[0-9A-Za-z_-]{20,}"),
]


def included(path: Path) -> bool:
    name = path.name.lower()
    if path.is_absolute() or ".." in path.parts or any(p in EXCLUDE_PARTS for p in path.parts):
        return False
    if name.startswith(".env") or "keystore" in name or "google-services" in name:
        return False
    if name in {"firebase-applet-config.json", "firebase-blueprint.json"}:
        return False
    if path.suffix.lower() not in ALLOWED_EXTENSIONS:
        return False
    if path.parts[0] == "docs" and path.as_posix() not in EXTRA:
        return False
    return True


def main() -> None:
    if len(sys.argv) != 2:
        raise SystemExit("Usage: python scripts/create-security-review-package.py OUTPUT.zip")
    output = Path(sys.argv[1]).resolve()
    tracked = subprocess.check_output(["git", "ls-files", "-z"], cwd=ROOT)
    names = {Path(raw.decode("utf-8")) for raw in tracked.split(b"\0") if raw}
    names.update(Path(name) for name in EXTRA)
    files = sorted((p for p in names if included(p) and (ROOT / p).is_file()), key=str)
    if not files:
        raise RuntimeError("No review files found")
    reviewed: dict[Path, bytes] = {}
    redacted_files: list[str] = []
    for path in files:
        data = (ROOT / path).read_bytes()
        if len(data) > 2_000_000 or b"\0" in data:
            raise RuntimeError(f"Unexpected binary or large file: {path}")
        for marker in SECRET_MARKERS:
            data, count = marker.subn(b"REDACTED_FOR_SECURITY_REVIEW", data)
            if count:
                redacted_files.append(path.as_posix())
        reviewed[path] = data
    output.parent.mkdir(parents=True, exist_ok=True)
    with ZipFile(output, "w", ZIP_DEFLATED) as archive:
        for path in files:
            archive.writestr(path.as_posix(), reviewed[path])
    print(f"Created {output} with {len(files)} source files; redacted: {sorted(set(redacted_files))}")


if __name__ == "__main__":
    main()
