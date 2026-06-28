#!/usr/bin/env python3
"""Generate Shopify Discord Agent promo video via Vertex AI Veo 3.1.

Uses image-to-video + extend chain(s). Veo extend accepts input up to 30s, so
longer videos use multiple segments concatenated in post.

Usage:
  python scripts/generate-promo-video.py --config promo-video/config-v30-pro.json
  python scripts/generate-promo-video.py --from-step 3
  python scripts/generate-promo-video.py --setup-only
"""
from __future__ import annotations

import argparse
import json
import os
import shutil
import subprocess
import sys
import time
from pathlib import Path

from google import genai
from google.genai.types import GenerateVideosConfig, Image, Video, VideoGenerationReferenceImage

ROOT = Path(__file__).resolve().parent.parent
WORKSPACE = ROOT.parent
DEFAULT_CONFIG = ROOT / "promo-video" / "config.json"
GCLOUD = Path(r"C:\Users\KIRA\AppData\Local\Google\Cloud SDK\google-cloud-sdk\bin\gcloud.cmd")
POLL_SECONDS = 15
MAX_EXTEND_INPUT_SECONDS = 30


def load_json(path: Path) -> dict:
    with path.open(encoding="utf-8") as f:
        return json.load(f)


def resolve_path(rel: str) -> Path:
    return (ROOT / rel).resolve()


def resolve_asset(rel: str) -> Path:
    rel_path = Path(rel)
    candidates = [
        (ROOT / rel).resolve(),
        (WORKSPACE / rel_path.name).resolve(),
        (WORKSPACE / "whoax-avatar-images" / rel_path.name).resolve(),
    ]
    for candidate in candidates:
        if candidate.exists():
            return candidate
    return candidates[0]


def run(cmd: list[str], *, check: bool = True) -> subprocess.CompletedProcess:
    print("+", " ".join(cmd))
    return subprocess.run(cmd, check=check, text=True, capture_output=True)


def ensure_env(cfg: dict) -> None:
    for key, value in cfg["env"].items():
        os.environ.setdefault(key, value)
    os.environ.setdefault("GOOGLE_GENAI_USE_VERTEXAI", "true")


def gcloud(*args: str) -> None:
    cmd = [str(GCLOUD), *args]
    result = run(cmd)
    if result.returncode != 0:
        raise RuntimeError(result.stderr or result.stdout or "gcloud failed")


def ensure_bucket(bucket: str) -> None:
    probe = run([str(GCLOUD), "storage", "ls", bucket], check=False)
    if probe.returncode == 0:
        print(f"Bucket ready: {bucket}")
        return
    print(f"Creating bucket: {bucket}")
    gcloud("storage", "buckets", "create", bucket, "--project", os.environ["GOOGLE_CLOUD_PROJECT"], "--location", "us-central1")


def upload_file(local: Path, gcs_uri: str) -> str:
    gcloud("storage", "cp", str(local), gcs_uri)
    print(f"Uploaded {local.name} -> {gcs_uri}")
    return gcs_uri


def upload_avatar_assets(cfg: dict) -> tuple[str, list[str]]:
    bucket = cfg["gcs"]["bucket"]
    avatar_local = resolve_asset(cfg["avatar"]["primary"])
    if not avatar_local.exists():
        avatar_local = resolve_asset(cfg["avatar"]["backup"])
    if not avatar_local.exists():
        raise FileNotFoundError(f"Avatar not found: {avatar_local}")

    avatar_uri = f"{bucket}/{cfg['gcs']['avatarObject']}"
    upload_file(avatar_local, avatar_uri)

    reference_uris = [avatar_uri]
    backup_local = resolve_asset(cfg["avatar"]["backup"])
    if backup_local.exists() and backup_local != avatar_local:
        backup_uri = f"{bucket}/{cfg['gcs'].get('avatarBackupObject', 'inputs/avatar-base.png')}"
        upload_file(backup_local, backup_uri)
        reference_uris.append(backup_uri)

    return avatar_uri, reference_uris


