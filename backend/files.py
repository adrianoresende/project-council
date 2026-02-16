"""File upload parsing and attachment preparation for model calls."""

from __future__ import annotations

import asyncio
import base64
import mimetypes
import subprocess
import tempfile
from pathlib import Path
from typing import Any, Dict, List

from fastapi import HTTPException, Request, UploadFile
from starlette.datastructures import UploadFile as StarletteUploadFile

SUPPORTED_IMAGE_EXTENSIONS = {".png", ".jpg", ".jpeg", ".webp", ".gif", ".bmp"}
SUPPORTED_OFFICE_EXTENSIONS = {".docx", ".pptx", ".xlsx"}
SUPPORTED_OFFICE_MIME_TYPES = {
    "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    "application/vnd.openxmlformats-officedocument.presentationml.presentation",
    "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
}
MAX_UPLOAD_FILES = 8
MAX_UPLOAD_FILE_SIZE_BYTES = 15 * 1024 * 1024
DEFAULT_FILE_ANALYSIS_PROMPT = "Please analyze the attached files."
PDF_TEXT_PLUGIN = [{"id": "file-parser", "pdf": {"engine": "pdf-text"}}]


def sanitize_filename(filename: str | None, fallback: str) -> str:
    """Return a safe base filename."""
    raw_name = filename or fallback
    base_name = Path(raw_name).name.strip() or fallback
    sanitized = "".join(
        character if character.isalnum() or character in {"-", "_", ".", " "} else "_"
        for character in base_name
    ).strip()
    return (sanitized or fallback)[:255]


def to_data_uri(mime_type: str, raw_bytes: bytes) -> str:
    """Encode bytes as a data URI."""
    encoded = base64.b64encode(raw_bytes).decode("ascii")
    return f"data:{mime_type};base64,{encoded}"


def normalize_upload_mime(upload_file: UploadFile, filename: str) -> str:
    """Best-effort MIME type normalization for uploaded files."""
    content_type = (upload_file.content_type or "").strip().lower()
    if content_type:
        return content_type

    guessed, _ = mimetypes.guess_type(filename)
    if isinstance(guessed, str) and guessed:
        return guessed.lower()
    return "application/octet-stream"


def is_pdf_upload(filename: str, mime_type: str) -> bool:
    """Return True if upload should be treated as PDF."""
    suffix = Path(filename).suffix.lower()
    return suffix == ".pdf" or mime_type == "application/pdf"


def is_image_upload(filename: str, mime_type: str) -> bool:
    """Return True if upload should be treated as image."""
    if mime_type.startswith("image/"):
        return True
    suffix = Path(filename).suffix.lower()
    return suffix in SUPPORTED_IMAGE_EXTENSIONS


def is_office_upload(filename: str, mime_type: str) -> bool:
    """Return True if upload should be converted from Office to PDF."""
    suffix = Path(filename).suffix.lower()
    return suffix in SUPPORTED_OFFICE_EXTENSIONS or mime_type in SUPPORTED_OFFICE_MIME_TYPES


def convert_office_document_to_pdf_bytes(source_bytes: bytes, source_filename: str) -> bytes:
    """
    Convert a DOCX/PPTX/XLSX document to PDF using LibreOffice.

    Temporary files are created only for conversion and immediately removed.
    """
    with tempfile.TemporaryDirectory(prefix="llm-council-convert-") as temp_dir:
        temp_path = Path(temp_dir)
        input_path = temp_path / source_filename
        input_path.write_bytes(source_bytes)

        try:
            command = [
                "soffice",
                "--headless",
                "--convert-to",
                "pdf",
                "--outdir",
                str(temp_path),
                str(input_path),
            ]
            result = subprocess.run(
                command,
                capture_output=True,
                text=True,
                timeout=120,
                check=False,
            )
        except FileNotFoundError as error:
            raise HTTPException(
                status_code=500,
                detail=(
                    "Office-to-PDF conversion is unavailable on this server. "
                    "Install LibreOffice (soffice) to process DOCX/PPTX/XLSX files."
                ),
            ) from error
        except subprocess.TimeoutExpired as error:
            raise HTTPException(
                status_code=504,
                detail="Office-to-PDF conversion timed out.",
            ) from error

        if result.returncode != 0:
            detail = (result.stderr or result.stdout or "").strip()
            raise HTTPException(
                status_code=400,
                detail=f"Failed to convert file to PDF. {detail or 'Unknown conversion error.'}",
            )

        expected_pdf_path = temp_path / f"{input_path.stem}.pdf"
        if expected_pdf_path.exists():
            return expected_pdf_path.read_bytes()

        generated_pdfs = sorted(temp_path.glob("*.pdf"))
        if generated_pdfs:
            return generated_pdfs[0].read_bytes()

    raise HTTPException(
        status_code=400,
        detail="Failed to convert file to PDF.",
    )


