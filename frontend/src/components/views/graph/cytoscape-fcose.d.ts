// cytoscape-fcose 沒有附型別；只用到它當 cytoscape extension 註冊。
declare module 'cytoscape-fcose' {
  import type { Ext } from 'cytoscape';
  const fcose: Ext;
  export default fcose;
}
