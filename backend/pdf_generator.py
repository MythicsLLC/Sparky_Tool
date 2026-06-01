"""
pdf_generator.py — Professional PDF reports via ReportLab + matplotlib.

matplotlib renders each chart spec into a crisp PNG.
ReportLab composes the page: custom header/footer on every page via a
PageTemplate callback, 2-column chart grid via Table, paragraph text,
KPI boxes, and a styled runs table.

Public API
----------
  generate_analysis_pdf(filename, summary, charts, meta) -> bytes
  generate_run_pdf(kpi, runs)                            -> bytes
  generate_functional_pdf(filename, data)                -> bytes
  generate_operational_pdf(runs)                         -> bytes
"""

from __future__ import annotations

import io
import os
import re
import datetime
from typing import Any

import matplotlib
matplotlib.use('Agg')   # headless — no display required on the server
import matplotlib.pyplot as plt
import matplotlib.patches as mpatches
import numpy as np

from reportlab.lib.pagesizes import A4
from reportlab.lib.units import cm, mm
from reportlab.lib.colors import HexColor, white
from reportlab.lib.enums import TA_LEFT, TA_CENTER, TA_JUSTIFY
from reportlab.lib.styles import ParagraphStyle
from reportlab.lib.utils import ImageReader
from reportlab.platypus import (
    BaseDocTemplate, Frame, PageTemplate,
    Paragraph, Spacer, Image, Table, TableStyle,
    HRFlowable, KeepTogether,
)

# ── Design tokens (match the app's gold accent palette) ───────────────────────

PAGE_W, PAGE_H = A4
MARGIN   = 1.3 * cm
HEADER_H = 17 * mm   # vertical space reserved for the header band
FOOTER_H = 12 * mm   # vertical space reserved for the footer

GOLD     = HexColor('#C9A84C')
DARK     = HexColor('#1A1A1A')
MID      = HexColor('#555555')
LIGHT    = HexColor('#888888')
RULE     = HexColor('#DDDDDD')
CARDBG   = HexColor('#FAFAFA')
GREEN    = HexColor('#6b8f71')
CHARTPAL = ['#6b8f71','#6495b4','#C9A84C','#b45050','#9b59b6','#e67e22','#1abc9c','#e74c3c']

_LOGO = os.path.join(
    os.path.dirname(__file__), "..", "frontend", "src", "assets", "mythics-logo-color.png"
)

# ── Paragraph styles ──────────────────────────────────────────────────────────

def _styles() -> dict:
    def S(name, **kw) -> ParagraphStyle:
        return ParagraphStyle(name, **kw)

    return {
        'h1': S('h1', fontName='Helvetica-Bold', fontSize=22,
                 textColor=DARK, spaceAfter=2*mm, leading=26),
        'meta': S('meta', fontName='Helvetica', fontSize=8.5,
                  textColor=LIGHT, spaceAfter=1.2*mm),
        'pii': S('pii', fontName='Helvetica-Bold', fontSize=8.5,
                 textColor=GREEN, spaceAfter=3*mm),
        'section': S('section', fontName='Helvetica-Bold', fontSize=8,
                     textColor=MID, spaceBefore=5*mm, spaceAfter=2.5*mm,
                     letterSpacing=1.4),
        'body': S('body', fontName='Helvetica', fontSize=9.5,
                  textColor=HexColor('#333333'), leading=15,
                  spaceAfter=4*mm, alignment=TA_JUSTIFY),
        'ctitle': S('ctitle', fontName='Helvetica-Bold', fontSize=8,
                    textColor=DARK, spaceAfter=1.5*mm),
        'cdesc': S('cdesc', fontName='Helvetica', fontSize=7,
                   textColor=LIGHT, leading=10, spaceAfter=0),
        'th': S('th', fontName='Helvetica-Bold', fontSize=7,
                textColor=MID, alignment=TA_LEFT),
        'td': S('td', fontName='Helvetica', fontSize=7.5,
                textColor=DARK, leading=10),
        'kpi_label': S('kpi_label', fontName='Helvetica', fontSize=6.5,
                       textColor=LIGHT, spaceAfter=1*mm),
        'kpi_value': S('kpi_value', fontName='Helvetica-Bold', fontSize=18,
                       textColor=DARK),
    }

# ── Page header / footer callback ─────────────────────────────────────────────