def ffmpeg_path() -> str:
    path = shutil.which("ffmpeg")
    if not path:
        raise RuntimeError("ffmpeg not found on PATH")
    return path


def ffprobe_path() -> str:
    return shutil.which("ffprobe") or ffmpeg_path().replace("ffmpeg", "ffprobe")


def ffprobe_duration(path: Path) -> float:
    result = run(
        [
            ffprobe_path(),
            "-v",
            "error",
            "-show_entries",
            "format=duration",
            "-of",
            "default=noprint_wrappers=1:nokey=1",
            str(path),
        ]
    )
    return float(result.stdout.strip())


def normalize_video(src: Path, dest: Path, fps: int) -> Path:
    dest.parent.mkdir(parents=True, exist_ok=True)
    run(
        [
            ffmpeg_path(),
            "-y",
            "-i",
            str(src),
            "-r",
            str(fps),
            "-c:v",
            "libx264",
            "-pix_fmt",
            "yuv420p",
            "-c:a",
            "aac",
            "-b:a",
            "192k",
            str(dest),
        ]
    )
    return dest


def trim_video(src: Path, dest: Path, seconds: float) -> Path:
    dest.parent.mkdir(parents=True, exist_ok=True)
    run(
        [
            ffmpeg_path(),
            "-y",
            "-i",
            str(src),
            "-t",
            str(seconds),
            "-c:v",
            "libx264",
            "-crf",
            "18",
            "-pix_fmt",
            "yuv420p",
            "-c:a",
            "aac",
            "-b:a",
            "192k",
            str(dest),
        ]
    )
    return dest


def fit_duration(src: Path, dest: Path, seconds: float) -> Path:
    duration = ffprobe_duration(src)
    if duration > seconds + 0.05:
        return trim_video(src, dest, seconds)
    if duration < seconds - 0.05:
        pad = seconds - duration
        dest.parent.mkdir(parents=True, exist_ok=True)
        run(
            [
                ffmpeg_path(),
                "-y",
                "-i",
                str(src),
                "-vf",
                f"tpad=stop_mode=clone:stop_duration={pad:.3f}",
                "-c:v",
                "libx264",
                "-crf",
                "18",
                "-pix_fmt",
                "yuv420p",
                "-c:a",
                "aac",
                "-b:a",
                "192k",
                str(dest),
            ]
        )
        return dest
    shutil.copy2(src, dest)
    return dest


def extract_last_frame(video: Path, frame_path: Path) -> Path:
    frame_path.parent.mkdir(parents=True, exist_ok=True)
    run(
        [
            ffmpeg_path(),
            "-y",
            "-sseof",
            "-0.1",
            "-i",
            str(video),
            "-frames:v",
            "1",
            "-q:v",
            "2",
            str(frame_path),
        ]
    )
    return frame_path


def concat_segments(segments: list[Path], dest: Path) -> Path:
    dest.parent.mkdir(parents=True, exist_ok=True)
    list_file = dest.with_suffix(".txt")
    lines = [f"file '{seg.resolve().as_posix()}'" for seg in segments]
    list_file.write_text("\n".join(lines) + "\n", encoding="utf-8")
    run(
        [
            ffmpeg_path(),
            "-y",
            "-f",
            "concat",
            "-safe",
            "0",
            "-i",
            str(list_file),
            "-c",
            "copy",
            str(dest),
        ]
    )
    list_file.unlink(missing_ok=True)
    return dest


def build_prompt(scene: dict, cfg: dict) -> str:
    lock = scene.get("characterLock") or cfg.get("characterLock", "")
    parts = [lock, scene["dialogue"], scene["visualPrompt"]]
    return " ".join(p.strip() for p in parts if p.strip())


