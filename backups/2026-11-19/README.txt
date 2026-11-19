Encrypted board-game handoff — November 19, 2026

This archive branch stores only AES-256-GCM ciphertext for the local board-game
files and results. The private decryption key is in the user's Dropbox handoff
as GITHUB-LFS-RESTORE-KEY.json and is never committed to this repository.
The original source branches and dated source snapshots remain ordinary Git
branches/tags. No game is merged, promoted or deployed by this archive branch.

After cloning this branch, run git lfs pull. From backups/2026-11-19, run:

  python3 restore_encrypted_github_backup.py --key-file /path/to/GITHUB-LFS-RESTORE-KEY.json --output /path/to/NEW_ARCHIVE_DIRECTORY --extract-to /path/to/NEW_RESTORED_FILES_DIRECTORY

Use a Python environment with the cryptography package installed. The loaner's
/opt/anaconda3/bin/python already has it. With another Python, install it with
python3 -m pip install cryptography. Decryption checks the private manifest
fingerprint, authenticated GCM tags, ciphertext hashes and plaintext archive
hashes before extraction checks every original file's SHA-256.

Rules grounding: this is archival preservation of existing #game-report
evidence and versioned source. The #computer-rivals section and AGENTS.md's
canonical bot policy keep historical results separate from new browser-policy
studies. No rule, saved-state meaning, gameplay decision or live asset changes.
See docs/playtest-workflow.md for the playtest/promotion workflow.