class _PageDressing:
    """Called by ReportLab on every page to paint outside the main Frame."""

    def __init__(self, report_title: str):
        self.title = report_title

    def __call__(self, canvas, doc):
        canvas.saveState()
        w, h = PAGE_W, PAGE_H

        # ── top accent line ───────────────────────────────────────────────────
        canvas.setFillColor(GOLD)
        canvas.rect(0, h - 3, w, 3, fill=1, stroke=0)

        # ── Mythics logo (top right) ──────────────────────────────────────────
        if os.path.isfile(_LOGO):
            try:
                reader       = ImageReader(_LOGO)
                lw_px, lh_px = reader.getSize()
                logo_h_max   = HEADER_H - 4 * mm   # 2 mm padding top + bottom
                logo_w_full  = 3.0 * cm
                logo_h_full  = logo_w_full * (lh_px / lw_px)
                scale        = min(1.0, logo_h_max / logo_h_full)
                logo_w       = logo_w_full * scale
                logo_h       = logo_h_full * scale
                logo_x       = w - MARGIN - logo_w
                logo_y       = h - HEADER_H + (HEADER_H - logo_h) / 2
                canvas.drawImage(
                    _LOGO, logo_x, logo_y, width=logo_w, height=logo_h,
                    preserveAspectRatio=True, mask='auto',
                )
            except Exception:
                pass

        # ── report title (top left) ───────────────────────────────────────────
        canvas.setFont('Helvetica-Bold', 9)
        canvas.setFillColor(DARK)
        canvas.drawString(MARGIN, h - HEADER_H + 5*mm, self.title)

        # ── thin rule below header ────────────────────────────────────────────
        canvas.setStrokeColor(RULE)
        canvas.setLineWidth(0.5)
        canvas.line(MARGIN, h - HEADER_H, w - MARGIN, h - HEADER_H)

        # ── footer rule + page number ─────────────────────────────────────────
        canvas.line(MARGIN, FOOTER_H, w - MARGIN, FOOTER_H)
        canvas.setFont('Helvetica', 6.5)
        canvas.setFillColor(LIGHT)
        txt = f'Page {doc.page}  ·  Sparky Tool by Mythics Inc.'
        canvas.drawCentredString(w / 2, FOOTER_H - 4.5*mm, txt)

        # ── bottom accent line ────────────────────────────────────────────────
        canvas.setFillColor(GOLD)
        canvas.rect(0, 0, w, 2, fill=1, stroke=0)

        canvas.restoreState()

# ── Document builder helper ───────────────────────────────────────────────────

def _make_doc(buf: io.BytesIO, title: str) -> tuple[BaseDocTemplate, dict]:
    """Return (doc, styles). The caller builds the story and calls doc.build()."""
    dressing = _PageDressing(title)
    frame    = Frame(
        MARGIN,
        FOOTER_H,
        PAGE_W - 2 * MARGIN,
        PAGE_H - HEADER_H - FOOTER_H,
        id='main', showBoundary=0,
    )
    template = PageTemplate(id='main', frames=[frame], onPage=dressing)
    doc = BaseDocTemplate(
        buf, pagesize=A4, pageTemplates=[template],
        leftMargin=MARGIN, rightMargin=MARGIN,
        topMargin=HEADER_H, bottomMargin=FOOTER_H,
        title=title, author='Sparky Tool — Mythics Inc.',
    )
    return doc, _styles()

# ── matplotlib chart rendering ────────────────────────────────────────────────

