import base64
import json
import os
import shutil
import socket
import subprocess
import tempfile
import time
import urllib.error
import urllib.request
from concurrent.futures import ThreadPoolExecutor
from pathlib import Path
from uuid import uuid4


ROOT = Path(__file__).resolve().parents[1]


def find_free_port() -> int:
    with socket.socket() as sock:
        sock.bind(("127.0.0.1", 0))
        return sock.getsockname()[1]


def choose_server_command():
    custom = os.environ.get("CURIOSITY_SERVER_CMD")
    if custom:
        return custom.split()

    php = shutil.which("php")
    if php:
        return [php, "-S", "127.0.0.1:{port}", "-t", "."]

    raise RuntimeError("PHP is required to run the smoke test.")


def wait_for_server(base_url: str, timeout: float = 20.0):
    deadline = time.time() + timeout

    while time.time() < deadline:
        try:
            with urllib.request.urlopen(f"{base_url}/api/items.php", timeout=2) as response:
                if response.status == 200:
                    return
        except Exception:
            time.sleep(0.25)

    raise RuntimeError("Server did not start in time.")


def build_multipart(fields, files):
    boundary = f"----CuriosityBoundary{uuid4().hex}"
    body = bytearray()

    for name, value in fields.items():
        body.extend(f"--{boundary}\r\n".encode())
        body.extend(f'Content-Disposition: form-data; name="{name}"\r\n\r\n'.encode())
        body.extend(str(value).encode())
        body.extend(b"\r\n")

    for name, file_info in files.items():
        filename, content_type, content = file_info
        body.extend(f"--{boundary}\r\n".encode())
        body.extend(
            f'Content-Disposition: form-data; name="{name}"; filename="{filename}"\r\n'.encode()
        )
        body.extend(f"Content-Type: {content_type}\r\n\r\n".encode())
        body.extend(content)
        body.extend(b"\r\n")

    body.extend(f"--{boundary}--\r\n".encode())
    return bytes(body), f"multipart/form-data; boundary={boundary}"


def request_json(base_url, method, path, fields=None, files=None, headers=None):
    body, content_type = build_multipart(fields or {}, files or {})
    request = urllib.request.Request(
        f"{base_url}{path}",
        data=body,
        method=method,
        headers={"Content-Type": content_type, **(headers or {})},
    )

    try:
        with urllib.request.urlopen(request, timeout=10) as response:
            return response.status, json.loads(response.read().decode())
    except urllib.error.HTTPError as error:
        payload = json.loads(error.read().decode())
        return error.code, payload


def get_json(base_url, path, headers=None):
    request = urllib.request.Request(f"{base_url}{path}", headers=headers or {})
    try:
        with urllib.request.urlopen(request, timeout=10) as response:
            return response.status, json.loads(response.read().decode())
    except urllib.error.HTTPError as error:
        payload = json.loads(error.read().decode())
        return error.code, payload


def get_text(base_url, path, headers=None):
    request = urllib.request.Request(f"{base_url}{path}", headers=headers or {})
    try:
        with urllib.request.urlopen(request, timeout=10) as response:
            return response.status, response.read().decode()
    except urllib.error.HTTPError as error:
        return error.code, error.read().decode()


def get_headers(base_url, path, headers=None):
    request = urllib.request.Request(f"{base_url}{path}", headers=headers or {})
    with urllib.request.urlopen(request, timeout=10) as response:
        return response.status, dict(response.headers.items())


def load_codes():
    php_path = ROOT / "config" / "participant_codes.php"
    if php_path.is_file():
        php = shutil.which("php")
        if not php:
            raise RuntimeError("PHP is required to read participant codes.")

        result = subprocess.run(
            [php, "-r", "echo json_encode(require 'config/participant_codes.php');"],
            cwd=ROOT,
            check=True,
            capture_output=True,
            text=True,
        )
        payload = json.loads(result.stdout)
        return payload["codes"]

    text_path = ROOT / "config" / "participant_codes.txt"
    if text_path.is_file():
        return [line.strip() for line in text_path.read_text().splitlines() if line.strip()]

    raise RuntimeError("No participant code file found.")


def find_unknown_code(codes):
    existing = set(codes)

    for first in "ABCDEFGHIJKLMNOPQRSTUVWXYZ":
        for second in "ABCDEFGHIJKLMNOPQRSTUVWXYZ":
            for third in "ABCDEFGHIJKLMNOPQRSTUVWXYZ":
                for fourth in "ABCDEFGHIJKLMNOPQRSTUVWXYZ":
                    candidate = f"{first}{second}{third}{fourth}"
                    if candidate not in existing:
                        return candidate

    raise RuntimeError("No free participant code available for test.")


PNG_BYTES = base64.b64decode(
    "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVQIHWP4////fwAJ+wP9lUTk3QAAAABJRU5ErkJggg=="
)
GLB_BYTES = b"glTF\x02\x00\x00\x00\x14\x00\x00\x00\x00\x00\x00\x00"


def make_submission(base_url, participant_id, suffix=""):
    return request_json(
        base_url,
        "POST",
        "/api/upload.php",
        fields={
            "participant_id": participant_id,
            "name": f"Artefact {participant_id}{suffix}",
            "description": f"Description {participant_id}{suffix}",
            "author": "Testeur",
        },
        files={"image": (f"image-{participant_id}.png", "image/png", PNG_BYTES)},
    )


