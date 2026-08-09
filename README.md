# Cronômetro — PWA local para iPhone

PWA pessoal em **HTML + CSS + JavaScript puro**, hospedável no GitHub Pages, sem backend, assinatura ou serviço pago. Banco principal: **IndexedDB `cronometro_local_v1`**. Cache offline: Service Worker.

## Versão 0.2.0

- Um cronômetro por vez.
- Tocar no ativo para parar; tocar novamente para continuar; tocar em outro para trocar imediatamente.
- Períodos sem cronômetro após o primeiro início são registrados como **Pausas**.
- **Tempo total** = soma dos cronômetros e fica parado durante pausas.
- Título padrão: `(sem título) DD/MM/AAAA • HH:mm`; renomear tocando no título.
- Menu do título: Renomear, Editar modelo, Zerar e descartar.
- Botão esquerdo da tela Cronômetros abre a página **Modelos**; há criação, reordenação e menu por modelo (Renomear, Editar, Duplicar, Apagar).
- Botão `•••` abre bottom sheet **Detalhes** com campo de Notas.
- Card de Tempo total com ícone de relógio.
- Sem botão global Pausar.
- Ajustes em estilo inset grouped iOS; tema Sistema/Claro/Escuro; cor de destaque configurável.
- Tema claro base: `#F2F2F6`; cartões `#FFFFFF`; tema escuro usa equivalentes iOS.
- Exportação CSV/PDF/JSON.
- **Restauração por JSON**: substitui os dados locais pelos dados do arquivo após confirmação.
- Service Worker atualizado para cache `cronometro-v2` e limpeza de caches antigos.

## Dados e atualização

O GitHub Pages hospeda os **arquivos do app**. Modelos, registros, tempos e notas permanecem no IndexedDB do aparelho. Substituir os arquivos no mesmo repositório e fazer um novo commit **não deve apagar o banco local**.

Antes de mudanças que alterem dados/estrutura, exporte o JSON completo. Nunca corrija bugs resetando `cronometro_local_v1`.

## Instalar no iPhone

1. Publique estes arquivos no mesmo repositório GitHub Pages.
2. Abra a URL HTTPS no Safari.
3. Compartilhar → **Adicionar à Tela de Início** → Abrir como App da Web.
4. Depois do cache inicial, as funções principais são locais/offline.

## Limitação

Não há sincronização automática com iCloud ou entre aparelhos. O JSON agora pode ser usado para restaurar um backup manualmente.

## Arquivos

- `index.html` — shell da PWA
- `styles.css` — interface/temas
- `app.js` — banco, cronômetro, modelos, histórico, estatísticas, exportação/importação
- `manifest.webmanifest` — instalação PWA
- `sw.js` — cache offline
- `icon.svg` — ícone
- `AI_RULES_MIN.txt` — regras para futuras edições por IA
