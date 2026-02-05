#!/bin/bash

# Script para configurar Git e subir para o GitHub
# ANTES DE EXECUTAR: Crie um repositório PRIVADO no GitHub

echo "🚀 Configurando Git e GitHub..."

# 1. Inicializar git
git init

# 2. Adicionar todos os arquivos
git add .

# 3. Fazer primeiro commit
git commit -m "Initial commit: Google Maps Scraper Actor privado"

# 4. Renomear branch para main
git branch -M main

# 5. ALTERE AQUI para a URL do seu repositório GitHub
# Exemplo: https://github.com/SEU-USUARIO/SEU-REPO.git
echo ""
echo "⚠️  IMPORTANTE: Altere a URL abaixo para o seu repositório!"
echo "Exemplo: git remote add origin https://github.com/brasilnatech/meu-scraper.git"
echo ""

# Descomente e altere a linha abaixo:
# git remote add origin https://github.com/SEU-USUARIO/SEU-REPO.git

# 6. Fazer push
# git push -u origin main

echo ""
echo "✅ Após alterar a URL do repositório, execute:"
echo "   chmod +x COMANDOS-GIT.sh"
echo "   ./COMANDOS-GIT.sh"