def main():
    codes = load_codes()
    unknown_code = find_unknown_code(codes)

    with tempfile.TemporaryDirectory() as temp_dir:
        port = find_free_port()
        base_url = f"http://127.0.0.1:{port}"
        env = os.environ.copy()
        env["CURIOSITY_DATA_DIR"] = str(Path(temp_dir) / "data")

        server_command = [part.format(port=port) for part in choose_server_command()]
        process = subprocess.Popen(
            server_command,
            cwd=ROOT,
            env=env,
            stdout=subprocess.PIPE,
            stderr=subprocess.PIPE,
        )

        try:
            wait_for_server(base_url)

            status, _ = get_text(base_url, "/")
            assert status == 200, status

            status, _ = get_text(base_url, "/submit/")
            assert status == 200, status

            status, _ = get_text(base_url, "/admin/")
            assert status == 200, status

            status, payload = make_submission(base_url, codes[0])
            assert status == 201, payload
            item_id = payload["item"]["id"]
            assert payload["item"]["has_model"] is False, payload

            status, payload = make_submission(base_url, "ABC1", "-invalid")
            assert status == 400, payload

            status, payload = make_submission(base_url, codes[0], "-replace")
            assert status == 200, payload
            assert payload["item"]["id"] == item_id, payload
            assert payload["item"]["has_model"] is False, payload

            status, payload = make_submission(base_url, unknown_code, "-unknown-code")
            assert status == 403, payload

            status, payload = request_json(
                base_url,
                "POST",
                "/api/upload.php",
                fields={
                    "participant_id": codes[1],
                    "name": "Artefact invalide",
                    "description": "Description",
                },
                files={"image": ("notes.txt", "text/plain", b"oops")},
            )
            assert status == 400, payload

            status, payload = get_json(base_url, "/api/admin-items.php")
            assert status == 200, payload
            assert isinstance(payload["items"], list), payload

            status, payload = request_json(
                base_url,
                "POST",
                f"/api/upload-model.php?id={item_id}",
                files={"model": ("model.glb", "model/gltf-binary", GLB_BYTES)},
            )
            assert status == 200, payload
            assert payload["item"]["has_model"] is True, payload

            media_status, media_headers = get_headers(base_url, payload["item"]["model_url"])
            assert media_status == 200, media_headers
            assert media_headers["Content-Disposition"].startswith("attachment;"), media_headers
            assert "model.glb" in media_headers["Content-Disposition"], media_headers

            status, payload = make_submission(base_url, codes[0], "-replace-after-model")
            assert status == 200, payload
            assert payload["item"]["id"] == item_id, payload
            assert payload["item"]["has_model"] is False, payload
            assert payload["item"]["model_url"] is None, payload

            status, payload = request_json(
                base_url,
                "POST",
                f"/api/upload-model.php?id={item_id}",
                files={"model": ("model.txt", "text/plain", b"not glb")},
            )
            assert status == 400, payload

            status, payload = request_json(
                base_url,
                "POST",
                f"/api/delete-item.php?id={item_id}",
            )
            assert status == 200, payload
            assert payload["item"]["id"] == item_id, payload

            status, payload = get_json(base_url, "/api/items.php")
            assert status == 200, payload
            assert all(item["id"] != item_id for item in payload["items"]), payload

            status, payload = request_json(
                base_url,
                "POST",
                f"/api/delete-item.php?id={item_id}",
            )
            assert status == 404, payload

            status, payload = make_submission(base_url, codes[0], "-after-delete")
            assert status == 201, payload
            item_id = payload["item"]["id"]

            with ThreadPoolExecutor(max_workers=4) as pool:
                different_results = list(
                    pool.map(
                        lambda args: make_submission(base_url, args[0], args[1]),
                        [
                            (codes[2], "-bulk-1"),
                            (codes[3], "-bulk-2"),
                            (codes[4], "-bulk-3"),
                            (codes[5], "-bulk-4"),
                        ],
                    )
                )
            assert all(status == 201 for status, _ in different_results), different_results

            with ThreadPoolExecutor(max_workers=2) as pool:
                same_results = list(
                    pool.map(
                        lambda args: make_submission(base_url, args[0], args[1]),
                        [(codes[6], "-same-1"), (codes[6], "-same-2")],
                    )
                )
            status_codes = sorted(status for status, _ in same_results)
            assert status_codes == [200, 201], same_results

            status, payload = get_json(base_url, "/api/items.php")
            assert status == 200, payload
            assert len(payload["items"]) >= 6, payload
            assert all("participant_id" not in item for item in payload["items"]), payload
            participant_names = [item["name"] for item in payload["items"]]
            assert "Artefact " + codes[0] + "-after-delete" in participant_names, payload

            status, payload = get_json(
                base_url,
                "/api/admin-items.php",
            )
            assert status == 200, payload
            assert all("participant_id" in item for item in payload["items"]), payload
            participant_ids = [item["participant_id"] for item in payload["items"]]
            assert participant_ids.count(codes[0]) == 1, payload
            assert participant_ids.count(codes[6]) == 1, payload

            index_path = Path(temp_dir) / "data" / "index.json"
            index_data = json.loads(index_path.read_text())
            assert isinstance(index_data, list), index_data
            assert all("participant_id" in item for item in index_data), index_data
            assert sum(1 for item in index_data if item["participant_id"] == codes[0]) == 1, index_data
            assert sum(1 for item in index_data if item["participant_id"] == codes[6]) == 1, index_data

            print("API smoke tests passed.")
        finally:
            process.terminate()
            try:
                process.wait(timeout=5)
            except subprocess.TimeoutExpired:
                process.kill()

            stderr_output = process.stderr.read().decode().strip()
            if process.returncode not in (0, -15):
                raise RuntimeError(stderr_output or "PHP server exited unexpectedly.")


if __name__ == "__main__":
    main()
