"""
gerador_caixa.py
Gera o PDF de Movimentações do Caixa para Fênix Funerária.
Recebe um dict `dados` e retorna bytes do PDF (sem salvar em disco).
"""

import io
from reportlab.lib.pagesizes import A4
from reportlab.lib import colors
from reportlab.lib.units import mm
from reportlab.platypus import (
    SimpleDocTemplate, Paragraph, Spacer, Table, TableStyle
)
from reportlab.lib.styles import ParagraphStyle
from reportlab.lib.enums import TA_LEFT, TA_CENTER, TA_RIGHT
from reportlab.lib.colors import HexColor

# ── Paleta ────────────────────────────────────
NAVY      = HexColor("#0D1B2A")
NAVY_MID  = HexColor("#1B2E45")
GOLD      = HexColor("#C9A84C")
ENTRADA_C = HexColor("#1A7A4A")
SAIDA_C   = HexColor("#B52B27")
SALDO_C   = HexColor("#1A4FA0")
BG_CARD   = HexColor("#F4F7FB")
ROW_ALT   = HexColor("#F8F9FB")
BORDER    = HexColor("#D1D9E6")
TXT_DARK  = HexColor("#0D1B2A")
TXT_MID   = HexColor("#4A5568")
TXT_LIGHT = HexColor("#718096")
WHITE     = colors.white


# ── Helpers ───────────────────────────────────
def fmt_brl(v):
    if v is None:
        return "—"
    return f"R$ {v:,.2f}".replace(",", "X").replace(".", ",").replace("X", ".")


def ps(name, **kw):
    """Cria ParagraphStyle com defaults sensatos."""
    base = dict(fontName="Helvetica", fontSize=8, textColor=TXT_DARK, leading=12)
    base.update(kw)
    return ParagraphStyle(name, **base)


# ── Estilos globais ───────────────────────────
S = {
    "hdr_val":  ps("hdr_val",  fontSize=7,  textColor=WHITE, alignment=TA_RIGHT),
    "sub":      ps("sub",      fontSize=8,  textColor=WHITE),
    "sub_r":    ps("sub_r",    fontSize=8,  textColor=WHITE, alignment=TA_RIGHT),
    "card_lbl": ps("card_lbl", fontSize=6.5,textColor=TXT_LIGHT, fontName="Helvetica-Bold"),
    "card_val": ps("card_val", fontSize=15, fontName="Helvetica-Bold"),
    "card_tot": ps("card_tot", fontSize=15, fontName="Helvetica-Bold", textColor=WHITE),
    "sec_lbl":  ps("sec_lbl",  fontSize=9,  fontName="Helvetica-Bold", textColor=NAVY),
    "th":       ps("th",  fontSize=7.5, fontName="Helvetica-Bold", textColor=WHITE),
    "th_c":     ps("th_c",fontSize=7.5, fontName="Helvetica-Bold", textColor=WHITE, alignment=TA_CENTER),
    "th_r":     ps("th_r",fontSize=7.5, fontName="Helvetica-Bold", textColor=WHITE, alignment=TA_RIGHT),
    "td":       ps("td",  fontSize=7.5, textColor=TXT_DARK),
    "td_c":     ps("td_c",fontSize=7.5, textColor=TXT_DARK, alignment=TA_CENTER),
    "td_r":     ps("td_r",fontSize=7.5, textColor=TXT_DARK, alignment=TA_RIGHT),
    "td_ent":   ps("td_ent",fontSize=7.5,textColor=ENTRADA_C, alignment=TA_RIGHT, fontName="Helvetica-Bold"),
    "td_sai":   ps("td_sai",fontSize=7.5,textColor=SAIDA_C,   alignment=TA_RIGHT, fontName="Helvetica-Bold"),
    "td_neg":   ps("td_neg",fontSize=7.5,textColor=TXT_LIGHT, alignment=TA_RIGHT),
    "footer":   ps("footer",fontSize=7,  textColor=TXT_LIGHT, alignment=TA_CENTER),
    "footer_r": ps("footer_r",fontSize=7,textColor=TXT_LIGHT, alignment=TA_RIGHT),
}


def _ts(*cmds):
    return TableStyle(list(cmds))


