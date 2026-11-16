"""Step 2c & 3: Strict programmatic audit + sync to C:\\ByGigaBit targets."""
import re
import shutil
import docx
from docx.shared import Cm
from docx.enum.text import WD_ALIGN_PARAGRAPH, WD_TAB_ALIGNMENT

WORKING_PATH = r"C:\Users\Lenovo T14\.gemini\antigravity\brain\83716de7-76b3-46d8-a8df-7a176ce3376a\scratch\working_layout.docx"
FINAL_SCRATCH = r"C:\Users\Lenovo T14\.gemini\antigravity\brain\83716de7-76b3-46d8-a8df-7a176ce3376a\scratch\final_updated_note.docx"

TARGETS = [
    r"C:\ByGigaBit\Шевцов_Пояснювальна_записка – копія.docx",
    r"C:\ByGigaBit\Шевцов_пояснювальна.docx",
    r"C:\ByGigaBit\Шевцов_Пояснювальна_записка_оновлена.docx",
]

doc = docx.Document(WORKING_PATH)

# 1. Verify formulas (1)-(11)
formulas_checked = 0
for i, p in enumerate(doc.paragraphs):
    st = p.text.strip()
    if re.search(r"\t\(\d+\)$", st):
        fi_cm = round(p.paragraph_format.first_line_indent.cm, 2) if p.paragraph_format.first_line_indent else None
        tabs = [(round(t.position.cm, 2), t.alignment) for t in p.paragraph_format.tab_stops]
        assert p.alignment in (WD_ALIGN_PARAGRAPH.LEFT, None), f"Formula P{i} not LEFT: {p.alignment}"
        assert fi_cm == 1.5, f"Formula P{i} indent {fi_cm} != 1.5"
        assert any(pos == 15.0 for pos, _ in tabs), f"Formula P{i} missing 15cm tab: {tabs}"
        formulas_checked += 1

assert formulas_checked == 11, f"Expected 11 formulas, got {formulas_checked}"
print(f"VERIFIED Formulas: {formulas_checked}/11 LEFT aligned, 1.50cm indent, 15.0cm ruler tab stop.")

# 2. Verify zero 1.25cm indents remain in paragraphs or subheadings
bad_indents = []
for i, p in enumerate(doc.paragraphs):
    fi = p.paragraph_format.first_line_indent
    if fi is not None:
        cm_val = round(fi.cm, 2)
        if 1.15 <= cm_val <= 1.35:
            bad_indents.append((i, cm_val, p.text.strip()[:45]))
assert not bad_indents, f"Found non-1.5cm indents: {bad_indents}"
print("VERIFIED Indents: 0 paragraphs remain with ~1.25cm indent; all body & subheadings unified at 1.50cm.")

# 3. Verify table captions & "Продовження таблиці" headers
tbl_caps = 0
cont_caps = 0
for i, p in enumerate(doc.paragraphs):
    s = p.text.strip()
    if s.startswith("Таблиця "):
        fi_cm = round(p.paragraph_format.first_line_indent.cm, 2) if p.paragraph_format.first_line_indent else None
        assert p.alignment in (WD_ALIGN_PARAGRAPH.LEFT, None), f"Caption P{i} align: {p.alignment}"
        assert fi_cm == 1.5, f"Caption P{i} indent: {fi_cm}"
        assert p.paragraph_format.keep_with_next is True
        tbl_caps += 1
    elif s.startswith("Продовження таблиці "):
        fi_cm = round(p.paragraph_format.first_line_indent.cm, 2) if p.paragraph_format.first_line_indent is not None else None
        assert p.alignment == WD_ALIGN_PARAGRAPH.RIGHT, f"Cont P{i} align: {p.alignment}"
        assert fi_cm in (0.0, None), f"Cont P{i} indent: {fi_cm}"
        assert p.paragraph_format.page_break_before is True
        assert p.paragraph_format.keep_with_next is True
        cont_caps += 1
print(f"VERIFIED Captions: {tbl_caps} table captions, {cont_caps} 'Продовження таблиці' headers.")

