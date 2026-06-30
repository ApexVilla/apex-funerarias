import argparse
import json
from datetime import datetime
from pathlib import Path

from reportlab.lib import colors
from reportlab.lib.pagesizes import A4
from reportlab.lib.units import mm
from reportlab.lib.utils import ImageReader
from reportlab.pdfgen import canvas
from reportlab.platypus import Table, TableStyle


# Paleta de cores
AZUL_ESCURO = colors.HexColor("#0D2B5E")
AZUL_MEDIO = colors.HexColor("#1A4A9C")
AZUL_CLARO = colors.HexColor("#E8EFF9")
DOURADO = colors.HexColor("#C9A84C")
DOURADO_CLARO = colors.HexColor("#F5E6C0")
BRANCO = colors.white
CINZA_TEXTO = colors.HexColor("#3A3A3A")
CINZA_LEVE = colors.HexColor("#F7F9FC")


def valor_texto(valor, fallback="—"):
    if valor is None:
        return fallback
    texto = str(valor).strip()
    return texto if texto else fallback


def carregar_logo(caminho_logo: str | None):
    if not caminho_logo:
        return None
    caminho = Path(caminho_logo).expanduser()
    if not caminho.exists():
        raise FileNotFoundError(f"Arquivo de logo nao encontrado: {caminho}")
    return caminho


def calcular_logo_box(logo_path):
    """
    Ajusta a logo para caber no cabeçalho sem distorcer.
    Retorna (x, y, largura, altura) em pontos.
    """
    area_x = 15 * mm
    area_y = A4[1] - 37 * mm
    area_w = 32 * mm
    area_h = 18 * mm

    imagem = ImageReader(str(logo_path))
    img_w, img_h = imagem.getSize()
    if img_w <= 0 or img_h <= 0:
        return area_x, area_y, area_w, area_h

    escala = min(area_w / img_w, area_h / img_h)
    draw_w = img_w * escala
    draw_h = img_h * escala
    draw_x = area_x + (area_w - draw_w) / 2
    draw_y = area_y + (area_h - draw_h) / 2
    return draw_x, draw_y, draw_w, draw_h


def linha_horizontal(c, y, x1=15 * mm, x2=195 * mm, cor=DOURADO, espessura=0.8):
    c.setStrokeColor(cor)
    c.setLineWidth(espessura)
    c.line(x1, y, x2, y)


def retangulo_fundo(c, x, y, w, h, cor_fundo, cor_borda=None, raio=3):
    c.setFillColor(cor_fundo)
    if cor_borda:
        c.setStrokeColor(cor_borda)
        c.roundRect(x, y, w, h, raio, fill=1, stroke=1)
    else:
        c.roundRect(x, y, w, h, raio, fill=1, stroke=0)


def quebrar_texto(c, texto, largura_max, fonte="Helvetica", tamanho=8.5):
    texto = valor_texto(texto, "")
    if not texto:
        return [""]
    palavras = texto.split()
    linhas = []
    atual = ""
    c.setFont(fonte, tamanho)
    for palavra in palavras:
        tentativa = palavra if not atual else f"{atual} {palavra}"
        if c.stringWidth(tentativa, fonte, tamanho) <= largura_max:
            atual = tentativa
        else:
            if atual:
                linhas.append(atual)
            atual = palavra
    if atual:
        linhas.append(atual)
    return linhas or [""]


