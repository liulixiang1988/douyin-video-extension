#!/usr/bin/env python3
"""Validate a downloaded MP4 and save a verified copy without overwriting files."""

import argparse
import hashlib
import json
import math
import os
from pathlib import Path
import re
import shutil
import struct
import sys


def boxes(stream, start, end):
    """Yield bounded ISO BMFF boxes without loading media payloads into memory."""
    position = start
    while position < end:
        if end - position < 8:
            raise ValueError("Incomplete MP4 box header")
        stream.seek(position)
        header = stream.read(8)
        if len(header) != 8:
            raise ValueError("Truncated MP4")
        size, kind = struct.unpack(">I4s", header)
        header_size = 8
        if size == 1:
            extended = stream.read(8)
            if len(extended) != 8:
                raise ValueError("Truncated extended MP4 header")
            size = struct.unpack(">Q", extended)[0]
            header_size = 16
        elif size == 0:
            size = end - position
        if size < header_size or position + size > end:
            raise ValueError("Invalid or truncated MP4 box")
        yield kind, position + header_size, position + size
        position += size


def read_prefix(stream, start, end, length):
    if end - start < length:
        raise ValueError("Incomplete MP4 metadata")
    stream.seek(start)
    value = stream.read(length)
    if len(value) != length:
        raise ValueError("Truncated MP4 metadata")
    return value


def coded_dimensions(stream, start, end):
    """Read encoded pixel sizes from visual sample entries, not display scaling."""
    dimensions = []
    visual_formats = {b"avc1", b"avc3", b"hvc1", b"hev1", b"av01", b"vp09", b"mp4v"}
    for kind, begin, finish in boxes(stream, start, end):
        if kind in {b"minf", b"stbl"}:
            dimensions.extend(coded_dimensions(stream, begin, finish))
        elif kind == b"stsd":
            read_prefix(stream, begin, finish, 8)
            for codec, entry_start, entry_end in boxes(stream, begin + 8, finish):
                if codec in visual_formats:
                    entry = read_prefix(stream, entry_start, entry_end, 28)
                    width, height = struct.unpack_from(">HH", entry, 24)
                    if width and height:
                        dimensions.append([width, height])
    return dimensions


def inspect_mp4(path):
    size = path.stat().st_size
    with path.open("rb") as stream:
        root = list(boxes(stream, 0, size))
        if not {b"ftyp", b"moov", b"mdat"}.issubset({b[0] for b in root}):
            raise ValueError("Expected an MP4 with ftyp, moov and mdat boxes")
        if not any(kind == b"mdat" and end > start for kind, start, end in root):
            raise ValueError("MP4 media data is empty")
        _, start, end = next(b for b in root if b[0] == b"moov")
        children = list(boxes(stream, start, end))
        movie_headers = [b for b in children if b[0] == b"mvhd"]
        if not movie_headers:
            raise ValueError("MP4 movie header is missing")
        _, start, end = movie_headers[0]
        version = read_prefix(stream, start, end, 1)[0]
        if version == 0:
            header = read_prefix(stream, start, end, 20)
            timescale, duration = struct.unpack_from(">II", header, 12)
        elif version == 1:
            header = read_prefix(stream, start, end, 32)
            timescale, duration = struct.unpack_from(">IQ", header, 20)
        else:
            raise ValueError("Unsupported MP4 movie header version")
        if not timescale or not duration:
            raise ValueError("MP4 has no measurable duration; inspect with ffprobe")

        tracks = []
        video_sizes = []
        for kind, start, end in children:
            if kind != b"trak":
                continue
            track_type = None
            dimensions = []
            for child, begin, finish in boxes(stream, start, end):
                if child == b"mdia":
                    for media_kind, media_start, media_end in boxes(stream, begin, finish):
                        if media_kind == b"hdlr":
                            handler = read_prefix(stream, media_start, media_end, 12)
                            track_type = handler[8:12].decode("ascii", errors="replace")
                        elif media_kind == b"minf":
                            dimensions.extend(coded_dimensions(stream, media_start, media_end))
            if track_type:
                tracks.append(track_type)
            if track_type == "vide" and dimensions:
                video_sizes.extend(dimensions)
        if "vide" not in tracks:
            raise ValueError("MP4 contains no video track")
        if not video_sizes:
            raise ValueError("Encoded video dimensions are unavailable; inspect with ffprobe")
    return {
        "bytes": size,
        "duration_seconds": round(duration / timescale, 3),
        "video_dimensions": video_sizes,
        "resolution_short_side": max(min(size) for size in video_sizes),
        "has_audio": "soun" in tracks,
    }