# ── Blocos construtores ───────────────────────
def _header(d, W):
    title_row = [[
        Paragraph("<font color='white' size='12'><b>RELATÓRIO DE MOVIMENTAÇÕES DO CAIXA</b></font>",
                  ps("t", fontSize=12, fontName="Helvetica-Bold", textColor=WHITE)),
        Paragraph(f"<font color='white' size='7'>IMPRESSO EM: {d['impresso_em']}</font>", S["hdr_val"]),
    ]]
    t_title = Table(title_row, colWidths=[W * .68, W * .32])
    t_title.setStyle(_ts(
        ("BACKGROUND",    (0,0),(-1,-1), NAVY),
        ("TOPPADDING",    (0,0),(-1,-1), 10),
        ("BOTTOMPADDING", (0,0),(-1,-1), 10),
        ("LEFTPADDING",   (0,0),(0,-1),  12),
        ("RIGHTPADDING",  (-1,0),(-1,-1),12),
        ("VALIGN",        (0,0),(-1,-1), "MIDDLE"),
    ))

    gold_bar = Table([[""]], colWidths=[W], rowHeights=[2.5])
    gold_bar.setStyle(_ts(("BACKGROUND",(0,0),(-1,-1), GOLD)))

    status_hex = "#1A7A4A" if d.get("status") == "ABERTO" else "#B52B27"
    sub_row = [[
        Paragraph(f"<b>CONTA:</b>  {d['conta']}", S["sub"]),
        Paragraph(
            f"<b>DATA DO CAIXA:</b> {d['data_caixa']}   "
            f"<font color='{status_hex}'><b>● {d.get('status','')}</b></font>",
            S["sub_r"]
        ),
    ]]
    t_sub = Table(sub_row, colWidths=[W * .55, W * .45])
    t_sub.setStyle(_ts(
        ("BACKGROUND",    (0,0),(-1,-1), NAVY_MID),
        ("TOPPADDING",    (0,0),(-1,-1), 7),
        ("BOTTOMPADDING", (0,0),(-1,-1), 7),
        ("LEFTPADDING",   (0,0),(0,-1),  12),
        ("RIGHTPADDING",  (-1,0),(-1,-1),12),
        ("VALIGN",        (0,0),(-1,-1), "MIDDLE"),
    ))
    return [t_title, gold_bar, t_sub]


def _cards(d, W):
    cw = (W - 9*mm) / 4

    def card(label, value, bar_color, dark_bg=False):
        bg = NAVY if dark_bg else BG_CARD
        lbl_c = HexColor("#A0AEC0") if dark_bg else TXT_LIGHT
        val_c = WHITE if dark_bg else bar_color
        lbl_s = ps("cl", fontSize=6.5, fontName="Helvetica-Bold", textColor=lbl_c)
        val_s = ps("cv", fontSize=14,  fontName="Helvetica-Bold", textColor=val_c)
        inner = Table([[Paragraph(label, lbl_s)],[Paragraph(value, val_s)]],
                      colWidths=[cw - 8*mm])
        inner.setStyle(_ts(
            ("LEFTPADDING",(0,0),(-1,-1),0),("RIGHTPADDING",(0,0),(-1,-1),0),
            ("TOPPADDING",(0,0),(-1,-1),0),("BOTTOMPADDING",(0,0),(-1,-1),2),
        ))
        bar_c = GOLD if dark_bg else bar_color
        bar = Table([[""]], colWidths=[3], rowHeights=[14*mm])
        bar.setStyle(_ts(("BACKGROUND",(0,0),(-1,-1), bar_c)))
        wrap = Table([[bar, inner]], colWidths=[4*mm, cw-4*mm])
        wrap.setStyle(_ts(
            ("BACKGROUND",(0,0),(-1,-1), bg),
            ("LEFTPADDING",(0,0),(-1,-1),2),("RIGHTPADDING",(0,0),(-1,-1),4),
            ("TOPPADDING",(0,0),(-1,-1),6),("BOTTOMPADDING",(0,0),(-1,-1),6),
            ("BOX",(0,0),(-1,-1), 0.5, BORDER if not dark_bg else NAVY),
        ))
        return wrap

    row = [[
        card("SALDO ANTERIOR", fmt_brl(d["saldo_ant"]), TXT_MID),
        card("TOTAL ENTRADAS", fmt_brl(d["total_ent"]), ENTRADA_C),
        card("TOTAL SAÍDAS",   fmt_brl(d["total_sai"]), SAIDA_C),
        card("SALDO FINAL",    fmt_brl(d["saldo_fin"]), GOLD, dark_bg=True),
    ]]
    tbl = Table(row, colWidths=[cw]*4)
    tbl.setStyle(_ts(
        ("LEFTPADDING",(0,0),(-1,-1),0),
        ("RIGHTPADDING",(0,0),(2,0),3),
        ("RIGHTPADDING",(3,0),(3,0),0),
        ("TOPPADDING",(0,0),(-1,-1),0),
        ("BOTTOMPADDING",(0,0),(-1,-1),0),
    ))
    return tbl