def cabecalho(c, largura, altura, data_pedido, logo_path=None):
    c.setFillColor(AZUL_ESCURO)
    c.rect(0, altura - 45 * mm, largura, 45 * mm, fill=1, stroke=0)

    c.setFillColor(DOURADO)
    c.rect(0, altura - 48 * mm, largura, 3 * mm, fill=1, stroke=0)

    if logo_path:
        logo_x, logo_y, logo_w, logo_h = calcular_logo_box(logo_path)
        c.drawImage(
            str(logo_path),
            logo_x,
            logo_y,
            width=logo_w,
            height=logo_h,
            preserveAspectRatio=True,
            mask="auto",
        )
        titulo_x = 50 * mm
    else:
        titulo_x = 15 * mm

    c.setFont("Helvetica-Bold", 22)
    c.setFillColor(BRANCO)
    c.drawString(titulo_x, altura - 18 * mm, "Fenix de Aparecida")

    c.setFont("Helvetica", 9)
    c.setFillColor(DOURADO)
    c.drawString(titulo_x, altura - 25 * mm, "Plano de Assistencia Familiar")

    c.setFont("Helvetica", 8)
    c.setFillColor(BRANCO)
    c.drawRightString(195 * mm, altura - 23 * mm, f"Data: {data_pedido}")
    c.drawRightString(195 * mm, altura - 29 * mm, "Ambiente Interno Fênix Plano")

    retangulo_fundo(c, 15 * mm, altura - 42 * mm, 37 * mm, 8 * mm, DOURADO, raio=4)
    c.setFont("Helvetica-Bold", 7)
    c.setFillColor(AZUL_ESCURO)
    c.drawCentredString(33.5 * mm, altura - 38.5 * mm, "SEGURO E CRIPTOGRAFADO")


def rodape(c, largura):
    c.setFillColor(AZUL_ESCURO)
    c.rect(0, 0, largura, 12 * mm, fill=1, stroke=0)
    c.setFillColor(DOURADO)
    c.rect(0, 12 * mm, largura, 1 * mm, fill=1, stroke=0)

    c.setFont("Helvetica", 7)
    c.setFillColor(BRANCO)
    c.drawCentredString(
        largura / 2,
        7 * mm,
        "Fenix de Aparecida  ·  Plano de Assistencia Familiar  ·  Conexao segura",
    )
    c.setFillColor(DOURADO)
    c.drawRightString(195 * mm, 3 * mm, f"Gerado em {datetime.today().strftime('%d/%m/%Y %H:%M')}")


def proxima_pagina(c, largura, altura, data_pedido, logo_path=None):
    c.showPage()
    cabecalho(c, largura, altura, data_pedido, logo_path=logo_path)
    return altura - 52 * mm


def garantir_espaco(c, y, minimo, largura, altura, data_pedido, logo_path=None):
    if y < minimo:
        rodape(c, largura)
        return proxima_pagina(c, largura, altura, data_pedido, logo_path=logo_path)
    return y


def titulo_secao(c, texto, y):
    retangulo_fundo(c, 15 * mm, y - 5 * mm, 180 * mm, 8 * mm, AZUL_MEDIO, raio=3)
    c.setFont("Helvetica-Bold", 9)
    c.setFillColor(DOURADO)
    c.drawString(18 * mm, y - 2 * mm, texto.upper())
    return y - 10 * mm


def campo(c, label, valor, x, y, largura_total, destaque=False):
    altura_bloco = 7 * mm
    if destaque:
        retangulo_fundo(c, x, y - 4 * mm, largura_total, altura_bloco, DOURADO_CLARO, DOURADO, raio=2)
        c.setFillColor(AZUL_ESCURO)
    else:
        c.setFillColor(CINZA_TEXTO)

    c.setFont("Helvetica-Bold", 7.5)
    c.drawString(x + 1 * mm, y, label)

    c.setFont("Helvetica", 8.5)
    c.setFillColor(AZUL_ESCURO)
    texto_valor = valor_texto(valor)
    max_largura = largura_total - (c.stringWidth(label, "Helvetica-Bold", 7.5) + 5 * mm)
    linhas = quebrar_texto(c, texto_valor, max_largura, "Helvetica", 8.5)
    c.drawString(x + 26 * mm, y, linhas[0][:90])


def desenhar_observacoes(c, obs, x, y, largura, altura):
    retangulo_fundo(c, x, y - altura, largura, altura, CINZA_LEVE, DOURADO, raio=3)
    texto = valor_texto(obs, "")
    if not texto:
        return
    c.setFont("Helvetica", 8)
    c.setFillColor(CINZA_TEXTO)
    linhas = quebrar_texto(c, texto, largura - 4 * mm, "Helvetica", 8)
    max_linhas = 4
    for idx, linha in enumerate(linhas[:max_linhas]):
        c.drawString(x + 2 * mm, y - 5 * mm - (idx * 4 * mm), linha)


