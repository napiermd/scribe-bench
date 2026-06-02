#!/usr/bin/env bash
# Fetch PriMock57 (CC-BY-4.0) into data/primock57/primock57/.
# Not vendored because the audio is stored in git-LFS and is large.
set -euo pipefail

DEST="$(cd "$(dirname "$0")/.." && pwd)/data/primock57/primock57"

if ! command -v git-lfs >/dev/null 2>&1; then
  echo "git-lfs is required (audio files are LFS-tracked)."
  echo "  macOS:  brew install git-lfs && git lfs install"
  echo "  linux:  sudo apt-get install git-lfs && git lfs install"
  exit 1
fi

if [ -d "$DEST/.git" ]; then
  echo "PriMock57 already present at $DEST — pulling latest."
  git -C "$DEST" pull --ff-only
else
  echo "Cloning PriMock57 into $DEST ..."
  git clone https://github.com/babylonhealth/primock57.git "$DEST"
fi

echo "Done. Transcripts: $DEST/transcripts  |  Clinician notes: $DEST/notes"
echo "Adapter to convert these into ScribeBench cases: see data/primock57/README.md"