def _chart_png(spec: dict, col_width_pt: float) -> bytes | None:
    """Render a single chart spec to PNG bytes using matplotlib."""
    kind    = spec.get('type', 'bar')
    data    = spec.get('data') or []
    clrs    = spec.get('colors') or CHARTPAL
    x_key   = spec.get('xKey', '')
    y_keys  = spec.get('yKeys') or []
    nm_key  = spec.get('nameKey', 'name')
    dt_key  = spec.get('dataKey', 'value')

    if not data:
        return None

    # Convert pt to inches (1 pt = 1/72 inch).  Width is 2× for crispness.
    fig_w_in = col_width_pt / 72
    fig_h_in = fig_w_in * 0.62   # ~16:10 ratio
    fig, ax  = plt.subplots(figsize=(fig_w_in * 2, fig_h_in * 2), dpi=130)
    fig.patch.set_facecolor('white')
    ax.set_facecolor('#F8F8F6')

    # Spine / grid styling
    ax.spines[['top', 'right']].set_visible(False)
    ax.spines['left'].set_color('#CCCCCC')
    ax.spines['bottom'].set_color('#CCCCCC')
    ax.tick_params(colors='#666666', labelsize=8)
    ax.yaxis.grid(True, color='#EEEEEE', linewidth=0.6, zorder=0)
    ax.set_axisbelow(True)

    def c(i):
        return clrs[i % len(clrs)] if i < len(clrs) else CHARTPAL[i % 8]

    try:
        if kind in ('bar', 'composed'):
            labels = [str(r.get(x_key, '')) for r in data]
            xs     = np.arange(len(labels))
            w      = 0.72 / max(len(y_keys), 1)
            for i, yk in enumerate(y_keys):
                vals   = [float(r.get(yk, 0) or 0) for r in data]
                offset = (i - len(y_keys) / 2 + 0.5) * w
                ax.bar(xs + offset, vals, width=w * 0.88, color=c(i), label=yk,
                       zorder=3, edgecolor='white', linewidth=0.6)
            ax.set_xticks(xs)
            ax.set_xticklabels(labels, rotation=28, ha='right', fontsize=7.5)
            if len(y_keys) > 1:
                ax.legend(fontsize=7, framealpha=0.7, loc='upper right')

        elif kind in ('line', 'area'):
            labels = [str(r.get(x_key, '')) for r in data]
            xs     = np.arange(len(labels))
            for i, yk in enumerate(y_keys):
                vals = [float(r.get(yk, 0) or 0) for r in data]
                ax.plot(xs, vals, color=c(i), linewidth=2.2, label=yk,
                        marker='o', markersize=3.5, zorder=3)
                if kind == 'area':
                    ax.fill_between(xs, vals, alpha=0.14, color=c(i))
            ax.set_xticks(xs)
            ax.set_xticklabels(labels, rotation=28, ha='right', fontsize=7.5)
            if len(y_keys) > 1:
                ax.legend(fontsize=7, framealpha=0.7)

        elif kind == 'pie':
            lbls = [str(r.get(nm_key, '')) for r in data]
            vals = [float(r.get(dt_key, 0) or 0) for r in data]
            pie_c = [c(i) for i in range(len(lbls))]
            wedges, texts, pcts = ax.pie(
                vals, labels=lbls, colors=pie_c,
                autopct='%1.0f%%', startangle=90,
                wedgeprops={'edgecolor': 'white', 'linewidth': 2},
                pctdistance=0.82,
            )
            for t in texts:  t.set_fontsize(7.5)
            for t in pcts:   t.set_fontsize(7); t.set_color('#444444')
            ax.set_facecolor('white')
            ax.spines['left'].set_visible(False)
            ax.spines['bottom'].set_visible(False)
            ax.tick_params(left=False, bottom=False)
            ax.yaxis.grid(False)

        elif kind == 'radialBar':
            # Rendered as a styled horizontal bar (radial bar ≈ % gauge)
            lbls = [str(r.get(nm_key, '')) for r in data][:10]
            vals = [float(r.get(dt_key, 0) or 0) for r in data][:10]
            ys   = np.arange(len(lbls))
            bar_c = [c(i) for i in range(len(lbls))]
            ax.barh(ys, vals, color=bar_c, height=0.55, zorder=3,
                    edgecolor='white', linewidth=0.8)
            ax.set_yticks(ys)
            ax.set_yticklabels(lbls, fontsize=8)
            ax.set_xlim(0, max(max(vals, default=100) * 1.1, 100))
            ax.xaxis.grid(True, color='#EEEEEE', linewidth=0.6)
            ax.yaxis.grid(False)

        elif kind == 'scatter':
            xs_v = [float(r.get('x', 0) or 0) for r in data]
            ys_v = [float(r.get('y', 0) or 0) for r in data]
            ax.scatter(xs_v, ys_v, color=c(0), s=30, alpha=0.75, zorder=3,
                       edgecolors='white', linewidths=0.6)
            ax.set_xlabel(x_key or 'x', fontsize=8, color='#666666')
            ax.set_ylabel(y_keys[0] if y_keys else 'y', fontsize=8, color='#666666')

        else:
            plt.close(fig)
            return None

    except Exception:
        plt.close(fig)
        return None

    ax.set_title(spec.get('title', ''), fontsize=9.5, fontweight='bold',
                 pad=6, color='#222222')
    plt.tight_layout(pad=0.6)

    buf = io.BytesIO()
    fig.savefig(buf, format='png', dpi=130, bbox_inches='tight',
                facecolor='white', edgecolor='none')
    plt.close(fig)
    buf.seek(0)
    return buf.read()

# ── Chart card helper ─────────────────────────────────────────────────────────

def _chart_card(spec: dict, col_w_pt: float, s: dict) -> list:
    """Return a list of flowables for one chart card."""
    png = _chart_png(spec, col_w_pt)

    items: list = []

    # Title
    items.append(Paragraph(spec.get('title', 'Chart'), s['ctitle']))

    # Chart image — scale to fill column width, keep aspect ratio
    if png:
        reader = ImageReader(io.BytesIO(png))
        nat_w, nat_h = reader.getSize()
        img_w = col_w_pt - 0.6 * cm
        img_h = img_w * (nat_h / nat_w)
        items.append(Image(io.BytesIO(png), width=img_w, height=img_h))
    else:
        items.append(Spacer(col_w_pt, 3 * cm))

    # Description
    if spec.get('description'):
        items.append(Spacer(1, 1.5 * mm))
        items.append(Paragraph(spec['description'], s['cdesc']))

    return items

# ── Public: AI Analysis PDF ───────────────────────────────────────────────────