def gerar_pdf(dados: dict, caminho_saida: str | None = None, logo_path: str | None = None):
    """
    Gera o PDF da proposta.

    Uso:
      - python gerar_proposta.py
      - importar e chamar: gerar_pdf(dados, caminho_saida)
    """
    largura, altura = A4

    if caminho_saida is None:
        destino = Path.home() / "Documentos" / "proposta_fenix.pdf"
    else:
        destino = Path(caminho_saida).expanduser()
    destino.parent.mkdir(parents=True, exist_ok=True)

    data_pedido = valor_texto(dados.get("data_pedido"), datetime.today().strftime("%d/%m/%Y"))
    logo = carregar_logo(logo_path)

    c = canvas.Canvas(str(destino), pagesize=A4)
    c.setTitle("Proposta - Fenix de Aparecida")

    cabecalho(c, largura, altura, data_pedido, logo_path=logo)
    y = altura - 52 * mm

    y = titulo_secao(c, "Identificacao do Vendedor", y)
    y -= 2 * mm
    campo(c, "Vendedor:", dados.get("vendedor"), 15 * mm, y, 80 * mm)
    campo(c, "WhatsApp unidade:", dados.get("whatsapp_unidade"), 105 * mm, y, 90 * mm)
    y -= 8 * mm

    linha_horizontal(c, y + 3 * mm, cor=AZUL_CLARO)
    y = titulo_secao(c, "Dados do Contribuinte", y)
    y -= 2 * mm
    campo(c, "Nome completo:", dados.get("nome"), 15 * mm, y, 180 * mm)
    y -= 8 * mm
    campo(c, "CPF/CNPJ:", dados.get("cpf_cnpj"), 15 * mm, y, 70 * mm)
    campo(c, "RG:", dados.get("rg"), 90 * mm, y, 45 * mm)
    campo(c, "Nascimento:", dados.get("data_nascimento"), 140 * mm, y, 55 * mm)
    y -= 8 * mm
    campo(c, "Estado civil:", dados.get("estado_civil"), 15 * mm, y, 70 * mm)
    naturalidade = f"{valor_texto(dados.get('naturalidade_cidade'), '')} / {valor_texto(dados.get('naturalidade_uf'), '')}".strip(" /")
    campo(c, "Naturalidade:", naturalidade, 90 * mm, y, 105 * mm)
    y -= 8 * mm
    campo(c, "Profissao:", dados.get("profissao"), 15 * mm, y, 70 * mm)
    campo(c, "Religiao:", dados.get("religiao"), 90 * mm, y, 105 * mm)
    y -= 10 * mm

    linha_horizontal(c, y + 3 * mm, cor=AZUL_CLARO)
    y = titulo_secao(c, "Endereco e Contato", y)
    y -= 2 * mm
    campo(c, "Endereco:", dados.get("endereco"), 15 * mm, y, 130 * mm)
    campo(c, "CEP:", dados.get("cep"), 150 * mm, y, 45 * mm)
    y -= 8 * mm
    campo(c, "Cidade:", dados.get("cidade"), 15 * mm, y, 70 * mm)
    campo(c, "UF:", dados.get("uf"), 90 * mm, y, 30 * mm)
    y -= 8 * mm
    campo(c, "Tel. principal:", dados.get("telefone_principal"), 15 * mm, y, 70 * mm)
    campo(c, "Tel. alternativo:", dados.get("telefone_alternativo"), 90 * mm, y, 105 * mm)
    y -= 8 * mm
    campo(c, "E-mail:", dados.get("email"), 15 * mm, y, 180 * mm)
    y -= 10 * mm

    linha_horizontal(c, y + 3 * mm, cor=AZUL_CLARO)
    y = titulo_secao(c, "Plano Selecionado", y)
    y -= 3 * mm

    plano_nome = valor_texto(dados.get("plano"), "Plano Fenix")
    plano_valor = valor_texto(dados.get("valor_mensal"), "R$ 53,00/mes")
    retangulo_fundo(c, 15 * mm, y - 12 * mm, 85 * mm, 16 * mm, AZUL_ESCURO, DOURADO, raio=5)
    c.setFont("Helvetica-Bold", 11)
    c.setFillColor(BRANCO)
    c.drawString(20 * mm, y - 3 * mm, plano_nome[:35])
    c.setFont("Helvetica-Bold", 10)
    c.setFillColor(DOURADO)
    c.drawString(20 * mm, y - 9 * mm, plano_valor[:35])

    campo(c, "Valor adesao:", dados.get("valor_adesao"), 110 * mm, y - 2 * mm, 85 * mm, destaque=True)
    campo(c, "1o vencimento:", dados.get("primeiro_vencimento"), 110 * mm, y - 9 * mm, 85 * mm)
    y -= 18 * mm

    campo(c, "Parcela paga no ato:", dados.get("parcela_paga_ato", "Nao"), 15 * mm, y, 70 * mm)
    campo(c, "Metodo cobranca:", dados.get("metodo_cobranca"), 90 * mm, y, 105 * mm)
    y -= 10 * mm

    linha_horizontal(c, y + 3 * mm, cor=AZUL_CLARO)
    y = titulo_secao(c, "Dependentes Cadastrados", y)
    y -= 3 * mm

    dependentes = dados.get("dependentes", [])
    if dependentes:
        tabela_dados = [["Nome", "CPF", "Nascimento", "Parentesco"]]
        for dep in dependentes:
            nascimento = dep.get("data_nascimento") or dep.get("idade")
            tabela_dados.append(
                [
                    valor_texto(dep.get("nome")),
                    valor_texto(dep.get("cpf")),
                    valor_texto(nascimento),
                    valor_texto(dep.get("parentesco")),
                ]
            )

        altura_tab = min((len(tabela_dados) + 1) * 7 * mm, 60 * mm)
        y = garantir_espaco(c, y - altura_tab, 40 * mm, largura, altura, data_pedido, logo_path=logo)

        t = Table(tabela_dados, colWidths=[70 * mm, 45 * mm, 25 * mm, 40 * mm], repeatRows=1)
        t.setStyle(
            TableStyle(
                [
                    ("BACKGROUND", (0, 0), (-1, 0), AZUL_MEDIO),
                    ("TEXTCOLOR", (0, 0), (-1, 0), DOURADO),
                    ("FONTNAME", (0, 0), (-1, 0), "Helvetica-Bold"),
                    ("FONTSIZE", (0, 0), (-1, -1), 8),
                    ("ALIGN", (0, 0), (-1, -1), "LEFT"),
                    ("ROWBACKGROUNDS", (0, 1), (-1, -1), [BRANCO, AZUL_CLARO]),
                    ("TEXTCOLOR", (0, 1), (-1, -1), CINZA_TEXTO),
                    ("GRID", (0, 0), (-1, -1), 0.3, DOURADO),
                    ("LEFTPADDING", (0, 0), (-1, -1), 4),
                    ("RIGHTPADDING", (0, 0), (-1, -1), 4),
                    ("TOPPADDING", (0, 0), (-1, -1), 3),
                    ("BOTTOMPADDING", (0, 0), (-1, -1), 3),
                ]
            )
        )
        t.wrapOn(c, 180 * mm, 100 * mm)
        altura_real = len(tabela_dados) * 7 * mm
        t.drawOn(c, 15 * mm, y - altura_real)
        y -= altura_real + 5 * mm
    else:
        c.setFont("Helvetica", 8)
        c.setFillColor(CINZA_TEXTO)
        c.drawString(18 * mm, y - 5 * mm, "Nenhum dependente cadastrado.")
        y -= 10 * mm

    y -= 2 * mm
    linha_horizontal(c, y + 3 * mm, cor=AZUL_CLARO)
    y = titulo_secao(c, "Observacoes", y)
    y -= 3 * mm
    desenhar_observacoes(c, dados.get("observacoes"), 15 * mm, y, 180 * mm, 20 * mm)
    y -= 24 * mm

    y = garantir_espaco(c, y, 30 * mm, largura, altura, data_pedido, logo_path=logo)
    y -= 5 * mm
    linha_horizontal(c, y, cor=DOURADO)
    y -= 12 * mm

    c.setStrokeColor(AZUL_ESCURO)
    c.setLineWidth(0.5)
    c.line(15 * mm, y, 95 * mm, y)
    c.line(105 * mm, y, 195 * mm, y)

    c.setFont("Helvetica", 7)
    c.setFillColor(CINZA_TEXTO)
    c.drawCentredString(55 * mm, y - 4 * mm, "Assinatura do Contratante")
    c.drawCentredString(150 * mm, y - 4 * mm, "Assinatura do Vendedor / Representante")
    c.drawCentredString(55 * mm, y - 8 * mm, valor_texto(dados.get("nome"), "")[:40])
    c.drawCentredString(150 * mm, y - 8 * mm, valor_texto(dados.get("vendedor"), "")[:40])

    rodape(c, largura)
    c.save()

    print(f"PDF gerado com sucesso em: {destino}")
    return str(destino)


