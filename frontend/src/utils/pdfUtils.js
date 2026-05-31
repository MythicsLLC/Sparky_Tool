/**
 * pdfUtils.js — shared helpers for programmatic jsPDF report generation.
 *
 * All layout is in PDF points (pt). A4: 595 × 842 pt.
 * These functions never call html2canvas — charts are captured via SVG
 * serialization → canvas → PNG, everything else is pure jsPDF drawing.
 */

// ── Logo loading ──────────────────────────────────────────────────────────────

/**
 * Load a PNG URL as a base64 data-URL, preserving natural dimensions.
 * Returns null on failure so callers can skip the logo gracefully.
 */
export async function loadLogoBase64(url) {
  return new Promise((resolve) => {
    const img = new Image()
    img.crossOrigin = 'anonymous'
    img.onload = () => {
      const c = document.createElement('canvas')
      c.width = img.naturalWidth
      c.height = img.naturalHeight
      c.getContext('2d').drawImage(img, 0, 0)
      resolve({ data: c.toDataURL('image/png'), w: img.naturalWidth, h: img.naturalHeight })
    }
    img.onerror = () => resolve(null)
    img.src = url
  })
}

// ── SVG → PNG extraction ──────────────────────────────────────────────────────

/**
 * Convert a live SVG DOM element to a PNG data-URL via canvas.
 * Returns null on any failure — callers render a placeholder box instead.
 *
 * @param {SVGElement} svgEl
 * @param {string}     bgColor  — fill colour behind the SVG (default white)
 * @param {number}     scale    — pixel density multiplier for crispness (default 2)
 */
export async function svgElementToPng(svgEl, bgColor = '#ffffff', scale = 2) {
  if (!svgEl) return null
  try {
    const bbox = svgEl.getBoundingClientRect()
    const w = bbox.width  || svgEl.getAttribute('width')  || 400
    const h = bbox.height || svgEl.getAttribute('height') || 280
    if (!w || !h) return null

    // Serialize and ensure xmlns + explicit dimensions
    let svgStr = new XMLSerializer().serializeToString(svgEl)
    if (!svgStr.includes('xmlns=')) {
      svgStr = svgStr.replace('<svg', '<svg xmlns="http://www.w3.org/2000/svg"')
    }
    svgStr = svgStr.replace(/<svg([^>]*)>/i, (_, attrs) => {
      let a = attrs
      if (!/width=/.test(a))  a += ` width="${w}"`
      if (!/height=/.test(a)) a += ` height="${h}"`
      return `<svg${a}>`
    })

    // Rasterise through a canvas at 2× for retina-quality charts
    const canvas = document.createElement('canvas')
    canvas.width  = Math.round(+w * scale)
    canvas.height = Math.round(+h * scale)
    const ctx = canvas.getContext('2d')
    ctx.fillStyle = bgColor
    ctx.fillRect(0, 0, canvas.width, canvas.height)

    await new Promise((res, rej) => {
      const img = new Image()
      img.onload  = () => { ctx.drawImage(img, 0, 0, canvas.width, canvas.height); res() }
      img.onerror = rej
      img.src = 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(svgStr)
    })

    return { data: canvas.toDataURL('image/png'), w: +w, h: +h }
  } catch {
    return null
  }
}

/**
 * Extract all recharts SVGs from a container element.
 * Returns an array of PNG results (or null entries on failure) in DOM order.
 */
export async function extractRechartsImages(containerEl, bgColor = '#ffffff') {
  if (!containerEl) return []
  const svgEls = Array.from(containerEl.querySelectorAll('.recharts-wrapper > svg'))
  return Promise.all(svgEls.map((el) => svgElementToPng(el, bgColor)))
}

// ── PDF drawing primitives ────────────────────────────────────────────────────

const ACCENT_RGB = [180, 150, 60]  // matches the gold accent

/**
 * Draw the standard Mythics report header on the current page.
 * Returns the Y coordinate of the first usable line below the header.
 */
