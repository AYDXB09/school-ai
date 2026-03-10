import io
import os
import re
from urllib.parse import unquote

from pypdf import PdfReader


def _display_name(filename: str = 'document.pdf') -> str:
    name = os.path.basename(unquote(filename or 'document.pdf')).strip()
    return name or 'document.pdf'


def _normalize_extracted_text(text: str) -> str:
    normalized_lines = []
    for line in str(text or '').splitlines():
        cleaned = re.sub(r'\s+', ' ', line).strip()
        if cleaned:
            normalized_lines.append(cleaned)
        elif normalized_lines and normalized_lines[-1] != '':
            normalized_lines.append('')

    normalized = '\n'.join(normalized_lines).strip()
    return re.sub(r'\n{3,}', '\n\n', normalized)


def extract_pdf_text(file_bytes: bytes, filename: str = 'document.pdf') -> dict:
    if not file_bytes:
        raise ValueError('The uploaded PDF was empty.')

    display_name = _display_name(filename)

    try:
        reader = PdfReader(io.BytesIO(file_bytes))
    except Exception as exc:
        raise ValueError(f'Could not read {display_name} as a PDF.') from exc

    if reader.is_encrypted:
        try:
            reader.decrypt('')
        except Exception as exc:
            raise ValueError(f'{display_name} is password-protected and cannot be imported.') from exc

    total_pages = len(reader.pages)
    page_blocks = []

    for page_index, page in enumerate(reader.pages, start=1):
        raw_text = page.extract_text() or ''
        clean_text = _normalize_extracted_text(raw_text)
        if not clean_text:
            continue

        prefix = f'[Page {page_index}]\n' if total_pages > 1 else ''
        page_blocks.append(f'{prefix}{clean_text}'.strip())

    if not page_blocks:
        raise ValueError(
            f'No extractable text was found in {display_name}. '
            'If this is a scanned PDF, convert it with OCR first or upload page photos instead.'
        )

    return {
        'filename': display_name,
        'page_count': total_pages,
        'extracted_page_count': len(page_blocks),
        'text': '\n\n'.join(page_blocks),
    }