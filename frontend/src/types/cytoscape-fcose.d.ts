// cytoscape-fcose ships no type declarations; declare the module so the
// default export (a cytoscape layout extension registered via cytoscape.use)
// type-checks. See https://github.com/iVis-at-Bilkent/cytoscape.js-fcose
declare module 'cytoscape-fcose' {
  import type cytoscape from 'cytoscape';
  const fcose: cytoscape.Ext;
  export default fcose;
}
