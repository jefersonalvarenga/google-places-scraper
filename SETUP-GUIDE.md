# Guia de Configuração - Actor Privado no Apify

## 📝 Arquivos que você DEVE alterar:

### 1. **apify.json** (OBRIGATÓRIO)
```json
{
  "name": "seu-nome-unico-do-actor",
  "version": "1.0.0",
  "buildTag": "latest",
  "env": {
    "APIFY_MEMORY_MBYTES": "4096"
  }
}
```
- Altere o `name` para um nome único (será a URL do seu actor)
- Atualize a `version` conforme necessário

### 2. **package.json** (OBRIGATÓRIO)
```json
{
  "name": "seu-nome-do-projeto",
  "version": "1.0.0",
  "description": "Sua descrição aqui",
  "author": "Seu Nome",
  "license": "UNLICENSED",  // Para projetos privados
  "repository": {
    "type": "git",
    "url": "https://github.com/SEU-USUARIO/SEU-REPO.git"
  }
}
```

### 3. **README.md** (RECOMENDADO)
- Substitua o conteúdo pelo do seu projeto
- Adicione suas instruções específicas

### 4. **input-schema.json** (SE NECESSÁRIO)
- Mantenha ou ajuste conforme os inputs que seu actor precisa

---

## 🚀 Como subir para o seu GitHub:

```bash
# 1. Inicializar repositório git
git init

# 2. Criar .gitignore
cat > .gitignore << 'EOF'
node_modules/
dist/
storage/
.env
.DS_Store
*.log
EOF

# 3. Adicionar arquivos
git add .

# 4. Primeiro commit
git commit -m "Initial commit: Google Maps Scraper Actor"

# 5. Criar repositório no GitHub (faça isso no site do GitHub primeiro)
# Depois conecte:
git remote add origin https://github.com/SEU-USUARIO/SEU-REPO.git

# 6. Subir para o GitHub
git branch -M main
git push -u origin main
```

---

## 💰 Como configurar MODO PRIVADO (mais barato):

### No Apify Console:

1. **Publique seu Actor como PRIVADO:**
   - Vá em: https://console.apify.com/actors
   - Crie novo Actor: "New Actor" → "From GitHub"
   - Cole a URL do seu repositório GitHub
   - Marque como **PRIVATE** (não público)

2. **Configure Standby Mode (reduz custos):**
   ```json
   // No apify.json, adicione:
   {
     "name": "seu-actor",
     "version": "1.0.0",
     "buildTag": "latest",
     "env": {
       "APIFY_MEMORY_MBYTES": "2048"  // Reduza memória se possível
     },
     "standbyPort": 8000  // Habilita modo standby
   }
   ```

3. **Na configuração do Actor no Console:**
   - Settings → Advanced Configuration
   - Habilite: **"Standby mode"**
   - Configure: **"Minimum instances: 0"** (não mantém containers rodando)
   - Configure: **"Timeout: 3600"** (1 hora - ajuste conforme necessário)

4. **Reduza custos adicionais:**
   - Use `APIFY_MEMORY_MBYTES` menor (512, 1024, 2048) se possível
   - Configure `timeoutSecs` menor no código se não precisar de longas execuções
   - Use `maxRequestRetries: 1` para reduzir tentativas

---

## 🔒 Configurações de Privacidade:

### No GitHub:
- Repositório deve estar como **PRIVATE**

### No Apify:
- Actor marcado como **PRIVATE** (não aparece na loja)
- Apenas você pode executar
- Mais barato que actors públicos
- Pode compartilhar via API token apenas com quem você quiser

---

## 📊 Comparação de Custos:

| Modo | Custo por hora | Economia |
|------|----------------|----------|
| Público (padrão) | $0.25/hora | - |
| Privado + Standby | $0.10/hora | 60% |
| Privado + Memória reduzida (2GB) | $0.05/hora | 80% |

---

## ✅ Checklist Final:

- [ ] Alterei `name` no apify.json
- [ ] Alterei informações no package.json
- [ ] Criei repositório PRIVADO no GitHub
- [ ] Subi código para o GitHub
- [ ] Criei Actor no Apify Console apontando para o GitHub
- [ ] Marquei Actor como PRIVADO
- [ ] Habilitei Standby Mode
- [ ] Configurei memória adequada
- [ ] Testei uma execução

---

## 🎯 Próximos Passos:

1. Execute os comandos git acima
2. Crie o repositório no GitHub (privado)
3. Suba o código
4. Configure o Actor no Apify Console
5. Teste uma execução

Pronto! Seu actor estará rodando no modo mais econômico possível! 🎉
