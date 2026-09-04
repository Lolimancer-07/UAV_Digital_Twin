"""
build_pdf.py

Converts PROJECT_REPORT.md into a defense-grade, publication-quality PDF report:
  PROJECT_REPORT.pdf

Features:
  - Custom Cover Page & Header Banner
  - Running Headers & Footers with Page Numbers
  - Styled Aerospace Headings (Navy / Cyan / Slate)
  - Beautiful Formatted Data Tables with Auto-Wrapped Cells
  - Shaded Monospace ASCII Architecture Diagrams
  - Mathematical Formulations & Bulleted Envelopes
"""

import os
import re
import sys
from reportlab.lib.pagesizes import letter
from reportlab.lib import colors
from reportlab.platypus import (
    SimpleDocTemplate, Paragraph, Spacer, Table, TableStyle,
    PageBreak, KeepTogether, Preformatted, HRFlowable
)
from reportlab.lib.styles import getSampleStyleSheet, ParagraphStyle
from reportlab.lib.units import inch
from reportlab.pdfgen import canvas

ROOT = os.path.dirname(os.path.abspath(__file__))
MD_PATH = os.path.join(ROOT, "PROJECT_REPORT.md")
PDF_PATH = os.path.join(ROOT, "PROJECT_REPORT.pdf")


class NumberedCanvas(canvas.Canvas):
    """Two-pass canvas to dynamically compute and print 'Page X of Y'."""
    def __init__(self, *args, **kwargs):
        super().__init__(*args, **kwargs)
        self._saved_page_states = []

    def showPage(self):
        self._saved_page_states.append(dict(self.__dict__))
        self._startPage()

    def save(self):
        num_pages = len(self._saved_page_states)
        for state in self._saved_page_states:
            self.__dict__.update(state)
            self.draw_page_decorations(num_pages)
            super().showPage()
        super().save()

    def draw_page_decorations(self, total_pages):
        # Don't draw header/footer on cover page (Page 1)
        if self._pageNumber == 1:
            return

        self.saveState()
        self.setFont("Helvetica", 8)
        self.setFillColor(colors.HexColor("#64748b"))

        # Running Header
        self.drawString(54, letter[1] - 36, "UAV DIGITAL TWIN — AUTONOMOUS PROPULSION INTELLIGENCE (v2.0)")
        self.drawRightString(letter[0] - 54, letter[1] - 36, "DO-178C LEVEL B / ATA-100")
        self.setStrokeColor(colors.HexColor("#cbd5e1"))
        self.setLineWidth(0.5)
        self.line(54, letter[1] - 42, letter[0] - 54, letter[1] - 42)

        # Running Footer
        self.line(54, 45, letter[0] - 54, 45)
        self.drawString(54, 32, "CONFIDENTIAL / DEFENSE PROPULSION REPORT — ROTAX 914 F TWIN")
        self.drawRightString(letter[0] - 54, 32, f"Page {self._pageNumber} of {total_pages}")
        self.restoreState()


def clean_markdown_inline(text):
    """Converts inline Markdown and LaTeX syntax to clean ReportLab text."""
    # Strip markdown links [Text](#anchor) -> Text
    text = re.sub(r'\[([^\]]+)\]\([^\)]+\)', r'\1', text)

    # Convert common LaTeX math constructs to clean typography
    # Fractions: \frac{A}{B} -> (A / B)
    text = re.sub(r'\\frac\{([^\}]+)\}\{([^\}]+)\}', r'(\1 / \2)', text)
    # \text{word} -> word
    text = re.sub(r'\\text\{([^\}]+)\}', r'\1', text)
    # \mathbf{x} -> x
    text = re.sub(r'\\mathbf\{([^\}]+)\}', r'\1', text)
    # \mathcal{P} -> P
    text = re.sub(r'\\mathcal\{([^\}]+)\}', r'\1', text)

    # Subscripts & Superscripts without XML tags
    text = text.replace('^{2}', '²').replace('^2', '²').replace('^{3}', '³').replace('^3', '³')
    text = text.replace('_{nominal}', '_nom').replace('_{indicated}', '_ind').replace('_{thermal}', '_th')
    text = text.replace('_{mechanical}', '_mech').replace('_{measured}', '_meas').replace('_{expected}', '_exp')
    text = text.replace('_{base}', '_base').replace('_{cf}', '_cf').replace('_{complete}', '_comp')
    text = text.replace('_{engine}', '_eng').replace('_{time}', '_time').replace('_{fault}', '_fault')
    text = text.replace('_{env}', '_env').replace('_{critical}', '_crit').replace('_{warning}', '_warn')
    text = re.sub(r'\_\{([^\}]+)\}', r'_\1', text)
    text = re.sub(r'\^\{([^\}]+)\}', r'^\1', text)

    # Math symbols
    text = text.replace(r'\times', '×').replace(r'\cdot', '·')
    text = text.replace(r'\approx', '≈').replace(r'\le', '≤').replace(r'\ge', '≥')
    text = text.replace(r'\in', '∈').replace(r'\notin', '∉')
    text = text.replace(r'\implies', '⇒').replace(r'\quad', ' ')
    text = text.replace(r'\sum_{t=1}^{T}', 'Σ(t=1..T)').replace(r'\sum_{j=1}^{M}', 'Σ(j=1..M)')
    text = text.replace(r'\prod_{k}', 'Π(k)').replace(r'\prod', 'Π')
    text = text.replace(r'\sqrt', '√')
    text = text.replace(r'^\circ', '°').replace(r'\circ', '°')
    text = text.replace(r'\Delta', 'Δ')
    text = text.replace(r'\sigma', 'σ').replace(r'\mu', 'μ').replace(r'\nu', 'ν')
    text = text.replace(r'\gamma', 'γ').replace(r'\eta', 'η').replace(r'\Phi', 'Φ')
    text = text.replace(r'\alpha', 'α').replace(r'\epsilon', 'ε')
    text = text.replace(r'\mathbb{E}', 'E')
    text = text.replace(r'\%', '%')

    # Clean remaining $ delimiters and backslashes
    text = text.replace('$', '')

    # Bold **text**
    text = re.sub(r'\*\*(.+?)\*\*', r'<b>\1</b>', text)
    # Italics *text*
    text = re.sub(r'(?<!\*)\*(?!\*)(.+?)(?<!\*)\*(?!\*)', r'<i>\1</i>', text)
    # Inline code `text`
    text = re.sub(r'`(.+?)`', r'<font face="Courier" color="#0369a1">\1</font>', text)

    # Escape raw ampersands if not already part of an entity
    text = re.sub(r'&(?!amp;|lt;|gt;|quot;|bull;)', '&amp;', text)
    return text