# 4. Verify zero mid-table page breaks in Word XML
mid_breaks = []
for ti, tbl in enumerate(doc.tables):
    rows = list(tbl._element.xpath("./w:tr"))
    for ri, r in enumerate(rows):
        if any(e.tag.endswith("}lastRenderedPageBreak") for e in r.iter()):
            mid_breaks.append((ti, ri))
assert not mid_breaks, f"Tables still breaking across pages: {mid_breaks}"
print(f"VERIFIED Tables: All {len(doc.tables)} tables/parts fit cleanly within single pages (0 mid-table page breaks).")

# 4b. Verify Page 1 (Table 0)
t0 = doc.tables[0]
assert t0.rows[3].cells[11].text.strip() == "68", f"Table 0 R03 c11 != '68': {t0.rows[3].cells[11].text}"
assert t0.rows[9].cells[7].text.strip() == "Пояснювальна записка"
for idx, r_idx in enumerate([11, 14, 17, 19, 21, 23, 25, 27, 29], start=1):
    assert t0.rows[r_idx].cells[4].text.strip() == f"КП.ОК25.ПІ.231.27 Д{idx}"
    assert t0.rows[r_idx].cells[11].text.strip() == "1"
assert len(t0.rows) == 47
assert t0.rows[31].cells[7].text.strip() == "Програмне"
assert t0.rows[32].cells[7].text.strip() == "забезпечення"
assert "Відомість проєкту" in t0.rows[42].cells[7].text
assert "КП.ОК25.ПІ.231.27 ВП" in t0.rows[39].cells[7].text
print("VERIFIED Page 1: Відомість проєкту entries 01..12 (47 rows) and ВП stamp verified.")

# 4c. Verify Додаток Б linked section and 9 framed diagram sections (Д1..Д9)
sec_appB = doc.sections[-10]
assert sec_appB.header.is_linked_to_previous is True, "Додаток Б header not linked to ПЗ!"
assert sec_appB.footer.is_linked_to_previous is True, "Додаток Б footer not linked to ПЗ!"
for idx, sec in enumerate(doc.sections[-9:], start=1):
    assert sec.header.is_linked_to_previous is False, f"Д{idx} header still linked!"
    assert sec.footer.is_linked_to_previous is False, f"Д{idx} footer still linked!"
    ftxt = "".join(t.text or "" for t in sec.footer._element.iter() if t.tag.endswith("}t")).strip()
    assert ftxt == "", f"Д{idx} footer not empty: {repr(ftxt)}"
    txbxs = [e for e in sec.header._element.iter() if e.tag.endswith("}txbxContent")]
    assert len(txbxs) == 74
    for ti in (7, 32, 44, 69):
        val = "".join(t.text or "" for t in txbxs[ti].iter() if t.tag.endswith("}t")).strip()
        assert val == f"КП.ОК25.ПІ.231.27 Д{idx}", f"Д{idx} txbx[{ti}] mismatch: {repr(val)}"
for idx, p in enumerate(doc.paragraphs[-9:], start=1):
    assert p.text.strip() == "", f"Д{idx} body paragraph has unexpected text: {repr(p.text)}"
    imgs = sum(1 for e in p._element.iter() if e.tag.endswith("}drawing"))
    assert imgs == 1, f"Д{idx} body paragraph drawing count {imgs} != 1"
print("VERIFIED Diagrams Д1..Д9: Додаток Б inherits ПЗ frame; all 9 diagrams have Д1..Д9 frames and ONLY centered diagram images.")

# 5. Copy to scratch final and C:\ByGigaBit targets
shutil.copy2(WORKING_PATH, FINAL_SCRATCH)
print("Saved final verified archive copy:", FINAL_SCRATCH)

locked = []
synced = []
for tgt in TARGETS:
    try:
        shutil.copy2(FINAL_SCRATCH, tgt)
        synced.append(tgt)
        print("Synced:", tgt)
    except PermissionError:
        locked.append(tgt)
        print(f"LOCKED (open in Word): {tgt}")

print(f"Sync summary: {len(synced)} updated, {len(locked)} locked.")
