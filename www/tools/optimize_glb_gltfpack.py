#!/usr/bin/env python3
from __future__ import annotations

import argparse
import json
import os
import shutil
import subprocess
import sys
from pathlib import Path


DEFAULT_GLTFPACK_ARGS = ("-tw", "-kn", "-km")


def human_size(size: int) -> str:
    value = float(size)
    for unit in ("B", "KB", "MB", "GB"):
        if value < 1024 or unit == "GB":
            return f"{value:.1f} {unit}" if unit != "B" else f"{int(value)} {unit}"
        value /= 1024
    return f"{value:.1f} GB"


def percent_saved(before: int, after: int) -> str:
    if before <= 0:
        return "0.0%"
    return f"{(1 - (after / before)) * 100:.1f}%"


def find_gltfpack(explicit_path: str | None) -> str:
    if explicit_path:
        candidate = Path(explicit_path).expanduser()
        if candidate.is_file() and os.access(candidate, os.X_OK):
            return str(candidate)
        raise SystemExit(f"gltfpack introuvable: {candidate}")

    resolved = shutil.which("gltfpack")
    if resolved:
        return resolved

    raise SystemExit(
        "gltfpack n'est pas installe ou pas dans le PATH.\n"
        "Installe-le depuis les releases meshoptimizer/gltfpack, puis relance ce script,\n"
        "ou passe le chemin avec --gltfpack /chemin/vers/gltfpack."
    )


def indexed_item_ids(items_dir: Path) -> list[str]:
    index_path = items_dir.parent / "index.json"
    if not index_path.is_file():
        raise SystemExit(f"Index introuvable: {index_path}. Utilise --all pour scanner tous les dossiers.")

    payload = json.loads(index_path.read_text(encoding="utf-8"))
    if not isinstance(payload, list):
        raise SystemExit(f"Index invalide: {index_path}")

    item_ids = []
    for entry in payload:
        if isinstance(entry, dict) and entry.get("has_model") and entry.get("id"):
            item_ids.append(str(entry["id"]))
    return item_ids


def collect_models(items_dir: Path, only: list[str], all_models: bool) -> list[Path]:
    if only:
        models = [items_dir / item_id / "model.glb" for item_id in only]
    elif all_models:
        models = sorted(items_dir.glob("*/model.glb"))
    else:
        models = [items_dir / item_id / "model.glb" for item_id in indexed_item_ids(items_dir)]

    missing = [model for model in models if not model.is_file()]
    if missing:
        formatted = "\n".join(f"- {path}" for path in missing)
        raise SystemExit(f"Modele(s) introuvable(s):\n{formatted}")

    return models


def restore_model(model_path: Path, dry_run: bool) -> None:
    backup_path = model_path.with_name("model.original.glb")
    if not backup_path.is_file():
        print(f"skip restore: {model_path} (pas de sauvegarde)")
        return

    print(f"restore: {backup_path} -> {model_path}")
    if not dry_run:
        shutil.copy2(backup_path, model_path)


def optimize_model(model_path: Path, gltfpack: str, dry_run: bool) -> None:
    backup_path = model_path.with_name("model.original.glb")
    temp_path = model_path.with_name("model.optimizing.glb")

    if not backup_path.exists():
        print(f"backup: {model_path} -> {backup_path}")
        if not dry_run:
            shutil.copy2(model_path, backup_path)

    source_path = backup_path if backup_path.exists() or not dry_run else model_path
    command = [
        gltfpack,
        "-i",
        str(source_path),
        "-o",
        str(temp_path),
        *DEFAULT_GLTFPACK_ARGS,
    ]

    print("run:", " ".join(command))
    if dry_run:
        return

    before_size = source_path.stat().st_size
    try:
        subprocess.run(command, check=True)
        if not temp_path.is_file():
            raise RuntimeError("gltfpack n'a pas produit de fichier de sortie.")

        temp_path.replace(model_path)
        after_size = model_path.stat().st_size
        print(
            f"done: {model_path}  "
            f"{human_size(before_size)} -> {human_size(after_size)}  "
            f"saved {percent_saved(before_size, after_size)}"
        )
    finally:
        if temp_path.exists():
            temp_path.unlink()


def parse_args() -> argparse.Namespace:
    root = Path(__file__).resolve().parents[1]

    parser = argparse.ArgumentParser(
        description=(
            "Optimise les model.glb avec gltfpack en mode compatible avec le viewer actuel "
            "(textures WebP, sans Meshopt/KTX2/Draco)."
        )
    )
    parser.add_argument(
        "--items-dir",
        type=Path,
        default=root / "data" / "items",
        help="Dossier contenant les artefacts. Defaut: www/data/items",
    )
    parser.add_argument(
        "--gltfpack",
        help="Chemin vers le binaire gltfpack si celui-ci n'est pas dans le PATH.",
    )
    parser.add_argument(
        "--only",
        action="append",
        default=[],
        metavar="ITEM_ID",
        help="Optimiser seulement un artefact donne. Peut etre repete.",
    )
    parser.add_argument(
        "--all",
        action="store_true",
        help="Scanner tous les dossiers de www/data/items, y compris ceux absents de index.json.",
    )
    parser.add_argument(
        "--restore",
        action="store_true",
        help="Restaurer model.glb depuis model.original.glb au lieu d'optimiser.",
    )
    parser.add_argument(
        "--dry-run",
        action="store_true",
        help="Afficher les actions sans modifier les fichiers.",
    )
    return parser.parse_args()


def main() -> int:
    args = parse_args()
    items_dir = args.items_dir.expanduser().resolve()
    if not items_dir.is_dir():
        raise SystemExit(f"Dossier introuvable: {items_dir}")

    models = collect_models(items_dir, args.only, args.all)
    if not models:
        print(f"Aucun model.glb trouve dans {items_dir}")
        return 0

    if args.restore:
        for model_path in models:
            restore_model(model_path, args.dry_run)
        return 0

    gltfpack = "<gltfpack>" if args.dry_run and not args.gltfpack else find_gltfpack(args.gltfpack)
    for model_path in models:
        optimize_model(model_path, gltfpack, args.dry_run)
    return 0


if __name__ == "__main__":
    sys.exit(main())
