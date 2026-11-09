<div align="center">

# Simulador CCDV-F

**Simulados para o Claude Certified Developer – Foundations**, em português e inglês.<br>
HTML, CSS e JavaScript puros. Sem frameworks, sem build, sem servidor.

[![CI](https://github.com/danhpaiva/claude-certified-developer-simulator-html-css-js/actions/workflows/ci.yml/badge.svg)](https://github.com/danhpaiva/claude-certified-developer-simulator-html-css-js/actions/workflows/ci.yml)
[![Deploy](https://github.com/danhpaiva/claude-certified-developer-simulator-html-css-js/actions/workflows/deploy.yml/badge.svg)](https://github.com/danhpaiva/claude-certified-developer-simulator-html-css-js/actions/workflows/deploy.yml)
[![Demo](https://img.shields.io/badge/demo-GitHub%20Pages-c2410c?logo=github&logoColor=white)](https://danhpaiva.github.io/claude-certified-developer-simulator-html-css-js/)
[![Licença: MIT](https://img.shields.io/badge/licen%C3%A7a-MIT-2ea44f)](LICENSE)

![HTML5](https://img.shields.io/badge/HTML5-E34F26?logo=html5&logoColor=white)
![CSS3](https://img.shields.io/badge/CSS3-1572B6?logo=css3&logoColor=white)
![JavaScript](https://img.shields.io/badge/JavaScript-ES%20Modules-F7DF1E?logo=javascript&logoColor=black)
![Dependências](https://img.shields.io/badge/depend%C3%AAncias-0-brightgreen)
![Idiomas](https://img.shields.io/badge/idiomas-PT%20%7C%20EN-blue)

[**Abrir o simulador →**](https://danhpaiva.github.io/claude-certified-developer-simulator-html-css-js/)

[Português](README.md) · [English](README.en.md)

<img src="docs/screenshots/home-light.png" alt="Tela inicial do simulador, com os simulados, links para os PDFs e o histórico" width="860">

</div>

> **Aviso:** material de estudo **não oficial**, com questões originais. Não reproduz itens reais do exame (confidenciais por NDA) e não é afiliado à Anthropic. "Claude" é marca da Anthropic, PBC.

## Sumário

- [Recursos](#recursos)
- [Capturas de tela](#capturas-de-tela)
- [Sobre o exame](#sobre-o-exame)
- [Como as questões foram feitas](#como-as-questões-foram-feitas)
- [Rodar localmente](#rodar-localmente)
- [Testes e validação](#testes-e-validação)
- [CI/CD](#cicd)
- [Estrutura do projeto](#estrutura-do-projeto)
- [Adicionar um novo simulado](#adicionar-um-novo-simulado)
- [Roteiro](#roteiro)
- [Privacidade](#privacidade)
- [Contribuir e reportar erros](#contribuir-e-reportar-erros)
- [Licença](#licença)

## Recursos

- **Simulados de 53 questões**, como no exame real, em **português e inglês**. A troca de idioma funciona a qualquer momento, até no meio da prova, sem perder as respostas.
- **Modo prova:** cronômetro de 120 minutos e correção só no final.
- **Modo estudo:** sem limite de tempo; verifique cada resposta e leia a explicação, com o link da fonte, na hora.
- **Resposta única e múltipla resposta** ("Selecione N"). Nas de múltipla resposta, acerta-se só com o conjunto exato, como no exame.
- **Navegador de questões**, marcação para revisão e atalhos de teclado (`←` `→` navegam, `A`–`E` marcam, `F` marca para revisão).
- **Resultado por domínio**, com os pesos do blueprint oficial, revisão filtrável (todas, erradas, marcadas, sem resposta) e exportação em JSON.
- **Andamento e histórico** salvos no navegador. Você pode fechar a aba e continuar depois.
- **PDFs** de prova e gabarito (PT e EN) de cada simulado, para estudar offline ou imprimir.
- **Tema claro e escuro**, layout responsivo e navegação por teclado.

## Capturas de tela

| Modo estudo: verificação e explicação | Resultado por domínio e revisão |
| :---: | :---: |
| <img src="docs/screenshots/exam-study-dark.png" alt="Questão com código no modo estudo, resposta correta destacada e explicação com fonte" width="440"> | <img src="docs/screenshots/result-dark.png" alt="Resultado de um simulado com percentual, referência de aprovação e acertos por domínio" width="440"> |

<div align="center">

**No celular**

<img src="docs/screenshots/exam-mobile-dark.jpg" alt="Prova no celular, com cronômetro, progresso e questão de múltipla resposta" width="300">

</div>

## Sobre o exame

Os simulados seguem o **Exam Guide CCDV-F v1.0** (julho de 2026): 53 itens em 120 minutos, escolha única e múltipla resposta, nota escalada de 100 a 1.000 com corte em **720**. Cada simulado respeita o peso dos domínios:

| Domínio | Peso | Questões por simulado |
| --- | ---: | ---: |
| D1 · Agents & Workflows | 14,7% | 8 |
| D2 · Applications & Integration | 33,1% | 17 |
| D3 · Claude Code | 3,1% | 2 |
| D4 · Eval, Testing & Debugging | 2,6% | 1 |
| D5 · Model Selection & Optimization | 16,8% | 9 |
| D6 · Prompt & Context Engineering | 11,0% | 6 |
| D7 · Security & Safety | 8,1% | 4 |
| D8 · Tools & MCPs | 10,6% | 6 |

> A nota do exame real é escalada. O simulador mostra a referência de **72% de acertos** (≥ 39 de 53) apenas como estimativa grosseira, não como a conversão oficial.

## Como as questões foram feitas

As questões foram escritas com ajuda do **Claude** e conferidas contra a **documentação oficial**:

1. Cada questão cita a **fonte** (página da documentação) que sustenta a resposta, e o link aparece na explicação.
2. Uma segunda rodada de revisão independente confrontou enunciado, resposta, **cada alternativa errada** e explicação com a página citada.
3. Foram evitados IDs de modelo, preços e números que mudam rápido.
4. Uma verificação automática impede enunciados repetidos entre simulados.

A plataforma muda com frequência e **pode haver erros ou itens que ficaram desatualizados**. Em caso de dúvida, vale a documentação oficial. Veja [como reportar](#contribuir-e-reportar-erros).

## Rodar localmente

O site usa módulos ES e `fetch`, então precisa de um servidor local (abrir o arquivo direto do disco não funciona):

```bash
npm run serve
# abra http://localhost:8080
```

Se o navegador mostrar uma versão antiga depois de editar um `.js`, faça um recarregamento forçado (`Ctrl+Shift+R`). Não há `npm install`: o projeto não tem dependências.

## Testes e validação

```bash
npm test
```

Executa duas verificações (só precisa do Node 20 ou superior):

- **`check:js`:** sintaxe de todos os módulos JavaScript.
- **`validate`:** manifesto com 8 domínios e pesos somando 100; estrutura de cada questão; quantidade de respostas coerente; 4 opções nas de resposta única e 5 nas de múltipla resposta; PT e EN com o mesmo número de opções; enunciados duplicados entre simulados; fontes válidas; PDFs existentes; e referências do `index.html`.

## CI/CD

Dois workflows separados:

| Workflow | Quando roda | O que faz |
| --- | --- | --- |
| [`ci.yml`](.github/workflows/ci.yml) | PRs e pushes em qualquer branch | `npm run check:js` e `npm run validate` |
| [`deploy.yml`](.github/workflows/deploy.yml) | push em `main` ou manual | valida, monta `_site/` e publica no GitHub Pages |

```mermaid
flowchart LR
  A["push em develop<br/>ou PR"] --> B["ci.yml<br/>check:js + validate"]
  B --> C{"PR aprovado"}
  C -->|"merge em main"| D["deploy.yml<br/>npm test → _site"]
  D --> E[("GitHub Pages")]
```

Configuração única no GitHub: **Settings → Pages → Build and deployment → Source: GitHub Actions**. O site publicado inclui apenas `index.html`, `assets/`, `data/` e `pdfs/`.

## Estrutura do projeto

```
index.html               página única, rotas por hash
assets/style/main.css    estilos (tokens CSS, tema escuro, responsivo)
assets/js/               módulos ES: main (rotas), home, exam, result,
                         question, scoring, store, i18n, rich, dom
data/exams.json          manifesto (domínios, pesos, simulados, PDFs)
data/exams/D1-S1.json    questões de cada simulado (PT + EN, respostas, explicações)
pdfs/D1/S1/              PDFs de cada simulado (prova e gabarito, PT e EN)
scripts/                 validate-data.mjs e check-js.mjs (usados pelo CI)
docs/screenshots/        imagens deste README
.github/workflows/       ci.yml e deploy.yml
```

## Adicionar um novo simulado

Os simulados são gerados fora do site e exportados no formato do repositório: os dados vão para `data/exams/Dn-Sm.json` e o manifesto `data/exams.json` é atualizado com o novo item. Os PDFs são **opcionais**: se fornecidos, vão para `pdfs/Dn/Sm/` e o campo `pdfs` no manifesto aponta para eles; caso contrário, o campo `pdfs` é omitido e o site não exibe a linha de links.

Depois de adicionar os arquivos:

```bash
npm test
git add data pdfs   # ou só data, se não houver PDFs
git commit -m "feat: simulado Dn-Sm"
```

O site lê o manifesto e passa a exibir o novo simulado sem nenhuma mudança de código.

## Roteiro

| Situação | Item |
| :---: | --- |
| ✅ | Simulados D1-S1, D1-S2 e D1-S3 (159 questões) em PT e EN |
| ✅ | Site estático com modo prova, modo estudo, histórico e PDFs |
| ✅ | CI e deploy em workflows separados |
| 🔜 | Plano de 14 dias, com até 3 simulados por dia, aumentando a dificuldade |
| 🔜 | Ajustar os próximos simulados aos domínios em que o desempenho foi pior |

## Privacidade

Tudo roda no seu navegador. O histórico e o andamento ficam só no `localStorage` do navegador, e nada é enviado a servidor. "Exportar resultado" baixa um JSON local, útil para decidir o que estudar a seguir.

## Contribuir e reportar erros

Achou uma resposta duvidosa, uma explicação desatualizada ou um erro de tradução? Abra uma *issue* informando o **simulado e o número da questão** (por exemplo, `D1-S2 Q20`) e, se possível, a página da documentação que contradiz o item. Correções de dados devem passar por `npm test` antes do PR.

## Licença

[MIT](LICENSE) © 2026 Daniel Paiva.