def carregar_dados_json(caminho_json: str) -> dict:
    caminho = Path(caminho_json).expanduser()
    if not caminho.exists():
        raise FileNotFoundError(f"Arquivo JSON nao encontrado: {caminho}")
    with caminho.open("r", encoding="utf-8") as arquivo:
        dados = json.load(arquivo)
    if not isinstance(dados, dict):
        raise ValueError("O JSON deve conter um objeto no nivel raiz.")
    return dados


def salvar_exemplo_json(caminho_saida: str):
    destino = Path(caminho_saida).expanduser()
    destino.parent.mkdir(parents=True, exist_ok=True)
    with destino.open("w", encoding="utf-8") as arquivo:
        json.dump(DADOS_EXEMPLO, arquivo, ensure_ascii=False, indent=2)
    print(f"Modelo JSON salvo em: {destino}")


def criar_parser():
    parser = argparse.ArgumentParser(
        description="Gerador de PDF - Proposta Fenix de Aparecida",
    )
    parser.add_argument(
        "--json",
        dest="caminho_json",
        help="Caminho para arquivo JSON com os dados da proposta.",
    )
    parser.add_argument(
        "--saida",
        dest="caminho_saida",
        help="Caminho do PDF de saida. Padrao: ~/Documentos/proposta_fenix.pdf",
    )
    parser.add_argument(
        "--logo",
        dest="logo_path",
        help="Caminho do arquivo PNG da logo para exibir no cabecalho.",
    )
    parser.add_argument(
        "--exemplo-json",
        dest="exemplo_json",
        nargs="?",
        const=str(Path.home() / "Documentos" / "modelo_proposta_fenix.json"),
        help="Salva um modelo JSON de exemplo. Opcionalmente informe o caminho de saida.",
    )
    return parser