export function drawPdfHeader(pdf, { logo, title, metaLines = [], pageW, margin }) {
  // Mythics logo — top right, preserving aspect ratio
  if (logo) {
    const logoW = 90
    const logoH = Math.round(logoW * (logo.h / logo.w))
    pdf.addImage(logo.data, 'PNG', pageW - margin - logoW, Math.round(margin * 0.75), logoW, logoH)
  }

  // Report title
  pdf.setFont('helvetica', 'bold')
  pdf.setFontSize(17)
  pdf.setTextColor(22, 22, 22)
  pdf.text(title, margin, margin + 16)

  let y = margin + 30

  // Meta lines
  pdf.setFont('helvetica', 'normal')
  pdf.setFontSize(8.5)
  pdf.setTextColor(110, 110, 110)
  for (const line of metaLines) {
    pdf.text(line, margin, y)
    y += 13
  }

  y += 8

  // Divider
  pdf.setDrawColor(200, 200, 200)
  pdf.setLineWidth(0.5)
  pdf.line(margin, y, pageW - margin, y)

  return y + 14
}

/**
 * Draw a section heading with a short gold accent underline.
 * Returns Y after the heading (ready for content).
 */
export function drawSectionHeading(pdf, text, x, y) {
  pdf.setFont('helvetica', 'bold')
  pdf.setFontSize(8.5)
  pdf.setTextColor(60, 60, 60)
  pdf.text(text, x, y)
  y += 5
  pdf.setDrawColor(...ACCENT_RGB)
  pdf.setLineWidth(1.2)
  const underlineW = Math.min(text.length * 5.5, 110)
  pdf.line(x, y, x + underlineW, y)
  return y + 13
}

/**
 * Draw word-wrapped paragraph text, inserting page breaks as needed.
 * Returns Y after the last line.
 */
export function drawParagraph(pdf, text, x, y, maxW, { pageH, margin, fontSize = 9.5, lineH = 13.5 } = {}) {
  if (!text) return y
  pdf.setFont('helvetica', 'normal')
  pdf.setFontSize(fontSize)
  pdf.setTextColor(45, 45, 45)
  const lines = pdf.splitTextToSize(text, maxW)
  for (const line of lines) {
    if (pageH && y + lineH > pageH - margin) {
      pdf.addPage()
      y = margin
    }
    pdf.text(line, x, y)
    y += lineH
  }
  return y
}

/**
 * Draw a thin horizontal divider.
 */
export function drawDivider(pdf, x, y, w) {
  pdf.setDrawColor(220, 220, 220)
  pdf.setLineWidth(0.4)
  pdf.line(x, y, x + w, y)
  return y + 10
}

/**
 * Draw a KPI card box (label above, large value below).
 * w × h are in pt, x/y are the top-left corner.
 */
export function drawKpiCard(pdf, { label, value, x, y, w, h }) {
  // Card border
  pdf.setDrawColor(220, 220, 220)
  pdf.setLineWidth(0.5)
  pdf.setFillColor(250, 250, 250)
  pdf.roundedRect(x, y, w, h, 3, 3, 'FD')

  // Label
  pdf.setFont('helvetica', 'normal')
  pdf.setFontSize(7)
  pdf.setTextColor(130, 130, 130)
  pdf.text(label.toUpperCase(), x + 8, y + 13)

  // Value
  pdf.setFont('helvetica', 'bold')
  pdf.setFontSize(17)
  pdf.setTextColor(22, 22, 22)
  pdf.text(String(value ?? '—'), x + 8, y + 30)
}

/**
 * Draw a simple table with header row and data rows.
 * Returns Y after the table.
 */
