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

Each ScribeBench case is `{ id, source, reference, tags, provenance }` (see
`eval/types.ts`). For PriMock57:

- `source` ← the collated consultation transcript (`transcripts/`)
- `reference` ← the clinician-written note (`notes/`)
- `provenance` ← `"primock57"`

A small adapter (`scripts/build_primock57_cases.ts`) is on the v0.2 roadmap. Until
then, point `--dataset` at a directory of converted case JSON files.

## Citation

```
@inproceedings{korfiatis2022primock57,
  title={PriMock57: A Dataset Of Primary Care Mock Consultations},
  author={Papadopoulos Korfiatis, Alex and Moramarco, Francesco and Sarac, Radmila and Savkov, Aleksandar},
  booktitle={Proceedings of the 60th Annual Meeting of the Association for Computational Linguistics},
  year={2022}
}
```