def digest(path):
    result = hashlib.sha256()
    with path.open("rb") as stream:
        for chunk in iter(lambda: stream.read(1024 * 1024), b""):
            result.update(chunk)
    return result.hexdigest()


def default_output_dir():
    consumer = os.environ.get("OneDriveConsumer")
    root = Path(consumer) if consumer else Path.home() / "OneDrive"
    if not root.is_dir():
        raise ValueError("Personal OneDrive was not found; supply --output-dir")
    return root / "video"


def safe_title(title):
    title = re.sub(r'[<>:"/\\|?*\x00-\x1f]', " ", title)
    title = re.sub(r"\s+", " ", title).strip(" .")
    # Keep filenames short in UTF-16 as well as Python code points on Windows.
    title = title.encode("utf-16-le")[:180].decode("utf-16-le", errors="ignore")
    title = title.rstrip(" .") or "Douyin"
    if re.match(r"^(CON|PRN|AUX|NUL|COM[1-9]|LPT[1-9])(?:\.|$)", title, re.I):
        title = "_" + title
    return title


def save_video(source, title, video_id, output_dir=None, expected_duration=None,
               require_audio=False, min_resolution=720):
    if not re.fullmatch(r"[0-9]{1,30}", video_id):
        raise ValueError("video-id must be the numeric ID from the requested Douyin URL")
    source = Path(source).resolve(strict=True)
    metadata = inspect_mp4(source)
    if not isinstance(min_resolution, int) or min_resolution <= 0:
        raise ValueError("Minimum resolution must be a positive pixel count")
    if metadata["resolution_short_side"] < min_resolution:
        raise ValueError(
            f"Downloaded video is {metadata['resolution_short_side']}p, "
            f"below the required {min_resolution}p minimum")
    if expected_duration is not None:
        if not math.isfinite(expected_duration) or expected_duration <= 0:
            raise ValueError("Expected duration must be positive and finite")
        tolerance = max(1.0, expected_duration * 0.01)
        if abs(metadata["duration_seconds"] - expected_duration) > tolerance:
            raise ValueError("Downloaded duration does not match the requested player")
    if require_audio and not metadata["has_audio"]:
        raise ValueError("Expected an audio track but the downloaded MP4 has none")

    target_dir = Path(output_dir).expanduser() if output_dir else default_output_dir()
    target_dir = target_dir.resolve()
    target_dir.mkdir(parents=True, exist_ok=True)
    source_hash = digest(source)
    stem = f"{safe_title(title)} - {video_id}"
    index = 1
    while True:
        suffix = "" if index == 1 else f" ({index})"
        destination = target_dir / f"{stem}{suffix}.mp4"
        try:
            output = destination.open("xb")
        except FileExistsError:
            if destination.is_file() and digest(destination) == source_hash:
                reused = True
                break
            index += 1
            continue
        try:
            with output, source.open("rb") as incoming:
                shutil.copyfileobj(incoming, output, length=1024 * 1024)
            if digest(destination) != source_hash:
                raise ValueError("Saved copy checksum does not match the source")
        except BaseException:
            # This branch owns exactly this newly created file, never an older file.
            destination.unlink(missing_ok=True)
            raise
        reused = False
        break
    return {
        "saved_to": str(destination),
        **metadata,
        "MiB": round(metadata["bytes"] / (1024 * 1024), 2),
        "sha256": source_hash,
        "verified": True,
        "reused_existing": reused,
        "cloud_sync_verified": False,
    }


def main():
    for stream in (sys.stdout, sys.stderr):
        if hasattr(stream, "reconfigure"):
            stream.reconfigure(encoding="utf-8", errors="replace")
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--source", required=True, type=Path)
    parser.add_argument("--title", required=True)
    parser.add_argument("--video-id", required=True)
    parser.add_argument("--output-dir", type=Path)
    parser.add_argument("--expected-duration", type=float)
    parser.add_argument("--require-audio", action="store_true")
    parser.add_argument("--min-resolution", type=int, default=720,
                        help="Minimum encoded shorter dimension in pixels (default: 720)")
    args = parser.parse_args()
    try:
        result = save_video(**vars(args))
    except (OSError, ValueError) as error:
        print(json.dumps({"verified": False, "error": str(error)}, ensure_ascii=False),
              file=sys.stderr)
        return 1
    print(json.dumps(result, ensure_ascii=False))
    return 0


if __name__ == "__main__":
    sys.exit(main())
