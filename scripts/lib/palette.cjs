// The game's styles.css imports its colours from palette.css beside it. A copy of
// styles.css published anywhere else (an archived engine, the docs site) carries the
// palette inline instead, so it keeps the colours it was copied with and needs no
// second file. A styles.css from before palette.css existed passes through unchanged.
const IMPORT = '@import url("palette.css");';
const inlinePalette = (styles, readPalette) =>
  styles.includes(IMPORT) ? styles.replace(IMPORT, () => readPalette().trim()) : styles;
module.exports = { IMPORT, inlinePalette };