def generate_analysis_pdf(
    filename: str,
    summary: str,
    charts: list[dict],
    meta: dict,
) -> bytes:
    """
    Full AI Analysis report with Mythics header, summary paragraph,
    and a 2-column matplotlib chart grid.
    Returns raw PDF bytes.
    """
    buf = io.BytesIO()
    doc, S = _make_doc(buf, 'AI Analysis Report')

    content_w = PAGE_W - 2 * MARGIN
    col_gap   = 0.35 * cm
    col_w     = (content_w - col_gap) / 2

    today     = datetime.date.today().strftime('%B %d, %Y')
    safe_name = (filename or 'report').rsplit('.', 1)[0]
    total_rows = meta.get('total_rows', '—')
    total_cols = meta.get('total_columns', '—')
    pii_count  = meta.get('pii_masked_count', 0)

    story: list = []

    # ── Cover meta ──────────────────────────────────────────────────────────────
    story.append(Paragraph('AI Analysis Report', S['h1']))
    story.append(Paragraph(f'File: <b>{safe_name}</b>', S['meta']))
    story.append(Paragraph(f'Generated: {today}', S['meta']))
    story.append(Paragraph(
        f'{total_rows:,} rows  ·  {total_cols} columns  ·  {len(charts)} charts'
        if isinstance(total_rows, int) else
        f'{total_rows} rows  ·  {total_cols} columns  ·  {len(charts)} charts',
        S['meta'],
    ))

    if pii_count:
        story.append(Spacer(1, 1.5 * mm))
        story.append(Paragraph(
            f'&#x1F6E1; {pii_count} sensitive value{"s" if pii_count != 1 else ""} '
            f'masked before AI analysis — originals shown here',
            S['pii'],
        ))

    story.append(HRFlowable(width='100%', thickness=0.5, color=RULE,
                             spaceBefore=3*mm, spaceAfter=4*mm))

    # ── Summary ─────────────────────────────────────────────────────────────────
    story.append(Paragraph('AI ANALYSIS SUMMARY', S['section']))
    story.append(Paragraph(summary or '—', S['body']))
    story.append(HRFlowable(width='100%', thickness=0.4, color=RULE,
                             spaceBefore=2*mm, spaceAfter=4*mm))

    # ── Charts ─────────────────────────────────────────────────────────────────
    if charts:
        story.append(Paragraph('DATA VISUALISATIONS', S['section']))

        pairs = [charts[i:i + 2] for i in range(0, len(charts), 2)]
        for pair in pairs:
            cells = []
            for spec in pair:
                cells.append(_chart_card(spec, col_w, S))

            # Pad odd row so Table always has 2 columns
            while len(cells) < 2:
                cells.append([Spacer(1, 1)])

            tbl = Table(
                [cells],
                colWidths=[col_w, col_w],
                spaceBefore=2 * mm, spaceAfter=6 * mm,
            )
            tbl.setStyle(TableStyle([
                ('VALIGN',       (0, 0), (-1, -1), 'TOP'),
                ('LEFTPADDING',  (0, 0), (-1, -1), 6),
                ('RIGHTPADDING', (0, 0), (-1, -1), 6),
                ('TOPPADDING',   (0, 0), (-1, -1), 6),
                ('BOTTOMPADDING', (0, 0), (-1, -1), 8),
                ('BACKGROUND',   (0, 0), (-1, -1), CARDBG),
                ('BOX',          (0, 0), (0, 0), 0.6, RULE),
                ('BOX',          (1, 0), (1, 0), 0.6, RULE),
            ]))
            story.append(KeepTogether(tbl))

    doc.build(story)
    buf.seek(0)
    return buf.read()

# ── Public: Run Dashboard PDF ─────────────────────────────────────────────────