DADOS_EXEMPLO = {
    "vendedor": "Samir",
    "whatsapp_unidade": "(62) 99999-0000",
    "data_pedido": "07/05/2026",
    "nome": "Joao Carlos da Silva",
    "cpf_cnpj": "000.000.000-00",
    "rg": "1234567",
    "data_nascimento": "01/01/1985",
    "estado_civil": "Casado(a)",
    "naturalidade_cidade": "Goiania",
    "naturalidade_uf": "GO",
    "profissao": "Comerciante",
    "religiao": "Catolica",
    "endereco": "Rua das Flores, 123, Setor Central",
    "cep": "74000-000",
    "cidade": "Aparecida de Goiania",
    "uf": "GO",
    "telefone_principal": "(62) 98888-1111",
    "telefone_alternativo": "(62) 97777-2222",
    "email": "joao@email.com",
    "plano": "Plano Fenix",
    "valor_mensal": "R$ 53,00/mes",
    "valor_adesao": "R$ 53,00",
    "primeiro_vencimento": "07/06/2026",
    "parcela_paga_ato": "Sim",
    "metodo_cobranca": "PIX",
    "dependentes": [
        {"nome": "Maria da Silva", "cpf": "111.111.111-11", "data_nascimento": "1990-05-15", "parentesco": "Esposo(a)"},
        {"nome": "Pedro da Silva", "cpf": "222.222.222-22", "data_nascimento": "2015-08-20", "parentesco": "Filho(a)"},
    ],
    "observacoes": "Pagamento efetuado via PIX no ato da contratacao.",
}


if __name__ == "__main__":
    parser = criar_parser()
    args = parser.parse_args()

    if args.exemplo_json:
        salvar_exemplo_json(args.exemplo_json)
    else:
        if args.caminho_json:
            dados_entrada = carregar_dados_json(args.caminho_json)
        else:
            dados_entrada = DADOS_EXEMPLO
        gerar_pdf(dados_entrada, args.caminho_saida, logo_path=args.logo_path)
