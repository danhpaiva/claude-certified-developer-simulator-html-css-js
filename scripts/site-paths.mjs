// Converte uma URL pública do site (og:image, canonical...) no caminho do arquivo dentro do repositório.
// Ex.: https://user.github.io/repo/docs/screenshots/a.png  (base https://user.github.io/repo/)  ->  docs/screenshots/a.png
export function metaContent(html, attr, name) {
  const match = html.match(new RegExp(`<(?:meta|link)[^>]*\\b${attr}="${name}"[^>]*>`, 'i'));
  if (!match) return null;
  return match[0].match(/\b(?:content|href)="([^"]*)"/i)?.[1] ?? null;
}

export function localPathOf(publicUrl, baseUrl) {
  const base = new URL(baseUrl).pathname;
  const path = new URL(publicUrl).pathname;
  return path.startsWith(base) ? path.slice(base.length) : null;
}

// Imagens de compartilhamento declaradas no index.html, já como caminhos locais.
export function shareImagePaths(html) {
  const canonical = metaContent(html, 'rel', 'canonical');
  if (!canonical) return [];
  return [metaContent(html, 'property', 'og:image'), metaContent(html, 'property', 'twitter:image')]
    .filter(Boolean)
    .map((url) => localPathOf(url, canonical))
    .filter(Boolean);
}