def generate_run_pdf(kpi: dict | None, runs: list[dict]) -> bytes:
    """
    Run Dashboard report: KPI summary boxes + styled runs table.
    Returns raw PDF bytes.
    """
    buf = io.BytesIO()
    doc, S = _make_doc(buf, 'Run Dashboard')

    content_w = PAGE_W - 2 * MARGIN
    today     = datetime.date.today().strftime('%B %d, %Y')

    story: list = []

    # ── Cover meta ──────────────────────────────────────────────────────────────
    story.append(Paragraph('Run Dashboard', S['h1']))
    story.append(Paragraph(f'Generated: {today}', S['meta']))
    story.append(Paragraph(
        f'{len(runs)} run{"s" if len(runs) != 1 else ""} recorded',
        S['meta'],
    ))
    story.append(HRFlowable(width='100%', thickness=0.5, color=RULE,
                             spaceBefore=3*mm, spaceAfter=4*mm))

    # ── KPI boxes ──────────────────────────────────────────────────────────────
    if kpi:
        story.append(Paragraph('PERFORMANCE OVERVIEW', S['section']))

        def _ms(v):
            if v is None: return '—'
            return f'{v} ms' if v < 1000 else f'{v / 1000:.1f} s'

        kpis = [
            ('Total Runs',    str(kpi.get('total', '—'))),
            ('Success Rate',  f"{kpi['rate']}%" if kpi.get('rate') is not None else '—'),
            ('Avg Duration',  _ms(kpi.get('avgMs'))),
            ('Success',       str(kpi.get('successCnt', '—'))),
        ]

        box_w = (content_w - 3 * 0.3 * cm) / 4

        def _kpi_cell(label, value):
            return [
                Paragraph(label.upper(), S['kpi_label']),
                Paragraph(value, S['kpi_value']),
            ]

        kpi_tbl = Table(
            [[_kpi_cell(l, v) for l, v in kpis]],
            colWidths=[box_w] * 4,
            spaceAfter=6 * mm,
        )
        kpi_tbl.setStyle(TableStyle([
            ('VALIGN',        (0, 0), (-1, -1), 'TOP'),
            ('LEFTPADDING',   (0, 0), (-1, -1), 8),
            ('RIGHTPADDING',  (0, 0), (-1, -1), 8),
            ('TOPPADDING',    (0, 0), (-1, -1), 8),
            ('BOTTOMPADDING', (0, 0), (-1, -1), 8),
            ('BACKGROUND',    (0, 0), (-1, -1), CARDBG),
            ('BOX',           (0, 0), (0, 0), 0.6, RULE),
            ('BOX',           (1, 0), (1, 0), 0.6, RULE),
            ('BOX',           (2, 0), (2, 0), 0.6, RULE),
            ('BOX',           (3, 0), (3, 0), 0.6, RULE),
        ]))
        story.append(kpi_tbl)
        story.append(HRFlowable(width='100%', thickness=0.4, color=RULE,
                                 spaceBefore=2*mm, spaceAfter=4*mm))

    # ── Runs table ──────────────────────────────────────────────────────────────
    if runs:
        story.append(Paragraph('RECENT RUNS', S['section']))

        HEADERS = ['Config', 'Status', 'Instance ID', 'Report ID', 'Rows', 'Duration']
        COL_W   = [3.3*cm, 1.5*cm, 3.5*cm, 3.5*cm, 1.5*cm, 2.0*cm]

        def _ms(v):
            if v is None: return '—'
            return f'{v} ms' if v < 1000 else f'{v/1000:.1f}s'

        rows_data = [[Paragraph(h, S['th']) for h in HEADERS]]
        for r in runs[:60]:
            rows_data.append([
                Paragraph(str(r.get('config_name') or '—')[:22], S['td']),
                Paragraph(str(r.get('status') or '—'), S['td']),
                Paragraph(str(r.get('instance_id') or '—')[:18], S['td']),
                Paragraph(str(r.get('report_id')   or '—')[:18], S['td']),
                Paragraph(f"{r['row_count']:,}" if r.get('row_count') else '—', S['td']),
                Paragraph(_ms(r.get('duration_ms')), S['td']),
            ])

        runs_tbl = Table(rows_data, colWidths=COL_W, repeatRows=1)
        runs_tbl.setStyle(TableStyle([
            # Header row
            ('BACKGROUND',    (0, 0), (-1, 0), HexColor('#F0EFEB')),
            ('FONTNAME',      (0, 0), (-1, 0), 'Helvetica-Bold'),
            ('FONTSIZE',      (0, 0), (-1, 0), 7),
            ('TEXTCOLOR',     (0, 0), (-1, 0), MID),
            ('BOTTOMPADDING', (0, 0), (-1, 0), 5),
            ('TOPPADDING',    (0, 0), (-1, 0), 5),
            # Data rows
            ('FONTNAME',      (0, 1), (-1, -1), 'Helvetica'),
            ('FONTSIZE',      (0, 1), (-1, -1), 7.5),
            ('ROWBACKGROUNDS', (0, 1), (-1, -1), [white, CARDBG]),
            ('TOPPADDING',    (0, 1), (-1, -1), 4),
            ('BOTTOMPADDING', (0, 1), (-1, -1), 4),
            ('LEFTPADDING',   (0, 0), (-1, -1), 6),
            ('RIGHTPADDING',  (0, 0), (-1, -1), 6),
            # Grid
            ('INNERGRID',     (0, 0), (-1, -1), 0.3, HexColor('#E8E8E8')),
            ('BOX',           (0, 0), (-1, -1), 0.5, RULE),
            ('VALIGN',        (0, 0), (-1, -1), 'MIDDLE'),
        ]))
        story.append(runs_tbl)

    doc.build(story)
    buf.seek(0)
    return buf.read()


# ── Module categorisation (mirrors frontend categoriseModule) ─────────────────

def _categorise_module(name: str) -> str:
    n = name.lower()
    if re.search(r'\bpay\b|ecompensation|eprofile|edevelopment|ebenefits|eperformance|self.service|employee self', n):
        return 'Self-Service'
    if re.search(r'payroll|pay/bill|salary|retroactive|prelim|concurrent calc|change.*check|change reversal', n):
        return 'Payroll'
    if re.search(r'benefit|fsa|cobra|benefit billing|deduction', n):
        return 'Benefits'
    if re.search(r'talent|candidate|succession|human resource|directory interface|hrms', n):
        return 'Human Capital'
    if re.search(r'absence|fmla|time and labor|labor rules', n):
        return 'Workforce'
    if re.search(r'general ledger|project costing|receivable|encumbrance|comm control|french public|german public', n):
        return 'Finance & Public'
    if re.search(r'pension|stock admin', n):
        return 'Pension & Stock'
    return 'Administration'


