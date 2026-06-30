#!/usr/bin/env bash
# =============================================================
#  setup.sh  —  Instala e sobe o microserviço PDF do Caixa
#  Testado em Ubuntu 22/24 (Contabo VPS)
#  Uso: bash setup.sh
# =============================================================

set -e
WORKDIR="/opt/pdf-service"
PORTA=5050

echo "──────────────────────────────────────"
echo " Fênix Funerária · PDF Service Setup"
echo "──────────────────────────────────────"

# 1. Dependências
apt-get install -y python3-pip python3-venv > /dev/null
pip3 install reportlab flask gunicorn --break-system-packages -q

# 2. Diretório de trabalho
mkdir -p "$WORKDIR"
cp gerador_caixa.py api.py "$WORKDIR/"

# 3. Serviço systemd
cat > /etc/systemd/system/pdf-caixa.service <<EOF
[Unit]
Description=Fênix PDF Microservice
After=network.target

[Service]
Type=simple
WorkingDirectory=$WORKDIR
# Geracao de PDF e CPU-bound (reportlab + GIL): usar processos, nao threads.
# Formula gunicorn: (2 x nucleos) + 1, com timeout para nao travar workers.
ExecStart=/bin/sh -c '/usr/bin/gunicorn -w \$(( (\$(nproc) * 2) + 1 )) --timeout 60 -b 127.0.0.1:$PORTA api:app'
Restart=always
RestartSec=5
StandardOutput=journal
StandardError=journal

[Install]
WantedBy=multi-user.target
EOF

systemctl daemon-reload
systemctl enable pdf-caixa
systemctl restart pdf-caixa

echo ""
echo "✅ Serviço rodando em http://127.0.0.1:$PORTA"
echo "   Teste: curl http://127.0.0.1:$PORTA/health"
