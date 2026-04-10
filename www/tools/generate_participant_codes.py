#!/usr/bin/env python3
from __future__ import annotations

import secrets
from pathlib import Path


COUNT = 30
ALPHABET = "ABCDEFGHIJKLMNOPQRSTUVWXYZ"


def build_code() -> str:
    return "".join(secrets.choice(ALPHABET) for _ in range(4))


def unique_codes(count: int) -> list[str]:
    generated: list[str] = []

    while len(generated) < count:
        code = build_code()
        if code not in generated:
            generated.append(code)

    return generated


def render_php(codes: list[str]) -> str:
    lines = [
        "<?php",
        "declare(strict_types=1);",
        "",
        "return [",
        "    'codes' => [",
    ]

    for code in codes:
        lines.append(f"        '{code}',")

    lines.extend([
        "    ],",
        "];",
        "",
    ])
    return "\n".join(lines)


def render_text(codes: list[str]) -> str:
    return "\n".join(codes) + "\n"


def main() -> None:
    root = Path(__file__).resolve().parents[1]
    config_dir = root / "config"
    config_dir.mkdir(parents=True, exist_ok=True)

    codes = unique_codes(COUNT)
    php_output_path = config_dir / "participant_codes.php"
    text_output_path = config_dir / "participant_codes.txt"
    php_output_path.write_text(render_php(codes), encoding="utf-8")
    text_output_path.write_text(render_text(codes), encoding="utf-8")

    print(f"Wrote {COUNT} participant codes to {php_output_path}")
    print(f"Wrote printable code list to {text_output_path}")
    for code in codes:
        print(code)


if __name__ == "__main__":
    main()