def retry_call(fn, *, attempts: int = 4, delay: int = 20):
    last_exc = None
    for attempt in range(1, attempts + 1):
        try:
            return fn()
        except Exception as exc:
            last_exc = exc
            if attempt == attempts:
                break
            print(f"  retry {attempt}/{attempts - 1} after error: {exc}")
            time.sleep(delay * attempt)
    raise last_exc


def wait_operation(client: genai.Client, operation):
    while not operation.done:
        time.sleep(POLL_SECONDS)
        operation = retry_call(lambda: client.operations.get(operation))
        print(f"  polling... done={operation.done}")
    if operation.error:
        raise RuntimeError(f"Veo operation failed: {operation.error}")
    return operation


def video_uri(operation) -> str:
    videos = operation.result.generated_videos
    if not videos:
        raise RuntimeError("No generated videos in operation result")
    uri = videos[0].video.uri
    if not uri:
        raise RuntimeError("Generated video has no GCS URI")
    return uri


def download_gcs(uri: str, dest: Path) -> Path:
    dest.parent.mkdir(parents=True, exist_ok=True)
    gcloud("storage", "cp", uri, str(dest))
    print(f"Downloaded {uri} -> {dest}")
    return dest


def make_client(cfg: dict) -> genai.Client:
    return genai.Client(
        vertexai=True,
        project=cfg["project"],
        location=cfg["location"],
    )


def video_config(cfg: dict, *, output_prefix: str, duration_seconds: int | None = None) -> GenerateVideosConfig:
    kwargs = {
        "aspect_ratio": cfg["aspectRatio"],
        "resolution": cfg["resolution"],
        "fps": cfg["fps"],
        "person_generation": cfg["personGeneration"],
        "negative_prompt": cfg["negativePrompt"],
        "generate_audio": cfg.get("generateAudio", True),
        "output_gcs_uri": output_prefix,
    }
    if "enhancePrompt" in cfg:
        kwargs["enhance_prompt"] = cfg["enhancePrompt"]
    if duration_seconds is not None:
        kwargs["duration_seconds"] = duration_seconds
    return GenerateVideosConfig(**kwargs)


def subject_references(reference_uris: list[str]) -> list[VideoGenerationReferenceImage]:
    refs = []
    for uri in reference_uris[:3]:
        mime = "image/png" if uri.endswith(".png") else "image/jpeg"
        refs.append(
            VideoGenerationReferenceImage(
                image=Image(gcs_uri=uri, mime_type=mime),
                reference_type="asset",
            )
        )
    return refs


def generate_initial(
    client: genai.Client,
    cfg: dict,
    scene: dict,
    image_gcs_uri: str,
    output_prefix: str,
    *,
    mime_type: str = "image/png",
    reference_uris: list[str] | None = None,
) -> str:
    prompt = build_prompt(scene, cfg)
    print(f"\n[scene {scene['id']}] image-to-video: {scene['title']}")
    print(f"  model: {cfg['model']}")
    print(f"  prompt: {prompt[:200]}...")

    config = video_config(cfg, output_prefix=output_prefix, duration_seconds=cfg["initialDurationSeconds"])
    use_subject_ref = bool(cfg.get("useSubjectReference") and reference_uris and scene["id"] == 1)

    if use_subject_ref:
        config.reference_images = subject_references(reference_uris)
        print("  mode: reference-to-video (subject lock)")
        operation = retry_call(
            lambda: client.models.generate_videos(
                model=cfg["model"],
                prompt=prompt,
                config=config,
            )
        )
    else:
        print("  mode: image-to-video")
        operation = retry_call(
            lambda: client.models.generate_videos(
                model=cfg["model"],
                prompt=prompt,
                image=Image(gcs_uri=image_gcs_uri, mime_type=mime_type),
                config=config,
            )
        )
    operation = wait_operation(client, operation)
    return video_uri(operation)


