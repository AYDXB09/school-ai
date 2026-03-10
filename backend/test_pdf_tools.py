import unittest

from pdf_tools import extract_pdf_text


def build_text_pdf_bytes(text: str) -> bytes:
    escaped = text.replace('\\', '\\\\').replace('(', '\\(').replace(')', '\\)')
    stream = f"BT\n/F1 18 Tf\n72 720 Td\n({escaped}) Tj\nET"
    objects = [
        '1 0 obj\n<< /Type /Catalog /Pages 2 0 R >>\nendobj\n',
        '2 0 obj\n<< /Type /Pages /Kids [3 0 R] /Count 1 >>\nendobj\n',
        '3 0 obj\n<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Resources << /Font << /F1 4 0 R >> >> /Contents 5 0 R >>\nendobj\n',
        '4 0 obj\n<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>\nendobj\n',
        f'5 0 obj\n<< /Length {len(stream.encode("latin-1"))} >>\nstream\n{stream}\nendstream\nendobj\n',
    ]

    pdf = '%PDF-1.4\n'
    offsets = []
    for obj in objects:
        offsets.append(len(pdf.encode('latin-1')))
        pdf += obj

    xref_start = len(pdf.encode('latin-1'))
    pdf += 'xref\n0 6\n0000000000 65535 f \n'
    pdf += ''.join(f'{offset:010d} 00000 n \n' for offset in offsets)
    pdf += f'trailer\n<< /Size 6 /Root 1 0 R >>\nstartxref\n{xref_start}\n%%EOF\n'
    return pdf.encode('latin-1')


class PdfToolsTests(unittest.TestCase):
    def test_extract_pdf_text_reads_embedded_text(self):
        payload = extract_pdf_text(build_text_pdf_bytes('Large PDF textbook import works.'), 'sample.pdf')

        self.assertEqual(payload['page_count'], 1)
        self.assertEqual(payload['extracted_page_count'], 1)
        self.assertIn('Large PDF textbook import works.', payload['text'])

    def test_extract_pdf_text_rejects_empty_upload(self):
        with self.assertRaises(ValueError):
            extract_pdf_text(b'', 'empty.pdf')