# ── Shared table / layout helpers ─────────────────────────────────────────────

def _data_table_style() -> list:
    return [
        ('BACKGROUND',     (0, 0), (-1, 0),  HexColor('#F0EFEB')),
        ('FONTNAME',       (0, 0), (-1, 0),  'Helvetica-Bold'),
        ('FONTSIZE',       (0, 0), (-1, 0),  7),
        ('TEXTCOLOR',      (0, 0), (-1, 0),  MID),
        ('BOTTOMPADDING',  (0, 0), (-1, 0),  5),
        ('TOPPADDING',     (0, 0), (-1, 0),  5),
        ('FONTNAME',       (0, 1), (-1, -1), 'Helvetica'),
        ('FONTSIZE',       (0, 1), (-1, -1), 7.5),
        ('ROWBACKGROUNDS', (0, 1), (-1, -1), [white, CARDBG]),
        ('TOPPADDING',     (0, 1), (-1, -1), 4),
        ('BOTTOMPADDING',  (0, 1), (-1, -1), 4),
        ('LEFTPADDING',    (0, 0), (-1, -1), 6),
        ('RIGHTPADDING',   (0, 0), (-1, -1), 6),
        ('INNERGRID',      (0, 0), (-1, -1), 0.3, HexColor('#E8E8E8')),
        ('BOX',            (0, 0), (-1, -1), 0.5, RULE),
        ('VALIGN',         (0, 0), (-1, -1), 'MIDDLE'),
    ]


def _two_col_chart_table(left: list, right: list, col_w: float) -> Table:
    """Wrap two chart-card flowable lists into a 2-column card grid row."""
    tbl = Table(
        [[left, right or [Spacer(1, 1)]]],
        colWidths=[col_w, col_w],
        spaceBefore=2 * mm, spaceAfter=6 * mm,
    )
    tbl.setStyle(TableStyle([
        ('VALIGN',        (0, 0), (-1, -1), 'TOP'),
        ('LEFTPADDING',   (0, 0), (-1, -1), 6),
        ('RIGHTPADDING',  (0, 0), (-1, -1), 6),
        ('TOPPADDING',    (0, 0), (-1, -1), 6),
        ('BOTTOMPADDING', (0, 0), (-1, -1), 8),
        ('BACKGROUND',    (0, 0), (-1, -1), CARDBG),
        ('BOX',           (0, 0), (0, 0),  0.6, RULE),
        ('BOX',           (1, 0), (1, 0),  0.6, RULE),
    ]))
    return tbl


def _kpi_box_table(items: list[tuple[str, str]], content_w: float, S: dict) -> Table:
    """4-up KPI box row."""
    box_w = (content_w - 3 * 0.3 * cm) / 4

    def _cell(label, value):
        return [Paragraph(label.upper(), S['kpi_label']), Paragraph(value, S['kpi_value'])]

    tbl = Table(
        [[_cell(l, v) for l, v in items]],
        colWidths=[box_w] * 4,
        spaceAfter=6 * mm,
    )
    tbl.setStyle(TableStyle([
        ('VALIGN',        (0, 0), (-1, -1), 'TOP'),
        ('LEFTPADDING',   (0, 0), (-1, -1), 8),
        ('RIGHTPADDING',  (0, 0), (-1, -1), 8),
        ('TOPPADDING',    (0, 0), (-1, -1), 8),
        ('BOTTOMPADDING', (0, 0), (-1, -1), 8),
        ('BACKGROUND',    (0, 0), (-1, -1), CARDBG),
        ('BOX',           (0, 0), (0, 0),  0.6, RULE),
        ('BOX',           (1, 0), (1, 0),  0.6, RULE),
        ('BOX',           (2, 0), (2, 0),  0.6, RULE),
        ('BOX',           (3, 0), (3, 0),  0.6, RULE),
    ]))
    return tbl


# ── Public: Functional Dashboard PDF ─────────────────────────────────────────

