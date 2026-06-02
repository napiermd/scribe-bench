# PriMock57 adapter

[PriMock57](https://github.com/babylonhealth/primock57) is 57 audio-grounded mock
primary-care consultations with utterance-level transcripts and clinician-written
reference notes, released by Babylon Health under **CC-BY-4.0**. It is the audio-grounded
public anchor for ScribeBench.

It is **fetched, not vendored** (the audio is large and git-LFS-tracked):

```bash
bash scripts/fetch_primock57.sh
```

That clones the upstream repo into `data/primock57/primock57/`.

## Converting to ScribeBench cases

The adapter `scripts/build_primock57_cases.ts` parses both speaker `.TextGrid`
files per consultation, merges their utterances in time order into a
`Doctor:`/`Patient:` transcript, and pairs it with the clinician-written note:

- `source` ← the time-merged consultation transcript (markup stripped)
- `reference` ← the clinician-written note (`notes/<base>.json` → `note`)
- `provenance` ← `"primock57"`

```bash
bash scripts/fetch_primock57.sh                 # clone upstream (CC-BY)
npx tsx scripts/build_primock57_cases.ts        # → data/primock57/cases/ (57 cases)
npx tsx eval/run_benchmark.ts --dataset data/primock57/cases --candidate <notes>.json ...
```

The 57 derived cases are vendored under `data/primock57/cases/` (CC-BY-4.0
permits redistribution of derivatives with attribution — see below).

## Citation

```
@inproceedings{korfiatis2022primock57,
  title={PriMock57: A Dataset Of Primary Care Mock Consultations},
  author={Papadopoulos Korfiatis, Alex and Moramarco, Francesco and Sarac, Radmila and Savkov, Aleksandar},
  booktitle={Proceedings of the 60th Annual Meeting of the Association for Computational Linguistics},
  year={2022}
}
```