def _section(text, W, count=None):
    lbl = f"{text}  <font color='#C9A84C' size='8'><b>({count})</b></font>" if count else text
    tbl = Table([[Paragraph(lbl, S["sec_lbl"])]], colWidths=[W])
    tbl.setStyle(_ts(
        ("LEFTPADDING",(0,0),(-1,-1),8),
        ("TOPPADDING",(0,0),(-1,-1),6),
        ("BOTTOMPADDING",(0,0),(-1,-1),4),
        ("LINEBELOW",(0,0),(-1,-1), 1.2, NAVY),
    ))
    return tbl


def _lancamentos(d, W):
    # larguras das colunas
    c_data, c_forma, c_tipo, c_ent, c_sai, c_usr = \
        30*mm, 22*mm, 18*mm, 20*mm, 18*mm, 22*mm
    c_hist = W - c_data - c_forma - c_tipo - c_ent - c_sai - c_usr

    hdrs = [
        Paragraph("DATA / HORA", S["th"]),
        Paragraph("FORMA",       S["th_c"]),
        Paragraph("TIPO",        S["th_c"]),
        Paragraph("ENTRADA",     S["th_r"]),
        Paragraph("SAÍDA",       S["th_r"]),
        Paragraph("HISTÓRICO",   S["th"]),
        Paragraph("USUÁRIO",     S["th"]),
    ]
    rows = [hdrs]
    for l in d["lancamentos"]:
        tc = "#1A7A4A" if l["tipo"] == "ENTRADA" else "#B52B27"
        ent = fmt_brl(l.get("entrada"))
        sai = fmt_brl(l.get("saida"))
        rows.append([
            Paragraph(l["data"],      S["td"]),
            Paragraph(l["forma"],     S["td_c"]),
            Paragraph(f"<font color='{tc}'><b>{l['tipo']}</b></font>", S["td_c"]),
            Paragraph(ent, S["td_ent"] if l.get("entrada") else S["td_neg"]),
            Paragraph(sai, S["td_sai"] if l.get("saida")   else S["td_neg"]),
            Paragraph(l["historico"], S["td"]),
            Paragraph(l["usuario"],   S["td"]),
        ])

    tbl = Table(rows, colWidths=[c_data,c_forma,c_tipo,c_ent,c_sai,c_hist,c_usr],
                repeatRows=1)
    tbl.setStyle(_ts(
        ("BACKGROUND",    (0,0),(-1,0),   NAVY),
        ("ROWBACKGROUNDS",(0,1),(-1,-1),  [WHITE, ROW_ALT]),
        ("LINEBELOW",     (0,0),(-1,0),   0.5, GOLD),
        ("LINEBELOW",     (0,1),(-1,-1),  0.3, BORDER),
        ("BOX",           (0,0),(-1,-1),  0.5, BORDER),
        ("TOPPADDING",    (0,0),(-1,-1),  5),
        ("BOTTOMPADDING", (0,0),(-1,-1),  5),
        ("LEFTPADDING",   (0,0),(-1,-1),  5),
        ("RIGHTPADDING",  (0,0),(-1,-1),  5),
        ("VALIGN",        (0,0),(-1,-1),  "MIDDLE"),
    ))
    return tbl


def _totais(d, W):
    cw = [W*.40, W*.20, W*.20, W*.20]
    hdrs = [
        Paragraph("FORMA DE PAGAMENTO", S["th"]),
        Paragraph("ENTRADAS",           S["th_r"]),
        Paragraph("SAÍDAS",             S["th_r"]),
        Paragraph("LÍQUIDO",            S["th_r"]),
    ]
    rows = [hdrs]
    for t in d["totais_forma"]:
        is_tot = t["forma"] == "TOTAL GERAL"
        fn  = "Helvetica-Bold"
        tc  = WHITE if is_tot else TXT_DARK
        ec  = WHITE if is_tot else ENTRADA_C
        sc  = WHITE if is_tot else (SAIDA_C if t.get("saidas") else TXT_LIGHT)
        lc  = WHITE if is_tot else SALDO_C

        def cell(txt, align, color):
            return Paragraph(txt, ps("c", fontSize=8, alignment=align,
                                     textColor=color, fontName=fn))
        rows.append([
            cell(t["forma"],            TA_LEFT,  tc),
            cell(fmt_brl(t["entradas"]),TA_RIGHT, ec),
            cell(fmt_brl(t.get("saidas")),TA_RIGHT,sc),
            cell(fmt_brl(t["liquido"]), TA_RIGHT, lc),
        ])

    tbl = Table(rows, colWidths=cw)
    tbl.setStyle(_ts(
        ("BACKGROUND",    (0,0),(-1,0),   NAVY_MID),
        ("BACKGROUND",    (0,-1),(-1,-1), NAVY),
        ("ROWBACKGROUNDS",(0,1),(-1,-2),  [WHITE, ROW_ALT]),
        ("LINEBELOW",     (0,0),(-1,0),   0.5, GOLD),
        ("LINEBELOW",     (0,1),(-1,-2),  0.3, BORDER),
        ("LINEABOVE",     (0,-1),(-1,-1), 1.0, GOLD),
        ("BOX",           (0,0),(-1,-1),  0.5, BORDER),
        ("TOPPADDING",    (0,0),(-1,-1),  6),
        ("BOTTOMPADDING", (0,0),(-1,-1),  6),
        ("LEFTPADDING",   (0,0),(-1,-1),  8),
        ("RIGHTPADDING",  (0,0),(-1,-1),  8),
        ("VALIGN",        (0,0),(-1,-1),  "MIDDLE"),
    ))
    return tbl