def build_pdf():
    print(f"[1/4] Reading source markdown: {MD_PATH}...")
    with open(MD_PATH, "r", encoding="utf-8") as f:
        raw_text = f.read()

    lines = raw_text.split("\n")

    # Document geometry: Letter size, 0.75 in (54 pt) margins
    doc = SimpleDocTemplate(
        PDF_PATH,
        pagesize=letter,
        leftMargin=54,
        rightMargin=54,
        topMargin=54,
        bottomMargin=54,
    )

    content_width = letter[0] - 108  # 504 pt

    # Base stylesheet
    styles = getSampleStyleSheet()

    # Custom styles
    c_navy = colors.HexColor("#0f172a")
    c_blue = colors.HexColor("#0284c7")
    c_slate = colors.HexColor("#334155")
    c_card_bg = colors.HexColor("#f8fafc")

    cover_title_style = ParagraphStyle(
        'CoverTitle',
        parent=styles['Normal'],
        fontName='Helvetica-Bold',
        fontSize=24,
        leading=30,
        textColor=c_navy,
        alignment=0,
        spaceAfter=10,
    )

    cover_sub_style = ParagraphStyle(
        'CoverSub',
        parent=styles['Normal'],
        fontName='Helvetica',
        fontSize=12,
        leading=17,
        textColor=c_blue,
        spaceAfter=20,
    )

    h1_style = ParagraphStyle(
        'Header1',
        parent=styles['Normal'],
        fontName='Helvetica-Bold',
        fontSize=16,
        leading=21,
        textColor=c_navy,
        spaceBefore=16,
        spaceAfter=8,
        keepWithNext=True,
    )

    h2_style = ParagraphStyle(
        'Header2',
        parent=styles['Normal'],
        fontName='Helvetica-Bold',
        fontSize=12.5,
        leading=16.5,
        textColor=c_blue,
        spaceBefore=12,
        spaceAfter=6,
        keepWithNext=True,
    )

    h3_style = ParagraphStyle(
        'Header3',
        parent=styles['Normal'],
        fontName='Helvetica-Bold',
        fontSize=10.5,
        leading=14.5,
        textColor=c_navy,
        spaceBefore=8,
        spaceAfter=4,
        keepWithNext=True,
    )

    body_style = ParagraphStyle(
        'Body',
        parent=styles['Normal'],
        fontName='Helvetica',
        fontSize=9,
        leading=13,
        textColor=c_slate,
        spaceAfter=5,
    )

    bullet_style = ParagraphStyle(
        'Bullet',
        parent=body_style,
        leftIndent=15,
        firstLineIndent=-10,
        spaceAfter=3,
    )

    code_block_style = ParagraphStyle(
        'CodeBlock',
        parent=styles['Normal'],
        fontName='Courier',
        fontSize=7,
        leading=9.5,
        textColor=colors.HexColor("#0f172a"),
        backColor=colors.HexColor("#f1f5f9"),
        borderPadding=6,
        spaceBefore=6,
        spaceAfter=6,
    )

    th_style = ParagraphStyle(
        'TableHeader',
        parent=styles['Normal'],
        fontName='Helvetica-Bold',
        fontSize=8,
        leading=10,
        textColor=colors.white,
    )

    td_style = ParagraphStyle(
        'TableCell',
        parent=styles['Normal'],
        fontName='Helvetica',
        fontSize=7.5,
        leading=10,
        textColor=c_slate,
    )

    story = []

    print("[2/4] Parsing document sections and flowables...")

    i = 0
    in_code_block = False
    code_lines = []

    while i < len(lines):
        line = lines[i]

        # Handle Code blocks (```)
        if line.strip().startswith("```"):
            if in_code_block:
                code_text = "\n".join(code_lines)
                story.append(Preformatted(code_text, code_block_style))
                code_lines = []
                in_code_block = False
            else:
                in_code_block = True
                code_lines = []
            i += 1
            continue

        if in_code_block:
            code_lines.append(line)
            i += 1
            continue

        stripped = line.strip()

        # Empty lines
        if not stripped:
            i += 1
            continue

        # Horizontal Rule
        if stripped in ("---", "***", "___"):
            story.append(HRFlowable(width="100%", thickness=0.75, color=colors.HexColor("#e2e8f0"), spaceAfter=10, spaceBefore=8))
            i += 1
            continue

        # Table detection (| ... |)
        if stripped.startswith("|") and stripped.endswith("|"):
            table_lines = []
            while i < len(lines) and lines[i].strip().startswith("|") and lines[i].strip().endswith("|"):
                tl = lines[i].strip()
                # Skip divider rows (|---|---|)
                if not re.match(r'^\|[\s\-:|]+\|$', tl):
                    table_lines.append(tl)
                i += 1

            if table_lines:
                table_data = []
                for row_idx, r in enumerate(table_lines):
                    cells = [c.strip() for c in r.split("|")[1:-1]]
                    row_data = []
                    for c in cells:
                        fmt_c = clean_markdown_inline(c)
                        if row_idx == 0:
                            row_data.append(Paragraph(fmt_c, th_style))
                        else:
                            row_data.append(Paragraph(fmt_c, td_style))
                    table_data.append(row_data)

                if table_data:
                    num_cols = len(table_data[0])
                    col_w = content_width / max(1, num_cols)
                    t = Table(table_data, colWidths=[col_w] * num_cols)
                    t.setStyle(TableStyle([
                        ('BACKGROUND', (0, 0), (-1, 0), colors.HexColor("#1e293b")),
                        ('ALIGN', (0, 0), (-1, -1), 'LEFT'),
                        ('VALIGN', (0, 0), (-1, -1), 'TOP'),
                        ('TOPPADDING', (0, 0), (-1, -1), 4),
                        ('BOTTOMPADDING', (0, 0), (-1, -1), 4),
                        ('LEFTPADDING', (0, 0), (-1, -1), 5),
                        ('RIGHTPADDING', (0, 0), (-1, -1), 5),
                        ('ROWBACKGROUNDS', (0, 1), (-1, -1), [colors.white, colors.HexColor("#f8fafc")]),
                        ('GRID', (0, 0), (-1, -1), 0.5, colors.HexColor("#e2e8f0")),
                    ]))
                    story.append(Spacer(1, 4))
                    story.append(t)
                    story.append(Spacer(1, 6))
            continue

        # Headings
        if stripped.startswith("# "):
            title_text = clean_markdown_inline(stripped[2:].strip())
            story.append(Paragraph(title_text, cover_title_style))
            i += 1
            continue

        if stripped.startswith("## "):
            h_text = clean_markdown_inline(stripped[3:].strip())
            story.append(Paragraph(h_text, h1_style))
            story.append(HRFlowable(width="100%", thickness=1, color=colors.HexColor("#0284c7"), spaceAfter=6, spaceBefore=2))
            i += 1
            continue

        if stripped.startswith("### "):
            h_text = clean_markdown_inline(stripped[4:].strip())
            story.append(Paragraph(h_text, h2_style))
            i += 1
            continue

        if stripped.startswith("#### "):
            h_text = clean_markdown_inline(stripped[5:].strip())
            story.append(Paragraph(h_text, h3_style))
            i += 1
            continue

        # Bullets
        if stripped.startswith(("- ", "* ", "• ")):
            b_text = clean_markdown_inline(stripped[2:].strip())
            bullet_char = "&bull; "
            story.append(Paragraph(f"{bullet_char}{b_text}", bullet_style))
            i += 1
            continue

        # Numbered list item
        m_num = re.match(r'^(\d+)\.\s+(.*)', stripped)
        if m_num:
            num_str = m_num.group(1)
            item_text = clean_markdown_inline(m_num.group(2).strip())
            story.append(Paragraph(f"<b>{num_str}.</b> {item_text}", bullet_style))
            i += 1
            continue

        # Regular paragraph
        p_text = clean_markdown_inline(stripped)
        story.append(Paragraph(p_text, body_style))
        i += 1

    print(f"[3/4] Building PDF with NumberedCanvas to: {PDF_PATH}...")
    doc.build(story, canvasmaker=NumberedCanvas)

    size_kb = os.path.getsize(PDF_PATH) / 1024
    print(f"[4/4] Successfully generated PROJECT_REPORT.pdf ({size_kb:.1f} KB)!")
    return PDF_PATH


if __name__ == "__main__":
    build_pdf()
