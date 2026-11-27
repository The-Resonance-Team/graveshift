import hashlib
import json
import os
import pathlib
import stat

target = pathlib.Path("/Users/xirothedev/workspace/graveshift")
run = pathlib.Path(__file__).parent
manifest = json.loads((run / "source-manifest.json").read_text())
changed = []
for entry in manifest:
    if "sha256" not in entry:
        continue
    file = target / entry["path"]
    try:
        fd = os.open(file, os.O_RDONLY | os.O_NOFOLLOW | os.O_NONBLOCK)
        try:
            info = os.fstat(fd)
            if not stat.S_ISREG(info.st_mode) or info.st_size != entry["bytes"]:
                changed.append(entry["path"])
                continue
            digest = hashlib.sha256()
            while True:
                data = os.read(fd, 65536)
                if not data:
                    break
                digest.update(data)
            if digest.hexdigest() != entry["sha256"]:
                changed.append(entry["path"])
        finally:
            os.close(fd)
    except OSError:
        changed.append(entry["path"])
result = {"unchanged": not changed, "changed_paths": changed}
destination = run / "source-consistency.json"
destination.write_text(json.dumps(result, indent=2) + "\n")
print(json.dumps(result))