async def extract_message_content_and_files(
    http_request: Request,
) -> tuple[str, List[UploadFile]]:
    """Parse content/files from JSON or multipart request payload."""
    content_type = (http_request.headers.get("content-type") or "").lower()

    if "multipart/form-data" in content_type:
        form = await http_request.form()
        raw_content = form.get("content")
        if isinstance(raw_content, str):
            content = raw_content
        elif raw_content is None:
            content = ""
        else:
            content = str(raw_content)

        raw_files = form.getlist("files")
        files = [
            item
            for item in raw_files
            if isinstance(item, (UploadFile, StarletteUploadFile))
        ]
        if raw_files and not files:
            raise HTTPException(
                status_code=400,
                detail="Uploaded files could not be parsed. Please try again.",
            )
        return content, files

    try:
        payload = await http_request.json()
    except Exception:
        payload = {}

    if not isinstance(payload, dict):
        payload = {}

    content = payload.get("content")
    normalized_content = content if isinstance(content, str) else ""
    return normalized_content, []


def resolve_message_prompt(content: str, files: List[Dict[str, Any]]) -> str:
    """Choose prompt text to send to models."""
    cleaned = content.strip()
    if cleaned:
        return cleaned

    if isinstance(files, list) and files:
        file_names = [
            file_entry.get("name")
            for file_entry in files
            if isinstance(file_entry, dict) and isinstance(file_entry.get("name"), str)
        ]
        compact_names = ", ".join(file_names[:3]).strip()
        if compact_names:
            return f"{DEFAULT_FILE_ANALYSIS_PROMPT} Files: {compact_names}"
        return DEFAULT_FILE_ANALYSIS_PROMPT
    return ""


def build_file_context_note(files: List[Dict[str, Any]]) -> str:
    """Create text context for previously uploaded files."""
    if not isinstance(files, list) or not files:
        return ""

    names = []
    for file_entry in files:
        if not isinstance(file_entry, dict):
            continue
        name = file_entry.get("name")
        if isinstance(name, str) and name.strip():
            names.append(name.strip())

    if not names:
        return ""
    return f"User uploaded files: {', '.join(names)}."


async def prepare_uploaded_files_for_model(
    uploaded_files: List[UploadFile],
) -> tuple[List[Dict[str, Any]], List[Dict[str, Any]], bool]:
    """
    Validate uploads and prepare OpenRouter content parts.

    Returns:
      - content parts for model request
      - file metadata safe to persist in message history
      - whether PDF parser plugin is required
    """
    if len(uploaded_files) > MAX_UPLOAD_FILES:
        raise HTTPException(
            status_code=400,
            detail=f"You can upload at most {MAX_UPLOAD_FILES} files per message.",
        )

    model_parts: List[Dict[str, Any]] = []
    safe_files: List[Dict[str, Any]] = []
    needs_pdf_parser = False

    for index, uploaded_file in enumerate(uploaded_files):
        fallback_name = f"file-{index + 1}"
        safe_name = sanitize_filename(uploaded_file.filename, fallback_name)
        mime_type = normalize_upload_mime(uploaded_file, safe_name)

        raw_bytes = await uploaded_file.read()
        await uploaded_file.close()

        if not raw_bytes:
            raise HTTPException(status_code=400, detail=f"File '{safe_name}' is empty.")

        if len(raw_bytes) > MAX_UPLOAD_FILE_SIZE_BYTES:
            max_mb = MAX_UPLOAD_FILE_SIZE_BYTES // (1024 * 1024)
            raise HTTPException(
                status_code=413,
                detail=f"File '{safe_name}' exceeds the {max_mb} MB limit.",
            )

        if is_image_upload(safe_name, mime_type):
            image_mime = mime_type if mime_type.startswith("image/") else "image/png"
            model_parts.append(
                {
                    "type": "image_url",
                    "image_url": {"url": to_data_uri(image_mime, raw_bytes)},
                }
            )
            safe_files.append(
                {
                    "name": safe_name,
                    "kind": "image",
                    "mime_type": image_mime,
                    "size_bytes": len(raw_bytes),
                }
            )
            continue

        if is_pdf_upload(safe_name, mime_type):
            model_parts.append(
                {
                    "type": "file",
                    "file": {
                        "filename": safe_name,
                        "file_data": to_data_uri("application/pdf", raw_bytes),
                    },
                }
            )
            safe_files.append(
                {
                    "name": safe_name,
                    "kind": "pdf",
                    "mime_type": "application/pdf",
                    "size_bytes": len(raw_bytes),
                    "converted_to_pdf": False,
                }
            )
            needs_pdf_parser = True
            continue

        if is_office_upload(safe_name, mime_type):
            pdf_bytes = await asyncio.to_thread(
                convert_office_document_to_pdf_bytes,
                raw_bytes,
                safe_name,
            )
            processed_name = f"{Path(safe_name).stem}.pdf"
            model_parts.append(
                {
                    "type": "file",
                    "file": {
                        "filename": processed_name,
                        "file_data": to_data_uri("application/pdf", pdf_bytes),
                    },
                }
            )
            safe_files.append(
                {
                    "name": safe_name,
                    "kind": "pdf",
                    "mime_type": mime_type,
                    "size_bytes": len(raw_bytes),
                    "processed_name": processed_name,
                    "converted_to_pdf": True,
                }
            )
            needs_pdf_parser = True
            continue

        raise HTTPException(
            status_code=400,
            detail=(
                f"Unsupported file type for '{safe_name}'. "
                "Supported: PDF, images, DOCX, XLSX, PPTX."
            ),
        )

    return model_parts, safe_files, needs_pdf_parser