def generate_functional_pdf(filename: str, data: dict) -> bytes:
    """
    Functional Dashboard report: module adoption charts + module table + BU table.
    `data` is the parsed CoreHR dict {run_date, company, countries, modules,
    parameters, business_units}.
    Returns raw PDF bytes.
    """
    modules        = data.get('modules', {})
    countries      = data.get('countries', {})
    business_units = data.get('business_units', [])
    run_date       = data.get('run_date', '')
    company        = data.get('company', '')

    on_count  = sum(1 for v in modules.values() if v)
    off_count = sum(1 for v in modules.values() if not v)
    total     = on_count + off_count or 1
    active_countries = sum(1 for v in countries.values() if v)

    buf = io.BytesIO()
    doc, S = _make_doc(buf, 'Functional Dashboard')

    content_w = PAGE_W - 2 * MARGIN
    col_gap   = 0.35 * cm
    col_w     = (content_w - col_gap) / 2
    today     = datetime.date.today().strftime('%B %d, %Y')

    story: list = []

    # ── Cover ──────────────────────────────────────────────────────────────────
    story.append(Paragraph('Functional Dashboard', S['h1']))
    if company:
        story.append(Paragraph(f'Company: <b>{company}</b>', S['meta']))
    if run_date:
        story.append(Paragraph(f'Discovery run: {run_date}', S['meta']))
    story.append(Paragraph(f'File: {filename}', S['meta']))
    story.append(Paragraph(f'Generated: {today}', S['meta']))
    story.append(HRFlowable(width='100%', thickness=0.5, color=RULE,
                             spaceBefore=3 * mm, spaceAfter=4 * mm))

    # ── KPI row ────────────────────────────────────────────────────────────────
    story.append(Paragraph('MODULE OVERVIEW', S['section']))
    story.append(_kpi_box_table([
        ('Modules ON',       str(on_count)),
        ('Modules OFF',      str(off_count)),
        ('Countries Active', str(active_countries)),
        ('Business Units',   str(len(business_units))),
    ], content_w, S))
    story.append(HRFlowable(width='100%', thickness=0.4, color=RULE,
                             spaceBefore=2 * mm, spaceAfter=4 * mm))

    # ── Charts ─────────────────────────────────────────────────────────────────
    story.append(Paragraph('DATA VISUALISATIONS', S['section']))

    adoption_spec = {
        'type': 'pie', 'title': 'Module Adoption',
        'description': f'{on_count} of {total} modules enabled ({round(on_count / total * 100)}%)',
        'data': [{'name': 'Enabled', 'value': on_count}, {'name': 'Disabled', 'value': off_count}],
        'nameKey': 'name', 'dataKey': 'value',
        'colors': [CHARTPAL[0], CHARTPAL[3]],
    }

    cat_map: dict = {}
    for name, enabled in modules.items():
        cat = _categorise_module(name)
        if cat not in cat_map:
            cat_map[cat] = {'cat': cat, 'on': 0, 'off': 0}
        if enabled:
            cat_map[cat]['on'] += 1
        else:
            cat_map[cat]['off'] += 1
    cats = sorted(cat_map.values(), key=lambda x: -(x['on'] + x['off']))

    category_spec = {
        'type': 'bar', 'title': 'Modules by Category',
        'description': 'Enabled vs disabled count per functional category',
        'data': cats, 'xKey': 'cat', 'yKeys': ['on', 'off'],
        'colors': [CHARTPAL[0], CHARTPAL[3]],
    }

    story.append(KeepTogether(
        _two_col_chart_table(
            _chart_card(adoption_spec, col_w, S),
            _chart_card(category_spec, col_w, S),
            col_w,
        )
    ))

    if countries:
        country_data = [
            {'name': k, 'active': 1 if v else 0}
            for k, v in sorted(countries.items())
        ]
        country_spec = {
            'type': 'bar',
            'title': f'Country Coverage — {active_countries} Active',
            'description': 'Active (1) vs inactive (0) countries',
            'data': country_data, 'xKey': 'name', 'yKeys': ['active'],
            'colors': [CHARTPAL[2]],
        }
        story.append(KeepTogether(
            _two_col_chart_table(
                _chart_card(country_spec, col_w, S),
                [Spacer(1, 1)],
                col_w,
            )
        ))

    # ── Module table ───────────────────────────────────────────────────────────
    story.append(HRFlowable(width='100%', thickness=0.4, color=RULE,
                             spaceBefore=2 * mm, spaceAfter=4 * mm))
    story.append(Paragraph('MODULE DETAILS', S['section']))

    mod_rows = [[Paragraph(h, S['th']) for h in ['Module', 'Category', 'Status']]]
    for mod_name, enabled in sorted(modules.items(), key=lambda x: (not x[1], x[0])):
        mod_rows.append([
            Paragraph(mod_name[:60], S['td']),
            Paragraph(_categorise_module(mod_name), S['td']),
            Paragraph('ON' if enabled else 'OFF', S['td']),
        ])
    mod_tbl = Table(mod_rows, colWidths=[8.0 * cm, 4.0 * cm, 2.5 * cm], repeatRows=1)
    mod_tbl.setStyle(TableStyle(_data_table_style()))
    story.append(mod_tbl)

    # ── Business units table ───────────────────────────────────────────────────
    if business_units:
        story.append(Spacer(1, 4 * mm))
        story.append(Paragraph('BUSINESS UNITS', S['section']))
        bu_rows = [[Paragraph(h, S['th']) for h in ['Code', 'Description']]]
        for bu in business_units:
            bu_rows.append([
                Paragraph(bu.get('code', '—'), S['td']),
                Paragraph(bu.get('description', '—'), S['td']),
            ])
        bu_tbl = Table(bu_rows, colWidths=[3.0 * cm, 11.5 * cm], repeatRows=1)
        bu_tbl.setStyle(TableStyle(_data_table_style()))
        story.append(bu_tbl)

    doc.build(story)
    buf.seek(0)
    return buf.read()