def generate_extend(
    client: genai.Client,
    cfg: dict,
    scene: dict,
    input_video: Path,
    output_prefix: str,
) -> str:
    duration = ffprobe_duration(input_video)
    if duration > MAX_EXTEND_INPUT_SECONDS:
        raise RuntimeError(
            f"Cannot extend scene {scene['id']}: input is {duration:.1f}s "
            f"(max {MAX_EXTEND_INPUT_SECONDS}s). Start a new segment instead."
        )

    prompt = build_prompt(scene, cfg)
    print(f"\n[scene {scene['id']}] extend ({duration:.1f}s input): {scene['title']}")
    print(f"  model: {cfg['model']}")
    print(f"  prompt: {prompt[:200]}...")

    video_bytes = input_video.read_bytes()
    operation = retry_call(
        lambda: client.models.generate_videos(
            model=cfg["model"],
            prompt=prompt,
            video=Video(video_bytes=video_bytes, mime_type="video/mp4"),
            config=video_config(cfg, output_prefix=output_prefix),
        )
    )
    operation = wait_operation(client, operation)
    return video_uri(operation)


def scene_paths(cfg: dict, scene: dict) -> tuple[Path, Path]:
    intermediate = resolve_path(cfg["paths"]["intermediate"])
    raw = intermediate / f"scene-{scene['id']:02d}-{scene['slug']}.mp4"
    normalized = intermediate / f"scene-{scene['id']:02d}-{scene['slug']}-24fps.mp4"
    return raw, normalized


def segment_path(cfg: dict, segment_id: int) -> Path:
    return resolve_path(cfg["paths"]["intermediate"]) / f"segment-{segment_id:02d}.mp4"