export function drawTable(pdf, { headers, rows, colWidths, x, y, pageH, margin }) {
  const ROW_H   = 16
  const HEAD_H  = 18
  const totalW  = colWidths.reduce((s, w) => s + w, 0)

  // Header background
  pdf.setFillColor(240, 240, 240)
  pdf.rect(x, y, totalW, HEAD_H, 'F')
  pdf.setDrawColor(210, 210, 210)
  pdf.setLineWidth(0.4)
  pdf.rect(x, y, totalW, HEAD_H)

  // Header text
  pdf.setFont('helvetica', 'bold')
  pdf.setFontSize(7)
  pdf.setTextColor(70, 70, 70)
  let cx = x
  for (let i = 0; i < headers.length; i++) {
    pdf.text(headers[i], cx + 5, y + 12)
    cx += colWidths[i]
  }
  y += HEAD_H

  // Data rows
  pdf.setFont('helvetica', 'normal')
  pdf.setFontSize(7.5)
  for (let r = 0; r < rows.length; r++) {
    if (y + ROW_H > pageH - margin) {
      pdf.addPage()
      y = margin
    }
    const even = r % 2 === 0
    if (!even) {
      pdf.setFillColor(248, 248, 248)
      pdf.rect(x, y, totalW, ROW_H, 'F')
    }
    pdf.setDrawColor(230, 230, 230)
    pdf.rect(x, y, totalW, ROW_H)

    cx = x
    for (let i = 0; i < rows[r].length; i++) {
      const cell = String(rows[r][i] ?? '—')
      pdf.setTextColor(50, 50, 50)
      // Clip long values
      const maxCellW = colWidths[i] - 10
      const clipped = pdf.splitTextToSize(cell, maxCellW)[0]
      pdf.text(clipped, cx + 5, y + 11)
      cx += colWidths[i]
    }
    y += ROW_H
  }
  return y + 4
}

/**
 * Draw a chart image box with title and description.
 * Returns the height consumed (for the caller to advance Y).
 */
export function drawChartBlock(pdf, { img, title, description, x, y, w, maxH = 190 }) {
  const TITLE_H = 16
  const DESC_H  = 16
  const PAD     = 6

  // Compute image height (preserve aspect, cap at maxH)
  const imgH = img ? Math.min(w * (img.h / img.w), maxH) : 120
  const blockH = TITLE_H + imgH + DESC_H + PAD * 2

  // Outer border
  pdf.setDrawColor(225, 225, 225)
  pdf.setLineWidth(0.4)
  pdf.setFillColor(255, 255, 255)
  pdf.roundedRect(x, y, w, blockH, 3, 3, 'FD')

  // Title bar background
  pdf.setFillColor(245, 245, 245)
  pdf.roundedRect(x, y, w, TITLE_H, 3, 3, 'F')
  pdf.setDrawColor(230, 230, 230)
  pdf.line(x, y + TITLE_H, x + w, y + TITLE_H)

  // Title text
  pdf.setFont('helvetica', 'bold')
  pdf.setFontSize(7.5)
  pdf.setTextColor(30, 30, 30)
  const titleClipped = pdf.splitTextToSize(title || 'Chart', w - 12)[0]
  pdf.text(titleClipped, x + 6, y + 11)

  // Chart image or grey placeholder
  const imgY = y + TITLE_H + PAD
  if (img) {
    pdf.addImage(img.data, 'PNG', x + 4, imgY, w - 8, imgH)
  } else {
    pdf.setFillColor(242, 242, 242)
    pdf.rect(x + 4, imgY, w - 8, imgH, 'F')
    pdf.setFont('helvetica', 'normal')
    pdf.setFontSize(7.5)
    pdf.setTextColor(170, 170, 170)
    pdf.text('Chart not available', x + w / 2 - 22, imgY + imgH / 2)
  }

  // Description
  if (description) {
    pdf.setFont('helvetica', 'normal')
    pdf.setFontSize(7)
    pdf.setTextColor(110, 110, 110)
    const desc = pdf.splitTextToSize(description, w - 12)[0]
    pdf.text(desc, x + 6, y + TITLE_H + PAD + imgH + PAD + 7)
  }

  return blockH
}

/**
 * Stamp a consistent footer (centred page number + branding) on every page.
 * Must be called after all pages have been added.
 */
export function addPageFooters(pdf, pageW, pageH, margin) {
  const total = pdf.internal.getNumberOfPages()
  for (let p = 1; p <= total; p++) {
    pdf.setPage(p)
    pdf.setFont('helvetica', 'normal')
    pdf.setFontSize(7)
    pdf.setTextColor(175, 175, 175)
    const label = `Page ${p} of ${total}  ·  Sparky Tool by Mythics Inc.`
    const lw = pdf.getTextWidth(label)
    pdf.text(label, (pageW - lw) / 2, pageH - margin * 0.55)
  }
}
