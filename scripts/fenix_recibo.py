import sys
import json
import base64
import argparse
from io import BytesIO
from reportlab.lib.pagesizes import A5
from reportlab.lib import colors
from reportlab.lib.units import mm
from reportlab.pdfgen import canvas
from reportlab.platypus import Table, TableStyle
from reportlab.lib.utils import ImageReader
import datetime

# ── Paleta Fênix ─────────────────────────────────────────────────────────────
AZUL_ESCURO  = colors.HexColor("#0A1F44")
AZUL_MEDIO   = colors.HexColor("#1A3A6B")
AZUL_CLARO   = colors.HexColor("#E8EEF7")
PRATA        = colors.HexColor("#B0B8C8")
BRANCO       = colors.white
CINZA_TEXTO  = colors.HexColor("#3A3A3A")
CINZA_LEVE   = colors.HexColor("#F5F6F8")

def format_currency(value):
    return f"R$ {value:,.2f}".replace(",", "v").replace(".", ",").replace("v", ".")

def draw_recibo(c, data):
    width, height = A5
    
    # Background pattern or border
    c.setStrokeColor(AZUL_ESCURO)
    c.setLineWidth(1)
    c.rect(5*mm, 5*mm, width-10*mm, height-10*mm)
    
    # Header Background
    c.setFillColor(AZUL_ESCURO)
    c.rect(5*mm, height-35*mm, width-10*mm, 30*mm, fill=1)
    
    # Logo / Title
    c.setFillColor(BRANCO)
    c.setFont("Helvetica-Bold", 18)
    c.drawString(10*mm, height-20*mm, "FÊNIX FUNERÁRIA")
    c.setFont("Helvetica", 10)
    c.drawString(10*mm, height-26*mm, "Serviços Funerários e Planos de Assistência Familiar")
    
    # Receipt Number and Date
    c.setFont("Helvetica-Bold", 12)
    c.drawRightString(width-10*mm, height-15*mm, f"RECIBO Nº {data.get('numero', '0001')}")
    c.setFont("Helvetica", 10)
    c.drawRightString(width-10*mm, height-22*mm, f"Data: {data.get('data', datetime.date.today().strftime('%d/%m/%Y'))}")
    
    # Value Box (Top Right)
    c.setFillColor(colors.HexColor("#FFFFFF"))
    c.rect(width-55*mm, height-50*mm, 45*mm, 10*mm, fill=1)
    c.setFillColor(AZUL_ESCURO)
    c.setFont("Helvetica-Bold", 14)
    c.drawCentredString(width-32.5*mm, height-44*mm, format_currency(data.get('valor', 0.0)))
    
    # Content
    y = height - 60*mm
    c.setFillColor(CINZA_TEXTO)
    c.setFont("Helvetica", 11)
    
    line1 = f"Recebemos de {data.get('cliente_nome', '___________________________________________________')},"
    c.drawString(10*mm, y, line1)
    
    y -= 8*mm
    line2 = f"a quantia de {data.get('valor_extenso', '___________________________________________________')},"
    c.drawString(10*mm, y, line2)
    
    y -= 8*mm
    line3 = f"referente a {data.get('referencia', '___________________________________________________')}."
    c.drawString(10*mm, y, line3)
    
    # Details Table
    y -= 20*mm
    table_data = [
        ["Descrição do Pagamento", "Vencimento", "Valor"],
        [data.get('descricao', 'Mensalidade Plano Fênix'), data.get('vencimento', '-'), format_currency(data.get('valor', 0.0))]
    ]
    
    t = Table(table_data, colWidths=[width*0.5, width*0.2, width*0.15])
    t.setStyle(TableStyle([
        ('BACKGROUND', (0,0), (-1,0), AZUL_MEDIO),
        ('TEXTCOLOR', (0,0), (-1,0), BRANCO),
        ('ALIGN', (0,0), (-1,-1), 'CENTER'),
        ('FONTNAME', (0,0), (-1,0), 'Helvetica-Bold'),
        ('FONTSIZE', (0,0), (-1,0), 10),
        ('BOTTOMPADDING', (0,0), (-1,0), 8),
        ('BACKGROUND', (0,1), (-1,-1), AZUL_CLARO),
        ('GRID', (0,0), (-1,-1), 0.5, PRATA),
        ('FONTSIZE', (0,1), (-1,-1), 9),
    ]))
    t.wrapOn(c, width, height)
    t.drawOn(c, 10*mm, y)
    
    # Footer / Signature
    y = 35*mm
    c.setStrokeColor(PRATA)
    c.line(40*mm, y, width-40*mm, y)
    c.setFont("Helvetica", 9)
    c.drawCentredString(width/2, y-5*mm, "Assinatura do Responsável")
    c.drawCentredString(width/2, y-10*mm, "FÊNIX FUNERÁRIA - CNPJ: 00.000.000/0001-00")
    
    # Extra info
    c.setFont("Helvetica-Oblique", 8)
    c.setFillColor(colors.gray)
    c.drawString(10*mm, 10*mm, "Este recibo é a sua garantia de pagamento. Guarde com cuidado.")

def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--output", help="Output PDF file path")
    parser.add_argument("--json", help="JSON data for the receipt")
    args = parser.parse_args()

    if args.json:
        try:
            data = json.loads(args.json)
        except:
            data = {}
    else:
        # Default mock data if none provided
        data = {
            "cliente_nome": "JOÃO DA SILVA OLIVEIRA",
            "valor": 150.00,
            "valor_extenso": "CENTO E CINQUENTA REAIS",
            "referencia": "MENSALIDADE PLANO OURO - ABRIL/2026",
            "numero": "20260427-01"
        }

    buffer = BytesIO()
    c = canvas.Canvas(buffer, pagesize=A5)
    draw_recibo(c, data)
    c.showPage()
    c.save()

    pdf_data = buffer.getvalue()
    buffer.close()

    if args.output:
        with open(args.output, "wb") as f:
            f.write(pdf_data)
        print(f"PDF saved to {args.output}")
    else:
        # If no output file specified, output as base64 for the web app
        print(base64.b64encode(pdf_data).decode('utf-8'))

if __name__ == "__main__":
    main()