def _footer(d, W):
    tbl = Table([[
        Paragraph("FENIX FUNERARIA LTDA  ·  Apex-Plan Sistema de Gestão", S["footer"]),
        Paragraph(f"Gerado em {d['impresso_em']}", S["footer_r"]),
    ]], colWidths=[W*.6, W*.4])
    tbl.setStyle(_ts(
        ("LINEABOVE",     (0,0),(-1,-1), 0.5, BORDER),
        ("TOPPADDING",    (0,0),(-1,-1), 6),
        ("BOTTOMPADDING", (0,0),(-1,-1), 4),
        ("LEFTPADDING",   (0,0),(-1,-1), 0),
        ("RIGHTPADDING",  (0,0),(-1,-1), 0),
    ))
    return tbl


# ── Função principal (pública) ────────────────
def gerar_pdf(dados: dict) -> bytes:
    """
    Recebe `dados` e retorna os bytes do PDF.

    Estrutura esperada de `dados`:
    {
        "conta":        str,
        "data_caixa":   str,   # "21/05/2026"
        "status":       str,   # "ABERTO" | "FECHADO"
        "impresso_em":  str,   # "21/05/2026, 19:53:29"
        "saldo_ant":    float,
        "total_ent":    float,
        "total_sai":    float,
        "saldo_fin":    float,
        "lancamentos": [
            {
                "data":      str,   # "21/05/2026 10:07:26"
                "forma":     str,   # "PIX" | "TRANSFERÊNCIA" | "DINHEIRO" …
                "tipo":      str,   # "ENTRADA" | "SAÍDA"
                "entrada":   float | None,
                "saida":     float | None,
                "historico": str,
                "usuario":   str,
            }, …
        ],
        "totais_forma": [
            {
                "forma":    str,
                "entradas": float,
                "saidas":   float | None,
                "liquido":  float,
            }, …
        ],
    }
    """
    buf = io.BytesIO()
    W   = A4[0] - 28*mm

    doc = SimpleDocTemplate(
        buf, pagesize=A4,
        leftMargin=14*mm, rightMargin=14*mm,
        topMargin=14*mm,  bottomMargin=14*mm,
        title="Relatório de Movimentações do Caixa",
        author="Apex-Plan",
    )

    story = []

    for el in _header(dados, W):
        story.append(el)

    story.append(Spacer(1, 5*mm))
    story.append(_cards(dados, W))
    story.append(Spacer(1, 6*mm))

    n = len(dados.get("lancamentos", []))
    story.append(_section("LANÇAMENTOS COMPLETOS DA SESSÃO", W, n))
    story.append(Spacer(1, 2*mm))
    story.append(_lancamentos(dados, W))
    story.append(Spacer(1, 7*mm))

    story.append(_section("TOTAIS POR FORMA DE PAGAMENTO  —  CONFERÊNCIA / FECHAMENTO", W))
    story.append(Spacer(1, 2*mm))

    tot_wrap = Table([[_totais(dados, W)]], colWidths=[W*.62])
    tot_wrap.setStyle(_ts(
        ("LEFTPADDING",(0,0),(-1,-1),0),
        ("RIGHTPADDING",(0,0),(-1,-1),0),
        ("TOPPADDING",(0,0),(-1,-1),0),
        ("BOTTOMPADDING",(0,0),(-1,-1),0),
    ))
    story.append(tot_wrap)
    story.append(Spacer(1, 10*mm))

    sig = Table([
        [Paragraph("_" * 42, ps("s1", fontSize=9, textColor=TXT_MID, alignment=TA_CENTER))],
        [Paragraph("Responsável pelo Fechamento", ps("s2", fontSize=7.5, textColor=TXT_LIGHT, alignment=TA_CENTER))],
    ], colWidths=[60*mm])
    sig_wrap = Table([[sig]], colWidths=[W])
    sig_wrap.setStyle(_ts(("ALIGN",(0,0),(-1,-1),"CENTER")))
    story.append(sig_wrap)
    story.append(Spacer(1, 6*mm))
    story.append(_footer(dados, W))

    doc.build(story)
    return buf.getvalue()