def process_scene(
    client: genai.Client,
    cfg: dict,
    scene: dict,
    *,
    avatar_gcs_uri: str,
    reference_uris: list[str],
    output_prefix: str,
    current_input: Path | None,
    segment_source: Path | None,
    bucket: str,
    segment_boundaries: set[int],
) -> Path:
    raw_path, normalized_path = scene_paths(cfg, scene)
    step_prefix = f"{output_prefix}scene-{scene['id']:02d}-{scene['slug']}/"

    if scene["id"] in segment_boundaries:
        if scene["id"] == min(segment_boundaries):
            image_uri = avatar_gcs_uri
            mime_type = "image/png"
            refs = reference_uris
        else:
            if segment_source is None:
                raise RuntimeError(f"Missing segment source frame before scene {scene['id']}")
            frame_local = resolve_path(cfg["paths"]["intermediate"]) / f"frame-before-scene-{scene['id']:02d}.jpg"
            extract_last_frame(segment_source, frame_local)
            image_uri = f"{bucket}/{cfg['gcs']['inputsPrefix']}frame-before-scene-{scene['id']:02d}.jpg"
            upload_file(frame_local, image_uri)
            mime_type = "image/jpeg"
            refs = reference_uris
        uri = generate_initial(
            client,
            cfg,
            scene,
            image_uri,
            step_prefix,
            mime_type=mime_type,
            reference_uris=refs,
        )
    else:
        if current_input is None:
            raise RuntimeError(f"No input video available for scene {scene['id']}")
        uri = generate_extend(client, cfg, scene, current_input, step_prefix)

    download_gcs(uri, raw_path)
    normalize_video(raw_path, normalized_path, cfg["fps"])
    return normalized_path


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--config", default=str(DEFAULT_CONFIG), help="Path to promo config JSON")
    parser.add_argument("--from-step", type=int, default=1, help="Resume from scene id")
    parser.add_argument("--setup-only", action="store_true", help="Create bucket and upload avatar only")
    parser.add_argument("--skip-trim", action="store_true", help="Skip final duration fit")
    args = parser.parse_args()

    config_path = Path(args.config)
    if not config_path.is_absolute():
        config_path = (ROOT / config_path).resolve()
    cfg = load_json(config_path)
    scenes_path = resolve_path(cfg["paths"]["scenes"])
    scenes_doc = load_json(scenes_path)
    scenes = scenes_doc["scenes"]
    segment_boundaries = set(cfg.get("segmentBoundaryScenes", [1]))
    segment_checkpoints = {int(k): int(v) for k, v in cfg.get("segmentCheckpoints", {"4": 1, "8": 2, "9": 3}).items()}
    ensure_env(cfg)

    bucket = cfg["gcs"]["bucket"]
    output_prefix = f"{bucket}/{cfg['gcs']['outputPrefix']}"
    ensure_bucket(bucket)
    avatar_gcs_uri, reference_uris = upload_avatar_assets(cfg)
    if args.setup_only:
        print("Setup complete.")
        return 0

    client = make_client(cfg)
    current_input: Path | None = None
    segment_source: Path | None = None
    completed_segments: list[Path] = []

    print(f"Model: {cfg['model']} @ {cfg['resolution']}, target {cfg['finalTrimSeconds']}s")

    for scene in scenes:
        if scene["id"] < args.from_step:
            _, normalized = scene_paths(cfg, scene)
            if normalized.exists():
                current_input = normalized
                print(f"Skipping scene {scene['id']} (using {normalized.name})")
            if scene["id"] in segment_checkpoints:
                seg = segment_path(cfg, segment_checkpoints[scene["id"]])
                shutil.copy2(normalized, seg)
                completed_segments = [s for s in completed_segments if s != seg]
                completed_segments.append(seg)
                segment_source = normalized
                print(f"Segment {segment_checkpoints[scene['id']]} checkpoint: {seg.name} ({ffprobe_duration(seg):.1f}s)")
            continue

        if scene["id"] in segment_boundaries and scene["id"] > args.from_step and completed_segments:
            segment_source = completed_segments[-1]

        current_input = process_scene(
            client,
            cfg,
            scene,
            avatar_gcs_uri=avatar_gcs_uri,
            reference_uris=reference_uris,
            output_prefix=output_prefix,
            current_input=current_input,
            segment_source=segment_source,
            bucket=bucket,
            segment_boundaries=segment_boundaries,
        )

        if scene["id"] in segment_checkpoints:
            seg_id = segment_checkpoints[scene["id"]]
            seg = segment_path(cfg, seg_id)
            shutil.copy2(current_input, seg)
            if seg not in completed_segments:
                completed_segments.append(seg)
            if scene["id"] != max(segment_checkpoints):
                segment_source = current_input
            print(f"Segment {seg_id} complete: {seg.name} ({ffprobe_duration(seg):.1f}s)")

    if current_input is None:
        raise RuntimeError("No scenes were generated")

    segments = []
    for seg_id in sorted(set(segment_checkpoints.values())):
        seg = segment_path(cfg, seg_id)
        if seg.exists():
            segments.append(seg)
            print(f"Using segment {seg_id}: {ffprobe_duration(seg):.1f}s")

    if not segments:
        segments = [current_input]

    if len(segments) == 1:
        concat_raw = segments[0]
        print(f"\nSingle segment output: {concat_raw} ({ffprobe_duration(concat_raw):.1f}s)")
    else:
        concat_raw = resolve_path(cfg["paths"]["output"]) / "promo-raw.mp4"
        concat_segments(segments, concat_raw)
        print(f"\nConcatenated {len(segments)} segments -> {concat_raw} ({ffprobe_duration(concat_raw):.1f}s)")

    if args.skip_trim:
        return 0

    final_path = resolve_path(cfg["paths"]["finalVideo"])
    fit_duration(concat_raw, final_path, cfg["finalTrimSeconds"])
    print(f"Final promo video: {final_path} ({ffprobe_duration(final_path):.1f}s)")
    return 0


if __name__ == "__main__":
    try:
        raise SystemExit(main())
    except Exception as exc:
        print(f"ERROR: {exc}", file=sys.stderr)
        raise