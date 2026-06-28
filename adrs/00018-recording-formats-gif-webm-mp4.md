---
status: accepted
date: 2022-05-20
decision-makers: doc-detective maintainers
---

# Recording formats: GIF, WebM, and MP4

## Context and Problem Statement

With recording actions wired in, the captured video needed concrete output formats suitable for
embedding in documentation. Raw recorder output is not directly publishable; documentation commonly
wants animated GIFs (for inline embeds) and compact video (WebM/MP4). How should recording output be
converted, what formats should be supported, and how should size be controlled?

## Decision Drivers

* GIFs are the lingua franca for inline animated docs; video formats are smaller and higher quality.
* ffmpeg is the established tool for format conversion and resizing.
* Output size/quality (fps, width/height) needs to be controllable.
* Sensible defaults should exist so authors get usable output without tuning.

## Considered Options

* **A. ffmpeg-driven conversion to `.gif`, then add `.webm`/`.mp4` with resize** (chosen).
* **B. Emit only the recorder's native format with no conversion.**

## Decision Outcome

Chosen option: **A**. First, `.gif` output is produced via an ffmpeg `convertToGif()` step. This is
then generalized to a format set `[.mp4, .webm, .gif]` with `height`-based resize; the deprecated
`gifFps`/`gifWidth` fields fall back to generic `fps`/`width`, and the default output filename becomes
`${uuid}.mp4`. The supported extension drives the container/codec, and ffmpeg performs the conversion
and resize. This is one evolving "recording output format" contract spanning the GIF-only origin and
the multi-format generalization.

### Consequences

* Good: publishable GIF and video output with controllable fps and dimensions.
* Good: MP4 default gives compact, broadly compatible video out of the box.
* Neutral: `gifFps`/`gifWidth` become deprecated aliases (and are flattened to top-level fields in
  Seq 29 / ADR 00024), kept as fallbacks for compatibility.

### Confirmation

Shipped 2022-05-20 (`b585acf`) for ffmpeg `.gif` output, and 2022-10-03 (`6abaca60`, `ad3278b5`) for
the `.webm`/`.mp4` + resize set, the `gifFps`/`gifWidth`→`fps`/`width` fallback, and the
`${uuid}.mp4` default filename.

## Pros and Cons of the Options

### A. ffmpeg conversion to GIF/WebM/MP4
* Good: covers inline-GIF and compact-video needs; controllable size; sane defaults.
* Bad: depends on ffmpeg availability (addressed by the bundled-ffmpeg ADR 00029).

### B. Native recorder format only
* Good: no conversion dependency.
* Bad: output often unsuitable for docs; no GIF, no resize control.

## More Information

Recorded retrospectively (ADR backfill). Origin: doc-detective commits b585acf, 6abaca60, ad3278b5.
Inventory ref: BACKFILL-INVENTORY.md Seq 22, 41. Related: ADR 00024 (flatten gifOptions to top-level
fields), ADR 00029 (bundled ffmpeg installer), ADR 00069 (ffmpeg recording engine).