# ── Public: Operational Dashboard PDF ────────────────────────────────────────

def generate_operational_pdf(runs: list[dict]) -> bytes:
    """
    Operational Dashboard report: run KPIs, status & config breakdown charts,
    and a recent-runs table.
    Returns raw PDF bytes.
    """
    buf = io.BytesIO()
    doc, S = _make_doc(buf, 'Operational Dashboard')

    content_w = PAGE_W - 2 * MARGIN
    col_gap   = 0.35 * cm
    col_w     = (content_w - col_gap) / 2
    today     = datetime.date.today().strftime('%B %d, %Y')

    completed  = [r for r in runs if r.get('status') in ('success', 'error')]
    successful = [r for r in runs if r.get('status') == 'success']
    with_dur   = [r for r in successful if r.get('duration_ms') is not None]
    avg_ms     = round(sum(r['duration_ms'] for r in with_dur) / len(with_dur)) if with_dur else None
    rate       = round(len(successful) / len(completed) * 100) if completed else None

    def _ms(v):
        if v is None: return '—'
        return f'{v} ms' if v < 1000 else f'{v / 1000:.1f} s'

    story: list = []

    # ── Cover ──────────────────────────────────────────────────────────────────
    story.append(Paragraph('Operational Dashboard', S['h1']))
    story.append(Paragraph(f'Generated: {today}', S['meta']))
    story.append(Paragraph(
        f'{len(runs)} run{"s" if len(runs) != 1 else ""} analysed', S['meta'],
    ))
    story.append(HRFlowable(width='100%', thickness=0.5, color=RULE,
                             spaceBefore=3 * mm, spaceAfter=4 * mm))

    # ── KPI row ────────────────────────────────────────────────────────────────
    story.append(Paragraph('PERFORMANCE OVERVIEW', S['section']))
    story.append(_kpi_box_table([
        ('Total Runs',   str(len(runs))),
        ('Success Rate', f'{rate}%' if rate is not None else '—'),
        ('Avg Duration', _ms(avg_ms)),
        ('Errors',       str(len(runs) - len(successful))),
    ], content_w, S))
    story.append(HRFlowable(width='100%', thickness=0.4, color=RULE,
                             spaceBefore=2 * mm, spaceAfter=4 * mm))

    # ── Charts ─────────────────────────────────────────────────────────────────
    story.append(Paragraph('RUN ANALYTICS', S['section']))

    status_spec = {
        'type': 'pie', 'title': 'Run Status Breakdown',
        'description': 'Distribution of run outcomes across all recorded runs',
        'data': [
            {'name': 'Success', 'value': len(successful)},
            {'name': 'Error',   'value': len(runs) - len(successful)},
        ],
        'nameKey': 'name', 'dataKey': 'value',
        'colors': [CHARTPAL[0], CHARTPAL[3]],
    }

    config_counts: dict = {}
    for r in runs:
        k = r.get('config_name') or 'Unknown'
        config_counts[k] = config_counts.get(k, 0) + 1
    top_configs = sorted(config_counts.items(), key=lambda x: -x[1])[:10]

    config_spec = {
        'type': 'bar', 'title': 'Runs by Configuration',
        'description': 'Most frequently executed configurations',
        'data': [{'config': k, 'runs': v} for k, v in top_configs],
        'xKey': 'config', 'yKeys': ['runs'],
        'colors': [CHARTPAL[2]],
    }

    story.append(KeepTogether(
        _two_col_chart_table(
            _chart_card(status_spec, col_w, S),
            _chart_card(config_spec, col_w, S),
            col_w,
        )
    ))

    # ── Runs table ─────────────────────────────────────────────────────────────
    story.append(HRFlowable(width='100%', thickness=0.4, color=RULE,
                             spaceBefore=2 * mm, spaceAfter=4 * mm))
    story.append(Paragraph('RECENT RUNS', S['section']))

    HEADERS = ['Config', 'Status', 'Instance ID', 'Report ID', 'Rows', 'Duration']
    COL_W   = [3.3 * cm, 1.5 * cm, 3.5 * cm, 3.5 * cm, 1.5 * cm, 2.0 * cm]

    op_rows = [[Paragraph(h, S['th']) for h in HEADERS]]
    for r in runs[:60]:
        op_rows.append([
            Paragraph(str(r.get('config_name') or '—')[:22], S['td']),
            Paragraph(str(r.get('status') or '—'), S['td']),
            Paragraph(str(r.get('instance_id') or '—')[:18], S['td']),
            Paragraph(str(r.get('report_id')   or '—')[:18], S['td']),
            Paragraph(f"{r['row_count']:,}" if r.get('row_count') else '—', S['td']),
            Paragraph(_ms(r.get('duration_ms')), S['td']),
        ])

    op_tbl = Table(op_rows, colWidths=COL_W, repeatRows=1)
    op_tbl.setStyle(TableStyle(_data_table_style()))
    story.append(op_tbl)

    doc.build(story)
    buf.seek(0)
    return buf.read()
