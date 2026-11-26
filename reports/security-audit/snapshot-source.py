import hashlib
import errno
import json
import os
import pathlib
import stat
import subprocess

target = pathlib.Path("/Users/xirothedev/workspace/graveshift")
output = pathlib.Path(__file__).parent
result = subprocess.run(
    ["git", "ls-files", "-z"],
    cwd=target,
    capture_output=True,
    check=True,
    env={"PATH": "/usr/bin:/bin", "LANG": "C.UTF-8"},
)
paths = result.stdout.decode("utf-8").split("\0")
paths += ["examples/haunted-candy-shop/graveshift.config.yaml"]
manifest = []
for rel in sorted(set(item for item in paths if item)):
    file = target / rel
    if any(
        part in {".git", "node_modules"} for part in pathlib.PurePosixPath(rel).parts
    ):
        continue
    if file.name.startswith(".env") or file.suffix in {".pem", ".key"}:
        manifest.append(
            {"path": rel, "status": "sensitive-name-excluded-from-content-hash"}
        )
        continue
    flags = os.O_RDONLY | os.O_NOFOLLOW | os.O_NONBLOCK
    try:
        fd = os.open(file, flags)
    except OSError as error:
        if error.errno in {errno.ELOOP, errno.EMLINK}:
            manifest.append({"path": rel, "status": "symlink-not-followed"})
            continue
        raise
    try:
        info = os.fstat(fd)
        if not stat.S_ISREG(info.st_mode) or info.st_size > 10 * 1024 * 1024:
            manifest.append({"path": rel, "status": "nonregular-or-over-size-excluded"})
            continue
        digest = hashlib.sha256()
        while True:
            block = os.read(fd, 65536)
            if not block:
                break
            digest.update(block)
        manifest.append(
            {"path": rel, "bytes": info.st_size, "sha256": digest.hexdigest()}
        )
    finally:
        os.close(fd)
destination = output / "source-manifest.json"
with destination.open("x") as file:
    json.dump(manifest, file, indent=2)
    file.write("\n")
print(f"Recorded source hashes for {len(manifest)} files")
