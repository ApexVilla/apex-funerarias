"""
api.py  —  Microserviço Flask para geração de PDF do Caixa
Porta padrão: 5050

Endpoints:
  POST /pdf/caixa       → recebe JSON, retorna PDF
  GET  /health          → healthcheck
"""

from flask import Flask, request, jsonify, make_response, send_file
import io, os, traceback
from gerador_caixa import gerar_pdf

app = Flask(__name__)


# ── Healthcheck ───────────────────────────────
@app.get("/health")
def health():
    return jsonify({"status": "ok", "service": "pdf-caixa"})


# ── Gerar PDF do Caixa ────────────────────────
@app.post("/pdf/caixa")
def pdf_caixa():
    """
    Body JSON esperado — mesmo schema do gerador_caixa.gerar_pdf().
    Retorna o PDF como application/pdf com Content-Disposition inline
    (pode ser download ou abrir no browser/iframe).
    """
    dados = request.get_json(silent=True)
    if not dados:
        return jsonify({"erro": "Body JSON ausente ou inválido"}), 400

    # Validação mínima
    campos = ["conta","data_caixa","status","impresso_em",
              "saldo_ant","total_ent","total_sai","saldo_fin",
              "lancamentos","totais_forma"]
    faltando = [c for c in campos if c not in dados]
    if faltando:
        return jsonify({"erro": f"Campos obrigatórios ausentes: {faltando}"}), 422

    try:
        pdf_bytes = gerar_pdf(dados)
    except Exception:
        traceback.print_exc()
        return jsonify({"erro": "Falha ao gerar PDF"}), 500

    nome = f"caixa_{dados['data_caixa'].replace('/','-')}_{dados.get('filial','')}.pdf"

    response = make_response(pdf_bytes)
    response.headers["Content-Type"]        = "application/pdf"
    response.headers["Content-Disposition"] = f'inline; filename="{nome}"'
    response.headers["Content-Length"]      = len(pdf_bytes)
    return response


if __name__ == "__main__":
    # Desenvolvimento: python api.py (defina PDF_DEBUG=true para recarga/erros detalhados)
    # Produção:  gunicorn -w <=2*CPU+1> --timeout 60 -b 127.0.0.1:5050 api:app
    # NUNCA rode com debug=True em producao (RCE via console interativo do Werkzeug).
    debug = os.environ.get("PDF_DEBUG", "false").strip().lower() in ("1", "true", "yes", "on")
    port = int(os.environ.get("PDF_PORT", "5050"))
    app.run(host="0.0.0.0", port=port, debug=debug)
