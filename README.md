# Mentalic landing

## Development

```bash
npm install
npm run dev
```

## Build

```bash
npm run build
npm run preview
```

The production build is generated in `docs/` (convenient for GitHub Pages deploy).

During `dev` and `build`, all `.png` files in `images/` are automatically converted to `.webp`.

## Components structure

The page layout is split into component folders in `src/components/`.

Each component has:

- `index.html`
- `styles.css`

Examples:

- `src/components/header/index.html`
- `src/components/header/styles.css`
- `src/components/hero/index.html`
- `src/components/hero/styles.css`

`index.html` composes the page via include directives:

`<!-- @include src/components/hero/index.html -->`

## CSS structure

`style.css` contains global/common styles (tokens, fonts, reset, shared UI classes)
and imports component styles from `src/components/*/styles.css`.
